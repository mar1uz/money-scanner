import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AXES_WEIGHTS, AXES_MISSING, levelBand, trendBand,
  scoreFundamentals, scoreOnchain, scoreNarrative, combineFourAxes
} from './four-axes-lib.mjs';

test('weights sum to 1', () => {
  assert.ok(Math.abs(Object.values(AXES_WEIGHTS).reduce((a, b) => a + b) - 1) < 1e-9);
});

test('fundamentals: strong fees business scores high', () => {
  const s = scoreFundamentals({ fees30d: 23e6, feesPrev30d: 17e6 });
  assert.ok(s.score >= 70, `score ${s.score}`);
  assert.equal(s.flags.length, 0);
});

test('fundamentals: missing fees stay flagged neutral-low, never zero', () => {
  const s = scoreFundamentals({ fees30d: null, feesPrev30d: null });
  assert.equal(s.score, AXES_MISSING);
  assert.ok(s.flags.includes('fundamentals-not-provided'));
});

test('onchain: privacy chain is not comparable - flagged, not zero', () => {
  const s = scoreOnchain({ symbol: 'XMR', tvl: null, tvlChange30dPct: null });
  assert.equal(s.score, AXES_MISSING);
  assert.ok(s.flags.includes('onchain-not-comparable'));
  assert.ok(s.note.includes('privacy'));
});

test('onchain: chain with big growing TVL scores high', () => {
  const s = scoreOnchain({ symbol: 'SOL', tvl: 12e9, tvlChange30dPct: 8 });
  assert.ok(s.score >= 70, `score ${s.score}`);
});

test('narrative: trending presence scored, absence flagged limited coverage', () => {
  assert.equal(scoreNarrative({ trendingRank: 3 }).score, 90);
  assert.equal(scoreNarrative({ trendingRank: 12 }).score, 75);
  const off = scoreNarrative({ trendingRank: null });
  assert.equal(off.score, AXES_MISSING);
  assert.ok(off.flags.includes('mindshare-limited-trending-only'));
});

test('combineFourAxes applies visible weights and flags missing axes', () => {
  const r = combineFourAxes({
    momentumScore: 75.4, athScore: 82,
    fundamentals: { score: AXES_MISSING }, onchain: { score: AXES_MISSING }, narrative: { score: AXES_MISSING }
  });
  // 0.25*75.4 + 0.25*82 + 0.2*40 + 0.2*40 + 0.1*40 = 18.85+20.5+8+8+4 = 59.35
  assert.ok(r.score >= 59.3 && r.score <= 59.5, `score ${r.score}`);
  assert.deepEqual(r.weights, AXES_WEIGHTS);
});

test('bands behave at edges', () => {
  assert.equal(levelBand(null, 1, 100).score, AXES_MISSING);
  assert.ok(levelBand(5e7, 1e5, 5e7).score > 90);
  assert.ok(trendBand(-50).score <= 10);
  assert.ok(trendBand(50).score >= 90);
  assert.equal(trendBand(null).score, AXES_MISSING);
});
