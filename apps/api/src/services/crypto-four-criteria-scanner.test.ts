import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildCryptoFourCriteriaScan, scanCryptoFourCriteria } from './crypto-four-criteria-scanner.js';

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
        { name: 'Beta Protocol', slug: 'beta-protocol', total24h: 60_000, total7d: 600_000, total30d: 2_000_000 }
      ],
      revenue: [
        { name: 'Alpha Protocol', slug: 'alpha-protocol', total24h: 40_000, total7d: 400_000, total30d: 1_000_000 },
        { name: 'Beta Protocol', slug: 'beta-protocol', total24h: 40_000, total7d: 300_000, total30d: 1_000_000 }
      ],
      holdersRevenue: [
        { name: 'Alpha Protocol', slug: 'alpha-protocol', total24h: 4_000, total7d: 30_000, total30d: 100_000 },
        { slug: 'beta-protocol', total24h: 0, total7d: 0, total30d: 0 }
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

const coin = (id: string, cap = 12_000_000) => ({ id, coin_gecko_id: id, symbol: id, name: id, market_cap: cap, market_cap_rank: 1 });
const metric = (slug: string, total30d: number | null = 1_000_000) => ({ slug, total24h: 40_000, total7d: 300_000, total30d });

it('distinguishes reported zero, absent data and incomplete child totals', () => {
  const scan = buildCryptoFourCriteriaScan({
    coins: ['zero', 'missing', 'partial'].map(id => coin(id)),
    protocols: [
      { slug: 'partial-v1', gecko_id: 'partial' },
      { slug: 'partial-v2', gecko_id: 'partial' }
    ],
    fees: ['zero', 'missing', 'partial'].map(id => metric(id)),
    revenue: [metric('zero', 0)],
    holdersRevenue: [metric('zero', 0), metric('partial-v1', 100_000), metric('partial-v2', null)]
  });
  const zero = scan.assets.find(a => a.id === 'zero')!;
  const missing = scan.assets.find(a => a.id === 'missing')!;
  const partial = scan.assets.find(a => a.id === 'partial')!;
  assert.equal(zero.metrics.holdersRevenue30d, 0);
  assert.equal(zero.criteria.holderValue.status, 'fail');
  assert.equal(missing.metrics.revenue30d, undefined);
  assert.equal(missing.criteria.sustainableRevenue.status, 'unknown');
  assert.equal(missing.criteria.holderValue.status, 'unknown');
  assert.equal(partial.metrics.holdersRevenue30d, undefined);
  assert.equal(partial.criteria.holderValue.status, 'unknown');
});

it('does not redirect an explicit gecko ID or unrelated symbol to the wrong coin', () => {
  const scan = buildCryptoFourCriteriaScan({
    coins: [coin('alpha')],
    protocols: [
      { slug: 'wrong-id', name: 'alpha', symbol: 'alpha', gecko_id: 'another-token' },
      { slug: 'wrong-name', name: 'Unrelated', symbol: 'alpha' }
    ],
    fees: [metric('wrong-id'), metric('wrong-name')], revenue: [], holdersRevenue: []
  });
  assert.equal(scan.coveredCount, 0);
});

it('deduplicates coins and parent/child metric rows, retains protocol source links and FDV', () => {
  const scan = buildCryptoFourCriteriaScan({
    coins: [{ ...coin('alpha'), fully_diluted_valuation: 24_000_000 }, coin('alpha')],
    protocols: [{ slug: 'alpha-v1', gecko_id: 'alpha' }],
    fees: [
      { ...metric('alpha'), defillamaId: 'parent#alpha' },
      { ...metric('alpha-v1'), parentProtocol: 'parent#alpha', defillamaId: '123' },
      { ...metric('alpha'), defillamaId: 'parent#alpha' }
    ],
    revenue: [metric('alpha')], holdersRevenue: []
  });
  assert.equal(scan.assets.length, 1);
  assert.equal(scan.assets[0].metrics.fees30d, 1_000_000);
  assert.equal(scan.assets[0].fullyDilutedValuation, 24_000_000);
  assert.deepEqual(scan.assets[0].protocolSlugs, ['alpha-v1']);
  assert.ok(Math.abs(scan.undervalued[0].valuationRatio - 12 / (365 / 30)) < 1e-9);
});

it('ranks tied quality fairly and compares multiples only within the same basis', () => {
  const scan = buildCryptoFourCriteriaScan({
    coins: [coin('cheap'), coin('costly', 24_000_000), coin('fees-only', 1)],
    protocols: [], fees: [metric('fees-only')],
    revenue: [metric('cheap'), metric('costly')], holdersRevenue: []
  });
  const cheap = scan.undervalued.find(a => a.assetId === 'cheap')!;
  const costly = scan.undervalued.find(a => a.assetId === 'costly')!;
  const fees = scan.undervalued.find(a => a.assetId === 'fees-only')!;
  assert.equal(cheap.qualityPercentile, 50);
  assert.equal(costly.qualityPercentile, 50);
  assert.equal(cheap.undervaluationIndex, 50);
  assert.equal(costly.undervaluationIndex, -50);
  assert.equal(fees.undervaluationIndex, 0);
});

it('keeps zero 7-day activity as contraction but does not turn a missing series into -100%', () => {
  const scan = buildCryptoFourCriteriaScan({
    coins: [coin('zero'), coin('missing')], protocols: [],
    fees: [{ ...metric('zero'), total7d: 0 }, { ...metric('missing'), total7d: null }],
    revenue: [], holdersRevenue: []
  });
  assert.equal(scan.assets.find(a => a.id === 'zero')!.metrics.feeRunRateChange, -100);
  assert.equal(scan.assets.find(a => a.id === 'missing')!.metrics.feeRunRateChange, undefined);
});

it('canonicalizes a CoinPaprika fallback before merging CoinGecko coverage', async () => {
  const fetcher = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('order=market_cap_desc')) return new Response('', { status: 429 });
    if (url.includes('coinpaprika')) return Response.json([{ id: 'alpha-alpha', symbol: 'ALPHA', name: 'alpha', rank: 1, quotes: { USD: { market_cap: 10_000_000 } } }]);
    if (url.includes('/coins/markets')) return Response.json([{ ...coin('alpha'), fully_diluted_valuation: 24_000_000 }]);
    if (url.endsWith('/protocols')) return Response.json([{ slug: 'alpha', gecko_id: 'alpha', symbol: 'ALPHA', name: 'alpha' }]);
    return Response.json({ protocols: [metric('alpha')] });
  }) as typeof fetch;
  const scan = await scanCryptoFourCriteria(fetcher);
  assert.equal(scan.assets.length, 1);
  assert.equal(scan.assets[0].coinGeckoId, 'alpha');
  assert.equal(scan.assets[0].marketDataSource, 'coingecko');
  assert.equal(scan.assets[0].fullyDilutedValuation, 24_000_000);
});

