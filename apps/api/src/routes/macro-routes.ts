import { Router } from 'express';
import { MacroCalendarEvent, MacroIndexItem, MacroObservation, USAEconomicStatus, YieldPoint } from '@money-scanner/shared';

export const macroRouter = Router();

type FredPoint = { value: number; observationDate: string; priorValue?: number; priorObservationDate?: string; yearAgoValue?: number };
const FRED_GRAPH_URL = 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=';
const FRED_PAGE_URL = 'https://fred.stlouisfed.org/series/';
const TREASURY_DEBT_URL = 'https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/debt_to_penny?sort=-record_date&page%5Bsize%5D=2';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
let cachedStatus: USAEconomicStatus | null = null;
let cachedAt = 0;
let inFlight: Promise<USAEconomicStatus> | null = null;

const fredSeries: Record<string, { unit: string; frequency: MacroObservation['frequency'] }> = {
  CPIAUCSL: { unit: 'index', frequency: 'monthly' }, CPILFESL: { unit: 'index', frequency: 'monthly' }, PCEPI: { unit: 'index', frequency: 'monthly' }, PPIFIS: { unit: 'index', frequency: 'monthly' },
  GDP: { unit: 'USD billions, SAAR', frequency: 'quarterly' }, RSAFS: { unit: 'USD millions', frequency: 'monthly' }, INDPRO: { unit: 'index', frequency: 'monthly' },
  UNRATE: { unit: '%', frequency: 'monthly' }, PAYEMS: { unit: 'thousands', frequency: 'monthly' }, ICNSA: { unit: 'claims', frequency: 'weekly' }, CCSA: { unit: 'claims', frequency: 'weekly' }, CES0500000003: { unit: 'USD/hour', frequency: 'monthly' }, JTSJOL: { unit: 'thousands', frequency: 'monthly' },
  DFF: { unit: '%', frequency: 'daily' }, DGS1MO: { unit: '%', frequency: 'daily' }, DGS3MO: { unit: '%', frequency: 'daily' }, DGS6MO: { unit: '%', frequency: 'daily' }, DGS1: { unit: '%', frequency: 'daily' }, DGS2: { unit: '%', frequency: 'daily' }, DGS5: { unit: '%', frequency: 'daily' }, DGS10: { unit: '%', frequency: 'daily' }, DGS30: { unit: '%', frequency: 'daily' }, T10Y2Y: { unit: 'percentage points', frequency: 'daily' }, T10Y3M: { unit: 'percentage points', frequency: 'daily' }, DFII10: { unit: '%', frequency: 'daily' }, T10YIE: { unit: '%', frequency: 'daily' },
  M2SL: { unit: 'USD billions', frequency: 'monthly' }, WALCL: { unit: 'USD millions', frequency: 'weekly' }, RRPONTSYD: { unit: 'USD billions', frequency: 'daily' }, WTREGEN: { unit: 'USD millions', frequency: 'weekly' }, NFCI: { unit: 'index', frequency: 'weekly' }, UMCSENT: { unit: 'index', frequency: 'monthly' }, PSAVERT: { unit: '%', frequency: 'monthly' }, GFDEGDQ188S: { unit: '% of GDP', frequency: 'quarterly' }, FYFSGDA188S: { unit: '% of GDP', frequency: 'annual' }, SP500: { unit: 'index', frequency: 'daily' }, NASDAQCOM: { unit: 'index', frequency: 'daily' }, DJIA: { unit: 'index', frequency: 'daily' }, VIXCLS: { unit: 'index', frequency: 'daily' }, DTWEXBGS: { unit: 'index', frequency: 'daily' }
};

const toNumber = (value: string): number | undefined => { const parsed = Number(value.replace(/,/g, '')); return Number.isFinite(parsed) ? parsed : undefined; };

async function fetchFredSeries(seriesId: string): Promise<FredPoint | null> {
  try {
    const response = await fetch(`${FRED_GRAPH_URL}${encodeURIComponent(seriesId)}`);
    if (!response.ok) return null;
    const points = (await response.text()).trim().split(/\r?\n/).slice(1).map(line => { const split = line.split(','); return { observationDate: split[0], value: toNumber(split.slice(1).join(',')) }; }).filter((point): point is { observationDate: string; value: number } => Boolean(point.observationDate) && point.value !== undefined);
    const latest = points.at(-1); const prior = points.at(-2);
    return latest ? { value: latest.value, observationDate: latest.observationDate, priorValue: prior?.value, priorObservationDate: prior?.observationDate, yearAgoValue: points.at(-13)?.value } : null;
  } catch { return null; }
}

