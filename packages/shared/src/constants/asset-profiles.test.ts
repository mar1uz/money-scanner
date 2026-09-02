import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getAssetProfile, ASSET_PROFILES_DATABASE } from './asset-profiles.js';

describe('Asset Profiles & Knowledge Engine', () => {
  it('retrieves detailed curated profile for Bitcoin ($BTC)', () => {
    const profile = getAssetProfile('BTC', 'crypto', 'Layer 1', 'Bitcoin');
    assert.equal(profile.symbol, 'BTC');
    assert.equal(profile.name, 'Bitcoin');
    assert.ok(profile.headlineRo.includes('Aur Digital'));
    assert.ok(profile.whatItDoesRo.includes('peer-to-peer'));
    assert.ok(profile.originRo.includes('2009'));
    assert.equal(profile.keyPointsRo.length, 3);
  });

  it('retrieves detailed curated profile for NVIDIA ($NVDA)', () => {
    const profile = getAssetProfile('NVDA', 'stocks', 'Tech Stock', 'NVIDIA Corporation');
    assert.equal(profile.symbol, 'NVDA');
    assert.ok(profile.headlineRo.includes('GPU'));
    assert.ok(profile.whatItDoesRo.includes('CUDA'));
    assert.ok(profile.originRo.includes('1993'));
    assert.equal(profile.keyPointsRo.length, 3);
  });

  it('retrieves curated profile for Gold ($XAU)', () => {
    const profile = getAssetProfile('XAU', 'metals', 'Precious Metal', 'Aur Fizic (Gold)');
    assert.equal(profile.symbol, 'XAU');
    assert.ok(profile.headlineRo.includes('refugiu'));
    assert.ok(profile.ecosystem.includes('Spot Metal'));
  });

  it('dynamically generates rich profile for unknown crypto asset ($UNKNOWN_COIN)', () => {
    const profile = getAssetProfile('UNKNOWN_COIN', 'crypto', 'DeFi', 'Unknown Protocol');
    assert.equal(profile.symbol, 'UNKNOWN_COIN');
    assert.equal(profile.name, 'Unknown Protocol');
    assert.ok(profile.whatItDoesRo.includes('protocol descentralizat'));
    assert.ok(profile.categoryLabelRo.includes('DeFi'));
    assert.equal(profile.keyPointsRo.length, 3);
  });

  it('dynamically generates rich profile for unknown stock asset ($NEW_STOCK)', () => {
    const profile = getAssetProfile('NEW_STOCK', 'stocks', 'Semiconductori', 'New Semiconductor Inc.');
    assert.equal(profile.symbol, 'NEW_STOCK');
    assert.equal(profile.name, 'New Semiconductor Inc.');
    assert.ok(profile.whatItDoesRo.includes('activează în sectorul'));
    assert.ok(profile.originRo.includes('SEC'));
    assert.equal(profile.keyPointsRo.length, 3);
  });

  it('handles cashtag prefixes ($) and mixed casing cleanly', () => {
    const profile = getAssetProfile('$eth', 'crypto', 'Layer 1');
    assert.equal(profile.symbol, 'ETH');
    assert.equal(profile.name, 'Ethereum');
    assert.ok(profile.originRo.includes('Vitalik Buterin'));
  });
});
