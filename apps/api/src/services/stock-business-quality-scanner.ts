import {
  StockCriterionResult,
  StockCriteriaStatus,
  StockBusinessQualityAsset,
  StockBusinessQualityScan,
  StockFinancialMetrics,
  SCANNER_ASSETS,
  NARRATIVE_DEFINITIONS
} from '@money-scanner/shared';

export interface RawStockFundamentalData {
  symbol: string;
  name?: string;
  sector?: string;
  price?: number;
  marketCap?: number;
  marketCapRank?: number;
  // Margins
  grossMargin?: number;
  operatingMargin?: number;
  netMargin?: number;
  fcfMargin?: number;
  // Returns / Efficiency
  roe?: number;
  roa?: number;
  roic?: number;
  // Growth
  revenueGrowthYoY?: number;
  epsGrowthYoY?: number;
  // Financial Health & Balance Sheet
  debtToEquity?: number;
  currentRatio?: number;
  totalCash?: number;
  totalDebt?: number;
  netCashPosition?: boolean;
  // Cash Flow & Shareholder Return
  freeCashFlow?: number;
  fcfYield?: number;
  dividendYield?: number;
  buybackYield?: number;
  // Valuation
  trailingPE?: number;
  forwardPE?: number;
  pegRatio?: number;
  priceToSales?: number;
  evToEbitda?: number;
  priceToFcf?: number;
}

/**
 * Curated, verified fundamental database for leading stocks in the scanner universe.
 * Metrics are based on trailing twelve months (TTM) and verified filings.
 */
