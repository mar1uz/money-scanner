import { Candle, AssetPriceQuote, Timeframe } from '@money-scanner/shared';
import { MarketHealthMonitor } from '../health-monitor.js';
import { TIMEFRAME_MS } from './klines.js';

/** MEXC spot klines are Binance-shaped, but its historical range behavior is not Binance-compatible. */
export class MexcMarketAdapter {
  private baseUrl = process.env.MEXC_API_URL || 'https://api.mexc.com/api/v3';
  constructor(private health: MarketHealthMonitor) { this.health.registerProvider('MEXC'); }

  private interval(timeframe: Timeframe): string { return timeframe === '1h' ? '60m' : timeframe === '1w' ? '1W' : timeframe === '1m' ? '1M' : timeframe; }
  private async rows(pair: string, timeframe: Timeframe, limit: number, start?: number, end?: number): Promise<any[]> {
    const params = new URLSearchParams({ symbol: pair, interval: this.interval(timeframe), limit: String(Math.min(500, limit)) });
    if (start !== undefined) params.set('startTime', String(Math.floor(start)));
    if (end !== undefined) params.set('endTime', String(Math.floor(end)));
    const res = await fetch(`${this.baseUrl}/klines?${params}`, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) throw new Error(`MEXC klines HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error(`MEXC klines: ${data?.msg || 'invalid response'}`);
    return data;
  }
  private parse(rows: any[], timeframe: Timeframe): Candle[] {
    const now = Date.now();
    return rows.map(row => ({
      timestamp: Number(row[0]), open: Number(row[1]), high: Number(row[2]),
      low: Number(row[3]), close: Number(row[4]), volume: Number(row[5]),
      isClosed: Number(row[6]) <= now || Number(row[0]) + TIMEFRAME_MS[timeframe] <= now
    })).filter(row => Number.isFinite(row.timestamp) && row.open > 0 && row.high >= row.low && row.close > 0)
      .sort((a, b) => a.timestamp - b.timestamp);
  }
  public async fetchCandles(pair: string, timeframe: Timeframe, limit: number): Promise<Candle[]> {
    const started = Date.now();
    try {
      const values = this.parse(await this.rows(pair, timeframe, limit), timeframe).slice(-limit);
      if (!values.length) throw new Error('MEXC returned no candles');
      this.health.recordSuccess('MEXC', Date.now() - started);
      return values;
    } catch (error) { this.health.recordError('MEXC'); throw error; }
  }
  /** MEXC ignores endTime without a bounded startTime. Page explicit windows
   * and leave enough headroom that an exchange-side max-500 cap cannot omit
   * bars nearest the requested boundary. */
  public async fetchCandlesBefore(pair: string, timeframe: Timeframe, before: number, limit: number): Promise<Candle[]> {
    const safeLimit = Math.min(1000, Math.max(1, Math.floor(limit)));
    const step = TIMEFRAME_MS[timeframe];
    const batchSpan = timeframe === '1m' ? 10 : timeframe === '1w' ? 30 : Math.min(400, safeLimit + 1);
    let boundary = before;
    const found = new Map<number, Candle>();
    for (let page = 0; page < Math.ceil(safeLimit / batchSpan) + 2 && found.size < safeLimit; page++) {
      const start = Math.max(1, boundary - batchSpan * step);
      const rows = this.parse(await this.rows(pair, timeframe, 500, start, boundary - 1), timeframe)
        .filter(row => row.timestamp < boundary);
      if (!rows.length) break;
      for (const row of rows) found.set(row.timestamp, row);
      if (start <= 1 || rows[0].timestamp > start + 2 * step) break;
      boundary = rows[0].timestamp;
    }
    return [...found.values()].sort((a, b) => a.timestamp - b.timestamp).slice(-safeLimit);
  }
  /** Probe listing age in bounded historical windows; an unbounded endTime is ignored by MEXC. */
  public async firstDailyCandleTs(pair: string): Promise<number | null> {
    const DAY = 86_400_000;
    const recent = this.parse(await this.rows(pair, '1d', 1000), '1d');
    if (!recent.length) return null;
    if (recent.length < 500) return recent[0].timestamp;
    // A fixed 90-day window has a monotone predicate: once it reaches the
    // listing, it contains candles. A 1-2 day window can miss a nearby listing.
    const boundary = Math.floor(Date.now() / DAY) * DAY;
    const WINDOW = 90 * DAY;
    let lo = Date.UTC(2015, 0, 1), hi = boundary;
    while (hi - lo > DAY) {
      const mid = Math.floor((lo + hi) / (2 * DAY)) * DAY;
      const probe = await this.rows(pair, '1d', 1, mid, mid + WINDOW);
      if (probe.length) hi = mid; else lo = mid;
    }
    // hi may be as much as 90 days before listing; read that bounded range.
    const first = this.parse(await this.rows(pair, '1d', 100, Math.max(1, hi - DAY), hi + WINDOW + DAY), '1d');
    return first[0]?.timestamp ?? null;
  }
  public async fetchQuote(pair: string, symbol: string): Promise<AssetPriceQuote> {
    const res = await fetch(`${this.baseUrl}/ticker/24hr?symbol=${encodeURIComponent(pair)}`, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) throw new Error(`MEXC ticker HTTP ${res.status}`);
    const row = await res.json() as Record<string, string>;
    const price = Number(row.lastPrice);
    if (!Number.isFinite(price) || price <= 0) throw new Error('MEXC ticker price unavailable');
    return { symbol, price, change24h: Number(row.priceChangePercent) || 0,
      high24h: Number(row.highPrice) || price, low24h: Number(row.lowPrice) || price,
      volume24h: Number(row.volume) || 0, timestamp: Date.now(), source: 'MEXC', isStale: false };
  }
}
