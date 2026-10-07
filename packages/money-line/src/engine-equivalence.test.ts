import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Candle } from '@money-scanner/shared';
import { MoneyLineEngine } from './engine.js';
import { calculateMoneyLineCloud } from './cloud-supertrend.js';

/**
 * `calculateLatest` no longer builds a signal object for every candle, and the
 * SMA windows use a running sum instead of a per-index slice-and-reduce. Both
 * are only legitimate if they produce exactly what the previous implementations
 * produced, so these tests compare against the full-series results rather than
 * against hardcoded numbers.
 */

/** Deterministic pseudo-random walk, so a failure is always reproducible. */
function series(length: number, seed = 1): Candle[] {
  let state = seed;
  const next = () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
  return Array.from({ length }, (_, index) => {
    const close = 100 + next() * 50 + index * 0.15;
    return {
      timestamp: 1_700_000_000_000 + index * 3_600_000,
      open: close,
      high: close + 1,
      low: close - 1,
      close: close + 0.4,
      volume: 1000 + index * 3,
      // The last candle is still forming, so the engine must ignore it.
      isClosed: index < length - 1
    };
  });
}

/** `calculationTimestamp` is wall-clock, not a derived value, so exclude it. */
function comparable(signal: unknown): string {
  const { calculationTimestamp: _ignored, ...rest } = signal as Record<string, unknown>;
  return JSON.stringify(rest);
}

describe('MoneyLineEngine.calculateLatest equivalence', () => {
  it('matches the last element of calculateSeries across sizes, seeds and short series', () => {
    const engine = new MoneyLineEngine();
    for (const length of [1, 2, 5, 50, 200, 300, 500, 1000, 1500]) {
      for (const seed of [1, 7, 99, 12345, 777, 31337]) {
        const candles = series(length, seed);
        const full = engine.calculateSeries('BTC', '1h', candles);
        const latest = engine.calculateLatest('BTC', '1h', candles);
        if (!full.length) {
          // Nothing was closed (a single still-forming candle), so both paths
          // must report "no signal" rather than invent one.
          assert.equal(latest, null, `length=${length} seed=${seed}`);
          continue;
        }
        assert.equal(
          comparable(full[full.length - 1]),
          comparable(latest),
          `length=${length} seed=${seed}`
        );
      }
    }
  });

  it('calculateSignalsAt reproduces every element it is asked for', () => {
    const engine = new MoneyLineEngine();
    for (const length of [1, 2, 50, 300, 500]) {
      for (const seed of [1, 99, 31337]) {
        const candles = series(length, seed);
        const full = engine.calculateSeries('BTC', '1h', candles);
        const at = engine.calculateSignalsAt('BTC', '1h', candles, full.map((_, index) => index));
        full.forEach((signal, index) => {
          assert.equal(comparable(signal), comparable(at.get(index)), `index=${index} length=${length} seed=${seed}`);
        });
      }
    }
  });

  it('returns null when no candle is closed', () => {
    const engine = new MoneyLineEngine();
    const open: Candle[] = [{ ...series(1)[0], isClosed: false }];
    assert.equal(engine.calculateLatest('BTC', '1h', open), null);
    assert.equal(engine.calculateLatest('BTC', '1h', []), null);
    assert.equal(engine.calculateSignalsAt('BTC', '1h', open, [0]).size, 0);
  });

  it('ignores a forming trailing candle, as the full series does', () => {
    const engine = new MoneyLineEngine();
    const closed = series(200, 5).map(candle => ({ ...candle, isClosed: true }));
    const withForming = [...closed, { ...closed[closed.length - 1], timestamp: closed[closed.length - 1].timestamp + 3_600_000, isClosed: false }];
    assert.equal(
      comparable(engine.calculateLatest('BTC', '1h', closed)),
      comparable(engine.calculateLatest('BTC', '1h', withForming))
    );
  });
});

describe('MoneyLineCloud rolling SMA equivalence', () => {
  /** The pre-optimisation formula, kept here as the reference. */
  const referenceSma = (candles: Candle[], period: number) => candles.map((_candle, index) => {
    const start = Math.max(0, index - period + 1);
    const values = candles.slice(start, index + 1);
    return values.reduce((sum, value) => sum + value.close, 0) / values.length;
  });

  it('matches the slice-and-reduce window for periods 50 and 200', () => {
    for (const length of [1, 10, 49, 50, 51, 199, 200, 201, 300, 500, 1000]) {
      for (const seed of [1, 7, 99, 12345]) {
        const candles = series(length, seed);
        const cloud = calculateMoneyLineCloud(candles, '1h');
        const expected50 = referenceSma(candles, 50);
        const expected200 = referenceSma(candles, 200);
        for (let index = 0; index < length; index++) {
          // Floating-point summation order only; the window is the same set of real closes.
          assert.ok(Math.abs(cloud.sma50[index] - expected50[index]) < 1e-6, `sma50 length=${length} seed=${seed} index=${index}`);
          assert.ok(Math.abs(cloud.sma200[index] - expected200[index]) < 1e-6, `sma200 length=${length} seed=${seed} index=${index}`);
        }
      }
    }
  });

  it('uses the short window before the period is filled', () => {
    const candles = series(5, 3);
    const cloud = calculateMoneyLineCloud(candles, '1h');
    const closes = candles.map(candle => candle.close);
    // Index 0 averages a single close, index 1 the mean of two, and so on.
    for (let index = 0; index < 5; index++) {
      const expected = closes.slice(0, index + 1).reduce((sum, value) => sum + value, 0) / (index + 1);
      assert.ok(Math.abs(cloud.sma50[index] - expected) < 1e-9);
      assert.ok(Math.abs(cloud.sma200[index] - expected) < 1e-9);
    }
  });
});
