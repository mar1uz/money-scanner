// paper-trade-logger.mjs
// Core logic for the forward paper-trading log of bullish daily Money Line
// flips with RVOL >= 2. Pure functions, no I/O - unit-testable.
//
// Strategy (validated in docs/backtests/2026-09-19-pump-probability-ranking-r2.md):
//   decision at closed daily candle, hypothetical entry next open,
//   stop 1.25xATR14, half exit at +2R (stop to break-even), runner exits at
//   bear Money Line flip (close), +3.5R cap, or 42-day timeout (close).
// Costs: 0.075% fee + 0.05% slippage per side, charged on entry.

export const COST_PER_SIDE = (0.075 + 0.05) / 100;
export const ATR_STOP_MULT = 1.25;
export const MAX_HOLD_DAYS = 42;
export const RVOL_MIN = 2;
export const LOG_VERSION = 1;
// Flips decided before this UTC ms are never logged: the log is forward-only,
// so it can never be contaminated with trades observed after the fact.
export const DEFAULT_MIN_FLIP_TIME = Date.UTC(2026, 8, 19); // 2026-09-19

const BULLISH = new Set(['Bullish', 'Strong Bullish']);
const BEARISH = new Set(['Bearish', 'Strong Bearish']);
const DAY_MS = 86_400_000;

export const round = (v, d = 4) => Number(v.toFixed(d));
export const tradeKey = (symbol, flipTime) => `${symbol}:${flipTime}`;
const dateOf = ts => new Date(ts).toISOString().slice(0, 10);

/**
 * Detect confirmed bullish flips on CLOSED candles only.
 * candles/signals must already exclude in-progress candles.
 * Returns [{flipIndex, flipTime, tier, score, rvol, atr14, close}].
 */
export function detectFlips(candles, signals, atr14) {
  const flips = [];
  for (let i = 1; i < candles.length; i++) {
    const sig = signals[i], prev = signals[i - 1];
    if (!sig || !prev) continue;
    if (!BULLISH.has(sig.tier) || BULLISH.has(prev.tier)) continue;
    flips.push({
      flipIndex: i,
      flipTime: candles[i].timestamp,
      tier: sig.tier,
      score: sig.score,
      rvol: sig.rawIndicators.rvol,
      atr14: atr14[i],
      close: candles[i].close
    });
  }
  return flips;
}

/** Derive per-trade state from the append-only record list. */
export function deriveState(records) {
  const state = new Map();
  for (const rec of records) {
    const key = tradeKey(rec.symbol, rec.flipTime);
    if (!state.has(key)) state.set(key, { planned: null, entered: null, resolved: null });
    const slot = state.get(key);
    if (rec.type === 'planned') slot.planned = rec;
    else if (rec.type === 'entered') slot.entered = rec;
    else if (rec.type === 'resolved') slot.resolved = rec;
  }
  return state;
}

/**
 * Replay position management from the entry candle forward.
 * Mirrors the validated backtest order: scale-out check, stop, cap, bear flip.
 * Returns { outcome: {r, reason, exitTime, exitPrice, scaledOut, daysHeld} | null,
 *           live: {stop, scaledOut, lockedR} }.
 */
export function managePosition(entry, candles, signals, flipIndex) {
  const entryIdx = flipIndex + 1;
  if (entryIdx >= candles.length) return { outcome: null, live: null };
  const risk = entry.risk;
  let stop = entry.stop;
  let scaledOut = false, lockedR = 0;
  const lastIdx = Math.min(flipIndex + MAX_HOLD_DAYS, candles.length - 1);

  for (let j = entryIdx; j <= lastIdx; j++) {
    const c = candles[j];
    const highR = (c.high - entry.entry) / risk;
    if (!scaledOut && highR >= 2) {
      scaledOut = true;
      lockedR = 1.0;
      stop = Math.max(stop, entry.entry * 1.001);
    }
    if (c.low <= stop) {
      const r = lockedR + (scaledOut ? 0.5 : 1) * ((stop - entry.entry) / risk);
      return {
        outcome: {
          r: round(r), reason: scaledOut ? 'runner-stop-be' : 'stop',
          exitTime: c.timestamp, exitPrice: round(stop, 8), scaledOut, daysHeld: j - entryIdx
        },
        live: { stop, scaledOut, lockedR }
      };
    }
    if (scaledOut && highR >= 3.5) {
      return {
        outcome: {
          r: round(lockedR + 0.5 * 3.5), reason: 'tp-cap',
          exitTime: c.timestamp, exitPrice: round(entry.entry + 3.5 * risk, 8), scaledOut, daysHeld: j - entryIdx
        },
        live: { stop, scaledOut, lockedR }
      };
    }
    const sig = signals[j];
    if (sig && BEARISH.has(sig.tier)) {
      const r = lockedR + (scaledOut ? 0.5 : 1) * ((c.close - entry.entry) / risk);
      return {
        outcome: {
          r: round(r), reason: 'bear-flip',
          exitTime: c.timestamp, exitPrice: round(c.close, 8), scaledOut, daysHeld: j - entryIdx
        },
        live: { stop, scaledOut, lockedR }
      };
    }
  }
  if (flipIndex + MAX_HOLD_DAYS <= candles.length - 1) {
    const c = candles[lastIdx];
    const r = lockedR + (scaledOut ? 0.5 : 1) * ((c.close - entry.entry) / risk);
    return {
      outcome: {
        r: round(r), reason: 'timeout',
        exitTime: c.timestamp, exitPrice: round(c.close, 8), scaledOut, daysHeld: lastIdx - entryIdx
      },
      live: { stop, scaledOut, lockedR }
    };
  }
  return { outcome: null, live: { stop, scaledOut, lockedR } };
}

