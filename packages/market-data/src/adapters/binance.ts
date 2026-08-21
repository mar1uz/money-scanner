import { Candle, AssetPriceQuote, Timeframe } from '@money-scanner/shared';
import { MarketHealthMonitor } from '../health-monitor.js';

export class BinanceMarketAdapter {
  // Binance recommends this host for public, market-data-only requests.
  private baseUrl = process.env.BINANCE_API_URL || 'https://data-api.binance.vision/api/v3';
  private healthMonitor: MarketHealthMonitor;

  constructor(healthMonitor: MarketHealthMonitor) {
    this.healthMonitor = healthMonitor;
  }

  private mapTimeframeToInterval(tf: Timeframe): string {
    switch (tf) {
      case '1h': return '1h';
      case '4h': return '4h';
      case '8h': return '8h';
      case '1d': return '1d';
      case '1w': return '1w';
      case '1m': return '1M';
      default: return '1h';
    }
  }

  public async fetchCandles(
    symbol: string,
    timeframe: Timeframe = '1h',
    limit = 1000
  ): Promise<Candle[]> {
    const pair = `${symbol}USDT`;
    const interval = this.mapTimeframeToInterval(timeframe);
    const startTime = Date.now();

    try {
      // If requested limit <= 1000, do single fast fetch
      if (limit <= 1000) {
        const url = `${this.baseUrl}/klines?symbol=${pair}&interval=${interval}&limit=${limit}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);

        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`Binance HTTP error: ${response.status} ${response.statusText}`);
        }

        const raw = await response.json() as any[];
        const candles = this.parseRawKlines(raw);
        this.healthMonitor.recordSuccess('Binance', Date.now() - startTime);
        return candles;
      }

      // If deep historical data is requested (>1000 bars), fetch sequentially backwards
      let allCandles: Candle[] = [];
      let currentEndTime: number | undefined = undefined;
      const targetCount = Math.min(limit, 2000);

      while (allCandles.length < targetCount) {
        const batchLimit = Math.min(1000, targetCount - allCandles.length);
        const endParam = currentEndTime ? `&endTime=${currentEndTime}` : '';
        const url = `${this.baseUrl}/klines?symbol=${pair}&interval=${interval}&limit=${batchLimit}${endParam}`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) break;
        const raw = await response.json() as any[];
        if (!raw || raw.length === 0) break;

        const batch = this.parseRawKlines(raw);
        if (allCandles.length === 0) {
          allCandles = batch;
        } else {
          // Prepend older candles before existing ones, removing overlaps
          const oldestTime = allCandles[0].timestamp;
          const newOlder = batch.filter(b => b.timestamp < oldestTime);
          if (newOlder.length === 0) break;
          allCandles = [...newOlder, ...allCandles];
        }

        if (batch.length < batchLimit) break; // Reached genesis of the trading pair on Binance
        currentEndTime = batch[0].timestamp - 1;
      }

      this.healthMonitor.recordSuccess('Binance', Date.now() - startTime);
      return allCandles;
    } catch (err) {
      this.healthMonitor.recordError('Binance');
      throw err;
    }
  }

  private parseRawKlines(raw: any[]): Candle[] {
    return raw.map((item, idx) => {
      const isLast = idx === raw.length - 1;
      return {
        timestamp: item[0],
        open: parseFloat(item[1]),
        high: parseFloat(item[2]),
        low: parseFloat(item[3]),
        close: parseFloat(item[4]),
        volume: parseFloat(item[5]),
        isClosed: !isLast
      };
    });
  }

  private startOfYearPriceCache: Map<string, number> = new Map();

  private async getStartOfYearPrice(symbol: string): Promise<number | null> {
    if (this.startOfYearPriceCache.has(symbol)) {
      return this.startOfYearPriceCache.get(symbol)!;
    }

    try {
      const pair = `${symbol}USDT`;
      const startOfYear = Date.UTC(new Date().getUTCFullYear(), 0, 1);
      const url = `${this.baseUrl}/klines?symbol=${pair}&interval=1d&startTime=${startOfYear}&limit=1`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json() as any[];
        if (Array.isArray(data) && data.length > 0 && data[0][1]) {
          const openPrice = parseFloat(data[0][1]);
          if (openPrice > 0) {
            this.startOfYearPriceCache.set(symbol, openPrice);
            return openPrice;
          }
        }
      }
    } catch {}

    return null;
  }

  public async fetch24hTicker(symbol: string): Promise<AssetPriceQuote> {
    const pair = `${symbol}USDT`;
    const url = `${this.baseUrl}/ticker/24hr?symbol=${pair}`;
    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Binance Ticker HTTP error: ${response.status}`);
      }

      const data = await response.json() as {
        lastPrice: string;
        priceChangePercent: string;
        highPrice: string;
        lowPrice: string;
        volume: string;
        closeTime: number;
      };

      this.healthMonitor.recordSuccess('Binance', Date.now() - startTime);

      const currentPrice = parseFloat(data.lastPrice);
      const change24h = parseFloat(data.priceChangePercent);
      
      // Calculate 100% Real Dynamic YTD from Jan 1st Open Price
      const startOfYearPrice = await this.getStartOfYearPrice(symbol);
      let changeYtd: number | undefined;
      if (startOfYearPrice && startOfYearPrice > 0) {
        changeYtd = Number((((currentPrice - startOfYearPrice) / startOfYearPrice) * 100).toFixed(2));
      }

      return {
        symbol,
        price: currentPrice,
        change24h,
        changeYtd,
        high24h: parseFloat(data.highPrice),
        low24h: parseFloat(data.lowPrice),
        volume24h: parseFloat(data.volume),
        timestamp: data.closeTime,
        source: 'Binance',
        isStale: false
      };
    } catch (err) {
      this.healthMonitor.recordError('Binance');
      throw err;
    }
  }
}
