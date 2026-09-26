// re-pin-chart-markets.ts — campaign tool for re-resolving production chart-market pins.
//
// Context (Money Scanner, Step 155 / commit fa1104a):
//   The chart-market resolver pins one resolution per (SYMBOL:coinGeckoId) in
//   Firestore (`money-scanner-360` / `chart-market-resolutions`) and the pin
//   wins over every later re-resolution (`chart-market-resolver.ts` resolveOne).
//   Commit fa1104a fixed fabricated listing dates (Kraken >= 720-row window,
//   Coinbase >= 300-row truncated window) and the OKX/Binance 24h quote volume
//   source, but a fix only applies to NEW resolutions: production pins written
//   before it keep their fabricated listingStart and their old candle source.
//   This script re-resolves every pin with the fixed code and reports the diff.
//
// What it does:
//   1. reads production pins READ-ONLY from Firestore (ADC / gcloud application
//      default credentials; see env var names below),
//   2. recomputes each resolution with the same clients/adapters as the API
//      (MarketDataService without a pin store, so nothing short-circuits),
//   3. prints a diff table (old source + listingStart + tvSymbol => new values,
//      changed?) plus a summary (how many pins exist, how many change, which),
//   4. lists the pins that stay unchanged,
//   5. optionally WRITES the new pins --apply --yes (never run in this wave;
//      writes are the exact same document shape the app reads, `set(..., { merge: true })`
//      so audit/health fields added by other writers survive).
//
// Rate limits: upstream fetch (CoinGecko/Binance/...) is wrapped by a governor
//   with per-host concurrency caps, minimum gaps, adaptive slowdown on 429 and
//   exponential backoff retries. Gaps can be tuned with env var NAMES:
//   RE_PIN_HOST_CONCURRENCY, RE_PIN_MIN_GAP_MS, RE_PIN_COINGECKO_GAP_MS,
//   RE_PIN_MAX_ATTEMPTS.
//
// Environment (names only, never values):
//   FIREBASE_PROJECT_ID or GOOGLE_CLOUD_PROJECT  — Firestore project (default gen-lang-client-0610749770)
//   GOOGLE_APPLICATION_CREDENTIALS               — optional service account JSON instead of ADC
//   COINGECKO_API_KEY                            — optional; the fixed CoinGecko rate limit greatly reduces 429s
//
// Run (dry-run, read-only — this is the command executed for the campaign):
//   cd "apps/api" && npx tsx scripts/re-pin-chart-markets.ts
//
// Apply later (documented, NOT executed in this wave):
//   cd "apps/api" && npx tsx scripts/re-pin-chart-markets.ts --apply --yes
//   (add --only=BTC,ETH or --exclude=SYM to narrow the batch)
//
// The resolver build is verified before any work: if the built
// packages/market-data dist does not contain the fa1104a fix markers the run
// aborts instead of producing "new" values computed by the unfixed code.

import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { MarketDataService } from '@money-scanner/market-data';
import type { ChartMarketResolution } from '@money-scanner/market-data';

// ---------------------------------------------------------------------------
// Pin storage (mirrors AppState.chartMarketDocument in apps/api/src/services/app-state.ts)
// ---------------------------------------------------------------------------

export const PIN_COLLECTION = 'chart-market-resolutions';
export const PIN_DATABASE = 'money-scanner-360';
export const DEFAULT_PROJECT_ID = 'gen-lang-client-0610749770';

/** Sources the current build's resolver can produce (chart-market-resolver.ts PREFERENCE + probes). */
export const RESOLVER_KNOWN_SOURCES = [
  'binance_spot', 'bybit_spot', 'okx_spot', 'binance_futures',
  'coinbase', 'kraken', 'hyperliquid', 'mexc_spot',
  'gate_spot', 'bitget_spot', 'kucoin_spot'
];

// ---------------------------------------------------------------------------
// Loose value types: production pins can hold candidates written by older or
// parallel branches (measured: `xt_spot` exists in production but not in this
// build), so candidate fields are typed loosely on purpose.
// ---------------------------------------------------------------------------

export interface LooseCandidate {
  source: string;
  exchange?: string;
  providerSymbol?: string;
  tvSymbol?: string | null;
  quoteCurrency?: string;
  listingStart?: number | null;
  volume24hQuote?: number | null;
  candleCapable?: boolean;
  identityVerified?: boolean;
  lastPrice?: number | null;
}

export interface LooseResolution {
  symbol: string;
  coinGeckoId: string;
  candle: LooseCandidate | null;
  tv: LooseCandidate | null;
  candidates?: LooseCandidate[];
  resolvedAt?: number;
}

export interface StoredPin extends LooseResolution {
  key: string;
  extra: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Diff model
// ---------------------------------------------------------------------------

export type PinVerdict =
  | 'UNCHANGED'
  | 'CHANGED'
  | 'SKIPPED_UNSUPPORTED_SOURCE'
  | 'RECOMPUTE_FAILED'
  | 'IDENTITY_MISMATCH';

export interface FieldChange {
  slot: 'candle' | 'tv';
  field: string;
  from: string | number | boolean | null;
  to: string | number | boolean | null;
  reason: string;
}

export interface FabricatedFlag {
  slot: 'candle' | 'tv';
  source: string;
  listingStart: number;
  ageDays: number;
}

export interface UpstreamDelta {
  requests: number;
  retries: number;
  throttled: number;
  serverErrors: number;
}

export interface VolumeSourceAdded {
  slot: 'candle' | 'tv';
  source: string;
  volume24hQuote: number;
}

export interface PinDiff {
  key: string;
  symbol: string;
  coinGeckoId: string;
  verdict: PinVerdict;
  changes: FieldChange[];
  reasons: string[];
  old: { candle: LooseCandidate | null; tv: LooseCandidate | null; resolvedAt?: number };
  next: { candle: LooseCandidate | null; tv: LooseCandidate | null; resolvedAt?: number } | null;
  candidatesCount: { old: number; next: number | null };
  fabricated: FabricatedFlag[];
  /** Old pin had no 24h quote volume where the fa1104a build now fills it (informational, not a material change). */
  volumeSourceAdded: VolumeSourceAdded[];
  upstream: UpstreamDelta;
  error?: string;
}

/** Material fields: only these decide "changed". Live numbers (volume24hQuote,
 * lastPrice) move on every run and are reported but never counted as changes. */
const MATERIAL_FIELDS: Array<keyof LooseCandidate> = [
  'source', 'exchange', 'providerSymbol', 'tvSymbol', 'quoteCurrency',
  'candleCapable', 'identityVerified', 'listingStart'
];

const DAY_MS = 86_400_000;
const KRAKEN_WINDOW_DAYS = 720;
const COINBASE_TRUNCATED_DAYS = 300;

/**
 * Pre-fa1104a fabricated dates: Kraken answered its latest 720-day window, so
 * every pair with a longer history reported ~today-720d as "listing"; Coinbase
 * capped its candles answer (~300+ buckets), so its first bucket was ~today-300d..350d.
 * Heuristic, used only for reporting — never for writes.
 */
export function suspectedFabricatedListingStart(
  candidate: LooseCandidate | null | undefined,
  now = Date.now()
): FabricatedFlag | null {
  if (!candidate || typeof candidate.listingStart !== 'number' || !Number.isFinite(candidate.listingStart)) return null;
  const ageDays = (now - candidate.listingStart) / DAY_MS;
  if (candidate.source === 'kraken' && Math.abs(ageDays - KRAKEN_WINDOW_DAYS) <= 3) {
    return { slot: 'candle', source: 'kraken', listingStart: candidate.listingStart, ageDays: Number(ageDays.toFixed(1)) };
  }
  if (candidate.source === 'coinbase' && ageDays >= COINBASE_TRUNCATED_DAYS - 10 && ageDays <= 365) {
    return { slot: 'candle', source: 'coinbase', listingStart: candidate.listingStart, ageDays: Number(ageDays.toFixed(1)) };
  }
  return null;
}

const formatTs = (value: number | null | undefined) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'null';
  return new Date(value).toISOString().slice(0, 10);
};

