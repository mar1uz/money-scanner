import { XPostItem, XTrendTopic } from '@money-scanner/shared';
import { assessSpamProbability } from './spam-filter.js';
import { calculateAuthorCredibility } from './credibility.js';
import { clusterPostsIntoTopics } from './clustering.js';

const DEFAULT_BLUESKY_QUERIES = ['bitcoin', 'ethereum', 'stock market', 'gold market'];
const FREE_SOURCE_REFRESH_TIMEOUT_MS = 12_000;
const SOCIAL_SYMBOLS = [
  'BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'ADA', 'SUI', 'AVAX', 'LINK', 'AAVE', 'UNI',
  'NVDA', 'TSLA', 'AAPL', 'MSFT', 'META', 'GOOGL', 'AMZN', 'PLTR', 'AMD', 'ASML',
  'XAU', 'GOLD', 'XAG', 'SILVER', 'OIL', 'COPPER'
];

const extractMentionedSymbols = (text: string): string[] => {
  const upper = text.toUpperCase();
  const aliases: Record<string, string[]> = {
    BTC: ['BITCOIN'], ETH: ['ETHEREUM'], SOL: ['SOLANA'], XAU: ['GOLD'], XAG: ['SILVER']
  };

  return SOCIAL_SYMBOLS.filter(symbol => {
    const terms = [symbol, ...(aliases[symbol] || [])];
    return terms.some(term => new RegExp(`(?:\\$|#|\\b)${term}\\b`, 'i').test(upper));
  }).filter((symbol, index, list) => list.indexOf(symbol) === index);
};

const trustedPostUrl = (post: XPostItem): boolean => {
  if (post.platform === 'Bluesky') return /^https:\/\/bsky\.app\/profile\/[^/]+\/post\/[^/?#]+$/.test(post.url);
  if (post.platform === 'Telegram') return /^https:\/\/t\.me\/[^/]+\/\d+$/.test(post.url);
  if (post.platform === 'Mastodon') return /^https:\/\/[^/]+\/@[^/]+\/\d+$/.test(post.url);
  return /^https:\/\/x\.com\/[^/]+\/status\/\d+/.test(post.url);
};

const htmlToPlainText = (value: string): string => value
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<\/(?:p|div|li)>/gi, ' ')
  .replace(/<[^>]+>/g, '')
  .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)))
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/[ \t]+/g, ' ')
  .replace(/\s*\n\s*/g, '\n')
  .trim();

/**
 * X read access is pay-per-use. Production starts empty and only exposes posts
 * ingested from a licensed upstream provider; it never manufactures posts,
 * timestamps, engagement or status URLs.
 */
export class XSocialIntelligenceService {
  private recentPosts: XPostItem[] = [];
  private freeSourceRefresh: Promise<void> | null = null;
  private lastFreeSourceFetch = 0;

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
    if (!post.id || !trustedPostUrl(post)) return false;
    if (this.recentPosts.some(existing => existing.id === post.id || existing.url === post.url)) return false;
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

  /**
   * Refreshes public Bluesky search results. The public AppView does not need
   * authentication. Failures are intentionally non-fatal so News/RSS remains
   * available if a public social endpoint is rate-limited or unreachable.
   */
  public async refreshFreeSources(force = false): Promise<void> {
    if (!force && Date.now() - this.lastFreeSourceFetch < 2 * 60_000) return;
    if (this.freeSourceRefresh) return this.freeSourceRefresh;

    // A shared deadline keeps a single slow public endpoint from blocking the
    // News Feed and its AI synthesis for Cloud Run's full request timeout.
    const refreshAbort = new AbortController();
    const deadline = setTimeout(() => refreshAbort.abort(), FREE_SOURCE_REFRESH_TIMEOUT_MS);
    this.freeSourceRefresh = (async () => {
      const configured = (process.env.BLUESKY_SEARCH_QUERIES || '')
        .split(',')
        .map(query => query.trim())
        .filter(Boolean);
      const queries = (configured.length ? configured : DEFAULT_BLUESKY_QUERIES).slice(0, 8);

      const telegramChannels = (process.env.TELEGRAM_SOURCE_CHANNELS || '')
        .split(',')
        .map(channel => channel.trim().replace(/^@/, ''))
        .filter(channel => /^[a-zA-Z0-9_]{5,32}$/.test(channel))
        .slice(0, 8);

      const blueskyTasks = queries.map(async query => {
        const params = new URLSearchParams({ q: query, sort: 'latest', limit: '25' });
        const response = await fetch(
          `https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?${params.toString()}`,
          {
            headers: { accept: 'application/json', 'user-agent': 'MarketScanner360/1.0' },
            signal: refreshAbort.signal
          }
        );
        if (!response.ok) throw new Error(`Bluesky HTTP ${response.status}`);

        const body = await response.json() as any;
        for (const item of Array.isArray(body?.posts) ? body.posts : []) {
          const uri = String(item?.uri || '');
          const match = /^at:\/\/[^/]+\/app\.bsky\.feed\.post\/([^/]+)$/.exec(uri);
          const handle = String(item?.author?.handle || '').trim();
          const text = String(item?.record?.text || '').trim();
          const timestamp = new Date(item?.record?.createdAt || item?.indexedAt || '').getTime();
          if (!match || !handle || text.length < 12 || !Number.isFinite(timestamp)) continue;
          if (Date.now() - timestamp > 48 * 60 * 60_000) continue;

          this.ingestPost({
            id: `bsky_${String(item?.cid || match[1])}`,
            platform: 'Bluesky',
            authorHandle: handle,
            authorName: String(item?.author?.displayName || handle),
            authorFollowers: Number(item?.author?.followersCount || 0),
            authorVerified: Boolean(item?.author?.verification?.verifiedStatus === 'valid'),
            authorCredibilityScore: 0,
            text,
            timestamp,
            url: `https://bsky.app/profile/${encodeURIComponent(handle)}/post/${encodeURIComponent(match[1])}`,
            likes: Number(item?.likeCount || 0),
            reposts: Number(item?.repostCount || 0),
            replies: Number(item?.replyCount || 0),
            isSpamProbability: 0,
            mentionedSymbols: extractMentionedSymbols(text)
          });
        }
      });

      const telegramTasks = telegramChannels.map(async channel => {
        const response = await fetch(`https://t.me/s/${encodeURIComponent(channel)}`, {
          headers: { accept: 'text/html', 'user-agent': 'MarketScanner360/1.0' },
          signal: refreshAbort.signal
        });
        if (!response.ok) throw new Error(`Telegram public page HTTP ${response.status}`);
        this.ingestTelegramPublicPage(channel, await response.text());
      });

      const results = await Promise.allSettled([...blueskyTasks, ...telegramTasks]);

      if (results.some(result => result.status === 'fulfilled')) {
        this.lastFreeSourceFetch = Date.now();
      }
    })().finally(() => {
      clearTimeout(deadline);
      this.freeSourceRefresh = null;
    });

    return this.freeSourceRefresh;
  }

