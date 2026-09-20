import {
  Candle,
  AssetPriceQuote,
  Timeframe,
  MarketOverviewSummary,
  BALANCED_CRYPTO_ASSETS,
  TRADING_360_ASSETS,
  AssetInfo,
  AssetMarketClass,
  AssetMarketDataSource,
  ScannerMarketClass,
  getScannerAssets,
  withPrimaryNarrative,
  selectNarrativeBalancedAssets
} from '@money-scanner/shared';
import { MarketHealthMonitor } from './health-monitor.js';
import { BinanceMarketAdapter } from './adapters/binance.js';
import { BybitMarketAdapter } from './adapters/bybit.js';
import { OkxMarketAdapter } from './adapters/okx.js';
import { ChartMarketResolver, ChartMarketCandidate } from './chart-market-resolver.js';
import { buildChartMarketResolverDeps } from './chart-market-probes.js';
import { PublicStockMarketAdapter } from './adapters/public-stock.js';
import { HyperliquidMarketAdapter } from './adapters/hyperliquid.js';

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
  private bybitAdapter = new BybitMarketAdapter(this.healthMonitor);
  private okxAdapter = new OkxMarketAdapter(this.healthMonitor);
  private stockAdapter = new PublicStockMarketAdapter(this.healthMonitor);
  private hyperliquidAdapter = new HyperliquidMarketAdapter(this.healthMonitor);
  private chartResolver = new ChartMarketResolver(
    buildChartMarketResolverDeps(this.binanceAdapter, this.bybitAdapter, this.okxAdapter, this.hyperliquidAdapter)
  );
  private candleCache = new Map<string, Candle[]>();
  private quoteCache = new Map<string, AssetPriceQuote>();
  private quoteFetchedAt = new Map<string, number>();
  private marketCapCache: { values: Map<string, number>; updatedAt: number } | null = null;
  private topCryptoAssetsCache: { values: AssetInfo[]; updatedAt: number } | null = null;
  private cryptoCandleSource = new Map<string, AssetMarketDataSource>();
  private static readonly STABLE_SYMBOLS = new Set([
    'USDT', 'USDC', 'DAI', 'FDUSD', 'USDE', 'USDS', 'TUSD', 'USDP', 'BUSD', 'PYUSD',
    'USD1', 'RLUSD', 'USDG', 'USDD', 'USDY', 'USDF', 'USDGO', 'USYC', 'USDTB', 'USDAI',
    'USD0', 'GHO', 'EURC', 'EUTBL', 'USTB', 'SOFID', 'APXUSD', 'USDS'
  ]);

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

  private rememberCryptoSources(assets: AssetInfo[]) {
    for (const asset of assets) {
      const symbol = asset.symbol.toUpperCase();
      if (asset.marketDataSource === 'hyperliquid' || asset.marketDataSource === 'binance_futures') {
        this.cryptoCandleSource.set(symbol, asset.marketDataSource);
      } else {
        this.cryptoCandleSource.set(symbol, 'binance_spot');
      }
    }
  }

  private resolveCryptoSource(symbol: string, asset?: AssetInfo): AssetMarketDataSource | undefined {
    return this.cryptoCandleSource.get(symbol.toUpperCase())
      || asset?.marketDataSource
      || (this.isBinanceFuturesSymbol(symbol, asset) ? 'binance_futures' : undefined);
  }

  private providerSymbolFor(symbol: string, asset: AssetInfo | undefined, source: AssetMarketDataSource | undefined) {
    if (source === 'hyperliquid') return symbol.replace(/\.P$/i, '').toUpperCase();
    return asset?.providerSymbol || symbol;
  }

  /**
   * Multi-exchange chart-market resolution for a crypto spot symbol.
   * Returns the resolver's candle-capable choice, or null to keep the
   * legacy Binance/Hyperliquid routing unchanged.
   */
  private async resolveCryptoChartMarket(symbol: string): Promise<ChartMarketCandidate | null> {
    try {
      const resolution = await this.chartResolver.resolve(symbol);
      return resolution?.candle || null;
    } catch {
      return null;
    }
  }

  /** Full multi-exchange chart market (TradingView symbol + candle source) for a crypto symbol. */
  public async resolveChartMarket(symbol: string) {
    return this.chartResolver.resolve(symbol);
  }

  public async getCandles(
    symbol: string,
    timeframe: Timeframe = '1h',
    limit = 1000,
    requestedMarketClass?: AssetMarketClass
  ): Promise<Candle[]> {
    const asset = this.getAssetDefinition(symbol);
    const resolvedMarketClass = requestedMarketClass || asset?.marketClass;
    const cacheScope = resolvedMarketClass || 'auto';
    const cacheKey = `${cacheScope}_${symbol}_${timeframe}_${limit}`;
    const source = this.resolveCryptoSource(symbol, asset);
    const isBinanceFutures = source === 'binance_futures';
    const providerSymbol = this.providerSymbolFor(symbol, asset, source);
    const isHyperliquid = source === 'hyperliquid';
    const isExplicitCryptoSpot = resolvedMarketClass === 'crypto' && !symbol.includes('.') && !symbol.startsWith('TOTAL');
    const isStockOrMetal = resolvedMarketClass === 'stocks' || resolvedMarketClass === 'metals'
      ? true
      : resolvedMarketClass === 'crypto'
        ? false
        : this.stockAdapter.isStockOrMetal(symbol);
    const cached = this.candleCache.get(cacheKey);
    const fetchedAt = this.candleFetchedAt.get(cacheKey) || 0;
    if (cached?.length && Date.now() - fetchedAt < this.candleCacheMs[timeframe]) return cached;

    try {
      const chartMarket = isExplicitCryptoSpot ? await this.resolveCryptoChartMarket(symbol) : null;
      const legacyCandles = async () => isHyperliquid
        ? await this.hyperliquidAdapter.fetchCandles(providerSymbol, timeframe, limit)
        : isBinanceFutures
        ? await this.binanceAdapter.fetchFuturesCandles(providerSymbol, timeframe, limit)
        : isExplicitCryptoSpot
        ? await this.binanceAdapter.fetchCandles(symbol, timeframe, limit)
        : isStockOrMetal
        ? await this.stockAdapter.fetchCandles(symbol, timeframe, limit)
        : await this.binanceAdapter.fetchCandles(symbol, timeframe, limit);
      let candles: Candle[];
      try {
        candles = chartMarket?.source === 'bybit_spot'
          ? await this.bybitAdapter.fetchCandles(chartMarket.providerSymbol, timeframe, limit)
          : chartMarket?.source === 'okx_spot'
          ? await this.okxAdapter.fetchCandles(chartMarket.providerSymbol, timeframe, limit)
          : chartMarket?.source === 'binance_futures' && !isBinanceFutures
          ? await this.binanceAdapter.fetchFuturesCandles(chartMarket.providerSymbol, timeframe, limit)
          : await legacyCandles();
      } catch (resolverError) {
        if (!chartMarket || chartMarket.source === 'binance_spot' || chartMarket.source === 'hyperliquid') throw resolverError;
        // Resolved exchange failed: keep the asset on its previous provider.
        candles = await legacyCandles();
      }
      this.candleCache.set(cacheKey, candles);
      this.candleFetchedAt.set(cacheKey, Date.now());
      return candles;
    } catch (error) {
      if (cached?.length) return cached;
      throw error;
    }
  }

  /** Returns one historical page strictly older than `beforeTimestamp`. */
  public async getCandlesBefore(
    symbol: string,
    timeframe: Timeframe,
    beforeTimestamp: number,
    limit = 1000,
    requestedMarketClass?: AssetMarketClass
  ): Promise<Candle[]> {
    const asset = this.getAssetDefinition(symbol);
    const resolvedMarketClass = requestedMarketClass || asset?.marketClass;
    const source = this.resolveCryptoSource(symbol, asset);
    const isBinanceFutures = source === 'binance_futures';
    const providerSymbol = this.providerSymbolFor(symbol, asset, source);
    const isHyperliquid = source === 'hyperliquid';
    const isExplicitCryptoSpot = resolvedMarketClass === 'crypto' && !symbol.includes('.') && !symbol.startsWith('TOTAL');
    const isStockOrMetal = resolvedMarketClass === 'stocks' || resolvedMarketClass === 'metals'
      ? true
      : resolvedMarketClass === 'crypto'
        ? false
        : this.stockAdapter.isStockOrMetal(symbol);

    const chartMarket = isExplicitCryptoSpot ? await this.resolveCryptoChartMarket(symbol) : null;
    const legacyBefore = async () => {
      if (isHyperliquid) {
        return this.hyperliquidAdapter.fetchCandlesBefore(providerSymbol, timeframe, beforeTimestamp, limit);
      }
      if (isBinanceFutures) {
        return this.binanceAdapter.fetchFuturesCandlesBefore(providerSymbol, timeframe, beforeTimestamp, limit);
      }
      if (isExplicitCryptoSpot) {
        return this.binanceAdapter.fetchCandlesBefore(symbol, timeframe, beforeTimestamp, limit);
      }
      if (isStockOrMetal) {
        return this.stockAdapter.fetchCandlesBefore(symbol, timeframe, beforeTimestamp, limit);
      }
      return this.binanceAdapter.fetchCandlesBefore(symbol, timeframe, beforeTimestamp, limit);
    };
    try {
      if (chartMarket?.source === 'bybit_spot') {
        return await this.bybitAdapter.fetchCandlesBefore(chartMarket.providerSymbol, timeframe, beforeTimestamp, limit);
      }
      if (chartMarket?.source === 'okx_spot') {
        return await this.okxAdapter.fetchCandlesBefore(chartMarket.providerSymbol, timeframe, beforeTimestamp, limit);
      }
      if (chartMarket?.source === 'binance_futures' && !isBinanceFutures) {
        return await this.binanceAdapter.fetchFuturesCandlesBefore(chartMarket.providerSymbol, timeframe, beforeTimestamp, limit);
      }
    } catch {
      // Resolved exchange failed: fall through to the legacy provider.
    }
    return legacyBefore();
  }

  public async getPriceQuote(symbol: string, requestedMarketClass?: AssetMarketClass): Promise<AssetPriceQuote> {
    const asset = this.getAssetDefinition(symbol);
    const resolvedMarketClass = requestedMarketClass || asset?.marketClass;
    const cacheKey = `${resolvedMarketClass || 'auto'}_${symbol}`;
    const source = this.resolveCryptoSource(symbol, asset);
    const isBinanceFutures = source === 'binance_futures';
    const providerSymbol = this.providerSymbolFor(symbol, asset, source);
    const isHyperliquid = source === 'hyperliquid';
    const isExplicitCryptoSpot = resolvedMarketClass === 'crypto' && !symbol.includes('.') && !symbol.startsWith('TOTAL');
    const isStockOrMetal = resolvedMarketClass === 'stocks' || resolvedMarketClass === 'metals'
      ? true
      : resolvedMarketClass === 'crypto'
        ? false
        : this.stockAdapter.isStockOrMetal(symbol);
    const cached = this.quoteCache.get(cacheKey);
    if (cached && Date.now() - (this.quoteFetchedAt.get(cacheKey) || 0) < this.quoteCacheMs) return cached;

    try {
      const chartMarket = isExplicitCryptoSpot ? await this.resolveCryptoChartMarket(symbol) : null;
      const legacyQuote = async () => isHyperliquid
        ? await this.hyperliquidAdapter.fetchQuote(providerSymbol)
        : isBinanceFutures
        ? await this.binanceAdapter.fetchFutures24hTicker(providerSymbol, symbol)
        : isExplicitCryptoSpot
        ? await this.binanceAdapter.fetch24hTicker(symbol)
        : isStockOrMetal
        ? await this.stockAdapter.fetchQuote(symbol)
        : await this.binanceAdapter.fetch24hTicker(symbol);
      let quote;
      try {
        quote = chartMarket?.source === 'bybit_spot'
          ? await this.bybitAdapter.fetch24hTicker(chartMarket.providerSymbol, symbol)
          : chartMarket?.source === 'okx_spot'
          ? await this.okxAdapter.fetch24hTicker(chartMarket.providerSymbol, symbol)
          : chartMarket?.source === 'binance_futures' && !isBinanceFutures
          ? await this.binanceAdapter.fetchFutures24hTicker(chartMarket.providerSymbol, symbol)
          : await legacyQuote();
      } catch (resolverError) {
        if (!chartMarket || chartMarket.source === 'binance_spot' || chartMarket.source === 'hyperliquid') throw resolverError;
        quote = await legacyQuote();
      }
      this.quoteCache.set(cacheKey, quote);
      this.quoteFetchedAt.set(cacheKey, Date.now());
      return quote;
    } catch (error) {
      const cached = this.quoteCache.get(cacheKey);
      if (cached) return { ...cached, source: `${cached.source} (cached)`, isStale: true };
      throw error;
    }
  }

  public async getQuotesForAssets(assets: AssetInfo[]): Promise<AssetPriceQuote[]> {
    const quotes: AssetPriceQuote[] = [];
    const concurrency = 6;
    for (let index = 0; index < assets.length; index += concurrency) {
      const settled = await Promise.allSettled(
        assets.slice(index, index + concurrency).map(asset => this.getPriceQuote(asset.symbol, asset.marketClass))
      );
      quotes.push(...settled.flatMap(result => result.status === 'fulfilled' ? [result.value] : []));
    }
    return quotes;
  }

  public async getAllQuotes(marketClass: ScannerMarketClass = 'ALL'): Promise<AssetPriceQuote[]> {
    const assets = marketClass === 'crypto'
      ? await this.getNarrativeBalancedCryptoAssets()
      : getScannerAssets(marketClass);
    return this.getQuotesForAssets(assets);
  }

  /** Top 50 overall plus the ten largest supported coins in each crypto sector. */
  public async getNarrativeBalancedCryptoAssets(): Promise<AssetInfo[]> {
    try {
      const marketCapPool = await this.getTopCryptoAssets(150);
      return selectNarrativeBalancedAssets(marketCapPool, marketCapPool.slice(0, 50));
    } catch {
      return BALANCED_CRYPTO_ASSETS;
    }
  }

  /**
   * Full flip-detection universe: 150 coins ranked by CoinGecko market cap
   * that have a live candle source (Binance USDT spot or Hyperliquid).
   * Stables and assets without candles are skipped; the static catalog is
   * never used to pad the list with coins outside CoinGecko's ranking.
   */
  public async getFlipUniverseCryptoAssets(): Promise<AssetInfo[]> {
    return this.getTopCryptoAssets(150);
  }

  private async fetchCoinGeckoMarketsPage(page: number): Promise<CoinGeckoMarketRow[]> {
    const response = await fetch(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=${page}&sparkline=false`,
      { headers: this.coinGeckoHeaders(), signal: AbortSignal.timeout(10_000) }
    );
    if (!response.ok) throw new Error(`CoinGecko HTTP ${response.status}`);
    const rows = await response.json() as CoinGeckoMarketRow[];
    return Array.isArray(rows) ? rows : [];
  }

  /** CoinGecko market-cap ranked crypto assets with a live candle source. */
  public async getTopCryptoAssets(limit = 50): Promise<AssetInfo[]> {
    const poolLimit = Math.max(limit, 150);
    if (
      this.topCryptoAssetsCache &&
      Date.now() - this.topCryptoAssetsCache.updatedAt < 5 * 60_000
    ) {
      this.rememberCryptoSources(this.topCryptoAssetsCache.values);
      return this.topCryptoAssetsCache.values.slice(0, limit);
    }

    try {
      const [page1, supportedSymbols, hyperliquidCoins] = await Promise.all([
        this.fetchCoinGeckoMarketsPage(1),
        this.binanceAdapter.getSupportedUsdtBaseAssets(),
        this.hyperliquidAdapter.getTradableCoins().catch(() => new Set<string>())
      ]);
      const existingBySymbol = new Map(
        TRADING_360_ASSETS.filter(asset => asset.marketClass === 'crypto').map(asset => [asset.symbol, asset])
      );
      for (const asset of existingBySymbol.values()) {
        if (asset.marketDataSource === 'hyperliquid') hyperliquidCoins.add(asset.symbol.toUpperCase());
      }

      const collect = (rows: CoinGeckoMarketRow[]) => {
        const marketCaps = new Map<string, number>();
        const seen = new Set<string>();
        const assets: AssetInfo[] = [];
        for (const row of rows) {
          const symbol = String(row.symbol || '').toUpperCase();
          if (!symbol || !/^[A-Z0-9]+$/.test(symbol) || seen.has(symbol)) continue;
          if (MarketDataService.STABLE_SYMBOLS.has(symbol)) continue;
          if (typeof row.market_cap !== 'number' || row.market_cap <= 0) continue;
          const onBinance = supportedSymbols.has(symbol);
          const onHyperliquid = hyperliquidCoins.has(symbol);
          if (!onBinance && !onHyperliquid) continue;

          const existing = existingBySymbol.get(symbol);
          const marketDataSource: AssetMarketDataSource = onBinance ? 'binance_spot' : 'hyperliquid';
          seen.add(symbol);
          marketCaps.set(symbol, row.market_cap);
          assets.push(withPrimaryNarrative({
            symbol,
            name: String(row.name || existing?.name || symbol),
            coinGeckoId: row.id,
            category: existing?.category || 'Infrastructure',
            marketClass: 'crypto',
            narratives: existing?.narratives,
            quoteCurrency: onBinance ? 'USDT' : (existing?.quoteCurrency || 'USDC'),
            aliases: Array.from(new Set([...(existing?.aliases || []), String(row.id || ''), String(row.name || '')].filter(Boolean))),
            marketCap: row.market_cap,
            rank: Number(row.market_cap_rank || 999),
            decimals: existing?.decimals ?? ((row.current_price || 0) < 1 ? 6 : 2),
            marketDataSource,
            providerSymbol: existing?.providerSymbol || symbol,
            exchange: existing?.exchange,
            instrumentType: existing?.instrumentType
          }));
          if (assets.length >= poolLimit) break;
        }
        return { assets, marketCaps };
      };

      let rows = page1;
      let collected = collect(rows);
      if (collected.assets.length < poolLimit) {
        try {
          rows = rows.concat(await this.fetchCoinGeckoMarketsPage(2));
          collected = collect(rows);
        } catch {
          // Keep the first CoinGecko page rather than padding with the static catalog.
        }
      }

      this.rememberCryptoSources(collected.assets);
      this.marketCapCache = { values: collected.marketCaps, updatedAt: Date.now() };
      this.topCryptoAssetsCache = { values: collected.assets, updatedAt: Date.now() };
      return collected.assets.slice(0, limit);
    } catch {
      // Do not fabricate a CoinGecko-ranked alert universe from the static
      // catalog. Callers that need a verified ranked list must handle the
      // empty result as unavailable and expose it as partial/failed coverage.
      return [];
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
