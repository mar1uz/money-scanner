/**
 * Four-axis classification for the near-flip cohort, pure scoring.
 * Axes: technicalSetup (existing deterministic momentum), fundamentals
 * (protocol/chain business), onchain (comparable evidence only), narrative
 * (mindshare, limited coverage). Missing evidence is flagged and scored
 * neutral-low 40 - never zero, never fabricated.
 */

export const AXES_WEIGHTS = { technicalSetup: 0.25, athPotential: 0.25, fundamentals: 0.20, onchain: 0.20, narrative: 0.10 };
export const AXES_MISSING = 40;

// Chains whose own L1 TVL/fees are the comparable on-chain footprint.
export const CHAIN_MAP = {
  SOL: 'Solana', ETH: 'Ethereum', XTZ: 'Tezos', AR: 'Arweave', ICP: 'Internet Computer'
};
// Protocol tokens with an own DefiLlama footprint.
export const PROTO_MAP = { JTO: 'Jito', PENDLE: 'Pendle', ETHFI: 'ether.fi', MET: 'Meteora' };
// Assets with no comparable public footprint (privacy chain, no own TVL).
export const NO_COMPARABLE = { XMR: 'privacy chain: TVL/fees/flows not publicly comparable', JASMY: 'no own protocol/chain TVL on DefiLlama', '2Z': 'no DefiLlama footprint yet' };

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const round1 = (v) => Math.round(v * 10) / 10;

/** Level band on log10 scale between refLow (score 20) and refHigh (score 95). */
export function levelBand(value, refLow, refHigh) {
  const v = num(value);
  if (v == null || v <= 0) return { score: AXES_MISSING, flag: 'level-not-provided' };
  const t = Math.max(0, Math.min(1, (Math.log10(v) - Math.log10(refLow)) / (Math.log10(refHigh) - Math.log10(refLow))));
  return { score: round1(20 + t * 75) };
}

/** Trend band: pct change, -30% -> 10, +30% -> 90, clamped. */
export function trendBand(pctChange) {
  const p = num(pctChange);
  if (p == null) return { score: AXES_MISSING, flag: 'trend-not-provided' };
  return { score: round1(Math.max(5, Math.min(95, 50 + (p / 30) * 40))) };
}

/** Fundamentals: business of the protocol/chain - fees level + 30d-over-30d trend. */
export function scoreFundamentals({ fees30d, feesPrev30d }) {
  const level = levelBand(fees30d, 1e5, 5e7); // $100k/mo .. $50M/mo
  const trend = fees30d != null && feesPrev30d > 0 ? trendBand((fees30d / feesPrev30d - 1) * 100) : { score: AXES_MISSING, flag: 'fees-trend-not-provided' };
  const flags = [level.flag, trend.flag].filter(Boolean);
  if (flags.length === 2) return { score: AXES_MISSING, flags: ['fundamentals-not-provided'], evidence: null };
  return {
    score: round1(level.score * 0.5 + trend.score * 0.5),
    flags,
    evidence: { fees30d: num(fees30d), feesPrev30d: num(feesPrev30d) }
  };
}

/** On-chain: comparable footprint only - TVL level + trend, flagged per asset. */
export function scoreOnchain({ symbol, tvl, tvlChange30dPct }) {
  if (NO_COMPARABLE[symbol]) {
    return { score: AXES_MISSING, flags: ['onchain-not-comparable'], note: NO_COMPARABLE[symbol], evidence: null };
  }
  const level = levelBand(tvl, 5e7, 3e10); // $50M .. $30B
  const trend = trendBand(tvlChange30dPct);
  const flags = [level.flag && 'tvl-not-provided', trend.flag && 'tvl-trend-not-provided'].filter(Boolean);
  if (flags.length === 2) return { score: AXES_MISSING, flags: ['onchain-not-provided'], evidence: null };
  return {
    score: round1(level.score * 0.5 + trend.score * 0.5),
    flags,
    evidence: { tvl: num(tvl), tvlChange30dPct: num(tvlChange30dPct) }
  };
}

/** Narrative/mindshare: CoinGecko trending only - explicit limited coverage. */
export function scoreNarrative({ trendingRank }) {
  const r = num(trendingRank);
  if (r == null) return { score: AXES_MISSING, flags: ['mindshare-limited-trending-only'], evidence: { trendingRank: null } };
  if (r <= 5) return { score: 90, flags: [], evidence: { trendingRank: r } };
  return { score: 75, flags: [], evidence: { trendingRank: r } };
}

/** Final combination over the four axes + ATH potential, weights visible. */
export function combineFourAxes(entry) {
  const parts = {
    technicalSetup: entry.momentumScore,
    athPotential: entry.athScore,
    fundamentals: entry.fundamentals?.score,
    onchain: entry.onchain?.score,
    narrative: entry.narrative?.score
  };
  const flags = [];
  let total = 0;
  for (const [axis, w] of Object.entries(AXES_WEIGHTS)) {
    const s = num(parts[axis]);
    if (s == null) { flags.push(`${axis}-missing`); total += AXES_MISSING * w; }
    else total += s * w;
  }
  return { score: round1(total), parts, weights: AXES_WEIGHTS, flags };
}
