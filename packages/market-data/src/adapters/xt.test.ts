import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { XtMarketAdapter } from './xt.js';
import { MarketHealthMonitor } from '../health-monitor.js';

const HOUR = 3_600_000;
describe('XT spot candle adapter', () => {
  it('normalizes newest-first daily rows and pages older than boundary', async () => {
    const old = globalThis.fetch;
    const boundary = Date.UTC(2026, 8, 25);
    const requested: URL[] = [];
    globalThis.fetch = (async input => {
      const url = new URL(String(input)); requested.push(url);
      const all = [boundary, boundary - HOUR * 24, boundary - HOUR * 48];
      return Response.json({ rc: 0, result: all.filter(t => !url.searchParams.has('endTime') || t < Number(url.searchParams.get('endTime'))).map(t => ({ t, o: '1', h: '2', l: '0.5', c: '1.5', q: '10' })) });
    }) as typeof fetch;
    try {
      const adapter = new XtMarketAdapter(new MarketHealthMonitor());
      assert.deepEqual((await adapter.fetchCandles('gp_usdt', '1d', 3)).map(c => c.timestamp), [boundary - HOUR * 48, boundary - HOUR * 24, boundary]);
      assert.deepEqual((await adapter.fetchCandlesBefore('gp_usdt', '1d', boundary, 3)).map(c => c.timestamp), [boundary - HOUR * 48, boundary - HOUR * 24]);
      assert.equal(requested[0].searchParams.get('symbol'), 'gp_usdt');
      assert.equal(requested[1].searchParams.get('endTime'), String(boundary - 1));
    } finally { globalThis.fetch = old; }
  });
  it('fails closed on empty or malformed data', async () => {
    const old = globalThis.fetch;
    globalThis.fetch = (async () => Response.json({ rc: 1, result: [] })) as typeof fetch;
    try { await assert.rejects(new XtMarketAdapter(new MarketHealthMonitor()).fetchCandles('gp_usdt', '1d', 20), /invalid response/); }
    finally { globalThis.fetch = old; }
  });
});
