import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AppState } from './app-state.js';

const item = (age: number) => ({ symbol: 'GP', marketClass: 'crypto', timeframe: '1d', status: 'CONFIRMED', currentPrice: .45, scannedAt: Date.now() - age });
describe('Alerts dashboard bounded reads', () => {
  it('does not make per-confirmed-asset quote calls and marks restored prices stale', async () => {
    const state = new AppState() as any;
    state.restoreDailyRegimeState = async () => { state.confirmedFlips = [item(600_000), item(20_000)]; };
    state.getDailySmaReclaimReport = async () => null;
    state.marketData.getPriceQuote = async () => { throw new Error('dashboard must not refresh quotes'); };
    state.telegramBot.getDeliveryConfiguration = () => ({});
    const result = await state.getAlertsDashboard('test-user');
    assert.equal(result.confirmedFlips.length, 2);
    assert.equal(result.confirmedFlips[0].priceIsStale, true);
    assert.equal(result.confirmedFlips[1].priceIsStale, false);
    assert.equal(result.confirmedFlips[0].currentPrice, .45);
    assert.equal(state.confirmedFlips[0].priceIsStale, undefined);
  });
  it('bounds stuck auxiliary reads rather than waiting indefinitely', async () => {
    const state = new AppState() as any;
    state.restoreDailyRegimeState = async () => {};
    state.getDailySmaReclaimReport = () => new Promise(() => {});
    state.telegramBot.getDeliveryConfiguration = () => ({});
    const started = Date.now();
    const result = await state.getAlertsDashboard('test-user');
    assert.equal(result.dailySmaReclaim, null);
    assert.ok(Date.now() - started < 6_000);
  });
  it('bounds a stuck Firestore restore before reading stored state', async () => {
    const state = new AppState() as any;
    state.restoreDailyRegimeState = () => new Promise(() => {});
    state.getDailySmaReclaimReport = async () => null;
    state.telegramBot.getDeliveryConfiguration = () => ({});
    const started = Date.now();
    const result = await state.getAlertsDashboard('test-user');
    assert.ok(Date.now() - started < 10_000);
    assert.deepEqual(result.confirmedFlips, []);
  });
});
