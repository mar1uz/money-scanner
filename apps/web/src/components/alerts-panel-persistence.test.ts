import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALERTS_COVERAGE_OPEN_KEY,
  ALERTS_SMA_OPEN_KEY,
  peekAlertsDashboardCache,
  readPersistedOpen,
  rememberAlertsDashboard,
  shouldAutoLoadAlertsDashboard,
  writePersistedOpen
} from './AlertsCenterView.js';
import type { AlertsDashboardResponse } from '../services/api.js';

const memoryStorage = () => {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, String(value)); }
  };
};

describe('Alerts panels — collapse persistence', () => {
  it('defaults both coverage and SMA panels to open', () => {
    const storage = memoryStorage();
    assert.equal(readPersistedOpen(ALERTS_COVERAGE_OPEN_KEY, true, storage), true);
    assert.equal(readPersistedOpen(ALERTS_SMA_OPEN_KEY, true, storage), true);
  });

  it('remembers a collapsed coverage / SMA panel', () => {
    const storage = memoryStorage();
    writePersistedOpen(ALERTS_COVERAGE_OPEN_KEY, false, storage);
    writePersistedOpen(ALERTS_SMA_OPEN_KEY, false, storage);
    assert.equal(readPersistedOpen(ALERTS_COVERAGE_OPEN_KEY, true, storage), false);
    assert.equal(readPersistedOpen(ALERTS_SMA_OPEN_KEY, true, storage), false);
    writePersistedOpen(ALERTS_COVERAGE_OPEN_KEY, true, storage);
    assert.equal(readPersistedOpen(ALERTS_COVERAGE_OPEN_KEY, true, storage), true);
  });

  it('falls back when storage is missing', () => {
    assert.equal(readPersistedOpen(ALERTS_COVERAGE_OPEN_KEY, true, null), true);
    assert.doesNotThrow(() => writePersistedOpen(ALERTS_SMA_OPEN_KEY, false, null));
  });
});

describe('Alerts dashboard — keep last snapshot, no auto rescan', () => {
  beforeEach(() => {
    rememberAlertsDashboard(null);
  });

  it('auto-loads only when there is no cached snapshot', () => {
    assert.equal(shouldAutoLoadAlertsDashboard(null), true);
    assert.equal(shouldAutoLoadAlertsDashboard({} as AlertsDashboardResponse), false);
  });

  it('re-entering Alerts reuses the last snapshot instead of fetching again', () => {
    const snapshot = { updatedAt: 1_700_000_000_000 } as AlertsDashboardResponse;
    rememberAlertsDashboard(snapshot);
    assert.equal(shouldAutoLoadAlertsDashboard(), false);
    assert.equal(peekAlertsDashboardCache(), snapshot);
  });
});
