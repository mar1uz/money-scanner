import test from 'node:test';
import assert from 'node:assert/strict';
import { selectUiTop20, buildUiTop20Scan } from './nearflip-ui-top20.mjs';

const pool = [
  { symbol: 'AAA', marketClass: 'crypto', timeframe: '8h', direction: 'BULLISH', status: 'AWAITING_CLOSE', distanceAtr: 0, priorityScore: 90 },
  { symbol: 'BBB', marketClass: 'crypto', timeframe: '1w', direction: 'BULLISH', status: 'AWAITING_CLOSE', distanceAtr: 0, priorityScore: 85 },
  { symbol: 'AAA', marketClass: 'crypto', timeframe: '1w', direction: 'BULLISH', status: 'AWAITING_CLOSE', distanceAtr: 0.1, priorityScore: 80 },
  { symbol: 'CCC', marketClass: 'stocks', timeframe: '8h', direction: 'BULLISH', status: 'AWAITING_CLOSE', distanceAtr: 0.2, priorityScore: 70 },
  { symbol: 'DDD', marketClass: 'crypto', timeframe: '4h', direction: 'BEARISH', status: 'CONFIRMED', distanceAtr: 0, priorityScore: 99 }
];

test('one candidate per asset: best-ranked wins, later duplicates drop', () => {
  const out = selectUiTop20(pool);
  assert.deepEqual(out.map(c => c.symbol), ['AAA', 'BBB', 'CCC']);
  assert.equal(out[0].timeframe, '8h'); // first in ranked order, not the 1w duplicate
});

test('confirmed candidates are excluded (rankUpcomingCandidates contract)', () => {
  const out = selectUiTop20(pool);
  assert.ok(!out.some(c => c.symbol === 'DDD'));
});

test('limit applies after dedupe', () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ symbol: `S${i}`, marketClass: 'crypto', timeframe: '1d', status: 'CLOSE' }));
  assert.equal(selectUiTop20(many).length, 20);
  assert.equal(selectUiTop20(many, 10).length, 10);
});

test('buildUiTop20Scan preserves provenance and pool size', () => {
  const scan = { generatedAt: '2026-09-19T23:39:24Z', method: 'm', universeCount: 277, upcomingCandidates: pool };
  const out = buildUiTop20Scan(scan);
  assert.equal(out.ruleId, 'NEAR_FLIP_UI_TOP20');
  assert.equal(out.sourceGeneratedAt, scan.generatedAt);
  assert.equal(out.candidatePool, 5);
  assert.equal(out.upcomingCandidates.length, 3);
});
