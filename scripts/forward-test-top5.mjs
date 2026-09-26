// forward-test-top5.mjs
// 7-day forward test of the UNVALIDATED SMA top-5 ranking.
// Daily: freeze today's top 5 (once, never reselected), record entries whose
// entry candle has closed. With --report: full outcome report vs BTC
// buy-and-hold and the validated RVOL>=2 paper cohort.
// Append-only log: tmp/paper-trades/forward-test-top5.jsonl
// Research only - no orders, no exchange connections, no credentials.

import { mkdir, readFile, appendFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MoneyLineEngine } from '../packages/money-line/dist/engine.js';
import { scanAll, rankSetups, DAY_MS } from './trend-ranking-core.mjs';
import { parseLog as parsePaperLog } from './paper-trade-logger.mjs';
import {
  parseLog, serializeRecords, deriveState, freezeSelection, recordEntries,
  computeOutcome, btcBenchmark, aggregate, dedupeKey, eligibleEntry
} from './forward-test-top5-core.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOG_DIR = path.join(REPO_ROOT, 'tmp', 'paper-trades');
const LOG_PATH = path.join(LOG_DIR, 'forward-test-top5.jsonl');
const REPORT_PATH = path.join(LOG_DIR, 'forward-test-top5-report.json');
const PAPER_LOG_PATH = path.join(LOG_DIR, 'rvol2-flips.jsonl');

const REPORT_MODE = process.argv.includes('--report');

// Original frozen Sep 18-24 sample remains append-only and unevaluable.
// Corrected prospective seven-day window: scans Sep 26 through Oct 2 (UTC).
// Never backfill missed days or select beyond the new window.
const TEST_WINDOW_LAST_SCAN_DATE = '2026-10-02';
const RESTART_FIRST_SCAN_DATE = '2026-09-26'; // first run Sep 26 UTC

