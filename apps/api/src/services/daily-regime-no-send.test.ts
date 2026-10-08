import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AppState } from './app-state.js';
import { createServer } from '../server.js';

function fixture() {
  const state = new AppState() as any;
  const documents = new Map<string, any>();
  const db: any = { batch: () => ({ set(ref: any, data: any) { documents.set(ref.path, data); return this; }, delete() {}, async commit() {} }) };
  const ref = (path: string): any => ({ path, id: path.split('/').at(-1), firestore: db,
    async set(data: any, options?: any) { documents.set(path, options?.merge ? { ...documents.get(path), ...data } : data); },
    collection(name: string) { return { doc: (id: string) => ref(path + '/' + name + '/' + id), listDocuments: async () => [] }; }
  });
  state.dailyRegimeDocument = () => ref('operations/test-daily');
  state.restoreDailyRegimeState = async () => {};
  state.marketData.getFlipUniverseCryptoAssets = async () => [{ symbol: 'TEST', name: 'Test', marketClass: 'crypto', rank: 1 }];
  state.scanFlipAsset = async (symbol: string, marketClass: string) => {
    const candidate = { symbol, marketClass, timeframe: '1d', status: 'APPROACHING', priorityScore: 75, distanceAtr: 1, candleTimestamp: 12345 };
    const confirmed = { ...candidate, timeframe: '1w', status: 'CONFIRMED', confirmedAt: 12345 };
    return { upcoming: [candidate], confirmedHistory: [confirmed], newlyConfirmed: [confirmed], coverage: { status: 'CONFIRMED', weeklyCandidate: false, weeklyConfirmed: true, candidateCount: 1, confirmedCount: 1 } };
  };
  let publishCalls = 0, sendWork = 0;
  const forbidden = () => { sendWork++; throw new Error('Unexpected delivery work'); };
  state.telegramDeliveryGuard = () => ({ acquireScan: async () => 'fixture-owner', releaseScan: async () => {}, claim: forbidden, suppress: forbidden, finish: forbidden });
  state.telegramBot.sendMarkdown = forbidden;
  state.publishConfirmedFlipEvents = async () => { publishCalls++; };
  return { state, documents, counts: () => ({ publishCalls, sendWork }) };
}

test('no-send produces identical candidates/history and a new persisted run with zero delivery work', async () => {
  const none = fixture(), telegram = fixture();
  const status = await none.state.runDailyRegimeScan({ timeframes: ['1d', '1w'], delivery: 'none' });
  await telegram.state.runDailyRegimeScan({ timeframes: ['1d', '1w'] });
  assert.deepEqual(none.state.flipCandidates, telegram.state.flipCandidates);
  assert.deepEqual(none.state.confirmedFlips, telegram.state.confirmedFlips);
  assert.equal(none.state.confirmedFlips.length > 0, true);
  assert.deepEqual(none.counts(), { publishCalls: 0, sendWork: 0 });
  assert.equal(telegram.counts().publishCalls, 1);
  assert.equal(status.deliveryMode, 'none');
  const main = none.documents.get('operations/test-daily');
  assert.equal(main.activeRunId, status.persistedRunId);
  const run = none.documents.get('operations/test-daily/runs/' + main.activeRunId);
  assert.equal(run.status.deliveryMode, 'none');
  assert.equal(run.counts.candidates, none.state.flipCandidates.length);
  const prior = main.activeRunId;
  await none.state.runDailyRegimeScan({ delivery: 'none' });
  assert.notEqual(none.documents.get('operations/test-daily').activeRunId, prior);
  assert.deepEqual(none.counts(), { publishCalls: 0, sendWork: 0 });
});

test('no-send cannot join a Telegram scan or mistake a shared lock for freshness', async () => {
  const { state } = fixture();
  state.dailyRegimeScanPromise = Promise.resolve({}); state.dailyRegimeScanDelivery = 'telegram';
  await assert.rejects(state.runDailyRegimeScan({ delivery: 'none' }), { code: 'SCAN_BUSY' });
  state.dailyRegimeScanPromise = undefined;
  state.telegramDeliveryGuard = () => ({ acquireScan: async () => undefined });
  await assert.rejects(state.runDailyRegimeScan({ delivery: 'none' }), { code: 'SCAN_BUSY' });
});

test('no-send persistence errors do not report success', async () => {
  const { state } = fixture();
  state.dailyRegimeDocument = () => { throw new Error('write unavailable'); };
  state.telegramDeliveryGuard = () => ({ acquireScan: async () => 'owner', releaseScan: async () => {} });
  await assert.rejects(state.runDailyRegimeScan({ delivery: 'none' }), /write unavailable/);
});

test('full server no-send route requires the token and ignores a requested Telegram mode; scheduler unchanged', async () => {
  const originalToken = process.env.DAILY_SCAN_TOKEN;
  process.env.DAILY_SCAN_TOKEN = 'fixture-secret';
  const singleton = AppState.getInstance() as any;
  const originalScan = singleton.runDailyRegimeScan;
  const calls: any[] = [];
  singleton.runDailyRegimeScan = async (options: any) => { calls.push(options); return { deliveryMode: options.delivery || 'telegram', running: false, persistedRunId: 'fixture-run' }; };
  const server = createServer().listen(0);
  await new Promise<void>(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as any).port}/api/alerts/daily-regime-scan`;
  try {
    for (const token of [undefined, 'wrong']) {
      const r = await fetch(url + '/no-send', { method: 'POST', headers: token ? { 'x-daily-scan-token': token } : {} });
      assert.equal(r.status, 401);
    }
    assert.equal(calls.length, 0);
    const r = await fetch(url + '/no-send', { method: 'POST', headers: { 'x-daily-scan-token': 'fixture-secret', 'content-type': 'application/json' }, body: JSON.stringify({ delivery: 'telegram' }) });
    assert.equal(r.status, 200); assert.equal((await r.json() as any).deliveryMode, 'none');
    assert.deepEqual(calls[0], { timeframes: ['1d', '1w'], delivery: 'none' });
    const scheduled = await fetch(url, { method: 'POST', headers: { 'x-daily-scan-token': 'fixture-secret' } });
    assert.equal(scheduled.status, 200); assert.deepEqual(calls[1], { timeframes: ['1d', '1w'] });
    singleton.runDailyRegimeScan = async () => { throw Object.assign(new Error('busy'), { code: 'SCAN_BUSY' }); };
    assert.equal((await fetch(url + '/no-send', { method: 'POST', headers: { 'x-daily-scan-token': 'fixture-secret' } })).status, 409);
  } finally {
    singleton.runDailyRegimeScan = originalScan;
    if (originalToken === undefined) delete process.env.DAILY_SCAN_TOKEN; else process.env.DAILY_SCAN_TOKEN = originalToken;
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
