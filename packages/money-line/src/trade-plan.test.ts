import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Candle, MoneyLineSignal, Timeframe } from '@money-scanner/shared';
import { MoneyLineCloudSeries } from './cloud-supertrend.js';
import { calculateBullishTradePlan, getTradePlanProfile } from './trade-plan.js';

const makeSignal = (timeframe: Timeframe, score = 68): MoneyLineSignal => ({
  symbol: 'BTC',
  timeframe,
  score,
  tier: score >= 60 ? 'Strong Bullish' : score >= 20 ? 'Bullish' : score <= -20 ? 'Bearish' : 'Neutral',
  previousTier: 'Neutral',
  isTransition: true,
  rawIndicators: {
    ema20: 104,
    ema50: 101,
    ema200: 90,
    ema20Slope: 1.2,
    roc9: 2,
    roc21: 4,
    macd: { line: 2, signal: 1, histogram: 1, histogramSlope: 0.2 },
    rsi14: 62,
    rsiRegime: 'Bullish',
    rvol: 1.6,
    volumeMA20: 1_000,
    atr14: 4,
    atrPercent: 3.5
  },
  contributions: {
    emaAlignmentScore: 80,
    emaSlopeScore: 70,
    rocScore: 60,
    macdScore: 70,
    rsiScore: 50,
    rvolScore: 45,
    volatilityRegimeScore: 40,
    mtfConfirmationScore: 0
  },
  candleTimestamp: 1_700_000_000_000,
  calculationTimestamp: 1_700_000_000_100,
  version: 'test'
});

const candles: Candle[] = Array.from({ length: 30 }, (_unused, index) => ({
  timestamp: 1_700_000_000_000 + index * 14_400_000,
  open: 96 + index * 0.35,
  high: 101 + index * 0.35,
  low: 94 + index * 0.35,
  close: 100 + index * 0.35,
  volume: 1_500,
  isClosed: true
}));

const cloud: MoneyLineCloudSeries = {
  lineFast: candles.map((_candle, index) => 92 + index * 0.35),
  lineSlow: candles.map((_candle, index) => 89 + index * 0.35),
  sma50: candles.map(() => 90),
  sma200: candles.map(() => 80),
  dirFast: candles.map(() => -1),
  dirSlow: candles.map(() => -1),
  buySignals: candles.map((_candle, index) => index === candles.length - 1),
  sellSignals: candles.map(() => false)
};

describe('timeframe-aware bullish trade plan', () => {
  it('uses the 1D and 1W context and a 2.5R target for a 4H alert', () => {
    const plan = calculateBullishTradePlan({
      timeframe: '4h',
      candles,
      cloud,
      signal: makeSignal('4h'),
      currentPrice: 103,
      confirmationSignals: {
        '1d': makeSignal('1d', 55),
        '1w': makeSignal('1w', 25)
      }
    });

    assert.deepEqual(getTradePlanProfile('4h').confirmationTimeframes, ['1d', '1w']);
    assert.equal(plan.targetRiskReward, 2.5);
    assert.ok(plan.stopLoss < plan.suggestedEntry);
    assert.ok(plan.target1 > plan.suggestedEntry);
    assert.ok(plan.target2 > plan.target1);
    assert.ok(plan.target3 !== undefined && plan.target3 > plan.target2);
    assert.ok(plan.confidence >= 65);
  });

  it('rejects a bullish lower-timeframe flip when a required higher timeframe is bearish', () => {
    const bearishDaily = makeSignal('1d', -45);
    const plan = calculateBullishTradePlan({
      timeframe: '4h',
      candles,
      cloud,
      signal: makeSignal('4h'),
      currentPrice: 103,
      confirmationSignals: { '1d': bearishDaily, '1w': makeSignal('1w', 25) }
    });

    assert.equal(plan.action, 'AVOID');
    assert.ok(plan.reasons.some(reason => reason.includes('contrar')));
  });

  it('waits for a retest instead of recommending a chased entry', () => {
    const plan = calculateBullishTradePlan({
      timeframe: '1h',
      candles,
      cloud,
      signal: makeSignal('1h'),
      currentPrice: 125,
      confirmationSignals: { '4h': makeSignal('4h', 55), '1d': makeSignal('1d', 30) }
    });

    assert.equal(plan.action, 'WAIT_RETEST');
    assert.ok(plan.chaseAtr > getTradePlanProfile('1h').maxChaseAtr);
  });
});
