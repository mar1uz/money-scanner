import { NewsItem, NewsCategory } from '@money-scanner/shared';

export class NewsIntelligenceService {
  private newsItems: NewsItem[] = [];

  constructor() {
    this.seedInitialNews();
  }

  private seedInitialNews() {
    const now = Date.now();
    const seeds: Omit<NewsItem, 'id'>[] = [
      {
        title: 'Institutional Bitcoin ETF Net Inflows Exceed $450M in Single Day',
        summary: 'Spot Bitcoin exchange-traded funds recorded their strongest daily inflows this month, led by BlackRock and Fidelity.',
        source: 'CoinDesk',
        url: 'https://www.coindesk.com/markets/bitcoin-etf-inflow-surge',
        publishedAt: now - 25 * 60 * 1000,
        category: 'Institutional',
        mentionedSymbols: ['BTC'],
        credibilityScore: 0.95,
        sentiment: 'Bullish'
      },
      {
        title: 'Solana Ecosystem DEX Volume Overtakes Ethereum Mainnet for Third Consecutive Week',
        summary: 'High retail activity and low transaction fees continue to drive decentralized trading volume on the Solana network.',
        source: 'Cointelegraph',
        url: 'https://cointelegraph.com/news/solana-dex-volume-ethereum',
        publishedAt: now - 55 * 60 * 1000,
        category: 'Protocol',
        mentionedSymbols: ['SOL', 'ETH'],
        credibilityScore: 0.90,
        sentiment: 'Bullish'
      },
      {
        title: 'SEC Concludes Investigation Into DeFi Staking Protocol Without Enforcement Action',
        summary: 'Regulatory clarity improves as the regulatory agency formally closes its inquiry into decentralized liquid staking mechanisms.',
        source: 'Decrypt',
        url: 'https://decrypt.co/sec-closes-defi-investigation',
        publishedAt: now - 2 * 3600 * 1000,
        category: 'Regulation',
        mentionedSymbols: ['LDO', 'ETH', 'AAVE'],
        credibilityScore: 0.92,
        sentiment: 'Bullish'
      },
      {
        title: 'Decentralized AI Networks See Surge in Verified Worker Nodes Following SDK 2.0 Release',
        summary: 'Artificial Superintelligence Alliance and Render Protocol experience increased network computing capacity from global GPU clusters.',
        source: 'The Block',
        url: 'https://theblock.co/post/ai-crypto-compute-expansion',
        publishedAt: now - 3 * 3600 * 1000,
        category: 'Protocol',
        mentionedSymbols: ['FET', 'RENDER', 'TAO'],
        credibilityScore: 0.88,
        sentiment: 'Bullish'
      },
      {
        title: 'Federal Reserve Signals Measured Approach to Interest Rate Policy in Latest Minutes',
        summary: 'Macroeconomic indicators suggest inflation cooling towards target, maintaining favorable conditions for risk assets.',
        source: 'Bloomberg Crypto',
        url: 'https://bloomberg.com/crypto/fed-rate-policy-update',
        publishedAt: now - 5 * 3600 * 1000,
        category: 'Macro',
        mentionedSymbols: ['BTC', 'ETH'],
        credibilityScore: 0.98,
        sentiment: 'Neutral'
      }
    ];

    this.newsItems = seeds.map((s, idx) => ({
      ...s,
      id: `news_${idx + 1}`
    }));
  }

  public getLatestNews(limit = 20, category?: NewsCategory): NewsItem[] {
    let list = this.newsItems;
    if (category) {
      list = list.filter(item => item.category === category);
    }
    return list.slice(0, limit);
  }

  public getNewsForSymbol(symbol: string): NewsItem[] {
    return this.newsItems.filter(item => item.mentionedSymbols.includes(symbol));
  }

  public addNewsItem(item: Omit<NewsItem, 'id'>): NewsItem {
    // Deduplication check: check if title or url already exists
    const duplicate = this.newsItems.find(n => 
      n.url === item.url || n.title.toLowerCase() === item.title.toLowerCase()
    );
    if (duplicate) {
      return duplicate;
    }

    const newItem: NewsItem = {
      ...item,
      id: `news_${Date.now()}_${Math.floor(Math.random() * 1000)}`
    };

    this.newsItems.unshift(newItem);
    if (this.newsItems.length > 500) {
      this.newsItems.pop();
    }

    return newItem;
  }
}
