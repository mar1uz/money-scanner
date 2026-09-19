// trend-ranking-core.mjs
// Shared, importable core for the daily SMA-gated top-5 research ranking.
// Pure computation + fetch helpers - no fs, no side effects on import.
// EVIDENCE STATUS: UNVALIDATED research prototype (see
// docs/backtests/2026-09-19-sma-trend-ranking.md). Validated track remains
// scripts/paper-trade-rvol2.mjs (RVOL>=2 forward log).

import { atr, sma } from './backtest-tight-risk-breakout.mjs';
import { detectFlips, round, COST_PER_SIDE } from './paper-trade-logger.mjs';

export const CRYPTO_SYMBOLS = [
  'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'AVAX', 'LINK',
  'SUI', 'NEAR', 'APT', 'DOT', 'LTC', 'BCH', 'SHIB', 'PEPE', 'UNI',
  'ATOM', 'FIL', 'ARB', 'OP', 'TIA', 'RENDER', 'INJ'
];
export const HORIZON = 21, UP = 0.20, DOWN = 0.10;
export const SETUP_MAX_AGE_DAYS = 3;
export const DAY_MS = 86_400_000;
export { COST_PER_SIDE, round };

export const FEATURE_NAMES = [
  'score', 'strongTier', 'rvol', 'volAccel', 'rsi14', 'atrPercent',
  'distSma50', 'distSma200', 'smaGolden', 'sma50Slope', 'sma200Slope',
  'ret7', 'ret30', 'ddFromHigh90', 'logLiq', 'funding24h', 'fundingPct90'
];

export async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchBinanceDaily(symbol, limit = 0) {
  let output = [], endTime;
  const target = limit || 3000;
  while (output.length < target) {
    const suffix = endTime ? `&endTime=${endTime}` : '';
    const rows = await fetchJson(`https://data-api.binance.vision/api/v3/klines?symbol=${symbol}USDT&interval=1d&limit=${Math.min(1000, target)}${suffix}`);
    if (!rows.length) break;
    output = rows.map(r => ({
      timestamp: Number(r[0]), open: Number(r[1]), high: Number(r[2]),
      low: Number(r[3]), close: Number(r[4]), volume: Number(r[5]),
      quoteVolume: Number(r[7]), isClosed: true
    })).concat(output);
    endTime = rows[0][0] - 1;
    if (rows.length < 1000 || limit) break;
  }
  return output;
}

export function fundingAt(funding, t) {
  let funding24h = 0, fundingPct90 = 0;
  if (!funding.length) return { funding24h, fundingPct90 };
  let idx = -1, lo = 0, hi = funding.length - 1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (funding[m].t <= t) { idx = m; lo = m + 1; } else hi = m - 1; }
  if (idx >= 2) {
    funding24h = (funding[idx].rate + funding[idx - 1].rate + funding[idx - 2].rate) / 3;
    const trail = funding.filter(f => f.t <= t && f.t > t - 90 * DAY_MS).map(f => f.rate);
    if (trail.length > 20) fundingPct90 = trail.filter(f => f <= funding24h).length / trail.length;
  }
  return { funding24h, fundingPct90 };
}

