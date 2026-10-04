import { it } from 'node:test';
import assert from 'node:assert/strict';
import { TelegramDeliveryGuard } from './telegram-delivery-guard.js';
import { AppState } from './app-state.js';

function fakeFirestore() {
  const values = new Map<string, any>();
  let queue = Promise.resolve();
  const doc = (path: string) => ({path});
  return {
    values, doc,
    runTransaction(fn: any) {
      const result = queue.then(async () => {
        const writes: Array<() => void> = [];
        const tx = {
          get: async (ref: any) => ({ exists: values.has(ref.path), data: () => values.get(ref.path) }),
          set: (ref: any, data: any) => writes.push(() => values.set(ref.path, data))
        };
        const value = await fn(tx); writes.forEach(write => write()); return value;
      });
      queue = result.then(() => {}, () => {}); return result;
    },
    batch() {
      const writes: Array<() => void> = [];
      return { update(ref: any, data: any) { writes.push(() => values.set(ref.path, {...values.get(ref.path), ...data})); }, async commit() { writes.forEach(write => write()); } };
    }
  };
}

it('two independent instances share one scan lock, with ownership-safe release', async () => {
  const db = fakeFirestore(); const a = new TelegramDeliveryGuard(db as any); const b = new TelegramDeliveryGuard(db as any);
  const results = await Promise.all([a.acquireScan(1000), b.acquireScan(1000)]);
  assert.equal(results.filter(Boolean).length, 1);
  await b.releaseScan('wrong-owner'); assert.equal(await b.acquireScan(1001), undefined);
  await a.releaseScan(results.find(Boolean)!); assert.ok(await b.acquireScan(1002));
});

it('overlapping instances deliver each flip once per destination despite empty/truncated alert history', async () => {
  const db = fakeFirestore(); const a = new TelegramDeliveryGuard(db as any); const b = new TelegramDeliveryGuard(db as any);
  const key = 'flip:crypto:BTC:1w:BULLISH:1000'; let sends = 0;
  const deliver = async (guard: TelegramDeliveryGuard) => {
    const claim = await guard.claim('123', [key]);
    if (claim.keys.length) { sends++; await guard.finish('123', claim.keys, claim.owner, true); }
  };
  await Promise.all([deliver(a), deliver(b)]); assert.equal(sends, 1);
  await deliver(new TelegramDeliveryGuard(db as any)); assert.equal(sends, 1);
  const otherChat = await b.claim('456', [key]); assert.equal(otherChat.keys.length, 1);
});

it('uncertain delivery is never automatically retried, legacy delivered keys are seeded without sending', async () => {
  const db = fakeFirestore(); const guard = new TelegramDeliveryGuard(db as any);
  const claim = await guard.claim('123', ['uncertain']); await guard.finish('123', claim.keys, claim.owner, false);
  assert.deepEqual((await guard.claim('123', ['uncertain'])).keys, []);
  assert.deepEqual((await guard.claim('123', ['legacy'], new Set(['legacy']))).keys, []);
  assert.deepEqual((await new TelegramDeliveryGuard(db as any).claim('123', ['legacy'])).keys, []);
});

it('durable store errors fail closed before any delivery claim', async () => {
  const guard = new TelegramDeliveryGuard({doc: () => ({}), runTransaction: async () => {throw new Error('store unavailable');}} as any);
  await assert.rejects(guard.claim('123', ['flip']), /store unavailable/);
  await assert.rejects(guard.acquireScan(), /store unavailable/);
});

it('two AppState instances invoke only one scan while overlapping', async () => {
  const db = fakeFirestore(); const a = new AppState(); const b = new AppState();
  let count = 0; let release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  for (const state of [a, b]) {
    (state as any).telegramDeliveryGuard = () => new TelegramDeliveryGuard(db as any);
    (state as any).restoreDailyRegimeState = async () => {};
    (state as any).executeDailyRegimeScan = async () => { count++; await wait; return {running: false}; };
  }
  const first = a.runDailyRegimeScan();
  await new Promise(resolve => setTimeout(resolve, 0));
  await b.runDailyRegimeScan(); assert.equal(count, 1);
  release(); await first;
});
