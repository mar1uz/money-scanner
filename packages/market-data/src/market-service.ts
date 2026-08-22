import {
  Candle,
  AssetPriceQuote,
  Timeframe,
  MarketOverviewSummary,
  TOP_50_CRYPTO_ASSETS,
  TRADING_360_ASSETS,
  AssetInfo,
  ScannerMarketClass,
  getScannerAssets
} from '@money-scanner/shared';
import { MarketHealthMonitor } from './health-monitor.js';
import { BinanceMarketAdapter } from './adapters/binance.js';
import { PublicStockMarketAdapter } from './adapters/public-stock.js';

interface CoinGeckoMarketRow {
  id?: string;
  symbol: string;
  name?: string;
  current_price?: number | null;
  market_cap: number | null;
  market_cap_rank?: number | null;
}

export class MarketDataService {
  private healthMonitor = new MarketHealthMonitor();
  private binanceAdapter = new BinanceMarketAdapter(this.healthMonitor);
  private stockAdapter = new PublicStockMarketAdapter(this.healthMonitor);
  private candleCache = new Map<string, Candle[]>();
  private quoteCache = new Map<string, AssetPriceQuote>();
  private quoteFetchedAt = new Map<string, number>();
  private marketCapCache: { values: Map<string, number>; updatedAt: number } | null = null;
  private topCryptoAssetsCache: { values: AssetInfo[]; updatedAt: number } | null = null;

  private coinGeckoHeaders(): Record<string, string> {
    const key = process.env.COINGECKO_API_KEY;
    return key
      ? { accept: 'application/json', 'x-cg-demo-api-key': key }
      : { accept: 'application/json' };
  }

  private readonly quoteCacheMs = 60_000;
  private readonly candleCacheMs: Record<Timeframe, number> = {
    '1h': 60_000,
    '4h': 2 * 60_000,
    '8h': 5 * 60_000,
    '1d': 15 * 60_000,
    '1w': 60 * 60_000,
    '1m': 6 * 60 * 60_000
  };
  private candleFetchedAt = new Map<string, number>();

  private getAssetDefinition(symbol: string): AssetInfo | undefined {
    const normalized = symbol.toUpperCase();
    return TRADING_360_ASSETS.find(asset => asset.symbol.toUpperCase() === normalized);
  }

  /** `.P` is accepted for any Binance USDT-M perpetual, not only catalogued ones. */
  private isBinanceFuturesSymbol(symbol: string, asset?: AssetInfo): boolean {
    return asset?.marketDataSource === 'binance_futures' || /\.P$/i.test(symbol.trim());
  }

  public async getCandles(
    symbol: string,
    timeframe: Timeframe = '1h',
    limit = 1000
  ): Promise<Candle[]> {
    const cacheKey = `${symbol}_${timeframe}_${limit}`;
    const asset = this.getAssetDefinition(symbol);
    const isBinanceFutures = this.isBinanceFuturesSymbol(symbol, asset);
    const providerSymbol = asset?.providerSymbol || symbol;
    const isStockOrMetal = this.stockAdapter.isStockOrMetal(symbol);
    const cached = this.candleCache.get(cacheKey);
    const fetchedAt = this.candleFetchedAt.get(cacheKey) || 0;
    if (cached?.length && Date.now() - fetchedAt < this.candleCacheMs[timeframe]) return cached;

    try {
      const candles = isBinanceFutures
        ? await this.binanceAdapter.fetchFuturesCandles(providerSymbol, timeframe, limit)
        : isStockOrMetal
        ? await this.stockAdapter.fetchCandles(symbol, timeframe, limit)
        : await this.binanceAdapter.fetchCandles(symbol, timeframe, limit);
      this.candleCache.set(cacheKey, candles);
      this.candleFetchedAt.set(cacheKey, Date.now());
      return candles;
    } catch (error) {
      if (cached?.length) return cached;
      throw error;
    }
  }

