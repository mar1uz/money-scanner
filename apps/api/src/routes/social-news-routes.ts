import { Router } from 'express';
import { AppState } from '../services/app-state.js';
import { NewsCategory } from '@money-scanner/shared';

export const socialNewsRouter = Router();

socialNewsRouter.get('/social/trends', (req, res) => {
  try {
    const appState = AppState.getInstance();
    const trends = appState.social.getTrendingTopics();
    res.json(trends);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch X trends', details: err.message });
  }
});

socialNewsRouter.get('/social/posts', (req, res) => {
  try {
    const appState = AppState.getInstance();
    const posts = appState.social.getRecentVerifiedPosts();
    res.json(posts);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch verified X posts', details: err.message });
  }
});

socialNewsRouter.get('/news', (req, res) => {
  try {
    const category = req.query.category as NewsCategory | undefined;
    const limit = parseInt(req.query.limit as string) || 20;

    const appState = AppState.getInstance();
    const news = appState.news.getLatestNews(limit, category);
    res.json(news);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch news', details: err.message });
  }
});
