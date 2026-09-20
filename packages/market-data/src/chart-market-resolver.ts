import { AssetMarketDataSource } from '@money-scanner/shared';

/**
 * Deterministic chart-market resolver.
 *
 * For a crypto base symbol (GRASS, not GRASSUSDT.P) it checks which major
 * exchanges list the asset (Binance spot/futures, Bybit, OKX, Coinbase,
 * Kraken, Hyperliquid), probes listing start and 24h quote volume, and picks:
 *  - the candle source (only exchanges with a local candle adapter), and
 *  - the TradingView symbol for the external chart tab and deep link.
 *
 * Binance spot short-circuits (user preference: Binance first, and it almost
 * always has the longest history). No candidate -> null, so callers degrade
 * gracefully instead of showing TradingView's "symbol doesn't exist".
 */

export interface ChartMarketCandidate {
  source: AssetMarketDataSource;
  exchange: string;
  /** Pair/ticker the local adapter or exchange expects (GRASSUSDT, GRASS-USDT, GRASS-USD, GRASSUSD, GRASS). */
  providerSymbol: string;
  tvSymbol: string | null;
  quoteCurrency: string;
  listingStart: number | null;
  volume24hQuote: number | null;
  candleCapable: boolean;
}

export interface ChartMarketResolution {
  symbol: string;
  /** Best candle-capable market, when one exists. */
  candle: ChartMarketCandidate | null;
  /** Best TradingView market, when one exists. */
  tv: ChartMarketCandidate | null;
  candidates: ChartMarketCandidate[];
  resolvedAt: number;
}

export interface ChartMarketResolverDeps {
  isOnBinanceSpot(base: string): Promise<boolean>;
  binanceSpotFirstDailyTs(base: string): Promise<number | null>;
  isOnBinanceFutures(base: string): Promise<boolean>;
  binanceFuturesFirstDailyTs(base: string): Promise<number | null>;
  binanceFuturesQuoteVolume24h(base: string): Promise<number | null>;
  isOnBybitSpot(base: string): Promise<boolean>;
  bybitFirstDailyTs(base: string): Promise<number | null>;
  bybitQuoteVolume24h(base: string): Promise<number | null>;
  okxSpotInstrument(base: string): Promise<{ instId: string; listTime: number | null } | null>;
  okxQuoteVolume24h(instId: string): Promise<number | null>;
  isOnHyperliquid(base: string): Promise<boolean>;
  hyperliquidFirstDailyTs(base: string): Promise<number | null>;
  hyperliquidQuoteVolume24h(base: string): Promise<number | null>;
  isOnCoinbase(base: string): Promise<boolean>;
  coinbaseFirstDailyTs(base: string): Promise<number | null>;
  coinbaseQuoteVolume24h(base: string): Promise<number | null>;
  isOnKraken(base: string): Promise<boolean>;
  krakenFirstDailyTs(base: string): Promise<number | null>;
  krakenQuoteVolume24h(base: string): Promise<number | null>;
}

const PREFERENCE: AssetMarketDataSource[] = [
  'binance_spot',
  'bybit_spot',
  'okx_spot',
  'binance_futures',
  'coinbase',
  'kraken',
  'hyperliquid'
];

/** Listing dates this close are decided by 24h quote volume instead. */
const TIE_WINDOW_MS = 7 * 24 * 3_600_000;
const RESOLUTION_TTL_MS = 12 * 3_600_000;
const NEGATIVE_TTL_MS = 3_600_000;

export class ChartMarketResolver {
  private deps: ChartMarketResolverDeps;
  private cache = new Map<string, { resolution: ChartMarketResolution | null; expiresAt: number }>();

  constructor(deps: ChartMarketResolverDeps) {
    this.deps = deps;
  }

  private preferenceIndex(source: AssetMarketDataSource): number {
    const index = PREFERENCE.indexOf(source);
    return index === -1 ? PREFERENCE.length : index;
  }

