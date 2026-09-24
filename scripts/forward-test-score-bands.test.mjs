import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LOG_START_UTC, BANDS, bandFor, entryFor, netReturn, exitsFor,
  parseLog, serializeRecords, updateLog, aggregate, closeOnOrAfter, entriesNeedingPrice, flipStatus
} from './forward-test-score-bands-core.mjs';

const NOW = '2026-09-21T10:00:00.000Z';
const DAY = 86_400_000;
// Daily candles Sep 14 .. Oct 31 2026 (00:00 UTC), close = 100 + day index.
const dailyCandles = (from = Date.UTC(2026, 8, 14), days = 48, closeFn = i => 100 + i) =>
  Array.from({ length: days }, (_, i) => ({ timestamp: from + i * DAY, close: closeFn(i), isClosed: true }));
const px = (over = {}) => new Map([['crypto:AAA', dailyCandles()], ...Object.entries(over)]);
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
  assert.equal(exitsFor(e, dailyCandles(), '2026-09-27').length, 0); // +7d target is Sep 28, not Sep 21
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

test('exits fire once per horizon, only on/after the target date, at the target-day close', () => {
  const e = entryFor(flip(), NOW);
  const c = dailyCandles();
  assert.equal(exitsFor(e, c, '2026-09-27').length, 0); // +7d target is 2026-09-28
  const at7 = exitsFor(e, c, '2026-09-29');
  assert.deepEqual(at7.map(x => x.horizonDays), [7]);
  assert.equal(at7[0].priceDate, '2026-09-28');
  assert.equal(at7[0].exitPrice, 114); // Sep 28 is index 14
  const at30 = exitsFor(e, c, '2026-10-25');
  assert.deepEqual(at30.map(x => x.horizonDays), [7, 14, 30]);
  assert.deepEqual(at30.map(x => x.priceDate), ['2026-09-28', '2026-10-05', '2026-10-21']);
});

test('unclosed or missing target candle waits, then becomes an explicit exit-missing', () => {
  const e = entryFor(flip(), NOW);
  const open = dailyCandles().map(c => (c.timestamp >= Date.UTC(2026, 8, 28) ? { ...c, isClosed: false } : c));
  assert.equal(exitsFor(e, open, '2026-09-28').length, 0); // candle not closed yet
  assert.equal(exitsFor(e, undefined, '2026-10-02').length, 0); // no price, still within grace
  const miss = exitsFor(e, undefined, '2026-10-03'); // target + 5d
  assert.deepEqual(miss.map(x => x.kind), ['exit-missing']);
  assert.equal(miss[0].horizonDays, 7);
});

test('weekend/holiday gap: exit uses first closed daily candle on/after target', () => {
  const gap = dailyCandles().filter(c => new Date(c.timestamp).toISOString().slice(0, 10) !== '2026-09-28');
  assert.deepEqual(closeOnOrAfter(gap, '2026-09-28'), { price: 115, priceDate: '2026-09-29' });
});

test('exits close even when the flip vanished from the scan (no silent death)', () => {
  const flips = new Map([['crypto:AAA:1d:BULLISH', flip()]]);
  const run1 = updateLog([], flips, '2026-09-21', NOW, px());
  assert.equal(run1.filter(r => r.kind === 'entry').length, 1);
  assert.equal(updateLog(run1, flips, '2026-09-21', NOW, px()).length, 0); // same-day rerun
  const run2 = updateLog(run1, new Map(), '2026-09-29', NOW, px()); // flip gone from scan
  assert.deepEqual(run2.map(r => [r.kind, r.horizonDays, r.flipStatus]), [['exit', 7, 'absent']]);
  // flip reappearing later must not re-close or re-date the 7d exit
  const run3 = updateLog(run1.concat(run2), flips, '2026-10-25', NOW, px());
  assert.deepEqual(run3.map(r => r.horizonDays), [14, 30]);
  assert.equal(run3[0].priceDate, '2026-10-05');
});

