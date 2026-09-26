import { AssetMarketDataSource } from '@money-scanner/shared';
import {
  beginResolutionScope,
  finalizeResolution,
  recordPinHealth,
  recordProbeCall,
  recordProbeFailure,
  runInResolutionScope
} from './chart-market-diagnostics.js';

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

/**
 * Pin lifecycle audit, written next to a stored resolution. Every field is
 * optional so documents created before this field existed stay valid.
 */
export interface ChartMarketPinAudit {
  /** Last time the pin was checked against the venue's live listing. */
  lastCheckedAt?: number;
  /** Pin health at `lastCheckedAt`. */
  health?: 'healthy' | 'unverified' | 'dead';
  /** Machine-readable reason for the health state (`resolved`, `pair-listed`, `repinned-after-delisting`, ...). */
  reason?: string;
  /** Consecutive failed listing checks since the last healthy result. */
  failedChecks?: number;
  /** When a dead pin was replaced by a fresh resolution. */
  repinnedAt?: number;
  /** Candle source of the pin that was replaced during a heal. */
  previousCandleSource?: AssetMarketDataSource | null;
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
  /** Pin lifecycle audit (absent on legacy documents and on older resolutions). */
  audit?: ChartMarketPinAudit;
}

export interface ChartMarketPinStore {
  get(key: string): Promise<ChartMarketResolution | null>;
  /** create-if-absent: throws when the document already exists (cross-instance race gate). */
  set(key: string, value: ChartMarketResolution): Promise<void>;
  /**
   * Optional. Persists a re-validated (healed) pin. `expected.resolvedAt`
   * guards the write: when another instance already healed the pin this
   * becomes a no-op and the currently stored resolution is returned instead.
   */
  replace?(key: string, value: ChartMarketResolution, expected: { resolvedAt: number }): Promise<ChartMarketResolution | null>;
  /** Optional. Small merge write for audit-only updates (never touches candidates). */
  mergeAudit?(key: string, audit: ChartMarketPinAudit): Promise<void>;
  /** Optional. Read-only enumeration for the ops diagnostics route. */
  list?(): Promise<Array<{ key: string; resolution: ChartMarketResolution }>>;
}

export interface ChartMarketResolverDeps {
  isOnBinanceSpot(base: string): Promise<boolean>;
  binanceSpotFirstDailyTs(base: string): Promise<number | null>;
  /** Spot quote volume, probed only for candidates inside the listing tie window. */
  binanceSpotQuoteVolume24h?(base: string): Promise<number | null>;
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
  /** MEXC spot has a candle adapter; other smaller venues are chart-only. */
  isOnMexcSpot?(base: string): Promise<boolean>;
  mexcFirstDailyTs?(base: string): Promise<number | null>;
  mexcQuoteVolume24h?(base: string): Promise<number | null>;
  /** Exact CoinGecko market + base + target pairs, including known asset genesis and reference price. */
  verifiedIdentity?(base: string, coinId: string): Promise<{ markets: Set<string>; referencePrice: number | null; knownStart: number | null } | null>;
  /** Provider quote for sanity-checking the selected candle market. */
  candidateLastPrice?(candidate: ChartMarketCandidate): Promise<number | null>;
  /**
   * Live listing check for a pinned candidate: `true` when the venue still
   * lists the pair, `false` when it delisted it, `null` when the check itself
   * is unavailable. Only a `false` may trigger a re-pin.
   */
  isCandidateStillListed?(candidate: ChartMarketCandidate): Promise<boolean | null>;
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
  'gate_spot',
  'bitget_spot',
  'kucoin_spot'
];

/** Listing dates this close are decided by 24h quote volume instead. */
const TIE_WINDOW_MS = 7 * 24 * 3_600_000;
const RESOLUTION_TTL_MS = 12 * 3_600_000;
const NEGATIVE_TTL_MS = 3_600_000;

/**
 * A pin this old is re-validated against the venue's live listing before it is
 * served again. Pins used to be create()-only and never expire: a venue that
 * delisted a symbol produced a permanent 500 (`Older pages must use the pinned
 * source`) with no path back into the resolver.
 */
const PIN_MAX_AGE_MS = 7 * 24 * 3_600_000;
/** An unhealthy pin (a failed listing check) is re-checked at most this often. */
const PIN_RECHECK_MS = 15 * 60_000;

