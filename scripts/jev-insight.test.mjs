import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TIERS, pickTier, fallbackDecision, buildCohortEntry, validateInsight,
  findForbiddenKeys, buildPrompt, estimateCostUsd, renderMarkdown,
  CONFIDENCE_LABELS, CALIBRATION_STATEMENT
} from './jev-insight-lib.mjs';

const SYMBOLS = ['AAA', 'BBB', 'CCC', 'DDD', 'EEE', 'FFF', 'GGG', 'HHH', 'III', 'JJJ',
  'KKK', 'LLL', 'MMM', 'NNN', 'OOO', 'PPP', 'QQQ', 'RRR', 'SSS', 'TTT'];

function validInsight() {
  return {
    top10: SYMBOLS.slice(0, 10).map((symbol, i) => ({
      rank: i + 1, symbol, why: `why ${symbol}`,
      pro: ['p1'], con: ['c1'], invalidation: 'below trigger 1.00',
      resistance: 'high 2.00', confidence: 'medium',
      timeframes1d1w: i % 3 === 0 ? 'confirm' : 'mixed'
    })),
    eliminated: SYMBOLS.slice(10).map(symbol => ({ symbol, reason: `out ${symbol}` })),
    notes: 'confidence labels are qualitative, not calibrated probabilities'
  };
}

test('pickTier maps complexity scores to tiers', () => {
  assert.equal(pickTier(0.5, 0.9).tier, 'cheap');
  assert.equal(pickTier(1.19, 0.9).tier, 'cheap');
  assert.equal(pickTier(1.2, 0.9).tier, 'mid');
  assert.equal(pickTier(2.79, 0.9).tier, 'mid');
  assert.equal(pickTier(2.8, 0.9).tier, 'frontier');
  assert.equal(pickTier(4, 0.9).tier, 'frontier');
});

test('pickTier escalates one tier on low confidence, capped at frontier', () => {
  const d = pickTier(0.5, 0.4);
  assert.equal(d.tier, 'mid');
  assert.equal(d.escalated, true);
  assert.match(d.reason, /escalated/);
  const top = pickTier(3.5, 0.2);
  assert.equal(top.tier, 'frontier');
  assert.equal(top.escalated, true);
  const noConf = pickTier(1.5, null);
  assert.equal(noConf.tier, 'mid');
  assert.equal(noConf.escalated, false);
});

test('fallbackDecision is the documented mid-tier heuristic', () => {
  const d = fallbackDecision('free-tier rate limit');
  assert.equal(d.tier, 'mid');
  assert.equal(d.fallback, true);
  assert.match(d.reason, /jev unavailable \(free-tier rate limit\)/);
});

test('buildCohortEntry flags scan-only stocks and missing series fields', () => {
  const stock = buildCohortEntry({ symbol: 'CRM', marketClass: 'stocks', id: 'stocks:CRM:8h:BEARISH' }, null);
  assert.equal(stock.deterministic, null);
  assert.ok(stock.missingData.some(m => /scan fields only/.test(m)));
  assert.ok(stock.missingData.some(m => /fundamentals\/on-chain\/narrative\/mindshare/.test(m)));

  const det = {
    '1d': { tier: 'Bullish', score: 50, sma50: 1, sma200: null, rvol: 1.2 },
    '1w': { error: 'insufficient closed candles (11)' }
  };
  const crypto = buildCohortEntry({ symbol: 'GRAM', marketClass: 'crypto', id: 'crypto:GRAM:8h:BULLISH' }, det);
  assert.ok(crypto.missingData.some(m => /1d: SMA200 unavailable/.test(m)));
  assert.ok(crypto.missingData.some(m => /1w: insufficient closed candles/.test(m)));
});

test('validateInsight accepts a complete, clean top-10 insight', () => {
  const r = validateInsight(validInsight(), SYMBOLS);
  assert.deepEqual(r.errors, []);
  assert.equal(r.ok, true);
});

test('validateInsight rejects probability-like keys anywhere in the tree', () => {
  const bad = validInsight();
  bad.top10[0].continuationProbability = 0.42;
  const r = validateInsight(bad, SYMBOLS);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => /forbidden probability-like key/.test(e)));
  const bad2 = validInsight();
  bad2.meta = { winRate: '30%' };
  assert.equal(validateInsight(bad2, SYMBOLS).ok, false);
});

