import {
  cryptoValuation,
  midrankPercentile,
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
  fully_diluted_valuation?: number;
  last_updated?: string;
  market_data_source?: 'coingecko' | 'coinpaprika';
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
  parentProtocol?: string;
  tvl?: number | null;
  change_7d?: number | null;
  chains?: string[];
}

interface DefiLlamaMetricRow {
  parentProtocol?: string;
  defillamaId?: string;
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
  observed30d?: boolean;
  incomplete30d?: boolean;
  incomplete7d?: boolean;
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

// Marius (2026-09-23): GROWTH / REVENUE / HOLDERS stay binary data completeness
// (pass=25, anything else 0). NETWORK is again a quality gate with the old
// intermediate state: pass=25, watch=12, unknown/fail=0.
const scoreForStatus = (status: CryptoCriteriaStatus): number => {
  if (status === 'pass') return 25;
  if (status === 'watch') return 12;
  return 0;
};

/**
 * Undervaluation ranking on Marius's 3 factors: quality (network effect +
 * sustainable revenue + holder value, same thresholds) versus expensiveness
 * (mcap / annualized revenue, holder distributions as fallback).
 * Index = quality percentile - expensiveness percentile, most undervalued
 * first. Assets without any observable fees/revenue are never ranked, and
 * since 2026-09-23 fees-basis assets (no revenue, no holder data) are
 * excluded entirely - see below.
 */
const buildUndervaluedRanking = (assets: CryptoFourCriteriaAsset[]): { undervalued: CryptoUndervaluedEntry[]; unrankedCount: number } => {
  const candidates = assets
    .map(asset => {
      const { basis, multiple: valuationRatio } = cryptoValuation(asset);
      if (!basis || valuationRatio === undefined || !Number.isFinite(valuationRatio)) return undefined;
      // Marius (2026-09-23, revenue-first): an asset with no revenue and no
      // holder data falls back to a P/F multiple, which says nothing about
      // value capture - EIGEN ranked #2 at 88x P/F and FF #3 at 128x, above
      // real P/R 5-12x names, because fees-basis assets were only compared
      // against each other. On a public "undervalued" list that is
      // misleading, so fees-basis assets are excluded from the ranking
      // entirely. They still appear in `assets` with their metrics; they are
      // simply not ranked on value.
      if (basis === 'fees') return undefined;
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
        passedCriteria: [asset.criteria.growth.status, asset.criteria.networkEffect.status, asset.criteria.sustainableRevenue.status, asset.criteria.holderValue.status].filter(status => status === 'pass').length,
        valuationRatio,
        valuationBasis: basis,
        priceChange24h: asset.priceChange24h,
        priceChange7d: asset.priceChange7d
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  const undervalued: CryptoUndervaluedEntry[] = candidates.map(entry => {
    // Fees, retained revenue and holder distributions are different denominators.
    const peers = candidates.filter(peer => peer.valuationBasis === entry.valuationBasis);
    const qualityPercentile = Math.round(midrankPercentile(peers.map(peer => peer.qualityScore), entry.qualityScore));
    const expensivenessPercentile = Math.round(midrankPercentile(peers.map(peer => peer.valuationRatio), entry.valuationRatio));
    return {
      ...entry,
      qualityPercentile,
      expensivenessPercentile,
      undervaluationIndex: qualityPercentile - expensivenessPercentile
    };
  }).sort((left, right) =>
    // Marius (2026-09-22): 4/4 undervalued first, then 3/4, then 2/4;
    // the index only orders assets inside the same criteria group.
    right.passedCriteria - left.passedCriteria ||
    right.undervaluationIndex - left.undervaluationIndex ||
    right.qualityScore - left.qualityScore ||
    left.valuationRatio - right.valuationRatio
  );

  return { undervalued, unrankedCount: assets.length - undervalued.length };
};

const runRateChange = (total7d: number, total30d: number): number | undefined => {
  if (total7d < 0 || total30d <= 0) return undefined;
  return ((total7d * (30 / 7)) / total30d - 1) * 100;
};

/**
 * Size factor (Marius, 2026-09-23, option 2, revenue-first revision): inside
 * the same criteria/score tier, absolute 30-day size breaks the tie BEFORE
 * acceleration, so a chain earning $168K/month cannot outrank protocols
 * earning millions on acceleration alone. Revenue is the primary measure and
 * holder distributions count as revenue where that is the retention route;
 * fees are the fallback ONLY when no revenue/holder data exists at all (the
 * L1-chain case) - a protocol reporting $0 revenue with big fees ranks by its
 * real capture (low), not by gross activity. Deterministic: the log10 scale
 * makes every decade of magnitude worth 10 points, so assets inside the same
 * decade fall through to acceleration.
 */
const sizeBasisUsd = (asset: CryptoFourCriteriaAsset): number => {
  const revenue = asset.metrics.revenue30d;
  const holders = asset.metrics.holdersRevenue30d;
  const capture = revenue === undefined ? holders : Math.max(revenue, holders ?? 0);
  if (capture === undefined) return asset.metrics.fees30d ?? 0;
  return capture;
};
const sizeScore = (asset: CryptoFourCriteriaAsset): number =>
  Math.round(Math.log10(1 + sizeBasisUsd(asset)) * 10);

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
  const feeTrend = fees.incomplete30d || fees.incomplete7d ? undefined : runRateChange(fees.total7d, fees.total30d);
  const revenueTrend = revenue.incomplete30d || revenue.incomplete7d ? undefined : runRateChange(revenue.total7d, revenue.total30d);
  const bestGrowth = Math.max(tvlChange7d ?? Number.NEGATIVE_INFINITY, feeTrend ?? Number.NEGATIVE_INFINITY);
  const hasUsageObservation = Boolean(protocol?.matchedRows || fees.total30d > 0);

  const growth = !hasUsageObservation || !Number.isFinite(bestGrowth)
    ? criterion('unknown', 'Creștere', 'Date insuficiente', 'Nu există o serie gratuită comparabilă pentru utilizatori/activitate.')
    : criterion('pass', 'Creștere', formatPercent(bestGrowth), 'Există date comparabile de creștere; criteriul validează completitudinea datelor, nu un prag minim de performanță.');

  // Marius (2026-09-23): NETWORK is a quality gate again, not data completeness.
  // Pass ONLY when 30-day fees >= $100K AND TVL >= $10M; the old ">= 2 chains"
  // alternative is deliberately dropped. Watch when the pass rule is unmet but
  // some usage exists (fees30d > 0 or TVL > 0); unknown when no usage data.
  const networkPass = fees.total30d >= 100_000 && (protocol?.tvl || 0) >= 10_000_000;
  const networkEffect = networkPass
    ? criterion('pass', 'Efect de rețea', `${formatUsd(fees.total30d)} fees / 30z`, 'Activitate economică relevantă (fees ≥ $100K / 30z) plus TVL ≥ $10M; acesta este un proxy, nu număr de utilizatori.')
    : fees.total30d > 0 || (protocol?.tvl || 0) > 0
      ? criterion('watch', 'Efect de rețea', fees.total30d > 0 ? `${formatUsd(fees.total30d)} fees / 30z` : `${formatUsd(protocol?.tvl || 0)} TVL`, 'Există utilizare măsurabilă, dar pragul proxy pentru efect de rețea (fees ≥ $100K / 30z și TVL ≥ $10M) nu este încă îndeplinit.')
      : criterion('unknown', 'Efect de rețea', 'Date insuficiente', 'Sursa gratuită nu oferă dovadă comparabilă de utilizare pentru acest token.');

  // L1 fix: for chains, fees ARE the network's revenue (they pay
  // validators/miners); without this, BTC/ETH-class assets were penalized for
  // having no protocol-retained revenue while paying real security revenue.
  const useChainFees = isChain && fees.total30d > revenue.total30d;
  const basis30d = useChainFees ? fees.total30d : revenue.total30d;
  const revenueAggregate = useChainFees ? fees : revenue;
  const sustainableRevenue = revenueAggregate.observed30d === false || revenueAggregate.incomplete30d
    ? criterion('unknown', 'Venit sustenabil', 'Date insuficiente', 'Revenue lipsește sau acoperirea ferestrei de 30 zile este incompletă.')
    : criterion('pass', 'Venit sustenabil', `${formatUsd(basis30d)}${useChainFees ? ' fees L1' : ''} / 30z`, 'Există date complete pe 30 zile; criteriul validează completitudinea datelor, nu un prag minim de venit.');

  const holderValue = holderRevenue.observed30d === false || holderRevenue.incomplete30d
    ? criterion('unknown', 'Valoare către holderi', 'Date insuficiente', 'Lipsa raportării nu înseamnă zero; datele despre distribuțiile către holderi sunt incomplete.')
    : criterion('pass', 'Valoare către holderi', holderRevenue.total30d > 0 ? `${formatUsd(holderRevenue.total30d)} / 30z` : '$0 observat', 'Există date complete despre transferul de valoare către holderi; criteriul validează completitudinea datelor, inclusiv zero raportat.');

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
      fees30d: fees.observed30d === false || fees.incomplete30d ? undefined : fees.total30d,
      feeRunRateChange: feeTrend,
      revenue30d: revenue.observed30d === false || revenue.incomplete30d ? undefined : revenue.total30d,
      revenueRunRateChange: revenueTrend,
      holdersRevenue30d: holderRevenue.observed30d === false || holderRevenue.incomplete30d ? undefined : holderRevenue.total30d,
      chainCount: protocol?.chains.size || 0
    }
  };
}

