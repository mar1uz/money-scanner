import { Router } from 'express';
import { AppState } from '../services/app-state.js';
import {
  AIContentTake,
  getScannerAssets,
  NARRATIVE_DEFINITIONS,
  MarketIntelligenceAssetSnapshot,
  MarketIntelligenceNarrativeSnapshot,
  MarketIntelligenceReport,
  MarketIntelligenceScope,
  MoneyLineSignal,
  NewsCategory,
  NewsSynthesisPayload,
  IntelligenceBriefPayload,
  IntelligenceBriefFilters,
  IntelligenceSector,
  IntelligencePeriod,
  IntelligenceSourceFilter,
  NewsItem,
  XPostItem
} from '@money-scanner/shared';
import { scanCryptoFourCriteria } from '../services/crypto-four-criteria-scanner.js';
import { lookupCryptoFourCriteria, normalizeLookupQuery } from '../services/crypto-four-criteria-lookup.js';
import { scanStockBusinessQuality } from '../services/stock-business-quality-scanner.js';
import { readPersistentAICache, writePersistentAICache } from '../services/ai-cache-store.js';
import { validateScheduledRequestToken } from '../services/scheduler-auth.js';
import { answerIssues, ASK_FIXED_REPLY, ASK_NO_BRIEFING_REPLY, buildInstinctReport, isServableTake, takeIssues } from '../services/narrative-guard.js';

export const aiRouter = Router();

const synthesisCache = new Map<string, { payload: NewsSynthesisPayload; updatedAt: number }>();
const SYNTHESIS_CACHE_MS = 5 * 60_000;
const intelligenceBriefCache = new Map<string, { payload: IntelligenceBriefPayload; updatedAt: number }>();
const intelligenceBriefInFlight = new Map<string, Promise<IntelligenceBriefPayload>>();
const INTELLIGENCE_BRIEF_CACHE_MS = 5 * 60_000;
const intelligenceCache = new Map<string, { payload: MarketIntelligenceReport; updatedAt: number }>();
const intelligenceInFlight = new Map<string, Promise<MarketIntelligenceReport>>();
// The scheduled 07:00 Europe/Oslo snapshot must remain instantly available
// throughout the day and survive Cloud Run cold starts. Manual refreshes can
// still replace it after the short force-refresh floor below.
const MORNING_CACHE_MAX_AGE_MS = 26 * 60 * 60_000;
const INTELLIGENCE_CACHE_MS = MORNING_CACHE_MAX_AGE_MS;
const INTELLIGENCE_FORCE_REFRESH_FLOOR_MS = 2 * 60_000;
const cryptoCriteriaCache = new Map<string, { payload: Awaited<ReturnType<typeof scanCryptoFourCriteria>>; updatedAt: number }>();
let cryptoCriteriaInFlight: Promise<Awaited<ReturnType<typeof scanCryptoFourCriteria>>> | null = null;
const CRYPTO_CRITERIA_CACHE_MS = MORNING_CACHE_MAX_AGE_MS;
const CRYPTO_CRITERIA_FORCE_REFRESH_FLOOR_MS = 2 * 60_000;
const stockCriteriaCache = new Map<string, { payload: Awaited<ReturnType<typeof scanStockBusinessQuality>>; updatedAt: number }>();
let stockCriteriaInFlight: Promise<Awaited<ReturnType<typeof scanStockBusinessQuality>>> | null = null;
const STOCK_CRITERIA_CACHE_MS = MORNING_CACHE_MAX_AGE_MS;
const STOCK_CRITERIA_FORCE_REFRESH_FLOOR_MS = 2 * 60_000;
const SOURCE_REFRESH_TIMEOUT_MS = 15_000;

const intelligencePersistentKey = (cacheKey: string) => `market-intelligence-${cacheKey.replace(':', '-')}`;

const AI_CONTENT_KEYS = new Set(['briefing', 'intelligence-brief', 'market-intelligence', 'capital-rotation']);
// Per-asset Instinct investment guides: investment-guide-<SYMBOL>.
const AI_CONTENT_KEY_PATTERN = /^(?:investment-guide|asset-profile|business-quality)-[A-Z0-9][A-Z0-9.-]{0,19}$/;
const isAllowedContentKey = (key: string) => AI_CONTENT_KEYS.has(key) || AI_CONTENT_KEY_PATTERN.test(key);
const AI_CONTENT_MAX_AGE_MS = 36 * 60 * 60_000;

/** Daily AI take, fresh for 36h. Only Instinct-authored takes that pass the
 * narrative guard (unit sanity + no undated central-bank news) are served;
 * model-written takes (legacy local AI Gateway writer) are never shown.
 * The per-language copy is preferred; the legacy language-agnostic key
 * remains as the (Romanian) fallback. */
