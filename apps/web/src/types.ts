export * from '@money-scanner/shared';
export { TOP_50_CRYPTO_ASSETS } from '@money-scanner/shared';
import type { AIContentTake, Candle } from '@money-scanner/shared';

export type AppTab = 
  | 'market'
  | 'crypto_radar'
  | 'crypto_bubbles'
  | 'crypto_heatmap'
  | 'business_quality'
  | 'usa_status'
  | 'intelligence'
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
  investmentGuide?: { ro?: AIContentTake; en?: AIContentTake };
  assetProfile?: { ro?: AIContentTake; en?: AIContentTake };
  onchain?: {
    source?: string;
    supplyCirculating?: number; supplyTotal?: number; supplyMax?: number; pctUnlocked?: number;
    athPrice?: number; athDistancePct?: number; atlPrice?: number; atlDistancePct?: number;
    volumeMcapPct?: number; tvlUsd?: number; tvlToMcapPct?: number; fees24hUsd?: number;
  };
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
