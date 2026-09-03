import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getMarketCapRank, formatMarketCap } from './AssetDeepDiveView.js';

describe('AssetDeepDiveView — Market Cap Rank & Formatting', () => {
  it('formats market cap values accurately across scales', () => {
    assert.equal(formatMarketCap(3_420_000_000_000), '$3.42T');
    assert.equal(formatMarketCap(9_500_000_000), '$9.50B');
    assert.equal(formatMarketCap(11_500_000_000), '$11.50B');
    assert.equal(formatMarketCap(750_000_000_000), '$750.0B');
    assert.equal(formatMarketCap(450_000_000), '$450M');
    assert.equal(formatMarketCap(0), '—');
    assert.equal(formatMarketCap(null), '—');
  });

  it('determines the exact market cap rank for catalog stocks', () => {
    // Top mega-caps
    assert.equal(getMarketCapRank('AAPL', 'stocks'), 1);
    assert.equal(getMarketCapRank('MSFT', 'stocks'), 2);
    assert.equal(getMarketCapRank('NVDA', 'stocks'), 3);
    assert.equal(getMarketCapRank('GOOGL', 'stocks'), 4);
    assert.equal(getMarketCapRank('AMZN', 'stocks'), 5);

    // Elastic ($ESTC from user request)
    const estcRank = getMarketCapRank('ESTC', 'stocks');
    assert.ok(typeof estcRank === 'number' && estcRank > 100);

    // Handles $ prefix and lowercase
    assert.equal(getMarketCapRank('$aapl', 'stocks'), 1);
    assert.equal(getMarketCapRank('$estc', 'stocks'), estcRank);
  });

  it('determines the market cap rank for crypto assets', () => {
    assert.equal(getMarketCapRank('BTC', 'crypto', 1), 1);
    assert.equal(getMarketCapRank('ETH', 'crypto', 2), 2);
    assert.equal(getMarketCapRank('SOL', 'crypto', 5), 5);
  });

  it('estimates rank dynamically when marketCap is provided for unlisted stocks', () => {
    // A stock with 3 Trillion market cap should rank right after AAPL and MSFT
    const rank = getMarketCapRank('NEW_MEGA_CORP', 'stocks', undefined, 3_200_000_000_000);
    assert.equal(rank, 3);
  });
});
