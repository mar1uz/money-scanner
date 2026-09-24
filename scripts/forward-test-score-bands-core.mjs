// forward-test-score-bands-core.mjs
// Pure core for the FORWARD validation of the redesigned flip setup score
// (priorityScore, deployed 2026-09-21, commits ea56fba + 75daa20).
// No fs, no network - unit-testable.
//
// PREDECLARED PROTOCOL (fixed 2026-09-21, do not retune on logged data):
//   Universe: every flip the daily-regime-scan stores as CONFIRMED, across all
//     groups (crypto/stocks/metals x 1d/1w/4h/8h), taken exactly as recorded.
//     No reselection, no edits after logging.
//   Forward-only: only flips with confirmedAt >= LOG_START_UTC enter the log.
//     Flips confirmed before the new score existed are never logged (their
//     score would be computed after the fact = in-sample leakage).
//   Bands (predeclared): <45, 45-55, 55-65, 65-75, 75+ on priorityScore.
//   Entry: at the scanner-recorded confirmationPrice (close of the
//     confirming candle), costed at COST_PER_SIDE (0.075% fee + 0.05%
//     slippage per side - same assumption as paper-trade-logger.mjs).
//     BULLISH = long, BEARISH = short (direction-adjusted).
//   Exit: fixed horizons +7d/+14d/+30d after the confirmation candle date.
//     AMENDED 2026-09-24 (Marius approved "Varianta 1", before any exit had
//     closed - first +7d target was 2026-09-28): exit price = CLOSE of the
//     first closed DAILY candle dated on/after the horizon target date, read
//     from the market-data provider independently of the scan's flip list
//     (flips drop out of / get replaced in that list, which silently killed
//     or mis-dated exits). If no such candle is available by target +
//     MISSING_GRACE_DAYS, an explicit 'exit-missing' record is appended so
//     the entry is counted, never silently dropped. Each exit also records
//     the flip's status in that run's scan (same/restamped/opposite/absent).
//   Scope AMENDED 2026-09-24 (Marius: sub-1D scanning stopped): only 1d and
//     1w flips are logged and closed. Earlier 4h/8h entries stay in the
//     append-only log but are untracked (no exits, excluded from the report).
//   Dedupe AMENDED 2026-09-24: entries are identified by key + confirmedAt
//     (entryId = "<key>@<confirmedAt>"), so a genuine repeat flip on the same
//     asset/timeframe/direction is logged as a new entry. A confirmedAt that
//     moves by less than one bar (scanner re-stamping the same flip) is the
//     same entry. Switch: DEDUPE_MODE ('key+confirmedAt' | 'key').
//   Net return: long  = exit*(1-c)/(entry*(1+c)) - 1
//               short = entry*(1-c)/(exit*(1+c)) - 1
//   Review: fixed checkpoint when 60 entries are logged OR on 2026-12-21,
//     whichever comes first. Paper/logging only - no orders, no credentials.

import { COST_PER_SIDE, round } from './paper-trade-logger.mjs';

export { COST_PER_SIDE };
export const LOG_VERSION = 2; // v2: entryId, independent-price exits, exit-missing
export const LOG_START_UTC = Date.UTC(2026, 8, 21); // 2026-09-21T00:00:00Z
export const REVIEW_ENTRY_TARGET = 60;
export const REVIEW_DATE = '2026-12-21';
export const HORIZONS_DAYS = [7, 14, 30];
export const DAY_MS = 86_400_000;
export const TRACKED_TIMEFRAMES = ['1d', '1w'];
export const BAR_MS = { '1d': DAY_MS, '1w': 7 * DAY_MS };
export const MISSING_GRACE_DAYS = 5;
export const DEDUPE_MODE = 'key+confirmedAt';
export const EXIT_RULE = 'close of first closed daily candle on/after target date (independent of flip list); exit-missing after grace';

export const BANDS = [
  { id: '<45', min: -Infinity, max: 45 },
  { id: '45-55', min: 45, max: 55 },
  { id: '55-65', min: 55, max: 65 },
  { id: '65-75', min: 65, max: 75 },
  { id: '75+', min: 75, max: Infinity }
];

export const bandFor = score => BANDS.find(b => score >= b.min && score < b.max).id;

const dateOf = ts => new Date(ts).toISOString().slice(0, 10);
const addDays = (date, days) => dateOf(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS);

