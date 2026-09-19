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
