import { Candle, AssetPriceQuote, Timeframe } from '@money-scanner/shared';
import { MarketHealthMonitor } from '../health-monitor.js';
import { aggregate4hTo8h } from './klines.js';

interface OkxInstrument {
  instId?: string;
  baseCcy?: string;
  quoteCcy?: string;
  state?: string;
  listTime?: string;
}

/**
 * OKX spot market adapter. Public endpoints only.
 * OKX has no native 8H bar: 8h candles are aggregated from UTC-aligned 4H candles.
 */
export class OkxMarketAdapter {
  private baseUrl = process.env.OKX_API_URL || 'https://www.okx.com';
  private healthMonitor: MarketHealthMonitor;
  private instrumentsCache: { byBase: Map<string, { instId: string; listTime: number | null }>; updatedAt: number } | null = null;

  constructor(healthMonitor: MarketHealthMonitor) {
    this.healthMonitor = healthMonitor;
  }

  private async json(path: string, timeoutMs = 8_000): Promise<any[]> {
    const response = await fetch(`${this.baseUrl}${path}`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new Error(`OKX HTTP ${response.status}`);
    const body = await response.json();
    if (body?.code !== '0') throw new Error(`OKX code ${body?.code}: ${body?.msg || 'unknown'}`);
    return body.data || [];
  }

  /** Live USDT-quoted spot instruments keyed by base currency. Cached 15 min. */
  public async getSpotUsdtInstruments(): Promise<Map<string, { instId: string; listTime: number | null }>> {
    if (this.instrumentsCache && Date.now() - this.instrumentsCache.updatedAt < 15 * 60_000) {
      return this.instrumentsCache.byBase;
    }
    const rows = await this.json('/api/v5/public/instruments?instType=SPOT') as OkxInstrument[];
    const byBase = new Map<string, { instId: string; listTime: number | null }>();
    for (const row of rows) {
      if (row.state !== 'live' || row.quoteCcy !== 'USDT' || !row.baseCcy || !row.instId) continue;
      const listTime = row.listTime ? Number(row.listTime) : null;
      byBase.set(row.baseCcy.toUpperCase(), { instId: row.instId, listTime: Number.isFinite(listTime) ? listTime : null });
    }
    this.instrumentsCache = { byBase, updatedAt: Date.now() };
    return byBase;
  }

  private nativeBar(tf: Timeframe): string | null {
    switch (tf) {
      case '1h': return '1H';
      case '4h': return '4H';
      case '1d': return '1D';
      case '1w': return '1W';
      case '1m': return '1M';
      default: return null; // 8h aggregated from 4H
    }
  }

  private parseRows(rows: any[]): Candle[] {
    return (rows || [])
      .map(row => ({
        timestamp: Number(row[0]),
        open: Number(row[1]),
        high: Number(row[2]),
        low: Number(row[3]),
        close: Number(row[4]),
        volume: Number(row[5]),
        isClosed: String(row[8]) === '1'
      }))
      .filter(c => Number.isFinite(c.timestamp) && Number.isFinite(c.close))
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  private async fetchBarsAsc(instId: string, bar: string, limit: number, after?: number): Promise<Candle[]> {
    let remaining = Math.min(limit, 300);
    let collected: Candle[] = [];
    let afterTs = after;
    // history-candles pages backwards (candles earlier than `after`).
    while (remaining > 0) {
      const batch = Math.min(100, remaining);
      const afterParam = afterTs ? `&after=${Math.floor(afterTs)}` : '';
      const path = afterTs
        ? `/api/v5/market/history-candles?instId=${instId}&bar=${bar}&limit=${batch}${afterParam}`
        : `/api/v5/market/candles?instId=${instId}&bar=${bar}&limit=${batch}`;
      const rows = await this.json(path);
      const candles = this.parseRows(rows);
      if (candles.length === 0) break;
      collected = collected.length
        ? [...candles.filter(c => c.timestamp < collected[0].timestamp), ...collected]
        : candles;
      if (candles.length < batch) break;
      remaining -= candles.length;
      afterTs = candles[0].timestamp - 1;
    }
    return collected.slice(-limit);
  }

  public async fetchCandles(instId: string, timeframe: Timeframe = '1h', limit = 1000): Promise<Candle[]> {
    const startTime = Date.now();
    try {
      const native = this.nativeBar(timeframe);
      const candles = native
        ? await this.fetchBarsAsc(instId, native, Math.min(limit, 300))
        : aggregate4hTo8h(await this.fetchBarsAsc(instId, '4H', Math.min(limit * 2, 300)));
      this.healthMonitor.recordSuccess('OKX', Date.now() - startTime);
      return candles.slice(-limit);
    } catch (err) {
      this.healthMonitor.recordError('OKX');
      throw err;
    }
  }

  public async fetchCandlesBefore(instId: string, timeframe: Timeframe, beforeTimestamp: number, limit = 1000): Promise<Candle[]> {
    const startTime = Date.now();
    try {
      const after = Math.floor(beforeTimestamp) - 1;
      const native = this.nativeBar(timeframe);
      const candles = native
        ? await this.fetchBarsAsc(instId, native, Math.min(limit, 300), after)
        : aggregate4hTo8h(await this.fetchBarsAsc(instId, '4H', Math.min(limit * 2, 300), after));
      this.healthMonitor.recordSuccess('OKX', Date.now() - startTime);
      return candles.slice(-limit);
    } catch (err) {
      this.healthMonitor.recordError('OKX');
      throw err;
    }
  }

  public async fetch24hTicker(instId: string, displaySymbol: string): Promise<AssetPriceQuote> {
    const rows = await this.json(`/api/v5/market/ticker?instId=${instId}`);
    const row = rows?.[0];
    if (!row) throw new Error(`OKX: no ticker for ${instId}`);
    const price = Number(row.last);
    const open24h = Number(row.open24h);
    return {
      symbol: displaySymbol,
      price,
      change24h: open24h > 0 ? ((price - open24h) / open24h) * 100 : 0,
      high24h: Number(row.high24h),
      low24h: Number(row.low24h),
      // On OKX spot `volCcy24h` is already the 24h volume in the quote currency
      // (`vol24h` is the base-currency amount). Measured 2026-09-25, BTC-USDT:
      // volCcy24h = 454,012,851.8 USDT, matching Bybit turnover24h ≈ 438M;
      // multiplying it by `last` reported 38,134,173,868,677 USDT (~84,000x).
      volume24h: Number(row.volCcy24h || 0),
      timestamp: Date.now(),
      source: 'OKX',
      isStale: false
    };
  }
}
