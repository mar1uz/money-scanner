// Tests for the forward-test top-5 core. Run: node --test scripts/forward-test-top5.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  freezeSelection, recordEntries, computeOutcome, btcBenchmark,
  aggregate, deriveState, parseLog, serializeRecords, dedupeFirstWins
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

test('recordEntries waits for the entry candle, then records costed entry once', () => {
  const selections = frozenSet();
  // entry candle not closed yet (only flip candle exists)
  let recs = recordEntries({
    records: selections,
    getAssetCandles: () => [candle(0, 100, 104, 99, 103)],
    now: NOW
  });
  assert.equal(recs.length, 0);
  // entry candle closed
  const candles = [candle(0, 100, 104, 99, 103), candle(1, 103, 105, 102, 104)];
  recs = recordEntries({ records: selections, getAssetCandles: () => candles, now: NOW });
  assert.equal(recs.length, 5);
  assert.ok(recs[0].entry > 103, 'entry includes costs');
  assert.ok(recs[0].stop < recs[0].entry);
  // second run: no duplicates
  const again = recordEntries({ records: selections.concat(recs), getAssetCandles: () => candles, now: NOW });
  assert.equal(again.length, 0);
});

test('computeOutcome: stop triggers before invalidation, returns stop price', () => {
  const sel = frozenSet()[0];
  const entryRec = {
    type: 'entry', scanDate: sel.scanDate, symbol: sel.symbol, flipTime: sel.flipTime,
    entryTime: T0 + DAY, entryDate: '2026-09-19', entry: 103.13, stop: 96.88, risk: 6.25
  };
  const candles = [
    candle(0, 100, 104, 99, 103),
    candle(1, 103, 104, 96, 97),     // low breaches stop 96.88
    candle(2, 97, 98, 90, 91)        // would be below sma50 - stop came first
  ];
  const signals = [{ tier: 'Bullish' }, { tier: 'Bullish' }, { tier: 'Bullish' }];
  const o = computeOutcome(sel, entryRec, candles, signals);
  assert.equal(o.exitReason, 'stop');
  assert.equal(o.exitPrice, 96.88);
  assert.ok(o.totalReturnPct < 0);
  assert.equal(o.complete, true);
});

test('computeOutcome: horizon exit at last close with MFE/MAE/daily returns', () => {
  const sel = frozenSet()[0];
  const entryRec = {
    type: 'entry', scanDate: sel.scanDate, symbol: sel.symbol, flipTime: sel.flipTime,
    entryTime: T0 + DAY, entryDate: '2026-09-19', entry: 103.13, stop: 90, risk: 13.13
  };
  const candles = [candle(0, 100, 104, 99, 103)];
  const signals = [{ tier: 'Bullish' }];
  for (let i = 1; i <= 8; i++) {
    candles.push(candle(i, 103 + i, 103 + i + 4, 102 + i, 103 + i + 2)); // rising, close > sma50=95
    signals.push({ tier: 'Bullish' });
  }
  const o = computeOutcome(sel, entryRec, candles, signals);
  assert.equal(o.exitReason, 'horizon');
  assert.equal(o.daysHeld, 7); // 7-day window
  assert.ok(o.mfePct > 0 && o.maePct <= 0);
  assert.equal(o.dailyReturnsPct.length, 7);
  assert.equal(o.complete, true);
});

test('btcBenchmark aligns matching calendar window', () => {
  const btc = [
    { timestamp: T0 + DAY, open: 100, high: 101, low: 99, close: 100 },
    { timestamp: T0 + 3 * DAY, open: 100, high: 112, low: 99, close: 110 }
  ];
  const r = btcBenchmark(btc, '2026-09-19', '2026-09-21');
  assert.ok(Math.abs(r - 9.89) < 0.05); // 110 / 100.125 - 1
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
  assert.equal(entries.length, 5);
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