/**
 * Compute new log records for one symbol. Idempotent: only transitions not
 * already present in `state` produce records. `now` is injected for tests.
 */
export function computeUpdates({ symbol, candles, signals, atr14, state, now, minFlipTime = DEFAULT_MIN_FLIP_TIME }) {
  const records = [];
  const flips = detectFlips(candles, signals, atr14);

  for (const flip of flips) {
    if (flip.flipTime < minFlipTime) continue;
    if (!(flip.rvol >= RVOL_MIN)) continue;
    const key = tradeKey(symbol, flip.flipTime);
    const slot = state.get(key) || { planned: null, entered: null, resolved: null };

    if (!slot.planned) {
      records.push({
        v: LOG_VERSION, type: 'planned', recordedAt: now,
        symbol, flipTime: flip.flipTime, flipDate: dateOf(flip.flipTime),
        score: flip.score, tier: flip.tier, rvol: round(flip.rvol, 3),
        atr14: round(flip.atr14, 8), close: flip.close,
        expectedEntryDate: dateOf(flip.flipTime + DAY_MS),
        source: 'binance-spot-1d-klines'
      });
      slot.planned = records[records.length - 1];
    }

    if (!slot.entered && candles.length > flip.flipIndex + 1) {
      const entryCandle = candles[flip.flipIndex + 1];
      const entryPrice = round(entryCandle.open * (1 + COST_PER_SIDE), 8);
      const stop = round(entryPrice - ATR_STOP_MULT * flip.atr14, 8);
      const risk = round(entryPrice - stop, 8);
      if (risk > 0) {
        const entered = {
          v: LOG_VERSION, type: 'entered', recordedAt: now,
          symbol, flipTime: flip.flipTime, entryTime: entryCandle.timestamp,
          entryDate: dateOf(entryCandle.timestamp),
          entry: entryPrice, stop, risk,
          tp1: round(entryPrice + 2 * risk, 8),
          cap: round(entryPrice + 3.5 * risk, 8)
        };
        records.push(entered);
        slot.entered = entered;
      }
    }

    if (slot.entered && !slot.resolved) {
      const { outcome } = managePosition(slot.entered, candles, signals, flip.flipIndex);
      if (outcome) {
        records.push({
          v: LOG_VERSION, type: 'resolved', recordedAt: now,
          symbol, flipTime: flip.flipTime,
          exitTime: outcome.exitTime, exitDate: dateOf(outcome.exitTime),
          exitPrice: outcome.exitPrice, r: outcome.r, reason: outcome.reason,
          scaledOut: outcome.scaledOut, daysHeld: outcome.daysHeld
        });
      }
    }
  }
  return records;
}

/**
 * Daily summary. `openMarks`: [{symbol, flipTime, mark, markTime}] for open
 * trades (last closed price). Deterministic given records.
 */
export function summarize(records, openMarks = []) {
  const state = deriveState(records);
  const resolved = [...state.values()]
    .filter(s => s.entered && s.resolved)
    .map(s => s.resolved)
    .sort((a, b) => a.exitTime - b.exitTime);

  const rs = resolved.map(r => r.r);
  const wins = rs.filter(r => r > 0), losses = rs.filter(r => r <= 0);
  const gw = wins.reduce((a, b) => a + b, 0);
  const gl = Math.abs(losses.reduce((a, b) => a + b, 0));
  let peak = 0, cum = 0, maxDd = 0;
  for (const r of rs) { cum += r; peak = Math.max(peak, cum); maxDd = Math.max(maxDd, peak - cum); }

  const markByKey = new Map(openMarks.map(m => [tradeKey(m.symbol, m.flipTime), m]));
  const open = [];
  const pending = [];
  for (const [key, s] of state) {
    if (s.entered && !s.resolved) {
      const mark = markByKey.get(key);
      const liveR = mark
        ? (mark.lockedR || 0) + (mark.scaledOut ? 0.5 : 1) * ((mark.mark - s.entered.entry) / s.entered.risk)
        : null;
      open.push({
        symbol: s.entered.symbol, flipDate: dateOf(s.entered.flipTime),
        entry: s.entered.entry, stop: s.entered.stop,
        scaledOut: mark ? Boolean(mark.scaledOut) : false,
        unrealizedR: liveR !== null ? round(liveR) : null,
        markDate: mark ? dateOf(mark.markTime) : null
      });
    } else if (s.planned && !s.entered) {
      pending.push({ symbol: s.planned.symbol, flipDate: s.planned.flipDate, expectedEntryDate: s.planned.expectedEntryDate });
    }
  }

  return {
    resolvedCount: rs.length,
    winRate: rs.length ? round(wins.length / rs.length * 100, 1) : null,
    expectancyR: rs.length ? round(rs.reduce((a, b) => a + b, 0) / rs.length, 3) : null,
    profitFactor: gl > 0 ? round(gw / gl, 2) : null,
    totalR: round(rs.reduce((a, b) => a + b, 0), 2),
    maxDrawdownR: round(maxDd, 2),
    open, pending,
    byReason: resolved.reduce((acc, r) => { acc[r.reason] = (acc[r.reason] || 0) + 1; return acc; }, {})
  };
}

/** Parse a JSONL log. Blank lines tolerated. */
export function parseLog(text) {
  return text.split('\n').filter(line => line.trim()).map(line => JSON.parse(line));
}

export function serializeRecords(records) {
  return records.map(r => JSON.stringify(r)).join('\n') + (records.length ? '\n' : '');
}
