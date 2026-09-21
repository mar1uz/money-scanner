import {
  CryptoCriterionResult,
  CryptoCriteriaStatus,
  CryptoFourCriteriaAsset,
  CryptoFourCriteriaScan,
  CryptoUndervaluedEntry
} from '@money-scanner/shared';

const COINGECKO_MARKETS_URL = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=false&price_change_percentage=24h,7d';
const COINGECKO_MARKETS_BY_IDS_URL = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&sparkline=false&price_change_percentage=24h,7d&ids=';
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
  price_change_percentage_24h?: number;
  price_change_percentage_7d_in_currency?: number;
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
  category?: string;
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
  /** Coins discovered via DefiLlama coverage beyond the market-cap top list;
      unmeasured candidates are dropped from the returned universe. */
  candidateIds?: Set<string>;
  generatedAt?: number;
}

const finiteNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

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

/** Percentile (0-100) of value inside an ascending-sorted array. */
const percentileOf = (sortedAsc: number[], value: number): number => {
  if (sortedAsc.length <= 1) return 50;
  let below = 0;
  for (const item of sortedAsc) if (item < value) below += 1;
  return (below / (sortedAsc.length - 1)) * 100;
};

/**
 * Undervaluation ranking on Marius's 3 factors: quality (network effect +
 * sustainable revenue + holder value, same thresholds) versus expensiveness
 * (mcap / annualized revenue, fees as fallback for L1s without revenue).
 * Index = quality percentile - expensiveness percentile, most undervalued
 * first. Assets without any observable fees/revenue are never ranked.
 */
