import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ChartMarketCandidate, ChartMarketResolver, ChartMarketResolverDeps } from './chart-market-resolver.js';
import { getChartMarketDiagnosticsSnapshot, resetChartMarketDiagnostics } from './chart-market-diagnostics.js';

const T = (iso: string) => new Date(iso).getTime();

interface CostSpec {
  markets: string[];
  on: string[];
  listings?: Record<string, number | null>;
  volumes?: Record<string, number>;
  prices?: Record<string, number>;
  referencePrice?: number | null;
}

/** Deps whose every invocation is logged, so probe counts can be asserted exactly. */
function buildDeps(spec: CostSpec, log: string[]): ChartMarketResolverDeps {
  const listed = (source: string) => spec.on.includes(source);
  const listing = (source: string): number | null => (spec.listings?.[source] ?? null);
  const volume = (source: string) => spec.volumes?.[source] ?? null;
  const price = (candidate: ChartMarketCandidate) => spec.prices?.[candidate.source] ?? 1;
  return {
    isOnBinanceSpot: async () => { log.push('isOnBinanceSpot'); return listed('binance_spot'); },
    binanceSpotFirstDailyTs: async () => { log.push('binanceSpotFirstDailyTs'); return listing('binance_spot'); },
    binanceSpotQuoteVolume24h: async () => { log.push('binanceSpotQuoteVolume24h'); return volume('binance_spot'); },
    isOnBinanceFutures: async () => { log.push('isOnBinanceFutures'); return listed('binance_futures'); },
    binanceFuturesFirstDailyTs: async () => { log.push('binanceFuturesFirstDailyTs'); return listing('binance_futures'); },
    binanceFuturesQuoteVolume24h: async () => { log.push('binanceFuturesQuoteVolume24h'); return volume('binance_futures'); },
    isOnBybitSpot: async () => { log.push('isOnBybitSpot'); return listed('bybit_spot'); },
    bybitFirstDailyTs: async () => { log.push('bybitFirstDailyTs'); return listing('bybit_spot'); },
    bybitQuoteVolume24h: async () => { log.push('bybitQuoteVolume24h'); return volume('bybit_spot'); },
    okxSpotInstrument: async () => { log.push('okxSpotInstrument'); return listed('okx_spot') ? { instId: 'SUI-USDT', listTime: listing('okx_spot') } : null; },
    okxQuoteVolume24h: async () => { log.push('okxQuoteVolume24h'); return volume('okx_spot'); },
    isOnHyperliquid: async () => { log.push('isOnHyperliquid'); return listed('hyperliquid'); },
    hyperliquidFirstDailyTs: async () => { log.push('hyperliquidFirstDailyTs'); return listing('hyperliquid'); },
    hyperliquidQuoteVolume24h: async () => { log.push('hyperliquidQuoteVolume24h'); return volume('hyperliquid'); },
    isOnCoinbase: async () => { log.push('isOnCoinbase'); return listed('coinbase'); },
    coinbaseFirstDailyTs: async () => { log.push('coinbaseFirstDailyTs'); return listing('coinbase'); },
    coinbaseQuoteVolume24h: async () => { log.push('coinbaseQuoteVolume24h'); return volume('coinbase'); },
    isOnKraken: async () => { log.push('isOnKraken'); return listed('kraken'); },
    krakenFirstDailyTs: async () => { log.push('krakenFirstDailyTs'); return listing('kraken'); },
    krakenQuoteVolume24h: async () => { log.push('krakenQuoteVolume24h'); return volume('kraken'); },
    isOnMexcSpot: async () => { log.push('isOnMexcSpot'); return listed('mexc_spot'); },
    mexcFirstDailyTs: async () => { log.push('mexcFirstDailyTs'); return listing('mexc_spot'); },
    mexcQuoteVolume24h: async () => { log.push('mexcQuoteVolume24h'); return volume('mexc_spot'); },
    isOnGateSpot: async () => { log.push('isOnGateSpot'); return listed('gate_spot'); },
    isOnBitgetSpot: async () => { log.push('isOnBitgetSpot'); return listed('bitget_spot'); },
    isOnKucoinSpot: async () => { log.push('isOnKucoinSpot'); return listed('kucoin_spot'); },
    verifiedIdentity: async () => {
      log.push('verifiedIdentity');
      return { markets: new Set(spec.markets), referencePrice: spec.referencePrice === undefined ? 1 : spec.referencePrice, knownStart: null };
    },
    candidateLastPrice: async candidate => { log.push(`candidateLastPrice:${candidate.source}`); return price(candidate); }
  };
}

const ALL_VENUES = ['binance_spot', 'binance_futures', 'bybit_spot', 'okx_spot', 'hyperliquid', 'coinbase', 'kraken', 'mexc_spot', 'gate_spot', 'bitget_spot', 'kucoin_spot'];

