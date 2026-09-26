import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { scannerRouter } from './scanner-routes.js';
import { AppState } from '../services/app-state.js';
import { cryptoMarketProfiles, normalizeCryptoProfile } from '../services/crypto-market-profile.js';
import { dexMarketData } from '../services/dex-market-data.js';

/**
 * Route-level verdicts of the exact-identity gate on GET /api/assets/:symbol
 * (bubble / heat-map deep links carry a provider ID). The gate has exactly
 * three outcomes and this file pins each of them:
 *
 *   - bound identity          -> the exchange route (candles + Money Line);
 *   - a candle venue exists but the supplied exact identity cannot be bound to
 *     it (a verified chart market without a candle feed, or a live
 *     exchange-backed listing carrying a different identity) -> the explicit
 *     503 refusal, never another coin's market;
 *   - no verifiable venue at all (a DEX-only coin like PONS) -> the honest
 *     aggregated page, labelled 'aggregated-price-only' by the payload.
 *
 * A provider rate limit (resolve fails without an ID match) only removes the
 * name evidence: the venue list's own CoinGecko ID and the chart resolver's
 * exact-ID check must still be able to bind the identity, and each of those
 * evidence paths is pinned below.
 */

const profileRow = (id: string, symbol: string, name: string) => normalizeCryptoProfile({
  id, symbol, name, current_price: 0.7, market_cap_rank: 105, last_updated: new Date().toISOString(),
  price_change_percentage_24h: 20, high_24h: 0.8, low_24h: 0.5, total_volume: 100
}, 'coingecko')!;

const assetHandler = () =>
  (scannerRouter.stack.find((layer: any) => layer.route?.path === '/assets/:symbol') as any).route.stack[0].handle;

const callAsset = async (query: Record<string, unknown>, symbol = 'ZZDEX') => {
  let body: any;
  let status: number | undefined;
  const res = {
    json: (value: any) => { body = value; },
    status: (code: number) => { status = code; return res; }
  };
  await assetHandler()({ params: { symbol }, query: { marketClass: 'crypto', timeframe: '1w', ...query } }, res);
  return { status, body };
};

interface MarketDataDouble {
  getTopCryptoAssets: () => Promise<any[]>;
  getPriceQuote?: (symbol: string, marketClass?: string, coinGeckoId?: string) => Promise<any>;
  getCandles?: (symbol: string, timeframe: string, limit: number) => Promise<any[]>;
  resolveChartMarket?: (symbol: string, coinGeckoId?: string) => Promise<any>;
}

const mockAppState = (
  t: TestContext,
  overrides: (calls: { quotes: string[]; candles: number; topLookups: number; chartMarketLookups: string[] }) => Partial<MarketDataDouble> = () => ({})
) => {
  const calls = { quotes: [] as string[], candles: 0, topLookups: 0, chartMarketLookups: [] as string[] };
  const state = {
    marketData: {
      getTopCryptoAssets: async () => { calls.topLookups += 1; return []; },
      getPriceQuote: async (symbol: string, _marketClass?: string, coinGeckoId?: string) => {
        calls.quotes.push(`${symbol}:${coinGeckoId || ''}`);
        return { symbol, price: 1.2, change24h: 0, source: 'Binance', timestamp: Date.now(), isStale: false };
      },
      getCandles: async () => { calls.candles += 1; return []; },
      resolveChartMarket: async (symbol: string, coinGeckoId?: string) => {
        calls.chartMarketLookups.push(`${symbol}:${coinGeckoId || ''}`);
        return null;
      },
      ...overrides(calls)
    },
    moneyLine: { calculateLatest: () => null },
    news: { getNewsForAsset: async () => [], getCachedNewsForAsset: () => [] },
    social: { getPostsForSymbol: () => [], getTrendingTopics: () => [] }
  } as any;
  t.mock.method(AppState, 'getInstance', () => state);
  return calls;
};

const mockProfiles = (t: TestContext, profile: ReturnType<typeof normalizeCryptoProfile>) => {
  t.mock.method(cryptoMarketProfiles, 'resolve', async () => {
    if (!profile) throw new Error('Crypto provider HTTP 429');
    return profile;
  });
  t.mock.method(cryptoMarketProfiles, 'prices', async () => [[1000, 0.7], [2000, 0.8]]);
  t.mock.method(cryptoMarketProfiles, 'resolveCandidates', async () => []);
  t.mock.method(dexMarketData, 'load', async () => null);
};

test('a DEX-only coin with an exact ID and no verifiable venue opens the honest aggregated page', async t => {
  const calls = mockAppState(t, calls => ({
    getPriceQuote: async (symbol: string) => {
      calls.quotes.push(symbol);
      throw new Error('Binance Invalid symbol');
    }
  }));
  mockProfiles(t, profileRow('zzdex', 'zzdex', 'ZZDex Coin'));

  const { status, body } = await callAsset({ coinGeckoId: 'zzdex' });
  assert.equal(status, undefined, 'the aggregated page is a success, never an HTTP error');
  assert.equal(body.dataAvailability, 'aggregated-price-only');
  assert.equal(body.info.name, 'ZZDex Coin');
  assert.equal(body.quote.price, 0.7, 'the quote must come from the verified provider profile, not the venue');
  assert.equal(calls.candles, 0, 'a coin without a verified venue must not request exchange candles');
  assert.deepEqual(calls.chartMarketLookups, ['ZZDEX:zzdex'], 'the exact ID must be checked in the chart resolver');
});

