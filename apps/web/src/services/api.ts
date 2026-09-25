import {
  MarketOverviewSummary,
  AssetScannerRow,
  Candle,
  Timeframe,
  XTrendTopic,
  NewsItem,
  NewsSynthesisPayload,
  IntelligenceBriefPayload,
  IntelligenceBriefFilters,
  AIAnalysisPayload,
  MarketIntelligenceReport,
  MarketIntelligenceScope,
  CryptoFourCriteriaScan,
  CryptoFourCriteriaAsset,
  StockBusinessQualityScan,
  BacktestResult,
  BacktestComparisonResult,
  BacktestDirectionMode,
  BacktestStrategy,
  AssetMarketClass,
  StrategyAlertSnapshot,
  SymbolSearchResult,
  DailySmaReclaimReport
} from '@money-scanner/shared';
import { AssetDetailResponse } from '../types.js';
import { requestCsrfToken } from './firebase-auth.js';

const API_BASE = '/api';

const fetchWithDeadline = (input: RequestInfo | URL, init?: RequestInit, timeoutMs = 25_000) =>
  fetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) });

export async function fetchMarketOverview(): Promise<MarketOverviewSummary> {
  const res = await fetch(`${API_BASE}/overview`).catch(() => fetch(`${API_BASE}/market/overview`));
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch market overview`);
  return res.json();
}

export type CryptoBubbleTimeframe = '1d' | '1w' | '1m';

export interface CryptoBubbleAsset {
  id: string;
  coinGeckoId?: string;
  coinPaprikaId?: string;
  source?: 'coingecko' | 'coinpaprika' | 'scanner';
  symbol: string;
  name: string;
  image: string;
  rank: number;
  price: number;
  marketCap: number;
  change: number | null;
  changeYtd?: number | null;
}

export async function fetchCryptoBubbles(
  timeframe: CryptoBubbleTimeframe = '1d'
): Promise<CryptoBubbleAsset[]> {
  const res = await fetch(`${API_BASE}/crypto/bubbles?timeframe=${timeframe}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch crypto bubbles`);
  return res.json();
}

export async function fetchScanner(
  timeframe: Timeframe = '1w',
  tier?: string,
  search?: string,
  watchlistOnly?: boolean,
  narrative?: string,
  marketClass: 'ALL' | 'crypto' | 'stocks' | 'metals' = 'ALL'
): Promise<AssetScannerRow[]> {
  const params = new URLSearchParams();
  params.set('timeframe', timeframe);
  if (tier && tier !== 'ALL') params.set('tier', tier);
  if (search) params.set('search', search);
  if (watchlistOnly) params.set('watchlist', 'true');
  if (narrative && narrative !== 'ALL') params.set('narrative', narrative);
  if (marketClass !== 'ALL') params.set('marketClass', marketClass);

  const res = await fetch(`${API_BASE}/scanner?${params.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch scanner`);
  return res.json();
}

export async function fetchNarratives(
  timeframe: Timeframe = '1w',
  marketClass: 'ALL' | 'crypto' | 'stocks' | 'metals' = 'ALL'
): Promise<import('@money-scanner/shared').NarrativeSummary[]> {
  const params = new URLSearchParams({ timeframe });
  if (marketClass !== 'ALL') params.set('marketClass', marketClass);
  const res = await fetch(`${API_BASE}/narratives?${params.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch narratives`);
  return res.json();
}

export async function fetchAssetDetail(
  symbol: string,
  timeframe: Timeframe = '1w',
  marketClass?: string,
  coinGeckoId?: string,
  coinPaprikaId?: string
): Promise<AssetDetailResponse> {
  const params = new URLSearchParams({ timeframe });
  if (marketClass) params.set('marketClass', marketClass);
  if (coinGeckoId) params.set('coinGeckoId', coinGeckoId);
  if (coinPaprikaId) params.set('coinPaprikaId', coinPaprikaId);
  const res = await fetch(`${API_BASE}/assets/${symbol}?${params.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch asset detail for ${symbol}`);
  return res.json();
}

export interface HistoricalCandlesResponse {
  candles: Candle[];
  hasMore: boolean;
  oldestTimestamp: number | null;
}

export async function fetchHistoricalCandles(
  symbol: string,
  timeframe: Timeframe,
  before: number,
  marketClass?: string,
  limit = 1000,
  coinGeckoId?: string
): Promise<HistoricalCandlesResponse> {
  const params = new URLSearchParams({
    timeframe,
    before: String(before),
    limit: String(limit)
  });
  if (marketClass) params.set('marketClass', marketClass);
  if (coinGeckoId) params.set('coinGeckoId', coinGeckoId);
  const response = await fetchWithDeadline(`${API_BASE}/assets/${encodeURIComponent(symbol)}/candles?${params.toString()}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}: Failed to fetch historical candles for ${symbol}`);
  return response.json();
}

export async function fetchXTrends(): Promise<XTrendTopic[]> {
  const res = await fetch(`${API_BASE}/social/trends`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch X trends`);
  return res.json();
}

export async function fetchXPosts(): Promise<any[]> {
  const res = await fetch(`${API_BASE}/social/posts`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch X posts`);
  return res.json();
}

export async function fetchNews(limit = 20, category?: string): Promise<NewsItem[]> {
  const params = new URLSearchParams();
  params.set('limit', limit.toString());
  if (category) params.set('category', category);

  const res = await fetchWithDeadline(`${API_BASE}/news?${params.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch news`);
  return res.json();
}

export async function fetchNewsSynthesis(
  language: 'ro' | 'en' = 'ro',
  category?: string
): Promise<NewsSynthesisPayload> {
  const params = new URLSearchParams({ language });
  if (category && category !== 'ALL') params.set('category', category);
  const res = await fetchWithDeadline(`${API_BASE}/news/synthesis?${params.toString()}`, undefined, 30_000);
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch grounded news synthesis`);
  return res.json();
}

export async function fetchIntelligenceBrief(
  filters: IntelligenceBriefFilters,
  language: 'ro' | 'en' = 'ro',
  refresh = false
): Promise<IntelligenceBriefPayload> {
  const params = new URLSearchParams({
    language,
    sector: filters.sector,
    period: filters.period,
    source: filters.source
  });
  if (refresh) params.set('refresh', '1');
  const res = await fetchWithDeadline(`${API_BASE}/intelligence/brief?${params.toString()}`, {
    cache: 'no-store'
  }, 35_000);
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch intelligence brief`);
  return res.json();
}

export async function fetchAIBriefing(language: 'ro' | 'en' = 'ro'): Promise<AIAnalysisPayload> {
  const res = await fetch(`${API_BASE}/ai/briefing?language=${language}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch AI briefing`);
  return res.json();
}

export async function fetchMarketIntelligence(
  scope: MarketIntelligenceScope,
  language: 'ro' | 'en' = 'ro',
  refresh = false
): Promise<MarketIntelligenceReport> {
  const params = new URLSearchParams({ scope, language });
  if (refresh) params.set('refresh', '1');
  const res = await fetchWithDeadline(`${API_BASE}/ai/market-intelligence?${params.toString()}`, {
    cache: 'no-store'
  }, 60_000);
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch market intelligence`);
  return res.json();
}

export async function fetchCryptoFourCriteriaScan(refresh = false): Promise<CryptoFourCriteriaScan> {
  const params = new URLSearchParams();
  if (refresh) params.set('refresh', '1');
  const query = params.toString();
  const res = await fetchWithDeadline(`${API_BASE}/ai/crypto-four-criteria${query ? `?${query}` : ''}`, {
    cache: 'no-store'
  }, 45_000);
  const payload = await res.json().catch(() => ({})) as CryptoFourCriteriaScan & { error?: string; details?: string };
  if (!res.ok) throw new Error(payload.details || payload.error || `HTTP ${res.status}: Crypto scan failed`);
  return payload;
}

export async function lookupCryptoFourCriteria(query: string): Promise<CryptoFourCriteriaAsset[]> {
  const params = new URLSearchParams({ q: query.trim() });
  const res = await fetchWithDeadline(`${API_BASE}/ai/crypto-four-criteria/lookup?${params.toString()}`, {
    cache: 'no-store'
  }, 20_000);
  const payload = await res.json().catch(() => ({})) as { assets?: CryptoFourCriteriaAsset[]; error?: string; details?: string };
  if (!res.ok) throw new Error(payload.details || payload.error || `HTTP ${res.status}: DexScreener lookup failed`);
  return Array.isArray(payload.assets) ? payload.assets : [];
}

export async function fetchStockBusinessQualityScan(refresh = false): Promise<StockBusinessQualityScan> {
  const params = new URLSearchParams();
  if (refresh) params.set('refresh', '1');
  const query = params.toString();
  const res = await fetchWithDeadline(`${API_BASE}/ai/stock-business-quality${query ? `?${query}` : ''}`, {
    cache: 'no-store'
  }, 45_000);
  const payload = await res.json().catch(() => ({})) as StockBusinessQualityScan & { error?: string; details?: string };
  if (!res.ok) throw new Error(payload.details || payload.error || `HTTP ${res.status}: Stock scan failed`);
  return payload;
}

export async function fetchBacktest(
  symbol: string,
  timeframe: Timeframe = '1h',
  entryTier = 'Bullish',
  exitTier = 'Bearish'
): Promise<BacktestResult> {
  const params = new URLSearchParams({ timeframe, entryTier, exitTier });
  const res = await fetch(`${API_BASE}/backtest/${symbol}?${params.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to run backtest`);
  return res.json();
}

export async function fetchWeeklyReclaimBacktest(
  symbol: string,
  marketClass: AssetMarketClass,
  directionMode: BacktestDirectionMode = 'LONG_ONLY'
): Promise<BacktestResult> {
  const params = new URLSearchParams({
    strategy: 'weekly_reclaim',
    timeframe: '1d',
    marketClass,
    directionMode
  });
  const res = await fetchWithDeadline(`${API_BASE}/backtest/${symbol}?${params.toString()}`, undefined, 45_000);
  const payload = await res.json().catch(() => ({})) as BacktestResult & { error?: string; details?: string };
  if (!res.ok) throw new Error(payload.details || payload.error || `HTTP ${res.status}: Backtest indisponibil`);
  return payload;
}

export async function fetchResearchBacktest(
  strategy: Extract<BacktestStrategy, 'weekly_reclaim' | 'weekly_donchian_long' | 'bear_rally_fade'>,
  symbol: string,
  marketClass: AssetMarketClass,
  directionMode: BacktestDirectionMode = 'LONG_ONLY'
): Promise<BacktestResult> {
  const params = new URLSearchParams({ strategy, timeframe: '1d', marketClass, directionMode });
  const res = await fetchWithDeadline(`${API_BASE}/backtest/${symbol}?${params.toString()}`, undefined, 60_000);
  const payload = await res.json().catch(() => ({})) as BacktestResult & { error?: string; details?: string };
  if (!res.ok) throw new Error(payload.details || payload.error || `HTTP ${res.status}: Backtest indisponibil`);
  return payload;
}

export async function fetchWeeklyReclaimComparison(
  directionMode: BacktestDirectionMode = 'LONG_ONLY'
): Promise<BacktestComparisonResult> {
  const params = new URLSearchParams({ strategy: 'weekly_reclaim', directionMode });
  const res = await fetchWithDeadline(`${API_BASE}/backtest-compare?${params.toString()}`, undefined, 90_000);
  if (!res.ok) throw new Error(`HTTP ${res.status}: Comparația multi-asset nu a putut fi rulată.`);
  return res.json();
}

export async function fetchResearchComparison(
  strategy: Extract<BacktestStrategy, 'weekly_reclaim' | 'weekly_donchian_long' | 'bear_rally_fade'>,
  directionMode: BacktestDirectionMode = 'LONG_ONLY'
): Promise<BacktestComparisonResult> {
  const params = new URLSearchParams({ strategy, directionMode });
  const res = await fetchWithDeadline(`${API_BASE}/backtest-compare?${params.toString()}`, undefined, 120_000);
  if (!res.ok) throw new Error(`HTTP ${res.status}: Comparația multi-asset nu a putut fi rulată.`);
  return res.json();
}

export async function fetchSystemStatus(): Promise<any> {
  const res = await fetch(`${API_BASE}/status`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch system status`);
  return res.json();
}

export async function triggerTestAlert(symbol: string): Promise<any> {
  const res = await fetch(`${API_BASE}/alerts/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to send test alert`);
  return res.json();
}

export interface BullishAlertStatus {
  active: boolean;
  telegramConfigured: boolean;
  botConfigured: boolean;
  chatConfigured: boolean;
  rule?: {
    symbol: string;
    timeframe: Timeframe;
    marketClass: 'crypto' | 'stocks' | 'metals';
    lastEvaluatedCandle?: number;
    lastTriggeredCandle?: number;
    lastWasBullish?: boolean;
    lastError?: string;
  };
}

export async function fetchBullishAlertStatus(symbol: string, timeframe: Timeframe): Promise<BullishAlertStatus> {
  const params = new URLSearchParams({ symbol, timeframe });
  const res = await fetch(`${API_BASE}/alerts/bullish?${params.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch bullish alert status`);
  return res.json();
}

export async function setBullishAlert(
  symbol: string,
  timeframe: Timeframe,
  marketClass: 'crypto' | 'stocks' | 'metals',
  enabled: boolean
): Promise<BullishAlertStatus> {
  const res = await fetch(`${API_BASE}/alerts/bullish`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol, timeframe, marketClass, enabled })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to update bullish alert`);
  return res.json();
}

export interface AlertPlanSnapshot {
  action: 'READY' | 'WAIT_RETEST' | 'AVOID';
  confidence: number;
  entryLow: number;
  entryHigh: number;
  suggestedEntry: number;
  breakoutTrigger: number;
  stopLoss: number;
  target1: number;
  target2: number;
  targetRiskReward: number;
  riskPercent: number;
  fastLine: number;
  slowLine: number;
  atr: number;
  rvol: number;
  rsi: number;
  score: number;
}

export type AlertProgressStatus = 'CONFIRMED' | 'AWAITING_CLOSE' | 'VERY_CLOSE' | 'CLOSE' | 'WAITING' | 'ERROR';

export interface ActiveAlertDashboardItem {
  id: string;
  symbol: string;
  timeframe: Timeframe;
  marketClass: 'crypto' | 'stocks' | 'metals';
  createdAt: number;
  lastEvaluatedCandle?: number;
  lastTriggeredCandle?: number;
  currentPrice: number;
  triggerPrice: number;
  distancePercent: number;
  distanceAtr: number;
  progressPercent: number;
  status: AlertProgressStatus;
  fastBullish: boolean;
  slowBullish: boolean;
  moneyLineScore?: number;
  moneyLineTier?: string;
  lastPlan?: AlertPlanSnapshot;
  lastError?: string;
}

export interface AlertHistoryDashboardItem {
  id: string;
  symbol: string;
  title: string;
  timeframe: Timeframe;
  price: number;
  reason: string;
  confidence: number;
  timestamp: number;
  isDelivered: boolean;
  tradePlan?: AlertPlanSnapshot;
  regimeScan?: {
    scenario: 'WEEKLY_BULL_DAILY_BEAR' | 'WEEKLY_BEAR_DAILY_BULL';
    marketClass: 'crypto' | 'stocks' | 'metals';
    weeklyTier: string;
    weeklyScore: number;
    dailyTier: string;
    previousDailyTier: string;
    dailyScore: number;
    dailyCandleTimestamp: number;
    sma50: number;
    distanceToSma50Percent: number;
  };
  strategySetup?: StrategyAlertSnapshot;
}

export interface DailyRegimeScanStatus {
  enabled: true;
  schedule: '5 */4 * * *';
  timezone: 'UTC';
  lastStartedAt?: number;
  lastCompletedAt?: number;
  scannedAssets: number;
  totalAssets?: number;
  matches: number;
  strategyMatches?: number;
  strategyArmed?: number;
  errors: number;
  running: boolean;
  lastError?: string;
  coverage?: {
    totalAssets: number;
    scannedAssets: number;
    outcomes: Record<FlipScanCoverageStatus, number>;
    byMarket: Record<'crypto' | 'stocks' | 'metals', number>;
  };
}

export type ManualAlertScanScope = 'quick' | 'full' | 'flips' | 'strategies';

export interface ManualAlertScanStatus {
  scope: ManualAlertScanScope;
  running: boolean;
  scannedAssets: number;
  totalAssets: number;
  matches: number;
  errors: number;
  lastStartedAt?: number;
  lastCompletedAt?: number;
  nextAllowedAt?: number;
  lastError?: string;
}

export type FlipCandidateDirection = 'BULLISH' | 'BEARISH';
export type FlipCandidateStatus = 'CONFIRMED' | 'AWAITING_CLOSE' | 'VERY_CLOSE' | 'APPROACHING';

export interface FlipCandidateDashboardItem {
  id: string;
  symbol: string;
  name?: string;
  marketClass: 'crypto' | 'stocks' | 'metals';
  marketCapRank?: number;
  timeframe: '4h' | '8h' | '1d' | '1w';
  direction: FlipCandidateDirection;
  status: FlipCandidateStatus;
  currentPrice: number;
  triggerPrice: number;
  distancePercent: number;
  distanceAtr: number;
  priorityScore: number;
  atr: number;
  rvol: number;
  moneyLineTier: string;
  moneyLineScore: number;
  weeklyTier: string;
  weeklyScore: number;
  sma50: number;
  sma200: number;
  weeklyAligned: boolean;
  sma50Aligned: boolean;
  sma200Aligned: boolean;
  candleTimestamp: number;
  confirmationPrice?: number;
  confirmedAt?: number;
  scannedAt: number;
  priceObservedAt?: number;
  priceIsStale?: boolean;
}

export type FlipScanCoverageStatus = 'CONFIRMED' | 'CANDIDATE' | 'NO_SETUP' | 'INSUFFICIENT_DATA' | 'ERROR';
export interface FlipScanCoverageItem {
  symbol: string;
  name?: string;
  marketClass: 'crypto' | 'stocks' | 'metals';
  rank?: number;
  status: FlipScanCoverageStatus;
  weeklyCandidate: boolean;
  weeklyConfirmed: boolean;
  candidateCount: number;
  confirmedCount: number;
  scannedAt: number;
  error?: string;
}

export interface AlertsDashboardResponse {
  readStatus?: {
    restoreTimedOut: boolean;
    dailyReportTimedOut: boolean;
    activeRulesTotal: number;
    activeRulesEvaluated: number;
    activeRulesTimedOut: number;
  };
  activeAlerts: ActiveAlertDashboardItem[];
  history: AlertHistoryDashboardItem[];
  telegramConfigured: boolean;
  botConfigured: boolean;
  chatConfigured: boolean;
  dailyRegimeScan: DailyRegimeScanStatus;
  manualScan: ManualAlertScanStatus;
  flipCandidates: FlipCandidateDashboardItem[];
  confirmedFlips: FlipCandidateDashboardItem[];
  scanCoverage: FlipScanCoverageItem[];
  strategySetups: StrategyAlertSnapshot[];
  dailySmaReclaim: DailySmaReclaimReport | null;
  updatedAt: number;
}

export async function fetchAlertsDashboard(): Promise<AlertsDashboardResponse> {
  const res = await fetchWithDeadline(`${API_BASE}/alerts/dashboard`, { cache: 'no-store' }, 45_000);
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch alerts dashboard`);
  return res.json();
}

export async function fetchDailySmaReclaimReport(): Promise<DailySmaReclaimReport | null> {
  const res = await fetchWithDeadline(`${API_BASE}/alerts/daily-sma-reclaim`, { cache: 'no-store' }, 30_000);
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch daily SMA reclaim report`);
  return res.json();
}

export async function runManualAlertScan(
  scope: ManualAlertScanScope,
  watchlist: Array<{ symbol: string; marketClass?: 'crypto' | 'stocks' | 'metals' }> = []
): Promise<ManualAlertScanStatus> {
  const csrfToken = await requestCsrfToken();
  const res = await fetchWithDeadline(`${API_BASE}/alerts/manual-scan`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken
    },
    body: JSON.stringify({ scope, watchlist })
  }, 15 * 60_000);
  const payload = await res.json().catch(() => ({})) as ManualAlertScanStatus & {
    error?: string;
    retryAfterSeconds?: number;
  };
  if (!res.ok) throw new Error(payload.error || `HTTP ${res.status}: Scanarea manuală a eșuat.`);
  return payload;
}

