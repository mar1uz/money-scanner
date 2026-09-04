import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CryptoMarketProfiles, aggregatedCryptoDetail, normalizeCryptoProfile, cryptoMarketProfiles } from './crypto-market-profile.js';
import { scannerRouter } from '../routes/scanner-routes.js';
import { AppState } from './app-state.js';

const row = (overrides = {}) => ({
  id: 'pons', symbol: 'pons', name: 'Pons', current_price: 0.7,
  market_cap: 500, market_cap_rank: 105, price_change_percentage_24h: 20,
  high_24h: 0.8, low_24h: 0.5, total_volume: 100,
  last_updated: new Date().toISOString(), ...overrides
});
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

test('provider data validation preserves missing metrics, rejects fabricated timestamps and invalid prices', () => {
  assert.equal(normalizeCryptoProfile(row({ current_price: null }), 'coingecko'), null);
  assert.equal(normalizeCryptoProfile(row({ current_price: 0 }), 'coingecko'), null);
  assert.equal(normalizeCryptoProfile(row({ last_updated: null }), 'coingecko'), null);
  const profile = normalizeCryptoProfile(row({ high_24h: null, total_volume: null, price_change_percentage_24h: null }), 'coingecko')!;
  assert.equal(profile.high24h, null);
  assert.equal(profile.volume24h, null);
  assert.equal(profile.change24h, null);
});

test('a bubble-only PONS opens with its exact provider ID, price history and no synthetic OHLCV / signals', async () => {
  const urls: string[] = [];
  const profiles = new CryptoMarketProfiles(async input => {
    urls.push(String(input));
    return response(String(input).includes('market_chart')
      ? { prices: [[2000, 0.8], [1000, 0.7], [2000, 0.9], [3000, null]] }
      : [row()]);
  });
  const result = await aggregatedCryptoDetail('PONS', '1w', { coinGeckoId: 'pons' }, profiles);
  assert.equal(result.info.name, 'Pons');
  assert.equal(result.info.coinGeckoId, 'pons');
  assert.equal(result.quote.price, 0.7);
  assert.equal(result.quote.volume24h, 100);
  assert.deepEqual(result.priceHistory, [[1000, 0.7], [2000, 0.9]]);
  assert.deepEqual(result.candles, []);
  assert.equal(result.activeSignal, null);
  assert.equal(result.multiTimeframe, null);
  assert.equal(result.aiExplanation, null);
  assert.equal(urls.length, 2);
  assert.ok(urls.every(url => !url.includes('binance')));
});

test('Bubbles cache supplies the real quote even when history is rate limited', async () => {
  const profiles = new CryptoMarketProfiles(async () => response({}, 429));
  profiles.remember([row()], 'coingecko');
  const result = await aggregatedCryptoDetail('PONS', '1w', { coinGeckoId: 'pons' }, profiles);
  assert.equal(result.quote.price, 0.7);
  assert.deepEqual(result.priceHistory, []);
});

test('cached quote keeps provider time and is explicitly stale', async () => {
  const profiles = new CryptoMarketProfiles(async () => response({}, 429));
  const timestamp = Date.now() - 15 * 60_000;
  profiles.remember([row({ last_updated: new Date(timestamp).toISOString() })], 'coingecko');
  const result = await aggregatedCryptoDetail('PONS', '1w', { coinGeckoId: 'pons' }, profiles);
  assert.equal(result.quote.timestamp, timestamp);
  assert.equal(result.quote.isStale, true);
});

test('CoinPaprika IDs are not passed to CoinGecko and absent metrics stay null', async () => {
  const urls: string[] = [];
  const profiles = new CryptoMarketProfiles(async input => {
    urls.push(String(input));
    return response({ id: 'pons-pons', symbol: 'PONS', name: 'Pons', rank: 105,
      last_updated: new Date().toISOString(), quotes: { USD: { price: 0.7, volume_24h: 100, percent_change_24h: 20, market_cap: 500 } } });
  });
  const result = await aggregatedCryptoDetail('PONS', '1w', { coinPaprikaId: 'pons-pons' }, profiles);
  assert.equal(result.info.coinPaprikaId, 'pons-pons');
  assert.equal(result.info.coinGeckoId, undefined);
  assert.equal(result.quote.high24h, null);
  assert.equal(result.quote.source, 'CoinPaprika');
  assert.deepEqual(urls, ['https://api.coinpaprika.com/v1/tickers/pons-pons']);
});