const ageLabel = (value: number | null | undefined, now: number) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'necunoscut';
  return `${((now - value) / DAY_MS).toFixed(0)}z`;
};

const cell = (value: string | number | boolean | null | undefined) => {
  if (value === null || value === undefined) return 'null';
  return String(value);
};

/** Shape shown in tables: source + listingStart (dated + age) + tv symbol. */
export function candidateLabel(candidate: LooseCandidate | null | undefined, now: number): string {
  if (!candidate) return 'null';
  return `${candidate.source}·${formatTs(candidate.listingStart)} (${ageLabel(candidate.listingStart, now)})·${cell(candidate.tvSymbol)}`;
}

export function candidateHasUnsupportedSource(candidate: LooseCandidate | null | undefined): boolean {
  if (!candidate) return false;
  return !RESOLVER_KNOWN_SOURCES.includes(candidate.source);
}

export function pinHasUnsupportedSource(pin: LooseResolution): boolean {
  const all = [pin.candle, pin.tv, ...(pin.candidates || [])];
  return all.some(candidateHasUnsupportedSource);
}

function reasonsForListingStart(from: number | null | undefined, to: number | null | undefined, slot: string, now: number): string {
  const fromNum = typeof from === 'number' ? from : null;
  const toNum = typeof to === 'number' ? to : null;
  if (fromNum !== null && toNum === null) {
    return `${slot}: listingStart fabricat eliminat (${formatTs(fromNum)} => necunoscut, corect)`;
  }
  if (fromNum === null && toNum !== null) {
    return `${slot}: listingStart completat cu data reală (${formatTs(toNum)})`;
  }
  const deltaDays = fromNum && toNum ? Math.abs(fromNum - toNum) / DAY_MS : 0;
  return `${slot}: listingStart corectat ${formatTs(fromNum)} => ${formatTs(toNum)} (Δ${deltaDays.toFixed(0)}z, vârsta ${ageLabel(fromNum, now)} => ${ageLabel(toNum, now)})`;
}

/** Pure diff between a stored pin and a freshly computed resolution. */
export function diffPin(
  pin: LooseResolution & { key: string },
  next: LooseResolution | null,
  options: { now?: number; includeUnsupported?: boolean; error?: string; upstream?: UpstreamDelta } = {}
): PinDiff {
  const now = options.now ?? Date.now();
  const base: PinDiff = {
    key: pin.key,
    symbol: pin.symbol,
    coinGeckoId: pin.coinGeckoId,
    verdict: 'UNCHANGED',
    changes: [],
    reasons: [],
    old: { candle: pin.candle || null, tv: pin.tv || null, resolvedAt: pin.resolvedAt },
    next: next ? { candle: next.candle || null, tv: next.tv || null, resolvedAt: next.resolvedAt } : null,
    candidatesCount: { old: Array.isArray(pin.candidates) ? pin.candidates.length : 0, next: next && Array.isArray(next.candidates) ? next.candidates.length : null },
    fabricated: [pin.candle, pin.tv].filter(Boolean).map(candidate => suspectedFabricatedListingStart(candidate, now)).filter((flag): flag is FabricatedFlag => Boolean(flag)),
    volumeSourceAdded: [],
    upstream: options.upstream || { requests: 0, retries: 0, throttled: 0, serverErrors: 0 }
  };

  if (pinHasUnsupportedSource(pin) && !options.includeUnsupported) {
    const unsupported = [pin.candle, pin.tv, ...(pin.candidates || [])]
      .filter((candidate): candidate is LooseCandidate => Boolean(candidate))
      .map(candidate => candidate.source)
      .filter(source => !RESOLVER_KNOWN_SOURCES.includes(source));
    base.verdict = 'SKIPPED_UNSUPPORTED_SOURCE';
    base.reasons.push(`pin cu sursă pe care build-ul curent nu o poate produce (${Array.from(new Set(unsupported)).join(', ')}); re-pin ar înlocui acea piață — exclus implicit`);
    return base;
  }

  if (!next || !next.candle || !next.candle.identityVerified) {
    base.verdict = 'RECOMPUTE_FAILED';
    base.error = options.error || 'resolver a întors null (identitate/venue indisponibil sau eroare upstream)';
    base.reasons.push(`recalculare eșuată: ${base.error}`);
    return base;
  }
  if (next.symbol !== pin.symbol || next.coinGeckoId !== pin.coinGeckoId) {
    base.verdict = 'IDENTITY_MISMATCH';
    base.error = `identitate nouă ${next.symbol}:${next.coinGeckoId} diferă de pinul ${pin.symbol}:${pin.coinGeckoId}`;
    base.reasons.push(base.error);
    return base;
  }

  const slots: Array<'candle' | 'tv'> = ['candle', 'tv'];
  for (const slot of slots) {
    const from = (pin[slot] || null) as LooseCandidate | null;
    const to = (next[slot] || null) as LooseCandidate | null;
    if (!from && !to) continue;
    if (!from || !to) {
      base.changes.push({
        slot,
        field: 'candidate',
        from: from ? from.source : null,
        to: to ? to.source : null,
        reason: `${slot}: ${from ? `${from.source} eliminat` : `${to!.source} apărut`}`
      });
      continue;
    }
    for (const field of MATERIAL_FIELDS) {
      const fromValue = (from[field] ?? null) as string | number | boolean | null;
      const toValue = (to[field] ?? null) as string | number | boolean | null;
      if (fromValue === toValue) continue;
      const reason = field === 'listingStart'
        ? reasonsForListingStart(fromValue as number | null, toValue as number | null, slot, now)
        : `${slot}: ${field} ${cell(fromValue)} => ${cell(toValue)}`;
      base.changes.push({ slot, field, from: fromValue, to: toValue, reason });
      // Kraken/Coinbase report "unknown" by design when their candle window is
      // truncated; any other source reporting null after a real date means the
      // listing probe failed, so the diff needs a human look before --apply.
      if (field === 'listingStart' && fromValue !== null && toValue === null && !['kraken', 'coinbase'].includes(from.source)) {
        base.reasons.push(`${slot}: ATENȚIE — ${from.source} a raportat null (probă eșuată/tranzitorie?); verifică înainte de aplicare`);
      }
    }
    if (to.identityVerified === false) {
      base.changes.push({ slot, field: 'identityVerified', from: from.identityVerified ?? null, to: false, reason: `${slot}: candidat neverificat` });
    }
    // Informational: the pin predates the fa1104a spot-volume fix, so the same
    // market now carries a 24h quote volume it never had (e.g. binance_spot null => 1.5B).
    if (from.source === to.source && (from.volume24hQuote ?? null) === null && typeof to.volume24hQuote === 'number' && Number.isFinite(to.volume24hQuote)) {
      base.volumeSourceAdded.push({ slot, source: to.source, volume24hQuote: to.volume24hQuote });
    }
  }

  base.reasons.push(...base.changes.map(change => change.reason));
  if (base.fabricated.length) {
    base.reasons.push(`listingStart suspect fabricat în pinul vechi: ${base.fabricated.map(flag => `${flag.source} ~${flag.ageDays}z`).join(', ')}`);
  }
  base.verdict = base.changes.length ? 'CHANGED' : 'UNCHANGED';
  if (!base.changes.length) base.reasons.push('nicio diferență materială (aceeași sursă, listing și simbol TV)');
  return base;
}

