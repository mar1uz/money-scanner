import type { CryptoFourCriteriaAsset } from '@money-scanner/shared';
import { evaluateCryptoFourCriteriaAsset } from './crypto-four-criteria-scanner.js';

const DEX_SEARCH_URL = 'https://api.dexscreener.com/latest/dex/search?q=';
const DEX_TOKENS_URL = 'https://api.dexscreener.com/latest/dex/tokens/';
const DEFILLAMA_PROTOCOLS_URL = 'https://api.llama.fi/protocols';
const DEFILLAMA_FEES_URL = 'https://api.llama.fi/overview/fees?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true&dataType=dailyFees';
const DEFILLAMA_REVENUE_URL = 'https://api.llama.fi/overview/fees?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true&dataType=dailyRevenue';
const DEFILLAMA_HOLDERS_REVENUE_URL = 'https://api.llama.fi/overview/fees?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true&dataType=dailyHoldersRevenue';
const LLAMA_CACHE_MS = 30 * 60_000;
const LOOKUP_CACHE_MS = 2 * 60_000;
const MAX_RESULTS = 8;

interface DexPairLike {
  chainId?: string;
  url?: string;
  pairAddress?: string;
  dexId?: string;
  baseToken?: { address?: string; symbol?: string; name?: string };
  info?: { imageUrl?: string };
  liquidity?: { usd?: number | string };
  volume?: { h24?: number | string; h6?: number | string; h1?: number | string };
  marketCap?: number | string;
  fdv?: number | string;
}

export interface RankedDexToken {
  chainId: string;
  address: string;
  symbol: string;
  name: string;
  image?: string;
  url: string;
  marketCap: number;
  liquidity: number;
  volume24h: number;
  volume6h: number;
  chainCount: number;
  chains: string[];
}

interface LlamaBundle {
  fetchedAt: number;
  protocols: Array<{ name?: string; slug?: string; symbol?: string; gecko_id?: string | null; tvl?: number | null; change_7d?: number | null; chains?: string[] }>;
  fees: Array<{ name?: string; slug?: string; total24h?: number | null; total7d?: number | null; total30d?: number | null }>;
  revenue: Array<{ name?: string; slug?: string; total24h?: number | null; total7d?: number | null; total30d?: number | null }>;
  holdersRevenue: Array<{ name?: string; slug?: string; total24h?: number | null; total7d?: number | null; total30d?: number | null }>;
}

const finitePositive = (value: unknown): number => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : 0;
};

const normalize = (value: string | undefined): string => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '');

const validSymbol = (value: string | undefined): string | null => {
  const symbol = String(value || '').replace(/^[$]/, '').trim().toUpperCase();
  return symbol && /^[A-Z0-9]{1,24}$/.test(symbol) ? symbol : null;
};

export function looksLikeTokenAddress(query: string): boolean {
  const value = query.trim();
  if (/^0x[a-fA-F0-9]{40}$/.test(value)) return true;
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) return true;
  return false;
}

export function normalizeLookupQuery(raw: string): string {
  return String(raw || '').trim().slice(0, 80);
}

export function shouldLookupOnDexScreener(query: string, localMatchCount: number): boolean {
  const normalized = normalizeLookupQuery(query);
  if (normalized.length < 2) return false;
  if (looksLikeTokenAddress(normalized)) return true;
  return localMatchCount === 0;
}

const formatUsd = (value: number): string => {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${Math.round(value).toLocaleString('en-US')}`;
};

const formatPercent = (value: number): string => `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;

export function rankDexTokens(pairs: unknown, limit = MAX_RESULTS): RankedDexToken[] {
  if (!Array.isArray(pairs)) return [];
  const grouped = new Map<string, { token: RankedDexToken; chains: Set<string> }>();
  for (const row of pairs as DexPairLike[]) {
    const address = String(row?.baseToken?.address || '').trim();
    const chainId = String(row?.chainId || '').trim().toLowerCase();
    const symbol = validSymbol(row?.baseToken?.symbol);
    const name = String(row?.baseToken?.name || row?.baseToken?.symbol || '').trim();
    const url = typeof row?.url === 'string' && /^https:\/\/dexscreener\.com\//.test(row.url) ? row.url : '';
    if (!address || !chainId || !symbol || !name || !url) continue;
    const key = `${chainId}:${address.toLowerCase()}`;
    const liquidity = finitePositive(row?.liquidity?.usd);
    const volume24h = finitePositive(row?.volume?.h24);
    const volume6h = finitePositive(row?.volume?.h6);
    const marketCap = finitePositive(row?.marketCap) || finitePositive(row?.fdv);
    const image = typeof row?.info?.imageUrl === 'string' ? row.info.imageUrl : undefined;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        chains: new Set([chainId]),
        token: { chainId, address, symbol, name, image, url, marketCap, liquidity, volume24h, volume6h, chainCount: 1, chains: [chainId] }
      });
      continue;
    }
    existing.chains.add(chainId);
    if (liquidity > existing.token.liquidity || volume24h > existing.token.volume24h) {
      existing.token = { ...existing.token, image: image || existing.token.image, url, marketCap: marketCap || existing.token.marketCap, liquidity, volume24h, volume6h };
    }
  }

  return [...grouped.values()]
    .map(({ token, chains }) => ({ ...token, chainCount: chains.size, chains: [...chains] }))
    .sort((left, right) => right.liquidity - left.liquidity || right.volume24h - left.volume24h)
    .slice(0, limit);
}

