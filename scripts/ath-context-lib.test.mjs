import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ATH_WEIGHTS, COMBINED_WEIGHTS, bandTimeSinceAth, bandDistToAth, bandWeeklyStructure,
  bandFundamentalsTrend, computeAthFeatures, scoreAthPotential, computeMomentumScore,
  combineRankings, LEGACY_CAP
} from './ath-context-lib.mjs';

const NOW = Date.UTC(2026, 8, 20);

function legacyFeatures() {
  return computeAthFeatures({
    coingecko: { ath: 3.4, ath_date: '2018-01-07T00:00:00.000Z', market_cap: 8e9, fully_diluted_valuation: 9e9, circulating_supply: 35e9, max_supply: 45e9 },
    det1d: { close: 0.22, ret30: 12, medianQuoteVol20USD: 28e6, candles: 999 },
    det1w: { tier: 'Neutral', score: -10, status: 'early' },
    btcRet30: 15, llama: null, now: NOW
  });
}

function strongFeatures() {
  return computeAthFeatures({
    coingecko: { ath: 3.1, ath_date: '2026-06-01T00:00:00.000Z', market_cap: 2e9, fully_diluted_valuation: 2.4e9, circulating_supply: 8e8, total_supply: 1e9 },
    det1d: { close: 2.49, ret30: 22, medianQuoteVol20USD: 3.6e6, candles: 700 },
    det1w: { tier: 'Strong Bullish', score: 69, status: 'confirmed/above' },
    btcRet30: 5, llama: { tvl: 4e9, change_1m: 0.12 }, now: NOW
  });
}

test('ATH feature derivation: distance, days, mcap multiple, RS vs BTC, FDV', () => {
  const f = legacyFeatures();
  assert.equal(f.ath, 3.4);
  assert.ok(f.daysSinceAth > 3000);
  assert.ok(f.distToAthPct > 1400); // 3.4/0.22 - 1
  assert.equal(f.rsVsBtc30Pct, -3);
  assert.equal(f.fdvToMcap, 1.13);
  assert.equal(f.circulatingPct, 77.8);
  assert.equal(f.tvlChange30dPct, null);
});

test('legacy multi-year bearish project is hard-capped and flagged', () => {
  const f = legacyFeatures();
  f.weeklyTier = 'Bearish'; // 1W bearish confirms the legacy regime
  const s = scoreAthPotential(f);
  assert.equal(s.score, LEGACY_CAP);
  assert.ok(s.flags.includes('legacy-penalty'));
  assert.ok(s.components.legacyCap.reason.includes('d ago'));
});

test('strong recent project scores high without caps', () => {
  const s = scoreAthPotential(strongFeatures());
  assert.ok(s.score >= 80, `score ${s.score}`);
  assert.ok(!s.flags.includes('legacy-penalty'));
});

test('short-history token: ATH recency is capped, not rewarded', () => {
  const f = computeAthFeatures({
    coingecko: { ath: 1.2, ath_date: '2026-08-01T00:00:00.000Z', market_cap: 1e8, fully_diluted_valuation: 1e9 },
    det1d: { close: 1.0, ret30: 30, medianQuoteVol20USD: 2e6, candles: 200 },
    det1w: { tier: 'Bullish', score: 50, status: 'candidate' },
    btcRet30: 5, llama: null, now: NOW
  });
  const s = scoreAthPotential(f);
  assert.ok(s.flags.includes('short-history-ath-unreliable'));
  assert.equal(s.components.timeSinceAth.score, 60);
});

test('missing fundamentals score neutral-low and are flagged, never hidden', () => {
  const s = scoreAthPotential(strongFeatures());
  // strongFeatures has llama; remove it
  const f = { ...strongFeatures(), tvlChange30dPct: null };
  const s2 = scoreAthPotential(f);
  assert.ok(s2.score < s.score);
  assert.ok(s2.flags.includes('fundamentals-not-provided'));
  assert.equal(s2.components.fundamentalsTrend.score, 40);
});

test('bands behave at edges', () => {
  assert.equal(bandTimeSinceAth(89).score, 100);
  assert.equal(bandTimeSinceAth(1460).score, 15);
  assert.equal(bandTimeSinceAth(null).score, 40);
  assert.equal(bandDistToAth(29.9).score, 100);
  assert.equal(bandDistToAth(95).score, 8);
  assert.equal(bandWeeklyStructure('Strong Bullish', 'confirmed/above').score, 100);
  assert.equal(bandWeeklyStructure('Strong Bearish', 'early').score, 5);
  assert.equal(bandFundamentalsTrend(null).score, 40);
});

test('momentum composite uses visible weights and flags gaps', () => {
  const m = computeMomentumScore({ score: 74.7, ret30: 37.8, rvol: 0.98 }, { score: 24.1 });
  assert.ok(m.score > 50);
  assert.deepEqual(Object.keys(m.components).sort(), ['ret30', 'rvol1d', 'score1d', 'score1w']);
  const gappy = computeMomentumScore(null, null);
  assert.ok(gappy.flags.length === 4);
  assert.equal(gappy.score, 40);
});

test('combineRankings merges with explicit weights and keeps all inputs visible', () => {
  const r = combineRankings(
    ['AAA', 'BBB'],
    { AAA: { score: 90 }, BBB: { score: 40 } },
    { AAA: { score: 30 }, BBB: { score: 85 } }
  );
  assert.deepEqual(r.weights, COMBINED_WEIGHTS);
  assert.equal(r.combined[0].symbol, 'BBB'); // 40*0.5+85*0.5=62.5 vs 90*0.5+30*0.5=60
  assert.equal(r.combined[0].combined, 62.5);
  assert.equal(r.momentum[0].symbol, 'AAA');
  assert.equal(r.athPotential[0].symbol, 'BBB');
});

test('weights sum to 1 for both layers', () => {
  assert.ok(Math.abs(Object.values(ATH_WEIGHTS).reduce((a, b) => a + b) - 1) < 1e-9);
  assert.ok(Math.abs(COMBINED_WEIGHTS.momentum + COMBINED_WEIGHTS.athPotential - 1) < 1e-9);
});
