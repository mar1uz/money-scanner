/**
 * Four-axes fetcher - current, keyless, owning sources:
 * DefiLlama fees overview (fees 30d + prior 30d per protocol/chain),
 * DefiLlama v2/chains (L1 TVL), DefiLlama /protocols (protocol TVL + 1m
 * change, via existing matchLlama), CoinGecko search/trending (mindshare).
 * Every row carries the source URL; anything unreachable stays null and is
 * flagged downstream, never guessed.
 */
import { CHAIN_MAP, PROTO_MAP } from './four-axes-lib.mjs';

export const AXES_SOURCES = {
  historicalChainTvl: 'https://api.llama.fi/v2/historicalChainTvl/{chain}',
  fees: 'https://api.llama.fi/overview/fees?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true',
  chains: 'https://api.llama.fi/v2/chains',
  trending: 'https://api.coingecko.com/api/v3/search/trending'
};

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

/** Unique exact-name match in the fees overview; null when ambiguous/absent. */
export function matchFees(rows, name) {
  const exact = rows.filter(r => r.name?.toLowerCase() === name.toLowerCase());
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;
  const partial = rows.filter(r => r.name?.toLowerCase().startsWith(name.toLowerCase()));
  return partial.length === 1 ? partial[0] : null;
}

export async function buildFourAxesContext(cohortSymbols) {
  const errors = [];
  const [feesRows, chainRows, trending] = await Promise.all([
    getJson(AXES_SOURCES.fees).then(j => j.protocols ?? []).catch(e => { errors.push(`fees: ${e.message}`); return null; }),
    getJson(AXES_SOURCES.chains).catch(e => { errors.push(`chains: ${e.message}`); return null; }),
    getJson(AXES_SOURCES.trending).then(j => j.coins ?? []).catch(e => { errors.push(`trending: ${e.message}`); return null; })
  ]);
  const trendingRankBySymbol = {};
  (trending ?? []).forEach((c, i) => {
    const sym = c.item?.symbol?.toUpperCase();
    if (sym && !(sym in trendingRankBySymbol)) trendingRankBySymbol[sym] = i + 1;
  });
  // Chain TVL 30d trend from the owning endpoint (one call per chain in cohort).
  const chainTvlChange = {};
  const chainsNeeded = [...new Set(cohortSymbols.map(s => CHAIN_MAP[s]).filter(Boolean))];
  await Promise.all(chainsNeeded.map(async (chain) => {
    try {
      const hist = await getJson(`https://api.llama.fi/v2/historicalChainTvl/${encodeURIComponent(chain)}`);
      if (Array.isArray(hist) && hist.length > 31) {
        const last = hist.at(-1).tvl;
        const back = hist.at(-31).tvl;
        if (last > 0 && back > 0) chainTvlChange[chain] = (last / back - 1) * 100;
      }
    } catch (e) { errors.push(`historicalChainTvl ${chain}: ${e.message}`); }
  }));
  const perSymbol = {};
  for (const symbol of cohortSymbols) {
    const chain = CHAIN_MAP[symbol];
    const proto = PROTO_MAP[symbol];
    const feesRow = feesRows
      ? (chain ? matchFees(feesRows, chain) : null) ?? (proto ? matchFees(feesRows, proto) : null)
      : null;
    const chainRow = chain && chainRows ? chainRows.find(r => r.name === chain) ?? null : null;
    perSymbol[symbol] = {
      fees30d: feesRow?.total30d ?? null,
      feesPrev30d: feesRow?.total60dto30d ?? null,
      chainTvl: chainRow?.tvl ?? null,
      chainTvlChange30dPct: chain ? chainTvlChange[chain] ?? null : null,
      trendingRank: trendingRankBySymbol[symbol] ?? null,
      matchedName: feesRow?.name ?? null
    };
  }
  return { perSymbol, errors, sources: AXES_SOURCES, fetchedAt: new Date().toISOString() };
}

/** Lean trending-rank fetch (narrative axis only, no double-counted TVL/fees). */
export async function fetchTrendingRanks(symbols) {
  const errors = [];
  const coins = await getJson(AXES_SOURCES.trending).then(j => j.coins ?? []).catch(e => { errors.push(`trending: ${e.message}`); return []; });
  const rankBySymbol = {};
  coins.forEach((c, i) => {
    const sym = c.item?.symbol?.toUpperCase();
    if (sym && !(sym in rankBySymbol)) rankBySymbol[sym] = i + 1;
  });
  return { rankBySymbol, errors, fetchedAt: new Date().toISOString(), source: AXES_SOURCES.trending };
}