describe('chart-market resolution cost guards', () => {
  it('probes only the venues the verified identity maps to this coin', async () => {
    resetChartMarketDiagnostics();
    const log: string[] = [];
    const deps = buildDeps({
      markets: ['mexc_spot'],
      on: ALL_VENUES,
      listings: { mexc_spot: T('2026-07-15') },
      volumes: { mexc_spot: 100 }
    }, log);
    const resolution = await new ChartMarketResolver(deps).resolve('PONS', 'pons');
    assert.equal(resolution?.candle?.source, 'mexc_spot');
    assert.equal(resolution?.tv?.tvSymbol, 'MEXC:PONSUSDT');
    assert.deepEqual(resolution?.candidates.map(candidate => candidate.source), ['mexc_spot']);
    // Venue detection, listing, volume and price probes are all limited to the
    // mapped venue: nothing is spent on candidates the identity filter drops.
    assert.deepEqual(
      log.filter(name => name !== 'verifiedIdentity'),
      ['isOnMexcSpot', 'mexcFirstDailyTs', 'mexcQuoteVolume24h', 'candidateLastPrice:mexc_spot']
    );
  });

  it('keeps probing every mapped venue when the identity maps several', async () => {
    resetChartMarketDiagnostics();
    const log: string[] = [];
    const deps = buildDeps({
      markets: ['binance_spot', 'bybit_spot'],
      on: ALL_VENUES,
      listings: { binance_spot: T('2023-05-03'), bybit_spot: T('2023-05-03') },
      volumes: { binance_spot: 300, bybit_spot: 200 }
    }, log);
    const resolution = await new ChartMarketResolver(deps).resolve('SUI', 'sui');
    assert.equal(resolution?.candle?.source, 'binance_spot');
    assert.ok(log.includes('isOnBybitSpot'));
    assert.ok(log.includes('bybitFirstDailyTs'));
    assert.equal(log.some(name => name.startsWith('isOnOkxSpot') || name === 'okxSpotInstrument'), false);
    assert.equal(log.some(name => name === 'isOnKraken'), false);
  });

  it('stops price probes once the candle and TV winners are certified', async () => {
    resetChartMarketDiagnostics();
    const log: string[] = [];
    const deps = buildDeps({
      markets: ['binance_spot', 'bybit_spot', 'okx_spot'],
      on: ALL_VENUES,
      listings: { binance_spot: T('2023-05-03'), bybit_spot: T('2023-05-03'), okx_spot: T('2023-05-03') },
      volumes: { binance_spot: 300, bybit_spot: 200, okx_spot: 100 }
    }, log);
    const resolution = await new ChartMarketResolver(deps).resolve('SUI', 'sui');
    assert.equal(resolution?.candle?.source, 'binance_spot');
    // Only the winner is sanity-checked: bybit/okx cannot change either slot.
    assert.deepEqual(log.filter(name => name.startsWith('candidateLastPrice')), ['candidateLastPrice:binance_spot']);
    // The skipped candidates stay in the pool with an unknown price.
    assert.equal(resolution?.candidates.find(candidate => candidate.source === 'okx_spot')?.lastPrice, undefined);
  });

  it('falls back to probing every candidate when the cheapest listing fails the price check', async () => {
    resetChartMarketDiagnostics();
    const log: string[] = [];
    const deps = buildDeps({
      markets: ['binance_spot', 'bybit_spot', 'okx_spot'],
      on: ALL_VENUES,
      listings: { binance_spot: T('2023-05-03'), bybit_spot: T('2023-05-03'), okx_spot: T('2023-05-03') },
      volumes: { binance_spot: 300, bybit_spot: 200, okx_spot: 100 },
      prices: { binance_spot: 10 } // reference price is 1: 900% away, rejected
    }, log);
    const resolution = await new ChartMarketResolver(deps).resolve('SUI', 'sui');
    assert.equal(resolution?.candle?.source, 'bybit_spot');
    assert.deepEqual(
      log.filter(name => name.startsWith('candidateLastPrice')).sort(),
      ['candidateLastPrice:binance_spot', 'candidateLastPrice:bybit_spot', 'candidateLastPrice:okx_spot']
    );
  });

  it('does not probe the identity-mapped venues that report no live pair', async () => {
    resetChartMarketDiagnostics();
    const log: string[] = [];
    const deps = buildDeps({
      markets: ['binance_spot', 'kraken'],
      on: ['kraken'],
      listings: { kraken: T('2024-10-28') },
      volumes: { kraken: 5_000_000 }
    }, log);
    const resolution = await new ChartMarketResolver(deps).resolve('GRASS', 'grass');
    assert.equal(resolution?.candle, null); // kraken is chart-only
    assert.equal(resolution?.tv?.tvSymbol, 'KRAKEN:GRASSUSD');
    assert.ok(log.includes('isOnKraken'));
    assert.ok(log.includes('krakenFirstDailyTs'));
    // The chart-only candidate still gets its price sanity check, but it is the
    // only verified venue, so nothing else is probed.
    assert.deepEqual(log.filter(name => name.startsWith('candidateLastPrice')), ['candidateLastPrice:kraken']);
  });

  it('exposes per-resolution request accounting in the diagnostics registry', async () => {
    resetChartMarketDiagnostics();
    const log: string[] = [];
    const deps = buildDeps({
      markets: ['mexc_spot'],
      on: ALL_VENUES,
      listings: { mexc_spot: T('2026-07-15') },
      volumes: { mexc_spot: 100 }
    }, log);
    await new ChartMarketResolver(deps).resolve('PONS', 'pons');
    const snapshot = getChartMarketDiagnosticsSnapshot();
    const record = snapshot.recentResolutions.at(-1)!;
    assert.equal(record.outcome, 'resolved');
    assert.equal(record.candleSource, 'mexc_spot');
    assert.equal(record.probeCalls, log.length);
    assert.equal(record.probeCallsBySource.mexc_spot, 4); // detect, listing, volume, price
  });
});
