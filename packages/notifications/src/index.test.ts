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
});
