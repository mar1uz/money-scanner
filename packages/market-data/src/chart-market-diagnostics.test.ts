import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  beginResolutionScope,
  currentResolutionScope,
  finalizeResolution,
  getChartMarketDiagnosticsSnapshot,
  memoizeWithinResolution,
  recordHttpRequest,
  recordPinHealth,
  recordProbeCall,
  recordProbeFailure,
  resetChartMarketDiagnostics,
  runInResolutionScope
} from './chart-market-diagnostics.js';
import { ChartMarketResolver, ChartMarketResolverDeps } from './chart-market-resolver.js';

describe('chart-market diagnostics registry', () => {
  it('counts probe calls, http requests and failures per resolution scope', async () => {
    resetChartMarketDiagnostics();
    const scope = beginResolutionScope({ key: 'BTC:bitcoin', symbol: 'BTC', coinGeckoId: 'bitcoin', pinState: 'miss' });
    await runInResolutionScope(scope, async () => {
      recordProbeCall('binance_spot', 'isOnBinanceSpot');
      recordProbeCall('binary', 'bybitFirstDailyTs');
      recordHttpRequest('data-api.binance.vision');
      recordHttpRequest('data-api.binance.vision');
      recordProbeFailure({ source: 'identity', probe: 'verifiedIdentity', message: 'HTTP 429' });
    });
    const record = finalizeResolution(scope, {
      outcome: 'unresolved',
      resolution: null
    });
    assert.equal(record.probeCalls, 2);
    assert.equal(record.httpRequests, 2);
    assert.deepEqual(record.probeCallsBySource, { binance_spot: 1, binary: 1 });
    assert.deepEqual(record.httpRequestsByHost, { 'data-api.binance.vision': 2 });
    assert.equal(record.failures.length, 1);
    assert.equal(record.failures[0].status, 429);
    assert.equal(record.durationMs >= 0, true);
    const snapshot = getChartMarketDiagnosticsSnapshot();
    assert.equal(snapshot.resolutions, 1);
    assert.equal(snapshot.unresolved, 1);
    assert.equal(snapshot.probeCalls, 2);
    assert.equal(snapshot.httpRequests, 2);
    assert.equal(snapshot.failuresBySource.identity, 1);
    assert.equal(snapshot.lastFailure?.message, 'HTTP 429');
    assert.equal(snapshot.recentResolutions.length, 1);
  });

  it('collapses duplicate consecutive failures at the same probe', async () => {
    resetChartMarketDiagnostics();
    const scope = beginResolutionScope({ key: 'X:x', symbol: 'X', coinGeckoId: 'x', pinState: 'miss' });
    await runInResolutionScope(scope, async () => {
      recordProbeFailure({ source: 'bybit_spot', probe: 'isOnBybitSpot', message: 'HTTP 500' });
      recordProbeFailure({ source: 'bybit_spot', probe: 'isOnBybitSpot', message: 'HTTP 500' });
      recordProbeFailure({ source: 'bybit_spot', probe: 'isOnBybitSpot', message: 'HTTP 502' });
    });
    const record = finalizeResolution(scope, { outcome: 'unresolved', resolution: null });
    assert.deepEqual(record.failures.map(failure => failure.message), ['HTTP 500', 'HTTP 502']);
    // Global counters still see every occurrence.
    assert.equal(getChartMarketDiagnosticsSnapshot().failuresTotal, 3);
  });

  it('shares one upstream read per resolution and does not memoise failures', async () => {
    resetChartMarketDiagnostics();
    const scope = beginResolutionScope({ key: 'X:x', symbol: 'X', coinGeckoId: 'x', pinState: 'miss' });
    let loads = 0;
    await runInResolutionScope(scope, async () => {
      const first = memoizeWithinResolution('ticker:X', async () => { loads += 1; return 'payload'; });
      const second = memoizeWithinResolution('ticker:X', async () => { loads += 1; return 'other'; });
      assert.equal(await first, 'payload');
      assert.equal(await second, 'payload');
      assert.equal(loads, 1);
      await assert.rejects(memoizeWithinResolution('failing', async () => { loads += 1; throw new Error('boom'); }));
      await assert.rejects(memoizeWithinResolution('failing', async () => { loads += 1; throw new Error('boom again'); }));
      assert.equal(loads, 3);
    });
    assert.equal(currentResolutionScope(), undefined);
  });

  it('bounds the recent resolution ring buffer', async () => {
    resetChartMarketDiagnostics();
    for (let i = 0; i < 60; i += 1) {
      const scope = beginResolutionScope({ key: `S${i}:coin`, symbol: `S${i}`, coinGeckoId: 'coin', pinState: 'miss' });
      finalizeResolution(scope, { outcome: 'resolved', resolution: { candle: { source: 'binance_spot' }, tv: { tvSymbol: 'BINANCE:S' } } });
    }
    const snapshot = getChartMarketDiagnosticsSnapshot();
    assert.equal(snapshot.resolutions, 60);
    assert.equal(snapshot.recentResolutions.length, 50);
    assert.equal(snapshot.recentResolutions[0].symbol, 'S10');
    assert.equal(snapshot.recentResolutions[49].symbol, 'S59');
  });

  it('summarises observed pin health', async () => {
    resetChartMarketDiagnostics();
    recordPinHealth({
      key: 'BTC:bitcoin', symbol: 'BTC', coinGeckoId: 'bitcoin', health: 'healthy', reason: 'pair-listed',
      resolvedAt: 1, lastCheckedAt: 2, failedChecks: 0, candleSource: 'binance_spot'
    });
    recordPinHealth({
      key: 'SUI:sui', symbol: 'SUI', coinGeckoId: 'sui', health: 'dead', reason: 'pinned-pair-delisted: okx_spot',
      resolvedAt: 1, lastCheckedAt: 2, failedChecks: 2, candleSource: 'okx_spot'
    });
    const snapshot = getChartMarketDiagnosticsSnapshot();
    assert.equal(snapshot.pinHealth.observed, 2);
    assert.deepEqual(snapshot.pinHealth.byHealth, { healthy: 1, dead: 1 });
    const dead = snapshot.pinHealth.pins.find(entry => entry.key === 'SUI:sui');
    assert.equal(dead?.reason, 'pinned-pair-delisted: okx_spot');
    assert.equal(dead?.failedChecks, 2);
  });

  it('records resolver probe failures per source instead of swallowing them', async () => {
    resetChartMarketDiagnostics();
    const deps: ChartMarketResolverDeps = {
      isOnBinanceSpot: async () => false,
      binanceSpotFirstDailyTs: async () => null,
      isOnBinanceFutures: async () => false,
      binanceFuturesFirstDailyTs: async () => null,
      binanceFuturesQuoteVolume24h: async () => null,
      isOnBybitSpot: async () => { throw new Error('HTTP 429'); },
      bybitFirstDailyTs: async () => null,
      bybitQuoteVolume24h: async () => null,
      okxSpotInstrument: async () => null,
      okxQuoteVolume24h: async () => null,
      isOnHyperliquid: async () => false,
      hyperliquidFirstDailyTs: async () => null,
      hyperliquidQuoteVolume24h: async () => null,
      isOnCoinbase: async () => false,
      coinbaseFirstDailyTs: async () => null,
      coinbaseQuoteVolume24h: async () => null,
      isOnKraken: async () => false,
      krakenFirstDailyTs: async () => null,
      krakenQuoteVolume24h: async () => null,
      verifiedIdentity: async () => ({ markets: new Set(['bybit_spot']), referencePrice: 1, knownStart: null })
    };
    const resolution = await new ChartMarketResolver(deps).resolve('GRASS', 'grass');
    assert.equal(resolution, null);
    const snapshot = getChartMarketDiagnosticsSnapshot();
    assert.equal(snapshot.failuresBySource.bybit_spot, 1);
    assert.equal(snapshot.lastFailure?.probe, 'isOnBybitSpot');
    assert.equal(snapshot.lastFailure?.status, 429);
    assert.equal(snapshot.recentResolutions[0].outcome, 'unresolved');
    assert.ok(Object.keys(snapshot.recentResolutions[0].probeCallsBySource).includes('identity'));
  });

  it('reports pin hits and heals in the snapshot', async () => {
    resetChartMarketDiagnostics();
    const pin = {
      symbol: 'BTC', coinGeckoId: 'bitcoin',
      candle: { source: 'binance_spot' as const, exchange: 'BINANCE', providerSymbol: 'BTCUSDT', tvSymbol: 'BINANCE:BTCUSDT', quoteCurrency: 'USDT', listingStart: 1, volume24hQuote: 2, candleCapable: true, identityVerified: true },
      tv: null,
      candidates: [],
      resolvedAt: Date.now(),
      audit: { lastCheckedAt: Date.now(), health: 'unverified' as const, reason: 'resolved', failedChecks: 0 }
    };
    const store = { get: async () => pin, set: async () => {} };
    const deps = {
      isOnBinanceSpot: async () => true, binanceSpotFirstDailyTs: async () => 1,
      isOnBinanceFutures: async () => false, binanceFuturesFirstDailyTs: async () => null, binanceFuturesQuoteVolume24h: async () => null,
      isOnBybitSpot: async () => false, bybitFirstDailyTs: async () => null, bybitQuoteVolume24h: async () => null,
      okxSpotInstrument: async () => null, okxQuoteVolume24h: async () => null,
      isOnHyperliquid: async () => false, hyperliquidFirstDailyTs: async () => null, hyperliquidQuoteVolume24h: async () => null,
      isOnCoinbase: async () => false, coinbaseFirstDailyTs: async () => null, coinbaseQuoteVolume24h: async () => null,
      isOnKraken: async () => false, krakenFirstDailyTs: async () => null, krakenQuoteVolume24h: async () => null,
      verifiedIdentity: async () => ({ markets: new Set(['binance_spot']), referencePrice: 1, knownStart: null })
    } as ChartMarketResolverDeps;
    const resolver = new ChartMarketResolver(deps);
    resolver.setStore(store);
    const served = await resolver.resolve('BTC', 'bitcoin');
    assert.equal(served?.candle?.source, 'binance_spot');
    const snapshot = getChartMarketDiagnosticsSnapshot();
    assert.equal(snapshot.pinHits, 1);
    assert.equal(snapshot.recentResolutions[0].outcome, 'pin-hit');
    assert.equal(snapshot.recentResolutions[0].candleSource, 'binance_spot');
  });
});
