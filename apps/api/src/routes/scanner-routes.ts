import { Router } from 'express';
import { AppState } from '../services/app-state.js';
import { Timeframe, TRADING_360_ASSETS, ScannerMarketClass } from '@money-scanner/shared';
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
          exchange: asset.marketClass === 'stocks' ? 'NASDAQ/NYSE' : (asset.marketClass === 'crypto' ? 'BINANCE' : 'GLOBAL'),
          price: live?.price || 0,
          change24h: live?.change24h || 0,
          changeYtd: live?.changeYtd || 0,
          moneyLineScore: live?.moneyLineScore || 0,
          tier: live?.tier || 'Neutral',
          matchType: 'local'
        });
      }
    }

    // 2. Query Global Yahoo Finance Public Search (TradingView-style global coverage)
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

    // 3. Guarantee Direct Custom TradingView Fallback (User can always open ANY ticker directly)
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
    let rows = await appState.refreshSignals(timeframe, marketClass);

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

scannerRouter.get('/assets/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const timeframe = (req.query.timeframe as Timeframe) || '1w';

    let assetInfo = TRADING_360_ASSETS.find(a => a.symbol === symbol);
    if (!assetInfo) {
      assetInfo = {
        symbol,
        name: `${symbol} (TradingView Asset)`,
        category: symbol.includes('.') || symbol === 'TOTAL' || symbol === 'DXY' ? 'Macro / Index' : 'Tech Stock',
        marketClass: symbol.includes('.D') || symbol.startsWith('TOTAL') ? 'crypto' : 'stocks',
        quoteCurrency: symbol.includes('.D') ? '%' : 'USD',
        aliases: [symbol.toLowerCase()],
        rank: 999,
        decimals: 2
      };
    }

    const appState = AppState.getInstance();
    const activeCandles = await appState.marketData.getCandles(symbol, timeframe, 1500);

    const [candles1h, candles4h, candles8h, candles1d, candles1w, candles1m] = await Promise.all([
      timeframe === '1h' ? activeCandles : appState.marketData.getCandles(symbol, '1h', 500),
      timeframe === '4h' ? activeCandles : appState.marketData.getCandles(symbol, '4h', 500),
      timeframe === '8h' ? activeCandles : appState.marketData.getCandles(symbol, '8h', 500),
      timeframe === '1d' ? activeCandles : appState.marketData.getCandles(symbol, '1d', 500),
      timeframe === '1w' ? activeCandles : appState.marketData.getCandles(symbol, '1w', 300),
      timeframe === '1m' ? activeCandles : appState.marketData.getCandles(symbol, '1m', 150)
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
    const quote = await appState.marketData.getPriceQuote(symbol);
    const xPosts = appState.social.getPostsForSymbol(symbol);
    const trendingTopics = appState.social.getTrendingTopics();
    const news = appState.news.getNewsForSymbol(symbol);

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