function makeObservation(seriesId: string, point: FredPoint | null): MacroObservation | undefined {
  if (!point) return undefined;
  const metadata = fredSeries[seriesId];
  return { value: point.value, observationDate: point.observationDate, priorValue: point.priorValue, priorObservationDate: point.priorObservationDate, yearAgoValue: point.yearAgoValue, unit: metadata.unit, frequency: metadata.frequency, source: `Federal Reserve Bank of St. Louis (FRED) · ${seriesId}`, sourceUrl: `${FRED_PAGE_URL}${seriesId}`, status: 'available' };
}

const value = (point?: MacroObservation) => point?.value ?? 0;
const percentChange = (point?: MacroObservation) => point?.priorValue && point.priorValue !== 0 ? Number((((point.value - point.priorValue) / Math.abs(point.priorValue)) * 100).toFixed(2)) : 0;
const levelChange = (point?: MacroObservation) => point?.priorValue !== undefined ? Number((point.value - point.priorValue).toFixed(2)) : 0;
const observationDate = (point?: MacroObservation) => point?.observationDate;

async function fetchTreasuryDebt(): Promise<{ value: number; date: string } | null> {
  try {
    const response = await fetch(TREASURY_DEBT_URL);
    if (!response.ok) return null;
    const rows = (await response.json() as { data?: Array<{ record_date: string; tot_pub_debt_out_amt: string }> }).data || [];
    const latest = rows[0]; return latest ? { value: Number(latest.tot_pub_debt_out_amt), date: latest.record_date } : null;
  } catch { return null; }
}

function nextFomcDate(now: Date): string {
  const dates = ['15–16 Septembrie 2026', '27–28 Octombrie 2026', '8–9 Decembrie 2026', '26–27 Ianuarie 2027', '16–17 Martie 2027'];
  const anchors = [Date.UTC(2026, 8, 15), Date.UTC(2026, 9, 27), Date.UTC(2026, 11, 8), Date.UTC(2027, 0, 26), Date.UTC(2027, 2, 16)];
  return dates.find((_label, index) => anchors[index] >= now.getTime()) || 'Calendar FOMC 2027 în așteptare';
}

function deriveRegime(inflation: number, unemployment: number, nfci: number): { title: string; phase: USAEconomicStatus['monetaryPolicy']['cyclePhase']; status: USAEconomicStatus['inflation']['status'] } {
  const status: USAEconomicStatus['inflation']['status'] = inflation <= 2.2 ? 'Target Met' : inflation <= 3 ? 'Cooling' : inflation <= 4 ? 'Sticky' : 'Elevated';
  return { title: status === 'Elevated' ? 'Inflație ridicată și condiții restrictive' : nfci > 0.2 ? 'Condiții financiare restrictive' : unemployment > 5 ? 'Răcire a pieței muncii' : 'Dezinflație și aterizare graduală', phase: 'Neutral Pause', status };
}

