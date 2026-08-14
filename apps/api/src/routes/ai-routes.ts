import { Router } from 'express';
import { AppState } from '../services/app-state.js';
import { MoneyLineSignal } from '@money-scanner/shared';

export const aiRouter = Router();

aiRouter.get('/ai/briefing', async (req, res) => {
  try {
    const appState = AppState.getInstance();
    const overview = await appState.marketData.getMarketOverview();
    const trends = appState.social.getTrendingTopics();
    const news = appState.news.getLatestNews(10);

    const signalsObj: Record<string, MoneyLineSignal> = {};
    for (const [key, signal] of appState.cachedSignals.entries()) {
      if (key.endsWith('_1h')) {
        signalsObj[signal.symbol] = signal;
      }
    }

    const briefing = await appState.ai.generateMarketBriefing(overview, signalsObj, trends, news);
    res.json(briefing);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to generate AI briefing', details: err.message });
  }
});

aiRouter.post('/ai/analyze/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const appState = AppState.getInstance();

    const quote = await appState.marketData.getPriceQuote(symbol);
    const candles = await appState.marketData.getCandles(symbol, '1h', 150);
    const signal = appState.moneyLine.calculateLatest(symbol, '1h', candles);

    if (!signal) {
      return res.status(404).json({ error: `Unable to calculate signal for ${symbol}` });
    }

    const trends = appState.social.getTrendingTopics();
    const news = appState.news.getNewsForSymbol(symbol);

    const explanation = await appState.ai.generateAssetExplanation(symbol, quote.price, signal, trends, news);
    res.json(explanation);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to generate asset AI analysis', details: err.message });
  }
});
