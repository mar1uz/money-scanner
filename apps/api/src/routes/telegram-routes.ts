import { Router } from 'express';
import { AppState, AUTOMATED_FLIP_TIMEFRAMES } from '../services/app-state.js';
import { fetchRadarDigestText } from '../services/radar-digest-service.js';
import { AssetMarketClass, MoneyLineSignal, TelegramFlipTimeframe, Timeframe } from '@money-scanner/shared';
import { AuthenticatedRequest, validateCsrfToken } from '../middleware/auth.js';
import { validateScheduledRequestToken } from '../services/scheduler-auth.js';

export const telegramRouter = Router();

const telegramFlipTimeframes = new Set<TelegramFlipTimeframe>(['4h', '8h', '1d', '1w']);
const telegramScanTimeframes = new Set<Timeframe>(['1h', '4h', '8h', '1d', '1w']);

const parseFlipTimeframeArgs = (args: string[]) => args.map(value => {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'weekly' || normalized === 'week') return '1w';
  if (normalized === 'daily' || normalized === 'day') return '1d';
  return normalized;
});

export const parseTelegramScanArgs = (args: string[]): {
  mode: 'signals' | 'flips';
  timeframe: Timeframe;
  marketClass: 'ALL' | 'crypto' | 'stocks' | 'metals';
  direction: 'ALL' | 'BULLISH' | 'BEARISH';
} | undefined => {
  let mode: 'signals' | 'flips' = 'signals';
  let timeframe: Timeframe | undefined;
  let marketClass: 'ALL' | 'crypto' | 'stocks' | 'metals' | undefined;
  let direction: 'ALL' | 'BULLISH' | 'BEARISH' | undefined;
  for (const rawValue of args) {
    let value = rawValue.trim().toLowerCase();
    if (value === 'weekly' || value === 'week') value = '1w';
    if (value === 'daily' || value === 'day') value = '1d';
    if (value === 'flip') value = 'flips';
    if (value === 'bull') value = 'bullish';
    if (value === 'bear') value = 'bearish';
    if (value === 'flips') {
      mode = 'flips';
    } else if (telegramScanTimeframes.has(value as Timeframe) && !timeframe) {
      timeframe = value as Timeframe;
    } else if ((value === 'crypto' || value === 'stocks' || value === 'metals' || value === 'all') && !marketClass) {
      marketClass = value === 'all' ? 'ALL' : value;
    } else if ((value === 'bullish' || value === 'bearish') && !direction) {
      direction = value === 'bullish' ? 'BULLISH' : 'BEARISH';
    } else {
      return undefined;
    }
  }
  if (mode === 'signals' && direction && direction !== 'ALL') return undefined;
  return {
    mode,
    timeframe: timeframe || (mode === 'flips' ? '1w' : '1h'),
    marketClass: marketClass || (mode === 'flips' ? 'ALL' : 'crypto'),
    direction: direction || 'ALL'
  };
};

