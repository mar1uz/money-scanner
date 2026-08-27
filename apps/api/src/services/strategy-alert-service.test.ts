import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Candle } from '@money-scanner/shared';
import { evaluateDailyStrategyAlerts } from './strategy-alert-service.js';

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

describe('Production strategy alert evaluation', () => {
  it('confirms the validated stocks-only Donchian breakout with a maximum 4% stop', () => {
    const daily = breakoutDaily();
    const result = evaluateDailyStrategyAlerts('TEST', 'stocks', daily, [], bullishWeekly());
    const signal = result.events[0];

    assert.equal(signal?.strategy, 'WEEKLY_DONCHIAN_55_LONG');
    assert.equal(signal?.stage, 'CONFIRMED');
    assert.equal(signal?.side, 'LONG');
    assert.ok((signal?.signalPrice || 0) > (signal?.donchianHigh55 || Number.MAX_VALUE));
    assert.ok((signal?.riskPercent || 100) <= 4);
    assert.equal(signal?.maxRiskPercent, 4);
    assert.equal(signal?.weeklyFastBullish, true);
    assert.equal(signal?.weeklySlowBullish, true);
  });

  it('keeps a near-breakout stocks candidate ARMED without claiming confirmation', () => {
    const daily = breakoutDaily();
    daily[daily.length - 1] = {
      ...daily[daily.length - 1],
      open: daily[daily.length - 2].close,
      close: daily[daily.length - 2].close + 0.5,
      high: daily[daily.length - 2].close + 0.8,
      low: daily[daily.length - 2].close - 0.5
    };
    const result = evaluateDailyStrategyAlerts('TEST', 'stocks', daily, [], bullishWeekly());

    assert.equal(result.current?.stage, 'ARMED');
    assert.ok((result.current?.signalPrice || Number.MAX_VALUE) <= (result.current?.donchianHigh55 || 0));
    assert.match(result.current?.exitRule || '', /următorul open/);
  });

  it('shows a 1-2 ATR candidate as WATCH without sending a strategy event', () => {
    const result = Array.from({ length: 20 }, (_, step) => 0.5 + step * 0.25).map(pullback => {
      const daily = breakoutDaily();
      daily[daily.length - 1] = {
        ...daily[daily.length - 1],
        open: daily[daily.length - 2].close - pullback + 0.1,
        close: daily[daily.length - 2].close - pullback,
        high: daily[daily.length - 2].close - pullback + 0.5,
        low: daily[daily.length - 2].close - pullback - 0.5
      };
      return evaluateDailyStrategyAlerts('TEST', 'stocks', daily, [], bullishWeekly());
    }).find(candidate => candidate.current?.stage === 'WATCH');

    assert.ok(result);
    assert.equal(result.current?.stage, 'WATCH');
    assert.ok((result.current?.distanceToBreakoutAtr || 0) > 1);
    assert.ok((result.current?.distanceToBreakoutAtr || Number.MAX_VALUE) <= 2);
    assert.deepEqual(result.events, []);
    assert.match(result.current?.exitRule || '', /Doar monitorizare/);
  });

  it('does not issue production strategy alerts for crypto or metals', () => {
    const daily = breakoutDaily();
    assert.deepEqual(evaluateDailyStrategyAlerts('ETH', 'crypto', daily, [], bullishWeekly()).snapshots, []);
    assert.deepEqual(evaluateDailyStrategyAlerts('GOLD', 'metals', daily, [], bullishWeekly()).snapshots, []);
  });

  it('rejects the LONG setup when the Weekly regime is not bullish', () => {
    const daily = breakoutDaily();
    const bearishWeekly = bullishWeekly().map((candle, index, values) => ({
      ...candle,
      close: values.length * 2 + 100 - index * 2,
      open: values.length * 2 + 101 - index * 2,
      high: values.length * 2 + 102 - index * 2,
      low: values.length * 2 + 99 - index * 2
    }));

    const result = evaluateDailyStrategyAlerts('TEST', 'stocks', daily, [], bearishWeekly);
    assert.deepEqual(result.snapshots, []);
    assert.deepEqual(result.events, []);
  });
});
