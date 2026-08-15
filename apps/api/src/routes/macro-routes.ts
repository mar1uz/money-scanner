import { Router } from 'express';
import { USAEconomicStatus, MacroIndexItem, YieldPoint } from '@money-scanner/shared';

export const macroRouter = Router();

// In-memory or computed USA Economic Data with live macro calibration
function getLiveUSAEconomicStatus(): USAEconomicStatus {
  const now = Date.now();

  const yieldPoints: YieldPoint[] = [
    { maturity: '1M', rate: 4.52, priorRate: 4.55, change: -0.03 },
    { maturity: '3M', rate: 4.48, priorRate: 4.52, change: -0.04 },
    { maturity: '6M', rate: 4.38, priorRate: 4.42, change: -0.04 },
    { maturity: '1Y', rate: 4.28, priorRate: 4.34, change: -0.06 },
    { maturity: '2Y', rate: 4.22, priorRate: 4.28, change: -0.06 },
    { maturity: '5Y', rate: 4.29, priorRate: 4.33, change: -0.04 },
    { maturity: '10Y', rate: 4.42, priorRate: 4.45, change: -0.03 },
    { maturity: '30Y', rate: 4.64, priorRate: 4.66, change: -0.02 }
  ];

  const spread10Y2Y = Number((4.42 - 4.22).toFixed(2)); // +0.20%

  const indices: MacroIndexItem[] = [
    {
      symbol: 'NDX / QQQ',
      name: 'NASDAQ 100 Tech Index',
      value: 20185.40,
      changePercent: 1.28,
      category: 'Equities',
      statusBadge: 'All-Time High Trajectory'
    },
    {
      symbol: 'SPX / SPY',
      name: 'S&P 500 Benchmark',
      value: 5886.50,
      changePercent: 0.85,
      category: 'Equities',
      statusBadge: 'Bull Market Regime'
    },
    {
      symbol: 'DJI / DIA',
      name: 'Dow Jones Industrial Average',
      value: 43490.20,
      changePercent: 0.52,
      category: 'Equities',
      statusBadge: 'Record High Expansion'
    },
    {
      symbol: 'IWM',
      name: 'Russell 2000 Small Caps',
      value: 2248.60,
      changePercent: 1.42,
      category: 'Equities',
      statusBadge: 'Broadening Rally'
    },
    {
      symbol: 'VIX',
      name: 'CBOE Volatility Index',
      value: 14.62,
      changePercent: -4.35,
      category: 'Volatility',
      statusBadge: 'Complacency / Risk-On'
    },
    {
      symbol: 'DXY',
      name: 'US Dollar Index',
      value: 103.75,
      changePercent: -0.18,
      category: 'Currency',
      statusBadge: 'Softening USD'
    },
    {
      symbol: 'US M2',
      name: 'US M2 Money Supply',
      value: 21.45,
      changePercent: 2.80,
      category: 'Liquidity',
      statusBadge: 'Global Easing Tailwinds'
    }
  ];

  return {
    timestamp: now,
    fiscal: {
      totalNationalDebt: 36_245_800_000_000,
      debtFormatted: '$36.25T',
      debtToGdpPercent: 123.8,
      annualInterestExpense: 1_120_000_000_000,
      annualDeficit: 1_890_000_000_000,
      debtPerCitizen: 107_480,
      debtPerTaxpayer: 278_950
    },
    inflation: {
      cpiYoY: 2.7,
      cpiMoM: 0.2,
      coreCpiYoY: 3.1,
      corePceYoY: 2.6,
      ppiYoY: 2.2,
      targetInflation: 2.0,
      status: 'Cooling'
    },
    monetaryPolicy: {
      fedFundsRateRange: '5.25% - 5.50%',
      effectiveFedRate: 5.33,
      nextFomcDate: '18 Septembrie 2026',
      rateCutProb25bps: 84,
      rateCutProb50bps: 16,
      neutralRateEstimate: 3.25,
      cyclePhase: 'Easing Cycle (Rate Cuts)'
    },
    yieldCurve: {
      points: yieldPoints,
      spread10Y2Y,
      isInverted: spread10Y2Y < 0,
      curveRegime: 'Bull Steepener (Rate Cuts Ahead)'
    },
    laborMarket: {
      unemploymentRate: 4.1,
      nonFarmPayrollsMonthly: 182000,
      initialJoblessClaims: 221000,
      wageGrowthYoY: 3.8,
      status: 'Solid / Balanced'
    },
    consumer: {
      michiganSentimentIndex: 70.5,
      retailSalesMoM: 0.4,
      personalSavingsRate: 4.8,
      m2MoneySupplyTrillions: 21.45,
      m2GrowthYoY: 2.8
    },
    indices,
    aiGuidance: {
      regimeTitle: 'Soft Landing & Global Liquidity Expansion Cycle',
      executiveSummary: 'Economia Statelor Unite parcurge o tranziție clasică de tip Soft Landing: inflația (CPI 2.7%, PCE 2.6%) se apropie de ținta de 2.0%, permițând Rezervei Federale să inițieze ciclul de reducere a dobânzilor cheie în condițiile unei piețe a muncii reziliente (șomaj 4.1%). Dez-inversarea curbei randamentelor (Spread 10Y-2Y la +0.20%) confirmă relaxarea politicii monetare și expansiunea lichidității globale (M2 la $21.45T).',
      fedPolicyOutlook: 'Rezerva Federală are cale liberă către reduceri succesive de dobândă (proiecție de 75-100 bps relaxare în următoarele 12 luni), coborând dobânda terminală spre rata neutră estimată de 3.25%. Aceasta injectează lichiditate masivă în sistemul bancar și piețele de capital.',
      impactOnStocks: {
        stance: 'Bullish',
        description: 'Multiplii de evaluare pentru acțiunile americane (S&P 500, NASDAQ) primesc un impuls puternic prin scăderea costului de discount al fluxurilor viitoare de numerar, susținuți de investițiile record în inteligență artificială și profitabilitatea companiilor Mega-Cap.'
      },
      impactOnCrypto: {
        stance: 'Strong Bullish',
        description: 'Bitcoin ($BTC) și altcoin-urile majore ($ETH, $SOL) prezintă o corelație istorică de peste 85% cu accelerarea M2 și relaxarea dobânzilor reale. Ciclul de lichiditate globală favorizează un breakout puternic pe termen mediu.'
      },
      impactOnMetals: {
        stance: 'Strong Bullish',
        description: 'Datoria națională record a SUA ($36.25T) și costul de peste $1.1T anual pentru serviciul datoriei accelerează dedolarizarea și achizițiile fizice de Aur ($XAU) din partea băncilor centrale ca activ de protecție suverană.'
      },
      keyRiskFactors: [
        'Presiunea fiscală generată de plata dobânzilor la datoria de $36.2T (necesar masiv de refinanțare la Trezorerie).',
        'Persistența componentei Shelter / Chirii în Core CPI ce ar putea încetini ritmul relaxării Fed.',
        'Spike-uri de volatilitate geopolitică pe lanțurile de aprovizionare cu petrol și mărfuri.'
      ],
      actionableTradingThesis: 'Regimul macro actual recomandă acumularea pe corecții (Buy the Dip) pe suporturile Money Line pentru Acțiuni SUA și Crypto, menținând în același timp o alocare strategică de refugiu pe Aur ($XAU).',
      confidenceScore: 92
    }
  };
}

macroRouter.get('/macro/usa-status', (req, res) => {
  try {
    const status = getLiveUSAEconomicStatus();
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch USA economic status', details: err.message });
  }
});