/** Stable entry identity. v1 records have no entryId; derive it. */
export const entryIdOf = e => e.entryId || (DEDUPE_MODE === 'key' ? e.key : `${e.key}@${e.confirmedAt}`);
export const isTracked = e => TRACKED_TIMEFRAMES.includes(e.timeframe);
export const priceKeyOf = e => `${e.marketClass}:${e.symbol}`;

/** A flip seen in the scan read becomes an entry iff it is new, CONFIRMED,
 * confirmed on/after LOG_START_UTC, and carries the fields the protocol needs. */
export function entryFor(flip, now) {
  if (!flip || flip.status !== 'CONFIRMED') return null;
  if (!Number.isFinite(flip.confirmedAt) || flip.confirmedAt < LOG_START_UTC) return null;
  if (!Number.isFinite(flip.priorityScore) || !Number.isFinite(flip.confirmationPrice) || flip.confirmationPrice <= 0) return null;
  if (flip.direction !== 'BULLISH' && flip.direction !== 'BEARISH') return null;
  if (!TRACKED_TIMEFRAMES.includes(flip.timeframe)) return null;
  const e = {
    kind: 'entry',
    v: LOG_VERSION,
    entryId: DEDUPE_MODE === 'key' ? flip.id : `${flip.id}@${flip.confirmedAt}`,
    dedupe: DEDUPE_MODE,
    key: flip.id,
    symbol: flip.symbol,
    marketClass: flip.marketClass,
    timeframe: flip.timeframe,
    direction: flip.direction,
    confirmedAt: flip.confirmedAt,
    confirmDate: dateOf(flip.confirmedAt), // the date the flip becomes known (confirming candle's close)
    score: round(flip.priorityScore, 1),
    band: bandFor(flip.priorityScore),
    entryPrice: flip.confirmationPrice,
    costPerSide: COST_PER_SIDE,
    loggedAt: now
  };
  return e;
}

/** Net direction-adjusted return per the predeclared formula. */
export function netReturn(direction, entryPrice, exitPrice, c = COST_PER_SIDE) {
  return direction === 'BULLISH'
    ? (exitPrice * (1 - c)) / (entryPrice * (1 + c)) - 1
    : (entryPrice * (1 - c)) / (exitPrice * (1 + c)) - 1;
}

/** Horizons whose target date this run has reached. */
export function dueHorizons(entryRecord, runDate) {
  return HORIZONS_DAYS
    .map(days => ({ days, targetDate: addDays(entryRecord.confirmDate, days) }))
    .filter(h => runDate >= h.targetDate);
}

/** First CLOSED daily candle dated on/after targetDate. candles: [{timestamp, close, isClosed}]. */
export function closeOnOrAfter(candles, targetDate) {
  const bar = (candles || [])
    .filter(c => c && c.isClosed !== false && Number.isFinite(c.close) && c.close > 0 && Number.isFinite(c.timestamp))
    .sort((l, r) => l.timestamp - r.timestamp)
    .find(c => dateOf(c.timestamp) >= targetDate);
  return bar ? { price: bar.close, priceDate: dateOf(bar.timestamp) } : null;
}

/** Status of the logged flip in this run's scan read (diagnostic only). */
export function flipStatus(entryRecord, flipsByKey) {
  const f = flipsByKey.get(entryRecord.key);
  if (f) return f.confirmedAt === entryRecord.confirmedAt ? 'same' : 'restamped-or-reflipped';
  const [mc, sym, tf, dir] = entryRecord.key.split(':');
  const opp = `${mc}:${sym}:${tf}:${dir === 'BULLISH' ? 'BEARISH' : 'BULLISH'}`;
  return flipsByKey.has(opp) ? 'opposite' : 'absent';
}

/** Exit (or exit-missing) records newly due for one entry at this run. */
export function exitsFor(entryRecord, candles, runDate, status = 'unknown') {
  const out = [];
  for (const { days, targetDate } of dueHorizons(entryRecord, runDate)) {
    const base = { v: LOG_VERSION, entryId: entryIdOf(entryRecord), key: entryRecord.key, horizonDays: days, targetDate, flipStatus: status };
    const px = closeOnOrAfter(candles, targetDate);
    if (px) {
      out.push({
        kind: 'exit', ...base, exitRule: 'independent-daily-close',
        priceDate: px.priceDate, exitPrice: px.price,
        netReturn: round(netReturn(entryRecord.direction, entryRecord.entryPrice, px.price), 6)
      });
    } else if (runDate >= addDays(targetDate, MISSING_GRACE_DAYS)) {
      out.push({ kind: 'exit-missing', ...base, reason: 'no closed daily candle on/after target within grace', checkedOn: runDate });
    }
  }
  return out;
}

