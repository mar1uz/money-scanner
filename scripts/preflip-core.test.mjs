import test from 'node:test';
import assert from 'node:assert/strict';
import { atr } from './backtest-tight-risk-breakout.mjs';
import {
  detectCandidateEpisodes, stage1Outcome, stage2Outcome, candidateFeatures,
  trainLogreg, CONFIRM_HORIZON_DAYS
} from './preflip-core.mjs';

function makeCandles(closes, start = Date.UTC(2024, 0, 1)) {
  return closes.map((close, i) => ({
    timestamp: start + i * 86_400_000,
    open: i ? closes[i - 1] : close,
    high: close * 1.01, low: close * 0.99, close,
    volume: 1000, quoteVolume: 1_000_000, isClosed: true
  }));
}
function flatCloud(n, { dirSlow = 1, line = 110, buyAt = -1 } = {}) {
  return {
    dirFast: new Array(n).fill(dirSlow),
    dirSlow: new Array(n).fill(dirSlow),
    lineFast: new Array(n).fill(line),
    lineSlow: new Array(n).fill(line),
    buySignals: Array.from({ length: n }, (_, i) => i === buyAt),
    sellSignals: new Array(n).fill(false),
    sma50: new Array(n).fill(100), sma200: new Array(n).fill(100)
  };
}

test('episode detection: enters zone once per approach, resets when out', () => {
  // closes: 100 (dist 10 = 2 ATR), 104 (1.2 ATR), 106 (0.8 -> episode), 107 (still, no new),
  // 100 (out), 106 (new episode)
  const candles = makeCandles([100, 104, 106, 107, 100, 106]);
  const cloud = flatCloud(6);
  const a14 = new Array(6).fill(5);
  const eps = detectCandidateEpisodes(candles, cloud, a14);
  assert.equal(eps.length, 2);
  assert.equal(eps[0].index, 2);
  assert.equal(eps[1].index, 5);
  assert.ok(Math.abs(eps[0].distAtr - 0.8) < 1e-9);
  assert.equal(eps[0].triggerPrice, 110);
  assert.equal(eps[0].baseDays, 2);
});

test('episode detection: no episode while trend bullish or price above line', () => {
  const candles = makeCandles([106, 106]);
  assert.equal(detectCandidateEpisodes(candles, flatCloud(2, { dirSlow: -1 }), new Array(2).fill(5)).length, 0);
  assert.equal(detectCandidateEpisodes(candles, flatCloud(2, { line: 105 }), new Array(2).fill(5)).length, 0);
});

test('stage1Outcome: confirms within horizon, expires otherwise', () => {
  const candles = makeCandles(new Array(40).fill(100));
  const cloud = flatCloud(40, { buyAt: 8 });
  const s1 = stage1Outcome({ index: 3 }, cloud);
  assert.deepEqual([s1.confirmed, s1.confirmIndex, s1.daysToConfirm], [1, 8, 5]);
  const s2 = stage1Outcome({ index: 3 }, flatCloud(40));
  assert.deepEqual([s2.confirmed, s2.confirmIndex], [0, -1]);
  const s3 = stage1Outcome({ index: 30 }, flatCloud(40, { buyAt: 30 + CONFIRM_HORIZON_DAYS + 2 }));
  assert.equal(s3.confirmed, 0); // beyond horizon is not a confirm (and beyond array)
});

test('stage2Outcome: +20% before -10% wins, reverse loses', () => {
  const base = makeCandles([100, 100, 100]);
  const up = [...base, ...makeCandles([100, 100, 125], base[2].timestamp + 86_400_000)];
  // entry next open after confirm index 2 -> open 100; day later high 125*1.01 >= 120
  assert.equal(stage2Outcome(2, up).profit, 1);
  const down = [...base, ...makeCandles([100, 100, 85], base[2].timestamp + 86_400_000)];
  assert.equal(stage2Outcome(2, down).profit, 0);
  assert.equal(stage2Outcome(399, makeCandles(new Array(400).fill(100))), null);
});

