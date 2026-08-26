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

describe('Connors RSI(2) trend pullback backtest', () => {
  const connorsDaily = candles(700, 86_400_000, index => {
    const trend = 100 + index * 0.12;
    const phase = index % 28;
    if (phase === 20) return trend - 2;
    if (phase === 21) return trend - 5;
    if (phase === 22) return trend - 8;
    if (phase === 23) return trend - 3;
    return trend + Math.sin(index / 9) * 0.4;
  });

  it('buys an RSI2 pullback only after the signal close and exits on SMA5 mean reversion', () => {
    const result = new BacktestSimulatorService().runConnorsRsi2Backtest(
      'TEST', connorsDaily, { directionMode: 'LONG_ONLY' }
    );

    assert.equal(result.params.strategy, 'connors_rsi2');
    assert.ok(result.totalTrades >= 10);
    assert.ok(result.winRate > 50);
    assert.ok(result.trades.every(trade => trade.side === 'LONG'));
    assert.ok(result.trades.every(trade => (trade.initialStop || 0) > 0 && Number.isFinite(trade.rMultiple)));
    assert.ok(result.priceSeries?.every(point => Number.isFinite(point.sma5) && Number.isFinite(point.rsi2)));
    assert.ok(result.strategySources?.some(source => source.url.includes('stockcharts.com')));
  });

  it('keeps mature indicators but starts the out-of-sample equity window at the requested timestamp', () => {
    const evaluationStartTimestamp = connorsDaily[520].timestamp;
    const result = new BacktestSimulatorService().runConnorsRsi2Backtest(
      'TEST', connorsDaily, { evaluationStartTimestamp }
    );

    assert.equal(result.params.startTimestamp, evaluationStartTimestamp);
    assert.equal(result.priceSeries?.[0].timestamp, evaluationStartTimestamp);
    assert.ok(result.totalTrades > 0);
  });
});

describe('Bear Rally Fade RSI(2) short backtest', () => {
  const bearishDaily = candles(900, 86_400_000, index => {
    const trend = 800 - index * 0.4;
    const phase = index % 36;
    if (phase === 20) return trend + 2;
    if (phase === 21) return trend + 8;
    if (phase === 22) return trend + 16;
    if (phase === 23) return trend + 25;
    if (phase === 24) return trend + 13;
    if (phase === 25) return trend + 2;
    return trend + Math.sin(index / 8) * 0.35;
  });
  const bearishBenchmark = candles(900, 86_400_000, index => 1_000 - index * 0.45 + Math.sin(index / 17));

  it('arms the rally above RSI2 95, confirms below 50, then opens only SHORT positions', () => {
    const result = new BacktestSimulatorService().runBearRallyFadeBacktest(
      'TEST', bearishDaily, bearishBenchmark, { marketClass: 'crypto' }
    );

    assert.equal(result.params.strategy, 'bear_rally_fade');
    assert.equal(result.params.directionMode, 'SHORT_ONLY');
    assert.ok(result.totalTrades >= 8);
    assert.ok(result.trades.every(trade => trade.side === 'SHORT'));
    assert.ok(result.trades.every(trade => (trade.initialStop || 0) > trade.entryPrice));
    assert.ok(result.priceSeries?.some(point => point.armedShort));
    assert.ok(result.priceSeries?.some(point => point.shortTrigger));
    assert.ok(result.priceSeries?.every(point => typeof point.benchmarkBearish === 'boolean'));
    assert.ok(result.strategyRules?.some(rule => rule.includes('benchmark')));
  });

  it('keeps indicator warm-up outside the chronological holdout window', () => {
    const evaluationStartTimestamp = bearishDaily[700].timestamp;
    const result = new BacktestSimulatorService().runBearRallyFadeBacktest(
      'TEST', bearishDaily, bearishBenchmark, { marketClass: 'stocks', evaluationStartTimestamp }
    );

    assert.equal(result.params.startTimestamp, evaluationStartTimestamp);
    assert.equal(result.priceSeries?.[0].timestamp, evaluationStartTimestamp);
    assert.ok(result.totalTrades > 0);
  });
});
