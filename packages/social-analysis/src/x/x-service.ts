import { XPostItem, XTrendTopic } from '@money-scanner/shared';
import { assessSpamProbability } from './spam-filter.js';
import { calculateAuthorCredibility } from './credibility.js';
import { clusterPostsIntoTopics } from './clustering.js';

/**
 * X read access is pay-per-use. Production starts empty and only exposes posts
 * ingested from a licensed upstream provider; it never manufactures posts,
 * timestamps, engagement or status URLs.
 */
export class XSocialIntelligenceService {
  private recentPosts: XPostItem[] = [];

  public getTrendingTopics(): XTrendTopic[] {
    return this.recentPosts.length ? clusterPostsIntoTopics(this.recentPosts) : [];
  }

  public getRecentVerifiedPosts(): XPostItem[] {
    return [...this.recentPosts];
  }

  public getPostsForSymbol(symbol: string): XPostItem[] {
    const normalized = symbol.toUpperCase();
    return this.recentPosts.filter(post => post.mentionedSymbols?.includes(normalized));
  }

  public ingestPost(post: XPostItem): boolean {
    if (!post.id || !/^https:\/\/x\.com\/[^/]+\/status\/\d+/.test(post.url)) return false;
    const spamProbability = assessSpamProbability(post);
    if (spamProbability > 0.65) return false;

    post.isSpamProbability = spamProbability;
    post.authorCredibilityScore = calculateAuthorCredibility(
      post.authorFollowers,
      post.authorVerified,
      post.likes,
      post.reposts
    );
    this.recentPosts.unshift(post);
    if (this.recentPosts.length > 300) this.recentPosts.pop();
    return true;
  }
}
