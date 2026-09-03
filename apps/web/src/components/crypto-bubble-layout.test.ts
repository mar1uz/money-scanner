import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGrowthBubbleLayout, rankCryptoBubbles } from './crypto-bubble-layout.js';
import type { CryptoBubbleAsset } from '../services/api.js';

const coin = (id: string, change: number | null, marketCap = 1): CryptoBubbleAsset => ({
  id, symbol: id.toUpperCase(), name: id, change, marketCap, price: 1, image: '', rank: 1
});

test('ranks by signed daily gain before taking 100; missing/invalid data comes last', () => {
  const coins = Array.from({ length: 150 }, (_, i) => coin(String(i), i - 20));
  const original = [...coins];
  const ranked = rankCryptoBubbles(coins);
  assert.equal(ranked.length, 100);
  assert.equal(ranked[0].change, 129);
  assert.equal(ranked[99].change, 30);
  assert.deepEqual(coins, original);
  assert.deepEqual(rankCryptoBubbles([coin('missing', null), coin('loss', -25), coin('flat', 0), coin('bad', NaN), coin('gain', 10), coin('invalid', Infinity)]).map(c => c.id),
    ['gain', 'flat', 'loss', 'bad', 'invalid', 'missing']);
});

for (const width of [280, 390, 768, 1280]) {
  test(`all 100 bubbles fit without overlaps at ${width}px, with gain-ordered sizes`, () => {
    const coins = Array.from({ length: 100 }, (_, i) => coin(String(i), i === 99 ? null : 60 - i, i * 1e12));
    const { placements, height } = createGrowthBubbleLayout(coins, width);
    assert.equal(placements.length, 100);
    placements.forEach((bubble, index) => {
      assert.ok(bubble.x - bubble.size / 2 >= 0);
      assert.ok(bubble.x + bubble.size / 2 <= width);
      assert.ok(bubble.y - bubble.size / 2 >= 0);
      assert.ok(bubble.y + bubble.size / 2 <= height);
      if (index) assert.ok(placements[index - 1].size >= bubble.size);
      for (const other of placements.slice(index + 1)) {
        assert.ok(Math.hypot(bubble.x - other.x, bubble.y - other.y) >= (bubble.size + other.size) / 2);
      }
    });
    assert.ok(placements[0].size > placements[1].size);
    assert.ok(placements[59].size > placements[60].size);
    assert.equal(placements[60].size, placements[99].size);
    const changedCaps = createGrowthBubbleLayout(coins.map(c => ({ ...c, marketCap: 1 })), width);
    assert.deepEqual(changedCaps.placements.map(p => p.size), placements.map(p => p.size));
  });
}

test('empty, equal gains, large outliers and all-negative markets remain complete', () => {
  assert.equal(createGrowthBubbleLayout([], 390).placements.length, 0);
  for (const changes of [Array(100).fill(20), Array(100).fill(-10), [10000, ...Array(99).fill(0.1)]]) {
    const { placements } = createGrowthBubbleLayout(changes.map((change, i) => coin(String(i), change)), 390);
    assert.equal(placements.length, 100);
    assert.ok(placements.every(p => Number.isFinite(p.size) && p.size >= 60));
  }
});
