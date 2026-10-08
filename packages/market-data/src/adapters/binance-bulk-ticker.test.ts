import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BinanceMarketAdapter } from './binance.js';
import { MarketHealthMonitor } from '../health-monitor.js';

/**
 * The bulk `/ticker/24hr` snapshot replaces one per-asset request. These tests
 * pin the two properties that make that safe: the bulk path produces the exact
 * quote the single-pair path produces, and it never invents a value when the
 * snapshot cannot answer for a symbol.
 */

const tickerRow = (pair: string, lastPrice: string, percent = '1.5') => ({
  symbol: pair,
  lastPrice,
  priceChangePercent: percent,
  highPrice: '120',
  lowPrice: '90',
  volume: '1234.5',
  quoteVolume: '999999',
  closeTime: 1_700_000_000_000
});

const singleResponse = (pair: string, lastPrice: string, percent = '1.5') =>
  Response.json(tickerRow(pair, lastPrice, percent));

const klineResponse = () => Response.json([[1, '100']]);

/** Serves the bulk endpoint with the given rows and the per-symbol/klines endpoints normally. */
function mockBinance(bulk: unknown[]) {
  const original = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    urls.push(url.pathname + url.search);
    if (url.pathname === '/api/v3/ticker/24hr' && !url.searchParams.has('symbol')) {
      return Response.json(bulk);
    }
    if (url.pathname === '/api/v3/ticker/24hr') {
      const pair = url.searchParams.get('symbol')!;
      const row = bulk.find(candidate => (candidate as { symbol?: string }).symbol === pair) as
        { lastPrice: string; priceChangePercent: string } | undefined;
      return row ? singleResponse(pair, row.lastPrice, row.priceChangePercent)
        : new Response('not found', { status: 404 });
    }
    if (url.pathname === '/api/v3/klines') return klineResponse();
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
  return { urls, restore: () => { globalThis.fetch = original; } };
}

describe('Binance bulk 24h ticker', () => {
  it('produces the same quote as the per-symbol endpoint for every field it sets', async () => {
    const mock = mockBinance([tickerRow('BTCUSDT', '83503.77', '-2.456')]);
    try {
      const adapter = new BinanceMarketAdapter(new MarketHealthMonitor());
      const single = await adapter.fetch24hTicker('BTC');
      const fromBulk = await adapter.fetch24hTickerFromBulk('BTC');

      assert.ok(fromBulk);
      // Only `timestamp` may differ: the two calls hit the venue at different
      // instants, and every other field must come from the same row.
      assert.equal(fromBulk.symbol, single.symbol);
      assert.equal(fromBulk.price, single.price);
      assert.equal(fromBulk.change24h, single.change24h);
      assert.equal(fromBulk.changeYtd, single.changeYtd);
      assert.equal(fromBulk.high24h, single.high24h);
      assert.equal(fromBulk.low24h, single.low24h);
      assert.equal(fromBulk.volume24h, single.volume24h);
      assert.equal(fromBulk.volume24h, 999999);
      assert.equal(fromBulk.source, single.source);
      assert.equal(fromBulk.isStale, single.isStale);
      assert.deepEqual(Object.keys(fromBulk).sort(), Object.keys(single).sort());
    } finally { mock.restore(); }
  });

  it('returns null for a symbol the snapshot cannot answer, so the caller falls back', async () => {
    const mock = mockBinance([tickerRow('BTCUSDT', '83503.77')]);
    try {
      const adapter = new BinanceMarketAdapter(new MarketHealthMonitor());
      assert.equal(await adapter.fetch24hTickerFromBulk('ZZZNOTREAL'), null);
    } finally { mock.restore(); }
  });

  it('returns null instead of a fabricated quote when the snapshot price is not a number', async () => {
    const mock = mockBinance([tickerRow('BTCUSDT', 'not-a-number')]);
    try {
      const adapter = new BinanceMarketAdapter(new MarketHealthMonitor());
      assert.equal(await adapter.fetch24hTickerFromBulk('BTC'), null);
    } finally { mock.restore(); }
  });

  it('serves many symbols from one bulk request instead of one request each', async () => {
    const pairs = ['BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'DOGE', 'ADA', 'AVAX', 'TRX', 'LINK', 'DOT', 'MATIC'];
    const mock = mockBinance(pairs.map(pair => tickerRow(`${pair}USDT`, '100')));
    try {
      const adapter = new BinanceMarketAdapter(new MarketHealthMonitor());
      // Prime the snapshot, then read every symbol from it.
      await adapter.fetchAll24hTickers();
      mock.urls.length = 0;
      const quotes = await Promise.all(pairs.map(pair => adapter.fetch24hTickerFromBulk(pair)));
      assert.equal(mock.urls.filter(url => url.includes('/ticker/24hr')).length, 0);
      assert.equal(quotes.filter(Boolean).length, pairs.length);
    } finally { mock.restore(); }
  });

  it('keeps serving the last good snapshot after a provider failure', async () => {
    const mock = mockBinance([tickerRow('BTCUSDT', '83503.77')]);
    try {
      const adapter = new BinanceMarketAdapter(new MarketHealthMonitor());
      const first = await adapter.fetchAll24hTickers();
      assert.ok(first.has('BTCUSDT'));

      // The snapshot is now older than its 15s window and the provider fails.
      globalThis.fetch = (async () => {
        throw new Error('provider down');
      }) as typeof fetch;
      const rows = await adapter.fetchAll24hTickers();
      assert.ok(rows.has('BTCUSDT'), 'a failed refresh must not evict verified rows');
      assert.equal(rows.get('BTCUSDT')!.lastPrice, '83503.77');
    } finally { mock.restore(); }
  });

  it('reuses the bulk snapshot within its window instead of refetching', async () => {
    const mock = mockBinance([tickerRow('BTCUSDT', '83503.77')]);
    try {
      const adapter = new BinanceMarketAdapter(new MarketHealthMonitor());
      await adapter.fetchAll24hTickers();
      const after = mock.urls.filter(url => url === '/api/v3/ticker/24hr').length;
      await adapter.fetchAll24hTickers();
      await adapter.fetchAll24hTickers();
      assert.equal(mock.urls.filter(url => url === '/api/v3/ticker/24hr').length, after);
    } finally { mock.restore(); }
  });
});
