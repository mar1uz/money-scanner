// forward-test-top5-core.mjs
// Pure core for the 7-day forward test of the UNVALIDATED SMA top-5 ranking.
// Freeze discipline: each day's selection is appended once, exactly as
// selected at that time; never reselected or edited. No fs - importable.

import { COST_PER_SIDE, round } from './paper-trade-logger.mjs';

export const LOG_VERSION = 1;
export const SELECTION_HORIZON_DAYS = 7;

export function parseLog(text) {
  return text.split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
}
export function serializeRecords(records) {
  return records.map(r => JSON.stringify(r)).join('\n') + (records.length ? '\n' : '');
}

// Dedupe (Sep 22 incident): two concurrent logger runs both read the log
// before either appended and double-froze scanDate 2026-09-21. The log stays
// append-only, so duplicates are never rewritten out - every consumer keeps
// only the FIRST occurrence of each key, and the runner re-checks keys
// against a fresh read immediately before appending. Unknown record types
// (e.g. dedupe-note markers) never dedupe.
export function dedupeKey(rec) {
  if (rec.type === 'selection' || rec.type === 'entry') return `${rec.type}:${rec.scanDate}:${rec.symbol}`;
  return null;
}
export function dedupeFirstWins(records) {
  const seen = new Set();
  const out = [];
  for (const rec of records) {
    const k = dedupeKey(rec);
    if (k === null) { out.push(rec); continue; }
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(rec);
  }
  return out;
}

export function deriveState(records) {
  const selectionsByDate = new Map(); // scanDate -> [selection records]
  const entries = new Map();          // `${scanDate}:${symbol}` -> entry record
  for (const rec of dedupeFirstWins(records)) {
    if (rec.type === 'selection') {
      if (!selectionsByDate.has(rec.scanDate)) selectionsByDate.set(rec.scanDate, []);
      selectionsByDate.get(rec.scanDate).push(rec);
    } else if (rec.type === 'entry') {
      entries.set(`${rec.scanDate}:${rec.symbol}`, rec);
    }
  }
  return { selectionsByDate, entries };
}

/**
 * Freeze today's top-5 selection. Idempotent per scanDate: if selections for
 * scanDate already exist, returns []. `rankedTop5` must be the output of
 * rankSetups at this scan time - it is stored verbatim.
 */
export function freezeSelection({ records, scanDate, rankedTop5, now, lastClosedCandleUtc }) {
  const { selectionsByDate } = deriveState(records);
  if (selectionsByDate.has(scanDate)) return [];
  return rankedTop5.map((t, idx) => ({
    v: LOG_VERSION, type: 'selection', recordedAt: now, scanDate,
    rank: idx + 1, symbol: t.symbol, flipDate: t.flipDate, flipTime: t.flipTime,
    probability: t.probability, score: t.score, rvol: t.rvol, atrPercent: t.atrPercent,
    plannedEntryNote: 'hypothetical entry at the next daily open after the flip candle; entry recorded when that candle closes',
    indicativeEntry: t.hypotheticalEntry, stopRule: 'entry - 1.25xATR14',
    invalidationRule: 'daily close below SMA50(flip) or bearish Money Line flip',
    atr14: t.atr14, sma50: t.sma50,
    lastClosedCandleUtc, evidenceStatus: 'UNVALIDATED RESEARCH - SMA gate showed no OOS lift'
  }));
}

/**
 * Record entries for frozen selections whose entry candle has now closed.
 * entry candle = the candle right after the flip candle. Entry at its open,
 * costs included (same convention as the validated RVOL>=2 log).
 */
export function recordEntries({ records, getAssetCandles, now }) {
  const { selectionsByDate, entries } = deriveState(records);
  const out = [];
  for (const [scanDate, sels] of selectionsByDate) {
    for (const sel of sels) {
      const key = `${scanDate}:${sel.symbol}`;
      if (entries.has(key)) continue;
      const candles = getAssetCandles(sel.symbol);
      if (!candles) continue;
      const flipIdx = candles.findIndex(c => c.timestamp === sel.flipTime);
      if (flipIdx < 0 || flipIdx + 1 >= candles.length) continue;
      const entryCandle = candles[flipIdx + 1];
      const entry = round(entryCandle.open * (1 + COST_PER_SIDE), 8);
      const stop = round(entry - 1.25 * sel.atr14, 8);
      out.push({
        v: LOG_VERSION, type: 'entry', recordedAt: now, scanDate,
        symbol: sel.symbol, flipTime: sel.flipTime,
        entryTime: entryCandle.timestamp, entryDate: new Date(entryCandle.timestamp).toISOString().slice(0, 10),
        entry, stop, risk: round(entry - stop, 8)
      });
    }
  }
  return out;
}