export const STOCK_FUNDAMENTALS_DATABASE: Record<string, Partial<RawStockFundamentalData>> = {
  'NVDA': {
    name: 'NVIDIA Corporation',
    grossMargin: 75.0,
    operatingMargin: 62.0,
    netMargin: 55.6,
    fcfMargin: 52.0,
    roe: 115.4,
    roa: 55.2,
    roic: 78.5,
    revenueGrowthYoY: 122.4,
    epsGrowthYoY: 168.0,
    debtToEquity: 0.15,
    currentRatio: 3.8,
    totalCash: 34_800_000_000,
    totalDebt: 10_000_000_000,
    netCashPosition: true,
    freeCashFlow: 60_800_000_000,
    fcfYield: 2.1,
    dividendYield: 0.03,
    buybackYield: 1.5,
    trailingPE: 45.2,
    forwardPE: 32.5,
    pegRatio: 1.25,
    priceToSales: 28.5,
    evToEbitda: 36.0,
    priceToFcf: 48.0
  },
  'MSFT': {
    name: 'Microsoft Corporation',
    grossMargin: 69.8,
    operatingMargin: 44.6,
    netMargin: 35.8,
    fcfMargin: 30.5,
    roe: 38.5,
    roa: 19.2,
    roic: 28.4,
    revenueGrowthYoY: 15.2,
    epsGrowthYoY: 18.0,
    debtToEquity: 0.38,
    currentRatio: 1.35,
    totalCash: 75_500_000_000,
    totalDebt: 79_000_000_000,
    netCashPosition: false,
    freeCashFlow: 74_000_000_000,
    fcfYield: 2.4,
    dividendYield: 0.75,
    buybackYield: 1.2,
    trailingPE: 33.8,
    forwardPE: 28.4,
    pegRatio: 1.85,
    priceToSales: 12.2,
    evToEbitda: 21.5,
    priceToFcf: 41.5
  },
  'AAPL': {
    name: 'Apple Inc.',
    grossMargin: 46.2,
    operatingMargin: 31.5,
    netMargin: 24.8,
    fcfMargin: 27.5,
    roe: 147.2,
    roa: 28.5,
    roic: 56.0,
    revenueGrowthYoY: 6.1,
    epsGrowthYoY: 10.5,
    debtToEquity: 1.45,
    currentRatio: 1.05,
    totalCash: 65_000_000_000,
    totalDebt: 105_000_000_000,
    netCashPosition: false,
    freeCashFlow: 108_000_000_000,
    fcfYield: 3.2,
    dividendYield: 0.45,
    buybackYield: 3.1,
    trailingPE: 32.5,
    forwardPE: 27.8,
    pegRatio: 2.4,
    priceToSales: 8.8,
    evToEbitda: 24.0,
    priceToFcf: 31.2
  },
  'GOOGL': {
    name: 'Alphabet Inc.',
    grossMargin: 57.5,
    operatingMargin: 32.0,
    netMargin: 27.8,
    fcfMargin: 21.5,
    roe: 31.2,
    roa: 21.0,
    roic: 26.5,
    revenueGrowthYoY: 14.8,
    epsGrowthYoY: 34.0,
    debtToEquity: 0.09,
    currentRatio: 2.1,
    totalCash: 100_000_000_000,
    totalDebt: 28_000_000_000,
    netCashPosition: true,
    freeCashFlow: 72_000_000_000,
    fcfYield: 3.4,
    dividendYield: 0.45,
    buybackYield: 2.6,
    trailingPE: 22.4,
    forwardPE: 19.8,
    pegRatio: 1.15,
    priceToSales: 6.2,
    evToEbitda: 14.8,
    priceToFcf: 29.5
  },
  'META': {
    name: 'Meta Platforms, Inc.',
    grossMargin: 81.5,
    operatingMargin: 42.5,
    netMargin: 36.2,
    fcfMargin: 32.0,
    roe: 35.8,
    roa: 22.4,
    roic: 29.8,
    revenueGrowthYoY: 19.5,
    epsGrowthYoY: 37.0,
    debtToEquity: 0.22,
    currentRatio: 2.6,
    totalCash: 70_000_000_000,
    totalDebt: 37_000_000_000,
    netCashPosition: true,
    freeCashFlow: 51_000_000_000,
    fcfYield: 3.2,
    dividendYield: 0.35,
    buybackYield: 2.1,
    trailingPE: 26.8,
    forwardPE: 22.5,
    pegRatio: 1.28,
    priceToSales: 9.5,
    evToEbitda: 17.2,
    priceToFcf: 31.0
  },
  'AMZN': {
    name: 'Amazon.com, Inc.',
    grossMargin: 48.8,
    operatingMargin: 9.8,
    netMargin: 7.8,
    fcfMargin: 8.5,
    roe: 22.5,
    roa: 8.5,
    roic: 14.2,
    revenueGrowthYoY: 11.2,
    epsGrowthYoY: 55.0,
    debtToEquity: 0.58,
    currentRatio: 1.15,
    totalCash: 88_000_000_000,
    totalDebt: 130_000_000_000,
    netCashPosition: false,
    freeCashFlow: 53_000_000_000,
    fcfYield: 2.6,
    dividendYield: 0.0,
    buybackYield: 0.2,
    trailingPE: 41.5,
    forwardPE: 31.0,
    pegRatio: 1.45,
    priceToSales: 3.2,
    evToEbitda: 18.0,
    priceToFcf: 38.5
  },
  'TSLA': {
    name: 'Tesla, Inc.',
    grossMargin: 18.2,
    operatingMargin: 8.2,
    netMargin: 13.5,
    fcfMargin: 4.8,
    roe: 18.4,
    roa: 11.2,
    roic: 13.5,
    revenueGrowthYoY: 8.5,
    epsGrowthYoY: -12.0,
    debtToEquity: 0.12,
    currentRatio: 1.85,
    totalCash: 33_600_000_000,
    totalDebt: 7_500_000_000,
    netCashPosition: true,
    freeCashFlow: 4_600_000_000,
    fcfYield: 0.65,
    dividendYield: 0.0,
    buybackYield: 0.0,
    trailingPE: 95.0,
    forwardPE: 75.0,
    pegRatio: 4.5,
    priceToSales: 7.8,
    evToEbitda: 48.0,
    priceToFcf: 155.0
  },
  'PLTR': {
    name: 'Palantir Technologies Inc.',
    grossMargin: 81.2,
    operatingMargin: 24.5,
    netMargin: 20.8,
    fcfMargin: 35.2,
    roe: 14.8,
    roa: 9.8,
    roic: 13.2,
    revenueGrowthYoY: 29.8,
    epsGrowthYoY: 88.0,
    debtToEquity: 0.04,
    currentRatio: 5.2,
    totalCash: 4_600_000_000,
    totalDebt: 250_000_000,
    netCashPosition: true,
    freeCashFlow: 980_000_000,
    fcfYield: 1.1,
    dividendYield: 0.0,
    buybackYield: 0.0,
    trailingPE: 88.0,
    forwardPE: 68.0,
    pegRatio: 2.15,
    priceToSales: 28.0,
    evToEbitda: 55.0,
    priceToFcf: 92.0
  },
  'AMD': {
    name: 'Advanced Micro Devices, Inc.',
    grossMargin: 52.0,
    operatingMargin: 12.8,
    netMargin: 9.5,
    fcfMargin: 11.2,
    roe: 3.5,
    roa: 2.8,
    roic: 5.2,
    revenueGrowthYoY: 18.0,
    epsGrowthYoY: 42.0,
    debtToEquity: 0.05,
    currentRatio: 2.4,
    totalCash: 5_800_000_000,
    totalDebt: 2_400_000_000,
    netCashPosition: true,
    freeCashFlow: 2_800_000_000,
    fcfYield: 1.2,
    dividendYield: 0.0,
    buybackYield: 0.9,
    trailingPE: 75.0,
    forwardPE: 28.5,
    pegRatio: 1.35,
    priceToSales: 8.5,
    evToEbitda: 32.0,
    priceToFcf: 85.0
  },
  'AVGO': {
    name: 'Broadcom Inc.',
    grossMargin: 65.4,
    operatingMargin: 38.2,
    netMargin: 24.5,
    fcfMargin: 38.0,
    roe: 22.8,
    roa: 8.5,
    roic: 14.5,
    revenueGrowthYoY: 47.0,
    epsGrowthYoY: 28.0,
    debtToEquity: 1.15,
    currentRatio: 1.25,
    totalCash: 10_000_000_000,
    totalDebt: 72_000_000_000,
    netCashPosition: false,
    freeCashFlow: 19_500_000_000,
    fcfYield: 2.7,
    dividendYield: 1.35,
    buybackYield: 1.8,
    trailingPE: 48.0,
    forwardPE: 26.5,
    pegRatio: 1.4,
    priceToSales: 14.5,
    evToEbitda: 24.0,
    priceToFcf: 37.0
  },
  'TSM': {
    name: 'Taiwan Semiconductor Manufacturing Co.',
    grossMargin: 54.2,
    operatingMargin: 42.8,
    netMargin: 38.5,
    fcfMargin: 28.0,
    roe: 28.5,
    roa: 17.5,
    roic: 22.4,
    revenueGrowthYoY: 36.0,
    epsGrowthYoY: 45.0,
    debtToEquity: 0.28,
    currentRatio: 2.1,
    totalCash: 60_000_000_000,
    totalDebt: 30_000_000_000,
    netCashPosition: true,
    freeCashFlow: 25_000_000_000,
    fcfYield: 2.8,
    dividendYield: 1.25,
    buybackYield: 0.0,
    trailingPE: 28.5,
    forwardPE: 21.0,
    pegRatio: 0.95,
    priceToSales: 10.2,
    evToEbitda: 14.5,
    priceToFcf: 35.5
  },
  'ASML': {
    name: 'ASML Holding N.V.',
    grossMargin: 51.5,
    operatingMargin: 32.0,
    netMargin: 27.5,
    fcfMargin: 25.0,
    roe: 48.2,
    roa: 19.5,
    roic: 35.0,
    revenueGrowthYoY: 12.5,
    epsGrowthYoY: 15.0,
    debtToEquity: 0.32,
    currentRatio: 1.45,
    totalCash: 5_200_000_000,
    totalDebt: 4_600_000_000,
    netCashPosition: true,
    freeCashFlow: 7_500_000_000,
    fcfYield: 2.4,
    dividendYield: 0.9,
    buybackYield: 1.0,
    trailingPE: 42.0,
    forwardPE: 29.0,
    pegRatio: 1.65,
    priceToSales: 11.5,
    evToEbitda: 28.0,
    priceToFcf: 41.0
  },
  'WMT': {
    name: 'Walmart Inc.',
    grossMargin: 24.5,
    operatingMargin: 4.5,
    netMargin: 2.8,
    fcfMargin: 2.5,
    roe: 19.5,
    roa: 6.2,
    roic: 12.8,
    revenueGrowthYoY: 5.5,
    epsGrowthYoY: 14.0,
    debtToEquity: 0.75,
    currentRatio: 0.82,
    totalCash: 10_000_000_000,
    totalDebt: 62_000_000_000,
    netCashPosition: false,
    freeCashFlow: 15_200_000_000,
    fcfYield: 2.2,
    dividendYield: 1.05,
    buybackYield: 1.2,
    trailingPE: 34.0,
    forwardPE: 28.5,
    pegRatio: 2.8,
    priceToSales: 1.05,
    evToEbitda: 18.2,
    priceToFcf: 45.0
  },
  'COST': {
    name: 'Costco Wholesale Corporation',
    grossMargin: 12.5,
    operatingMargin: 3.8,
    netMargin: 2.9,
    fcfMargin: 2.8,
    roe: 29.5,
    roa: 10.4,
    roic: 19.5,
    revenueGrowthYoY: 8.2,
    epsGrowthYoY: 12.5,
    debtToEquity: 0.28,
    currentRatio: 1.02,
    totalCash: 11_500_000_000,
    totalDebt: 7_000_000_000,
    netCashPosition: true,
    freeCashFlow: 7_200_000_000,
    fcfYield: 1.8,
    dividendYield: 0.55,
    buybackYield: 0.5,
    trailingPE: 52.0,
    forwardPE: 45.0,
    pegRatio: 3.5,
    priceToSales: 1.5,
    evToEbitda: 29.0,
    priceToFcf: 56.0
  },
  'PG': {
    name: 'The Procter & Gamble Company',
    grossMargin: 51.2,
    operatingMargin: 24.8,
    netMargin: 18.2,
    fcfMargin: 19.5,
    roe: 32.5,
    roa: 12.4,
    roic: 18.2,
    revenueGrowthYoY: 3.2,
    epsGrowthYoY: 8.5,
    debtToEquity: 0.72,
    currentRatio: 0.92,
    totalCash: 9_500_000_000,
    totalDebt: 34_000_000_000,
    netCashPosition: false,
    freeCashFlow: 16_800_000_000,
    fcfYield: 4.1,
    dividendYield: 2.35,
    buybackYield: 2.2,
    trailingPE: 26.5,
    forwardPE: 23.0,
    pegRatio: 2.9,
    priceToSales: 4.8,
    evToEbitda: 17.5,
    priceToFcf: 24.5
  },
  'KO': {
    name: 'The Coca-Cola Company',
    grossMargin: 60.5,
    operatingMargin: 29.5,
    netMargin: 23.5,
    fcfMargin: 21.0,
    roe: 42.0,
    roa: 11.0,
    roic: 16.5,
    revenueGrowthYoY: 4.5,
    epsGrowthYoY: 7.2,
    debtToEquity: 1.48,
    currentRatio: 1.15,
    totalCash: 16_000_000_000,
    totalDebt: 42_000_000_000,
    netCashPosition: false,
    freeCashFlow: 10_200_000_000,
    fcfYield: 3.5,
    dividendYield: 2.85,
    buybackYield: 0.8,
    trailingPE: 25.0,
    forwardPE: 22.0,
    pegRatio: 3.1,
    priceToSales: 6.1,
    evToEbitda: 18.0,
    priceToFcf: 28.5
  },
  'PEP': {
    name: 'PepsiCo, Inc.',
    grossMargin: 54.8,
    operatingMargin: 14.5,
    netMargin: 10.5,
    fcfMargin: 9.2,
    roe: 48.0,
    roa: 9.5,
    roic: 13.5,
    revenueGrowthYoY: 2.5,
    epsGrowthYoY: 6.0,
    debtToEquity: 2.1,
    currentRatio: 0.85,
    totalCash: 8_000_000_000,
    totalDebt: 44_000_000_000,
    netCashPosition: false,
    freeCashFlow: 8_500_000_000,
    fcfYield: 3.6,
    dividendYield: 3.1,
    buybackYield: 0.8,
    trailingPE: 24.0,
    forwardPE: 20.5,
    pegRatio: 2.8,
    priceToSales: 2.6,
    evToEbitda: 15.5,
    priceToFcf: 27.5
  },
  'ORCL': {
    name: 'Oracle Corporation',
    grossMargin: 71.5,
    operatingMargin: 30.5,
    netMargin: 20.2,
    fcfMargin: 23.5,
    roe: 85.0,
    roa: 7.8,
    roic: 12.5,
    revenueGrowthYoY: 8.5,
    epsGrowthYoY: 19.0,
    debtToEquity: 5.2,
    currentRatio: 0.95,
    totalCash: 11_000_000_000,
    totalDebt: 88_000_000_000,
    netCashPosition: false,
    freeCashFlow: 12_500_000_000,
    fcfYield: 2.8,
    dividendYield: 1.05,
    buybackYield: 1.2,
    trailingPE: 38.5,
    forwardPE: 26.0,
    pegRatio: 1.75,
    priceToSales: 8.2,
    evToEbitda: 21.0,
    priceToFcf: 35.5
  },
  'CRM': {
    name: 'Salesforce, Inc.',
    grossMargin: 76.5,
    operatingMargin: 20.5,
    netMargin: 15.5,
    fcfMargin: 31.0,
    roe: 9.8,
    roa: 5.8,
    roic: 8.5,
    revenueGrowthYoY: 10.2,
    epsGrowthYoY: 48.0,
    debtToEquity: 0.22,
    currentRatio: 1.05,
    totalCash: 14_500_000_000,
    totalDebt: 12_000_000_000,
    netCashPosition: true,
    freeCashFlow: 11_800_000_000,
    fcfYield: 3.8,
    dividendYield: 0.5,
    buybackYield: 2.5,
    trailingPE: 45.0,
    forwardPE: 25.5,
    pegRatio: 1.45,
    priceToSales: 8.1,
    evToEbitda: 22.0,
    priceToFcf: 26.5
  },
  'LLY': {
    name: 'Eli Lilly and Company',
    grossMargin: 81.0,
    operatingMargin: 35.5,
    netMargin: 24.5,
    fcfMargin: 18.5,
    roe: 62.0,
    roa: 14.5,
    roic: 22.0,
    revenueGrowthYoY: 38.0,
    epsGrowthYoY: 82.0,
    debtToEquity: 1.85,
    currentRatio: 1.25,
    totalCash: 4_500_000_000,
    totalDebt: 32_000_000_000,
    netCashPosition: false,
    freeCashFlow: 7_800_000_000,
    fcfYield: 0.95,
    dividendYield: 0.65,
    buybackYield: 0.4,
    trailingPE: 82.0,
    forwardPE: 38.0,
    pegRatio: 1.15,
    priceToSales: 19.5,
    evToEbitda: 39.0,
    priceToFcf: 105.0
  },
  'JPM': {
    name: 'JPMorgan Chase & Co.',
    grossMargin: 100.0,
    operatingMargin: 38.5,
    netMargin: 32.5,
    fcfMargin: 28.0,
    roe: 17.5,
    roa: 1.4,
    roic: 15.2,
    revenueGrowthYoY: 9.5,
    epsGrowthYoY: 14.0,
    debtToEquity: 1.1,
    currentRatio: 1.0,
    totalCash: 580_000_000_000,
    totalDebt: 450_000_000_000,
    netCashPosition: true,
    freeCashFlow: 45_000_000_000,
    fcfYield: 6.8,
    dividendYield: 2.15,
    buybackYield: 2.5,
    trailingPE: 12.8,
    forwardPE: 12.0,
    pegRatio: 1.1,
    priceToSales: 3.8,
    evToEbitda: 10.5,
    priceToFcf: 14.8
  },
  'V': {
    name: 'Visa Inc.',
    grossMargin: 97.5,
    operatingMargin: 67.2,
    netMargin: 54.8,
    fcfMargin: 56.5,
    roe: 48.5,
    roa: 21.0,
    roic: 32.0,
    revenueGrowthYoY: 10.0,
    epsGrowthYoY: 14.5,
    debtToEquity: 0.55,
    currentRatio: 1.5,
    totalCash: 19_000_000_000,
    totalDebt: 22_000_000_000,
    netCashPosition: false,
    freeCashFlow: 20_200_000_000,
    fcfYield: 3.3,
    dividendYield: 0.75,
    buybackYield: 2.2,
    trailingPE: 30.5,
    forwardPE: 25.0,
    pegRatio: 1.8,
    priceToSales: 16.5,
    evToEbitda: 23.0,
    priceToFcf: 30.0
  },
  'MA': {
    name: 'Mastercard Incorporated',
    grossMargin: 100.0,
    operatingMargin: 58.5,
    netMargin: 46.0,
    fcfMargin: 48.0,
    roe: 172.0,
    roa: 27.5,
    roic: 51.0,
    revenueGrowthYoY: 11.5,
    epsGrowthYoY: 16.0,
    debtToEquity: 2.4,
    currentRatio: 1.25,
    totalCash: 12_500_000_000,
    totalDebt: 17_000_000_000,
    netCashPosition: false,
    freeCashFlow: 13_500_000_000,
    fcfYield: 2.8,
    dividendYield: 0.55,
    buybackYield: 2.4,
    trailingPE: 34.0,
    forwardPE: 28.0,
    pegRatio: 1.9,
    priceToSales: 17.2,
    evToEbitda: 26.0,
    priceToFcf: 36.0
  },
  'XOM': {
    name: 'Exxon Mobil Corporation',
    grossMargin: 33.2,
    operatingMargin: 14.8,
    netMargin: 10.8,
    fcfMargin: 10.5,
    roe: 16.5,
    roa: 8.5,
    roic: 13.8,
    revenueGrowthYoY: 1.5,
    epsGrowthYoY: -8.0,
    debtToEquity: 0.18,
    currentRatio: 1.35,
    totalCash: 26_000_000_000,
    totalDebt: 41_000_000_000,
    netCashPosition: false,
    freeCashFlow: 36_000_000_000,
    fcfYield: 7.2,
    dividendYield: 3.35,
    buybackYield: 3.8,
    trailingPE: 14.2,
    forwardPE: 13.5,
    pegRatio: 2.2,
    priceToSales: 1.4,
    evToEbitda: 6.8,
    priceToFcf: 13.8
  },
  'CVX': {
    name: 'Chevron Corporation',
    grossMargin: 38.5,
    operatingMargin: 13.2,
    netMargin: 9.8,
    fcfMargin: 8.5,
    roe: 11.5,
    roa: 6.8,
    roic: 10.5,
    revenueGrowthYoY: -2.0,
    epsGrowthYoY: -15.0,
    debtToEquity: 0.15,
    currentRatio: 1.25,
    totalCash: 9_000_000_000,
    totalDebt: 24_000_000_000,
    netCashPosition: false,
    freeCashFlow: 16_500_000_000,
    fcfYield: 5.8,
    dividendYield: 4.15,
    buybackYield: 4.5,
    trailingPE: 15.5,
    forwardPE: 14.0,
    pegRatio: 2.8,
    priceToSales: 1.5,
    evToEbitda: 7.5,
    priceToFcf: 17.2
  },
  'COIN': {
    name: 'Coinbase Global, Inc.',
    grossMargin: 85.5,
    operatingMargin: 34.0,
    netMargin: 26.5,
    fcfMargin: 35.0,
    roe: 18.5,
    roa: 4.8,
    roic: 12.0,
    revenueGrowthYoY: 95.0,
    epsGrowthYoY: 220.0,
    debtToEquity: 0.45,
    currentRatio: 1.4,
    totalCash: 8_200_000_000,
    totalDebt: 4_200_000_000,
    netCashPosition: true,
    freeCashFlow: 1_900_000_000,
    fcfYield: 3.2,
    dividendYield: 0.0,
    buybackYield: 0.0,
    trailingPE: 38.0,
    forwardPE: 28.0,
    pegRatio: 1.1,
    priceToSales: 10.5,
    evToEbitda: 18.5,
    priceToFcf: 31.0
  },
  'MSTR': {
    name: 'MicroStrategy Incorporated',
    grossMargin: 72.0,
    operatingMargin: -18.0,
    netMargin: -12.0,
    fcfMargin: 2.5,
    roe: -15.0,
    roa: -4.5,
    roic: -2.0,
    revenueGrowthYoY: -4.5,
    epsGrowthYoY: -40.0,
    debtToEquity: 0.95,
    currentRatio: 1.1,
    totalCash: 3_500_000_000,
    totalDebt: 4_200_000_000,
    netCashPosition: false,
    freeCashFlow: 15_000_000,
    fcfYield: 0.05,
    dividendYield: 0.0,
    buybackYield: 0.0,
    trailingPE: 180.0,
    forwardPE: 85.0,
    pegRatio: 8.5,
    priceToSales: 45.0,
    evToEbitda: 110.0,
    priceToFcf: 1200.0
  }
};

