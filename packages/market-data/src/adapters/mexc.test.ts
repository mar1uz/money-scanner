import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MexcMarketAdapter } from './mexc.js';
import { MarketHealthMonitor } from '../health-monitor.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const row = (t: number) => [t, '1', '1.2', '0.9', '1.1', '42', t + HOUR - 1, '46.2'];

describe('MEXC bounded historical candles', () => {
  it('uses 60m, 1W and 1M and caps any one request at 500 rows', async () => {
    const original = globalThis.fetch;
    const requested: URL[] = [];
    globalThis.fetch = (async input => {
      requested.push(new URL(String(input)));
      return Response.json([row(Date.now() - HOUR)]);
    }) as typeof fetch;
    try {
      const adapter = new MexcMarketAdapter(new MarketHealthMonitor());
      await adapter.fetchCandles('PONSUSDT', '1h', 1000);
      await adapter.fetchCandles('PONSUSDT', '1w', 1000);
      await adapter.fetchCandles('PONSUSDT', '1m', 1000);
      assert.deepEqual(requested.map(url => url.searchParams.get('interval')), ['60m', '1W', '1M']);
      assert.ok(requested.every(url => url.searchParams.get('limit') === '500'));
    } finally { globalThis.fetch = original; }
  });

  it('pages strictly before the requested boundary without losing newest bars at the 500-row cap', async () => {
    const original = globalThis.fetch;
    const anchor = Date.UTC(2026, 8, 25);
    const first = anchor - 950 * HOUR;
    const calls: URL[] = [];
    globalThis.fetch = (async input => {
      const url = new URL(String(input));
      calls.push(url);
      const start = Number(url.searchParams.get('startTime'));
      const end = Number(url.searchParams.get('endTime'));
      // Mirror MEXC's 500-row cap from the bounded start, not its end.
      const result = Array.from({ length: 950 }, (_, i) => first + i * HOUR)
        .filter(t => t >= start && t <= end).slice(0, 500).map(row);
      return Response.json(result);
    }) as typeof fetch;
    try {
      const adapter = new MexcMarketAdapter(new MarketHealthMonitor());
      const candles = await adapter.fetchCandlesBefore('PONSUSDT', '1h', anchor, 900);
      assert.equal(candles.length, 900);
      assert.equal(candles[0].timestamp, anchor - 900 * HOUR);
      assert.equal(candles.at(-1)?.timestamp, anchor - HOUR);
      assert.ok(calls.length >= 3);
      assert.ok(calls.every(url => url.searchParams.has('startTime') && url.searchParams.has('endTime')));
    } finally { globalThis.fetch = original; }
  });

  it('finds listing age with bounded windows when a recent request reaches the 500-row cap', async () => {
    const original = globalThis.fetch;
    const listed = Date.UTC(2025, 2, 24);
    globalThis.fetch = (async input => {
      const url = new URL(String(input));
      const start = Number(url.searchParams.get('startTime'));
      const end = Number(url.searchParams.get('endTime'));
      if (!url.searchParams.has('startTime')) return Response.json(Array.from({ length: 500 }, (_, i) => row(Date.UTC(2025, 4, 14) + i * DAY)));
      const bars = Array.from({ length: 100 }, (_, i) => row(listed + i * DAY))
        .filter(r => Number(r[0]) >= start && Number(r[0]) < end).slice(0, Number(url.searchParams.get('limit')));
      return Response.json(bars);
    }) as typeof fetch;
    try {
      const adapter = new MexcMarketAdapter(new MarketHealthMonitor());
      assert.equal(await adapter.firstDailyCandleTs('HYPEUSDT'), listed);
    } finally { globalThis.fetch = original; }
  });
});
