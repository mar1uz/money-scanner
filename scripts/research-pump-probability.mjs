// research-pump-probability.mjs
// Pump-probability ranking layer over confirmed bullish Money Line flips.
// Local research / paper-trading only. No orders, no exchange connections.
//
// Design (matches repo research discipline):
// - Binance daily candles, closed candles only (last in-progress candle dropped).
// - Money Line series from the production engine (packages/money-line/dist).
// - Event = tier transition into Bullish / Strong Bullish on the daily timeframe.
// - Features use only data <= flip index. Labels use only data > flip index.
// - Chronological pooled split: 60% train / 20% validation / 20% test.
// - Model: L2 logistic regression (pump = +20% MFE before -10% MAE within 21d,
//   entry at next open). Platt recalibration on validation. Threshold frozen
//   on validation expectancy, applied once to test.
// - Costs: 0.075% fee + 0.05% slippage per side. Entry at next open.
// - Trade sim: stop 1.25xATR14; TP1 +2R (50% off, stop to BE); runner exits
//   at bear flip, +3.5R cap, or 42-day timeout at close.

import { DAY_MS, atr } from './backtest-tight-risk-breakout.mjs';
import { MoneyLineEngine } from '../packages/money-line/dist/engine.js';

const FEE_PER_SIDE = 0.075 / 100;
const SLIPPAGE_PER_SIDE = 0.05 / 100;
const COST_PER_SIDE = FEE_PER_SIDE + SLIPPAGE_PER_SIDE;

const HORIZON_DAYS = 21;
const PUMP_BARRIER = 0.20;
const DUMP_BARRIER = 0.10;
const MAX_HOLD_DAYS = 42;
const ATR_STOP_MULT = 1.25;

const CRYPTO_SYMBOLS = [
  'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'AVAX', 'LINK',
  'SUI', 'NEAR', 'APT', 'DOT', 'LTC', 'BCH', 'SHIB', 'PEPE', 'UNI',
  'ATOM', 'FIL', 'ARB', 'OP', 'TIA', 'RENDER', 'INJ'
];

const round = (v, d = 2) => Number(v.toFixed(d));

