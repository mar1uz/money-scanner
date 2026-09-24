// scan-1w-parity.ts - LOCAL re-computation of the app's daily flip scan.
// Same code path as AppState.executeDailyRegimeScan (scanFlipAsset per asset,
// same universe, same coverage shape) but no Firestore, no event publishing,
// no Google auth - public data only (CoinGecko/Binance/Hyperliquid/Yahoo).
// Run: cd apps/api && node_modules/.bin/tsx scripts/scan-1w-parity.ts
import { writeFileSync, mkdirSync, appendFileSync, readFileSync, existsSync } from 'node:fs';
import { AppState, AUTOMATED_FLIP_TIMEFRAMES } from '../src/services/app-state.js';

// Automated local runs (insight pipeline) scan 1D + 1W only since 2026-09-24.
// Pass --all-timeframes to include 4H/8H for a manual run.
const SCAN_TIMEFRAMES = process.argv.includes('--all-timeframes') ? ['4h', '8h', '1d', '1w'] : AUTOMATED_FLIP_TIMEFRAMES;
import { getScannerAssets } from '@money-scanner/shared';

const OUT_JSON = '../../tmp/paper-trades/scan-1w-parity.json';
const OUT_JSONL = '../../tmp/paper-trades/scan-1w-parity.jsonl';

async function main() {
  const generatedAt = new Date().toISOString();
  const state = AppState.getInstance() as any;
  const [liveCrypto, stocks, metals] = await Promise.all([
    state.marketData.getFlipUniverseCryptoAssets(),
    Promise.resolve(getScannerAssets('stocks')),
    Promise.resolve(getScannerAssets('metals'))
  ]);
  const universe = [...liveCrypto, ...stocks, ...metals].filter(
    (a: any) => a.marketClass === 'crypto' || a.marketClass === 'stocks' || a.marketClass === 'metals'
  );
  console.error(`universe: ${universe.length} (crypto ${liveCrypto.length}, stocks ${stocks.length}, metals ${metals.length})`);

  const coverage: any[] = [];
  const candidates: any[] = [];
  const confirmedHistory: any[] = [];
  const concurrency = 4;
  for (let index = 0; index < universe.length; index += concurrency) {
    const batch = universe.slice(index, index + concurrency);
    const settled = await Promise.allSettled(batch.map((a: any) => state.scanFlipAsset(a.symbol, a.marketClass, SCAN_TIMEFRAMES)));
    settled.forEach((result, bi) => {
      const asset = batch[bi];
      if (result.status === 'fulfilled') {
        const v = result.value;
        const tag = (items: any[]) => items.map(item => ({ ...item, marketCapRank: asset.marketClass === 'crypto' && Number.isFinite(asset.rank) ? asset.rank : undefined }));
        candidates.push(...tag(v.upcoming));
        confirmedHistory.push(...tag(v.confirmedHistory));
        if (v.coverage) coverage.push({ symbol: asset.symbol, name: asset.name, marketClass: asset.marketClass, rank: asset.rank, scannedAt: Date.now(), ...v.coverage });
      } else {
        coverage.push({ symbol: asset.symbol, name: asset.name, marketClass: asset.marketClass, rank: asset.rank, status: 'ERROR', weeklyCandidate: false, weeklyConfirmed: false, candidateCount: 0, confirmedCount: 0, scannedAt: Date.now(), error: result.reason instanceof Error ? result.reason.message : String(result.reason) });
      }
    });
    if (index % 40 === 0) console.error(`  scanned ${index}/${universe.length}`);
  }

  coverage.sort((l, r) => (l.rank || 9999) - (r.rank || 9999) || l.symbol.localeCompare(r.symbol));
  const rankedCandidates = state.rankUpcomingCandidates(candidates);
  const outcomes: Record<string, number> = {};
  const byMarket: Record<string, number> = {};
  coverage.forEach(item => { outcomes[item.status] = (outcomes[item.status] || 0) + 1; byMarket[item.marketClass] = (byMarket[item.marketClass] || 0) + 1; });

  const packet = {
    generatedAt,
    method: 'local AppState.scanFlipAsset via tsx - same code as daily regime scan; no Firestore, no Google auth',
    universeCount: universe.length,
    timeframes: SCAN_TIMEFRAMES,
    scannedCount: coverage.filter(i => i.status !== 'ERROR').length,
    outcomes, byMarket,
    coverage,
    upcomingCandidates: rankedCandidates,
    weeklyConfirmed: confirmedHistory.filter(c => c.timeframe === '1w')
  };
  mkdirSync('../../tmp/paper-trades', { recursive: true });
  writeFileSync(OUT_JSON, JSON.stringify(packet, null, 1));
  const today = generatedAt.slice(0, 10);
  let already = false;
  if (existsSync(OUT_JSONL)) {
    const last = readFileSync(OUT_JSONL, 'utf8').trim().split('\n').filter(Boolean).at(-1)!;
    try { already = JSON.parse(last).generatedAt?.slice(0, 10) === today; } catch { /* keep */ }
  }
  if (!already) appendFileSync(OUT_JSONL, JSON.stringify({ generatedAt, universeCount: universe.length, outcomes, candidates1w: coverage.filter(i => i.status === 'CANDIDATE').map(i => i.symbol) }) + '\n');
  console.log(JSON.stringify({ generatedAt, universeCount: universe.length, scannedCount: packet.scannedCount, outcomes, candidates1w: coverage.filter(i => i.status === 'CANDIDATE').length }));
}
main().catch(err => { console.error(err); process.exit(1); });