export async function fetchFunding(symbol) {
  try {
    const fr = await fetch(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${symbol}USDT&limit=1000`);
    if (!fr.ok) return [];
    return (await fr.json()).map(r => ({ t: Number(r.fundingTime), rate: Number(r.fundingRate) }));
  } catch { return []; }
}

export function extractEvent(symbol, candles, signals, atr14, flip, funding) {
  const i = flip.flipIndex;
  const closes = candles.map(c => c.close);
  const sma50 = sma(closes, 50), sma200 = sma(closes, 200);
  const volMa5 = sma(candles.map(c => c.volume), 5);
  const close = candles[i].close;
  if (i < 200 || !(close > sma50[i] && close > sma200[i])) return null;
  const raw = signals[i].rawIndicators;
  const high90 = Math.max(...candles.slice(Math.max(0, i - 90), i + 1).map(c => c.high));
  const quote20 = candles.slice(Math.max(0, i - 20), i + 1).map(c => c.quoteVolume).sort((a, b) => a - b);
  const f = fundingAt(funding, flip.flipTime);
  return {
    symbol, flipIndex: i, flipTime: flip.flipTime, flipDate: new Date(flip.flipTime).toISOString().slice(0, 10),
    close, atr14: atr14[i], sma50: sma50[i], sma200: sma200[i],
    features: {
      score: flip.score, strongTier: flip.tier === 'Strong Bullish' ? 1 : 0,
      rvol: raw.rvol,
      volAccel: volMa5[i - 5] > 0 ? volMa5[i] / volMa5[i - 5] - 1 : 0,
      rsi14: raw.rsi14, atrPercent: raw.atrPercent,
      distSma50: (close - sma50[i]) / sma50[i],
      distSma200: (close - sma200[i]) / sma200[i],
      smaGolden: sma50[i] > sma200[i] ? 1 : 0,
      sma50Slope: sma50[i - 10] > 0 ? sma50[i] / sma50[i - 10] - 1 : 0,
      sma200Slope: sma200[i - 20] > 0 ? sma200[i] / sma200[i - 20] - 1 : 0,
      ret7: close / closes[i - 7] - 1, ret30: close / closes[i - 30] - 1,
      ddFromHigh90: close / high90 - 1,
      logLiq: Math.log10(Math.max(quote20[Math.floor(quote20.length / 2)], 1)),
      funding24h: f.funding24h, fundingPct90: f.fundingPct90
    }
  };
}

export function labelEvent(e, candles) {
  const entry = candles[e.flipIndex + 1].open;
  let pump = 0;
  for (let j = e.flipIndex + 1; j <= Math.min(e.flipIndex + HORIZON, candles.length - 1); j++) {
    const up = (candles[j].high - entry) / entry, dn = (candles[j].low - entry) / entry;
    if (up >= UP) { pump = 1; break; }
    if (dn <= -DOWN) { pump = 0; break; }
  }
  return pump;
}

export function trainModel(rows) {
  const means = {}, sds = {};
  for (const nm of FEATURE_NAMES) {
    const vals = rows.map(r => r.features[nm]);
    means[nm] = vals.reduce((a, b) => a + b, 0) / vals.length;
    sds[nm] = Math.sqrt(vals.reduce((a, b) => a + (b - means[nm]) ** 2, 0) / vals.length) || 1;
  }
  const z = (r, nm) => (r.features[nm] - means[nm]) / sds[nm];
  const w = {}; for (const nm of FEATURE_NAMES) w[nm] = 0;
  let b = 0;
  for (let it = 0; it < 2500; it++) {
    const gw = {}; for (const nm of FEATURE_NAMES) gw[nm] = 0;
    let gb = 0;
    for (const r of rows) {
      let logit = b; for (const nm of FEATURE_NAMES) logit += w[nm] * z(r, nm);
      const err = 1 / (1 + Math.exp(-logit)) - r.pump;
      gb += err; for (const nm of FEATURE_NAMES) gw[nm] += err * z(r, nm);
    }
    b -= 0.2 * gb / rows.length;
    for (const nm of FEATURE_NAMES) w[nm] -= 0.2 * (gw[nm] / rows.length + w[nm] / rows.length);
  }
  const rawLogit = r => {
    let logit = b; for (const nm of FEATURE_NAMES) logit += w[nm] * z(r, nm);
    return logit;
  };
  const tail = rows.slice(Math.floor(rows.length * 0.75));
  const logits = tail.map(rawLogit);
  let A = 1, B = 0;
  for (let it = 0; it < 200; it++) {
    let gA = 0, gB = 0, hAA = 1e-6, hAB = 0, hBB = 1e-6;
    for (let k = 0; k < tail.length; k++) {
      const p = 1 / (1 + Math.exp(-(A * logits[k] + B)));
      const err = p - tail[k].pump;
      gA += err * logits[k]; gB += err;
      const q = Math.max(p * (1 - p), 1e-9);
      hAA += q * logits[k] ** 2; hAB += q * logits[k]; hBB += q;
    }
    const det = hAA * hBB - hAB * hAB;
    const dA = (hBB * gA - hAB * gB) / det, dB = (hAA * gB - hAB * gA) / det;
    A -= dA; B -= dB;
    if (Math.abs(dA) < 1e-8 && Math.abs(dB) < 1e-8) break;
  }
  return r => 1 / (1 + Math.exp(-(A * rawLogit(r) + B)));
}

/**
 * One full scan of the universe. Returns matured labeled events, current
 * setups (flips <= SETUP_MAX_AGE_DAYS old), last closed candle time, errors.
 */
export async function scanAll(engine, { onSymbol } = {}) {
  const maturedEvents = [], currentSetups = [], errors = [];
  const perAsset = new Map();
  let lastClosed = 0;
  for (const sym of CRYPTO_SYMBOLS) {
    try {
      const candles = await fetchBinanceDaily(sym);
      if (candles.length < 500) continue;
      candles[candles.length - 1].isClosed = false;
      const closed = candles.filter(c => c.isClosed !== false);
      lastClosed = Math.max(lastClosed, closed.at(-1).timestamp);
      const signals = engine.calculateSeries(sym, '1d', closed);
      const atr14 = atr(closed, 14);
      const funding = await fetchFunding(sym);
      perAsset.set(sym, { candles: closed, signals, atr14 });
      const flips = detectFlips(closed, signals, atr14);
      for (const flip of flips) {
        const e = extractEvent(sym, closed, signals, atr14, flip, funding);
        if (!e) continue;
        const ageDays = (closed.at(-1).timestamp - flip.flipTime) / DAY_MS;
        if (flip.flipIndex + HORIZON + 1 < closed.length) {
          e.pump = labelEvent(e, closed);
          maturedEvents.push(e);
        } else if (ageDays <= SETUP_MAX_AGE_DAYS) {
          currentSetups.push(e);
        }
      }
      if (onSymbol) onSymbol(sym);
    } catch (err) { errors.push(`${sym}: ${err.message}`); }
  }
  return { maturedEvents, currentSetups, perAsset, lastClosed, errors };
}

/**
 * Train on matured events and rank current setups by calibrated probability.
 * Returns ranked array with probability + trade parameters, best first.
 */
export function rankSetups(maturedEvents, currentSetups) {
  if (maturedEvents.length <= 400 || !currentSetups.length) return [];
  const sorted = [...maturedEvents].sort((a, b) => a.flipTime - b.flipTime);
  const prob = trainModel(sorted);
  const ranked = currentSetups.map(e => {
    const entry = e.close;
    const stop = entry - 1.25 * e.atr14;
    return {
      symbol: e.symbol, flipDate: e.flipDate, flipTime: e.flipTime,
      probability: round(prob(e), 3),
      score: e.features.score, rvol: round(e.features.rvol, 2),
      atrPercent: round(e.features.atrPercent, 1),
      sma50: e.sma50, atr14: e.atr14,
      hypotheticalEntry: round(entry, 8),
      stop: round(stop, 8),
      riskPct: round((entry - stop) / entry * 100, 2)
    };
  });
  ranked.sort((a, b) => b.probability - a.probability);
  return ranked;
}
