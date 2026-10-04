import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DexMarketDataService, aggregateDexCandles, normalizeDexCandles, selectExactMostLiquidPair } from './dex-market-data.js';
import type { CryptoMarketProfile } from './crypto-market-profile.js';

const profile: CryptoMarketProfile = {
  id: 'pons', provider: 'coingecko', symbol: 'PONS', name: 'Pons', price: 0.7, change24h: 20,
  marketCap: 500_000_000, rank: 105, high24h: 0.8, low24h: 0.5, volume24h: 100_000_000, timestamp: Date.now()
};
const address = '0x39dbed3a2bd333467115de45665cc57f813c4571';
const pair = (overrides: any = {}) => ({
  chainId: 'robinhood', dexId: 'uniswap', url: 'https://dexscreener.com/robinhood/pool', pairAddress: '0xpool',
  baseToken: { address, symbol: 'PONS', name: 'Pons' }, quoteToken: { symbol: 'WETH' }, priceUsd: '0.7',
  priceChange: { m5: 1, h1: 2, h6: 3, h24: 4 }, volume: { m5: 5, h1: 6, h6: 7, h24: 8 },
  liquidity: { usd: 100 }, fdv: 500, marketCap: 450, txns: { h24: { buys: 10, sells: 11 } }, pairCreatedAt: 123,
  ...overrides
});
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

test('selects only the exact base token and chooses highest real USD liquidity', () => {
  const selected = selectExactMostLiquidPair([
    pair({ liquidity: { usd: 100 } }), pair({ pairAddress: '0xrich', liquidity: { usd: 500 } }),
    pair({ pairAddress: '0xquote', baseToken: { address: 'other', symbol: 'OTHER', name: 'Other' }, quoteToken: { address, symbol: 'PONS' }, liquidity: { usd: 9999 } }),
    pair({ pairAddress: '0xlookalike', baseToken: { address, symbol: 'PONS', name: 'Fake Pons' }, liquidity: { usd: 9999 } })
  ], profile, address);
  assert.equal(selected.pairAddress, '0xrich');
});

test('accepts on-chain base token when contract name matches profile symbol (e.g. Akedo $AKE)', () => {
  const akedoProfile: CryptoMarketProfile = {
    id: 'akedo', provider: 'coingecko', symbol: 'AKE', name: 'Akedo', price: 0.019, change24h: 41,
    marketCap: 435_000_000, rank: 117, high24h: 0.021, low24h: 0.012, volume24h: 123_000_000, timestamp: Date.now()
  };
  const akedoAddress = '0x2c3a8ee94ddd97244a93bc48298f97d2c412f7db';
  const akedoPair = pair({
    pairAddress: '0xpancake',
    baseToken: { address: akedoAddress, symbol: 'AKE', name: 'AKE' },
    liquidity: { usd: 2_300_000 }
  });
  const selected = selectExactMostLiquidPair([akedoPair], akedoProfile, akedoAddress);
  assert.equal(selected?.pairAddress, '0xpancake');
});

test('rejects unsafe DEX URLs and malformed pair identifiers', () => {
  assert.equal(selectExactMostLiquidPair([pair({ url: 'https://evil.example/pool' })], profile, address), null);
  assert.equal(selectExactMostLiquidPair([pair({ pairAddress: '../pool' })], profile, address), null);
});

test('normalizes OHLCV, sorts/deduplicates and marks only completed candles closed', () => {
  const now = 2_000 * 1000 + 3_600_000;
  const candles = normalizeDexCandles([
    [2000, 2, 4, 1, 3, 20], [1000, 1, 3, 0.5, 2, 10], [1000, 1, 3, 0.5, 2.5, 11],
    [3000, 2, 1, 3, 2, 10], [4000, 0, 1, 0, 1, 10], ['bad']
  ], '1h', now);
  assert.equal(candles.length, 2);
  assert.deepEqual(candles.map(c => c.timestamp), [1_000_000, 2_000_000]);
  assert.equal(candles[0].close, 2.5);
  assert.equal(candles[0].isClosed, true);
  assert.equal(candles[1].isClosed, true);
});

test('aggregates real daily candles into Monday-based weekly OHLCV without filling gaps', () => {
  const day = 86_400_000;
  const monday = Date.UTC(2026, 7, 31);
  const source = [
    { timestamp: monday, open: 1, high: 3, low: 0.8, close: 2, volume: 10, isClosed: true },
    { timestamp: monday + 2 * day, open: 2, high: 4, low: 1.5, close: 3, volume: 20, isClosed: true },
    { timestamp: monday + 7 * day, open: 3, high: 5, low: 2.5, close: 4, volume: 30, isClosed: true }
  ];
  const weekly = aggregateDexCandles(source, '1w', monday + 15 * day);
  assert.equal(weekly.length, 2);
  assert.deepEqual(weekly[0], { timestamp: monday, open: 1, high: 4, low: 0.8, close: 3, volume: 30, isClosed: true });
  assert.equal(weekly[1].open, 3);
});

test('aggregates daily candles into calendar months and keeps the current month open', () => {
  const source = [
    { timestamp: Date.UTC(2026, 7, 1), open: 1, high: 2, low: 0.5, close: 1.5, volume: 10, isClosed: true },
    { timestamp: Date.UTC(2026, 7, 31), open: 1.5, high: 3, low: 1, close: 2.5, volume: 20, isClosed: true },
    { timestamp: Date.UTC(2026, 8, 1), open: 2.5, high: 4, low: 2, close: 3, volume: 30, isClosed: true }
  ];
  const monthly = aggregateDexCandles(source, '1m', Date.UTC(2026, 8, 4));
  assert.equal(monthly.length, 2);
  assert.equal(monthly[0].isClosed, true);
  assert.equal(monthly[1].isClosed, false);
  assert.equal(monthly[0].volume, 30);
});