  private rank(candidates: ChartMarketCandidate[]): ChartMarketCandidate[] {
    return [...candidates].sort((a, b) => {
      const aStart = a.listingStart ?? Number.POSITIVE_INFINITY;
      const bStart = b.listingStart ?? Number.POSITIVE_INFINITY;
      if (aStart !== bStart) {
        if (aStart === Number.POSITIVE_INFINITY) return 1;
        if (bStart === Number.POSITIVE_INFINITY) return -1;
        if (Math.abs(aStart - bStart) > TIE_WINDOW_MS) return aStart - bStart;
      }
      const aVol = a.volume24hQuote ?? -1;
      const bVol = b.volume24hQuote ?? -1;
      if (aVol !== bVol) return bVol - aVol;
      return this.preferenceIndex(a.source) - this.preferenceIndex(b.source);
    });
  }

  private async safe<T>(probe: Promise<T>): Promise<T | null> {
    try {
      return await probe;
    } catch {
      return null;
    }
  }

  /** Full multi-exchange resolution for a crypto base symbol. Null when nothing lists it. */
  public async resolve(rawSymbol: string): Promise<ChartMarketResolution | null> {
    const symbol = rawSymbol.toUpperCase().trim();
    if (!symbol || symbol.includes(':') || symbol.includes('.') || !/^[A-Z0-9]+$/.test(symbol)) return null;

    const cached = this.cache.get(symbol);
    if (cached && cached.expiresAt > Date.now()) return cached.resolution;

    const resolution = await this.computeResolution(symbol);
    this.cache.set(symbol, {
      resolution,
      expiresAt: Date.now() + (resolution ? RESOLUTION_TTL_MS : NEGATIVE_TTL_MS)
    });
    return resolution;
  }

