import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ChartMarketResolution,
  ChartMarketResolver,
  ChartMarketResolverDeps
} from './chart-market-resolver.js';
import { getChartMarketDiagnosticsSnapshot, resetChartMarketDiagnostics } from './chart-market-diagnostics.js';

const DAY = 24 * 3_600_000;
const T = (iso: string) => new Date(iso).getTime();

interface Spec {
  binanceSpot?: boolean;
  binanceListing?: number | null;
  mexc?: { listing: number | null; volume: number | null };
  bybit?: { listing: number | null; volume: number | null };
  verifiedMarkets?: string[];
  /** Result of the live-listing check; 'throw' simulates an unavailable venue list. */
  listed?: boolean | null | 'throw';
}

interface Counters {
  probes: string[];
  checks: string[];
  merges: unknown[];
  replaces: Array<{ key: string; expected: { resolvedAt: number } }>;
  sets: string[];
}

const counters = (): Counters => ({ probes: [], checks: [], merges: [], replaces: [], sets: [] });

function buildDeps(spec: Spec, seen: Counters): ChartMarketResolverDeps {
  const record = <T,>(name: string, value: T) => { seen.probes.push(name); return value; };
  return {
    isOnBinanceSpot: async () => record('isOnBinanceSpot', !!spec.binanceSpot),
    binanceSpotFirstDailyTs: async () => record('binanceSpotFirstDailyTs', spec.binanceListing ?? T('2021-01-01')),
    isOnBinanceFutures: async () => record('isOnBinanceFutures', false),
    binanceFuturesFirstDailyTs: async () => null,
    binanceFuturesQuoteVolume24h: async () => null,
    isOnBybitSpot: async () => record('isOnBybitSpot', !!spec.bybit),
    bybitFirstDailyTs: async () => spec.bybit?.listing ?? null,
    bybitQuoteVolume24h: async () => spec.bybit?.volume ?? null,
    okxSpotInstrument: async () => null,
    okxQuoteVolume24h: async () => null,
    isOnHyperliquid: async () => record('isOnHyperliquid', false),
    hyperliquidFirstDailyTs: async () => null,
    hyperliquidQuoteVolume24h: async () => null,
    isOnCoinbase: async () => record('isOnCoinbase', false),
    coinbaseFirstDailyTs: async () => null,
    coinbaseQuoteVolume24h: async () => null,
    isOnKraken: async () => record('isOnKraken', false),
    krakenFirstDailyTs: async () => null,
    krakenQuoteVolume24h: async () => null,
    isOnMexcSpot: async () => record('isOnMexcSpot', !!spec.mexc),
    mexcFirstDailyTs: async () => spec.mexc?.listing ?? null,
    mexcQuoteVolume24h: async () => spec.mexc?.volume ?? null,
    verifiedIdentity: async () => record('verifiedIdentity', {
      markets: new Set(spec.verifiedMarkets || []),
      referencePrice: 1,
      knownStart: null
    }),
    candidateLastPrice: async candidate => record(`candidateLastPrice:${candidate.source}`, 1),
    isCandidateStillListed: async candidate => {
      seen.checks.push(candidate.source);
      if (spec.listed === 'throw') throw new Error('HTTP 503');
      return spec.listed === undefined ? true : spec.listed;
    }
  };
}

function makeStore(pin: ChartMarketResolution, seen: Counters, options: { replace?: boolean; merge?: boolean } = {}) {
  const store: {
    get(key: string): Promise<ChartMarketResolution | null>;
    set(key: string, value: ChartMarketResolution): Promise<void>;
    replace?(key: string, value: ChartMarketResolution, expected: { resolvedAt: number }): Promise<ChartMarketResolution | null>;
    mergeAudit?(key: string, audit: unknown): Promise<void>;
  } = {
    get: async () => pin,
    set: async () => { seen.sets.push('set'); throw new Error('already exists'); }
  };
  if (options.replace !== false) {
    store.replace = async (key, value, expected) => {
      seen.replaces.push({ key, expected });
      return value;
    };
  }
  if (options.merge !== false) {
    store.mergeAudit = async (key, audit) => { seen.merges.push({ key, audit }); };
  }
  return store;
}

