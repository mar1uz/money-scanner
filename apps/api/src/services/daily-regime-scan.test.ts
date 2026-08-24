import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AppState } from './app-state.js';

const candles = (lastClose: number) => Array.from({ length: 60 }, (_, index) => ({
  symbol: 'TEST',
  timeframe: '1d' as const,
  timestamp: Date.now() - (59 - index) * 86_400_000,
  open: index === 59 ? lastClose : 100,
  high: index === 59 ? lastClose + 1 : 101,
  low: index === 59 ? lastClose - 1 : 99,
  close: index === 59 ? lastClose : 100,
  volume: 1_000,
  isClosed: true,
  source: 'fixture' as const
}));

describe('Daily MoneyLine regime scan', () => {
  it('detects a Daily bearish transition below SMA50 inside a Weekly bullish regime', () => {
    const state = new AppState();
    const daily = candles(90);
    state.moneyLine.calculateSeries = (() => Array.from({ length: 60 }, (_, index) => ({
      tier: index === 59 ? 'Bearish' : 'Neutral',
      previousTier: index === 59 ? 'Neutral' : undefined,
      candleTimestamp: daily[index].timestamp,
      score: index === 59 ? -35 : 0
    }))) as any;
    state.moneyLine.calculateLatest = (() => ({ tier: 'Bullish', score: 42 })) as any;

    const result = (state as any).evaluateDailyRegimeAsset('TEST', 'stocks', daily, candles(100));
    assert.equal(result.scenario, 'WEEKLY_BULL_DAILY_BEAR');
    assert.ok(result.price < result.sma50);
  });

  it('detects a Daily bullish transition above SMA50 inside a Weekly bearish regime', () => {
    const state = new AppState();
    const daily = candles(110);
    state.moneyLine.calculateSeries = (() => Array.from({ length: 60 }, (_, index) => ({
      tier: index === 59 ? 'Bullish' : 'Neutral',
      previousTier: index === 59 ? 'Neutral' : undefined,
      candleTimestamp: daily[index].timestamp,
      score: index === 59 ? 38 : 0
    }))) as any;
    state.moneyLine.calculateLatest = (() => ({ tier: 'Bearish', score: -44 })) as any;

    const result = (state as any).evaluateDailyRegimeAsset('TEST', 'crypto', daily, candles(100));
    assert.equal(result.scenario, 'WEEKLY_BEAR_DAILY_BULL');
    assert.ok(result.price > result.sma50);
  });

  it('does not trigger when Daily only changes tier inside the same bullish family', () => {
    const state = new AppState();
    const daily = candles(110);
    state.moneyLine.calculateSeries = (() => Array.from({ length: 60 }, (_, index) => ({
      tier: index === 59 ? 'Strong Bullish' : 'Bullish',
      previousTier: index === 59 ? 'Bullish' : undefined,
      candleTimestamp: daily[index].timestamp,
      score: index === 59 ? 70 : 30
    }))) as any;
    state.moneyLine.calculateLatest = (() => ({ tier: 'Bearish', score: -44 })) as any;

    const result = (state as any).evaluateDailyRegimeAsset('TEST', 'crypto', daily, candles(100));
    assert.equal(result, undefined);
  });
});
