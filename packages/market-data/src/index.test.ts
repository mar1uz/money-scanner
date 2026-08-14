import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MarketDataService } from './market-service.js';
import { aggregateCandles } from './aggregator.js';
import { Candle } from '@money-scanner/shared';

describe('Market Data Service & Normalization', () => {
  it('correctly aggregates 1h candles into 4h bars', () => {
    const candles1h: Candle[] = [];
    const baseTime = 0; // aligns to 0 ms (1970-01-01 00:00:00)

    for (let i = 0; i < 8; i++) {
      candles1h.push({
        timestamp: baseTime + i * 3600 * 1000,
        open: 100 + i,
        high: 110 + i,
        low: 95 + i,
        close: 102 + i,
        volume: 100,
        isClosed: true
      });
    }

    const aggregated = aggregateCandles(candles1h, 4);
    assert.equal(aggregated.length, 2);

    // Bar 1 (hours 0..3)
    assert.equal(aggregated[0].open, 100);
    assert.equal(aggregated[0].close, 105);
    assert.equal(aggregated[0].high, 113);
    assert.equal(aggregated[0].low, 95);
    assert.equal(aggregated[0].volume, 400);
    assert.equal(aggregated[0].isClosed, true);

    // Bar 2 (hours 4..7)
    assert.equal(aggregated[1].open, 104);
    assert.equal(aggregated[1].close, 109);
    assert.equal(aggregated[1].volume, 400);
  });

  it('fetches candles and computes market overview without throwing', async () => {
    const service = new MarketDataService();
    const candles = await service.getCandles('BTC', '1h', 50);

    assert.ok(candles.length > 0);
    assert.ok(candles[0].close > 0);
    assert.ok(candles[0].timestamp > 0);

    const overview = await service.getMarketOverview();
    assert.ok(overview.total24hVolume > 0);
    assert.ok(overview.marketBreadth.advancingCount >= 0);
    assert.ok(['Strong Bullish Expansion', 'Bullish Trend', 'Consolidation / Range', 'High Volatility Correction', 'Bearish Trend', 'Strong Bearish Capitulation'].includes(overview.regime));
  });

  it('tracks health monitor status and detects stale data', () => {
    const service = new MarketDataService();
    const monitor = service.getHealthMonitor();

    // Fresh timestamp
    assert.equal(monitor.isDataStale(Date.now() - 1000), false);
    // 5 minutes old timestamp
    assert.equal(monitor.isDataStale(Date.now() - 300_000), true);

    monitor.recordSuccess('Binance', 32);
    const h = monitor.getProviderHealth('Binance');
    assert.equal(h?.status, 'operational');
    assert.equal(h?.latencyMs, 32);
  });
});
