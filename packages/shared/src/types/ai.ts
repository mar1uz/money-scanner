import { MarketRegimeType } from './market.js';
import { MoneyLineSignal } from './indicators.js';
import { XTrendTopic } from './social.js';
import { NewsItem } from './news.js';

export interface EvidenceLink {
  sourceType: 'MarketData' | 'MoneyLine' | 'XTrend' | 'News' | 'OnChain';
  title: string;
  url?: string;
  timestamp: number;
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

export interface AssetAIExplanation {
  symbol: string;
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