export const readAiContentTake = async (key: string, language?: 'ro' | 'en'): Promise<AIContentTake | undefined> => {
  if (language) {
    const localized = await readPersistentAICache<AIContentTake>(`ai-content-${key}-${language}`);
    if (localized && Date.now() - localized.updatedAt <= AI_CONTENT_MAX_AGE_MS && isServableTake(localized.payload)) return localized.payload;
  }
  const entry = await readPersistentAICache<AIContentTake>(`ai-content-${key}`);
  if (!entry || Date.now() - entry.updatedAt > AI_CONTENT_MAX_AGE_MS || !isServableTake(entry.payload)) return undefined;
  return entry.payload;
};

const validTake = (value: any): value is AIContentTake => Boolean(value)
  && typeof value.headline === 'string' && value.headline.length > 0 && value.headline.length <= 300
  && Array.isArray(value.paragraphs) && value.paragraphs.length >= 1 && value.paragraphs.length <= 6
  && value.paragraphs.every((p: any) => typeof p === 'string' && p.length > 0 && p.length <= 2000)
  && (value.bullets === undefined || (Array.isArray(value.bullets) && value.bullets.length <= 8 && value.bullets.every((b: any) => typeof b === 'string' && b.length <= 300)))
  && typeof value.model === 'string' && value.model.length <= 120
  && Number.isFinite(value.generatedAt);
const cryptoCriteriaPersistentKey = 'crypto-four-criteria-top-200';
const stockCriteriaPersistentKey = 'stock-business-quality-top';

const waitForSourceRefresh = (refresh: Promise<void>): Promise<void> => {
  // The model can produce a grounded fallback from currently cached sources.
  // Do not allow a third-party RSS/social host to hold this route open.
  return new Promise(resolve => {
    const deadline = setTimeout(resolve, SOURCE_REFRESH_TIMEOUT_MS);
    void refresh.catch(() => undefined).finally(() => {
      clearTimeout(deadline);
      resolve();
    });
  });
};

const parseIntelligenceFilters = (req: any): IntelligenceBriefFilters => {
  const validSectors: IntelligenceSector[] = ['all', 'crypto', 'stocks', 'macro', 'metals'];
  const validPeriods: IntelligencePeriod[] = ['24h', '7d'];
  const validSources: IntelligenceSourceFilter[] = ['all', 'news', 'social'];
  const sector = validSectors.includes(req.query.sector) ? req.query.sector : 'all';
  const period = validPeriods.includes(req.query.period) ? req.query.period : '24h';
  const source = validSources.includes(req.query.source) ? req.query.source : 'all';
  return { sector, period, source };
};

const SECTOR_SYMBOLS: Record<Exclude<IntelligenceSector, 'all' | 'macro'>, Set<string>> = {
  crypto: new Set(['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'ADA', 'SUI', 'AVAX', 'LINK', 'AAVE', 'UNI', 'BNB', 'ARB', 'OP', 'PEPE', 'WIF', 'BONK']),
  stocks: new Set(['NVDA', 'TSLA', 'AAPL', 'MSFT', 'META', 'GOOGL', 'AMZN', 'PLTR', 'AMD', 'ASML', 'MSTR', 'COIN', 'SPY', 'QQQ']),
  metals: new Set(['XAU', 'GOLD', 'XAG', 'SILVER', 'OIL', 'COPPER', 'GLD', 'SLV'])
};

const newsMatchesSector = (item: NewsItem, sector: IntelligenceSector): boolean => {
  if (sector === 'all') return true;
  if (sector === 'macro') return item.category === 'Macro';
  if (sector === 'crypto') return item.category === 'Protocol' || item.category === 'Security' || item.category === 'Exchange'
    || item.mentionedSymbols.some(symbol => SECTOR_SYMBOLS.crypto.has(symbol.toUpperCase()));
  return item.mentionedSymbols.some(symbol => SECTOR_SYMBOLS[sector].has(symbol.toUpperCase()))
    || (sector === 'stocks' && item.category === 'Institutional');
};

const socialMatchesSector = (item: XPostItem, sector: IntelligenceSector): boolean => {
  if (sector === 'all') return true;
  if (item.sector === sector) return true;
  if (sector === 'macro') return /\b(fed|inflation|cpi|rates?|gdp|macro|powell|central bank)\b/i.test(item.text);
  return item.mentionedSymbols.some(symbol => SECTOR_SYMBOLS[sector].has(symbol.toUpperCase()));
};

const normalizedEventKey = (text: string): string => {
  const stopWords = new Set(['the', 'and', 'for', 'with', 'from', 'this', 'that', 'after', 'today', 'news', 'market', 'a', 'an', 'of', 'în', 'și', 'cu', 'din']);
  return text.toLowerCase()
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[^a-z0-9$ ]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word))
    .slice(0, 8)
    .join(' ');
};

