import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateDexScreenerFourCriteria,
  lookupCryptoFourCriteria,
  looksLikeTokenAddress,
  rankDexTokens,
  resetFourCriteriaLookupCache,
  shouldLookupOnDexScreener
} from './crypto-four-criteria-lookup.js';

const pair = (overrides: Record<string, unknown> = {}) => ({
  chainId: 'solana',
  url: 'https://dexscreener.com/solana/pool1',
  pairAddress: 'pool1',
  baseToken: { address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', symbol: 'BONK', name: 'Bonk' },
  liquidity: { usd: 2_500_000 },
  volume: { h24: 400_000, h6: 80_000 },
  marketCap: 1_200_000,
  info: { imageUrl: 'https://cdn.example/bonk.png' },
  ...overrides
});

describe('DexScreener four-criteria lookup', () => {
  beforeEach(() => resetFourCriteriaLookupCache());

  it('detects EVM and Solana addresses but not tickers', () => {
    assert.equal(looksLikeTokenAddress('0x1234567890abcdef1234567890abcdef12345678'), true);
    assert.equal(looksLikeTokenAddress('DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'), true);
    assert.equal(looksLikeTokenAddress('BONK'), false);
    assert.equal(looksLikeTokenAddress('pepe'), false);
  });

  it('looks up DexScreener for addresses always, and for tickers only without local hits', () => {
    assert.equal(shouldLookupOnDexScreener('BONK', 3), false);
    assert.equal(shouldLookupOnDexScreener('BONK', 0), true);
    assert.equal(shouldLookupOnDexScreener('0x1234567890abcdef1234567890abcdef12345678', 5), true);
    assert.equal(shouldLookupOnDexScreener('x', 0), false);
  });

  it('groups DexScreener pairs by token and keeps the most liquid pool', () => {
    const ranked = rankDexTokens([
      pair({ liquidity: { usd: 100 }, volume: { h24: 10, h6: 2 }, url: 'https://dexscreener.com/solana/thin' }),
      pair({ liquidity: { usd: 9_000_000 }, volume: { h24: 800_000, h6: 150_000 }, url: 'https://dexscreener.com/solana/rich' }),
      pair({
        chainId: 'ethereum',
        url: 'https://dexscreener.com/ethereum/other',
        baseToken: { address: '0x1234567890abcdef1234567890abcdef12345678', symbol: 'PEPE', name: 'Pepe' },
        liquidity: { usd: 50_000 },
        volume: { h24: 20_000, h6: 4_000 }
      })
    ]);
    assert.equal(ranked.length, 2);
    assert.equal(ranked[0].symbol, 'BONK');
    assert.equal(ranked[0].url, 'https://dexscreener.com/solana/rich');
    assert.equal(ranked[0].liquidity, 9_000_000);
  });

  it('scores DexScreener volume/liquidity without inventing protocol revenue', () => {
    const asset = evaluateDexScreenerFourCriteria(rankDexTokens([pair()])[0]);
    assert.equal(asset.symbol, 'BONK');
    assert.equal(asset.id.startsWith('dex:solana:'), true);
    assert.equal(asset.criteria.growth.status, 'pass');
    assert.equal(asset.criteria.networkEffect.status, 'pass');
    assert.equal(asset.criteria.sustainableRevenue.status, 'fail');
    assert.equal(asset.criteria.holderValue.status, 'unknown');
    assert.equal(asset.classification, 'partial');
    assert.match(asset.criteria.growth.explanation, /DexScreener/);
  });

  it('looks up a contract on DexScreener tokens endpoint and returns scored assets', async () => {
    const address = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
    const fetcher = (async (url: string | URL | Request) => {
      const href = String(url);
      if (href.includes('api.dexscreener.com/latest/dex/tokens/')) {
        return new Response(JSON.stringify({ pairs: [pair()] }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (href.includes('api.llama.fi')) {
        return new Response(JSON.stringify(href.includes('/protocols') ? [] : { protocols: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      throw new Error(`unexpected url ${href}`);
    }) as typeof fetch;

    const assets = await lookupCryptoFourCriteria(address, fetcher);
    assert.equal(assets.length, 1);
    assert.equal(assets[0].symbol, 'BONK');
    assert.equal(assets[0].criteria.networkEffect.status, 'pass');
  });

  it('uses DexScreener search for a ticker that is not in the top 200', async () => {
    const fetcher = (async (url: string | URL | Request) => {
      const href = String(url);
      if (href.includes('api.dexscreener.com/latest/dex/search')) {
        return new Response(JSON.stringify({ pairs: [pair({ baseToken: { address: 'So11111111111111111111111111111111111111112', symbol: 'WIF', name: 'dogwifhat' } })] }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (href.includes('api.llama.fi')) {
        return new Response('rate limited', { status: 429 });
      }
      throw new Error(`unexpected url ${href}`);
    }) as typeof fetch;

    const assets = await lookupCryptoFourCriteria('WIF', fetcher);
    assert.equal(assets.length, 1);
    assert.equal(assets[0].symbol, 'WIF');
    assert.equal(assets[0].criteria.sustainableRevenue.status, 'fail');
  });
});
