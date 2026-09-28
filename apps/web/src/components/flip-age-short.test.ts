import test from 'node:test';
import assert from 'node:assert/strict';
import { formatFlipAgeShort } from './flip-age.js';

const now = Date.UTC(2026, 8, 28, 8, 0, 0);

test('short flip age stays compact and never invents a time', () => {
  assert.equal(formatFlipAgeShort(undefined, now), 'Confirmat recent');
  assert.equal(formatFlipAgeShort(now - 20_000, now), 'Chiar acum');
  assert.equal(formatFlipAgeShort(now - 5 * 60_000, now), 'acum 5 minute');
  assert.equal(formatFlipAgeShort(now - 3 * 3_600_000, now), 'acum 3h');
  assert.equal(formatFlipAgeShort(now - (14 * 86_400_000 + 6 * 3_600_000), now), 'acum 14z 6h');
  assert.equal(formatFlipAgeShort(now - 2 * 86_400_000, now), 'acum 2z');
});
