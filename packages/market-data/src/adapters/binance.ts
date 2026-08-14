import { Candle, AssetPriceQuote, Timeframe } from '@money-scanner/shared';
import { MarketHealthMonitor } from '../health-monitor.js';

export class BinanceMarketAdapter {
  private baseUrl = 'https://api.binance.com/api/v3';
  private healthMonitor: MarketHealthMonitor;

  constructor(healthMonitor: MarketHealthMonitor) {
    this.healthMonitor = healthMonitor;
  }

  private mapTimeframeToInterval(tf: Timeframe): string {
    switch (tf) {
      case '1h': return '1h';
      case '4h': return '4h';
      case '1d': return '1d';
      case '1w': return '1w';
      case '1m': return '1M';
      default: return '1h';
    }
  }

  public async fetchCandles(
    symbol: string,
    timeframe: Timeframe = '1h',
    limit = 250
  ): Promise<Candle[]> {
    const pair = `${symbol}USDT`;
    const interval = this.mapTimeframeToInterval(timeframe);
    const url = `${this.baseUrl}/klines?symbol=${pair}&interval=${interval}&limit=${limit}`;

    const startTime = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Binance HTTP error: ${response.status} ${response.statusText}`);
      }

      const raw = await response.json() as [
        number, // 0 Open time
        string, // 1 Open
        string, // 2 High
        string, // 3 Low
        string, // 4 Close
        string, // 5 Volume
        number, // 6 Close time
        string, // 7 Quote asset volume
        number, // 8 Number of trades
        string, // 9 Taker buy base asset volume
        string, // 10 Taker buy quote asset volume
        string  // 11 Ignore
      ][];

      const candles: Candle[] = raw.map((item, idx) => {
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

      this.healthMonitor.recordSuccess('Binance', Date.now() - startTime);
      return candles;
    } catch (err) {
      this.healthMonitor.recordError('Binance');
      throw err;
    }
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

      return {
        symbol,
        price: parseFloat(data.lastPrice),
        change24h: parseFloat(data.priceChangePercent),
        high24h: parseFloat(data.highPrice),
        low24h: parseFloat(data.lowPrice),
        volume24h: parseFloat(data.volume),
        timestamp: data.closeTime,
        source: 'Binance REST v3',
        isStale: false
      };
    } catch (err) {
      this.healthMonitor.recordError('Binance');
      throw err;
    }
  }
}
