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
