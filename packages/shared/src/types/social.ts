export type NarrativeCategory = 
  | 'Layer 1 & 2'
  | 'DeFi & Yield'
  | 'AI & Compute'
  | 'Meme Coins'
  | 'ETF & Institutional'
  | 'Regulation & Legal'
  | 'Exploit & Security'
  | 'Macro & Fed'
  | 'US Equities & Tech'
  | 'Commodities & Metals';

export type MarketSectorCategory = 'all' | 'macro' | 'stocks' | 'metals' | 'crypto';
export type ImpactLevel = 'BREAKING' | 'HIGH' | 'MEDIUM' | 'ALPHA';

export interface XPostItem {
  id: string;
  authorHandle: string;
  authorName: string;
  authorFollowers: number;
  authorVerified: boolean;
  authorCredibilityScore: number; // 0 to 1
  text: string;
  aiSummaryRo?: string;           // Concise Romanian AI market context & synthesis
  marketImpact?: 'Bullish' | 'Bearish' | 'Neutral' | 'Volatile';
  impactLevel?: ImpactLevel;
  sector?: MarketSectorCategory;
  timestamp: number;
  url: string;                    // Direct exact link to post on X (Twitter)
  likes: number;
  reposts: number;
  replies: number;
  isSpamProbability: number;      // 0 to 1
  mentionedSymbols: string[];
}

export interface XTrendTopic {
  id: string;
  topic: string;             // e.g. "$SOL Breakout & Breakpoint Conference"
  cashtag: string;           // e.g. "$SOL"
  category: NarrativeCategory;
  sector?: MarketSectorCategory;
  aiSummaryRo?: string;
  postCountLastHour: number;
  velocityScore: number;     // growth acceleration rate
  sentimentScore: number;    // -1.0 to +1.0
  credibilityScore: number;  // 0 to 1.0 (author quality + uniqueness)
  samplePosts: XPostItem[];
  firstDetected: number;
  lastUpdated: number;
}
