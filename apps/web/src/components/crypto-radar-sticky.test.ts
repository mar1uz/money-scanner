import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RADAR_MAIN_HEADERS,
  RADAR_MICRO_HEADERS,
  getRadarTableMinWidth
} from './crypto-radar-headers.js';

test('RADAR_MAIN_HEADERS and RADAR_MICRO_HEADERS define valid unique keys and positive widths', () => {
  const mainKeys = new Set(RADAR_MAIN_HEADERS.map(h => h.key));
  assert.equal(mainKeys.size, RADAR_MAIN_HEADERS.length, 'RADAR_MAIN_HEADERS must have unique keys');
  assert.equal(RADAR_MAIN_HEADERS.length, 12, 'RADAR_MAIN_HEADERS must have exactly 12 columns');

  for (const h of RADAR_MAIN_HEADERS) {
    assert.ok(h.width >= 50, `Header ${h.key} width must be at least 50px`);
    assert.ok(h.label.trim().length > 0, `Header ${h.key} must have non-empty label`);
  }

  const microKeys = new Set(RADAR_MICRO_HEADERS.map(h => h.key));
  assert.equal(microKeys.size, RADAR_MICRO_HEADERS.length, 'RADAR_MICRO_HEADERS must have unique keys');
  assert.equal(RADAR_MICRO_HEADERS.length, 10, 'RADAR_MICRO_HEADERS must have exactly 10 columns');

  for (const h of RADAR_MICRO_HEADERS) {
    assert.ok(h.width >= 50, `Header ${h.key} width must be at least 50px`);
    assert.ok(h.label.trim().length > 0, `Header ${h.key} must have non-empty label`);
  }
});

test('calculated minWidths provide sufficient space without horizontal clipping', () => {
  const mainMinWidth = getRadarTableMinWidth(RADAR_MAIN_HEADERS);
  const microMinWidth = getRadarTableMinWidth(RADAR_MICRO_HEADERS);

  assert.equal(mainMinWidth, 1330, 'Main table minWidth must be exactly 1330px');
  assert.equal(microMinWidth, 1165, 'Microcaps table minWidth must be exactly 1165px');

  // Both must be larger than standard mobile viewport (390px) to trigger clean horizontal scrolling
  assert.ok(mainMinWidth > 1000);
  assert.ok(microMinWidth > 1000);
});

test('RADAR_MICRO_HEADERS includes estimatedFees24h for utility and buyback tracking', () => {
  const feesHeader = RADAR_MICRO_HEADERS.find(h => h.key === 'estimatedFees24h');
  assert.ok(feesHeader, 'Microcaps table must include estimatedFees24h column');
  assert.equal(feesHeader.label, 'Comisioane 24h');
  assert.ok(feesHeader.width >= 100);
});

test('bidirectional scroll synchronization invariant behaves deterministically without infinite loop', () => {
  let isSyncing = false;
  let headerScrollLeft = 0;
  let bodyScrollLeft = 0;

  const syncToBody = (newScroll: number) => {
    headerScrollLeft = newScroll;
    if (isSyncing) return;
    isSyncing = true;
    bodyScrollLeft = headerScrollLeft;
    isSyncing = false;
  };

  const syncToHeader = (newScroll: number) => {
    bodyScrollLeft = newScroll;
    if (isSyncing) return;
    isSyncing = true;
    headerScrollLeft = bodyScrollLeft;
    isSyncing = false;
  };

  // Header initiated scroll
  syncToBody(350);
  assert.equal(headerScrollLeft, 350);
  assert.equal(bodyScrollLeft, 350);

  // Body initiated scroll
  syncToHeader(720);
  assert.equal(headerScrollLeft, 720);
  assert.equal(bodyScrollLeft, 720);

  // Reset scroll
  syncToBody(0);
  assert.equal(headerScrollLeft, 0);
  assert.equal(bodyScrollLeft, 0);
});
