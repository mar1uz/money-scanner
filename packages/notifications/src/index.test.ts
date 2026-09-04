import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AlertDispatcher } from './alert-dispatcher.js';
import { TelegramBotHandler } from './telegram-bot.js';
import { buildMoneyLineAssetUrl, telegramAssetLink } from './asset-link.js';
import { MoneyLineSignal } from '@money-scanner/shared';

describe('Telegram Bot & Alert Dispatcher', () => {
  it('dispatches alerts on valid signal transition and respects deduplication & cooldown', () => {
    const dispatcher = new AlertDispatcher({ cooldownMs: 10_000 });
    const dummySignal: MoneyLineSignal = {
      symbol: 'BTC',
      timeframe: '1h',
      score: 72,
      tier: 'Strong Bullish',
      previousTier: 'Bullish',
      isTransition: true,
      rawIndicators: {
        ema20: 65000,
        ema50: 64000,
        ema200: 61000,
        ema20Slope: 1.1,
        roc9: 2.1,
        roc21: 4.2,
        macd: { line: 150, signal: 100, histogram: 50, histogramSlope: 10 },
        rsi14: 68,
        rsiRegime: 'Bullish',
        rvol: 2.1,
        volumeMA20: 6000,
        atr14: 900,
        atrPercent: 1.38
      },
      contributions: {
        emaAlignmentScore: 100,
        emaSlopeScore: 80,
        rocScore: 70,
        macdScore: 85,
        rsiScore: 65,
        rvolScore: 80,
        volatilityRegimeScore: 40,
        mtfConfirmationScore: 0
      },
      candleTimestamp: 1700000000000,
      calculationTimestamp: Date.now(),
      version: 'v1.0.0'
    };

    const alert1 = dispatcher.evaluateSignal(dummySignal, 65200);
    assert.ok(alert1 !== null);
    assert.ok(alert1.message.includes('BULLISH FLIP CONFIRMAT'));
    assert.ok(alert1.message.includes('BUY / LONG'));
    assert.ok(alert1.message.includes('$BTC'));
    assert.ok(alert1.message.includes('?asset=BTC&timeframe=1h'));
    assert.equal(alert1.dashboardLink.includes('?asset=BTC&timeframe=1h'), true);

    // Repeating exact same signal should be blocked by idempotency
    const alert2 = dispatcher.evaluateSignal(dummySignal, 65200);
    assert.equal(alert2, null);

    // New candle timestamp on same symbol within cooldown should be blocked by cooldown
    const newCandleSignal = { ...dummySignal, candleTimestamp: 1700003600000 };
    const alert3 = dispatcher.evaluateSignal(newCandleSignal, 65400);
    assert.equal(alert3, null);

    // After clearing cooldown, new candle should trigger
    dispatcher.clearCooldown('BTC');
    const alert4 = dispatcher.evaluateSignal(newCandleSignal, 65400);
    assert.ok(alert4 !== null);
  });

  it('builds Telegram ticker links that deep-link to the exact Money Line chart', () => {
    const url = buildMoneyLineAssetUrl({
      baseUrl: 'https://scanner.example/app?source=telegram',
      symbol: '$eth',
      timeframe: '4h',
      marketClass: 'crypto'
    });
    assert.equal(
      url,
      'https://scanner.example/app?source=telegram&asset=ETH&timeframe=4h&marketClass=crypto'
    );
    assert.equal(
      telegramAssetLink({ baseUrl: 'https://scanner.example', symbol: 'ETH', timeframe: '4h', marketClass: 'crypto' }),
      '[$ETH](https://scanner.example/?asset=ETH&timeframe=4h&marketClass=crypto)'
    );
  });

  it('validates telegram webhook tokens and parses incoming commands', () => {
    const bot = new TelegramBotHandler({ webhookSecret: 'test-secret-123' });

    assert.equal(bot.validateWebhookSecret('test-secret-123'), true);
    assert.equal(bot.validateWebhookSecret('wrong-secret'), false);

    const update = {
      message: {
        message_id: 42,
        from: { id: 12345, username: 'testuser' },
        chat: { id: 67890 },
        text: '/scan'
      }
    };

    const parsed = bot.parseUpdate(update);
    assert.ok(parsed !== null);
    assert.equal(parsed.command, 'scan');
    assert.equal(parsed.userId, 12345);

    const response = bot.handleCommand(parsed, { topSignals: [] });
    assert.ok(response.text.includes('MONEY SCANNER TOP SIGNALS'));
  });

  it('parses flip alert commands and Telegram timeframe button callbacks', () => {
    const bot = new TelegramBotHandler({ webhookSecret: 'test-secret-123' });
    const command = bot.parseUpdate({
      message: {
        message_id: 43,
        from: { id: 12345 },
        chat: { id: 67890 },
        text: '/flipalerts 1w'
      }
    });
    assert.ok(command !== null);
    assert.equal(command.command, 'flipalerts');
    assert.deepEqual(command.args, ['1w']);

    const callback = bot.parseCallbackQuery({
      callback_query: {
        id: 'callback-1',
        from: { id: 12345 },
        data: 'flip_tf:1w',
        message: { message_id: 44, chat: { id: 67890 } }
      }
    });
    assert.ok(callback !== null);
    assert.equal(callback.action, '1w');
    assert.equal(callback.chatId, 67890);
    assert.equal(bot.parseCallbackQuery({ callback_query: { data: 'other:1w' } }), null);
  });

  it('renders the saved Weekly-only flip alert selection', () => {
    const bot = new TelegramBotHandler();
    const response = bot.buildFlipAlertSettingsResponse({
      chatId: '67890',
      enabled: true,
      timeframes: ['1w'],
      updatedAt: Date.now()
    });
    assert.ok(response.text.includes('Timeframe-uri active:* 1W'));
    assert.equal(response.reply_markup?.inline_keyboard[1][1].text, '✅ 1W');
    assert.equal(response.reply_markup?.inline_keyboard[0][0].text, '▫️ 4H');
  });

  it('does not let an incoming command redirect the configured alert chat', () => {
    const bot = new TelegramBotHandler({ chatId: 'configured-chat' });
    bot.registerChat('different-chat');
    assert.equal(bot.getDefaultChatId(), 'configured-chat');
  });

  it('parses group subscriptions and authorizes only the configured owner', () => {
    const bot = new TelegramBotHandler({ chatId: '12345' });
    const command = bot.parseUpdate({
      message: {
        message_id: 45,
        from: { id: 12345, username: 'owner' },
        chat: { id: -100987, type: 'supergroup', title: 'Trading Group' },
        text: '/subscribe'
      }
    });
    assert.ok(command !== null);
    assert.equal(command.command, 'subscribe');
    assert.equal(command.chatType, 'supergroup');
    assert.equal(command.chatTitle, 'Trading Group');
    assert.equal(bot.isOwnerUser(command.userId), true);
    assert.equal(bot.isOwnerUser(999), false);
  });

  it('sorts live scan results by score and renders confirmed flips separately', () => {
    const bot = new TelegramBotHandler({ dashboardBaseUrl: 'https://scanner.example' });
    const signal = (symbol: string, score: number): MoneyLineSignal => ({
      symbol,
      timeframe: '4h',
      score,
      tier: score > 0 ? 'Bullish' : 'Bearish',
      previousTier: 'Neutral',
      isTransition: true,
      rawIndicators: {
        ema20: 1, ema50: 1, ema200: 1, ema20Slope: 0, roc9: 0, roc21: 0,
        macd: { line: 0, signal: 0, histogram: 0, histogramSlope: 0 },
        rsi14: 50, rsiRegime: 'Neutral', rvol: 1.2, volumeMA20: 1, atr14: 1, atrPercent: 1
      },
      contributions: {
        emaAlignmentScore: 0, emaSlopeScore: 0, rocScore: 0, macdScore: 0,
        rsiScore: 0, rvolScore: 0, volatilityRegimeScore: 0, mtfConfirmationScore: 0
      },
      candleTimestamp: 1,
      calculationTimestamp: 1,
      version: 'test'
    });
    const signals = bot.buildLiveScanResponse({
      mode: 'signals', timeframe: '4h', marketClass: 'crypto', scannedAssets: 3,
      totalAssets: 3, errors: 0, flips: [],
      signals: [
        { signal: signal('BTC', 30), price: 1, marketClass: 'crypto', name: 'Bitcoin' },
        { signal: signal('ETH', 70), price: 1, marketClass: 'crypto', name: 'Ethereum' },
        { signal: signal('SOL', -60), price: 1, marketClass: 'crypto', name: 'Solana' }
      ]
    });
    assert.ok(signals.text.indexOf('$ETH') < signals.text.indexOf('$BTC'));
    assert.ok(signals.text.includes('SEMNAL MONEYLINE LIVE · 4H'));
    assert.ok(signals.text.includes('(Ethereum)'));
    assert.ok(signals.text.includes('CRYPTO'));

    const flips = bot.buildLiveScanResponse({
      mode: 'flips', timeframe: '1w', marketClass: 'ALL', scannedAssets: 3,
      totalAssets: 3, errors: 0, signals: [],
      flips: [{
        symbol: 'NVDA', name: 'NVIDIA Corp', timeframe: '1w', marketClass: 'stocks', direction: 'BULLISH',
        currentPrice: 2500, confirmationPrice: 2400,
        confirmedAt: Date.now() - (3 * 86_400_000), priorityScore: 92, rvol: 1.5
      }]
    });
    assert.ok(flips.text.includes('FLIPURI MONEYLINE CONFIRMATE · 1W'));
    assert.ok(flips.text.includes('BULL FLIP'));
    assert.ok(flips.text.includes('$2,400.00'));
    assert.ok(flips.text.includes('acum 3 zile'));
    assert.ok(flips.text.includes('$NVDA'));
    assert.ok(flips.text.includes('(NVIDIA Corp)'));
    assert.ok(flips.text.includes('STOCKS'));
  });
});
