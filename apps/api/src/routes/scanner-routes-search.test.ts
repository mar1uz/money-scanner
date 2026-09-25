import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { scannerRouter } from './scanner-routes.js';
import { AppState } from '../services/app-state.js';

/**
 * Route-level tests for GET /api/search.
 *
 * The route is mounted on a real Express server so the query parsing and the
 * response headers are the production ones. Every outbound provider call is
 * served by an injected fetch double keyed on URL, which also records what was
 * requested: that is how the cost guards (no provider call for a single
 * keystroke, no identity provider for two characters) are asserted.
 */

type ProviderName = 'binanceSpot' | 'binanceFutures' | 'yahoo' | 'coinGecko';

interface ProviderReply {
  status?: number;
  body?: unknown;
  networkError?: boolean;
  delayMs?: number;
}

const PROVIDERS: Array<{ name: ProviderName; fragment: string }> = [
  { name: 'binanceSpot', fragment: 'api.binance.com/api/v3/exchangeInfo' },
  { name: 'binanceFutures', fragment: 'fapi.binance.com/fapi/v1/exchangeInfo' },
  { name: 'yahoo', fragment: 'query1.finance.yahoo.com' },
  { name: 'coinGecko', fragment: 'api.coingecko.com/api/v3/search' }
];

const headersToRecord = (headers: unknown): Record<string, string> => {
  if (!headers) return {};
  if (headers instanceof Headers) {
    const record: Record<string, string> = {};
    headers.forEach((value, key) => { record[key] = value; });
    return record;
  }
  return { ...(headers as Record<string, string>) };
};

