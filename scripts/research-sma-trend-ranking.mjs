// research-sma-trend-ranking.mjs
// Round 3: bullish daily Money Line flips gated on close > SMA50 AND close > SMA200.
// Questions: does the SMA gate itself add lift? Do SMA50>SMA200 or SMA slopes add more?
// Does a calibrated ranking model beat the validated RVOL>=2 baseline out of sample?
// Local research only - no orders, no exchange connections, no credentials.

import { atr, sma } from './backtest-tight-risk-breakout.mjs';
import { MoneyLineEngine } from '../packages/money-line/dist/engine.js';
import { managePosition, detectFlips, COST_PER_SIDE, round } from './paper-trade-logger.mjs';

const CRYPTO_SYMBOLS = [
  'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'AVAX', 'LINK',
  'SUI', 'NEAR', 'APT', 'DOT', 'LTC', 'BCH', 'SHIB', 'PEPE', 'UNI',
  'ATOM', 'FIL', 'ARB', 'OP', 'TIA', 'RENDER', 'INJ'
];
const LABELS = [
  { name: '+20%/21d', up: 0.20, down: 0.10, horizon: 21 },
  { name: '+15%/14d', up: 0.15, down: 0.10, horizon: 14 }
];
const DAY_MS = 86_400_000;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url.slice(0, 90)}`);
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
      low: Number(r[3]), close: Number(r[4]), volume: Number(r[5]),
      quoteVolume: Number(r[7]), isClosed: true
    })).concat(output);
    endTime = rows[0][0] - 1;
    if (rows.length < 1000) break;
  }
  return output;
}

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

function labelEvent(e, candles, variant) {
  const i = e.flipIndex, entryIdx = i + 1;
  if (entryIdx >= candles.length) return null;
  const entry = candles[entryIdx].open;
  let pump = 0, mfe = 0, mae = 0;
  for (let j = entryIdx; j <= Math.min(i + variant.horizon, candles.length - 1); j++) {
    const up = (candles[j].high - entry) / entry;
    const dn = (candles[j].low - entry) / entry;
    mfe = Math.max(mfe, up); mae = Math.min(mae, dn);
    if (up >= variant.up) { pump = 1; break; }
    if (dn <= -variant.down) { pump = 0; break; }
  }
  return { pump, mfe, mae };
}

function simulate(e, candles, signals, atr14) {
  const entryIdx = e.flipIndex + 1;
  if (entryIdx >= candles.length) return null;
  const entryPrice = candles[entryIdx].open * (1 + COST_PER_SIDE);
  const stop = entryPrice - 1.25 * atr14[e.flipIndex];
  const risk = entryPrice - stop;
  if (risk <= 0) return null;
  const { outcome } = managePosition({ entry: entryPrice, stop, risk }, candles, signals, e.flipIndex);
  return outcome;
}

const FEATURE_NAMES = [
  'score', 'strongTier', 'rvol', 'volAccel', 'rsi14', 'atrPercent',
  'distSma50', 'distSma200', 'smaGolden', 'sma50Slope', 'sma200Slope',
  'ret7', 'ret30', 'ddFromHigh90', 'logLiq', 'funding24h', 'fundingPct90'
];

function buildEvents(symbol, candles, signals, atr14, funding) {
  const closes = candles.map(c => c.close);
  const sma50 = sma(closes, 50);
  const sma200 = sma(closes, 200);
  const vols = candles.map(c => c.volume);
  const volMa5 = sma(vols, 5);
  const flips = detectFlips(candles, signals, atr14);
  const events = [];
  for (const flip of flips) {
    const i = flip.flipIndex;
    if (i < 200 || i + 22 >= candles.length) continue;
    const close = candles[i].close;
    if (!(close > sma50[i] && close > sma200[i])) continue; // the SMA gate
    const raw = signals[i].rawIndicators;
    // funding at flip
    let funding24h = 0, fundingPct90 = 0;
    if (funding.length) {
      let idx = -1, lo = 0, hi = funding.length - 1;
      while (lo <= hi) { const m = (lo + hi) >> 1; if (funding[m].t <= flip.flipTime) { idx = m; lo = m + 1; } else hi = m - 1; }
      if (idx >= 2) {
        funding24h = (funding[idx].rate + funding[idx - 1].rate + funding[idx - 2].rate) / 3;
        const trail = funding.filter(f => f.t <= flip.flipTime && f.t > flip.flipTime - 90 * DAY_MS).map(f => f.rate);
        if (trail.length > 20) fundingPct90 = trail.filter(f => f <= funding24h).length / trail.length;
      }
    }
    const high90 = Math.max(...candles.slice(Math.max(0, i - 90), i + 1).map(c => c.high));
    const quote20 = candles.slice(Math.max(0, i - 20), i + 1).map(c => c.quoteVolume).sort((a, b) => a - b);
    const e = {
      symbol, flipIndex: i, flipTime: flip.flipTime,
      features: {
        score: flip.score,
        strongTier: flip.tier === 'Strong Bullish' ? 1 : 0,
        rvol: raw.rvol,
        volAccel: volMa5[i - 5] > 0 ? (volMa5[i] / volMa5[i - 5] - 1) : 0,
        rsi14: raw.rsi14,
        atrPercent: raw.atrPercent,
        distSma50: (close - sma50[i]) / sma50[i],
        distSma200: (close - sma200[i]) / sma200[i],
        smaGolden: sma50[i] > sma200[i] ? 1 : 0,
        sma50Slope: sma50[i - 10] > 0 ? sma50[i] / sma50[i - 10] - 1 : 0,
        sma200Slope: sma200[i - 20] > 0 ? sma200[i] / sma200[i - 20] - 1 : 0,
        ret7: close / closes[i - 7] - 1,
        ret30: close / closes[i - 30] - 1,
        ddFromHigh90: close / high90 - 1,
        logLiq: Math.log10(Math.max(quote20[Math.floor(quote20.length / 2)], 1)),
        funding24h, fundingPct90
      },
      labels: {}
    };
    for (const v of LABELS) e.labels[v.name] = labelEvent(e, candles, v);
    events.push(e);
  }
  return events;
}

function trainLogreg(rows, names, labelName, lambda = 1, iters = 2500, lr = 0.2) {
  const means = {}, sds = {};
  for (const nm of names) {
    const vals = rows.map(r => r.features[nm]);
    means[nm] = vals.reduce((a, b) => a + b, 0) / vals.length;
    sds[nm] = Math.sqrt(vals.reduce((a, b) => a + (b - means[nm]) ** 2, 0) / vals.length) || 1;
  }
  const z = (r, nm) => (r.features[nm] - means[nm]) / sds[nm];
  const y = r => r.labels[labelName].pump;
  const w = {}; for (const nm of names) w[nm] = 0;
  let b = 0;
  for (let it = 0; it < iters; it++) {
    const gw = {}; for (const nm of names) gw[nm] = 0;
    let gb = 0;
    for (const r of rows) {
      let logit = b; for (const nm of names) logit += w[nm] * z(r, nm);
      const err = 1 / (1 + Math.exp(-logit)) - y(r);
      gb += err; for (const nm of names) gw[nm] += err * z(r, nm);
    }
    b -= lr * gb / rows.length;
    for (const nm of names) w[nm] -= lr * (gw[nm] / rows.length + lambda * w[nm] / rows.length);
  }
  return { w, b, means, sds };
}

const rawLogit = (m, r) => {
  let logit = m.b;
  for (const nm of FEATURE_NAMES) logit += m.w[nm] * (r.features[nm] - m.means[nm]) / m.sds[nm];
  return logit;
};
const sigmoid = x => 1 / (1 + Math.exp(-x));

function plattFit(rows, logits, labelName) {
  let A = 1, B = 0;
  for (let it = 0; it < 200; it++) {
    let gA = 0, gB = 0, hAA = 1e-6, hAB = 0, hBB = 1e-6;
    for (let k = 0; k < rows.length; k++) {
      const p = sigmoid(A * logits[k] + B);
      const err = p - rows[k].labels[labelName].pump;
      gA += err * logits[k]; gB += err;
      const q = Math.max(p * (1 - p), 1e-9);
      hAA += q * logits[k] ** 2; hAB += q * logits[k]; hBB += q;
    }
    const det = hAA * hBB - hAB * hAB;
    const dA = (hBB * gA - hAB * gB) / det, dB = (hAA * gB - hAB * gA) / det;
    A -= dA; B -= dB;
    if (Math.abs(dA) < 1e-8 && Math.abs(dB) < 1e-8) break;
  }
  return { A, B };
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

function topKCohort(events, probFn, k) {
  const byDay = new Map();
  for (const e of events) {
    const day = new Date(e.flipTime).toISOString().slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(e);
  }
  const out = [];
  for (const list of byDay.values()) {
    list.sort((a, b) => probFn(b) - probFn(a));
    out.push(...list.slice(0, k));
  }
  return out;
}

const rate = (rows, labelName) => rows.length ? round(rows.filter(e => e.labels[labelName].pump).length / rows.length * 100, 1) : null;

async function run() {
  console.log('Loading data (spot daily + funding)...');
  const engine = new MoneyLineEngine();
  const perAsset = new Map();
  const allEvents = [];

  for (const sym of CRYPTO_SYMBOLS) {
    try {
      const candles = await fetchBinanceDaily(sym);
      if (candles.length < 500) continue;
      candles[candles.length - 1].isClosed = false;
      let funding = [];
      try { funding = await fetchFunding(sym); } catch { /* derivatives optional */ }
      const closed = candles.filter(c => c.isClosed !== false);
      const signals = engine.calculateSeries(sym, '1d', closed);
      const atr14 = atr(closed, 14);
      perAsset.set(sym, { candles: closed, signals, atr14 });
      allEvents.push(...buildEvents(sym, closed, signals, atr14, funding));
      process.stdout.write(`${sym} `);
    } catch (err) { console.log(`\n skip ${sym}: ${err.message}`); }
  }
  allEvents.sort((a, b) => a.flipTime - b.flipTime);
  console.log(`\nQualifying flips (close>SMA50 & >SMA200): ${allEvents.length}`);

  const n = allEvents.length;
  const splits = {
    train: allEvents.slice(0, Math.floor(n * 0.6)),
    val: allEvents.slice(Math.floor(n * 0.6), Math.floor(n * 0.8)),
    test: allEvents.slice(Math.floor(n * 0.8))
  };
  const MAIN = '+20%/21d';

  console.log('\n== Base rates of SMA-gated flips ==');
  for (const v of LABELS) {
    console.log(`  ${v.name}: train ${rate(splits.train, v.name)}% | val ${rate(splits.val, v.name)}% | test ${rate(splits.test, v.name)}%`);
  }

  // Gate anatomy: does golden cross / slopes add lift within the gated set?
  console.log(`\n== Gate anatomy (pump% ${MAIN} within SMA-gated flips) ==`);
  const gates = [
    ['SMA50>SMA200 (golden)', e => e.features.smaGolden === 1],
    ['SMA50<SMA200', e => e.features.smaGolden === 0],
    ['SMA50 rising (10d)', e => e.features.sma50Slope > 0],
    ['SMA50 falling', e => e.features.sma50Slope <= 0],
    ['SMA200 rising (20d)', e => e.features.sma200Slope > 0],
    ['SMA200 falling', e => e.features.sma200Slope <= 0],
    ['RVOL>=2 (baseline rule)', e => e.features.rvol >= 2],
    ['RVOL<2', e => e.features.rvol < 2]
  ];
  for (const [label, f] of gates) {
    const line = ['train', 'val', 'test'].map(s => {
      const sub = splits[s].filter(f);
      return `${s} n=${sub.length} ${rate(sub, MAIN)}%`;
    }).join(' | ');
    console.log(`  ${label.padEnd(26)} ${line}`);
  }

  // Model on the gated events
  console.log(`\n== Logistic ranking model on SMA-gated flips, label ${MAIN} ==`);
  const model = trainLogreg(splits.train, FEATURE_NAMES, MAIN);
  const valLogits = splits.val.map(r => rawLogit(model, r));
  const platt = plattFit(splits.val, valLogits, MAIN);
  const prob = r => sigmoid(platt.A * rawLogit(model, r) + platt.B);
  const topW = FEATURE_NAMES.map(nm => [nm, model.w[nm]]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 10);
  console.log('  top weights:', topW.map(([nm, w]) => `${nm}=${round(w, 2)}`).join(' '));

  // Calibration on test
  console.log('  calibration on TEST (quintiles):');
  const buckets = Array.from({ length: 5 }, () => ({ n: 0, sumP: 0, hits: 0 }));
  for (const r of splits.test) {
    const p = prob(r);
    const b = Math.min(4, Math.floor(p * 5));
    buckets[b].n++; buckets[b].sumP += p; buckets[b].hits += r.labels[MAIN].pump;
  }
  buckets.forEach((b, i) => {
    if (!b.n) return;
    console.log(`    p ${(i * 0.2).toFixed(1)}-${((i + 1) * 0.2).toFixed(1)}: n=${b.n} meanPred=${round(b.sumP / b.n * 100, 1)}% observed=${round(b.hits / b.n * 100, 1)}%`);
  });

  // Top-5 ranked cohort vs RVOL>=2 baseline vs all gated, on VAL and TEST
  for (const splitName of ['val', 'test']) {
    const rows = splits[splitName];
    const top5 = topKCohort(rows, prob, 5);
    const rvol2 = rows.filter(e => e.features.rvol >= 2);
    const simAll = [], simTop5 = [], simRvol2 = [];
    for (const e of rows) {
      const a = perAsset.get(e.symbol);
      const t = simulate(e, a.candles, a.signals, a.atr14);
      if (!t) continue;
      simAll.push(t);
      if (top5.includes(e)) simTop5.push(t);
      if (e.features.rvol >= 2) simRvol2.push(t);
    }
    const sAll = cohortStats(simAll), sTop5 = cohortStats(simTop5), sR2 = cohortStats(simRvol2);
    console.log(`\n== ${splitName.toUpperCase()} cohorts (label ${MAIN}, costs in) ==`);
    console.log(`  all gated:    n=${rows.length} pump=${rate(rows, MAIN)}% | trades=${sAll.trades} exp=${sAll.expectancyR}R PF=${sAll.profitFactor} DD=${sAll.maxDrawdownR}R`);
    console.log(`  RVOL>=2:      n=${rvol2.length} pump=${rate(rvol2, MAIN)}% | trades=${sR2.trades} exp=${sR2.expectancyR}R PF=${sR2.profitFactor} DD=${sR2.maxDrawdownR}R`);
    console.log(`  model top5/d: n=${top5.length} pump=${rate(top5, MAIN)}% | trades=${sTop5.trades} exp=${sTop5.expectancyR}R PF=${sTop5.profitFactor} DD=${sTop5.maxDrawdownR}R`);
  }
}

run().catch(err => { console.error(err); process.exit(1); });
