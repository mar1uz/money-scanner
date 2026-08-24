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
  it('prevents repeated manual full scans during the ten-minute cooldown', async () => {
    const state = new AppState();
    (state as any).executeManualFullScan = async () => ({
      scope: 'full',
      running: false,
      scannedAssets: 10,
      totalAssets: 10,
      matches: 0,
      errors: 0,
      lastCompletedAt: Date.now()
    });

    const first = await state.runManualAlertScan('user-1', 'full');
    assert.equal(first.scannedAssets, 10);
    await assert.rejects(
      () => state.runManualAlertScan('user-1', 'full'),
      (error: any) => error?.code === 'SCAN_COOLDOWN' && error?.retryAfterSeconds > 0
    );
  });

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

  it('calculates an ATR-normalized upcoming flip candidate from closed candles', () => {
    const state = new AppState();
    const series = candles(100);
    state.moneyLine.calculateLatest = (() => ({
      tier: 'Bearish',
      score: -35,
      rawIndicators: { atr14: 2, rvol: 1.4 }
    })) as any;

    const result = (state as any).calculateFlipCandidate(
      'TEST',
      'stocks',
      '1d',
      series,
      100,
      'Bearish',
      -42
    );

    assert.equal(result.symbol, 'TEST');
    assert.equal(result.timeframe, '1d');
    assert.equal(result.direction, 'BULLISH');
    assert.ok(result.triggerPrice > result.currentPrice);
    assert.ok(result.distanceAtr > 0);
    assert.ok(result.priorityScore >= 0 && result.priorityScore <= 100);
    assert.equal(result.weeklyAligned, false);
  });
});