const installProviders = (t: TestContext, replies: Partial<Record<ProviderName, ProviderReply>>) => {
  const realFetch = globalThis.fetch;
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];
  const state: Partial<Record<ProviderName, ProviderReply>> = { ...replies };
  t.mock.method(globalThis, 'fetch', async (input: any, init?: any) => {
    const url = input instanceof Request ? input.url : String(input);
    // Requests made by the test itself must still reach the local server.
    if (url.startsWith('http://127.0.0.1:')) return realFetch(input, init);
    calls.push({ url, headers: headersToRecord(init?.headers) });
    const provider = PROVIDERS.find(entry => url.includes(entry.fragment));
    if (!provider) throw new Error(`Unexpected outbound request from the search route: ${url}`);
    const reply = state[provider.name];
    if (!reply) throw new Error(`Unexpected ${provider.name} call: ${url}`);
    if (reply.delayMs) await new Promise(resolve => setTimeout(resolve, reply.delayMs));
    if (reply.networkError) throw new TypeError('fetch failed');
    return new Response(reply.body === undefined ? '' : JSON.stringify(reply.body), {
      status: reply.status ?? 200,
      headers: { 'content-type': 'application/json' }
    });
  });
  return {
    calls,
    replies: state,
    countIn: (fragment: string, from = 0) => calls.slice(from).filter(call => call.url.includes(fragment)).length,
    findIn: (fragment: string, from = 0) => calls.slice(from).find(call => call.url.includes(fragment))
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

const universeAsset = {
  symbol: 'BTC', name: 'Bitcoin', marketClass: 'crypto', coinGeckoId: 'bitcoin',
  rank: 1, price: 60_000, category: 'Layer 1', aliases: ['btc']
};

/** The /search route must never touch a real AppState (providers, Firestore). */
const mockAppState = (t: TestContext) => {
  const cachedSignals = new Map<string, { score: number; tier: string }>();
  t.mock.method(AppState, 'getInstance', () => ({
    marketData: { getTopCryptoAssets: async () => [universeAsset] },
    cachedSignals
  } as any));
};

const binanceSpotRow = (symbol: string, base: string) => ({ symbol, baseAsset: base, quoteAsset: 'USDT', status: 'TRADING' });
const binanceFuturesRow = (symbol: string, base: string) => ({ ...binanceSpotRow(symbol, base), contractType: 'PERPETUAL' });

const okProviders = (spot: string, base: string) => ({
  binanceSpot: { body: { symbols: [binanceSpotRow(spot, base)] } },
  binanceFutures: { body: { symbols: [binanceFuturesRow(spot, base)] } },
  yahoo: { body: { quotes: [] } },
  coinGecko: { body: { coins: [] } }
});

const jsonOf = async (response: Response) => await response.json() as any[];

test('a repeated or array query parameter is a clean 400 without internal details', async t => {
  const providers = installProviders(t, okProviders('ZZBINUSDT', 'ZZBIN'));
  mockAppState(t);
  await withServer(async base => {
    for (const suffix of ['?q=bitcoin&q=btc', '?q[]=btc']) {
      const response = await fetch(`${base}/api/search${suffix}`);
      assert.equal(response.status, 400, `${suffix} must not crash the route`);
      const body = await response.json() as any;
      assert.equal(body.error, 'Invalid search query.');
      assert.equal(body.details, undefined);
      assert.equal(response.headers.get('cache-control'), null);
    }
  });
  assert.equal(providers.calls.length, 0, 'an invalid query must not reach any provider');
});

test('a single keystroke is answered from the catalog without a provider call', async t => {
  const providers = installProviders(t, {});
  mockAppState(t);
  await withServer(async base => {
    const response = await fetch(`${base}/api/search?q=n`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'private, max-age=15');
    const body = await jsonOf(response);
    assert.ok(body.length > 0);
    assert.ok(body.some(result => result.symbol === 'NVDA'), 'catalog prefix match must still be served');
  });
  assert.equal(providers.calls.length, 0, 'one keystroke must never buy a provider round trip');
});

test('two characters use the market list but never the identity providers', async t => {
  const providers = installProviders(t, okProviders('ZZBINUSDT', 'ZZBIN'));
  mockAppState(t);
  await withServer(async base => {
    // Warm the market-list cache the way a normal typed word would.
    assert.equal((await fetch(`${base}/api/search?q=zzbinx`)).status, 200);
    const before = providers.calls.length;
    const response = await fetch(`${base}/api/search?q=zz`);
    assert.equal(response.status, 200);
    const body = await jsonOf(response);
    assert.ok(body.some(result => result.displaySymbol === 'ZZBINUSDT'), 'cached market rows must still be searchable');
    assert.equal(providers.countIn('query1.finance.yahoo.com', before), 0);
    assert.equal(providers.countIn('api.coingecko.com', before), 0);
  });
});

test('Cache-Control is set on a computed response and on a cached one', async t => {
  const providers = installProviders(t, okProviders('ZZBINUSDT', 'ZZBIN'));
  mockAppState(t);
  await withServer(async base => {
    const computed = await fetch(`${base}/api/search?q=cachectl`);
    assert.equal(computed.status, 200);
    assert.equal(computed.headers.get('cache-control'), 'private, max-age=15');
    const before = providers.calls.length;
    const cached = await fetch(`${base}/api/search?q=cachectl`);
    assert.equal(cached.status, 200);
    assert.equal(cached.headers.get('cache-control'), 'private, max-age=15');
    assert.equal(providers.calls.length, before, 'the second response must come from the response cache');
    assert.deepEqual(await cached.json(), await computed.clone().json());
  });
});

test('identical concurrent queries execute the upstream pipeline once', async t => {
  const providers = installProviders(t, {
    ...okProviders('ZZBINUSDT', 'ZZBIN'),
    yahoo: { body: { quotes: [] }, delayMs: 40 },
    coinGecko: { body: { coins: [] }, delayMs: 40 }
  });
  mockAppState(t);
  await withServer(async base => {
    const before = providers.calls.length;
    const [first, second] = await Promise.all([
      fetch(`${base}/api/search?q=dedup`),
      fetch(`${base}/api/search?q=dedup`)
    ]);
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.deepEqual(await first.json(), await second.json());
    assert.equal(providers.countIn('query1.finance.yahoo.com', before), 1);
    assert.equal(providers.countIn('api.coingecko.com', before), 1);
  });
});

test('the CoinGecko search call carries the configured API key and nothing when unset', async t => {
  const providers = installProviders(t, {
    ...okProviders('ZZBINUSDT', 'ZZBIN'),
    coinGecko: { body: { coins: [{ id: 'bitcoin', name: 'Bitcoin', symbol: 'btc', market_cap_rank: 1 }] } }
  });
  mockAppState(t);
  const previous = process.env.COINGECKO_API_KEY;
  try {
    process.env.COINGECKO_API_KEY = 'cg-demo-test-key';
    await withServer(async base => {
      const before = providers.calls.length;
      assert.equal((await fetch(`${base}/api/search?q=keyheader1`)).status, 200);
      const call = providers.findIn('api.coingecko.com', before);
      assert.equal(call?.headers['x-cg-demo-api-key'], 'cg-demo-test-key');
      assert.equal(call?.headers.accept, 'application/json');
    });
    delete process.env.COINGECKO_API_KEY;
    await withServer(async base => {
      const before = providers.calls.length;
      assert.equal((await fetch(`${base}/api/search?q=keyheader2`)).status, 200);
      const call = providers.findIn('api.coingecko.com', before);
      assert.ok(call, 'CoinGecko must still be queried without a key');
      assert.equal(call?.headers['x-cg-demo-api-key'], undefined);
      assert.equal(call?.headers.accept, 'application/json');
    });
  } finally {
    if (previous === undefined) delete process.env.COINGECKO_API_KEY;
    else process.env.COINGECKO_API_KEY = previous;
  }
});

test('an expired market cache keeps serving last-good rows and is not stamped fresh by a failure', async t => {
  // Expire everything cached so far, then warm the market list honestly.
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() + 30 * 60_000 });
  const providers = installProviders(t, okProviders('ZZBINUSDT', 'ZZBIN'));
  mockAppState(t);
  await withServer(async base => {
    const warm = await jsonOf(await fetch(`${base}/api/search?q=zzbin`));
    assert.ok(warm.some(result => result.displaySymbol === 'ZZBINUSDT'));
  });

  // The 15 minute window expires, then the provider goes down.
  t.mock.timers.tick(16 * 60_000);
  providers.replies.binanceSpot = { networkError: true };
  providers.replies.binanceFutures = { status: 503, body: 'Service Unavailable' };
  await withServer(async base => {
    const stale = await jsonOf(await fetch(`${base}/api/search?q=zzbin`));
    assert.ok(
      stale.some(result => result.displaySymbol === 'ZZBINUSDT'),
      'the last verified market rows must survive a failed refresh'
    );
  });

  // After the backoff (but long before a 15 minute TTL would expire) a
  // successful fetch must be visible again: the failure never extended the TTL.
  t.mock.timers.tick(31_000);
  Object.assign(providers.replies, okProviders('ZZBIN2USDT', 'ZZBIN2'));
  await withServer(async base => {
    const rotation = await jsonOf(await fetch(`${base}/api/search?q=zzbin`));
    assert.ok(
      rotation.some(result => result.displaySymbol === 'ZZBIN2USDT'),
      'the failed attempt must not have postponed the next refresh'
    );
  });
  const attempts = providers.countIn('api.binance.com');
  assert.ok(attempts >= 3, `expected a retry after the failure, saw ${attempts} attempts`);
});
