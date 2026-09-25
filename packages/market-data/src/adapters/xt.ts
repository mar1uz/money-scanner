import { Candle, AssetPriceQuote, Timeframe } from '@money-scanner/shared';
import { MarketHealthMonitor } from '../health-monitor.js';
import { TIMEFRAME_MS, aggregate4hTo8h } from './klines.js';

/** XT.COM public spot API; never use this adapter without an identity-verified resolver pin. */
export class XtMarketAdapter {
  private readonly baseUrl = process.env.XT_API_URL || 'https://sapi.xt.com/v4/public';
  constructor(private readonly health: MarketHealthMonitor) { this.health.registerProvider('XT.COM'); }
  private interval(timeframe: Timeframe) { return timeframe === '8h' ? '4h' : timeframe === '1m' ? '1M' : timeframe; }
  private async rows(pair: string, timeframe: Timeframe, limit: number, before?: number) {
    const params = new URLSearchParams({ symbol: pair, interval: this.interval(timeframe), limit: String(Math.min(1000, Math.max(1, limit))) });
    if (before !== undefined) params.set('endTime', String(before - 1));
    const res = await fetch(`${this.baseUrl}/kline?${params}`, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) throw new Error(`XT kline HTTP ${res.status}`);
    const body = await res.json() as { rc?: number; result?: Array<Record<string, string | number>> };
    if (body.rc !== 0 || !Array.isArray(body.result)) throw new Error('XT kline invalid response');
    return body.result;
  }
  private parse(rows: Array<Record<string, string | number>>, timeframe: Timeframe) {
    const now = Date.now();
    const candles: Candle[] = rows.map(row => ({ timestamp: Number(row.t), open: Number(row.o), high: Number(row.h), low: Number(row.l), close: Number(row.c), volume: Number(row.q), isClosed: Number(row.t) + TIMEFRAME_MS[timeframe] <= now }))
      .filter(row => Number.isFinite(row.timestamp) && row.open > 0 && row.close > 0 && row.high >= row.low && row.volume >= 0)
      .sort((a, b) => a.timestamp - b.timestamp);
    return timeframe === '8h' ? aggregate4hTo8h(candles) : candles;
  }
  public async fetchCandles(pair: string, timeframe: Timeframe, limit: number): Promise<Candle[]> {
    const start = Date.now();
    try {
      const rows = await this.rows(pair, timeframe, timeframe === '8h' ? limit * 2 + 2 : limit);
      const candles = this.parse(rows, timeframe).slice(-limit);
      if (!candles.length) throw new Error('XT returned no candles');
      this.health.recordSuccess('XT.COM', Date.now() - start);
      return candles;
    } catch (error) { this.health.recordError('XT.COM'); throw error; }
  }
  public async fetchCandlesBefore(pair: string, timeframe: Timeframe, before: number, limit: number): Promise<Candle[]> {
    const rows = await this.rows(pair, timeframe, timeframe === '8h' ? limit * 2 + 2 : limit, before);
    const candles = this.parse(rows, timeframe).filter(row => row.timestamp < before).slice(-limit);
    if (candles.some(row => row.timestamp >= before)) throw new Error('XT history boundary mismatch');
    return candles;
  }
  public async firstDailyCandleTs(pair: string): Promise<number | null> {
    const candles = this.parse(await this.rows(pair, '1d', 1000), '1d');
    return candles[0]?.timestamp ?? null;
  }
  public async fetchQuote(pair: string, symbol: string): Promise<AssetPriceQuote> {
    const res = await fetch(`${this.baseUrl}/ticker/24h?symbol=${encodeURIComponent(pair)}`, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) throw new Error(`XT ticker HTTP ${res.status}`);
    const body = await res.json() as { rc?: number; result?: Array<Record<string, string | number>> };
    const row = body.rc === 0 ? body.result?.[0] : undefined;
    const price = Number(row?.c);
    if (!Number.isFinite(price) || price <= 0) throw new Error('XT ticker price unavailable');
    const open = Number(row?.o);
    return { symbol, price, change24h: open > 0 ? 100 * (price / open - 1) : 0, high24h: Number(row?.h) || price,
      low24h: Number(row?.l) || price, volume24h: Number(row?.q) || 0, timestamp: Number(row?.t) || Date.now(), source: 'XT.COM', isStale: false };
  }
}
