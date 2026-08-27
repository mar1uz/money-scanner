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

const breakoutDaily = () => {
  const closes = Array.from({ length: 321 }, (_, index) => 100 + index);
  closes[319] = closes[318] - 1;
  closes[320] = closes[318] + 3;
  return closes.map((close, index): Candle => {
    const spread = 0.4 + (index % 20) * 0.1;
    return {
      timestamp: Date.UTC(2023, 0, 2) + index * 86_400_000,
      open: close - 0.1,
      high: close + spread,
      low: close - spread,
      close,
      volume: 1_000_000,
      isClosed: true
    };
  });
};

const bullishWeekly = () => Array.from({ length: 80 }, (_, index): Candle => {
  const close = 100 + index * 2;
  return {
    timestamp: Date.UTC(2021, 0, 4) + index * 7 * 86_400_000,
    open: close - 1,
    high: close + 1,
    low: close - 1,
    close,
    volume: 5_000_000,
    isClosed: true
  };
});

describe('Daily strategy alert evaluation', () => {
  it('confirms Weekly Trend + Donchian 55/20 only on a fresh stocks breakout', () => {
    const daily = breakoutDaily();
    const benchmark = toCandles(daily.map(candle => candle.close));
    const result = evaluateDailyStrategyAlerts('TEST', 'stocks', daily, benchmark, bullishWeekly());
    const signal = result.events.find(event => event.strategy === 'WEEKLY_DONCHIAN_55_LONG');

    assert.equal(signal?.stage, 'CONFIRMED');
    assert.equal(signal?.side, 'LONG');
    assert.equal(signal?.marketClass, 'stocks');
    assert.ok((signal?.signalPrice || 0) > (signal?.donchianHigh55 || Number.MAX_VALUE));
    assert.ok((signal?.riskPercent || 100) <= 4);
    assert.ok((signal?.weeklySma40 || 0) > (signal?.weeklySma40EightWeeksAgo || Number.MAX_VALUE));
  });

  it('shows a near Donchian breakout as ARMED without presenting an entry', () => {
    const daily = breakoutDaily();
    daily[daily.length - 1] = {
      ...daily[daily.length - 1],
      open: daily[daily.length - 2].close,
      close: daily[daily.length - 2].close + 0.5,
      high: daily[daily.length - 2].close + 0.8,
      low: daily[daily.length - 2].close - 0.5
    };
    const result = evaluateDailyStrategyAlerts('TEST', 'stocks', daily, toCandles(daily.map(candle => candle.close)), bullishWeekly());
    const signal = result.current?.strategy === 'WEEKLY_DONCHIAN_55_LONG' ? result.current : undefined;

    assert.equal(signal?.stage, 'ARMED');
    assert.ok((signal?.signalPrice || Number.MAX_VALUE) <= (signal?.donchianHigh55 || 0));
    assert.ok((signal?.distanceToBreakoutPercent || 100) >= 0);
  });

  it('confirms Weekly Trend + Donchian 55/20 on crypto when all filters pass', () => {
    const daily = breakoutDaily();
    const result = evaluateDailyStrategyAlerts('TEST', 'crypto', daily, toCandles(daily.map(candle => candle.close)), bullishWeekly());
    const signal = result.events.find(event => event.strategy === 'WEEKLY_DONCHIAN_55_LONG');

    assert.equal(signal?.stage, 'CONFIRMED');
    assert.equal(signal?.side, 'LONG');
    assert.equal(signal?.marketClass, 'crypto');
    assert.ok((signal?.riskPercent || 100) <= 8);
  });

  it('rejects Donchian LONG when the Weekly regime is not bullish', () => {
    const daily = breakoutDaily();
    const bearishWeekly = bullishWeekly().map((candle, index, values) => ({
      ...candle,
      close: values.length * 2 + 100 - index * 2,
      open: values.length * 2 + 101 - index * 2,
      high: values.length * 2 + 102 - index * 2,
      low: values.length * 2 + 99 - index * 2
    }));
    const result = evaluateDailyStrategyAlerts('TEST', 'stocks', daily, toCandles(daily.map(candle => candle.close)), bearishWeekly);

    assert.equal(result.events.some(event => event.strategy === 'WEEKLY_DONCHIAN_55_LONG'), false);
    assert.notEqual(result.current?.strategy, 'WEEKLY_DONCHIAN_55_LONG');
  });

  /*
   * Bear Rally Fade remains active as the separate production SHORT model.
   */
  it('keeps Donchian snapshots risk-managed below the production gate', () => {
    const daily = breakoutDaily();
    const result = evaluateDailyStrategyAlerts('TEST', 'stocks', daily, toCandles(daily.map(candle => candle.close)), bullishWeekly());
    const signal = result.events.find(event => event.strategy === 'WEEKLY_DONCHIAN_55_LONG');

    assert.equal(signal?.side, 'LONG');
    assert.ok((signal?.stopLoss || 0) < (signal?.entryReference || 0));
    assert.ok((signal?.riskPercent || 100) <= 4);
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
