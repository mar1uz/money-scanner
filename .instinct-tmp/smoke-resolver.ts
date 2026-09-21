import { ChartMarketResolver } from '../packages/market-data/src/chart-market-resolver.js';
import { buildChartMarketResolverDeps } from '../packages/market-data/src/chart-market-probes.js';
import { BinanceMarketAdapter } from '../packages/market-data/src/adapters/binance.js';
import { BybitMarketAdapter } from '../packages/market-data/src/adapters/bybit.js';
import { OkxMarketAdapter } from '../packages/market-data/src/adapters/okx.js';
import { HyperliquidMarketAdapter } from '../packages/market-data/src/adapters/hyperliquid.js';
import { MarketHealthMonitor } from '../packages/market-data/src/health-monitor.js';

const monitor = new MarketHealthMonitor();
const binance = new BinanceMarketAdapter(monitor);
const bybit = new BybitMarketAdapter(monitor);
const okx = new OkxMarketAdapter(monitor);
const hyperliquid = new HyperliquidMarketAdapter(monitor);
const resolver = new ChartMarketResolver(buildChartMarketResolverDeps(binance, bybit, okx, hyperliquid));

async function main() {
  for (const symbol of ['GRASS', 'BTC', 'HYPE']) {
    const r = await resolver.resolve(symbol);
    console.log(symbol, '=>', JSON.stringify({
      candle: r?.candle ? { source: r.candle.source, pair: r.candle.providerSymbol, listing: r.candle.listingStart ? new Date(r.candle.listingStart).toISOString().slice(0, 10) : null, vol: r.candle.volume24hQuote } : null,
      tv: r?.tv?.tvSymbol ?? null
    }));
  }
  // Bybit candles for GRASS (the resolved source), incl. 8h aggregation
  const candles4h = await bybit.fetchCandles('GRASSUSDT', '4h', 8);
  const candles8h = await bybit.fetchCandles('GRASSUSDT', '8h', 4);
  console.log('GRASS bybit 4h last:', candles4h.at(-1));
  console.log('GRASS bybit 8h count:', candles8h.length, 'first ts:', new Date(candles8h[0]?.timestamp || 0).toISOString());
  const oldest = await bybit.fetchCandlesBefore('GRASSUSDT', '1d', Date.UTC(2024, 10, 5), 5);
  console.log('GRASS bybit 1d before 2024-11-05:', oldest.map(c => new Date(c.timestamp).toISOString().slice(0, 10)));
}
main().catch(err => { console.error(err); process.exit(1); });