async function fetchBinanceDaily(symbol) {
  let output = [];
  let endTime;
  while (output.length < 3000) {
    const suffix = endTime ? `&endTime=${endTime}` : '';
    const res = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${symbol}USDT&interval=1d&limit=1000${suffix}`);
    if (!res.ok) throw new Error(`Binance HTTP ${res.status} for ${symbol}`);
    const rows = await res.json();
    if (!rows.length) break;
    const page = rows.map(r => ({
      timestamp: Number(r[0]), open: Number(r[1]), high: Number(r[2]),
      low: Number(r[3]), close: Number(r[4]), volume: Number(r[5]), isClosed: true
    }));
    output = page.concat(output);
    endTime = rows[0][0] - 1;
    if (rows.length < 1000) break;
  }
  return output;
}

function supertrendDir(candles, period = 10, multiplier = 3.5) {
  const atrValues = atr(candles, period);
  const dirValues = new Array(candles.length).fill(1);
  let upperBand = 0, lowerBand = 0, direction = 1;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const currentAtr = Number.isFinite(atrValues[i]) ? atrValues[i] : c.high - c.low;
    const mid = (c.high + c.low) / 2;
    const basicUpper = mid + multiplier * currentAtr;
    const basicLower = mid - multiplier * currentAtr;
    if (i === 0) { upperBand = basicUpper; lowerBand = basicLower; }
    else {
      const prevClose = candles[i - 1].close;
      lowerBand = basicLower > lowerBand || prevClose < lowerBand ? basicLower : lowerBand;
      upperBand = basicUpper < upperBand || prevClose > upperBand ? basicUpper : upperBand;
      if (direction === 1 && c.close < lowerBand) direction = -1;
      else if (direction === -1 && c.close > upperBand) direction = 1;
    }
    dirValues[i] = direction;
  }
  return dirValues;
}

function weekStart(timestamp) {
  const d = new Date(timestamp);
  const fromMonday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - fromMonday);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

function aggregateWeeks(daily) {
  const weeks = [];
  for (const c of daily) {
    const ts = weekStart(c.timestamp);
    const cur = weeks.at(-1);
    if (!cur || cur.timestamp !== ts) weeks.push({ ...c, timestamp: ts });
    else {
      cur.high = Math.max(cur.high, c.high);
      cur.low = Math.min(cur.low, c.low);
      cur.close = c.close;
      cur.volume += c.volume;
    }
  }
  return weeks;
}

const BULLISH = new Set(['Bullish', 'Strong Bullish']);
const BEARISH = new Set(['Bearish', 'Strong Bearish']);

// ---------- feature extraction ----------

const FEATURE_NAMES = [
  'score', 'strongTier', 'scoreDelta', 'rsi14', 'rvol', 'atrPercent',
  'emaAlign', 'macdScore', 'rsiScore', 'rvolScore',
  'distEma20', 'distEma200', 'ret30', 'ddFromHigh90',
  'weeklyBull', 'btcWeeklyBull', 'flipsLast90'
];

function buildEvents(symbol, candles, signals, btcRegimeByWeek) {
  const weeks = aggregateWeeks(candles);
  const weeklyDir = supertrendDir(weeks, 10, 3.5);
  const events = [];
  const flipIndexes = [];

  for (let i = 201; i < candles.length - HORIZON_DAYS - 2; i++) {
    const sig = signals[i];
    const prev = signals[i - 1];
    if (!sig || !prev) continue;
    if (!BULLISH.has(sig.tier) || BULLISH.has(prev.tier)) continue;

    const flipTime = candles[i].timestamp;
    const wkTs = weekStart(flipTime);
    const wkIdx = weeks.findIndex(w => w.timestamp === wkTs);
    const weeklyBull = wkIdx >= 0 && weeklyDir[wkIdx] === 1 ? 1 : 0;
    const btcWeeklyBull = btcRegimeByWeek.get(wkTs) ?? 0;

    const raw = sig.rawIndicators;
    const contrib = sig.contributions;
    const close = candles[i].close;
    const high90 = Math.max(...candles.slice(Math.max(0, i - 90), i + 1).map(c => c.high));
    const recentFlips = flipIndexes.filter(j => i - j <= 90).length;
    flipIndexes.push(i);

    // ---- labels from next open ----
    const entryIdx = i + 1;
    const entry = candles[entryIdx].open;
    let mfe = 0, mae = 0, pump = 0, firstBarrier = 'none';
    for (let j = entryIdx; j <= Math.min(i + HORIZON_DAYS, candles.length - 1); j++) {
      const up = (candles[j].high - entry) / entry;
      const dn = (candles[j].low - entry) / entry;
      mfe = Math.max(mfe, up);
      mae = Math.min(mae, dn);
      if (up >= PUMP_BARRIER && dn <= -DUMP_BARRIER) { firstBarrier = 'both-same-day'; pump = 0; break; }
      if (up >= PUMP_BARRIER) { firstBarrier = 'up'; pump = 1; break; }
      if (dn <= -DUMP_BARRIER) { firstBarrier = 'down'; pump = 0; break; }
    }
    const horizonEnd = Math.min(i + HORIZON_DAYS, candles.length - 1);
    const retAtH = (candles[horizonEnd].close - entry) / entry;

    events.push({
      symbol, flipIndex: i, flipTime,
      features: {
        score: sig.score,
        strongTier: sig.tier === 'Strong Bullish' ? 1 : 0,
        scoreDelta: sig.score - prev.score,
        rsi14: raw.rsi14,
        rvol: raw.rvol,
        atrPercent: raw.atrPercent,
        emaAlign: contrib.emaAlignmentScore,
        macdScore: contrib.macdScore,
        rsiScore: contrib.rsiScore,
        rvolScore: contrib.rvolScore,
        distEma20: (close - raw.ema20) / close,
        distEma200: raw.ema200 > 0 ? (close - raw.ema200) / raw.ema200 : 0,
        ret30: i >= 30 ? close / candles[i - 30].close - 1 : 0,
        ddFromHigh90: high90 > 0 ? close / high90 - 1 : 0,
        weeklyBull, btcWeeklyBull,
        flipsLast90: recentFlips
      },
      pump, mfe, mae, retAtH,
      regimeBtcBull: btcWeeklyBull === 1
    });
  }
  return { events, signals, weeks, weeklyDir };
}

// ---------- logistic regression ----------

function standardizeFit(rows) {
  const means = {}, sds = {};
  for (const name of FEATURE_NAMES) {
    const vals = rows.map(r => r.features[name]);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length) || 1;
    means[name] = mean; sds[name] = sd;
  }
  return { means, sds };
}

const z = (row, scaler, name) => (row.features[name] - scaler.means[name]) / scaler.sds[name];

function trainLogreg(rows, scaler, lambda = 1, iters = 3000, lr = 0.2) {
  const w = {}; for (const n of FEATURE_NAMES) w[n] = 0;
  let b = 0;
  const n = rows.length;
  for (let it = 0; it < iters; it++) {
    const gw = {}; for (const nm of FEATURE_NAMES) gw[nm] = 0;
    let gb = 0;
    for (const r of rows) {
      let logit = b;
      for (const nm of FEATURE_NAMES) logit += w[nm] * z(r, scaler, nm);
      const p = 1 / (1 + Math.exp(-logit));
      const err = p - r.pump;
      gb += err;
      for (const nm of FEATURE_NAMES) gw[nm] += err * z(r, scaler, nm);
    }
    b -= lr * (gb / n);
    for (const nm of FEATURE_NAMES) w[nm] -= lr * (gw[nm] / n + lambda * w[nm] / n);
  }
  return { w, b };
}

const rawLogit = (model, scaler, row) => {
  let logit = model.b;
  for (const nm of FEATURE_NAMES) logit += model.w[nm] * z(row, scaler, nm);
  return logit;
};
const sigmoid = x => 1 / (1 + Math.exp(-x));

function plattFit(rows, logits) {
  // 1D Newton on (A, B): p = sigmoid(A*logit + B)
  let A = 1, B = 0;
  for (let it = 0; it < 200; it++) {
    let gA = 0, gB = 0, hAA = 1e-6, hAB = 0, hBB = 1e-6;
    for (let k = 0; k < rows.length; k++) {
      const f = logits[k];
      const p = sigmoid(A * f + B);
      const err = p - rows[k].pump;
      gA += err * f; gB += err;
      const q = Math.max(p * (1 - p), 1e-9);
      hAA += q * f * f; hAB += q * f; hBB += q;
    }
    const det = hAA * hBB - hAB * hAB;
    const dA = (hBB * gA - hAB * gB) / det;
    const dB = (hAA * gB - hAB * gA) / det;
    A -= dA; B -= dB;
    if (Math.abs(dA) < 1e-8 && Math.abs(dB) < 1e-8) break;
  }
  return { A, B };
}

// ---------- trade simulation ----------

function simulateTrade(asset, flipIndex, candles, signals, atr14) {
  const entryIdx = flipIndex + 1;
  if (entryIdx >= candles.length) return null;
  const entry = candles[entryIdx].open * (1 + COST_PER_SIDE);
  const stop0 = entry - ATR_STOP_MULT * atr14[flipIndex];
  const risk = entry - stop0;
  if (risk <= 0) return null;

  let stop = stop0, scaled = false, lockedR = 0;
  const lastIdx = Math.min(flipIndex + MAX_HOLD_DAYS, candles.length - 1);
  for (let j = entryIdx; j <= lastIdx; j++) {
    const c = candles[j];
    const highR = (c.high - entry) / risk;
    if (!scaled && highR >= 2) { scaled = true; lockedR = 1.0; stop = Math.max(stop, entry * 1.001); }
    if (c.low <= stop) {
      const r = ((stop - entry) / entry) / (risk / entry) * (scaled ? 0.5 : 1) + lockedR - (COST_PER_SIDE * 100 / (risk / entry)) / 100;
      return { r: round(((stop - entry) / risk) * (scaled ? 0.5 : 1) + lockedR - (risk / entry) * 0, 2), exit: 'stop', days: j - entryIdx };
    }
    if (highR >= 3.5 && scaled) {
      return { r: round(lockedR + 0.5 * 3.5, 2), exit: 'tp-cap', days: j - entryIdx };
    }
    const sig = signals[j];
    if (sig && BEARISH.has(sig.tier)) {
      const exitR = (c.close - entry) / risk;
      return { r: round(lockedR + (scaled ? 0.5 : 1) * exitR, 2), exit: 'bear-flip', days: j - entryIdx };
    }
  }
  const c = candles[lastIdx];
  const exitR = (c.close - entry) / risk;
  return { r: round(lockedR + (scaled ? 0.5 : 1) * exitR, 2), exit: 'timeout', days: lastIdx - entryIdx };
}

function cohortStats(trades) {
  if (!trades.length) return { trades: 0 };
  const rs = trades.map(t => t.r);
  const wins = rs.filter(r => r > 0);
  const losses = rs.filter(r => r <= 0);
  const grossWin = wins.reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));
  let peak = 0, cum = 0, maxDd = 0;
  for (const r of rs) { cum += r; peak = Math.max(peak, cum); maxDd = Math.max(maxDd, peak - cum); }
  return {
    trades: rs.length,
    winRate: round((wins.length / rs.length) * 100, 1),
    expectancyR: round(rs.reduce((a, b) => a + b, 0) / rs.length, 3),
    profitFactor: grossLoss > 0 ? round(grossWin / grossLoss, 2) : null,
    totalR: round(rs.reduce((a, b) => a + b, 0), 1),
    maxDrawdownR: round(maxDd, 1)
  };
}

function precisionAtK(events, k) {
  const byDay = new Map();
  for (const e of events) {
    const day = new Date(e.flipTime).toISOString().slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(e);
  }
  let hits = 0, total = 0;
  for (const list of byDay.values()) {
    list.sort((a, b) => b.prob - a.prob);
    for (const e of list.slice(0, k)) { total++; if (e.pump) hits++; }
  }
  return total > 0 ? round((hits / total) * 100, 1) : null;
}

// ---------- main ----------

async function run() {
  console.log('Loading daily candles for', CRYPTO_SYMBOLS.length, 'crypto assets...');
  const engine = new MoneyLineEngine();
  const datasets = new Map();

  // BTC regime first
  const btcCandles = await fetchBinanceDaily('BTC');
  btcCandles[btcCandles.length - 1].isClosed = false;
  const btcWeeks = aggregateWeeks(btcCandles.filter(c => c.isClosed !== false));
  const btcWeeklyDir = supertrendDir(btcWeeks, 10, 3.5);
  const btcRegimeByWeek = new Map();
  btcWeeks.forEach((w, idx) => {
    if (idx > 0) btcRegimeByWeek.set(w.timestamp, btcWeeklyDir[idx - 1] === 1 ? 1 : 0);
  });
  datasets.set('BTC', { candles: btcCandles });

  for (const sym of CRYPTO_SYMBOLS) {
    if (sym === 'BTC') continue;
    try {
      const candles = await fetchBinanceDaily(sym);
      if (candles.length < 500) { console.log(`  skip ${sym} (short history)`); continue; }
      candles[candles.length - 1].isClosed = false;
      datasets.set(sym, { candles });
      process.stdout.write(`${sym} `);
    } catch (err) { console.log(`\n  skip ${sym}: ${err.message}`); }
  }
  console.log('\nComputing Money Line series and flip events...');

  const allEvents = [];
  const perAsset = new Map();
  for (const [sym, { candles }] of datasets) {
    const closed = candles.filter(c => c.isClosed !== false);
    const signals = engine.calculateSeries(sym, '1d', closed);
    const atr14 = atr(closed, 14);
    const { events } = buildEvents(sym, closed, signals, btcRegimeByWeek);
    perAsset.set(sym, { candles: closed, signals, atr14 });
    allEvents.push(...events);
  }
  allEvents.sort((a, b) => a.flipTime - b.flipTime);

  const baseRate = allEvents.length
    ? round((allEvents.filter(e => e.pump).length / allEvents.length) * 100, 1) : 0;
  console.log(`\nTotal flip events: ${allEvents.length} | overall pump base rate: ${baseRate}%`);

  // chronological split
  const n = allEvents.length;
  const train = allEvents.slice(0, Math.floor(n * 0.6));
  const val = allEvents.slice(Math.floor(n * 0.6), Math.floor(n * 0.8));
  const test = allEvents.slice(Math.floor(n * 0.8));
  const rate = rows => rows.length ? round(rows.filter(r => r.pump).length / rows.length * 100, 1) : 0;
  console.log(`Split: train ${train.length} (base ${rate(train)}%) | val ${val.length} (base ${rate(val)}%) | test ${test.length} (base ${rate(test)}%)`);
  console.log(`Train window: ${new Date(train[0].flipTime).toISOString().slice(0, 10)} .. ${new Date(train.at(-1).flipTime).toISOString().slice(0, 10)}`);
  console.log(`Test window:  ${new Date(test[0].flipTime).toISOString().slice(0, 10)} .. ${new Date(test.at(-1).flipTime).toISOString().slice(0, 10)}`);

  const scaler = standardizeFit(train);
  const model = trainLogreg(train, scaler);

  console.log('\nFeature weights (standardized, L2):');
  const sorted = FEATURE_NAMES.map(nm => [nm, model.w[nm]]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  for (const [nm, w] of sorted) console.log(`  ${nm.padEnd(14)} ${round(w, 3)}`);

  // Platt recalibration on validation
  const valLogits = val.map(r => rawLogit(model, scaler, r));
  const platt = plattFit(val, valLogits);
  const prob = row => sigmoid(platt.A * rawLogit(model, scaler, row) + platt.B);
  for (const r of allEvents) r.prob = prob(r);

  // calibration table on test (deciles)
  console.log('\nCalibration on TEST (deciles by predicted probability):');
  const buckets = Array.from({ length: 5 }, () => ({ n: 0, sumP: 0, hits: 0 }));
  for (const r of test) {
    const b = Math.min(4, Math.floor(r.prob * 5));
    buckets[b].n++; buckets[b].sumP += r.prob; buckets[b].hits += r.pump;
  }
  buckets.forEach((b, i) => {
    if (!b.n) return;
    console.log(`  p ${(i * 0.2).toFixed(1)}-${((i + 1) * 0.2).toFixed(1)}: n=${b.n} meanPred=${round(b.sumP / b.n * 100, 1)}% observed=${round(b.hits / b.n * 100, 1)}%`);
  });

  // threshold selection on validation via trade expectancy
  const candidates = [0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50];
  console.log('\nThreshold scan on VALIDATION (trade sim):');
  let bestT = 0.30, bestExp = -Infinity;
  for (const t of candidates) {
    const trades = [];
    for (const e of val) {
      if (e.prob < t) continue;
      const a = perAsset.get(e.symbol);
      const tr = simulateTrade(e.symbol, e.flipIndex, a.candles, a.signals, a.atr14);
      if (tr) trades.push(tr);
    }
    const s = cohortStats(trades);
    console.log(`  t=${t.toFixed(2)}: trades=${s.trades} exp=${s.expectancyR ?? '-'}R PF=${s.profitFactor ?? '-'}`);
    if (s.trades >= 8 && s.expectancyR > bestExp) { bestExp = s.expectancyR; bestT = t; }
  }
  console.log(`Frozen threshold: ${bestT}`);

  // final test evaluation
  const evalSplit = (rows, label) => {
    const allT = [], filtT = [];
    for (const e of rows) {
      const a = perAsset.get(e.symbol);
      const tr = simulateTrade(e.symbol, e.flipIndex, a.candles, a.signals, a.atr14);
      if (!tr) continue;
      allT.push(tr);
      if (e.prob >= bestT) filtT.push(tr);
    }
    const base = cohortStats(allT);
    const filt = cohortStats(filtT);
    console.log(`\n=== ${label} ===`);
    console.log(`All flips (baseline):        trades=${base.trades} WR=${base.winRate}% exp=${base.expectancyR}R PF=${base.profitFactor} total=${base.totalR}R maxDD=${base.maxDrawdownR}R`);
    console.log(`P(pump) >= ${bestT}:            trades=${filt.trades} WR=${filt.winRate}% exp=${filt.expectancyR}R PF=${filt.profitFactor} total=${filt.totalR}R maxDD=${filt.maxDrawdownR}R`);
    const subset = rows.filter(e => e.prob >= bestT);
    const baseR = rate(rows), subR = rate(subset);
    console.log(`Pump rate: baseline ${baseR}% -> filtered ${subR}% (n=${subset.length})  lift=${baseR > 0 ? round(subR / baseR, 2) : '-'}x`);
    console.log(`precision@1=${precisionAtK(rows, 1)}%  precision@3=${precisionAtK(rows, 3)}%  precision@5=${precisionAtK(rows, 5)}%`);
    const bull = rows.filter(e => e.regimeBtcBull), bear = rows.filter(e => !e.regimeBtcBull);
    console.log(`Regime: BTC-weekly-bull flips ${bull.length} (pump ${rate(bull)}%) | BTC-weekly-bear flips ${bear.length} (pump ${rate(bear)}%)`);
    return { base, filt, baseR, subR };
  };

  evalSplit(val, 'VALIDATION (in-sample-ish, used for threshold)');
  evalSplit(test, 'TEST (chronological holdout)');

  // feature signal check: single-feature base rates on all events
  console.log('\nSingle-factor pump rates (all events):');
  const checks = [
    ['Strong Bullish flip', e => e.features.strongTier === 1],
    ['RVOL >= 2', e => e.features.rvol >= 2],
    ['RVOL < 1', e => e.features.rvol < 1],
    ['weekly bull', e => e.features.weeklyBull === 1],
    ['BTC weekly bull', e => e.features.btcWeeklyBull === 1],
    ['close > EMA200', e => e.features.distEma200 > 0],
    ['RSI < 70', e => e.features.rsi14 < 70],
    ['fresh flip (none in 90d)', e => e.features.flipsLast90 === 0]
  ];
  for (const [label, f] of checks) {
    const sub = allEvents.filter(f);
    console.log(`  ${label.padEnd(28)} n=${String(sub.length).padStart(4)}  pump=${rate(sub)}%`);
  }
}

run().catch(err => { console.error(err); process.exit(1); });
