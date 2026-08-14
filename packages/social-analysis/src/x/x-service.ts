import { XPostItem, XTrendTopic, TOP_50_CRYPTO_ASSETS } from '@money-scanner/shared';
import { assessSpamProbability } from './spam-filter.js';
import { calculateAuthorCredibility } from './credibility.js';
import { clusterPostsIntoTopics } from './clustering.js';

export class XSocialIntelligenceService {
  private recentPosts: XPostItem[] = [];

  constructor() {
    this.seedInitialPosts();
  }

  private seedInitialPosts() {
    const now = Date.now();
    const curatedSeeds: {
      handle: string;
      name: string;
      followers: number;
      verified: boolean;
      text: string;
      symbols: string[];
      likes: number;
      reposts: number;
    }[] = [
      {
        handle: 'crypto_analyst',
        name: 'Macro Alpha',
        followers: 120_000,
        verified: true,
        text: '$BTC holding above the 200 EMA with expanding spot ETF inflows. Clean setup forming on the 4H.',
        symbols: ['BTC'],
        likes: 1240,
        reposts: 310
      },
      {
        handle: 'solana_daily',
        name: 'Solana Ecosystem',
        followers: 85_000,
        verified: true,
        text: 'New DEX volume records on $SOL. Active wallets up 45% week-over-week. Breakout above key resistance.',
        symbols: ['SOL'],
        likes: 890,
        reposts: 215
      },
      {
        handle: 'sui_intern',
        name: 'Sui Network Hub',
        followers: 42_000,
        verified: true,
        text: '$SUI TVL crosses $1.2B milestone as gaming protocols migrate. High liquidity inflows detected.',
        symbols: ['SUI'],
        likes: 540,
        reposts: 120
      },
      {
        handle: 'eth_researcher',
        name: 'Ethereum Builder',
        followers: 65_000,
        verified: true,
        text: '$ETH L2 gas fees down 90% post blob upgrade. Layer 2 ecosystem volume scaling rapidly $ARB $OP.',
        symbols: ['ETH', 'ARB', 'OP'],
        likes: 720,
        reposts: 180
      },
      {
        handle: 'ai_crypto_hub',
        name: 'AI Agent Watcher',
        followers: 35_000,
        verified: false,
        text: 'Decentralized compute protocols seeing major enterprise node adoption: $FET $RENDER $TAO.',
        symbols: ['FET', 'RENDER', 'TAO'],
        likes: 410,
        reposts: 95
      },
      {
        handle: 'defi_pulse',
        name: 'DeFi Alpha',
        followers: 90_000,
        verified: true,
        text: '$AAVE fee revenue hits highest level since 2021. V3 deployments on multiple chains driving organic yield.',
        symbols: ['AAVE'],
        likes: 630,
        reposts: 140
      },
      {
        handle: 'random_shill_bot_99',
        name: 'Crypto Pump 100x',
        followers: 4,
        verified: false,
        text: 'FREE AIRDROP CLAIM HERE! 100% PROFIT GUARANTEED 100x $PEPE $DOGE drop wallet in whatsapp!',
        symbols: ['PEPE', 'DOGE'],
        likes: 2,
        reposts: 0
      }
    ];

    this.recentPosts = curatedSeeds.map((item, idx) => {
      const isSpam = assessSpamProbability({
        text: item.text,
        authorFollowers: item.followers,
        authorVerified: item.verified
      });

      const credibility = calculateAuthorCredibility(
        item.followers,
        item.verified,
        item.likes,
        item.reposts
      );

      return {
        id: `post_${idx + 1}`,
        authorHandle: item.handle,
        authorName: item.name,
        authorFollowers: item.followers,
        authorVerified: item.verified,
        authorCredibilityScore: credibility,
        text: item.text,
        timestamp: now - (idx * 15 * 60 * 1000),
        url: `https://x.com/${item.handle}/status/${1800000000000000000 + idx}`,
        likes: item.likes,
        reposts: item.reposts,
        replies: Math.floor(item.likes / 10),
        isSpamProbability: isSpam,
        mentionedSymbols: item.symbols
      };
    });
  }

  public getTrendingTopics(): XTrendTopic[] {
    return clusterPostsIntoTopics(this.recentPosts);
  }

  public getPostsForSymbol(symbol: string): XPostItem[] {
    return this.recentPosts.filter(p => p.mentionedSymbols.includes(symbol));
  }

  public addRawPost(post: Omit<XPostItem, 'id' | 'isSpamProbability' | 'authorCredibilityScore'>): XPostItem {
    const isSpam = assessSpamProbability(post);
    const credibility = calculateAuthorCredibility(
      post.authorFollowers,
      post.authorVerified,
      post.likes,
      post.reposts
    );

    const fullPost: XPostItem = {
      ...post,
      id: `post_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      isSpamProbability: isSpam,
      authorCredibilityScore: credibility
    };

    this.recentPosts.unshift(fullPost);
    if (this.recentPosts.length > 500) {
      this.recentPosts.pop();
    }

    return fullPost;
  }
}
