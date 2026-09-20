import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Candle } from '@money-scanner/shared';
import { clusterZones, detectStructure, findPivots, regressionChannel } from './structure-scanner-service.js';

const H4 = 4 * 3_600_000;

const makeCandles = (closes: number[], highLowSpread = 0.004): Candle[] => {
  const start = Date.UTC(2026, 0, 1) - closes.length * H4;
  return closes.map((close, index) => {
    const open = index > 0 ? closes[index - 1] : close;
    return {
      timestamp: start + index * H4,
      open,
      high: Math.max(open, close) * (1 + highLowSpread),
      low: Math.min(open, close) * (1 - highLowSpread),
      close,
      volume: 100_000,
      isClosed: true
    };
  });
};

/** Oscillation around 100 between 95 and 105: clean pivots and S/R zones. */
const oscillating = (count: number, period = 50) =>
  Array.from({ length: count }, (_, index) => 100 + 5 * Math.sin((index / period) * 2 * Math.PI));

describe('findPivots', () => {
  it('finds swing highs and lows on an oscillating series', () => {
    const pivots = findPivots(makeCandles(oscillating(150)), 3);
    const highs = pivots.filter(pivot => pivot.kind === 'high');
    const lows = pivots.filter(pivot => pivot.kind === 'low');
    assert.ok(highs.length >= 2 && lows.length >= 2, `highs ${highs.length} lows ${lows.length}`);
    assert.ok(highs.every(pivot => pivot.price > 104));
    assert.ok(lows.every(pivot => pivot.price < 96));
  });
});

describe('clusterZones', () => {
  it('clusters repeated touches into one zone', () => {
    const pivots = findPivots(makeCandles(oscillating(150)), 3);
    const zones = clusterZones(pivots, 1.5);
    const big = zones.filter(zone => zone.touches >= 2);
    assert.ok(big.length >= 2, `expected support+resistance zones, got ${big.length}`);
    assert.ok(big.some(zone => zone.level < 97));
    assert.ok(big.some(zone => zone.level > 103));
  });
});

describe('regressionChannel', () => {
  it('detects an uptrend channel with sane bounds', () => {
    const closes = Array.from({ length: 150 }, (_, index) => 100 + index * 0.2 + 1.5 * Math.sin(index / 6));
    const channel = regressionChannel(makeCandles(closes), 120)!;
    assert.equal(channel.direction, 'UP');
    assert.ok(channel.upper > channel.mid && channel.mid > channel.lower);
    assert.ok(channel.slopePctPerBar > 0);
  });

  it('returns undefined with insufficient history', () => {
    assert.equal(regressionChannel(makeCandles(oscillating(80)), 120), undefined);
  });
});

describe('detectStructure', () => {
  it('flags support confluence when price sits at the zone and lower channel', () => {
    const closes = oscillating(160);
    // End at the bottom of the range: close near 95 (support) and below channel mid.
    closes[closes.length - 1] = 95.2;
    closes[closes.length - 2] = 95.6;
    const snapshot = detectStructure('TEST', '4h', makeCandles(closes))!;
    assert.ok(snapshot.supports.length > 0, 'expected at least one support zone');
    assert.equal(snapshot.confluence, true);
    assert.equal(snapshot.confluenceSide, 'support');
    assert.ok(snapshot.channel && snapshot.channel.positionSigma < -0.5);
  });

  it('flags resistance confluence at the top of the range', () => {
    const closes = oscillating(160);
    closes[closes.length - 1] = 104.8;
    closes[closes.length - 2] = 104.4;
    const snapshot = detectStructure('TEST', '8h', makeCandles(closes))!;
    assert.equal(snapshot.confluence, true);
    assert.equal(snapshot.confluenceSide, 'resistance');
  });

  it('returns null on short history and no confluence mid-range', () => {
    assert.equal(detectStructure('TEST', '4h', makeCandles(oscillating(40))), null);
    const snapshot = detectStructure('TEST', '1d', makeCandles(oscillating(160)))!;
    // Last close of a full sine period is back near 100: no zone within 0.5 ATR.
    assert.equal(snapshot.confluence, false);
  });
});