/** Entries (tracked timeframes) that still need a price this run. */
export function entriesNeedingPrice(records, runDate) {
  const done = new Set(records.filter(r => r.kind === 'exit' || r.kind === 'exit-missing').map(r => `${r.entryId || r.key}:${r.horizonDays}`));
  return records.filter(r => r.kind === 'entry' && isTracked(r))
    .filter(e => dueHorizons(e, runDate).some(h => !done.has(`${entryIdOf(e)}:${h.days}`)));
}

export function parseLog(text) {
  return text.split('\n').filter(line => line.trim()).map(line => JSON.parse(line));
}

export const serializeRecords = records => records.map(r => JSON.stringify(r)).join('\n') + '\n';

/** Advance the log with one daily read. flipsByKey: Map(flip id -> flip from
 * the latest scan run). candlesByPriceKey: Map("<marketClass>:<symbol>" ->
 * daily candles) from the independent price source. Returns NEW records only. */
export function updateLog(records, flipsByKey, runDate, now, candlesByPriceKey = new Map()) {
  const entries = new Map(); // entryId -> entry
  const byKey = new Map();   // key -> entries[]
  const done = new Set();
  const add = e => { entries.set(entryIdOf(e), e); byKey.set(e.key, [...(byKey.get(e.key) || []), e]); };
  for (const r of records) {
    if (r.kind === 'entry') add(r);
    if (r.kind === 'exit' || r.kind === 'exit-missing') done.add(`${r.entryId || r.key}:${r.horizonDays}`);
  }
  const fresh = [];
  for (const [, flip] of flipsByKey) {
    const e = entryFor(flip, now);
    if (!e) continue;
    const prior = byKey.get(e.key) || [];
    const same = DEDUPE_MODE === 'key'
      ? prior.length > 0
      : prior.some(p => Math.abs(p.confirmedAt - e.confirmedAt) < (BAR_MS[e.timeframe] || DAY_MS));
    if (same) continue;
    add(e); fresh.push(e);
  }
  for (const [id, entry] of entries) {
    if (!isTracked(entry)) continue;
    const candles = candlesByPriceKey.get(priceKeyOf(entry));
    for (const x of exitsFor(entry, candles, runDate, flipStatus(entry, flipsByKey))) {
      const k = `${id}:${x.horizonDays}`;
      if (done.has(k)) continue;
      done.add(k); fresh.push(x);
    }
  }
  return fresh;
}

const median = xs => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/** Band x horizon aggregates over closed exits (tracked timeframes only), net of costs.
 * exit-missing records are counted per cell, never dropped. */
export function aggregate(records) {
  const all = new Map();
  for (const r of records) if (r.kind === 'entry') all.set(entryIdOf(r), r);
  const entries = new Map([...all].filter(([, e]) => isTracked(e)));
  const cells = new Map(); const missing = new Map();
  for (const r of records) {
    if (r.kind !== 'exit' && r.kind !== 'exit-missing') continue;
    const entry = entries.get(r.entryId || r.key);
    if (!entry) continue;
    const k = `${entry.band}:${r.horizonDays}`;
    if (r.kind === 'exit-missing') { missing.set(k, (missing.get(k) || 0) + 1); continue; }
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k).push(r.netReturn);
  }
  const bands = BANDS.map(b => {
    const byHorizon = {};
    for (const h of HORIZONS_DAYS) {
      const xs = cells.get(`${b.id}:${h}`) || [];
      const miss = missing.get(`${b.id}:${h}`) || 0;
      byHorizon[h] = xs.length
        ? { n: xs.length, missing: miss, mean: round(xs.reduce((a, x) => a + x, 0) / xs.length, 4), median: round(median(xs), 4), hitRate: round(xs.filter(x => x > 0).length / xs.length, 3) }
        : { n: 0, missing: miss };
    }
    return { band: b.id, entries: [...entries.values()].filter(e => e.band === b.id).length, byHorizon };
  });
  const byTimeframe = Object.fromEntries(TRACKED_TIMEFRAMES.map(tf => [tf, [...entries.values()].filter(e => e.timeframe === tf).length]));
  return { bands, totalEntries: entries.size, byTimeframe, untrackedLegacyEntries: all.size - entries.size, review: { entryTarget: REVIEW_ENTRY_TARGET, date: REVIEW_DATE } };
}
