import { AssetMarketDataSource, Candle } from './market.js';
import { MoneyLineTier } from './indicators.js';

export const DAILY_SMA_RECLAIM_RULE_ID = 'DAILY_SMA50_200_RECLAIM';
export const DAILY_SMA_RECLAIM_RULE_VERSION = '1';

export type DailySmaReclaimResultStatus =
  | 'NEW_SIGNAL'
  | 'ABOVE_BOTH'
  | 'NO_SIGNAL'
  | 'INSUFFICIENT_HISTORY'
  | 'STALE_DATA'
  | 'ERROR';

export type SmaDirection = 'RISING' | 'FALLING' | 'FLAT' | 'UNAVAILABLE';

export interface DailySmaReclaimMoneyLineContext {
  fastBullish?: boolean;
  slowBullish?: boolean;
  bullish?: boolean;
  tier?: MoneyLineTier;
  score?: number;
  candleTimestamp?: number;
}

export interface DailySmaReclaimSignal {
  confirmationPrice: number;
  previousClose: number;
  sma50: number;
  sma200: number;
  previousSma50: number;
  previousSma200: number;
  sma50Direction: SmaDirection;
  sma200Direction: SmaDirection;
  atr14?: number;
  distanceToUpperSmaAtr?: number;
  distanceLabel?: 'NEAR_MEDIANS' | 'EXTENDED';
  rvol?: number;
  rvolHighlighted: boolean;
  dailyMoneyLine: DailySmaReclaimMoneyLineContext;
  weeklyMoneyLine?: DailySmaReclaimMoneyLineContext;
}

export interface DailySmaReclaimResult {
  ruleId: typeof DAILY_SMA_RECLAIM_RULE_ID;
  ruleVersion: typeof DAILY_SMA_RECLAIM_RULE_VERSION;
  symbol: string;
  name: string;
  marketClass: 'crypto';
  rank?: number;
  source: AssetMarketDataSource | string;
  pair: string;
  analyzedDay: string;
  analyzedDayTimestamp: number;
  evaluatedAt: number;
  status: DailySmaReclaimResultStatus;
  /** Stable identity for a new traversal; includes rule, version, source/pair and day. */
  eventId?: string;
  currentPrice?: number;
  currentPriceAt?: number;
  signal?: DailySmaReclaimSignal;
  reason?: string;
  providerError?: string;
}

export interface DailySmaReclaimCoverageTotals {
  total: number;
  scanned: number;
  newSignals: number;
  alreadyAboveBoth: number;
  noSignal: number;
  insufficientHistory: number;
  staleData: number;
  errors: number;
}

export type DailySmaReclaimReportStatus = 'complete' | 'partial' | 'failed';

export interface DailySmaReclaimReport {
  id: string;
  ruleId: typeof DAILY_SMA_RECLAIM_RULE_ID;
  ruleVersion: typeof DAILY_SMA_RECLAIM_RULE_VERSION;
  analyzedDay: string;
  analyzedDayTimestamp: number;
  startedAt: number;
  completedAt: number;
  durationMs: number;
  source: string;
  timezone: 'Europe/Oslo';
  status: DailySmaReclaimReportStatus;
  totals: DailySmaReclaimCoverageTotals;
  results: DailySmaReclaimResult[];
  telegram?: {
    destinationConfigured: boolean;
    parts: number;
    deliveredParts: number;
    uncertainParts: number;
  };
  error?: string;
}

export interface DailySmaReclaimEvaluatorOptions {
  expectedDayTimestamp?: number;
  evaluatedAt?: number;
  source?: AssetMarketDataSource | string;
  pair?: string;
  name?: string;
  rank?: number;
  weeklyCandles?: Candle[];
}