test('loads verified contract, most-liquid DEX pair and GeckoTerminal OHLCV', async () => {
  const urls: string[] = [];
  const service = new DexMarketDataService(async input => {
    const url = String(input); urls.push(url);
    if (url.includes('api.coingecko.com')) return response({ id: 'pons', symbol: 'pons', name: 'Pons', asset_platform_id: 'robinhood', platforms: { robinhood: address } });
    if (url.includes('api.dexscreener.com')) return response({ pairs: [pair({ liquidity: { usd: 50_000 } }), pair({ pairAddress: '0xrich', liquidity: { usd: 100_000 } })] });
    return response({ data: { attributes: { ohlcv_list: [[1000, 1, 3, 0.5, 2, 10]] } } });
  });
  const result = await service.load(profile, '4h');
  assert.equal(result?.pairAddress, '0xrich');
  assert.equal(result?.liquidityUsd, 100_000);
  assert.equal(result?.transactions24h?.buys, 10);
  assert.equal(result?.candles.length, 1);
  assert.match(urls[2], /networks\/robinhood\/pools\/0xrich\/ohlcv\/hour\?aggregate=1/);
  await service.load(profile, '1d');
  assert.equal(urls.filter(url => url.includes('api.coingecko.com')).length, 1);
  assert.equal(urls.filter(url => url.includes('api.dexscreener.com')).length, 1);
  assert.equal(urls.filter(url => url.includes('api.geckoterminal.com')).length, 2);
  await service.load(profile, '8h');
  assert.equal(urls.filter(url => url.includes('api.geckoterminal.com')).length, 2, '8h reuses the verified hourly source page');
});

test('Ethereum DEX chain maps to GeckoTerminal eth network', async () => {
  const urls: string[] = [];
  const service = new DexMarketDataService(async input => {
    const url = String(input); urls.push(url);
    if (url.includes('api.coingecko.com')) return response({ id: 'pons', symbol: 'pons', name: 'Pons', asset_platform_id: 'ethereum', platforms: { ethereum: address } });
    if (url.includes('api.dexscreener.com')) return response({ pairs: [pair({ chainId: 'ethereum', liquidity: { usd: 50_000 } })] });
    return response({ data: { attributes: { ohlcv_list: [] } } });
  });
  await service.load(profile, '1w');
  assert.match(urls[2], /networks\/eth\/.+\/ohlcv\/day\?aggregate=1/);
});

test('DEX metrics survive an independent OHLCV outage without invented candles', async () => {
  const service = new DexMarketDataService(async input => {
    const url = String(input);
    if (url.includes('api.coingecko.com')) return response({ id: 'pons', symbol: 'pons', name: 'Pons', platforms: { robinhood: address } });
    if (url.includes('api.dexscreener.com')) return response({ pairs: [pair()] });
    return response({}, 503);
  });
  const result = await service.load(profile, '1d');
  assert.equal(result?.priceUsd, 0.7);
  assert.equal(result?.volume.h24, 8);
  assert.deepEqual(result?.candles, []);
});

test('provider identity mismatch blocks DEX lookup before pair selection', async () => {
  let calls = 0;
  const service = new DexMarketDataService(async () => { calls++; return response({ id: 'fake', symbol: 'pons', name: 'Pons', platforms: { robinhood: address } }); });
  assert.equal(await service.load(profile, '1h'), null);
  assert.equal(calls, 1);
});

test('CoinPaprika-only identities do not trigger unsafe symbol search', async () => {
  let calls = 0;
  const service = new DexMarketDataService(async () => { calls++; return response({}); });
  assert.equal(await service.load({ ...profile, provider: 'coinpaprika' }, '1h'), null);
  assert.equal(calls, 0);
});

test('numeric invalids remain absent rather than becoming zero metrics', async () => {
  const service = new DexMarketDataService(async input => {
    const url = String(input);
    if (url.includes('api.coingecko.com')) return response({ id: 'pons', symbol: 'pons', name: 'Pons', platforms: { robinhood: address } });
    if (url.includes('api.dexscreener.com')) return response({ pairs: [pair({ priceUsd: 'NaN', volume: { h24: -1 }, liquidity: { usd: 'no' }, txns: { h24: { buys: 1.5, sells: 2 } } })] });
    return response({ data: { attributes: { ohlcv_list: [] } } });
  });
  const result = await service.load(profile, '1h');
  assert.equal(result?.priceUsd, null);
  assert.equal(result?.volume.h24, null);
  assert.equal(result?.liquidityUsd, null);
  assert.equal(result?.transactions24h, null);
});


test('Solana base58 contract identity is case-sensitive, unlike EVM hex', () => {
  const contract='6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx';
  const solPair = pair({chainId:'solana',baseToken:{address:contract.toLowerCase(),symbol:'PONS',name:'Pons'}});
  assert.equal(selectExactMostLiquidPair([solPair],profile,contract),null);
  solPair.baseToken.address=contract;
  assert.equal(selectExactMostLiquidPair([solPair],profile,contract)?.chainId,'solana');
});
