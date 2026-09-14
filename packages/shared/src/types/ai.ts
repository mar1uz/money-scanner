import { MarketRegimeType } from './market.js';
import { MoneyLineSignal } from './indicators.js';
import { XTrendTopic } from './social.js';
import { NewsItem } from './news.js';

export interface EvidenceLink {
  sourceType: 'MarketData' | 'MoneyLine' | 'XTrend' | 'News' | 'OnChain' | 'Bluesky' | 'Telegram' | 'Mastodon';
  title: string;
  url?: string;
  timestamp: number;
}

export type NewsSynthesisSourceType = 'News' | 'X' | 'Bluesky' | 'Telegram' | 'Mastodon';

export interface NewsSynthesisSource {
  id: string;
  sourceType: NewsSynthesisSourceType;
  title: string;
  url: string;
  publishedAt: number;
  author?: string;
}

export interface NewsSynthesisSegment {
  text: string;
  sourceIds: string[];
}

export interface NewsSynthesisPayload {
  headline: string;
  segments: NewsSynthesisSegment[];
  sources: NewsSynthesisSource[];
  generatedAt: number;
  mode: 'ai' | 'deterministic';
  model?: string;
  language: 'ro' | 'en';
}

export type IntelligenceSector = 'all' | 'crypto' | 'stocks' | 'macro' | 'metals';
export type IntelligencePeriod = '24h' | '7d';
export type IntelligenceSourceFilter = 'all' | 'news' | 'social';

export interface IntelligenceBriefFilters {
  sector: IntelligenceSector;
  period: IntelligencePeriod;
  source: IntelligenceSourceFilter;
}

export interface IntelligenceBriefPayload extends NewsSynthesisPayload {
  fullText: string;
  sourceCount: number;
  latestSourceAt: number | null;
  filters: IntelligenceBriefFilters;
}

export interface AIAnalysisPayload {
  marketRegime: MarketRegimeType;
  executiveSummary: string;
  keyDrivers: string[];
  bullishFactors: string[];
  bearishFactors: string[];
  risksAndUncertainties: string[];
  assetsToWatch: {
    symbol: string;
    thesis: string;
    bias: 'Bullish' | 'Bearish' | 'Watch';
  }[];
  confidenceScore: number; // 0.0 to 1.0
  evidenceCitations: EvidenceLink[];
  generatedAt: number;
  dataFreshness: string;
}

export type MarketIntelligenceScope = 'crypto' | 'stocks' | 'metals';
export type MarketIntelligenceImpact = 'Bullish' | 'Bearish' | 'Mixed';
export type MarketNarrativeStatus = 'HOT' | 'BULLISH' | 'EMERGING' | 'NEUTRAL' | 'COOLING' | 'BEARISH';

export interface MarketIntelligenceSource {
  id: string;
  title: string;
  url: string;
  domain: string;
}

export interface MarketMacroDriver {
  title: string;
  impact: MarketIntelligenceImpact;
  analysis: string;
  horizon: string;
}

export interface MarketNarrativeInsight {
  name: string;
  status: MarketNarrativeStatus;
  score: number;
  summary: string;
  whyNow: string;
  assets: string[];
  catalysts: string[];
  risks: string[];
}

export interface MarketAlphaDiscovery {
  name: string;
  symbol?: string;
  category: string;
  status: 'Verified' | 'Emerging' | 'Unverified';
  whyItMatters: string;
  notableConnection?: string;
  catalyst: string;
  risks: string[];
}

export interface MarketIntelligenceReport {
  scope: MarketIntelligenceScope;
  headline: string;
  macroRegime: string;
  executiveSummary: string;
  macroDrivers: MarketMacroDriver[];
  narratives: MarketNarrativeInsight[];
  discoveries: MarketAlphaDiscovery[];
  riskRadar: string[];
  sources: MarketIntelligenceSource[];
  confidenceScore: number;
  generatedAt: number;
  dataFreshness: string;
  mode: 'ai-grounded' | 'ai-sources' | 'deterministic';
  model?: string;
  searchQueries: string[];
  disclaimer: string;
  /**
   * Live verified 24h percent change per narrative asset, keyed by normalized
   * uppercase symbol without $/# prefix (e.g. "PEPE" -> +8.17).
   * Sourced from Binance /ticker/24hr (crypto) and Yahoo Finance (stocks/metals).
   * Absent keys mean no verified quote exists; the UI must not invent a value.
   */
  assetChanges?: Record<string, number>;
}

export interface MarketIntelligenceAssetSnapshot {
  symbol: string;
  name: string;
  change24h: number;
  narrative?: string;
}

export interface MarketIntelligenceNarrativeSnapshot {
  name: string;
  averageChange24h: number;
  assetCount: number;
  leaders: string[];
}

export type CryptoCriteriaStatus = 'pass' | 'watch' | 'fail' | 'unknown';
export type CryptoCriteriaFilter = 'leaders' | 'all-four' | 'first-three';

export interface CryptoCriterionResult {
  status: CryptoCriteriaStatus;
  label: string;
  value: string;
  explanation: string;
}