/** Preseturi 1W pentru meniul autocomplete Telegram (/flips*). */
export const FLIP_SCAN_PRESETS: Record<string, {
  marketClass: 'ALL' | 'crypto' | 'stocks';
  direction: 'ALL' | 'BULLISH' | 'BEARISH';
}> = {
  flips: { marketClass: 'ALL', direction: 'ALL' },
  flips_crypto: { marketClass: 'crypto', direction: 'ALL' },
  flips_stocks: { marketClass: 'stocks', direction: 'ALL' },
  flips_bull: { marketClass: 'ALL', direction: 'BULLISH' },
  flips_bear: { marketClass: 'ALL', direction: 'BEARISH' },
  flips_crypto_bull: { marketClass: 'crypto', direction: 'BULLISH' },
  flips_crypto_bear: { marketClass: 'crypto', direction: 'BEARISH' },
  flips_stocks_bull: { marketClass: 'stocks', direction: 'BULLISH' },
  flips_stocks_bear: { marketClass: 'stocks', direction: 'BEARISH' }
};

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
    if (!appState.telegramBot.isOwnerUser(callbackPayload.userId)) {
      await appState.telegramBot.answerCallbackQuery(
        callbackPayload.callbackQueryId,
        'Doar proprietarul botului poate modifica alertele.'
      );
      return res.json({ status: 'owner_required' });
    }
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

  const flipPreset = FLIP_SCAN_PRESETS[commandPayload.command];
  if (commandPayload.command === 'scan' || flipPreset) {
    if (!appState.telegramBot.isOwnerUser(commandPayload.userId)) {
      const delivered = await appState.telegramBot.sendMarkdown(
        '🔒 Doar proprietarul botului poate porni scanări live.',
        commandPayload.chatId
      );
      return res.json({ status: 'owner_required', delivered });
    }
    const options = flipPreset
      ? { mode: 'flips' as const, timeframe: '1w' as const, marketClass: flipPreset.marketClass, direction: flipPreset.direction }
      : parseTelegramScanArgs(commandPayload.args);
    if (!options || (options.mode === 'flips' && options.timeframe === '1h')) {
      if (commandPayload.command === 'scan' && (commandPayload.args[0] || '').toLowerCase() === 'radar') {
        await appState.telegramBot.sendMarkdown(
          '⏳ Construiesc rezumatul Radar (determinist, fara AI)…',
          commandPayload.chatId
        );
        try {
          const digest = await fetchRadarDigestText();
          const delivered = await appState.telegramBot.sendMarkdown(digest, commandPayload.chatId);
          return res.json({ status: 'radar_digest_complete', delivered });
        } catch (error) {
          console.error('Telegram radar digest failed:', error instanceof Error ? error.message : error);
          const delivered = await appState.telegramBot.sendMarkdown(
            '⚠️ Rezumatul Radar nu a putut fi construit momentan. Încearcă din nou.',
            commandPayload.chatId
          );
          return res.json({ status: 'radar_digest_failed', delivered });
        }
      }
      const delivered = await appState.telegramBot.sendMarkdown(
        '⚠️ Format invalid. Exemple: `/scan 4h`, `/scan 1d crypto`, `/scan 1w stocks`, `/scan flips 1w`, `/scan flips 1w crypto bullish`, `/scan flips 1w stocks bearish`, `/scan radar` (rezumat determinist Radar PORT/movers/microcaps+semafor) — sau preseturi: `/flips`, `/flips_crypto`, `/flips_stocks`, `/flips_crypto_bull`, `/flips_stocks_bear`.',
        commandPayload.chatId
      );
      return res.json({ status: 'invalid_scan_options', delivered });
    }
    const directionLabel = options.mode === 'flips' && options.direction !== 'ALL' ? ` · ${options.direction}` : '';

    await appState.telegramBot.sendMarkdown(
      `⏳ Pornesc scanarea live: *${options.mode === 'flips' ? 'FLIPURI' : 'SEMNALE'} · ${options.timeframe.toUpperCase()} · ${options.marketClass === 'ALL' ? 'TOATE PIEȚELE' : options.marketClass.toUpperCase()}${directionLabel}*.`,
      commandPayload.chatId
    );
    try {
      const result = await appState.scanTelegramMoneyLine(options.mode, options.timeframe, options.marketClass);
      const flips = options.mode === 'flips' && options.direction !== 'ALL'
        ? result.flips.filter(flip => flip.direction === options.direction)
        : result.flips;
      const response = appState.telegramBot.buildLiveScanResponse({ ...result, flips, direction: options.direction });
      const delivered = await appState.telegramBot.sendMarkdown(response.text, commandPayload.chatId);
      // Full list instead of truncating at 10: compact follow-up messages.
      let overflowSent = 0;
      if (options.mode === 'flips') {
        const overflow = appState.telegramBot.buildLiveScanFlipOverflow({ ...result, flips, direction: options.direction });
        for (const chunk of overflow) {
          if (await appState.telegramBot.sendMarkdown(chunk, commandPayload.chatId)) overflowSent += 1;
          else break;
        }
      }
      return res.json({
        status: 'scan_complete',
        delivered,
        scan: {
          mode: result.mode,
          timeframe: result.timeframe,
          marketClass: result.marketClass,
          direction: options.direction,
          scannedAssets: result.scannedAssets,
          totalAssets: result.totalAssets,
          errors: result.errors,
          matches: result.mode === 'flips' ? flips.length : result.signals.length,
          messages: 1 + overflowSent
        }
      });
    } catch (error) {
      console.error('Telegram live scan failed:', error instanceof Error ? error.message : error);
      const delivered = await appState.telegramBot.sendMarkdown(
        `⚠️ Scanarea live a eșuat: ${error instanceof Error ? error.message : 'eroare necunoscută'}`,
        commandPayload.chatId
      );
      return res.json({ status: 'scan_failed', delivered });
    }
  }

  if (commandPayload.command === 'subscribe' || commandPayload.command === 'unsubscribe') {
    if (!appState.telegramBot.isOwnerUser(commandPayload.userId)) {
      const delivered = await appState.telegramBot.sendMarkdown(
        '🔒 Doar proprietarul botului poate adăuga sau elimina acest grup din lista de alerte.',
        commandPayload.chatId
      );
      return res.json({ status: 'owner_required', delivered });
    }

    const isGroup = commandPayload.chatType === 'group' || commandPayload.chatType === 'supergroup';
    if (!isGroup) {
      const delivered = await appState.telegramBot.sendMarkdown(
        'ℹ️ Comanda se folosește într-un grup. Alertele private configurate rămân active automat.',
        commandPayload.chatId
      );
      return res.json({ status: 'group_required', delivered });
    }

    try {
      const enabled = commandPayload.command === 'subscribe';
      const subscription = await appState.setTelegramFlipAlertSubscription({
        chatId: commandPayload.chatId,
        chatType: commandPayload.chatType,
        title: commandPayload.chatTitle,
        enabled,
        addedByUserId: commandPayload.userId
      });
      if (!enabled) {
        const delivered = await appState.telegramBot.sendMarkdown(
          '🔕 Alertele automate de flip au fost oprite pentru acest grup. Alertele private nu sunt afectate.',
          commandPayload.chatId
        );
        return res.json({ status: 'unsubscribed', delivered, subscription });
      }

      const preferences = await appState.getTelegramFlipAlertPreferences(commandPayload.chatId, true);
      const response = appState.telegramBot.buildFlipAlertSettingsResponse(
        preferences,
        'Grup abonat. Alege timeframe-urile pentru acest grup.'
      );
      const delivered = await appState.telegramBot.sendMarkdown(
        response.text,
        commandPayload.chatId,
        response.reply_markup
      );
      return res.json({ status: 'subscribed', delivered, subscription, preferences });
    } catch (error) {
      console.error('Telegram group subscription failed:', error instanceof Error ? error.message : error);
      const delivered = await appState.telegramBot.sendMarkdown(
        '⚠️ Abonamentul grupului nu a putut fi salvat momentan. Încearcă din nou.',
        commandPayload.chatId
      );
      return res.json({ status: 'subscription_failed', delivered });
    }
  }

  if (commandPayload.command === 'alerts' || commandPayload.command === 'flipalerts') {
    if (!appState.telegramBot.isOwnerUser(commandPayload.userId)) {
      const delivered = await appState.telegramBot.sendMarkdown(
        '🔒 Doar proprietarul botului poate modifica timeframe-urile alertelor.',
        commandPayload.chatId
      );
      return res.json({ status: 'owner_required', delivered });
    }
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

const validPriceAlertDirections = new Set(['above', 'below']);

telegramRouter.get('/alerts/price', async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
  const appState = AppState.getInstance();
  const symbol = String(req.query.symbol || '').replace(/^[$#]/, '').trim().toUpperCase();
  const marketClass = String(req.query.marketClass || '') as AssetMarketClass;
  await appState.priceAlerts.loadPersistedRules();
  res.json({
    rules: appState.priceAlerts.listRules(
      req.user.id,
      symbol || undefined,
      validMarketClasses.has(marketClass) ? marketClass : undefined
    ),
    ...appState.telegramBot.getDeliveryConfiguration()
  });
});

telegramRouter.post('/alerts/price', async (req: AuthenticatedRequest, res) => {
  const appState = AppState.getInstance();
  const symbol = String(req.body?.symbol || '').replace(/^[$#]/, '').trim().toUpperCase();
  const marketClass = String(req.body?.marketClass || 'crypto') as AssetMarketClass;
  const price = Number(req.body?.price);
  const direction = String(req.body?.direction || '') as 'above' | 'below';
  if (
    !req.user ||
    !/^[A-Z0-9._-]{1,30}$/.test(symbol) ||
    !validMarketClasses.has(marketClass) ||
    !Number.isFinite(price) ||
    price <= 0 ||
    !validPriceAlertDirections.has(direction)
  ) {
    return res.status(400).json({ error: 'Date invalide pentru alerta de preț.' });
  }
  try {
    const rule = await appState.priceAlerts.createRule({
      userId: req.user.id,
      symbol,
      marketClass,
      targetPrice: price,
      direction
    });
    res.json({ rule, ...appState.telegramBot.getDeliveryConfiguration() });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Nu am putut salva alerta de preț.' });
  }
});

telegramRouter.delete('/alerts/price/:id', async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
  const removed = await AppState.getInstance().priceAlerts.deleteRule(req.user.id, String(req.params.id || ''));
  res.json({ ok: removed });
});

telegramRouter.get('/alerts/dashboard', async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
  const dashboard = await AppState.getInstance().getAlertsDashboard(req.user.id);
  res.set('Cache-Control', 'no-store');
  res.json(dashboard);
});

// Dedicated read endpoint for the daily SMA reclaim report. Browser access is
// protected by the normal Firebase session middleware.
telegramRouter.get('/alerts/daily-sma-reclaim', async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
  const report = await AppState.getInstance().getDailySmaReclaimReport();
  res.set('Cache-Control', 'no-store');
  return res.json(report);
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
  // Scheduled scan: Daily + Weekly only (sub-1D automation stopped 2026-09-24).
  const status = await AppState.getInstance().runDailyRegimeScan({ timeframes: AUTOMATED_FLIP_TIMEFRAMES });
  res.set('Cache-Control', 'no-store');
  res.json(status);
});

// Internal briefing refresh: fixed no-delivery mode, never body-controlled.
telegramRouter.post('/alerts/daily-regime-scan/no-send', async (req, res) => {
  if (!validateScheduledRequestToken(req.get('x-daily-scan-token'))) {
    return res.status(401).json({ error: 'Invalid daily scan token.' });
  }
  try {
    const status = await AppState.getInstance().runDailyRegimeScan({ timeframes: AUTOMATED_FLIP_TIMEFRAMES, delivery: 'none' });
    res.set('Cache-Control', 'no-store');
    return res.status(status.lastError ? 502 : 200).json(status);
  } catch (error: any) {
    return res.status(error?.code === 'SCAN_BUSY' ? 409 : 500).json({ error: error?.message || 'No-send scan failed.' });
  }
});

// Dedicated Cloud Scheduler target. It deliberately does not share the
// existing regime-scan execution or its state machine.
telegramRouter.post('/alerts/daily-sma-reclaim/scheduled', async (req, res) => {
  if (!validateScheduledRequestToken(req.get('x-daily-scan-token'))) {
    return res.status(401).json({ error: 'Invalid daily scan token.' });
  }
  const report = await AppState.getInstance().runDailySmaReclaimScan();
  res.set('Cache-Control', 'no-store');
  return res.json(report);
});

// Paper-only structure scanner pass. Scheduled runs cover the Daily close only
// (4H/8H automation stopped 2026-09-24). Logs to Firestore, never sends Telegram.
telegramRouter.post('/alerts/structure-scanner/scheduled', async (req, res) => {
  if (!validateScheduledRequestToken(req.get('x-daily-scan-token'))) {
    return res.status(401).json({ error: 'Invalid daily scan token.' });
  }
  const report = await AppState.getInstance().runStructureScannerScan(Date.now(), ['1d']);
  res.set('Cache-Control', 'no-store');
  return res.json(report);
});

// Indexed history is separate from the heavy alerts dashboard and never scans on read.
telegramRouter.get('/alerts/ma-retests', async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
  const limit = Number(req.query.limit ?? 20);
  const before = req.query.before === undefined ? undefined : String(req.query.before);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50 || (before !== undefined && !/^MA_2X2_CROSS_RETEST:[0-9-]{10}:\w+:[A-Za-z0-9_-]+:[0-9-]{10}$/.test(before))) {
    return res.status(400).json({ error: 'Invalid retest history cursor or limit.' });
  }
  try {
    const records = await AppState.getInstance().listMaCrossRetests(limit, before);
    res.set('Cache-Control', 'no-store');
    return res.json(records);
  } catch (error) {
    console.error('Retest history read failed:', error);
    return res.status(503).json({ error: 'Retest history unavailable.' });
  }
});

// Dedicated Cloud Scheduler target for the 2x2 MA cross/retest daily pass.
telegramRouter.post('/alerts/ma-cross/scheduled', async (req, res) => {
  if (!validateScheduledRequestToken(req.get('x-daily-scan-token'))) {
    return res.status(401).json({ error: 'Invalid daily scan token.' });
  }
  const report = await AppState.getInstance().runMaCrossAlertScan();
  res.set('Cache-Control', 'no-store');
  return res.json(report);
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
