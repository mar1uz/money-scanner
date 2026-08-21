import { Candle, AssetPriceQuote, Timeframe, SCANNER_ASSETS } from '@money-scanner/shared';
import { MarketHealthMonitor } from '../health-monitor.js';

export class PublicStockMarketAdapter {
  private healthMonitor: MarketHealthMonitor;

  private tickerMap: Record<string, string> = {
    'NVDA': 'NVDA',
    'TSLA': 'TSLA',
    'AAPL': 'AAPL',
    'MSFT': 'MSFT',
    'GOOGL': 'GOOGL',
    'AMZN': 'AMZN',
    'META': 'META',
    'PLTR': 'PLTR',
    'AMD': 'AMD',
    'MSTR': 'MSTR',
    'COIN': 'COIN',
    'SPY': 'SPY',
    'QQQ': 'QQQ',
    'XAU': 'GC=F',
    'XAG': 'SI=F',
    'OIL': 'CL=F',
    'COPPER': 'HG=F',
    'PAXG': 'PAXG-USD',
    'SPACEX': 'ARKX' // Space exploration tech proxy
  };

  constructor(healthMonitor: MarketHealthMonitor) {
    this.healthMonitor = healthMonitor;
  }

  public isStockOrMetal(symbol: string): boolean {
    const sym = symbol.toUpperCase();
    const asset = SCANNER_ASSETS.find(a => a.symbol.toUpperCase() === sym);
    if (asset) {
      return asset.marketClass === 'stocks' || asset.marketClass === 'metals';
    }
    if (Boolean(this.tickerMap[sym])) return true;
    // If symbol does not look like a crypto coin (or is a custom stock search), query Yahoo
    const commonCryptos = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'AVAX', 'SUI', 'DOT', 'NEAR', 'APT', 'SEI', 'FTM', 'PEPE', 'SHIB', 'WIF', 'BONK', 'UNI', 'AAVE', 'LINK', 'FET', 'RENDER', 'TAO'];
    if (commonCryptos.includes(sym)) return false;
    return true;
  }

  public mapTimeframeToYahoo(timeframe: Timeframe): { interval: string; range: string } {
    switch (timeframe) {
      case '1h': return { interval: '1h', range: '1mo' };
      case '4h': return { interval: '1h', range: '3mo' }; // aggregate
      case '8h': return { interval: '1d', range: '6mo' };
      case '1d': return { interval: '1d', range: '2y' };
      case '1w': return { interval: '1wk', range: '5y' };
      case '1m': return { interval: '1mo', range: '10y' };
      default: return { interval: '1d', range: '2y' };
    }
  }

  public async fetchCandles(
    symbol: string,
    timeframe: Timeframe = '1h',
    limit = 1000
  ): Promise<Candle[]> {
    const sym = symbol.toUpperCase();
    const yahooTicker = this.tickerMap[sym] || sym;
    const { interval, range } = this.mapTimeframeToYahoo(timeframe);

    const startTime = Date.now();

    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooTicker)}?range=${range}&interval=${interval}&includePrePost=false`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json() as any;
        const result = data?.chart?.result?.[0];
        if (result && result.timestamp && result.indicators?.quote?.[0]) {
          const timestamps: number[] = result.timestamp;
          const quote = result.indicators.quote[0];
          const opens: (number | null)[] = quote.open;
          const highs: (number | null)[] = quote.high;
          const lows: (number | null)[] = quote.low;
          const closes: (number | null)[] = quote.close;
          const volumes: (number | null)[] = quote.volume;

          const candles: Candle[] = [];
          for (let i = 0; i < timestamps.length; i++) {
            const o = opens[i];
            const h = highs[i];
            const l = lows[i];
            const c = closes[i];
            const v = volumes[i];

            if (o !== null && h !== null && l !== null && c !== null && v !== null && !isNaN(c)) {
              candles.push({
                timestamp: timestamps[i] * 1000,
                open: Number(o.toFixed(4)),
                high: Number(h.toFixed(4)),
                low: Number(l.toFixed(4)),
                close: Number(c.toFixed(4)),
                volume: Math.floor(v),
                isClosed: i < timestamps.length - 1
              });
            }
          }

          if (candles.length >= 10) {
            this.healthMonitor.recordSuccess('YahooFinance', Date.now() - startTime);
            return candles.slice(-limit);
          }
        }
      }
    } catch (err) {
      this.healthMonitor.recordError('YahooFinance');
      throw err;
    }

    this.healthMonitor.recordError('YahooFinance');
    throw new Error(`No verified Yahoo Finance candle data available for ${sym}`);
  }

  public async fetchQuote(symbol: string): Promise<AssetPriceQuote> {
    const sym = symbol.toUpperCase();
    const yahooTicker = this.tickerMap[sym] || sym;

    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooTicker)}?interval=1d&range=ytd`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0'
        }
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json() as any;
        const meta = data?.chart?.result?.[0]?.meta;
        if (meta && meta.regularMarketPrice) {
          const price = Number(meta.regularMarketPrice.toFixed(4));
          const prevClose = meta.previousClose || meta.chartPreviousClose || price;
          const change24h = Number((((price - prevClose) / prevClose) * 100).toFixed(2));
          if (
            typeof meta.regularMarketDayHigh !== 'number' ||
            typeof meta.regularMarketDayLow !== 'number' ||
            typeof meta.regularMarketVolume !== 'number' ||
            typeof meta.regularMarketTime !== 'number'
          ) {
            throw new Error(`Incomplete verified quote returned for ${sym}`);
          }
          const high24h = Number(meta.regularMarketDayHigh.toFixed(4));
          const low24h = Number(meta.regularMarketDayLow.toFixed(4));
          const volume24h = meta.regularMarketVolume;

          const quotes = data?.chart?.result?.[0]?.indicators?.quote?.[0];
          const firstOpen = quotes?.open ? quotes.open.find((v: any) => v !== null && v !== undefined && v > 0) : null;

          let changeYtd: number | undefined;
          if (firstOpen && firstOpen > 0) {
            changeYtd = Number((((price - firstOpen) / firstOpen) * 100).toFixed(2));
          }

          return {
            symbol: sym,
            price,
            change24h,
            changeYtd,
            high24h,
            low24h,
            volume24h,
            timestamp: meta.regularMarketTime * 1000,
            source: 'YahooFinancePublic',
            isStale: false
          };
        }
      }
    } catch (err) {
      this.healthMonitor.recordError('YahooFinance');
      throw err;
    }

    this.healthMonitor.recordError('YahooFinance');
    throw new Error(`No verified Yahoo Finance quote available for ${sym}`);
  }

}
