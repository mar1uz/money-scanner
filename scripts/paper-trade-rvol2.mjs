// paper-trade-rvol2.mjs
// Daily runner: forward paper-trading log for bullish daily Money Line flips
// with RVOL >= 2. Append-only JSONL, idempotent re-runs, closed candles only.
//
// Usage:  node scripts/paper-trade-rvol2.mjs
// Log:    tmp/paper-trades/rvol2-flips.jsonl
// Summary printed to stdout and written to tmp/paper-trades/latest-summary.json.
// Research only - no orders, no exchange connections, no credentials.

import { mkdir, readFile, appendFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atr } from './backtest-tight-risk-breakout.mjs';
import { MoneyLineEngine } from '../packages/money-line/dist/engine.js';
import {
  computeUpdates, deriveState, managePosition, parseLog, serializeRecords,
  summarize, tradeKey, round
} from './paper-trade-logger.mjs';

const CRYPTO_SYMBOLS = [
  'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'AVAX', 'LINK',
  'SUI', 'NEAR', 'APT', 'DOT', 'LTC', 'BCH', 'SHIB', 'PEPE', 'UNI',
  'ATOM', 'FIL', 'ARB', 'OP', 'TIA', 'RENDER', 'INJ'
];

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOG_DIR = path.join(REPO_ROOT, 'tmp', 'paper-trades');
const LOG_PATH = path.join(LOG_DIR, 'rvol2-flips.jsonl');
const SUMMARY_PATH = path.join(LOG_DIR, 'latest-summary.json');

async function fetchRecentDaily(symbol, limit = 400) {
  const res = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${symbol}USDT&interval=1d&limit=${limit}`);
  if (!res.ok) throw new Error(`Binance HTTP ${res.status} for ${symbol}`);
  const rows = await res.json();
  return rows.map(r => ({
    timestamp: Number(r[0]), open: Number(r[1]), high: Number(r[2]),
    low: Number(r[3]), close: Number(r[4]), volume: Number(r[5]), isClosed: true
  }));
}

async function run() {
  await mkdir(LOG_DIR, { recursive: true });
  let existing = [];
  try { existing = parseLog(await readFile(LOG_PATH, 'utf8')); } catch { /* first run */ }
  const state = deriveState(existing);
  const now = new Date().toISOString();
  const engine = new MoneyLineEngine();

  const newRecords = [];
  const openMarks = [];
  const errors = [];
  let lastClosedGlobal = 0;

  for (const symbol of CRYPTO_SYMBOLS) {
    try {
      const candles = await fetchRecentDaily(symbol);
      // lookahead guard: drop the in-progress daily candle
      candles[candles.length - 1].isClosed = false;
      const closed = candles.filter(c => c.isClosed !== false);
      lastClosedGlobal = Math.max(lastClosedGlobal, closed.at(-1).timestamp);
      const signals = engine.calculateSeries(symbol, '1d', closed);
      const atr14 = atr(closed, 14);

      const updates = computeUpdates({ symbol, candles: closed, signals, atr14, state, now });
      for (const rec of updates) {
        newRecords.push(rec);
        const key = tradeKey(rec.symbol, rec.flipTime);
        if (!state.has(key)) state.set(key, { planned: null, entered: null, resolved: null });
        const slot = state.get(key);
        if (rec.type === 'planned') slot.planned = rec;
        else if (rec.type === 'entered') slot.entered = rec;
        else if (rec.type === 'resolved') slot.resolved = rec;
      }

      // mark open trades at last closed price
      for (const [key, slot] of state) {
        if (!key.startsWith(`${symbol}:`) || !slot.entered || slot.resolved) continue;
        // live stop state for display
        const flipIndex = closed.findIndex(c => c.timestamp === slot.entered.flipTime);
        if (flipIndex < 0) continue;
        const { live } = managePosition(slot.entered, closed, signals, flipIndex);
        if (live) slot.entered.stop = live.stop;
        openMarks.push({
          symbol, flipTime: slot.entered.flipTime,
          mark: closed.at(-1).close, markTime: closed.at(-1).timestamp,
          scaledOut: live ? live.scaledOut : false, lockedR: live ? live.lockedR : 0
        });
      }
    } catch (err) {
      errors.push(`${symbol}: ${err.message}`);
    }
  }

  if (newRecords.length) await appendFile(LOG_PATH, serializeRecords(newRecords));
  const all = existing.concat(newRecords);
  const summary = summarize(all, openMarks);
  const report = {
    generatedAt: now,
    source: 'binance-spot-1d-klines (closed candles only)',
    lastClosedCandleUtc: new Date(lastClosedGlobal).toISOString(),
    logPath: path.relative(REPO_ROOT, LOG_PATH),
    newRecordsThisRun: newRecords.length,
    ...summary,
    dataErrors: errors
  };
  await writeFile(SUMMARY_PATH, JSON.stringify(report, null, 2) + '\n');

  console.log(`Paper-trading log updated: ${newRecords.length} new record(s) -> ${path.relative(REPO_ROOT, LOG_PATH)}`);
  console.log(`Data: closed Binance daily candles up to ${report.lastClosedCandleUtc}`);
  if (errors.length) console.log(`Data errors: ${errors.join('; ')}`);
  console.log(`\nResolved: ${summary.resolvedCount} | win rate ${summary.winRate ?? '-'}% | expectancy ${summary.expectancyR ?? '-'}R | PF ${summary.profitFactor ?? '-'} | total ${summary.totalR}R | max DD ${summary.maxDrawdownR}R`);
  if (summary.resolvedCount) console.log(`Exits by reason: ${JSON.stringify(summary.byReason)}`);
  console.log(`\nOpen trades (${summary.open.length}):`);
  for (const o of summary.open) console.log(`  ${o.symbol.padEnd(7)} flip ${o.flipDate} entry ${o.entry} stop ${o.stop} unrealized ${o.unrealizedR ?? '-'}R (mark ${o.markDate})`);
  if (summary.pending.length) {
    console.log(`Pending entries (${summary.pending.length}):`);
    for (const p of summary.pending) console.log(`  ${p.symbol.padEnd(7)} flip ${p.flipDate} -> entry at ${p.expectedEntryDate} open`);
  }
}

run().catch(err => { console.error(err); process.exit(1); });
