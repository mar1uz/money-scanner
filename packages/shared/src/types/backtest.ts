import { AssetMarketClass, Timeframe } from './market.js';
import { MoneyLineTier } from './indicators.js';

export type BacktestStrategy = 'money_line_tier' | 'weekly_reclaim' | 'weekly_donchian_long' | 'bear_rally_fade' | 'connors_rsi2';
export type BacktestDirectionMode = 'LONG_ONLY' | 'SHORT_ONLY' | 'LONG_SHORT';

export interface BacktestTrade {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryTimestamp: number;
  entryPrice: number;
  exitTimestamp: number;
  exitPrice: number;
  entrySignalTier: MoneyLineTier;
  exitSignalTier: MoneyLineTier;
  pnlPercent: number;
  pnlNetUsd: number;
  holdingHours: number;
  exitReason: 'SignalReversal' | 'TakeProfit' | 'StopLoss' | 'EndPeriod';
  initialStop?: number;
  targetPrice?: number;
  initialRiskPercent?: number;
  rMultiple?: number;
  entryReason?: string;
  exitReasonDetail?: string;
}

export interface BacktestParams {
  symbol: string;
  timeframe: Timeframe;
  startTimestamp: number;
  endTimestamp: number;
  initialCapital: number;
  feePercentPerTrade: number; // e.g. 0.075%
  slippagePercent: number;    // e.g. 0.05%
  entryTierThreshold: MoneyLineTier; // e.g. 'Strong Bullish' or 'Bullish'
  exitTierThreshold: MoneyLineTier;  // e.g. 'Bearish'
  stopLossPercent?: number;
  takeProfitPercent?: number;
  strategy?: BacktestStrategy;
  directionMode?: BacktestDirectionMode;
  marketClass?: AssetMarketClass;
  targetRiskReward?: number;
  atrStopBuffer?: number;
  requireSma200?: boolean;
  requireSma50Slope?: boolean;
  rsi2EntryThreshold?: number;
  rsi2ConfirmationThreshold?: number;
  confirmationWindowBars?: number;
  atrStopMultiple?: number;
  evaluationStartTimestamp?: number;
}

export interface BacktestPricePoint {
  timestamp: number;
  close: number;
  sma50: number;
  sma200: number;
  weeklyRegime: 'BULLISH' | 'BEARISH' | 'TRANSITION';
  armedLong: boolean;
  armedShort: boolean;
  longTrigger: boolean;
  shortTrigger: boolean;
  sma5?: number;
  rsi2?: number;
  benchmarkClose?: number;
  benchmarkSma50?: number;
  benchmarkSma200?: number;
  benchmarkBearish?: boolean;
  donchianHigh55?: number;
  donchianLow20?: number;
}

export interface BacktestStrategySource {
  label: string;
  url: string;
}

export interface BacktestValidationSummary {
  method: 'chronological_holdout_30';
  startTimestamp: number;
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  totalReturnPercent: number;
  maxDrawdownPercent: number;
  profitable: boolean;
}

export interface BacktestResult {
  params: BacktestParams;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;            // percentage, e.g. 62.5%
  profitFactor: number;       // Gross Profit / Gross Loss
  totalReturnPercent: number; // Strategy ROI
  buyAndHoldReturnPercent: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  averageTradeDurationHours: number;
  averageTradeReturnPercent?: number;
  expectancyR?: number;
  strategyName?: string;
  strategyRules?: string[];
  strategySources?: BacktestStrategySource[];
  validation?: BacktestValidationSummary;
  equityCurve: {
    timestamp: number;
    strategyEquity: number;
    benchmarkEquity: number;
  }[];
  priceSeries?: BacktestPricePoint[];
  trades: BacktestTrade[];
  disclaimer: string;
}

export interface BacktestComparisonRow {
  symbol: string;
  marketClass: AssetMarketClass;
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  expectancyR: number;
  totalReturnPercent: number;
  buyAndHoldReturnPercent: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  periodStart: number;
  periodEnd: number;
  error?: string;
}

export interface BacktestComparisonResult {
  strategy: Extract<BacktestStrategy, 'weekly_reclaim' | 'weekly_donchian_long' | 'bear_rally_fade'>;
  directionMode: BacktestDirectionMode;
  rows: BacktestComparisonRow[];
  aggregate: {
    testedAssets: number;
    profitableAssets: number;
    totalTrades: number;
    weightedWinRate: number;
    medianProfitFactor: number;
    averageExpectancyR: number;
    averageReturnPercent: number;
    averageMaxDrawdownPercent: number;
  };
  generatedAt: number;
}
