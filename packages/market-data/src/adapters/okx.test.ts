import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OkxMarketAdapter } from './okx.js';
import { MarketHealthMonitor } from '../health-monitor.js';

/**
 * Live OKX spot ticker payload measured 2026-09-25 for BTC-USDT:
 * last=83993.6, vol24h=5392.21735676 (BTC), volCcy24h=454012851.8 (USDT).
 * Bybit turnover24h for the same market was ~438,307,665 USDT, which is the
 * cross-check that `volCcy24h` is already quoted in the quote currency.
 */
const btcUsdtTicker = {
  code: '0',
  msg: '',
  data: [{
    instId: 'BTC-USDT',
    last: '83993.6',
    open24h: '80000',
    high24h: '85000',
    low24h: '79000',
    vol24h: '5392.21735676',
    volCcy24h: '454012851.8'
  }]
};

describe('OKX 24h ticker volume', () => {
  it('reports the quote-currency volume as-is, without multiplying by the price', async () => {
    const original = globalThis.fetch;
    const requested: URL[] = [];
    globalThis.fetch = (async input => {
      requested.push(new URL(String(input)));
      return Response.json(btcUsdtTicker);
    }) as typeof fetch;
    try {
      const adapter = new OkxMarketAdapter(new MarketHealthMonitor());
      const quote = await adapter.fetch24hTicker('BTC-USDT', 'BTC');
      assert.equal(quote.volume24h, 454_012_851.8);
      // The double-counting regression: volCcy24h * last = ~38.1 trillion USD.
      assert.notEqual(quote.volume24h, 454_012_851.8 * 83_993.6);
      // A single ticker request: no extra probe may be needed to build the quote.
      assert.equal(requested.length, 1);
      assert.ok(requested[0].pathname.endsWith('/api/v5/market/ticker'));
      assert.equal(requested[0].searchParams.get('instId'), 'BTC-USDT');
    } finally { globalThis.fetch = original; }
  });

  it('keeps a low-priced instrument quote un-inflated', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => Response.json({
      code: '0',
      msg: '',
      data: [{ instId: 'SUI-USDT', last: '3.5', open24h: '3.4', high24h: '3.6', low24h: '3.3',
        vol24h: '22654321', volCcy24h: '79468218.5' }]
    })) as typeof fetch;
    try {
      const adapter = new OkxMarketAdapter(new MarketHealthMonitor());
      const quote = await adapter.fetch24hTicker('SUI-USDT', 'SUI');
      assert.equal(quote.volume24h, 79_468_218.5);
      assert.equal(quote.price, 3.5);
    } finally { globalThis.fetch = original; }
  });

  it('fails loudly when OKX answers an error envelope', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => Response.json({ code: '51001', msg: 'Instrument ID does not exist', data: [] })) as typeof fetch;
    try {
      const adapter = new OkxMarketAdapter(new MarketHealthMonitor());
      await assert.rejects(adapter.fetch24hTicker('NOPE-USDT', 'NOPE'), /OKX code 51001/);
    } finally { globalThis.fetch = original; }
  });
});
