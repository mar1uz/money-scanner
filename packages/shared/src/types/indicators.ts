import { Timeframe } from './market.js';

export type MoneyLineTier = 
  | 'Strong Bullish'
  | 'Bullish'
  | 'Neutral'
  | 'Bearish'
  | 'Strong Bearish';

export interface IndicatorContributions {
  emaAlignmentScore: number;    // -100 to +100
  emaSlopeScore: number;        // -100 to +100
  rocScore: number;             // -100 to +100
  macdScore: number;            // -100 to +100
  rsiScore: number;             // -100 to +100
  rvolScore: number;            // -100 to +100
  volatilityRegimeScore: number;// -100 to +100
  mtfConfirmationScore: number; // -100 to +100
}

export interface IndicatorRawValues {
  ema20: number;
  ema50: number;
  ema200: number;
  ema20Slope: number;
  roc9: number;
  roc21: number;
  macd: {
    line: number;
    signal: number;
    histogram: number;
    histogramSlope: number;
  };
  rsi14: number;
  rsiRegime: 'Oversold' | 'Bearish' | 'Neutral' | 'Bullish' | 'Overbought';
  rvol: number; // e.g. 1.8x average
  volumeMA20: number;
  atr14: number;
  atrPercent: number;
}

export interface MoneyLineSignal {
  symbol: string;
  timeframe: Timeframe;
  score: number; // -100 to +100
  tier: MoneyLineTier;
  previousTier?: MoneyLineTier;
  isTransition: boolean; // true if tier changed on this closed candle
  transitionTime?: number;
  rawIndicators: IndicatorRawValues;
  contributions: IndicatorContributions;
  candleTimestamp: number;
  calculationTimestamp: number;
  version: string; // e.g. "v1.0.0"
}

export interface MultiTimeframeSummary {
  '1h'?: MoneyLineSignal;
  '4h'?: MoneyLineSignal;
  '1d'?: MoneyLineSignal;
  compositeMtfScore: number;
  confluenceTier: MoneyLineTier;
}

export interface AssetScannerRow {
  symbol: string;
  name: string;
  category: string;
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  timeframe: Timeframe;
  moneyLineScore: number;
  tier: MoneyLineTier;
  previousTier?: MoneyLineTier;
  isTransition: boolean;
  lastSignalChangeTime: number;
  rvol: number;
  volatilityAtrPercent: number;
  xTrendScore: number;
  xMentionsVelocity: number;
  aiConfidence: number;
  isWatchlisted?: boolean;
  lastUpdated: number;
  isStale: boolean;
}
