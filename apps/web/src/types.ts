export * from '@money-scanner/shared';
export { TOP_50_CRYPTO_ASSETS } from '@money-scanner/shared';
import type { Candle } from '@money-scanner/shared';

export type AppTab = 
  | 'market'
  | 'crypto_bubbles'
  | 'crypto_heatmap'
  | 'usa_status'
  | 'trends'
  | 'news'
  | 'ai'
  | 'alerts'
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
  dataAvailability?: 'aggregated-price-only' | 'dex-fallback';
  priceHistory?: number[][];
  dexMarket?: {
    chainId: string; dexId: string; dexUrl: string; pairAddress: string; contractAddress: string; quoteSymbol: string;
    priceUsd: number | null; priceChange: Record<'m5' | 'h1' | 'h6' | 'h24', number | null>;
    volume: Record<'m5' | 'h1' | 'h6' | 'h24', number | null>; liquidityUsd: number | null;
    fdvUsd: number | null; marketCapUsd: number | null; transactions24h: { buys: number; sells: number } | null;
    pairCreatedAt: number | null; candleSource: string; candles?: Candle[];
  };
}
