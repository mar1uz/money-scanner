/**
 * Public Tape mirror of the app's daily AI Briefing (Marius, 2026-09-23:
 * "în /tape poți să întorci zilnic toate datele din AI briefing").
 *
 * Pure builders only: the route reads the cached daily artifacts and passes
 * them in, so nothing here can trigger a rescan or a model call. Public-surface
 * rules still apply: no internal score numbers (narrative score, quality or
 * valuation scores), no "Sources used" block - price, percent, market cap,
 * protocol cash flows and pass/fail criteria only.
 */

export type TapeCriterionStatus = 'pass' | 'watch' | 'fail' | 'unknown';

export interface TapeNarrativeInput {
  name: string;
  status: string;
  summary: string;
  assets: string[];
  score?: number;
}

export interface TapeNarrative {
  name: string;
  status: 'HOT' | 'EMERGING' | 'BEARISH' | 'NEUTRAL';
  summary: string;
  assets: Array<{ symbol: string; change24h: number | null }>;
}

export interface TapeCriteriaAssetInput {
  id: string;
  symbol: string;
  name: string;
  marketCap?: number;
  priceChange24h?: number;
  priceChange7d?: number;
  score?: number;
  criteria?: Partial<Record<'growth' | 'networkEffect' | 'sustainableRevenue' | 'holderValue', { status?: string }>>;
  metrics: {
    fees30d?: number;
    revenue30d?: number;
    holdersRevenue30d?: number;
    feeRunRateChange?: number;
    tvlChange7d?: number;
  };
}

export interface TapeTopScoreEntry {
  symbol: string;
  name: string;
  marketCap: number | null;
  priceChange24h: number | null;
  priceChange7d: number | null;
  fees30d: number;
  revenue30d: number;
  holderValue30d: number;
  criteria: { growth: TapeCriterionStatus; networkEffect: TapeCriterionStatus; sustainableRevenue: TapeCriterionStatus; holderValue: TapeCriterionStatus };
}

const finite = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const normalizeStatus = (value: unknown): TapeNarrative['status'] => {
  const upper = String(value || '').toUpperCase();
  return upper === 'HOT' || upper === 'EMERGING' || upper === 'BEARISH' ? upper : 'NEUTRAL';
};

const normalizeCriterion = (value: unknown): TapeCriterionStatus =>
  value === 'pass' || value === 'watch' || value === 'fail' ? value : 'unknown';

export const normalizeTicker = (asset: string): string =>
  String(asset || '').replace(/^[$#]/, '').trim().toUpperCase();

/** Narrative cards as the AI Briefing shows them, minus the internal 0-100 score. */
export const buildTapeNarratives = (
  narratives: TapeNarrativeInput[] | undefined,
  changes: Record<string, number>
): TapeNarrative[] => (narratives ?? [])
  .filter(narrative => narrative && narrative.name)
  .slice(0, 8)
  .map(narrative => ({
    name: narrative.name,
    status: normalizeStatus(narrative.status),
    summary: narrative.summary || '',
    assets: (narrative.assets ?? []).slice(0, 8).map(asset => {
      const symbol = normalizeTicker(asset);
      return { symbol, change24h: finite(changes[symbol]) };
    }).filter(asset => /^[A-Z0-9.\-]{2,12}$/.test(asset.symbol))
  }));

/** Tickers that need a live 24h quote for the narrative chips. */
export const narrativeTickers = (narratives: TapeNarrativeInput[] | undefined): string[] => Array.from(new Set(
  (narratives ?? []).flatMap(narrative => narrative.assets ?? []).map(normalizeTicker)
    .filter(symbol => /^[A-Z0-9.\-]{2,12}$/.test(symbol))
)).slice(0, 48);

const isMeasured = (asset: TapeCriteriaAssetInput) =>
  (asset.metrics?.fees30d || 0) > 0 || (asset.metrics?.revenue30d || 0) > 0 || (asset.metrics?.holdersRevenue30d || 0) > 0;

/**
 * The AI Briefing "Top score" tab: the first measured assets in scan order
 * (the scan already sorts by criteria). Only checkable inputs leave the product.
 */
export const buildTopScore = (assets: TapeCriteriaAssetInput[] | undefined, limit = 5): TapeTopScoreEntry[] =>
  (assets ?? []).filter(isMeasured).slice(0, limit).map(asset => ({
    symbol: asset.symbol,
    name: asset.name,
    marketCap: finite(asset.marketCap),
    priceChange24h: finite(asset.priceChange24h),
    priceChange7d: finite(asset.priceChange7d),
    fees30d: asset.metrics.fees30d ?? 0,
    revenue30d: asset.metrics.revenue30d ?? 0,
    holderValue30d: asset.metrics.holdersRevenue30d ?? 0,
    criteria: {
      growth: normalizeCriterion(asset.criteria?.growth?.status),
      networkEffect: normalizeCriterion(asset.criteria?.networkEffect?.status),
      sustainableRevenue: normalizeCriterion(asset.criteria?.sustainableRevenue?.status),
      holderValue: normalizeCriterion(asset.criteria?.holderValue?.status)
    }
  }));

/** Plain regime label; drops anything that reads like a score. */
export const publicRegimeLabel = (value: unknown): string | null => {
  const label = String(value || '').trim();
  if (!label || label.length > 40 || /\d/.test(label) || /score/i.test(label)) return null;
  return label;
};

export interface TapeStockAssetInput {
  symbol: string;
  name: string;
  sector?: string;
  marketCap?: number;
  price?: number;
  score?: number;
  classification?: string;
  criteria?: Partial<Record<'profitability' | 'capitalEfficiency' | 'growth' | 'solvency' | 'freeCashFlow' | 'valuation', { status?: string }>>;
  metrics?: { netMargin?: number; roe?: number; revenueGrowthYoY?: number; fcfMargin?: number; forwardPE?: number; trailingPE?: number };
}

export interface TapeStockEntry {
  symbol: string;
  name: string;
  marketCap: number | null;
  netMargin: number | null;
  roe: number | null;
  revenueGrowthYoY: number | null;
  fcfMargin: number | null;
  pe: number | null;
  criteria: Record<'profitability' | 'capitalEfficiency' | 'growth' | 'solvency' | 'freeCashFlow' | 'valuation', TapeCriterionStatus>;
}

const STOCK_CRITERIA = ['profitability', 'capitalEfficiency', 'growth', 'solvency', 'freeCashFlow', 'valuation'] as const;

/**
 * The AI Briefing stock "Top picks" tab (same filter as the app: top-pick
 * class or the app's top band), first five in scan order. Reported financials
 * and pass/fail per criterion only - the score and AI verdict stay private.
 */
export const buildStockTop = (assets: TapeStockAssetInput[] | undefined, limit = 5): TapeStockEntry[] =>
  (assets ?? []).filter(asset => asset && asset.symbol && (asset.classification === 'top-pick' || (asset.score ?? 0) >= 80))
    .slice(0, limit).map(asset => ({
      symbol: asset.symbol,
      name: asset.name,
      marketCap: finite(asset.marketCap),
      netMargin: finite(asset.metrics?.netMargin),
      roe: finite(asset.metrics?.roe),
      revenueGrowthYoY: finite(asset.metrics?.revenueGrowthYoY),
      fcfMargin: finite(asset.metrics?.fcfMargin),
      pe: finite(asset.metrics?.forwardPE) ?? finite(asset.metrics?.trailingPE),
      criteria: Object.fromEntries(STOCK_CRITERIA.map(key => [key, normalizeCriterion(asset.criteria?.[key]?.status)])) as TapeStockEntry['criteria']
    }));
