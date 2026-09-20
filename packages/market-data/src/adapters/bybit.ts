import { Candle, AssetPriceQuote, Timeframe } from '@money-scanner/shared';
import { MarketHealthMonitor } from '../health-monitor.js';
import { aggregate4hTo8h, TIMEFRAME_MS } from './klines.js';

/**
 * Bybit spot market adapter. Public market-data endpoints only.
 * Bybit has no native 8h klines: 8h candles are aggregated from UTC-aligned 4h klines.
 */
export class BybitMarketAdapter {
  private baseUrl = process.env.BYBIT_API_URL || 'https://api.bybit.com';
  private healthMonitor: MarketHealthMonitor;
  private supportedSpotUsdtCache: { values: Set<string>; updatedAt: number } | null = null;

  constructor(healthMonitor: MarketHealthMonitor) {
    this.healthMonitor = healthMonitor;
  }

  private async json(path: string, timeoutMs = 8_000): Promise<any> {
    const response = await fetch(`${this.baseUrl}${path}`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new Error(`Bybit HTTP ${response.status}`);
    const body = await response.json();
    if (body?.retCode !== 0) throw new Error(`Bybit retCode ${body?.retCode}: ${body?.retMsg || 'unknown'}`);
    return body.result;
  }

  /** Base coins with a live USDT spot pair (e.g. GRASS for GRASSUSDT). Cached 15 min. */
  public async getSupportedSpotUsdtAssets(): Promise<Set<string>> {
    if (this.supportedSpotUsdtCache && Date.now() - this.supportedSpotUsdtCache.updatedAt < 15 * 60_000) {
      return this.supportedSpotUsdtCache.values;
    }
    const values = new Set<string>();
    let cursor = '';
    for (let page = 0; page < 10; page += 1) {
      const cursorParam = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
      const result = await this.json(`/v5/market/instruments-info?category=spot&limit=1000${cursorParam}`);
      for (const row of result?.list || []) {
        if (row.status === 'Trading' && row.quoteCoin === 'USDT' && row.baseCoin) {
          values.add(String(row.baseCoin).toUpperCase());
        }
      }
      cursor = result?.nextPageCursor || '';
      if (!cursor) break;
    }
    this.supportedSpotUsdtCache = { values, updatedAt: Date.now() };
    return values;
  }

  private nativeInterval(tf: Timeframe): string | null {
    switch (tf) {
      case '1h': return '60';
      case '4h': return '240';
      case '1d': return 'D';
      case '1w': return 'W';
      case '1m': return 'M';
      default: return null; // 8h aggregated from 4h
    }
  }

  /**
   * Earliest daily candle timestamp (ms) for a spot pair.
   * Bybit klines return the newest candles before `end`, so bracket the
   * listing era with a coarse walk (Bybit spot launched mid-2021), then
   * binary-search the first day with candles and read the oldest returned.
   */
  public async firstDailyCandleTs(pair: string): Promise<number | null> {
    const DAY = 86_400_000;
    const probe = async (end: number, limit: number): Promise<any[]> => {
      const result = await this.json(`/v5/market/kline?category=spot&symbol=${pair}&interval=D&start=0&end=${Math.floor(end)}&limit=${limit}`);
      return result?.list || [];
    };
    try {
      const step = 120 * DAY;
      let lo = Date.UTC(2021, 0, 1); // before Bybit spot existed: always empty
      let hi = 0;
      for (let end = lo + step; end <= Date.now() + step; end += step) {
        const list = await probe(end, 1);
        if (list.length > 0) { hi = end; break; }
        lo = end;
        if (end > Date.now()) return null;
      }
      if (!hi) return null;
      while (hi - lo > DAY) {
        const mid = lo + Math.floor((hi - lo) / 2);
        const list = await probe(mid, 1);
        if (list.length > 0) hi = mid;
        else lo = mid;
      }
      const list = await probe(hi, 25);
      if (list.length === 0) return null;
      return Math.min(...list.map(row => Number(row[0])));
    } catch {
      return null;
    }
  }

  private parseKlines(list: any[], timeframe: Timeframe): Candle[] {
    const now = Date.now();
    return (list || [])
      .map(row => ({
        timestamp: Number(row[0]),
        open: Number(row[1]),
        high: Number(row[2]),
        low: Number(row[3]),
        close: Number(row[4]),
        volume: Number(row[5]),
        isClosed: Number(row[0]) + TIMEFRAME_MS[timeframe] <= now
      }))
      .filter(c => Number.isFinite(c.timestamp) && Number.isFinite(c.close))
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  private async fetchKlinesAsc(pair: string, interval: string, timeframe: Timeframe, limit: number, end?: number): Promise<Candle[]> {
    const endParam = end ? `&end=${Math.floor(end)}` : '';
    const result = await this.json(
      `/v5/market/kline?category=spot&symbol=${pair}&interval=${interval}&limit=${Math.min(1000, limit)}${endParam}`
    );
    return this.parseKlines(result?.list || [], timeframe);
  }

  public async fetchCandles(pair: string, timeframe: Timeframe = '1h', limit = 1000): Promise<Candle[]> {
    const startTime = Date.now();
    try {
      const native = this.nativeInterval(timeframe);
      const candles = native
        ? await this.fetchKlinesAsc(pair, native, timeframe, limit)
        : aggregate4hTo8h(await this.fetchKlinesAsc(pair, '240', '4h', limit * 2));
      this.healthMonitor.recordSuccess('Bybit', Date.now() - startTime);
      return candles.slice(-limit);
    } catch (err) {
      this.healthMonitor.recordError('Bybit');
      throw err;
    }
  }

  public async fetchCandlesBefore(pair: string, timeframe: Timeframe, beforeTimestamp: number, limit = 1000): Promise<Candle[]> {
    const startTime = Date.now();
    try {
      const end = Math.floor(beforeTimestamp) - 1;
      const native = this.nativeInterval(timeframe);
      const candles = native
        ? await this.fetchKlinesAsc(pair, native, timeframe, limit, end)
        : aggregate4hTo8h(await this.fetchKlinesAsc(pair, '240', '4h', limit * 2, end));
      this.healthMonitor.recordSuccess('Bybit', Date.now() - startTime);
      return candles.slice(-limit);
    } catch (err) {
      this.healthMonitor.recordError('Bybit');
      throw err;
    }
  }

  public async fetch24hTicker(pair: string, displaySymbol: string): Promise<AssetPriceQuote> {
    const result = await this.json(`/v5/market/tickers?category=spot&symbol=${pair}`);
    const row = result?.list?.[0];
    if (!row) throw new Error(`Bybit: no ticker for ${pair}`);
    const price = Number(row.lastPrice);
    return {
      symbol: displaySymbol,
      price,
      change24h: Number(row.price24hPcnt) * 100,
      high24h: Number(row.highPrice24h),
      low24h: Number(row.lowPrice24h),
      volume24h: Number(row.turnover24h),
      timestamp: Date.now(),
      source: 'Bybit',
      isStale: false
    };
  }
}
