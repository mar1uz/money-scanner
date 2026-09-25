import { AssetMarketDataSource } from '@money-scanner/shared';

/** Resolves a verified crypto identity to a stable market for candles and chart links. */
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
  /** CoinGecko verified this exchange/spot pair belongs to the requested coin ID. */
  identityVerified?: boolean;
  lastPrice?: number | null;
}

export interface ChartMarketResolution {
  symbol: string;
  coinGeckoId: string;
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
  /** XT spot is admitted only after exact CoinGecko ID and exchange mint verification. */
  isOnXtSpot?(base: string, coinId: string): Promise<boolean>;
  xtFirstDailyTs?(base: string): Promise<number | null>;
  xtQuoteVolume24h?(base: string): Promise<number | null>;
  /** MEXC spot has a candle adapter; other smaller venues are chart-only. */
  isOnMexcSpot?(base: string): Promise<boolean>;
  mexcFirstDailyTs?(base: string): Promise<number | null>;
  mexcQuoteVolume24h?(base: string): Promise<number | null>;
  /** Exact CoinGecko market + base + target pairs, including known asset genesis and reference price. */
  verifiedIdentity?(base: string, coinId: string): Promise<{ markets: Set<string>; referencePrice: number | null; knownStart: number | null } | null>;
  /** Provider quote for sanity-checking the selected candle market. */
  candidateLastPrice?(candidate: ChartMarketCandidate): Promise<number | null>;
  isOnGateSpot?(base: string): Promise<boolean>;
  isOnBitgetSpot?(base: string): Promise<boolean>;
  isOnKucoinSpot?(base: string): Promise<boolean>;
}

const PREFERENCE: AssetMarketDataSource[] = [
  'binance_spot',
  'bybit_spot',
  'okx_spot',
  'binance_futures',
  'coinbase',
  'kraken',
  'hyperliquid',
  'mexc_spot',
  'xt_spot',
  'gate_spot',
  'bitget_spot',
  'kucoin_spot'
];

/** Listing dates this close are decided by 24h quote volume instead. */
const TIE_WINDOW_MS = 7 * 24 * 3_600_000;
const RESOLUTION_TTL_MS = 12 * 3_600_000;
const NEGATIVE_TTL_MS = 3_600_000;

export class ChartMarketResolver {
  private deps: ChartMarketResolverDeps;
  private cache = new Map<string, { resolution: ChartMarketResolution | null; expiresAt: number }>();
  private pinned = new Map<string, ChartMarketResolution>();
  private inFlight = new Map<string, Promise<ChartMarketResolution | null>>();
  /** A store survives Cloud Run instances; a failed store read never permits an unverified switch. */
  private store?: { get(key: string): Promise<ChartMarketResolution | null>; set(key: string, value: ChartMarketResolution): Promise<void> };
  public setStore(store: { get(key: string): Promise<ChartMarketResolution | null>; set(key: string, value: ChartMarketResolution): Promise<void> }) { this.store = store; }

  constructor(deps: ChartMarketResolverDeps) {
    this.deps = deps;
  }

  private preferenceIndex(source: AssetMarketDataSource): number {
    const index = PREFERENCE.indexOf(source);
    return index === -1 ? PREFERENCE.length : index;
  }

