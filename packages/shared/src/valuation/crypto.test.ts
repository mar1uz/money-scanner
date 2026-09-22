import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cryptoValuation, midrankPercentile } from './crypto.js';

test('uses a 365-day run rate and measures holder value against MC and FDV', () => {
  const result = cryptoValuation({ marketCap: 36_500_000, fullyDilutedValuation: 73_000_000,
    metrics: { revenue30d: 300_000, holdersRevenue30d: 30_000, chainCount: 1 } });
  assert.equal(result.multiple, 10);
  assert.equal(result.holderYield, 1);
  assert.equal(result.dilutedHolderYield, 0.5);
  assert.equal(result.dilutionMultiple, 2);
});

test('missing data never becomes zero yield; fees never become holder income', () => {
  const asset = { marketCap: 1_000_000, metrics: { fees30d: 300_000, chainCount: 1 } };
  assert.equal(cryptoValuation(asset).basis, 'fees');
  assert.equal(cryptoValuation(asset).holderYield, undefined);
  assert.equal(cryptoValuation({ ...asset, metrics: { ...asset.metrics, holdersRevenue30d: 0 } }).holderYield, 0);
  assert.equal(cryptoValuation({ ...asset, marketCap: 0 }).multiple, undefined);
  assert.equal(cryptoValuation({ ...asset, marketCap: Infinity }).multiple, undefined);
  assert.equal(cryptoValuation({ ...asset, fullyDilutedValuation: NaN }).dilutedHolderYield, undefined);
});

test('percentiles center ties and singleton groups', () => {
  assert.equal(midrankPercentile([75, 75, 75], 75), 50);
  assert.equal(midrankPercentile([75], 75), 50);
  assert.equal(midrankPercentile([0, 25, 75], 0), 0);
  assert.equal(midrankPercentile([0, 25, 75], 75), 100);
});
