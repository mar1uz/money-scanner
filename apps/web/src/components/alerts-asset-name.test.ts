import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getAssetName } from './AlertsCenterView.js';

describe('AlertsCenterView — Asset Name Resolution', () => {
  it('resolves full company and token names from catalog', () => {
    assert.equal(getAssetName('CVX'), 'Chevron Corp');
    assert.equal(getAssetName('CRM'), 'Salesforce Inc');
    assert.equal(getAssetName('ADBE'), 'Adobe Inc');
    assert.equal(getAssetName('NOW'), 'ServiceNow Inc');
    assert.equal(getAssetName('PLTR'), 'Palantir Technologies');
    assert.equal(getAssetName('UNI'), 'Uniswap');
    assert.equal(getAssetName('BTC'), 'Bitcoin');
    assert.equal(getAssetName('ETH'), 'Ethereum');
  });

  it('prefers candidateName if already provided and different from symbol', () => {
    assert.equal(getAssetName('CVX', 'Chevron Corporation'), 'Chevron Corporation');
  });

  it('falls back to knownAssets if asset is not in canonical catalog', () => {
    const known = [
      { symbol: 'CUSTOM', name: 'Custom Token Ecosystem' } as any
    ];
    assert.equal(getAssetName('CUSTOM', undefined, known), 'Custom Token Ecosystem');
  });

  it('falls back to symbol when no name is found', () => {
    assert.equal(getAssetName('NONEXISTENT_XYZ'), 'NONEXISTENT_XYZ');
  });
});