/** Seeds a real pinned resolution through the resolver itself (no Firestore). */
async function seedPin(spec: Spec, seen: Counters): Promise<ChartMarketResolution> {
  const stored = new Map<string, ChartMarketResolution>();
  const resolver = new ChartMarketResolver(buildDeps(spec, counters()));
  resolver.setStore({ get: async key => stored.get(key) || null, set: async (key, value) => { stored.set(key, value); } });
  const resolution = await resolver.resolve('PONS', 'pons');
  assert.ok(resolution, JSON.stringify(spec));
  return resolution;
}

describe('chart-market pin health and healing', () => {
  it('serves a fresh pin without re-checking the venue', async () => {
    resetChartMarketDiagnostics();
    const pin = await seedPin({ mexc: { listing: T('2026-07-15'), volume: 100 }, verifiedMarkets: ['mexc_spot'] }, counters());
    const seen = counters();
    const resolver = new ChartMarketResolver(buildDeps({ mexc: { listing: T('2026-07-15'), volume: 100 }, verifiedMarkets: ['mexc_spot'], listed: true }, seen));
    resolver.setStore(makeStore(pin, seen));
    const served = await resolver.resolve('PONS', 'pons');
    assert.deepEqual(served, pin);
    assert.deepEqual(seen.checks, []);
    assert.deepEqual(seen.merges, []);
    assert.equal(getChartMarketDiagnosticsSnapshot().pinHits, 1);
  });

  it('re-validates an aged pin, confirms the pair is listed and records a healthy audit', async () => {
    resetChartMarketDiagnostics();
    const pin = await seedPin({ mexc: { listing: T('2026-07-15'), volume: 100 }, verifiedMarkets: ['mexc_spot'] }, counters());
    pin.audit = { ...pin.audit, lastCheckedAt: Date.now() - 8 * DAY };
    const seen = counters();
    const resolver = new ChartMarketResolver(buildDeps({ mexc: { listing: T('2026-07-15'), volume: 100 }, verifiedMarkets: ['mexc_spot'], listed: true }, seen));
    resolver.setStore(makeStore(pin, seen));
    const served = await resolver.resolve('PONS', 'pons');
    assert.equal(served?.candle?.source, 'mexc_spot'); // live pins keep their venue
    assert.deepEqual(seen.checks, ['mexc_spot']);
    assert.equal(seen.merges.length, 1);
    assert.deepEqual(seen.merges[0], { key: 'PONS:pons', audit: { lastCheckedAt: served?.audit?.lastCheckedAt, health: 'healthy', reason: 'pair-listed', failedChecks: 0 } });
    const snapshot = getChartMarketDiagnosticsSnapshot();
    assert.equal(snapshot.pinHealth.byHealth.healthy, 1);
    assert.equal(snapshot.heals, 0);
  });

  it('heals a dead pin: re-resolves, overwrites with audit fields and keeps the identity guard', async () => {
    resetChartMarketDiagnostics();
    const pin = await seedPin({ mexc: { listing: T('2026-07-15'), volume: 100 }, verifiedMarkets: ['mexc_spot'] }, counters());
    pin.audit = { ...pin.audit, lastCheckedAt: Date.now() - 8 * DAY };
    const seen = counters();
    const store = makeStore(pin, seen);
    const resolver = new ChartMarketResolver(buildDeps({
      binanceSpot: true, binanceListing: T('2021-01-01'), verifiedMarkets: ['binance_spot'], listed: false
    }, seen));
    resolver.setStore(store);
    const served = await resolver.resolve('PONS', 'pons');
    assert.equal(served?.candle?.source, 'binance_spot'); // re-resolved to the live venue
    assert.equal(served?.audit?.reason, 'repinned-after-delisting');
    assert.equal(served?.audit?.previousCandleSource, 'mexc_spot');
    assert.equal(typeof served?.audit?.repinnedAt, 'number');
    assert.equal(seen.replaces.length, 1);
    assert.equal(seen.replaces[0].expected.resolvedAt, pin.resolvedAt);
    assert.equal(seen.sets.length, 0);
    const snapshot = getChartMarketDiagnosticsSnapshot();
    assert.equal(snapshot.heals, 1);
    assert.equal(snapshot.pinHealth.byHealth.healthy, 1);
    assert.equal(snapshot.recentResolutions.at(-1)?.healed, true);
  });

  it('accepts the pin another instance already healed (guarded replace)', async () => {
    resetChartMarketDiagnostics();
    const pin = await seedPin({ mexc: { listing: T('2026-07-15'), volume: 100 }, verifiedMarkets: ['mexc_spot'] }, counters());
    pin.audit = { ...pin.audit, lastCheckedAt: Date.now() - 8 * DAY };
    const winner = await seedPin({ bybit: { listing: T('2024-10-28'), volume: 5_000_000 }, verifiedMarkets: ['bybit_spot'] }, counters());
    const seen = counters();
    const store = makeStore(pin, seen);
    store.replace = async (key, value, expected) => { seen.replaces.push({ key, expected }); return winner; };
    const resolver = new ChartMarketResolver(buildDeps({
      binanceSpot: true, verifiedMarkets: ['binance_spot'], listed: false
    }, seen));
    resolver.setStore(store);
    const served = await resolver.resolve('PONS', 'pons');
    assert.deepEqual(served, winner);
  });

  it('keeps the old pin and marks it dead when no replacement market exists', async () => {
    resetChartMarketDiagnostics();
    const pin = await seedPin({ mexc: { listing: T('2026-07-15'), volume: 100 }, verifiedMarkets: ['mexc_spot'] }, counters());
    pin.audit = { ...pin.audit, lastCheckedAt: Date.now() - 8 * DAY, failedChecks: 1 };
    const seen = counters();
    const resolver = new ChartMarketResolver(buildDeps({ verifiedMarkets: [], listed: false }, seen));
    resolver.setStore(makeStore(pin, seen));
    const served = await resolver.resolve('PONS', 'pons');
    assert.deepEqual(served, pin);
    assert.equal(served?.audit?.health, 'dead');
    assert.equal(served?.audit?.failedChecks, 2);
    assert.equal(seen.merges.length, 1);
    assert.equal(getChartMarketDiagnosticsSnapshot().pinHealth.byHealth.dead, 1);
  });

  it('marks an unavailable listing check as unverified and backs off before retrying', async () => {
    resetChartMarketDiagnostics();
    const pin = await seedPin({ mexc: { listing: T('2026-07-15'), volume: 100 }, verifiedMarkets: ['mexc_spot'] }, counters());
    pin.audit = { ...pin.audit, lastCheckedAt: Date.now() - 8 * DAY, failedChecks: 0 };
    const seen = counters();
    const resolver = new ChartMarketResolver(buildDeps({
      mexc: { listing: T('2026-07-15'), volume: 100 }, verifiedMarkets: ['mexc_spot'], listed: 'throw'
    }, seen), { pinMaxAgeMs: DAY, pinRecheckMs: 10 * 60_000 });
    resolver.setStore(makeStore(pin, seen));
    const first = await resolver.resolve('PONS', 'pons');
    assert.equal(first?.candle?.source, 'mexc_spot');
    assert.equal(first?.audit?.health, 'unverified');
    assert.equal(first?.audit?.failedChecks, 1);
    assert.match(String(first?.audit?.reason), /listing-check-failed: HTTP 503/);
    assert.deepEqual(seen.checks, ['mexc_spot']);
    // A second call inside the re-check window does not hammer the venue again.
    await resolver.resolve('PONS', 'pons');
    assert.deepEqual(seen.checks, ['mexc_spot']);
    assert.equal(getChartMarketDiagnosticsSnapshot().failuresBySource.mexc_spot, 1);
    // Past the window the check runs again.
    pin.audit = { ...pin.audit, lastCheckedAt: Date.now() - 11 * 60_000 };
    await resolver.resolve('PONS', 'pons');
    assert.deepEqual(seen.checks, ['mexc_spot', 'mexc_spot']);
  });

  it('heals in memory when the pin store cannot overwrite documents', async () => {
    resetChartMarketDiagnostics();
    const pin = await seedPin({ mexc: { listing: T('2026-07-15'), volume: 100 }, verifiedMarkets: ['mexc_spot'] }, counters());
    pin.audit = { ...pin.audit, lastCheckedAt: Date.now() - 8 * DAY };
    const seen = counters();
    const store = makeStore(pin, seen, { replace: false });
    const resolver = new ChartMarketResolver(buildDeps({
      binanceSpot: true, verifiedMarkets: ['binance_spot'], listed: false
    }, seen));
    resolver.setStore(store);
    const served = await resolver.resolve('PONS', 'pons');
    assert.equal(served?.candle?.source, 'binance_spot');
    assert.equal(seen.sets.length, 1); // best-effort create-only write is attempted and recorded
    assert.equal(getChartMarketDiagnosticsSnapshot().heals, 1);
    assert.equal(getChartMarketDiagnosticsSnapshot().failuresBySource.pin, 1);
  });

  it('validates legacy pins without audit fields using their resolvedAt', async () => {
    resetChartMarketDiagnostics();
    const pin = await seedPin({ mexc: { listing: T('2026-07-15'), volume: 100 }, verifiedMarkets: ['mexc_spot'] }, counters());
    delete pin.audit; // production documents written before the audit field existed
    const freshSeen = counters();
    const fresh = new ChartMarketResolver(buildDeps({ mexc: { listing: T('2026-07-15'), volume: 100 }, verifiedMarkets: ['mexc_spot'], listed: true }, freshSeen));
    fresh.setStore(makeStore(pin, freshSeen));
    await fresh.resolve('PONS', 'pons');
    assert.deepEqual(freshSeen.checks, []); // resolved moments ago: nothing to validate yet
    pin.resolvedAt = Date.now() - 30 * DAY;
    const oldSeen = counters();
    const old = new ChartMarketResolver(buildDeps({ mexc: { listing: T('2026-07-15'), volume: 100 }, verifiedMarkets: ['mexc_spot'], listed: true }, oldSeen));
    old.setStore(makeStore(pin, oldSeen));
    const served = await old.resolve('PONS', 'pons');
    assert.deepEqual(oldSeen.checks, ['mexc_spot']);
    assert.equal(served?.audit?.health, 'healthy');
    assert.equal(served?.candle?.source, 'mexc_spot');
  });

  it('never re-pins on an unverifiable signal', async () => {
    resetChartMarketDiagnostics();
    const pin = await seedPin({ mexc: { listing: T('2026-07-15'), volume: 100 }, verifiedMarkets: ['mexc_spot'] }, counters());
    pin.audit = { ...pin.audit, lastCheckedAt: Date.now() - 8 * DAY };
    const seen = counters();
    const deps = buildDeps({ binanceSpot: true, verifiedMarkets: ['binance_spot'], listed: true }, seen);
    delete deps.isCandidateStillListed; // deployment without the listing check
    const resolver = new ChartMarketResolver(deps);
    resolver.setStore(makeStore(pin, seen));
    const served = await resolver.resolve('PONS', 'pons');
    assert.deepEqual(served, pin);
    assert.deepEqual(seen.replaces, []);
    assert.deepEqual(seen.merges, []);
  });
});

