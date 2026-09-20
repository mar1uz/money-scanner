/**
 * ATH-potential layer - pure scoring for JEV Insight cohorts.
 *
 * Marius's calibration: an SMA50/200 reclaim on a multi-year bearish legacy
 * project is usually a counter-trend rally, not a path to a new all-time high.
 * This layer scores each asset's structural potential to revisit/exceed ATH
 * and penalizes stale legacy setups. All weights are explicit and exported;
 * missing data scores neutral-low and is flagged - never a hidden bonus, and
 * a short history is never treated as proof a young token can revisit ATH.
 */

export const ATH_WEIGHTS = {
  timeSinceAth: 0.15,
  distToAth: 0.20,
  weeklyStructure: 0.15,
  relativeStrengthVsBtc: 0.10,
  fundamentalsTrend: 0.15,
  supplyOverhang: 0.10,
  liquidity: 0.15
};
export const MOMENTUM_WEIGHTS = { score1d: 0.35, score1w: 0.30, ret30: 0.20, rvol1d: 0.15 };
export const COMBINED_WEIGHTS = { momentum: 0.5, athPotential: 0.5 };

export const LEGACY_ATH_DAYS = 1460;        // 4 years
export const LEGACY_DIST_PCT = 80;          // still 80%+ below ATH
export const DEEP_LEGACY_ATH_DAYS = 1095;   // 3 years
export const DEEP_LEGACY_DIST_PCT = 90;
export const LEGACY_CAP = 25;
export const DEEP_LEGACY_CAP = 35;
export const SHORT_HISTORY_DAYS = 365;
export const SHORT_HISTORY_TIME_CAP = 60;   // launch-spike ATHs are not "recent strength"
const MISSING = 40;                          // neutral-low, always flagged

const clamp = (v, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, v));

export function bandTimeSinceAth(days) {
  if (days == null) return { score: MISSING, flag: 'ath-date-missing' };
  if (days < 90) return { score: 100 };
  if (days < 365) return { score: 80 };
  if (days < 730) return { score: 60 };
  if (days < 1460) return { score: 35 };
  return { score: 15 };
}

export function bandDistToAth(distPct) {
  if (distPct == null) return { score: MISSING, flag: 'ath-distance-missing' };
  if (distPct < 30) return { score: 100 };
  if (distPct < 50) return { score: 85 };
  if (distPct < 70) return { score: 65 };
  if (distPct < 85) return { score: 40 };
  if (distPct < 95) return { score: 20 };
  return { score: 8 };
}

export function bandWeeklyStructure(tier, status) {
  if (tier == null) return { score: MISSING, flag: 'weekly-structure-missing' };
  const t = String(tier).toLowerCase();
  if (t.includes('strong bullish')) return { score: status === 'confirmed/above' ? 100 : 90 };
  if (t.includes('bullish')) return { score: 75 };
  if (t.includes('strong bearish')) return { score: 5 };
  if (t.includes('bearish')) return { score: 20 };
  return { score: 45 }; // neutral
}

export function bandRelativeStrength(rsPct) {
  if (rsPct == null) return { score: MISSING, flag: 'rs-vs-btc-missing' };
  if (rsPct > 10) return { score: 100 };
  if (rsPct > 0) return { score: 80 };
  if (rsPct > -10) return { score: 55 };
  return { score: 25 };
}

export function bandFundamentalsTrend(changePct) {
  if (changePct == null) return { score: MISSING, flag: 'fundamentals-not-provided' };
  if (changePct > 10) return { score: 100 };
  if (changePct > 0) return { score: 75 };
  if (changePct > -10) return { score: 50 };
  return { score: 25 };
}

export function bandSupplyOverhang(fdvToMcap) {
  if (fdvToMcap == null) return { score: 50, flag: 'fdv-missing' };
  if (fdvToMcap <= 1.2) return { score: 100 };
  if (fdvToMcap <= 2) return { score: 75 };
  if (fdvToMcap <= 4) return { score: 50 };
  return { score: 25 };
}

export function bandLiquidity(medianQuoteVolUsd) {
  if (medianQuoteVolUsd == null) return { score: MISSING, flag: 'liquidity-missing' };
  if (medianQuoteVolUsd > 10_000_000) return { score: 100 };
  if (medianQuoteVolUsd > 2_000_000) return { score: 80 };
  if (medianQuoteVolUsd > 500_000) return { score: 55 };
  return { score: 25 };
}

/** Raw ATH/structure facts for one asset. Everything grounded or null+flag. */
export function computeAthFeatures({ coingecko, det1d, det1w, btcRet30, llama, now }) {
  const nowMs = now ?? Date.now();
  const ath = coingecko?.ath ?? null;
  const athDate = coingecko?.ath_date ?? null;
  const close = det1d?.close ?? null;
  const daysSinceAth = athDate ? Math.floor((nowMs - new Date(athDate).getTime()) / 86_400_000) : null;
  const distToAthPct = ath && close ? (ath / close - 1) * 100 : null;
  const historyDays = det1d?.candles ?? null;
  return {
    ath, athDate, daysSinceAth, distToAthPct: distToAthPct != null ? Math.round(distToAthPct * 10) / 10 : null,
    historyDays,
    weeklyTier: det1w?.tier ?? null, weeklyScore: det1w?.score ?? null, weeklyStatus: det1w?.status ?? null,
    distSma200wPct: det1w?.distSma200Pct ?? null,
    rsVsBtc30Pct: det1d?.ret30 != null && btcRet30 != null ? Math.round((det1d.ret30 - btcRet30) * 10) / 10 : null,
    btcRet30: btcRet30 ?? null,
    fdvToMcap: coingecko?.fully_diluted_valuation && coingecko?.market_cap
      ? Math.round((coingecko.fully_diluted_valuation / coingecko.market_cap) * 100) / 100 : null,
    circulatingPct: coingecko?.circulating_supply && (coingecko.max_supply || coingecko.total_supply)
      ? Math.round((coingecko.circulating_supply / (coingecko.max_supply || coingecko.total_supply)) * 1000) / 10 : null,
    mcapMultipleToAth: distToAthPct != null ? Math.round((1 + distToAthPct / 100) * 100) / 100 : null,
    tvlUsd: llama?.tvl ?? null,
    tvlChange30dPct: llama?.change_1m != null ? Math.round(llama.change_1m * 1000) / 10 : null,
    medianQuoteVolUsd: det1d?.medianQuoteVol20USD ?? null
  };
}

