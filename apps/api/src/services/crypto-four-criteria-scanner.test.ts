import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildCryptoFourCriteriaScan } from './crypto-four-criteria-scanner.js';

describe('Crypto four-criteria scanner', () => {
  it('keeps the market-cap universe and distinguishes 4/4, first-three and unknown assets', () => {
    const scan = buildCryptoFourCriteriaScan({
      generatedAt: 1_700_000_000_000,
      coins: [
        { id: 'alpha', symbol: 'alp', name: 'Alpha', market_cap_rank: 1, market_cap: 1_000_000_000 },
        { id: 'beta', symbol: 'bet', name: 'Beta', market_cap_rank: 2, market_cap: 500_000_000 },
        { id: 'gamma', symbol: 'gam', name: 'Gamma', market_cap_rank: 3, market_cap: 250_000_000 }
      ],
      protocols: [
        { name: 'Alpha Protocol', slug: 'alpha-protocol', symbol: 'ALP', tvl: 100_000_000, change_7d: 10, chains: ['Ethereum', 'Base'] },
        { name: 'Beta Protocol', slug: 'beta-protocol', symbol: 'BET', tvl: 50_000_000, change_7d: 7, chains: ['Solana', 'Base'] }
      ],
      fees: [
        { name: 'Alpha Protocol', slug: 'alpha-protocol', total24h: 50_000, total7d: 400_000, total30d: 1_000_000 },
        { name: 'Beta Protocol', slug: 'beta-protocol', total24h: 20_000, total7d: 200_000, total30d: 500_000 }
      ],
      revenue: [
        { name: 'Alpha Protocol', slug: 'alpha-protocol', total24h: 20_000, total7d: 160_000, total30d: 500_000 },
        { name: 'Beta Protocol', slug: 'beta-protocol', total24h: 10_000, total7d: 90_000, total30d: 250_000 }
      ],
      holdersRevenue: [
        { name: 'Alpha Protocol', slug: 'alpha-protocol', total24h: 2_000, total7d: 15_000, total30d: 60_000 }
      ]
    });

    assert.equal(scan.scannedCount, 3);
    assert.equal(scan.coveredCount, 2);
    assert.equal(scan.allFourCount, 1);
    assert.equal(scan.firstThreeCount, 2);
    assert.equal(scan.assets[0].symbol, 'ALP');
    assert.equal(scan.assets[0].classification, 'all-four');
    assert.equal(scan.assets[0].score, 100);
    assert.equal(scan.assets[1].classification, 'first-three');
    assert.equal(scan.assets[1].criteria.holderValue.status, 'fail');
    assert.equal(scan.assets[2].classification, 'insufficient-data');
  });

  it('does not assign ambiguous duplicate symbols to an unrelated protocol', () => {
    const scan = buildCryptoFourCriteriaScan({
      coins: [
        { id: 'one', symbol: 'dup', name: 'One', market_cap_rank: 1, market_cap: 10 },
        { id: 'two', symbol: 'dup', name: 'Two', market_cap_rank: 2, market_cap: 9 }
      ],
      protocols: [{ name: 'Different Protocol', slug: 'different', symbol: 'DUP', tvl: 1_000_000, change_7d: 20 }],
      fees: [{ name: 'Different Protocol', slug: 'different', total30d: 1_000_000 }],
      revenue: [],
      holdersRevenue: []
    });

    assert.equal(scan.coveredCount, 0);
    assert.ok(scan.assets.every(asset => asset.classification === 'insufficient-data'));
  });
});
