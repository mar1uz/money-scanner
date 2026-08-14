import { Timeframe } from './market.js';
import { MoneyLineTier } from './indicators.js';

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
  equityCurve: {
    timestamp: number;
    strategyEquity: number;
    benchmarkEquity: number;
  }[];
  trades: BacktestTrade[];
  disclaimer: string;
}
