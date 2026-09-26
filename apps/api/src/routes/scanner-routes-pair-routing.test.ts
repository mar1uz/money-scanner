import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { scannerRouter } from './scanner-routes.js';
import { AppState } from '../services/app-state.js';
import { cryptoMarketProfiles } from '../services/crypto-market-profile.js';
import { dexMarketData } from '../services/dex-market-data.js';

/**
 * Round-trip of the confirmed venue pair into the market-data layer (F6/B3/B4).
 *
 * The asset route already verified the search row's pair against the venue's
 * live list; these tests pin the plumbing after that verdict:
 *   - candles (all timeframes) and older pages are requested on the exact pair,
 *     so the chart shows the market the user clicked (BTCEUR) instead of
 *     `${symbol}USDT`;
 *   - the quote stays on the canonical market (a EUR/BTC-quoted number must
 *     never be labelled as a USDT price);
 *   - a pair quoted in something other than USDT is marked in the payload
 *     (`candlePair`); a plain USDT pair keeps the payload byte for byte.
 */

interface ProviderReply { body?: unknown; status?: number }

const SPOT_LIST = [
  { symbol: 'BTCEUR', baseAsset: 'BTC', quoteAsset: 'EUR', status: 'TRADING' },
  { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', status: 'TRADING' },
  { symbol: 'CAKEBTC', baseAsset: 'CAKE', quoteAsset: 'BTC', status: 'TRADING' }
];

const installVenueFetch = (t: TestContext) => {
  const calls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: any) => {
    const url = String(input);
    calls.push(url);
    if (url.includes('api.binance.com/api/v3/exchangeInfo')) {
      return new Response(JSON.stringify({ symbols: SPOT_LIST }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new TypeError(`Unexpected outbound request from the asset route: ${url}`);
  });
  return calls;
};

let mockClock = Date.now();
const expireMarketCaches = (t: TestContext) => {
  mockClock += 60 * 60_000;
  t.mock.timers.enable({ apis: ['Date'], now: mockClock });
};

const mockAppState = (t: TestContext) => {
  const calls = {
    quotes: [] as Array<{ symbol: string; pair?: unknown }>,
    candles: [] as Array<{ symbol: string; timeframe: string; pair?: any }>,
    candlesBefore: [] as Array<{ symbol: string; pair?: any }>
  };
  t.mock.method(AppState, 'getInstance', () => ({
    marketData: {
      getTopCryptoAssets: async () => [],
      getPriceQuote: async (symbol: string, _marketClass?: string, _coinGeckoId?: string, pair?: unknown) => {
        calls.quotes.push({ symbol, pair });
        return { symbol, price: 100000, change24h: 1, high24h: 101000, low24h: 99000, volume24h: 5, source: 'Binance', timestamp: Date.now(), isStale: false };
      },
      getCandles: async (symbol: string, timeframe: string, _limit: number, _marketClass?: string, _coinGeckoId?: string, pair?: unknown) => {
        calls.candles.push({ symbol, timeframe, pair });
        return [];
      },
      getCandlesBefore: async (symbol: string, _timeframe: string, _before: number, _limit: number, _marketClass?: string, _coinGeckoId?: string, pair?: unknown) => {
        calls.candlesBefore.push({ symbol, pair });
        return [];
      },
      resolveChartMarket: async () => null
    },
    moneyLine: { calculateLatest: () => null },
    news: { getNewsForAsset: async () => [], getCachedNewsForAsset: () => [] },
    social: { getPostsForSymbol: () => [], getTrendingTopics: () => [] }
  } as any));
  return calls;
};

const mockProfiles = (t: TestContext) => {
  t.mock.method(cryptoMarketProfiles, 'resolveCandidates', async () => []);
  t.mock.method(dexMarketData, 'load', async () => null);
};

const assetHandler = () =>
  (scannerRouter.stack.find((layer: any) => layer.route?.path === '/assets/:symbol') as any).route.stack[0].handle;
const candlesHandler = () =>
  (scannerRouter.stack.find((layer: any) => layer.route?.path === '/assets/:symbol/candles') as any).route.stack[0].handle;

const callRoute = async (
  handler: any,
  params: Record<string, string>,
  query: Record<string, unknown>
) => {
  let body: any;
  let status: number | undefined;
  const res = {
    json: (value: any) => { body = value; },
    status: (code: number) => { status = code; return res; }
  };
  await handler({ params, query }, res);
  return { status, body };
};

test('a confirmed non-USDT pair is used for every candle timeframe and marked in the payload', async t => {
  expireMarketCaches(t);
  const venueCalls = installVenueFetch(t);
  const calls = mockAppState(t);
  mockProfiles(t);

  const { status, body } = await callRoute(assetHandler(), { symbol: 'BTC' }, {
    marketClass: 'crypto', timeframe: '1w',
    providerSymbol: 'BTCEUR', exchange: 'BINANCE', instrumentType: 'spot', quoteCurrency: 'EUR'
  });

  assert.equal(status, undefined);
  assert.equal(calls.candles.length, 6, 'all six timeframes are loaded');
  assert.ok(calls.candles.every(call => call.pair?.providerSymbol === 'BTCEUR'), 'every timeframe must read the clicked pair');
  assert.deepEqual(calls.quotes, [{ symbol: 'BTC', pair: undefined }], 'the quote stays on the canonical market');
  assert.deepEqual(body.candlePair, {
    providerSymbol: 'BTCEUR', exchange: 'BINANCE', instrumentType: 'spot', quoteCurrency: 'EUR'
  });
  assert.ok(venueCalls.some(url => url.includes('api.binance.com/api/v3/exchangeInfo')), 'the pair must be verified against the venue list');
});

test('a confirmed USDT pair routes the candles but leaves the payload unchanged', async t => {
  expireMarketCaches(t);
  installVenueFetch(t);
  const calls = mockAppState(t);
  mockProfiles(t);

  const { status, body } = await callRoute(assetHandler(), { symbol: 'BTC' }, {
    marketClass: 'crypto', timeframe: '1w',
    providerSymbol: 'BTCUSDT', exchange: 'BINANCE', instrumentType: 'spot', quoteCurrency: 'USDT'
  });

  assert.equal(status, undefined);
  assert.ok(calls.candles.every(call => call.pair?.providerSymbol === 'BTCUSDT'));
  assert.equal('candlePair' in body, false, 'a USDT pair is the canonical series: no marker');
});

test('older candle pages keep reading the exact pair the chart started from', async t => {
  expireMarketCaches(t);
  installVenueFetch(t);
  const calls = mockAppState(t);
  mockProfiles(t);

  const { status, body } = await callRoute(candlesHandler(), { symbol: 'CAKE' }, {
    timeframe: '1d', before: Date.now() - 86_400_000, limit: '500', marketClass: 'crypto',
    providerSymbol: 'CAKEBTC', exchange: 'BINANCE', instrumentType: 'spot', quoteCurrency: 'BTC'
  });

  assert.equal(status, undefined);
  assert.deepEqual(calls.candlesBefore, [{ symbol: 'CAKE', pair: { providerSymbol: 'CAKEBTC', exchange: 'BINANCE', instrumentType: 'spot', quoteCurrency: 'BTC' } }]);
  assert.equal(body.candlePair.quoteCurrency, 'BTC', 'the BTC-quoted series must be labelled in the page payload');
});

test('an unconfirmable pair is refused on the pagination route instead of resolving the ticker', async t => {
  expireMarketCaches(t);
  installVenueFetch(t);
  const calls = mockAppState(t);
  mockProfiles(t);

  const { status, body } = await callRoute(candlesHandler(), { symbol: 'CAKE' }, {
    timeframe: '1d', before: Date.now() - 86_400_000, limit: '500', marketClass: 'crypto',
    providerSymbol: 'CAKEUSDT', exchange: 'BINANCE', instrumentType: 'spot', quoteCurrency: 'USDT'
  });

  assert.equal(status, 503);
  assert.deepEqual(body, { error: 'Verified exchange candles unavailable for the selected coin.' });
  assert.deepEqual(calls.candlesBefore, [], 'no candle page may be served for an unverified identity');
});
