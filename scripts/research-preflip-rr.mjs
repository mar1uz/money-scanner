// research-preflip-rr.mjs
// Round 4b: does setup QUALITY (proximity to SMA/base, tighter logical stops)
// improve expectancy/drawdown vs the generic 1.25 ATR stop?
// Stops/resistance use only data <= confirm day. Chronological splits.

import { atr } from './backtest-tight-risk-breakout.mjs';
import { MoneyLineEngine } from '../packages/money-line/dist/engine.js';
import { calculateMoneyLineCloud } from '../packages/money-line/dist/cloud-supertrend.js';
import { managePosition, round } from './paper-trade-logger.mjs';
import { detectCandidateEpisodes, stage1Outcome, tradeQuality, CHAIN_TVL_MAP } from './preflip-core.mjs';
import { CRYPTO_SYMBOLS, fetchBinanceDaily } from './trend-ranking-core.mjs';

function sim(candles, signals, confirmIndex, stop) {
  const entryIdx = confirmIndex + 1;
  if (entryIdx >= candles.length) return null;
  const entry = candles[entryIdx].open * 1.00125;
  if (stop >= entry) return null;
  const { outcome } = managePosition({ entry, stop, risk: entry - stop }, candles, signals, confirmIndex);
  return outcome;
}
function stats(ts) {
  if (!ts.length) return { n: 0 };
  const rs = ts.map(t => t.r);
  const w = rs.filter(r => r > 0), l = rs.filter(r => r <= 0);
  const gw = w.reduce((a, b) => a + b, 0), gl = Math.abs(l.reduce((a, b) => a + b, 0));
  let peak = 0, cum = 0, dd = 0;
  for (const r of rs) { cum += r; peak = Math.max(peak, cum); dd = Math.max(dd, peak - cum); }
  return { n: rs.length, exp: round(rs.reduce((a, b) => a + b, 0) / rs.length, 3), pf: gl > 0 ? round(gw / gl, 2) : null, dd: round(dd, 1) };
}
const line = s => `n=${s.n} exp=${s.exp}R PF=${s.pf} DD=${s.dd}R`;

async function run() {
  console.log('Loading data...');
  const engine = new MoneyLineEngine();
  const perAsset = new Map();
  for (const sym of CRYPTO_SYMBOLS) {
    try {
      const candles = await fetchBinanceDaily(sym);
      if (candles.length < 500) continue;
      candles[candles.length - 1].isClosed = false;
      const closed = candles.filter(c => c.isClosed !== false);
      perAsset.set(sym, { candles: closed, signals: engine.calculateSeries(sym, '1d', closed), cloud: calculateMoneyLineCloud(closed, '1d'), atr14: atr(closed, 14) });
    } catch { /* skip */ }
  }
  const events = [];
  for (const [sym, a] of perAsset) {
    for (const ep of detectCandidateEpisodes(a.candles, a.cloud, a.atr14)) {
      if (ep.index < 200 || ep.index + 22 >= a.candles.length) continue;
      const s1 = stage1Outcome(ep, a.cloud);
      if (!s1.confirmed) continue;
      events.push({ sym, a, confirmIndex: s1.confirmIndex, confirmTime: a.candles[s1.confirmIndex].timestamp });
    }
  }
  events.sort((x, y) => x.confirmTime - y.confirmTime);
  console.log(`confirmed candidate events: ${events.length}`);
  const n = events.length;
  const splits = { train: events.slice(0, Math.floor(n * .6)), val: events.slice(Math.floor(n * .6), Math.floor(n * .8)), test: events.slice(Math.floor(n * .8)) };

  for (const s of ['train', 'val', 'test']) {
    const rows = splits[s];
    const atrStop = [], logStop = [], near = [], extended = [], tight = [], wide = [], rrHi = [], rrLo = [];
    let tqCount = 0;
    for (const e of rows) {
      // ATR stop sim (existing rule)
      const entryIdx = e.confirmIndex + 1;
      if (entryIdx >= e.a.candles.length) continue;
      const entry = e.a.candles[entryIdx].open * 1.00125;
      const stopA = entry - 1.25 * e.a.atr14[e.confirmIndex];
      const r1 = sim(e.a.candles, e.a.signals, e.confirmIndex, stopA);
      if (r1) atrStop.push(r1);
      const tq = tradeQuality(e.a.candles, e.a.atr14, e.a.cloud, e.confirmIndex);
      if (!tq) continue;
      tqCount++;
      const r2 = sim(e.a.candles, e.a.signals, e.confirmIndex, tq.stop);
      if (!r2) continue;
      logStop.push(r2);
      (tq.stopDistPct <= 8 ? tight : wide).push(r2);
      (Math.abs(tq.extSma50) <= 0.05 ? near : extended).push(r2);
      (tq.rr >= 1.5 ? rrHi : rrLo).push(r2);
    }
    console.log(`\n${s}: n=${rows.length} (plans ${tqCount})`);
    console.log(`  ATR 1.25 stop:        ${line(stats(atrStop))}`);
    console.log(`  logical anchor stop:  ${line(stats(logStop))}`);
    console.log(`  stop <=8% away:       ${line(stats(tight))}`);
    console.log(`  stop >8% away:        ${line(stats(wide))}`);
    console.log(`  near SMA50 (<=5%):    ${line(stats(near))}`);
    console.log(`  extended (>5%):       ${line(stats(extended))}`);
    console.log(`  planned RR >=1.5:     ${line(stats(rrHi))}`);
    console.log(`  planned RR <1.5:      ${line(stats(rrLo))}`);
  }
}
run().catch(err => { console.error(err); process.exit(1); });
