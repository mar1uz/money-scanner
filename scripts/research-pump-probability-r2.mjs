// research-pump-probability-r2.mjs
// Round 2: pre-registered RVOL x freshness rules, label variants,
// regime-conditional models, funding/OI features from PUBLIC Binance
// futures endpoints. Local research only; no orders, no credentials.
//
// Discipline: rules are frozen before test evaluation. Chronological
// 60/20/20 split per label variant. Selection on validation only.
// Costs: 0.075% fee + 0.05% slippage per side, entry at next open.

import { DAY_MS, atr } from './backtest-tight-risk-breakout.mjs';
import { MoneyLineEngine } from '../packages/money-line/dist/engine.js';

const COST_PER_SIDE = (0.075 + 0.05) / 100;
const ATR_STOP_MULT = 1.25;
const MAX_HOLD_DAYS = 42;

const CRYPTO_SYMBOLS = [
  'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'AVAX', 'LINK',
  'SUI', 'NEAR', 'APT', 'DOT', 'LTC', 'BCH', 'SHIB', 'PEPE', 'UNI',
  'ATOM', 'FIL', 'ARB', 'OP', 'TIA', 'RENDER', 'INJ'
];

const LABEL_VARIANTS = [
  { name: '+20%/21d', up: 0.20, down: 0.10, horizon: 21 },
  { name: '+15%/14d', up: 0.15, down: 0.10, horizon: 14 },
  { name: '+12%/10d', up: 0.12, down: 0.08, horizon: 10 }
];

const round = (v, d = 2) => Number(v.toFixed(d));
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url.slice(0, 80)}`);
  return res.json();
}

async function fetchBinanceDaily(symbol) {
  let output = [], endTime;
  while (output.length < 3000) {
    const suffix = endTime ? `&endTime=${endTime}` : '';
    const rows = await fetchJson(`https://data-api.binance.vision/api/v3/klines?symbol=${symbol}USDT&interval=1d&limit=1000${suffix}`);
    if (!rows.length) break;
    output = rows.map(r => ({
      timestamp: Number(r[0]), open: Number(r[1]), high: Number(r[2]),
      low: Number(r[3]), close: Number(r[4]), volume: Number(r[5]), isClosed: true
    })).concat(output);
    endTime = rows[0][0] - 1;
    if (rows.length < 1000) break;
  }
  return output;
}

// Public futures data (no key). History from 2022-01-01 keeps request counts sane.
async function fetchFunding(symbol) {
  const out = [];
  let start = Date.UTC(2022, 0, 1);
  while (true) {
    const rows = await fetchJson(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${symbol}USDT&limit=1000&startTime=${start}`);
    if (!rows.length) break;
    out.push(...rows.map(r => ({ t: Number(r.fundingTime), rate: Number(r.fundingRate) })));
    start = Number(rows.at(-1).fundingTime) + 1;
    await sleep(80);
    if (rows.length < 1000) break;
  }
  return out;
}

async function fetchOpenInterest(symbol) {
  const out = [];
  let start = Date.UTC(2022, 0, 1);
  while (true) {
    const rows = await fetchJson(`https://fapi.binance.com/futures/data/openInterestHist?symbol=${symbol}USDT&period=1d&limit=500&startTime=${start}`);
    if (!rows.length) break;
    out.push(...rows.map(r => ({ t: Number(r.timestamp), oi: Number(r.sumOpenInterest) })));
    start = Number(rows.at(-1).timestamp) + 1;
    await sleep(80);
    if (rows.length < 500) break;
  }
  return out;
}

function supertrendDir(candles, period = 10, multiplier = 3.5) {
  const atrValues = atr(candles, period);
  const dir = new Array(candles.length).fill(1);
  let up = 0, lo = 0, d = 1;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const a = Number.isFinite(atrValues[i]) ? atrValues[i] : c.high - c.low;
    const mid = (c.high + c.low) / 2;
    const bu = mid + multiplier * a, bl = mid - multiplier * a;
    if (i === 0) { up = bu; lo = bl; }
    else {
      const pc = candles[i - 1].close;
      lo = bl > lo || pc < lo ? bl : lo;
      up = bu < up || pc > up ? bu : up;
      if (d === 1 && c.close < lo) d = -1;
      else if (d === -1 && c.close > up) d = 1;
    }
    dir[i] = d;
  }
  return dir;
}

