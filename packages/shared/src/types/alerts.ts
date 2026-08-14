import { Timeframe } from './market.js';
import { MoneyLineTier } from './indicators.js';

export type AlertType = 
  | 'MoneyLineTransition'
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
}

export interface TelegramCommandPayload {
  command: 'start' | 'scan' | 'status' | 'trending' | 'news' | 'watch' | 'unwatch' | 'alerts' | 'brief' | 'help';
  args: string[];
  chatId: number;
  userId: number;
  username?: string;
  messageId: number;
}
