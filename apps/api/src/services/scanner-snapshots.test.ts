import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AssetScannerRow } from '@money-scanner/shared';
import { ScannerSnapshots } from './scanner-snapshots.js';
import { AppState } from './app-state.js';

const row = (symbol: string) => ({ symbol, lastUpdated: 123 }) as AssetScannerRow;

test('minute refresh computes again while dashboard readers reuse its latest result', async () => {
  let now = 0;
  let scans = 0;
  const cache = new ScannerSnapshots(() => now);
  const scan = async () => [row(String(++scans))];
  await cache.refresh('1w:ALL', scan);
  now = 10_000;
  assert.equal((await cache.read('1w:ALL', scan))[0].symbol, '1');
  assert.equal((await cache.refresh('1w:ALL', scan))[0].symbol, '2');
  assert.equal((await cache.read('1w:ALL', scan))[0].symbol, '2');
  assert.equal(scans, 2);
  now = 70_000;
  assert.equal((await cache.read('1w:ALL', scan))[0].symbol, '3');
});

test('concurrent scheduler, scanner and sector requests share one computation', async () => {
  const cache = new ScannerSnapshots();
  let scans = 0;
  let finish!: (rows: AssetScannerRow[]) => void;
  const scan = () => { scans++; return new Promise<AssetScannerRow[]>(resolve => { finish = resolve; }); };
  const pending = [cache.refresh('1w:ALL', scan), cache.read('1w:ALL', scan), cache.read('1w:ALL', scan)];
  await Promise.resolve();
  assert.equal(scans, 1);
  finish([row('BTC'), row('ETH')]);
  const results = await Promise.all(pending);
  results[0].reverse();
  assert.deepEqual(results[1].map(r => r.symbol), ['BTC', 'ETH']);
  assert.deepEqual((await cache.read('1w:ALL', scan)).map(r => r.symbol), ['BTC', 'ETH']);
  assert.equal(results[1][0].lastUpdated, 123);
});

test('scope isolation and bounded storage prevent unrelated results being reused', async () => {
  const cache = new ScannerSnapshots(Date.now, 2);
  const scan = async () => [row('new')];
  await cache.refresh('1w:crypto', async () => [row('BTC')]);
  await cache.refresh('1d:stocks', async () => [row('AAPL')]);
  assert.equal((await cache.read('1w:crypto', scan))[0].symbol, 'BTC');
  await cache.refresh('1d:metals', async () => [row('GOLD')]);
  assert.equal((await cache.read('1w:crypto', scan))[0].symbol, 'new');
});

test('failed or empty scans allow a subsequent retry instead of poisoning the cache', async () => {
  const cache = new ScannerSnapshots();
  await assert.rejects(cache.read('1w:ALL', async () => { throw new Error('provider unavailable'); }));
  assert.deepEqual(await cache.read('1w:ALL', async () => []), []);
  assert.equal((await cache.read('1w:ALL', async () => [row('BTC')]))[0].symbol, 'BTC');
});

test('fresh previous snapshot remains readable while the scheduled refresh runs', async () => {
  const cache = new ScannerSnapshots();
  await cache.refresh('1w:ALL', async () => [row('previous')]);
  let finish!: (rows: AssetScannerRow[]) => void;
  const pending = cache.refresh('1w:ALL', () => new Promise(resolve => { finish = resolve; }));
  await Promise.resolve();
  assert.equal((await cache.read('1w:ALL', async () => { throw new Error('duplicate'); }))[0].symbol, 'previous');
  finish([row('latest')]);
  await pending;
  assert.equal((await cache.read('1w:ALL', async () => []))[0].symbol, 'latest');
});

test('AppState connects the minute scan, scanner page and sector summaries to the same result', async () => {
  let scans = 0;
  // Avoid provider connections and alert delivery: exercise the production
  // orchestration with a deterministic computation instead of its constructor.
  const state: AppState = Object.assign(Object.create(AppState.prototype), {
    scannerSnapshots: new ScannerSnapshots(),
    computeScannerRows: async () => {
      scans++;
      return [{ ...row('BTC'), name: 'Bitcoin', narratives: ['crypto_l1'], tier: 'Bullish', moneyLineScore: 25, change24h: 1, price: 100 }];
    }
  });
  await state.refreshSignals('1w', 'ALL');
  const [rows, summaries] = await Promise.all([
    state.getScannerRows('1w', 'ALL'), state.getNarrativeSummaries('1w', 'ALL')
  ]);
  assert.equal(scans, 1);
  assert.equal(rows[0].symbol, 'BTC');
  assert.ok(summaries.length > 0);
  await state.refreshSignals('1w', 'ALL');
  assert.equal(scans, 2, 'next scheduler invocation still performs a new scan');
  await state.getScannerRows('1d', 'crypto');
  assert.equal(scans, 3, 'a different page scope needs its own scan');
});
