import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildChartMarketResolverDeps } from './chart-market-probes.js';
import { BinanceMarketAdapter } from './adapters/binance.js';
import { BybitMarketAdapter } from './adapters/bybit.js';
import { OkxMarketAdapter } from './adapters/okx.js';
import { HyperliquidMarketAdapter } from './adapters/hyperliquid.js';
import { MexcMarketAdapter } from './adapters/mexc.js';
import { MarketHealthMonitor } from './health-monitor.js';

const DAY = 86_400_000;
const build = () => {
  const monitor = new MarketHealthMonitor();
  return buildChartMarketResolverDeps(
    new BinanceMarketAdapter(monitor),
    new BybitMarketAdapter(monitor),
    new OkxMarketAdapter(monitor),
    new HyperliquidMarketAdapter(monitor),
    new MexcMarketAdapter(monitor)
  );
};

/** Kraken pair map shared by the whole file: it is cached for 30 minutes. */
const krakenPairs = {
  error: [],
  result: {
    XXBTZUSD: { base: 'XXBT', quote: 'ZUSD', altname: 'XBTUSD', status: 'online' },
    GRASSUSD: { base: 'GRASS', quote: 'ZUSD', altname: 'GRASSUSD', status: 'online' },
    NEWUSD: { base: 'NEW', quote: 'ZUSD', altname: 'NEWUSD', status: 'online' }
  }
};

const krakenRows = (firstTs: number, count: number) =>
  Array.from({ length: count }, (_, i) => [firstTs + i * 86_400, '1', '1.1', '0.9', '1', '1', '1', 1]);

const withFetch = async (handler: (url: URL) => Response, run: () => Promise<void>) => {
  const original = globalThis.fetch;
  globalThis.fetch = (async input => handler(new URL(String(input)))) as typeof fetch;
  try { await run(); } finally { globalThis.fetch = original; }
};

describe('chart-market-probes listing windows', () => {
  it('reports an unknown Kraken listing when the response fills the 720-entry window', async () => {
    // Live shape measured 2026-09-25: XBTUSD/ETHUSD/SUIUSD/SOLUSD all return
    // 721 rows starting at 2024-10-05 (= today-720d) whatever `since` says.
    const truncated = Date.UTC(2024, 9, 5) / 1000;
    await withFetch(url => {
      if (url.pathname.endsWith('/AssetPairs')) return Response.json(krakenPairs);
      return Response.json({ error: [], result: { XXBTZUSD: krakenRows(truncated, 721), last: truncated } });
    }, async () => {
      const deps = build();
      assert.equal(await deps.krakenFirstDailyTs('BTC'), null);
    });
  });

  it('keeps a real Kraken listing when the pair history fits inside the window', async () => {
    const listed = Date.UTC(2025, 0, 27) / 1000; // measured live for GRASSUSD
    await withFetch(url => {
      if (url.pathname.endsWith('/AssetPairs')) return Response.json(krakenPairs);
      return Response.json({ error: [], result: { GRASSUSD: krakenRows(listed, 88), last: listed } });
    }, async () => {
      const deps = build();
      assert.equal(await deps.krakenFirstDailyTs('GRASS'), Date.UTC(2025, 0, 27));
    });
  });

  it('returns null for an empty Kraken history and for a missing pair', async () => {
    await withFetch(url => {
      if (url.pathname.endsWith('/AssetPairs')) return Response.json(krakenPairs);
      return Response.json({ error: [], result: { NEWUSD: [], last: 0 } });
    }, async () => {
      const deps = build();
      assert.equal(await deps.krakenFirstDailyTs('NEW'), null);
      assert.equal(await deps.krakenFirstDailyTs('NOTLISTED'), null);
    });
  });

  it('reports an unknown Coinbase listing when the response is the truncated latest window', async () => {
    // Live shape measured 2026-09-25: BTC-USD returns exactly 350 daily
    // buckets starting at 2025-10-11 for any `start` value.
    const first = Date.UTC(2025, 9, 11) / 1000;
    const rows = Array.from({ length: 350 }, (_, i) => [first + i * DAY, 1, 1, 1, 1, 1]);
    let requested: URL | null = null;
    await withFetch(url => {
      requested = url;
      return Response.json(rows);
    }, async () => {
      const deps = build();
      assert.equal(await deps.coinbaseFirstDailyTs('BTC'), null);
    });
    assert.equal(requested!.searchParams.get('granularity'), '86400');
    assert.ok(requested!.searchParams.has('start'));
  });

  it('keeps a real Coinbase listing when the whole history is inside the window', async () => {
    // Live shape measured 2026-09-25: HYPE-USD returns its full 233-day history.
    const listed = Date.UTC(2026, 1, 5) / 1000;
    const rows = Array.from({ length: 233 }, (_, i) => [listed + i * DAY, 1, 1, 1, 1, 1]);
    await withFetch(() => Response.json(rows), async () => {
      const deps = build();
      assert.equal(await deps.coinbaseFirstDailyTs('HYPE'), Date.UTC(2026, 1, 5));
    });
  });

  it('returns null for an empty Coinbase history', async () => {
    await withFetch(() => Response.json([]), async () => {
      const deps = build();
      assert.equal(await deps.coinbaseFirstDailyTs('NOPE'), null);
    });
  });

  it('reads the Binance spot quote volume, not the base-asset volume', async () => {
    let requested: URL | null = null;
    await withFetch(url => {
      requested = url;
      // Live shape of GET /api/v3/ticker/24hr?symbol=SUIUSDT.
      return Response.json({ symbol: 'SUIUSDT', volume: '22654321', quoteVolume: '79468218.50', lastPrice: '3.5' });
    }, async () => {
      const deps = build();
      assert.equal(await deps.binanceSpotQuoteVolume24h!('SUI'), 79_468_218.5);
    });
    assert.equal(requested!.pathname, '/api/v3/ticker/24hr');
    assert.equal(requested!.searchParams.get('symbol'), 'SUIUSDT');
  });

  it('returns null for a Binance spot ticker without a quote volume', async () => {
    await withFetch(() => Response.json({ symbol: 'SUIUSDT', volume: '22654321' }), async () => {
      const deps = build();
      assert.equal(await deps.binanceSpotQuoteVolume24h!('SUI'), null);
    });
  });
});
