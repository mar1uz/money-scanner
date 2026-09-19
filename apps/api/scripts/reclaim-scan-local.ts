// reclaim-scan-local.ts - LOCAL re-computation of the app's DAILY_SMA50_200_RECLAIM
// report for a given confirmation day, using the exact evaluator and market data
// path as DailySmaReclaimRunner (evaluateDailySmaReclaim + MarketDataService),
// but no Firestore, no Telegram, no Google auth - public data only.
// Candles are trimmed to the analyzed day so a later run reproduces the same
// deterministic result the app computed on that morning.
// Run: cd apps/api && ../../node_modules/.bin/tsx scripts/reclaim-scan-local.ts [YYYY-MM-DD]
import { writeFileSync, mkdirSync } from 'node:fs';
import { AppState } from '../src/services/app-state.js';
import { evaluateDailySmaReclaim } from '../src/services/daily-sma-reclaim-service.js';

const DAY_MS = 86_400_000;
const STABLE_SYMBOLS = new Set(['USDT', 'USDC', 'DAI', 'FDUSD', 'USDE', 'USDS', 'TUSD', 'USDP', 'BUSD', 'PYUSD', 'USD1', 'RLUSD', 'USDG', 'USDD', 'USDY', 'USDF', 'USDGO', 'USYC', 'USDTB', 'USDAI', 'USD0', 'GHO', 'EURC', 'EUTBL', 'USTB', 'SOFID', 'APXUSD']);

const dayArg = process.argv[2] || '';
if (!/^\d{4}-\d{2}-\d{2}$/.test(dayArg)) {
  console.error('usage: tsx scripts/reclaim-scan-local.ts YYYY-MM-DD');
  process.exit(2);
}
const analyzedTimestamp = Date.UTC(Number(dayArg.slice(0, 4)), Number(dayArg.slice(5, 7)) - 1, Number(dayArg.slice(8, 10)));
const analyzedDay = dayArg;

async function main() {
  const reproducedAt = new Date().toISOString();
  const state = AppState.getInstance() as any;
  const universe = (await state.marketData.getFlipUniverseCryptoAssets())
    .filter((asset: any) => asset.marketClass === 'crypto' && !STABLE_SYMBOLS.has(asset.symbol.toUpperCase()))
    .slice(0, 150);
  console.error(`universe: ${universe.length}, analyzedDay ${analyzedDay}`);

  const results: any[] = [];
  for (let index = 0; index < universe.length; index += 5) {
    const batch = universe.slice(index, index + 5);
    const settled = await Promise.all(batch.map(async (asset: any) => {
      const source = asset.marketDataSource || 'binance_spot';
      const pair = source === 'hyperliquid' ? (asset.providerSymbol || asset.symbol) : `${asset.providerSymbol || asset.symbol}USDT`;
      try {
        const raw = await state.marketData.getCandles(asset.symbol, '1d', 340, 'crypto');
        const candles = raw.filter((c: any) => c.timestamp <= analyzedTimestamp);
        return evaluateDailySmaReclaim(asset.symbol, candles, {
          expectedDayTimestamp: analyzedTimestamp,
          evaluatedAt: Date.now(),
          source,
          pair,
          name: asset.name,
          rank: asset.rank
        });
      } catch (error) {
        return {
          ruleId: 'DAILY_SMA50_200_RECLAIM', symbol: asset.symbol.toUpperCase(), name: asset.name,
          marketClass: 'crypto', rank: asset.rank, source, pair,
          analyzedDay, analyzedDayTimestamp: analyzedTimestamp, evaluatedAt: Date.now(),
          status: 'ERROR', reason: error instanceof Error ? error.message : String(error)
        };
      }
    }));
    settled.forEach(result => results.push(result));
    if (index % 40 === 0) console.error(`  scanned ${index}/${universe.length}`);
  }
  results.sort((left, right) => (left.rank ?? 9999) - (right.rank ?? 9999) || left.symbol.localeCompare(right.symbol));
  const count = (status: string) => results.filter(result => result.status === status).length;
  const totals = {
    total: universe.length, scanned: results.length,
    newSignals: count('NEW_SIGNAL'), alreadyAboveBoth: count('ABOVE_BOTH'), noSignal: count('NO_SIGNAL'),
    insufficientHistory: count('INSUFFICIENT_HISTORY'), staleData: count('STALE_DATA'), errors: count('ERROR')
  };
  const report = {
    id: `DAILY_SMA50_200_RECLAIM:${analyzedDay}`,
    ruleId: 'DAILY_SMA50_200_RECLAIM',
    analyzedDay,
    analyzedDayTimestamp: analyzedTimestamp,
    reproducedAt,
    method: 'local evaluateDailySmaReclaim via tsx - same evaluator + market data as DailySmaReclaimRunner; candles trimmed to analyzed day; no Firestore, no Telegram',
    source: 'CoinGecko market-cap rank + Binance/Hyperliquid daily candles',
    totals,
    results
  };
  mkdirSync('../../tmp/scans', { recursive: true });
  const path = `../../tmp/scans/reclaim-${analyzedDay}.json`;
  writeFileSync(path, JSON.stringify(report, null, 2));
  console.error(`totals: ${JSON.stringify(totals)}`);
  console.error(`new signals: ${results.filter(r => r.status === 'NEW_SIGNAL').map(r => r.symbol).join(', ')}`);
  console.error(`wrote ${path}`);
}

main().catch(error => { console.error(error); process.exit(1); });