export async function clearAlerts(target: 'active' | 'history' | 'all'): Promise<{
  removedActive: number;
  removedHistory: number;
}> {
  const csrfToken = await requestCsrfToken();
  const res = await fetchWithDeadline(`${API_BASE}/alerts`, {
    method: 'DELETE',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken
    },
    body: JSON.stringify({ target })
  }, 30_000);
  const payload = await res.json().catch(() => ({})) as {
    removedActive?: number;
    removedHistory?: number;
    error?: string;
  };
  if (!res.ok) throw new Error(payload.error || `HTTP ${res.status}: Alertele nu au putut fi șterse.`);
  return {
    removedActive: payload.removedActive || 0,
    removedHistory: payload.removedHistory || 0
  };
}

export async function fetchUSAStatus(): Promise<any> {
  const res = await fetch(`${API_BASE}/macro/usa-status`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch USA economic status`);
  return res.json();
}

export interface SearchAssetItem extends SymbolSearchResult {
  price: number;
  change24h: number;
  changeYtd: number;
  moneyLineScore: number;
  tier: string;
}

export async function searchUniversalAssets(query: string, signal?: AbortSignal): Promise<SearchAssetItem[]> {
  if (!query.trim()) return [];
  const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query.trim())}`, { signal });
  if (!res.ok) return [];
  return res.json();
}

