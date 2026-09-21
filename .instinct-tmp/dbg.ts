import { BybitMarketAdapter } from '../packages/market-data/src/adapters/bybit.js';
import { MarketHealthMonitor } from '../packages/market-data/src/health-monitor.js';
async function main() {
  const bybit = new BybitMarketAdapter(new MarketHealthMonitor());
  const t0 = Date.now();
  const ts = await bybit.firstDailyCandleTs('GRASSUSDT');
  console.log('firstDailyCandleTs:', ts, ts ? new Date(ts).toISOString() : null, 'in', Date.now() - t0, 'ms');
  const tick = await bybit.fetch24hTicker('GRASSUSDT', 'GRASS');
  console.log('ticker:', JSON.stringify(tick));
}
main().catch(err => { console.error('ERR', err); process.exit(1); });
