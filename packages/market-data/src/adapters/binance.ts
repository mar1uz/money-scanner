import { Candle, AssetPriceQuote, Timeframe } from '@money-scanner/shared';
import { MarketHealthMonitor } from '../health-monitor.js';

/** Raw 24h ticker row as Binance returns it, identical for the single and bulk endpoints. */
export interface Binance24hTickerRow {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  closeTime: number;
}

export class BinanceMarketAdapter {
  // Binance recommends this host for public, market-data-only requests.
  private baseUrl = process.env.BINANCE_API_URL || 'https://data-api.binance.vision/api/v3';
  private futuresBaseUrl = process.env.BINANCE_FUTURES_API_URL || 'https://fapi.binance.com/fapi/v1';
  private healthMonitor: MarketHealthMonitor;
  private supportedUsdtAssetsCache: { values: Set<string>; updatedAt: number } | null = null;

  constructor(healthMonitor: MarketHealthMonitor) {
    this.healthMonitor = healthMonitor;
  }

  public async getSupportedUsdtBaseAssets(): Promise<Set<string>> {
    if (this.supportedUsdtAssetsCache && Date.now() - this.supportedUsdtAssetsCache.updatedAt < 15 * 60_000) {
      return this.supportedUsdtAssetsCache.values;
    }

    const response = await fetch(`${this.baseUrl}/exchangeInfo`, {
      signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) throw new Error(`Binance exchange info HTTP ${response.status}`);

    const body = await response.json() as { symbols?: Array<{
      status?: string;
      baseAsset?: string;
      quoteAsset?: string;
      isSpotTradingAllowed?: boolean;
    }> };
    const values = new Set<string>();
    for (const market of body.symbols || []) {
      if (
        market.status === 'TRADING' &&
        market.quoteAsset === 'USDT' &&
        market.isSpotTradingAllowed !== false &&
        market.baseAsset
      ) values.add(market.baseAsset.toUpperCase());
    }
    this.supportedUsdtAssetsCache = { values, updatedAt: Date.now() };
    return values;
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

  /**
   * Candles for a base ticker on the default USDT market (`BTC` -> `BTCUSDT`).
   * Use fetchPairCandles when the exact pair is already known (`BTCEUR`).
   */
  public async fetchCandles(
    symbol: string,
    timeframe: Timeframe = '1h',
    limit = 1000
  ): Promise<Candle[]> {
    return this.fetchPairCandles(`${symbol}USDT`, timeframe, limit);
  }

  /**
   * Candles for an already-qualified Binance spot pair (`BTCUSDT`, `BTCEUR`,
   * `CAKEBTC`). The pair is used verbatim: a caller that verified the exact
   * market on the venue's own list must never get `XUSDTUSDT` back.
   */
  public async fetchPairCandles(
    pair: string,
    timeframe: Timeframe = '1h',
    limit = 1000
  ): Promise<Candle[]> {
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

  /** Fetches the page immediately preceding `beforeTimestamp` for infinite chart history. */
  public async fetchCandlesBefore(
    symbol: string,
    timeframe: Timeframe,
    beforeTimestamp: number,
    limit = 1000
  ): Promise<Candle[]> {
    return this.fetchPairCandlesBefore(`${symbol}USDT`, timeframe, beforeTimestamp, limit);
  }

  /** Historical page for an already-qualified spot pair (see fetchPairCandles). */
  public async fetchPairCandlesBefore(
    pair: string,
    timeframe: Timeframe,
    beforeTimestamp: number,
    limit = 1000
  ): Promise<Candle[]> {
    const interval = this.mapTimeframeToInterval(timeframe);
    const safeLimit = Math.max(1, Math.min(1000, Math.floor(limit)));
    const endTime = Math.max(1, Math.floor(beforeTimestamp) - 1);
    const startedAt = Date.now();

    try {
      const response = await fetch(
        `${this.baseUrl}/klines?symbol=${pair}&interval=${interval}&limit=${safeLimit}&endTime=${endTime}`,
        { signal: AbortSignal.timeout(8_000) }
      );
      if (!response.ok) throw new Error(`Binance history HTTP ${response.status}`);
      const raw = await response.json() as any[];
      const candles = this.parseRawKlines(raw, true).filter(candle => candle.timestamp < beforeTimestamp);
      this.healthMonitor.recordSuccess('Binance', Date.now() - startedAt);
      return candles;
    } catch (error) {
      this.healthMonitor.recordError('Binance');
      throw error;
    }
  }

  /**
   * USDT-M perpetual candles. The app stores perpetual symbols with a `.P`
   * suffix so that they never collide with a spot ticker or an equity/ETF.
   */
  public async fetchFuturesCandles(
    symbol: string,
    timeframe: Timeframe = '1h',
    limit = 1000
  ): Promise<Candle[]> {
    const pair = this.normalizeFuturesPair(symbol);
    const interval = this.mapTimeframeToInterval(timeframe);
    const startTime = Date.now();

    try {
      // Binance Futures permits up to 1,500 kline rows in one request.
      const url = `${this.futuresBaseUrl}/klines?symbol=${pair}&interval=${interval}&limit=${Math.min(limit, 1500)}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) throw new Error(`Binance Futures HTTP error: ${response.status}`);
      const raw = await response.json() as any[];
      const candles = this.parseRawKlines(raw);
      this.healthMonitor.recordSuccess('Binance', Date.now() - startTime);
      return candles;
    } catch (err) {
      this.healthMonitor.recordError('Binance');
      throw err;
    }
  }

  public async fetchFuturesCandlesBefore(
    symbol: string,
    timeframe: Timeframe,
    beforeTimestamp: number,
    limit = 1000
  ): Promise<Candle[]> {
    const pair = this.normalizeFuturesPair(symbol);
    const interval = this.mapTimeframeToInterval(timeframe);
    const safeLimit = Math.max(1, Math.min(1500, Math.floor(limit)));
    const endTime = Math.max(1, Math.floor(beforeTimestamp) - 1);
    const startedAt = Date.now();

    try {
      const response = await fetch(
        `${this.futuresBaseUrl}/klines?symbol=${pair}&interval=${interval}&limit=${safeLimit}&endTime=${endTime}`,
        { signal: AbortSignal.timeout(8_000) }
      );
      if (!response.ok) throw new Error(`Binance Futures history HTTP ${response.status}`);
      const raw = await response.json() as any[];
      const candles = this.parseRawKlines(raw, true).filter(candle => candle.timestamp < beforeTimestamp);
      this.healthMonitor.recordSuccess('Binance', Date.now() - startedAt);
      return candles;
    } catch (error) {
      this.healthMonitor.recordError('Binance');
      throw error;
    }
  }

  private parseRawKlines(raw: any[], forceClosed = false): Candle[] {
    return raw.map((item, idx) => {
      const isLast = idx === raw.length - 1;
      return {
        timestamp: item[0],
        open: parseFloat(item[1]),
        high: parseFloat(item[2]),
        low: parseFloat(item[3]),
        close: parseFloat(item[4]),
        volume: parseFloat(item[5]),
        isClosed: forceClosed || !isLast
      };
    });
  }

  private startOfYearPriceCache: Map<string, number> = new Map();
  private allTickersCache: { rows: Map<string, Binance24hTickerRow>; updatedAt: number } | null = null;

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

  /**
   * One bulk request for every spot 24h ticker Binance lists, keyed by pair.
   *
   * Scanning the universe used to issue one `/ticker/24hr?symbol=X` request per
   * asset. The unfiltered endpoint returns the same verified rows for all pairs
   * in a single response, so a full-universe quote pass costs one request
   * instead of one per asset. Field names and semantics are untouched: callers
   * still receive `lastPrice`, `priceChangePercent`, `highPrice`, `lowPrice`,
   * `volume`, `closeTime` per pair, exactly as the per-symbol endpoint returns.
   */
  public async fetchAll24hTickers(): Promise<Map<string, Binance24hTickerRow>> {
    if (this.allTickersCache && Date.now() - this.allTickersCache.updatedAt < 15_000) {
      return this.allTickersCache.rows;
    }

    const startTime = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch(`${this.baseUrl}/ticker/24hr`, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Binance bulk ticker HTTP error: ${response.status}`);
      }

      const rows = await response.json() as Binance24hTickerRow[];
      const byPair = new Map<string, Binance24hTickerRow>();
      for (const row of Array.isArray(rows) ? rows : []) {
        if (row?.symbol) byPair.set(row.symbol, row);
      }
      if (!byPair.size) throw new Error('Binance bulk ticker returned no rows');

      this.healthMonitor.recordSuccess('Binance', Date.now() - startTime);
      this.allTickersCache = { rows: byPair, updatedAt: Date.now() };
      return byPair;
    } catch (err) {
      clearTimeout(timeoutId);
      // A provider failure must never evict a good snapshot: fall back to the
      // last successful bulk response so a scan can still be served from real,
      // previously verified rows rather than invented values.
      if (this.allTickersCache) return this.allTickersCache.rows;
      this.healthMonitor.recordError('Binance');
      throw err;
    }
  }

  /**
   * Builds the same quote as `fetch24hTicker` from an already-fetched bulk
   * snapshot instead of issuing a per-symbol request. Returns null when the
   * snapshot has no row for this pair, so the caller falls back to the
   * per-symbol endpoint rather than inventing a value.
   */
  public async fetch24hTickerFromBulk(symbol: string): Promise<AssetPriceQuote | null> {
    const pair = `${symbol}USDT`;
    const rows = await this.fetchAll24hTickers();
    const data = rows.get(pair);
    if (!data) return null;

    const startTime = Date.now();
    this.healthMonitor.recordSuccess('Binance', Date.now() - startTime);

    const currentPrice = parseFloat(data.lastPrice);
    if (!Number.isFinite(currentPrice) || currentPrice <= 0) return null;

    const startOfYearPrice = await this.getStartOfYearPrice(symbol);
    let changeYtd: number | undefined;
    if (startOfYearPrice && startOfYearPrice > 0) {
      changeYtd = Number((((currentPrice - startOfYearPrice) / startOfYearPrice) * 100).toFixed(2));
    }

    return {
      symbol,
      price: currentPrice,
      change24h: parseFloat(data.priceChangePercent),
      changeYtd,
      high24h: parseFloat(data.highPrice),
      low24h: parseFloat(data.lowPrice),
      volume24h: parseFloat(data.volume),
      timestamp: data.closeTime,
      source: 'Binance',
      isStale: false
    };
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

  /** Fetch a quote for any Binance USDT-M perpetual, preserving the app symbol. */
  public async fetchFutures24hTicker(symbol: string, displaySymbol = symbol): Promise<AssetPriceQuote> {
    const pair = this.normalizeFuturesPair(symbol);
    const url = `${this.futuresBaseUrl}/ticker/24hr?symbol=${pair}`;
    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) throw new Error(`Binance Futures ticker HTTP error: ${response.status}`);
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
      const startOfYearPrice = await this.getStartOfYearFuturesPrice(pair);
      const changeYtd = startOfYearPrice && startOfYearPrice > 0
        ? Number((((currentPrice - startOfYearPrice) / startOfYearPrice) * 100).toFixed(2))
        : undefined;

      return {
        symbol: displaySymbol,
        price: currentPrice,
        change24h: parseFloat(data.priceChangePercent),
        changeYtd,
        high24h: parseFloat(data.highPrice),
        low24h: parseFloat(data.lowPrice),
        volume24h: parseFloat(data.volume),
        timestamp: data.closeTime,
        source: 'Binance Futures',
        isStale: false
      };
    } catch (err) {
      this.healthMonitor.recordError('Binance');
      throw err;
    }
  }

  private normalizeFuturesPair(symbol: string): string {
    return symbol
      .toUpperCase()
      .trim()
      .replace(/\.P$/, '')
      .replace(/[^A-Z0-9]/g, '');
  }

  private async getStartOfYearFuturesPrice(pair: string): Promise<number | null> {
    const cacheKey = `futures:${pair}`;
    if (this.startOfYearPriceCache.has(cacheKey)) return this.startOfYearPriceCache.get(cacheKey)!;

    try {
      const startOfYear = Date.UTC(new Date().getUTCFullYear(), 0, 1);
      const url = `${this.futuresBaseUrl}/klines?symbol=${pair}&interval=1d&startTime=${startOfYear}&limit=1`;
      const response = await fetch(url, { signal: AbortSignal.timeout(2500) });
      if (!response.ok) return null;
      const data = await response.json() as any[];
      const openPrice = Array.isArray(data) && data.length > 0 ? parseFloat(data[0][1]) : 0;
      if (openPrice > 0) {
        this.startOfYearPriceCache.set(cacheKey, openPrice);
        return openPrice;
      }
    } catch {}

    return null;
  }
}
