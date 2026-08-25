import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Candle } from '@money-scanner/shared';
import { BacktestSimulatorService } from './backtest-service.js';

const baseTimestamp = Date.UTC(2019, 0, 7);
const candles = (count: number, durationMs: number, priceAt: (index: number) => number): Candle[] =>
  Array.from({ length: count }, (_, index) => {
    const close = priceAt(index);
    return {
      timestamp: baseTimestamp + index * durationMs,
      open: close * 0.995,
      high: close * 1.015,
      low: close * 0.985,
      close,
      volume: 1_000 + index,
      isClosed: true
    };
  });

describe('Weekly regime + Daily SMA50 reclaim backtest', () => {
  it('executes confirmed long reclaims with real risk and performance metrics', () => {
    const daily = candles(500, 86_400_000, index => 100 + index * 0.25 + Math.sin(index / 7) * 10);
    const weekly = candles(90, 7 * 86_400_000, index => 100 + index * 2);
    const confirmation = candles(1_500, 8 * 3_600_000, index => 100 + index * 0.08 + Math.sin(index / 14) * 2);
    const result = new BacktestSimulatorService().runWeeklyReclaimBacktest(
      'TEST', daily, weekly, confirmation, { directionMode: 'LONG_ONLY' }
    );

    assert.ok(result.totalTrades > 0);
    assert.ok(result.trades.every(trade => trade.side === 'LONG'));
    assert.ok(result.trades.every(trade => Number.isFinite(trade.rMultiple) && (trade.initialStop || 0) > 0));
    assert.equal(result.priceSeries?.length, result.equityCurve.length);
    assert.equal(result.priceSeries?.length, 300);
    assert.ok(Number.isFinite(result.sharpeRatio));
    assert.ok(Number.isFinite(result.expectancyR));
    assert.ok(result.params.startTimestamp >= daily[200].timestamp);
  });

  it('rejects a sample that cannot establish a mature SMA200 regime', () => {
    const shortSeries = candles(100, 86_400_000, index => 100 + index);
    assert.throws(() => new BacktestSimulatorService().runWeeklyReclaimBacktest(
      'TEST', shortSeries, shortSeries, shortSeries
    ), /minimum 210 lumânări Daily/);
  });
});