  private async computeResolution(symbol: string): Promise<ChartMarketResolution | null> {
    // Binance spot short-circuit: user preference and almost always the longest book.
    if (await this.safe(this.deps.isOnBinanceSpot(symbol))) {
      const candidate: ChartMarketCandidate = {
        source: 'binance_spot',
        exchange: 'BINANCE',
        providerSymbol: `${symbol}USDT`,
        tvSymbol: `BINANCE:${symbol}USDT`,
        quoteCurrency: 'USDT',
        listingStart: await this.safe(this.deps.binanceSpotFirstDailyTs(symbol)),
        volume24hQuote: null,
        candleCapable: true
      };
      return { symbol, candle: candidate, tv: candidate, candidates: [candidate], resolvedAt: Date.now() };
    }

    const [onFutures, onBybit, okxInstrument, onHyperliquid, onCoinbase, onKraken] = await Promise.all([
      this.safe(this.deps.isOnBinanceFutures(symbol)),
      this.safe(this.deps.isOnBybitSpot(symbol)),
      this.safe(this.deps.okxSpotInstrument(symbol)),
      this.safe(this.deps.isOnHyperliquid(symbol)),
      this.safe(this.deps.isOnCoinbase(symbol)),
      this.safe(this.deps.isOnKraken(symbol))
    ]);

    const candidates: ChartMarketCandidate[] = [];
    if (onFutures) {
      candidates.push({
        source: 'binance_futures',
        exchange: 'BINANCE Futures',
        providerSymbol: `${symbol}USDT`,
        tvSymbol: `BINANCE:${symbol}USDT.P`,
        quoteCurrency: 'USDT',
        listingStart: null,
        volume24hQuote: null,
        candleCapable: true
      });
    }
    if (onBybit) {
      candidates.push({
        source: 'bybit_spot',
        exchange: 'BYBIT',
        providerSymbol: `${symbol}USDT`,
        tvSymbol: `BYBIT:${symbol}USDT`,
        quoteCurrency: 'USDT',
        listingStart: null,
        volume24hQuote: null,
        candleCapable: true
      });
    }
    if (okxInstrument) {
      candidates.push({
        source: 'okx_spot',
        exchange: 'OKX',
        providerSymbol: okxInstrument.instId,
        tvSymbol: `OKX:${symbol}USDT`,
        quoteCurrency: 'USDT',
        listingStart: okxInstrument.listTime,
        volume24hQuote: null,
        candleCapable: true
      });
    }
    if (onCoinbase) {
      candidates.push({
        source: 'coinbase',
        exchange: 'COINBASE',
        providerSymbol: `${symbol}-USD`,
        tvSymbol: `COINBASE:${symbol}USD`,
        quoteCurrency: 'USD',
        listingStart: null,
        volume24hQuote: null,
        candleCapable: false
      });
    }
    if (onKraken) {
      candidates.push({
        source: 'kraken',
        exchange: 'KRAKEN',
        providerSymbol: `${symbol}USD`,
        tvSymbol: `KRAKEN:${symbol}USD`,
        quoteCurrency: 'USD',
        listingStart: null,
        volume24hQuote: null,
        candleCapable: false
      });
    }
    if (onHyperliquid) {
      candidates.push({
        source: 'hyperliquid',
        exchange: 'HYPERLIQUID',
        providerSymbol: symbol,
        tvSymbol: null,
        quoteCurrency: 'USDC',
        listingStart: null,
        volume24hQuote: null,
        candleCapable: true
      });
    }

    if (candidates.length === 0) return null;

    // Fill listing starts in parallel.
    await Promise.all(candidates.map(async candidate => {
      if (candidate.listingStart !== null) return;
      switch (candidate.source) {
        case 'binance_futures':
          candidate.listingStart = await this.safe(this.deps.binanceFuturesFirstDailyTs(symbol));
          break;
        case 'bybit_spot':
          candidate.listingStart = await this.safe(this.deps.bybitFirstDailyTs(symbol));
          break;
        case 'coinbase':
          candidate.listingStart = await this.safe(this.deps.coinbaseFirstDailyTs(symbol));
          break;
        case 'kraken':
          candidate.listingStart = await this.safe(this.deps.krakenFirstDailyTs(symbol));
          break;
        case 'hyperliquid':
          candidate.listingStart = await this.safe(this.deps.hyperliquidFirstDailyTs(symbol));
          break;
        default:
          break;
      }
    }));

    // Fill 24h quote volume only where the tie window needs it: fetch for all
    // candidates that could tie with the earliest listing.
    const knownStarts = candidates.map(c => c.listingStart).filter((v): v is number => typeof v === 'number');
    const earliest = knownStarts.length ? Math.min(...knownStarts) : null;
    await Promise.all(candidates.map(async candidate => {
      const needsVolume = earliest === null
        || candidate.listingStart === null
        || Math.abs(candidate.listingStart - earliest) <= TIE_WINDOW_MS;
      if (!needsVolume) return;
      switch (candidate.source) {
        case 'binance_futures':
          candidate.volume24hQuote = await this.safe(this.deps.binanceFuturesQuoteVolume24h(symbol));
          break;
        case 'bybit_spot':
          candidate.volume24hQuote = await this.safe(this.deps.bybitQuoteVolume24h(symbol));
          break;
        case 'okx_spot':
          candidate.volume24hQuote = await this.safe(this.deps.okxQuoteVolume24h(candidate.providerSymbol));
          break;
        case 'coinbase':
          candidate.volume24hQuote = await this.safe(this.deps.coinbaseQuoteVolume24h(symbol));
          break;
        case 'kraken':
          candidate.volume24hQuote = await this.safe(this.deps.krakenQuoteVolume24h(symbol));
          break;
        case 'hyperliquid':
          candidate.volume24hQuote = await this.safe(this.deps.hyperliquidQuoteVolume24h(symbol));
          break;
        default:
          break;
      }
    }));

    const ranked = this.rank(candidates);
    const candle = ranked.find(c => c.candleCapable) || null;
    const tv = ranked.find(c => c.tvSymbol) || null;
    return { symbol, candle, tv, candidates: ranked, resolvedAt: Date.now() };
  }
}