// ---------------------------------------------------------------------------
// Summary + rendering
// ---------------------------------------------------------------------------

export interface CampaignSummary {
  pins: number;
  unchanged: number;
  changed: number;
  skippedUnsupported: number;
  failed: number;
  identityMismatch: number;
  byField: {
    candleSource: number;
    tvSource: number;
    candleListingStart: number;
    tvListingStart: number;
    tvSymbol: number;
    quoteCurrency: number;
  };
  fabricatedListingStartPins: string[];
  volumeSourceAddedPins: string[];
  changedKeys: string[];
  unchangedKeys: string[];
  skippedKeys: string[];
  failedKeys: string[];
}

export function summarizeDiffs(diffs: PinDiff[]): CampaignSummary {
  const summary: CampaignSummary = {
    pins: diffs.length,
    unchanged: 0, changed: 0, skippedUnsupported: 0, failed: 0, identityMismatch: 0,
    byField: { candleSource: 0, tvSource: 0, candleListingStart: 0, tvListingStart: 0, tvSymbol: 0, quoteCurrency: 0 },
    fabricatedListingStartPins: [],
    volumeSourceAddedPins: [],
    changedKeys: [], unchangedKeys: [], skippedKeys: [], failedKeys: []
  };
  for (const diff of diffs) {
    if (diff.verdict === 'CHANGED') {
      summary.changed += 1;
      summary.changedKeys.push(diff.key);
      for (const change of diff.changes) {
        if (change.slot === 'candle' && change.field === 'source') summary.byField.candleSource += 1;
        else if (change.slot === 'tv' && change.field === 'source') summary.byField.tvSource += 1;
        else if (change.slot === 'candle' && change.field === 'listingStart') summary.byField.candleListingStart += 1;
        else if (change.slot === 'tv' && change.field === 'listingStart') summary.byField.tvListingStart += 1;
        else if (change.field === 'tvSymbol') summary.byField.tvSymbol += 1;
        else if (change.field === 'quoteCurrency') summary.byField.quoteCurrency += 1;
      }
    } else if (diff.verdict === 'UNCHANGED') {
      summary.unchanged += 1;
      summary.unchangedKeys.push(diff.key);
    } else if (diff.verdict === 'SKIPPED_UNSUPPORTED_SOURCE') {
      summary.skippedUnsupported += 1;
      summary.skippedKeys.push(diff.key);
    } else if (diff.verdict === 'IDENTITY_MISMATCH') {
      summary.identityMismatch += 1;
      summary.failedKeys.push(diff.key);
    } else {
      summary.failed += 1;
      summary.failedKeys.push(diff.key);
    }
    if (diff.fabricated.length) summary.fabricatedListingStartPins.push(diff.key);
    if (diff.volumeSourceAdded.length) summary.volumeSourceAddedPins.push(diff.key);
  }
  return summary;
}

export function renderConsoleSummary(summary: CampaignSummary): string {
  return [
    `pinuri citite:            ${summary.pins}`,
    `neschimbate:              ${summary.unchanged}`,
    `SCHIMBATE:                ${summary.changed}`,
    `  din care sursă lumânări schimbată: ${summary.byField.candleSource}`,
    `  din care simbol TradingView schimbat: ${summary.byField.tvSymbol}`,
    `  din care listingStart (candle/tv): ${summary.byField.candleListingStart}/${summary.byField.tvListingStart}`,
    `saltate (sursă nesuportată): ${summary.skippedUnsupported}${summary.skippedKeys.length ? ` (${summary.skippedKeys.join(', ')})` : ''}`,
    `eșuate la recalculare:    ${summary.failed}${summary.failedKeys.length ? ` (${summary.failedKeys.join(', ')})` : ''}`,
    `pinuri cu listingStart suspect fabricat: ${summary.fabricatedListingStartPins.length}`,
    `pinuri cu volum 24h completat de fix (informativ, nu schimbă piața): ${summary.volumeSourceAddedPins.length}`
  ].join('\n');
}

