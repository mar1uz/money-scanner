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
      rows = rows.filter(r => 
        r.symbol.toUpperCase().includes(search) || 
        r.name.toUpperCase().includes(search) ||
        r.category.toUpperCase().includes(search)
      );
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
    const activeCandles = await appState.marketData.getCandles(symbol, timeframe, 250);

    const candles1h = timeframe === '1h' ? activeCandles : await appState.marketData.getCandles(symbol, '1h', 250);
    const candles4h = timeframe === '4h' ? activeCandles : await appState.marketData.getCandles(symbol, '4h', 250);
    const candles1d = timeframe === '1d' ? activeCandles : await appState.marketData.getCandles(symbol, '1d', 250);

    const signal1h = appState.moneyLine.calculateLatest(symbol, '1h', candles1h);
    const signal4h = appState.moneyLine.calculateLatest(symbol, '4h', candles4h);
    const signal1d = appState.moneyLine.calculateLatest(symbol, '1d', candles1d);

    const mtfSummary = calculateMTFConfluence({
      '1h': signal1h || undefined,
      '4h': signal4h || undefined,
      '1d': signal1d || undefined
    });

    const activeSignal = (timeframe === '1h' || timeframe === '4h' || timeframe === '1d')
      ? (timeframe === '1h' ? signal1h : (timeframe === '4h' ? signal4h : signal1d))
      : appState.moneyLine.calculateLatest(symbol, timeframe, activeCandles);
    const quote = await appState.marketData.getPriceQuote(symbol);
    const xPosts = appState.social.getTrendingTopics();
    const news = appState.news.getNewsForSymbol(symbol);

    let aiExplanation = null;
    if (activeSignal) {
      aiExplanation = await appState.ai.generateAssetExplanation(symbol, quote.price, activeSignal, xPosts, news);
    }

    res.json({
      info: assetInfo,
      quote,
      activeTimeframe: timeframe,
      activeSignal,
      multiTimeframe: mtfSummary,
      candles: activeCandles,
      news,
      xTrends: xPosts.filter(t => t.cashtag === `$${symbol}`),
      aiExplanation,
      lastUpdated: Date.now()
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch asset detail', details: err.message });
  }
});