export const selectIntelligenceSources = (
  news: NewsItem[],
  socialPosts: XPostItem[],
  filters: IntelligenceBriefFilters
) => {
  const cutoff = Date.now() - (filters.period === '7d' ? 7 : 1) * 24 * 60 * 60_000;
  const candidates = [
    ...(filters.source === 'social' ? [] : news
      .filter(item => item.publishedAt >= cutoff && newsMatchesSector(item, filters.sector))
      .map(item => ({ kind: 'news' as const, item, text: `${item.title} ${item.summary}`, timestamp: item.publishedAt, credibility: item.credibilityScore || 0.5 }))),
    ...(filters.source === 'news' ? [] : socialPosts
      .filter(item => item.timestamp >= cutoff && socialMatchesSector(item, filters.sector))
      .map(item => ({ kind: 'social' as const, item, text: item.text, timestamp: item.timestamp, credibility: item.authorCredibilityScore || 0.5 })))
  ];
  const eventCounts = new Map<string, number>();
  for (const candidate of candidates) {
    const key = normalizedEventKey(candidate.text);
    eventCounts.set(key, (eventCounts.get(key) || 0) + 1);
  }
  const selectedByEvent = new Map<string, number>();
  const ranked = candidates
    .map(candidate => {
      const key = normalizedEventKey(candidate.text);
      const age = Math.max(0, Date.now() - candidate.timestamp);
      const recency = Math.max(0, 1 - age / ((filters.period === '7d' ? 7 : 1) * 24 * 60 * 60_000));
      const corroboration = Math.min(1, ((eventCounts.get(key) || 1) - 1) / 2);
      const concrete = /\b(approved|launch|launched|report|decision|rate|hack|upgrade|earnings|inflows|outflows|announced|a aprobat|decizie|rezultate)\b/i.test(candidate.text) ? 0.2 : 0;
      return { ...candidate, key, score: recency * 0.55 + candidate.credibility * 0.2 + corroboration * 0.15 + concrete };
    })
    .sort((left, right) => right.score - left.score)
    .filter(candidate => {
      const count = selectedByEvent.get(candidate.key) || 0;
      if (count >= 2) return false;
      selectedByEvent.set(candidate.key, count + 1);
      return true;
    })
    .slice(0, 32);
  return {
    news: ranked.filter(candidate => candidate.kind === 'news').map(candidate => candidate.item as NewsItem).slice(0, 16),
    social: ranked.filter(candidate => candidate.kind === 'social').map(candidate => candidate.item as XPostItem).slice(0, 16)
  };
};

const briefFullText = (segments: NewsSynthesisPayload['segments']) => segments
  .map(segment => segment.text.trim())
  .filter(Boolean)
  .join(' ');

aiRouter.get('/news/synthesis', async (req, res) => {
  try {
    const language: 'ro' | 'en' = req.query.language === 'en' ? 'en' : 'ro';
    const category = req.query.category && req.query.category !== 'ALL'
      ? req.query.category as NewsCategory
      : undefined;
    const cacheKey = `${language}:${category || 'ALL'}`;
    const cached = synthesisCache.get(cacheKey);
    if (cached && Date.now() - cached.updatedAt < SYNTHESIS_CACHE_MS) {
      return res.json(cached.payload);
    }

    const appState = AppState.getInstance();
    await Promise.all([
      waitForSourceRefresh(appState.news.fetchLiveNews()),
      waitForSourceRefresh(appState.social.refreshFreeSources())
    ]);
    const news = appState.news.getLatestNews(20, category);
    const socialPosts = appState.social.getRecentVerifiedPosts()
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 20);
    const payload = await appState.ai.generateNewsSynthesis(news, socialPosts, language);
    synthesisCache.set(cacheKey, { payload, updatedAt: Date.now() });
    res.set('Cache-Control', 'public, max-age=60');
    res.json(payload);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to generate grounded news synthesis', details: err.message });
  }
});

