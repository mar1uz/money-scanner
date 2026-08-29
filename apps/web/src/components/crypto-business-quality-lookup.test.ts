import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/*
 * Pure-logic lookup tests — we import only the `findAssetInScan` helper
 * which has zero React/DOM dependencies.
 */
import { findAssetInScan } from './CryptoBusinessQualityCard.js';
import type { CryptoFourCriteriaScan, CryptoFourCriteriaAsset, CryptoCriterionResult } from '../types.js';

/* ── Test-data factory ────────────────────────────────── */

function makeCriterion(status: 'pass' | 'watch' | 'fail' | 'unknown' = 'pass'): CryptoCriterionResult {
  return { status, label: 'Test', value: 'test-value', explanation: 'test explanation' };
}

function makeAsset(overrides: Partial<CryptoFourCriteriaAsset> & { id: string; symbol: string }): CryptoFourCriteriaAsset {
  return {
    name: overrides.symbol,
    coinGeckoId: overrides.id,
    image: undefined,
    marketCapRank: 1,
    marketCap: 1_000_000_000,
    score: 100,
    passedCriteria: 4,
    classification: 'all-four',
    criteria: {
      growth: makeCriterion(),
      networkEffect: makeCriterion(),
      sustainableRevenue: makeCriterion(),
      holderValue: makeCriterion()
    },
    metrics: { chainCount: 2 },
    ...overrides
  };
}

function makeScan(assets: CryptoFourCriteriaAsset[]): CryptoFourCriteriaScan {
  return {
    scannedCount: assets.length,
    coveredCount: assets.filter(a => a.classification !== 'insufficient-data').length,
    allFourCount: assets.filter(a => a.classification === 'all-four').length,
    firstThreeCount: assets.filter(a => a.classification === 'first-three').length,
    assets,
    generatedAt: Date.now(),
    dataFreshness: 'test',
    methodology: ['test methodology'],
    sources: [{ id: 'cg', title: 'CoinGecko', url: 'https://coingecko.com', domain: 'coingecko.com' }],
    disclaimer: 'test disclaimer'
  };
}

/* ── Tests ──────────────────────────────────────────────── */

describe('findAssetInScan — Crypto Business Quality lookup', () => {

  it('matches by exact CoinGecko ID (highest priority)', () => {
    const btc = makeAsset({ id: 'bitcoin', symbol: 'BTC' });
    const eth = makeAsset({ id: 'ethereum', symbol: 'ETH', marketCapRank: 2, marketCap: 500_000_000 });
    const scan = makeScan([btc, eth]);

    const result = findAssetInScan(scan, 'bitcoin', 'BTC');
    assert.ok(result);
    assert.equal(result.coinGeckoId, 'bitcoin');
    assert.equal(result.symbol, 'BTC');
  });

  it('matches by unambiguous symbol when CoinGecko ID is absent', () => {
    const sol = makeAsset({ id: 'solana', symbol: 'SOL' });
    const scan = makeScan([sol]);

    const result = findAssetInScan(scan, undefined, 'SOL');
    assert.ok(result);
    assert.equal(result.symbol, 'SOL');
  });

  it('returns null for duplicate/ambiguous symbol (two assets share same ticker)', () => {
    const luna1 = makeAsset({ id: 'terra-luna-2', symbol: 'LUNA', name: 'Terra Luna 2', marketCapRank: 50 });
    const luna2 = makeAsset({ id: 'terra-luna', symbol: 'LUNA', name: 'Terra Luna Classic', marketCapRank: 80 });
    const scan = makeScan([luna1, luna2]);

    // No CoinGecko ID → symbol is ambiguous → must NOT associate
    const result = findAssetInScan(scan, undefined, 'LUNA');
    assert.equal(result, null);
  });

  it('returns correct data for 4/4 confirmed asset', () => {
    const asset = makeAsset({
      id: 'aave',
      symbol: 'AAVE',
      score: 100,
      passedCriteria: 4,
      classification: 'all-four',
      criteria: {
        growth: makeCriterion('pass'),
        networkEffect: makeCriterion('pass'),
        sustainableRevenue: makeCriterion('pass'),
        holderValue: makeCriterion('pass')
      }
    });
    const scan = makeScan([asset]);

    const result = findAssetInScan(scan, 'aave', 'AAVE');
    assert.ok(result);
    assert.equal(result.score, 100);
    assert.equal(result.passedCriteria, 4);
    assert.equal(result.classification, 'all-four');
    assert.equal(result.criteria.growth.status, 'pass');
    assert.equal(result.criteria.networkEffect.status, 'pass');
    assert.equal(result.criteria.sustainableRevenue.status, 'pass');
    assert.equal(result.criteria.holderValue.status, 'pass');
  });

  it('returns null for asset not in the scan', () => {
    const btc = makeAsset({ id: 'bitcoin', symbol: 'BTC' });
    const scan = makeScan([btc]);

    const result = findAssetInScan(scan, 'unknown-coin-xyz', 'XYZ');
    assert.equal(result, null);
  });

  it('returns null for null/undefined scan (simulates network error)', () => {
    assert.equal(findAssetInScan(null, 'bitcoin', 'BTC'), null);
    assert.equal(findAssetInScan(undefined, 'bitcoin', 'BTC'), null);
  });

  it('returns null for empty assets array', () => {
    const scan = makeScan([]);
    assert.equal(findAssetInScan(scan, 'bitcoin', 'BTC'), null);
  });

  it('CoinGecko ID match takes priority even when symbol also matches a different asset', () => {
    const realBtc = makeAsset({ id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' });
    const fakeBtc = makeAsset({ id: 'fake-bitcoin', symbol: 'BTC', name: 'Fake BTC', marketCapRank: 999 });
    const scan = makeScan([realBtc, fakeBtc]);

    // With CoinGecko ID → matches the correct one, ignoring ambiguous symbol
    const result = findAssetInScan(scan, 'bitcoin', 'BTC');
    assert.ok(result);
    assert.equal(result.coinGeckoId, 'bitcoin');
    assert.equal(result.name, 'Bitcoin');
  });

  it('handles symbol lookup with $ prefix and mixed case', () => {
    const sol = makeAsset({ id: 'solana', symbol: 'SOL' });
    const scan = makeScan([sol]);

    const result = findAssetInScan(scan, undefined, '$sol');
    assert.ok(result);
    assert.equal(result.symbol, 'SOL');
  });
});
