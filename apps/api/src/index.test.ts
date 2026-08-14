import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from './server.js';
import http from 'node:http';

describe('API Server Integration Tests', () => {
  it('serves health endpoint with ok status and version', async () => {
    const app = createServer();
    const server = http.createServer(app);

    await new Promise<void>(resolve => server.listen(0, resolve));
    const port = (server.address() as any).port;

    const res = await fetch(`http://localhost:${port}/api/health`);
    assert.equal(res.status, 200);
    const body = await res.json() as any;
    assert.equal(body.status, 'ok');
    assert.equal(body.service, 'crypto-scanner-api');
    assert.ok(body.version !== undefined);

    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  it('serves scanner results with 50 assets and Money Line calculations', async () => {
    const app = createServer();
    const server = http.createServer(app);

    await new Promise<void>(resolve => server.listen(0, resolve));
    const port = (server.address() as any).port;

    const res = await fetch(`http://localhost:${port}/api/scanner?timeframe=1h`);
    assert.equal(res.status, 200);
    const rows = await res.json() as any[];
    assert.equal(rows.length, 50);

    const btc = rows.find(r => r.symbol === 'BTC');
    assert.ok(btc !== undefined);
    assert.ok(btc.price > 0);
    assert.ok(typeof btc.moneyLineScore === 'number');
    assert.ok(['Strong Bullish', 'Bullish', 'Neutral', 'Bearish', 'Strong Bearish'].includes(btc.tier));

    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  it('serves asset deep-dive with candles, MTF confluence, and AI thesis', async () => {
    const app = createServer();
    const server = http.createServer(app);

    await new Promise<void>(resolve => server.listen(0, resolve));
    const port = (server.address() as any).port;

    const res = await fetch(`http://localhost:${port}/api/assets/BTC?timeframe=1h`);
    assert.equal(res.status, 200);
    const asset = await res.json() as any;

    assert.equal(asset.info.symbol, 'BTC');
    assert.ok(asset.candles.length > 0);
    assert.ok(asset.multiTimeframe.compositeMtfScore !== undefined);
    assert.ok(asset.aiExplanation !== null);
    assert.ok(asset.aiExplanation.technicalThesis.length > 20);

    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  it('runs backtest simulation endpoint and returns win rate and equity curve', async () => {
    const app = createServer();
    const server = http.createServer(app);

    await new Promise<void>(resolve => server.listen(0, resolve));
    const port = (server.address() as any).port;

    const res = await fetch(`http://localhost:${port}/api/backtest/ETH?timeframe=1h`);
    assert.equal(res.status, 200);
    const backtest = await res.json() as any;

    assert.ok(backtest.totalTrades >= 0);
    assert.ok(backtest.equityCurve.length > 0);
    assert.ok(typeof backtest.winRate === 'number');
    assert.ok(typeof backtest.totalReturnPercent === 'number');

    await new Promise<void>(resolve => server.close(() => resolve()));
  });
});