  /**
   * Parses Telegram's public channel preview page. This provides read-only,
   * no-token access to public posts and retains the exact message permalink.
   */
  public ingestTelegramPublicPage(channel: string, html: string): number {
    const normalizedChannel = channel.trim().replace(/^@/, '');
    if (!/^[a-zA-Z0-9_]{5,32}$/.test(normalizedChannel) || !html) return 0;

    const starts = Array.from(html.matchAll(/<div class="tgme_widget_message_wrap\b/g), match => match.index || 0);
    let accepted = 0;

    for (let index = 0; index < starts.length; index += 1) {
      const block = html.slice(starts[index], starts[index + 1] || html.length);
      const postMatch = /data-post="([^"/]+)\/(\d+)"/.exec(block);
      const timeMatch = /<time datetime="([^"]+)"/.exec(block);
      if (!postMatch || !timeMatch || postMatch[1].toLowerCase() !== normalizedChannel.toLowerCase()) continue;

      const timestamp = new Date(timeMatch[1]).getTime();
      if (!Number.isFinite(timestamp) || Date.now() - timestamp > 48 * 60 * 60_000) continue;

      const textCandidates = Array.from(
        block.matchAll(/<div class="tgme_widget_message_text js-message_text"[^>]*>([\s\S]*?)<\/div>/g),
        match => htmlToPlainText(match[1])
      ).filter(text => text.length >= 12);
      const text = textCandidates.sort((left, right) => right.length - left.length)[0];
      if (!text) continue;

      const authorMatch = /tgme_widget_message_owner_name[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/.exec(block);
      const messageId = Number(postMatch[2]);
      const authorName = htmlToPlainText(authorMatch?.[1] || '') || normalizedChannel;

      if (this.ingestPost({
        id: `telegram_${normalizedChannel.toLowerCase()}_${messageId}`,
        platform: 'Telegram',
        authorHandle: normalizedChannel,
        authorName,
        authorFollowers: 0,
        authorVerified: false,
        authorCredibilityScore: 0,
        text: text.slice(0, 2_000),
        timestamp,
        url: `https://t.me/${normalizedChannel}/${messageId}`,
        likes: 0,
        reposts: 0,
        replies: 0,
        isSpamProbability: 0,
        mentionedSymbols: extractMentionedSymbols(text)
      })) accepted += 1;
    }

    return accepted;
  }

  /**
   * Accepts only public Telegram channel posts from an explicit allow-list.
   * A public channel username is required so every stored item has a real,
   * clickable t.me source URL.
   */
  public ingestTelegramUpdate(update: any, allowList = process.env.TELEGRAM_SOURCE_CHANNELS || ''): boolean {
    const message = update?.channel_post || update?.edited_channel_post;
    const chat = message?.chat;
    const username = String(chat?.username || '').replace(/^@/, '').trim();
    const text = String(message?.text || message?.caption || '').trim();
    const messageId = Number(message?.message_id);
    const timestamp = Number(message?.date) * 1000;
    if (!username || !text || !Number.isFinite(messageId) || !Number.isFinite(timestamp)) return false;

    const allowed = allowList
      .split(',')
      .map(value => value.trim().replace(/^@/, '').toLowerCase())
      .filter(Boolean);
    const chatId = String(chat?.id || '').toLowerCase();
    if (!allowed.length || (!allowed.includes(username.toLowerCase()) && !allowed.includes(chatId))) return false;

    return this.ingestPost({
      id: `telegram_${chatId}_${messageId}`,
      platform: 'Telegram',
      authorHandle: username,
      authorName: String(chat?.title || username),
      authorFollowers: 0,
      authorVerified: false,
      authorCredibilityScore: 0,
      text,
      timestamp,
      url: `https://t.me/${username}/${messageId}`,
      likes: 0,
      reposts: 0,
      replies: 0,
      isSpamProbability: 0,
      mentionedSymbols: extractMentionedSymbols(text)
    });
  }
}