test('a verified chart market without a candle feed refuses the page with the explicit 503', async t => {
  const calls = mockAppState(t, _calls => ({
    resolveChartMarket: async () => ({
      symbol: 'ZZDEX', coinGeckoId: 'zzdex', candle: null,
      tv: { source: 'coinbase', providerSymbol: 'ZZDEX-USD', tvSymbol: 'COINBASE:ZZDEXUSD' },
      candidates: [], resolvedAt: Date.now()
    }),
    getPriceQuote: async () => { throw new Error('Binance Invalid symbol'); }
  }));
  mockProfiles(t, profileRow('zzdex', 'zzdex', 'ZZDex Coin'));

  const { status, body } = await callAsset({ coinGeckoId: 'zzdex' });
  assert.equal(status, 503, 'a venue exists but no candle feed: refuse, do not degrade');
  assert.deepEqual(body, { error: 'Verified exchange candles unavailable for the selected coin.' });
  assert.deepEqual(calls.quotes, [], 'no ticker resolution may happen behind an unbound identity');
});

test('a live exchange listing carrying another identity refuses the supplied exact ID', async t => {
  const calls = mockAppState(t, _calls => ({
    getTopCryptoAssets: async () => [{ symbol: 'ZZCOLLIDE', name: 'Other Project', coinGeckoId: 'other-project' }],
    resolveChartMarket: async () => null,
    getPriceQuote: async () => { throw new Error('Binance Invalid symbol'); }
  }));
  mockProfiles(t, profileRow('zzcollide', 'zzcollide', 'ZZCollide Coin'));

  const { status, body } = await callAsset({ coinGeckoId: 'zzcollide' }, 'ZZCOLLIDE');
  assert.equal(status, 503, 'the ticker trades on a venue under a different identity: refuse');
  assert.deepEqual(body, { error: 'Verified exchange candles unavailable for the selected coin.' });
  assert.deepEqual(calls.quotes, []);
});

test('the venue row own exact ID binds the identity even when the provider lookup is rate limited', async t => {
  const calls = mockAppState(t, _calls => ({
    getTopCryptoAssets: async () => [{ symbol: 'ZZBOUND', name: 'Zzbound', coinGeckoId: 'zzbound' }]
  }));
  mockProfiles(t, null); // resolve rejects with a provider 429

  const { status, body } = await callAsset({ coinGeckoId: 'zzbound' }, 'ZZBOUND');
  assert.equal(status, undefined);
  assert.equal(body.dataAvailability, undefined, 'the exchange route carries candles, not the price-only label');
  assert.equal(calls.candles, 6);
  assert.deepEqual(calls.quotes, ['ZZBOUND:zzbound'], 'the quote must keep the exact ID binding');
});

test('the chart resolver candle binds the identity without the live exchange list', async t => {
  const calls = mockAppState(t, calls => ({
    resolveChartMarket: async (symbol: string, coinGeckoId?: string) => {
      calls.chartMarketLookups.push(`${symbol}:${coinGeckoId || ''}`);
      return {
        symbol, coinGeckoId, candle: { source: 'binance_spot', providerSymbol: 'ZZPINUSDT' },
        tv: null, candidates: [], resolvedAt: Date.now()
      };
    }
  }));
  mockProfiles(t, profileRow('zzpin', 'zzpin', 'Zzpin Coin'));

  const { status, body } = await callAsset({ coinGeckoId: 'zzpin' }, 'ZZPIN');
  assert.equal(status, undefined);
  assert.equal(body.dataAvailability, undefined);
  assert.equal(calls.candles, 6);
  assert.deepEqual(calls.chartMarketLookups, ['ZZPIN:zzpin']);
});

test('a catalog entry without an exact ID binds the supplied ID by provider name and skips the live identity list', async t => {
  const calls = mockAppState(t);
  mockProfiles(t, profileRow('bitcoin', 'btc', 'Bitcoin'));

  const { status, body } = await callAsset({ coinGeckoId: 'bitcoin' }, 'BTC');
  assert.equal(status, undefined);
  assert.equal(body.info.name, 'Bitcoin');
  assert.equal(body.dataAvailability, undefined);
  assert.equal(calls.candles, 6);
  // One lookup only: the live-rank enrichment. A catalog-bound identity must
  // not buy the exchange-backed list a second time.
  assert.equal(calls.topLookups, 1);
});

test('a deep link without an exact ID keeps the legacy aggregated fallback when the quote fails', async t => {
  const calls = mockAppState(t, calls => ({
    getPriceQuote: async (symbol: string) => {
      calls.quotes.push(symbol);
      throw new Error('Binance Invalid symbol');
    }
  }));
  mockProfiles(t, profileRow('zzlegacy', 'zzlegacy', 'Zzlegacy Coin'));

  const { status, body } = await callAsset({}, 'ZZLEGACY');
  assert.equal(status, undefined);
  assert.equal(body.dataAvailability, 'aggregated-price-only');
  assert.equal(calls.quotes.length, 1, 'the legacy ticker path still asks for a quote');
});

test('the market-data identity fail-closed surfaces as 503, never as a price-only page', async t => {
  mockAppState(t, _calls => ({
    getTopCryptoAssets: async () => [{ symbol: 'ZZHYPE', name: 'Zzhype', coinGeckoId: 'zzhype' }],
    getPriceQuote: async () => { throw new Error('No identity-verified candle market for requested coin'); }
  }));
  mockProfiles(t, profileRow('zzhype', 'zzhype', 'Zzhype Coin'));

  const { status, body } = await callAsset({ coinGeckoId: 'zzhype' }, 'ZZHYPE');
  assert.equal(status, 503);
  assert.deepEqual(body, { error: 'Verified exchange candles unavailable for the selected coin.' });
});
