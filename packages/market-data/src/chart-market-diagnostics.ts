/**
 * Chart-market resolver diagnostics registry (module-scoped).
 *
 * The chart-market resolver used to fail silently: `safe()` swallowed every
 * probe error (a CoinGecko 429 became `null`, then a misleading
 * "no identity-verified candle market" 500), and nothing recorded how many
 * upstream requests a resolution cost or which venue was chosen. This module
 * is the process-wide observation point for that pipeline:
 *
 *  - every resolver dependency call is counted (probe name + candidate source),
 *  - every HTTP request issued from `chart-market-probes.ts` is counted per host,
 *  - every probe failure (with its HTTP status when known) is recorded,
 *  - each resolution becomes an entry (duration, requests, chosen source,
 *    pin state, failures) in a bounded ring buffer,
 *  - pin health checks/heals are summarised per pin.
 *
 * The registry is intentionally dependency-free and safe to import from any
 * Node process (`node:async_hooks` only). Nothing here throws: a diagnostics
 * failure must never break a resolution.
 *
 * Request accounting note: `httpRequests` counts requests issued by the probe
 * layer itself (CoinGecko, Binance klines/tickers, Coinbase, Kraken, MEXC
 * ticker, small-venue symbol lists). Requests issued *inside* a venue adapter
 * (e.g. the Bybit/MEXC listing searches) are attributed to their dependency
 * call in `probeCallsBySource` instead — one probe may be several requests.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

export type ChartMarketPinHealth = 'healthy' | 'unverified' | 'dead';

export interface ChartMarketProbeFailure {
  /** Candidate source (binance_spot, bybit_spot, ...) or `identity`/`pin`. */
  source: string;
  /** Dependency/probe name that failed (e.g. `isOnBybitSpot`, `verifiedIdentity`). */
  probe: string;
  /** Error message, e.g. `HTTP 429`. Never contains credentials. */
  message: string;
  /** HTTP status parsed from the message when available. */
  status: number | null;
  at: number;
}

export interface ChartMarketResolutionScope {
  key: string;
  symbol: string;
  coinGeckoId: string;
  startedAt: number;
  pinState: 'hit' | 'miss';
  probeCalls: number;
  httpRequests: number;
  probeCallsBySource: Record<string, number>;
  httpRequestsByHost: Record<string, number>;
  failures: ChartMarketProbeFailure[];
  /** Per-resolution memo shared by probes that read the same upstream data. */
  memo: Map<string, Promise<unknown>>;
}

export interface ChartMarketResolutionRecord {
  key: string;
  symbol: string;
  coinGeckoId: string;
  startedAt: number;
  durationMs: number;
  outcome: 'resolved' | 'pin-hit' | 'cache-hit' | 'unresolved' | 'error';
  candleSource: string | null;
  tvSymbol: string | null;
  probeCalls: number;
  httpRequests: number;
  probeCallsBySource: Record<string, number>;
  httpRequestsByHost: Record<string, number>;
  failures: ChartMarketProbeFailure[];
  healed: boolean;
  error: string | null;
}

export interface ChartMarketPinHealthEntry {
  key: string;
  symbol: string;
  coinGeckoId: string;
  health: ChartMarketPinHealth;
  reason: string;
  resolvedAt: number | null;
  lastCheckedAt: number | null;
  failedChecks: number;
  candleSource: string | null;
  tvSymbol: string | null;
  repinnedAt: number | null;
  updatedAt: number;
}

interface DiagnosticsState {
  startedAt: number;
  resolutions: number;
  resolved: number;
  unresolved: number;
  errors: number;
  pinHits: number;
  cacheHits: number;
  heals: number;
  probeCalls: number;
  httpRequests: number;
  probeCallsBySource: Record<string, number>;
  httpRequestsByHost: Record<string, number>;
  failuresBySource: Record<string, number>;
  failuresTotal: number;
  lastFailure: ChartMarketProbeFailure | null;
  recent: ChartMarketResolutionRecord[];
  recentFailures: ChartMarketProbeFailure[];
  pinHealth: Map<string, ChartMarketPinHealthEntry>;
}

const MAX_RECENT_RESOLUTIONS = 50;
const MAX_RECENT_FAILURES = 25;
const MAX_SCOPE_FAILURES = 20;

const scopeStorage = new AsyncLocalStorage<ChartMarketResolutionScope>();

