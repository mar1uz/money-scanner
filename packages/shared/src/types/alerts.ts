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

export type TelegramFlipTimeframe = '4h' | '8h' | '1d' | '1w';

export interface TelegramFlipAlertPreferences {
  chatId: string;
  enabled: boolean;
  timeframes: TelegramFlipTimeframe[];
  updatedAt: number;
}

export interface TelegramFlipAlertSubscription {
  chatId: string;
  chatType: string;
  title?: string;
  enabled: boolean;
  addedByUserId: string;
  updatedAt: number;
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
  confirmationPrice?: number;
  currentPrice?: number;
  priceChangePercent?: number;
  confirmedAt?: number;
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

export type StrategyAlertStrategy =
  | 'WEEKLY_DONCHIAN_55_LONG'
  | 'BEAR_RALLY_FADE_SHORT'
  | 'MONEYLINE_MACRO_LONG'
  | 'MONEYLINE_4H_SNIPER_LONG';
export type StrategyAlertStage = 'WATCH' | 'ARMED' | 'CONFIRMED';

export interface StrategyAlertSnapshot {
  id: string;
  strategy: StrategyAlertStrategy;
  stage: StrategyAlertStage;
  side: 'LONG' | 'SHORT';
  symbol: string;
  marketClass: AssetMarketClass;
  timeframe: '1d' | '4h';
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
  rsi2?: number;
  previousRsi2?: number;
  sma5?: number;
  sma50?: number;
  sma200?: number;
  sma200TwentyDaysAgo?: number;
  exitRule: string;
  weeklyTier?: MoneyLineTier;
  weeklyScore?: number;
  benchmarkSymbol?: 'BTC' | 'SPY';
  benchmarkClose?: number;
  benchmarkSma50?: number;
  benchmarkSma200?: number;
  benchmarkBearish?: boolean;
  donchianHigh55?: number;
  donchianLow20?: number;
  weeklySma40?: number;
  weeklySma40EightWeeksAgo?: number;
  weeklyFastBullish?: boolean;
  weeklySlowBullish?: boolean;
  atrPercentile?: number;
  momentum252Percent?: number;
  distanceToBreakoutPercent?: number;
  distanceToBreakoutAtr?: number;
  maxRiskPercent?: number;
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
  target3?: number;
  targetRiskReward: number;
  target3RiskReward?: number;
  riskPercent: number;
  fastLine: number;
  slowLine: number;
  atr: number;
  rvol: number;
  rsi: number;
  score: number;
}

export interface TelegramCommandPayload {
  command: 'start' | 'scan' | 'status' | 'trending' | 'news' | 'watch' | 'unwatch' | 'alerts' | 'flipalerts' | 'subscribe' | 'unsubscribe' | 'brief' | 'help'
    | 'flips' | 'flips_crypto' | 'flips_stocks'
    | 'flips_bull' | 'flips_bear'
    | 'flips_crypto_bull' | 'flips_crypto_bear' | 'flips_stocks_bull' | 'flips_stocks_bear';
  args: string[];
  chatId: number;
  userId: number;
  username?: string;
  chatType?: string;
  chatTitle?: string;
  messageId: number;
}
