import { Router } from 'express';
import { AppState } from '../services/app-state.js';
import { AssetMarketClass, MoneyLineSignal, TelegramFlipTimeframe, Timeframe } from '@money-scanner/shared';
import { AuthenticatedRequest, validateCsrfToken } from '../middleware/auth.js';
import { validateScheduledRequestToken } from '../services/scheduler-auth.js';

export const telegramRouter = Router();

const telegramFlipTimeframes = new Set<TelegramFlipTimeframe>(['4h', '8h', '1d', '1w']);

const parseFlipTimeframeArgs = (args: string[]) => args.map(value => {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'weekly' || normalized === 'week') return '1w';
  if (normalized === 'daily' || normalized === 'day') return '1d';
  return normalized;
});

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

  const callbackPayload = appState.telegramBot.parseCallbackQuery(req.body);
  if (callbackPayload) {
    appState.telegramBot.registerChat(callbackPayload.chatId);
    await appState.telegramBot.answerCallbackQuery(callbackPayload.callbackQueryId);
    try {
      const preferences = await appState.toggleTelegramFlipAlertPreference(
        callbackPayload.chatId,
        callbackPayload.action
      );
      const response = appState.telegramBot.buildFlipAlertSettingsResponse(preferences, 'Preferințele au fost salvate.');
      let delivered = await appState.telegramBot.editMarkdown(
        response.text,
        callbackPayload.chatId,
        callbackPayload.messageId,
        response.reply_markup
      );
      if (!delivered) {
        delivered = await appState.telegramBot.sendMarkdown(
          response.text,
          callbackPayload.chatId,
          response.reply_markup
        );
      }
      return res.json({ status: 'ok', delivered, preferences });
    } catch (error) {
      console.error('Telegram flip preference update failed:', error instanceof Error ? error.message : error);
      await appState.telegramBot.sendMarkdown(
        '⚠️ Preferința nu a putut fi salvată momentan. Încearcă din nou cu `/alerts`.',
        callbackPayload.chatId
      );
      return res.json({ status: 'preference_update_failed' });
    }
  }

  const commandPayload = appState.telegramBot.parseUpdate(req.body);
  if (!commandPayload) {
    return res.json({ status: 'ignored' });
  }
  appState.telegramBot.registerChat(commandPayload.chatId);

  if (commandPayload.command === 'alerts' || commandPayload.command === 'flipalerts') {
    try {
      const args = parseFlipTimeframeArgs(commandPayload.args);
      let notice: string | undefined;
      let preferences;
      if (!args.length) {
        preferences = await appState.getTelegramFlipAlertPreferences(commandPayload.chatId, true);
      } else if (args.length === 1 && args[0] === 'all') {
        preferences = await appState.setTelegramFlipAlertPreferences(
          commandPayload.chatId,
          true,
          ['4h', '8h', '1d', '1w']
        );
        notice = 'Toate timeframe-urile au fost activate.';
      } else if (args.length === 1 && (args[0] === 'off' || args[0] === 'stop')) {
        const current = await appState.getTelegramFlipAlertPreferences(commandPayload.chatId, true);
        preferences = await appState.setTelegramFlipAlertPreferences(
          commandPayload.chatId,
          false,
          current.timeframes
        );
        notice = 'Alertele Telegram pentru flipuri au fost oprite.';
      } else if (args.every(value => telegramFlipTimeframes.has(value as TelegramFlipTimeframe))) {
        const timeframes = Array.from(new Set(args)) as TelegramFlipTimeframe[];
        preferences = await appState.setTelegramFlipAlertPreferences(commandPayload.chatId, true, timeframes);
        notice = `Timeframe-uri activate: ${timeframes.map(value => value.toUpperCase()).join(', ')}.`;
      } else {
        preferences = await appState.getTelegramFlipAlertPreferences(commandPayload.chatId, true);
        notice = 'Opțiune invalidă. Folosește 4h, 8h, 1d, 1w, all sau off.';
      }

      const response = appState.telegramBot.buildFlipAlertSettingsResponse(preferences, notice);
      const delivered = await appState.telegramBot.sendMarkdown(
        response.text,
        commandPayload.chatId,
        response.reply_markup
      );
      return res.json({ status: 'ok', delivered, preferences });
    } catch (error) {
      console.error('Telegram flip settings command failed:', error instanceof Error ? error.message : error);
      const delivered = await appState.telegramBot.sendMarkdown(
        '⚠️ Setările alertelor nu sunt disponibile momentan. Încearcă din nou.',
        commandPayload.chatId
      );
      return res.json({ status: 'preference_command_failed', delivered });
    }
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
  const delivered = await appState.telegramBot.sendMarkdown(
    response.text,
    commandPayload.chatId,
    response.reply_markup
  );

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

telegramRouter.get('/alerts/dashboard', async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
  const dashboard = await AppState.getInstance().getAlertsDashboard(req.user.id);
  res.set('Cache-Control', 'no-store');
  res.json(dashboard);
});

