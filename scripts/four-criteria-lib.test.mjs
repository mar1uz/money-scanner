import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { QC_WEIGHTS, FINAL_WEIGHTS, loadFourCriteriaScan, matchCriteriaAsset, summarizeCriteria, combineWithQuality, combineFinal } from './four-criteria-lib.mjs';

const scan = { generatedAt: 't', assets: [
  { symbol: 'SOL', score: 87, passedCriteria: 3, classification: 'partial', criteria: { growth: { status: 'pass', value: '+5.4%' }, networkEffect: { status: 'watch', value: '$23.33M fees / 30z' }, sustainableRevenue: { status: 'pass', value: '$2.57M / 30z' }, holderValue: { status: 'pass', value: '$2.57M / 30z' } }, metrics: { fees30d: 23.3e6 } },
  { symbol: 'JASMY', score: 0, passedCriteria: 0, classification: 'insufficient-data', criteria: {}, metrics: {} }
] };

test('weights sum to 1', () => {
  assert.ok(Math.abs(Object.values(QC_WEIGHTS).reduce((a, b) => a + b) - 1) < 1e-9);
});

test('load + match by symbol', () => {
  writeFileSync('/tmp/qc-test.json', JSON.stringify(scan));
  const loaded = loadFourCriteriaScan('/tmp/qc-test.json');
  assert.equal(matchCriteriaAsset(loaded, 'sol').score, 87);
  assert.equal(matchCriteriaAsset(loaded, 'NOPE'), null);
});

test('summarize keeps gate values and flags insufficient data', () => {
  const s = summarizeCriteria(scan.assets[0]);
  assert.equal(s.passedCriteria, 3);
  assert.equal(s.gates.growth.value, '+5.4%');
  assert.equal(s.flags.length, 0);
  const j = summarizeCriteria(scan.assets[1]);
  assert.ok(j.flags.includes('qc-insufficient-data'));
  const missing = summarizeCriteria(null);
  assert.equal(missing.covered, false);
  assert.ok(missing.flags.includes('qc-not-in-top200'));
});

test('combineWithQuality applies visible weights; missing qc flagged and scored 0', () => {
  const r = combineWithQuality({ momentumScore: 68.7, athScore: 62.9, qc: summarizeCriteria(scan.assets[0]) });
  // 68.7*.35 + 62.9*.35 + 87*.30 = 24.045+22.015+26.1 = 72.16
  assert.ok(r.score >= 72.1 && r.score <= 72.3, `score ${r.score}`);
  assert.deepEqual(r.weights, QC_WEIGHTS);
  const m = combineWithQuality({ momentumScore: 50, athScore: 50, qc: summarizeCriteria(null) });
  assert.equal(m.parts.protocolQuality, 0);
  assert.ok(m.flags.includes('qc-not-in-top200'));
});

test('combineFinal applies visible weights without double counting', () => {
  const r = combineFinal({
    momentumScore: 68.7, athScore: 62.9,
    qc: summarizeCriteria(scan.assets[0]),
    narrative: { score: 40, flags: ['mindshare-limited-trending-only'] }
  });
  // 68.7*.3 + 62.9*.3 + 87*.25 + 40*.15 = 20.61+18.87+21.75+6 = 67.23
  assert.ok(r.score >= 67.1 && r.score <= 67.4, `score ${r.score}`);
  assert.deepEqual(r.weights, FINAL_WEIGHTS);
  assert.ok(Math.abs(Object.values(FINAL_WEIGHTS).reduce((a, b) => a + b) - 1) < 1e-9);
});

test('combineFinal: missing qc scores 0 per app semantics, missing narrative neutral-low', () => {
  const r = combineFinal({ momentumScore: 50, athScore: 50, qc: summarizeCriteria(null), narrative: { score: null, flags: [] } });
  assert.equal(r.parts.protocolQuality, 0);
  assert.equal(r.parts.narrative, 40);
  assert.ok(r.flags.includes('qc-not-in-top200'));
  assert.ok(r.flags.includes('narrative-missing'));
});