aiRouter.get('/intelligence/brief', async (req, res) => {
  const filters = parseIntelligenceFilters(req);
  const language: 'ro' | 'en' = req.query.language === 'en' ? 'en' : 'ro';
  const refresh = req.query.refresh === '1';
  const cacheKey = `${language}:${filters.sector}:${filters.period}:${filters.source}`;
  const cached = intelligenceBriefCache.get(cacheKey);
  if (!refresh && cached && Date.now() - cached.updatedAt < INTELLIGENCE_BRIEF_CACHE_MS) {
    res.set('Cache-Control', 'public, max-age=60');
    return res.json(cached.payload);
  }
  const running = intelligenceBriefInFlight.get(cacheKey);
  if (running) {
    try {
      res.set('Cache-Control', 'no-store');
      return res.json(await running);
    } catch (err: any) {
      if (cached) {
        res.set('X-Intelligence-Stale', 'true');
        return res.json(cached.payload);
      }
      return res.status(500).json({ error: 'Failed to generate intelligence brief', details: err.message });
    }
  }

  const generate = (async (): Promise<IntelligenceBriefPayload> => {
    const appState = AppState.getInstance();
    await Promise.all([
      filters.source === 'social' ? Promise.resolve() : waitForSourceRefresh(appState.news.fetchLiveNews()),
      filters.source === 'news' ? Promise.resolve() : waitForSourceRefresh(appState.social.refreshFreeSources())
    ]);
    const selected = selectIntelligenceSources(
      appState.news.getLatestNews(200),
      appState.social.getRecentVerifiedPosts(),
      filters
    );
    const synthesis = await appState.ai.generateNewsSynthesis(selected.news, selected.social, language);
    const compactSegments = synthesis.segments
      .map(segment => ({
        ...segment,
        text: segment.text.replace(/\s+/g, ' ').trim()
      }))
      .filter(segment => segment.text.length > 15)
      .slice(0, 5);
    const payload: IntelligenceBriefPayload = {
      ...synthesis,
      segments: compactSegments,
      fullText: briefFullText(compactSegments),
      sourceCount: synthesis.sources.length,
      latestSourceAt: synthesis.sources.reduce<number | null>((latest, source) => Math.max(latest || 0, source.publishedAt), null),
      filters
    };
    const take = await readAiContentTake('intelligence-brief', language);
    if (take) payload.aiTake = take;
    intelligenceBriefCache.set(cacheKey, { payload, updatedAt: Date.now() });
    return payload;
  })();
  intelligenceBriefInFlight.set(cacheKey, generate);
  try {
    res.set('Cache-Control', 'no-store');
    return res.json(await generate);
  } catch (err: any) {
    if (cached) {
      res.set('X-Intelligence-Stale', 'true');
      return res.json(cached.payload);
    }
    return res.status(500).json({ error: 'Failed to generate intelligence brief', details: err.message });
  } finally {
    intelligenceBriefInFlight.delete(cacheKey);
  }
});

aiRouter.get('/ai/briefing', async (req, res) => {
  try {
    const appState = AppState.getInstance();
    const overview = await appState.marketData.getMarketOverview();
    const trends = appState.social.getTrendingTopics();
    const news = appState.news.getLatestNews(10);

    const signalsObj: Record<string, MoneyLineSignal> = {};
    for (const [key, signal] of appState.cachedSignals.entries()) {
      if (key.endsWith('_1h')) {
        signalsObj[signal.symbol] = signal;
      }
    }

    const language: 'ro' | 'en' = req.query.language === 'en' ? 'en' : 'ro';
    const briefing = await appState.ai.generateMarketBriefing(overview, signalsObj, trends, news);
    const take = await readAiContentTake('briefing', language);
    if (take) briefing.aiTake = take;
    const rotation = await readAiContentTake('capital-rotation', language);
    if (rotation) briefing.capitalRotation = rotation;
    res.json(briefing);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to generate AI briefing', details: err.message });
  }
});