it('rejects malformed provider payloads instead of caching an empty successful scan', async () => {
  const fetcher = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('/coins/markets')) return Response.json([coin('alpha')]);
    if (url.endsWith('/protocols')) return Response.json([]);
    return Response.json({ error: 'provider unavailable' });
  }) as typeof fetch;
  await assert.rejects(scanCryptoFourCriteria(fetcher), /incomplete response/);
});

it('orders undervalued by criteria passed first, then undervaluation index within the group', () => {
  const scan = buildCryptoFourCriteriaScan({
    coins: [coin('full', 600_000_000), coin('mid', 12_000_000), coin('cheap', 1_000_000)],
    protocols: [
      { name: 'Full Protocol', slug: 'full-protocol', symbol: 'FULL', tvl: 100_000_000, change_7d: 10, chains: ['Ethereum', 'Base'] }
    ],
    fees: [metric('full-protocol'), metric('mid'), metric('cheap')],
    revenue: [metric('full-protocol'), metric('mid'), metric('cheap')],
    holdersRevenue: [metric('full-protocol', 100_000)]
  });
  const full = scan.undervalued.find(a => a.assetId === 'full')!;
  const cheap = scan.undervalued.find(a => a.assetId === 'cheap')!;
  assert.equal(full.passedCriteria, 4);
  assert.equal(cheap.passedCriteria, 2);
  assert.ok(cheap.undervaluationIndex > full.undervaluationIndex);
  assert.deepEqual(scan.undervalued.map(a => a.assetId), ['full', 'cheap', 'mid']);
});
