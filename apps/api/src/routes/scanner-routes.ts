import { Router, type Response as ExpressResponse } from 'express';
import { AppState } from '../services/app-state.js';
import { validateScheduledRequestToken } from '../services/scheduler-auth.js';
import {
  Timeframe,
  TRADING_360_ASSETS,
  ScannerMarketClass,
  AssetMarketClass,
  AssetInfo,
  MarketNarrativeId,
  SymbolSearchCandidate,
  catalogToSearchCandidates,
  parseSymbolSearchQuery,
  rankSymbolSearchCandidates
} from '@money-scanner/shared';
import { calculateMTFConfluence } from '@money-scanner/money-line';
import type { ChartMarketResolution, VenuePairRouting } from '@money-scanner/market-data';
import { aggregatedCryptoDetail, cryptoMarketProfiles } from '../services/crypto-market-profile.js';
import { readPersistentAICache } from '../services/ai-cache-store.js';
import { getCryptoCriteriaReport } from './ai-routes.js';
import { onchainMetrics } from '../services/onchain-metrics.js';
import type { AIContentTake } from '@money-scanner/shared';
import { isServableTake } from '../services/narrative-guard.js';

export const scannerRouter = Router();

interface BinanceMarketRow {
  symbol?: string;
  baseAsset?: string;
  quoteAsset?: string;
  contractType?: string;
  status?: string;
}

let binanceSpotCache: { rows: BinanceMarketRow[]; expiresAt: number } | undefined;
let binanceFuturesCache: { rows: BinanceMarketRow[]; expiresAt: number } | undefined;
// A transient provider failure must not be retried on every keystroke, and it
// must never overwrite the last verified market list with an empty one.
let binanceSpotFailedAt = 0;
let binanceFuturesFailedAt = 0;
const BINANCE_MARKETS_TTL_MS = 15 * 60_000;
const BINANCE_RETRY_BACKOFF_MS = 30_000;
// A single typed character answers from catalog/cache alone and the first two
// characters never reach the identity providers: see resolveSearchCandidates.
const MIN_SEARCH_QUERY_LENGTH = 2;
const PROVIDER_SEARCH_MIN_LENGTH = 3;
const MAX_SEARCH_QUERY_LENGTH = 120;
const searchResponseCache = new Map<string, { payload: ReturnType<typeof rankSymbolSearchCandidates>; expiresAt: number }>();
// Concurrent identical queries share one upstream execution (same pattern as
// universeInFlight below): typing must not multiply provider cost per user.
const searchInFlight = new Map<string, Promise<ReturnType<typeof rankSymbolSearchCandidates>>>();
const coinGeckoLastGood = new Map<string, { rows: SymbolSearchCandidate[]; updatedAt: number }>();
let universeLastGood: { rows: SymbolSearchCandidate[]; updatedAt: number } | null = null;
let universeInFlight: Promise<SymbolSearchCandidate[]> | null = null;

const normalizeProviderName = (value: string) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
// Grounded platform/chain alias, keyed by exact CoinGecko identity rather than ticker.
// CoinGecko's Pons listing identifies Robinhood-chain markets (see coin page).
const searchIdentityAliases: Record<string, string[]> = { pons: ['Robinhood', 'Robinhood Chain', 'Pons Robinhood'] };
const withIdentityAliases = (row: SymbolSearchCandidate): SymbolSearchCandidate => ({
  ...row, aliases: [...new Set([...(row.aliases || []), ...(searchIdentityAliases[row.coinGeckoId || ''] || [])])]
});

// Bubble and Heat Map deep links pass exact provider IDs, bypassing the
// symbol-only scanner route. When such a coin is missing from the static
// catalog, keep deep-dive parity with Market Scanner clicks: a name-verified
// match in the live exchange-backed top list continues on the standard
// exchange route (candles + Money Line) instead of degrading to the
// price-only aggregator page.
//
// Provider-name agreement: the venue row is the same asset when its display
// name and the provider's name are equal (or one is a suffix/prefix of the
// other, tolerating legal-form suffixes like "Popcat" vs "Popcat Labs").
const liveNameMatches = (providerName: string, venueName: string): boolean => {
  const profileName = normalizeProviderName(providerName);
  const normalizedVenueName = normalizeProviderName(venueName);
  if (!profileName || !normalizedVenueName) return false;
  return normalizedVenueName === profileName
    || (profileName.length >= 4 && normalizedVenueName.includes(profileName))
    || (normalizedVenueName.length >= 4 && profileName.includes(normalizedVenueName));
};

// The live exchange-backed top list (CoinGecko market-cap ranked AND listed on
// a candle venue). Undefined when the list cannot be read at all - a slim or
// degraded AppState must degrade the identity verdict, never fail the page.
const readLiveExchangeAsset = async (symbol: string): Promise<AssetInfo | undefined> => {
  try {
    const marketData = AppState.getInstance().marketData;
    if (typeof marketData?.getTopCryptoAssets !== 'function') return undefined;
    return (await marketData.getTopCryptoAssets(150))
      .find(asset => String(asset?.symbol || '').toUpperCase() === symbol);
  } catch {
    return undefined;
  }
};

const matchesLiveExchangeAsset = async (symbol: string, providerName: string): Promise<boolean> =>
  liveNameMatches(providerName, (await readLiveExchangeAsset(symbol))?.name || '');

// The independent exact-ID chart-market resolution (CoinGecko markets bound to
// the supplied coin ID). Unavailable resolution support degrades to "no
// candidate venue"; a durable pin mismatch keeps failing closed (outer catch).
const resolveExactChartMarket = async (symbol: string, coinGeckoId: string): Promise<ChartMarketResolution | null> => {
  try {
    const marketData = AppState.getInstance().marketData;
    if (typeof marketData?.resolveChartMarket !== 'function') return null;
    return (await marketData.resolveChartMarket(symbol, coinGeckoId)) || null;
  } catch (error: any) {
    const message = String(error?.message || '');
    if (message.includes('Chart market pin') || message.includes('No identity-verified candle market')) throw error;
    return null;
  }
};

// Same credential convention as every other CoinGecko call site
// (packages/market-data/src/market-service.ts): a configured demo key rides in
// x-cg-demo-api-key. The anonymous quota is ~5 requests/minute/IP, which one
// typed word exhausts - and that silently removes the coinGeckoId identity.
const coinGeckoHeaders = (): Record<string, string> => {
  const key = process.env.COINGECKO_API_KEY;
  return key
    ? { accept: 'application/json', 'x-cg-demo-api-key': key }
    : { accept: 'application/json' };
};

const fetchJson = async <T>(url: string, timeoutMs = 3_500, headers?: Record<string, string>): Promise<T | undefined> => {
  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return undefined;
    return await response.json() as T;
  } catch {
    return undefined;
  }
};