const freshState = (): DiagnosticsState => ({
  startedAt: Date.now(),
  resolutions: 0,
  resolved: 0,
  unresolved: 0,
  errors: 0,
  pinHits: 0,
  cacheHits: 0,
  heals: 0,
  probeCalls: 0,
  httpRequests: 0,
  probeCallsBySource: {},
  httpRequestsByHost: {},
  failuresBySource: {},
  failuresTotal: 0,
  lastFailure: null,
  recent: [],
  recentFailures: [],
  pinHealth: new Map()
});

let state = freshState();

const increment = (bucket: Record<string, number>, key: string) => {
  bucket[key] = (bucket[key] || 0) + 1;
};

const httpStatusOf = (message: string): number | null => {
  const match = /\bHTTP[ :]?(\d{3})\b/i.exec(message);
  return match ? Number(match[1]) : null;
};

/** Starts a per-resolution accounting scope. */
export function beginResolutionScope(input: {
  key: string; symbol: string; coinGeckoId: string; pinState: 'hit' | 'miss';
}): ChartMarketResolutionScope {
  return {
    key: input.key,
    symbol: input.symbol,
    coinGeckoId: input.coinGeckoId,
    startedAt: Date.now(),
    pinState: input.pinState,
    probeCalls: 0,
    httpRequests: 0,
    probeCallsBySource: {},
    httpRequestsByHost: {},
    failures: [],
    memo: new Map()
  };
}

/** Runs `fn` with the given scope visible to every downstream probe call. */
export function runInResolutionScope<T>(scope: ChartMarketResolutionScope, fn: () => Promise<T>): Promise<T> {
  return scopeStorage.run(scope, fn);
}

export function currentResolutionScope(): ChartMarketResolutionScope | undefined {
  return scopeStorage.getStore();
}

/**
 * Memoises an upstream read inside one resolution so probes that need the same
 * venue payload (e.g. a 24h ticker used for both the volume tie-break and the
 * price sanity check) share a single request. Rejections are not cached: a
 * later probe retries exactly like it did before this registry existed.
 */
export function memoizeWithinResolution<T>(key: string, load: () => Promise<T>): Promise<T> {
  const scope = scopeStorage.getStore();
  if (!scope) return load();
  const existing = scope.memo.get(key);
  if (existing) return existing as Promise<T>;
  const pending = load().catch(error => {
    scope.memo.delete(key);
    throw error;
  });
  scope.memo.set(key, pending as Promise<unknown>);
  return pending;
}

/** Records one resolver dependency call (exact call count, plus its source). */
export function recordProbeCall(source: string | null, probe: string): void {
  state.probeCalls += 1;
  increment(state.probeCallsBySource, source || 'identity');
  const scope = scopeStorage.getStore();
  if (!scope) return;
  scope.probeCalls += 1;
  increment(scope.probeCallsBySource, source || 'identity');
}

/** Records one HTTP request issued by the probe layer, attributed to the active resolution. */
export function recordHttpRequest(host: string): void {
  state.httpRequests += 1;
  increment(state.httpRequestsByHost, host);
  const scope = scopeStorage.getStore();
  if (!scope) return;
  scope.httpRequests += 1;
  increment(scope.httpRequestsByHost, host);
}

/**
 * Records a probe failure. Called both from the probes (transport-level) and
 * from the resolver (dependency-level, for deps that are not probe-built), so
 * two consecutive identical entries are collapsed into one.
 */
export function recordProbeFailure(input: { source: string | null; probe: string; message: string }): void {
  const source = input.source || 'identity';
  const failure: ChartMarketProbeFailure = {
    source,
    probe: input.probe,
    message: input.message,
    status: httpStatusOf(input.message),
    at: Date.now()
  };
  state.failuresTotal += 1;
  increment(state.failuresBySource, source);
  state.lastFailure = failure;
  state.recentFailures.push(failure);
  if (state.recentFailures.length > MAX_RECENT_FAILURES) state.recentFailures.splice(0, state.recentFailures.length - MAX_RECENT_FAILURES);
  const scope = scopeStorage.getStore();
  if (!scope) return;
  const last = scope.failures[scope.failures.length - 1];
  if (last && last.probe === failure.probe && last.message === failure.message) return;
  scope.failures.push(failure);
  if (scope.failures.length > MAX_SCOPE_FAILURES) scope.failures.shift();
}

