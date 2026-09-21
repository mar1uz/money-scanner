/**
 * Decision-relevant on-chain metrics per crypto asset, from free and
 * reliable public sources:
 *  - CoinGecko /coins/markets (Demo key): supply breakdown, ATH/ATL
 *    distance, volume/market-cap liquidity ratio.
 *  - DefiLlama (no key): protocol TVL and 24h fees where the asset maps to a
 *    listed protocol (matched by gecko_id). Assets without a protocol entry
 *    (e.g. Celestia) simply omit TVL/fees.
 * Whale concentration, exchange flows and staking ratios are intentionally
 * excluded: no reliable free source exists for them.
 */

export interface OnchainMetrics {
  symbol: string;
  coinGeckoId: string;
  source: 'coingecko' | 'coingecko+defillama';
  updatedAt: number;
  supplyCirculating?: number;
  supplyTotal?: number;
  supplyMax?: number;
  pctUnlocked?: number;
  athPrice?: number;
  athDistancePct?: number;
  atlPrice?: number;
  atlDistancePct?: number;
  volumeMcapPct?: number;
  tvlUsd?: number;
  tvlToMcapPct?: number;
  fees24hUsd?: number;
}

const ASSET_CACHE_MS = 15 * 60_000;
const LLAMA_LIST_MS = 6 * 60 * 60_000;
const assetCache = new Map<string, { at: number; value: OnchainMetrics }>();
let llamaList: { at: number; byGecko: Map<string, { slug: string; tvl: number | null }> } | null = null;
const feesCache = new Map<string, { at: number; fees24hUsd?: number }>();

async function getJson(url: string, coingecko = false): Promise<any> {
  const res = await fetch(url, {
    headers: {
      accept: 'application/json',
      ...(coingecko && process.env.COINGECKO_API_KEY ? { 'x-cg-demo-api-key': process.env.COINGECKO_API_KEY } : {})
    },
    signal: AbortSignal.timeout(10_000)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function llamaProtocolsByGecko(): Promise<Map<string, { slug: string; tvl: number | null }>> {
  if (llamaList && Date.now() - llamaList.at < LLAMA_LIST_MS) return llamaList.byGecko;
  const rows = await getJson('https://api.llama.fi/protocols');
  const byGecko = new Map<string, { slug: string; tvl: number | null }>();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (row?.gecko_id && row?.slug) byGecko.set(row.gecko_id, { slug: row.slug, tvl: typeof row.tvl === 'number' ? row.tvl : null });
  }
  llamaList = { at: Date.now(), byGecko };
  return byGecko;
}

async function llamaFees24h(slug: string): Promise<number | undefined> {
  const cached = feesCache.get(slug);
  if (cached && Date.now() - cached.at < ASSET_CACHE_MS) return cached.fees24hUsd;
  try {
    const summary = await getJson(`https://api.llama.fi/summary/fees/${encodeURIComponent(slug)}`);
    const fees24hUsd = typeof summary?.total24h === 'number' && summary.total24h > 0 ? summary.total24h : undefined;
    feesCache.set(slug, { at: Date.now(), fees24hUsd });
    return fees24hUsd;
  } catch {
    feesCache.set(slug, { at: Date.now(), fees24hUsd: undefined });
    return undefined;
  }
}

const round = (value: number, digits = 2) => Number(value.toFixed(digits));

export const onchainMetrics = {
  async forAsset(symbol: string, coinGeckoId: string): Promise<OnchainMetrics | undefined> {
    const key = `${symbol.toUpperCase()}:${coinGeckoId}`;
    const cached = assetCache.get(key);
    if (cached && Date.now() - cached.at < ASSET_CACHE_MS) return cached.value;

    const rows = await getJson(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(coinGeckoId)}&sparkline=false`,
      true
    );
    const row = (Array.isArray(rows) ? rows : []).find((item: any) => item?.id === coinGeckoId);
    if (!row || !row.market_cap) return undefined;

    let protocol: { slug: string; tvl: number | null } | undefined;
    try {
      protocol = (await llamaProtocolsByGecko()).get(coinGeckoId);
    } catch {
      protocol = undefined;
    }
    const fees24hUsd = protocol?.slug ? await llamaFees24h(protocol.slug) : undefined;

    const circulating = typeof row.circulating_supply === 'number' && row.circulating_supply > 0 ? row.circulating_supply : undefined;
    const total = typeof row.total_supply === 'number' && row.total_supply > 0 ? row.total_supply : undefined;
    const max = typeof row.max_supply === 'number' && row.max_supply > 0 ? row.max_supply : undefined;
    const unlockBase = max || total;
    const metrics: OnchainMetrics = {
      symbol: symbol.toUpperCase(),
      coinGeckoId,
      source: protocol ? 'coingecko+defillama' : 'coingecko',
      updatedAt: Date.now(),
      supplyCirculating: circulating,
      supplyTotal: total,
      supplyMax: max,
      pctUnlocked: circulating && unlockBase ? round((circulating / unlockBase) * 100, 1) : undefined,
      athPrice: typeof row.ath === 'number' ? row.ath : undefined,
      athDistancePct: typeof row.ath_change_percentage === 'number' ? round(row.ath_change_percentage, 1) : undefined,
      atlPrice: typeof row.atl === 'number' ? row.atl : undefined,
      atlDistancePct: typeof row.atl_change_percentage === 'number' ? round(row.atl_change_percentage, 0) : undefined,
      volumeMcapPct: typeof row.total_volume === 'number' ? round((row.total_volume / row.market_cap) * 100, 1) : undefined,
      tvlUsd: protocol?.tvl && protocol.tvl > 0 ? round(protocol.tvl, 0) : undefined,
      tvlToMcapPct: protocol?.tvl && protocol.tvl > 0 ? round((protocol.tvl / row.market_cap) * 100, 0) : undefined,
      fees24hUsd
    };
    assetCache.set(key, { at: Date.now(), value: metrics });
    return metrics;
  }
};