const buildUndervaluedRanking = (assets: CryptoFourCriteriaAsset[]): { undervalued: CryptoUndervaluedEntry[]; unrankedCount: number } => {
  const candidates = assets
    .map(asset => {
      const revenue30d = asset.metrics.revenue30d || 0;
      const fees30d = asset.metrics.fees30d || 0;
      const holders30d = asset.metrics.holdersRevenue30d || 0;
      const basis: 'revenue' | 'fees' | 'holders' | null = revenue30d > 0 ? 'revenue' : fees30d > 0 ? 'fees' : holders30d > 0 ? 'holders' : null;
      if (!basis || asset.marketCap <= 0) return undefined;
      const annualized = (basis === 'revenue' ? revenue30d : basis === 'fees' ? fees30d : holders30d) * 12;
      const valuationRatio = annualized > 0 ? asset.marketCap / annualized : undefined;
      if (!valuationRatio || !Number.isFinite(valuationRatio)) return undefined;
      const qualityScore = scoreForStatus(asset.criteria.networkEffect.status)
        + scoreForStatus(asset.criteria.sustainableRevenue.status)
        + scoreForStatus(asset.criteria.holderValue.status);
      return {
        assetId: asset.id,
        symbol: asset.symbol,
        name: asset.name,
        image: asset.image,
        marketCapRank: asset.marketCapRank,
        marketCap: asset.marketCap,
        factorStatuses: {
          networkEffect: asset.criteria.networkEffect.status,
          sustainableRevenue: asset.criteria.sustainableRevenue.status,
          holderValue: asset.criteria.holderValue.status
        },
        qualityScore,
        valuationRatio,
        valuationBasis: basis,
        priceChange24h: asset.priceChange24h,
        priceChange7d: asset.priceChange7d
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  const qualityValues = candidates.map(entry => entry.qualityScore).sort((a, b) => a - b);
  const logRatios = candidates.map(entry => Math.log(entry.valuationRatio)).sort((a, b) => a - b);

  const undervalued: CryptoUndervaluedEntry[] = candidates.map(entry => {
    const qualityPercentile = Math.round(percentileOf(qualityValues, entry.qualityScore));
    const expensivenessPercentile = Math.round(percentileOf(logRatios, Math.log(entry.valuationRatio)));
    return {
      ...entry,
      qualityPercentile,
      expensivenessPercentile,
      undervaluationIndex: qualityPercentile - expensivenessPercentile
    };
  }).sort((left, right) =>
    right.undervaluationIndex - left.undervaluationIndex ||
    right.qualityScore - left.qualityScore ||
    left.valuationRatio - right.valuationRatio
  );

  return { undervalued, unrankedCount: assets.length - undervalued.length };
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
  holderRevenue: NumericAggregate,
  isChain = false
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

  const networkEvidence = fees.total30d >= 1_000_000 && ((protocol?.tvl || 0) >= 10_000_000 || (protocol?.chains.size || 0) >= 2);
  const networkEffect = networkEvidence
    ? criterion('pass', 'Efect de rețea', `${formatUsd(fees.total30d)} fees / 30z`, 'Activitate economică relevantă plus TVL sau distribuție multi-chain; acesta este un proxy, nu număr de utilizatori.')
    : fees.total30d > 0 || (protocol?.tvl || 0) > 0
      ? criterion('watch', 'Efect de rețea', fees.total30d > 0 ? `${formatUsd(fees.total30d)} fees / 30z` : `${formatUsd(protocol?.tvl || 0)} TVL`, 'Există utilizare măsurabilă, dar pragul proxy pentru efect de rețea nu este încă îndeplinit.')
      : criterion('unknown', 'Efect de rețea', 'Date insuficiente', 'Sursa gratuită nu oferă dovadă comparabilă de utilizare pentru acest token.');

  // L1 fix: for chains, fees ARE the network's revenue (they pay
  // validators/miners); without this, BTC/ETH-class assets were penalized for
  // having no protocol-retained revenue while paying real security revenue.
  const useChainFees = isChain && fees.total30d > revenue.total30d;
  const basis24h = useChainFees ? fees.total24h : revenue.total24h;
  const basis7d = useChainFees ? fees.total7d : revenue.total7d;
  const basis30d = useChainFees ? fees.total30d : revenue.total30d;
  const revenueContinuity = basis30d > 0 ? (basis7d * (30 / 7)) / basis30d : 0;
  const sustainableRevenue = basis30d >= 1_000_000 && basis7d > 0 && basis24h > 0 && revenueContinuity >= 0.5
    ? criterion('pass', 'Venit sustenabil', `${formatUsd(basis30d)}${useChainFees ? ' fees L1' : ''} / 30z`, useChainFees
      ? 'Fees reale ale rețelei (către validatori/mineri) de minimum $1M/30z, prezente în ferestrele 24h, 7z și 30z.'
      : 'Venit de minimum $1M/30z reținut de protocol, prezent concomitent în ferestrele 24h, 7z și 30z.')
    : basis30d > 0
      ? criterion('watch', 'Venit sustenabil', `${formatUsd(basis30d)}${useChainFees ? ' fees L1' : ''} / 30z`, 'Există venit, dar este sub $1M/30z, neregulat sau recent pentru confirmare.')
      : hasUsageObservation
        ? criterion('fail', 'Venit sustenabil', '$0 observat', 'Activitatea urmărită nu produce revenue reținut de protocol în această fereastră.')
        : criterion('unknown', 'Venit sustenabil', 'Date insuficiente', 'Nu există observații DefiLlama comparabile pentru acest token.');

  const holderValue = holderRevenue.total30d >= 100_000 && holderRevenue.total7d > 0
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
    .filter(coin => coin.id && coin.symbol && (finitePositive(coin.market_cap_rank) > 0 || finitePositive(coin.market_cap) > 0))
    .sort((left, right) =>
      (finitePositive(left.market_cap_rank) || Number.MAX_SAFE_INTEGER) - (finitePositive(right.market_cap_rank) || Number.MAX_SAFE_INTEGER)
    );
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

  const aggregateMetrics = (rows: DefiLlamaMetricRow[], chainCoinIds?: Set<string>): Map<string, NumericAggregate> => {
    const result = new Map<string, NumericAggregate>();
    for (const row of rows) {
      const coin = resolveMetricCoin(row);
      if (!coin) continue;
      if (chainCoinIds && String(row.category || '').toLowerCase() === 'chain') chainCoinIds.add(coin.id);
      const aggregate = result.get(coin.id) || { total24h: 0, total7d: 0, total30d: 0 };
      addMetric(aggregate, row);
      result.set(coin.id, aggregate);
    }
    return result;
  };

  const chainCoinIds = new Set<string>();
  const feeByCoin = aggregateMetrics(input.fees, chainCoinIds);
  const revenueByCoin = aggregateMetrics(input.revenue);
  const holderRevenueByCoin = aggregateMetrics(input.holdersRevenue);

  const assets: CryptoFourCriteriaAsset[] = coins.map(coin => {
    const protocol = protocolAggregates.get(coin.id);
    const fees = feeByCoin.get(coin.id) || { total24h: 0, total7d: 0, total30d: 0 };
    const revenue = revenueByCoin.get(coin.id) || { total24h: 0, total7d: 0, total30d: 0 };
    const holderRevenue = holderRevenueByCoin.get(coin.id) || { total24h: 0, total7d: 0, total30d: 0 };
    const evaluated = evaluateCryptoFourCriteriaAsset({
      id: coin.id,
      coinGeckoId: coin.coin_gecko_id,
      symbol: coin.symbol,
      name: coin.name,
      image: coin.image,
      marketCapRank: Math.round(finitePositive(coin.market_cap_rank)),
      marketCap: finitePositive(coin.market_cap)
    }, protocol, fees, revenue, holderRevenue, chainCoinIds.has(coin.id));
    evaluated.priceChange24h = finiteNumber(coin.price_change_percentage_24h);
    evaluated.priceChange7d = finiteNumber(coin.price_change_percentage_7d_in_currency);
    return evaluated;
  }).sort((left, right) =>
    right.passedCriteria - left.passedCriteria ||
    right.score - left.score ||
    (right.metrics.revenueRunRateChange ?? Number.NEGATIVE_INFINITY) - (left.metrics.revenueRunRateChange ?? Number.NEGATIVE_INFINITY) ||
    (right.metrics.feeRunRateChange ?? Number.NEGATIVE_INFINITY) - (left.metrics.feeRunRateChange ?? Number.NEGATIVE_INFINITY) ||
    (left.marketCapRank || Number.MAX_SAFE_INTEGER) - (right.marketCapRank || Number.MAX_SAFE_INTEGER)
  );

  // Universe rule: top-market-cap coins stay for continuity; candidate coins
  // discovered through DefiLlama stay only when they carry real data.
  const isMeasuredAsset = (asset: CryptoFourCriteriaAsset): boolean =>
    (asset.metrics.fees30d || 0) > 0 || (asset.metrics.revenue30d || 0) > 0 || (asset.metrics.holdersRevenue30d || 0) > 0;
  const universe = input.candidateIds
    ? assets.filter(asset => isMeasuredAsset(asset) || !input.candidateIds!.has(asset.id))
    : assets;
  assets.length = 0;
  assets.push(...universe);

  const coveredCount = assets.filter(asset => asset.classification !== 'insufficient-data').length;
  const { undervalued, unrankedCount } = buildUndervaluedRanking(assets);
  return {
    scannedCount: coins.length,
    coveredCount,
    allFourCount: assets.filter(asset => asset.classification === 'all-four').length,
    firstThreeCount: assets.filter(asset => asset.classification === 'all-four' || asset.classification === 'first-three').length,
    assets,
    undervalued,
    unrankedCount,
    generatedAt: input.generatedAt || Date.now(),
    dataFreshness: 'CoinGecko/CoinPaprika + DefiLlama live; cache 30 minute',
    methodology: [
      'Creștere: schimbarea TVL pe 7 zile sau accelerarea fees (ritm 7z vs 30z).',
      'Efect de rețea: fees ≥$1M/30z plus TVL sau prezență multi-chain; proxy conservator, nu utilizatori activi exacți.',
      'Venit sustenabil: revenue ≥$1M/30z prezent concomitent în ferestrele 24h, 7z și 30z; pentru L1-uri (BTC, ETH, SOL) se folosesc fees rețelei, care merg la validatori/mineri.',
      'Valoare către holderi: buyback/burn, distribuții sau staking finanțat din venit ≥$100K/30z raportat de DefiLlama.',
      'Model de subevaluare (tab Calitate Business): scor calitate 0-75 = Efect de rețea + Venit sustenabil + Valoare către holderi, aceleași praguri.',
      'Evaluare: P/R = market cap / (revenue 30z × 12); fallback P/F din fees, respectiv P/H din buyback/burn anualizat când lipsesc ambele.',
      'Index subevaluare = percentila calității − percentila scumpirii (log P/R) în universul acoperit; activele fără fees/revenue nu sunt clasate.',
      'Selecție secțiune: sunt listate doar monedele cu fees/revenue observabile sau buyback/burn raportat; sortare după criterii trecute, apoi ritmul revenue (7z vs 30z) și rank — nu dimensiunea absolută.'
    ],
    sources: [
      { id: 'video', title: 'Criteriile din interviu (30:03–30:35)', url: 'https://youtu.be/oZWS5eB5YsQ?t=1803', domain: 'youtube.com' },
      { id: 'coingecko', title: 'Top crypto după market cap', url: 'https://www.coingecko.com/', domain: 'coingecko.com' },
      { id: 'coinpaprika', title: 'Fallback top crypto după market cap', url: 'https://coinpaprika.com/', domain: 'coinpaprika.com' },
      { id: 'defillama', title: 'TVL, Fees, Revenue & Holders Revenue', url: 'https://defillama.com/metrics', domain: 'defillama.com' },
      { id: 'definitions', title: 'Definițiile metrice DefiLlama', url: 'https://defillama.com/data-definitions', domain: 'defillama.com' }
    ],
    disclaimer: 'Scanner fundamental de cercetare, nu semnal de cumpărare. „Pass” înseamnă că pragul proxy este îndeplinit în datele curente; indexul de subevaluare este un model euristic pe percentile, nu o estimare de valoare justă.'
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

/** Batch-fetch market data for coins beyond the top list (demo key when present). */
const fetchCoinsByIds = async (fetcher: typeof fetch, ids: string[]): Promise<CoinGeckoMarketRow[]> => {
  const result: CoinGeckoMarketRow[] = [];
  for (let index = 0; index < ids.length; index += 250) {
    const chunk = ids.slice(index, index + 250);
    try {
      const response = await fetcher(`${COINGECKO_MARKETS_BY_IDS_URL}${chunk.join('%2C')}`, {
        headers: {
          accept: 'application/json',
          'user-agent': 'MoneyScanner360/1.0',
          ...(process.env.COINGECKO_API_KEY ? { 'x-cg-demo-api-key': process.env.COINGECKO_API_KEY } : {})
        },
        signal: AbortSignal.timeout(25_000)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const rows = await response.json() as CoinGeckoMarketRow[];
      result.push(...rows.map(row => ({ ...row, coin_gecko_id: row.id })));
    } catch (error) {
      console.warn(`CoinGecko candidate chunk failed (${chunk.length} ids):`, error instanceof Error ? error.message : error);
    }
    if (index + 250 < ids.length) await new Promise(resolve => setTimeout(resolve, 1500));
  }
  return result;
};

export async function scanCryptoFourCriteria(fetcher: typeof fetch = fetch): Promise<CryptoFourCriteriaScan> {
  const [coins, protocols, feeResponse, revenueResponse, holderRevenueResponse] = await Promise.all([
    fetchCoinMarkets(fetcher),
    fetchJson<DefiLlamaProtocolRow[]>(fetcher, DEFILLAMA_PROTOCOLS_URL),
    fetchJson<DefiLlamaMetricResponse>(fetcher, DEFILLAMA_FEES_URL),
    fetchJson<DefiLlamaMetricResponse>(fetcher, DEFILLAMA_REVENUE_URL),
    fetchJson<DefiLlamaMetricResponse>(fetcher, DEFILLAMA_HOLDERS_REVENUE_URL)
  ]);
  const fees = feeResponse.protocols || [];
  const revenue = revenueResponse.protocols || [];
  const holdersRevenue = holderRevenueResponse.protocols || [];

  // Universe expansion (Marius): start from DefiLlama coverage, not the market
  // cap top list. Every token with real fees/revenue/buyback data qualifies,
  // whatever its rank; unmatched protocol rows (no gecko_id) are excluded.
  const overviewSlugs = new Set<string>();
  for (const row of [...fees, ...revenue, ...holdersRevenue]) {
    const slug = String(row.slug || '').toLowerCase();
    if (slug) overviewSlugs.add(slug);
  }
  const knownIds = new Set(coins.map(coin => coin.id.toLowerCase()));
  const candidateIds: string[] = [];
  const seenCandidates = new Set<string>();
  for (const protocol of protocols) {
    const geckoId = String(protocol.gecko_id || '').toLowerCase();
    const slug = String(protocol.slug || '').toLowerCase();
    if (!geckoId || !slug || knownIds.has(geckoId) || seenCandidates.has(geckoId)) continue;
    if (overviewSlugs.has(slug)) {
      seenCandidates.add(geckoId);
      candidateIds.push(geckoId);
    }
  }
  const extraCoins = await fetchCoinsByIds(fetcher, candidateIds);
  const extraIdSet = new Set(extraCoins.map(coin => coin.id.toLowerCase()));

  return buildCryptoFourCriteriaScan({
    coins: [...coins, ...extraCoins],
    protocols,
    fees,
    revenue,
    holdersRevenue,
    candidateIds: extraIdSet
  });
}