test('ambiguous symbols and mismatched exact IDs never silently select another coin', async () => {
  const profiles = new CryptoMarketProfiles(async () => response({ coins: [
    { id: 'one', symbol: 'DUP' }, { id: 'two', symbol: 'DUP' }
  ] }));
  await assert.rejects(profiles.resolve('DUP'), /ambiguous/);
  profiles.remember([row()], 'coingecko');
  await assert.rejects(profiles.resolve('BTC', { coinGeckoId: 'pons' }), /mismatch/);
  await assert.rejects(profiles.resolve('PONS', { coinGeckoId: '../pons' }), /Invalid/);
  await assert.rejects(profiles.resolve('PONS', { coinGeckoId: 'pons', coinPaprikaId: 'pons-pons' }), /Ambiguous/);
});

test('symbol-only deep links resolve exact CoinGecko identity; total upstream failure stays an error', async () => {
  const profiles = new CryptoMarketProfiles(async input => response(String(input).includes('/search?')
    ? { coins: [{ id: 'not-pons', symbol: 'PONSTAR' }, { id: 'pons', symbol: 'PONS' }] } : [row()]));
  assert.equal((await profiles.resolve('PONS')).id, 'pons');
  const failed = new CryptoMarketProfiles(async () => response({}, 429));
  await assert.rejects(failed.resolve('PONS', { coinGeckoId: 'pons' }), /429/);
});

test('asset endpoint returns HTTP success for PONS without calling Binance candles', async t => {
  const profile = normalizeCryptoProfile(row(), 'coingecko')!;
  t.mock.method(cryptoMarketProfiles, 'resolve', async () => profile);
  t.mock.method(cryptoMarketProfiles, 'prices', async () => [[1000, 0.7], [2000, 0.8]]);
  t.mock.method(AppState, 'getInstance', () => ({ marketData: {
    getTopCryptoAssets: async () => [],
    getPriceQuote: async () => { throw new Error('Binance Invalid symbol'); },
    getCandles: async () => { assert.fail('Unsupported PONS must not request Binance candles'); }
  } }));
  const handler = (scannerRouter.stack.find((layer: any) => layer.route?.path === '/assets/:symbol') as any).route.stack[0].handle;
  for (const reference of [{ coinGeckoId: 'pons' }, {}]) {
    let body: any;
    const res = { json: (value: any) => { body = value; }, status: (status: number) => { assert.fail(`Unexpected HTTP ${status}`); } };
    await handler({ params: { symbol: 'PONS' }, query: { marketClass: 'crypto', timeframe: '1w', ...reference } }, res);
    assert.equal(body.info.name, 'Pons');
    assert.equal(body.quote.price, 0.7);
    assert.equal(body.dataAvailability, 'aggregated-price-only');
  }
});

test('Bitcoin from Bubbles retains existing exchange candles and Money Line route', async t => {
  const profile = normalizeCryptoProfile(row({ id: 'bitcoin', symbol: 'btc', name: 'Bitcoin' }), 'coingecko')!;
  t.mock.method(cryptoMarketProfiles, 'resolve', async () => profile);
  t.mock.method(cryptoMarketProfiles, 'prices', async () => { assert.fail('BTC must retain exchange OHLCV'); });
  let candleCalls = 0;
  t.mock.method(AppState, 'getInstance', () => ({
    marketData: { getPriceQuote: async () => ({ price: 1 }), getCandles: async () => { candleCalls++; return []; } },
    moneyLine: { calculateLatest: () => null },
    news: { getNewsForAsset: async () => [], getCachedNewsForAsset: () => [] },
    social: { getPostsForSymbol: () => [], getTrendingTopics: () => [] }
  }));
  const handler = (scannerRouter.stack.find((layer: any) => layer.route?.path === '/assets/:symbol') as any).route.stack[0].handle;
  let body: any;
  await handler({ params: { symbol: 'BTC' }, query: { marketClass: 'crypto', timeframe: '1w', coinGeckoId: 'bitcoin' } },
    { json: (value: any) => { body = value; }, status: (status: number) => { assert.fail(`Unexpected HTTP ${status}`); } });
  assert.equal(candleCalls, 6);
  assert.equal(body.info.name, 'Bitcoin');
  assert.equal(body.dataAvailability, undefined);
});
