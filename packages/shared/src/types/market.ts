export type Timeframe = '1h' | '4h' | '8h' | '1d' | '1w' | '1m';

export interface Candle {
  timestamp: number; // Unix timestamp in ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isClosed: boolean;
}

export type AssetMarketClass = 'crypto' | 'stocks' | 'metals';

/**
 * Identifies the tradable instrument, independently from its display ticker.
 * This keeps similarly named instruments (for example an ETF and a perpetual)
 * distinct throughout search, charts and market-data routing.
 */
export type AssetInstrumentType = 'spot' | 'perpetual' | 'equity' | 'etf' | 'metal' | 'index' | 'forex';
export type AssetMarketDataSource = 'binance_spot' | 'binance_futures' | 'public_stock';

export type AssetCategory = 
  | 'Layer 1' 
  | 'Layer 2' 
  | 'DeFi' 
  | 'AI' 
  | 'Meme' 
  | 'Infrastructure' 
  | 'RWA' 
  | 'Gaming'
  | 'Tech Stock'
  | 'Mega-Cap'
  | 'Index / ETF'
  | 'Macro / Index'
  | 'Forex / Currency'
  | 'Precious Metal'
  | 'Commodity';

export type MarketNarrativeId =
  | 'broad_market'
  | 'ai_ecosystem'
  | 'semiconductors'
  | 'consumer_staples'
  | 'consumer_platforms'
  | 'cloud_enterprise'
  | 'energy_commodities'
  | 'space_defense'
  | 'precious_metals'
  | 'industrial_metals'
  | 'critical_minerals'
  | 'crypto_l1'
  | 'crypto_l2'
  | 'crypto_defi'
  | 'crypto_ai'
  | 'crypto_meme'
  | 'crypto_infrastructure'
  | 'crypto_rwa'
  | 'crypto_gaming';

export type NarrativeGroup = 'market' | 'tech' | 'defense_staples' | 'energy' | 'metals' | 'crypto';

export interface NarrativeDefinition {
  id: MarketNarrativeId;
  name: string;
  shortName: string;
  tagline: string;
  icon: string; // Lucide icon or emoji
  category: NarrativeGroup;
}

export interface NarrativeSummary {
  id: MarketNarrativeId;
  name: string;
  shortName: string;
  tagline: string;
  icon: string;
  category: NarrativeGroup;
  assetCount: number;
  performanceTimeframe?: Timeframe;
  avgChangePercent?: number;
  weightedChangePercent?: number;
  avgChange24h: number;
  weightedChange24h: number;
  bullishPercent: number;
  totalMarketCap: number;
  topGainer: { symbol: string; name: string; change24h: number; price: number };
  topLoser: { symbol: string; name: string; change24h: number; price: number };
  symbols: string[];
}

export interface AssetInfo {
  symbol: string;         // e.g. "BTC", "NVDA", "XAU"
  name: string;           // e.g. "Bitcoin", "Nvidia Corp", "Gold (Aur)"
  category: AssetCategory;
  marketClass?: AssetMarketClass;
  narratives?: MarketNarrativeId[];
  quoteCurrency: string;  // e.g. "USDT", "USD"
  aliases?: string[];     // e.g. ["spacex", "elon musk", "gold", "aur", "nvidia", "ai chips"]
  /** Stable CoinGecko slug used for an exact external crypto profile link. */
  coinGeckoId?: string;
  marketCap?: number;
  rank: number;
  decimals: number;
  /** Exchange shown to the user and used to disambiguate identical tickers. */
  exchange?: string;
  instrumentType?: AssetInstrumentType;
  /** Provider route for instruments that are not regular Binance spot pairs. */
  marketDataSource?: AssetMarketDataSource;
  /** Actual provider ticker when the app's unique symbol has a suffix such as .P. */
  providerSymbol?: string;
}

export interface AssetPriceQuote {
  symbol: string;
  price: number;
  change24h: number;
  changeYtd?: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  timestamp: number;
  source: string;
  isStale: boolean;
}

export type MarketRegimeType = 
  | 'Strong Bullish Expansion'
  | 'Bullish Trend'
  | 'Consolidation / Range'
  | 'High Volatility Correction'
  | 'Bearish Trend'
  | 'Strong Bearish Capitulation';

export interface MarketOverviewSummary {
  regime: MarketRegimeType;
  regimeScore: number; // -100 to +100
  btcDominance: number;
  totalMarketCap: number;
  total24hVolume: number;
  marketBreadth: {
    advancingCount: number;
    decliningCount: number;
    neutralCount: number;
    bullishPercent: number;
  };
  volatilityIndex: number; // 0 to 100
  fearAndGreed?: {
    value: number;
    classification: string;
    source: string;
    sourceUrl?: string;
    timestamp?: number;
  };
  narratives?: NarrativeSummary[];
  lastUpdated: number;
  providerStatus: {
    primary: 'operational' | 'degraded' | 'offline';
    latencyMs: number;
    staleAssetsCount: number;
  };
}