function weekStart(ts) {
  const d = new Date(ts);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

function aggregateWeeks(daily) {
  const weeks = [];
  for (const c of daily) {
    const ts = weekStart(c.timestamp);
    const cur = weeks.at(-1);
    if (!cur || cur.timestamp !== ts) weeks.push({ ...c, timestamp: ts });
    else { cur.high = Math.max(cur.high, c.high); cur.low = Math.min(cur.low, c.low); cur.close = c.close; }
  }
  return weeks;
}

const BULLISH = new Set(['Bullish', 'Strong Bullish']);
const BEARISH = new Set(['Bearish', 'Strong Bearish']);

function buildEvents(symbol, candles, signals, btcRegimeByWeek, funding, oiHist) {
  const weeks = aggregateWeeks(candles);
  const weeklyDir = supertrendDir(weeks, 10, 3.5);
  const events = [];
  const flipIndexes = [];

  for (let i = 201; i < candles.length - 23; i++) {
    const sig = signals[i], prev = signals[i - 1];
    if (!sig || !prev) continue;
    if (!BULLISH.has(sig.tier) || BULLISH.has(prev.tier)) continue;

    const t = candles[i].timestamp;
    const wkTs = weekStart(t);
    const wkIdx = weeks.findIndex(w => w.timestamp === wkTs);
    const raw = sig.rawIndicators, contrib = sig.contributions;
    const close = candles[i].close;
    const high90 = Math.max(...candles.slice(Math.max(0, i - 90), i + 1).map(c => c.high));
    const priorFlips = flipIndexes.filter(j => i - j <= 90).length;
    flipIndexes.push(i);

    // funding: mean of last 3 fundings (24h) + percentile vs trailing 90d
    let funding24h = null, fundingPct90 = null;
    if (funding.length) {
      let idx = -1, lo2 = 0, hi2 = funding.length - 1;
      while (lo2 <= hi2) { const m = (lo2 + hi2) >> 1; if (funding[m].t <= t) { idx = m; lo2 = m + 1; } else hi2 = m - 1; }
      if (idx >= 2) {
        funding24h = (funding[idx].rate + funding[idx - 1].rate + funding[idx - 2].rate) / 3;
        const trail = funding.filter(f => f.t <= t && f.t > t - 90 * DAY_MS).map(f => f.rate);
        if (trail.length > 20) fundingPct90 = trail.filter(f => f <= funding24h).length / trail.length;
      }
    }
    // OI change over 7d and 1d
    let oiChg7 = null, oiChg1 = null;
    if (oiHist.length) {
      let idx = -1, lo3 = 0, hi3 = oiHist.length - 1;
      while (lo3 <= hi3) { const m = (lo3 + hi3) >> 1; if (oiHist[m].t <= t) { idx = m; lo3 = m + 1; } else hi3 = m - 1; }
      if (idx >= 7 && oiHist[idx - 7].oi > 0) oiChg7 = oiHist[idx].oi / oiHist[idx - 7].oi - 1;
      if (idx >= 1 && oiHist[idx - 1].oi > 0) oiChg1 = oiHist[idx].oi / oiHist[idx - 1].oi - 1;
    }

    events.push({
      symbol, flipIndex: i, flipTime: t,
      features: {
        score: sig.score,
        strongTier: sig.tier === 'Strong Bullish' ? 1 : 0,
        scoreDelta: sig.score - prev.score,
        rsi14: raw.rsi14, rvol: raw.rvol, atrPercent: raw.atrPercent,
        emaAlign: contrib.emaAlignmentScore, macdScore: contrib.macdScore,
        rsiScore: contrib.rsiScore, rvolScore: contrib.rvolScore,
        distEma20: (close - raw.ema20) / close,
        distEma200: raw.ema200 > 0 ? (close - raw.ema200) / raw.ema200 : 0,
        ret30: i >= 30 ? close / candles[i - 30].close - 1 : 0,
        ddFromHigh90: high90 > 0 ? close / high90 - 1 : 0,
        weeklyBull: wkIdx >= 0 && weeklyDir[wkIdx] === 1 ? 1 : 0,
        btcWeeklyBull: btcRegimeByWeek.get(wkTs) ?? 0,
        fresh: priorFlips === 0 ? 1 : 0,
        rvol2: raw.rvol >= 2 ? 1 : 0,
        funding24h, fundingPct90, oiChg7, oiChg1
      }
    });
  }
  return events;
}

function attachLabels(events, candles, variant) {
  for (const e of events) {
    const i = e.flipIndex;
    const entryIdx = i + 1;
    if (entryIdx >= candles.length) { e.labels[variant.name] = null; continue; }
    const entry = candles[entryIdx].open;
    let pump = 0, mfe = 0, mae = 0, decided = false;
    for (let j = entryIdx; j <= Math.min(i + variant.horizon, candles.length - 1); j++) {
      const up = (candles[j].high - entry) / entry;
      const dn = (candles[j].low - entry) / entry;
      mfe = Math.max(mfe, up); mae = Math.min(mae, dn);
      if (up >= variant.up) { pump = 1; decided = true; break; }
      if (dn <= -variant.down) { pump = 0; decided = true; break; }
    }
    const end = Math.min(i + variant.horizon, candles.length - 1);
    e.labels[variant.name] = { pump, mfe, mae, retAtH: (candles[end].close - entry) / entry, decided };
  }
}

// pre-registered rule candidates
const RULES = [
  { name: 'R1 rvol>=2', f: e => e.features.rvol >= 2 },
  { name: 'R2 fresh', f: e => e.features.fresh === 1 },
  { name: 'R3 rvol>=2 & fresh', f: e => e.features.rvol >= 2 && e.features.fresh === 1 },
  { name: 'R4 rvol>=2 & close>EMA200', f: e => e.features.rvol >= 2 && e.features.distEma200 > 0 },
  { name: 'R5 rvol>=1.5 & fresh & EMA200', f: e => e.features.rvol >= 1.5 && e.features.fresh === 1 && e.features.distEma200 > 0 },
  { name: 'R6 rvol>=2 & funding<=median', f: e => e.features.rvol >= 2 && e.features.fundingPct90 !== null && e.features.fundingPct90 <= 0.5 }
];

function simulateTrade(e, candles, signals, atr14) {
  const entryIdx = e.flipIndex + 1;
  if (entryIdx >= candles.length) return null;
  const entry = candles[entryIdx].open * (1 + COST_PER_SIDE);
  const stop0 = entry - ATR_STOP_MULT * atr14[e.flipIndex];
  const risk = entry - stop0;
  if (risk <= 0) return null;
  let stop = stop0, scaled = false, lockedR = 0;
  const lastIdx = Math.min(e.flipIndex + MAX_HOLD_DAYS, candles.length - 1);
  for (let j = entryIdx; j <= lastIdx; j++) {
    const c = candles[j];
    const highR = (c.high - entry) / risk;
    if (!scaled && highR >= 2) { scaled = true; lockedR = 1.0; stop = Math.max(stop, entry * 1.001); }
    if (c.low <= stop) return { r: round(lockedR + (scaled ? 0.5 : 1) * ((stop - entry) / risk)), exit: 'stop' };
    if (scaled && highR >= 3.5) return { r: round(lockedR + 0.5 * 3.5), exit: 'tp-cap' };
    const sig = signals[j];
    if (sig && BEARISH.has(sig.tier)) return { r: round(lockedR + (scaled ? 0.5 : 1) * ((c.close - entry) / risk)), exit: 'bear-flip' };
  }
  const c = candles[lastIdx];
  return { r: round(lockedR + (scaled ? 0.5 : 1) * ((c.close - entry) / risk)), exit: 'timeout' };
}

function cohortStats(trades) {
  if (!trades.length) return { trades: 0, winRate: null, expectancyR: null, profitFactor: null, totalR: 0, maxDrawdownR: 0 };
  const rs = trades.map(t => t.r);
  const wins = rs.filter(r => r > 0), losses = rs.filter(r => r <= 0);
  const gw = wins.reduce((a, b) => a + b, 0), gl = Math.abs(losses.reduce((a, b) => a + b, 0));
  let peak = 0, cum = 0, dd = 0;
  for (const r of rs) { cum += r; peak = Math.max(peak, cum); dd = Math.max(dd, peak - cum); }
  return {
    trades: rs.length, winRate: round(wins.length / rs.length * 100, 1),
    expectancyR: round(rs.reduce((a, b) => a + b, 0) / rs.length, 3),
    profitFactor: gl > 0 ? round(gw / gl, 2) : null,
    totalR: round(rs.reduce((a, b) => a + b, 0), 1), maxDrawdownR: round(dd, 1)
  };
}

function evalRuleOnSplit(events, perAsset, labelName, rule) {
  const hits = [], trades = [];
  for (const e of events) {
    const lab = e.labels[labelName];
    if (!lab) continue;
    if (!rule.f(e)) continue;
    hits.push(lab.pump);
    const a = perAsset.get(e.symbol);
    const tr = simulateTrade(e, a.candles, a.signals, a.atr14);
    if (tr) trades.push(tr);
  }
  const s = cohortStats(trades);
  return { n: hits.length, pumpRate: hits.length ? round(hits.reduce((a, b) => a + b, 0) / hits.length * 100, 1) : null, ...s };
}

const FEATURE_NAMES = [
  'score', 'strongTier', 'scoreDelta', 'rsi14', 'rvol', 'atrPercent',
  'emaAlign', 'macdScore', 'rsiScore', 'rvolScore', 'distEma20', 'distEma200',
  'ret30', 'ddFromHigh90', 'weeklyBull', 'btcWeeklyBull', 'fresh', 'rvol2',
  'ixRvolFresh', 'ixRvolEma200',
  'funding24h', 'fundingPct90', 'oiChg7', 'oiChg1'
];

function withDerived(e) {
  e.features.ixRvolFresh = (e.features.rvol >= 2 ? 1 : 0) * e.features.fresh;
  e.features.ixRvolEma200 = (e.features.rvol >= 2 ? 1 : 0) * (e.features.distEma200 > 0 ? 1 : 0);
  for (const k of ['funding24h', 'fundingPct90', 'oiChg7', 'oiChg1']) if (e.features[k] === null) e.features[k] = 0;
  return e;
}

function trainLogreg(rows, names, lambda = 1, iters = 2500, lr = 0.2) {
  const means = {}, sds = {};
  for (const nm of names) {
    const vals = rows.map(r => r.features[nm]);
    means[nm] = vals.reduce((a, b) => a + b, 0) / vals.length;
    sds[nm] = Math.sqrt(vals.reduce((a, b) => a + (b - means[nm]) ** 2, 0) / vals.length) || 1;
  }
  const z = (r, nm) => (r.features[nm] - means[nm]) / sds[nm];
  const w = {}; for (const nm of names) w[nm] = 0;
  let b = 0;
  for (let it = 0; it < iters; it++) {
    const gw = {}; for (const nm of names) gw[nm] = 0;
    let gb = 0;
    for (const r of rows) {
      let logit = b; for (const nm of names) logit += w[nm] * z(r, nm);
      const err = 1 / (1 + Math.exp(-logit)) - r.pump;
      gb += err; for (const nm of names) gw[nm] += err * z(r, nm);
    }
    b -= lr * gb / rows.length;
    for (const nm of names) w[nm] -= lr * (gw[nm] / rows.length + lambda * w[nm] / rows.length);
  }
  const prob = r => {
    let logit = b; for (const nm of names) logit += w[nm] * z(r, nm);
    return 1 / (1 + Math.exp(-logit));
  };
  return { prob, w };
}

async function run() {
  console.log('Loading spot + futures public data...');
  const engine = new MoneyLineEngine();
  const perAsset = new Map();

  const btcCandles = await fetchBinanceDaily('BTC');
  btcCandles[btcCandles.length - 1].isClosed = false;
  const btcClosed = btcCandles.filter(c => c.isClosed !== false);
  const btcWeeks = aggregateWeeks(btcClosed);
  const btcWeeklyDir = supertrendDir(btcWeeks, 10, 3.5);
  const btcRegimeByWeek = new Map();
  btcWeeks.forEach((w, idx) => { if (idx > 0) btcRegimeByWeek.set(w.timestamp, btcWeeklyDir[idx - 1] === 1 ? 1 : 0); });

  let futuresDataOk = true;
  for (const sym of CRYPTO_SYMBOLS) {
    try {
      const candles = sym === 'BTC' ? btcCandles : await fetchBinanceDaily(sym);
      if (candles.length < 500) { console.log(`  skip ${sym}`); continue; }
      candles[candles.length - 1].isClosed = false;
      let funding = [], oiHist = [];
      try {
        funding = await fetchFunding(sym);
        oiHist = await fetchOpenInterest(sym);
      } catch (err) {
        futuresDataOk = false;
        console.log(`  futures data unavailable for ${sym}: ${err.message} (continuing without)`);
      }
      const closed = candles.filter(c => c.isClosed !== false);
      const signals = engine.calculateSeries(sym, '1d', closed);
      perAsset.set(sym, { candles: closed, signals, atr14: atr(closed, 14), funding, oiHist });
      process.stdout.write(`${sym}(${funding.length}f/${oiHist.length}o) `);
    } catch (err) { console.log(`\n  skip ${sym}: ${err.message}`); }
  }
  console.log(`\nFutures data coverage: ${futuresDataOk ? 'full' : 'partial'}`);

  const allEvents = [];
  for (const [sym, a] of perAsset) {
    const events = buildEvents(sym, a.candles, a.signals, btcRegimeByWeek, a.funding, a.oiHist)
      .map(withDerived);
    for (const e of events) {
      e.labels = {};
      for (const v of LABEL_VARIANTS) attachLabels([e], a.candles, v);
    }
    allEvents.push(...events);
  }
  allEvents.sort((a, b) => a.flipTime - b.flipTime);
  console.log(`Total flips: ${allEvents.length}`);

  const n = allEvents.length;
  const splits = {
    train: allEvents.slice(0, Math.floor(n * 0.6)),
    val: allEvents.slice(Math.floor(n * 0.6), Math.floor(n * 0.8)),
    test: allEvents.slice(Math.floor(n * 0.8))
  };

  // ---- 1) label variant base rates ----
  console.log('\n== Label variant base rates (pump %) ==');
  for (const v of LABEL_VARIANTS) {
    const line = ['train', 'val', 'test'].map(s => {
      const rows = splits[s].filter(e => e.labels[v.name]);
      const rate = rows.length ? round(rows.filter(e => e.labels[v.name].pump).length / rows.length * 100, 1) : 0;
      return `${s} ${rows.length} / ${rate}%`;
    }).join(' | ');
    console.log(`  ${v.name}: ${line}`);
  }

  // ---- 2) pre-registered rules per label variant ----
  for (const v of LABEL_VARIANTS) {
    console.log(`\n== Rules, label ${v.name} (pump% / expectancyR / PF / maxDD, costs in) ==`);
    for (const rule of RULES) {
      const tr = evalRuleOnSplit(splits.train, perAsset, v.name, rule);
      const va = evalRuleOnSplit(splits.val, perAsset, v.name, rule);
      const te = evalRuleOnSplit(splits.test, perAsset, v.name, rule);
      console.log(`  ${rule.name.padEnd(30)} TRAIN n=${String(tr.n).padStart(4)} ${String(tr.pumpRate).padStart(5)}% ${String(tr.expectancyR).padStart(6)}R PF=${String(tr.profitFactor).padStart(5)} | VAL n=${String(va.n).padStart(3)} ${String(va.pumpRate).padStart(5)}% ${String(va.expectancyR).padStart(6)}R PF=${String(va.profitFactor).padStart(5)} | TEST n=${String(te.n).padStart(3)} ${String(te.pumpRate).padStart(5)}% ${String(te.expectancyR).padStart(6)}R PF=${String(te.profitFactor).padStart(5)} DD=${te.maxDrawdownR}R`);
    }
  }

  // ---- 3) full model + regime-conditional models on the +15%/14d label ----
  const mainLabel = '+15%/14d';
  for (const e of allEvents) { const l = e.labels[mainLabel]; e.pump = l ? l.pump : 0; }
  const trainL = splits.train.filter(e => e.labels[mainLabel]);
  const valL = splits.val.filter(e => e.labels[mainLabel]);
  const testL = splits.test.filter(e => e.labels[mainLabel]);

  const model = trainLogreg(trainL, FEATURE_NAMES);
  const rank = (rows, probFn, k) => {
    const byDay = new Map();
    for (const e of rows) {
      const day = new Date(e.flipTime).toISOString().slice(0, 10);
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push(e);
    }
    let hits = 0, total = 0;
    for (const list of byDay.values()) {
      list.sort((a, b) => probFn(b) - probFn(a));
      for (const e of list.slice(0, k)) { total++; if (e.pump) hits++; }
    }
    return total ? round(hits / total * 100, 1) : null;
  };

  const baseTest = round(testL.filter(e => e.pump).length / testL.length * 100, 1);
  console.log(`\n== Logistic model (all features), label ${mainLabel} ==`);
  console.log(`  test base rate: ${baseTest}%  precision@1/3/5: ${rank(testL, model.prob, 1)}% / ${rank(testL, model.prob, 3)}% / ${rank(testL, model.prob, 5)}%`);
  const topW = FEATURE_NAMES.map(nm => [nm, model.w[nm]]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 8);
  console.log('  top weights:', topW.map(([nm, w]) => `${nm}=${round(w, 2)}`).join(' '));

  // regime-conditional: separate models for btcWeeklyBull 1/0 (train only if n>=300)
  for (const regime of [1, 0]) {
    const trR = trainL.filter(e => e.features.btcWeeklyBull === regime);
    const teR = testL.filter(e => e.features.btcWeeklyBull === regime);
    if (trR.length < 300 || teR.length < 50) { console.log(`  regime btcBull=${regime}: insufficient n (train ${trR.length}, test ${teR.length})`); continue; }
    const mR = trainLogreg(trR, FEATURE_NAMES);
    const baseR = round(teR.filter(e => e.pump).length / teR.length * 100, 1);
    console.log(`  regime btcBull=${regime}: train ${trR.length}, test ${teR.length} (base ${baseR}%) precision@1/3/5: ${rank(teR, mR.prob, 1)}% / ${rank(teR, mR.prob, 3)}% / ${rank(teR, mR.prob, 5)}%`);
  }

  // ---- 4) single-factor pump rates incl. new futures features ----
  console.log(`\n== Single-factor pump rates, label ${mainLabel}, all events ==`);
  const checks = [
    ['funding24h < 0', e => e.features.funding24h < 0],
    ['fundingPct90 <= 0.25', e => e.features.fundingPct90 > 0 && e.features.fundingPct90 <= 0.25],
    ['fundingPct90 >= 0.75', e => e.features.fundingPct90 >= 0.75],
    ['oiChg7 >= +10%', e => e.features.oiChg7 >= 0.10],
    ['oiChg7 <= -10%', e => e.features.oiChg7 <= -0.10],
    ['rvol>=2 & funding<=med', e => e.features.rvol >= 2 && e.features.fundingPct90 > 0 && e.features.fundingPct90 <= 0.5],
    ['fresh & rvol>=2', e => e.features.fresh === 1 && e.features.rvol >= 2]
  ];
  for (const [label, f] of checks) {
    const sub = allEvents.filter(e => e.labels[mainLabel] && f(e));
    const rate = sub.length ? round(sub.filter(e => e.labels[mainLabel].pump).length / sub.length * 100, 1) : 0;
    console.log(`  ${label.padEnd(28)} n=${String(sub.length).padStart(4)} pump=${rate}%`);
  }
}

run().catch(err => { console.error(err); process.exit(1); });