test('flip status diagnostics', () => {
  const e = entryFor(flip(), NOW);
  assert.equal(flipStatus(e, new Map([['crypto:AAA:1d:BULLISH', flip()]])), 'same');
  assert.equal(flipStatus(e, new Map([['crypto:AAA:1d:BULLISH', flip({ confirmedAt: LOG_START_UTC + 5 * DAY })]])), 'restamped-or-reflipped');
  assert.equal(flipStatus(e, new Map([['crypto:AAA:1d:BEARISH', flip({ id: 'crypto:AAA:1d:BEARISH', direction: 'BEARISH' })]])), 'opposite');
  assert.equal(flipStatus(e, new Map()), 'absent');
});

test('only 1d/1w flips are logged; legacy 4h/8h entries get no exits and leave the report', () => {
  assert.equal(entryFor(flip({ id: 'crypto:AAA:4h:BULLISH', timeframe: '4h' }), NOW), null);
  assert.equal(entryFor(flip({ id: 'crypto:AAA:8h:BULLISH', timeframe: '8h' }), NOW), null);
  assert.ok(entryFor(flip({ id: 'crypto:AAA:1w:BULLISH', timeframe: '1w' }), NOW));
  const legacy = { kind: 'entry', v: 1, key: 'crypto:AAA:4h:BULLISH', symbol: 'AAA', marketClass: 'crypto', timeframe: '4h', direction: 'BULLISH', confirmedAt: LOG_START_UTC, confirmDate: '2026-09-21', score: 60, band: '55-65', entryPrice: 100 };
  assert.equal(updateLog([legacy], new Map(), '2026-10-25', NOW, px()).length, 0);
  assert.equal(entriesNeedingPrice([legacy], '2026-10-25').length, 0);
  const agg = aggregate([legacy]);
  assert.equal(agg.totalEntries, 0);
  assert.equal(agg.untrackedLegacyEntries, 1);
});

test('dedupe: key+confirmedAt logs genuine repeat flips, ignores sub-bar re-stamps', () => {
  const first = updateLog([], new Map([['k', flip()]]), '2026-09-21', NOW, px());
  const restamp = flip({ confirmedAt: LOG_START_UTC + 3_600_000 + 8 * 3_600_000 }); // same flip, +8h
  assert.equal(updateLog(first, new Map([['k', restamp]]), '2026-09-22', NOW, px()).filter(r => r.kind === 'entry').length, 0);
  const repeat = flip({ confirmedAt: LOG_START_UTC + 9 * DAY }); // new flip 9 days later
  const again = updateLog(first, new Map([['k', repeat]]), '2026-09-30', NOW, px()).filter(r => r.kind === 'entry');
  assert.equal(again.length, 1);
  assert.notEqual(again[0].entryId, first[0].entryId);
  // v1 entries without entryId are matched by derived id, no duplicate
  const v1 = { ...first[0] }; delete v1.entryId; v1.v = 1;
  assert.equal(updateLog([v1], new Map([['k', flip()]]), '2026-09-21', NOW, px()).length, 0);
});

test('log round-trips through JSONL', () => {
  const flips = new Map([['crypto:AAA:1d:BULLISH', flip()]]);
  const recs = updateLog([], flips, '2026-09-21', NOW, px());
  assert.deepEqual(parseLog(serializeRecords(recs)), recs);
});

test('aggregate reports per-band per-horizon net stats plus the fixed review', () => {
  const flips = new Map([
    ['crypto:AAA:1d:BULLISH', flip()],
    ['crypto:BBB:1d:BULLISH', flip({ id: 'crypto:BBB:1d:BULLISH', symbol: 'BBB', priorityScore: 80 })]
  ]);
  const prices = px({ 'crypto:BBB': dailyCandles() });
  let recs = updateLog([], flips, '2026-09-21', NOW, prices);
  recs = recs.concat(updateLog(recs, flips, '2026-10-25', NOW, prices)); // closes all horizons
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
