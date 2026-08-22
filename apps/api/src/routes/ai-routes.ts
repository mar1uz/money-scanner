import { Router } from 'express';
import { AppState } from '../services/app-state.js';
import { MoneyLineSignal, NewsCategory, NewsSynthesisPayload } from '@money-scanner/shared';

export const aiRouter = Router();

const synthesisCache = new Map<string, { payload: NewsSynthesisPayload; updatedAt: number }>();
const SYNTHESIS_CACHE_MS = 5 * 60_000;
const SOURCE_REFRESH_TIMEOUT_MS = 15_000;

const waitForSourceRefresh = (refresh: Promise<void>): Promise<void> => {
  // The model can produce a grounded fallback from currently cached sources.
  // Do not allow a third-party RSS/social host to hold this route open.
  return new Promise(resolve => {
    const deadline = setTimeout(resolve, SOURCE_REFRESH_TIMEOUT_MS);
    void refresh.catch(() => undefined).finally(() => {
      clearTimeout(deadline);
      resolve();
    });
  });
};

aiRouter.get('/news/synthesis', async (req, res) => {
  try {
    const language: 'ro' | 'en' = req.query.language === 'en' ? 'en' : 'ro';
    const category = req.query.category && req.query.category !== 'ALL'
      ? req.query.category as NewsCategory
      : undefined;
    const cacheKey = `${language}:${category || 'ALL'}`;
    const cached = synthesisCache.get(cacheKey);
    if (cached && Date.now() - cached.updatedAt < SYNTHESIS_CACHE_MS) {
      return res.json(cached.payload);
    }

    const appState = AppState.getInstance();
    await Promise.all([
      waitForSourceRefresh(appState.news.fetchLiveNews()),
      waitForSourceRefresh(appState.social.refreshFreeSources())
    ]);
    const news = appState.news.getLatestNews(20, category);
    const socialPosts = appState.social.getRecentVerifiedPosts()
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 20);
    const payload = await appState.ai.generateNewsSynthesis(news, socialPosts, language);
    synthesisCache.set(cacheKey, { payload, updatedAt: Date.now() });
    res.set('Cache-Control', 'public, max-age=60');
    res.json(payload);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to generate grounded news synthesis', details: err.message });
  }
});

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

aiRouter.post('/ai/ask', async (req, res) => {
  try {
    const { question } = req.body;
    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'Question string is required in request body' });
    }

    const appState = AppState.getInstance();
    const overview = await appState.marketData.getMarketOverview();
    const trends = appState.social.getTrendingTopics();
    const news = appState.news.getLatestNews(15);

    const signalsObj: Record<string, MoneyLineSignal> = {};
    for (const [key, signal] of appState.cachedSignals.entries()) {
      if (key.endsWith('_1h')) {
        signalsObj[signal.symbol] = signal;
      }
    }

    const response = await appState.ai.askAnalyst(question, overview, signalsObj, trends, news);
    res.json(response);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to process AI analyst question', details: err.message });
  }
});
