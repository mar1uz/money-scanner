/**
 * ATH context fetcher - public, keyless data for the ATH-potential layer.
 * CoinGecko /coins/markets (ATH, ATH date, mcap, FDV, supply), DefiLlama
 * /protocols (TVL + 1m trend), Binance klines for BTC/ETH 30d returns.
 * Anything unreachable stays null and becomes an explicit missing-data flag
 * downstream; nothing is guessed.
 */

export async function fetchCoinGeckoMarkets(pages = 2) {
  const rows = [];
  for (let page = 1; page <= pages; page++) {
    const res = await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=${page}&sparkline=false`, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
    rows.push(...await res.json());
  }
  return rows;
}

export async function fetchDefiLlamaProtocols() {
  const res = await fetch('https://api.llama.fi/protocols', { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`DefiLlama HTTP ${res.status}`);
  return res.json();
}

export async function fetchRet30(symbol) {
  const res = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${symbol}USDT&interval=1d&limit=40`, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Binance HTTP ${res.status} for ${symbol}`);
  const rows = await res.json();
  const closed = rows.filter(k => Date.now() > k[6]);
  if (closed.length < 31) return null;
  return (closed.at(-1)[4] / closed.at(-31)[4] - 1) * 100;
}

/** Match a cohort symbol to its CoinGecko row; closest market-cap rank wins collisions. */
export function matchCoinGecko(rows, symbol, reclaimRank) {
  const matches = rows.filter(r => r.symbol?.toUpperCase() === symbol.toUpperCase());
  if (!matches.length) return null;
  if (matches.length === 1) return matches[0];
  return matches.sort((a, b) =>
    Math.abs((a.market_cap_rank ?? 9999) - (reclaimRank ?? 9999)) -
    Math.abs((b.market_cap_rank ?? 9999) - (reclaimRank ?? 9999)))[0];
}

/** Match a symbol/name to a DefiLlama protocol row; null when unsure. */
export function matchLlama(protocols, symbol, name) {
  const sym = symbol.toUpperCase();
  const bySymbol = protocols.filter(p => p.symbol?.toUpperCase() === sym && Number.isFinite(p.tvl) && p.tvl > 0);
  if (bySymbol.length === 1) return bySymbol[0];
  const lname = (name || '').toLowerCase();
  if (lname) {
    const byName = protocols.filter(p => p.name?.toLowerCase() === lname && Number.isFinite(p.tvl) && p.tvl > 0);
    if (byName.length === 1) return byName[0];
    if (bySymbol.length > 1 && byName.length === 0) return null; // ambiguous, stay honest
  }
  return bySymbol[0] ?? null;
}

/** Build the per-symbol context bundle for the cohort. */
export async function buildAthContext(cohort) {
  const errors = [];
  const [cgRows, llamaRows, btcRet30] = await Promise.all([
    fetchCoinGeckoMarkets().catch(e => { errors.push(`coingecko: ${e.message}`); return null; }),
    fetchDefiLlamaProtocols().catch(e => { errors.push(`defillama: ${e.message}`); return null; }),
    fetchRet30('BTC').catch(e => { errors.push(`btc-ret30: ${e.message}`); return null; })
  ]);
  const perSymbol = {};
  for (const entry of cohort) {
    const symbol = entry.symbol;
    perSymbol[symbol] = {
      coingecko: cgRows ? matchCoinGecko(cgRows, symbol, entry.scan?.marketCapRank) : null,
      llama: llamaRows ? matchLlama(llamaRows, symbol, entry.name ?? entry.scan?.name) : null,
      btcRet30
    };
  }
  return { perSymbol, errors, sources: { coingecko: !!cgRows, defillama: !!llamaRows, btcRet30: btcRet30 != null } };
}