export function evaluateDexScreenerFourCriteria(token: RankedDexToken): CryptoFourCriteriaAsset {
  const volumePace = token.volume6h > 0 ? ((token.volume24h / (token.volume6h * 4)) - 1) * 100 : undefined;
  const hasUsage = token.volume24h > 0 || token.liquidity > 0;
  const growth = volumePace === undefined || !Number.isFinite(volumePace)
    ? { status: 'unknown' as const, label: 'Creștere', value: 'Date insuficiente', explanation: 'DexScreener nu are volum 6h comparabil pentru ritmul de activitate.' }
    : volumePace >= 5
      ? { status: 'pass' as const, label: 'Creștere', value: formatPercent(volumePace), explanation: 'Volumul DEX 24h accelerează cu minimum 5% față de ritmul din ultimele 6h (DexScreener, nu fees de protocol).' }
      : volumePace >= 0
        ? { status: 'watch' as const, label: 'Creștere', value: formatPercent(volumePace), explanation: 'Volumul DEX este stabil sau crește lent față de ritmul 6h.' }
        : { status: 'fail' as const, label: 'Creștere', value: formatPercent(volumePace), explanation: 'Volumul DEX 24h este sub ritmul din ultimele 6h.' };

  const networkPass = token.volume24h >= 100_000 && (token.liquidity >= 1_000_000 || token.chainCount >= 2);
  const networkEffect = networkPass
    ? { status: 'pass' as const, label: 'Efect de rețea', value: `${formatUsd(token.volume24h)} vol / 24h`, explanation: 'Volum DEX material plus lichiditate sau prezență pe mai multe chain-uri (proxy DexScreener, nu utilizatori activi).' }
    : hasUsage
      ? { status: 'watch' as const, label: 'Efect de rețea', value: token.volume24h > 0 ? `${formatUsd(token.volume24h)} vol / 24h` : `${formatUsd(token.liquidity)} liq`, explanation: 'Există activitate DEX măsurabilă, dar pragul de volum/lichiditate nu este încă îndeplinit.' }
      : { status: 'unknown' as const, label: 'Efect de rețea', value: 'Date insuficiente', explanation: 'DexScreener nu raportează volum sau lichiditate pentru acest token.' };

  const sustainableRevenue = hasUsage
    ? { status: 'fail' as const, label: 'Venit sustenabil', value: '$0 observat', explanation: 'Token găsit pe DexScreener; nu există revenue de protocol raportat de DefiLlama.' }
    : { status: 'unknown' as const, label: 'Venit sustenabil', value: 'Date insuficiente', explanation: 'Fără observație DefiLlama de revenue pentru acest token.' };

  const holderValue = { status: 'unknown' as const, label: 'Valoare către holderi', value: 'Date insuficiente', explanation: 'Fără holders revenue DefiLlama nu se poate confirma buyback, distribuție sau fee switch.' };
  const statuses = [growth.status, networkEffect.status, sustainableRevenue.status, holderValue.status];
  const passedCriteria = statuses.filter(status => status === 'pass').length;
  const firstThreePass = statuses.slice(0, 3).every(status => status === 'pass');

  return {
    id: `dex:${token.chainId}:${token.address}`,
    symbol: token.symbol,
    name: token.name,
    image: token.image,
    marketCapRank: 0,
    marketCap: token.marketCap,
    score: statuses.reduce((sum, status) => sum + (status === 'pass' ? 25 : status === 'watch' ? 12 : 0), 0),
    passedCriteria,
    classification: firstThreePass
      ? 'first-three'
      : statuses.every(status => status === 'unknown')
        ? 'insufficient-data'
        : 'partial',
    criteria: { growth, networkEffect, sustainableRevenue, holderValue },
    metrics: {
      tvl: token.liquidity || undefined,
      chainCount: token.chainCount
    }
  };
}

let llamaCache: LlamaBundle | null = null;
const lookupCache = new Map<string, { assets: CryptoFourCriteriaAsset[]; fetchedAt: number }>();

export function resetFourCriteriaLookupCache(): void {
  llamaCache = null;
  lookupCache.clear();
}

const fetchJson = async <T>(fetcher: typeof fetch, url: string): Promise<T> => {
  const response = await fetcher(url, {
    headers: { accept: 'application/json', 'user-agent': 'MoneyScanner360/1.0' },
    signal: AbortSignal.timeout(15_000)
  });
  if (!response.ok) throw new Error(`${new URL(url).hostname} returned HTTP ${response.status}`);
  return response.json() as Promise<T>;
};

