import { Router } from 'express';
import { AppState } from '../services/app-state.js';
import { AssetMarketClass, MoneyLineSignal, Timeframe } from '@money-scanner/shared';
import { AuthenticatedRequest } from '../middleware/auth.js';

export const telegramRouter = Router();

telegramRouter.post('/telegram/webhook', async (req, res) => {
  const appState = AppState.getInstance();
  const secretHeader = req.headers['x-telegram-bot-api-secret-token'] as string | undefined;

  if (!appState.telegramBot.validateWebhookSecret(secretHeader)) {
    return res.status(401).json({ error: 'Unauthorized secret token' });
  }

  const socialPostIngested = appState.social.ingestTelegramUpdate(req.body);
  if (req.body?.channel_post || req.body?.edited_channel_post) {
    return res.json({ status: socialPostIngested ? 'social_post_ingested' : 'social_post_ignored' });
  }

  const commandPayload = appState.telegramBot.parseUpdate(req.body);
  if (!commandPayload) {
    return res.json({ status: 'ignored' });
  }
  appState.telegramBot.registerChat(commandPayload.chatId);

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
  const delivered = await appState.telegramBot.sendMarkdown(response.text, commandPayload.chatId);

  res.json({
    status: 'ok',
    delivered,
    response
  });
});

const validTimeframes = new Set<Timeframe>(['1h', '4h', '8h', '1d', '1w', '1m']);
const validMarketClasses = new Set<AssetMarketClass>(['crypto', 'stocks', 'metals']);

telegramRouter.get('/alerts/bullish', (req: AuthenticatedRequest, res) => {
  const appState = AppState.getInstance();
  const symbol = String(req.query.symbol || '').replace(/^[$#]/, '').trim().toUpperCase();
  const timeframe = String(req.query.timeframe || '1h') as Timeframe;
  if (!req.user || !symbol || !validTimeframes.has(timeframe)) {
    return res.status(400).json({ error: 'Symbol sau timeframe invalid.' });
  }

  const rule = appState.getBullishCloudAlert(req.user.id, symbol, timeframe);
  res.json({
    active: Boolean(rule?.isEnabled),
    rule,
    ...appState.telegramBot.getDeliveryConfiguration()
  });
});

telegramRouter.put('/alerts/bullish', async (req: AuthenticatedRequest, res) => {
  const appState = AppState.getInstance();
  const symbol = String(req.body.symbol || '').replace(/^[$#]/, '').trim().toUpperCase();
  const timeframe = String(req.body.timeframe || '') as Timeframe;
  const marketClass = String(req.body.marketClass || 'crypto') as AssetMarketClass;
  const enabled = req.body.enabled !== false;
  if (
    !req.user ||
    !symbol ||
    !/^[A-Z0-9._-]{1,30}$/.test(symbol) ||
    !validTimeframes.has(timeframe) ||
    !validMarketClasses.has(marketClass)
  ) {
    return res.status(400).json({ error: 'Date invalide pentru alerta MoneyLine.' });
  }

  const rule = await appState.setBullishCloudAlert(req.user.id, symbol, timeframe, marketClass, enabled);
  res.json({
    active: Boolean(rule?.isEnabled),
    rule,
    ...appState.telegramBot.getDeliveryConfiguration()
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
    alert.isDelivered = await appState.telegramBot.sendMarkdown(alert.message);
    appState.alertHistory.unshift(alert);
    return res.json({
      status: alert.isDelivered ? 'dispatched' : 'generated_not_delivered',
      alert,
      ...appState.telegramBot.getDeliveryConfiguration()
    });
  }

  res.json({ status: 'no_alert_generated' });
});
