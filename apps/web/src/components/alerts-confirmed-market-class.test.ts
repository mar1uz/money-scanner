import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { filterConfirmedFlips } from './AlertsCenterView.js';
import type { FlipCandidateDashboardItem } from '../services/api.js';

const mockConfirmedFlips: FlipCandidateDashboardItem[] = [
  {
    id: 'crypto:BTC:1d',
    symbol: 'BTC',
    name: 'Bitcoin',
    marketClass: 'crypto',
    timeframe: '1d',
    direction: 'BULLISH',
    status: 'CONFIRMED',
    currentPrice: 65000,
    triggerPrice: 62000,
    distancePercent: 4.8,
    distanceAtr: 1.2,
    priorityScore: 90,
    atr: 1200,
    rvol: 1.5,
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
    confirmedAt: 1725000000000,
    scannedAt: 1725000000000
  },
  {
    id: 'crypto:ETH:1w',
    symbol: 'ETH',
    name: 'Ethereum',
    marketClass: 'crypto',
    timeframe: '1w',
    direction: 'BULLISH',
    status: 'CONFIRMED',
    currentPrice: 2600,
    triggerPrice: 2400,
    distancePercent: 8.3,
    distanceAtr: 1.4,
    priorityScore: 88,
    atr: 80,
    rvol: 1.2,
    moneyLineTier: 'Tier 1',
    moneyLineScore: 82,
    weeklyTier: 'Tier 1',
    weeklyScore: 80,
    sma50: 2300,
    sma200: 2100,
    weeklyAligned: true,
    sma50Aligned: true,
    sma200Aligned: true,
    candleTimestamp: 1724900000000,
    confirmedAt: 1724900000000,
    scannedAt: 1724900000000
  },
  {
    id: 'crypto:SOL:4h',
    symbol: 'SOL',
    name: 'Solana',
    marketClass: 'crypto',
    timeframe: '4h',
    direction: 'BEARISH',
    status: 'CONFIRMED',
    currentPrice: 130,
    triggerPrice: 140,
    distancePercent: -7.1,
    distanceAtr: -1.1,
    priorityScore: 75,
    atr: 5,
    rvol: 0.9,
    moneyLineTier: 'Tier 3',
    moneyLineScore: -50,
    weeklyTier: 'Tier 2',
    weeklyScore: -40,
    sma50: 145,
    sma200: 150,
    weeklyAligned: true,
    sma50Aligned: true,
    sma200Aligned: true,
    candleTimestamp: 1724800000000,
    confirmedAt: 1724800000000,
    scannedAt: 1724800000000
  },
  {
    id: 'stocks:AAPL:1w',
    symbol: 'AAPL',
    name: 'Apple Inc',
    marketClass: 'stocks',
    timeframe: '1w',
    direction: 'BULLISH',
    status: 'CONFIRMED',
    currentPrice: 230,
    triggerPrice: 210,
    distancePercent: 9.5,
    distanceAtr: 1.6,
    priorityScore: 92,
    atr: 3,
    rvol: 1.4,
    moneyLineTier: 'Tier 1',
    moneyLineScore: 90,
    weeklyTier: 'Tier 1',
    weeklyScore: 85,
    sma50: 215,
    sma200: 195,
    weeklyAligned: true,
    sma50Aligned: true,
    sma200Aligned: true,
    candleTimestamp: 1725100000000,
    confirmedAt: 1725100000000,
    scannedAt: 1725100000000
  },
  {
    id: 'stocks:NVDA:1d',
    symbol: 'NVDA',
    name: 'NVIDIA Corp',
    marketClass: 'stocks',
    timeframe: '1d',
    direction: 'BULLISH',
    status: 'CONFIRMED',
    currentPrice: 120,
    triggerPrice: 110,
    distancePercent: 9.1,
    distanceAtr: 1.5,
    priorityScore: 95,
    atr: 4,
    rvol: 1.8,
    moneyLineTier: 'Tier 1',
    moneyLineScore: 95,
    weeklyTier: 'Tier 1',
    weeklyScore: 90,
    sma50: 112,
    sma200: 95,
    weeklyAligned: true,
    sma50Aligned: true,
    sma200Aligned: true,
    candleTimestamp: 1725050000000,
    confirmedAt: 1725050000000,
    scannedAt: 1725050000000
  },
  {
    id: 'stocks:TSLA:1d',
    symbol: 'TSLA',
    name: 'Tesla Inc',
    marketClass: 'stocks',
    timeframe: '1d',
    direction: 'BEARISH',
    status: 'CONFIRMED',
    currentPrice: 210,
    triggerPrice: 230,
    distancePercent: -8.7,
    distanceAtr: -1.3,
    priorityScore: 78,
    atr: 8,
    rvol: 1.1,
    moneyLineTier: 'Tier 3',
    moneyLineScore: -60,
    weeklyTier: 'Tier 3',
    weeklyScore: -55,
    sma50: 225,
    sma200: 240,
    weeklyAligned: true,
    sma50Aligned: true,
    sma200Aligned: true,
    candleTimestamp: 1724700000000,
    confirmedAt: 1724700000000,
    scannedAt: 1724700000000
  },
  {
    id: 'metals:XAU:1d',
    symbol: 'XAU',
    name: 'Gold',
    marketClass: 'metals',
    timeframe: '1d',
    direction: 'BULLISH',
    status: 'CONFIRMED',
    currentPrice: 2500,
    triggerPrice: 2450,
    distancePercent: 2.0,
    distanceAtr: 0.8,
    priorityScore: 80,
    atr: 25,
    rvol: 1.0,
    moneyLineTier: 'Tier 2',
    moneyLineScore: 60,
    weeklyTier: 'Tier 2',
    weeklyScore: 60,
    sma50: 2420,
    sma200: 2300,
    weeklyAligned: true,
    sma50Aligned: true,
    sma200Aligned: true,
    candleTimestamp: 1724600000000,
    confirmedAt: 1724600000000,
    scannedAt: 1724600000000
  }
];

