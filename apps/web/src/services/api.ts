import {
  MarketOverviewSummary,
  AssetScannerRow,
  Timeframe,
  XTrendTopic,
  NewsItem,
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

export async function fetchScanner(
  timeframe: Timeframe = '1h',
  tier?: string,
  search?: string,
  watchlistOnly?: boolean
): Promise<AssetScannerRow[]> {
  const params = new URLSearchParams();
  params.set('timeframe', timeframe);
  if (tier && tier !== 'ALL') params.set('tier', tier);
  if (search) params.set('search', search);
  if (watchlistOnly) params.set('watchlist', 'true');

  const res = await fetch(`${API_BASE}/scanner?${params.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch scanner`);
  return res.json();
}

export async function fetchAssetDetail(
  symbol: string,
  timeframe: Timeframe = '1h'
): Promise<AssetDetailResponse> {
  const res = await fetch(`${API_BASE}/assets/${symbol}?timeframe=${timeframe}`);
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

