import { AssetPriceQuote, Candle, Timeframe } from '@money-scanner/shared';
import { MarketHealthMonitor } from '../health-monitor.js';

interface HyperliquidCandle {
  t: number;
  T: number;
  o: string;
  h: string;
  l: string;
  c: string;
  v: string;
}

export class HyperliquidMarketAdapter {
  private readonly baseUrl = process.env.HYPERLIQUID_API_URL || 'https://api.hyperliquid.xyz/info';

  constructor(private readonly healthMonitor: MarketHealthMonitor) {}

  private interval(timeframe: Timeframe) {
    return timeframe === '1m' ? '1M' : timeframe;
  }

  private intervalMs(timeframe: Timeframe) {
    switch (timeframe) {
      case '1h': return 60 * 60 * 1000;
      case '4h': return 4 * 60 * 60 * 1000;
      case '8h': return 8 * 60 * 60 * 1000;
      case '1d': return 24 * 60 * 60 * 1000;
      case '1w': return 7 * 24 * 60 * 60 * 1000;
      case '1m': return 31 * 24 * 60 * 60 * 1000;
    }
  }

  private async request<T>(body: object): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000)
      });
      if (response.ok) return response.json() as Promise<T>;
      if (response.status !== 429 || attempt === 2) throw new Error(`Hyperliquid HTTP ${response.status}`);
      const retryAfter = Number(response.headers.get('retry-after'));
      const delayMs = Number.isFinite(retryAfter) ? Math.min(10_000, Math.max(250, retryAfter * 1000)) : 500 * (attempt + 1);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
    throw new Error('Hyperliquid request failed');
  }

  public async getTradableCoins(): Promise<Set<string>> {
    const meta = await this.request<{ universe?: Array<{ name?: string }> }>({ type: 'meta' });
    const values = new Set<string>();
    for (const coin of meta.universe || []) {
      const name = String(coin.name || '').toUpperCase();
      if (name && !name.startsWith('@')) values.add(name);
    }
    return values;
  }

  private async fetchRange(symbol: string, timeframe: Timeframe, startTime: number, endTime: number, limit: number) {
    const startedAt = Date.now();
    try {
      const raw = await this.request<HyperliquidCandle[]>({
        type: 'candleSnapshot',
        req: {
          coin: symbol.toUpperCase(),
          interval: this.interval(timeframe),
          startTime: Math.max(0, Math.floor(startTime)),
          endTime: Math.floor(endTime)
        }
      });
      const now = Date.now();
      const candles = raw
        .map(candle => ({
          timestamp: Number(candle.t),
          open: Number(candle.o),
          high: Number(candle.h),
          low: Number(candle.l),
          close: Number(candle.c),
          volume: Number(candle.v),
          isClosed: Number(candle.T) < now
        }))
        .filter(candle => Number.isFinite(candle.timestamp) && candle.close > 0)
        .sort((left, right) => left.timestamp - right.timestamp)
        .slice(-Math.max(1, Math.min(5000, Math.floor(limit))));
      this.healthMonitor.recordSuccess('Hyperliquid', Date.now() - startedAt);
      return candles;
    } catch (error) {
      this.healthMonitor.recordError('Hyperliquid');
      throw error;
    }
  }

  public fetchCandles(symbol: string, timeframe: Timeframe, limit = 1000): Promise<Candle[]> {
    const endTime = Date.now();
    const safeLimit = Math.max(1, Math.min(5000, Math.floor(limit)));
    const startTime = endTime - this.intervalMs(timeframe) * (safeLimit + 2);
    return this.fetchRange(symbol, timeframe, startTime, endTime, safeLimit);
  }

  public fetchCandlesBefore(symbol: string, timeframe: Timeframe, beforeTimestamp: number, limit = 1000): Promise<Candle[]> {
    const safeLimit = Math.max(1, Math.min(5000, Math.floor(limit)));
    const endTime = Math.max(1, Math.floor(beforeTimestamp) - 1);
    const startTime = endTime - this.intervalMs(timeframe) * (safeLimit + 2);
    return this.fetchRange(symbol, timeframe, startTime, endTime, safeLimit)
      .then(candles => candles.filter(candle => candle.timestamp < beforeTimestamp));
  }

  public async fetchQuote(symbol: string): Promise<AssetPriceQuote> {
    const now = Date.now();
    const startOfYear = Date.UTC(new Date().getUTCFullYear(), 0, 1);
    const [mids, dailyCandles] = await Promise.all([
      this.request<Record<string, string>>({ type: 'allMids' }),
      this.fetchRange(symbol, '1d', startOfYear, now, 400)
    ]);
    const price = Number(mids[symbol.toUpperCase()] || dailyCandles.at(-1)?.close);
    if (!Number.isFinite(price) || price <= 0) throw new Error(`Hyperliquid quote unavailable for ${symbol}`);

    const dayStart = now - 24 * 60 * 60 * 1000;
    const recent = dailyCandles.length
      ? await this.fetchRange(symbol, '1h', dayStart - 60 * 60 * 1000, now, 26)
      : [];
    const open24h = recent[0]?.open || price;
    const yearOpen = dailyCandles[0]?.open;
    return {
      symbol: symbol.toUpperCase(),
      price,
      change24h: Number((((price - open24h) / open24h) * 100).toFixed(2)),
      changeYtd: yearOpen ? Number((((price - yearOpen) / yearOpen) * 100).toFixed(2)) : undefined,
      high24h: recent.length ? Math.max(...recent.map(candle => candle.high)) : price,
      low24h: recent.length ? Math.min(...recent.map(candle => candle.low)) : price,
      volume24h: recent.reduce((sum, candle) => sum + candle.volume, 0),
      timestamp: now,
      source: 'Hyperliquid',
      isStale: false
    };
  }

  /** Earliest daily candle timestamp (ms), probed from genesis. */
  public async firstDailyCandleTs(symbol: string): Promise<number | null> {
    try {
      const raw = await this.request<HyperliquidCandle[]>({
        type: 'candleSnapshot',
        req: { coin: symbol.toUpperCase(), interval: '1d', startTime: 0, endTime: Date.now() }
      });
      if (!raw.length) return null;
      return Math.min(...raw.map(candle => Number(candle.t)));
    } catch {
      return null;
    }
  }

  /** 24h notional (USD) volume from metaAndAssetCtxs. */
  public async quoteVolume24h(symbol: string): Promise<number | null> {
    try {
      const [meta, ctxs] = await this.request<[
        { universe?: Array<{ name?: string }> },
        Array<{ dayNtlVlm?: string }>
      ]>({ type: 'metaAndAssetCtxs' });
      const index = (meta.universe || []).findIndex(
        coin => String(coin.name || '').toUpperCase() === symbol.toUpperCase()
      );
      if (index < 0) return null;
      const volume = Number(ctxs?.[index]?.dayNtlVlm);
      return Number.isFinite(volume) ? volume : null;
    } catch {
      return null;
    }
  }
}
