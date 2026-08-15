import { Router } from 'express';
import { AppState } from '../services/app-state.js';
import { Timeframe, TOP_50_CRYPTO_ASSETS } from '@money-scanner/shared';
import { calculateMTFConfluence } from '@money-scanner/money-line';

export const scannerRouter = Router();

scannerRouter.get('/scanner', async (req, res) => {
  try {
    const timeframe = (req.query.timeframe as Timeframe) || '1h';
    const tier = req.query.tier as string;
    const rawSearch = (req.query.search as string || '').trim();
    const search = rawSearch.replace(/^[$#]/, '').toUpperCase();
    const watchlistOnly = req.query.watchlist === 'true';

    const appState = AppState.getInstance();
    let rows = await appState.refreshSignals(timeframe);

    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(r => {
        const info = TOP_50_CRYPTO_ASSETS.find(a => a.symbol.toUpperCase() === r.symbol.toUpperCase());
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

scannerRouter.get('/assets/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const timeframe = (req.query.timeframe as Timeframe) || '1h';

    const assetInfo = TOP_50_CRYPTO_ASSETS.find(a => a.symbol === symbol);
    if (!assetInfo) {
      return res.status(404).json({ error: `Asset ${symbol} not found in top 50 assets universe` });
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
