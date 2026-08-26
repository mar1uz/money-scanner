import { AssetMarketClass, Timeframe } from './market.js';
import { MoneyLineTier } from './indicators.js';

export type AlertType = 
  | 'MoneyLineTransition'
  | 'MultiTimeframeReversal'
  | 'StrategySetup'
  | 'VolumeSpike'
  | 'VolatilitySpike'
  | 'BreakingNews'
  | 'SocialBreakout';

export interface AlertRule {
  id: string;
  userId: string;
  symbol: string; // or "*" for all
  timeframe: Timeframe;
  types: AlertType[];
  minScoreThreshold?: number;
  minRvolThreshold?: number;
  channels: ('Telegram' | 'Webhook' | 'InApp')[];
  telegramChatId?: string;
  cooldownMinutes: number;
  isEnabled: boolean;
  createdAt: number;
  lastTriggeredAt?: number;
}

export interface DispatchedAlert {
  id: string;
  idempotencyKey: string;
  ruleId?: string;
  symbol: string;
  type: AlertType;
  title: string;
  message: string;
  timeframe: Timeframe;
  price: number;
  tier?: MoneyLineTier;
  previousTier?: MoneyLineTier;
  reason: string;
  confidence: number;
  timestamp: number;
  dashboardLink: string;
  isDelivered: boolean;
  tradePlan?: AlertTradePlanSnapshot;
  regimeScan?: DailyRegimeScanSnapshot;
  strategySetup?: StrategyAlertSnapshot;
}

export type StrategyAlertStrategy = 'CONNORS_RSI2_LONG' | 'BEAR_RALLY_FADE_SHORT';
export type StrategyAlertStage = 'ARMED' | 'CONFIRMED';

export interface StrategyAlertSnapshot {
  id: string;
  strategy: StrategyAlertStrategy;
  stage: StrategyAlertStage;
  side: 'LONG' | 'SHORT';
  symbol: string;
  marketClass: Extract<AssetMarketClass, 'crypto' | 'stocks'>;
  timeframe: '1d';
  candleTimestamp: number;
  armedCandleTimestamp?: number;
  expiresAfterCandleTimestamp?: number;
  confirmationWindowRemaining?: number;
  signalPrice: number;
  entryReference: number;
  stopLoss: number;
  target1: number;
  target2: number;
  riskPercent: number;
  atr14: number;
  rsi2: number;
  previousRsi2: number;
  sma5: number;
  sma50: number;
  sma200: number;
  sma200TwentyDaysAgo: number;
  exitRule: string;
  benchmarkSymbol?: 'BTC' | 'SPY';
  benchmarkClose?: number;
  benchmarkSma50?: number;
  benchmarkSma200?: number;
  benchmarkBearish?: boolean;
}

export interface DailyRegimeScanSnapshot {
  scenario: 'WEEKLY_BULL_DAILY_BEAR' | 'WEEKLY_BEAR_DAILY_BULL';
  marketClass: 'crypto' | 'stocks' | 'metals';
  weeklyTier: MoneyLineTier;
  weeklyScore: number;
  dailyTier: MoneyLineTier;
  previousDailyTier: MoneyLineTier;
  dailyScore: number;
  dailyCandleTimestamp: number;
  sma50: number;
  distanceToSma50Percent: number;
}

export interface AlertTradePlanSnapshot {
  action: 'READY' | 'WAIT_RETEST' | 'AVOID';
  confidence: number;
  entryLow: number;
  entryHigh: number;
  suggestedEntry: number;
  breakoutTrigger: number;
  stopLoss: number;
  target1: number;
  target2: number;
  targetRiskReward: number;
  riskPercent: number;
  fastLine: number;
  slowLine: number;
  atr: number;
  rvol: number;
  rsi: number;
  score: number;
}

export interface TelegramCommandPayload {
  command: 'start' | 'scan' | 'status' | 'trending' | 'news' | 'watch' | 'unwatch' | 'alerts' | 'brief' | 'help';
  args: string[];
  chatId: number;
  userId: number;
  username?: string;
  messageId: number;
}
