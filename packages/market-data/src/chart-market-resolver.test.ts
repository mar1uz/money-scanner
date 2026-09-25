import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ChartMarketResolver, ChartMarketResolverDeps } from './chart-market-resolver.js';
import { aggregate4hTo8h } from './adapters/klines.js';
import { Candle } from '@money-scanner/shared';

const DAY = 24 * 3_600_000;
const T = (iso: string) => new Date(iso).getTime();

interface StubSpec {
  binanceSpot?: boolean;
  binanceFutures?: boolean;
  bybit?: { listing: number | null; volume: number | null };
  okx?: { listing: number | null; volume: number | null };
  coinbase?: { listing: number | null; volume: number | null };
  kraken?: { listing: number | null; volume: number | null };
  hyperliquid?: { listing: number | null; volume: number | null };
  binanceListing?: number | null;
  mexc?: { listing: number | null; volume: number | null };
  xt?: { listing: number | null; volume: number | null };
  verifiedMarkets?: string[];
  referencePrice?: number;
  candidatePrice?: number | null;
  knownStart?: number | null;
}

function makeDeps(spec: StubSpec, calls: string[] = []): ChartMarketResolverDeps {
  return {
    isOnBinanceSpot: async () => { calls.push('binanceSpot'); return !!spec.binanceSpot; },
    binanceSpotFirstDailyTs: async () => spec.binanceListing ?? null,
    isOnBinanceFutures: async () => !!spec.binanceFutures,
    binanceFuturesFirstDailyTs: async () => null,
    binanceFuturesQuoteVolume24h: async () => null,
    isOnBybitSpot: async () => !!spec.bybit,
    bybitFirstDailyTs: async () => spec.bybit?.listing ?? null,
    bybitQuoteVolume24h: async () => spec.bybit?.volume ?? null,
    okxSpotInstrument: async () => spec.okx ? { instId: 'X-USDT', listTime: spec.okx.listing } : null,
    okxQuoteVolume24h: async () => spec.okx?.volume ?? null,
    isOnHyperliquid: async () => !!spec.hyperliquid,
    hyperliquidFirstDailyTs: async () => spec.hyperliquid?.listing ?? null,
    hyperliquidQuoteVolume24h: async () => spec.hyperliquid?.volume ?? null,
    isOnCoinbase: async () => !!spec.coinbase,
    coinbaseFirstDailyTs: async () => spec.coinbase?.listing ?? null,
    coinbaseQuoteVolume24h: async () => spec.coinbase?.volume ?? null,
    isOnKraken: async () => !!spec.kraken,
    krakenFirstDailyTs: async () => spec.kraken?.listing ?? null,
    krakenQuoteVolume24h: async () => spec.kraken?.volume ?? null,
    isOnXtSpot: async (_, coinId) => !!spec.xt && coinId === 'graphite-protocol',
    xtFirstDailyTs: async () => spec.xt?.listing ?? null,
    xtQuoteVolume24h: async () => spec.xt?.volume ?? null,
    isOnMexcSpot: async () => !!spec.mexc,
    mexcFirstDailyTs: async () => spec.mexc?.listing ?? null,
    mexcQuoteVolume24h: async () => spec.mexc?.volume ?? null,
    verifiedIdentity: async () => ({ markets: new Set(spec.verifiedMarkets || []), referencePrice: spec.referencePrice ?? 1, knownStart: spec.knownStart ?? null }),
    candidateLastPrice: async () => spec.candidatePrice === undefined ? 1 : spec.candidatePrice
  };
}

