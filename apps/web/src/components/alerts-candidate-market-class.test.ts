import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { filterFlipCandidates } from './AlertsCenterView.js';
import type { FlipCandidateDashboardItem } from '../services/api.js';

const mockCandidates: FlipCandidateDashboardItem[] = [
  {
    id: 'crypto:BTC:1d',
    symbol: 'BTC',
    name: 'Bitcoin',
    marketClass: 'crypto',
    timeframe: '1d',
    direction: 'BULLISH',
    status: 'VERY_CLOSE',
    currentPrice: 65000,
    triggerPrice: 66000,
    distancePercent: 1.5,
    distanceAtr: 0.8,
    priorityScore: 92,
    atr: 1200,
    rvol: 1.6,
    moneyLineTier: 'Tier 1',
    moneyLineScore: 85,
    weeklyTier: 'Tier 1',
    weeklyScore: 80,
    sma50: 60000,
    sma200: 55000,
    weeklyAligned: true,
    sma50Aligned: true,
    sma200Aligned: true,
    candleTimestamp: 1725000000000,
    scannedAt: 1725000000000
  },
  {
    id: 'crypto:ETH:1w',
    symbol: 'ETH',
    name: 'Ethereum',
    marketClass: 'crypto',
    timeframe: '1w',
    direction: 'BEARISH',
    status: 'APPROACHING',
    currentPrice: 2500,
    triggerPrice: 2450,
    distancePercent: 2.0,
    distanceAtr: 1.1,
    priorityScore: 75,
    atr: 80,
    rvol: 0.9,
    moneyLineTier: 'Tier 2',
    moneyLineScore: 60,
    weeklyTier: 'Neutral',
    weeklyScore: 50,
    sma50: 2600,
    sma200: 2400,
    weeklyAligned: false,
    sma50Aligned: false,
    sma200Aligned: true,
    candleTimestamp: 1725000000000,
    scannedAt: 1725000000000
  },
  {
    id: 'stocks:NVDA:1d',
    symbol: 'NVDA',
    name: 'Nvidia Corp',
    marketClass: 'stocks',
    timeframe: '1d',
    direction: 'BULLISH',
    status: 'VERY_CLOSE',
    currentPrice: 125,
    triggerPrice: 128,
    distancePercent: 2.4,
    distanceAtr: 0.9,
    priorityScore: 89,
    atr: 4.5,
    rvol: 1.4,
    moneyLineTier: 'Tier 1',
    moneyLineScore: 88,
    weeklyTier: 'Tier 1',
    weeklyScore: 85,
    sma50: 118,
    sma200: 105,
    weeklyAligned: true,
    sma50Aligned: true,
    sma200Aligned: true,
    candleTimestamp: 1725000000000,
    scannedAt: 1725000000000
  },
  {
    id: 'stocks:TSLA:1w',
    symbol: 'TSLA',
    name: 'Tesla Inc',
    marketClass: 'stocks',
    timeframe: '1w',
    direction: 'BEARISH',
    status: 'APPROACHING',
    currentPrice: 210,
    triggerPrice: 205,
    distancePercent: 2.4,
    distanceAtr: 1.2,
    priorityScore: 70,
    atr: 12,
    rvol: 0.8,
    moneyLineTier: 'Tier 2',
    moneyLineScore: 55,
    weeklyTier: 'Neutral',
    weeklyScore: 45,
    sma50: 220,
    sma200: 200,
    weeklyAligned: false,
    sma50Aligned: false,
    sma200Aligned: true,
    candleTimestamp: 1725000000000,
    scannedAt: 1725000000000
  }
];

describe('filterFlipCandidates — Market Class Filtering', () => {
  it('returns all candidates when candidateMarketClass is ALL', () => {
    const results = filterFlipCandidates(mockCandidates, { candidateMarketClass: 'ALL' });
    assert.equal(results.length, 4);
  });

  it('returns only crypto candidates when candidateMarketClass is crypto', () => {
    const results = filterFlipCandidates(mockCandidates, { candidateMarketClass: 'crypto' });
    assert.equal(results.length, 2);
    assert.ok(results.every(c => c.marketClass === 'crypto'));
    assert.deepEqual(results.map(c => c.symbol), ['BTC', 'ETH']);
  });

  it('returns only stock candidates when candidateMarketClass is stocks', () => {
    const results = filterFlipCandidates(mockCandidates, { candidateMarketClass: 'stocks' });
    assert.equal(results.length, 2);
    assert.ok(results.every(c => c.marketClass === 'stocks'));
    assert.deepEqual(results.map(c => c.symbol), ['NVDA', 'TSLA']);
  });

  it('combines market class filter with direction filter (stocks + BULLISH)', () => {
    const results = filterFlipCandidates(mockCandidates, {
      candidateMarketClass: 'stocks',
      candidateFilter: 'BULLISH'
    });
    assert.equal(results.length, 1);
    assert.equal(results[0].symbol, 'NVDA');
  });

  it('combines market class filter with timeframe filter (crypto + 1w)', () => {
    const results = filterFlipCandidates(mockCandidates, {
      candidateMarketClass: 'crypto',
      candidateTimeframe: '1w'
    });
    assert.equal(results.length, 1);
    assert.equal(results[0].symbol, 'ETH');
  });

  it('combines market class filter with text search query', () => {
    const results = filterFlipCandidates(mockCandidates, {
      candidateMarketClass: 'stocks',
      candidateSearch: 'Tesla'
    });
    assert.equal(results.length, 1);
    assert.equal(results[0].symbol, 'TSLA');
  });

  it('returns empty array if market class filter excludes search match', () => {
    // Searching for Tesla while filtering for crypto should return empty
    const results = filterFlipCandidates(mockCandidates, {
      candidateMarketClass: 'crypto',
      candidateSearch: 'TSLA'
    });
    assert.equal(results.length, 0);
  });

  it('handles undefined and empty candidate arrays safely', () => {
    assert.deepEqual(filterFlipCandidates(undefined, { candidateMarketClass: 'crypto' }), []);
    assert.deepEqual(filterFlipCandidates([], { candidateMarketClass: 'stocks' }), []);
  });
});
