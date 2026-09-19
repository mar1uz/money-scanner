// Tests for the paper-trading core. Run: node --test scripts/paper-trade-logger.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeUpdates, deriveState, detectFlips, managePosition, parseLog,
  serializeRecords, summarize, COST_PER_SIDE
} from './paper-trade-logger.mjs';

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 0, 1);
const NOW = '2026-03-01T01:00:00.000Z';

const candle = (i, o, h, l, c) => ({ timestamp: T0 + i * DAY, open: o, high: h, low: l, close: c, volume: 1000, isClosed: true });
const sig = (tier, rvol = 3) => ({ tier, score: tier === 'Strong Bullish' ? 70 : 40, rawIndicators: { rvol, atr14: 5 } });
const atrSeries = (n, v = 5) => new Array(n).fill(v);

// Fixture: neutral for 5 bars, bullish flip at index 5, then price path.
function makeFixture({ rvol = 3, path = 'stop' } = {}) {
  const candles = [
    candle(0, 100, 101, 99, 100), candle(1, 100, 101, 99, 100),
    candle(2, 100, 101, 99, 100), candle(3, 100, 101, 99, 100),
    candle(4, 100, 101, 99, 100),
    candle(5, 100, 104, 99, 103) // flip bar
  ];
  const signals = [sig('Neutral'), sig('Neutral'), sig('Neutral'), sig('Neutral'), sig('Neutral'), sig('Bullish', rvol)];
  const entry = 103 * (1 + COST_PER_SIDE); // next open = 103 + costs
  const risk = 1.25 * 5; // 6.25
  if (path === 'stop') {
    candles.push(candle(6, 103, 104, entry - risk - 0.5, entry - risk)); // stop hit on entry bar
    signals.push(sig('Bullish'));
  } else if (path === 'tp1-runner-bear') {
    candles.push(candle(6, 103, entry + 2 * risk + 1, entry + risk, entry + 2 * risk)); // TP1 hits
    signals.push(sig('Strong Bullish'));
    candles.push(candle(7, entry + 2 * risk, entry + 2.4 * risk, entry + 1.5 * risk, entry + 2.2 * risk));
    signals.push(sig('Bearish')); // bear flip -> runner exit at close
  } else if (path === 'open') {
    candles.push(candle(6, 103, 104, 102, 103.5)); // nothing hits
    signals.push(sig('Bullish'));
  }
  return { candles, signals, atr14: atrSeries(candles.length), entry, risk };
}

test('detectFlips finds only confirmed bullish transitions', () => {
  const { candles, signals, atr14 } = makeFixture();
  const flips = detectFlips(candles, signals, atr14);
  assert.equal(flips.length, 1);
  assert.equal(flips[0].flipIndex, 5);
  assert.equal(flips[0].rvol, 3);
});

test('rvol below 2 produces no records', () => {
  const { candles, signals, atr14 } = makeFixture({ rvol: 1.9 });
  const recs = computeUpdates({ symbol: 'TEST', candles, signals, atr14, state: new Map(), now: NOW, minFlipTime: 0 });
  assert.equal(recs.length, 0);
});

test('planned -> entered -> stop-resolved lifecycle with correct R', () => {
  const { candles, signals, atr14, entry } = makeFixture({ path: 'stop' });
  const state = new Map();
  const recs = computeUpdates({ symbol: 'TEST', candles, signals, atr14, state, now: NOW, minFlipTime: 0 });
  assert.deepEqual(recs.map(r => r.type), ['planned', 'entered', 'resolved']);
  const entered = recs[1];
  assert.equal(entered.entry, Number(entry.toFixed(8)));
  assert.equal(entered.stop, Number((entry - 6.25).toFixed(8)));
  const resolved = recs[2];
  assert.equal(resolved.reason, 'stop');
  assert.ok(Math.abs(resolved.r - -1) < 1e-9, `expected -1R, got ${resolved.r}`);
});

