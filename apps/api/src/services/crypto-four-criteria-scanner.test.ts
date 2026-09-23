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
        // Alpha deliberately larger than Beta: since 2026-09-23 the 4/4 tie is
        // broken on absolute 30-day size before acceleration (size factor).
        { name: 'Alpha Protocol', slug: 'alpha-protocol', total24h: 50_000, total7d: 400_000, total30d: 3_000_000 },
        { name: 'Beta Protocol', slug: 'beta-protocol', total24h: 60_000, total7d: 600_000, total30d: 2_000_000 }
      ],
      revenue: [
        { name: 'Alpha Protocol', slug: 'alpha-protocol', total24h: 40_000, total7d: 400_000, total30d: 2_000_000 },
        { name: 'Beta Protocol', slug: 'beta-protocol', total24h: 40_000, total7d: 300_000, total30d: 1_000_000 }
      ],
      holdersRevenue: [
        { name: 'Alpha Protocol', slug: 'alpha-protocol', total24h: 4_000, total7d: 30_000, total30d: 100_000 },
        { slug: 'beta-protocol', total24h: 0, total7d: 0, total30d: 0 }
      ]
    });

    assert.equal(scan.scannedCount, 3);
    assert.equal(scan.coveredCount, 2);
    assert.equal(scan.allFourCount, 2);
    assert.equal(scan.firstThreeCount, 2);
    assert.equal(scan.assets[0].symbol, 'ALP');
    assert.equal(scan.assets[0].classification, 'all-four');
    assert.equal(scan.assets[0].score, 100);
    assert.equal(scan.assets[1].classification, 'all-four');
    assert.equal(scan.assets[1].criteria.holderValue.status, 'pass');
    assert.equal(scan.assets[2].classification, 'insufficient-data');
  });

  it('keeps growth/revenue/holders on completeness but gates network on fees >= $100K and TVL >= $10M', () => {
  // STONK-like: measurable usage, but TVL below the $10M leg of the NETWORK
  // pass rule -> watch (12 pts), 3/4, score 87 (Marius, 2026-09-23).
  const scan = buildCryptoFourCriteriaScan({
    coins: [coin('stonk-like', 50_000_000)],
    protocols: [{ slug: 'stonk-like', gecko_id: 'stonk-like', tvl: 100_000, change_7d: -25, chains: ['Base'] }],
    fees: [{ slug: 'stonk-like', total24h: 1, total7d: 7, total30d: 30 }],
    revenue: [{ slug: 'stonk-like', total24h: 0, total7d: 0, total30d: 0 }],
    holdersRevenue: [{ slug: 'stonk-like', total24h: 0, total7d: 0, total30d: 0 }]
  });
  const asset = scan.assets[0];
  assert.deepEqual(Object.values(asset.criteria).map(criterion => criterion.status), ['pass', 'watch', 'pass', 'pass']);
  assert.equal(asset.passedCriteria, 3);
  assert.equal(asset.score, 87);
  assert.equal(asset.classification, 'partial');
  assert.equal(scan.undervalued[0].qualityScore, 62);
});