const BEARISH = new Set(['Bearish', 'Strong Bearish']);

/**
 * Outcome of one selection from closed candles. Window: entry candle through
 * min(entry + SELECTION_HORIZON_DAYS, first stop/invalidation trigger).
 * Returns null when the entry candle has not closed yet.
 */
export function computeOutcome(sel, entryRec, candles, signals) {
  const flipIdx = candles.findIndex(c => c.timestamp === sel.flipTime);
  if (flipIdx < 0 || flipIdx + 1 >= candles.length) return null;
  const entryIdx = flipIdx + 1;
  const entry = entryRec.entry, stop = entryRec.stop;
  const lastIdx = Math.min(entryIdx + SELECTION_HORIZON_DAYS - 1, candles.length - 1);

  let mfe = 0, mae = 0, exitReason = 'horizon', exitIdx = lastIdx;
  const dailyReturns = [];
  let prevClose = candles[entryIdx].open;
  for (let j = entryIdx; j <= lastIdx; j++) {
    const c = candles[j];
    mfe = Math.max(mfe, (c.high - entry) / entry);
    mae = Math.min(mae, (c.low - entry) / entry);
    dailyReturns.push(round((c.close - prevClose) / prevClose * 100, 2));
    prevClose = c.close;
    if (c.low <= stop) { exitReason = 'stop'; exitIdx = j; break; }
    if (c.close < sel.sma50) { exitReason = 'invalidation-close-below-sma50'; exitIdx = j; break; }
    const sig = signals[j];
    if (sig && BEARISH.has(sig.tier)) { exitReason = 'invalidation-bear-flip'; exitIdx = j; break; }
  }
  const exitPrice = exitReason === 'stop' ? stop : candles[exitIdx].close;
  return {
    symbol: sel.symbol, scanDate: sel.scanDate, rank: sel.rank,
    probability: sel.probability, rvol: sel.rvol,
    entryDate: entryRec.entryDate, entry,
    exitDate: new Date(candles[exitIdx].timestamp).toISOString().slice(0, 10),
    exitPrice: round(exitPrice, 8), exitReason,
    daysHeld: exitIdx - entryIdx + 1,
    totalReturnPct: round((exitPrice - entry) / entry * 100, 2),
    mfePct: round(mfe * 100, 2), maePct: round(mae * 100, 2),
    dailyReturnsPct: dailyReturns,
    complete: entryIdx + SELECTION_HORIZON_DAYS - 1 <= candles.length - 1 || exitReason !== 'horizon'
  };
}

/** BTC buy-and-hold return over the same calendar window. */
export function btcBenchmark(btcCandles, entryDate, exitDate) {
  const startIdx = btcCandles.findIndex(c => new Date(c.timestamp).toISOString().slice(0, 10) === entryDate);
  const endIdx = btcCandles.findIndex(c => new Date(c.timestamp).toISOString().slice(0, 10) === exitDate);
  if (startIdx < 0 || endIdx < 0) return null;
  const entry = btcCandles[startIdx].open * (1 + COST_PER_SIDE);
  return round((btcCandles[endIdx].close - entry) / entry * 100, 2);
}

/** Aggregate report stats over completed outcomes. */
export function aggregate(outcomes) {
  if (!outcomes.length) return { count: 0 };
  const rets = outcomes.map(o => o.totalReturnPct);
  const wins = rets.filter(r => r > 0);
  let peak = 0, cum = 0, dd = 0;
  for (const o of outcomes) { cum += o.totalReturnPct; peak = Math.max(peak, cum); dd = Math.max(dd, peak - cum); }
  return {
    count: outcomes.length,
    winRatePct: round(wins.length / outcomes.length * 100, 1),
    meanReturnPct: round(rets.reduce((a, b) => a + b, 0) / outcomes.length, 2),
    medianMfePct: round(outcomes.map(o => o.mfePct).sort((a, b) => a - b)[Math.floor(outcomes.length / 2)], 2),
    worstMaePct: round(Math.min(...outcomes.map(o => o.maePct)), 2),
    drawdownPct: round(dd, 2),
    byExit: outcomes.reduce((acc, o) => { acc[o.exitReason] = (acc[o.exitReason] || 0) + 1; return acc; }, {})
  };
}