describe('ChartMarketResolver', () => {
  it('requires an exact coin ID and rejects a ticker not bound to that asset', async () => {
    const calls: string[] = [];
    const resolver = new ChartMarketResolver(makeDeps({ binanceSpot: true }, calls));
    assert.equal(await resolver.resolve('BTC'), null);
    assert.equal(await resolver.resolve('BTC', 'bitcoin'), null);
    assert.deepEqual(calls, []);
  });

  it('picks the longest-history highest-volume pair for a non-Binance asset (GRASS case)', async () => {
    const resolver = new ChartMarketResolver(makeDeps({
      bybit: { listing: T('2024-10-28'), volume: 1_500_000 },
      okx: { listing: T('2026-04-21'), volume: 400_000 },
      coinbase: { listing: T('2025-03-01'), volume: 700_000 },
      kraken: { listing: T('2025-01-27'), volume: 300_000 },
      hyperliquid: { listing: T('2024-10-28'), volume: 200_000 },
      verifiedMarkets: ['bybit_spot', 'okx_spot', 'coinbase', 'kraken']
    }));
    const resolution = await resolver.resolve('GRASS', 'grass');
    assert.ok(resolution);
    assert.equal(resolution?.candle?.source, 'bybit_spot');
    assert.equal(resolution?.tv?.tvSymbol, 'BYBIT:GRASSUSDT');
    assert.equal(resolution?.candle?.providerSymbol, 'GRASSUSDT');
  });

  it('prefers the clearly older listing even with lower volume', async () => {
    const resolver = new ChartMarketResolver(makeDeps({
      bybit: { listing: T('2025-06-01'), volume: 5_000_000 },
      kraken: { listing: T('2021-01-01'), volume: 10_000 },
      verifiedMarkets: ['bybit_spot', 'kraken']
    }));
    const resolution = await resolver.resolve('OLD', 'old');
    assert.equal(resolution?.candle?.source, undefined); // the much shorter history fails the coverage threshold
    assert.equal(resolution?.tv?.exchange, 'KRAKEN');
  });

  it('does not bind a Hyperliquid spot ticker to the perp candle adapter', async () => {
    const resolver = new ChartMarketResolver(makeDeps({ hyperliquid: { listing: T('2024-01-01'), volume: 100 } }));
    assert.equal(await resolver.resolve('ONLYHL', 'onlyhl'), null);
  });

  it('returns null when no major exchange lists the asset', async () => {
    const resolver = new ChartMarketResolver(makeDeps({}));
    assert.equal(await resolver.resolve('NOPE', 'nope'), null);
  });

  it('caches resolutions and does not re-probe', async () => {
    const calls: string[] = [];
    const resolver = new ChartMarketResolver(makeDeps({ binanceSpot: true, verifiedMarkets: ['binance_spot'] }, calls));
    await resolver.resolve('BTC', 'bitcoin');
    await resolver.resolve('BTC', 'bitcoin');
    assert.deepEqual(calls, ['binanceSpot']);
  });

  it('pins an exact identity and refuses a second unverified exchange', async () => {
    const saved = new Map<string, import('./chart-market-resolver.js').ChartMarketResolution>();
    const store = { get: async (key: string) => saved.get(key) || null, set: async (key: string, value: import('./chart-market-resolver.js').ChartMarketResolution) => { saved.set(key, value); } };
    const first = new ChartMarketResolver(makeDeps({ mexc: { listing: T('2026-07-15'), volume: 100 }, verifiedMarkets: ['mexc_spot'] }));
    first.setStore(store);
    const original = await first.resolve('PONS', 'pons');
    assert.equal(original?.candle?.source, 'mexc_spot');
    const second = new ChartMarketResolver(makeDeps({ binanceSpot: true, verifiedMarkets: ['binance_spot'] }));
    second.setStore(store);
    assert.deepEqual(await second.resolve('PONS', 'pons'), original);
    const wrongIdentity = await second.resolve('PONS', 'different-pons');
    assert.notDeepEqual(wrongIdentity, original); // distinct coin IDs never share a pin
  });

  it('coalesces a same-instance resolution and keeps an atomic write-race winner', async () => {
    const calls: string[] = [];
    const deps = makeDeps({ mexc: { listing: T('2026-07-15'), volume: 100 }, verifiedMarkets: ['mexc_spot'] }, calls);
    let reads = 0, writes = 0;
    const resolver = new ChartMarketResolver(deps);
    resolver.setStore({
      get: async () => { reads++; return null; },
      set: async () => { writes++; }
    });
    const [a, b] = await Promise.all([resolver.resolve('PONS', 'pons'), resolver.resolve('PONS', 'pons')]);
    assert.deepEqual(a, b);
    assert.equal(reads, 1);
    assert.equal(writes, 1);
    assert.deepEqual(calls, ['binanceSpot']);
  });

  it('reads the winner of a cross-instance create race', async () => {
    const deps = makeDeps({ mexc: { listing: T('2026-07-15'), volume: 100 }, verifiedMarkets: ['mexc_spot'] });
    const seeded = await new ChartMarketResolver(deps).resolve('PONS', 'pons');
    assert.ok(seeded);
    let reads = 0;
    const resolver = new ChartMarketResolver(deps);
    resolver.setStore({
      get: async () => ++reads === 1 ? null : seeded,
      set: async () => { throw new Error('already exists'); }
    });
    assert.deepEqual(await resolver.resolve('PONS', 'pons'), seeded);
    assert.equal(reads, 2);
  });

  it('fails closed on a pin store read outage or write failure', async () => {
    const deps = makeDeps({ mexc: { listing: T('2026-07-15'), volume: 100 }, verifiedMarkets: ['mexc_spot'] });
    const readFailure = new ChartMarketResolver(deps);
    readFailure.setStore({ get: async () => { throw new Error('store down'); }, set: async () => { throw new Error('unexpected'); } });
    await assert.rejects(readFailure.resolve('PONS', 'pons'), /store down/);
    const writeFailure = new ChartMarketResolver(deps);
    writeFailure.setStore({ get: async () => null, set: async () => { throw new Error('write denied'); } });
    await assert.rejects(writeFailure.resolve('PONS', 'pons'), /pin write failed/);
  });

  it('rejects a corrupt identity pin', async () => {
    const deps = makeDeps({ mexc: { listing: T('2026-07-15'), volume: 100 }, verifiedMarkets: ['mexc_spot'] });
    const seeded = await new ChartMarketResolver(deps).resolve('PONS', 'pons');
    assert.ok(seeded);
    const resolver = new ChartMarketResolver(deps);
    resolver.setStore({ get: async () => ({ ...seeded, symbol: 'OTHER' }), set: async () => {} });
    await assert.rejects(resolver.resolve('PONS', 'pons'), /pin identity mismatch/);
    const wrongId = new ChartMarketResolver(deps);
    wrongId.setStore({ get: async () => ({ ...seeded, coinGeckoId: 'other-pons' }), set: async () => {} });
    await assert.rejects(wrongId.resolve('PONS', 'pons'), /pin identity mismatch/);
  });

  it('selects only exact-ID listed markets and never a same-ticker older market', async () => {
    const resolver = new ChartMarketResolver(makeDeps({
      binanceSpot: true, binanceListing: T('2021-01-01'),
      mexc: { listing: T('2026-07-15'), volume: 100 },
      verifiedMarkets: ['mexc_spot']
    }));
    const resolved = await resolver.resolve('PONS', 'pons');
    assert.equal(resolved?.candle?.source, 'mexc_spot');
    assert.equal(resolved?.candidates.some(candidate => candidate.source === 'binance_spot'), false);
  });

  it('keeps coin IDs separate when tickers collide', async () => {
    const resolver = new ChartMarketResolver(makeDeps({ mexc: { listing: T('2026-07-15'), volume: 100 }, verifiedMarkets: ['mexc_spot'] }));
    const a = await resolver.resolve('PONS', 'pons');
    const b = await resolver.resolve('PONS', 'another-pons');
    assert.ok(a && b);
    assert.notEqual(a, b);
  });

  it('binds Graphite GP to verified XT spot, never the MEXC same-ticker market', async () => {
    const resolver = new ChartMarketResolver(makeDeps({ mexc: { listing: T('2020-01-01'), volume: 1_000_000 }, xt: { listing: T('2025-07-13'), volume: 100_000 }, verifiedMarkets: ['xt_spot'], referencePrice: 1, candidatePrice: 1 }));
    const resolved = await resolver.resolve('GP', 'graphite-protocol');
    assert.equal(resolved?.candle?.source, 'xt_spot');
    assert.equal(resolved?.candle?.providerSymbol, 'gp_usdt');
    assert.equal(resolved?.candidates.some(c => c.source === 'mexc_spot'), false);
    assert.equal(await resolver.resolve('GP', 'other-gp'), null);
  });

  it('rejects a mismatched provider price, rather than ranking a ticker collision', async () => {
    const resolver = new ChartMarketResolver(makeDeps({ mexc: { listing: T('2026-07-15'), volume: 100 },
      verifiedMarkets: ['mexc_spot'], referencePrice: 10, candidatePrice: 1 }));
    assert.equal(await resolver.resolve('PONS', 'pons'), null);
  });

  it('rejects non-spot symbols', async () => {
    const resolver = new ChartMarketResolver(makeDeps({ binanceSpot: true }));
    assert.equal(await resolver.resolve('BTCUSDT.P'), null);
    assert.equal(await resolver.resolve('BINANCE:BTCUSDT'), null);
    assert.equal(await resolver.resolve(''), null);
  });
});

describe('aggregate4hTo8h', () => {
  it('aggregates UTC-aligned 4h candles into 8h buckets', () => {
    const t0 = T('2026-09-20T00:00:00Z');
    const c = (offsetH: number, o: number, h: number, l: number, cl: number, v: number): Candle => ({
      timestamp: t0 + offsetH * 3_600_000, open: o, high: h, low: l, close: cl, volume: v, isClosed: true
    });
    const out = aggregate4hTo8h([c(0, 1, 5, 1, 4, 10), c(4, 4, 9, 3, 8, 20), c(8, 8, 12, 7, 11, 5)]);
    assert.equal(out.length, 2);
    assert.deepEqual(
      [out[0].open, out[0].high, out[0].low, out[0].close, out[0].volume],
      [1, 9, 1, 8, 30]
    );
    assert.equal(out[1].timestamp, t0 + 8 * 3_600_000);
  });
});
