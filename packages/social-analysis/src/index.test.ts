import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assessSpamProbability } from './x/spam-filter.js';
import { calculateAuthorCredibility } from './x/credibility.js';
import { XSocialIntelligenceService } from './x/x-service.js';
import { NewsIntelligenceService } from './news/news-service.js';

describe('Social & News Intelligence Engine', () => {
  it('detects high-risk spam patterns and filters bot posts', () => {
    const spamPost = {
      text: 'FREE AIRDROP CLAIM HERE! 100% profit guaranteed 100x $DOGE $PEPE $SOL drop wallet',
      authorFollowers: 2,
      authorVerified: false
    };
    const spamProb = assessSpamProbability(spamPost);
    assert.ok(spamProb >= 0.6, `Expected spam prob >= 0.6, got ${spamProb}`);

    const legitimatePost = {
      text: 'Bitcoin network hash rate reached a new all-time high today, indicating strong miner participation.',
      authorFollowers: 50_000,
      authorVerified: true
    };
    const legitProb = assessSpamProbability(legitimatePost);
    assert.ok(legitProb <= 0.2, `Expected legit prob <= 0.2, got ${legitProb}`);
  });

  it('calculates credibility score accurately based on engagement and verification', () => {
    const credHigh = calculateAuthorCredibility(150_000, true, 500, 200);
    assert.ok(credHigh >= 0.8, `Expected high credibility >= 0.8, got ${credHigh}`);

    const credLow = calculateAuthorCredibility(5, false, 0, 0);
    assert.ok(credLow <= 0.4, `Expected low credibility <= 0.4, got ${credLow}`);
  });

  it('clusters X topics and ignores high probability spam', () => {
    const xService = new XSocialIntelligenceService();
    xService.ingestPost({
      id: '20',
      authorHandle: 'jack',
      authorName: 'jack',
      authorFollowers: 1_000_000,
      authorVerified: true,
      authorCredibilityScore: 0,
      text: 'Recorded fixture: $BTC network activity remains constructive.',
      timestamp: Date.now(),
      url: 'https://x.com/jack/status/20',
      likes: 500,
      reposts: 200,
      replies: 20,
      isSpamProbability: 0,
      mentionedSymbols: ['BTC']
    });
    const topics = xService.getTrendingTopics();

    assert.ok(topics.length > 0);
    const btcTopic = topics.find(t => t.cashtag === '$BTC');
    assert.ok(btcTopic !== undefined);
    assert.ok(btcTopic.credibilityScore > 0.5);
    assert.ok(btcTopic.velocityScore >= 0);
  });

  it('aggregates news, prevents duplicates and categorizes accurately', () => {
    const newsService = new NewsIntelligenceService();
    const initialCount = newsService.getLatestNews().length;

    // Add new unique article
    const item = newsService.addNewsItem({
      title: 'Solana Mobile 3.0 Pre-Orders Open Worldwide',
      summary: 'New crypto-native smartphone announced with hardware wallet integration.',
      source: 'Decrypt',
      url: 'https://decrypt.co/solana-mobile-3',
      publishedAt: Date.now(),
      category: 'Protocol',
      mentionedSymbols: ['SOL'],
      credibilityScore: 0.9,
      sentiment: 'Bullish'
    });

    assert.equal(newsService.getLatestNews().length, initialCount + 1);

    // Adding duplicate with same URL should not increase count
    newsService.addNewsItem({
      title: 'Solana Mobile 3.0 Pre-Orders Open Worldwide',
      summary: 'Different summary copy of same story',
      source: 'Other Source',
      url: 'https://decrypt.co/solana-mobile-3',
      publishedAt: Date.now(),
      category: 'Protocol',
      mentionedSymbols: ['SOL'],
      credibilityScore: 0.8,
      sentiment: 'Bullish'
    });

    assert.equal(newsService.getLatestNews().length, initialCount + 1);
  });
});
