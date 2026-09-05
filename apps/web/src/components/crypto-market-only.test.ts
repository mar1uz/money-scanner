import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CryptoMarketOnlyView } from './CryptoMarketOnlyView.js';
import type { AssetDetailResponse } from '../types.js';

const data: AssetDetailResponse = {
  info: { name: 'Pons', symbol: 'PONS', coinGeckoId: 'pons', marketCap: 500, rank: 105 },
  quote: { price: 0.7, change24h: 20, source: 'CoinGecko', timestamp: 1_700_000_000_000, isStale: false },
  activeTimeframe: '1w', activeSignal: null, multiTimeframe: null, candles: [], news: [], xTrends: [],
  aiExplanation: null, lastUpdated: 1_700_000_000_000, dataAvailability: 'aggregated-price-only',
  priceHistory: [[1_700_000_000_000, 0.7], [1_700_003_600_000, 0.8]]
};
const render = (value = data) => renderToStaticMarkup(React.createElement(CryptoMarketOnlyView, { data: value, timeframe: '1w', onBack() {}, onRefresh() {} }));

test('PONS renders real quote and price chart instead of generic error or invented Money Line', () => {
  const html = render();
  assert.match(html, /Pons/);
  assert.match(html, /\+20.00%/);
  assert.match(html, /polyline/);
  assert.match(html, /Money Line indisponibil/);
  assert.match(html, /https:\/\/www.coingecko.com\/en\/coins\/pons/);
  assert.doesNotMatch(html, /Neutral|Confirmat recent|NaN|undefined/);
});

test('missing history and missing metrics keep the quote visible with explicit limitations', () => {
  const html = render({ ...data, priceHistory: [], quote: { ...data.quote, isStale: true, change24h: null } });
  assert.match(html, /Istoricul de preț nu este disponibil/);
  assert.match(html, /Date întârziate/);
  assert.doesNotMatch(html, /polyline|\+0.00%|NaN/);
});

test('CoinPaprika profiles link to CoinPaprika, never to a CoinGecko lookalike ID', () => {
  const html = render({ ...data, info: { ...data.info, coinGeckoId: undefined, coinPaprikaId: 'pons-pons' }, quote: { ...data.quote, source: 'CoinPaprika' } });
  assert.match(html, /https:\/\/coinpaprika.com\/coin\/pons-pons\//);
  assert.doesNotMatch(html, /coingecko.com/);
});

test('DEX fallback renders exact pool metrics, OHLCV candles and honest Money Line threshold', () => {
  const candle = { timestamp: 1_700_000_000_000, open: 0.7, high: 0.8, low: 0.6, close: 0.75, volume: 100, isClosed: true };
  const html = render({ ...data, dataAvailability: 'dex-fallback', candles: [candle], priceHistory: [], dexMarket: {
    chainId: 'robinhood', dexId: 'uniswap', dexUrl: 'https://dexscreener.com/robinhood/pool', pairAddress: 'pool',
    contractAddress: '0xtoken', quoteSymbol: 'WETH', priceUsd: 0.75, priceChange: { m5: 1, h1: 2, h6: 3, h24: 4 },
    volume: { m5: 5, h1: 6, h6: 7, h24: 8 }, liquidityUsd: 500, fdvUsd: 600, marketCapUsd: 550,
    transactions24h: { buys: 10, sells: 11 }, pairCreatedAt: 1_699_000_000_000, candleSource: 'GeckoTerminal', candles: [candle]
  } });
  assert.match(html, /Piața DEX principală/);
  assert.match(html, /DEX Screener/);
  assert.match(html, /Grafic OHLCV DEX · 1W/);
  assert.match(html, /Grafic OHLCV DEX PONS/);
  assert.match(html, /10 buy \/ 11 sell/);
  assert.match(html, /minimum 15 lumânări închise/);
  assert.doesNotMatch(html, /Money Line 1W calculat/);
});

test('DEX fallback displays active Money Line signal badge and calculation summary', () => {
  const candle = { timestamp: 1_700_000_000_000, open: 0.7, high: 0.8, low: 0.6, close: 0.75, volume: 100, isClosed: true };
  const html = render({
    ...data,
    dataAvailability: 'dex-fallback',
    candles: Array(26).fill(candle),
    priceHistory: [],
    activeSignal: {
      symbol: 'AKE',
      timeframe: '1w',
      tier: 'Bullish',
      previousTier: 'Bullish',
      score: 25.6,
      isTransition: false,
      transitionTime: 1783900800000,
      transitionPrice: 0.002,
      roiPercent: 300,
      rawIndicators: { ema20: 0.003, ema50: 0.008, ema200: 0.008, ema20Slope: 140, roc9: 2000, roc21: 3000, macd: { line: 0.003, signal: 0, histogram: 0, histogramSlope: 0 }, rsi14: 76, rsiRegime: 'Overbought', rvol: 2.4, volumeMA20: 40000000, atr14: 0.002, atrPercent: 27 },
      contributions: { emaAlignmentScore: 0, emaSlopeScore: 100, rocScore: 100, macdScore: -50, rsiScore: 86, rvolScore: -68, volatilityRegimeScore: -60, mtfConfirmationScore: 0 },
      candleTimestamp: 1787529600000,
      calculationTimestamp: 1788625657270,
      version: 'v1.0.0'
    },
    dexMarket: {
      chainId: 'bsc', dexId: 'pancakeswap', dexUrl: 'https://dexscreener.com/bsc/pool', pairAddress: 'pool',
      contractAddress: '0xtoken', quoteSymbol: 'WBNB', priceUsd: 0.019, priceChange: { m5: 1, h1: 2, h6: 3, h24: 4 },
      volume: { m5: 5, h1: 6, h6: 7, h24: 8 }, liquidityUsd: 2_300_000, fdvUsd: 400_000_000, marketCapUsd: 400_000_000,
      transactions24h: { buys: 100, sells: 110 }, pairCreatedAt: 1_699_000_000_000, candleSource: 'GeckoTerminal', candles: Array(26).fill(candle)
    }
  });
  assert.match(html, /Money Line: Bullish \+25.6/);
  assert.match(html, /Money Line 1W calculat din 26 lumânări DEX închise: Bullish, scor 25.6/);
});
