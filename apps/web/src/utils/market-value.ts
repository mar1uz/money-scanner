import snapshotData from '../data/company-cap-snapshot.json';
export interface CapSnapshot {
  fetchedAt: string; maxAgeDays: number;
  companies: Record<string, { value: number; url: string; dataAsOf: string | null }>;
  universe: { symbol: string; name: string; marketClass: string }[];
}
export interface ValueComponent { label: string; value: number | null; estimated: boolean; source: string; url: string; asOf: string }
const snapshot: CapSnapshot = snapshotData;
const gold: ValueComponent = { label: 'Physical gold (above-ground stock)', value: 29e12, estimated: true, source: 'World Gold Council', url: 'https://www.gold.org/goldhub/data/how-much-gold', asOf: 'end-Q2 2026 · quarterly estimate' };
export function companyComponent(group: 'stocks' | 'metals', now = Date.now(), data: CapSnapshot = snapshot): ValueComponent {
  const assets = data.universe.filter(a => a.marketClass === group);
  const age = now - Date.parse(data.fetchedAt);
  const validTimestamp = Number.isFinite(age) && age >= 0;
  const entries = assets.map(a => data.companies[a.symbol]).filter(v => v && Number.isFinite(v.value) && v.value > 0);
  const complete = assets.length > 0 && entries.length === assets.length;
  return { label: group === 'stocks' ? 'Tracked stock companies' : 'Tracked mining/materials companies', value: validTimestamp && complete ? entries.reduce((n, e) => n + e.value, 0) : null, estimated: true, source: 'CompaniesMarketCap', url: 'https://companiesmarketcap.com/', asOf: `checked ${data.fetchedAt.slice(0,10)} · ${entries.length}/${assets.length} companies` };
}
export function getMarketValue(category: string, cryptoCap?: number, now = Date.now(), data: CapSnapshot = snapshot) {
  const crypto: ValueComponent = { label: 'Global crypto', value: typeof cryptoCap === 'number' && Number.isFinite(cryptoCap) && cryptoCap > 0 ? cryptoCap : null, estimated: false, source: 'CoinGecko', url: 'https://api.coingecko.com/api/v3/global', asOf: 'current app feed' };
  const stock = companyComponent('stocks', now, data), mining = companyComponent('metals', now, data);
  const datedGold = { ...gold };
  if (category === 'crypto') return { title: 'Global crypto market cap', value: crypto.value, estimated: false, note: 'Global crypto universe', components: [crypto] };
  if (category === 'stocks') return { title: 'Tracked company market cap', value: stock.value, estimated: true, note: '73 tracked companies · 10 ETFs excluded', components: [stock] };
  if (category === 'metals') return { title: 'Metals value estimates', value: datedGold.value, estimated: true, note: 'Headline: physical gold only. ETFs, silver, oil, copper and PAXG excluded from this gold estimate.', components: [datedGold, mining] };
  const components = [crypto, datedGold, stock, mining];
  const available = components.every(c => c.value !== null);
  return { title: 'All markets · estimated total', value: available ? components.reduce((n,c) => n + c.value!, 0) : null, estimated: true, note: 'Includes global crypto + physical gold + tracked stock/mining companies. ETF assets, silver, oil and copper excluded; PAXG not added twice. Scope estimate, not all world markets; economic exposures can overlap.', components };
}
