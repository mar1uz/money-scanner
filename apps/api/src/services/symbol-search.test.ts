import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SymbolSearchCandidate,
  TRADING_360_ASSETS,
  catalogToSearchCandidates,
  rankSymbolSearchCandidates
} from '@money-scanner/shared';

const catalog = catalogToSearchCandidates(TRADING_360_ASSETS);

describe('TradingView-style symbol search ranking', () => {
  it('ranks an exact ticker ahead of fuzzy name and alias matches', () => {
    const results = rankSymbolSearchCandidates('NVDA', catalog);
    assert.equal(results[0]?.symbol, 'NVDA');
    assert.equal(results[0]?.matchReason, 'symbol-exact');
    assert.equal(results[0]?.isExact, true);
  });

  it('resolves an exchange-qualified perpetual without confusing it with an ETF', () => {
    const results = rankSymbolSearchCandidates('BINANCE:LITUSDT.P', catalog);
    assert.equal(results[0]?.symbol, 'LITUSDT.P');
    assert.equal(results[0]?.marketClass, 'crypto');
    assert.equal(results[0]?.instrumentType, 'perpetual');
    assert.notEqual(results[0]?.symbol, 'LIT');
  });

  it('keeps identical tickers from different asset classes as distinct instruments', () => {
    const ambiguous: SymbolSearchCandidate[] = [
      {
        symbol: 'CAKE', name: 'PancakeSwap', category: 'DeFi', marketClass: 'crypto',
        exchange: 'COINGECKO', instrumentType: 'spot', coinGeckoId: 'pancakeswap-token',
        verified: true, matchType: 'coingecko'
      },
      {
        symbol: 'CAKE', name: 'The Cheesecake Factory', category: 'Consumer', marketClass: 'stocks',
        exchange: 'NASDAQ', instrumentType: 'equity', verified: true, matchType: 'yahoo'
      }
    ];
    const results = rankSymbolSearchCandidates('CAKE', ambiguous);
    assert.equal(results.length, 2);
    assert.deepEqual(new Set(results.map(result => result.marketClass)), new Set(['crypto', 'stocks']));
    assert.notEqual(results[0].resultId, results[1].resultId);
  });

  it('prefers the requested crypto quote pair', () => {
    const pairs: SymbolSearchCandidate[] = ['USDT', 'USDC'].map(quote => ({
      symbol: 'BTC', displaySymbol: `BTC${quote}`, providerSymbol: `BTC${quote}`,
      name: `BTC / ${quote}`, category: 'Crypto Spot', marketClass: 'crypto',
      exchange: 'BINANCE', instrumentType: 'spot', quoteCurrency: quote,
      verified: true, matchType: 'binance'
    }));
    const results = rankSymbolSearchCandidates('BTC/USDT', pairs);
    assert.equal(results[0]?.quoteCurrency, 'USDT');
    assert.equal(results[0]?.matchReason, 'symbol-exact');
  });

  it('prefers an exchange-qualified spot pair over its generic and perpetual variants', () => {
    const candidates: SymbolSearchCandidate[] = [
      {
        symbol: 'BTC', displaySymbol: 'BTC', name: 'Bitcoin', category: 'Layer 1',
        marketClass: 'crypto', exchange: 'BINANCE', quoteCurrency: 'USDT',
        verified: true, matchType: 'catalog'
      },
      {
        symbol: 'BTC', displaySymbol: 'BTCUSDT', providerSymbol: 'BTCUSDT', name: 'BTC / USDT',
        category: 'Crypto Spot', marketClass: 'crypto', exchange: 'BINANCE', instrumentType: 'spot',
        quoteCurrency: 'USDT', verified: true, matchType: 'binance'
      },
      {
        symbol: 'BTCUSDT.P', displaySymbol: 'BTCUSDT.P', providerSymbol: 'BTCUSDT', name: 'BTC / USDT Perpetual',
        category: 'Crypto Perpetual', marketClass: 'crypto', exchange: 'BINANCE Futures', instrumentType: 'perpetual',
        quoteCurrency: 'USDT', verified: true, matchType: 'binance'
      }
    ];
    const results = rankSymbolSearchCandidates('BINANCE:BTCUSDT', candidates);
    assert.equal(results[0]?.instrumentType, 'spot');
    assert.equal(results[0]?.displaySymbol, 'BTCUSDT');
  });

  it('allows one-character ticker typos only for sufficiently specific queries', () => {
    const results = rankSymbolSearchCandidates('NVDQ', catalog);
    assert.equal(results[0]?.symbol, 'NVDA');
    assert.equal(results[0]?.matchReason, 'typo');
    assert.equal(rankSymbolSearchCandidates('NV', catalog).some(result => result.matchReason === 'typo'), false);
  });
});
