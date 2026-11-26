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

  it('rejects telegram webhook requests when no webhook secret is configured', () => {
    const previous = process.env.TELEGRAM_WEBHOOK_SECRET;
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    try {
      const bot = new TelegramBotHandler();
      assert.equal(bot.validateWebhookSecret('any-token'), false);
      assert.equal(bot.validateWebhookSecret(undefined), false);
    } finally {
      if (previous === undefined) delete process.env.TELEGRAM_WEBHOOK_SECRET;
      else process.env.TELEGRAM_WEBHOOK_SECRET = previous;
    }
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

  it('parses flip preset commands for the Telegram autocomplete menu', () => {
    const bot = new TelegramBotHandler({ webhookSecret: 'test-secret-123' });
    for (const command of ['flips', 'flips_crypto', 'flips_stocks', 'flips_bull', 'flips_bear',
      'flips_crypto_bull', 'flips_crypto_bear', 'flips_stocks_bull', 'flips_stocks_bear']) {
      const parsed = bot.parseUpdate({
        message: { message_id: 44, from: { id: 12345 }, chat: { id: 67890 }, text: `/${command}` }
      });
      assert.ok(parsed !== null, `/${command} should parse`);
      assert.equal(parsed.command, command);
    }
    assert.equal(bot.parseUpdate({
      message: { message_id: 45, from: { id: 12345 }, chat: { id: 67890 }, text: '/flips_unknown' }
    }), null);
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

    const bullOnly = bot.buildLiveScanResponse({
      mode: 'flips', timeframe: '1w', marketClass: 'crypto', direction: 'BULLISH',
      scannedAssets: 3, totalAssets: 3, errors: 0, signals: [],
      flips: [{
        symbol: 'BTC', name: 'Bitcoin', timeframe: '1w', marketClass: 'crypto', direction: 'BULLISH',
        currentPrice: 100, confirmationPrice: 99,
        confirmedAt: Date.now() - 86_400_000, priorityScore: 90, rvol: 1.2
      }]
    });
    assert.ok(bullOnly.text.includes('· BULLISH ·'));
    assert.ok(bullOnly.text.includes('(Bitcoin)'));
  });

  it('chunks flip overflow into compact follow-up messages covering the full list', () => {
    const bot = new TelegramBotHandler({ dashboardBaseUrl: 'https://scanner.example' });
    const makeFlips = (count: number) => Array.from({ length: count }, (_, index) => ({
      symbol: `A${index}`,
      name: `Asset ${index}`,
      timeframe: '1w' as const,
      marketClass: 'crypto' as const,
      direction: (index % 2 === 0 ? 'BULLISH' : 'BEARISH') as 'BULLISH' | 'BEARISH',
      currentPrice: 100,
      priorityScore: 90,
      rvol: 1.1,
      confirmedAt: Date.now() - 86_400_000
    }));
    const input = (flips: ReturnType<typeof makeFlips>) => ({
      mode: 'flips' as const,
      timeframe: '1w' as const,
      marketClass: 'ALL' as const,
      scannedAssets: flips.length,
      totalAssets: flips.length,
      errors: 0,
      signals: [] as never[],
      flips
    });

    const main = bot.buildLiveScanResponse(input(makeFlips(25)));
    assert.ok(main.text.includes('…și încă 15 flipuri mai jos'));

    const chunks = bot.buildLiveScanFlipOverflow(input(makeFlips(25)));
    assert.equal(chunks.length, 1);
    assert.ok(chunks[0].startsWith('*Continuare 11–25 din 25:*'));
    assert.ok(chunks[0].includes('$A10]('));
    assert.ok(chunks[0].includes('(Asset 10)'));
    assert.ok(chunks[0].includes('$A24]('));
    assert.ok(!chunks[0].includes('$A0]('));
    assert.ok(chunks[0].length <= 4096);

    const many = bot.buildLiveScanFlipOverflow(input(makeFlips(60)));
    assert.ok(many.length >= 2);
    assert.ok(many[0].startsWith('*Continuare 11–'));
    assert.ok(/Continuare \d+–60 din 60:\*/.test(many[many.length - 1]));
    const joined = many.join('\n');
    assert.ok(joined.includes('$A10]('));
    assert.ok(joined.includes('$A59]('));
    assert.ok(!joined.includes('$A0]('));
    for (const chunk of many) assert.ok(chunk.length <= 4096);

    assert.deepEqual(bot.buildLiveScanFlipOverflow(input(makeFlips(10))), []);
    assert.deepEqual(bot.buildLiveScanFlipOverflow({ ...input(makeFlips(25)), mode: 'signals' }), []);
  });
});
