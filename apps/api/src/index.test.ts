import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from './server.js';
import { AppState } from './services/app-state.js';
import http from 'node:http';

// The production API always requires a verified Firebase session. Integration
// tests exercise the market routes with an explicit test-only bypass that the
// auth middleware refuses outside NODE_ENV=test.
process.env.NODE_ENV = 'test';
process.env.AUTH_TEST_BYPASS = 'true';

describe('API Server Integration Tests', () => {
  it('serves health endpoint with ok status and version', async () => {
    const app = createServer();
    const server = http.createServer(app);

    await new Promise<void>(resolve => server.listen(0, resolve));
    const port = (server.address() as any).port;

    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(res.status, 200);
    const body = await res.json() as any;
    assert.equal(body.status, 'ok');
    assert.equal(body.service, 'market-scanner-360-api');
    assert.ok(body.version !== undefined);

    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  it('rejects protected market data when no authenticated session is present', async () => {
    const savedMode = process.env.NODE_ENV;
    const savedBypass = process.env.AUTH_TEST_BYPASS;
    process.env.NODE_ENV = 'production';
    delete process.env.AUTH_TEST_BYPASS;

    const app = createServer();
    const server = http.createServer(app);
    await new Promise<void>(resolve => server.listen(0, resolve));
    const port = (server.address() as any).port;

    const res = await fetch(`http://127.0.0.1:${port}/api/scanner?timeframe=1h&marketClass=crypto&narrative=crypto_l2`);
    assert.equal(res.status, 401);

    await new Promise<void>(resolve => server.close(() => resolve()));
    process.env.NODE_ENV = savedMode;
    if (savedBypass) process.env.AUTH_TEST_BYPASS = savedBypass;
  });

  it('serves only currently verified scanner rows and their Money Line calculations', async (t) => {
    const app = createServer();
    const server = http.createServer(app);

    await new Promise<void>(resolve => server.listen(0, resolve));
    t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
    const port = (server.address() as any).port;

    const res = await fetch(`http://127.0.0.1:${port}/api/scanner?timeframe=1h&marketClass=crypto&narrative=crypto_l2`);
    assert.equal(res.status, 200);
    const rows = await res.json() as any[];
    assert.ok(rows.length > 0);

    for (const row of rows) {
      assert.ok(row.price > 0);
      assert.equal(typeof row.moneyLineScore, 'number');
      assert.ok(['Strong Bullish', 'Bullish', 'Neutral', 'Bearish', 'Strong Bearish'].includes(row.tier));
      assert.equal(typeof row.dataSource, 'string');
      assert.equal(row.xTrendScore, undefined);
      assert.equal(row.aiConfidence, undefined);
    }
  });

  it('serves asset deep-dive with candles, MTF confluence, and AI thesis', async () => {
    const app = createServer();
    const server = http.createServer(app);

    await new Promise<void>(resolve => server.listen(0, resolve));
    const port = (server.address() as any).port;

    const res = await fetch(`http://127.0.0.1:${port}/api/assets/BTC?timeframe=1h`);
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

    const res = await fetch(`http://127.0.0.1:${port}/api/backtest/ETH?timeframe=1h`);
    assert.equal(res.status, 200);
    const backtest = await res.json() as any;

    assert.ok(backtest.totalTrades >= 0);
    assert.ok(backtest.equityCurve.length > 0);
    assert.ok(typeof backtest.winRate === 'number');
    assert.ok(typeof backtest.totalReturnPercent === 'number');

    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  it('runs the multi-timeframe Weekly reclaim strategy without look-ahead fields missing', async () => {
    const app = createServer();
    const server = http.createServer(app);

    await new Promise<void>(resolve => server.listen(0, resolve));
    const port = (server.address() as any).port;
    const res = await fetch(
      `http://127.0.0.1:${port}/api/backtest/BTC?strategy=weekly_reclaim&marketClass=crypto&directionMode=LONG_ONLY`
    );
    assert.equal(res.status, 200);
    const backtest = await res.json() as any;

    assert.equal(backtest.params.strategy, 'weekly_reclaim');
    assert.equal(backtest.params.timeframe, '1d');
    assert.ok(Array.isArray(backtest.priceSeries) && backtest.priceSeries.length > 0);
    assert.equal(backtest.priceSeries.length, backtest.equityCurve.length);
    assert.equal(typeof backtest.expectancyR, 'number');
    assert.equal(typeof backtest.sharpeRatio, 'number');

    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  it('runs the deep-history Connors RSI2 strategy with plotted indicators', async () => {
    const app = createServer();
    const server = http.createServer(app);

    await new Promise<void>(resolve => server.listen(0, resolve));
    const port = (server.address() as any).port;
    const res = await fetch(
      `http://127.0.0.1:${port}/api/backtest/BTC?strategy=connors_rsi2&marketClass=crypto&directionMode=LONG_ONLY`
    );
    assert.equal(res.status, 200);
    const backtest = await res.json() as any;

    assert.equal(backtest.params.strategy, 'connors_rsi2');
    assert.ok(backtest.priceSeries.length >= 1_000);
    assert.equal(typeof backtest.priceSeries[0].rsi2, 'number');
    assert.equal(typeof backtest.priceSeries[0].sma5, 'number');
    assert.ok(backtest.totalTrades > 0);

    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  it('serves the authenticated alerts command center payload', async () => {
    const app = createServer();
    const server = http.createServer(app);

    await new Promise<void>(resolve => server.listen(0, resolve));
    const port = (server.address() as any).port;

    const res = await fetch(`http://127.0.0.1:${port}/api/alerts/dashboard`);
    assert.equal(res.status, 200);
    const dashboard = await res.json() as any;
    assert.ok(Array.isArray(dashboard.activeAlerts));
    assert.ok(Array.isArray(dashboard.history));
    assert.ok(Array.isArray(dashboard.strategySetups));
    assert.equal(typeof dashboard.telegramConfigured, 'boolean');
    assert.equal(dashboard.dailyRegimeScan.enabled, true);
    assert.equal(dashboard.dailyRegimeScan.timezone, 'Europe/Oslo');
    assert.equal(dashboard.dailyRegimeScan.schedule, '0 12 * * *');
    assert.equal(dashboard.manualScan.running, false);
    assert.equal(dashboard.manualScan.scope, 'quick');
    assert.equal(typeof dashboard.updatedAt, 'number');

    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  it('protects the scheduled daily regime scan with its dedicated token', async () => {
    const app = createServer();
    const server = http.createServer(app);

    await new Promise<void>(resolve => server.listen(0, resolve));
    const port = (server.address() as any).port;
    const res = await fetch(`http://127.0.0.1:${port}/api/alerts/daily-regime-scan`, { method: 'POST' });
    assert.equal(res.status, 401);

    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  it('requires CSRF and starts an authenticated manual scan', async (t) => {
    const state = AppState.getInstance();
    const original = state.runManualAlertScan.bind(state);
    state.runManualAlertScan = (async (_userId, scope) => ({
      scope,
      running: false,
      scannedAssets: 5,
      totalAssets: 5,
      matches: 1,
      errors: 0,
      lastStartedAt: Date.now(),
      lastCompletedAt: Date.now()
    })) as typeof state.runManualAlertScan;
    t.after(() => { state.runManualAlertScan = original; });

    const app = createServer();
    const server = http.createServer(app);
    await new Promise<void>(resolve => server.listen(0, resolve));
    t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
    const port = (server.address() as any).port;

    const rejected = await fetch(`http://127.0.0.1:${port}/api/alerts/manual-scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'quick' })
    });
    assert.equal(rejected.status, 403);

    const csrfResponse = await fetch(`http://127.0.0.1:${port}/api/auth/csrf`);
    const csrf = await csrfResponse.json() as { csrfToken: string };
    const cookie = String(csrfResponse.headers.get('set-cookie')).split(';')[0];
    const accepted = await fetch(`http://127.0.0.1:${port}/api/alerts/manual-scan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrf.csrfToken,
        Cookie: cookie
      },
      body: JSON.stringify({ scope: 'quick', watchlist: [{ symbol: 'BTC', marketClass: 'crypto' }] })
    });
    assert.equal(accepted.status, 200);
    const status = await accepted.json() as any;
    assert.equal(status.scope, 'quick');
    assert.equal(status.scannedAssets, 5);
  });
});
