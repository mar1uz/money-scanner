import { it } from 'node:test';
import assert from 'node:assert/strict';
import { TelegramBotHandler, newestConfirmedTelegramFlips, TelegramLiveScanInput } from './telegram-bot.js';

const makeFlip = (symbol: string, confirmedAt?: number, priorityScore = 90, candleTimestamp?: number): TelegramLiveScanInput['flips'][number] => ({
  symbol, confirmedAt, candleTimestamp, priorityScore, timeframe: '1w', marketClass: 'crypto',
  direction: 'BULLISH', currentPrice: 10, confirmationPrice: 9, rvol: 2
});

it('orders confirmations newest first, with candle fallback and undated records last, without mutating input', () => {
  const input = [makeFlip('OLD', 100, 99), makeFlip('UNKNOWN'), makeFlip('NEW', 300, 1), makeFlip('FALLBACK', undefined, 50, 200), makeFlip('TIE', 300, 2)];
  const original = [...input];
  assert.deepEqual(newestConfirmedTelegramFlips(input).map(f => f.symbol), ['TIE', 'NEW', 'FALLBACK', 'OLD', 'UNKNOWN']);
  assert.deepEqual(input, original);
});

it('keeps newest-first order across the detailed-to-overflow boundary', () => {
  const flips = Array.from({ length: 12 }, (_, i) => makeFlip(`ASSET${i}`, 1000 + i, 100 - i));
  const input: TelegramLiveScanInput = { mode: 'flips', timeframe: '1w', marketClass: 'crypto', scannedAssets: 12, totalAssets: 12, errors: 0, signals: [], flips };
  const bot = new TelegramBotHandler({});
  const main = bot.buildLiveScanResponse(input).text;
  const overflow = bot.buildLiveScanFlipOverflow(input).join('\n');
  const symbols = (text: string) => [...text.matchAll(/\[\$(ASSET\d+)\]/g)].map(m => m[1]);
  assert.deepEqual(symbols(main), ['ASSET11', 'ASSET10', 'ASSET9', 'ASSET8', 'ASSET7', 'ASSET6', 'ASSET5', 'ASSET4', 'ASSET3', 'ASSET2']);
  assert.deepEqual(symbols(overflow), ['ASSET1', 'ASSET0']);
  assert.match(main, /cele mai noi flipuri primele/);
  assert.match(main, /Confirmat:.*Europe\/Oslo/);
  assert.match(overflow, /Confirmat:.*Europe\/Oslo/);
  assert.deepEqual(flips.map(f => f.symbol), Array.from({ length: 12 }, (_, i) => `ASSET${i}`));
});
