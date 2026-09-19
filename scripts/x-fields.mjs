// x-fields.mjs - source-grounded fields for content agent. Read-only.
import { atr } from './backtest-tight-risk-breakout.mjs';
import { MoneyLineEngine } from '../packages/money-line/dist/engine.js';
import { calculateMoneyLineCloud } from '../packages/money-line/dist/cloud-supertrend.js';
import { detectCandidateEpisodes } from './preflip-core.mjs';
import { fetchBinanceDaily } from './trend-ranking-core.mjs';

async function fetchBybitDaily(sym) {
  const res = await fetch(`https://api.bybit.com/v5/market/kline?category=spot&symbol=${sym}USDT&interval=D&limit=1000`);
  const j = await res.json();
  if (j.retCode !== 0 || !j.result?.list?.length) throw new Error(j.retMsg || 'no data');
  return j.result.list.slice().reverse().map(r => ({
    timestamp: Number(r[0]), open: Number(r[1]), high: Number(r[2]), low: Number(r[3]),
    close: Number(r[4]), volume: Number(r[5]), quoteVolume: Number(r[6]), isClosed: true
  }));
}
async function fetchDaily(sym) {
  try { return await fetchBinanceDaily(sym); } catch { return await fetchBybitDaily(sym); }
}

const engine = new MoneyLineEngine();
const out = {};
for (const sym of ['STRK', 'MON', 'AI', 'SYRUP', 'XPL', 'BCH', 'TIA']) {
  try {
    const raw = await fetchDaily(sym);
    raw[raw.length - 1].isClosed = false;
    const candles = raw.filter(c => c.isClosed !== false);
    const cloud = calculateMoneyLineCloud(candles, '1d');
    const signals = engine.calculateSeries(sym, '1d', candles);
    const a14 = atr(candles, 14);
    const i = candles.length - 1;
    const src = sym === 'MON' ? 'bybit-spot' : 'binance-spot';
    const rec = {
      source: src,
      lastClosedDay: new Date(candles[i].timestamp).toISOString().slice(0, 10),
      close: candles[i].close,
      trendDir: cloud.dirSlow[i] === 1 ? 'bearish' : 'bullish',
      trigger: cloud.lineSlow[i],
      sma50: cloud.sma50[i],
      sma200: cloud.sma200[i],
      baseLow30d: Math.min(...candles.slice(-30).map(c => c.low)),
      rvol: signals[i]?.rawIndicators?.rvol ?? null,
      atr14: a14[i]
    };
    // most recent confirmed buy flip
    let flipIdx = -1;
    for (let j = i; j >= 0; j--) if (cloud.buySignals[j]) { flipIdx = j; break; }
    if (flipIdx >= 0) {
      rec.lastFlipDate = new Date(candles[flipIdx].timestamp).toISOString().slice(0, 10);
      rec.lastFlipClose = candles[flipIdx].close;
      rec.moveSinceFlipPct = +(((candles[i].close / candles[flipIdx].close) - 1) * 100).toFixed(2);
    }
    // most recent candidate episode start (pre-flip zone entry)
    const eps = detectCandidateEpisodes(candles, cloud, a14);
    if (eps.length) {
      const ep = eps.at(-1);
      rec.lastCandidateDate = new Date(ep.candidateTime).toISOString().slice(0, 10);
      rec.candidateTriggerThen = ep.triggerPrice;
      rec.candidateDistAtrThen = +ep.distAtr.toFixed(2);
    }
    const dist = cloud.lineSlow[i] - candles[i].close;
    rec.distToTriggerPct = +((dist / candles[i].close) * 100).toFixed(2);
    rec.distToTriggerAtr = +(dist / a14[i]).toFixed(2);
    out[sym] = rec;
  } catch (err) { out[sym] = { error: err.message }; }
}
console.log(JSON.stringify(out, null, 1));
