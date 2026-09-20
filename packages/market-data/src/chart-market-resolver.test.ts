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
    krakenQuoteVolume24h: async () => spec.kraken?.volume ?? null
  };
}

describe('ChartMarketResolver', () => {
  it('short-circuits to Binance spot when the asset trades there', async () => {
    const calls: string[] = [];
    const resolver = new ChartMarketResolver(makeDeps({ binanceSpot: true, bybit: { listing: T('2020-01-01'), volume: 1 } }, calls));
    const resolution = await resolver.resolve('BTC');
    assert.equal(resolution?.candle?.source, 'binance_spot');
    assert.equal(resolution?.tv?.tvSymbol, 'BINANCE:BTCUSDT');
    assert.deepEqual(calls, ['binanceSpot']);
  });

  it('picks the longest-history highest-volume pair for a non-Binance asset (GRASS case)', async () => {
    const resolver = new ChartMarketResolver(makeDeps({
      bybit: { listing: T('2024-10-28'), volume: 1_500_000 },
      okx: { listing: T('2026-04-21'), volume: 400_000 },
      coinbase: { listing: T('2025-03-01'), volume: 700_000 },
      kraken: { listing: T('2025-01-27'), volume: 300_000 },
      hyperliquid: { listing: T('2024-10-28'), volume: 200_000 }
    }));
    const resolution = await resolver.resolve('GRASS');
    assert.ok(resolution);
    assert.equal(resolution?.candle?.source, 'bybit_spot');
    assert.equal(resolution?.tv?.tvSymbol, 'BYBIT:GRASSUSDT');
    assert.equal(resolution?.candle?.providerSymbol, 'GRASSUSDT');
  });

  it('prefers the clearly older listing even with lower volume', async () => {
    const resolver = new ChartMarketResolver(makeDeps({
      bybit: { listing: T('2025-06-01'), volume: 5_000_000 },
      kraken: { listing: T('2021-01-01'), volume: 10_000 }
    }));
    const resolution = await resolver.resolve('OLD');
    assert.equal(resolution?.candle?.source, 'bybit_spot'); // kraken not candle-capable
    assert.equal(resolution?.tv?.exchange, 'KRAKEN');
  });

  it('returns a hyperliquid candle source with no TradingView symbol for HL-only assets', async () => {
    const resolver = new ChartMarketResolver(makeDeps({ hyperliquid: { listing: T('2024-01-01'), volume: 100 } }));
    const resolution = await resolver.resolve('ONLYHL');
    assert.equal(resolution?.candle?.source, 'hyperliquid');
    assert.equal(resolution?.tv, null);
  });

  it('returns null when no major exchange lists the asset', async () => {
    const resolver = new ChartMarketResolver(makeDeps({}));
    assert.equal(await resolver.resolve('NOPE'), null);
  });

  it('caches resolutions and does not re-probe', async () => {
    const calls: string[] = [];
    const resolver = new ChartMarketResolver(makeDeps({ binanceSpot: true }, calls));
    await resolver.resolve('BTC');
    await resolver.resolve('BTC');
    assert.deepEqual(calls, ['binanceSpot']);
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
