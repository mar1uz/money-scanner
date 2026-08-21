import {
  Candle,
  AssetPriceQuote,
  Timeframe,
  MarketOverviewSummary,
  TOP_50_CRYPTO_ASSETS
} from '@money-scanner/shared';
import { MarketHealthMonitor } from './health-monitor.js';
import { BinanceMarketAdapter } from './adapters/binance.js';
import { PublicStockMarketAdapter } from './adapters/public-stock.js';

interface CoinGeckoMarketRow {
  symbol: string;
  market_cap: number | null;
}

export class MarketDataService {
  private healthMonitor = new MarketHealthMonitor();
  private binanceAdapter = new BinanceMarketAdapter(this.healthMonitor);
  private stockAdapter = new PublicStockMarketAdapter(this.healthMonitor);
  private candleCache = new Map<string, Candle[]>();
  private quoteCache = new Map<string, AssetPriceQuote>();
  private marketCapCache: { values: Map<string, number>; updatedAt: number } | null = null;

  private coinGeckoHeaders(): Record<string, string> {
    const key = process.env.COINGECKO_API_KEY;
    return key
      ? { accept: 'application/json', 'x-cg-demo-api-key': key }
      : { accept: 'application/json' };
  }

  public async getCandles(
    symbol: string,
    timeframe: Timeframe = '1h',
    limit = 1000
  ): Promise<Candle[]> {
    const cacheKey = `${symbol}_${timeframe}_${limit}`;
    const isStockOrMetal = this.stockAdapter.isStockOrMetal(symbol);

    try {
      const candles = isStockOrMetal
        ? await this.stockAdapter.fetchCandles(symbol, timeframe, limit)
        : await this.binanceAdapter.fetchCandles(symbol, timeframe, limit);
      this.candleCache.set(cacheKey, candles);
      return candles;
    } catch (error) {
      const cached = this.candleCache.get(cacheKey);
      if (cached?.length) return cached;
      throw error;
    }
  }

  public async getPriceQuote(symbol: string): Promise<AssetPriceQuote> {
    const isStockOrMetal = this.stockAdapter.isStockOrMetal(symbol);

    try {
      const quote = isStockOrMetal
        ? await this.stockAdapter.fetchQuote(symbol)
        : await this.binanceAdapter.fetch24hTicker(symbol);
      this.quoteCache.set(symbol, quote);
      return quote;
    } catch (error) {
      const cached = this.quoteCache.get(symbol);
      if (cached) return { ...cached, source: `${cached.source} (cached)`, isStale: true };
      throw error;
    }
  }

  public async getAllQuotes(): Promise<AssetPriceQuote[]> {
    const settled = await Promise.allSettled(
      TOP_50_CRYPTO_ASSETS.map(asset => this.getPriceQuote(asset.symbol))
    );
    return settled.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
  }

  public async getCryptoMarketCaps(): Promise<Map<string, number>> {
    if (this.marketCapCache && Date.now() - this.marketCapCache.updatedAt < 5 * 60_000) {
      return this.marketCapCache.values;
    }

    try {
      const response = await fetch(
        'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=false',
        { headers: this.coinGeckoHeaders(), signal: AbortSignal.timeout(10_000) }
      );
      if (!response.ok) throw new Error(`CoinGecko HTTP ${response.status}`);
      const rows = await response.json() as CoinGeckoMarketRow[];
      const values = new Map<string, number>();
      for (const row of rows) {
        if (row.symbol && typeof row.market_cap === 'number') {
          const symbol = row.symbol.toUpperCase();
          if (!values.has(symbol)) values.set(symbol, row.market_cap);
        }
      }
      this.marketCapCache = { values, updatedAt: Date.now() };
      return values;
    } catch {
      return this.marketCapCache?.values || new Map();
    }
  }

  public async getMarketOverview(): Promise<MarketOverviewSummary> {
    const startedAt = Date.now();
    const quotes = await this.getAllQuotes();
    const advancing = quotes.filter(quote => quote.change24h > 0.5).length;
    const declining = quotes.filter(quote => quote.change24h < -0.5).length;
    const neutral = Math.max(0, quotes.length - advancing - declining);
    const bullishPercent = quotes.length
      ? Number(((advancing / quotes.length) * 100).toFixed(1))
      : 0;

    const btcQuote = quotes.find(quote => quote.symbol === 'BTC');
    let regime: MarketOverviewSummary['regime'] = 'Consolidation / Range';
    let regimeScore = Math.max(-100, Math.min(100, Math.round((bullishPercent - 50) * 1.6)));
    if (bullishPercent >= 70 && (btcQuote?.change24h ?? 0) > 2) regime = 'Strong Bullish Expansion';
    else if (bullishPercent >= 55) regime = 'Bullish Trend';
    else if (bullishPercent <= 30 && (btcQuote?.change24h ?? 0) < -2) regime = 'Strong Bearish Capitulation';
    else if (bullishPercent <= 45) regime = 'Bearish Trend';

    let btcDominance = 0;
    let totalMarketCap = 0;
    let total24hVolume = 0;
    let globalDataAvailable = false;
    try {
      const globalRes = await fetch('https://api.coingecko.com/api/v3/global', {
        headers: this.coinGeckoHeaders(),
        signal: AbortSignal.timeout(8_000)
      });
      if (!globalRes.ok) throw new Error(`CoinGecko HTTP ${globalRes.status}`);
      const data = (await globalRes.json() as any)?.data;
      if (data) {
        btcDominance = Number(data.market_cap_percentage?.btc || 0);
        totalMarketCap = Number(data.total_market_cap?.usd || 0);
        total24hVolume = Number(data.total_volume?.usd || 0);
        globalDataAvailable = totalMarketCap > 0;
      }
    } catch {}

    let fearAndGreed: MarketOverviewSummary['fearAndGreed'];
    try {
      const fngRes = await fetch('https://api.alternative.me/fng/?limit=1', {
        signal: AbortSignal.timeout(6_000)
      });
      const item = fngRes.ok ? (await fngRes.json() as any)?.data?.[0] : null;
      if (item?.value && item?.timestamp) {
        fearAndGreed = {
          value: Number(item.value),
          classification: item.value_classification,
          source: 'Alternative.me',
          sourceUrl: 'https://alternative.me/crypto/fear-and-greed-index/',
          timestamp: Number(item.timestamp) * 1000
        };
      }
    } catch {}

    const staleCount = quotes.filter(quote => quote.isStale || this.healthMonitor.isDataStale(quote.timestamp)).length;
    const avgAbsoluteMove = quotes.length
      ? quotes.reduce((sum, quote) => sum + Math.abs(quote.change24h), 0) / quotes.length
      : 0;

    return {
      regime,
      regimeScore,
      btcDominance,
      totalMarketCap,
      total24hVolume,
      marketBreadth: { advancingCount: advancing, decliningCount: declining, neutralCount: neutral, bullishPercent },
      volatilityIndex: Number(avgAbsoluteMove.toFixed(2)),
      fearAndGreed,
      lastUpdated: Date.now(),
      providerStatus: {
        primary: !quotes.length || !globalDataAvailable || staleCount > 5 ? 'degraded' : 'operational',
        latencyMs: Date.now() - startedAt,
        staleAssetsCount: staleCount
      }
    };
  }

  public getHealthMonitor(): MarketHealthMonitor {
    return this.healthMonitor;
  }
}
