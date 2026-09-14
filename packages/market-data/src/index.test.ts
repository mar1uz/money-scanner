import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MarketDataService } from './market-service.js';
import { aggregateCandles } from './aggregator.js';
import {
  Candle,
  getScannerAssets,
  MIN_ASSETS_PER_NARRATIVE,
  NARRATIVE_DEFINITIONS,
  withPrimaryNarrative
} from '@money-scanner/shared';

describe('Market Data Service & Normalization', () => {
  it('assigns one valid primary sector to every scanner asset', () => {
    const definedNarratives = new Set(NARRATIVE_DEFINITIONS.map(definition => definition.id));
    const assets = getScannerAssets();

    assert.ok(assets.length >= 100);
    for (const asset of assets) {
      assert.equal(asset.narratives?.length, 1, `${asset.symbol} must have one primary sector`);
      assert.ok(definedNarratives.has(asset.narratives![0]), `${asset.symbol} sector must be defined`);
    }

    const metalSectors = new Set(
      getScannerAssets('metals').map(asset => asset.narratives![0])
    );
    assert.deepEqual(
      metalSectors,
      new Set(['precious_metals', 'industrial_metals', 'critical_minerals', 'energy_commodities'])
    );

    const unknownCrypto = withPrimaryNarrative({
      symbol: 'NEW',
      name: 'New Infrastructure Asset',
      category: 'Infrastructure',
      marketClass: 'crypto',
      quoteCurrency: 'USDT',
      rank: 999,
      decimals: 4
    });
    assert.deepEqual(unknownCrypto.narratives, ['crypto_infrastructure']);
  });

  it('keeps at least ten market-cap-ranked assets in every available sector', () => {
    for (const marketClass of ['crypto', 'stocks', 'metals'] as const) {
      const assets = getScannerAssets(marketClass);
      const activeNarratives = new Set(assets.map(asset => asset.narratives![0]));

      for (const narrative of activeNarratives) {
        const members = assets.filter(asset => asset.narratives?.[0] === narrative);
        assert.ok(
          members.length >= MIN_ASSETS_PER_NARRATIVE,
          `${marketClass}/${narrative} must contain at least ${MIN_ASSETS_PER_NARRATIVE} assets`
        );
        for (let index = 1; index < members.length; index += 1) {
          assert.ok(
            (members[index - 1].marketCap || 0) >= (members[index].marketCap || 0),
            `${marketClass}/${narrative} must be ordered by market cap`
          );
        }
      }
    }
  });

  it('correctly aggregates 1h candles into 4h bars', () => {
    const candles1h: Candle[] = [];
    const baseTime = 0; // aligns to 0 ms (1970-01-01 00:00:00)

    for (let i = 0; i < 8; i++) {
      candles1h.push({
        timestamp: baseTime + i * 3600 * 1000,
        open: 100 + i,
        high: 110 + i,
        low: 95 + i,
        close: 102 + i,
        volume: 100,
        isClosed: true
      });
    }

    const aggregated = aggregateCandles(candles1h, 4);
    assert.equal(aggregated.length, 2);

    // Bar 1 (hours 0..3)
    assert.equal(aggregated[0].open, 100);
    assert.equal(aggregated[0].close, 105);
    assert.equal(aggregated[0].high, 113);
    assert.equal(aggregated[0].low, 95);
    assert.equal(aggregated[0].volume, 400);
    assert.equal(aggregated[0].isClosed, true);

    // Bar 2 (hours 4..7)
    assert.equal(aggregated[1].open, 104);
    assert.equal(aggregated[1].close, 109);
    assert.equal(aggregated[1].volume, 400);
  });

  it('normalizes recorded provider responses and computes market overview', async () => {
    const originalFetch = globalThis.fetch;
    const now = Date.now();
    globalThis.fetch = (async (input) => {
      const url = String(input);
      if (url.includes('/klines')) {
        if (url.includes('startTime=')) {
          return Response.json([[Date.UTC(new Date().getUTCFullYear(), 0, 1), '90000', '91000', '89000', '90500', '1200']]);
        }
        return Response.json([
          [now - 7_200_000, '95000', '96000', '94000', '95500', '1000'],
          [now - 3_600_000, '95500', '97000', '95000', '96500', '1100']
        ]);
      }
      if (url.includes('/ticker/24hr')) {
        return Response.json({
          lastPrice: '96500', priceChangePercent: '1.58', highPrice: '97000', lowPrice: '94000', volume: '1100', closeTime: now
        });
      }
      if (url.includes('/global')) {
        return Response.json({ data: { market_cap_percentage: { btc: 56.2 }, total_market_cap: { usd: 3200000000000 }, total_volume: { usd: 125000000000 } } });
      }
      if (url.includes('alternative.me')) {
        return Response.json({ data: [{ value: '55', value_classification: 'Greed', timestamp: String(Math.floor(now / 1000)) }] });
      }
      if (url.includes('/coins/markets')) {
        return Response.json([{ symbol: 'btc', market_cap: 1800000000000 }]);
      }
      return new Response('Not found', { status: 404 });
    }) as typeof fetch;

    try {
      const service = new MarketDataService();
      const candles = await service.getCandles('BTC', '1h', 50);

      assert.ok(candles.length > 0);
      assert.ok(candles[0].close > 0);
      assert.ok(candles[0].timestamp > 0);

      const overview = await service.getMarketOverview();
      assert.equal(overview.total24hVolume, 125000000000);
      assert.ok(overview.marketBreadth.advancingCount >= 0);
      assert.equal(overview.fearAndGreed?.value, 55);
      assert.ok(['Strong Bullish Expansion', 'Bullish Trend', 'Consolidation / Range', 'High Volatility Correction', 'Bearish Trend', 'Strong Bearish Capitulation'].includes(overview.regime));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('tracks health monitor status and detects stale data', () => {
    const service = new MarketDataService();
    const monitor = service.getHealthMonitor();

    // Fresh timestamp
    assert.equal(monitor.isDataStale(Date.now() - 1000), false);
    // 5 minutes old timestamp
    assert.equal(monitor.isDataStale(Date.now() - 300_000), true);

    monitor.recordSuccess('Binance', 32);
    const h = monitor.getProviderHealth('Binance');
    assert.equal(h?.status, 'operational');
    assert.equal(h?.latencyMs, 32);
  });

  it('routes a ticker collision to Binance when the verified class is crypto', async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl = '';
    globalThis.fetch = (async (input) => {
      requestedUrl = String(input);
      return Response.json([
        [Date.now() - 3_600_000, '2.50', '2.70', '2.40', '2.60', '1000'],
        [Date.now(), '2.60', '2.80', '2.50', '2.75', '1200']
      ]);
    }) as typeof fetch;

    try {
      const service = new MarketDataService();
      const candles = await service.getCandles('CAKE', '1h', 2, 'crypto');
      assert.equal(candles.length, 2);
      assert.match(requestedUrl, /\/klines\?symbol=CAKEUSDT&/);
      assert.doesNotMatch(requestedUrl, /finance\/chart\/CAKE/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('routes HYPE to the official Hyperliquid candle API instead of Binance', async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl = '';
    let requestedBody: any;
    globalThis.fetch = (async (input, init) => {
      requestedUrl = String(input);
      requestedBody = JSON.parse(String(init?.body || '{}'));
      return Response.json([
        { t: Date.now() - 7_200_000, T: Date.now() - 3_600_001, o: '82.1', h: '83.2', l: '81.9', c: '82.8', v: '12500' },
        { t: Date.now() - 3_600_000, T: Date.now() + 1_000, o: '82.8', h: '84.0', l: '82.5', c: '83.7', v: '15300' }
      ]);
    }) as typeof fetch;

    try {
      const service = new MarketDataService();
      const candles = await service.getCandles('HYPE', '1h', 1500, 'crypto');
      assert.equal(candles.length, 2);
      assert.equal(candles.at(-1)?.close, 83.7);
      assert.equal(requestedUrl, 'https://api.hyperliquid.xyz/info');
      assert.equal(requestedBody.type, 'candleSnapshot');
      assert.equal(requestedBody.req.coin, 'HYPE');
      assert.equal(requestedBody.req.interval, '1h');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('keeps a newly listed verified stock usable with short monthly history', async () => {
    const originalFetch = globalThis.fetch;
    const now = Math.floor(Date.now() / 1000);
    globalThis.fetch = (async () => Response.json({
      chart: {
        result: [{
          timestamp: [now - 5_184_000, now - 2_592_000, now],
          indicators: {
            quote: [{
              open: [135, 148, 156],
              high: [151, 160, 169],
              low: [132, 145, 153],
              close: [148, 156, 165],
              volume: [1_000_000, 1_200_000, 1_100_000]
            }]
          }
        }],
        error: null
      }
    })) as typeof fetch;

    try {
      const service = new MarketDataService();
      const candles = await service.getCandles('SPCX', '1m', 10, 'stocks');
      assert.equal(candles.length, 3);
      assert.equal(candles.at(-1)?.close, 165);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('loads a closed historical page strictly before the requested timestamp', async () => {
    const originalFetch = globalThis.fetch;
    const before = Date.now() - 3_600_000;
    let requestedUrl = '';
    globalThis.fetch = (async (input) => {
      requestedUrl = String(input);
      return Response.json([
        [before - 7_200_000, '100', '105', '98', '103', '500'],
        [before - 3_600_000, '103', '108', '102', '107', '650']
      ]);
    }) as typeof fetch;

    try {
      const service = new MarketDataService();
      const candles = await service.getCandlesBefore('BTC', '1h', before, 500, 'crypto');
      assert.equal(candles.length, 2);
      assert.ok(candles.every(candle => candle.timestamp < before));
      assert.ok(candles.every(candle => candle.isClosed));
      assert.match(requestedUrl, /symbol=BTCUSDT/);
      assert.match(requestedUrl, new RegExp(`endTime=${before - 1}`));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('builds the flip universe from CoinGecko market-cap order with live candle sources', async () => {
    const originalFetch = globalThis.fetch;
    const now = Date.now();
    const geckoPage1 = [
      { id: 'tether', symbol: 'usdt', name: 'Tether', market_cap: 180e9, market_cap_rank: 3, current_price: 1 },
      { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', market_cap: 1.5e12, market_cap_rank: 1, current_price: 90000 },
      { id: 'hyperliquid', symbol: 'hype', name: 'Hyperliquid', market_cap: 12e9, market_cap_rank: 11, current_price: 40 },
      { id: 'pancakeswap-token', symbol: 'cake', name: 'PancakeSwap', market_cap: 554e6, market_cap_rank: 90, current_price: 2.5 },
      { id: 'kaspa', symbol: 'kas', name: 'Kaspa', market_cap: 500e6, market_cap_rank: 76, current_price: 0.1 },
      { id: 'no-market', symbol: 'zzz', name: 'No Venue', market_cap: 400e6, market_cap_rank: 120, current_price: 1 }
    ];
    const geckoPage2 = [
      { id: 'fill-coin', symbol: 'aaa', name: 'Fill Coin', market_cap: 200e6, market_cap_rank: 180, current_price: 3 }
    ];
    let kasCandleBody: { type?: string; req?: { coin?: string } } = {};
    globalThis.fetch = (async (input, init) => {
      const url = String(input);
      if (url.includes('/coins/markets') && url.includes('page=1')) return Response.json(geckoPage1);
      if (url.includes('/coins/markets') && url.includes('page=2')) return Response.json(geckoPage2);
      if (url.includes('/exchangeInfo')) {
        return Response.json({
          symbols: ['BTC', 'CAKE', 'AAA'].map(baseAsset => ({
            status: 'TRADING', quoteAsset: 'USDT', isSpotTradingAllowed: true, baseAsset
          }))
        });
      }
      if (url.includes('hyperliquid.xyz/info')) {
        const body = JSON.parse(String(init?.body || '{}'));
        if (body.type === 'meta') return Response.json({ universe: [{ name: 'HYPE' }, { name: 'KAS' }] });
        kasCandleBody = body;
        return Response.json([
          { t: now - 7_200_000, T: now - 3_600_001, o: '1', h: '2', l: '1', c: '1.5', v: '10' },
          { t: now - 3_600_000, T: now + 1_000, o: '1.5', h: '2', l: '1.4', c: '1.8', v: '12' }
        ]);
      }
      if (url.includes('/klines')) {
        return Response.json([[now - 3_600_000, '1', '2', '1', '1.5', '10']]);
      }
      return new Response('Not found', { status: 404 });
    }) as typeof fetch;

    try {
      const service = new MarketDataService();
      const assets = await service.getTopCryptoAssets(5);
      assert.deepEqual(assets.map(asset => asset.symbol), ['BTC', 'HYPE', 'CAKE', 'KAS', 'AAA']);
      assert.equal(assets.find(asset => asset.symbol === 'HYPE')?.marketDataSource, 'hyperliquid');
      assert.equal(assets.find(asset => asset.symbol === 'KAS')?.marketDataSource, 'hyperliquid');
      assert.ok(!assets.some(asset => asset.symbol === 'USDT' || asset.symbol === 'ZZZ'));

      const geckoOnly = geckoPage1.concat(geckoPage2).map(row => row.symbol.toUpperCase());
      assert.ok(assets.every(asset => geckoOnly.includes(asset.symbol)));

      const candles = await service.getCandles('KAS', '1h', 2, 'crypto');
      assert.equal(candles.length, 2);
      assert.equal(kasCandleBody.type, 'candleSnapshot');
      assert.equal(kasCandleBody.req?.coin, 'KAS');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
