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
//     Exit price = the scanner-recorded currentPrice in the first logger run
//     on/after the horizon date, costed at COST_PER_SIDE. Primary metric:
//     +30d net direction-adjusted return. If a flip is absent from a run's
//     read, its exits wait for the next run that sees it.
//   Net return: long  = exit*(1-c)/(entry*(1+c)) - 1
//               short = entry*(1-c)/(exit*(1+c)) - 1
//   Review: fixed checkpoint when 60 entries are logged OR on 2026-12-21,
//     whichever comes first. Paper/logging only - no orders, no credentials.

import { COST_PER_SIDE, round } from './paper-trade-logger.mjs';

export { COST_PER_SIDE };
export const LOG_VERSION = 1;
export const LOG_START_UTC = Date.UTC(2026, 8, 21); // 2026-09-21T00:00:00Z
export const REVIEW_ENTRY_TARGET = 60;
export const REVIEW_DATE = '2026-12-21';
export const HORIZONS_DAYS = [7, 14, 30];
export const DAY_MS = 86_400_000;

export const BANDS = [
  { id: '<45', min: -Infinity, max: 45 },
  { id: '45-55', min: 45, max: 55 },
  { id: '55-65', min: 55, max: 65 },
  { id: '65-75', min: 65, max: 75 },
  { id: '75+', min: 75, max: Infinity }
];

export const bandFor = score => BANDS.find(b => score >= b.min && score < b.max).id;

const dateOf = ts => new Date(ts).toISOString().slice(0, 10);

/** A flip seen in the scan read becomes an entry iff it is new, CONFIRMED,
 * confirmed on/after LOG_START_UTC, and carries the fields the protocol needs. */
export function entryFor(flip, now) {
  if (!flip || flip.status !== 'CONFIRMED') return null;
  if (!Number.isFinite(flip.confirmedAt) || flip.confirmedAt < LOG_START_UTC) return null;
  if (!Number.isFinite(flip.priorityScore) || !Number.isFinite(flip.confirmationPrice) || flip.confirmationPrice <= 0) return null;
  if (flip.direction !== 'BULLISH' && flip.direction !== 'BEARISH') return null;
  return {
    kind: 'entry',
    v: LOG_VERSION,
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
}

/** Net direction-adjusted return per the predeclared formula. */
export function netReturn(direction, entryPrice, exitPrice, c = COST_PER_SIDE) {
  return direction === 'BULLISH'
    ? (exitPrice * (1 - c)) / (entryPrice * (1 + c)) - 1
    : (entryPrice * (1 - c)) / (exitPrice * (1 + c)) - 1;
}

/** For one open entry, the exit events newly due at this run. One exit per
 * horizon, only when the run date reached the horizon target date. */
export function exitsFor(entryRecord, currentPrice, runDate) {
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) return [];
  const out = [];
  for (const days of HORIZONS_DAYS) {
    const targetDate = dateOf(Date.parse(`${entryRecord.confirmDate}T00:00:00Z`) + days * DAY_MS);
    if (runDate < targetDate) continue;
    out.push({
      kind: 'exit',
      v: LOG_VERSION,
      key: entryRecord.key,
      horizonDays: days,
      targetDate,
      priceDate: runDate,
      exitPrice: currentPrice,
      netReturn: round(netReturn(entryRecord.direction, entryRecord.entryPrice, currentPrice), 6)
    });
  }
  return out;
}

export function parseLog(text) {
  return text.split('\n').filter(line => line.trim()).map(line => JSON.parse(line));
}

export const serializeRecords = records => records.map(r => JSON.stringify(r)).join('\n') + '\n';

/** Advance the log with one daily read. flipsByKey: Map(key -> flip record
 * from the latest scan run). Returns only the NEW records to append. */
export function updateLog(records, flipsByKey, runDate, now) {
  const entries = new Map();
  const exitsDone = new Set();
  for (const r of records) {
    if (r.kind === 'entry') entries.set(r.key, r);
    if (r.kind === 'exit') exitsDone.add(`${r.key}:${r.horizonDays}`);
  }
  const fresh = [];
  for (const [key, flip] of flipsByKey) {
    if (entries.has(key)) continue;
    const e = entryFor(flip, now);
    if (e) { entries.set(key, e); fresh.push(e); }
  }
  for (const [key, entry] of entries) {
    const flip = flipsByKey.get(key);
    if (!flip) continue; // absent from this read - exits wait
    for (const x of exitsFor(entry, flip.currentPrice, runDate)) {
      if (exitsDone.has(`${key}:${x.horizonDays}`)) continue;
      exitsDone.add(`${key}:${x.horizonDays}`);
      fresh.push(x);
    }
  }
  return fresh;
}

const median = xs => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/** Band x horizon aggregates over closed exits, net of costs. */
export function aggregate(records) {
  const entries = new Map();
  for (const r of records) if (r.kind === 'entry') entries.set(r.key, r);
  const cells = new Map(); // `${band}:${horizon}` -> returns[]
  for (const r of records) {
    if (r.kind !== 'exit') continue;
    const entry = entries.get(r.key);
    if (!entry) continue;
    const k = `${entry.band}:${r.horizonDays}`;
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k).push(r.netReturn);
  }
  const bands = BANDS.map(b => {
    const byHorizon = {};
    for (const h of HORIZONS_DAYS) {
      const xs = cells.get(`${b.id}:${h}`) || [];
      byHorizon[h] = xs.length
        ? { n: xs.length, mean: round(xs.reduce((a, x) => a + x, 0) / xs.length, 4), median: round(median(xs), 4), hitRate: round(xs.filter(x => x > 0).length / xs.length, 3) }
        : { n: 0 };
    }
    return { band: b.id, entries: [...entries.values()].filter(e => e.band === b.id).length, byHorizon };
  });
  return { bands, totalEntries: entries.size, review: { entryTarget: REVIEW_ENTRY_TARGET, date: REVIEW_DATE } };
}
