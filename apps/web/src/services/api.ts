import {
  MarketOverviewSummary,
  AssetScannerRow,
  Timeframe,
  XTrendTopic,
  NewsItem,
  NewsSynthesisPayload,
  AIAnalysisPayload,
  BacktestResult
} from '@money-scanner/shared';
import { AssetDetailResponse } from '../types.js';

const API_BASE = '/api';

export async function fetchMarketOverview(): Promise<MarketOverviewSummary> {
  const res = await fetch(`${API_BASE}/overview`).catch(() => fetch(`${API_BASE}/market/overview`));
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch market overview`);
  return res.json();
}

export type CryptoBubbleTimeframe = '1d' | '1w' | '1m';

export interface CryptoBubbleAsset {
  id: string;
  symbol: string;
  name: string;
  image: string;
  rank: number;
  price: number;
  marketCap: number;
  change: number | null;
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
  marketClass?: string
): Promise<AssetDetailResponse> {
  const params = new URLSearchParams({ timeframe });
  if (marketClass) params.set('marketClass', marketClass);
  const res = await fetch(`${API_BASE}/assets/${symbol}?${params.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch asset detail for ${symbol}`);
  return res.json();
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

  const res = await fetch(`${API_BASE}/news?${params.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch news`);
  return res.json();
}

export async function fetchNewsSynthesis(
  language: 'ro' | 'en' = 'ro',
  category?: string
): Promise<NewsSynthesisPayload> {
  const params = new URLSearchParams({ language });
  if (category && category !== 'ALL') params.set('category', category);
  const res = await fetch(`${API_BASE}/news/synthesis?${params.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch grounded news synthesis`);
  return res.json();
}

export async function fetchAIBriefing(): Promise<AIAnalysisPayload> {
  const res = await fetch(`${API_BASE}/ai/briefing`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch AI briefing`);
  return res.json();
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

export async function askAIAnalyst(question: string): Promise<{
  answer: string;
  relatedSymbols: string[];
  evidenceCitations: any[];
}> {
  const res = await fetch(`${API_BASE}/ai/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to get answer from AI analyst`);
  return res.json();
}

export async function fetchUSAStatus(): Promise<any> {
  const res = await fetch(`${API_BASE}/macro/usa-status`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch USA economic status`);
  return res.json();
}

export interface SearchAssetItem {
  symbol: string;
  name: string;
  category: string;
  marketClass: 'stocks' | 'crypto' | 'metals' | 'forex' | 'macro' | string;
  exchange: string;
  instrumentType?: string;
  price: number;
  change24h: number;
  changeYtd: number;
  moneyLineScore: number;
  tier: string;
  matchType: 'local' | 'yahoo' | 'custom';
}

export async function searchUniversalAssets(query: string): Promise<SearchAssetItem[]> {
  if (!query.trim()) return [];
  const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query.trim())}`);
  if (!res.ok) return [];
  return res.json();
}