export interface ChartMarketResolverOptions {
  /** Age after which a pin is re-validated (tests use a short value). */
  pinMaxAgeMs?: number;
  /** Re-check interval once a pin failed a validation. */
  pinRecheckMs?: number;
}

export class ChartMarketResolver {
  private deps: ChartMarketResolverDeps;
  private cache = new Map<string, { resolution: ChartMarketResolution | null; expiresAt: number }>();
  private pinned = new Map<string, ChartMarketResolution>();
  private inFlight = new Map<string, Promise<ChartMarketResolution | null>>();
  private pinMaxAgeMs: number;
  private pinRecheckMs: number;
  /** A store survives Cloud Run instances; a failed store read never permits an unverified switch. */
  private store?: ChartMarketPinStore;
  public setStore(store: ChartMarketPinStore) { this.store = store; }

  constructor(deps: ChartMarketResolverDeps, options: ChartMarketResolverOptions = {}) {
    this.deps = deps;
    this.pinMaxAgeMs = options.pinMaxAgeMs ?? PIN_MAX_AGE_MS;
    this.pinRecheckMs = options.pinRecheckMs ?? PIN_RECHECK_MS;
  }

  private preferenceIndex(source: AssetMarketDataSource): number {
    const index = PREFERENCE.indexOf(source);
    return index === -1 ? PREFERENCE.length : index;
  }

