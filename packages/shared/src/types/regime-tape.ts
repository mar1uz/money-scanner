import { AssetMarketClass, Timeframe } from './market.js';
import { IndicatorContributions, MoneyLineTier } from './indicators.js';

/**
 * Regime Tape: the public, durable ledger of Money Line regime transitions.
 * Every tier change on a tracked closed candle is recorded here, including
 * the ones that later lose money, so the public track record is complete.
 */
export const REGIME_TAPE_VERSION = 'tape-v1.0.0';
export const REGIME_TAPE_TIMEFRAMES: Timeframe[] = ['1d', '1w'];

export type RegimeTapeOutcomeKey = 'd1' | 'd7' | 'd30';

export interface RegimeTapeOutcome {
  price: number;
  returnPct: number; // (price - transitionPrice) / transitionPrice * 100
  measuredAt: number;
}

export interface RegimeTapeEvent {
  /** Idempotency key: tape:<marketClass>:<symbol>:<timeframe>:<candleCloseTime> */
  id: string;
  symbol: string;
  name: string;
  marketClass: AssetMarketClass;
  timeframe: Timeframe;
  previousTier: MoneyLineTier;
  tier: MoneyLineTier;
  score: number;
  previousScore: number;
  transitionPrice: number;
  /** Closed-candle timestamp (ms) the transition is anchored to. */
  candleCloseTime: number;
  detectedAt: number;
  /** Human-readable data provenance, e.g. "Binance spot daily candles". */
  source: string;
  methodVersion: string; // MONEY_LINE_VERSION
  tapeVersion: string;   // REGIME_TAPE_VERSION
  contributions: IndicatorContributions;
  outcomes?: Partial<Record<RegimeTapeOutcomeKey, RegimeTapeOutcome>>;
}

export type RegimeTapeCoverageStatus = 'SCANNED' | 'INSUFFICIENT_DATA' | 'STALE_DATA' | 'ERROR';

export interface RegimeTapeCoverageItem {
  symbol: string;
  name: string;
  marketClass: AssetMarketClass;
  rank?: number;
  timeframe: Timeframe;
  status: RegimeTapeCoverageStatus;
  scannedAt: number;
  error?: string;
}

export type RegimeTapeScanStatus = 'running' | 'complete' | 'partial' | 'failed';

export interface RegimeTapeScanReport {
  /** tape-scan:<UTC day> */
  id: string;
  startedAt: number;
  completedAt?: number;
  status: RegimeTapeScanStatus;
  universeSize: number;
  scanned: number;
  errors: number;
  newEvents: number;
  outcomesUpdated: number;
  timeframes: Timeframe[];
  source: string;
  methodVersion: string;
  tapeVersion: string;
  coverage: RegimeTapeCoverageItem[];
  error?: string;
}

export interface RegimeTapeWaitlistEntry {
  email: string;
  source?: string;
  /** Price point in EUR/month the visitor said they would consider. */
  pricePointEur?: number;
  createdAt: number;
  userAgent?: string;
}

export const REGIME_TAPE_DISCLOSURE =
  'Market-regime analytics computed from public market data. Not investment advice, ' +
  'not a recommendation to buy or sell. Past regime transitions do not guarantee future results.';
