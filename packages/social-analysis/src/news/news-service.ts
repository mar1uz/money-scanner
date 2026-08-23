import { NewsItem, NewsCategory } from '@money-scanner/shared';

const LIVE_FEEDS = [
  // Crypto Specialist Tier 1
  { url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', source: 'CoinDesk' },
  { url: 'https://cointelegraph.com/rss', source: 'Cointelegraph' },
  { url: 'https://decrypt.co/feed', source: 'Decrypt' },
  { url: 'https://blockworks.co/feed', source: 'Blockworks' },
  { url: 'https://www.theblock.co/rss.xml', source: 'The Block' },
  { url: 'https://bitcoinmagazine.com/.rss/full/', source: 'Bitcoin Magazine' },

  // Traditional Markets, Fed, Stocks & Macro
  { url: 'https://finance.yahoo.com/news/rssindex', source: 'Yahoo Finance' },
  { url: 'https://news.google.com/rss/search?q=Federal+Reserve+OR+inflation+OR+interest+rates+OR+CPI+when:1d&hl=en-US&gl=US&ceid=US:en', source: 'Macro News' },
  { url: 'https://news.google.com/rss/search?q=Nvidia+OR+Apple+OR+Microsoft+OR+Tesla+stock+when:1d&hl=en-US&gl=US&ceid=US:en', source: 'Stock News' },
  { url: 'https://news.google.com/rss/search?q=crypto+OR+bitcoin+OR+ethereum+when:1d&hl=en-US&gl=US&ceid=US:en', source: 'Crypto News' }
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

const DETECTABLE_SYMBOLS = [
  'BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'ADA', 'SUI', 'AVAX', 'LINK', 'NEAR',
  'FET', 'RENDER', 'TAO', 'PEPE', 'BNB', 'SHIB', 'XLM', 'BCH', 'ETC', 'ATOM',
  'FIL', 'ARB', 'OP', 'POL', 'TIA', 'WIF', 'BONK', 'FLOKI', 'STX', 'IMX',
  'GALA', 'SAND', 'MANA', 'APE', 'WLD', 'S', 'KAS', 'KAVA',
  'NVDA', 'TSLA', 'AAPL', 'MSFT', 'AMZN', 'GOOGL', 'META', 'AMD', 'PLTR',
  'MSTR', 'COIN', 'SPY', 'QQQ', 'DXY', 'GOLD', 'SILVER', 'GLD', 'SLV'
];

export class NewsIntelligenceService {
  private newsItems: NewsItem[] = [];
  private inFlight: Promise<void> | null = null;
  private lastFetchedAt = 0;

  constructor() {
    this.fetchLiveNews().catch(() => {});
  }

  public async fetchLiveNews(force = false): Promise<void> {
    if (!force && Date.now() - this.lastFetchedAt < 10 * 60_000 && this.newsItems.length > 0) return;
    if (this.inFlight) return this.inFlight;

    const refreshAbort = new AbortController();
    const deadline = setTimeout(() => refreshAbort.abort(), LIVE_REFRESH_TIMEOUT_MS);

    this.inFlight = (async () => {
      const fetchTasks: Promise<void>[] = [];

      // 1. Ingest all curated RSS live feeds
      for (const feed of LIVE_FEEDS) {
        fetchTasks.push((async () => {
          try {
            const response = await fetch(feed.url, {
              headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 MoneyScanner/1.0 (+https://scanner.relayhub.no)' },
              signal: refreshAbort.signal
            });
            if (!response.ok) return;
            this.parseRssItems(await response.text(), feed.source);
          } catch {}
        })());
      }

      // 2. CryptoCompare API (if CRYPTOCOMPARE_API_KEY is configured)
      const ccApiKey = process.env.CRYPTOCOMPARE_API_KEY || process.env.CRYPTO_COMPARE_API_KEY;
      if (ccApiKey) {
        fetchTasks.push((async () => {
          try {
            const response = await fetch('https://min-api.cryptocompare.com/data/v2/news/?lang=EN', {
              headers: {
                'authorization': `Apikey ${ccApiKey}`,
                'User-Agent': 'MoneyScanner/1.0'
              },
              signal: refreshAbort.signal
            });
            if (response.ok) {
              const data = await response.json() as { Data?: Array<{ url: string; title: string; body?: string; source_info?: { name?: string }; published_on?: number; categories?: string; tags?: string }> };
              if (Array.isArray(data.Data)) {
                for (const article of data.Data) {
                  if (!article.title || !article.url) continue;
                  const title = article.title.trim();
                  const summary = (article.body || article.title).trim();
                  const source = article.source_info?.name || 'CryptoCompare';
                  const publishedAt = article.published_on ? article.published_on * 1000 : Date.now();
                  const text = `${title} ${summary} ${article.categories || ''} ${article.tags || ''}`;
                  const mentionedSymbols = DETECTABLE_SYMBOLS.filter(s => new RegExp(`(?:\\$|\\b)${s}\\b`, 'i').test(text));
                  const category = this.categorizeText(title, summary);
                  const sentiment = this.inferSentiment(title);
                  this.addNewsItem({
                    title,
                    summary: summary.length > 260 ? `${summary.slice(0, 257)}…` : summary,
                    source,
                    url: article.url,
                    publishedAt,
                    category,
                    mentionedSymbols,
                    sentiment
                  });
                }
              }
            }
          } catch {}
        })());
      }

      // 3. CryptoPanic API (if CRYPTOPANIC_API_KEY is configured)
      const panicApiKey = process.env.CRYPTOPANIC_API_KEY || process.env.CRYPTO_PANIC_API_KEY;
      if (panicApiKey) {
        fetchTasks.push((async () => {
          try {
            const response = await fetch(`https://cryptopanic.com/api/v1/posts/?auth_token=${panicApiKey}&public=true`, {
              signal: refreshAbort.signal
            });
            if (response.ok) {
              const data = await response.json() as { results?: Array<{ title: string; url: string; published_at: string; source?: { title?: string }; currencies?: Array<{ code: string }> }> };
              if (Array.isArray(data.results)) {
                for (const post of data.results) {
                  if (!post.title || !post.url) continue;
                  const title = post.title.trim();
                  const source = post.source?.title || 'CryptoPanic';
                  const publishedAt = post.published_at ? new Date(post.published_at).getTime() : Date.now();
                  const mentionedSymbols = post.currencies?.map(c => c.code.toUpperCase()) || [];
                  const category = this.categorizeText(title, title);
                  const sentiment = this.inferSentiment(title);
                  this.addNewsItem({
                    title,
                    summary: title,
                    source,
                    url: post.url,
                    publishedAt,
                    category,
                    mentionedSymbols,
                    sentiment
                  });
                }
              }
            }
          } catch {}
        })());
      }

      // 4. Finnhub API (if FINNHUB_API_KEY is configured)
      const finnhubKey = process.env.FINNHUB_API_KEY || process.env.FINNHUB_KEY;
      if (finnhubKey) {
        fetchTasks.push((async () => {
          try {
            const [genRes, cryptoRes] = await Promise.all([
              fetch(`https://finnhub.io/api/v1/news?category=general&token=${finnhubKey}`, { signal: refreshAbort.signal }),
              fetch(`https://finnhub.io/api/v1/news?category=crypto&token=${finnhubKey}`, { signal: refreshAbort.signal })
            ]);
            for (const res of [genRes, cryptoRes]) {
              if (res.ok) {
                const data = await res.json() as Array<{ headline: string; summary?: string; source?: string; url: string; datetime?: number; category?: string }>;
                if (Array.isArray(data)) {
                  for (const item of data) {
                    if (!item.headline || !item.url) continue;
                    const title = item.headline.trim();
                    const summary = (item.summary || item.headline).trim();
                    const source = item.source || 'Finnhub';
                    const publishedAt = item.datetime ? item.datetime * 1000 : Date.now();
                    const text = `${title} ${summary}`;
                    const mentionedSymbols = DETECTABLE_SYMBOLS.filter(s => new RegExp(`(?:\\$|\\b)${s}\\b`, 'i').test(text));
                    const category = this.categorizeText(title, summary);
                    const sentiment = this.inferSentiment(title);
                    this.addNewsItem({
                      title,
                      summary: summary.length > 260 ? `${summary.slice(0, 257)}…` : summary,
                      source,
                      url: item.url,
                      publishedAt,
                      category,
                      mentionedSymbols,
                      sentiment
                    });
                  }
                }
              }
            }
          } catch {}
        })());
      }

      const results = await Promise.allSettled(fetchTasks);
      if (results.some(r => r.status === 'fulfilled')) {
        this.lastFetchedAt = Date.now();
        this.newsItems.sort((a, b) => b.publishedAt - a.publishedAt);
        this.newsItems = this.newsItems.slice(0, 500);
      }
    })().finally(() => {
      clearTimeout(deadline);
      this.inFlight = null;
    });

    return this.inFlight;
  }

  private categorizeText(title: string, summary: string): NewsCategory {
    const text = `${title} ${summary}`.toLowerCase();
    if (/\b(sec|cftc|court|regulat|law|legal|judge|lawsuit|compliance|ban|tariff)\b/i.test(text)) return 'Regulation';
    if (/\b(etf|fund|institution|bank|blackrock|fidelity|grayscale|morgan stanley|goldman|treasury reserve)\b/i.test(text)) return 'Institutional';
    if (/\b(fed|federal reserve|inflation|cpi|pce|rate cut|rate hike|macro|gdp|yield|powell|central bank|jobs report)\b/i.test(text)) return 'Macro';
    if (/\b(hack|exploit|breach|scam|drain|vulnerability|stolen|phishing)\b/i.test(text)) return 'Security';
    if (/\b(exchange|binance|coinbase|kraken|bybit|okx|listing|delisting)\b/i.test(text)) return 'Exchange';
    if (/\b(protocol|network|upgrade|blockchain|defi|hard fork|mainnet|layer 2|solana|ethereum|bitcoin l2)\b/i.test(text)) return 'Protocol';
    return 'General';
  }

  private inferSentiment(title: string): 'Bullish' | 'Neutral' | 'Bearish' {
    if (/\b(soar|surge|breakout|rally|all-time high|ath|record high|bullish|inflows|approval|growth|beat estimates|outperform)\b/i.test(title)) {
      return 'Bullish';
    }
    if (/\b(crash|plunge|dump|lawsuit|ban|hack|scam|stolen|bearish|drop|collapse|outflow|drain|liquidat|sell-off|warning)\b/i.test(title)) {
      return 'Bearish';
    }
    return 'Neutral';
  }

  private parseRssItems(xml: string, defaultSource: string): void {
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
      const sourceRaw = /<source\b[^>]*>([\s\S]*?)<\/source>/i.exec(item)?.[1];

      if (!titleRaw || !linkRaw || !dateRaw) continue;
      const title = plainText(titleRaw);
      const url = plainText(linkRaw);
      const publishedAt = new Date(plainText(dateRaw)).getTime();
      if (!title || !/^https:\/\//i.test(url) || !Number.isFinite(publishedAt)) continue;

      const source = sourceRaw ? plainText(sourceRaw) : defaultSource;
      const description = plainText(descriptionRaw);
      const summary = description.length > 260 ? `${description.slice(0, 257)}…` : description;
      const text = `${title} ${summary}`;
      const mentionedSymbols = DETECTABLE_SYMBOLS
        .filter(symbol => new RegExp(`(?:\\$|\\b)${symbol}\\b`, 'i').test(text));

      const category = this.categorizeText(title, summary);
      const sentiment = this.inferSentiment(title);

      this.addNewsItem({
        title,
        summary: summary || title,
        source,
        url,
        publishedAt,
        category,
        mentionedSymbols,
        sentiment
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
    const normalized = symbol.toUpperCase().replace(/^[$#]/, '').trim();
    const symbolAliases: Record<string, string[]> = {
      BTC: ['BTC', 'BITCOIN', 'SATOSHI'],
      ETH: ['ETH', 'ETHEREUM', 'ETHER'],
      SOL: ['SOL', 'SOLANA'],
      NVDA: ['NVDA', 'NVIDIA'],
      TSLA: ['TSLA', 'TESLA'],
      AAPL: ['AAPL', 'APPLE'],
      MSFT: ['MSFT', 'MICROSOFT'],
      GOOGL: ['GOOGL', 'GOOGLE', 'ALPHABET'],
      AMZN: ['AMZN', 'AMAZON'],
      META: ['META', 'FACEBOOK'],
      MSTR: ['MSTR', 'MICROSTRATEGY', 'MICHAEL SAYLOR'],
      COIN: ['COIN', 'COINBASE'],
      XRP: ['XRP', 'RIPPLE'],
      DOGE: ['DOGE', 'DOGECOIN'],
      GOLD: ['GOLD', 'XAU', 'GLD', 'BULLION'],
      SILVER: ['SILVER', 'XAG', 'SLV']
    };

    const aliases = symbolAliases[normalized] || [normalized];
    const regexList = aliases.map(a => new RegExp(`(?:\\$|\\b)${a}\\b`, 'i'));

    return this.newsItems
      .filter(item =>
        item.mentionedSymbols.includes(normalized) ||
        regexList.some(r => r.test(item.title) || r.test(item.summary))
      )
      .slice(0, 10);
  }

  public addNewsItem(item: Omit<NewsItem, 'id'>): NewsItem {
    const duplicate = this.newsItems.find(existing => existing.url === item.url);
    if (duplicate) return duplicate;

    const newsItem: NewsItem = { ...item, id: stableId(item.url) };
    this.newsItems.push(newsItem);
    return newsItem;
  }
}
