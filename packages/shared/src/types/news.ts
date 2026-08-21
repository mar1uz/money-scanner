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
  credibilityScore?: number; // Only set when supplied by a verifiable rating source
  sentiment?: 'Bullish' | 'Neutral' | 'Bearish';
}
