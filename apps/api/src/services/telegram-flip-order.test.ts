import { it } from 'node:test';
import assert from 'node:assert/strict';
import { AppState } from './app-state.js';

it('sends confirmed scan alert batches newest-first with visible Oslo confirmation time, not setup-score order', async () => {
  const state = new AppState();
  const sent: string[] = [];
  (state as any).getTelegramFlipAlertDestinations = async () => [{chatId: 123}];
  (state as any).getTelegramFlipAlertPreferences = async () => ({enabled: true, timeframes: ['1d']});
  state.telegramBot.sendMarkdown = async (text: string) => { sent.push(text); return true; };
  const base = { marketClass: 'crypto', timeframe: '1d', direction: 'BULLISH', candleTimestamp: Date.UTC(2026,9,1), currentPrice: 10, confirmationPrice: 9, weeklyTier: 'Bullish', weeklyScore: 60, rvol: 2, sma50Aligned: true, sma200Aligned: true, moneyLineTier: 'Bullish', scannedAt: Date.UTC(2026,9,4) };
  const candidates = [{...base, symbol: 'OLD', priorityScore: 99, confirmedAt: Date.UTC(2026,9,2,12,15)}, {...base, symbol: 'NEW', priorityScore: 1, confirmedAt: Date.UTC(2026,9,3,12,30)}];
  const count = await (state as any).publishConfirmedFlipEvents(candidates, 'scheduled/full scan');
  assert.equal(count, 2); assert.equal(sent.length, 1);
  assert.ok(sent[0].indexOf('[$NEW]') < sent[0].indexOf('[$OLD]'));
  assert.match(sent[0], /cele mai noi flipuri primele/);
  assert.doesNotMatch(sent[0], /ordonate după scorul setupului/);
  assert.match(sent[0], /03\.10\.2026.*14:30.*Europe\/Oslo/);
  assert.match(sent[0], /02\.10\.2026.*14:15.*Europe\/Oslo/);
  assert.deepEqual(candidates.map(c => c.symbol), ['OLD', 'NEW']);
});