const loadBinanceMarkets = async (kind: 'spot' | 'futures'): Promise<BinanceMarketRow[]> => {
  const current = kind === 'spot' ? binanceSpotCache : binanceFuturesCache;
  if (current && current.expiresAt > Date.now()) return current.rows;
  // Simple backoff: a provider outage costs one attempt per window instead of
  // one attempt per request, and stale rows keep serving in the meantime.
  const failedAt = kind === 'spot' ? binanceSpotFailedAt : binanceFuturesFailedAt;
  if (failedAt && Date.now() - failedAt < BINANCE_RETRY_BACKOFF_MS) return current?.rows || [];
  const url = kind === 'spot'
    ? 'https://api.binance.com/api/v3/exchangeInfo'
    : 'https://fapi.binance.com/fapi/v1/exchangeInfo';
  const payload = await fetchJson<{ symbols?: BinanceMarketRow[] }>(url);
  const rows = payload?.symbols;
  // Cache verified successes only: a timeout/429/DNS failure keeps the previous
  // rows (if any) and leaves the TTL untouched, so the next window retries.
  if (!rows?.length) {
    if (kind === 'spot') binanceSpotFailedAt = Date.now();
    else binanceFuturesFailedAt = Date.now();
    return current?.rows || [];
  }
  const next = { rows, expiresAt: Date.now() + BINANCE_MARKETS_TTL_MS };
  if (kind === 'spot') {
    binanceSpotCache = next;
    binanceSpotFailedAt = 0;
  } else {
    binanceFuturesCache = next;
    binanceFuturesFailedAt = 0;
  }
  return rows;
};

const binanceRowsToCandidates = (
  spotRows: BinanceMarketRow[],
  futuresRows: BinanceMarketRow[]
): SymbolSearchCandidate[] => {
  const spotQuotes = new Set(['USDT', 'USDC', 'FDUSD', 'BTC', 'ETH', 'EUR']);
  const spot = spotRows.flatMap<SymbolSearchCandidate>(market => {
    const pair = String(market.symbol || '').toUpperCase();
    const base = String(market.baseAsset || '').toUpperCase();
    const quote = String(market.quoteAsset || '').toUpperCase();
    if (!pair || !base || market.status !== 'TRADING' || !spotQuotes.has(quote)) return [];
    return [{
      symbol: base,
      displaySymbol: pair,
      providerSymbol: pair,
      name: `${base} / ${quote}`,
      category: 'Crypto Spot',
      marketClass: 'crypto',
      exchange: 'BINANCE',
      instrumentType: 'spot',
      quoteCurrency: quote,
      aliases: [base, pair, `${base}/${quote}`],
      verified: true,
      matchType: 'binance'
    }];
  });
  const futures = futuresRows.flatMap<SymbolSearchCandidate>(market => {
    const pair = String(market.symbol || '').toUpperCase();
    const base = String(market.baseAsset || '').toUpperCase();
    const quote = String(market.quoteAsset || '').toUpperCase();
    if (!pair || !base || quote !== 'USDT' || market.status !== 'TRADING' || market.contractType !== 'PERPETUAL') return [];
    return [{
      symbol: `${pair}.P`,
      displaySymbol: `${pair}.P`,
      providerSymbol: pair,
      name: `${base} / USDT Perpetual`,
      category: 'Crypto Perpetual',
      marketClass: 'crypto',
      exchange: 'BINANCE Futures',
      instrumentType: 'perpetual',
      quoteCurrency: 'USDT',
      aliases: [base, pair, `${pair}.P`, `${base}/USDT perpetual`],
      verified: true,
      matchType: 'binance'
    }];
  });
  return [...spot, ...futures];
};

const binanceSearchCandidates = async (): Promise<SymbolSearchCandidate[]> => {
  const [spotRows, futuresRows] = await Promise.all([
    loadBinanceMarkets('spot'),
    loadBinanceMarkets('futures')
  ]);
  return binanceRowsToCandidates(spotRows, futuresRows);
};

/** Already-cached Binance rows only: never triggers a provider request. */
const cachedBinanceCandidates = (): SymbolSearchCandidate[] => binanceRowsToCandidates(
  binanceSpotCache?.rows || [],
  binanceFuturesCache?.rows || []
);

const yahooSearchCandidates = async (query: string): Promise<SymbolSearchCandidate[]> => {
  const payload = await fetchJson<{ quotes?: any[] }>(
    `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=20&newsCount=0`,
    3_500,
    { 'User-Agent': 'Mozilla/5.0 (compatible; MarketScanner360/1.0)' }
  );
  return (payload?.quotes || []).flatMap<SymbolSearchCandidate>(quote => {
    if (!quote?.symbol) return [];
    const providerSymbol = String(quote.symbol).toUpperCase();
    const quoteType = String(quote.quoteType || '').toUpperCase();
    let marketClass: SymbolSearchCandidate['marketClass'] = 'stocks';
    let instrumentType: SymbolSearchCandidate['instrumentType'] = 'equity';
    let category = quote.sectorDisp || quote.industryDisp || quote.typeDisp || 'Equity';
    let symbol = providerSymbol;
    let quoteCurrency = 'USD';
    if (quoteType === 'CRYPTOCURRENCY') {
      marketClass = 'crypto';
      instrumentType = 'spot';
      category = 'Crypto Spot';
      const cryptoPair = providerSymbol.match(/^(.+?)-(USD|USDT|USDC)$/);
      if (cryptoPair) {
        symbol = cryptoPair[1];
        quoteCurrency = cryptoPair[2];
      }
    } else if (quoteType === 'CURRENCY') {
      marketClass = 'forex';
      instrumentType = 'forex';
      category = 'Forex Pair';
    } else if (quoteType === 'ETF') {
      instrumentType = 'etf';
      category = quote.typeDisp || 'ETF';
    } else if (quoteType === 'INDEX') {
      marketClass = 'macro';
      instrumentType = 'index';
      category = 'Index';
    } else if (quoteType === 'COMMODITY' || quoteType === 'FUTURE') {
      marketClass = 'metals';
      category = 'Commodity';
    }
    return [{
      symbol,
      displaySymbol: providerSymbol,
      providerSymbol,
      name: quote.shortname || quote.longname || providerSymbol,
      category,
      marketClass,
      exchange: quote.exchDisp || quote.exchange || 'GLOBAL',
      instrumentType,
      quoteCurrency,
      aliases: [providerSymbol, quote.shortname, quote.longname].filter(Boolean),
      verified: true,
      matchType: 'yahoo'
    }];
  });
};

