import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AppState } from './app-state.js';

const candles = (lastClose: number) => Array.from({ length: 60 }, (_, index) => ({
  symbol: 'TEST',
  timeframe: '1d' as const,
  timestamp: Date.now() - (59 - index) * 86_400_000,
  open: index === 59 ? lastClose : 100,
  high: index === 59 ? lastClose + 1 : 101,
  low: index === 59 ? lastClose - 1 : 99,
  close: index === 59 ? lastClose : 100,
  volume: 1_000,
  isClosed: true,
  source: 'fixture' as const
}));

describe('Daily MoneyLine regime scan', () => {
  it('prevents repeated manual full scans during the ten-minute cooldown', async () => {
    const state = new AppState();
    (state as any).executeManualFullScan = async () => ({
      scope: 'full',
      running: false,
      scannedAssets: 10,
      totalAssets: 10,
      matches: 0,
      errors: 0,
      lastCompletedAt: Date.now()
    });

    const first = await state.runManualAlertScan('user-1', 'full');
    assert.equal(first.scannedAssets, 10);
    await assert.rejects(
      () => state.runManualAlertScan('user-1', 'full'),
      (error: any) => error?.code === 'SCAN_COOLDOWN' && error?.retryAfterSeconds > 0
    );
  });

  it('detects a Daily bearish transition below SMA50 inside a Weekly bullish regime', () => {
    const state = new AppState();
    const daily = candles(90);
    state.moneyLine.calculateSeries = (() => Array.from({ length: 60 }, (_, index) => ({
      tier: index === 59 ? 'Bearish' : 'Neutral',
      previousTier: index === 59 ? 'Neutral' : undefined,
      candleTimestamp: daily[index].timestamp,
      score: index === 59 ? -35 : 0
    }))) as any;
    state.moneyLine.calculateLatest = (() => ({ tier: 'Bullish', score: 42 })) as any;

    const result = (state as any).evaluateDailyRegimeAsset('TEST', 'stocks', daily, candles(100));
    assert.equal(result.scenario, 'WEEKLY_BULL_DAILY_BEAR');
    assert.ok(result.price < result.sma50);
  });

  it('detects a Daily bullish transition above SMA50 inside a Weekly bearish regime', () => {
    const state = new AppState();
    const daily = candles(110);
    state.moneyLine.calculateSeries = (() => Array.from({ length: 60 }, (_, index) => ({
      tier: index === 59 ? 'Bullish' : 'Neutral',
      previousTier: index === 59 ? 'Neutral' : undefined,
      candleTimestamp: daily[index].timestamp,
      score: index === 59 ? 38 : 0
    }))) as any;
    state.moneyLine.calculateLatest = (() => ({ tier: 'Bearish', score: -44 })) as any;

    const result = (state as any).evaluateDailyRegimeAsset('TEST', 'crypto', daily, candles(100));
    assert.equal(result.scenario, 'WEEKLY_BEAR_DAILY_BULL');
    assert.ok(result.price > result.sma50);
  });

  it('does not trigger when Daily only changes tier inside the same bullish family', () => {
    const state = new AppState();
    const daily = candles(110);
    state.moneyLine.calculateSeries = (() => Array.from({ length: 60 }, (_, index) => ({
      tier: index === 59 ? 'Strong Bullish' : 'Bullish',
      previousTier: index === 59 ? 'Bullish' : undefined,
      candleTimestamp: daily[index].timestamp,
      score: index === 59 ? 70 : 30
    }))) as any;
    state.moneyLine.calculateLatest = (() => ({ tier: 'Bearish', score: -44 })) as any;

    const result = (state as any).evaluateDailyRegimeAsset('TEST', 'crypto', daily, candles(100));
    assert.equal(result, undefined);
  });

  it('calculates an ATR-normalized upcoming flip candidate from closed candles', () => {
    const state = new AppState();
    const series = candles(100);
    state.moneyLine.calculateLatest = (() => ({
      tier: 'Bearish',
      score: -35,
      rawIndicators: { atr14: 2, rvol: 1.4 }
    })) as any;

    const result = (state as any).calculateFlipCandidate(
      'TEST',
      'stocks',
      '1d',
      series,
      100,
      'Bearish',
      -42
    );

    assert.equal(result.symbol, 'TEST');
    assert.equal(result.timeframe, '1d');
    assert.equal(result.direction, 'BULLISH');
    assert.ok(result.triggerPrice > result.currentPrice);
    assert.ok(result.distanceAtr > 0);
    assert.ok(result.priorityScore >= 0 && result.priorityScore <= 100);
    assert.equal(result.weeklyAligned, false);
  });

  it('supports Weekly flip candidates so ETH-like 1W thresholds reach Top Flips', () => {
    const state = new AppState();
    const series = candles(100);
    state.moneyLine.calculateLatest = (() => ({
      tier: 'Bearish',
      score: -35,
      rawIndicators: { atr14: 4, rvol: 1.1 }
    })) as any;

    const result = (state as any).calculateFlipCandidate(
      'ETH',
      'crypto',
      '1w',
      series,
      100,
      'Bearish',
      -35
    );

    assert.equal(result.symbol, 'ETH');
    assert.equal(result.name, 'Ethereum');
    assert.equal(result.timeframe, '1w');
    assert.equal(result.direction, 'BULLISH');
    assert.equal(result.status, 'APPROACHING');
  });

  it('keeps confirmed flips out while retaining searchable candidates per timeframe', () => {
    const state = new AppState();
    const base = {
      marketClass: 'crypto',
      direction: 'BULLISH',
      currentPrice: 100,
      triggerPrice: 102,
      distancePercent: 2,
      distanceAtr: 0.5,
      priorityScore: 80,
      atr: 4,
      rvol: 1.2,
      moneyLineTier: 'Bearish',
      moneyLineScore: -20,
      weeklyTier: 'Bullish',
      weeklyScore: 30,
      sma50: 95,
      sma200: 90,
      weeklyAligned: true,
      sma50Aligned: true,
      sma200Aligned: true,
      candleTimestamp: Date.now(),
      scannedAt: Date.now()
    };
    const ranked = (state as any).rankUpcomingCandidates([
      { ...base, id: 'btc-4h', symbol: 'BTC', timeframe: '4h', status: 'VERY_CLOSE', priorityScore: 90 },
      { ...base, id: 'btc-1d', symbol: 'BTC', timeframe: '1d', status: 'APPROACHING', priorityScore: 70 },
      { ...base, id: 'eth-4h', symbol: 'ETH', timeframe: '4h', status: 'CONFIRMED', priorityScore: 100 },
      { ...base, id: 'sol-4h', symbol: 'SOL', timeframe: '4h', status: 'AWAITING_CLOSE', priorityScore: 85 }
    ]);

    assert.deepEqual(ranked.map((candidate: any) => candidate.id), ['btc-4h', 'sol-4h', 'btc-1d']);
  });

  it('delivers only the Telegram flip timeframes selected for the chat', async () => {
    const state = new AppState();
    const timestamp = Date.now();
    const base = {
      marketClass: 'crypto',
      direction: 'BULLISH',
      status: 'CONFIRMED',
      currentPrice: 100,
      triggerPrice: 99,
      distancePercent: 0,
      distanceAtr: 0,
      priorityScore: 88,
      atr: 4,
      rvol: 1.2,
      moneyLineTier: 'Bullish',
      moneyLineScore: 35,
      weeklyTier: 'Bullish',
      weeklyScore: 35,
      sma50: 95,
      sma200: 90,
      weeklyAligned: true,
      sma50Aligned: true,
      sma200Aligned: true,
      candleTimestamp: timestamp,
      scannedAt: timestamp
    };
    (state as any).getTelegramFlipAlertDestinations = async () => [{
      chatId: '67890',
      chatType: 'private',
      enabled: true,
      addedByUserId: '67890',
      updatedAt: timestamp
    }];
    (state as any).getTelegramFlipAlertPreferences = async () => ({
      chatId: '67890',
      enabled: true,
      timeframes: ['1w'],
      updatedAt: timestamp
    });
    let sentMessage = '';
    (state.telegramBot as any).sendMarkdown = async (message: string) => {
      sentMessage = message;
      return true;
    };

    await (state as any).publishConfirmedFlipEvents([
      { ...base, id: 'btc-4h', symbol: 'BTC', timeframe: '4h' },
      { ...base, id: 'eth-1w', symbol: 'ETH', timeframe: '1w' }
    ], 'scheduled/full scan');

    assert.ok(sentMessage.includes('$ETH'));
    assert.ok(sentMessage.includes('1W'));
    assert.equal(sentMessage.includes('$BTC'), false);
    assert.equal(state.alertHistory.find(alert => alert.symbol === 'ETH')?.isDelivered, true);
    assert.equal(state.alertHistory.find(alert => alert.symbol === 'BTC')?.isDelivered, false);
  });

  it('broadcasts different flip timeframes to private and subscribed group chats', async () => {
    const state = new AppState();
    const timestamp = Date.now();
    const base = {
      marketClass: 'crypto', direction: 'BULLISH', status: 'CONFIRMED', currentPrice: 100,
      triggerPrice: 99, distancePercent: 0, distanceAtr: 0, priorityScore: 88, atr: 4,
      rvol: 1.2, moneyLineTier: 'Bullish', moneyLineScore: 35, weeklyTier: 'Bullish',
      weeklyScore: 35, sma50: 95, sma200: 90, weeklyAligned: true, sma50Aligned: true,
      sma200Aligned: true, candleTimestamp: timestamp, scannedAt: timestamp
    };
    (state as any).getTelegramFlipAlertDestinations = async () => [
      { chatId: '100', chatType: 'private', enabled: true, addedByUserId: '100', updatedAt: timestamp },
      { chatId: '-200', chatType: 'supergroup', enabled: true, addedByUserId: '100', updatedAt: timestamp }
    ];
    (state as any).getTelegramFlipAlertPreferences = async (chatId: string) => ({
      chatId,
      enabled: true,
      timeframes: chatId === '100' ? ['1w'] : ['4h'],
      updatedAt: timestamp
    });
    const deliveries: Array<{ chatId: string; message: string }> = [];
    (state.telegramBot as any).sendMarkdown = async (message: string, chatId: string) => {
      deliveries.push({ chatId, message });
      return true;
    };

    await (state as any).publishConfirmedFlipEvents([
      { ...base, id: 'btc-4h', symbol: 'BTC', timeframe: '4h' },
      { ...base, id: 'eth-1w', symbol: 'ETH', timeframe: '1w' }
    ], 'scheduled/full scan');

    assert.equal(deliveries.length, 2);
    assert.ok(deliveries.find(delivery => delivery.chatId === '100')?.message.includes('$ETH'));
    assert.equal(deliveries.find(delivery => delivery.chatId === '100')?.message.includes('$BTC'), false);
    assert.ok(deliveries.find(delivery => delivery.chatId === '-200')?.message.includes('$BTC'));
    assert.equal(deliveries.find(delivery => delivery.chatId === '-200')?.message.includes('$ETH'), false);
  });

  it('publishes an OLD 1w flip from confirmedHistory once (deduped across sources)', async () => {
    const state = new AppState();
    const timestamp = Date.now();
    const oldCandle = timestamp - 30 * 86_400_000;
    const base: any = {
      marketClass: 'crypto', direction: 'BULLISH', status: 'CONFIRMED', currentPrice: 100,
      triggerPrice: 99, distancePercent: 0, distanceAtr: 0, priorityScore: 88, atr: 4,
      rvol: 1.2, moneyLineTier: 'Bullish', moneyLineScore: 35, weeklyTier: 'Bullish',
      weeklyScore: 35, sma50: 95, sma200: 90, weeklyAligned: true, sma50Aligned: true,
      sma200Aligned: true, candleTimestamp: oldCandle, scannedAt: timestamp
    };
    (state as any).getTelegramFlipAlertDestinations = async () => [
      { chatId: '100', chatType: 'private', enabled: true, addedByUserId: '100', updatedAt: timestamp }
    ];
    (state as any).getTelegramFlipAlertPreferences = async (chatId: string) => ({
      chatId, enabled: true, timeframes: ['1w'], updatedAt: timestamp
    });
    let sends = 0;
    let sentMessage = '';
    (state.telegramBot as any).sendMarkdown = async (message: string) => {
      sends += 1;
      sentMessage = message;
      return true;
    };

    // Same old 1w flip arriving from two sources must collapse to one line/entry.
    const oldFlip = { ...base, id: 'eth-1w-old', symbol: 'ETH', timeframe: '1w' };
    await (state as any).publishConfirmedFlipEvents(
      [oldFlip, { ...oldFlip, id: 'eth-1w-old-dup' }],
      'scheduled/full scan'
    );

    assert.equal(sends, 1);
    assert.ok(sentMessage.includes('$ETH'));
    assert.ok(sentMessage.includes('1W'));
    assert.equal(state.alertHistory.filter((alert: any) => alert.symbol === 'ETH').length, 1);
  });

  it('does not resend an already-delivered 1w flip on the second call (idempotency)', async () => {
    const state = new AppState();
    const timestamp = Date.now();
    const oldCandle = timestamp - 30 * 86_400_000;
    const base: any = {
      marketClass: 'crypto', direction: 'BULLISH', status: 'CONFIRMED', currentPrice: 100,
      triggerPrice: 99, distancePercent: 0, distanceAtr: 0, priorityScore: 88, atr: 4,
      rvol: 1.2, moneyLineTier: 'Bullish', moneyLineScore: 35, weeklyTier: 'Bullish',
      weeklyScore: 35, sma50: 95, sma200: 90, weeklyAligned: true, sma50Aligned: true,
      sma200Aligned: true, candleTimestamp: oldCandle, scannedAt: timestamp
    };
    (state as any).getTelegramFlipAlertDestinations = async () => [
      { chatId: '100', chatType: 'private', enabled: true, addedByUserId: '100', updatedAt: timestamp }
    ];
    (state as any).getTelegramFlipAlertPreferences = async (chatId: string) => ({
      chatId, enabled: true, timeframes: ['1w'], updatedAt: timestamp
    });
    let sends = 0;
    (state.telegramBot as any).sendMarkdown = async () => {
      sends += 1;
      return true;
    };

    const oldFlip = { ...base, id: 'eth-1w-old', symbol: 'ETH', timeframe: '1w' };
    await (state as any).publishConfirmedFlipEvents([oldFlip], 'scheduled/full scan');
    assert.equal(sends, 1);
    const historyLength = state.alertHistory.length;

    await (state as any).publishConfirmedFlipEvents([oldFlip], 'scheduled/full scan');
    assert.equal(sends, 1);
    assert.equal(state.alertHistory.length, historyLength);
  });

  it('does NOT auto-publish non-1w history (call-site filter keeps 1d history out)', async () => {
    const state = new AppState();
    const timestamp = Date.now();
    const oldCandle = timestamp - 30 * 86_400_000;
    const base: any = {
      marketClass: 'crypto', direction: 'BULLISH', status: 'CONFIRMED', currentPrice: 100,
      triggerPrice: 99, distancePercent: 0, distanceAtr: 0, priorityScore: 88, atr: 4,
      rvol: 1.2, moneyLineTier: 'Bullish', moneyLineScore: 35, weeklyTier: 'Bullish',
      weeklyScore: 35, sma50: 95, sma200: 90, weeklyAligned: true, sma50Aligned: true,
      sma200Aligned: true, candleTimestamp: oldCandle, scannedAt: timestamp
    };
    (state as any).getTelegramFlipAlertDestinations = async () => [
      { chatId: '100', chatType: 'private', enabled: true, addedByUserId: '100', updatedAt: timestamp }
    ];
    (state as any).getTelegramFlipAlertPreferences = async (chatId: string) => ({
      chatId, enabled: true, timeframes: ['1w', '1d'], updatedAt: timestamp
    });
    let sends = 0;
    (state.telegramBot as any).sendMarkdown = async () => {
      sends += 1;
      return true;
    };

    // Same composition as both production call sites.
    const newlyConfirmed: any[] = [];
    const confirmedHistory: any[] = [{ ...base, id: 'btc-1d-old', symbol: 'BTC', timeframe: '1d' }];
    const toPublish = [...newlyConfirmed, ...confirmedHistory.filter(c => c.timeframe === '1w')];
    assert.deepEqual(toPublish, []);
    await (state as any).publishConfirmedFlipEvents(toPublish, 'scheduled/full scan');
    assert.equal(sends, 0);
    assert.equal(state.alertHistory.length, 0);
  });

  it('runs and briefly caches a live Telegram Money Line scan for the selected scope', async () => {
    const state = new AppState();
    (state.marketData as any).getTopCryptoAssets = async () => [
      { symbol: 'BTC', name: 'Bitcoin', marketClass: 'crypto' },
      { symbol: 'ETH', name: 'Ethereum', marketClass: 'crypto' }
    ];
    (state.marketData as any).getQuotesForAssets = async () => [
      { symbol: 'BTC', price: 100 },
      { symbol: 'ETH', price: 200 }
    ];
    let candleRequests = 0;
    (state.marketData as any).getCandles = async () => {
      candleRequests += 1;
      return candles(100);
    };
    (state.moneyLine as any).calculateLatest = (symbol: string) => ({
      symbol,
      timeframe: '4h',
      score: symbol === 'ETH' ? 70 : 35,
      tier: 'Bullish',
      previousTier: 'Neutral',
      isTransition: true,
      rawIndicators: { rvol: 1.2 }
    });

    const first = await state.scanTelegramMoneyLine('signals', '4h', 'crypto');
    const second = await state.scanTelegramMoneyLine('signals', '4h', 'crypto');

    assert.equal(first.totalAssets, 2);
    assert.equal(first.scannedAssets, 2);
    assert.deepEqual(first.signals.map(row => row.signal.symbol), ['ETH', 'BTC']);
    assert.equal(second.completedAt, first.completedAt);
    assert.equal(candleRequests, 2);
  });

  it('finds the latest historical flip and records its candle-close age', () => {
    const state = new AppState();
    const now = Date.now();
    const series = Array.from({ length: 120 }, (_, index) => {
      const close = index < 80 ? 100 - index * 0.2 : 84 + (index - 80) * 2;
      return {
        symbol: 'TEST',
        timeframe: '1d' as const,
        timestamp: now - (119 - index) * 86_400_000,
        open: close,
        high: close + 1,
        low: close - 1,
        close,
        volume: 1_000,
        isClosed: true,
        source: 'fixture' as const
      };
    });

    const result = (state as any).findMostRecentConfirmedFlip(
      'TEST', 'crypto', '1d', series, 200, 'Bullish', 40
    );

    assert.equal(result.status, 'CONFIRMED');
    assert.equal(result.direction, 'BULLISH');
    assert.equal(result.currentPrice, 200);
    assert.equal(result.confirmationPrice, series[84].close);
    assert.equal(result.candleTimestamp, series[84].timestamp);
    assert.equal(result.confirmedAt, series[84].timestamp + 86_400_000);
  });

  it('triggers an initial Bullish Flip alert and a subsequent Retest alert on support touch', async () => {
    const state = new AppState();
    const timestamp = Date.now();
    const sentMessages: string[] = [];
    (state.telegramBot as any).sendMarkdown = async (message: string) => {
      sentMessages.push(message);
      return true;
    };
    (state.marketData as any).getCandles = async () => series;

    // Construct candles that flip bullish
    const series = Array.from({ length: 120 }, (_, index) => {
      const close = index < 80 ? 100 - index * 0.2 : 84 + (index - 80) * 2;
      return {
        timestamp: timestamp - (119 - index) * 86_400_000,
        open: close,
        high: close + 1,
        low: close - 1,
        close,
        volume: 2_000,
        isClosed: true
      };
    });

    const rule: any = {
      id: 'user1:TEST:1w',
      userId: 'user1',
      symbol: 'TEST',
      timeframe: '1w',
      marketClass: 'crypto',
      isEnabled: true,
      createdAt: timestamp
    };

    // 1. Initial evaluation triggers Bullish Flip
    await (state as any).evaluateBullishCloudAlert(rule, { candles: series, price: 164 });
    assert.equal(sentMessages.length, 1);
    assert.ok(sentMessages[0].includes('BULLISH FLIP CONFIRMAT'));

    // 2. Subsequent candle where price pulls back into retest zone
    const lastPlan = rule.lastPlan!;
    const retestCandle = {
      timestamp: timestamp + 86_400_000,
      open: 160,
      high: 162,
      low: lastPlan.entryLow,
      close: lastPlan.suggestedEntry,
      volume: 2_500,
      isClosed: true
    };
    const seriesWithRetest = [...series, retestCandle];

    await (state as any).evaluateBullishCloudAlert(rule, { candles: seriesWithRetest, price: lastPlan.suggestedEntry });
    assert.equal(sentMessages.length, 2);
    assert.ok(sentMessages[1].includes('RETEST CONFIRMAT ÎN ZONA DE INTRARE'));
    assert.ok(sentMessages[1].includes('SETUP VALID'));
  });

  it('detects 1W confirmed flips for younger assets with under 50 weekly candles ($MORPHO scenario)', () => {
    const state = new AppState();
    const now = Date.now();
    // 48 weekly candles with pivot at 42 creating bullish flip at index 46
    const series = Array.from({ length: 48 }, (_, index) => {
      const close = index < 42 ? 100 - index * 0.5 : 79 + (index - 41) * 2;
      return {
        symbol: 'MORPHO',
        timeframe: '1w' as const,
        timestamp: now - (47 - index) * 7 * 86_400_000,
        open: close,
        high: close + 1,
        low: close - 1,
        close,
        volume: 1_000,
        isClosed: true,
        source: 'fixture' as const
      };
    });

    const result = (state as any).findMostRecentConfirmedFlip(
      'MORPHO', 'crypto', '1w', series, 95, 'Bullish', 40
    );

    assert.ok(result);
    assert.equal(result.symbol, 'MORPHO');
    assert.equal(result.name, 'Morpho');
    assert.equal(result.timeframe, '1w');
    assert.equal(result.direction, 'BULLISH');
    assert.equal(result.status, 'CONFIRMED');
    assert.equal(result.confirmationPrice, series[46].close);
    assert.equal(result.candleTimestamp, series[46].timestamp);
    assert.equal(result.confirmedAt, series[46].timestamp + 7 * 24 * 60 * 60 * 1_000);
  });

  it('enforces timeframe-aware minimum candle thresholds (15 for 1W, 30 for other timeframes)', () => {
    const state = new AppState();
    const now = Date.now();

    // 14 weekly candles must be rejected (< 15)
    const series14w = Array.from({ length: 14 }, (_, index) => ({
      symbol: 'TEST', timeframe: '1w' as const,
      timestamp: now - (13 - index) * 7 * 86_400_000,
      open: 100, high: 101, low: 99, close: 100, volume: 1000, isClosed: true, source: 'fixture' as const
    }));
    assert.equal((state as any).calculateFlipCandidate('TEST', 'crypto', '1w', series14w, 100, 'Bullish', 40), undefined);
    assert.equal((state as any).findMostRecentConfirmedFlip('TEST', 'crypto', '1w', series14w, 100, 'Bullish', 40), undefined);

    // 15 weekly candles with flip at index 14 must be accepted
    const series15w = Array.from({ length: 15 }, (_, index) => {
      const close = index < 8 ? 100 - index * 2 : 84 + (index - 7) * 2;
      return {
        symbol: 'TEST', timeframe: '1w' as const,
        timestamp: now - (14 - index) * 7 * 86_400_000,
        open: close, high: close + 1, low: close - 1, close, volume: 1000, isClosed: true, source: 'fixture' as const
      };
    });
    const result15w = (state as any).findMostRecentConfirmedFlip('TEST', 'crypto', '1w', series15w, 100, 'Bullish', 40);
    assert.ok(result15w);
    assert.equal(result15w.status, 'CONFIRMED');
    assert.equal(result15w.timeframe, '1w');

    // 29 daily candles must be rejected (< 30)
    const series29d = Array.from({ length: 29 }, (_, index) => ({
      symbol: 'TEST', timeframe: '1d' as const,
      timestamp: now - (28 - index) * 86_400_000,
      open: 100, high: 101, low: 99, close: 100, volume: 1000, isClosed: true, source: 'fixture' as const
    }));
    assert.equal((state as any).calculateFlipCandidate('TEST', 'crypto', '1d', series29d, 100, 'Bullish', 40), undefined);
    assert.equal((state as any).findMostRecentConfirmedFlip('TEST', 'crypto', '1d', series29d, 100, 'Bullish', 40), undefined);
  });
});