test('validateInsight enforces ranks, cohort membership, labels and coverage', () => {
  const wrongRank = validInsight();
  wrongRank.top10[0].rank = 11;
  assert.ok(validateInsight(wrongRank, SYMBOLS).errors.some(e => /ranks must be 1\.\.10/.test(e)));

  const outsider = validInsight();
  outsider.top10[0].symbol = 'ZZZ';
  assert.ok(validateInsight(outsider, SYMBOLS).errors.some(e => /not in cohort/.test(e)));

  const badConf = validInsight();
  badConf.top10[0].confidence = 'very-high';
  assert.ok(validateInsight(badConf, SYMBOLS).errors.some(e => new RegExp(`one of ${CONFIDENCE_LABELS.join('/')}`).test(e)));

  const badTf = validInsight();
  badTf.top10[0].timeframes1d1w = 'aligned';
  assert.ok(validateInsight(badTf, SYMBOLS).errors.some(e => /timeframes1d1w/.test(e)));

  const gap = validInsight();
  gap.eliminated = gap.eliminated.slice(1);
  assert.ok(validateInsight(gap, SYMBOLS).errors.some(e => /coverage incomplete.*KKK/.test(e)));
});

test('findForbiddenKeys walks nested arrays and objects', () => {
  const hits = findForbiddenKeys({ a: [{ chance: 1 }, { b: { Likelihood: 2 } }], ok: 3 });
  assert.deepEqual(hits, ['$.a[0].chance', '$.a[1].b.Likelihood']);
});

test('buildPrompt forbids probabilities and embeds scan meta + cohort', () => {
  const { system, user } = buildPrompt({
    scanMeta: { scanGeneratedAt: '2026-09-19T16:33:11.491Z', cohortSize: 20 },
    cohort: [{ symbol: 'AAA' }]
  });
  assert.match(system, /NEVER output probabilities/);
  assert.match(system, /not a calibrated probability/);
  assert.match(system, /top10/);
  const payload = JSON.parse(user);
  assert.equal(payload.scan.scanGeneratedAt, '2026-09-19T16:33:11.491Z');
  assert.equal(payload.cohort[0].symbol, 'AAA');
  assert.match(payload.task, /top 10/);
});

test('estimateCostUsd uses tier pricing', () => {
  assert.equal(estimateCostUsd('cheap', { inputTokens: 1_000_000, outputTokens: 1_000_000 }), 0);
  const mid = estimateCostUsd('mid', { inputTokens: 1_000_000, outputTokens: 1_000_000 });
  assert.ok(Math.abs(mid - (0.04 + 0.15)) < 1e-9);
  const frontier = estimateCostUsd('frontier', { inputTokens: 10_000, outputTokens: 2_000 });
  assert.ok(Math.abs(frontier - (10_000 / 1e6 * 5 + 2_000 / 1e6 * 25)) < 1e-12);
  assert.equal(estimateCostUsd('nope', {}), null);
});

test('renderMarkdown shows top 10, eliminated, routing and calibration', () => {
  const report = {
    generatedAt: '2026-09-20T00:00:00.000Z', status: 'ok',
    pipeline: { scanGeneratedAt: '2026-09-19T16:33:11.491Z', scanMethod: 'local', universeCount: 277, cohortSize: 20, lastClosedDaily: '2026-09-18', lastClosedWeekly: '2026-09-07' },
    routing: { reason: 'complexity 3.10/4 -> Frontier', model: TIERS.mid.model, fallback: false, degradedReason: 'frontier needs paid credits' },
    insight: validInsight(),
    usage: { estimatedCostUsd: 0.001 },
    calibration: { probabilityFieldsPresent: false, statement: CALIBRATION_STATEMENT }
  };
  const md = renderMarkdown(report);
  assert.match(md, /## Top 10 \(1D x 1W combined\)/);
  assert.match(md, /### 10\. JJJ/);
  assert.match(md, /- TTT: out TTT/);
  assert.match(md, /degraded: frontier needs paid credits/);
  assert.match(md, /No probability in this report is calibrated/);
});

test('renderMarkdown banners blocked reports and keeps packet intact', () => {
  const md = renderMarkdown({
    generatedAt: '2026-09-20T00:00:00.000Z', status: 'blocked:model-rate-limited',
    blockedReason: '429 free tier', pipeline: { cohortSize: 20 },
    routing: null, insight: null, calibration: { statement: CALIBRATION_STATEMENT }
  });
  assert.match(md, /BLOCKED: 429 free tier/);
  assert.match(md, /Not trading advice\./);
});
