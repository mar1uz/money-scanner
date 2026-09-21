import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LOG_START_UTC, BANDS, bandFor, entryFor, netReturn, exitsFor,
  parseLog, serializeRecords, updateLog, aggregate
} from './forward-test-score-bands-core.mjs';

const NOW = '2026-09-21T10:00:00.000Z';
const flip = (over = {}) => ({
  id: 'crypto:AAA:1d:BULLISH',
  status: 'CONFIRMED',
  symbol: 'AAA',
  marketClass: 'crypto',
  timeframe: '1d',
  direction: 'BULLISH',
  confirmedAt: LOG_START_UTC + 3_600_000,
  candleTimestamp: LOG_START_UTC,
  confirmationPrice: 100,
  currentPrice: 110,
  priorityScore: 62,
  ...over
});

test('bands partition the score range as predeclared', () => {
  assert.deepEqual(BANDS.map(b => b.id), ['<45', '45-55', '55-65', '65-75', '75+']);
  assert.equal(bandFor(20), '<45');
  assert.equal(bandFor(44.9), '<45');
  assert.equal(bandFor(45), '45-55');
  assert.equal(bandFor(55), '55-65');
  assert.equal(bandFor(65), '65-75');
  assert.equal(bandFor(75), '75+');
  assert.equal(bandFor(100), '75+');
});

test('entry is taken at flip time from scanner fields only', () => {
  const e = entryFor(flip(), NOW);
  assert.equal(e.band, '55-65');
  assert.equal(e.entryPrice, 100);
  assert.equal(e.confirmDate, '2026-09-21');
  assert.equal(e.direction, 'BULLISH');
});

test('confirmDate follows the confirmation moment, not the candle open (weekly candles)', () => {
  const weekly = flip({ candleTimestamp: LOG_START_UTC - 7 * 86_400_000 }); // week opened Sep 14
  const e = entryFor(weekly, NOW);
  assert.equal(e.confirmDate, '2026-09-21');
  assert.equal(exitsFor(e, 110, '2026-09-27').length, 0); // +7d target is Sep 28, not Sep 21
});

test('flips confirmed before LOG_START are never logged (leakage guard)', () => {
  assert.equal(entryFor(flip({ confirmedAt: LOG_START_UTC - 1 }), NOW), null);
  assert.equal(entryFor(flip({ status: 'CANDIDATE' }), NOW), null);
  assert.equal(entryFor(flip({ priorityScore: NaN }), NOW), null);
  assert.equal(entryFor(flip({ confirmationPrice: 0 }), NOW), null);
});

test('net return is direction-adjusted and costed both sides', () => {
  const longWin = netReturn('BULLISH', 100, 110);
  assert.ok(longWin > 0.097 && longWin < 0.098, `long ${longWin}`); // 10% gross minus ~0.25% costs
  const shortWin = netReturn('BEARISH', 100, 90);
  assert.ok(shortWin > 0.108 && shortWin < 0.109, `short ${shortWin}`);
  assert.ok(netReturn('BULLISH', 100, 100) < 0); // flat trade loses the costs
});

test('exits fire once per horizon, only on/after the target date', () => {
  const e = entryFor(flip(), NOW);
  assert.equal(exitsFor(e, 110, '2026-09-27').length, 0); // +7d target is 2026-09-28
  const at7 = exitsFor(e, 110, '2026-09-28');
  assert.deepEqual(at7.map(x => x.horizonDays), [7]);
  const at30 = exitsFor(e, 110, '2026-10-25');
  assert.deepEqual(at30.map(x => x.horizonDays), [7, 14, 30]);
  assert.equal(exitsFor(e, 0, '2026-10-25').length, 0); // bad price - no exits
});

test('updateLog appends each entry once and each horizon exit once', () => {
  const flips = new Map([['crypto:AAA:1d:BULLISH', flip()]]);
  const run1 = updateLog([], flips, '2026-09-21', NOW);
  assert.equal(run1.filter(r => r.kind === 'entry').length, 1);
  assert.equal(run1.filter(r => r.kind === 'exit').length, 0);
  // same day re-run: nothing new
  assert.equal(updateLog(run1, flips, '2026-09-21', NOW).length, 0);
  // +7d: one exit
  const run2 = updateLog(run1, flips, '2026-09-28', NOW);
  assert.deepEqual(run2.map(r => r.horizonDays), [7]);
  // flip absent from a later read: no exit that run
  const run3 = updateLog(run1.concat(run2), new Map(), '2026-10-25', NOW);
  assert.equal(run3.length, 0);
  // present again: remaining horizons close
  const run4 = updateLog(run1.concat(run2), flips, '2026-10-25', NOW);
  assert.deepEqual(run4.map(r => r.horizonDays), [14, 30]);
});

test('log round-trips through JSONL', () => {
  const flips = new Map([['crypto:AAA:1d:BULLISH', flip()]]);
  const recs = updateLog([], flips, '2026-09-21', NOW);
  assert.deepEqual(parseLog(serializeRecords(recs)), recs);
});

test('aggregate reports per-band per-horizon net stats plus the fixed review', () => {
  const flips = new Map([
    ['crypto:AAA:1d:BULLISH', flip()],
    ['crypto:BBB:1d:BULLISH', flip({ id: 'crypto:BBB:1d:BULLISH', symbol: 'BBB', priorityScore: 80 })]
  ]);
  let recs = updateLog([], flips, '2026-09-21', NOW);
  recs = recs.concat(updateLog(recs, flips, '2026-10-25', NOW)); // closes all horizons
  const agg = aggregate(recs);
  assert.equal(agg.totalEntries, 2);
  assert.equal(agg.review.entryTarget, 60);
  assert.equal(agg.review.date, '2026-12-21');
  const b5565 = agg.bands.find(b => b.band === '55-65');
  assert.equal(b5565.entries, 1);
  assert.equal(b5565.byHorizon[30].n, 1);
  assert.ok(b5565.byHorizon[30].mean > 0);
  assert.equal(agg.bands.find(b => b.band === '<45').entries, 0);
});