describe('reviewed STONK link-only pin upgrade',()=>{
  const pin:ChartMarketResolution={symbol:'STONK',coinGeckoId:'stonk-3',candle:null,tv:{source:'gate_spot',exchange:'GATE',providerSymbol:'STONK_USDT',tvSymbol:'GATE:STONKUSDT',quoteCurrency:'USDT',listingStart:null,volume24hQuote:null,candleCapable:false,identityVerified:true},candidates:[],resolvedAt:123};
  it('replaces only with an independently verified MEXC spot candidate',async()=>{
    const seen=counters();const resolver=new ChartMarketResolver(buildDeps({mexc:{listing:T('2026-08-05'),volume:100},verifiedMarkets:['mexc_spot']},seen));resolver.setStore(makeStore(pin,seen));
    const r=await resolver.resolve('STONK','stonk-3');assert.equal(r?.candle?.source,'mexc_spot');assert.equal(seen.replaces.length,1);assert.equal(r?.audit?.reason,'reviewed-contract-candle-upgrade');
  });
  it('keeps the link-only pin if no exact verified candle source exists',async()=>{
    const seen=counters();const resolver=new ChartMarketResolver(buildDeps({mexc:{listing:T('2026-08-05'),volume:100},verifiedMarkets:[]},seen));resolver.setStore(makeStore(pin,seen));
    const r=await resolver.resolve('STONK','stonk-3');assert.equal(r?.candle,null);assert.equal(seen.replaces.length,0);
  });
});