const generateMarketIntelligenceReport = async (
  scope: MarketIntelligenceScope,
  language: 'ro' | 'en'
): Promise<MarketIntelligenceReport> => {
  const cacheKey = `${language}:${scope}`;
  const appState = AppState.getInstance();
  await Promise.all([
    waitForSourceRefresh(appState.news.fetchLiveNews()),
    waitForSourceRefresh(appState.social.refreshFreeSources())
  ]);
  const catalog = getScannerAssets(scope)
    .filter(asset => asset.marketClass === scope && (scope !== 'metals' || asset.narratives?.[0] !== 'energy_commodities'))
    .sort((left, right) => (right.marketCap || 0) - (left.marketCap || 0))
    .slice(0, 80);
  const [quotes, overview] = await Promise.all([
    appState.marketData.getQuotesForAssets(catalog),
    scope === 'crypto' ? appState.marketData.getMarketOverview() : Promise.resolve(undefined)
  ]);
  const quoteBySymbol = new Map(quotes.map(quote => [quote.symbol, quote]));
  const definitionById = new Map(NARRATIVE_DEFINITIONS.map(definition => [definition.id, definition]));
  const assets: MarketIntelligenceAssetSnapshot[] = catalog.flatMap(asset => {
    const quote = quoteBySymbol.get(asset.symbol);
    if (!quote) return [];
    return [{
      symbol: asset.symbol,
      name: asset.name,
      change24h: quote.change24h,
      narrative: asset.narratives?.[0] ? definitionById.get(asset.narratives[0])?.shortName : undefined
    }];
  });
  const narrativeRows = new Map<string, MarketIntelligenceAssetSnapshot[]>();
  for (const asset of assets) {
    const key = asset.narrative || (language === 'ro' ? 'Altele' : 'Other');
    narrativeRows.set(key, [...(narrativeRows.get(key) || []), asset]);
  }
  const narratives: MarketIntelligenceNarrativeSnapshot[] = [...narrativeRows.entries()]
    .map(([name, rows]) => ({
      name,
      averageChange24h: Number((rows.reduce((sum, row) => sum + row.change24h, 0) / rows.length).toFixed(2)),
      assetCount: rows.length,
      leaders: [...rows].sort((left, right) => right.change24h - left.change24h).slice(0, 5).map(row => row.symbol)
    }))
    .sort((left, right) => right.averageChange24h - left.averageChange24h);
  const symbols = new Set(catalog.map(asset => asset.symbol));
  const allNews = appState.news.getLatestNews(100);
  const discoverySource = scope === 'crypto'
    ? 'Crypto Narrative Discovery'
    : scope === 'stocks'
      ? 'Stock Narrative Discovery'
      : 'Metals Narrative Discovery';
  const isDiscoveryStory = (value: string) => {
    if (scope === 'crypto') {
      return /\b(PONS|launchpad|token launch|new crypto|protocol launch)\b/i.test(value)
        || (/\bfounder\b/i.test(value) && /\b(crypto|blockchain|token|protocol)\b/i.test(value))
        || (/\bRobinhood\b/i.test(value) && /\b(chain|launchpad|token launch|onchain)\b/i.test(value));
    }
    if (scope === 'stocks') {
      return /\b(IPO|spin-?off|public listing|new product|breakthrough|sector trend)\b/i.test(value)
        && /\b(stock|equity|company|shares|technology|industry)\b/i.test(value);
    }
    return /\b(gold|silver|copper|lithium|rare earth|platinum|palladium)\b/i.test(value)
      && /\b(supply|demand|mine|deficit|tariff|project|discovery)\b/i.test(value);
  };
  const relevantNews = allNews.filter(item =>
    item.category === 'Macro' ||
    item.source === discoverySource ||
    item.mentionedSymbols.some(symbol => symbol.length >= 3 && symbols.has(symbol)) ||
    isDiscoveryStory(`${item.title} ${item.summary}`)
  );
  const prioritizedNews = [...(relevantNews.length ? relevantNews : allNews.slice(0, 12))]
    .sort((left, right) => {
      const discoveryPriority = Number(isDiscoveryStory(`${right.title} ${right.summary}`))
        - Number(isDiscoveryStory(`${left.title} ${left.summary}`));
      return discoveryPriority || right.publishedAt - left.publishedAt;
    });
  const allSocial = appState.social.getRecentVerifiedPosts().sort((a, b) => b.timestamp - a.timestamp);
  const relevantSocial = allSocial.filter(post =>
    post.sector === scope || post.sector === 'macro' || post.mentionedSymbols.some(symbol => symbols.has(symbol))
  );

  const payload = await appState.ai.generateMarketIntelligence(
    scope,
    language,
    assets,
    narratives,
    prioritizedNews,
    relevantSocial.length ? relevantSocial : allSocial.slice(0, 10),
    overview
  );
  const entry = { payload, updatedAt: Date.now() };
  intelligenceCache.set(cacheKey, entry);
  await writePersistentAICache(intelligencePersistentKey(cacheKey), entry);
  return payload;
};

const getMarketIntelligenceReport = async (
  scope: MarketIntelligenceScope,
  language: 'ro' | 'en',
  requestedRefresh = false
): Promise<MarketIntelligenceReport> => {
  const cacheKey = `${language}:${scope}`;
  let cached = intelligenceCache.get(cacheKey);
  if (!cached) {
    cached = await readPersistentAICache<MarketIntelligenceReport>(intelligencePersistentKey(cacheKey));
    if (cached) intelligenceCache.set(cacheKey, cached);
  }
  const cacheAge = cached ? Date.now() - cached.updatedAt : Number.POSITIVE_INFINITY;
  if (cached && cacheAge < INTELLIGENCE_CACHE_MS && (!requestedRefresh || cacheAge < INTELLIGENCE_FORCE_REFRESH_FLOOR_MS)) {
    return cached.payload;
  }

  const existingRequest = intelligenceInFlight.get(cacheKey);
  if (existingRequest) return existingRequest;
  const reportRequest = generateMarketIntelligenceReport(scope, language);
  intelligenceInFlight.set(cacheKey, reportRequest);
  try {
    return await reportRequest;
  } finally {
    intelligenceInFlight.delete(cacheKey);
  }
};