test('candidateFeatures: strict cutoff - future data cannot change features', () => {
  const n = 300, cut = 250;
  const closes = Array.from({ length: n }, (_, i) => 100 + 10 * Math.sin(i / 8) + (i % 7) * 0.3);
  const full = makeCandles(closes);
  // wildly different future - must not affect features at `cut`
  const alt = makeCandles(closes.map((c, i) => (i > cut ? c * 3 : c)));
  const mkSignals = len => Array.from({ length: len }, (_, i) => ({
    score: (i % 40) - 20, rawIndicators: { rvol: 1.1, rsi14: 50, atrPercent: 3 }
  }));
  const mkCloud = len => ({
    dirFast: new Array(len).fill(1), dirSlow: new Array(len).fill(1),
    lineFast: new Array(len).fill(130), lineSlow: new Array(len).fill(130),
    buySignals: new Array(len).fill(false), sellSignals: new Array(len).fill(false),
    sma50: new Array(len).fill(100), sma200: new Array(len).fill(100)
  });
  const cand = { index: cut, candidateTime: full[cut].timestamp, distAtr: 0.5, distPct: 4, baseDays: 20, triggerPrice: 130 };
  const tvlBase = Date.UTC(2023, 0, 1);
  const tvlFull = Array.from({ length: 400 }, (_, i) => ({ t: tvlBase + i * 86_400_000, tvl: 1e9 * (1 + i / 200) }));
  const tvlCut = tvlFull.filter(r => r.t <= cand.candidateTime);
  const funding = [{ t: cand.candidateTime - 86_400_000, rate: 0.0001 }, { t: cand.candidateTime, rate: 0.0002 }, { t: cand.candidateTime + 86_400_000, rate: 9 }];

  const runOne = (candles, tvl) => candidateFeatures('TEST', candles, mkSignals(candles.length), atr(candles, 14), mkCloud(candles.length), cand, funding, tvl, new Map()).features;
  const a = runOne(full, tvlFull);
  const b = runOne(full.slice(0, cut + 1), tvlCut);
  const c = runOne(alt, tvlFull);
  assert.deepEqual(a, b);
  assert.deepEqual(a, c);
  assert.equal(a.hasTvl, 1);
  assert.ok(a.tvlChg30 > 0);
});

test('trainLogreg: separates a trivially separable set', () => {
  const rows = [];
  for (let i = 0; i < 60; i++) {
    rows.push({ features: { x: i >= 30 ? 1 : -1 }, y: i >= 30 ? 1 : 0 });
  }
  const m = trainLogreg(rows, ['x'], r => r.y);
  assert.ok(m.prob({ features: { x: 1 } }) > 0.9);
  assert.ok(m.prob({ features: { x: -1 } }) < 0.1);
});

import { tradeQuality, compositeScore } from './preflip-core.mjs';

test('tradeQuality: anchors stop below the nearest defensible level, no future data', () => {
  // 120 bars drifting down then flat; flip line 96, SMA50 94; price closes 95 (below line)
  const closes = Array.from({ length: 120 }, (_, i) => (i < 90 ? 100 - i * 0.05 : 95.5));
  const candles = makeCandles(closes);
  const cloud = flatCloud(120, { line: 96 });
  cloud.sma50 = new Array(120).fill(94);
  cloud.sma200 = new Array(120).fill(90);
  const a14 = new Array(120).fill(2);
  const tq = tradeQuality(candles, a14, cloud, 119);
  assert.ok(tq);
  // entry proxy = flip line 96 (above close); nearest level below = sma50 94 vs base low ~93.56 vs swing ~93.56
  assert.equal(tq.entry, 96);
  assert.equal(tq.stopBasis, 'base-low-30d'); // 94.545 base low sits above sma50 94 -> nearer
  assert.ok(Math.abs(tq.stop - (95.5 * 0.99 - 0.5)) < 1e-9);
  assert.ok(tq.stopDistPct > 0 && tq.stopDistPct < 5);
  // truncation: same result without the (nonexistent here) future; test cutoff by evaluating identical prefixes
  const tq2 = tradeQuality(candles.slice(0, 120), a14.slice(0, 120), { ...cloud, lineSlow: cloud.lineSlow.slice(0, 120), sma50: cloud.sma50.slice(0, 120) }, 119);
  assert.deepEqual(tq, tq2);
});

test('tradeQuality: price above line -> entry = close, stop at nearest defensible level', () => {
  // closes 100, lows 99: base low 99 sits above flip line 98 and is nearer -> tighter stop
  const candles = makeCandles(Array.from({ length: 60 }, () => 100));
  const cloud = flatCloud(60, { line: 98 });
  cloud.sma50 = new Array(60).fill(97);
  const tq = tradeQuality(candles, new Array(60).fill(2), cloud, 59);
  assert.equal(tq.entry, 100);
  assert.equal(tq.stopBasis, 'base-low-30d');
  assert.ok(Math.abs(tq.stop - (99 - 0.5)) < 1e-9);
  assert.ok(tq.rr > 0);
  // with every other level deeper, the flip threshold becomes the anchor
  const candles2 = makeCandles(Array.from({ length: 60 }, (_, i) => (i < 40 ? 96 : 100)));
  const cloud2 = flatCloud(60, { line: 99.5 });
  cloud2.sma50 = new Array(60).fill(95);
  const tq2 = tradeQuality(candles2, new Array(60).fill(2), cloud2, 59);
  assert.equal(tq2.stopBasis, 'flip-threshold');
  assert.ok(Math.abs(tq2.stop - (99.5 - 0.5)) < 1e-9);
});

test('compositeScore: better RR scores higher, extension penalized', () => {
  const near = { rr: 2, extSma50: 0.02 };
  const extended = { rr: 2, extSma50: 0.4 };
  const badRr = { rr: 0.3, extSma50: 0.02 };
  assert.ok(compositeScore(0.6, near) > compositeScore(0.6, extended));
  assert.ok(compositeScore(0.6, near) > compositeScore(0.6, badRr));
  assert.ok(compositeScore(0.6, null) < compositeScore(0.6, near));
});
