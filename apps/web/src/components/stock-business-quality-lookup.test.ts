import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findStockInScan } from './StockBusinessQualityCard.js';
import type { StockBusinessQualityScan, StockBusinessQualityAsset } from '../types.js';

const mockScan: StockBusinessQualityScan = {
  scannedCount: 3,
  coveredCount: 3,
  topPicksCount: 2,
  allPassedCount: 1,
  highProfitabilityCount: 2,
  growthFcfCount: 2,
  dividendValueCount: 1,
  generatedAt: Date.now(),
  dataFreshness: 'Mock live',
  methodology: ['Test methodology'],
  sources: [{ id: 'test', title: 'Test Source', url: 'https://test.com', domain: 'test.com' }],
  disclaimer: 'Test disclaimer',
  assets: [
    {
      id: 'nvda',
      symbol: 'NVDA',
      name: 'NVIDIA Corporation',
      sector: 'Semiconductors',
      marketCap: 3_000_000_000_000,
      marketCapRank: 1,
      price: 130.5,
      score: 95,
      passedCriteria: 6,
      classification: 'top-pick',
      aiVerdict: 'Top AI Pick',
      aiVerdictLabelRo: 'Top AI Recomandat',
      aiThesis: 'Leader in AI compute with unmatched margins.',
      criteria: {
        profitability: { status: 'pass', label: 'Profitabilitate & Marje', value: '55.6% net', explanation: 'Pass' },
        capitalEfficiency: { status: 'pass', label: 'Eficiența Capitalului', value: '115.4% ROE', explanation: 'Pass' },
        growth: { status: 'pass', label: 'Creștere Venituri & EPS', value: '+122.4%', explanation: 'Pass' },
        priceToRevenue: { status: 'watch', label: 'Preț/Venituri (P/R)', value: 'P/R: 18.0x', explanation: 'Watch' },
        freeCashFlow: { status: 'pass', label: 'Cash Flow & Retur Acționari', value: '$60.8B', explanation: 'Pass' },
        valuation: { status: 'pass', label: 'Evaluare & Moat (PEG)', value: '1.25 PEG', explanation: 'Pass' }
      },
      metrics: {
        netMargin: 55.6,
        operatingMargin: 62.0,
        roe: 115.4,
        revenueGrowthYoY: 122.4,
        freeCashFlow: 60_800_000_000,
        debtToEquity: 0.15,
        pegRatio: 1.25
      }
    },
    {
      id: 'aapl',
      symbol: 'AAPL',
      name: 'Apple Inc.',
      sector: 'Consumer Tech',
      marketCap: 3_400_000_000_000,
      marketCapRank: 2,
      price: 230.0,
      score: 87,
      passedCriteria: 3,
      classification: 'top-pick',
      aiVerdict: 'Top AI Pick',
      aiVerdictLabelRo: 'Top AI Recomandat',
      aiThesis: 'Ecosystem powerhouse with massive cash return.',
      criteria: {
        profitability: { status: 'pass', label: 'Profitabilitate & Marje', value: '24.8% net', explanation: 'Pass' },
        capitalEfficiency: { status: 'pass', label: 'Eficiența Capitalului', value: '147.2% ROE', explanation: 'Pass' },
        growth: { status: 'watch', label: 'Creștere Venituri & EPS', value: '+6.1%', explanation: 'Watch' },
        priceToRevenue: { status: 'pass', label: 'Preț/Venituri (P/R)', value: 'P/R: 7.4x', explanation: 'Pass' },
        freeCashFlow: { status: 'pass', label: 'Cash Flow & Retur Acționari', value: '$108B', explanation: 'Pass' },
        valuation: { status: 'watch', label: 'Evaluare & Moat (PEG)', value: '2.4 PEG', explanation: 'Watch' }
      },
      metrics: {
        netMargin: 24.8,
        roe: 147.2,
        freeCashFlow: 108_000_000_000
      }
    },
    {
      id: 'mstr',
      symbol: 'MSTR',
      name: 'MicroStrategy Inc',
      marketCap: 40_000_000_000,
      marketCapRank: 3,
      price: 150.0,
      score: 35,
      passedCriteria: 1,
      classification: 'partial',
      aiVerdict: 'High Risk',
      aiVerdictLabelRo: 'Risc Ridicat',
      aiThesis: 'High leverage and negative core operating margins.',
      criteria: {
        profitability: { status: 'fail', label: 'Profitabilitate & Marje', value: '-12% net', explanation: 'Fail' },
        capitalEfficiency: { status: 'fail', label: 'Eficiența Capitalului', value: '-15% ROE', explanation: 'Fail' },
        growth: { status: 'fail', label: 'Creștere Venituri & EPS', value: '-4.5%', explanation: 'Fail' },
        priceToRevenue: { status: 'pass', label: 'Preț/Venituri (P/R)', value: 'P/R: 3.2x', explanation: 'Pass' },
        freeCashFlow: { status: 'watch', label: 'Cash Flow & Retur Acționari', value: '$15M', explanation: 'Watch' },
        valuation: { status: 'fail', label: 'Evaluare & Moat (PEG)', value: '8.5 PEG', explanation: 'Fail' }
      },
      metrics: {
        netMargin: -12,
        roe: -15
      }
    }
  ]
};

describe('findStockInScan — Stock Business Quality lookup', () => {
  it('matches stock by exact symbol', () => {
    const result = findStockInScan(mockScan, 'NVDA');
    assert.ok(result);
    assert.equal(result.symbol, 'NVDA');
    assert.equal(result.score, 95);
    assert.equal(result.passedCriteria, 6);
    assert.equal(result.aiVerdict, 'Top AI Pick');
  });

  it('normalizes $ prefix and lowercase symbol', () => {
    const result = findStockInScan(mockScan, '$aapl');
    assert.ok(result);
    assert.equal(result.symbol, 'AAPL');
    assert.equal(result.score, 87);
  });

  it('returns correct data for 6/6 passed top pick', () => {
    const nvda = findStockInScan(mockScan, 'NVDA');
    assert.ok(nvda);
    assert.equal(nvda.passedCriteria, 6);
    assert.equal(nvda.criteria.profitability.status, 'pass');
    assert.equal(nvda.criteria.capitalEfficiency.status, 'pass');
    assert.equal(nvda.criteria.growth.status, 'pass');
    assert.equal(nvda.criteria.priceToRevenue.status, 'watch');
    assert.equal(nvda.criteria.freeCashFlow.status, 'pass');
    assert.equal(nvda.criteria.valuation.status, 'pass');
  });

  it('returns null for stock not in scan', () => {
    const result = findStockInScan(mockScan, 'UNKNOWN_TICKER');
    assert.equal(result, null);
  });

  it('returns null for null/undefined scan (network error fallback)', () => {
    assert.equal(findStockInScan(null, 'NVDA'), null);
    assert.equal(findStockInScan(undefined, 'NVDA'), null);
  });

  it('returns null for empty assets array', () => {
    const emptyScan = { ...mockScan, assets: [] };
    assert.equal(findStockInScan(emptyScan, 'NVDA'), null);
  });

  it('returns null for empty symbol string', () => {
    assert.equal(findStockInScan(mockScan, ''), null);
  });

  it('correctly retrieves high risk / low score stock', () => {
    const mstr = findStockInScan(mockScan, 'MSTR');
    assert.ok(mstr);
    assert.equal(mstr.aiVerdict, 'High Risk');
    assert.equal(mstr.score, 35);
    assert.equal(mstr.criteria.profitability.status, 'fail');
  });
});
