import {
  CryptoCriterionResult,
  CryptoCriteriaStatus,
  CryptoFourCriteriaAsset,
  CryptoFourCriteriaScan
} from '@money-scanner/shared';

const COINGECKO_MARKETS_URL = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=200&page=1&sparkline=false';
const COINPAPRIKA_MARKETS_URL = 'https://api.coinpaprika.com/v1/tickers?quotes=USD&limit=200';
const DEFILLAMA_PROTOCOLS_URL = 'https://api.llama.fi/protocols';
const DEFILLAMA_FEES_URL = 'https://api.llama.fi/overview/fees?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true&dataType=dailyFees';
const DEFILLAMA_REVENUE_URL = 'https://api.llama.fi/overview/fees?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true&dataType=dailyRevenue';
const DEFILLAMA_HOLDERS_REVENUE_URL = 'https://api.llama.fi/overview/fees?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true&dataType=dailyHoldersRevenue';

interface CoinGeckoMarketRow {
  id: string;
  coin_gecko_id?: string;
  symbol: string;
  name: string;
  image?: string;
  market_cap_rank?: number;
  market_cap?: number;
}

interface CoinPaprikaMarketRow {
  id: string;
  symbol: string;
  name: string;
  rank?: number;
  quotes?: { USD?: { market_cap?: number } };
}

interface DefiLlamaProtocolRow {
  name?: string;
  slug?: string;
  symbol?: string;
  gecko_id?: string | null;
  tvl?: number | null;
  change_7d?: number | null;
  chains?: string[];
}

interface DefiLlamaMetricRow {
  name?: string;
  slug?: string;
  total24h?: number | null;
  total7d?: number | null;
  total30d?: number | null;
}

interface DefiLlamaMetricResponse {
  protocols?: DefiLlamaMetricRow[];
}

interface NumericAggregate {
  total24h: number;
  total7d: number;
  total30d: number;
}

interface ProtocolAggregate {
  tvl: number;
  weightedTvlChange7d: number;
  tvlWithChange: number;
  chains: Set<string>;
  matchedRows: number;
}

export interface CryptoScannerInput {
  coins: CoinGeckoMarketRow[];
  protocols: DefiLlamaProtocolRow[];
  fees: DefiLlamaMetricRow[];
  revenue: DefiLlamaMetricRow[];
  holdersRevenue: DefiLlamaMetricRow[];
  generatedAt?: number;
}

const finitePositive = (value: unknown): number => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : 0;
};

const normalize = (value: string | undefined): string => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '');

const validSymbol = (value: string | undefined): string | null => {
  const symbol = String(value || '').trim().toUpperCase();
  return symbol && symbol !== '-' && /^[A-Z0-9]{1,15}$/.test(symbol) ? symbol : null;
};

