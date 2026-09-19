// preflip-core.mjs
// Pure core for pre-flip candidate research (Marius's refined concept).
// A bullish CANDIDATE state mirrors the production scanner semantics:
// slow Money Line cloud still bearish (dirSlow === 1) and price approaching
// the slow-line flip trigger from below (distance <= CANDIDATE_ZONE_ATR).
// Stage 1: does the cloud buy flip confirm within CONFIRM_HORIZON_DAYS?
// Stage 2: given confirmation, does +20% arrive before -10% within 21d
//          (entry next open, same convention as the validated pipeline)?
// Feature cutoffs: everything uses data <= candidate day only.

import { atr, sma } from './backtest-tight-risk-breakout.mjs';
import { round } from './paper-trade-logger.mjs';

export const CONFIRM_HORIZON_DAYS = 14;
export const PROFIT_UP = 0.20, PROFIT_DOWN = 0.10, PROFIT_HORIZON_DAYS = 21;
export const CANDIDATE_ZONE_ATR = 1.0;
export const DAY_MS = 86_400_000;

// Grounded L1-token -> DefiLlama chain mapping (chain TVL history is public).
export const CHAIN_TVL_MAP = {
  ETH: 'Ethereum', SOL: 'Solana', BNB: 'BSC', AVAX: 'Avalanche',
  NEAR: 'Near', APT: 'Aptos', DOT: 'Polkadot', ATOM: 'Cosmos',
  ARB: 'Arbitrum', OP: 'Optimism', INJ: 'Injective', SUI: 'Sui',
  FIL: 'Filecoin', TIA: 'Celestia'
};

/**
 * Detect candidate EPISODE STARTS on closed candles.
 * cloud = calculateMoneyLineCloud output; atr14 = Wilder ATR series.
 * Returns [{index, flipTime(trigger time), distAtr, distPct, baseDays}].
 */
export function detectCandidateEpisodes(candles, cloud, atr14, zoneAtr = CANDIDATE_ZONE_ATR) {
  const out = [];
  let inZone = false;
  let baseDays = 0;
  for (let i = 1; i < candles.length; i++) {
    if (cloud.dirSlow[i] === 1) baseDays++; else baseDays = 0;
    const line = cloud.lineSlow[i];
    const a = atr14[i];
    if (cloud.dirSlow[i] !== 1 || !Number.isFinite(line) || !Number.isFinite(a) || a <= 0) { inZone = false; continue; }
    const dist = line - candles[i].close;
    if (dist <= 0) { inZone = false; continue; } // already above trigger
    const distAtr = dist / a;
    if (distAtr <= zoneAtr) {
      if (!inZone) {
        out.push({
          index: i, candidateTime: candles[i].timestamp,
          distAtr, distPct: (dist / candles[i].close) * 100,
          baseDays, triggerPrice: line
        });
      }
      inZone = true;
    } else inZone = false;
  }
  return out;
}

/** Stage 1: first cloud buy flip within horizon after candidate day. */
export function stage1Outcome(cand, cloud, horizonDays = CONFIRM_HORIZON_DAYS) {
  const last = Math.min(cand.index + horizonDays, cloud.buySignals.length - 1);
  for (let j = cand.index + 1; j <= last; j++) {
    if (cloud.buySignals[j]) return { confirmed: 1, confirmIndex: j, daysToConfirm: j - cand.index };
  }
  return { confirmed: 0, confirmIndex: -1, daysToConfirm: -1 };
}

/** Stage 2: +UP before -DOWN within profit horizon, entry at next open. */
export function stage2Outcome(confirmIndex, candles, up = PROFIT_UP, down = PROFIT_DOWN, horizon = PROFIT_HORIZON_DAYS) {
  const entryIdx = confirmIndex + 1;
  if (entryIdx >= candles.length) return null;
  const entry = candles[entryIdx].open;
  let mfe = 0, mae = 0;
  for (let j = entryIdx; j <= Math.min(confirmIndex + horizon, candles.length - 1); j++) {
    const u = (candles[j].high - entry) / entry, d = (candles[j].low - entry) / entry;
    mfe = Math.max(mfe, u); mae = Math.min(mae, d);
    if (u >= up) return { profit: 1, mfe, mae, entry };
    if (d <= -down) return { profit: 0, mfe, mae, entry };
  }
  return { profit: 0, mfe, mae, entry };
}

export const PREFLIP_FEATURES = [
  'distAtr', 'distPct', 'baseDays', 'mlScore', 'mlScoreDelta5',
  'rvol', 'volAccel', 'rsi14', 'atrPercent', 'atrPctRank1y',
  'distSma50', 'distSma200', 'smaGolden', 'sma50Slope',
  'ret7', 'ret30', 'ddFromHigh90', 'logLiq',
  'funding24h', 'fundingPct90', 'tvlChg30', 'hasTvl', 'btcWeeklyBull'
];

/**
 * Feature vector at candidate day i. STRICT CUTOFF: only data <= i.
 * tvlSeries: [{t: ms, tvl}] or null. btcRegimeByWeek: Map(weekStartMs -> 1/0).
 */
