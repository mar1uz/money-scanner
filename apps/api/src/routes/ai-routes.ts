import { Router } from 'express';
import { AppState } from '../services/app-state.js';
import {
  getScannerAssets,
  NARRATIVE_DEFINITIONS,
  MarketIntelligenceAssetSnapshot,
  MarketIntelligenceNarrativeSnapshot,
  MarketIntelligenceReport,
  MarketIntelligenceScope,
  MoneyLineSignal,
  NewsCategory,
  NewsSynthesisPayload
} from '@money-scanner/shared';
import { scanCryptoFourCriteria } from '../services/crypto-four-criteria-scanner.js';
import { readPersistentAICache, writePersistentAICache } from '../services/ai-cache-store.js';
import { validateScheduledRequestToken } from '../services/scheduler-auth.js';

export const aiRouter = Router();

const synthesisCache = new Map<string, { payload: NewsSynthesisPayload; updatedAt: number }>();
const SYNTHESIS_CACHE_MS = 5 * 60_000;
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
const SOURCE_REFRESH_TIMEOUT_MS = 15_000;

const intelligencePersistentKey = (cacheKey: string) => `market-intelligence-${cacheKey.replace(':', '-')}`;
const cryptoCriteriaPersistentKey = 'crypto-four-criteria-top-200';

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

    const briefing = await appState.ai.generateMarketBriefing(overview, signalsObj, trends, news);
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

aiRouter.get('/ai/market-intelligence', async (req, res) => {
  try {
    const scope: MarketIntelligenceScope = req.query.scope === 'stocks' || req.query.scope === 'metals'
      ? req.query.scope
      : 'crypto';
    const language: 'ro' | 'en' = req.query.language === 'en' ? 'en' : 'ro';
    const payload = await getMarketIntelligenceReport(scope, language, req.query.refresh === '1');
    res.set('Cache-Control', 'private, max-age=30');
    res.json(payload);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to generate grounded market intelligence', details: err.message });
  }
});

type CryptoCriteriaPayload = Awaited<ReturnType<typeof scanCryptoFourCriteria>>;

const generateCryptoCriteriaReport = async (): Promise<CryptoCriteriaPayload> => {
  const payload = await scanCryptoFourCriteria();
  const entry = { payload, updatedAt: Date.now() };
  cryptoCriteriaCache.set('top-200', entry);
  await writePersistentAICache(cryptoCriteriaPersistentKey, entry);
  return payload;
};

const getCryptoCriteriaReport = async (requestedRefresh = false): Promise<CryptoCriteriaPayload> => {
  const cacheKey = 'top-200';
  let cached = cryptoCriteriaCache.get(cacheKey);
  if (!cached) {
    cached = await readPersistentAICache<CryptoCriteriaPayload>(cryptoCriteriaPersistentKey);
    if (cached) cryptoCriteriaCache.set(cacheKey, cached);
  }
  const cacheAge = cached ? Date.now() - cached.updatedAt : Number.POSITIVE_INFINITY;
  if (cached && cacheAge < CRYPTO_CRITERIA_CACHE_MS && (!requestedRefresh || cacheAge < CRYPTO_CRITERIA_FORCE_REFRESH_FLOOR_MS)) {
    return cached.payload;
  }

  if (!cryptoCriteriaInFlight) {
    cryptoCriteriaInFlight = generateCryptoCriteriaReport().finally(() => {
      cryptoCriteriaInFlight = null;
    });
  }
  return cryptoCriteriaInFlight;
};

aiRouter.get('/ai/crypto-four-criteria', async (req, res) => {
  try {
    const payload = await getCryptoCriteriaReport(req.query.refresh === '1');
    res.set('Cache-Control', 'private, max-age=60');
    res.json(payload);
  } catch (err: any) {
    res.status(502).json({ error: 'Failed to scan the crypto top 200', details: err.message });
  }
});

// Cloud Scheduler calls this once daily at 07:00 Europe/Oslo. Both UI
// languages and all three market scopes are generated ahead of the user's
// visit, then persisted so another Cloud Run instance can serve them instantly.
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
    cryptoCriteria = {
      status: 'ready',
      generatedAt: payload.generatedAt,
      scannedAssets: payload.scannedCount
    };
  } catch (error) {
    cryptoCriteria = {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error)
    };
  }

  const failed = reports.filter(report => report.status === 'failed').length + Number(cryptoCriteria.status === 'failed');
  const payload = {
    status: failed ? 'partial' : 'ready',
    schedule: '0 7 * * *',
    timezone: 'Europe/Oslo',
    startedAt,
    completedAt: Date.now(),
    durationMs: Date.now() - startedAt,
    cacheMaxAgeHours: MORNING_CACHE_MAX_AGE_MS / 3_600_000,
    reports,
    cryptoCriteria
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
  try {
    const { question } = req.body;
    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'Question string is required in request body' });
    }

    const scope: MarketIntelligenceScope = req.body.scope === 'stocks' || req.body.scope === 'metals'
      ? req.body.scope
      : 'crypto';
    const language: 'ro' | 'en' = req.body.language === 'en' ? 'en' : 'ro';
    const scopedReport = intelligenceCache.get(`${language}:${scope}`)?.payload;
    if (scopedReport) {
      const appState = AppState.getInstance();
      const response = await appState.ai.askMarketIntelligenceQuestion(question, scopedReport, language);
      return res.json(response);
    }

    const appState = AppState.getInstance();
    const overview = await appState.marketData.getMarketOverview();
    const trends = appState.social.getTrendingTopics();
    const news = appState.news.getLatestNews(15);

    const signalsObj: Record<string, MoneyLineSignal> = {};
    for (const [key, signal] of appState.cachedSignals.entries()) {
      if (key.endsWith('_1h')) {
        signalsObj[signal.symbol] = signal;
      }
    }

    const response = await appState.ai.askAnalyst(question, overview, signalsObj, trends, news);
    res.json(response);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to process AI analyst question', details: err.message });
  }
});