const addMetric = (target: NumericAggregate, row: DefiLlamaMetricRow) => {
  if (typeof row.total30d === 'number' && Number.isFinite(row.total30d) && row.total30d >= 0) target.observed30d = true;
  else target.incomplete30d = true;
  if (typeof row.total7d !== 'number' || !Number.isFinite(row.total7d) || row.total7d < 0) target.incomplete7d = true;
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
  const uniqueCoins = new Map<string, CoinGeckoMarketRow>();
  for (const coin of input.coins) {
    const key = coin.coin_gecko_id || coin.id;
    if (!uniqueCoins.has(key) || coin.market_data_source === 'coingecko') uniqueCoins.set(key, coin);
  }
  const coins = [...uniqueCoins.values()]
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

  const familyCoinIds = new Map<string, Set<string>>();
  for (const protocol of input.protocols) {
    if (!protocol.parentProtocol || !protocol.gecko_id) continue;
    const ids = familyCoinIds.get(protocol.parentProtocol) || new Set<string>();
    ids.add(protocol.gecko_id.toLowerCase());
    familyCoinIds.set(protocol.parentProtocol, ids);
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
    // An explicit provider ID must never be overridden by a coincident symbol.
    const familyIds = protocol.parentProtocol ? familyCoinIds.get(protocol.parentProtocol) : undefined;
    const familyCoin = familyIds?.size === 1 ? coinById.get([...familyIds][0]) : undefined;
    const namedSymbolCoin = uniqueSymbolCoin && (
      normalize(protocol.name).startsWith(normalize(uniqueSymbolCoin.name)) ||
      normalize(protocol.parentProtocol?.replace('parent#', '')) === normalize(uniqueSymbolCoin.coin_gecko_id || uniqueSymbolCoin.id)
    ) ? uniqueSymbolCoin : undefined;
    const coin = protocol.gecko_id ? directCoin : familyIds?.size ? familyCoin : namedSymbolCoin || nameCoin;
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
    const change7d = finiteNumber(protocol.change_7d);
    current.tvl += tvl;
    current.matchedRows += 1;
    if (tvl > 0 && change7d !== undefined) {
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
    // Do not fall back to a name if an explicit protocol ID was unmatched.
    if (input.protocols.some(protocol => protocol.slug?.toLowerCase() === slug && protocol.gecko_id)) return undefined;
    const exactSlug = coinById.get(slug);
    if (exactSlug) return exactSlug;
    return coinByNormalizedName.get(normalize(row.name));
  };

  const aggregateMetrics = (rows: DefiLlamaMetricRow[], chainCoinIds?: Set<string>): Map<string, NumericAggregate> => {
    const result = new Map<string, NumericAggregate>();
    const seen = new Set<string>();
    const parentIds = new Set(rows.map(row => row.defillamaId).filter(Boolean));
    for (const row of rows) {
      // Parent totals already include children. Also ignore duplicate rows.
      if (row.parentProtocol && parentIds.has(row.parentProtocol)) continue;
      const key = row.defillamaId || row.slug || normalize(row.name);
      if (seen.has(key)) continue;
      seen.add(key);
      const coin = resolveMetricCoin(row);
      if (!coin) continue;
      if (chainCoinIds && String(row.category || '').toLowerCase() === 'chain') chainCoinIds.add(coin.id);
      const aggregate = result.get(coin.id) || { total24h: 0, total7d: 0, total30d: 0, observed30d: false };
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
    const fees = feeByCoin.get(coin.id) || { total24h: 0, total7d: 0, total30d: 0, observed30d: false };
    const revenue = revenueByCoin.get(coin.id) || { total24h: 0, total7d: 0, total30d: 0, observed30d: false };
    const holderRevenue = holderRevenueByCoin.get(coin.id) || { total24h: 0, total7d: 0, total30d: 0, observed30d: false };
    const evaluated = evaluateCryptoFourCriteriaAsset({
      id: coin.id,
      coinGeckoId: coin.coin_gecko_id,
      symbol: coin.symbol,
      name: coin.name,
      image: coin.image,
      marketCapRank: Math.round(finitePositive(coin.market_cap_rank)),
      marketCap: finitePositive(coin.market_cap)
    }, protocol, fees, revenue, holderRevenue, chainCoinIds.has(coin.id));
    evaluated.fullyDilutedValuation = finitePositive(coin.fully_diluted_valuation) || undefined;
    evaluated.marketDataSource = coin.market_data_source;
    evaluated.marketDataUpdatedAt = coin.last_updated;
    evaluated.protocolSlugs = [...protocolToCoinId].filter(([, id]) => id === coin.id).map(([slug]) => slug);
    evaluated.priceChange24h = finiteNumber(coin.price_change_percentage_24h);
    evaluated.priceChange7d = finiteNumber(coin.price_change_percentage_7d_in_currency);
    return evaluated;
  }).sort((left, right) =>
    right.passedCriteria - left.passedCriteria ||
    right.score - left.score ||
    sizeScore(right) - sizeScore(left) ||
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

  const coveredCount = universe.filter(asset => asset.classification !== 'insufficient-data').length;
  const { undervalued, unrankedCount } = buildUndervaluedRanking(universe);
  return {
    methodologyVersion: 6,
    scannedCount: coins.length,
    coveredCount,
    allFourCount: universe.filter(asset => asset.classification === 'all-four').length,
    firstThreeCount: universe.filter(asset => asset.classification === 'all-four' || asset.classification === 'first-three').length,
    assets: universe,
    undervalued,
    unrankedCount,
    generatedAt: input.generatedAt || Date.now(),
    dataFreshness: 'Snapshot CoinGecko/CoinPaprika + DefiLlama; cache până la 26 ore, rescanare manuală disponibilă',
    methodology: [
      'Scor 4x200: fiecare rubrică cu date complete valorează 25 puncte; datele lipsă sau incomplete valorează 0. Nu se aplică praguri minime de performanță.',
      'Creștere: necesită o schimbare TVL pe 7 zile sau accelerarea fees (ritm 7z vs 30z) calculabilă.',
      'Efect de rețea: necesită date observabile despre fees sau TVL/distribuție; proxy, nu utilizatori activi exacți.',
      'Venit sustenabil: necesită o observație completă de revenue pe 30z; pentru L1-uri (BTC, ETH, SOL) se folosesc fees rețelei.',
      'Valoare către holderi: necesită raportare completă buyback/burn, distribuții sau staking finanțat din venit; zero raportat este dată validă.',
      'Model de subevaluare (tab Calitate Business): scor calitate 0-75 = completitudinea datelor pentru Efect de rețea + Venit sustenabil + Valoare către holderi.',
      'Evaluare: P/R = market cap / (revenue 30z × 365/30); fallback P/H din buyback/burn anualizat când revenue lipsește. Activele cu doar fees (fără revenue/holderi) sunt excluse din clasamentul de subevaluate - P/F nu măsoară captura de valoare.',
      'Index subevaluare = percentila calității − percentila scumpirii (log P/R) între active cu aceeași bază (revenue/holderi), cu percentile centrate pentru egalități; activele fără revenue sau date de holderi nu sunt clasate.',
      'Randament holderi: (holders revenue 30z × 365/30) / MC × 100; varianta /FDV include diluția. Ritm extrapolat, nu APY garantat.',
      'Selecție secțiune: sunt listate doar monedele cu fees/revenue observabile sau buyback/burn raportat; sortare după criterii trecute, apoi factorul de dimensiune (log10 din revenue 30z; distribuțiile către holderi contează ca revenue, iar fees sunt fallback doar când datele de revenue lipsesc complet), apoi ritmul revenue (7z vs 30z) și rank.'
    ],
    sources: [
      { id: 'video', title: 'Criteriile din interviu (30:03–30:35)', url: 'https://youtu.be/oZWS5eB5YsQ?t=1803', domain: 'youtube.com' },
      { id: 'coingecko', title: 'Top crypto după market cap', url: 'https://www.coingecko.com/', domain: 'coingecko.com' },
      { id: 'coinpaprika', title: 'Fallback top crypto după market cap', url: 'https://coinpaprika.com/', domain: 'coinpaprika.com' },
      { id: 'defillama', title: 'TVL, Fees, Revenue & Holders Revenue', url: 'https://defillama.com/metrics', domain: 'defillama.com' },
      { id: 'definitions', title: 'Definițiile metrice DefiLlama', url: 'https://defillama.com/data-definitions', domain: 'defillama.com' }
    ],
    disclaimer: 'Scanner fundamental de cercetare, nu semnal de cumpărare. „Pass” înseamnă că rubrica are date complete, nu că activul depășește un prag de calitate; indexul de subevaluare este un model euristic pe percentile, nu o estimare de valoare justă.'
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
    return rows.map(row => ({ ...row, coin_gecko_id: row.id, market_data_source: 'coingecko' as const }));
  } catch {
    // CoinGecko's no-key endpoint can briefly return 429. A separate public
    // market-cap source keeps the scan available instead of fabricating ranks.
    const rows = await fetchJson<CoinPaprikaMarketRow[]>(fetcher, COINPAPRIKA_MARKETS_URL);
    return rows.map(row => ({
      id: row.id,
      market_data_source: 'coinpaprika',
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
      result.push(...rows.map(row => ({ ...row, coin_gecko_id: row.id, market_data_source: 'coingecko' as const })));
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
  if (![protocols, feeResponse.protocols, revenueResponse.protocols, holderRevenueResponse.protocols].every(Array.isArray)) {
    throw new Error('DefiLlama returned an incomplete response; scan not updated.');
  }
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
  const canonicalCoins = coins.map(coin => {
    if (coin.market_data_source !== 'coinpaprika') return coin;
    const matches = extraCoins.filter(extra => normalize(extra.name) === normalize(coin.name) && extra.symbol.toLowerCase() === coin.symbol.toLowerCase());
    return matches.length === 1 ? matches[0] : coin;
  });
  const extraIdSet = new Set(extraCoins.map(coin => coin.id.toLowerCase()));

  return buildCryptoFourCriteriaScan({
    coins: [...canonicalCoins, ...extraCoins],
    protocols,
    fees,
    revenue,
    holdersRevenue,
    candidateIds: extraIdSet
  });
}
