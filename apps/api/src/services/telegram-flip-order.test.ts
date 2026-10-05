import { it } from 'node:test';
import assert from 'node:assert/strict';
import { AppState } from './app-state.js';

it('sends confirmed scan alert batches newest-first with visible Oslo confirmation time, not setup-score order', async () => {
  const state = new AppState();
  const sent: string[] = [];
  (state as any).telegramDeliveryGuard = () => ({ claim: async (_chatId: number, keys: string[]) => ({owner: 'test', keys}), finish: async () => {}, suppress: async () => {} });
  (state as any).getTelegramFlipAlertDestinations = async () => [{chatId: 123}];
  (state as any).getTelegramFlipAlertPreferences = async () => ({enabled: true, timeframes: ['1d']});
  state.telegramBot.sendMarkdown = async (text: string) => { sent.push(text); return true; };
  const base = { marketClass: 'crypto', timeframe: '1d', direction: 'BULLISH', candleTimestamp: Date.UTC(2026,9,1), currentPrice: 10, confirmationPrice: 9, weeklyTier: 'Bullish', weeklyScore: 60, rvol: 2, sma50Aligned: true, sma200Aligned: true, moneyLineTier: 'Bullish', scannedAt: Date.UTC(2026,9,4) };
  const candidates = [{...base, symbol: 'OLD', priorityScore: 99, confirmedAt: Date.UTC(2026,9,2,12,15)}, {...base, symbol: 'NEW', priorityScore: 1, confirmedAt: Date.UTC(2026,9,3,12,30)}];
  const count = await (state as any).publishConfirmedFlipEvents(candidates, 'scheduled/full scan', Date.UTC(2026,9,4));
  assert.equal(count, 2); assert.equal(sent.length, 1);
  assert.ok(sent[0].indexOf('[$NEW]') < sent[0].indexOf('[$OLD]'));
  assert.match(sent[0], /cele mai noi flipuri primele/);
  assert.doesNotMatch(sent[0], /ordonate după scorul setupului/);
  assert.match(sent[0], /03\.10\.2026.*14:30.*Europe\/Oslo/);
  assert.match(sent[0], /02\.10\.2026.*14:15.*Europe\/Oslo/);
  assert.deepEqual(candidates.map(c => c.symbol), ['OLD', 'NEW']);
});

it('48h eligibility uses original confirmation, suppresses historical/invalid keys per destination', async () => {
  const state = new AppState(); const now = Date.UTC(2026,9,5,5); const sent: string[] = [];
  const suppressed: Array<{chat: string; keys: string[]; reason: string}> = [];
  (state as any).telegramDeliveryGuard = () => ({suppress: async (chat: string, keys: string[], reason: string) => suppressed.push({chat,keys,reason}), claim: async (_chat: string, keys: string[]) => ({owner: 'test',keys}), finish: async () => {}});
  (state as any).getTelegramFlipAlertDestinations = async () => [{chatId:'a'},{chatId:'b'}];
  (state as any).getTelegramFlipAlertPreferences = async () => ({enabled:true,timeframes:['1w']});
  state.telegramBot.sendMarkdown = async (text: string) => {sent.push(text); return true;};
  const base = {marketClass:'crypto',timeframe:'1w',direction:'BEARISH',candleTimestamp:now-7*86400000,currentPrice:10,confirmationPrice:9,weeklyTier:'Strong Bullish',weeklyScore:70,rvol:2,sma50Aligned:true,sma200Aligned:true,moneyLineTier:'Strong Bullish',scannedAt:now,priorityScore:80};
  const rows = [{...base,symbol:'BOUNDARY',confirmedAt:now-48*3600000},{...base,symbol:'OLD',confirmedAt:now-49*3600000},{...base,symbol:'FUTURE',confirmedAt:now+1},{...base,symbol:'INVALID',confirmedAt:NaN}];
  await (state as any).publishConfirmedFlipEvents(rows,'scheduled/full scan',now);
  assert.equal(sent.length,2); for (const msg of sent) {assert.match(msg,/1 FLIP MONEYLINE/);assert.match(msg,/BOUNDARY/);assert.doesNotMatch(msg,/OLD|FUTURE|INVALID|ML1W Strong Bullish/);assert.match(msg,/Direcție la confirmare: BEARISH/);}
  for(const chat of ['a','b']) {assert.equal(suppressed.find(v=>v.chat===chat&&v.reason==='historical')?.keys.length,1);assert.equal(suppressed.find(v=>v.chat===chat&&v.reason==='invalid')?.keys.length,2);}
  const history = (state as any).alertHistory;
  assert.match(history.find((v:any)=>v.symbol==='OLD').message,/Istoric/);assert.equal(history.find((v:any)=>v.symbol==='BOUNDARY').tier,'Bearish');assert.doesNotMatch(history.find((v:any)=>v.symbol==='BOUNDARY').message,/FLIPURI/);
});