/** Finalises a resolution scope into the ring buffer and counters. */
export function finalizeResolution(scope: ChartMarketResolutionScope, result: {
  outcome: ChartMarketResolutionRecord['outcome'];
  resolution: { candle?: { source: string; tvSymbol?: string | null } | null; tv?: { tvSymbol: string | null } | null } | null;
  healed?: boolean;
  error?: string | null;
}): ChartMarketResolutionRecord {
  const record: ChartMarketResolutionRecord = {
    key: scope.key,
    symbol: scope.symbol,
    coinGeckoId: scope.coinGeckoId,
    startedAt: scope.startedAt,
    durationMs: Date.now() - scope.startedAt,
    outcome: result.outcome,
    candleSource: result.resolution?.candle?.source ?? null,
    tvSymbol: result.resolution?.tv?.tvSymbol ?? null,
    probeCalls: scope.probeCalls,
    httpRequests: scope.httpRequests,
    probeCallsBySource: { ...scope.probeCallsBySource },
    httpRequestsByHost: { ...scope.httpRequestsByHost },
    failures: [...scope.failures],
    healed: !!result.healed,
    error: result.error ?? null
  };
  state.resolutions += 1;
  if (result.outcome === 'resolved') state.resolved += 1;
  if (result.outcome === 'unresolved') state.unresolved += 1;
  if (result.outcome === 'error') state.errors += 1;
  if (result.outcome === 'pin-hit') state.pinHits += 1;
  if (result.outcome === 'cache-hit') state.cacheHits += 1;
  if (result.healed) state.heals += 1;
  state.recent.push(record);
  if (state.recent.length > MAX_RECENT_RESOLUTIONS) state.recent.splice(0, state.recent.length - MAX_RECENT_RESOLUTIONS);
  return record;
}

/** Records the observed health of a pin (check outcome or heal). */
export function recordPinHealth(input: {
  key: string; symbol: string; coinGeckoId: string;
  health: ChartMarketPinHealth; reason: string;
  resolvedAt: number | null; lastCheckedAt: number | null; failedChecks: number;
  candleSource?: string | null; tvSymbol?: string | null; repinnedAt?: number | null;
}): ChartMarketPinHealthEntry {
  const entry: ChartMarketPinHealthEntry = {
    key: input.key,
    symbol: input.symbol,
    coinGeckoId: input.coinGeckoId,
    health: input.health,
    reason: input.reason,
    resolvedAt: input.resolvedAt,
    lastCheckedAt: input.lastCheckedAt,
    failedChecks: input.failedChecks,
    candleSource: input.candleSource ?? null,
    tvSymbol: input.tvSymbol ?? null,
    repinnedAt: input.repinnedAt ?? null,
    updatedAt: Date.now()
  };
  state.pinHealth.set(input.key, entry);
  return entry;
}

export interface ChartMarketDiagnosticsSnapshot {
  startedAt: number;
  uptimeMs: number;
  resolutions: number;
  resolved: number;
  unresolved: number;
  errors: number;
  pinHits: number;
  cacheHits: number;
  heals: number;
  probeCalls: number;
  httpRequests: number;
  failuresTotal: number;
  probeCallsBySource: Record<string, number>;
  httpRequestsByHost: Record<string, number>;
  failuresBySource: Record<string, number>;
  lastFailure: ChartMarketProbeFailure | null;
  recentFailures: ChartMarketProbeFailure[];
  recentResolutions: ChartMarketResolutionRecord[];
  pinHealth: {
    observed: number;
    byHealth: Record<string, number>;
    pins: ChartMarketPinHealthEntry[];
  };
}

/** Read-only snapshot served by `GET /api/chart-market-diagnostics`. */
export function getChartMarketDiagnosticsSnapshot(): ChartMarketDiagnosticsSnapshot {
  const byHealth: Record<string, number> = {};
  for (const entry of state.pinHealth.values()) increment(byHealth, entry.health);
  return {
    startedAt: state.startedAt,
    uptimeMs: Date.now() - state.startedAt,
    resolutions: state.resolutions,
    resolved: state.resolved,
    unresolved: state.unresolved,
    errors: state.errors,
    pinHits: state.pinHits,
    cacheHits: state.cacheHits,
    heals: state.heals,
    probeCalls: state.probeCalls,
    httpRequests: state.httpRequests,
    failuresTotal: state.failuresTotal,
    probeCallsBySource: { ...state.probeCallsBySource },
    httpRequestsByHost: { ...state.httpRequestsByHost },
    failuresBySource: { ...state.failuresBySource },
    lastFailure: state.lastFailure,
    recentFailures: [...state.recentFailures],
    recentResolutions: [...state.recent],
    pinHealth: {
      observed: state.pinHealth.size,
      byHealth,
      pins: [...state.pinHealth.values()].sort((a, b) => b.updatedAt - a.updatedAt)
    }
  };
}

/** Test hook: wipes counters, ring buffers and pin observations. */
export function resetChartMarketDiagnostics(): void {
  state = freshState();
}