test('TP1 scales out, stop moves to break-even, bear flip exits runner', () => {
  const { candles, signals, atr14, entry, risk } = makeFixture({ path: 'tp1-runner-bear' });
  const recs = computeUpdates({ symbol: 'TEST', candles, signals, atr14, state: new Map(), now: NOW, minFlipTime: 0 });
  const resolved = recs.find(r => r.type === 'resolved');
  assert.equal(resolved.reason, 'bear-flip');
  assert.equal(resolved.scaledOut, true);
  const expectedR = 1.0 + 0.5 * ((entry + 2.2 * risk - entry) / risk); // 1 + 1.1 = 2.1
  assert.ok(Math.abs(resolved.r - expectedR) < 1e-3, `expected ~${expectedR}R, got ${resolved.r}`);
});

test('idempotent: second run with same data appends nothing', () => {
  const { candles, signals, atr14 } = makeFixture({ path: 'stop' });
  const state = new Map();
  const first = computeUpdates({ symbol: 'TEST', candles, signals, atr14, state, now: NOW, minFlipTime: 0 });
  const state2 = deriveState(first);
  const second = computeUpdates({ symbol: 'TEST', candles, signals, atr14, state: state2, now: NOW, minFlipTime: 0 });
  assert.equal(second.length, 0);
});

test('no lookahead: pending entry waits for the next closed candle', () => {
  const { candles, signals, atr14 } = makeFixture({ path: 'stop' });
  // remove the entry candle -> flip is the last closed candle
  const recs = computeUpdates({
    symbol: 'TEST', candles: candles.slice(0, 6), signals: signals.slice(0, 6),
    atr14: atr14.slice(0, 6), state: new Map(), now: NOW, minFlipTime: 0
  });
  assert.deepEqual(recs.map(r => r.type), ['planned']);
  assert.equal(recs[0].expectedEntryDate, '2026-01-07');
});

test('managePosition does not resolve before 42 days (timeout boundary)', () => {
  const candles = [candle(0, 100, 101, 99, 100), candle(1, 100, 104, 99, 103)];
  const signals = [sig('Neutral'), sig('Bullish')];
  for (let i = 2; i < 20; i++) { candles.push(candle(i, 103, 104, 102, 103)); signals.push(sig('Bullish')); }
  const entry = { entry: 103, stop: 96.75, risk: 6.25 };
  const { outcome } = managePosition(entry, candles, signals, 1);
  assert.equal(outcome, null); // only 18 days of data after flip, still open
});

test('summary math: win rate, expectancy, PF, drawdown', () => {
  const mk = (symbol, flipTime, r) => ([
    { v: 1, type: 'planned', recordedAt: NOW, symbol, flipTime, flipDate: '2026-01-06', expectedEntryDate: '2026-01-07' },
    { v: 1, type: 'entered', recordedAt: NOW, symbol, flipTime, entryTime: flipTime + DAY, entry: 100, stop: 95, risk: 5 },
    { v: 1, type: 'resolved', recordedAt: NOW, symbol, flipTime, exitTime: flipTime + 2 * DAY, r, reason: 'stop', scaledOut: false, daysHeld: 2 }
  ]);
  const records = [...mk('AAA', T0, 2), ...mk('BBB', T0 + 10 * DAY, -1), ...mk('CCC', T0 + 20 * DAY, -1)];
  const s = summarize(records, []);
  assert.equal(s.resolvedCount, 3);
  assert.ok(Math.abs(s.winRate - 33.3) < 0.05);
  assert.equal(s.expectancyR, 0);
  assert.equal(s.profitFactor, 1);
  assert.equal(s.maxDrawdownR, 2); // +2 peak -> 0 after two losses
  assert.equal(s.open.length, 0);
});

test('JSONL round-trip', () => {
  const { candles, signals, atr14 } = makeFixture({ path: 'stop' });
  const recs = computeUpdates({ symbol: 'TEST', candles, signals, atr14, state: new Map(), now: NOW, minFlipTime: 0 });
  const parsed = parseLog(serializeRecords(recs));
  assert.deepEqual(parsed, recs);
});

test('forward-only cutoff: historical flips are never logged', () => {
  const { candles, signals, atr14 } = makeFixture({ path: 'stop' }); // flips in Jan 2026
  const recs = computeUpdates({
    symbol: 'TEST', candles, signals, atr14, state: new Map(), now: NOW
    // default minFlipTime = 2026-09-19
  });
  assert.equal(recs.length, 0);
});
