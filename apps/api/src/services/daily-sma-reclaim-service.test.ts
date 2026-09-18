import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Candle } from '@money-scanner/shared';
import { deriveClosedUtcWeeks, evaluateDailySmaReclaim } from './daily-sma-reclaim-service.js';

const DAY = 86_400_000;
const makeSeries = (lastClose: number, previousClose = 100, volumes = 10): Candle[] => {
  const start = Date.UTC(2025, 0, 1);
  return Array.from({ length: 220 }, (_, index) => {
    const close = index === 219 ? lastClose : index === 218 ? previousClose : 100;
    return { timestamp: start + index * DAY, open: close, high: Math.max(close, 100) + 1, low: Math.min(close, 100) - 1, close, volume: index === 219 ? volumes : 10, isClosed: true };
  });
};

const evaluate = (series: Candle[]) => evaluateDailySmaReclaim('TEST', series, {
  expectedDayTimestamp: series.at(-1)!.timestamp,
  evaluatedAt: 123,
  source: 'fixture',
  pair: 'TESTUSDT',
  name: 'Test Coin',
  rank: 42
});

describe('DAILY_SMA50_200_RECLAIM evaluator', () => {
  it('detects a reclaim of both averages in the same closed candle', () => {
    const result = evaluate(makeSeries(102, 99));
    assert.equal(result.status, 'NEW_SIGNAL');
    assert.equal(result.signal?.confirmationPrice, 102);
    assert.ok(result.signal!.sma50 < 102 && result.signal!.sma200 < 102);
  });

  it('detects recovery when the averages were lost on different days', () => {
    const series = makeSeries(102, 99);
    series[217] = { ...series[217], close: 101 }; // above SMA50, below SMA200 is represented by the next close
    series[218] = { ...series[218], close: 99 };
    assert.equal(evaluate(series).status, 'NEW_SIGNAL');
  });

  it('does not trigger on equality, a wick, or an open candle', () => {
    assert.notEqual(evaluate(makeSeries(100, 100)).status, 'NEW_SIGNAL');
    const wick = makeSeries(100, 100);
    wick[219] = { ...wick[219], high: 130, close: 100 };
    assert.notEqual(evaluate(wick).status, 'NEW_SIGNAL');
    const open = makeSeries(102, 99);
    open[219] = { ...open[219], isClosed: false };
    assert.equal(evaluate(open).status, 'STALE_DATA');
  });

  it('does not repeat an alert while price remains above both averages', () => {
    const result = evaluate(makeSeries(103, 102));
    assert.equal(result.status, 'ABOVE_BOTH');
  });

  it('requires consecutive valid history and rejects gaps, duplicates, and invalid values', () => {
    const short = makeSeries(102, 99).slice(-200);
    assert.equal(evaluate(short).status, 'INSUFFICIENT_HISTORY');
    const gap = makeSeries(102, 99);
    gap[100] = { ...gap[100], timestamp: gap[100].timestamp + DAY };
    assert.equal(evaluate(gap).status, 'INSUFFICIENT_HISTORY');
    const duplicate = makeSeries(102, 99);
    duplicate[100] = { ...duplicate[99] };
    assert.equal(evaluate(duplicate).status, 'INSUFFICIENT_HISTORY');
    const invalid = makeSeries(102, 99);
    invalid[10] = { ...invalid[10], close: NaN };
    assert.equal(evaluate(invalid).status, 'INSUFFICIENT_HISTORY');
  });

  it('calculates RVOL from the 20 preceding days only and derives closed UTC weeks', () => {
    const series = makeSeries(102, 99, 30);
    const result = evaluate(series);
    assert.equal(result.signal?.rvol, 3);
    const weeks = deriveClosedUtcWeeks(series);
    assert.ok(weeks.length >= 30);
    assert.ok(weeks.every(week => week.isClosed));
  });

  it('does not accept a cache that ends before the expected UTC day', () => {
    const series = makeSeries(102, 99);
    assert.equal(evaluateDailySmaReclaim('TEST', series, { expectedDayTimestamp: series.at(-1)!.timestamp + DAY }).status, 'STALE_DATA');
  });
});