telegramRouter.post('/alerts/manual-scan', async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
  if (!validateCsrfToken(req)) {
    return res.status(403).json({ error: 'Invalid CSRF token.', code: 'CSRF_INVALID' });
  }

  const rawScope = req.body?.scope;
  const scope = (rawScope === 'full' || rawScope === 'flips' || rawScope === 'strategies' || rawScope === 'quick')
    ? (rawScope as 'full' | 'flips' | 'strategies' | 'quick')
    : undefined;
  if (!scope) return res.status(400).json({ error: 'Tipul scanării trebuie să fie quick, full, flips sau strategies.' });
  const watchlist = Array.isArray(req.body?.watchlist)
    ? req.body.watchlist.slice(0, 50).flatMap((item: unknown) => {
      if (typeof item === 'string') return [{ symbol: item }];
      if (!item || typeof item !== 'object') return [];
      const value = item as { symbol?: unknown; marketClass?: unknown };
      const marketClass = value.marketClass === 'crypto' || value.marketClass === 'stocks' || value.marketClass === 'metals'
        ? value.marketClass
        : undefined;
      return typeof value.symbol === 'string' ? [{ symbol: value.symbol, marketClass }] : [];
    })
    : [];

  try {
    const status = await AppState.getInstance().runManualAlertScan(req.user.id, scope, watchlist);
    res.set('Cache-Control', 'no-store');
    return res.json(status);
  } catch (error) {
    const scanError = error as Error & { code?: string; retryAfterSeconds?: number };
    if (scanError.code === 'SCAN_COOLDOWN') {
      res.set('Retry-After', String(scanError.retryAfterSeconds || 1));
      return res.status(429).json({
        error: scanError.message,
        code: scanError.code,
        retryAfterSeconds: scanError.retryAfterSeconds
      });
    }
    return res.status(500).json({ error: scanError.message || 'Scanarea manuală a eșuat.' });
  }
});

telegramRouter.delete('/alerts', async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
  if (!validateCsrfToken(req)) {
    return res.status(403).json({ error: 'Invalid CSRF token.', code: 'CSRF_INVALID' });
  }
  const target = req.body?.target === 'active' || req.body?.target === 'history' || req.body?.target === 'all'
    ? req.body.target
    : undefined;
  if (!target) return res.status(400).json({ error: 'Target invalid: active, history sau all.' });
  const result = await AppState.getInstance().clearAlerts(req.user.id, target);
  res.set('Cache-Control', 'no-store');
  return res.json(result);
});

// Invoked only by Cloud Scheduler. It deliberately sits outside browser auth
// because there is no user session in a scheduled HTTP request; the dedicated
// high-entropy header is verified here in constant time.
telegramRouter.post('/alerts/daily-regime-scan', async (req, res) => {
  if (!validateScheduledRequestToken(req.get('x-daily-scan-token'))) {
    return res.status(401).json({ error: 'Invalid daily scan token.' });
  }
  const status = await AppState.getInstance().runDailyRegimeScan();
  res.set('Cache-Control', 'no-store');
  res.json(status);
});

telegramRouter.get('/alerts/history', (req: AuthenticatedRequest, res) => {
  const appState = AppState.getInstance();
  if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
  res.json(appState.alertHistory.filter(alert =>
    alert.ruleId?.startsWith(`${req.user!.id}:`)
    || alert.type === 'MultiTimeframeReversal'
    || alert.type === 'StrategySetup'
  ));
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