export function renderDiffTable(diffs: PinDiff[], options: { now: number; onlyChanged?: boolean }): string {
  const rows = options.onlyChanged ? diffs.filter(diff => diff.verdict === 'CHANGED') : diffs;
  const header = '| # | coin | verdict | candle vechi (sursă·listing·tvSymbol) | candle nou | tv vechi | tv nou | schimbat? | motiv |';
  const divider = '|---|---|---|---|---|---|---|---|---|';
  const lines = [header, divider];
  rows.forEach((diff, index) => {
    lines.push([
      index + 1,
      `${diff.symbol}:${diff.coinGeckoId}`,
      diff.verdict,
      candidateLabel(diff.old.candle, options.now),
      diff.next ? candidateLabel(diff.next.candle, options.now) : '-',
      candidateLabel(diff.old.tv, options.now),
      diff.next ? candidateLabel(diff.next.tv, options.now) : '-',
      diff.verdict === 'CHANGED' ? 'DA' : 'nu',
      diff.reasons.join('; ')
    ].map(value => String(value).replace(/\|/g, '/')).join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  });
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// CLI options
// ---------------------------------------------------------------------------

export interface ParsedOptions {
  apply: boolean;
  yes: boolean;
  only: string[];
  exclude: string[];
  limit: number | null;
  pinsFile: string | null;
  outDir: string | null;
  passes: number;
  includeUnsupported: boolean;
  allRows: boolean;
  maxPinsInFlight: number;
  quiet: boolean;
}

export function parseArgs(argv: string[]): ParsedOptions {
  const options: ParsedOptions = {
    apply: false, yes: false, only: [], exclude: [], limit: null, pinsFile: null, outDir: null,
    passes: 2, includeUnsupported: false, allRows: false, maxPinsInFlight: 3, quiet: false
  };
  for (const arg of argv) {
    const [flag, rawValue] = arg.split('=');
    const list = () => (rawValue || '').split(',').map(value => value.trim()).filter(Boolean);
    switch (flag) {
      case '--apply': options.apply = true; break;
      case '--yes': options.yes = true; break;
      case '--only': options.only.push(...list()); break;
      case '--exclude': options.exclude.push(...list()); break;
      case '--limit': options.limit = Number(rawValue) || null; break;
      case '--pins': options.pinsFile = rawValue || null; break;
      case '--out-dir': options.outDir = rawValue || null; break;
      case '--passes': options.passes = Math.max(1, Math.min(4, Number(rawValue) || 1)); break;
      case '--include-unsupported': options.includeUnsupported = true; break;
      case '--all-rows': options.allRows = true; break;
      case '--pins-in-flight': options.maxPinsInFlight = Math.max(1, Math.min(6, Number(rawValue) || 1)); break;
      case '--quiet': options.quiet = true; break;
      default:
        if (flag.startsWith('--')) throw new Error(`unknown flag ${flag}`);
    }
  }
  return options;
}

/** Writes happen only with --apply AND --yes; checked before any upstream work. */
export function assertApplyConfirmed(options: ParsedOptions): void {
  if (options.apply && !options.yes) {
    throw new Error('--apply necesită și --yes (scrierea documentelor de pin este explicită)');
  }
}

// ---------------------------------------------------------------------------
// Upstream fetch governor: per-host concurrency, gaps, adaptive 429 slowdown,
// retries with exponential backoff. Wraps globalThis.fetch, so every adapter,
// probe and the resolver itself share one budget.
// ---------------------------------------------------------------------------

interface HostPolicy { concurrency: number; minGapMs: number }

export interface UpstreamStats {
  requests: number;
  retries: number;
  throttled: number;
  serverErrors: number;
  failed: number;
  byHost: Record<string, number>;
}

const DEFAULT_GAP_MS = 250;
/**
 * CoinGecko anonymous tier throttles hard: measured 2026-09-26, one fresh
 * process received 429 on every /coins/{id} and /coins/{id}/tickers call at a
 * 2.2s gap (27 req/min). Two identity calls per coin means 170 calls for 85
 * pins, so the default gap is paced for ~11 req/min; a COINGECKO_API_KEY
 * raises the limit and the gap can be lowered with RE_PIN_COINGECKO_GAP_MS.
 */
const COINGECKO_GAP_MS = 5_500;
const RETRY_TIMEOUT_MS = 20_000;
const REQUEST_TIMEOUT_MS = 25_000;

export class FetchGovernor {
  private original: typeof fetch | null = null;
  private policies = new Map<string, HostPolicy>();
  private state = new Map<string, { running: number; lastStartAt: number; gapMs: number; queue: Array<() => void> }>();
  public stats: UpstreamStats = { requests: 0, retries: 0, throttled: 0, serverErrors: 0, failed: 0, byHost: {} };

  constructor(private options: { maxAttempts: number; hostConcurrency: number; minGapMs: number; coinGeckoGapMs: number; retryTimeoutMs: number; requestTimeoutMs: number; onEvent?: (message: string) => void }) {
    // CoinGecko identity probes are the campaign bottleneck and the most
    // throttle-sensitive host, so it gets its own (serialized) lane; Kraken and
    // Coinbase return 429/418 early and get a wider default gap.
    this.policies.set('api.coingecko.com', { concurrency: 1, minGapMs: options.coinGeckoGapMs });
    this.policies.set('api.kraken.com', { concurrency: Math.min(2, options.hostConcurrency), minGapMs: Math.max(options.minGapMs, 1_200) });
    this.policies.set('api.exchange.coinbase.com', { concurrency: options.hostConcurrency, minGapMs: Math.max(options.minGapMs, 400) });
  }

  private policyFor(host: string): HostPolicy {
    const existing = this.policies.get(host);
    if (existing) return existing;
    const policy: HostPolicy = {
      concurrency: Math.max(1, this.options.hostConcurrency),
      minGapMs: host === 'api.coingecko.com' ? this.options.coinGeckoGapMs : this.options.minGapMs
    };
    this.policies.set(host, policy);
    return policy;
  }

  private runtimeFor(host: string) {
    let runtime = this.state.get(host);
    if (!runtime) {
      runtime = { running: 0, lastStartAt: 0, gapMs: this.policyFor(host).minGapMs, queue: [] };
      this.state.set(host, runtime);
    }
    return runtime;
  }

  private async acquire(host: string) {
    const runtime = this.runtimeFor(host);
    const policy = this.policyFor(host);
    if (runtime.running >= policy.concurrency) {
      await new Promise<void>(resolvePromise => runtime!.queue.push(resolvePromise));
    }
    runtime.running += 1;
    const wait = runtime.lastStartAt + runtime.gapMs - Date.now();
    if (wait > 0) await new Promise(resolvePromise => setTimeout(resolvePromise, wait));
    runtime.lastStartAt = Date.now();
  }

  private release(host: string) {
    const runtime = this.runtimeFor(host);
    runtime.running = Math.max(0, runtime.running - 1);
    const next = runtime.queue.shift();
    if (next) next();
  }

  private eventCounts = new Map<string, number>();

  /** Keep the console readable: first 3 events per host, then every 25th. */
  private emit(host: string, message: string, always = false) {
    if (!this.options.onEvent) return;
    const count = (this.eventCounts.get(host) || 0) + 1;
    this.eventCounts.set(host, count);
    if (always || count <= 3 || count % 25 === 0) this.options.onEvent(`${message}${count > 3 && count % 25 !== 0 ? '' : ` [${count} evenimente ${host}]`}`);
  }

  public snapshot(): UpstreamStats {
    return { ...this.stats, byHost: { ...this.stats.byHost } };
  }

  public delta(before: UpstreamStats): UpstreamDelta {
    return {
      requests: this.stats.requests - before.requests,
      retries: this.stats.retries - before.retries,
      throttled: this.stats.throttled - before.throttled,
      serverErrors: this.stats.serverErrors - before.serverErrors
    };
  }

  public install() {
    if (this.original) return;
    this.original = globalThis.fetch.bind(globalThis);
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => this.governedFetch(input, init)) as typeof fetch;
  }

  private async governedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const original = this.original!;
    let url: string;
    try {
      url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    } catch {
      return original(input as RequestInfo, init);
    }
    let host: string;
    try {
      host = new URL(url).host;
    } catch {
      return original(input as RequestInfo, init);
    }

    const runtime = this.runtimeFor(host);
    const policy = this.policyFor(host);
    this.stats.byHost[host] = (this.stats.byHost[host] || 0) + 1;

    let lastError: unknown;
    for (let attempt = 1; attempt <= this.options.maxAttempts; attempt += 1) {
      await this.acquire(host);
      // The deadline must cover the request only, never our own queue wait:
      // creating the signal before acquire let a busy lane eat it (measured
      // 2026-09-26: 87/89 pins failed as every identity probe timed out while
      // queued). Probe callers pass AbortSignal.timeout(8000) created before
      // queueing, so their signal is replaced by a wider campaign deadline
      // (RE_PIN_REQUEST_TIMEOUT_MS / RE_PIN_RETRY_TIMEOUT_MS).
      const timedInit: RequestInit | undefined = init?.signal
        ? { ...init, signal: AbortSignal.timeout(attempt === 1 ? this.options.requestTimeoutMs : this.options.retryTimeoutMs) }
        : init;
      let response: Response | null = null;
      try {
        this.stats.requests += 1;
        response = await original(input as RequestInfo, timedInit);
      } catch (error) {
        lastError = error;
      } finally {
        this.release(host);
      }

      if (response && response.status !== 429 && response.status !== 418 && response.status < 500) return response;

      if (response) {
        if (response.status === 429 || response.status === 418) {
          this.stats.throttled += 1;
          // Adaptive slowdown: a throttled host gets a wider gap (up to 4x base).
          runtime.gapMs = Math.min(Math.max(runtime.gapMs * 1.6, policy.minGapMs), policy.minGapMs * 4 + 2_000);
          this.emit(host, `[governor] ${host} → HTTP ${response.status}: gap mărit la ${Math.round(runtime.gapMs)}ms (${this.stats.throttled} throttles până acum)`, this.stats.throttled <= 3);
        } else {
          this.stats.serverErrors += 1;
          this.emit(host, `[governor] ${host} → HTTP ${response.status} (${this.stats.serverErrors} erori 5xx până acum)`);
        }
      } else {
        this.emit(host, `[governor] ${host} → eroare de rețea: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
      }

      if (attempt === this.options.maxAttempts) {
        this.stats.failed += 1;
        if (response) return response;
        throw lastError instanceof Error ? lastError : new Error(String(lastError));
      }
      this.stats.retries += 1;
      const retryAfter = Number(response?.headers?.get('retry-after'));
      const backoff = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(30_000, retryAfter * 1_000)
        : Math.min(30_000, 800 * 2 ** (attempt - 1) + Math.floor(Math.random() * 250));
      await new Promise(resolvePromise => setTimeout(resolvePromise, backoff));
    }
    throw new Error('unreachable');
  }
}

// ---------------------------------------------------------------------------
// Pin reading (read-only)
// ---------------------------------------------------------------------------

function projectId(): string {
  return process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || DEFAULT_PROJECT_ID;
}

function firestorePinsCollection() {
  const app = getApps()[0] || initializeApp({ projectId: projectId() });
  return getFirestore(app, PIN_DATABASE).collection(PIN_COLLECTION);
}

export async function readPinsFromFirestore(): Promise<StoredPin[]> {
  const snapshot = await firestorePinsCollection().get();
  return snapshot.docs.map(doc => toStoredPin(doc.id, doc.data() as Record<string, unknown>));
}

export function toStoredPin(key: string, data: Record<string, unknown>): StoredPin {
  const { symbol, coinGeckoId, candle, tv, candidates, resolvedAt, ...extra } = data as Record<string, unknown>;
  return {
    key,
    symbol: String(symbol || key.split(':')[0] || ''),
    coinGeckoId: String(coinGeckoId || key.split(':')[1] || ''),
    candle: (candle as LooseCandidate) || null,
    tv: (tv as LooseCandidate) || null,
    candidates: Array.isArray(candidates) ? candidates as LooseCandidate[] : [],
    resolvedAt: typeof resolvedAt === 'number' ? resolvedAt : undefined,
    extra
  };
}

export function readPinsFromFile(path: string): StoredPin[] {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  const rows: Array<{ id?: string; key?: string; data?: Record<string, unknown> } & Record<string, unknown>> =
    Array.isArray(parsed) ? parsed as never : ((parsed as { pins?: unknown[] }).pins as never) || [];
  return rows.map(row => {
    const key = String((row as { id?: string; key?: string }).id || (row as { key?: string }).key || '');
    const data = (row as { data?: Record<string, unknown> }).data || (row as unknown as Record<string, unknown>);
    return toStoredPin(key, data);
  }).filter(pin => pin.symbol && pin.coinGeckoId);
}

// ---------------------------------------------------------------------------
// Resolver build verification: fail closed if the "new" values would be
// computed by pre-fa1104a code.
// ---------------------------------------------------------------------------

const FIX_MARKERS = ['KRAKEN_OHLC_WINDOW', 'COINBASE_TRUNCATED_CANDLE_COUNT', 'binanceSpotQuoteVolume24h'];

export interface BuildCheck {
  distPath: string;
  distMtime: string;
  markers: Record<string, boolean>;
  ok: boolean;
  details: string;
}

export function repoRoot(): string {
  let current = process.cwd();
  for (let depth = 0; depth < 6; depth += 1) {
    try {
      const pkg = JSON.parse(readFileSync(join(current, 'package.json'), 'utf8')) as { workspaces?: string[] };
      if (Array.isArray(pkg.workspaces) && pkg.workspaces.includes('apps/*')) return current;
    } catch { /* keep walking up */ }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return process.cwd();
}

export function verifyResolverBuild(root = repoRoot()): BuildCheck {
  const distPath = join(root, 'packages/market-data/dist/chart-market-probes.js');
  try {
    const content = readFileSync(distPath, 'utf8');
    const markers = Object.fromEntries(FIX_MARKERS.map(marker => [marker, content.includes(marker)]));
    const ok = Object.values(markers).every(Boolean);
    return {
      distPath,
      distMtime: statSync(distPath).mtime.toISOString(),
      markers,
      ok,
      details: ok ? 'build conține fix-urile fa1104a' : `build FĂRĂ fix-urile fa1104a: ${Object.entries(markers).filter(([, present]) => !present).map(([marker]) => marker).join(', ')} lipsesc`
    };
  } catch (error) {
    return { distPath, distMtime: 'missing', markers: Object.fromEntries(FIX_MARKERS.map(marker => [marker, false])), ok: false, details: `nu pot citi ${distPath}: ${error instanceof Error ? error.message : error}` };
  }
}

// ---------------------------------------------------------------------------
// Recompute
// ---------------------------------------------------------------------------

export interface RecomputeOutcome {
  resolution: LooseResolution | null;
  error?: string;
  upstream: UpstreamDelta;
}

export async function recomputePin(
  service: MarketDataService,
  governor: FetchGovernor,
  pin: StoredPin
): Promise<RecomputeOutcome> {
  const before = governor.snapshot();
  try {
    const resolution = await service.resolveChartMarket(pin.symbol, pin.coinGeckoId) as ChartMarketResolution | null;
    return { resolution: resolution as LooseResolution | null, upstream: governor.delta(before) };
  } catch (error) {
    return {
      resolution: null,
      error: error instanceof Error ? error.message : String(error),
      upstream: governor.delta(before)
    };
  }
}

/** One cheap CoinGecko read before the campaign: shows whether identity probes
 * will be throttled (a throttled identity means RECOMPUTE_FAILED, never a write). */
export async function preflightCoinGecko(): Promise<{ ok: boolean; status: number }> {
  try {
    const response = await fetch('https://api.coingecko.com/api/v3/ping', { signal: AbortSignal.timeout(10_000) });
    return { ok: response.ok, status: response.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

/**
 * Why did a recompute return null? One extra CoinGecko identity read tells
 * "coin absent / identity mismatch" apart from "upstream throttled", which the
 * resolver swallows through safe().
 */
export async function diagnoseRecomputeFailure(symbol: string, coinGeckoId: string): Promise<string> {
  try {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (process.env.COINGECKO_API_KEY) headers['x-cg-demo-api-key'] = process.env.COINGECKO_API_KEY;
    const response = await fetch(
      `https://api.coingecko.com/api/v3/coins/${coinGeckoId}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false`,
      { headers, signal: AbortSignal.timeout(10_000) }
    );
    if (!response.ok) return `identitate CoinGecko indisponibilă (HTTP ${response.status}) — probabil rate limit, reîncearcă`;
    const coin = await response.json() as { id?: string; symbol?: string };
    if (coin.id !== coinGeckoId) return `CoinGecko nu cunoaște id-ul ${coinGeckoId}`;
    if (String(coin.symbol || '').toUpperCase() !== symbol.toUpperCase()) return `CoinGecko leagă ${coinGeckoId} de simbolul ${String(coin.symbol).toUpperCase()}, nu de ${symbol}`;
    return 'identitate OK, dar nicio piață verificată nu a putut fi selectată în acest moment (venue/probe indisponibil)';
  } catch (error) {
    return `diagnostic de identitate eșuat (${error instanceof Error ? error.message : error})`;
  }
}

// ---------------------------------------------------------------------------
// Apply planning (pure) — what --apply would write
// ---------------------------------------------------------------------------

export interface ApplyPlanEntry {
  key: string;
  symbol: string;
  coinGeckoId: string;
  resolution: LooseResolution;
  changes: FieldChange[];
}

export function planApplyWrites(
  diffs: PinDiff[],
  resolutions: Map<string, LooseResolution>,
  options: { includeUnsupported?: boolean } = {}
): { writes: ApplyPlanEntry[]; skipped: Array<{ key: string; verdict: PinVerdict }> } {
  const writes: ApplyPlanEntry[] = [];
  const skipped: Array<{ key: string; verdict: PinVerdict }> = [];
  for (const diff of diffs) {
    const resolution = resolutions.get(diff.key) || null;
    const writable = diff.verdict === 'CHANGED'
      && Boolean(resolution)
      && Boolean(resolution!.candle?.identityVerified);
    if (!writable) {
      skipped.push({ key: diff.key, verdict: diff.verdict });
      continue;
    }
    writes.push({ key: diff.key, symbol: diff.symbol, coinGeckoId: diff.coinGeckoId, resolution: resolution!, changes: diff.changes });
  }
  return { writes, skipped };
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export interface CampaignRun {
  startedAt: number;
  finishedAt: number;
  mode: 'dry-run' | 'apply';
  projectId: string;
  database: string;
  collection: string;
  build: BuildCheck;
  options: ParsedOptions;
  pinsRead: number;
  diffs: PinDiff[];
  summary: CampaignSummary;
  upstream: UpstreamStats;
  notes: string[];
  applyResult?: { written: string[]; verified: string[]; failed: Array<{ key: string; error: string }>; backupPath: string };
}

export async function runCampaign(options: ParsedOptions): Promise<CampaignRun> {
  const startedAt = Date.now();
  assertApplyConfirmed(options);
  const build = verifyResolverBuild();
  if (!build.ok) throw new Error(`Resolverul construit nu conține corecțiile: ${build.details}. Rulează build-ul de pachete înainte de campanie.`);

  const notes: string[] = [];
  let pins = options.pinsFile ? readPinsFromFile(options.pinsFile) : await readPinsFromFirestore();
  notes.push(options.pinsFile ? `pinuri citite din fișier: ${options.pinsFile}` : `pinuri citite read-only din Firestore ${PIN_DATABASE}/${PIN_COLLECTION}`);

  const wanted = new Set(options.only.map(value => value.toUpperCase()));
  const blocked = new Set(options.exclude.map(value => value.toUpperCase()));
  pins = pins.filter(pin => {
    const symbol = pin.symbol.toUpperCase();
    if (wanted.size && !wanted.has(symbol) && !wanted.has(pin.key.toUpperCase())) return false;
    if (blocked.has(symbol) || blocked.has(pin.key.toUpperCase())) return false;
    return true;
  });
  if (options.limit) pins = pins.slice(0, options.limit);
  notes.push(`selecție: ${pins.length} pinuri${options.only.length ? ` (--only=${options.only.join(',')})` : ''}${options.exclude.length ? ` (--exclude=${options.exclude.join(',')})` : ''}`);

  const governor = new FetchGovernor({
    maxAttempts: Math.max(1, Number(process.env.RE_PIN_MAX_ATTEMPTS) || 4),
    hostConcurrency: Math.max(1, Number(process.env.RE_PIN_HOST_CONCURRENCY) || 2),
    minGapMs: Math.max(0, Number(process.env.RE_PIN_MIN_GAP_MS) || DEFAULT_GAP_MS),
    coinGeckoGapMs: Math.max(0, Number(process.env.RE_PIN_COINGECKO_GAP_MS) || COINGECKO_GAP_MS),
    retryTimeoutMs: Math.max(1_000, Number(process.env.RE_PIN_RETRY_TIMEOUT_MS) || RETRY_TIMEOUT_MS),
    requestTimeoutMs: Math.max(1_000, Number(process.env.RE_PIN_REQUEST_TIMEOUT_MS) || REQUEST_TIMEOUT_MS),
    onEvent: message => { if (!options.quiet) console.warn(message); }
  });
  governor.install();
  const preflight = await preflightCoinGecko();
  notes.push(`CoinGecko preflight: HTTP ${preflight.status} (${preflight.ok ? 'disponibil' : 'limitat — campania va fi mai lentă; setează COINGECKO_API_KEY'})`);
  notes.push(`guvernor upstream: concurență ${Math.max(1, Number(process.env.RE_PIN_HOST_CONCURRENCY) || 2)}/host, gap CoinGecko ${Math.max(0, Number(process.env.RE_PIN_COINGECKO_GAP_MS) || COINGECKO_GAP_MS)}ms, gap general ${Math.max(0, Number(process.env.RE_PIN_MIN_GAP_MS) || DEFAULT_GAP_MS)}ms, max ${Math.max(1, Number(process.env.RE_PIN_MAX_ATTEMPTS) || 4)} încercări`);
  notes.push(`timeout-urile adaptoarelor (8s) sunt înlocuite de campanie cu ${Math.max(1_000, Number(process.env.RE_PIN_REQUEST_TIMEOUT_MS) || REQUEST_TIMEOUT_MS)}ms, altfel așteptarea din coada guvernorului consumă bugetul apelantului (măsurat)`);
  notes.push('cererile upstream per pin sunt orientative: pinurile rulează cu concurență ' + options.maxPinsInFlight + ', deci contorul unui pin poate include cereri ale vecinului din lot');

  const resolutions = new Map<string, LooseResolution>();
  const outcomes = new Map<string, RecomputeOutcome>();
  const diffs: PinDiff[] = [];
  const failures: StoredPin[] = [];
  const pending = [...pins];
  const now = Date.now();

  for (let pass = 1; pass <= options.passes && pending.length; pass += 1) {
    // A new service per pass: the resolver's negative cache (1h) would
    // otherwise swallow retries for the very pins that failed transiently.
    const service = new MarketDataService();
    const queue = [...pending];
    pending.length = 0;
    const batchSize = options.maxPinsInFlight;
    for (let index = 0; index < queue.length; index += batchSize) {
      const batch = queue.slice(index, index + batchSize);
      const settled = await Promise.allSettled(batch.map(async pin => ({ pin, outcome: await recomputePin(service, governor, pin) })));
      for (const result of settled) {
        if (result.status !== 'fulfilled') continue;
        const { pin, outcome } = result.value;
        outcomes.set(pin.key, outcome);
        if (!outcome.resolution || !outcome.resolution.candle?.identityVerified) {
          failures.push(pin);
          resolutions.delete(pin.key);
          continue;
        }
        resolutions.set(pin.key, outcome.resolution);
      }
      if (!options.quiet) {
        const done = Math.min(queue.length, index + batch.length);
        console.log(`[pass ${pass}] ${done}/${queue.length} pinuri recalculate (upstream total: ${governor.stats.requests} cereri, ${governor.stats.throttled} × 429, ${governor.stats.retries} retry-uri)`);
      }
      await new Promise(resolvePromise => setTimeout(resolvePromise, 1_000));
    }
    if (pass < options.passes && failures.length) {
      const pauseMs = Math.max(5_000, Number(process.env.RE_PIN_RETRY_PAUSE_MS) || 60_000);
      console.log(`[pass ${pass}] ${failures.length} pinuri au eșuat; a doua trecere după ${Math.round(pauseMs / 1000)}s (throttle CoinGecko are nevoie de fereastră nouă)...`);
      await new Promise(resolvePromise => setTimeout(resolvePromise, pauseMs));
    }
  }

  for (const pin of pins) {
    const resolution = resolutions.get(pin.key) || null;
    let error: string | undefined;
    if (!resolution) {
      error = await diagnoseRecomputeFailure(pin.symbol, pin.coinGeckoId);
    }
    const diff = diffPin({ ...pin }, resolution, {
      now,
      includeUnsupported: options.includeUnsupported,
      error,
      upstream: outcomes.get(pin.key)?.upstream
    });
    diffs.push(diff);
  }
  diffs.sort((left, right) => {
    const rank: Record<PinVerdict, number> = { CHANGED: 0, RECOMPUTE_FAILED: 1, IDENTITY_MISMATCH: 2, SKIPPED_UNSUPPORTED_SOURCE: 3, UNCHANGED: 4 };
    return rank[left.verdict] - rank[right.verdict] || left.symbol.localeCompare(right.symbol);
  });

  const summary = summarizeDiffs(diffs);
  const run: CampaignRun = {
    startedAt,
    finishedAt: Date.now(),
    mode: options.apply ? 'apply' : 'dry-run',
    projectId: projectId(),
    database: PIN_DATABASE,
    collection: PIN_COLLECTION,
    build,
    options,
    pinsRead: pins.length,
    diffs,
    summary,
    upstream: governor.snapshot(),
    notes
  };

  if (options.apply) {
    if (!options.yes) throw new Error('--apply necesită și --yes (scriere în documentele de pin)');
    const { writes } = planApplyWrites(diffs, resolutions, { includeUnsupported: options.includeUnsupported });
    run.applyResult = await applyWrites(writes, pins, options);
  }
  return run;
}

/**
 * Write path (--apply). Same document shape the app reads; merge:true keeps
 * audit/health fields written by other writers. Backs up the old documents
 * first, then reads every document back and verifies it.
 */
async function applyWrites(writes: ApplyPlanEntry[], pins: StoredPin[], options: ParsedOptions): Promise<NonNullable<CampaignRun['applyResult']>> {
  const outDir = options.outDir || join(repoRoot(), 'tmp/re-pin');
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = join(outDir, `apply-backup-${stamp}.json`);
  writeFileSync(backupPath, JSON.stringify({
    backedUpAt: Date.now(),
    projectId: projectId(),
    database: PIN_DATABASE,
    collection: PIN_COLLECTION,
    docs: pins.map(pin => ({ key: pin.key, data: pin }))
  }, null, 2));

  const collection = firestorePinsCollection();
  const written: string[] = [];
  const verified: string[] = [];
  const failed: Array<{ key: string; error: string }> = [];
  for (const entry of writes) {
    try {
      const ref = collection.doc(entry.key);
      await ref.set(entry.resolution, { merge: true });
      written.push(entry.key);
      const after = await ref.get();
      const data = after.data() as LooseResolution | undefined;
      const matches = Boolean(data)
        && data!.candle?.source === entry.resolution.candle?.source
        && data!.tv?.tvSymbol === entry.resolution.tv?.tvSymbol
        && data!.resolvedAt === entry.resolution.resolvedAt;
      if (matches) verified.push(entry.key);
      else failed.push({ key: entry.key, error: 'read-back nu confirmă valorile scrise' });
    } catch (error) {
      failed.push({ key: entry.key, error: error instanceof Error ? error.message : String(error) });
    }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 400));
  }
  return { written, verified, failed, backupPath };
}

export function renderRunReport(run: CampaignRun): string {
  const lines: string[] = [];
  lines.push(`# Re-pin chart-market — ${run.mode === 'apply' ? 'APLICARE' : 'DRY-RUN'}`);
  lines.push('');
  lines.push(`- rulat: ${new Date(run.startedAt).toISOString()} → ${new Date(run.finishedAt).toISOString()}`);
  lines.push(`- Firestore: proiect \`${run.projectId}\`, baza \`${run.database}\`, colecția \`${run.collection}\`${run.mode === 'dry-run' ? ' (doar citire)' : ''}`);
  lines.push(`- resolver: \`${run.build.distPath}\` (build ${run.build.distMtime}; ${run.build.details})`);
  lines.push(`- upstream: ${run.upstream.requests} cereri, ${run.upstream.throttled} × 429, ${run.upstream.serverErrors} × 5xx, ${run.upstream.retries} retry-uri`);
  lines.push(`- ${run.notes.join('; ')}`);
  lines.push('');
  lines.push('## Sumar');
  lines.push('');
  lines.push('```');
  lines.push(renderConsoleSummary(run.summary));
  lines.push('```');
  lines.push('');
  lines.push('## Pinuri care se schimbă');
  lines.push('');
  lines.push(renderDiffTable(run.diffs.filter(diff => diff.verdict === 'CHANGED'), { now: run.finishedAt, onlyChanged: false }) || '_(niciunul)_');
  lines.push('');
  lines.push('## Pinuri cu volum 24h completat de fix-ul fa1104a (informativ — piața aleasă nu se schimbă)');
  lines.push('');
  const volumeInfo = run.diffs.filter(diff => diff.volumeSourceAdded.length);
  lines.push(volumeInfo.length
    ? volumeInfo.map(diff => `\`${diff.key}\` (${diff.volumeSourceAdded.map(entry => `${entry.slot}:${entry.source}=${Math.round(entry.volume24hQuote).toLocaleString('en-US')}`).join(', ')})`).join('; ')
    : '_(niciunul)_');
  lines.push('');
  lines.push('## Pinuri neschimbate');
  lines.push('');
  lines.push(run.summary.unchangedKeys.length ? run.summary.unchangedKeys.map(key => `\`${key}\``).join(', ') : '_(niciunul)_');
  lines.push('');
  if (run.summary.skippedKeys.length || run.summary.failedKeys.length) {
    lines.push('## Neincluse în scriere');
    lines.push('');
    lines.push(renderDiffTable(run.diffs.filter(diff => diff.verdict !== 'CHANGED' && diff.verdict !== 'UNCHANGED'), { now: run.finishedAt, onlyChanged: false }));
    lines.push('');
  }
  if (run.applyResult) {
    lines.push('## Scriere (--apply)');
    lines.push('');
    lines.push(`- backup pinuri vechi: \`${run.applyResult.backupPath}\``);
    lines.push(`- scrise: ${run.applyResult.written.length}; verificate prin read-back: ${run.applyResult.verified.length}; eșuate: ${run.applyResult.failed.length}`);
    if (run.applyResult.failed.length) lines.push(`- erori: ${run.applyResult.failed.map(item => `${item.key} (${item.error})`).join('; ')}`);
    lines.push('');
  }
  return lines.join('\n');
}

export function writeRunArtifacts(run: CampaignRun, outDir: string): { jsonPath: string; markdownPath: string } {
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date(run.finishedAt).toISOString().replace(/[:.]/g, '-');
  const base = `${run.mode === 'apply' ? 'apply' : 'dry-run'}-${stamp}`;
  const jsonPath = join(outDir, `${base}.json`);
  const markdownPath = join(outDir, `${base}.md`);
  writeFileSync(jsonPath, JSON.stringify({
    ...run,
    pins: undefined
  }, null, 2));
  writeFileSync(markdownPath, renderRunReport(run));
  return { jsonPath, markdownPath };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export const APPLY_COMMAND = 'cd "apps/api" && npx tsx scripts/re-pin-chart-markets.ts --apply --yes';

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const root = repoRoot();
  const outDir = options.outDir || join(root, 'tmp/re-pin');
  console.log(options.apply
    ? 'MODE: APPLY — se scriu documente de pin în Firestore.'
    : 'MODE: DRY-RUN (doar citire) — nicio scriere în Firestore.');
  console.log(`repo: ${root}`);

  const run = await runCampaign(options);
  const artifacts = writeRunArtifacts(run, outDir);

  console.log('');
  console.log(renderConsoleSummary(run.summary));
  console.log('');
  console.log(renderDiffTable(run.diffs.filter(diff => diff.verdict === 'CHANGED'), { now: run.finishedAt, onlyChanged: false }));
  if (options.allRows) {
    console.log('');
    console.log(renderDiffTable(run.diffs, { now: run.finishedAt, onlyChanged: false }));
  }
  console.log('');
  console.log(`artefacte: ${artifacts.markdownPath}`);
  console.log(`           ${artifacts.jsonPath}`);
  if (options.apply) {
    const result = run.applyResult!;
    console.log(`scrise: ${result.written.length}, verificate: ${result.verified.length}, eșuate: ${result.failed.length}, backup: ${result.backupPath}`);
    if (result.failed.length) process.exitCode = 1;
  } else {
    console.log('');
    console.log('Nicio scriere. Pentru aplicare (după verificarea tabelului):');
    console.log(`  ${APPLY_COMMAND}`);
  }
}

// Direct-run detection without import.meta (works under tsx in both module modes).
const invokedDirectly = Boolean(process.argv[1] && /re-pin-chart-markets\.(ts|mts|cts|js|mjs|cjs)$/.test(process.argv[1]));
if (invokedDirectly) {
  main().catch(error => {
    console.error(error instanceof Error ? error.stack || error.message : error);
    process.exit(1);
  });
}