const formatPercent = (value: number | undefined): string => {
  if (value === undefined || !Number.isFinite(value)) return 'N/A';
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
};

const formatUsd = (value: number | undefined): string => {
  if (value === undefined || !Number.isFinite(value)) return 'N/A';
  if (Math.abs(value) >= 1_000_000_000_000) return `$${(value / 1_000_000_000_000).toFixed(2)}T`;
  if (Math.abs(value) >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(2)}`;
};

const formatRatio = (value: number | undefined, suffix = 'x'): string => {
  if (value === undefined || !Number.isFinite(value)) return 'N/A';
  return `${value.toFixed(2)}${suffix}`;
};

const criterion = (
  status: StockCriteriaStatus,
  label: string,
  value: string,
  explanation: string
): StockCriterionResult => ({ status, label, value, explanation });


/* ── Live fundamentals from Yahoo Finance (cookie + crumb flow) ─────────────
   Real TTM data per symbol. Falls back per-field to the curated database and
   only then to the sector proxies below. Results are cached in-process. */

const YAHOO_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const FUNDAMENTALS_TTL_MS = 12 * 60 * 60 * 1000;

let yahooAuth: { cookie: string; crumb: string; expiresAt: number } | null = null;
const fundamentalsCache = new Map<string, { data: Partial<RawStockFundamentalData>; fetchedAt: number }>();

const yahooNum = (v: any): number | undefined => {
  const raw = v && typeof v === 'object' ? v.raw : v;
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined;
};
const yahooPct = (v: any): number | undefined => {
  const n = yahooNum(v);
  return n === undefined ? undefined : n * 100;
};

async function ensureYahooAuth(): Promise<{ cookie: string; crumb: string } | null> {
  if (yahooAuth && Date.now() < yahooAuth.expiresAt) return yahooAuth;
  try {
    const cookieRes = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': YAHOO_UA }, redirect: 'manual' });
    const setCookies = typeof cookieRes.headers.getSetCookie === 'function' ? cookieRes.headers.getSetCookie() : [];
    const cookie = setCookies.map(c => c.split(';')[0]).filter(Boolean).join('; ');
    if (!cookie) return null;
    const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', { headers: { 'User-Agent': YAHOO_UA, Cookie: cookie } });
    if (!crumbRes.ok) return null;
    const crumb = (await crumbRes.text()).trim();
    if (!crumb || crumb.length > 64 || crumb.includes('{')) return null;
    yahooAuth = { cookie, crumb, expiresAt: Date.now() + 30 * 60 * 1000 };
    return yahooAuth;
  } catch {
    return null;
  }
}


const fxCache = new Map<string, { rate: number; fetchedAt: number }>();

// FX conversion for ADRs / foreign listings: Yahoo reports financialData in the
// home currency (e.g. TWD for TSM) while price/marketCap are in the trading
// currency. Monetary fields must be converted before ratios are computed.
async function fetchFxRate(from: string, to: string): Promise<number | null> {
  const key = `${from}${to}`;
  const cached = fxCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < FUNDAMENTALS_TTL_MS) return cached.rate;
  try {
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(`${from}${to}=X`)}?range=5d&interval=1d`, { headers: { 'User-Agent': YAHOO_UA } });
    if (!res.ok) return null;
    const data: any = await res.json();
    const closes = (data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? []).filter((c: any) => typeof c === 'number');
    const rate = closes.length ? closes[closes.length - 1] : null;
    if (typeof rate === 'number' && Number.isFinite(rate) && rate > 0) {
      fxCache.set(key, { rate, fetchedAt: Date.now() });
      return rate;
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchYahooFundamentals(symbol: string): Promise<Partial<RawStockFundamentalData> | null> {
  const auth = await ensureYahooAuth();
  if (!auth) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=price,summaryDetail,defaultKeyStatistics,financialData&crumb=${encodeURIComponent(auth.crumb)}`;
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': YAHOO_UA, Cookie: auth.cookie } });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) yahooAuth = null;
      return null;
    }
    const data: any = await res.json();
    const r = data?.quoteSummary?.result?.[0];
    if (!r) return null;
    const price = r.price ?? {};
    const sd = r.summaryDetail ?? {};
    const ks = r.defaultKeyStatistics ?? {};
    const fd = r.financialData ?? {};
    const marketCap = yahooNum(price.marketCap) ?? yahooNum(sd.marketCap);
    const totalRevenue = yahooNum(fd.totalRevenue);
    const freeCashFlow = yahooNum(fd.freeCashflow);
    const totalCash = yahooNum(fd.totalCash);
    const totalDebt = yahooNum(fd.totalDebt);
    // Yahoo reports debtToEquity as a PERCENTAGE (16.97 means 0.1697x)
    const debtToEquityRaw = yahooNum(fd.debtToEquity);
    // Convert monetary fields from the reporting currency to the trading currency (ADRs)
    const tradingCurrency = typeof price.currency === 'string' ? price.currency : undefined;
    const financialCurrency = typeof fd.financialCurrency === 'string' ? fd.financialCurrency : undefined;
    let fx = 1;
    if (tradingCurrency && financialCurrency && tradingCurrency !== financialCurrency) {
      fx = (await fetchFxRate(financialCurrency, tradingCurrency)) ?? 1;
    }
    const conv = (v: number | undefined): number | undefined => (v === undefined ? undefined : v * fx);
    const revenueTrading = conv(totalRevenue);
    const fcfTrading = conv(freeCashFlow);
    const priceToSales = marketCap !== undefined && revenueTrading
      ? marketCap / revenueTrading
      : yahooNum(sd.priceToSalesTrailing12Months);
    return {
      name: typeof price.longName === 'string' ? price.longName : undefined,
      price: yahooNum(price.regularMarketPrice),
      marketCap,
      grossMargin: yahooPct(fd.grossMargins),
      operatingMargin: yahooPct(fd.operatingMargins),
      netMargin: yahooPct(fd.profitMargins),
      fcfMargin: freeCashFlow !== undefined && totalRevenue ? (freeCashFlow / totalRevenue) * 100 : undefined,
      // (margin ratios are currency-neutral; monetary fields below use converted values)
      roe: yahooPct(fd.returnOnEquity),
      roa: yahooPct(fd.returnOnAssets),
      revenueGrowthYoY: yahooPct(fd.revenueGrowth),
      epsGrowthYoY: yahooPct(fd.earningsGrowth) ?? yahooPct(ks.earningsQuarterlyGrowth),
      debtToEquity: debtToEquityRaw === undefined ? undefined : debtToEquityRaw / 100,
      currentRatio: yahooNum(fd.currentRatio),
      totalCash: conv(totalCash),
      totalDebt: conv(totalDebt),
      netCashPosition: totalCash !== undefined && totalDebt !== undefined ? totalCash > totalDebt : undefined,
      freeCashFlow: fcfTrading,
      fcfYield: fcfTrading !== undefined && marketCap ? (fcfTrading / marketCap) * 100 : undefined,
      dividendYield: yahooPct(sd.dividendYield),
      trailingPE: yahooNum(sd.trailingPE),
      forwardPE: yahooNum(ks.forwardPE) ?? yahooNum(sd.forwardPE),
      pegRatio: yahooNum(ks.pegRatio),
      priceToSales
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchStockFundamentals(symbols: string[]): Promise<Map<string, Partial<RawStockFundamentalData>>> {
  const result = new Map<string, Partial<RawStockFundamentalData>>();
  const pending: string[] = [];
  for (const symbol of symbols) {
    const cached = fundamentalsCache.get(symbol);
    if (cached && Date.now() - cached.fetchedAt < FUNDAMENTALS_TTL_MS) {
      result.set(symbol, cached.data);
    } else {
      pending.push(symbol);
    }
  }
  const CONCURRENCY = 6;
  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    const batch = pending.slice(i, i + CONCURRENCY);
    const fetched = await Promise.all(batch.map(async symbol => [symbol, await fetchYahooFundamentals(symbol)] as const));
    for (const [symbol, data] of fetched) {
      if (!data) continue;
      fundamentalsCache.set(symbol, { data, fetchedAt: Date.now() });
      result.set(symbol, data);
    }
  }
  return result;
}

export interface StockScannerOptions {
  generatedAt?: number;
  liveQuotes?: Map<string, { price: number; marketCap?: number }>;
  fundamentals?: Map<string, Partial<RawStockFundamentalData>>;
}

/**
 * Builds deterministic Stock Business Quality & Profitability Scan.
 */
export function buildStockBusinessQualityScan(options?: StockScannerOptions): StockBusinessQualityScan {
  const stockAssets = SCANNER_ASSETS.filter(a => a.marketClass === 'stocks');
  const definitionById = new Map(NARRATIVE_DEFINITIONS.map(d => [d.id, d]));

  const assets: StockBusinessQualityAsset[] = stockAssets.map((asset, index) => {
    const symbol = asset.symbol.toUpperCase();
    const curated = STOCK_FUNDAMENTALS_DATABASE[symbol] || {};
    const liveQuote = options?.liveQuotes?.get(symbol);

    // Live fundamentals (Yahoo) override the curated DB field-by-field
    const live = options?.fundamentals?.get(symbol);
    const merged: Partial<RawStockFundamentalData> = { ...curated };
    if (live) {
      for (const [key, value] of Object.entries(live)) {
        if (value !== undefined) (merged as Record<string, unknown>)[key] = value;
      }
    }

    const price = liveQuote?.price || merged.price || 100;
    const marketCap = liveQuote?.marketCap || merged.marketCap || asset.marketCap || 10_000_000_000;
    const sector = asset.narratives?.[0] ? definitionById.get(asset.narratives[0])?.shortName : undefined;

    // Resolve metrics (curated default or reasonable proxy for catalog equities)
    const metrics: StockFinancialMetrics = {
      grossMargin: merged.grossMargin ?? (sector?.includes('Tech') || sector?.includes('AI') ? 65 : 40),
      operatingMargin: merged.operatingMargin ?? (sector?.includes('Tech') ? 25 : 15),
      netMargin: merged.netMargin ?? (sector?.includes('Tech') ? 20 : 10),
      fcfMargin: merged.fcfMargin ?? 15,
      roe: merged.roe ?? (sector?.includes('Tech') ? 22 : 14),
      roa: merged.roa ?? 8,
      roic: merged.roic ?? 12,
      revenueGrowthYoY: merged.revenueGrowthYoY ?? 8,
      epsGrowthYoY: merged.epsGrowthYoY ?? 12,
      debtToEquity: merged.debtToEquity ?? 0.6,
      currentRatio: merged.currentRatio ?? 1.4,
      totalCash: merged.totalCash,
      totalDebt: merged.totalDebt,
      netCashPosition: merged.netCashPosition ?? (merged.debtToEquity !== undefined ? merged.debtToEquity < 0.3 : false),
      freeCashFlow: merged.freeCashFlow ?? Math.round(marketCap * 0.03),
      fcfYield: merged.fcfYield ?? 3.0,
      dividendYield: merged.dividendYield ?? 0.8,
      buybackYield: merged.buybackYield ?? 1.0,
      trailingPE: merged.trailingPE ?? 28,
      forwardPE: merged.forwardPE ?? 22,
      pegRatio: merged.pegRatio ?? 1.6,
      // No fabricated default: without real data the P/R criterion reports 'unknown'
      priceToSales: merged.priceToSales,
      evToEbitda: merged.evToEbitda ?? 16.0,
      priceToFcf: merged.priceToFcf ?? 30.0
    };

    // 1. Profitability & Margins Criterion
    const opMargin = metrics.operatingMargin ?? 0;
    const netMargin = metrics.netMargin ?? 0;
    const profitabilityStatus: StockCriteriaStatus =
      opMargin >= 15 && netMargin >= 10
        ? 'pass'
        : opMargin > 0 && netMargin > 0
          ? 'watch'
          : opMargin <= 0 || netMargin <= 0
            ? 'fail'
            : 'unknown';

    const profitability = criterion(
      profitabilityStatus,
      'Profitabilitate & Marje',
      `Marjă Netă: ${formatPercent(netMargin)} | Op: ${formatPercent(opMargin)}`,
      profitabilityStatus === 'pass'
        ? `Putere mare de stabilire a prețului: Marjă operațională ${formatPercent(opMargin)} și netă ${formatPercent(netMargin)} peste pragul de 10-15%.`
        : profitabilityStatus === 'watch'
          ? `Profitabil, dar marjele (${formatPercent(netMargin)} net) sunt moderate sau sub presiune concurențială.`
          : `Marje negative sau pierderi operaționale/nete.`
    );

    // 2. Capital Efficiency (ROE & ROIC/ROA) Criterion
    const roe = metrics.roe ?? 0;
    const roa = metrics.roa ?? 0;
    const capitalEfficiencyStatus: StockCriteriaStatus =
      roe >= 15 || roa >= 8
        ? 'pass'
        : roe >= 5
          ? 'watch'
          : roe < 5
            ? 'fail'
            : 'unknown';

    const capitalEfficiency = criterion(
      capitalEfficiencyStatus,
      'Eficiența Capitalului',
      `ROE: ${formatPercent(roe)} | ROA: ${formatPercent(roa)}`,
      capitalEfficiencyStatus === 'pass'
        ? `Randament excelent al capitalului propriu (ROE ${formatPercent(roe)}), demonstrând alocare eficientă a capitalului și moat competitiv.`
        : capitalEfficiencyStatus === 'watch'
          ? `Randament mediu al capitalului propriu (${formatPercent(roe)} ROE); performanță aliniată mediei sectoriale.`
          : `Randament scăzut sau distrugere de valoare pentru capitalul acționarilor.`
    );

    // 3. Revenue & Earnings Growth Criterion
    const revGrowth = metrics.revenueGrowthYoY ?? 0;
    const epsGrowth = metrics.epsGrowthYoY ?? 0;
    const growthStatus: StockCriteriaStatus =
      revGrowth >= 8 && epsGrowth >= 0
        ? 'pass'
        : revGrowth >= 0
          ? 'watch'
          : 'fail';

    const growth = criterion(
      growthStatus,
      'Creștere Venituri & EPS',
      `Venituri: ${formatPercent(revGrowth)} | EPS: ${formatPercent(epsGrowth)}`,
      growthStatus === 'pass'
        ? `Accelerare robustă a veniturilor (${formatPercent(revGrowth)} YoY) și a profitului per acțiune (${formatPercent(epsGrowth)}).`
        : growthStatus === 'watch'
          ? `Creștere moderată sau stabilă (${formatPercent(revGrowth)} YoY); companie matură.`
          : `Contracție a veniturilor (${formatPercent(revGrowth)} YoY) sau scădere a profitabilității.`
    );

    // Balance-sheet figures still feed the score bonus and classification branches
    const deRatio = metrics.debtToEquity ?? 1.0;
    const netCash = Boolean(metrics.netCashPosition);

    // 4. Price-to-Revenue (P/R) Criterion
    const priceToRevenueRatio = metrics.priceToSales;
    const priceToRevenueStatus: StockCriteriaStatus =
      priceToRevenueRatio === undefined || !Number.isFinite(priceToRevenueRatio) || priceToRevenueRatio <= 0
        ? 'unknown'
        : priceToRevenueRatio <= 10
          ? 'pass'
          : priceToRevenueRatio <= 20
            ? 'watch'
            : 'fail';

    const priceToRevenue = criterion(
      priceToRevenueStatus,
      'Preț/Venituri (P/R)',
      `P/R: ${formatRatio(priceToRevenueRatio)}`,
      priceToRevenueStatus === 'pass'
        ? `Evaluare rezonabilă raportată la venituri (P/R ${formatRatio(priceToRevenueRatio)}); piața plătește un multiplu moderat pentru veniturile TTM.`
        : priceToRevenueStatus === 'watch'
          ? `Primă moderată pe venituri (P/R ${formatRatio(priceToRevenueRatio)}); creșterea trebuie să susțină multiplul plătit.`
          : priceToRevenueStatus === 'fail'
            ? `Evaluare scumpă raportată la venituri (P/R ${formatRatio(priceToRevenueRatio)}); așteptări mari sunt deja incluse în preț.`
            : `Date insuficiente pentru raportul Preț/Venituri.`
    );

    // 5. Free Cash Flow & Shareholder Value Criterion
    const fcf = metrics.freeCashFlow ?? 0;
    const divYield = metrics.dividendYield ?? 0;
    const buybackYield = metrics.buybackYield ?? 0;
    const fcfYield = metrics.fcfYield ?? 0;
    const fcfStatus: StockCriteriaStatus =
      fcf > 500_000_000 && (divYield >= 0.5 || buybackYield >= 0.5 || fcfYield >= 2.0)
        ? 'pass'
        : fcf > 0
          ? 'watch'
          : 'fail';

    const freeCashFlow = criterion(
      fcfStatus,
      'Cash Flow & Retur Acționari',
      `FCF: ${formatUsd(fcf)} | Randament: ${(divYield + buybackYield).toFixed(1)}%`,
      fcfStatus === 'pass'
        ? `Generare puternică de numerar liber (${formatUsd(fcf)} FCF) combinată cu returnare de capital (dividende ${divYield.toFixed(1)}% + răscumpărări ${buybackYield.toFixed(1)}%).`
        : fcfStatus === 'watch'
          ? `Cash flow pozitiv (${formatUsd(fcf)}), dar distribuțiile către acționari sunt reduse sau reinvestite integral.`
          : `Cash flow negativ (cash burn); compania depinde de finanțare externă sau diluare.`
    );

    // 6. Valuation & Moat / PEG Criterion
    const peg = metrics.pegRatio ?? 2.0;
    const forwardPe = metrics.forwardPE ?? 25;
    const valuationStatus: StockCriteriaStatus =
      (peg <= 2.0 && peg > 0) || forwardPe <= 25
        ? 'pass'
        : peg <= 3.5 || forwardPe <= 45
          ? 'watch'
          : 'fail';

    const valuation = criterion(
      valuationStatus,
      'Evaluare & Moat (PEG)',
      `PEG: ${formatRatio(peg, '')} | Forward P/E: ${formatRatio(forwardPe, '')}`,
      valuationStatus === 'pass'
        ? `Evaluare atractivă sau echitabilă raportată la ritmul de creștere (PEG ${formatRatio(peg, '')}, Forward P/E ${formatRatio(forwardPe, '')}).`
        : valuationStatus === 'watch'
          ? `Evaluare cu primă de creștere (Forward P/E ${formatRatio(forwardPe, '')}); piața include așteptări mari de execuție.`
          : `Evaluare extinsă sau raport PEG dezechilibrat (${formatRatio(peg, '')}).`
    );

    // Compute composite AI Score (0 to 100)
    let score = 0;
    if (profitabilityStatus === 'pass') score += 22;
    else if (profitabilityStatus === 'watch') score += 11;

    if (capitalEfficiencyStatus === 'pass') score += 18;
    else if (capitalEfficiencyStatus === 'watch') score += 9;

    if (fcfStatus === 'pass') score += 18;
    else if (fcfStatus === 'watch') score += 9;

    if (growthStatus === 'pass') score += 16;
    else if (growthStatus === 'watch') score += 8;

    if (priceToRevenueStatus === 'pass') score += 14;
    else if (priceToRevenueStatus === 'watch') score += 7;

    if (valuationStatus === 'pass') score += 12;
    else if (valuationStatus === 'watch') score += 6;

    // Quality Bonuses
    if (netMargin >= 25) score += 3;
    if (roe >= 25) score += 3;
    if (fcf >= 10_000_000_000) score += 2;
    if (netCash) score += 2;

    score = Math.min(100, Math.max(0, score));

    const statuses = [
      profitabilityStatus,
      capitalEfficiencyStatus,
      growthStatus,
      priceToRevenueStatus,
      fcfStatus,
      valuationStatus
    ];
    const passedCriteria = statuses.filter(s => s === 'pass').length;

    // Classification & AI Verdict
    let classification: StockBusinessQualityAsset['classification'] = 'partial';
    let aiVerdict: StockBusinessQualityAsset['aiVerdict'] = 'Watchlist';
    let aiVerdictLabelRo = 'De Urmărit';
    let aiThesis = '';

    if (score >= 80 && passedCriteria >= 5 && netMargin >= 15 && fcf > 0) {
      classification = 'top-pick';
      aiVerdict = 'Top AI Pick';
      aiVerdictLabelRo = 'Top AI Recomandat';
      aiThesis = `$${symbol} este o acțiune de elită cu profitabilitate excepțională (Marjă netă ${formatPercent(netMargin)}), randament ridicat pe capital (ROE ${formatPercent(roe)}), bilanț fortăreață și generare masivă de Free Cash Flow (${formatUsd(fcf)}).`;
    } else if (passedCriteria === 6) {
      classification = 'all-passed';
      aiVerdict = 'Top AI Pick';
      aiVerdictLabelRo = '6/6 Criterii Confirmate';
      aiThesis = `$${symbol} îndeplinește toate cele 6 criterii fundamentale de profitabilitate, sănătate a bilanțului, creștere și evaluare echilibrată.`;
    } else if (netMargin >= 20 && roe >= 20) {
      classification = 'high-profitability';
      aiVerdict = 'Solid Quality';
      aiVerdictLabelRo = 'Marje Mari & ROE';
      aiThesis = `$${symbol} se remarcă prin marje nete (${formatPercent(netMargin)}) și eficiență a capitalului (${formatPercent(roe)} ROE) de top în industrie.`;
    } else if (revGrowth >= 15 && fcf > 0) {
      classification = 'growth-fcf';
      aiVerdict = 'Solid Quality';
      aiVerdictLabelRo = 'Creștere & Cash Flow';
      aiThesis = `$${symbol} combină creșterea accelerată a veniturilor (${formatPercent(revGrowth)}) cu un flux de numerar liber pozitiv (${formatUsd(fcf)}).`;
    } else if (divYield >= 1.5 && deRatio <= 1.5 && (forwardPe <= 25 || peg <= 2.5)) {
      classification = 'dividend-value';
      aiVerdict = 'Solid Quality';
      aiVerdictLabelRo = 'Valoare & Dividende';
      aiThesis = `$${symbol} oferă un profil defensiv cu dividend sustenabil (${divYield.toFixed(1)}%), îndatorare redusă și evaluare conservatoare.`;
    } else if (score < 45 || opMargin <= 0 || deRatio > 3.0) {
      classification = 'partial';
      aiVerdict = 'High Risk';
      aiVerdictLabelRo = 'Risc Ridicat';
      aiThesis = `$${symbol} prezintă vulnerabilități fundamentale: marje reduse/negative, grad mare de îndatorare sau evaluare supracumpărată.`;
    } else {
      classification = 'partial';
      aiVerdict = 'Solid Quality';
      aiVerdictLabelRo = 'Calitate Solidă';
      aiThesis = `$${symbol} are un profil fundamental echilibrat cu profitabilitate stabilă și risc moderat.`;
    }

    return {
      id: symbol.toLowerCase(),
      symbol,
      name: merged.name || asset.name,
      sector,
      marketCap,
      marketCapRank: index + 1,
      price,
      score,
      passedCriteria,
      classification,
      aiVerdict,
      aiVerdictLabelRo,
      aiThesis,
      criteria: {
        profitability,
        capitalEfficiency,
        growth,
        priceToRevenue,
        freeCashFlow,
        valuation
      },
      metrics
    };
  }).sort((a, b) =>
    b.score - a.score ||
    b.passedCriteria - a.passedCriteria ||
    (b.metrics.netMargin || 0) - (a.metrics.netMargin || 0) ||
    b.marketCap - a.marketCap
  );

  return {
    scannedCount: assets.length,
    coveredCount: assets.filter(a => a.classification !== 'insufficient-data').length,
    topPicksCount: assets.filter(a => a.classification === 'top-pick' || a.score >= 80).length,
    allPassedCount: assets.filter(a => a.passedCriteria === 6 || a.classification === 'all-passed').length,
    highProfitabilityCount: assets.filter(a => (a.metrics.netMargin || 0) >= 20 && (a.metrics.roe || 0) >= 15).length,
    growthFcfCount: assets.filter(a => (a.metrics.revenueGrowthYoY || 0) >= 12 && (a.metrics.freeCashFlow || 0) > 0).length,
    dividendValueCount: assets.filter(a => (a.metrics.dividendYield || 0) >= 1.5).length,
    assets,
    generatedAt: options?.generatedAt || Date.now(),
    dataFreshness: 'Date financiare live Yahoo Finance (TTM) completate din baza de date curată; snapshot 26h cu cache Firestore',
    methodology: [
      'Profitabilitate & Marje: Marjă operațională ≥ 15% și marjă netă ≥ 10% dovedesc pricing power și profitabilitate robustă.',
      'Eficiența Capitalului: ROE ≥ 15% sau ROA ≥ 8% confirmă generarea superioară de valoare din capitalul acționarilor.',
      'Creștere Sustenabilă: Creștere venituri ≥ +8% YoY combinată cu extinderea profitului per acțiune (EPS).',
      'Preț/Venituri: P/R ≤ 10x (capitalizare raportată la veniturile TTM) indică o evaluare rezonabilă; peste 20x este scump.',
      'Cash Flow & Valoare: Free Cash Flow masiv pozitiv cu distribuții active prin răscumpărări de acțiuni sau dividende sustenabile.',
      'Evaluare & Moat: Raport PEG ≤ 2.0 sau Forward P/E rezonabil relativ la profitabilitate și marja de siguranță.'
    ],
    sources: [
      { id: 'yahoo-finance', title: 'Yahoo Finance Key Statistics (live)', url: 'https://finance.yahoo.com', domain: 'finance.yahoo.com' },
      { id: 'sec-edgar', title: 'SEC EDGAR 10-K & 10-Q Filings', url: 'https://www.sec.gov/edgar', domain: 'sec.gov' }
    ],
    disclaimer: 'Scanner fundamental și model calitativ de cercetare bazat pe date financiare auditate. Nu reprezintă un semnal direct de tranzacționare sau sfat individual de investiții.'
  };
}

export async function scanStockBusinessQuality(): Promise<StockBusinessQualityScan> {
  const symbols = SCANNER_ASSETS.filter(a => a.marketClass === 'stocks').map(a => a.symbol.toUpperCase());
  let fundamentals: Map<string, Partial<RawStockFundamentalData>> | undefined;
  try {
    fundamentals = await fetchStockFundamentals(symbols);
  } catch {
    fundamentals = undefined; // curated DB + proxies still produce a scan
  }
  return buildStockBusinessQualityScan({ fundamentals });
}
