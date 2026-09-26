import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { MarketDataService } from './market-service.js';
import type { VenuePairRouting } from './market-service.js';

/**
 * Exact venue-pair routing of candles (search-row identity, F6/B3/B4).
 *
 * The API route forwards a pair ONLY after its gate verified it against the
 * venue's own live market list. These tests pin the market-data contract:
 *   - a routed pair is fetched verbatim (`BTCEUR`, `CAKEBTC`, never
 *     `BTCEURUSDT`) and never resolved through the chart resolver;
 *   - without a pair every call looks exactly like before (canonical
 *     `${symbol}USDT`, resolver consulted);
 *   - the pair is part of the candle cache identity, so two markets of the
 *     same base asset can never be served from one another's cache entry;
 *   - a pair the venue cannot have produced (other venue, other instrument,
 *     wrong base) is ignored, not guessed.
 */

const kline = (timestamp: number, close: number) => [timestamp, String(close), String(close), String(close), String(close), '10'];

const installKlineFetch = (t: TestContext, close = 100) => {
  const urls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: any) => {
    const url = String(input);
    urls.push(url);
    if (url.includes('/klines')) {
      return Response.json([
        kline(1_700_000_000_000, close),
        kline(1_700_003_600_000, close + 1)
      ]);
    }
    return new Response('not found', { status: 404 });
  });
  return urls;
};

const requestedSymbol = (urls: string[]) => {
  const klineUrls = urls.filter(url => url.includes('/klines'));
  return klineUrls.map(url => new URL(url).searchParams.get('symbol'));
};

const BINANCE_BTCEUR: VenuePairRouting = { providerSymbol: 'BTCEUR', exchange: 'BINANCE', instrumentType: 'spot', quoteCurrency: 'EUR' };

test('a confirmed pair is fetched verbatim and never resolved through the chart resolver', async t => {
  const urls = installKlineFetch(t);
  const service = new MarketDataService();
  const resolverCalls: string[] = [];
  (service as any).chartResolver.resolve = async (symbol: string, coinId?: string) => { resolverCalls.push(`${symbol}:${coinId || ''}`); return null; };

  const candles = await service.getCandles('BTC', '1h', 2, 'crypto', undefined, BINANCE_BTCEUR);
  assert.equal(candles.length, 2);
  assert.deepEqual(requestedSymbol(urls), ['BTCEUR'], 'the candles must come from the clicked pair');
  assert.deepEqual(resolverCalls, [], 'a venue-confirmed pair is the verified market; no resolver call may veto it');
});

test('without a pair the canonical market is requested exactly as before', async t => {
  const urls = installKlineFetch(t);
  const service = new MarketDataService();

  await service.getCandles('BTC', '1h', 2, 'crypto');
  assert.deepEqual(requestedSymbol(urls), ['BTCUSDT']);
});

test('the pair is part of the candle cache identity', async t => {
  const urls = installKlineFetch(t);
  const service = new MarketDataService();

  await service.getCandles('BTC', '1h', 2, 'crypto');
  await service.getCandles('BTC', '1h', 2, 'crypto', undefined, BINANCE_BTCEUR);
  assert.deepEqual(requestedSymbol(urls), ['BTCUSDT', 'BTCEUR'], 'a second market of the same asset must not be served from the first cache entry');

  // Within the TTL each pair still answers from its own entry: no third fetch.
  await service.getCandles('BTC', '1h', 2, 'crypto', undefined, BINANCE_BTCEUR);
  await service.getCandles('BTC', '1h', 2, 'crypto');
  assert.equal(requestedSymbol(urls).length, 2);
});

test('a pair the venue cannot have produced is ignored, not guessed', async t => {
  const urls = installKlineFetch(t);
  const service = new MarketDataService();

  const foreign = [
    { ...BINANCE_BTCEUR, exchange: 'BYBIT' },
    { ...BINANCE_BTCEUR, instrumentType: 'perpetual' },
    { ...BINANCE_BTCEUR, providerSymbol: 'ETHEUR' },
    { ...BINANCE_BTCEUR, providerSymbol: 'BT-CEUR' }
  ];
  for (const pair of foreign) {
    await service.getCandles('BTC', '1h', 2, 'crypto', undefined, pair as VenuePairRouting);
  }
  assert.deepEqual(requestedSymbol(urls), ['BTCUSDT'], 'an unusable pair keeps the canonical market (and its cache entry)');
  assert.ok(urls.every(url => !/ETHEUR|BT-CEUR|PERPETUAL/.test(url)), 'no claim outside Binance spot may reach the venue');
});

test('a confirmed pair keeps older candle pages on the same market', async t => {
  const urls = installKlineFetch(t);
  const service = new MarketDataService();

  await service.getCandlesBefore('CAKE', '1d', Date.now(), 500, 'crypto', undefined, {
    providerSymbol: 'CAKEBTC', exchange: 'BINANCE', instrumentType: 'spot', quoteCurrency: 'BTC'
  });
  assert.deepEqual(requestedSymbol(urls), ['CAKEBTC']);

  await service.getCandlesBefore('CAKE', '1d', Date.now(), 500, 'crypto');
  assert.deepEqual(requestedSymbol(urls), ['CAKEBTC', 'CAKEUSDT'], 'a legacy request still reads the canonical market');
});

test('a confirmed pair serves an exact-identity coin whose chart market cannot be resolved', async t => {
  const urls = installKlineFetch(t);
  const service = new MarketDataService();
  (service as any).chartResolver.resolve = async () => null;

  // Without the pair the identity fail-closed refuses (the piped-in case).
  await assert.rejects(service.getCandles('BTC', '1d', 100, 'crypto', 'bitcoin'), /No identity-verified/);
  await assert.rejects(service.getCandlesBefore('BTC', '1d', Date.now(), 100, 'crypto', 'bitcoin'), /No identity-verified/);

  // The venue itself confirmed BTCEUR for this base asset: that is the identity.
  const candles = await service.getCandles('BTC', '1d', 2, 'crypto', 'bitcoin', BINANCE_BTCEUR);
  assert.equal(candles.length, 2);
  assert.deepEqual(requestedSymbol(urls), ['BTCEUR']);
  await service.getCandlesBefore('BTC', '1d', Date.now(), 100, 'crypto', 'bitcoin', BINANCE_BTCEUR);
  assert.deepEqual(requestedSymbol(urls), ['BTCEUR', 'BTCEUR']);
});

test('a binance_spot chart market is fetched as its qualified pair, never double-suffixed', async t => {
  const urls = installKlineFetch(t);
  const service = new MarketDataService();
  (service as any).resolveCryptoChartMarket = async () => ({ source: 'binance_spot', providerSymbol: 'ZZPAIRUSDT' });

  await service.getCandles('ZZPAIR', '1h', 2, 'crypto');
  await service.getCandlesBefore('ZZPAIR', '1h', Date.now(), 100, 'crypto');
  assert.deepEqual(requestedSymbol(urls), ['ZZPAIRUSDT', 'ZZPAIRUSDT']);
});
