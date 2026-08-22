import { Router } from 'express';
import { AppState } from '../services/app-state.js';
import { NewsCategory } from '@money-scanner/shared';

export const socialNewsRouter = Router();

const waitForRefresh = (refresh: Promise<void>, timeoutMs = 15_000): Promise<void> => {
  // Always serve the latest cached verified sources. A refresh is best-effort;
  // it must never make a client wait until Cloud Run's request deadline.
  return new Promise(resolve => {
    const deadline = setTimeout(resolve, timeoutMs);
    void refresh.catch(() => undefined).finally(() => {
      clearTimeout(deadline);
      resolve();
    });
  });
};

socialNewsRouter.get('/social/trends', async (req, res) => {
  try {
    const appState = AppState.getInstance();
    await waitForRefresh(appState.social.refreshFreeSources());
    const trends = appState.social.getTrendingTopics();
    res.json(trends);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch X trends', details: err.message });
  }
});

socialNewsRouter.get('/social/posts', async (req, res) => {
  try {
    const appState = AppState.getInstance();
    await waitForRefresh(appState.social.refreshFreeSources());
    const posts = appState.social.getRecentVerifiedPosts();
    res.json(posts);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch verified X posts', details: err.message });
  }
});

socialNewsRouter.get('/news', async (req, res) => {
  try {
    const category = req.query.category as NewsCategory | undefined;
    const limit = parseInt(req.query.limit as string) || 20;

    const appState = AppState.getInstance();
    await waitForRefresh(appState.news.fetchLiveNews());
    const news = appState.news.getLatestNews(limit, category);
    res.json(news);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch news', details: err.message });
  }
});
