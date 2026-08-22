import { NewsItem, NewsCategory } from '@money-scanner/shared';

const LIVE_FEEDS = [
  { url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', source: 'CoinDesk' },
  { url: 'https://cointelegraph.com/rss', source: 'Cointelegraph' },
  { url: 'https://decrypt.co/feed', source: 'Decrypt' }
];

const LIVE_REFRESH_TIMEOUT_MS = 12_000;

const decodeXml = (value: string) => value
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'")
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>');

const plainText = (value: string) => decodeXml(value)
  .replace(/<[^>]*>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const stableId = (url: string) => {
  let hash = 2166136261;
  for (let index = 0; index < url.length; index += 1) {
    hash = Math.imul(hash ^ url.charCodeAt(index), 16777619);
  }
  return `news_${(hash >>> 0).toString(16)}`;
};

export class NewsIntelligenceService {
  private newsItems: NewsItem[] = [];
  private inFlight: Promise<void> | null = null;
  private lastFetchedAt = 0;

  constructor() {
    this.fetchLiveNews().catch(() => {});
  }

  public async fetchLiveNews(force = false): Promise<void> {
    if (!force && Date.now() - this.lastFetchedAt < 10 * 60_000) return;
    if (this.inFlight) return this.inFlight;

    // Use one hard deadline for the entire refresh. Some RSS hosts keep a
    // connection open after headers have arrived, so a per-request timeout is
    // not enough to protect the API request that is waiting for all feeds.
    const refreshAbort = new AbortController();
    const deadline = setTimeout(() => refreshAbort.abort(), LIVE_REFRESH_TIMEOUT_MS);
    this.inFlight = (async () => {
      const feedResults = await Promise.allSettled(LIVE_FEEDS.map(async feed => {
        const response = await fetch(feed.url, {
          headers: { 'User-Agent': 'MoneyScanner/1.0 (+https://scanner.relayhub.no)' },
          signal: refreshAbort.signal
        });
        if (!response.ok) throw new Error(`${feed.source} RSS HTTP ${response.status}`);
        this.parseRssItems(await response.text(), feed.source);
      }));

      if (feedResults.some(result => result.status === 'fulfilled')) {
        this.lastFetchedAt = Date.now();
        this.newsItems.sort((a, b) => b.publishedAt - a.publishedAt);
        this.newsItems = this.newsItems.slice(0, 300);
      }
    })().finally(() => {
      clearTimeout(deadline);
      this.inFlight = null;
    });

    return this.inFlight;
  }

  private parseRssItems(xml: string, source: string): void {
    const itemRegex = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
    let match: RegExpExecArray | null;

    while ((match = itemRegex.exec(xml)) !== null) {
      const item = match[1];
      const titleRaw = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(item)?.[1];
      const linkRaw = /<link\b[^>]*>([\s\S]*?)<\/link>/i.exec(item)?.[1]
        || /<guid\b[^>]*>([\s\S]*?)<\/guid>/i.exec(item)?.[1];
      const dateRaw = /<pubDate\b[^>]*>([\s\S]*?)<\/pubDate>/i.exec(item)?.[1]
        || /<dc:date\b[^>]*>([\s\S]*?)<\/dc:date>/i.exec(item)?.[1];
      const descriptionRaw = /<description\b[^>]*>([\s\S]*?)<\/description>/i.exec(item)?.[1] || '';

      if (!titleRaw || !linkRaw || !dateRaw) continue;
      const title = plainText(titleRaw);
      const url = plainText(linkRaw);
      const publishedAt = new Date(plainText(dateRaw)).getTime();
      if (!title || !/^https:\/\//i.test(url) || !Number.isFinite(publishedAt)) continue;

      const description = plainText(descriptionRaw);
      const summary = description.length > 260 ? `${description.slice(0, 257)}…` : description;
      const text = `${title} ${summary}`;
      const mentionedSymbols = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'ADA', 'SUI', 'AVAX', 'LINK', 'NEAR', 'FET', 'RENDER', 'TAO', 'PEPE']
        .filter(symbol => new RegExp(`(?:\\$|\\b)${symbol}\\b`, 'i').test(text));

      let category: NewsCategory = 'General';
      if (/\b(sec|cftc|court|regulat|law|legal)\b/i.test(title)) category = 'Regulation';
      else if (/\b(etf|fund|institution|bank|blackrock|fidelity)\b/i.test(title)) category = 'Institutional';
      else if (/\b(fed|inflation|treasury|rate cut|macro|gdp)\b/i.test(title)) category = 'Macro';
      else if (/\b(hack|exploit|breach|scam|drain)\b/i.test(title)) category = 'Security';
      else if (/\b(exchange|binance|coinbase|kraken)\b/i.test(title)) category = 'Exchange';
      else if (/\b(protocol|network|upgrade|blockchain|defi)\b/i.test(title)) category = 'Protocol';

      this.addNewsItem({
        title,
        summary: summary || title,
        source,
        url,
        publishedAt,
        category,
        mentionedSymbols
      });
    }
  }

  public getLatestNews(limit = 25, category?: NewsCategory): NewsItem[] {
    const list = category
      ? this.newsItems.filter(item => item.category === category)
      : this.newsItems;
    return list.slice(0, Math.max(1, Math.min(limit, 100)));
  }

  public getNewsForSymbol(symbol: string): NewsItem[] {
    const normalized = symbol.toUpperCase();
    return this.newsItems
      .filter(item => item.mentionedSymbols.includes(normalized))
      .slice(0, 8);
  }

  public addNewsItem(item: Omit<NewsItem, 'id'>): NewsItem {
    const duplicate = this.newsItems.find(existing => existing.url === item.url);
    if (duplicate) return duplicate;

    const newsItem: NewsItem = { ...item, id: stableId(item.url) };
    this.newsItems.push(newsItem);
    return newsItem;
  }
}
