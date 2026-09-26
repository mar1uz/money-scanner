import test from 'node:test';
import assert from 'node:assert/strict';
import { distanceFromLastClosedHigh } from './flip-distance-from-high.js';

test('missing last closed high returns null so the card can show a dash', () => {
  assert.equal(distanceFromLastClosedHigh(100, undefined), null);
  assert.equal(distanceFromLastClosedHigh(100, null), null);
});

test('positive distance from the last closed high is a signed percent', () => {
  const result = distanceFromLastClosedHigh(102.4, 100);
  assert.ok(result);
  assert.equal(result.label, '+2.40%');
  assert.equal(result.tone, 'emerald');
  assert.equal(result.percent, 2.4);
});

test('negative distance from the last closed high is a signed percent', () => {
  const result = distanceFromLastClosedHigh(93.9, 100);
  assert.ok(result);
  assert.equal(result.label, '-6.10%');
  assert.equal(result.tone, 'rose');
  assert.equal(result.percent, -6.1);
});

test('a zero high is rejected', () => {
  assert.equal(distanceFromLastClosedHigh(100, 0), null);
});

test('a non-finite high or price is rejected', () => {
  assert.equal(distanceFromLastClosedHigh(100, Number.NaN), null);
  assert.equal(distanceFromLastClosedHigh(100, Number.POSITIVE_INFINITY), null);
  assert.equal(distanceFromLastClosedHigh(Number.NaN, 100), null);
  assert.equal(distanceFromLastClosedHigh(Number.POSITIVE_INFINITY, 100), null);
});

test('a missing or non-positive price is rejected', () => {
  assert.equal(distanceFromLastClosedHigh(undefined, 100), null);
  assert.equal(distanceFromLastClosedHigh(0, 100), null);
  assert.equal(distanceFromLastClosedHigh(-1, 100), null);
});
