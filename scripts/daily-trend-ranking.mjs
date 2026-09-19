// daily-trend-ranking.mjs
// Daily research/paper ranking prototype (Marius's SMA strategy) - thin CLI
// over scripts/trend-ranking-core.mjs. RESEARCH ONLY, UNVALIDATED: the SMA
// gate showed no out-of-sample lift (docs/backtests/2026-09-19-sma-trend-ranking.md).
// Usage: node scripts/daily-trend-ranking.mjs
// Output: tmp/paper-trades/latest-ranking.json + console table.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MoneyLineEngine } from '../packages/money-line/dist/engine.js';
import { scanAll, rankSetups } from './trend-ranking-core.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_PATH = path.join(REPO_ROOT, 'tmp', 'paper-trades', 'latest-ranking.json');

async function run() {
  const engine = new MoneyLineEngine();
  const { maturedEvents, currentSetups, lastClosed, errors } = await scanAll(engine, {
    onSymbol: sym => process.stdout.write(`${sym} `)
  });
  console.log(`\nMatured training events: ${maturedEvents.length} | current setups: ${currentSetups.length}`);

  const top5 = rankSetups(maturedEvents, currentSetups).slice(0, 5).map(t => ({
    ...t,
    invalidation: `daily close below SMA50 (${t.sma50}) or bearish Money Line flip`,
    entryNote: 'indicative at last close; the tested rule enters at the next daily open'
  }));

  const report = {
    generatedAt: new Date().toISOString(),
    source: 'binance-spot-1d-klines (closed) + binance-usdm-funding (public)',
    lastClosedCandleUtc: new Date(lastClosed).toISOString(),
    evidenceStatus: 'UNVALIDATED RESEARCH PROTOTYPE - SMA gate showed no out-of-sample lift; validated track is paper-trade-rvol2.mjs (RVOL>=2 forward log)',
    label: '+20% before -10% within 21d',
    trainingEvents: maturedEvents.length,
    qualifyingSetups: currentSetups.length,
    top5, dataErrors: errors
  };
  await mkdir(path.dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(report, null, 2) + '\n');

  console.log('Top 5 SMA-gated bullish setups (RESEARCH ONLY - unvalidated):');
  if (!top5.length) console.log('  none today');
  for (const t of top5) {
    console.log(`  ${t.symbol.padEnd(7)} p=${(t.probability * 100).toFixed(0)}% flip ${t.flipDate} entry~${t.hypotheticalEntry} stop ${t.stop} (-${t.riskPct}%) rvol ${t.rvol}x`);
  }
  console.log(`\nWrote ${path.relative(REPO_ROOT, OUT_PATH)}`);
}

run().catch(err => { console.error(err); process.exit(1); });
