import test from 'node:test';
import assert from 'node:assert/strict';
import type { RadarSortKey } from './crypto-radar-sort.js';

interface RadarHeaderDef {
  key: RadarSortKey;
  label: string;
  width: number;
}

const mainHeaders: RadarHeaderDef[] = [
  { key: 'rank', label: 'Loc', width: 60 },
  { key: 'name', label: 'Monedă / rețea', width: 200 },
  { key: 'price', label: 'Preț USD', width: 100 },
  { key: 'priceChange24h', label: 'Δ 24H', width: 90 },
  { key: 'firstPrice', label: 'Primul raport', width: 110 },
  { key: 'changeFirst', label: 'Δ inițial', width: 90 },
  { key: 'changePrevious', label: 'Δ precedent', width: 105 },
  { key: 'marketCap', label: 'Market cap', width: 105 },
  { key: 'volume24h', label: 'Volum 24h', width: 105 },
  { key: 'liquidity', label: 'Lichiditate', width: 105 },
  { key: 'top10HoldersPct', label: 'Securitate / Hold.', width: 135 },
  { key: 'score', label: 'Scor / social', width: 125 }
];

const microHeaders: RadarHeaderDef[] = [
  { key: 'rank', label: 'Loc', width: 60 },
  { key: 'name', label: 'Monedă / rețea', width: 200 },
  { key: 'price', label: 'Preț USD', width: 100 },
  { key: 'priceChange24h', label: 'Δ 24H', width: 90 },
  { key: 'marketCap', label: 'Market cap', width: 105 },
  { key: 'volume24h', label: 'Volum 24h', width: 105 },
  { key: 'estimatedFees24h', label: 'Comisioane 24h', width: 120 },
  { key: 'liquidity', label: 'Lichiditate', width: 105 },
  { key: 'top10HoldersPct', label: 'Securitate / Hold.', width: 135 },
  { key: 'score', label: 'Scor / utilitate', width: 145 }
];

test('mainHeaders and microHeaders define valid unique keys and positive widths', () => {
  const mainKeys = new Set(mainHeaders.map(h => h.key));
  assert.equal(mainKeys.size, mainHeaders.length, 'mainHeaders must have unique keys');
  assert.equal(mainHeaders.length, 12, 'mainHeaders must have exactly 12 columns');

  for (const h of mainHeaders) {
    assert.ok(h.width >= 50, `Header ${h.key} width must be at least 50px`);
    assert.ok(h.label.trim().length > 0, `Header ${h.key} must have non-empty label`);
  }

  const microKeys = new Set(microHeaders.map(h => h.key));
  assert.equal(microKeys.size, microHeaders.length, 'microHeaders must have unique keys');
  assert.equal(microHeaders.length, 10, 'microHeaders must have exactly 10 columns');

  for (const h of microHeaders) {
    assert.ok(h.width >= 50, `Header ${h.key} width must be at least 50px`);
    assert.ok(h.label.trim().length > 0, `Header ${h.key} must have non-empty label`);
  }
});

test('calculated minWidths provide sufficient space without horizontal clipping', () => {
  const mainMinWidth = mainHeaders.reduce((sum, h) => sum + h.width, 0);
  const microMinWidth = microHeaders.reduce((sum, h) => sum + h.width, 0);

  assert.equal(mainMinWidth, 1330, 'Main table minWidth must be exactly 1330px');
  assert.equal(microMinWidth, 1165, 'Microcaps table minWidth must be exactly 1165px');

  // Both should be larger than standard mobile viewport (390px) to trigger clean horizontal scrolling
  assert.ok(mainMinWidth > 1000);
  assert.ok(microMinWidth > 1000);
});

test('microHeaders includes estimatedFees24h for utility and buyback tracking', () => {
  const feesHeader = microHeaders.find(h => h.key === 'estimatedFees24h');
  assert.ok(feesHeader, 'Microcaps table must include estimatedFees24h column');
  assert.equal(feesHeader.label, 'Comisioane 24h');
  assert.ok(feesHeader.width >= 100);
});
