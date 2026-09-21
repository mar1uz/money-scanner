import { Router } from 'express';
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
import { aggregatedCryptoDetail, cryptoMarketProfiles } from '../services/crypto-market-profile.js';

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
const searchResponseCache = new Map<string, { payload: ReturnType<typeof rankSymbolSearchCandidates>; expiresAt: number }>();

const normalizeProviderName = (value: string) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Bubble and Heat Map deep links pass exact provider IDs, bypassing the
// symbol-only scanner route. When such a coin is missing from the static
// catalog, keep deep-dive parity with Market Scanner clicks: a name-verified
// match in the live exchange-backed top list continues on the standard
// exchange route (candles + Money Line) instead of degrading to the
// price-only aggregator page.
const matchesLiveExchangeAsset = async (symbol: string, providerName: string): Promise<boolean> => {
  const profileName = normalizeProviderName(providerName);
  if (!profileName) return false;
  try {
    const liveAsset = (await AppState.getInstance().marketData.getTopCryptoAssets(150))
      .find(asset => asset.symbol.toUpperCase() === symbol);
    const liveName = normalizeProviderName(liveAsset?.name || '');
    if (!liveName) return false;
    return liveName === profileName
      || (profileName.length >= 4 && liveName.includes(profileName))
      || (liveName.length >= 4 && profileName.includes(liveName));
  } catch {
    return false;
  }
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
  const url = kind === 'spot'
    ? 'https://api.binance.com/api/v3/exchangeInfo'
    : 'https://fapi.binance.com/fapi/v1/exchangeInfo';
  const payload = await fetchJson<{ symbols?: BinanceMarketRow[] }>(url);
  const rows = payload?.symbols || current?.rows || [];
  const cache = { rows, expiresAt: Date.now() + 15 * 60_000 };
  if (kind === 'spot') binanceSpotCache = cache;
  else binanceFuturesCache = cache;
  return rows;
};

const binanceSearchCandidates = async (): Promise<SymbolSearchCandidate[]> => {
  const [spotRows, futuresRows] = await Promise.all([
    loadBinanceMarkets('spot'),
    loadBinanceMarkets('futures')
  ]);
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
  const payload = await fetchJson<{ coins?: Array<{
    id?: string;
    name?: string;
    symbol?: string;
    market_cap_rank?: number | null;
  }> }>(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`, 3_500);
  return (payload?.coins || []).slice(0, 25).flatMap<SymbolSearchCandidate>(coin => {
    const symbol = String(coin.symbol || '').toUpperCase();
    if (!symbol || !coin.name || !coin.id) return [];
    return [{
      symbol,
      displaySymbol: symbol,
      name: coin.name,
      category: 'Crypto Asset',
      marketClass: 'crypto',
      exchange: 'COINGECKO',
      instrumentType: 'spot',
      quoteCurrency: 'USD',
      aliases: [coin.id, coin.name, symbol],
      coinGeckoId: coin.id,
      rank: coin.market_cap_rank || undefined,
      verified: true,
      matchType: 'coingecko'
    }];
  });
};

scannerRouter.get('/search', async (req, res) => {
  try {
    const rawQuery = (req.query.q as string || '').trim();
    if (!rawQuery) return res.json([]);
    const cacheKey = rawQuery.toLowerCase();
    const cached = searchResponseCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return res.json(cached.payload);

    const localCandidates = catalogToSearchCandidates(TRADING_360_ASSETS);
    const [binance, yahoo, coinGecko] = await Promise.all([
      binanceSearchCandidates(),
      yahooSearchCandidates(rawQuery),
      coinGeckoSearchCandidates(rawQuery)
    ]);
    const candidates = [...localCandidates, ...binance, ...yahoo, ...coinGecko];
    let results = rankSymbolSearchCandidates(rawQuery, candidates, 60);

    // A direct result is a last-resort attempt, never an invented stock. It is
    // only shown when no verified provider/catalog candidate matched.
    if (!results.length) {
      const parsed = parseSymbolSearchQuery(rawQuery);
      if (/^[A-Z0-9.^=-]{1,24}$/.test(parsed.text.toUpperCase())) {
        const directSymbol = parsed.perpetual ? `${parsed.compact}.P` : parsed.compact;
        results = rankSymbolSearchCandidates(rawQuery, [{
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
    res.set('Cache-Control', 'private, max-age=15');
    res.json(enriched);
  } catch (err: any) {
    res.status(500).json({ error: 'Search failed', details: err.message });
  }
});

// Cache warmer, driven by Cloud Scheduler (every minute). Keeps the instance's
// quote/candle caches hot so user-facing requests always compute from warm
// data - responses elsewhere stay freshly computed on every request.
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
    let rows = await appState.refreshSignals(
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

    const candles = await AppState.getInstance().marketData.getCandlesBefore(
      symbol,
      requestedTimeframe as Timeframe,
      before,
      limit,
      requestedMarketClass
    );

    res.json({
      candles,
      hasMore: candles.length > 0,
      oldestTimestamp: candles[0]?.timestamp || null
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
    const resolution = await AppState.getInstance().marketData.resolveChartMarket(symbol);
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
    const isCryptoSpot = requestedMarketClass === 'crypto' && !symbol.includes('.') && !symbol.startsWith('TOTAL');
    const loadAggregated = (reference = cryptoReference) => aggregatedCryptoDetail(
      symbol, timeframe, reference, undefined, undefined,
      (assetSymbol, assetTimeframe, candles) => appState.moneyLine.calculateLatest(assetSymbol, assetTimeframe, candles)
    );
    // Verify the provider's name as well as its ticker before selecting an
    // exchange route. Most catalog entries predate exact CoinGecko IDs.
    if (isCryptoSpot && (cryptoReference.coinPaprikaId || cryptoReference.coinGeckoId)) {
      const profile = await cryptoMarketProfiles.resolve(symbol, cryptoReference);
      const catalog = TRADING_360_ASSETS.find(asset => asset.marketClass === 'crypto' && asset.symbol === symbol);
      const names = catalog ? [catalog.name, ...(catalog.aliases || []).filter(alias => alias.toUpperCase() !== symbol)] : [];
      const matchesCatalog = catalog?.coinGeckoId && cryptoReference.coinGeckoId
        ? catalog.coinGeckoId === cryptoReference.coinGeckoId
        : names.some(name => name.trim().toLowerCase() === profile.name.trim().toLowerCase());
      if (!matchesCatalog && !(await matchesLiveExchangeAsset(symbol, profile.name))) {
        return res.json(await loadAggregated());
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
        const profile = await cryptoMarketProfiles.resolve(symbol, {});
        assetInfo = {
          ...assetInfo,
          coinGeckoId: profile.id,
          ...(profile.marketCap ? { marketCap: profile.marketCap } : {}),
          rank: profile.rank && profile.rank > 0 && profile.rank < 999 ? profile.rank : assetInfo.rank
        };
      } catch {
        // Unresolvable or ambiguous: keep the stub, UI uses the search link.
      }
    }
    let quote;
    try {
      quote = await appState.marketData.getPriceQuote(symbol, resolvedMarketClass);
    } catch (error) {
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
          resolvedMarketClass
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
      aiExplanation = await appState.ai.generateAssetExplanation(symbol, quote.price, activeSignal, trendingTopics, news);
    }

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
      lastUpdated: Date.now()
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch asset detail', details: err.message });
  }
});
