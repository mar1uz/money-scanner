import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Candle } from '@money-scanner/shared';
import { calculateEMA } from './indicators/ema.js';
import { calculateRSI } from './indicators/rsi.js';
import { MoneyLineEngine } from './engine.js';
import { calculateMTFConfluence } from './multi-timeframe.js';

describe('Money Line Indicator Engine', () => {
  it('calculates EMA correctly for a simple sequence', () => {
    const prices = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
    const ema5 = calculateEMA(prices, 5);
    
    // First 4 should be NaN
    assert.ok(isNaN(ema5[0]));
    assert.ok(isNaN(ema5[3]));
    // 5th element (index 4) should equal initial SMA: (10+11+12+13+14)/5 = 12
    assert.equal(ema5[4], 12);
    // Multiplier for period 5 is 2 / (5 + 1) = 1/3
    // Next EMA at index 5 (price 15): (15 - 12) * (1/3) + 12 = 1 + 12 = 13
    assert.equal(Number(ema5[5].toFixed(4)), 13);
  });

  it('calculates RSI correctly and detects overbought/oversold boundaries', () => {
    // 25 steadily increasing prices
    const upPrices = Array.from({ length: 25 }, (_, i) => 100 + i * 2);
    const rsiUp = calculateRSI(upPrices, 14);
    const latestRsiUp = rsiUp[rsiUp.length - 1];
    assert.ok(latestRsiUp >= 95, `RSI for continuous uptrend should be > 95, got ${latestRsiUp}`);

    // 25 steadily decreasing prices
    const downPrices = Array.from({ length: 25 }, (_, i) => 200 - i * 2);
    const rsiDown = calculateRSI(downPrices, 14);
    const latestRsiDown = rsiDown[rsiDown.length - 1];
    assert.ok(latestRsiDown <= 5, `RSI for continuous downtrend should be < 5, got ${latestRsiDown}`);
  });

  it('classifies a strong upward trending asset as Bullish or Strong Bullish', () => {
    const engine = new MoneyLineEngine();
    const candles: Candle[] = [];
    const baseTime = Date.now() - 300 * 3600 * 1000;

    let price = 50000;
    for (let i = 0; i < 250; i++) {
      price = price * 1.004; // steady upward growth
      candles.push({
        timestamp: baseTime + i * 3600 * 1000,
        open: price * 0.998,
        high: price * 1.006,
        low: price * 0.995,
        close: price,
        volume: 1000 + Math.sin(i) * 200,
        isClosed: true
      });
    }

    const latest = engine.calculateLatest('BTC', '1h', candles);
    assert.ok(latest !== null);
    assert.ok(latest.score >= 40, `Expected score >= 40 for strong uptrend, got ${latest.score}`);
    assert.ok(latest.tier === 'Strong Bullish' || latest.tier === 'Bullish');
  });

  it('classifies a strong downward trending asset as Bearish or Strong Bearish', () => {
    const engine = new MoneyLineEngine();
    const candles: Candle[] = [];
    const baseTime = Date.now() - 300 * 3600 * 1000;

    let price = 70000;
    for (let i = 0; i < 250; i++) {
      price = price * 0.996; // steady decline
      candles.push({
        timestamp: baseTime + i * 3600 * 1000,
        open: price * 1.002,
        high: price * 1.005,
        low: price * 0.994,
        close: price,
        volume: 1200 + Math.cos(i) * 300,
        isClosed: true
      });
    }

    const latest = engine.calculateLatest('BTC', '1h', candles);
    assert.ok(latest !== null);
    assert.ok(latest.score <= -40, `Expected score <= -40 for strong downtrend, got ${latest.score}`);
    assert.ok(latest.tier === 'Strong Bearish' || latest.tier === 'Bearish');
  });

  it('guarantees non-repainting: appending a new candle never alters historical signals', () => {
    const engine = new MoneyLineEngine();
    const candles: Candle[] = [];
    const baseTime = Date.now() - 300 * 3600 * 1000;

    let price = 60000;
    for (let i = 0; i < 100; i++) {
      price += (Math.sin(i) * 500);
      candles.push({
        timestamp: baseTime + i * 3600 * 1000,
        open: price - 100,
        high: price + 200,
        low: price - 200,
        close: price,
        volume: 500 + i * 5,
        isClosed: true
      });
    }

    const initialSignals = engine.calculateSeries('ETH', '1h', candles);

    // Append 5 new closed candles
    for (let i = 100; i < 105; i++) {
      price += 300;
      candles.push({
        timestamp: baseTime + i * 3600 * 1000,
        open: price - 50,
        high: price + 150,
        low: price - 100,
        close: price,
        volume: 800,
        isClosed: true
      });
    }

    const updatedSignals = engine.calculateSeries('ETH', '1h', candles);

    // Verify all 100 historical signals are bit-for-bit identical
    for (let i = 0; i < initialSignals.length; i++) {
      assert.equal(initialSignals[i].score, updatedSignals[i].score, `Score changed at index ${i}`);
      assert.equal(initialSignals[i].tier, updatedSignals[i].tier, `Tier changed at index ${i}`);
      assert.equal(initialSignals[i].rawIndicators.ema20, updatedSignals[i].rawIndicators.ema20);
    }
  });

  it('calculates multi-timeframe confluence with correct weighted score', () => {
    const engine = new MoneyLineEngine();
    const candles: Candle[] = [];
    let price = 3000;
    for (let i = 0; i < 100; i++) {
      price *= 1.002;
      candles.push({
        timestamp: Date.now() - (100 - i) * 3600 * 1000,
        open: price * 0.999,
        high: price * 1.004,
        low: price * 0.998,
        close: price,
        volume: 400,
        isClosed: true
      });
    }

    const signal1h = engine.calculateLatest('ETH', '1h', candles)!;
    const signal4h = engine.calculateLatest('ETH', '4h', candles)!;
    const signal1d = engine.calculateLatest('ETH', '1d', candles)!;

    const mtf = calculateMTFConfluence({
      '1h': signal1h,
      '4h': signal4h,
      '1d': signal1d
    });

    assert.ok(mtf.compositeMtfScore > 0);
    assert.ok(mtf.confluenceTier === 'Bullish' || mtf.confluenceTier === 'Strong Bullish');
  });
});
