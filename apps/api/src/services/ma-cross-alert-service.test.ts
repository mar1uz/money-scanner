import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Candle } from '@money-scanner/shared';
import { calculateSMA } from '@money-scanner/money-line';
import {
  computeBtcRegime,
  evaluateMaCross,
  formatBtcRegime,
  lastGoldenCrossIndex
} from './ma-cross-alert-service.js';

const DAY_MS = 86_400_000;

const candlesFromCloses = (closes: number[], lows?: number[]): Candle[] => {
  const start = Date.UTC(2026, 0, 1) - closes.length * DAY_MS;
  return closes.map((close, index) => ({
    timestamp: start + index * DAY_MS,
    open: index > 0 ? closes[index - 1] : close,
    high: Math.max(index > 0 ? closes[index - 1] : close, close) * 1.001,
    low: lows ? lows[index] : Math.min(index > 0 ? closes[index - 1] : close, close) * 0.999,
    close,
    volume: 1_000_000,
    isClosed: true
  }));
};

/** Rising series: guarantees SMA50 > SMA200 at the tail. */
const rising = (count: number, from = 100, step = 0.35) =>
  Array.from({ length: count }, (_, index) => from + index * step);

describe('evaluateMaCross', () => {
  it('flags a fresh daily cross above SMA50 while SMA50 > SMA200 (daily stage 1)', () => {
    const closes = rising(250);
    const candles = candlesFromCloses(closes);
    const sma50 = calculateSMA(closes, 50);
    const last = closes.length - 1;
    closes[last - 1] = sma50[last - 2] * 0.97; // dip below SMA50
    closes[last] = sma50[last - 2] * 1.04;     // close back above
    const daily = candlesFromCloses(closes);
    const result = evaluateMaCross('TEST', daily, [], { expectedDayTimestamp: daily.at(-1)!.timestamp });
    assert.equal(result.status, 'EVALUATED');
    const stage1 = result.dailyEvents.filter(event => event.stage === 'daily_stage1');
    assert.equal(stage1.length, 1);
    assert.ok(stage1[0].close > stage1[0].sma50);
    assert.ok(stage1[0].sma50 > stage1[0].sma200);
  });

  it('does not flag daily stage 1 when SMA50 is below SMA200', () => {
    const closes = Array.from({ length: 250 }, (_, index) => 200 - index * 0.35); // falling: SMA50 < SMA200
    const last = closes.length - 1;
    const sma50 = calculateSMA(closes, 50);
    closes[last - 1] = sma50[last - 2] * 0.97;
    closes[last] = sma50[last - 2] * 1.04;
    const daily = candlesFromCloses(closes);
    const result = evaluateMaCross('TEST', daily, [], { expectedDayTimestamp: daily.at(-1)!.timestamp });
    assert.equal(result.dailyEvents.filter(event => event.stage === 'daily_stage1').length, 0);
  });

  it('flags a retest that holds SMA50 in bullish alignment without a recent cross (daily stage 2)', () => {
    const closes = rising(250);
    const last = closes.length - 1;
    const sma50 = calculateSMA(closes, 50);
    const lows = closes.map(close => close * 0.995);
    closes[last] = sma50[last - 1] * 1.012;      // holds above
    lows[last] = sma50[last - 1] * 0.99;         // dips to/under SMA50 intraday
    const daily = candlesFromCloses(closes, lows);
    const result = evaluateMaCross('TEST', daily, [], { expectedDayTimestamp: daily.at(-1)!.timestamp });
    const stage2 = result.dailyEvents.filter(event => event.stage === 'daily_stage2');
    assert.equal(stage2.length, 1);
    const setup = stage2[0].setup!;
    assert.ok(setup.entryZoneHigh > setup.entryZoneLow);
    assert.ok(setup.stop < setup.entryZoneLow);
    assert.match(setup.invalidation, /închidere 1D sub/);
    assert.ok(stage2[0].close > stage2[0].sma50);
  });

  it('does not flag daily stage 2 when the low never reaches SMA50', () => {
    const closes = rising(250);
    const daily = candlesFromCloses(closes); // lows sit ~1% under close, far above SMA50
    const result = evaluateMaCross('TEST', daily, [], { expectedDayTimestamp: daily.at(-1)!.timestamp });
    assert.equal(result.dailyEvents.filter(event => event.stage === 'daily_stage2').length, 0);
  });

  it('flags a weekly cross above both SMA50 and SMA200 (weekly stage 1)', () => {
    const daily = candlesFromCloses(rising(250));
    const weeklyCloses = rising(220, 50, 0.4);
    const last = weeklyCloses.length - 1;
    const sma50 = calculateSMA(weeklyCloses, 50);
    weeklyCloses[last - 1] = sma50[last - 2] * 0.97; // below weekly SMA50
    weeklyCloses[last] = sma50[last - 2] * 1.05;     // above both
    const weekly = candlesFromCloses(weeklyCloses);
    const result = evaluateMaCross('TEST', daily, weekly, { expectedDayTimestamp: daily.at(-1)!.timestamp });
    const stage1 = result.weeklyEvents.filter(event => event.stage === 'weekly_stage1');
    assert.equal(stage1.length, 1);
    assert.ok(stage1[0].close > stage1[0].sma50 && stage1[0].close > stage1[0].sma200);
  });

  it('flags a weekly retest of the higher MA that holds (weekly stage 2)', () => {
    const daily = candlesFromCloses(rising(250));
    const weeklyCloses = rising(220, 50, 0.4);
    const last = weeklyCloses.length - 1;
    const sma50 = calculateSMA(weeklyCloses, 50);
    const lows = weeklyCloses.map(close => close * 0.995);
    weeklyCloses[last] = sma50[last - 1] * 1.02;
    lows[last] = sma50[last - 1] * 0.99; // touches the higher weekly MA
    const weekly = candlesFromCloses(weeklyCloses, lows);
    const result = evaluateMaCross('TEST', daily, weekly, { expectedDayTimestamp: daily.at(-1)!.timestamp });
    assert.equal(result.weeklyEvents.filter(event => event.stage === 'weekly_stage2').length, 1);
  });

  it('reports INSUFFICIENT_HISTORY and STALE_DATA', () => {
    const shortDaily = candlesFromCloses(rising(120));
    const insufficient = evaluateMaCross('TEST', shortDaily, [], {});
    assert.equal(insufficient.status, 'INSUFFICIENT_HISTORY');
    const daily = candlesFromCloses(rising(250));
    const stale = evaluateMaCross('TEST', daily, [], { expectedDayTimestamp: daily.at(-1)!.timestamp + DAY_MS });
    assert.equal(stale.status, 'STALE_DATA');
  });
});

