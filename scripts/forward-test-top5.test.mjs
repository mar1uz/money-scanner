// Tests for the forward-test top-5 core. Run: node --test scripts/forward-test-top5.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  freezeSelection, recordEntries, computeOutcome, btcBenchmark,
  aggregate, deriveState, parseLog, serializeRecords, dedupeFirstWins,
  firstFutureOpen, eligibleEntry, FORWARD_FIX_AT
} from './forward-test-top5-core.mjs';

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 8, 18); // 2026-09-18 flip candle
const NOW = '2026-09-19T05:00:00.000Z';
const candle = (i, o, h, l, c) => ({ timestamp: T0 + i * DAY, open: o, high: h, low: l, close: c, volume: 1, isClosed: true });

const rankedTop5 = [1, 2, 3, 4, 5].map((r, i) => ({
  symbol: `A${r}`, flipDate: '2026-09-18', flipTime: T0,
  probability: 0.5 - i * 0.05, score: 40, rvol: 2.5, atrPercent: 5,
  atr14: 5, sma50: 95, hypotheticalEntry: 100, stop: 93.75, riskPct: 6.25
}));

function frozenSet() {
  return freezeSelection({
    records: [], scanDate: '2026-09-18', rankedTop5, now: NOW,
    lastClosedCandleUtc: '2026-09-18T00:00:00.000Z'
  });
}

test('freezeSelection writes exactly 5 records with ranks and provenance', () => {
  const recs = frozenSet();
  assert.equal(recs.length, 5);
  assert.deepEqual(recs.map(r => r.rank), [1, 2, 3, 4, 5]);
  assert.equal(recs[0].scanDate, '2026-09-18');
  assert.equal(recs[0].recordedAt, NOW);
  assert.match(recs[0].evidenceStatus, /UNVALIDATED/);
});

test('freezeSelection is idempotent per scanDate (no reselection, no duplicates)', () => {
  const first = frozenSet();
  const second = freezeSelection({
    records: first, scanDate: '2026-09-18',
    rankedTop5: rankedTop5.map(t => ({ ...t, probability: 0.99 })), // even if ranking changed
    now: '2026-09-19T06:00:00.000Z', lastClosedCandleUtc: '2026-09-18T00:00:00.000Z'
  });
  assert.equal(second.length, 0);
  // next day freezes independently
  const third = freezeSelection({
    records: first, scanDate: '2026-09-19', rankedTop5,
    now: '2026-09-20T05:00:00.000Z', lastClosedCandleUtc: '2026-09-19T00:00:00.000Z'
  });
  assert.equal(third.length, 5);
});

test('legacy frozen entries are not backfilled', () => {
  const sel = frozenSet()[0];
  const candles = [candle(0, 100, 104, 99, 103), candle(1, 103, 105, 102, 104)];
  assert.equal(recordEntries({ records: [sel], getAssetCandles: () => candles, now: NOW }).length, 0);
  assert.equal(computeOutcome(sel, {entryTime: T0 + DAY, recordedAt: NOW}, candles, []), null);
});

test('next UTC open strictly follows selection freeze and only closed candles enter', () => {
  const sel = { ...frozenSet()[0], recordedAt: FORWARD_FIX_AT, scanDate: '2026-09-25' };
  assert.equal(firstFutureOpen(sel), Date.UTC(2026, 8, 27));
  const candles = Array.from({ length: 11 }, (_, i) => candle(i, 100, 105, 96, 103));
  let entries = recordEntries({ records: [sel], getAssetCandles: () => candles.slice(0, 9), now: '2026-09-27T05:00:00Z' });
  assert.equal(entries.length, 0);
  entries = recordEntries({ records: [sel], getAssetCandles: () => candles.slice(0, 10), now: '2026-09-28T05:00:00Z' });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].entryDate, '2026-09-27');
  assert.ok(eligibleEntry(sel, entries[0]));
  assert.equal(recordEntries({ records: [sel, ...entries], getAssetCandles: () => candles, now: '2026-09-29T05:00:00Z' }).length, 0);
});

test('legacy pre-freeze entry is unevaluable; future exit uses both-side costs', () => {
  const sel = { ...frozenSet()[0], recordedAt: FORWARD_FIX_AT };
  const entryTime = firstFutureOpen(sel);
  const candles = Array.from({ length: 17 }, (_, i) => candle(i, 100, 105, 96, 100));
  const signals = candles.map(() => ({ tier: 'Bullish' }));
  const entry = { type: 'entry', entryTime, entryDate: '2026-09-27', entry: 100.125, stop: 80, recordedAt: '2026-09-28T01:00:00Z' };
  assert.equal(computeOutcome(sel, { ...entry, entryTime: T0 + DAY }, candles, signals), null);
  const mark = computeOutcome(sel, entry, candles.slice(0, 11), signals);
  assert.equal(mark.exitReason, 'open-mark'); assert.equal(mark.complete, false);
  const out = computeOutcome(sel, entry, candles, signals);
  assert.equal(out.exitReason, 'horizon'); assert.equal(out.complete, true);
  assert.equal(out.daysHeld, 7); assert.equal(out.totalReturnPct, -0.25);
  assert.equal(btcBenchmark(candles, out.entryDate, out.exitDate), -0.25);
});

test('aggregate computes win rate, mean return, drawdown, exits', () => {
  const outcomes = [
    { totalReturnPct: 10, mfePct: 12, maePct: -2, exitReason: 'horizon' },
    { totalReturnPct: -5, mfePct: 1, maePct: -6, exitReason: 'stop' },
    { totalReturnPct: 3, mfePct: 4, maePct: -1, exitReason: 'horizon' }
  ];
  const a = aggregate(outcomes);
  assert.equal(a.count, 3);
  assert.ok(Math.abs(a.winRatePct - 66.7) < 0.05);
  assert.ok(Math.abs(a.meanReturnPct - 2.67) < 0.05);
  assert.equal(a.drawdownPct, 5);
  assert.deepEqual(a.byExit, { horizon: 2, stop: 1 });
});

test('dedupe: a double-appended batch (Sep 21 incident) reads first-wins', () => {
  const first = frozenSet();
  const dup = frozenSet().map(r => ({ ...r, recordedAt: '2026-09-19T05:00:27.000Z' })); // concurrent second run
  const doubled = first.concat(dup);
  const deduped = dedupeFirstWins(doubled);
  assert.equal(deduped.length, 5);
  assert.deepEqual(deduped, first); // first batch wins, provenance of both stays in the file
  const state = deriveState(doubled);
  assert.equal(state.selectionsByDate.get('2026-09-18').length, 5); // not 10
  // entries over doubled selections still record once per scanDate:symbol
  const candles = [candle(0, 100, 104, 99, 103), candle(1, 103, 105, 102, 104)];
  const entries = recordEntries({ records: doubled, getAssetCandles: () => candles, now: NOW });
  assert.equal(entries.length, 0); // legacy frozen rows are not backfilled
});

test('dedupe: marker lines pass through and never dedupe', () => {
  const marker = { type: 'dedupe-note', scanDate: '2026-09-18', notedAt: NOW };
  const recs = frozenSet().concat([marker]);
  assert.equal(dedupeFirstWins(recs).length, recs.length);
  const state = deriveState(parseLog(serializeRecords(recs)));
  assert.equal(state.selectionsByDate.get('2026-09-18').length, 5);
});

test('JSONL round-trip', () => {
  const recs = frozenSet();
  assert.deepEqual(parseLog(serializeRecords(recs)), recs);
  const state = deriveState(recs);
  assert.equal(state.selectionsByDate.get('2026-09-18').length, 5);
});