const formatUsd = (value: number): string => {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${Math.round(value).toLocaleString('en-US')}`;
};

const formatPercent = (value: number): string => `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;

const criterion = (
  status: CryptoCriteriaStatus,
  label: string,
  value: string,
  explanation: string
): CryptoCriterionResult => ({ status, label, value, explanation });

const scoreForStatus = (status: CryptoCriteriaStatus): number => {
  if (status === 'pass') return 25;
  if (status === 'watch') return 12;
  return 0;
};

const runRateChange = (total7d: number, total30d: number): number | undefined => {
  if (total7d <= 0 || total30d <= 0) return undefined;
  return ((total7d * (30 / 7)) / total30d - 1) * 100;
};

export interface FourCriteriaCoinInput {
  id: string;
  coinGeckoId?: string;
  symbol: string;
  name: string;
  image?: string;
  marketCapRank: number;
  marketCap: number;
}

export function evaluateCryptoFourCriteriaAsset(
  coin: FourCriteriaCoinInput,
  protocol: ProtocolAggregate | undefined,
  fees: NumericAggregate,
  revenue: NumericAggregate,
  holderRevenue: NumericAggregate
): CryptoFourCriteriaAsset {
  const tvlChange7d = protocol && protocol.tvlWithChange > 0
    ? protocol.weightedTvlChange7d / protocol.tvlWithChange
    : undefined;
  const feeTrend = runRateChange(fees.total7d, fees.total30d);
  const revenueTrend = runRateChange(revenue.total7d, revenue.total30d);
  const bestGrowth = Math.max(tvlChange7d ?? Number.NEGATIVE_INFINITY, feeTrend ?? Number.NEGATIVE_INFINITY);
  const hasUsageObservation = Boolean(protocol?.matchedRows || fees.total30d > 0);

  const growth = !hasUsageObservation || !Number.isFinite(bestGrowth)
    ? criterion('unknown', 'Creștere', 'Date insuficiente', 'Nu există o serie gratuită comparabilă pentru utilizatori/activitate.')
    : bestGrowth >= 5
      ? criterion('pass', 'Creștere', formatPercent(bestGrowth), 'TVL sau ritmul anualizat al fees accelerează cu minimum 5%.')
      : bestGrowth >= 0
        ? criterion('watch', 'Creștere', formatPercent(bestGrowth), 'Activitatea este stabilă sau crește lent; necesită monitorizare.')
        : criterion('fail', 'Creștere', formatPercent(bestGrowth), 'Proxy-ul de activitate este în contracție față de perioada comparabilă.');

  const networkEvidence = fees.total30d >= 100_000 && ((protocol?.tvl || 0) >= 10_000_000 || (protocol?.chains.size || 0) >= 2);
  const networkEffect = networkEvidence
    ? criterion('pass', 'Efect de rețea', `${formatUsd(fees.total30d)} fees / 30z`, 'Activitate economică relevantă plus TVL sau distribuție multi-chain; acesta este un proxy, nu număr de utilizatori.')
    : fees.total30d > 0 || (protocol?.tvl || 0) > 0
      ? criterion('watch', 'Efect de rețea', fees.total30d > 0 ? `${formatUsd(fees.total30d)} fees / 30z` : `${formatUsd(protocol?.tvl || 0)} TVL`, 'Există utilizare măsurabilă, dar pragul proxy pentru efect de rețea nu este încă îndeplinit.')
      : criterion('unknown', 'Efect de rețea', 'Date insuficiente', 'Sursa gratuită nu oferă dovadă comparabilă de utilizare pentru acest token.');

  const revenueContinuity = revenue.total30d > 0 ? (revenue.total7d * (30 / 7)) / revenue.total30d : 0;
  const sustainableRevenue = revenue.total30d >= 100_000 && revenue.total7d > 0 && revenue.total24h > 0 && revenueContinuity >= 0.5
    ? criterion('pass', 'Venit sustenabil', `${formatUsd(revenue.total30d)} / 30z`, 'Venitul este material și apare în ferestrele de 24h, 7z și 30z.')
    : revenue.total30d > 0
      ? criterion('watch', 'Venit sustenabil', `${formatUsd(revenue.total30d)} / 30z`, 'Există venit, dar este prea mic, neregulat sau recent pentru confirmare.')
      : hasUsageObservation
        ? criterion('fail', 'Venit sustenabil', '$0 observat', 'Activitatea urmărită nu produce revenue reținut de protocol în această fereastră.')
        : criterion('unknown', 'Venit sustenabil', 'Date insuficiente', 'Nu există observații DefiLlama comparabile pentru acest token.');

  const holderValue = holderRevenue.total30d >= 10_000 && holderRevenue.total7d > 0
    ? criterion('pass', 'Valoare către holderi', `${formatUsd(holderRevenue.total30d)} / 30z`, 'DefiLlama raportează buyback/burn, distribuții sau staking finanțat din revenue.')
    : holderRevenue.total30d > 0
      ? criterion('watch', 'Valoare către holderi', `${formatUsd(holderRevenue.total30d)} / 30z`, 'Mecanismul există, dar valoarea observată este încă redusă sau neregulată.')
      : revenue.total30d > 0
        ? criterion('fail', 'Valoare către holderi', '$0 observat', 'Există revenue, dar nu este raportat un transfer de valoare către token holderi.')
        : criterion('unknown', 'Valoare către holderi', 'Date insuficiente', 'Fără revenue observat nu se poate confirma fee switch-ul sau distribuția.');

  const statuses = [growth.status, networkEffect.status, sustainableRevenue.status, holderValue.status];
  const passedCriteria = statuses.filter(status => status === 'pass').length;
  const firstThreePass = statuses.slice(0, 3).every(status => status === 'pass');
  const allFourPass = firstThreePass && holderValue.status === 'pass';
  const classification: CryptoFourCriteriaAsset['classification'] = allFourPass
    ? 'all-four'
    : firstThreePass
      ? 'first-three'
      : statuses.every(status => status === 'unknown')
        ? 'insufficient-data'
        : 'partial';

  return {
    id: coin.id,
    coinGeckoId: coin.coinGeckoId,
    symbol: coin.symbol.toUpperCase(),
    name: coin.name,
    image: coin.image,
    marketCapRank: Math.round(finitePositive(coin.marketCapRank)),
    marketCap: finitePositive(coin.marketCap),
    score: statuses.reduce((sum, status) => sum + scoreForStatus(status), 0),
    passedCriteria,
    classification,
    criteria: { growth, networkEffect, sustainableRevenue, holderValue },
    metrics: {
      tvl: protocol?.tvl || undefined,
      tvlChange7d,
      fees30d: fees.total30d || undefined,
      feeRunRateChange: feeTrend,
      revenue30d: revenue.total30d || undefined,
      revenueRunRateChange: revenueTrend,
      holdersRevenue30d: holderRevenue.total30d || undefined,
      chainCount: protocol?.chains.size || 0
    }
  };
}

const addMetric = (target: NumericAggregate, row: DefiLlamaMetricRow) => {
  target.total24h += finitePositive(row.total24h);
  target.total7d += finitePositive(row.total7d);
  target.total30d += finitePositive(row.total30d);
};

/**
 * Deterministic implementation of the four business-quality checks discussed
 * in the linked interview. Free sources do not expose comparable active-user
 * counts for all 200 tokens, so fees + TVL are labelled as usage/network
 * proxies and missing observations remain unknown.
 */
export function buildCryptoFourCriteriaScan(input: CryptoScannerInput): CryptoFourCriteriaScan {
  const coins = input.coins
    .filter(coin => coin.id && coin.symbol && finitePositive(coin.market_cap_rank) > 0)
    .sort((left, right) => finitePositive(left.market_cap_rank) - finitePositive(right.market_cap_rank))
    .slice(0, 200);
  const coinById = new Map(coins.map(coin => [coin.id.toLowerCase(), coin]));
  const coinsBySymbol = new Map<string, CoinGeckoMarketRow[]>();
  const coinByNormalizedName = new Map(coins.map(coin => [normalize(coin.name), coin]));
  for (const coin of coins) {
    const symbol = validSymbol(coin.symbol);
    if (!symbol) continue;
    coinsBySymbol.set(symbol, [...(coinsBySymbol.get(symbol) || []), coin]);
  }

  const protocolToCoinId = new Map<string, string>();
  const protocolAggregates = new Map<string, ProtocolAggregate>();
  for (const protocol of input.protocols) {
    const slug = String(protocol.slug || '').toLowerCase();
    const symbol = validSymbol(protocol.symbol);
    const directCoin = protocol.gecko_id ? coinById.get(protocol.gecko_id.toLowerCase()) : undefined;
    const symbolCoins = symbol ? coinsBySymbol.get(symbol) : undefined;
    const uniqueSymbolCoin = symbolCoins?.length === 1 ? symbolCoins[0] : undefined;
    const nameCoin = coinByNormalizedName.get(normalize(protocol.name));
    const coin = directCoin || uniqueSymbolCoin || nameCoin;
    if (!coin) continue;
    if (slug) protocolToCoinId.set(slug, coin.id);
    const current = protocolAggregates.get(coin.id) || {
      tvl: 0,
      weightedTvlChange7d: 0,
      tvlWithChange: 0,
      chains: new Set<string>(),
      matchedRows: 0
    };
    const tvl = finitePositive(protocol.tvl);
    const change7d = Number(protocol.change_7d);
    current.tvl += tvl;
    current.matchedRows += 1;
    if (tvl > 0 && Number.isFinite(change7d)) {
      current.weightedTvlChange7d += tvl * change7d;
      current.tvlWithChange += tvl;
    }
    for (const chain of protocol.chains || []) if (chain) current.chains.add(chain);
    protocolAggregates.set(coin.id, current);
  }

  const resolveMetricCoin = (row: DefiLlamaMetricRow): CoinGeckoMarketRow | undefined => {
    const slug = String(row.slug || '').toLowerCase();
    const mappedId = protocolToCoinId.get(slug);
    if (mappedId) return coinById.get(mappedId);
    const exactSlug = coinById.get(slug);
    if (exactSlug) return exactSlug;
    return coinByNormalizedName.get(normalize(row.name));
  };

  const aggregateMetrics = (rows: DefiLlamaMetricRow[]): Map<string, NumericAggregate> => {
    const result = new Map<string, NumericAggregate>();
    for (const row of rows) {
      const coin = resolveMetricCoin(row);
      if (!coin) continue;
      const aggregate = result.get(coin.id) || { total24h: 0, total7d: 0, total30d: 0 };
      addMetric(aggregate, row);
      result.set(coin.id, aggregate);
    }
    return result;
  };

  const feeByCoin = aggregateMetrics(input.fees);
  const revenueByCoin = aggregateMetrics(input.revenue);
  const holderRevenueByCoin = aggregateMetrics(input.holdersRevenue);

  const assets: CryptoFourCriteriaAsset[] = coins.map(coin => {
    const protocol = protocolAggregates.get(coin.id);
    const fees = feeByCoin.get(coin.id) || { total24h: 0, total7d: 0, total30d: 0 };
    const revenue = revenueByCoin.get(coin.id) || { total24h: 0, total7d: 0, total30d: 0 };
    const holderRevenue = holderRevenueByCoin.get(coin.id) || { total24h: 0, total7d: 0, total30d: 0 };
    return evaluateCryptoFourCriteriaAsset({
      id: coin.id,
      coinGeckoId: coin.coin_gecko_id,
      symbol: coin.symbol,
      name: coin.name,
      image: coin.image,
      marketCapRank: Math.round(finitePositive(coin.market_cap_rank)),
      marketCap: finitePositive(coin.market_cap)
    }, protocol, fees, revenue, holderRevenue);
  }).sort((left, right) =>
    right.passedCriteria - left.passedCriteria ||
    right.score - left.score ||
    (right.metrics.revenue30d || 0) - (left.metrics.revenue30d || 0) ||
    left.marketCapRank - right.marketCapRank
  );

  const coveredCount = assets.filter(asset => asset.classification !== 'insufficient-data').length;
  return {
    scannedCount: coins.length,
    coveredCount,
    allFourCount: assets.filter(asset => asset.classification === 'all-four').length,
    firstThreeCount: assets.filter(asset => asset.classification === 'all-four' || asset.classification === 'first-three').length,
    assets,
    generatedAt: input.generatedAt || Date.now(),
    dataFreshness: 'CoinGecko/CoinPaprika + DefiLlama live; cache 30 minute',
    methodology: [
      'Creștere: schimbarea TVL pe 7 zile sau accelerarea fees (ritm 7z vs 30z).',
      'Efect de rețea: proxy conservator bazat pe fees, TVL și prezență multi-chain; nu pretinde utilizatori activi exacți.',
      'Venit sustenabil: revenue material și prezent concomitent în ferestrele 24h, 7z și 30z.',
      'Valoare către holderi: holders revenue raportat ca buyback/burn, distribuție directă sau staking finanțat din venit.'
    ],
    sources: [
      { id: 'video', title: 'Criteriile din interviu (30:03–30:35)', url: 'https://youtu.be/oZWS5eB5YsQ?t=1803', domain: 'youtube.com' },
      { id: 'coingecko', title: 'Top crypto după market cap', url: 'https://www.coingecko.com/', domain: 'coingecko.com' },
      { id: 'coinpaprika', title: 'Fallback top crypto după market cap', url: 'https://coinpaprika.com/', domain: 'coinpaprika.com' },
      { id: 'defillama', title: 'TVL, Fees, Revenue & Holders Revenue', url: 'https://defillama.com/metrics', domain: 'defillama.com' },
      { id: 'definitions', title: 'Definițiile metrice DefiLlama', url: 'https://defillama.com/data-definitions', domain: 'defillama.com' }
    ],
    disclaimer: 'Scanner fundamental de cercetare, nu semnal de cumpărare. „Pass” înseamnă că pragul proxy este îndeplinit în datele curente, nu că investiția va fi profitabilă.'
  };
}

const fetchJson = async <T>(fetcher: typeof fetch, url: string): Promise<T> => {
  const response = await fetcher(url, {
    headers: { accept: 'application/json', 'user-agent': 'MoneyScanner360/1.0' },
    signal: AbortSignal.timeout(25_000)
  });
  if (!response.ok) throw new Error(`${new URL(url).hostname} returned HTTP ${response.status}`);
  return response.json() as Promise<T>;
};

const fetchCoinMarkets = async (fetcher: typeof fetch): Promise<CoinGeckoMarketRow[]> => {
  try {
    const rows = await fetchJson<CoinGeckoMarketRow[]>(fetcher, COINGECKO_MARKETS_URL);
    return rows.map(row => ({ ...row, coin_gecko_id: row.id }));
  } catch {
    // CoinGecko's no-key endpoint can briefly return 429. A separate public
    // market-cap source keeps the scan available instead of fabricating ranks.
    const rows = await fetchJson<CoinPaprikaMarketRow[]>(fetcher, COINPAPRIKA_MARKETS_URL);
    return rows.map(row => ({
      id: row.id,
      symbol: row.symbol,
      name: row.name,
      market_cap_rank: row.rank,
      market_cap: row.quotes?.USD?.market_cap
    }));
  }
};

export async function scanCryptoFourCriteria(fetcher: typeof fetch = fetch): Promise<CryptoFourCriteriaScan> {
  const [coins, protocols, feeResponse, revenueResponse, holderRevenueResponse] = await Promise.all([
    fetchCoinMarkets(fetcher),
    fetchJson<DefiLlamaProtocolRow[]>(fetcher, DEFILLAMA_PROTOCOLS_URL),
    fetchJson<DefiLlamaMetricResponse>(fetcher, DEFILLAMA_FEES_URL),
    fetchJson<DefiLlamaMetricResponse>(fetcher, DEFILLAMA_REVENUE_URL),
    fetchJson<DefiLlamaMetricResponse>(fetcher, DEFILLAMA_HOLDERS_REVENUE_URL)
  ]);
  return buildCryptoFourCriteriaScan({
    coins,
    protocols,
    fees: feeResponse.protocols || [],
    revenue: revenueResponse.protocols || [],
    holdersRevenue: holderRevenueResponse.protocols || []
  });
}
