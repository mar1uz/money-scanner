import { Timeframe } from './market.js';
import { MoneyLineTier } from './indicators.js';

export type AlertType = 
  | 'MoneyLineTransition'
  | 'MultiTimeframeReversal'
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