async function buildLiveUSAEconomicStatus(): Promise<USAEconomicStatus> {
  const entries = await Promise.all(Object.keys(fredSeries).map(async id => [id, makeObservation(id, await fetchFredSeries(id))] as const));
  const indicators = Object.fromEntries(entries.filter((entry): entry is [string, MacroObservation] => Boolean(entry[1])));
  const debt = await fetchTreasuryDebt();
  const cpi = indicators.CPIAUCSL; const coreCpi = indicators.CPILFESL; const pce = indicators.PCEPI; const ppi = indicators.PPIFIS; const dff = indicators.DFF; const unemployment = value(indicators.UNRATE);
  const yoy = (point?: MacroObservation) => point?.yearAgoValue ? Number(((point.value / point.yearAgoValue - 1) * 100).toFixed(2)) : 0;
  const inflationYoY = yoy(cpi);
  const coreCpiYoY = yoy(coreCpi);
  const corePceYoY = yoy(pce);
  const regime = deriveRegime(inflationYoY, unemployment, value(indicators.NFCI)); const now = Date.now();
  const yieldIds = ['DGS1MO', 'DGS3MO', 'DGS6MO', 'DGS1', 'DGS2', 'DGS5', 'DGS10', 'DGS30'];
  const maturity: Record<string, string> = { DGS1MO: '1M', DGS3MO: '3M', DGS6MO: '6M', DGS1: '1Y', DGS2: '2Y', DGS5: '5Y', DGS10: '10Y', DGS30: '30Y' };
  const yieldPoints: YieldPoint[] = yieldIds.map(id => ({ maturity: maturity[id], rate: Number(value(indicators[id]).toFixed(2)), priorRate: Number((indicators[id]?.priorValue ?? value(indicators[id])).toFixed(2)), change: levelChange(indicators[id]) }));
  const totalDebt = debt?.value || 0; const debtToGdp = value(indicators.GFDEGDQ188S); const m2 = Number((value(indicators.M2SL) / 1000).toFixed(3));
  const calendar: MacroCalendarEvent[] = [
    { title: 'FOMC', date: nextFomcDate(new Date(now)), source: 'Federal Reserve', sourceUrl: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm' },
    { title: 'CPI / Inflation', date: 'Conform calendarului BLS', source: 'BLS', sourceUrl: 'https://www.bls.gov/schedule/news_release/cpi.htm' },
    { title: 'Employment Situation', date: 'Conform calendarului BLS', source: 'BLS', sourceUrl: 'https://www.bls.gov/schedule/news_release/empsit.htm' },
    { title: 'GDP / PCE', date: 'Conform calendarului BEA', source: 'BEA', sourceUrl: 'https://www.bea.gov/news/schedule' }
  ];
  const indices: MacroIndexItem[] = [
    { symbol: 'SPX', name: 'S&P 500 Index', value: value(indicators.SP500), changePercent: percentChange(indicators.SP500), category: 'Equities', statusBadge: 'FRED · SP500', observationDate: observationDate(indicators.SP500), source: 'FRED' },
    { symbol: 'NDX', name: 'NASDAQ Composite proxy', value: value(indicators.NASDAQCOM), changePercent: percentChange(indicators.NASDAQCOM), category: 'Equities', statusBadge: 'FRED · NASDAQCOM', observationDate: observationDate(indicators.NASDAQCOM), source: 'FRED' },
    { symbol: 'DJI', name: 'Dow Jones Industrial Average', value: value(indicators.DJIA), changePercent: percentChange(indicators.DJIA), category: 'Equities', statusBadge: 'FRED · DJIA', observationDate: observationDate(indicators.DJIA), source: 'FRED' },
    { symbol: 'VIX', name: 'CBOE Volatility Index', value: value(indicators.VIXCLS), changePercent: percentChange(indicators.VIXCLS), category: 'Volatility', statusBadge: 'FRED · VIXCLS', observationDate: observationDate(indicators.VIXCLS), source: 'FRED' },
    { symbol: 'DXY proxy', name: 'Trade Weighted US Dollar', value: value(indicators.DTWEXBGS), changePercent: percentChange(indicators.DTWEXBGS), category: 'Currency', statusBadge: 'FRED · DTWEXBGS', observationDate: observationDate(indicators.DTWEXBGS), source: 'FRED' },
    { symbol: 'US M2', name: 'US M2 Money Supply', value: m2, changePercent: percentChange(indicators.M2SL), category: 'Liquidity', statusBadge: 'FRED · M2SL', observationDate: observationDate(indicators.M2SL), source: 'FRED' }
  ];
  const staleSources = Object.keys(fredSeries).filter(id => !indicators[id]);
  return {
    timestamp: now,
    fiscal: { totalNationalDebt: totalDebt, debtFormatted: totalDebt ? `$${(totalDebt / 1e12).toFixed(2)}T` : 'Date indisponibile', debtToGdpPercent: debtToGdp, annualDeficit: indicators.GDP && indicators.FYFSGDA188S ? Math.abs(indicators.GDP.value * indicators.FYFSGDA188S.value / 100) * 1e9 : undefined, debtPerCitizen: totalDebt ? totalDebt / 340_110_988 : undefined, debtPerTaxpayer: totalDebt ? totalDebt / 161_000_000 : undefined, observationDate: debt?.date, source: 'U.S. Treasury · Debt to the Penny' },
    inflation: { cpiYoY: inflationYoY, cpiMoM: cpi?.priorValue ? Number(((cpi.value / cpi.priorValue - 1) * 100).toFixed(2)) : 0, coreCpiYoY, corePceYoY, ppiYoY: yoy(ppi), targetInflation: 2, status: regime.status },
    monetaryPolicy: { fedFundsRateRange: dff ? `${(dff.value - 0.25).toFixed(2)}% – ${dff.value.toFixed(2)}%` : 'Date indisponibile', effectiveFedRate: value(dff), nextFomcDate: nextFomcDate(new Date(now)), cyclePhase: regime.phase },
    yieldCurve: { points: yieldPoints, spread10Y2Y: value(indicators.T10Y2Y), isInverted: value(indicators.T10Y2Y) < 0, curveRegime: value(indicators.T10Y2Y) < 0 ? 'Inverted (Recession Warning)' : value(indicators.T10Y2Y) < 0.15 ? 'Flat' : 'Normal' },
    laborMarket: { unemploymentRate: unemployment, nonFarmPayrollsMonthly: Math.round(levelChange(indicators.PAYEMS) * 1000), initialJoblessClaims: value(indicators.ICNSA), wageGrowthYoY: yoy(indicators.CES0500000003), status: unemployment > 5 ? 'Softening' : unemployment < 3.8 ? 'Overheating' : 'Solid / Balanced' },
    consumer: { michiganSentimentIndex: value(indicators.UMCSENT), retailSalesMoM: percentChange(indicators.RSAFS), personalSavingsRate: value(indicators.PSAVERT), m2MoneySupplyTrillions: m2, m2GrowthYoY: percentChange(indicators.M2SL) },
    indices, indicators, calendar,
    dataQuality: { generatedAt: now, staleSources, unavailableSeries: staleSources, note: 'Valorile provin din serii publice FRED și Treasury. Data observației este separată de momentul colectării; seriile lipsă nu sunt completate cu valori inventate.' },
    aiGuidance: { regimeTitle: regime.title, executiveSummary: `Regimul este derivat din CPI ${inflationYoY.toFixed(2)}%, șomaj ${unemployment.toFixed(2)}% și NFCI ${value(indicators.NFCI).toFixed(2)}.`, fedPolicyOutlook: `Rata efectivă Fed este ${value(dff).toFixed(2)}%; următoarea ședință este ${nextFomcDate(new Date(now))}. Probabilitățile de tăiere nu sunt afișate fără o sursă de piață verificată.`, impactOnStocks: { stance: value(indicators.NFCI) > 0.2 ? 'Neutral' : 'Bullish', description: 'Condițiile financiare și randamentele reale sunt variabilele urmărite pentru evaluările acțiunilor.' }, impactOnCrypto: { stance: value(indicators.NFCI) > 0.2 ? 'Neutral' : 'Bullish', description: 'M2, randamentele reale și dolarul oferă contextul de regim, fără o corelație fixă presupusă.' }, impactOnMetals: { stance: value(indicators.DFII10) < 2 ? 'Bullish' : 'Neutral', description: 'Randamentul real pe 10 ani și dolarul oferă contextul principal pentru metale.' }, keyRiskFactors: ['Inflația de bază poate rămâne persistentă.', 'Curba randamentelor se poate re-inversa.', 'Datele macro au frecvențe și întârzieri diferite.'], actionableTradingThesis: 'Folosește macro ca filtru de regim și confirmă deciziile cu prețul, volatilitatea și MoneyLine.', confidenceScore: undefined }
  };
}

function getLiveUSAEconomicStatus(): Promise<USAEconomicStatus> {
  if (cachedStatus && Date.now() - cachedAt < CACHE_TTL_MS) return Promise.resolve(cachedStatus);
  if (!inFlight) inFlight = buildLiveUSAEconomicStatus().then(status => { cachedStatus = status; cachedAt = Date.now(); return status; }).finally(() => { inFlight = null; });
  return inFlight;
}

macroRouter.get('/macro/usa-status', async (_req, res) => {
  try { res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600'); res.json(await getLiveUSAEconomicStatus()); }
  catch (error) { res.status(503).json({ error: 'Datele macro oficiale sunt temporar indisponibile.', details: error instanceof Error ? error.message : 'Unknown error' }); }
});
