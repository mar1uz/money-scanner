export type NewsCategory = 
  | 'Regulation'
  | 'Institutional'
  | 'Security'
  | 'Exchange'
  | 'Protocol'
  | 'Macro'
  | 'General';

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  source: string;            // e.g. "CoinDesk", "Cointelegraph", "Decrypt"
  url: string;
  publishedAt: number;
  category: NewsCategory;
  mentionedSymbols: string[];
  credibilityScore: number;  // 0 to 1.0
  sentiment: 'Bullish' | 'Neutral' | 'Bearish';
}
