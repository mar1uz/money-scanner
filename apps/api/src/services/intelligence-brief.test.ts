import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { selectIntelligenceSources } from '../routes/ai-routes.js';
import type { NewsItem, XPostItem } from '@money-scanner/shared';

const now = Date.now();
const news = (overrides: Partial<NewsItem>): NewsItem => ({
  id: `news_${Math.random()}`, title: 'Bitcoin ETF inflows accelerate',
  summary: 'Institutional flows increased during the latest session.', source: 'Example News',
  url: 'https://example.com/news', publishedAt: now - 30 * 60_000, category: 'Institutional', mentionedSymbols: ['BTC'], ...overrides
});
const social = (overrides: Partial<XPostItem>): XPostItem => ({
  id: `social_${Math.random()}`, platform: 'Bluesky', authorHandle: 'analyst.bsky.social', authorName: 'Analyst',
  authorFollowers: 25_000, authorVerified: true, authorCredibilityScore: 0.8,
  text: 'Bitcoin ETF inflows accelerate after the latest session.', timestamp: now - 20 * 60_000,
  url: 'https://bsky.app/profile/analyst.bsky.social/post/3test', likes: 10, reposts: 2, replies: 1,
  isSpamProbability: 0.05, mentionedSymbols: ['BTC'], ...overrides
});

describe('intelligence brief source selection', () => {
  it('filters by sector, period and source while keeping corroborating sources', () => {
    const selected = selectIntelligenceSources(
      [news({ id: 'btc-news', mentionedSymbols: ['BTC'] }), news({ id: 'gold-news', title: 'Gold supply tightens', summary: 'Metals demand rose.', mentionedSymbols: ['XAU'], category: 'General' }), news({ id: 'old-news', publishedAt: now - 8 * 24 * 60 * 60_000 })],
      [social({ id: 'btc-social' })], { sector: 'crypto', period: '24h', source: 'all' }
    );
    assert.equal(selected.news.length, 1);
    assert.equal(selected.social.length, 1);
    assert.equal(selected.news[0].id, 'btc-news');
  });

  it('does not mix social sources into a news-only brief', () => {
    const selected = selectIntelligenceSources([news({ id: 'btc-news' })], [social({ id: 'btc-social' })], { sector: 'crypto', period: '24h', source: 'news' });
    assert.equal(selected.news.length, 1);
    assert.equal(selected.social.length, 0);
  });

  it('limits repeated copies of the same event to two corroborating sources', () => {
    const selected = selectIntelligenceSources([news({ id: 'one' }), news({ id: 'two', url: 'https://example.com/two' }), news({ id: 'three', url: 'https://example.com/three' })], [], { sector: 'crypto', period: '24h', source: 'all' });
    assert.equal(selected.news.length, 2);
  });
});