it('passes network only when fees >= $100K AND TVL >= $10M, with no multi-chain alternative', () => {
  const scan = buildCryptoFourCriteriaScan({
    coins: [coin('qualified'), coin('low-fees'), coin('low-tvl'), coin('multi-chain'), coin('no-usage')],
    protocols: [
      { slug: 'qualified', gecko_id: 'qualified', tvl: 10_000_000, change_7d: 6, chains: ['Solana'] },
      { slug: 'low-fees', gecko_id: 'low-fees', tvl: 50_000_000, change_7d: 6, chains: ['Solana'] },
      { slug: 'low-tvl', gecko_id: 'low-tvl', tvl: 9_999_999, change_7d: 6, chains: ['Solana'] },
      { slug: 'multi-chain', gecko_id: 'multi-chain', tvl: 5_000_000, change_7d: 6, chains: ['Solana', 'Base'] }
    ],
    fees: [
      { slug: 'qualified', total24h: 10_000, total7d: 70_000, total30d: 100_000 },
      { slug: 'low-fees', total24h: 3_000, total7d: 21_000, total30d: 99_999 },
      { slug: 'low-tvl', total24h: 10_000, total7d: 70_000, total30d: 500_000 },
      { slug: 'multi-chain', total24h: 10_000, total7d: 70_000, total30d: 500_000 }
    ],
    revenue: [], holdersRevenue: []
  });
  const statusOf = (id: string) => scan.assets.find(a => a.id === id)!.criteria.networkEffect.status;
  assert.equal(statusOf('qualified'), 'pass');
  assert.equal(statusOf('low-fees'), 'watch');
  assert.equal(statusOf('low-tvl'), 'watch');
  assert.equal(statusOf('multi-chain'), 'watch');
  assert.equal(statusOf('no-usage'), 'unknown');
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
  assert.equal(zero.criteria.holderValue.status, 'pass');
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

it('breaks 4/4 ties on absolute 30-day size before acceleration (size factor, 2026-09-23)', () => {
  // Both assets pass all four criteria. The small one accelerates far faster,
  // but $100K-$1M/month cannot outrank $25M-$50M/month on acceleration alone.
  const scan = buildCryptoFourCriteriaScan({
    coins: [coin('small'), coin('big')],
    protocols: [
      { slug: 'big', gecko_id: 'big', tvl: 500_000_000, change_7d: 1, chains: ['Ethereum'] },
      { slug: 'small', gecko_id: 'small', tvl: 20_000_000, change_7d: 300, chains: ['Ethereum'] }
    ],
    fees: [
      { slug: 'big', total24h: 1_600_000, total7d: 11_000_000, total30d: 50_000_000 },
      { slug: 'small', total24h: 10_000, total7d: 60_000, total30d: 100_000 }
    ],
    revenue: [
      { slug: 'big', total24h: 800_000, total7d: 5_500_000, total30d: 25_000_000 },
      { slug: 'small', total24h: 5_000, total7d: 40_000, total30d: 100_000 }
    ],
    holdersRevenue: [metric('big'), metric('small')]
  });
  assert.equal(scan.assets[0].passedCriteria, 4);
  assert.equal(scan.assets[1].passedCriteria, 4);
  assert.deepEqual(scan.assets.slice(0, 2).map(asset => asset.id), ['big', 'small']);
});

it('lets acceleration decide inside the same size decade', () => {
  const scan = buildCryptoFourCriteriaScan({
    coins: [coin('slow'), coin('fast')],
    protocols: [
      { slug: 'slow', gecko_id: 'slow', tvl: 50_000_000, change_7d: 1, chains: ['Ethereum'] },
      { slug: 'fast', gecko_id: 'fast', tvl: 50_000_000, change_7d: 1, chains: ['Ethereum'] }
    ],
    fees: [
      { slug: 'slow', total24h: 60_000, total7d: 350_000, total30d: 2_000_000 },
      { slug: 'fast', total24h: 60_000, total7d: 700_000, total30d: 2_000_000 }
    ],
    revenue: [
      { slug: 'slow', total24h: 30_000, total7d: 175_000, total30d: 1_000_000 },
      { slug: 'fast', total24h: 30_000, total7d: 350_000, total30d: 1_000_000 }
    ],
    holdersRevenue: [metric('slow'), metric('fast')]
  });
  assert.deepEqual(scan.assets.slice(0, 2).map(asset => asset.id), ['fast', 'slow']);
});
it('ranks $0-revenue protocols by real capture; fees are fallback only when revenue data is missing', () => {
  // hollow: $40M/month fees but revenue reported as $0 -> size basis 0, last of the 4/4 group.
  // feechain/smallchain: L1 chains with no revenue/holder rows at all -> fees fallback decides their 3/4 order.
  const chain = (slug: string, tvl: number) => ({ slug, gecko_id: slug, tvl, change_7d: 2, chains: ['Ethereum'] });
  const scan = buildCryptoFourCriteriaScan({
    coins: [coin('hollow'), coin('earner'), coin('feechain'), coin('smallchain')],
    protocols: [chain('hollow', 500_000_000), chain('earner', 50_000_000), chain('feechain', 50_000_000), chain('smallchain', 50_000_000)],
    fees: [
      { slug: 'hollow', category: 'Chain', total24h: 1_300_000, total7d: 9_000_000, total30d: 40_000_000 },
      { slug: 'earner', total24h: 30_000, total7d: 200_000, total30d: 1_000_000 },
      { slug: 'feechain', category: 'Chain', total24h: 60_000, total7d: 400_000, total30d: 2_000_000 },
      { slug: 'smallchain', category: 'Chain', total24h: 3_000, total7d: 20_000, total30d: 100_000 }
    ],
    revenue: [
      { slug: 'hollow', total24h: 0, total7d: 0, total30d: 0 },
      { slug: 'earner', total24h: 20_000, total7d: 140_000, total30d: 700_000 }
    ],
    holdersRevenue: [
      { slug: 'hollow', total24h: 0, total7d: 0, total30d: 0 },
      { slug: 'earner', total24h: 1_000, total7d: 7_000, total30d: 30_000 }
    ]
  });
  assert.deepEqual(scan.assets.map(asset => asset.id), ['earner', 'hollow', 'feechain', 'smallchain']);
  assert.equal(scan.assets[0].passedCriteria, 4);
  assert.equal(scan.assets[1].passedCriteria, 4);
  assert.equal(scan.assets[2].passedCriteria, 3);
  assert.equal(scan.assets[3].passedCriteria, 3);
});
