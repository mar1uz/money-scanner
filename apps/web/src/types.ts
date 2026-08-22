export * from '@money-scanner/shared';
export { TOP_50_CRYPTO_ASSETS } from '@money-scanner/shared';

export type AppTab = 
  | 'market'
  | 'crypto_bubbles'
  | 'crypto_heatmap'
  | 'usa_status'
  | 'trends'
  | 'news'
  | 'ai'
  | 'backtest'
  | 'status';

export interface AssetDetailResponse {
  info: any;
  quote: any;
  activeTimeframe: string;
  activeSignal: any;
  multiTimeframe: any;
  candles: any[];
  news: any[];
  xTrends: any[];
  aiExplanation: any;
  lastUpdated: number;
}