  public async getPriceQuote(symbol: string): Promise<AssetPriceQuote> {
    const asset = this.getAssetDefinition(symbol);
    const isBinanceFutures = this.isBinanceFuturesSymbol(symbol, asset);
    const providerSymbol = asset?.providerSymbol || symbol;
    const isStockOrMetal = this.stockAdapter.isStockOrMetal(symbol);
    const cached = this.quoteCache.get(symbol);
    if (cached && Date.now() - (this.quoteFetchedAt.get(symbol) || 0) < this.quoteCacheMs) return cached;

    try {
      const quote = isBinanceFutures
        ? await this.binanceAdapter.fetchFutures24hTicker(providerSymbol, symbol)
        : isStockOrMetal
        ? await this.stockAdapter.fetchQuote(symbol)
        : await this.binanceAdapter.fetch24hTicker(symbol);
      this.quoteCache.set(symbol, quote);
      this.quoteFetchedAt.set(symbol, Date.now());
      return quote;
    } catch (error) {
      const cached = this.quoteCache.get(symbol);
      if (cached) return { ...cached, source: `${cached.source} (cached)`, isStale: true };
      throw error;
    }
  }

  public async getQuotesForAssets(assets: AssetInfo[]): Promise<AssetPriceQuote[]> {
    const quotes: AssetPriceQuote[] = [];
    const concurrency = 6;
    for (let index = 0; index < assets.length; index += concurrency) {
      const settled = await Promise.allSettled(
        assets.slice(index, index + concurrency).map(asset => this.getPriceQuote(asset.symbol))
      );
      quotes.push(...settled.flatMap(result => result.status === 'fulfilled' ? [result.value] : []));
    }
    return quotes;
  }

  public async getAllQuotes(marketClass: ScannerMarketClass = 'ALL'): Promise<AssetPriceQuote[]> {
    const assets = marketClass === 'crypto'
      ? await this.getTopCryptoAssets(50)
      : getScannerAssets(marketClass);
    return this.getQuotesForAssets(assets);
  }

  /** Top market-cap crypto assets that also have an active Binance USDT spot market. */
  public async getTopCryptoAssets(limit = 50): Promise<AssetInfo[]> {
    if (
      this.topCryptoAssetsCache &&
      this.topCryptoAssetsCache.values.length >= limit &&
      Date.now() - this.topCryptoAssetsCache.updatedAt < 5 * 60_000
    ) {
      return this.topCryptoAssetsCache.values.slice(0, limit);
    }

    try {
      const [response, supportedSymbols] = await Promise.all([
        fetch(
          'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=150&page=1&sparkline=false',
          { headers: this.coinGeckoHeaders(), signal: AbortSignal.timeout(10_000) }
        ),
        this.binanceAdapter.getSupportedUsdtBaseAssets()
      ]);
      if (!response.ok) throw new Error(`CoinGecko HTTP ${response.status}`);

      const rows = await response.json() as CoinGeckoMarketRow[];
      const existingBySymbol = new Map(
        TRADING_360_ASSETS.filter(asset => asset.marketClass === 'crypto').map(asset => [asset.symbol, asset])
      );
      const marketCaps = new Map<string, number>();
      const seen = new Set<string>();
      const assets: AssetInfo[] = [];

      for (const row of rows) {
        const symbol = String(row.symbol || '').toUpperCase();
        if (!symbol || seen.has(symbol) || !supportedSymbols.has(symbol)) continue;
        if (typeof row.market_cap !== 'number' || row.market_cap <= 0) continue;

        const existing = existingBySymbol.get(symbol);
        seen.add(symbol);
        marketCaps.set(symbol, row.market_cap);
        assets.push({
          symbol,
          name: String(row.name || existing?.name || symbol),
          category: existing?.category || 'Infrastructure',
          marketClass: 'crypto',
          narratives: existing?.narratives,
          quoteCurrency: 'USDT',
          aliases: Array.from(new Set([...(existing?.aliases || []), String(row.id || ''), String(row.name || '')].filter(Boolean))),
          marketCap: row.market_cap,
          rank: Number(row.market_cap_rank || assets.length + 1),
          decimals: existing?.decimals ?? ((row.current_price || 0) < 1 ? 6 : 2)
        });
        if (assets.length >= limit) break;
      }

      if (assets.length < limit) throw new Error(`Only ${assets.length} supported top crypto assets found`);
      this.marketCapCache = { values: marketCaps, updatedAt: Date.now() };
      this.topCryptoAssetsCache = { values: assets, updatedAt: Date.now() };
      return assets;
    } catch {
      return TOP_50_CRYPTO_ASSETS.slice(0, limit);
    }
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
    // Market overview is a crypto-market metric; equities and commodities are
    // displayed in their own scanner universes.
    const quotes = await this.getAllQuotes('crypto');
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