  /**
   * Order of identity-verified candidates: listing age, then spot-before-perp,
   * then 24h quote volume, then declared preference. The coverage filter keeps
   * candidates with at least half the history of the oldest known start (and
   * admits everyone when the whole pool is younger than that margin), exactly
   * as before this file grew a pin lifecycle.
   */
  private rankOrder(candidates: ChartMarketCandidate[], knownStart: number | null): ChartMarketCandidate[] {
    const verified = candidates.filter(candidate => candidate.identityVerified);
    if (!verified.length) return [];
    const oldest = Math.min(...verified.map(candidate => candidate.listingStart ?? Number.POSITIVE_INFINITY));
    const startLimit = knownStart ?? (Number.isFinite(oldest) ? oldest : null);
    const total = startLimit ? Date.now() - startLimit : 0;
    const bestCoverage = total > 0
      ? Math.max(...verified.map(other => other.listingStart ? Math.max(0, (Date.now() - other.listingStart) / total) : 0))
      : 0;
    const withCoverage = verified.filter(candidate => {
      if (!startLimit || !candidate.listingStart || total <= 0) return true;
      const coverage = Math.max(0, (Date.now() - candidate.listingStart) / total);
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

  private rank(candidates: ChartMarketCandidate[], knownStart: number | null): ChartMarketCandidate[] {
    return this.rankOrder(candidates, knownStart);
  }

  /**
   * Awaits a resolver dependency and records it in the diagnostics registry.
   * This replaces the old error-swallowing `safe()`: nothing is dropped
   * silently anymore, every failure is counted per source with its message.
   */
  private async safeCall<T>(probe: string, source: string | null, run: () => Promise<T>): Promise<T | null> {
    recordProbeCall(source, probe);
    try {
      return await run();
    } catch (error) {
      recordProbeFailure({ source, probe, message: error instanceof Error ? error.message : String(error) });
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
      const scope = beginResolutionScope({ key, symbol, coinGeckoId: coinId, pinState: 'hit' });
      return runInResolutionScope(scope, async () => {
        try {
          const checked = await this.checkPinHealth(key, symbol, coinId, pin);
          finalizeResolution(scope, { outcome: 'pin-hit', resolution: checked, healed: checked !== pin });
          return checked;
        } catch (error) {
          finalizeResolution(scope, { outcome: 'error', resolution: pin, error: error instanceof Error ? error.message : String(error) });
          throw error;
        }
      });
    }
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      const scope = beginResolutionScope({ key, symbol, coinGeckoId: coinId, pinState: 'miss' });
      finalizeResolution(scope, { outcome: 'cache-hit', resolution: cached.resolution });
      return cached.resolution;
    }
    const scope = beginResolutionScope({ key, symbol, coinGeckoId: coinId, pinState: 'miss' });
    return runInResolutionScope(scope, async () => {
      try {
        const resolution = await this.computeAndPin(key, symbol, coinId);
        finalizeResolution(scope, {
          outcome: resolution ? 'resolved' : 'unresolved',
          resolution,
          healed: !!(resolution && resolution.audit?.repinnedAt && resolution.audit.repinnedAt > scope.startedAt)
        });
        return resolution;
      } catch (error) {
        finalizeResolution(scope, { outcome: 'error', resolution: null, error: error instanceof Error ? error.message : String(error) });
        throw error;
      }
    });
  }

  /** Computes, persists (create-only) and caches a brand-new resolution. */
  private async computeAndPin(key: string, symbol: string, coinId: string): Promise<ChartMarketResolution | null> {
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

  // -------------------------------------------------------------------------
  // Pin lifecycle: validation and healing
  // -------------------------------------------------------------------------

  /**
   * Validates a pin against the venue's live listing when it is older than
   * `pinMaxAgeMs` (or when a previous check failed). A pin is only ever
   * re-pinned on positive evidence: the venue answered and no longer lists the
   * pair. An unavailable check marks the pin `unverified` and increments the
   * failure counter — it never guesses.
   */
  private async checkPinHealth(key: string, symbol: string, coinId: string, pin: ChartMarketResolution): Promise<ChartMarketResolution> {
    const audit = pin.audit;
    const lastCheckedAt = audit?.lastCheckedAt ?? pin.resolvedAt ?? 0;
    const failedChecks = audit?.failedChecks ?? 0;
    const ageMs = Date.now() - lastCheckedAt;
    const dueByAge = ageMs >= this.pinMaxAgeMs;
    const dueByFailure = failedChecks > 0 && ageMs >= this.pinRecheckMs;
    if (!dueByAge && !dueByFailure) return pin;
    const candidate = pin.candle ?? pin.tv;
    const check = this.deps.isCandidateStillListed;
    if (!candidate || !check) {
      recordPinHealth({
        key, symbol, coinGeckoId: coinId,
        health: audit?.health ?? 'unverified',
        reason: candidate ? 'listing-check-unavailable' : 'no-candidate-to-check',
        resolvedAt: pin.resolvedAt, lastCheckedAt: audit?.lastCheckedAt ?? null, failedChecks,
        candleSource: pin.candle?.source ?? null, tvSymbol: pin.tv?.tvSymbol ?? null, repinnedAt: audit?.repinnedAt ?? null
      });
      return pin;
    }
    let listed: boolean | null = null;
    let failureMessage: string | null = null;
    recordProbeCall(candidate.source, 'isCandidateStillListed');
    try {
      listed = await check(candidate);
    } catch (error) {
      failureMessage = error instanceof Error ? error.message : String(error);
      recordProbeFailure({ source: candidate.source, probe: 'isCandidateStillListed', message: failureMessage });
    }
    const now = Date.now();
    if (listed === true) {
      pin.audit = { ...audit, lastCheckedAt: now, health: 'healthy', reason: 'pair-listed', failedChecks: 0 };
      await this.persistPinAudit(key, pin.audit);
      recordPinHealth({
        key, symbol, coinGeckoId: coinId, health: 'healthy', reason: 'pair-listed',
        resolvedAt: pin.resolvedAt, lastCheckedAt: now, failedChecks: 0,
        candleSource: pin.candle?.source ?? null, tvSymbol: pin.tv?.tvSymbol ?? null, repinnedAt: audit?.repinnedAt ?? null
      });
      return pin;
    }
    if (listed === false) return this.healPin(key, symbol, coinId, pin, candidate);
    const reason = failureMessage ? `listing-check-failed: ${failureMessage}` : 'listing-check-unknown';
    pin.audit = { ...audit, lastCheckedAt: now, health: 'unverified', reason, failedChecks: failedChecks + 1 };
    await this.persistPinAudit(key, pin.audit);
    recordPinHealth({
      key, symbol, coinGeckoId: coinId, health: 'unverified', reason,
      resolvedAt: pin.resolvedAt, lastCheckedAt: now, failedChecks: failedChecks + 1,
      candleSource: pin.candle?.source ?? null, tvSymbol: pin.tv?.tvSymbol ?? null, repinnedAt: audit?.repinnedAt ?? null
    });
    return pin;
  }

  /**
   * Re-resolves a pin whose venue confirmed the pair is gone and overwrites it
   * with audit fields. When the fresh resolution cannot be computed (upstream
   * outage) the old pin is kept and marked dead — no worse than the permanent
   * 500 it caused before, and retried on the next check.
   */
  private async healPin(
    key: string, symbol: string, coinId: string, pin: ChartMarketResolution, deadCandidate: ChartMarketCandidate
  ): Promise<ChartMarketResolution> {
    const now = Date.now();
    const previousCandleSource = pin.candle?.source ?? null;
    const fresh = await this.computeResolution(symbol, coinId);
    if (!fresh) {
      pin.audit = {
        ...pin.audit,
        lastCheckedAt: now,
        health: 'dead',
        reason: `pinned-pair-delisted: ${deadCandidate.source}`,
        failedChecks: (pin.audit?.failedChecks ?? 0) + 1
      };
      await this.persistPinAudit(key, pin.audit);
      recordPinHealth({
        key, symbol, coinGeckoId: coinId, health: 'dead', reason: pin.audit.reason!,
        resolvedAt: pin.resolvedAt, lastCheckedAt: now, failedChecks: pin.audit.failedChecks!,
        candleSource: previousCandleSource, tvSymbol: pin.tv?.tvSymbol ?? null, repinnedAt: pin.audit?.repinnedAt ?? null
      });
      return pin;
    }
    const healed: ChartMarketResolution = {
      ...fresh,
      audit: {
        lastCheckedAt: now,
        health: 'healthy',
        reason: 'repinned-after-delisting',
        failedChecks: 0,
        repinnedAt: now,
        previousCandleSource
      }
    };
    let served = healed;
    if (this.store?.replace) {
      try {
        const winner = await this.store.replace(key, healed, { resolvedAt: pin.resolvedAt });
        if (winner) {
          if (winner.symbol !== symbol || winner.coinGeckoId !== coinId || ![winner.candle, winner.tv].filter(Boolean).every(candidate => candidate!.identityVerified)) {
            throw new Error('Chart market pin identity mismatch');
          }
          served = winner;
        }
      } catch (error) {
        // The pin was dead anyway; serve the healed resolution in-process and
        // record that the overwrite did not persist (retried on the next check).
        if (error instanceof Error && error.message === 'Chart market pin identity mismatch') throw error;
        recordProbeFailure({ source: 'pin', probe: 'pinStore.replace', message: error instanceof Error ? error.message : String(error) });
      }
    } else if (this.store) {
      try { await this.store.set(key, healed); }
      catch (error) { recordProbeFailure({ source: 'pin', probe: 'pinStore.set', message: error instanceof Error ? error.message : String(error) }); }
    }
    this.pinned.set(key, served);
    this.cache.set(key, { resolution: served, expiresAt: Date.now() + RESOLUTION_TTL_MS });
    recordPinHealth({
      key, symbol, coinGeckoId: coinId, health: 'healthy', reason: 'repinned-after-delisting',
      resolvedAt: served.resolvedAt, lastCheckedAt: served.audit?.lastCheckedAt ?? now, failedChecks: 0,
      candleSource: served.candle?.source ?? null, tvSymbol: served.tv?.tvSymbol ?? null, repinnedAt: now
    });
    return served;
  }

  private async persistPinAudit(key: string, audit?: ChartMarketPinAudit): Promise<void> {
    if (!audit || !this.store?.mergeAudit) return;
    try { await this.store.mergeAudit(key, audit); }
    catch (error) { recordProbeFailure({ source: 'pin', probe: 'pinStore.mergeAudit', message: error instanceof Error ? error.message : String(error) }); }
  }

  // -------------------------------------------------------------------------
  // Resolution
  // -------------------------------------------------------------------------

  private async computeResolution(symbol: string, coinId: string): Promise<ChartMarketResolution | null> {
    const identity = await this.safeCall('verifiedIdentity', 'identity', () => this.deps.verifiedIdentity!(symbol, coinId));
    if (!identity?.markets.size) return null;
    // Only venues CoinGecko mapped to this exact coin ID can ever be verified,
    // so probing any other venue would burn requests on a candidate that the
    // identity filter drops later anyway.
    const verifiable = (source: AssetMarketDataSource) => identity.markets.has(source);
    const candidates: ChartMarketCandidate[] = [];
    if (verifiable('binance_spot') && await this.safeCall('isOnBinanceSpot', 'binance_spot', () => this.deps.isOnBinanceSpot(symbol))) {
      const candidate: ChartMarketCandidate = {
        source: 'binance_spot',
        exchange: 'BINANCE',
        providerSymbol: `${symbol}USDT`,
        tvSymbol: `BINANCE:${symbol}USDT`,
        quoteCurrency: 'USDT',
        listingStart: await this.safeCall('binanceSpotFirstDailyTs', 'binance_spot', () => this.deps.binanceSpotFirstDailyTs(symbol)),
        volume24hQuote: null,
        candleCapable: true
      };
      candidates.push(candidate);
    }

    const [onFutures, onBybit, okxInstrument, onHyperliquid, onCoinbase, onKraken, onMexc, onGate, onBitget, onKucoin] = await Promise.all([
      verifiable('binance_futures') && this.deps.isOnBinanceFutures
        ? this.safeCall('isOnBinanceFutures', 'binance_futures', () => this.deps.isOnBinanceFutures(symbol)) : Promise.resolve(false),
      verifiable('bybit_spot')
        ? this.safeCall('isOnBybitSpot', 'bybit_spot', () => this.deps.isOnBybitSpot(symbol)) : Promise.resolve(false),
      verifiable('okx_spot')
        ? this.safeCall('okxSpotInstrument', 'okx_spot', () => this.deps.okxSpotInstrument(symbol)) : Promise.resolve(null),
      verifiable('hyperliquid')
        ? this.safeCall('isOnHyperliquid', 'hyperliquid', () => this.deps.isOnHyperliquid(symbol)) : Promise.resolve(false),
      verifiable('coinbase')
        ? this.safeCall('isOnCoinbase', 'coinbase', () => this.deps.isOnCoinbase(symbol)) : Promise.resolve(false),
      verifiable('kraken')
        ? this.safeCall('isOnKraken', 'kraken', () => this.deps.isOnKraken(symbol)) : Promise.resolve(false),
      verifiable('mexc_spot') && this.deps.isOnMexcSpot
        ? this.safeCall('isOnMexcSpot', 'mexc_spot', () => this.deps.isOnMexcSpot!(symbol)) : Promise.resolve(false),
      verifiable('gate_spot') && this.deps.isOnGateSpot
        ? this.safeCall('isOnGateSpot', 'gate_spot', () => this.deps.isOnGateSpot!(symbol)) : Promise.resolve(false),
      verifiable('bitget_spot') && this.deps.isOnBitgetSpot
        ? this.safeCall('isOnBitgetSpot', 'bitget_spot', () => this.deps.isOnBitgetSpot!(symbol)) : Promise.resolve(false),
      verifiable('kucoin_spot') && this.deps.isOnKucoinSpot
        ? this.safeCall('isOnKucoinSpot', 'kucoin_spot', () => this.deps.isOnKucoinSpot!(symbol)) : Promise.resolve(false)
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
          candidate.listingStart = await this.safeCall('binanceFuturesFirstDailyTs', 'binance_futures', () => this.deps.binanceFuturesFirstDailyTs(symbol));
          break;
        case 'bybit_spot':
          candidate.listingStart = await this.safeCall('bybitFirstDailyTs', 'bybit_spot', () => this.deps.bybitFirstDailyTs(symbol));
          break;
        case 'coinbase':
          candidate.listingStart = await this.safeCall('coinbaseFirstDailyTs', 'coinbase', () => this.deps.coinbaseFirstDailyTs(symbol));
          break;
        case 'kraken':
          candidate.listingStart = await this.safeCall('krakenFirstDailyTs', 'kraken', () => this.deps.krakenFirstDailyTs(symbol));
          break;
        case 'mexc_spot':
          candidate.listingStart = this.deps.mexcFirstDailyTs
            ? await this.safeCall('mexcFirstDailyTs', 'mexc_spot', () => this.deps.mexcFirstDailyTs!(symbol)) : null;
          break;
        case 'hyperliquid':
          candidate.listingStart = await this.safeCall('hyperliquidFirstDailyTs', 'hyperliquid', () => this.deps.hyperliquidFirstDailyTs(symbol));
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
        case 'binance_spot':
          candidate.volume24hQuote = this.deps.binanceSpotQuoteVolume24h
            ? await this.safeCall('binanceSpotQuoteVolume24h', 'binance_spot', () => this.deps.binanceSpotQuoteVolume24h!(symbol)) : null;
          break;
        case 'binance_futures':
          candidate.volume24hQuote = await this.safeCall('binanceFuturesQuoteVolume24h', 'binance_futures', () => this.deps.binanceFuturesQuoteVolume24h(symbol));
          break;
        case 'bybit_spot':
          candidate.volume24hQuote = await this.safeCall('bybitQuoteVolume24h', 'bybit_spot', () => this.deps.bybitQuoteVolume24h(symbol));
          break;
        case 'okx_spot':
          candidate.volume24hQuote = await this.safeCall('okxQuoteVolume24h', 'okx_spot', () => this.deps.okxQuoteVolume24h(candidate.providerSymbol));
          break;
        case 'coinbase':
          candidate.volume24hQuote = await this.safeCall('coinbaseQuoteVolume24h', 'coinbase', () => this.deps.coinbaseQuoteVolume24h(symbol));
          break;
        case 'kraken':
          candidate.volume24hQuote = await this.safeCall('krakenQuoteVolume24h', 'kraken', () => this.deps.krakenQuoteVolume24h(symbol));
          break;
        case 'mexc_spot':
          candidate.volume24hQuote = this.deps.mexcQuoteVolume24h
            ? await this.safeCall('mexcQuoteVolume24h', 'mexc_spot', () => this.deps.mexcQuoteVolume24h!(symbol)) : null;
          break;
        case 'hyperliquid':
          candidate.volume24hQuote = await this.safeCall('hyperliquidQuoteVolume24h', 'hyperliquid', () => this.deps.hyperliquidQuoteVolume24h(symbol));
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
    await this.priceCheckScan(verified, identity);
    const priceSafe = verified.filter(candidate => identity.referencePrice && candidate.lastPrice
      ? Math.abs(candidate.lastPrice / identity.referencePrice - 1) <= .05 : true);
    const ranked = this.rank(priceSafe, identity.knownStart);
    const candle = ranked.find(c => c.candleCapable) || null;
    const tv = ranked.find(c => c.tvSymbol) || null;
    if (!candle && !tv) return null;
    const resolvedAt = Date.now();
    return {
      symbol,
      coinGeckoId: coinId,
      candle,
      tv,
      candidates: ranked,
      resolvedAt,
      audit: { lastCheckedAt: resolvedAt, health: 'unverified', reason: 'resolved', failedChecks: 0 }
    };
  }

  /**
   * Price sanity check (candidate must be within ±5% of the CoinGecko
   * reference price) walked in rank order with an early stop.
   *
   * The stop is exact, not an approximation: the candle is the first
   * candle-capable candidate of the ranked pool and the TV symbol the first
   * candidate with a TradingView symbol, so once both are certified (probed,
   * not rejected) every later candidate can only change fields that are not
   * served. Two safety rules keep the ranking identical to a full probe:
   *  - a candidate whose rejection could move the coverage window (the
   *    cheapest listing the pool is measured against) forces a full probe of
   *    the remaining candidates instead of an early stop;
   *  - candidates skipped after the stop keep `lastPrice: null`, which passes
   *    the ±5% filter exactly like a verified price does.
   * CoinGecko failures/429s already mark the reference price null upstream;
   * the same failures inside a probe are recorded by `safeCall`.
   */
  private async priceCheckScan(
    verified: ChartMarketCandidate[],
    identity: { referencePrice: number | null; knownStart: number | null }
  ): Promise<void> {
    const probePrice = this.deps.candidateLastPrice;
    if (!probePrice || !verified.length) return;
    const ordered = this.rankOrder(verified, identity.knownStart);
    if (!ordered.length) return;
    const finiteStarts = ordered.map(candidate => candidate.listingStart).filter((value): value is number => typeof value === 'number');
    const minListing = finiteStarts.length ? Math.min(...finiteStarts) : null;
    const isMinListing = (candidate: ChartMarketCandidate) => minListing !== null && candidate.listingStart === minListing;
    const referencePrice = identity.referencePrice;
    const isRejected = (candidate: ChartMarketCandidate) => !!(referencePrice && candidate.lastPrice)
      && Math.abs(candidate.lastPrice! / referencePrice - 1) > .05;
    const probe = async (candidate: ChartMarketCandidate) => {
      candidate.lastPrice = await this.safeCall('candidateLastPrice', candidate.source, () => probePrice(candidate));
    };
    let candleCertified = false;
    let tvCertified = false;
    let probed = 0;
    for (const candidate of ordered) {
      if (candleCertified && tvCertified) break;
      await probe(candidate);
      probed += 1;
      if (isRejected(candidate)) {
        // Rejecting the cheapest listing can move the coverage window for the
        // whole pool: no early stop is provable, probe everything remaining.
        if (isMinListing(candidate)) {
          await Promise.all(ordered.slice(probed).map(probe));
          return;
        }
        continue;
      }
      if (!candleCertified && candidate.candleCapable) candleCertified = true;
      if (!tvCertified && candidate.tvSymbol) tvCertified = true;
    }
  }
}