const attachLiveNarrativeChanges = async (
  payload: MarketIntelligenceReport,
  scope: MarketIntelligenceScope
): Promise<MarketIntelligenceReport> => {
  try {
    // Collect every ticker shown in the narrative cards (e.g. $PEPE, $DOGE).
    // Only ticker-like values are resolved; free-form names are skipped so no
    // value is ever invented. Quotes come from the verified provider path:
    // Binance /ticker/24hr for crypto, Yahoo Finance for stocks/metals.
    // The 60s quote cache keeps this fast on repeat views.
    const symbols = Array.from(new Set(
      payload.narratives.flatMap(narrative => narrative.assets || [])
        .map(asset => String(asset || '').replace(/^[$#]/, '').trim().toUpperCase())
        .filter(symbol => /^[A-Z0-9.\-]{2,12}$/.test(symbol))
    )).slice(0, 60);
    if (!symbols.length) return payload;
    const appState = AppState.getInstance();
    const changes: Record<string, number> = {};
    const concurrency = 6;
    for (let index = 0; index < symbols.length; index += concurrency) {
      const batch = symbols.slice(index, index + concurrency);
      const settled = await Promise.allSettled(
        batch.map(symbol => appState.marketData.getPriceQuote(symbol, scope))
      );
      settled.forEach((result, batchIndex) => {
        if (result.status === 'fulfilled' && Number.isFinite(result.value?.change24h)) {
          changes[batch[batchIndex]] = Number(result.value.change24h);
        }
      });
    }
    // Return a copy so the 26h cached report is never polluted with live values.
    return { ...payload, assetChanges: changes };
  } catch {
    return payload;
  }
};

aiRouter.get('/ai/market-intelligence', async (req, res) => {
  try {
    const scope: MarketIntelligenceScope = req.query.scope === 'stocks' || req.query.scope === 'metals'
      ? req.query.scope
      : 'crypto';
    const language: 'ro' | 'en' = req.query.language === 'en' ? 'en' : 'ro';
    const payload = await getMarketIntelligenceReport(scope, language, req.query.refresh === '1');
    const [briefing, marketIntelligence, capitalRotation] = await Promise.all([
      readAiContentTake('briefing', language),
      readAiContentTake('market-intelligence', language),
      readAiContentTake('capital-rotation', language)
    ]);
    // Narrative text is Instinct-authored; model prose in the stored report is dropped.
    const instinct = buildInstinctReport(payload, { briefing, marketIntelligence, capitalRotation }, language);
    const enriched = await attachLiveNarrativeChanges(instinct, scope);
    res.set('Cache-Control', 'private, max-age=30');
    res.json(enriched);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to generate grounded market intelligence', details: err.message });
  }
});

type CryptoCriteriaPayload = Awaited<ReturnType<typeof scanCryptoFourCriteria>>;

const generateCryptoCriteriaReport = async (): Promise<CryptoCriteriaPayload> => {
  const payload = await scanCryptoFourCriteria();
  const entry = { payload, updatedAt: Date.now() };
  cryptoCriteriaCache.set('top-200', entry);
  // Firestore documents cap at 1MiB; the expanded universe can exceed that.
  // Skip the write explicitly - the in-memory cache still serves this instance.
  if (JSON.stringify(entry).length < 950_000) {
    await writePersistentAICache(cryptoCriteriaPersistentKey, entry);
  } else {
    console.warn('Crypto criteria payload exceeds the Firestore document limit; serving from memory only.');
  }
  return payload;
};

export const getCryptoCriteriaReport = async (requestedRefresh = false, allowGenerate = true): Promise<CryptoCriteriaPayload | null> => {
  const cacheKey = 'top-200';
  let cached = cryptoCriteriaCache.get(cacheKey);
  if (!cached) {
    cached = await readPersistentAICache<CryptoCriteriaPayload>(cryptoCriteriaPersistentKey);
    if (cached) cryptoCriteriaCache.set(cacheKey, cached);
  }
  if (cached?.payload.methodologyVersion !== 4) cached = undefined;
  const cacheAge = cached ? Date.now() - cached.updatedAt : Number.POSITIVE_INFINITY;
  if (cached && cacheAge < CRYPTO_CRITERIA_CACHE_MS && (!requestedRefresh || cacheAge < CRYPTO_CRITERIA_FORCE_REFRESH_FLOOR_MS)) {
    return cached.payload;
  }
  // Read-only callers (asset detail card) never trigger an 80s rescan: they
  // take the latest cached payload, even stale, or report unavailable.
  if (!allowGenerate) return cached ? cached.payload : null;

  if (!cryptoCriteriaInFlight) {
    cryptoCriteriaInFlight = generateCryptoCriteriaReport().finally(() => {
      cryptoCriteriaInFlight = null;
    });
  }
  return cryptoCriteriaInFlight;
};

aiRouter.get('/ai/crypto-four-criteria/lookup', async (req, res) => {
  const query = normalizeLookupQuery(String(req.query.q || ''));
  if (query.length < 2) {
    return res.status(400).json({ error: 'Căutarea trebuie să aibă între 2 și 80 de caractere.' });
  }
  try {
    const assets = await lookupCryptoFourCriteria(query);
    res.set('Cache-Control', 'private, max-age=30');
    res.json({ query, assets });
  } catch (err: any) {
    res.status(502).json({ error: 'DexScreener lookup failed', details: err.message });
  }
});

aiRouter.get('/ai/crypto-four-criteria', async (req, res) => {
  try {
    const payload = await getCryptoCriteriaReport(req.query.refresh === '1');
    if (!payload) return res.status(503).json({ error: 'Criteria scan unavailable, retry shortly.' });
    res.set('Cache-Control', 'private, max-age=60');
    res.json(payload);
  } catch (err: any) {
    res.status(502).json({ error: 'Failed to scan the crypto top 200', details: err.message });
  }
});

type StockCriteriaPayload = Awaited<ReturnType<typeof scanStockBusinessQuality>>;

const generateStockCriteriaReport = async (): Promise<StockCriteriaPayload> => {
  const payload = await scanStockBusinessQuality();
  const entry = { payload, updatedAt: Date.now() };
  stockCriteriaCache.set('top-stocks', entry);
  await writePersistentAICache(stockCriteriaPersistentKey, entry);
  return payload;
};

const getStockCriteriaReport = async (requestedRefresh = false): Promise<StockCriteriaPayload> => {
  const cacheKey = 'top-stocks';
  let cached = stockCriteriaCache.get(cacheKey);
  if (!cached) {
    cached = await readPersistentAICache<StockCriteriaPayload>(stockCriteriaPersistentKey);
    if (cached) stockCriteriaCache.set(cacheKey, cached);
  }
  const cacheAge = cached ? Date.now() - cached.updatedAt : Number.POSITIVE_INFINITY;
  if (cached && cacheAge < STOCK_CRITERIA_CACHE_MS && (!requestedRefresh || cacheAge < STOCK_CRITERIA_FORCE_REFRESH_FLOOR_MS)) {
    return cached.payload;
  }

  if (!stockCriteriaInFlight) {
    stockCriteriaInFlight = generateStockCriteriaReport().finally(() => {
      stockCriteriaInFlight = null;
    });
  }
  return stockCriteriaInFlight;
};

aiRouter.get('/ai/stock-business-quality', async (req, res) => {
  try {
    const payload = await getStockCriteriaReport(req.query.refresh === '1');
    res.set('Cache-Control', 'private, max-age=60');
    res.json(payload);
  } catch (err: any) {
    res.status(502).json({ error: 'Failed to scan stock business quality', details: err.message });
  }
});

// Cloud Scheduler calls this once daily at 07:00 Europe/Oslo. Both UI
// languages and all three market scopes are generated ahead of the user's
// visit, then persisted so another Cloud Run instance can serve them instantly.
// Instinct content publisher (Mac bridge outbox -> this endpoint). Token-protected; narrative-guarded.
aiRouter.post('/ai/publish-content', async (req, res) => {
  if (!validateScheduledRequestToken(req.get('x-daily-scan-token'))) {
    return res.status(401).json({ error: 'Invalid daily scan token.' });
  }
  const key = String(req.body?.key || '');
  const take = req.body?.take;
  if (!isAllowedContentKey(key) || !validTake(take)) {
    return res.status(400).json({ error: 'Invalid AI content payload.' });
  }
  const language = req.body?.language === 'en' || req.body?.language === 'ro' ? req.body.language : null;
  // Only Instinct-authored narrative is accepted (Marius, 2026-09-23). The
  // legacy local AI Gateway writer is retired and its publishes are refused.
  if (req.body?.source !== 'instinct-agent') {
    return res.status(403).json({ error: 'Only Instinct-authored content is accepted.' });
  }
  const issues = takeIssues(take);
  if (issues.length) {
    return res.status(422).json({ error: 'Narrative guard rejected the take.', issues });
  }
  const source = 'instinct-agent' as const;
  const cacheKey = language ? `ai-content-${key}-${language}` : `ai-content-${key}`;
  await writePersistentAICache(cacheKey, { payload: { ...take, source }, updatedAt: Date.now() });
  res.set('Cache-Control', 'no-store');
  return res.json({ status: 'published', key, language });
});

aiRouter.post('/ai/daily-warmup', async (req, res) => {
  if (!validateScheduledRequestToken(req.get('x-daily-scan-token'))) {
    return res.status(401).json({ error: 'Invalid daily warm-up token.' });
  }

  const startedAt = Date.now();
  const reports: Array<{
    scope: MarketIntelligenceScope;
    language: 'ro' | 'en';
    status: 'ready' | 'failed';
    generatedAt?: number;
    error?: string;
  }> = [];
  const combinations: Array<{ scope: MarketIntelligenceScope; language: 'ro' | 'en' }> = [
    { scope: 'crypto', language: 'ro' },
    { scope: 'stocks', language: 'ro' },
    { scope: 'metals', language: 'ro' },
    { scope: 'crypto', language: 'en' },
    { scope: 'stocks', language: 'en' },
    { scope: 'metals', language: 'en' }
  ];

  // Sequential generation avoids spending the Gemini quota in a burst and
  // reduces rate-limit failures from free news/market providers.
  for (const combination of combinations) {
    try {
      const payload = await getMarketIntelligenceReport(combination.scope, combination.language, true);
      reports.push({
        ...combination,
        status: 'ready',
        generatedAt: payload.generatedAt
      });
    } catch (error) {
      reports.push({
        ...combination,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  let cryptoCriteria: { status: 'ready' | 'failed'; generatedAt?: number; scannedAssets?: number; error?: string };
  try {
    const payload = await getCryptoCriteriaReport(true);
    cryptoCriteria = payload ? {
      status: 'ready',
      generatedAt: payload.generatedAt,
      scannedAssets: payload.scannedCount
    } : {
      status: 'failed',
      error: 'Scan unavailable'
    };
  } catch (error) {
    cryptoCriteria = {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error)
    };
  }

  let stockCriteria: { status: 'ready' | 'failed'; generatedAt?: number; scannedAssets?: number; error?: string };
  try {
    const payload = await getStockCriteriaReport(true);
    stockCriteria = {
      status: 'ready',
      generatedAt: payload.generatedAt,
      scannedAssets: payload.scannedCount
    };
  } catch (error) {
    stockCriteria = {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error)
    };
  }

  const failed = reports.filter(report => report.status === 'failed').length
    + Number(cryptoCriteria.status === 'failed')
    + Number(stockCriteria.status === 'failed');
  const payload = {
    status: failed ? 'partial' : 'ready',
    schedule: '0 7 * * *',
    timezone: 'Europe/Oslo',
    startedAt,
    completedAt: Date.now(),
    durationMs: Date.now() - startedAt,
    cacheMaxAgeHours: MORNING_CACHE_MAX_AGE_MS / 3_600_000,
    reports,
    cryptoCriteria,
    stockCriteria
  };
  res.set('Cache-Control', 'no-store');
  return failed ? res.status(500).json(payload) : res.json(payload);
});

aiRouter.post('/ai/analyze/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const appState = AppState.getInstance();

    const quote = await appState.marketData.getPriceQuote(symbol);
    const candles = await appState.marketData.getCandles(symbol, '1h', 150);
    const signal = appState.moneyLine.calculateLatest(symbol, '1h', candles);

    if (!signal) {
      return res.status(404).json({ error: `Unable to calculate signal for ${symbol}` });
    }

    const trends = appState.social.getTrendingTopics();
    const news = appState.news.getNewsForSymbol(symbol);

    const explanation = await appState.ai.generateAssetExplanation(symbol, quote.price, signal, trends, news);
    res.json(explanation);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to generate asset AI analysis', details: err.message });
  }
});

aiRouter.post('/ai/ask', async (req, res) => {
  // Marius 2026-09-23: the ask box stays, but answers ONLY from today's
  // Instinct briefing, with the narrative guard (units, dated central-bank
  // news, every number must be in the briefing) on each answer. Any failure
  // returns a fixed reply instead of model text.
  const language: 'ro' | 'en' = req.body?.language === 'en' ? 'en' : 'ro';
  const question = req.body?.question;
  if (!question || typeof question !== 'string') {
    return res.status(400).json({ error: 'Question string is required in request body' });
  }
  const reply = (answer: string, guard: 'pass' | 'fixed-reply' | 'no-briefing', issues: string[] = []) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Answer-Guard', guard);
    if (issues.length) console.warn('ask-box guard rejected answer:', issues.slice(0, 5).join(' | '));
    return res.json({ answer, relatedSymbols: [], evidenceCitations: [], source: 'instinct-briefing', guard });
  };
  const takes = (await Promise.all(
    ['briefing', 'market-intelligence', 'capital-rotation', 'intelligence-brief'].map(key => readAiContentTake(key, language))
  )).filter((take): take is AIContentTake => Boolean(take));
  if (!takes.some(take => take.headline)) return reply(ASK_NO_BRIEFING_REPLY[language], 'no-briefing');
  const briefingText = takes.map(take => [take.headline, ...take.paragraphs, ...(take.bullets || [])].join('\n')).join('\n\n');
  let answer: string;
  // Ops verification hook (scheduler token only): run the guard on a given answer.
  if (typeof req.body?.verifyAnswer === 'string' && validateScheduledRequestToken(req.get('x-daily-scan-token'))) {
    answer = req.body.verifyAnswer.slice(0, 2000);
  } else {
    try {
      answer = await AppState.getInstance().ai.askFromInstinctBriefing(question, briefingText, language);
    } catch {
      return reply(ASK_FIXED_REPLY[language], 'fixed-reply', ['model call failed']);
    }
  }
  const issues = answerIssues(answer, briefingText);
  if (issues.length) return reply(ASK_FIXED_REPLY[language], 'fixed-reply', issues);
  return reply(answer, 'pass');
});