describe('BTC regime', () => {
  it('labels bullish alignment and formats the line', () => {
    const regime = computeBtcRegime(candlesFromCloses(rising(250)), 45, 'T2');
    assert.equal(regime?.label, 'BULLISH');
    const line = formatBtcRegime(regime);
    assert.match(line, /Regim BTC: BULLISH/);
    assert.match(line, /ML \+45/);
  });

  it('labels bearish alignment', () => {
    const falling = Array.from({ length: 250 }, (_, index) => 200 - index * 0.35);
    const regime = computeBtcRegime(candlesFromCloses(falling));
    assert.equal(regime?.label, 'BEARISH');
  });

  it('finds the last golden cross index', () => {
    const closes = [
      ...Array.from({ length: 160 }, (_, index) => 200 - index * 0.5),  // long fall: SMA50 below SMA200
      ...Array.from({ length: 220 }, (_, index) => 120 + index * 0.55)  // then rising: cross happens in-window
    ];
    const sma50 = calculateSMA(closes, 50);
    const sma200 = calculateSMA(closes, 200);
    const index = lastGoldenCrossIndex(sma50, sma200);
    assert.ok(index > 100, `expected a golden cross after the trend turn, got ${index}`);
    assert.ok(sma50[index] > sma200[index]);
  });
});