export interface CryptoFourCriteriaAsset {
  id: string;
  coinGeckoId?: string;
  symbol: string;
  name: string;
  image?: string;
  marketCapRank: number;
  marketCap: number;
  score: number;
  passedCriteria: number;
  classification: 'all-four' | 'first-three' | 'partial' | 'insufficient-data';
  criteria: {
    growth: CryptoCriterionResult;
    networkEffect: CryptoCriterionResult;
    sustainableRevenue: CryptoCriterionResult;
    holderValue: CryptoCriterionResult;
  };
  metrics: {
    tvl?: number;
    tvlChange7d?: number;
    fees30d?: number;
    feeRunRateChange?: number;
    revenue30d?: number;
    revenueRunRateChange?: number;
    holdersRevenue30d?: number;
    chainCount: number;
  };
}

export interface CryptoFourCriteriaScan {
  scannedCount: number;
  coveredCount: number;
  allFourCount: number;
  firstThreeCount: number;
  assets: CryptoFourCriteriaAsset[];
  generatedAt: number;
  dataFreshness: string;
  methodology: string[];
  sources: MarketIntelligenceSource[];
  disclaimer: string;
}

export type StockCriteriaStatus = 'pass' | 'watch' | 'fail' | 'unknown';
export type StockCriteriaFilter = 'top-pick' | 'all-passed' | 'high-profitability' | 'growth-fcf' | 'dividend-value';

export interface StockCriterionResult {
  status: StockCriteriaStatus;
  label: string;
  value: string;
  explanation: string;
}

export interface StockFinancialMetrics {
  grossMargin?: number;
  operatingMargin?: number;
  netMargin?: number;
  fcfMargin?: number;
  roe?: number;
  roa?: number;
  roic?: number;
  revenueGrowthYoY?: number;
  epsGrowthYoY?: number;
  debtToEquity?: number;
  currentRatio?: number;
  totalCash?: number;
  totalDebt?: number;
  netCashPosition?: boolean;
  freeCashFlow?: number;
  fcfYield?: number;
  dividendYield?: number;
  buybackYield?: number;
  trailingPE?: number;
  forwardPE?: number;
  pegRatio?: number;
  priceToSales?: number;
  evToEbitda?: number;
  priceToFcf?: number;
}

export interface StockBusinessQualityAsset {
  id: string;
  symbol: string;
  name: string;
  sector?: string;
  marketCap: number;
  marketCapRank?: number;
  price: number;
  score: number; // 0 to 100
  passedCriteria: number; // 0 to 6
  classification: 'top-pick' | 'all-passed' | 'high-profitability' | 'growth-fcf' | 'dividend-value' | 'partial' | 'insufficient-data';
  aiVerdict: 'Top AI Pick' | 'Solid Quality' | 'Watchlist' | 'High Risk';
  aiVerdictLabelRo: string;
  aiThesis: string;
  criteria: {
    profitability: StockCriterionResult;
    capitalEfficiency: StockCriterionResult;
    growth: StockCriterionResult;
    solvency: StockCriterionResult;
    freeCashFlow: StockCriterionResult;
    valuation: StockCriterionResult;
  };
  metrics: StockFinancialMetrics;
}

export interface StockBusinessQualityScan {
  scannedCount: number;
  coveredCount: number;
  topPicksCount: number;
  allPassedCount: number;
  highProfitabilityCount: number;
  growthFcfCount: number;
  dividendValueCount: number;
  assets: StockBusinessQualityAsset[];
  generatedAt: number;
  dataFreshness: string;
  methodology: string[];
  sources: MarketIntelligenceSource[];
  disclaimer: string;
}

export interface AssetEconomicReport {
  title: string;
  period: string;
  summary: string;
  metrics: { label: string; value: string; sentiment?: 'positive' | 'neutral' | 'negative' }[];
}

export interface InvestmentGuidance {
  verdict: 'Strong Buy' | 'Accumulate' | 'Hold & Watch' | 'Trim / Caution' | 'High Risk';
  verdictLabelRo: string;
  whyInvest: string[];
  keyRisks: string[];
  targetHorizon: string;
  recommendedAction: string;
}

export interface AssetAIExplanation {
  symbol: string;
  assetName?: string;
  assetClass?: 'stocks' | 'crypto' | 'metals' | 'forex' | 'macro';
  sectorOrNarrative?: string;
  
  // Forward Economic & Strategic Outlook
  economicForward: {
    industryOutlook: string;
    macroTailwinds: string[];
    macroHeadwinds: string[];
    growthCatalysts: string[];
  };
  
  // Recent Economic & Financial Reports
  recentReports: AssetEconomicReport[];
  
  // Actionable Investment Guidance & Verdict
  investmentGuidance: InvestmentGuidance;

  // Technical & Money Line Context
  moneyLineContext: string;
  technicalThesis: string;
  socialNarrativeContext: string;
  newsContext: string;
  bullishCatalysts: string[];
  downsideRisks: string[];
  keySupportResistance: {
    supportLevels: number[];
    resistanceLevels: number[];
  };
  overallBias: 'Strong Bullish' | 'Bullish' | 'Neutral' | 'Bearish' | 'Strong Bearish';
  confidence: number;
  evidence: EvidenceLink[];
  generatedAt: number;
}

export interface StructuredAIInput {
  market: {
    btcPrice: number;
    ethPrice: number;
    regime: MarketRegimeType;
    breadthScore: number;
  };
  assetSignals: Record<string, MoneyLineSignal>;
  xTrends: XTrendTopic[];
  recentNews: NewsItem[];
  timestamp: number;
}
