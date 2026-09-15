export interface YieldPoint {
  maturity: string; // '1M' | '3M' | '6M' | '1Y' | '2Y' | '5Y' | '10Y' | '30Y'
  rate: number;
  priorRate: number;
  change: number;
}

export interface MacroIndexItem {
  symbol: string;
  name: string;
  value: number;
  changePercent: number;
  category: 'Equities' | 'Volatility' | 'Currency' | 'Liquidity';
  statusBadge?: string;
  observationDate?: string;
  source?: string;
}

export interface MacroObservation {
  value: number;
  observationDate: string;
  priorValue?: number;
  priorObservationDate?: string;
  yearAgoValue?: number;
  unit: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual';
  source: string;
  sourceUrl: string;
  status: 'available' | 'stale' | 'unavailable';
}

export interface MacroCalendarEvent {
  title: string;
  date: string;
  source: string;
  sourceUrl: string;
}

export interface USAEconomicStatus {
  timestamp: number;
  fiscal: {
    totalNationalDebt: number; // in USD
    debtFormatted: string; // e.g. "$36.24T"
    debtToGdpPercent: number; // e.g. 123.8
    annualInterestExpense?: number; // in USD
    annualDeficit?: number;
    debtPerCitizen?: number;
    debtPerTaxpayer?: number;
    observationDate?: string;
    source?: string;
  };
  inflation: {
    cpiYoY: number; // e.g. 2.7
    cpiMoM: number; // e.g. 0.2
    coreCpiYoY: number; // e.g. 3.1
    corePceYoY: number; // e.g. 2.6
    ppiYoY: number; // e.g. 2.2
    targetInflation: number; // 2.0
    status: 'Cooling' | 'Sticky' | 'Elevated' | 'Target Met';
  };
  monetaryPolicy: {
    fedFundsRateRange: string; // "5.25% - 5.50%"
    effectiveFedRate: number; // 5.33
    nextFomcDate: string; // "18 Septembrie 2026"
    rateCutProb25bps?: number;
    rateCutProb50bps?: number;
    neutralRateEstimate?: number;
    cyclePhase: 'Easing Cycle (Rate Cuts)' | 'Tightening' | 'Neutral Pause';
  };
  yieldCurve: {
    points: YieldPoint[];
    spread10Y2Y: number; // e.g. 0.20
    isInverted: boolean;
    curveRegime: 'Bull Steepener (Rate Cuts Ahead)' | 'Inverted (Recession Warning)' | 'Flat' | 'Normal';
  };
  laborMarket: {
    unemploymentRate: number; // e.g. 4.1
    nonFarmPayrollsMonthly: number; // e.g. 182000
    initialJoblessClaims: number; // e.g. 221000
    wageGrowthYoY: number; // e.g. 3.8
    status: 'Solid / Balanced' | 'Overheating' | 'Softening';
  };
  consumer: {
    michiganSentimentIndex: number; // e.g. 70.5
    retailSalesMoM: number; // e.g. 0.4
    personalSavingsRate: number; // e.g. 4.8
    m2MoneySupplyTrillions: number; // e.g. 21.45
    m2GrowthYoY: number; // e.g. 2.8
  };
  indices: MacroIndexItem[];
  indicators?: Record<string, MacroObservation>;
  calendar?: MacroCalendarEvent[];
  dataQuality?: {
    generatedAt: number;
    staleSources: string[];
    unavailableSeries: string[];
    note: string;
  };
  aiGuidance: {
    regimeTitle: string; // "Soft Landing & Global Liquidity Expansion"
    executiveSummary: string;
    fedPolicyOutlook: string;
    impactOnStocks: {
      stance: 'Bullish' | 'Neutral' | 'Bearish';
      description: string;
    };
    impactOnCrypto: {
      stance: 'Strong Bullish' | 'Bullish' | 'Neutral';
      description: string;
    };
    impactOnMetals: {
      stance: 'Strong Bullish' | 'Bullish' | 'Neutral';
      description: string;
    };
    keyRiskFactors: string[];
    actionableTradingThesis: string;
    confidenceScore?: number; // 0-100; omitted for deterministic summaries
  };
}