export interface ChartMarketResponse {
  symbol: string;
  tvSymbol: string | null;
  exchange?: string;
  quoteCurrency?: string;
  listingStart?: number | null;
  candleSource?: string | null;
  candleExchange?: string | null;
  reason?: string;
}

/** Server-resolved best exchange pair / TradingView symbol for a crypto asset. */
export async function fetchChartMarket(symbol: string, marketClass?: string, coinGeckoId?: string): Promise<ChartMarketResponse> {
  const params = new URLSearchParams();
  if (marketClass) params.set('marketClass', marketClass);
  if (coinGeckoId) params.set('coinGeckoId', coinGeckoId);
  const res = await fetch(`${API_BASE}/assets/${encodeURIComponent(symbol)}/chart-market?${params.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to resolve chart market for ${symbol}`);
  return res.json();
}

export interface PriceAlertRule {
  id: string;
  symbol: string;
  marketClass: string;
  targetPrice: number;
  direction: 'above' | 'below';
  isEnabled: boolean;
  createdAt: number;
  triggeredAt?: number;
  lastPrice?: number;
  lastError?: string;
}

export interface PriceAlertListResponse {
  rules: PriceAlertRule[];
  telegramConfigured?: boolean;
}

/** Lists the signed-in user's price alerts, optionally scoped to one asset. */
export async function fetchPriceAlerts(symbol: string, marketClass?: string): Promise<PriceAlertListResponse> {
  const params = new URLSearchParams({ symbol });
  if (marketClass) params.set('marketClass', marketClass);
  const res = await fetch(`${API_BASE}/alerts/price?${params.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch price alerts`);
  return res.json();
}

/** Creates a one-shot Telegram price alert on the resolved exchange pair. */
export async function createPriceAlert(
  symbol: string,
  marketClass: string,
  price: number,
  direction: 'above' | 'below'
): Promise<{ rule: PriceAlertRule }> {
  const res = await fetch(`${API_BASE}/alerts/price`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol, marketClass, price, direction })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to create price alert`);
  return res.json();
}

export async function deletePriceAlert(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/alerts/price/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to delete price alert`);
}