async function run() {
  await mkdir(LOG_DIR, { recursive: true });
  let records = [];
  try { records = parseLog(await readFile(LOG_PATH, 'utf8')); } catch { /* first run */ }

  const now = new Date().toISOString();
  const engine = new MoneyLineEngine();
  const { maturedEvents, currentSetups, perAsset, lastClosed, errors } = await scanAll(engine, {
    onSymbol: sym => process.stdout.write(`${sym} `)
  });
  console.log('');
  const lastClosedUtc = new Date(lastClosed).toISOString();
  const scanDate = lastClosedUtc.slice(0, 10); // scan is keyed to the last closed candle

  const newRecords = [];
  if (!REPORT_MODE) {
    if (now.slice(0,10) >= '2026-09-26' && scanDate >= RESTART_FIRST_SCAN_DATE && scanDate <= TEST_WINDOW_LAST_SCAN_DATE) {
      const ranked = rankSetups(maturedEvents, currentSetups).slice(0, 5);
      newRecords.push(...freezeSelection({
        records, scanDate, rankedTop5: ranked, now, lastClosedCandleUtc: lastClosedUtc
      }));
    } else {
      console.log(`Test window closed (last scan ${TEST_WINDOW_LAST_SCAN_DATE}); entries only.`);
    }
    const allSoFar = records.concat(newRecords);
    newRecords.push(...recordEntries({
      records: allSoFar,
      getAssetCandles: sym => perAsset.get(sym)?.candles,
      now
    }));
    if (newRecords.length) {
      // Close the concurrent-run race (Sep 22 incident: two morning runs
      // double-appended scanDate 2026-09-21): re-read the log immediately
      // before appending and drop anything a parallel run already wrote.
      let fresh = [];
      try { fresh = parseLog(await readFile(LOG_PATH, 'utf8')); } catch { /* first run */ }
      const existing = new Set(fresh.map(dedupeKey).filter(Boolean));
      const kept = newRecords.filter(r => { const k = dedupeKey(r); return k === null || !existing.has(k); });
      const skipped = newRecords.length - kept.length;
      if (skipped) console.log(`  skipped ${skipped} duplicate(s) already appended by a concurrent run`);
      if (kept.length) await appendFile(LOG_PATH, serializeRecords(kept));
      newRecords.length = 0;
      newRecords.push(...kept);
    }
    const frozen = newRecords.filter(r => r.type === 'selection');
    const entered = newRecords.filter(r => r.type === 'entry');
    console.log(`Forward test (${scanDate}): ${frozen.length} new selection(s), ${entered.length} new entr(ies).`);
    for (const s of frozen) console.log(`  #${s.rank} ${s.symbol} p=${(s.probability * 100).toFixed(0)}% flip ${s.flipDate} rvol ${s.rvol}x`);
    for (const e of entered) console.log(`  entry ${e.symbol} @ ${e.entry} (stop ${e.stop})`);
    if (!newRecords.length) console.log('  no-op (already frozen today, no new closed entry candles)');
    if (errors.length) console.log(`  data errors: ${errors.join('; ')}`);
    return;
  }

  // ---- final report ----
  const { selectionsByDate, entries } = deriveState(records);
  const outcomes = [], pending = [], legacyUnevaluable = [], repeatedSnapshots = [];
  const seenSetups = new Set();
  for (const [scanDate, sels] of [...selectionsByDate.entries()].sort()) {
    for (const sel of sels) {
      const old = scanDate < RESTART_FIRST_SCAN_DATE;
      const setupKey = `${old ? 'legacy' : 'prospective'}:${sel.symbol}:${sel.flipTime}`;
      if (seenSetups.has(setupKey)) { repeatedSnapshots.push(`${sel.symbol} (${scanDate})`); continue; }
      seenSetups.add(setupKey);
      const entryRec = entries.get(`${scanDate}:${sel.symbol}`);
      if (old) {
        legacyUnevaluable.push(`${sel.symbol} (${scanDate}): original pre-freeze entry protocol`);
        continue;
      }
      if (entryRec && !eligibleEntry(sel, entryRec)) {
        legacyUnevaluable.push(`${sel.symbol} (${scanDate}): pre-freeze or unconfirmed entry`);
        continue;
      }
      const asset = perAsset.get(sel.symbol);
      if (!entryRec || !asset) { pending.push(`${sel.symbol} (${scanDate})`); continue; }
      const outcome = computeOutcome(sel, entryRec, asset.candles, asset.signals);
      if (outcome) outcomes.push(outcome);
      else pending.push(`${sel.symbol} (${scanDate})`);
    }
  }

  const btc = perAsset.get('BTC')?.candles || [];
  for (const o of outcomes) {
    o.btcReturnPct = btcBenchmark(btc, o.entryDate, o.exitDate);
    o.excessVsBtcPct = o.btcReturnPct !== null ? Number((o.totalReturnPct - o.btcReturnPct).toFixed(2)) : null;
  }

  // RVOL>=2 paper cohort for the corrected prospective test window
  let rvol2Cohort = [];
  try {
    const paperRecords = parsePaperLog(await readFile(PAPER_LOG_PATH, 'utf8'));
    const windowStart = RESTART_FIRST_SCAN_DATE, windowEnd = TEST_WINDOW_LAST_SCAN_DATE;
    rvol2Cohort = paperRecords
      .filter(r => r.type === 'resolved' && r.flipDate >= windowStart && r.flipDate <= windowEnd)
      .map(r => ({ symbol: r.symbol, flipDate: r.flipDate, r: r.r, reason: r.reason }));
  } catch { /* no paper log yet */ }

  const complete = outcomes.filter(o => o.complete);
  const report = {
    generatedAt: now,
    testWindow: [...selectionsByDate.keys()].sort(),
    evidenceStatus: 'UNVALIDATED. Original seven-day sample has no causally eligible entries. Corrected prospective window is separate; no edge claim from this small sample.',
    protocol: 'First post-freeze UTC daily open; record after its candle closes. 0.125% per side. First-wins unique symbol:flipTime.',
    oldWindow: { scanDates: ['2026-09-18', '2026-09-24'], status: 'unevaluable', reason: 'all existing entries predate their frozen selection time' },
    newWindow: { scanDates: [RESTART_FIRST_SCAN_DATE, TEST_WINDOW_LAST_SCAN_DATE], firstFreezeDateUtc: '2026-09-27' },
    rawSnapshotCount: [...selectionsByDate.values()].reduce((n, arr) => n + arr.length, 0),
    uniqueSetupCount: seenSetups.size,
    eligibleCompletedCount: complete.length,
    legacyUnevaluable, repeatedSnapshots,
    selections: outcomes,
    pendingEntries: pending,
    aggregateAll: aggregate(complete),
    openMarks: outcomes.filter(o => !o.complete),
    aggregateCompleteOnly: aggregate(complete),
    benchmark: {
      btcMeanReturnPct: complete.length ? Number((complete.filter(o => o.btcReturnPct !== null).reduce((a, o) => a + o.btcReturnPct, 0) / Math.max(1, complete.filter(o => o.btcReturnPct !== null).length)).toFixed(2)) : null,
      meanExcessVsBtcPct: complete.length ? Number((complete.filter(o => o.excessVsBtcPct !== null).reduce((a, o) => a + o.excessVsBtcPct, 0) / Math.max(1, complete.filter(o => o.excessVsBtcPct !== null).length)).toFixed(2)) : null
    },
    rvol2ValidatedCohort: rvol2Cohort,
    dataErrors: errors
  };
  await writeFile(REPORT_PATH, JSON.stringify(report, null, 2) + '\n');

  console.log(`Forward test report (${report.testWindow[0]} .. ${report.testWindow.at(-1)}):`);
  console.log(`  unique setups: ${seenSetups.size}, eligible completed: ${complete.length}, open: ${outcomes.length - complete.length}, legacy unevaluable: ${legacyUnevaluable.length}, repeated snapshots: ${repeatedSnapshots.length}, pending entry: ${pending.length}`);
  const agg = report.aggregateAll;
  console.log(`  win rate ${agg.winRatePct ?? '-'}% | mean return ${agg.meanReturnPct ?? '-'}% | drawdown ${agg.drawdownPct ?? '-'}% | exits ${JSON.stringify(agg.byExit || {})}`);
  console.log(`  BTC mean (matched windows) ${report.benchmark.btcMeanReturnPct ?? '-'}% | mean excess ${report.benchmark.meanExcessVsBtcPct ?? '-'}%`);
  console.log(`  validated RVOL>=2 cohort in window: ${rvol2Cohort.length} resolved trade(s)`);
  console.log(`  wrote ${path.relative(REPO_ROOT, REPORT_PATH)}`);
}

run().catch(err => { console.error(err); process.exit(1); });