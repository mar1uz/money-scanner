import test from 'node:test';
import assert from 'node:assert/strict';
import type { RadarRow } from '@money-scanner/shared';
import { sortRadarRows, type RadarSortKey } from './crypto-radar-sort.js';

const row = (rank: number, overrides: Partial<RadarRow> = {}): RadarRow => ({
  id: `base:${rank}`, rank, rankChange: null, chain: 'base', address: String(rank), symbol: `T${rank}`,
  name: `Token ${rank}`, price: rank, firstPrice: rank, firstReportedAt: 1, previousPrice: rank,
  changeFirst: rank, changePrevious: rank, marketCap: rank * 1_000_000, marketCapSource: 'test',
  liquidity: rank * 100, volume24h: rank * 1_000, volume1h: rank, buys24h: rank, sells24h: rank,
  buyers24h: rank, priceChange24h: rank, pool: String(rank), url: 'https://example.com', observedAt: 1,
  coinGeckoId: null, telegram: null, score: rank, marketScore: rank, reasons: [],
  social: { mentions: rank, authors: 0, channels: 0, platforms: 0, editorialMentions: 0,
    weakMentions: 0, score: rank, changeMentions: null, searchTrending: false, examples: [] },
  ...overrides,
});

test('every visible Radar column supports ascending and descending sorting', () => {
  const rows = [row(2), row(1), row(3)];
  const keys: RadarSortKey[] = ['rank', 'name', 'price', 'priceChange24h', 'firstPrice', 'changeFirst',
    'changePrevious', 'marketCap', 'volume24h', 'liquidity', 'score'];
  for (const key of keys) {
    assert.deepEqual(sortRadarRows(rows, key, 'asc').map(item => item.rank), [1, 2, 3], key);
    assert.deepEqual(sortRadarRows(rows, key, 'desc').map(item => item.rank), [3, 2, 1], key);
  }
  assert.deepEqual(rows.map(item => item.rank), [2, 1, 3], 'sorting must not mutate the report');
});

test('missing values remain at the end in either direction and ties retain report rank', () => {
  const rows = [row(3, { priceChange24h: null }), row(2, { priceChange24h: 5 }), row(1, { priceChange24h: 5 })];
  assert.deepEqual(sortRadarRows(rows, 'priceChange24h', 'asc').map(item => item.rank), [1, 2, 3]);
  assert.deepEqual(sortRadarRows(rows, 'priceChange24h', 'desc').map(item => item.rank), [1, 2, 3]);
});

test('supports sorting by top10HoldersPct and estimatedFees24h with null handling', () => {
  const rows = [
    row(1, { top10HoldersPct: 60, estimatedFees24h: 1000 }),
    row(2, { top10HoldersPct: 20, estimatedFees24h: 5000 }),
    row(3, { top10HoldersPct: null, estimatedFees24h: null })
  ];
  assert.deepEqual(sortRadarRows(rows, 'top10HoldersPct', 'asc').map(item => item.rank), [2, 1, 3]);
  assert.deepEqual(sortRadarRows(rows, 'top10HoldersPct', 'desc').map(item => item.rank), [1, 2, 3]);
  assert.deepEqual(sortRadarRows(rows, 'estimatedFees24h', 'asc').map(item => item.rank), [1, 2, 3]);
  assert.deepEqual(sortRadarRows(rows, 'estimatedFees24h', 'desc').map(item => item.rank), [2, 1, 3]);
});