/** ATH-potential score 0..100 with per-component audit trail and hard caps. */
export function scoreAthPotential(f) {
  const components = {};
  const flags = [];
  const put = (key, band) => {
    components[key] = { score: band.score, weight: ATH_WEIGHTS[key], ...(band.flag ? { flag: band.flag } : {}) };
    if (band.flag) flags.push(band.flag);
  };

  let timeBand = bandTimeSinceAth(f.daysSinceAth);
  if (f.historyDays != null && f.historyDays < SHORT_HISTORY_DAYS && timeBand.score > SHORT_HISTORY_TIME_CAP) {
    flags.push('short-history-ath-unreliable');
    components.shortHistoryGuard = { note: `only ${f.historyDays} daily candles; ATH recency not rewarded`, cap: SHORT_HISTORY_TIME_CAP };
    timeBand = { score: SHORT_HISTORY_TIME_CAP, flag: 'short-history-capped' };
  }
  put('timeSinceAth', timeBand);
  put('distToAth', bandDistToAth(f.distToAthPct));
  put('weeklyStructure', bandWeeklyStructure(f.weeklyTier, f.weeklyStatus));
  put('relativeStrengthVsBtc', bandRelativeStrength(f.rsVsBtc30Pct));
  put('fundamentalsTrend', bandFundamentalsTrend(f.tvlChange30dPct));
  put('supplyOverhang', bandSupplyOverhang(f.fdvToMcap));
  put('liquidity', bandLiquidity(f.medianQuoteVolUsd));

  let score = Object.values(components)
    .filter(c => typeof c.score === 'number')
    .reduce((sum, c) => sum + c.score * c.weight, 0);

  const weeklyBearish = f.weeklyTier != null && /bearish/i.test(f.weeklyTier);
  let cap = null;
  if (f.daysSinceAth != null && f.distToAthPct != null) {
    if (f.daysSinceAth >= LEGACY_ATH_DAYS && f.distToAthPct >= LEGACY_DIST_PCT && weeklyBearish) cap = LEGACY_CAP;
    else if (f.daysSinceAth >= DEEP_LEGACY_ATH_DAYS && f.distToAthPct >= DEEP_LEGACY_DIST_PCT) cap = DEEP_LEGACY_CAP;
  }
  if (cap != null && score > cap) {
    flags.push(cap === LEGACY_CAP ? 'legacy-penalty' : 'deep-legacy-penalty');
    components.legacyCap = { applied: cap, reason: `ATH ${f.daysSinceAth}d ago and ${f.distToAthPct}% away${weeklyBearish ? ' with bearish 1W' : ''}` };
    score = cap;
  }
  return { score: Math.round(clamp(score) * 10) / 10, components, flags };
}

/** Deterministic momentum/setup composite from the eval packet. */
export function computeMomentumScore(det1d, det1w) {
  const parts = [];
  const flags = [];
  const add = (key, value, weight, map) => {
    if (value == null) { parts.push({ key, score: MISSING, weight }); flags.push(`${key}-missing`); return; }
    parts.push({ key, score: map(value), weight });
  };
  add('score1d', det1d?.score, MOMENTUM_WEIGHTS.score1d, v => clamp(v, 0, 100));
  add('score1w', det1w?.score, MOMENTUM_WEIGHTS.score1w, v => clamp(v, 0, 100));
  add('ret30', det1d?.ret30, MOMENTUM_WEIGHTS.ret30, v => clamp(50 + v * 2, 0, 100)); // ±25% span
  add('rvol1d', det1d?.rvol, MOMENTUM_WEIGHTS.rvol1d, v => clamp(v / 3 * 100, 0, 100));
  const score = parts.reduce((sum, p) => sum + p.score * p.weight, 0);
  return { score: Math.round(score * 10) / 10, components: Object.fromEntries(parts.map(p => [p.key, { score: p.score, weight: p.weight }])), flags };
}

/** Merge the two rankings with explicit weights; every input stays visible. */
export function combineRankings(symbols, momentum, ath, weights = COMBINED_WEIGHTS) {
  const rows = symbols.map(symbol => {
    const m = momentum[symbol]?.score ?? null;
    const a = ath[symbol]?.score ?? null;
    const combined = m != null && a != null
      ? Math.round((m * weights.momentum + a * weights.athPotential) * 10) / 10
      : null;
    return { symbol, momentumScore: m, athScore: a, combined };
  });
  const sortDesc = key => rows.slice().sort((x, y) => (y[key] ?? -1) - (x[key] ?? -1));
  return {
    weights,
    momentum: sortDesc('momentumScore'),
    athPotential: sortDesc('athScore'),
    combined: sortDesc('combined')
  };
}