const coinGeckoSearchCandidates = async (query: string): Promise<SymbolSearchCandidate[]> => {
  const key = query.toLowerCase();
  const payload = await fetchJson<{ coins?: Array<{
    id?: string; name?: string; symbol?: string; market_cap_rank?: number | null;
  }> }>(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`, 3_500, coinGeckoHeaders());
  if (!payload?.coins) {
    const old = coinGeckoLastGood.get(key);
    return (old?.rows || []).map(row => ({ ...row, staleAsOf: old?.updatedAt }));
  }
  const rows = payload.coins.slice(0, 50).flatMap<SymbolSearchCandidate>(coin => {
    const symbol = String(coin.symbol || '').toUpperCase();
    if (!symbol || !coin.name || !coin.id) return [];
    return [{
      symbol, displaySymbol: symbol, name: coin.name, category: 'Crypto Asset',
      marketClass: 'crypto', exchange: 'COINGECKO', instrumentType: 'spot',
      quoteCurrency: 'USD', aliases: [coin.id, coin.name, symbol], coinGeckoId: coin.id,
      rank: coin.market_cap_rank || undefined, verified: true, matchType: 'coingecko'
    }];
  });
  coinGeckoLastGood.set(key, { rows, updatedAt: Date.now() });
  if (coinGeckoLastGood.size > 200) coinGeckoLastGood.delete(coinGeckoLastGood.keys().next().value!);
  return rows;
};

/** Existing cached scan includes DefiLlama-discovered protocols; never start a heavy scan in search. */
const dynamicSearchCandidates = async (): Promise<SymbolSearchCandidate[]> => {
  if (universeLastGood && Date.now() - universeLastGood.updatedAt < 5 * 60_000) return universeLastGood.rows;
  if (universeInFlight) return universeInFlight;
  universeInFlight = (async () => { try {
    const [topResult, criteriaResult] = await Promise.allSettled([
      AppState.getInstance().marketData.getTopCryptoAssets(150),
      getCryptoCriteriaReport(false, false)
    ]);
    const top = topResult.status === 'fulfilled' ? topResult.value : [];
    const criteria = criteriaResult.status === 'fulfilled' ? criteriaResult.value : null;
    const rows: SymbolSearchCandidate[] = [
      ...catalogToSearchCandidates(top).map(row => ({ ...row, matchType: 'universe' as const })),
      ...(criteria?.assets || []).filter(asset => asset.coinGeckoId).map(asset => ({
        symbol: asset.symbol.toUpperCase(), displaySymbol: asset.symbol.toUpperCase(),
        name: asset.name, category: 'Crypto Asset', marketClass: 'crypto' as const,
        exchange: 'COINGECKO', instrumentType: 'spot' as const, quoteCurrency: 'USD',
        aliases: [asset.coinGeckoId!, asset.name], coinGeckoId: asset.coinGeckoId,
        rank: asset.marketCapRank || undefined, marketCap: asset.marketCap || undefined,
        verified: true, matchType: 'universe' as const
      }))
    ];
    if (rows.length) {
      universeLastGood = { rows, updatedAt: Date.now() };
      return rows;
    }
  } catch { /* Preserve the last verified index during provider outages. */ }
  return (universeLastGood?.rows || []).map(row => ({ ...row, staleAsOf: universeLastGood?.updatedAt }));
  })().finally(() => { universeInFlight = null; });
  return universeInFlight;
};

/** Already-cached live universe (refreshed at most every 5 min): no scan. */
const cachedUniverseCandidates = (): SymbolSearchCandidate[] => {
  const universe = universeLastGood;
  if (!universe) return [];
  return Date.now() - universe.updatedAt < 5 * 60_000
    ? universe.rows
    : universe.rows.map(row => ({ ...row, staleAsOf: universe.updatedAt }));
};

/**
 * Candidate sources per query length. A provider round trip is only bought for
 * a query specific enough to justify it: a single keystroke answers from the
 * catalog plus whatever the instance has cached, and the first two characters
 * never reach the identity providers (Yahoo/CoinGecko).
 */
const resolveSearchCandidates = async (query: string): Promise<SymbolSearchCandidate[]> => {
  const localCandidates = catalogToSearchCandidates(TRADING_360_ASSETS);
  if (query.length < MIN_SEARCH_QUERY_LENGTH) {
    return [...localCandidates, ...cachedBinanceCandidates(), ...cachedUniverseCandidates()].map(withIdentityAliases);
  }
  if (query.length < PROVIDER_SEARCH_MIN_LENGTH) {
    const [spotRows, futuresRows] = await Promise.all([
      loadBinanceMarkets('spot'),
      loadBinanceMarkets('futures')
    ]);
    return [...localCandidates, ...binanceRowsToCandidates(spotRows, futuresRows), ...cachedUniverseCandidates()]
      .map(withIdentityAliases);
  }
  const [binance, yahoo, coinGecko, universe] = await Promise.all([
    binanceSearchCandidates(),
    yahooSearchCandidates(query),
    coinGeckoSearchCandidates(query),
    dynamicSearchCandidates()
  ]);
  return [...localCandidates, ...universe, ...binance, ...yahoo, ...coinGecko].map(withIdentityAliases);
};

const buildSearchPayload = async (
  query: string,
  cacheKey: string
): Promise<ReturnType<typeof rankSymbolSearchCandidates>> => {
  const candidates = await resolveSearchCandidates(query);
  let results = rankSymbolSearchCandidates(query, candidates, 60);

  // A direct result is a last-resort attempt, never an invented stock. It is
  // only shown when no verified provider/catalog candidate matched, and never
  // for a single keystroke.
  if (!results.length && query.length >= MIN_SEARCH_QUERY_LENGTH) {
    const parsed = parseSymbolSearchQuery(query);
    if (/^[A-Z0-9.^=-]{1,24}$/.test(parsed.text.toUpperCase())) {
      const directSymbol = parsed.perpetual ? `${parsed.compact}.P` : parsed.compact;
      results = rankSymbolSearchCandidates(query, [{
        symbol: directSymbol,
        displaySymbol: parsed.text.toUpperCase(),
        providerSymbol: parsed.compact,
        name: `${parsed.text.toUpperCase()} · instrument direct neverificat`,
        category: 'Direct symbol',
        marketClass: parsed.quote || parsed.perpetual ? 'crypto' : 'unknown',
        exchange: parsed.exchange || 'TRADINGVIEW',
        instrumentType: parsed.perpetual ? 'perpetual' : undefined,
        quoteCurrency: parsed.quote,
        verified: false,
        matchType: 'direct'
      }], 1).map(result => ({ ...result, matchReason: 'direct' as const }));
    }
  }

  const appState = AppState.getInstance();
  const enriched = results.map(result => {
    const signal = appState.cachedSignals.get(`${result.symbol}_1w`);
    return {
      ...result,
      price: result.price || 0,
      change24h: result.change24h || 0,
      changeYtd: result.changeYtd || 0,
      moneyLineScore: signal?.score || result.moneyLineScore || 0,
      tier: signal?.tier || result.tier || 'Neutral'
    };
  });
  searchResponseCache.set(cacheKey, { payload: enriched, expiresAt: Date.now() + 30_000 });
  if (searchResponseCache.size > 200) searchResponseCache.delete(searchResponseCache.keys().next().value!);
  return enriched;
};

/** The response is cacheable on both branches, hit and miss. */
const respondWithSearchResults = (
  res: ExpressResponse,
  payload: ReturnType<typeof rankSymbolSearchCandidates>
) => {
  res.set('Cache-Control', 'private, max-age=15');
  return res.json(payload);
};

scannerRouter.get('/search', async (req, res) => {
  try {
    const queryParam = req.query.q;
    // Express maps a repeated parameter (`?q=a&q=b`, `?q[]=a`) to an array.
    // The route used to crash on those and return the internal error message.
    if (queryParam !== undefined && typeof queryParam !== 'string') {
      return res.status(400).json({ error: 'Invalid search query.' });
    }
    const rawQuery = (queryParam || '').trim();
    if (!rawQuery) return respondWithSearchResults(res, []);
    if (rawQuery.length > MAX_SEARCH_QUERY_LENGTH) {
      return res.status(400).json({ error: 'Invalid search query.' });
    }
    const cacheKey = rawQuery.toLowerCase();
    const cached = searchResponseCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return respondWithSearchResults(res, cached.payload);

    // Identical concurrent queries execute the pipeline once, not once each.
    let pending = searchInFlight.get(cacheKey);
    if (!pending) {
      pending = buildSearchPayload(rawQuery, cacheKey).finally(() => searchInFlight.delete(cacheKey));
      searchInFlight.set(cacheKey, pending);
    }
    return respondWithSearchResults(res, await pending);
  } catch (err: any) {
    console.error(`Search failed: ${err?.message || err}`);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Cloud Scheduler still computes a new scan every minute. Dashboard readers
// reuse that completed result for up to 60 seconds on the same instance.
let warmInFlight: Promise<{ rows: number; durationMs: number }> | null = null;
scannerRouter.get('/scanner/warm', async (req, res) => {
  if (!validateScheduledRequestToken(req.get('x-daily-scan-token'))) {
    return res.status(401).json({ error: 'Invalid scheduler token' });
  }
  try {
    const appState = AppState.getInstance();
    if (!warmInFlight) {
      const startedAt = Date.now();
      warmInFlight = (async () => {
        const rows = await appState.refreshSignals('1w', 'ALL');
        await appState.marketData.getMarketOverview();
        return { rows: rows.length, durationMs: Date.now() - startedAt };
      })().finally(() => { warmInFlight = null; });
    }
    const result = await warmInFlight;
    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(503).json({ error: 'Warm failed', details: err.message });
  }
});

scannerRouter.get('/scanner', async (req, res) => {
  try {
    const requestedTimeframe = String(req.query.timeframe || '1w');
    const timeframe: Timeframe = (['1h', '4h', '8h', '1d', '1w', '1m'] as string[]).includes(requestedTimeframe)
      ? requestedTimeframe as Timeframe : '1w';
    const tier = req.query.tier as string;
    const narrative = req.query.narrative as string;
    const requestedMarketClass = String(req.query.marketClass || 'ALL');
    const marketClass: ScannerMarketClass = requestedMarketClass === 'crypto' || requestedMarketClass === 'stocks' || requestedMarketClass === 'metals'
      ? requestedMarketClass
      : 'ALL';
    const rawSearch = (req.query.search as string || '').trim();
    const search = rawSearch.replace(/^[$#]/, '').toUpperCase();
    const watchlistOnly = req.query.watchlist === 'true';

    const appState = AppState.getInstance();
    let rows = await appState.getScannerRows(
      timeframe,
      marketClass,
      narrative && narrative !== 'ALL' ? narrative as MarketNarrativeId : undefined
    );

    // The selected crypto endpoint is a hard data contract, not a visual
    // preference. Reject every row that is not explicitly provider-classified
    // as crypto before any additional filtering or response serialization.
    if (marketClass === 'crypto') {
      rows = rows.filter(row => row.marketClass === 'crypto');
    }

    if (narrative && narrative !== 'ALL') {
      rows = rows.filter(r => r.narratives?.includes(narrative as any));
    }

    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(r => {
        const info = TRADING_360_ASSETS.find(a => a.symbol.toUpperCase() === r.symbol.toUpperCase());
        const aliases = (info?.aliases || []).map(al => al.toLowerCase());
        return (
          r.symbol.toLowerCase().includes(q) || 
          r.name.toLowerCase().includes(q) ||
          r.category.toLowerCase().includes(q) ||
          aliases.some(al => al.includes(q) || q.includes(al))
        );
      });
    }
    if (tier && tier !== 'ALL') {
      rows = rows.filter(r => r.tier === tier);
    }

    if (marketClass === 'crypto') {
      // The first 50 remain the global market-cap leaders; additional rows are
      // the sector-completion set required to expose ten assets per narrative.
      rows = rows.sort((left, right) => (right.marketCap || 0) - (left.marketCap || 0));
    }

    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to execute scanner', details: err.message });
  }
});

scannerRouter.get('/narratives', async (req, res) => {
  try {
    const timeframe = (req.query.timeframe as Timeframe) || '1w';
    const requestedMarketClass = String(req.query.marketClass || 'ALL');
    const marketClass: ScannerMarketClass = requestedMarketClass === 'crypto' || requestedMarketClass === 'stocks' || requestedMarketClass === 'metals'
      ? requestedMarketClass
      : 'ALL';
    const appState = AppState.getInstance();
    const narratives = await appState.getNarrativeSummaries(timeframe, marketClass);
    res.json(narratives);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to compute narrative summaries', details: err.message });
  }
});

scannerRouter.get('/assets/:symbol/candles', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const requestedTimeframe = String(req.query.timeframe || '1h');
    const validTimeframes: Timeframe[] = ['1h', '4h', '8h', '1d', '1w', '1m'];
    if (!validTimeframes.includes(requestedTimeframe as Timeframe)) {
      return res.status(400).json({ error: 'Invalid timeframe.' });
    }

    const before = Number(req.query.before);
    if (!Number.isFinite(before) || before <= 0) {
      return res.status(400).json({ error: 'A valid before timestamp is required.' });
    }

    const requestedLimit = Number(req.query.limit || 1000);
    const limit = Math.max(100, Math.min(1000, Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 1000));
    const requestedClassRaw = String(req.query.marketClass || '');
    const requestedMarketClass: AssetMarketClass | undefined = requestedClassRaw === 'crypto' || requestedClassRaw === 'stocks' || requestedClassRaw === 'metals'
      ? requestedClassRaw
      : undefined;

    // Same optional venue-pair identity as the asset route (F6/B4): the older
    // pages of a chart must keep reading the exact pair the first page came
    // from, and a pair this server cannot confirm is refused exactly like the
    // first page instead of resolving the bare ticker behind it.
    const suppliedVenuePair = readSuppliedVenuePair(req.query as Record<string, unknown>);
    let venuePair: VenuePairRouting | undefined;
    if (suppliedVenuePair) {
      const verdict = await confirmSuppliedVenuePair(suppliedVenuePair, symbol);
      if (verdict.status === 'unconfirmed') {
        return res.status(503).json({ error: 'Verified exchange candles unavailable for the selected coin.' });
      }
      if (verdict.status === 'confirmed') {
        venuePair = {
          providerSymbol: suppliedVenuePair.providerSymbol,
          exchange: suppliedVenuePair.exchange,
          instrumentType: 'spot',
          quoteCurrency: verdict.quoteCurrency
        };
      }
    }

    const candles = await AppState.getInstance().marketData.getCandlesBefore(
      symbol,
      requestedTimeframe as Timeframe,
      before,
      limit,
      requestedMarketClass,
      typeof req.query.coinGeckoId === 'string' ? req.query.coinGeckoId : undefined,
      venuePair
    );

    res.json({
      candles,
      hasMore: candles.length > 0,
      oldestTimestamp: candles[0]?.timestamp || null,
      // Only a series quoted in something other than the canonical USDT market
      // needs the marker; a plain USDT pair keeps the legacy payload byte for byte.
      ...(venuePair && venuePair.quoteCurrency !== 'USDT' ? { candlePair: venuePair } : {})
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch historical candles', details: err.message });
  }
});

scannerRouter.get('/assets/:symbol/chart-market', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const requestedClassRaw = String(req.query.marketClass || '');
    if (requestedClassRaw && requestedClassRaw !== 'crypto') {
      return res.json({ symbol, tvSymbol: null, reason: 'non-crypto' });
    }
    if (symbol.includes('.') || symbol.includes(':') || symbol.startsWith('TOTAL')) {
      return res.json({ symbol, tvSymbol: null, reason: 'non-spot-symbol' });
    }
    const resolution = await AppState.getInstance().marketData.resolveChartMarket(symbol, typeof req.query.coinGeckoId === 'string' ? req.query.coinGeckoId : undefined);
    if (!resolution || !resolution.tv?.tvSymbol) {
      return res.json({ symbol, tvSymbol: null, reason: 'no-market' });
    }
    res.json({
      symbol,
      tvSymbol: resolution.tv.tvSymbol,
      exchange: resolution.tv.exchange,
      quoteCurrency: resolution.tv.quoteCurrency,
      listingStart: resolution.tv.listingStart,
      candleSource: resolution.candle?.source || null,
      candleExchange: resolution.candle?.exchange || null,
      resolvedAt: resolution.resolvedAt
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to resolve chart market', details: err.message });
  }
});

// ---------------------------------------------------------------------------
// Exact venue-pair identity of the clicked search row (F6/B3/B4).
//
// The universal search modal already knows the row's own venue identity
// (`providerSymbol`/`exchange`/`instrumentType`/`quoteCurrency`); App carries
// it into the deep-link URL and this route accepts it as optional query
// parameters. The contract is additive: requests without them behave exactly
// as before. A supplied pair is only acted on for the venues the server can
// verify from its own live market lists, and it is checked BEFORE any
// ticker-based resolution: a confirmed pair establishes the identity without a
// CoinGecko ID, and a pair that cannot be confirmed is refused explicitly
// instead of quietly answering with whichever asset shares the ticker.
// ---------------------------------------------------------------------------

interface SuppliedVenuePair {
  providerSymbol: string;
  exchange: string;
  instrumentType?: string;
  quoteCurrency?: string;
}

type VenuePairVerdict =
  | { status: 'not-applicable' }
  | { status: 'unconfirmed' }
  | { status: 'confirmed'; baseSymbol: string; quoteCurrency: string };

const MAX_PAIR_IDENTITY_FIELD_LENGTH = 32;
// Mirrors the accepted spot quotes of the search pipeline (binanceRowsToCandidates):
// a pair outside the set is not an identity the search rows could have carried.
const VERIFIABLE_SPOT_QUOTES = new Set(['USDT', 'USDC', 'FDUSD', 'BTC', 'ETH', 'EUR']);

const readQueryString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

/** Parses the optional venue-pair parameters; malformed input is ignored (legacy behaviour). */
const readSuppliedVenuePair = (query: Record<string, unknown>): SuppliedVenuePair | undefined => {
  const providerSymbol = readQueryString(query.providerSymbol)?.toUpperCase();
  const exchange = readQueryString(query.exchange)?.toUpperCase();
  if (!providerSymbol || !exchange) return undefined;
  if (providerSymbol.length > MAX_PAIR_IDENTITY_FIELD_LENGTH || exchange.length > MAX_PAIR_IDENTITY_FIELD_LENGTH) return undefined;
  if (!/^[A-Z0-9._-]+$/.test(providerSymbol) || !/^[A-Z0-9 &._-]+$/.test(exchange)) return undefined;
  const instrumentType = readQueryString(query.instrumentType)?.toLowerCase();
  const quoteCurrency = readQueryString(query.quoteCurrency)?.toUpperCase();
  if (quoteCurrency && !/^[A-Z0-9]{2,10}$/.test(quoteCurrency)) return undefined;
  return { providerSymbol, exchange, instrumentType, quoteCurrency };
};

const venueKindForExchange = (exchange: string): 'spot' | 'futures' | undefined => {
  const compact = exchange.replace(/[^A-Z0-9]/g, '');
  if (compact === 'BINANCE') return 'spot';
  if (compact === 'BINANCEFUTURES' || compact === 'BINANCEUSDM') return 'futures';
  return undefined;
};

/**
 * Confirms the supplied pair against the venue's own live market list (the same
 * cache the search route serves rows from). `unconfirmed` covers both "the pair
 * is not there / no longer trading" and "the list could not be fetched":
 * fail-closed means an identity that cannot be verified is never assumed from
 * the ticker.
 */
const confirmSuppliedVenuePair = async (pair: SuppliedVenuePair, symbol: string): Promise<VenuePairVerdict> => {
  const kind = venueKindForExchange(pair.exchange);
  if (!kind) return { status: 'not-applicable' };
  // A venue pair symbol has no separators on Binance; anything else is not a
  // claim this server can verify (e.g. a Yahoo `BTC-USD` row that happens to
  // name an exchange it does not trade on).
  if (!/^[A-Z0-9]{3,24}$/.test(pair.providerSymbol)) return { status: 'not-applicable' };
  const expectedInstrumentType = kind === 'spot' ? 'spot' : 'perpetual';
  if (pair.instrumentType && pair.instrumentType !== expectedInstrumentType) return { status: 'not-applicable' };
  const rows = await loadBinanceMarkets(kind);
  const row = rows.find(candidate => String(candidate.symbol || '').toUpperCase() === pair.providerSymbol);
  if (!row || String(row.status || '').toUpperCase() !== 'TRADING') return { status: 'unconfirmed' };
  const base = String(row.baseAsset || '').toUpperCase();
  const quote = String(row.quoteAsset || '').toUpperCase();
  if (!base || !quote) return { status: 'unconfirmed' };
  if (kind === 'spot' && !VERIFIABLE_SPOT_QUOTES.has(quote)) return { status: 'unconfirmed' };
  if (kind === 'futures' && (quote !== 'USDT' || String(row.contractType || '').toUpperCase() !== 'PERPETUAL')) {
    return { status: 'unconfirmed' };
  }
  if (pair.quoteCurrency && quote !== pair.quoteCurrency) return { status: 'unconfirmed' };
  // The venue pair must be this ticker's own pair: the URL symbol is the base
  // asset for spot rows and the pair itself for `.P` perpetual rows.
  const symbolWithoutPerp = symbol.replace(/\.P$/i, '');
  const isSameTicker = symbolWithoutPerp === base || (kind === 'futures' && symbolWithoutPerp === pair.providerSymbol);
  if (!isSameTicker) return { status: 'unconfirmed' };
  return { status: 'confirmed', baseSymbol: base, quoteCurrency: quote };
};

scannerRouter.get('/assets/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const requestedTimeframe = String(req.query.timeframe || '1w');
    const timeframe: Timeframe = (['1h', '4h', '8h', '1d', '1w', '1m'] as string[]).includes(requestedTimeframe)
      ? requestedTimeframe as Timeframe : '1w';
    const requestedClassRaw = String(req.query.marketClass || '');
    const requestedMarketClass: AssetMarketClass | undefined = requestedClassRaw === 'crypto' || requestedClassRaw === 'stocks' || requestedClassRaw === 'metals'
      ? requestedClassRaw
      : undefined;
    const appState = AppState.getInstance();

    const cryptoReference = {
      coinGeckoId: typeof req.query.coinGeckoId === 'string' ? req.query.coinGeckoId : undefined,
      coinPaprikaId: typeof req.query.coinPaprikaId === 'string' ? req.query.coinPaprikaId : undefined
    };
    // Optional exact venue identity of the clicked search row (additive, see
    // readSuppliedVenuePair). Undefined for every legacy deep link.
    const suppliedVenuePair = readSuppliedVenuePair(req.query as Record<string, unknown>);
    const isCryptoSpot = requestedMarketClass === 'crypto' && !symbol.includes('.') && !symbol.startsWith('TOTAL');
    const loadAggregated = (reference = cryptoReference) => aggregatedCryptoDetail(
      symbol, timeframe, reference, undefined, undefined,
      (assetSymbol, assetTimeframe, candles) => appState.moneyLine.calculateLatest(assetSymbol, assetTimeframe, candles)
    );
    const loadContractBoundDex = async () => {
      if (!isCryptoSpot || !cryptoReference.coinGeckoId || suppliedVenuePair) return null;
      try {
        const detail = await loadAggregated();
        const dex = detail.dexMarket;
        // An exact provider ID -> platform contract -> exact pool binding is
        // independent of a refused CEX ticker. Never accept sampled price data.
        return dex?.contractAddress && dex.candleSource === 'GeckoTerminal'
          && !dex.pairIsDust && dex.candles.length > 0 ? detail : null;
      } catch { return null; }
    };
    // Business-quality lookup is path-independent: both the aggregated and
    // the exchange response carry it so a resolver fallback never loses it.
    const computeBusinessQuality = async () => {
      try {
        const scan = await getCryptoCriteriaReport(false, false);
        const idNeedle = (cryptoReference.coinGeckoId || '').toLowerCase();
        const qualityAsset = scan?.assets?.find(entry => idNeedle && String(entry.coinGeckoId || entry.id).toLowerCase() === idNeedle)
          || scan?.assets?.find(entry => entry.symbol.toUpperCase() === symbol);
        const measured = Boolean(qualityAsset)
          && ((qualityAsset!.metrics.fees30d || 0) > 0 || (qualityAsset!.metrics.revenue30d || 0) > 0 || (qualityAsset!.metrics.holdersRevenue30d || 0) > 0);
        const readNarrativeTake = async (narrativeLanguage: 'ro' | 'en') => {
          const entry = await readPersistentAICache<AIContentTake>(`ai-content-business-quality-${symbol}-${narrativeLanguage}`);
          return entry && Date.now() - entry.updatedAt <= GUIDE_MAX_AGE_MS && isServableTake(entry.payload) ? entry.payload : undefined;
        };
        const [narrativeRo, narrativeEn] = await Promise.all([readNarrativeTake('ro'), readNarrativeTake('en')]);
        const narrative = narrativeRo || narrativeEn
          ? { ...(narrativeRo ? { ro: narrativeRo } : {}), ...(narrativeEn ? { en: narrativeEn } : {}) }
          : undefined;
        return {
          status: (!scan ? 'unavailable' : measured ? 'measured' : 'insufficient-data') as 'measured' | 'insufficient-data' | 'unavailable',
          ...(measured && qualityAsset ? { asset: qualityAsset } : {}),
          ...(narrative ? { narrative } : {})
        };
      } catch { return undefined; }
    };
    // Verify the provider's name as well as its ticker before selecting an
    // exchange route. Most catalog entries predate exact CoinGecko IDs.
    // Three verdicts, all of them explicit (F6/B4 philosophy: the ticker is
    // never resolved silently on behalf of an unverified exact identity):
    //   - identity bound    -> exchange route (candles + Money Line);
    //   - venue exists, not bound -> 503 fail-closed;
    //   - no verifiable venue at all -> honest aggregated (price-only) page.
    let identityEstablished = false;
    if (isCryptoSpot && (cryptoReference.coinPaprikaId || cryptoReference.coinGeckoId)) {
      // Provider record for the supplied exact ID. A CoinGecko rate limit
      // cannot authenticate identity, so a failed lookup is not a refusal by
      // itself: it only removes the provider-name evidence.
      let profile: Awaited<ReturnType<typeof cryptoMarketProfiles.resolve>> | null = null;
      try { profile = await cryptoMarketProfiles.resolve(symbol, cryptoReference); }
      catch (error) { if (!cryptoReference.coinGeckoId) throw error; }
      const catalog = TRADING_360_ASSETS.find(asset => asset.marketClass === 'crypto' && asset.symbol === symbol);
      const names = catalog ? [catalog.name, ...(catalog.aliases || []).filter(alias => alias.toUpperCase() !== symbol)] : [];
      const catalogNameMatches = Boolean(profile && names.some(name => name.trim().toLowerCase() === profile!.name.trim().toLowerCase()));
      // A catalog entry that carries its own exact ID must agree with the
      // supplied one (HYPE). An entry without an ID (the common case) is bound
      // by the provider name it has always been displayed under (BTC).
      const matchesCatalog = cryptoReference.coinGeckoId
        ? Boolean(catalog && (catalog.coinGeckoId ? catalog.coinGeckoId === cryptoReference.coinGeckoId : catalogNameMatches))
        : catalogNameMatches;
      // Live exchange-backed top list, read only when the catalog did not
      // already bind the identity. Its rows carry their own CoinGecko ID, which
      // is the strongest evidence available here: an equal ID settles the
      // identity even when the provider lookup was rate limited, a different ID
      // refuses it, and a row without an ID falls back to the name binding.
      const liveAsset = matchesCatalog ? undefined : await readLiveExchangeAsset(symbol);
      const liveIdentityMatches = Boolean(liveAsset) && (cryptoReference.coinGeckoId
        ? (liveAsset!.coinGeckoId
          ? liveAsset!.coinGeckoId === cryptoReference.coinGeckoId
          : liveNameMatches(profile?.name || '', liveAsset!.name || ''))
        : liveNameMatches(profile?.name || '', liveAsset!.name || ''));
      const matchesLive = Boolean(matchesCatalog || liveIdentityMatches);
      if (!matchesLive && cryptoReference.coinGeckoId) {
        // The independent exact-ID check in the chart resolver may still pin the
        // identity even when the provider lookup is rate limited.
        const verifiedMarket = await resolveExactChartMarket(symbol, cryptoReference.coinGeckoId);
        if (verifiedMarket?.candle) {
          identityEstablished = true;
        } else if (verifiedMarket || liveAsset) {
          // A candle venue for this ticker exists (a verified chart market
          // without a usable candle feed, or a live exchange-backed listing)
          // but the exact identity cannot be bound to it: refuse explicitly
          // instead of serving another coin's market or a silently degraded
          // page. Same 503 as the market-data fail-closed.
          const dexDetail = await loadContractBoundDex();
          if (dexDetail) return res.json({ ...dexDetail, businessQuality: await computeBusinessQuality() });
          return res.status(503).json({ error: 'Verified exchange candles unavailable for the selected coin.' });
        }
      }
      if (!matchesLive && !identityEstablished) {
        // No verifiable venue at all (a DEX-only coin like PONS): the honest
        // aggregated page, labelled 'aggregated-price-only' by the payload.
        return res.json({ ...(await loadAggregated()), businessQuality: await computeBusinessQuality() });
      }
      identityEstablished = true;
    }

    // The exact pair the search row carried is verified against the venue's own
    // live market list BEFORE any ticker-based resolution (F6/B4). A pair the
    // venue does not confirm (missing, delisted, quote/exchange mismatch, or a
    // list that could not be fetched at all) refuses the request explicitly -
    // the base ticker is never resolved silently on its behalf. A secondary
    // claim never vetoes an identity the provider ID already established, and
    // venues this server cannot verify (Yahoo/CoinGecko rows) plus requests
    // without these parameters keep the previous behaviour untouched.
    // A confirmed pair is forwarded to the market-data layer so the candles
    // come from that exact market (BTCEUR / CAKEBTC) instead of ${symbol}USDT.
    // The quote stays on the canonical USDT market: a EUR- or BTC-quoted series
    // is never rendered as a USDT price (the response marks non-USDT candle
    // pairs through `candlePair`).
    let routedVenuePair: VenuePairRouting | undefined;
    if (suppliedVenuePair) {
      const verdict = await confirmSuppliedVenuePair(suppliedVenuePair, symbol);
      if (verdict.status === 'unconfirmed' && !identityEstablished) {
        console.warn(`Unconfirmed venue pair identity for ${symbol}: ${suppliedVenuePair.exchange} ${suppliedVenuePair.providerSymbol}`);
        return res.status(503).json({ error: 'Verified exchange candles unavailable for the selected coin.' });
      }
      if (verdict.status === 'confirmed') {
        routedVenuePair = {
          providerSymbol: suppliedVenuePair.providerSymbol,
          exchange: suppliedVenuePair.exchange,
          instrumentType: 'spot',
          quoteCurrency: verdict.quoteCurrency
        };
      }
    }

    let assetInfo = TRADING_360_ASSETS.find(asset =>
      asset.symbol === symbol && (!requestedMarketClass || asset.marketClass === requestedMarketClass)
    );
    if (!assetInfo && requestedMarketClass === 'crypto' && !/\.P$/i.test(symbol)) {
      const liveCryptoAsset = (await appState.marketData.getTopCryptoAssets(80))
        .find(asset => asset.symbol.toUpperCase() === symbol);
      assetInfo = liveCryptoAsset || {
        symbol,
        name: `${symbol} Crypto`,
        category: 'Infrastructure',
        marketClass: 'crypto',
        quoteCurrency: 'USDT',
        aliases: [symbol.toLowerCase()],
        rank: 999,
        decimals: 6,
        exchange: 'BINANCE',
        instrumentType: 'spot',
        marketDataSource: 'binance_spot'
      };
    }
    if (!assetInfo && requestedMarketClass === 'stocks') {
      const yahooCandidates = await yahooSearchCandidates(symbol);
      const exactStock = rankSymbolSearchCandidates(symbol, yahooCandidates, 20)
        .find(candidate => candidate.marketClass === 'stocks' && candidate.isExact);
      if (exactStock) {
        assetInfo = {
          symbol,
          name: exactStock.name,
          category: 'Tech Stock',
          marketClass: 'stocks',
          quoteCurrency: exactStock.quoteCurrency || 'USD',
          aliases: [symbol.toLowerCase(), exactStock.name.toLowerCase()],
          rank: exactStock.rank || 999,
          decimals: 2,
          exchange: exactStock.exchange,
          instrumentType: exactStock.instrumentType || 'equity',
          marketDataSource: 'public_stock',
          providerSymbol: exactStock.providerSymbol || symbol
        } satisfies AssetInfo;
      }
    }
    // Dynamic Top 50 assets do not all exist in the hand-curated catalog.
    // Preserve their verified crypto class when opening a deep-dive/chart.
    if (!assetInfo) {
      const liveCryptoAsset = (await appState.marketData.getTopCryptoAssets(50))
        .find(asset => asset.symbol.toUpperCase() === symbol);
      if (liveCryptoAsset) assetInfo = liveCryptoAsset;
    }
    if (!assetInfo) {
      const isPerpetual = /\.P$/i.test(symbol);
      assetInfo = {
        symbol,
        name: isPerpetual ? `${symbol.replace(/\.P$/i, '')} / USDT Perpetual` : `${symbol} (TradingView Asset)`,
        category: isPerpetual ? 'Infrastructure' : (symbol.includes('.') || symbol === 'TOTAL' || symbol === 'DXY' ? 'Macro / Index' : 'Tech Stock'),
        marketClass: isPerpetual || symbol.includes('.D') || symbol.startsWith('TOTAL') ? 'crypto' : 'stocks',
        quoteCurrency: isPerpetual ? 'USDT' : (symbol.includes('.D') ? '%' : 'USD'),
        aliases: [symbol.toLowerCase()],
        rank: 999,
        decimals: 2,
        ...(isPerpetual ? {
          exchange: 'BINANCE Futures',
          instrumentType: 'perpetual' as const,
          marketDataSource: 'binance_futures' as const,
          providerSymbol: symbol.replace(/\.P$/i, '')
        } : {})
      };
    }

    if (requestedMarketClass === 'crypto' && cryptoReference.coinGeckoId) {
      assetInfo = { ...assetInfo, coinGeckoId: cryptoReference.coinGeckoId };
    }
    const resolvedMarketClass = requestedMarketClass || assetInfo.marketClass;
    // Live CoinGecko global rank overrides stale hardcoded catalog ranks
    // (catalog UNI said #145 while live rank is #28). Cached 5 min upstream.
    // Unknown stays 999 so the frontend hides the badge instead of guessing.
    if (assetInfo.marketClass === 'crypto' && !symbol.includes('.') && !symbol.startsWith('TOTAL')) {
      try {
        const liveRank = (await appState.marketData.getTopCryptoAssets(150))
          .find(asset => asset.symbol === symbol)?.rank;
        assetInfo = { ...assetInfo, rank: liveRank && liveRank > 0 && liveRank < 999 ? liveRank : 999 };
      } catch {
        assetInfo = { ...assetInfo, rank: 999 };
      }
    }
    // Crypto assets outside the hand-curated catalog and beyond the live
    // top-N windows carry no CoinGecko ID (e.g. CVX resolved as a "CVX
    // Crypto" stub), so the frontend fell back to a search URL that finds
    // nothing. Resolve the exact coin here once: the detail then carries a
    // direct CoinGecko link, the live market cap and the true rank. Missing
    // or ambiguous symbols keep the old search fallback.
    if (resolvedMarketClass === 'crypto' && !symbol.includes('.') && !symbol.startsWith('TOTAL') && !assetInfo.coinGeckoId) {
      try {
        // Shared tickers return several exact matches (CVX: Convex Finance
        // vs a tokenized Chevron stock). A single candidate is accepted
        // directly; with several, only a candidate whose provider name
        // matches a live exchange asset wins, so the link never silently
        // switches assets.
        const candidates = await cryptoMarketProfiles.resolveCandidates(symbol);
        let verified = candidates.length === 1 ? candidates[0] : undefined;
        if (!verified) {
          for (const candidate of candidates) {
            if (await matchesLiveExchangeAsset(symbol, candidate.name)) {
              verified = candidate;
              break;
            }
          }
        }
        if (verified) {
          assetInfo = {
            ...assetInfo,
            coinGeckoId: verified.id,
            ...(verified.marketCap ? { marketCap: verified.marketCap } : {}),
            rank: verified.rank && verified.rank > 0 && verified.rank < 999 ? verified.rank : assetInfo.rank
          };
        }
      } catch {
        // Unresolvable or unverifiable: keep the stub, UI uses the search link.
      }
    }
    let quote;
    try {
      quote = await appState.marketData.getPriceQuote(symbol, resolvedMarketClass, assetInfo.coinGeckoId);
    } catch (error) {
      // The market-data identity fail-closed ("No identity-verified candle
      // market", a broken chart-market pin) must surface as the explicit 503
      // refusal below, never as a silent price-only page. Any other crypto
      // spot failure keeps the aggregated (price-only) fallback, which the
      // payload labels 'aggregated-price-only'.
      const failureMessage = String((error as any)?.message || '');
      const identityRefusal = failureMessage.includes('No identity-verified candle market')
        || failureMessage.includes('Chart market pin');
      if (identityRefusal) {
        const dexDetail = await loadContractBoundDex();
        if (dexDetail) return res.json({ ...dexDetail, businessQuality: await computeBusinessQuality() });
        throw error;
      }
      if (resolvedMarketClass !== 'crypto' || symbol.includes('.') || symbol.startsWith('TOTAL')) throw error;
      return res.json(await loadAggregated({
        ...cryptoReference, coinGeckoId: cryptoReference.coinGeckoId || assetInfo.coinGeckoId
      }));
    }
    const loadCandles = async (requestedTimeframe: Timeframe, limit: number) => {
      try {
        return await appState.marketData.getCandles(
          symbol,
          requestedTimeframe,
          requestedTimeframe === timeframe ? 1500 : limit,
          resolvedMarketClass,
          assetInfo.coinGeckoId,
          routedVenuePair
        );
      } catch (error: any) {
        // One unavailable interval (common for recent IPOs on 1M) must not
        // invalidate the verified instrument or every other timeframe.
        console.warn(`Candles unavailable for ${symbol} ${requestedTimeframe}: ${error?.message || error}`);
        return [];
      }
    };

    const [candles1h, candles4h, candles8h, candles1d, candles1w, candles1m] = await Promise.all([
      loadCandles('1h', 500),
      loadCandles('4h', 500),
      loadCandles('8h', 500),
      loadCandles('1d', 500),
      loadCandles('1w', 300),
      loadCandles('1m', 150)
    ]);
    const candlesByTimeframe: Record<Timeframe, typeof candles1h> = {
      '1h': candles1h,
      '4h': candles4h,
      '8h': candles8h,
      '1d': candles1d,
      '1w': candles1w,
      '1m': candles1m
    };
    const activeCandles = candlesByTimeframe[timeframe];

    const signal1h = appState.moneyLine.calculateLatest(symbol, '1h', candles1h);
    const signal4h = appState.moneyLine.calculateLatest(symbol, '4h', candles4h);
    const signal8h = appState.moneyLine.calculateLatest(symbol, '8h', candles8h);
    const signal1d = appState.moneyLine.calculateLatest(symbol, '1d', candles1d);
    const signal1w = appState.moneyLine.calculateLatest(symbol, '1w', candles1w);
    const signal1m = appState.moneyLine.calculateLatest(symbol, '1m', candles1m);

    const mtfSummary = calculateMTFConfluence({
      '1h': signal1h || undefined,
      '4h': signal4h || undefined,
      '8h': signal8h || undefined,
      '1d': signal1d || undefined,
      '1w': signal1w || undefined,
      '1m': signal1m || undefined
    });

    const activeSignal = timeframe === '1h' ? signal1h : (
      timeframe === '4h' ? signal4h : (
        timeframe === '8h' ? signal8h : (
          timeframe === '1d' ? signal1d : (
            timeframe === '1w' ? signal1w : signal1m
          )
        )
      )
    );
    const news = process.env.NODE_ENV === 'test'
      ? appState.news.getCachedNewsForAsset(assetInfo)
      : await appState.news.getNewsForAsset(assetInfo);
    const xPosts = appState.social.getPostsForSymbol(symbol);
    const trendingTopics = appState.social.getTrendingTopics();

    let aiExplanation = null;
    if (activeSignal) {
      aiExplanation = await appState.ai.generateAssetExplanation(symbol, quote.price, activeSignal, trendingTopics, news, assetInfo?.marketClass);
    }

    // Instinct-authored per-asset investment guide (outbox contract, 36h
    // freshness). Undefined until the generation agent publishes one.
    const GUIDE_MAX_AGE_MS = 36 * 60 * 60_000;
    const readGuideTake = async (guideLanguage: 'ro' | 'en') => {
      const entry = await readPersistentAICache<AIContentTake>(`ai-content-investment-guide-${symbol}-${guideLanguage}`);
      return entry && Date.now() - entry.updatedAt <= GUIDE_MAX_AGE_MS && isServableTake(entry.payload) ? entry.payload : undefined;
    };
    const readProfileTake = async (profileLanguage: 'ro' | 'en') => {
      const entry = await readPersistentAICache<AIContentTake>(`ai-content-asset-profile-${symbol}-${profileLanguage}`);
      return entry && Date.now() - entry.updatedAt <= GUIDE_MAX_AGE_MS && isServableTake(entry.payload) ? entry.payload : undefined;
    };
    const [guideRo, guideEn, profileTakeRo, profileTakeEn] = await Promise.all([
      readGuideTake('ro'), readGuideTake('en'), readProfileTake('ro'), readProfileTake('en')
    ]);
    const investmentGuide = guideRo || guideEn
      ? { ...(guideRo ? { ro: guideRo } : {}), ...(guideEn ? { en: guideEn } : {}) }
      : undefined;
    const assetProfile = profileTakeRo || profileTakeEn
      ? { ...(profileTakeRo ? { ro: profileTakeRo } : {}), ...(profileTakeEn ? { en: profileTakeEn } : {}) }
      : undefined;

    // Business-quality card: 4-criteria numbers from the cached DefiLlama scan
    // plus the Instinct-authored revenue narrative (business-quality-<SYMBOL>).
    // Read-only: never triggers a rescan from an asset page load.
    const businessQuality = resolvedMarketClass === 'crypto' ? await computeBusinessQuality() : undefined;

    // Decision-relevant on-chain metrics (CoinGecko supply/ATH data plus
    // DefiLlama TVL/fees where the protocol is listed). Crypto only.
    const onchain = resolvedMarketClass === 'crypto' && assetInfo.coinGeckoId
      ? await onchainMetrics.forAsset(symbol, assetInfo.coinGeckoId).catch(() => undefined)
      : undefined;

    res.json({
      info: assetInfo,
      quote,
      activeTimeframe: timeframe,
      activeSignal,
      multiTimeframe: mtfSummary,
      candles: activeCandles,
      news,
      xPosts,
      xTrends: trendingTopics.filter(t => t.cashtag === `$${symbol}`),
      aiExplanation,
      investmentGuide,
      assetProfile,
      businessQuality,
      onchain,
      // Present only when the candles come from a confirmed pair quoted in
      // something other than the canonical USDT market, so the chart can label
      // its own series while the header quote stays USDT-labelled.
      ...(routedVenuePair && routedVenuePair.quoteCurrency !== 'USDT' ? { candlePair: routedVenuePair } : {}),
      lastUpdated: Date.now()
    });
  } catch (err: any) {
    if (String(err?.message || '').includes('No identity-verified candle market') || String(err?.message || '').includes('Chart market pin')) {
      return res.status(503).json({ error: 'Verified exchange candles unavailable for the selected coin.' });
    }
    res.status(500).json({ error: 'Failed to fetch asset detail', details: err.message });
  }
});
