import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { scannerRouter } from './scanner-routes.js';
import { AppState } from '../services/app-state.js';
import { cryptoMarketProfiles, normalizeCryptoProfile } from '../services/crypto-market-profile.js';
import { dexMarketData } from '../services/dex-market-data.js';

/**
 * Route-level tests for the optional exact venue-pair identity of
 * GET /api/assets/:symbol (search pipeline audit F6, recommendations B3/B4).
 *
 * The search modal knows the row's own venue identity
 * (`providerSymbol`/`exchange`/`instrumentType`/`quoteCurrency`); the deep link
 * carries it and the route verifies it against the venue's live market list
 * before any ticker-based resolution. These tests pin the three states:
 *   - no parameters  -> the legacy behaviour, byte for byte (no venue lookup);
 *   - confirmed pair -> the identity holds without a CoinGecko ID;
 *   - unconfirmable  -> the explicit 503 refusal instead of a silent ticker
 *                       resolution (and never for venues the server cannot
 *                       verify at all).
 *
 * Every outbound provider call is served by an injected fetch double; anything
 * unexpected is recorded and asserted to be empty, so a real network call can
 * never make these results pass by accident.
 */

interface ProviderReply {
  body?: unknown;
  status?: number;
  networkError?: boolean;
}

const PROVIDERS = [
  { name: 'binanceSpot', fragment: 'api.binance.com/api/v3/exchangeInfo' },
  { name: 'binanceFutures', fragment: 'fapi.binance.com/fapi/v1/exchangeInfo' }
] as const;

const installProviders = (t: TestContext, replies: Partial<Record<'binanceSpot' | 'binanceFutures', ProviderReply>>) => {
  const realFetch = globalThis.fetch;
  const calls: string[] = [];
  const unexpected: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: any, init?: any) => {
    const url = input instanceof Request ? input.url : String(input);
    // Requests made by the test itself must still reach the local server.
    if (url.startsWith('http://127.0.0.1:')) return realFetch(input, init);
    calls.push(url);
    const provider = PROVIDERS.find(entry => url.includes(entry.fragment));
    if (!provider) {
      unexpected.push(url);
      throw new TypeError(`Unexpected outbound request from the asset route: ${url}`);
    }
    const reply = replies[provider.name];
    if (!reply) {
      unexpected.push(url);
      throw new TypeError(`Unexpected ${provider.name} call: ${url}`);
    }
    if (reply.networkError) throw new TypeError('fetch failed');
    return new Response(reply.body === undefined ? '' : JSON.stringify(reply.body), {
      status: reply.status ?? 200,
      headers: { 'content-type': 'application/json' }
    });
  });
  return {
    calls,
    replies,
    unexpected,
    countIn: (fragment: string) => calls.filter(url => url.includes(fragment)).length
  };
};

