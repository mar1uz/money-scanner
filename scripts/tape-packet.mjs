// tape-packet.mjs
// Daily strict-rule verification packet for the @marketscan_360 workflow.
// Replaces the Google-authenticated app tape endpoints for CRYPTO coverage:
// same flip math (packages/money-line cloud), same exchange OHLC sources,
// closed UTC daily candles only. Local research tool - no auth, no secrets.
// Output: tmp/paper-trades/tape-packet.json (fresh) + jsonl snapshot (append, 1/UTC day).

import { atr } from './backtest-tight-risk-breakout.mjs';
import { MoneyLineEngine } from '../packages/money-line/dist/engine.js';
import { calculateMoneyLineCloud } from '../packages/money-line/dist/cloud-supertrend.js';
import { round } from './paper-trade-logger.mjs';
import { CRYPTO_SYMBOLS, fetchBinanceDaily } from './trend-ranking-core.mjs';
import { mkdirSync, appendFileSync, writeFileSync, readFileSync, existsSync } from 'node:fs';

const EXTRA_SYMBOLS = ['STRK', 'AI', 'SYRUP', 'MON', 'XPL'];
const JSON_PATH = 'tmp/paper-trades/tape-packet.json';
const JSONL_PATH = 'tmp/paper-trades/tape-packet.jsonl';
const STRICT_MOVE_PCT = 20;
const FLIP_LOOKBACK_DAYS = 120;

async function fetchBybitDaily(sym) {
  const res = await fetch(`https://api.bybit.com/v5/market/kline?category=spot&symbol=${sym}USDT&interval=D&limit=1000`);
  if (!res.ok) throw new Error(`bybit ${res.status}`);
  const j = await res.json();
  if (j.retCode !== 0 || !j.result?.list?.length) throw new Error(j.retMsg || 'no data');
  return j.result.list.slice().reverse().map(r => ({
    timestamp: Number(r[0]), open: Number(r[1]), high: Number(r[2]), low: Number(r[3]),
    close: Number(r[4]), volume: Number(r[5]), quoteVolume: Number(r[6]), isClosed: true
  }));
}
async function fetchDaily(sym) {
  try { return { candles: await fetchBinanceDaily(sym), source: 'binance-spot' }; }
  catch { return { candles: await fetchBybitDaily(sym), source: 'bybit-spot' }; }
}

async function run() {
  const engine = new MoneyLineEngine();
  const generatedAt = new Date().toISOString();
  const assets = [];
  const skipped = [];
  for (const sym of [...new Set([...CRYPTO_SYMBOLS, ...EXTRA_SYMBOLS])]) {
    try {
      const { candles: raw, source } = await fetchDaily(sym);
      raw[raw.length - 1].isClosed = false;
      const candles = raw.filter(c => c.isClosed !== false);
      const cloud = calculateMoneyLineCloud(candles, '1d');
      const signals = engine.calculateSeries(sym, '1d', candles);
      const a14 = atr(candles, 14);
      const i = candles.length - 1;
      const close = candles[i].close;
      const line = cloud.lineSlow[i];
      const dist = line - close;
      let flipIdx = -1;
      for (let j = i; j >= Math.max(0, i - FLIP_LOOKBACK_DAYS); j--) if (cloud.buySignals[j]) { flipIdx = j; break; }
      const rec = {
        symbol: sym, source,
        asOfClosedDay: new Date(candles[i].timestamp).toISOString().slice(0, 10),
        close,
        trigger: round(line, 8),
        distToTriggerPct: round(dist / close * 100, 2),
        distToTriggerAtr: round(dist / a14[i], 2),
        status: cloud.dirSlow[i] !== 1 || dist <= 0 ? 'confirmed/above' : (dist / a14[i] <= 1 ? 'candidate' : 'early'),
        rvol: round(signals[i]?.rawIndicators?.rvol ?? 1, 2),
        sma50: round(cloud.sma50[i], 8),
        sma200: round(cloud.sma200[i], 8),
        baseLow30d: Math.min(...candles.slice(-30).map(c => c.low))
      };
      if (flipIdx >= 0) {
        rec.lastFlipDate = new Date(candles[flipIdx].timestamp).toISOString().slice(0, 10);
        rec.lastFlipClose = candles[flipIdx].close;
        rec.moveSinceFlipPct = round((close / candles[flipIdx].close - 1) * 100, 2);
        rec.daysSinceFlip = i - flipIdx;
      }
      assets.push(rec);
    } catch (err) { skipped.push(`${sym}: ${err.message}`); }
  }
  const strictRuleAssets = assets.filter(a => a.lastFlipDate && a.moveSinceFlipPct >= STRICT_MOVE_PCT);
  const counterexamples = assets.filter(a => a.lastFlipDate && a.moveSinceFlipPct < 0);
  const packet = {
    generatedAt,
    method: 'local: packages/money-line cloud on exchange daily closes (closed UTC candles only)',
    coverage: `${assets.length} crypto symbols (binance/bybit spot) - NOT the app's 264-asset multi-class universe; 1W scanner state not reproduced`,
    strictRule: `confirmed daily cloud flip within ${FLIP_LOOKBACK_DAYS}d and move >= +${STRICT_MOVE_PCT}% since flip close`,
    strictRuleAssets,
    counterexamples,
    assets,
    skipped
  };
  mkdirSync('tmp/paper-trades', { recursive: true });
  writeFileSync(JSON_PATH, JSON.stringify(packet, null, 1));
  const today = generatedAt.slice(0, 10);
  let already = false;
  if (existsSync(JSONL_PATH)) {
    const last = readFileSync(JSONL_PATH, 'utf8').trim().split('\n').filter(Boolean).at(-1);
    if (last) { try { already = JSON.parse(last).generatedAt?.slice(0, 10) === today; } catch { /* keep */ } }
  }
  if (!already) appendFileSync(JSONL_PATH, JSON.stringify({ generatedAt, strictRuleAssets: strictRuleAssets.map(a => ({ s: a.symbol, flip: a.lastFlipDate, move: a.moveSinceFlipPct })), count: assets.length }) + '\n');
  console.log(`packet -> ${JSON_PATH} (${assets.length} assets, strict-rule: ${strictRuleAssets.map(a => `${a.symbol} +${a.moveSinceFlipPct}% since ${a.lastFlipDate}`).join(', ') || 'none today'})`);
  if (skipped.length) console.log(`skipped: ${skipped.join('; ')}`);
}
run().catch(err => { console.error(err); process.exit(1); });
