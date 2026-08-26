import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Candle } from '@money-scanner/shared';
import { evaluateDailyStrategyAlerts } from './strategy-alert-service.js';

const toCandles = (closes: number[]): Candle[] => closes.map((close, index) => ({
  timestamp: Date.UTC(2024, 0, 1) + index * 86_400_000,
  open: close,
  high: close + 1,
  low: Math.max(0.01, close - 1),
  close,
  volume: 1_000,
  isClosed: true
}));

describe('Daily strategy alert evaluation', () => {
  it('confirms a fresh Connors RSI(2) long pullback above SMA200', () => {
    const closes = Array.from({ length: 221 }, (_, index) => 100 + index * 0.5);
    closes[220] = closes[219] - 10;
    const benchmark = Array.from({ length: 221 }, (_, index) => 100 + index * 0.2);

    const result = evaluateDailyStrategyAlerts('TEST', 'stocks', toCandles(closes), toCandles(benchmark));

    assert.equal(result.events.length, 1);
    assert.equal(result.current?.strategy, 'CONNORS_RSI2_LONG');
    assert.equal(result.current?.stage, 'CONFIRMED');
    assert.equal(result.current?.side, 'LONG');
    assert.ok((result.current?.rsi2 || 100) < 5);
    assert.ok((result.current?.signalPrice || 0) > (result.current?.sma200 || Number.MAX_VALUE));
    assert.ok((result.current?.stopLoss || 0) < (result.current?.entryReference || 0));
  });

  it('arms a Bear Rally Fade only after RSI(2) crosses above 95 in a confirmed bear regime', () => {
    const bearishBase = Array.from({ length: 230 }, (_, index) => 500 - index);
    const asset = [...bearishBase, 270, 320];
    const benchmark = Array.from({ length: asset.length }, (_, index) => 600 - index);

    const result = evaluateDailyStrategyAlerts('TEST', 'stocks', toCandles(asset), toCandles(benchmark));

    assert.equal(result.events.length, 1);
    assert.equal(result.current?.strategy, 'BEAR_RALLY_FADE_SHORT');
    assert.equal(result.current?.stage, 'ARMED');
    assert.equal(result.current?.confirmationWindowRemaining, 3);
    assert.equal(result.current?.benchmarkBearish, true);
  });

  it('confirms the short when RSI(2) crosses below 50 within three closed Daily candles', () => {
    const bearishBase = Array.from({ length: 230 }, (_, index) => 500 - index);
    const asset = [...bearishBase, 270, 310, 350, 330, 300];
    const benchmark = Array.from({ length: asset.length }, (_, index) => 600 - index);

    const result = evaluateDailyStrategyAlerts('TEST', 'stocks', toCandles(asset), toCandles(benchmark));

    assert.equal(result.events.length, 1);
    assert.equal(result.current?.stage, 'CONFIRMED');
    assert.equal(result.current?.side, 'SHORT');
    assert.ok((result.current?.previousRsi2 || 0) >= 50);
    assert.ok((result.current?.rsi2 || 100) < 50);
    assert.ok((result.current?.stopLoss || 0) > (result.current?.entryReference || Number.MAX_VALUE));
  });

  it('rejects the short setup when SPY is not in a bear regime', () => {
    const bearishBase = Array.from({ length: 230 }, (_, index) => 500 - index);
    const asset = [...bearishBase, 270, 320];
    const bullishBenchmark = Array.from({ length: asset.length }, (_, index) => 100 + index);

    const result = evaluateDailyStrategyAlerts('TEST', 'stocks', toCandles(asset), toCandles(bullishBenchmark));
    assert.equal(result.current, undefined);
    assert.equal(result.events.length, 0);
  });
});
