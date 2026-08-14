import { Router } from 'express';
import { AppState } from '../services/app-state.js';
import { MoneyLineSignal } from '@money-scanner/shared';

export const telegramRouter = Router();

telegramRouter.post('/telegram/webhook', async (req, res) => {
  const appState = AppState.getInstance();
  const secretHeader = req.headers['x-telegram-bot-api-secret-token'] as string | undefined;

  if (!appState.telegramBot.validateWebhookSecret(secretHeader)) {
    return res.status(401).json({ error: 'Unauthorized secret token' });
  }

  const commandPayload = appState.telegramBot.parseUpdate(req.body);
  if (!commandPayload) {
    return res.json({ status: 'ignored' });
  }

  const overview = await appState.marketData.getMarketOverview();
  const topSignals = Array.from(appState.cachedSignals.values());
  const trends = appState.social.getTrendingTopics();
  const news = appState.news.getLatestNews(5);

  const response = appState.telegramBot.handleCommand(commandPayload, {
    overview,
    topSignals,
    trends,
    news
  });

  res.json({
    status: 'ok',
    response
  });
});

telegramRouter.get('/alerts/history', (req, res) => {
  const appState = AppState.getInstance();
  res.json(appState.alertHistory);
});

telegramRouter.post('/alerts/test', async (req, res) => {
  const appState = AppState.getInstance();
  const symbol = (req.body.symbol || 'BTC').toUpperCase();
  const candles = await appState.marketData.getCandles(symbol, '1h', 150);
  const quote = await appState.marketData.getPriceQuote(symbol);
  const signal = appState.moneyLine.calculateLatest(symbol, '1h', candles);

  if (!signal) {
    return res.status(400).json({ error: 'Signal calculation failed' });
  }

  const alert = appState.alertDispatcher.evaluateSignal(signal, quote.price, true);
  if (alert) {
    appState.alertHistory.unshift(alert);
    return res.json({ status: 'dispatched', alert });
  }

  res.json({ status: 'no_alert_generated' });
});