describe('AlertsCenterView — Confirmed Money Line Flips Market Class Filtering', () => {
  it('displays only crypto confirmed flips when selecting "crypto"', () => {
    const results = filterConfirmedFlips(mockConfirmedFlips, {
      confirmedMarketClass: 'crypto'
    });

    assert.equal(results.length, 3);
    assert.ok(results.every(item => item.marketClass === 'crypto'));
    const symbols = results.map(r => r.symbol);
    assert.ok(symbols.includes('BTC'));
    assert.ok(symbols.includes('ETH'));
    assert.ok(symbols.includes('SOL'));
    assert.ok(!symbols.includes('AAPL'));
    assert.ok(!symbols.includes('NVDA'));
    assert.ok(!symbols.includes('TSLA'));
    assert.ok(!symbols.includes('XAU'));
  });

  it('displays only stock confirmed flips when selecting "stocks"', () => {
    const results = filterConfirmedFlips(mockConfirmedFlips, {
      confirmedMarketClass: 'stocks'
    });

    assert.equal(results.length, 3);
    assert.ok(results.every(item => item.marketClass === 'stocks'));
    const symbols = results.map(r => r.symbol);
    assert.ok(symbols.includes('AAPL'));
    assert.ok(symbols.includes('NVDA'));
    assert.ok(symbols.includes('TSLA'));
    assert.ok(!symbols.includes('BTC'));
    assert.ok(!symbols.includes('ETH'));
    assert.ok(!symbols.includes('SOL'));
    assert.ok(!symbols.includes('XAU'));
  });

  it('displays all market classes without restriction when selecting "ALL" / "Toate"', () => {
    const results = filterConfirmedFlips(mockConfirmedFlips, {
      confirmedMarketClass: 'ALL'
    });

    assert.equal(results.length, 7);
    const classes = new Set(results.map(r => r.marketClass));
    assert.ok(classes.has('crypto'));
    assert.ok(classes.has('stocks'));
    assert.ok(classes.has('metals'));
  });

  it('filters correctly across bullish direction combined with market class', () => {
    // Bullish Stocks only
    const bullishStocks = filterConfirmedFlips(mockConfirmedFlips, {
      confirmedFilter: 'BULLISH',
      confirmedMarketClass: 'stocks'
    });
    assert.equal(bullishStocks.length, 2);
    assert.deepEqual(bullishStocks.map(r => r.symbol).sort(), ['AAPL', 'NVDA']);

    // Bullish Crypto only
    const bullishCrypto = filterConfirmedFlips(mockConfirmedFlips, {
      confirmedFilter: 'BULLISH',
      confirmedMarketClass: 'crypto'
    });
    assert.equal(bullishCrypto.length, 2);
    assert.deepEqual(bullishCrypto.map(r => r.symbol).sort(), ['BTC', 'ETH']);
  });

  it('filters correctly across bearish direction combined with market class', () => {
    // Bearish Stocks only
    const bearishStocks = filterConfirmedFlips(mockConfirmedFlips, {
      confirmedFilter: 'BEARISH',
      confirmedMarketClass: 'stocks'
    });
    assert.equal(bearishStocks.length, 1);
    assert.equal(bearishStocks[0].symbol, 'TSLA');

    // Bearish Crypto only
    const bearishCrypto = filterConfirmedFlips(mockConfirmedFlips, {
      confirmedFilter: 'BEARISH',
      confirmedMarketClass: 'crypto'
    });
    assert.equal(bearishCrypto.length, 1);
    assert.equal(bearishCrypto[0].symbol, 'SOL');
  });

  it('combines direction ("BULLISH"), timeframe ("1w"), and market class ("stocks") simultaneously', () => {
    const results = filterConfirmedFlips(mockConfirmedFlips, {
      confirmedFilter: 'BULLISH',
      confirmedTimeframe: '1w',
      confirmedMarketClass: 'stocks'
    });

    // AAPL is Bullish 1w Stock; NVDA is Bullish 1d Stock; ETH is Bullish 1w Crypto
    assert.equal(results.length, 1);
    assert.equal(results[0].symbol, 'AAPL');
    assert.equal(results[0].timeframe, '1w');
    assert.equal(results[0].marketClass, 'stocks');
    assert.equal(results[0].direction, 'BULLISH');
  });

  it('combines market class filtering with text search', () => {
    // Search "ET" on Crypto -> ETH
    const ethSearch = filterConfirmedFlips(mockConfirmedFlips, {
      confirmedMarketClass: 'crypto',
      confirmedSearch: 'ET'
    });
    assert.equal(ethSearch.length, 1);
    assert.equal(ethSearch[0].symbol, 'ETH');

    // Search "NVDA" on Stocks -> NVDA
    const nvdaSearch = filterConfirmedFlips(mockConfirmedFlips, {
      confirmedMarketClass: 'stocks',
      confirmedSearch: 'NVDA'
    });
    assert.equal(nvdaSearch.length, 1);
    assert.equal(nvdaSearch[0].symbol, 'NVDA');

    // Search "NVDA" on Crypto -> 0 results
    const nvdaCryptoSearch = filterConfirmedFlips(mockConfirmedFlips, {
      confirmedMarketClass: 'crypto',
      confirmedSearch: 'NVDA'
    });
    assert.equal(nvdaCryptoSearch.length, 0);
  });

  it('deduplicates multiple timeframe flips per asset while preserving the latest flip', () => {
    const flipsWithDuplicates: FlipCandidateDashboardItem[] = [
      ...mockConfirmedFlips,
      {
        id: 'crypto:BTC:4h',
        symbol: 'BTC',
        name: 'Bitcoin',
        marketClass: 'crypto',
        timeframe: '4h',
        direction: 'BULLISH',
        status: 'CONFIRMED',
        currentPrice: 65000,
        triggerPrice: 64000,
        distancePercent: 1.5,
        distanceAtr: 0.5,
        priorityScore: 70,
        atr: 800,
        rvol: 1.0,
        moneyLineTier: 'Tier 1',
        moneyLineScore: 80,
        weeklyTier: 'Tier 1',
        weeklyScore: 80,
        sma50: 60000,
        sma200: 55000,
        weeklyAligned: true,
        sma50Aligned: true,
        sma200Aligned: true,
        candleTimestamp: 1724500000000,
        confirmedAt: 1724500000000, // Older than 1d (1725000000000)
        scannedAt: 1724500000000
      }
    ];

    const results = filterConfirmedFlips(flipsWithDuplicates, {
      confirmedMarketClass: 'crypto'
    });

    // BTC appears only once, with the newer 1d flip
    const btcItems = results.filter(r => r.symbol === 'BTC');
    assert.equal(btcItems.length, 1);
    assert.equal(btcItems[0].timeframe, '1d');
  });

  it('handles empty inputs and unmatched filters gracefully', () => {
    assert.deepEqual(filterConfirmedFlips(undefined, { confirmedMarketClass: 'stocks' }), []);
    assert.deepEqual(filterConfirmedFlips([], { confirmedMarketClass: 'crypto' }), []);
    assert.deepEqual(filterConfirmedFlips(mockConfirmedFlips, { confirmedSearch: 'NONEXISTENT_XYZ' }), []);
  });
});