  private rank(candidates: ChartMarketCandidate[], knownStart: number | null): ChartMarketCandidate[] {
    const verified = candidates.filter(candidate => candidate.identityVerified);
    if (!verified.length) return [];
    const oldest = Math.min(...verified.map(candidate => candidate.listingStart ?? Number.POSITIVE_INFINITY));
    const startLimit = knownStart ?? (Number.isFinite(oldest) ? oldest : null);
    const withCoverage = verified.filter(candidate => {
      if (!startLimit || !candidate.listingStart) return true;
      const total = Date.now() - startLimit;
      if (total <= 0) return true;
      const coverage = Math.max(0, (Date.now() - candidate.listingStart) / total);
      const bestCoverage = Math.max(...verified.map(other => other.listingStart ? Math.max(0, (Date.now() - other.listingStart) / total) : 0));
      return coverage >= .5 || bestCoverage <= .5;
    });
    const eligible = withCoverage.length ? withCoverage : verified;
    return [...eligible].sort((a, b) => {
      const aStart = a.listingStart ?? Number.POSITIVE_INFINITY;
      const bStart = b.listingStart ?? Number.POSITIVE_INFINITY;
      if (Number.isFinite(aStart) !== Number.isFinite(bStart)) return Number.isFinite(aStart) ? -1 : 1;
      if (Number.isFinite(aStart) && Number.isFinite(bStart) && Math.abs(aStart - bStart) > TIE_WINDOW_MS) return aStart - bStart;
      const aSpot = a.source === 'binance_futures' || a.source === 'hyperliquid' ? 0 : 1;
      const bSpot = b.source === 'binance_futures' || b.source === 'hyperliquid' ? 0 : 1;
      if (aSpot !== bSpot) return bSpot - aSpot;
      if ((a.volume24hQuote ?? -1) !== (b.volume24hQuote ?? -1)) return (b.volume24hQuote ?? -1) - (a.volume24hQuote ?? -1);
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
  public async resolve(rawSymbol: string, coinId?: string): Promise<ChartMarketResolution | null> {
    const symbol = rawSymbol.toUpperCase().trim();
    if (!symbol || symbol.includes(':') || symbol.includes('.') || !/^[A-Z0-9]+$/.test(symbol)) return null;
    const key = `${symbol}:${coinId || ''}`;
    const existing = this.inFlight.get(key);
    if (existing) return existing;
    const pending = this.resolveOne(key, symbol, coinId);
    this.inFlight.set(key, pending);
    try { return await pending; } finally { this.inFlight.delete(key); }
  }

  private async resolveOne(key: string, symbol: string, coinId?: string): Promise<ChartMarketResolution | null> {
    // Never resolve a ticker without an independently supplied exact identity.
    if (!coinId || !/^[a-z0-9-]{2,100}$/.test(coinId) || !this.deps.verifiedIdentity) return null;
    // A store outage must not let another instance silently choose a new source.
    const pin = this.pinned.get(key) || (this.store ? await this.store.get(key) : null);
    if (pin) {
      if (pin.symbol !== symbol || pin.coinGeckoId !== coinId || ![pin.candle, pin.tv].filter(Boolean).every(candidate => candidate!.identityVerified)) {
        throw new Error('Chart market pin identity mismatch');
      }
      this.pinned.set(key, pin);
      return pin;
    }
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.resolution;
    const resolution = await this.computeResolution(symbol, coinId);
    if (resolution && this.store) {
      try { await this.store.set(key, resolution); }
      catch {
        // Firestore create is atomic: another instance may have won this race.
        const winner = await this.store.get(key);
        if (winner) {
          if (winner.symbol !== symbol || winner.coinGeckoId !== coinId || ![winner.candle, winner.tv].filter(Boolean).every(candidate => candidate!.identityVerified)) {
            throw new Error('Chart market pin identity mismatch');
          }
          this.pinned.set(key, winner);
          return winner;
        }
        throw new Error('Chart market pin write failed');
      }
      this.pinned.set(key, resolution);
    } else if (resolution) this.pinned.set(key, resolution);
    this.cache.set(key, { resolution, expiresAt: Date.now() + (resolution ? RESOLUTION_TTL_MS : NEGATIVE_TTL_MS) });
    return resolution;
  }

  private async computeResolution(symbol: string, coinId: string): Promise<ChartMarketResolution | null> {
    const identity = await this.safe(this.deps.verifiedIdentity!(symbol, coinId));
    if (!identity?.markets.size) return null;
    const candidates: ChartMarketCandidate[] = [];
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
      candidates.push(candidate);
    }

    const [onFutures, onBybit, okxInstrument, onHyperliquid, onCoinbase, onKraken, onMexc, onXt, onGate, onBitget, onKucoin] = await Promise.all([
      this.safe(this.deps.isOnBinanceFutures(symbol)),
      this.safe(this.deps.isOnBybitSpot(symbol)),
      this.safe(this.deps.okxSpotInstrument(symbol)),
      this.safe(this.deps.isOnHyperliquid(symbol)),
      this.safe(this.deps.isOnCoinbase(symbol)),
      this.safe(this.deps.isOnKraken(symbol)),
      this.deps.isOnMexcSpot ? this.safe(this.deps.isOnMexcSpot(symbol)) : Promise.resolve(null),
      this.deps.isOnXtSpot ? this.safe(this.deps.isOnXtSpot(symbol, coinId)) : Promise.resolve(null),
      this.deps.isOnGateSpot ? this.safe(this.deps.isOnGateSpot(symbol)) : Promise.resolve(null),
      this.deps.isOnBitgetSpot ? this.safe(this.deps.isOnBitgetSpot(symbol)) : Promise.resolve(null),
      this.deps.isOnKucoinSpot ? this.safe(this.deps.isOnKucoinSpot(symbol)) : Promise.resolve(null)
    ]);

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
    if (onMexc) {
      candidates.push({
        source: 'mexc_spot',
        exchange: 'MEXC',
        providerSymbol: `${symbol}USDT`,
        tvSymbol: `MEXC:${symbol}USDT`,
        quoteCurrency: 'USDT',
        listingStart: null,
        volume24hQuote: null,
        candleCapable: true
      });
    }
    if (onXt) candidates.push({ source: 'xt_spot', exchange: 'XT.COM', providerSymbol: `${symbol.toLowerCase()}_usdt`, tvSymbol: `XTCOM:${symbol}USDT`, quoteCurrency: 'USDT', listingStart: null, volume24hQuote: null, candleCapable: true });
    if (onGate) {
      candidates.push({
        source: 'gate_spot',
        exchange: 'GATE',
        providerSymbol: `${symbol}_USDT`,
        tvSymbol: `GATE:${symbol}USDT`,
        quoteCurrency: 'USDT',
        listingStart: null,
        volume24hQuote: null,
        candleCapable: false
      });
    }
    if (onBitget) {
      candidates.push({
        source: 'bitget_spot',
        exchange: 'BITGET',
        providerSymbol: `${symbol}USDT`,
        tvSymbol: `BITGET:${symbol}USDT`,
        quoteCurrency: 'USDT',
        listingStart: null,
        volume24hQuote: null,
        candleCapable: false
      });
    }
    if (onKucoin) {
      candidates.push({
        source: 'kucoin_spot',
        exchange: 'KUCOIN',
        providerSymbol: `${symbol}-USDT`,
        tvSymbol: `KUCOIN:${symbol}USDT`,
        quoteCurrency: 'USDT',
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
        case 'xt_spot':
          candidate.listingStart = this.deps.xtFirstDailyTs ? await this.safe(this.deps.xtFirstDailyTs(symbol)) : null;
          break;
        case 'mexc_spot':
          candidate.listingStart = this.deps.mexcFirstDailyTs ? await this.safe(this.deps.mexcFirstDailyTs(symbol)) : null;
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
        case 'xt_spot':
          candidate.volume24hQuote = this.deps.xtQuoteVolume24h ? await this.safe(this.deps.xtQuoteVolume24h(symbol)) : null;
          break;
        case 'mexc_spot':
          candidate.volume24hQuote = this.deps.mexcQuoteVolume24h ? await this.safe(this.deps.mexcQuoteVolume24h(symbol)) : null;
          break;
        case 'hyperliquid':
          candidate.volume24hQuote = await this.safe(this.deps.hyperliquidQuoteVolume24h(symbol));
          break;
        default:
          break;
      }
    }));

    const verified = candidates.filter(candidate => {
      const market = candidate.source === 'binance_futures' ? 'binance_futures' : candidate.source;
      candidate.identityVerified = identity.markets.has(market);
      return candidate.identityVerified;
    });
    await Promise.all(verified.map(async candidate => {
      candidate.lastPrice = this.deps.candidateLastPrice ? await this.safe(this.deps.candidateLastPrice(candidate)) : null;
    }));
    const priceSafe = verified.filter(candidate => identity.referencePrice && candidate.lastPrice
      ? Math.abs(candidate.lastPrice / identity.referencePrice - 1) <= .05 : true);
    const ranked = this.rank(priceSafe, identity.knownStart);
    const candle = ranked.find(c => c.candleCapable) || null;
    const tv = ranked.find(c => c.tvSymbol) || null;
    if (!candle && !tv) return null;
    return { symbol, coinGeckoId: coinId, candle, tv, candidates: ranked, resolvedAt: Date.now() };
  }
}