const loadLlama = async (fetcher: typeof fetch): Promise<LlamaBundle> => {
  if (llamaCache && Date.now() - llamaCache.fetchedAt < LLAMA_CACHE_MS) return llamaCache;
  const [protocols, feeResponse, revenueResponse, holderRevenueResponse] = await Promise.all([
    fetchJson<LlamaBundle['protocols']>(fetcher, DEFILLAMA_PROTOCOLS_URL),
    fetchJson<{ protocols?: LlamaBundle['fees'] }>(fetcher, DEFILLAMA_FEES_URL),
    fetchJson<{ protocols?: LlamaBundle['revenue'] }>(fetcher, DEFILLAMA_REVENUE_URL),
    fetchJson<{ protocols?: LlamaBundle['holdersRevenue'] }>(fetcher, DEFILLAMA_HOLDERS_REVENUE_URL)
  ]);
  llamaCache = {
    fetchedAt: Date.now(),
    protocols: Array.isArray(protocols) ? protocols : [],
    fees: feeResponse.protocols || [],
    revenue: revenueResponse.protocols || [],
    holdersRevenue: holderRevenueResponse.protocols || []
  };
  return llamaCache;
};

const metricSum = (
  rows: LlamaBundle['fees'],
  slug: string,
  name: string
): { total24h: number; total7d: number; total30d: number; observed30d: boolean; incomplete30d: boolean; incomplete7d: boolean } => {
  const targetSlug = slug.toLowerCase();
  const targetName = normalize(name);
  const matched = rows.filter(row => String(row.slug || '').toLowerCase() === targetSlug || normalize(row.name) === targetName);
  const sum = { total24h: 0, total7d: 0, total30d: 0, observed30d: false, incomplete30d: false, incomplete7d: false };
  for (const row of matched) {
    if (typeof row.total30d === 'number' && Number.isFinite(row.total30d) && row.total30d >= 0) sum.observed30d = true;
    else sum.incomplete30d = true;
    if (typeof row.total7d !== 'number' || !Number.isFinite(row.total7d) || row.total7d < 0) sum.incomplete7d = true;
    sum.total24h += finitePositive(row.total24h);
    sum.total7d += finitePositive(row.total7d);
    sum.total30d += finitePositive(row.total30d);
  }
  return sum;
};

const tryDefiLlamaAsset = (token: RankedDexToken, llama: LlamaBundle): CryptoFourCriteriaAsset | null => {
  const symbol = token.symbol;
  const byName = llama.protocols.filter(protocol => normalize(protocol.name) === normalize(token.name));
  const bySymbol = llama.protocols.filter(protocol => validSymbol(protocol.symbol) === symbol);
  const protocol = byName.length === 1 ? byName[0] : bySymbol.length === 1 ? bySymbol[0] : undefined;
  if (!protocol) return null;
  const tvl = finitePositive(protocol.tvl);
  const change7d = Number(protocol.change_7d);
  const slug = String(protocol.slug || '');
  const name = String(protocol.name || token.name);
  return evaluateCryptoFourCriteriaAsset({
    id: `dex:${token.chainId}:${token.address}`,
    symbol: token.symbol,
    name: token.name,
    image: token.image,
    marketCapRank: 0,
    marketCap: token.marketCap
  }, {
    tvl,
    weightedTvlChange7d: tvl > 0 && Number.isFinite(change7d) ? tvl * change7d : 0,
    tvlWithChange: tvl > 0 && Number.isFinite(change7d) ? tvl : 0,
    chains: new Set(protocol.chains || token.chains),
    matchedRows: 1
  }, metricSum(llama.fees, slug, name), metricSum(llama.revenue, slug, name), metricSum(llama.holdersRevenue, slug, name));
};

export async function lookupCryptoFourCriteria(query: string, fetcher: typeof fetch = fetch): Promise<CryptoFourCriteriaAsset[]> {
  const q = normalizeLookupQuery(query);
  if (q.length < 2) return [];
  const cacheKey = q.toLowerCase();
  const cached = lookupCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < LOOKUP_CACHE_MS) return cached.assets;

  const url = looksLikeTokenAddress(q)
    ? `${DEX_TOKENS_URL}${encodeURIComponent(q)}`
    : `${DEX_SEARCH_URL}${encodeURIComponent(q)}`;
  const [dexBody, llama] = await Promise.all([
    fetchJson<{ pairs?: DexPairLike[] } | DexPairLike[]>(fetcher, url),
    loadLlama(fetcher).catch(() => null)
  ]);
  const pairs = Array.isArray(dexBody) ? dexBody : dexBody?.pairs || [];
  const tokens = rankDexTokens(pairs);
  const assets = tokens.map(token => {
    if (llama) {
      const matched = tryDefiLlamaAsset(token, llama);
      if (matched && matched.classification !== 'insufficient-data') return matched;
    }
    return evaluateDexScreenerFourCriteria(token);
  });
  lookupCache.set(cacheKey, { assets, fetchedAt: Date.now() });
  return assets;
}
