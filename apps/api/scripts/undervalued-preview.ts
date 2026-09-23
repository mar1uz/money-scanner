// BEFORE/AFTER preview of the Undervalued ranking on live sources.
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
  const [coins, protocols, fees, revenue, holdersRevenue] = await Promise.all([
    getJson(COINGECKO), getJson(PROTOCOLS),
    getJson(feesUrl('dailyFees')).then(j => j.protocols ?? []),
    getJson(feesUrl('dailyRevenue')).then(j => j.protocols ?? []),
    getJson(feesUrl('dailyHoldersRevenue')).then(j => j.protocols ?? [])
  ]);
  const scan = buildCryptoFourCriteriaScan({ coins, protocols, fees, revenue, holdersRevenue, generatedAt: Date.now() });
  const u: any[] = (scan as any).undervalued ?? [];
  console.log(`assets=${scan.assets.length} undervalued=${u.length} unranked=${(scan as any).unrankedCount}`);
  const byBasis: Record<string, number> = {};
  for (const e of u) byBasis[e.valuationBasis] = (byBasis[e.valuationBasis] ?? 0) + 1;
  console.log('basis counts:', JSON.stringify(byBasis));
  u.slice(0, 14).forEach((e, i) => {
    console.log(`${i + 1}. ${e.symbol} basis=${e.valuationBasis} mult=${e.valuationRatio?.toFixed(1)}x qual=${e.qualityScore} pass=${e.passedCriteria}/4 q%=${e.qualityPercentile} e%=${e.expensivenessPercentile} idx=${e.undervaluationIndex} mcap=$${(e.marketCap / 1e6).toFixed(0)}M`);
  });
}
main().catch(e => { console.error(e); process.exit(1); });
