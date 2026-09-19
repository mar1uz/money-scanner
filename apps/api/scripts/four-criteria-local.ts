// four-criteria-local.ts - LOCAL run of the app's exact 4x200 evaluator
// (buildCryptoFourCriteriaScan) on live public sources; no Firestore.
// Writes tmp/scans/four-criteria-latest.json and prints the cohort rows.
// Run: cd apps/api && ../../node_modules/.bin/tsx scripts/four-criteria-local.ts [SYMBOL,SYMBOL,...]
import { writeFileSync, mkdirSync } from 'node:fs';
import { buildCryptoFourCriteriaScan } from '../src/services/crypto-four-criteria-scanner.js';

const COINGECKO = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=200&page=1&sparkline=false';
const PROTOCOLS = 'https://api.llama.fi/protocols';
const feesUrl = (dt: string) => `https://api.llama.fi/overview/fees?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true&dataType=${dt}`;

async function getJson(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

async function main() {
  const symbols = (process.argv[2] || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  const [coins, protocols, fees, revenue, holdersRevenue] = await Promise.all([
    getJson(COINGECKO), getJson(PROTOCOLS),
    getJson(feesUrl('dailyFees')).then(j => j.protocols ?? []),
    getJson(feesUrl('dailyRevenue')).then(j => j.protocols ?? []),
    getJson(feesUrl('dailyHoldersRevenue')).then(j => j.protocols ?? [])
  ]);
  const scan = buildCryptoFourCriteriaScan({ coins, protocols, fees, revenue, holdersRevenue, generatedAt: Date.now() });
  mkdirSync('../../tmp/scans', { recursive: true });
  writeFileSync('../../tmp/scans/four-criteria-latest.json', JSON.stringify({ generatedAt: new Date().toISOString(), method: 'local buildCryptoFourCriteriaScan via tsx - same evaluator as /ai/crypto-four-criteria; sources CoinGecko top200 + DefiLlama protocols/fees/revenue/holdersRevenue', assets: scan.assets }, null, 2));
  console.log(`scan: ${scan.assets.length} assets -> tmp/scans/four-criteria-latest.json`);
  if (symbols.length) {
    for (const sym of symbols) {
      const a = scan.assets.find((x: any) => x.symbol === sym);
      if (!a) { console.log(`${sym}: NOT-IN-TOP200`); continue; }
      const c = a.criteria;
      console.log(`${sym}: ${a.passedCriteria}/4 score=${a.score} class=${a.classification} | growth=${c.growth.status}(${c.growth.value}) net=${c.networkEffect.status}(${c.networkEffect.value}) rev=${c.sustainableRevenue.status}(${c.sustainableRevenue.value}) holder=${c.holderValue.status}(${c.holderValue.value})`);
    }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
