import { Router } from 'express';
import { AppState } from '../services/app-state.js';
import { Timeframe, TRADING_360_ASSETS, ScannerMarketClass, AssetMarketClass, MarketNarrativeId } from '@money-scanner/shared';
import { calculateMTFConfluence } from '@money-scanner/money-line';

export const scannerRouter = Router();

scannerRouter.get('/search', async (req, res) => {
  try {
    const rawQuery = (req.query.q as string || '').trim();
    if (!rawQuery) {
      return res.json([]);
    }

    const cleanQ = rawQuery.replace(/^[$#]/, '').trim();
    const cleanQLower = cleanQ.toLowerCase();
    const appState = AppState.getInstance();
    const latestRows = await appState.refreshSignals('1w');

    const results: Array<{
      symbol: string;
      name: string;
      category: string;
      marketClass: string;
      exchange: string;
      instrumentType?: string;
      price: number;
      change24h: number;
      changeYtd: number;
      moneyLineScore: number;
      tier: string;
      matchType: 'local' | 'yahoo' | 'custom';
    }> = [];

    const seenSymbols = new Set<string>();

    // 1. Search Local High-Speed Catalog
    for (const asset of TRADING_360_ASSETS) {
      const sym = asset.symbol.toUpperCase();
      const symLower = sym.toLowerCase();
      const nameLower = asset.name.toLowerCase();
      const catLower = asset.category.toLowerCase();
      const aliasesLower = (asset.aliases || []).map(a => a.toLowerCase());

      const isMatch = 
        symLower === cleanQLower ||
        symLower.startsWith(cleanQLower) ||
        nameLower.includes(cleanQLower) ||
        catLower.includes(cleanQLower) ||
        aliasesLower.some(al => al.includes(cleanQLower) || cleanQLower.includes(al));

      if (isMatch && !seenSymbols.has(sym)) {
        seenSymbols.add(sym);
        const live = latestRows.find(r => r.symbol.toUpperCase() === sym);
        results.push({
          symbol: asset.symbol,
          name: asset.name,
          category: asset.category,
          marketClass: asset.marketClass || 'crypto',
          exchange: asset.exchange || (asset.marketClass === 'stocks' ? 'NASDAQ/NYSE' : (asset.marketClass === 'crypto' ? 'BINANCE' : 'GLOBAL')),
          instrumentType: asset.instrumentType,
          price: live?.price || 0,
          change24h: live?.change24h || 0,
          changeYtd: live?.changeYtd || 0,
          moneyLineScore: live?.moneyLineScore || 0,
          tier: live?.tier || 'Neutral',
          matchType: 'local'
        });
      }
    }

    // 2. Discover matching Binance USDT-M perpetuals. The `.P` suffix is an
    // app/TradingView-safe identity, so a perpetual never replaces a spot
    // coin, stock or ETF that happens to share the same ticker.
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2800);
      const futuresRes = await fetch('https://fapi.binance.com/fapi/v1/exchangeInfo', {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (futuresRes.ok) {
        const data = await futuresRes.json() as { symbols?: Array<{
          symbol?: string;
          baseAsset?: string;
          quoteAsset?: string;
          contractType?: string;
          status?: string;
        }> };
        const normalizedQuery = cleanQ.toUpperCase().replace(/[^A-Z0-9]/g, '');
        for (const market of data.symbols || []) {
          const pair = String(market.symbol || '').toUpperCase();
          const base = String(market.baseAsset || '').toUpperCase();
          if (
            !pair ||
            market.quoteAsset !== 'USDT' ||
            market.contractType !== 'PERPETUAL' ||
            market.status !== 'TRADING' ||
            !(pair.includes(normalizedQuery) || base.includes(normalizedQuery))
          ) continue;

          const appSymbol = `${pair}.P`;
          if (seenSymbols.has(appSymbol)) continue;
          seenSymbols.add(appSymbol);
          results.push({
            symbol: appSymbol,
            name: `${base} / USDT Perpetual`,
            category: 'Infrastructure',
            marketClass: 'crypto',
            exchange: 'BINANCE Futures',
            instrumentType: 'perpetual',
            price: 0,
            change24h: 0,
            changeYtd: 0,
            moneyLineScore: 0,
            tier: 'Neutral',
            matchType: 'custom'
          });
          if (results.filter(result => result.instrumentType === 'perpetual').length >= 8) break;
        }
      }
    } catch {}

    // 3. Query Global Yahoo Finance Public Search (TradingView-style global coverage)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2800);
      const yahooUrl = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(cleanQ)}&quotesCount=10&newsCount=0`;
      
      const yahooRes = await fetch(yahooUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      clearTimeout(timeoutId);

      if (yahooRes.ok) {
        const yahooData = await yahooRes.json() as any;
        const quotes = yahooData?.quotes || [];

        for (const q of quotes) {
          if (!q.symbol) continue;
          let sym = q.symbol.toUpperCase();
          // Normalize crypto pairs like BTC-USD -> BTC if not present
          if (q.quoteType === 'CRYPTOCURRENCY' && sym.endsWith('-USD')) {
            const baseCrypto = sym.replace('-USD', '');
            if (!seenSymbols.has(baseCrypto)) {
              sym = baseCrypto;
            }
          }

          if (seenSymbols.has(sym)) continue;
          seenSymbols.add(sym);

          let marketClass = 'stocks';
          let category = q.sectorDisp || q.industryDisp || q.typeDisp || 'Equities';

          if (q.quoteType === 'CRYPTOCURRENCY') {
            marketClass = 'crypto';
            category = 'Crypto Token';
          } else if (q.quoteType === 'CURRENCY') {
            marketClass = 'forex';
            category = 'Forex Pair';
          } else if (q.quoteType === 'COMMODITY') {
            marketClass = 'metals';
            category = 'Commodity';
          } else if (q.quoteType === 'ETF') {
            marketClass = 'stocks';
            category = 'ETF Fund';
          } else if (q.quoteType === 'INDEX') {
            marketClass = 'macro';
            category = 'Index';
          }

          const live = latestRows.find(r => r.symbol.toUpperCase() === sym);

          results.push({
            symbol: sym,
            name: q.shortname || q.longname || q.symbol,
            category,
            marketClass,
            exchange: q.exchDisp || q.exchange || 'GLOBAL',
            price: live?.price || 0,
            change24h: live?.change24h || 0,
            changeYtd: live?.changeYtd || 0,
            moneyLineScore: live?.moneyLineScore || 0,
            tier: live?.tier || 'Neutral',
            matchType: 'yahoo'
          });
        }
      }
    } catch (e) {}

    // 4. Guarantee Direct Custom TradingView Fallback (User can always open ANY ticker directly)
    const upperTicker = cleanQ.toUpperCase();
    if (!seenSymbols.has(upperTicker) && upperTicker.length >= 2 && upperTicker.length <= 10) {
      results.push({
        symbol: upperTicker,
        name: `${upperTicker} (TradingView & MoneyLine)`,
        category: 'Direct Asset Search',
        marketClass: 'stocks',
        exchange: 'TRADINGVIEW',
        price: 0,
        change24h: 0,
        changeYtd: 0,
        moneyLineScore: 0,
        tier: 'Active',
        matchType: 'custom'
      });
    }

    res.json(results);
  } catch (err: any) {
    res.status(500).json({ error: 'Search failed', details: err.message });
  }
});

scannerRouter.get('/scanner', async (req, res) => {
  try {
    const timeframe = (req.query.timeframe as Timeframe) || '1w';
    const tier = req.query.tier as string;
    const narrative = req.query.narrative as string;
    const requestedMarketClass = String(req.query.marketClass || 'ALL');
    const marketClass: ScannerMarketClass = requestedMarketClass === 'crypto' || requestedMarketClass === 'stocks' || requestedMarketClass === 'metals'
      ? requestedMarketClass
      : 'ALL';
    const rawSearch = (req.query.search as string || '').trim();
    const search = rawSearch.replace(/^[$#]/, '').toUpperCase();
    const watchlistOnly = req.query.watchlist === 'true';

    const appState = AppState.getInstance();
    let rows = await appState.refreshSignals(
      timeframe,
      marketClass,
      narrative && narrative !== 'ALL' ? narrative as MarketNarrativeId : undefined
    );

    // The selected crypto endpoint is a hard data contract, not a visual
    // preference. Reject every row that is not explicitly provider-classified
    // as crypto before any additional filtering or response serialization.
    if (marketClass === 'crypto') {
      rows = rows.filter(row => row.marketClass === 'crypto');
    }

    if (narrative && narrative !== 'ALL') {
      rows = rows.filter(r => r.narratives?.includes(narrative as any));
    }

    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(r => {
        const info = TRADING_360_ASSETS.find(a => a.symbol.toUpperCase() === r.symbol.toUpperCase());
        const aliases = (info?.aliases || []).map(al => al.toLowerCase());
        return (
          r.symbol.toLowerCase().includes(q) || 
          r.name.toLowerCase().includes(q) ||
          r.category.toLowerCase().includes(q) ||
          aliases.some(al => al.includes(q) || q.includes(al))
        );
      });
    }
    if (tier && tier !== 'ALL') {
      rows = rows.filter(r => r.tier === tier);
    }

    if (marketClass === 'crypto') {
      // The first 50 remain the global market-cap leaders; additional rows are
      // the sector-completion set required to expose ten assets per narrative.
      rows = rows.sort((left, right) => (right.marketCap || 0) - (left.marketCap || 0));
    }

    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to execute scanner', details: err.message });
  }
});

scannerRouter.get('/narratives', async (req, res) => {
  try {
    const timeframe = (req.query.timeframe as Timeframe) || '1w';
    const requestedMarketClass = String(req.query.marketClass || 'ALL');
    const marketClass: ScannerMarketClass = requestedMarketClass === 'crypto' || requestedMarketClass === 'stocks' || requestedMarketClass === 'metals'
      ? requestedMarketClass
      : 'ALL';
    const appState = AppState.getInstance();
    const narratives = await appState.getNarrativeSummaries(timeframe, marketClass);
    res.json(narratives);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to compute narrative summaries', details: err.message });
  }
});

scannerRouter.get('/assets/:symbol/candles', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const requestedTimeframe = String(req.query.timeframe || '1h');
    const validTimeframes: Timeframe[] = ['1h', '4h', '8h', '1d', '1w', '1m'];
    if (!validTimeframes.includes(requestedTimeframe as Timeframe)) {
      return res.status(400).json({ error: 'Invalid timeframe.' });
    }

    const before = Number(req.query.before);
    if (!Number.isFinite(before) || before <= 0) {
      return res.status(400).json({ error: 'A valid before timestamp is required.' });
    }

    const requestedLimit = Number(req.query.limit || 1000);
    const limit = Math.max(100, Math.min(1000, Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 1000));
    const requestedClassRaw = String(req.query.marketClass || '');
    const requestedMarketClass: AssetMarketClass | undefined = requestedClassRaw === 'crypto' || requestedClassRaw === 'stocks' || requestedClassRaw === 'metals'
      ? requestedClassRaw
      : undefined;

    const candles = await AppState.getInstance().marketData.getCandlesBefore(
      symbol,
      requestedTimeframe as Timeframe,
      before,
      limit,
      requestedMarketClass
    );

    res.json({
      candles,
      hasMore: candles.length > 0,
      oldestTimestamp: candles[0]?.timestamp || null
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch historical candles', details: err.message });
  }
});

scannerRouter.get('/assets/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const timeframe = (req.query.timeframe as Timeframe) || '1w';
    const requestedClassRaw = String(req.query.marketClass || '');
    const requestedMarketClass: AssetMarketClass | undefined = requestedClassRaw === 'crypto' || requestedClassRaw === 'stocks' || requestedClassRaw === 'metals'
      ? requestedClassRaw
      : undefined;
    const appState = AppState.getInstance();

    let assetInfo = TRADING_360_ASSETS.find(a => a.symbol === symbol);
    if (requestedMarketClass === 'crypto') {
      const liveCryptoAsset = (await appState.marketData.getTopCryptoAssets(80))
        .find(asset => asset.symbol.toUpperCase() === symbol);
      assetInfo = liveCryptoAsset || {
        symbol,
        name: `${symbol} Crypto`,
        category: 'Infrastructure',
        marketClass: 'crypto',
        quoteCurrency: 'USDT',
        aliases: [symbol.toLowerCase()],
        rank: 999,
        decimals: 6,
        exchange: 'BINANCE',
        instrumentType: 'spot',
        marketDataSource: 'binance_spot'
      };
    }
    // Dynamic Top 50 assets do not all exist in the hand-curated catalog.
    // Preserve their verified crypto class when opening a deep-dive/chart.
    if (!assetInfo) {
      const liveCryptoAsset = (await appState.marketData.getTopCryptoAssets(50))
        .find(asset => asset.symbol.toUpperCase() === symbol);
      if (liveCryptoAsset) assetInfo = liveCryptoAsset;
    }
    if (!assetInfo) {
      const isPerpetual = /\.P$/i.test(symbol);
      assetInfo = {
        symbol,
        name: isPerpetual ? `${symbol.replace(/\.P$/i, '')} / USDT Perpetual` : `${symbol} (TradingView Asset)`,
        category: isPerpetual ? 'Infrastructure' : (symbol.includes('.') || symbol === 'TOTAL' || symbol === 'DXY' ? 'Macro / Index' : 'Tech Stock'),
        marketClass: isPerpetual || symbol.includes('.D') || symbol.startsWith('TOTAL') ? 'crypto' : 'stocks',
        quoteCurrency: isPerpetual ? 'USDT' : (symbol.includes('.D') ? '%' : 'USD'),
        aliases: [symbol.toLowerCase()],
        rank: 999,
        decimals: 2,
        ...(isPerpetual ? {
          exchange: 'BINANCE Futures',
          instrumentType: 'perpetual' as const,
          marketDataSource: 'binance_futures' as const,
          providerSymbol: symbol.replace(/\.P$/i, '')
        } : {})
      };
    }

    const resolvedMarketClass = requestedMarketClass || assetInfo.marketClass;
    const activeCandles = await appState.marketData.getCandles(symbol, timeframe, 1500, resolvedMarketClass);

    const [candles1h, candles4h, candles8h, candles1d, candles1w, candles1m] = await Promise.all([
      timeframe === '1h' ? activeCandles : appState.marketData.getCandles(symbol, '1h', 500, resolvedMarketClass),
      timeframe === '4h' ? activeCandles : appState.marketData.getCandles(symbol, '4h', 500, resolvedMarketClass),
      timeframe === '8h' ? activeCandles : appState.marketData.getCandles(symbol, '8h', 500, resolvedMarketClass),
      timeframe === '1d' ? activeCandles : appState.marketData.getCandles(symbol, '1d', 500, resolvedMarketClass),
      timeframe === '1w' ? activeCandles : appState.marketData.getCandles(symbol, '1w', 300, resolvedMarketClass),
      timeframe === '1m' ? activeCandles : appState.marketData.getCandles(symbol, '1m', 150, resolvedMarketClass)
    ]);

    const signal1h = appState.moneyLine.calculateLatest(symbol, '1h', candles1h);
    const signal4h = appState.moneyLine.calculateLatest(symbol, '4h', candles4h);
    const signal8h = appState.moneyLine.calculateLatest(symbol, '8h', candles8h);
    const signal1d = appState.moneyLine.calculateLatest(symbol, '1d', candles1d);
    const signal1w = appState.moneyLine.calculateLatest(symbol, '1w', candles1w);
    const signal1m = appState.moneyLine.calculateLatest(symbol, '1m', candles1m);

    const mtfSummary = calculateMTFConfluence({
      '1h': signal1h || undefined,
      '4h': signal4h || undefined,
      '8h': signal8h || undefined,
      '1d': signal1d || undefined,
      '1w': signal1w || undefined,
      '1m': signal1m || undefined
    });

    const activeSignal = timeframe === '1h' ? signal1h : (
      timeframe === '4h' ? signal4h : (
        timeframe === '8h' ? signal8h : (
          timeframe === '1d' ? signal1d : (
            timeframe === '1w' ? signal1w : signal1m
          )
        )
      )
    );
    const [quote, news] = await Promise.all([
      appState.marketData.getPriceQuote(symbol, resolvedMarketClass),
      process.env.NODE_ENV === 'test'
        ? Promise.resolve(appState.news.getCachedNewsForAsset(assetInfo))
        : appState.news.getNewsForAsset(assetInfo)
    ]);
    const xPosts = appState.social.getPostsForSymbol(symbol);
    const trendingTopics = appState.social.getTrendingTopics();

    let aiExplanation = null;
    if (activeSignal) {
      aiExplanation = await appState.ai.generateAssetExplanation(symbol, quote.price, activeSignal, trendingTopics, news);
    }

    res.json({
      info: assetInfo,
      quote,
      activeTimeframe: timeframe,
      activeSignal,
      multiTimeframe: mtfSummary,
      candles: activeCandles,
      news,
      xPosts,
      xTrends: trendingTopics.filter(t => t.cashtag === `$${symbol}`),
      aiExplanation,
      lastUpdated: Date.now()
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch asset detail', details: err.message });
  }
});
