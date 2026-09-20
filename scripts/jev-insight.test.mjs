import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TIERS, pickTier, fallbackDecision, buildCohortEntry, validateInsight,
  findForbiddenKeys, buildPrompt, estimateCostUsd, renderMarkdown,
  CONFIDENCE_LABELS, CALIBRATION_STATEMENT, reclaimToScanEntries
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
  assert.match(payload.task, /top 1/); // task scales to cohort size (nTop)
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

test('reclaimToScanEntries keeps only NEW_SIGNAL rows with full reclaim evidence', () => {
  const report = {
    ruleId: 'DAILY_SMA50_200_RECLAIM', analyzedDay: '2026-09-18', reproducedAt: '2026-09-20T01:14:00Z',
    results: [
      { symbol: 'ADA', name: 'Cardano', status: 'NEW_SIGNAL', ruleId: 'DAILY_SMA50_200_RECLAIM', source: 'binance_spot', pair: 'ADAUSDT', rank: 18, analyzedDayTimestamp: 1789689600000, eventId: 'evt',
        signal: { confirmationPrice: 0.2244, previousClose: 0.21, sma50: 0.200468, sma200: 0.214805, sma50Direction: 'RISING', sma200Direction: 'FALLING', atr14: 0.01, distanceToUpperSmaAtr: 0.72, rvol: 1.73, rvolHighlighted: true, dailyMoneyLine: { tier: 'Bullish', score: 40, bullish: false }, weeklyMoneyLine: { tier: 'Neutral', score: 5, bullish: false } } },
      { symbol: 'BBB', status: 'ABOVE_BOTH', signal: { confirmationPrice: 2, sma50: 1, sma200: 1.5 } },
      { symbol: 'CCC', status: 'NO_SIGNAL' }
    ]
  };
  const rows = reclaimToScanEntries(report);
  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.equal(row.symbol, 'ADA');
  assert.equal(row.direction, 'BULLISH');
  assert.equal(row.status, 'NEW_SIGNAL');
  assert.equal(row.triggerPrice, 0.214805); // upper of SMA50/SMA200
  assert.equal(row.distanceAtr, 0.72);
  assert.equal(row.moneyLineTier, 'Bullish');
  assert.equal(row.weeklyTier, 'Neutral');
  assert.equal(row.marketCapRank, 18);
  assert.equal(row.reclaim.confirmationPrice, 0.2244);
  assert.equal(row.reclaim.sma50Direction, 'RISING');
  assert.equal(row.reclaim.rvolHighlighted, true);

  const entry = buildCohortEntry(row, { '1d': { tier: 'Bullish', sma50: 1, sma200: 1, rvol: 1.5 }, '1w': { tier: 'Neutral', sma50: 1, sma200: 1, rvol: 1 } });
  assert.equal(entry.scan.reclaim.confirmationPrice, 0.2244);
  assert.equal(entry.scan.marketCapRank, 18);
});

test('buildPrompt includes a symbol ledger and compact ATH fields', () => {
  const cohort = [
    { symbol: 'AAA', marketClass: 'crypto', deterministic: {}, ath: { features: { distToAthPct: 50, daysSinceAth: 100, componentBreakdown: 'verbose' }, potential: { score: 70, flags: [] }, momentum: { score: 55 } } },
    { symbol: 'BBB', marketClass: 'crypto', deterministic: {} }
  ];
  const { user } = buildPrompt({ scanMeta: { source: 't' }, cohort });
  const parsed = JSON.parse(user);
  assert.deepEqual(parsed.symbolLedger.symbols, ['AAA', 'BBB']);
  assert.equal(parsed.symbolLedger.count, 2);
  assert.ok(parsed.symbolLedger.rule.includes('exactly once'));
  assert.equal(parsed.cohort[0].ath.potentialScore, 70);
  assert.equal(parsed.cohort[0].ath.momentumScore, 55);
  assert.equal(parsed.cohort[0].ath.distToAthPct, 50);
  assert.equal(parsed.cohort[0].ath.features, undefined);
  assert.equal(parsed.cohort[1].ath, undefined);
});

test('buildPrompt encodes the chart-first ranking priorities (Marius 2026-09-20)', () => {
  const { system } = buildPrompt({ scanMeta: {}, cohort: [] });
  assert.match(system, /Weekly Money Line bullish or very near a bullish flip/);
  assert.match(system, /above SMA50 and SMA200/);
  assert.match(system, /Bitcoin market regime/);
  assert.match(system, /Fundamentals.*only rank or break ties/);
  assert.match(system, /Never let strong fundamentals rescue a bearish chart/);
});