export function candidateFeatures(symbol, candles, signals, atr14, cloud, cand, funding, tvlSeries, btcRegimeByWeek) {
  const i = cand.index;
  const closes = candles.map(c => c.close);
  const sma50 = sma(closes, 50), sma200 = sma(closes, 200);
  const volMa5 = sma(candles.map(c => c.volume), 5);
  const close = candles[i].close;
  const raw = signals[i]?.rawIndicators || {};
  const scoreNow = signals[i]?.score ?? 0;
  const score5 = i >= 5 ? (signals[i - 5]?.score ?? scoreNow) : scoreNow;

  let funding24h = 0, fundingPct90 = 0;
  if (funding && funding.length) {
    let idx = -1, lo = 0, hi = funding.length - 1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (funding[m].t <= cand.candidateTime) { idx = m; lo = m + 1; } else hi = m - 1; }
    if (idx >= 2) {
      funding24h = (funding[idx].rate + funding[idx - 1].rate + funding[idx - 2].rate) / 3;
      const trail = funding.filter(f => f.t <= cand.candidateTime && f.t > cand.candidateTime - 90 * DAY_MS).map(f => f.rate);
      if (trail.length > 20) fundingPct90 = trail.filter(f => f <= funding24h).length / trail.length;
    }
  }

  let tvlChg30 = 0, hasTvl = 0;
  if (tvlSeries && tvlSeries.length > 30) {
    let idx = -1, lo = 0, hi = tvlSeries.length - 1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (tvlSeries[m].t <= cand.candidateTime) { idx = m; lo = m + 1; } else hi = m - 1; }
    if (idx >= 30 && tvlSeries[idx - 30].tvl > 0) {
      tvlChg30 = tvlSeries[idx].tvl / tvlSeries[idx - 30].tvl - 1;
      hasTvl = 1;
    }
  }

  const high90 = Math.max(...candles.slice(Math.max(0, i - 90), i + 1).map(c => c.high));
  const quote20 = candles.slice(Math.max(0, i - 20), i + 1).map(c => c.quoteVolume).sort((a, b) => a - b);
  // ATR% rank vs trailing year (compression measure)
  const atrPctSeries = [];
  for (let j = Math.max(14, i - 365); j <= i; j++) {
    if (Number.isFinite(atr14[j]) && closes[j] > 0) atrPctSeries.push((atr14[j] / closes[j]) * 100);
  }
  const atrNow = atrPctSeries.at(-1) ?? 0;
  const atrPctRank1y = atrPctSeries.length > 30 ? atrPctSeries.filter(v => v <= atrNow).length / atrPctSeries.length : 0.5;

  const wkStart = (() => { const d = new Date(cand.candidateTime); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); d.setUTCHours(0, 0, 0, 0); return d.getTime(); })();

  return {
    symbol, index: i, candidateTime: cand.candidateTime,
    candidateDate: new Date(cand.candidateTime).toISOString().slice(0, 10),
    triggerPrice: cand.triggerPrice, close,
    features: {
      distAtr: cand.distAtr, distPct: cand.distPct, baseDays: cand.baseDays,
      mlScore: scoreNow, mlScoreDelta5: scoreNow - score5,
      rvol: raw.rvol ?? 1, volAccel: volMa5[i - 5] > 0 ? volMa5[i] / volMa5[i - 5] - 1 : 0,
      rsi14: raw.rsi14 ?? 50, atrPercent: raw.atrPercent ?? atrNow,
      atrPctRank1y,
      distSma50: Number.isFinite(sma50[i]) ? (close - sma50[i]) / sma50[i] : 0,
      distSma200: Number.isFinite(sma200[i]) ? (close - sma200[i]) / sma200[i] : 0,
      smaGolden: sma50[i] > sma200[i] ? 1 : 0,
      sma50Slope: sma50[i - 10] > 0 ? sma50[i] / sma50[i - 10] - 1 : 0,
      ret7: i >= 7 ? close / closes[i - 7] - 1 : 0,
      ret30: i >= 30 ? close / closes[i - 30] - 1 : 0,
      ddFromHigh90: close / high90 - 1,
      logLiq: Math.log10(Math.max(quote20[Math.floor(quote20.length / 2)], 1)),
      funding24h, fundingPct90, tvlChg30, hasTvl,
      btcWeeklyBull: btcRegimeByWeek?.get(wkStart) ?? 0
    }
  };
}

/** Shared logistic regression (same recipe as earlier rounds). */
export function trainLogreg(rows, names, yFn, lambda = 1, iters = 2500, lr = 0.2) {
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
      const err = 1 / (1 + Math.exp(-logit)) - yFn(r);
      gb += err; for (const nm of names) gw[nm] += err * z(r, nm);
    }
    b -= lr * gb / rows.length;
    for (const nm of names) w[nm] -= lr * (gw[nm] / rows.length + lambda * w[nm] / rows.length);
  }
  const rawLogit = r => {
    let logit = b; for (const nm of names) logit += w[nm] * z(r, nm);
    return logit;
  };
  return { rawLogit, prob: r => 1 / (1 + Math.exp(-rawLogit(r))), w };
}