const withServer = async (run: (base: string) => Promise<void>) => {
  const app = express();
  app.use('/api', scannerRouter);
  const server = app.listen(0);
  await new Promise<void>(resolve => server.once('listening', resolve));
  try {
    await run(`http://127.0.0.1:${(server.address() as any).port}`);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
};

/** Expires the module-level Binance market caches (TTL + failure backoff) so every test owns its list. */
let mockClock = Date.now();
const expireMarketCaches = (t: TestContext) => {
  // One hour per test, monotonic across the file: earlier cache entries,
  // backups and failure backoff windows are always in the past.
  mockClock += 60 * 60_000;
  t.mock.timers.enable({ apis: ['Date'], now: mockClock });
};

const binanceSpotRow = (symbol: string, base: string, quote = 'USDT') => ({
  symbol, baseAsset: base, quoteAsset: quote, status: 'TRADING'
});
const binanceFuturesRow = (symbol: string, base: string, contractType = 'PERPETUAL') => ({
  symbol, baseAsset: base, quoteAsset: 'USDT', contractType, status: 'TRADING'
});

const SPOT_LIST = [
  binanceSpotRow('ZZPAIRUSDT', 'ZZPAIR'),
  binanceSpotRow('ZZPAIRBTC', 'ZZPAIR', 'BTC'),
  binanceSpotRow('BTCUSDT', 'BTC')
];
const FUTURES_LIST = [binanceFuturesRow('ZZPERPUSDT', 'ZZPERP')];

const liveProviders = () => ({
  binanceSpot: { body: { symbols: SPOT_LIST } },
  binanceFutures: { body: { symbols: FUTURES_LIST } }
});

/**
 * The asset route is exercised with every market-data dependency mocked: the
 * scenarios here decide on identity, never on live candles or quotes. A quote
 * that cannot be served walks the route into the aggregated (price-only) page,
 * which is the behaviour the deep links already had.
 */
const mockAppState = (t: TestContext) => {
  const calls = { quotes: [] as string[], topLookups: 0 };
  t.mock.method(AppState, 'getInstance', () => ({
    marketData: {
      getTopCryptoAssets: async () => { calls.topLookups++; return []; },
      getPriceQuote: async (symbol: string) => {
        calls.quotes.push(symbol);
        throw new Error('Binance Invalid symbol');
      },
      getCandles: async () => { throw new Error('candles must not be requested by these identity scenarios'); },
      resolveChartMarket: async () => null
    },
    moneyLine: { calculateLatest: () => null },
    news: { getNewsForAsset: async () => [], getCachedNewsForAsset: () => [] },
    social: { getPostsForSymbol: () => [], getTrendingTopics: () => [] }
  } as any));
  return calls;
};

const mockProfiles = (t: TestContext, symbol: string) => {
  const profile = normalizeCryptoProfile({
    id: 'zzpair', symbol, name: `${symbol} Test Coin`, current_price: 1.5, market_cap_rank: 900,
    last_updated: new Date().toISOString(), price_change_percentage_24h: 1,
    high_24h: 2, low_24h: 1, total_volume: 10
  }, 'coingecko');
  assert.ok(profile, 'the test profile must be valid');
  t.mock.method(cryptoMarketProfiles, 'resolve', async () => profile!);
  t.mock.method(cryptoMarketProfiles, 'prices', async () => []);
  t.mock.method(cryptoMarketProfiles, 'resolveCandidates', async () => []);
  t.mock.method(dexMarketData, 'load', async () => null);
};

const assetUrl = (base: string, symbol: string, params: Record<string, string> = {}) => {
  const query = new URLSearchParams({ marketClass: 'crypto', timeframe: '1w', ...params });
  return `${base}/api/assets/${symbol}?${query.toString()}`;
};

// Kept first on purpose: with a cold market cache the route has no verified
// list at all, which is the strongest form of this scenario. The pair symbol is
// unique to this test, so it stays a refusal even if a stale list from another
// test is served after a failed refresh.
test('a venue list outage refuses a supplied identity instead of guessing the ticker (fail-closed)', async t => {
  expireMarketCaches(t);
  const providers = installProviders(t, { binanceSpot: { networkError: true } });
  const appState = mockAppState(t);
  mockProfiles(t, 'ZZOUTAGE');

  await withServer(async base => {
    const response = await fetch(assetUrl(base, 'ZZOUTAGE', {
      providerSymbol: 'ZZOUTAGEPAIRUSDT', exchange: 'BINANCE', instrumentType: 'spot', quoteCurrency: 'USDT'
    }));
    assert.equal(response.status, 503, 'an unverifiable identity must be refused, never assumed');
    assert.deepEqual(await response.json(), { error: 'Verified exchange candles unavailable for the selected coin.' });
  });

  assert.ok(providers.countIn('api.binance.com') >= 1, 'the route must at least try to verify the identity');
  assert.deepEqual(appState.quotes, [], 'no ticker resolution may happen on behalf of an unverified identity');
  assert.deepEqual(providers.unexpected, []);
});

test('a deep link without pair parameters keeps the legacy behaviour and never touches the venue lists', async t => {
  expireMarketCaches(t);
  const providers = installProviders(t, liveProviders());
  const appState = mockAppState(t);
  mockProfiles(t, 'ZZPAIR');

  await withServer(async base => {
    const response = await fetch(assetUrl(base, 'ZZPAIR'));
    assert.equal(response.status, 200);
    const body = await response.json() as any;
    assert.equal(body.dataAvailability, 'aggregated-price-only');
    assert.equal(body.error, undefined);
    assert.equal(body.info.symbol, 'ZZPAIR');
  });

  assert.equal(providers.countIn('api.binance.com'), 0, 'a link without a pair identity must not buy a market list');
  assert.equal(providers.countIn('fapi.binance.com'), 0);
  assert.deepEqual(providers.unexpected, []);
  assert.deepEqual(appState.quotes, ['ZZPAIR'], 'the ticker path itself must stay untouched');
});

test('the exact pair supplied by the search row is confirmed on the exchange and holds as the identity', async t => {
  expireMarketCaches(t);
  const providers = installProviders(t, liveProviders());
  const appState = mockAppState(t);
  mockProfiles(t, 'ZZPAIR');

  await withServer(async base => {
    const response = await fetch(assetUrl(base, 'ZZPAIR', {
      providerSymbol: 'ZZPAIRUSDT', exchange: 'BINANCE', instrumentType: 'spot', quoteCurrency: 'USDT'
    }));
    assert.equal(response.status, 200, 'a confirmed venue pair must not be refused');
    const body = await response.json() as any;
    assert.equal(body.dataAvailability, 'aggregated-price-only');
    assert.equal(body.error, undefined);
  });

  assert.ok(providers.countIn('api.binance.com') >= 1, 'the supplied pair must be verified against the venue list');
  assert.deepEqual(providers.unexpected, []);
  assert.deepEqual(appState.quotes, ['ZZPAIR']);
});

test('an unconfirmable venue identity is refused with the explicit 503 instead of resolving the ticker', async t => {
  expireMarketCaches(t);
  const providers = installProviders(t, liveProviders());
  const appState = mockAppState(t);
  mockProfiles(t, 'ZZDELISTED');

  await withServer(async base => {
    // Control: the very same ticker without a venue identity keeps today's behaviour.
    const control = await fetch(assetUrl(base, 'ZZDELISTED'));
    assert.equal(control.status, 200);
    assert.equal((await control.json() as any).dataAvailability, 'aggregated-price-only');

    const refused: Array<{ symbol: string; params: Record<string, string> }> = [
      // 1. The pair is not in the venue's live list.
      { symbol: 'ZZDELISTED', params: { providerSymbol: 'ZZDELISTEDUSDT', exchange: 'BINANCE', instrumentType: 'spot', quoteCurrency: 'USDT' } },
      // 2. The pair belongs to a different ticker (a collision must never open this one).
      { symbol: 'ZZDELISTED', params: { providerSymbol: 'ZZPAIRBTC', exchange: 'BINANCE', instrumentType: 'spot', quoteCurrency: 'BTC' } },
      // 3. The quoted currency contradicts the venue pair.
      { symbol: 'ZZPAIR', params: { providerSymbol: 'ZZPAIRUSDT', exchange: 'BINANCE', instrumentType: 'spot', quoteCurrency: 'EUR' } },
      // 4. A perpetual claim that is not a live perpetual on the futures venue.
      { symbol: 'ZZPERPUSDT.P', params: { providerSymbol: 'ZZPERP2USDT', exchange: 'BINANCE Futures', instrumentType: 'perpetual', quoteCurrency: 'USDT' } }
    ];
    for (const { symbol, params } of refused) {
      const response = await fetch(assetUrl(base, symbol, params));
      assert.equal(response.status, 503, `${params.providerSymbol} must be refused explicitly`);
      assert.deepEqual(await response.json(), { error: 'Verified exchange candles unavailable for the selected coin.' });
    }
  });

  // The refusals return before any ticker resolution: only the control reached a quote.
  assert.deepEqual(appState.quotes, ['ZZDELISTED']);
  assert.deepEqual(providers.unexpected, []);
});

test('a confirmed pair on a catalog asset is verification only: the payload is unchanged', async t => {
  expireMarketCaches(t);
  const providers = installProviders(t, liveProviders());
  const appState = mockAppState(t);
  mockProfiles(t, 'BTC');

  await withServer(async base => {
    const without = await (await fetch(assetUrl(base, 'BTC'))).json();
    const withPair = await (await fetch(assetUrl(base, 'BTC', {
      providerSymbol: 'BTCUSDT', exchange: 'BINANCE', instrumentType: 'spot', quoteCurrency: 'USDT'
    }))).json();
    assert.deepEqual(withPair, without, 'verifying the pair must not rewrite the payload');
  });

  assert.ok(providers.countIn('api.binance.com') >= 1);
  assert.deepEqual(appState.quotes, ['BTC', 'BTC']);
});

test('venue claims this server cannot verify are ignored, not refused', async t => {
  expireMarketCaches(t);
  const providers = installProviders(t, liveProviders());
  const appState = mockAppState(t);
  mockProfiles(t, 'ZZPAIR');

  const ignored: Array<Record<string, string>> = [
    // Yahoo stock/index row.
    { providerSymbol: 'ZZPAIR', exchange: 'NMS', instrumentType: 'equity', quoteCurrency: 'USD' },
    // Yahoo crypto row (separator-bearing provider symbol, not a venue pair).
    { providerSymbol: 'ZZPAIR-USD', exchange: 'CCC', instrumentType: 'spot', quoteCurrency: 'USD' },
    // CoinGecko row.
    { providerSymbol: 'ZZPAIR', exchange: 'COINGECKO', instrumentType: 'spot', quoteCurrency: 'USD' },
    // Incoherent claim: a Binance venue with a non-venue instrument type.
    { providerSymbol: 'ZZPAIRUSDT', exchange: 'BINANCE', instrumentType: 'equity', quoteCurrency: 'USD' }
  ];
  await withServer(async base => {
    for (const params of ignored) {
      const response = await fetch(assetUrl(base, 'ZZPAIR', params));
      assert.equal(response.status, 200, `${params.exchange} ${params.providerSymbol} must keep the legacy behaviour`);
      assert.equal((await response.json() as any).dataAvailability, 'aggregated-price-only');
    }
  });

  assert.equal(providers.countIn('api.binance.com'), 0, 'non-venue claims must not buy a venue lookup');
  assert.deepEqual(providers.unexpected, []);
  assert.equal(appState.quotes.length, ignored.length);
});
