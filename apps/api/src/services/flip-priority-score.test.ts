import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateFlipPriorityScore } from './flip-priority-score.js';

const base = {
  direction: 'BULLISH' as const,
  currentPrice: 100,
  triggerPrice: 100,
  atr: 2,
  moneyLineScore: 0,
  weeklyTier: 'Neutral',
  rvol: 1,
  sma50: 95,
  sma200: 90
};

describe('Flip priority score', () => {
  it('rewards a fresh, aligned, high-volume flip near the trigger', () => {
    const result = calculateFlipPriorityScore({
      ...base,
      moneyLineScore: 60,
      weeklyTier: 'Strong Bullish',
      rvol: 2.4
    });
    // distance 30 + ml 20 + weekly 20 + volume 15 + structure 10 = 95
    assert.equal(result.total, 95);
  });

  it('punishes an extended, low-volume, unaligned confirmed flip', () => {
    const result = calculateFlipPriorityScore({
      ...base,
      currentPrice: 105, // 2.5 ATR above the trigger
      moneyLineScore: -40,
      weeklyTier: 'Neutral',
      rvol: 0.5
    });
    // distance 30*(1-2.5/3)=5, ml 0.3*25=7.5, weekly 0, volume 0, structure 10
    assert.equal(result.total, 22.5);
  });

  it('differentiates candidates by proximity to the trigger', () => {
    const near = calculateFlipPriorityScore({ ...base, currentPrice: 99.6 }); // 0.2 ATR
    const far = calculateFlipPriorityScore({ ...base, currentPrice: 96 }); // 2 ATR
    assert.ok(near.distanceScore > far.distanceScore);
    assert.ok(near.total > far.total);
  });

  it('gives partial weekly credit for a regular aligned tier and mirrors for bearish flips', () => {
    const regularBull = calculateFlipPriorityScore({ ...base, weeklyTier: 'Bullish' });
    assert.equal(regularBull.weeklyScore, 14);
    const strongBear = calculateFlipPriorityScore({
      ...base,
      direction: 'BEARISH',
      sma50: 105,
      sma200: 110,
      weeklyTier: 'Strong Bearish'
    });
    assert.equal(strongBear.weeklyScore, 20);
    assert.equal(strongBear.structureScore, 10);
  });

  it('keeps the total inside 0-100 even for extreme inputs', () => {
    const maxed = calculateFlipPriorityScore({
      ...base, moneyLineScore: 500, rvol: 99, weeklyTier: 'Strong Bullish'
    });
    assert.equal(maxed.total, 100);
    const floored = calculateFlipPriorityScore({
      ...base, currentPrice: 200, moneyLineScore: -500, rvol: 0, sma50: 300, sma200: 400
    });
    assert.equal(floored.total, 0);
  });

  it('treats a missing ATR as fully extended instead of crashing', () => {
    const result = calculateFlipPriorityScore({ ...base, atr: 0 });
    assert.equal(result.distanceScore, 0);
    assert.ok(result.total >= 0 && result.total <= 100);
  });
});
