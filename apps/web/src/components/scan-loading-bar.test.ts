import test from 'node:test';
import assert from 'node:assert/strict';
import { formatScanBarLabel, scanBarState, scanBarWidthPercent } from './scan-loading-bar.js';

test('a page load with no fraction is indeterminate and has no percent', () => {
  const state = scanBarState();
  assert.equal(state.mode, 'indeterminate');
  assert.equal(state.percent, null);
  assert.equal(formatScanBarLabel(state, 4), 'Se încarcă… · 4s');
  assert.equal(formatScanBarLabel(state, 4).includes('%'), false);
});

test('a preparing scan with total 0 shows elapsed seconds only', () => {
  const state = scanBarState(0, 0);
  assert.equal(state.mode, 'elapsed-only');
  assert.equal(state.percent, null);
  assert.equal(formatScanBarLabel(state, 7), '7s');
  assert.equal(formatScanBarLabel(state, 7).includes('%'), false);
});

test('0 scanned of a known total is 0%, not a fake minimum', () => {
  const state = scanBarState(0, 150);
  assert.equal(state.mode, 'determinate');
  assert.equal(state.percent, 0);
  assert.equal(scanBarWidthPercent(state.percent), 0);
  assert.equal(formatScanBarLabel(state, 2), '0% · 2s');
});

test('the determinate label and width use the real scanned/total ratio', () => {
  const state = scanBarState(42, 150);
  assert.equal(state.mode, 'determinate');
  assert.equal(state.percent, (42 / 150) * 100);
  assert.equal(scanBarWidthPercent(state.percent), (42 / 150) * 100);
  assert.match(formatScanBarLabel(state, 9), /^28% · 9s$/);
});
