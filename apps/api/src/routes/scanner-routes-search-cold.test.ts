import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { scannerRouter } from './scanner-routes.js';
import { AppState } from '../services/app-state.js';

/**
 * Cold-start regression for the Binance market cache (audit F2): a single
 * transient failure on an empty cache used to write an empty result with a 15
 * minute TTL, removing every Binance pair from search until it expired.
 *
 * This lives in its own file on purpose. The caches are per-process module
 * state, and only a fresh import reproduces "first request after a deploy".
 */
test('a cold Binance failure never freezes an empty market list for 15 minutes', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  const realFetch = globalThis.fetch;
  const calls: string[] = [];
  let binanceDown = true;
  t.mock.method(globalThis, 'fetch', async (input: any, init?: any) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.startsWith('http://127.0.0.1:')) return realFetch(input, init);
    calls.push(url);
    if (url.includes('binance.com')) {
      if (binanceDown) throw new TypeError('fetch failed');
      return new Response(JSON.stringify({
        symbols: [{ symbol: 'COLDBINUSDT', baseAsset: 'COLDBIN', quoteAsset: 'USDT', status: 'TRADING', contractType: 'PERPETUAL' }]
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.includes('finance.yahoo.com')) return new Response(JSON.stringify({ quotes: [] }), { status: 200 });
    if (url.includes('api.coingecko.com')) return new Response(JSON.stringify({ coins: [] }), { status: 200 });
    throw new Error(`Unexpected outbound request from the search route: ${url}`);
  });
  t.mock.method(AppState, 'getInstance', () => ({
    marketData: { getTopCryptoAssets: async () => [] },
    cachedSignals: new Map()
  } as any));

  const app = express();
  app.use('/api', scannerRouter);
  const server = app.listen(0);
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  try {
    // Cold cache, provider down: the route still answers, without Binance rows.
    const degraded = await (await fetch(`${base}/api/search?q=coldbin`)).json() as any[];
    assert.equal(degraded.some(result => result.displaySymbol === 'COLDBINUSDT'), false);
    const attempts = calls.filter(url => url.includes('binance.com')).length;
    assert.equal(attempts, 2, 'both market lists must be attempted once on a cold cache');

    // Inside the backoff window a second query must not hammer the dead provider.
    await (await fetch(`${base}/api/search?q=coldbin2`)).json();
    assert.equal(calls.filter(url => url.includes('binance.com')).length, attempts);

    // Past the backoff, a recovered provider must be picked up again: the first
    // failed call did not write an empty cache stamped 15 minutes into the future.
    t.mock.timers.tick(31_000);
    binanceDown = false;
    const recovered = await (await fetch(`${base}/api/search?q=coldbin`)).json() as any[];
    assert.ok(
      recovered.some(result => result.displaySymbol === 'COLDBINUSDT'),
      'the market list must be retried and served after the backoff'
    );
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
