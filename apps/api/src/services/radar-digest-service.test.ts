import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fetchRadarDigestText, RADAR_DIGEST_PORT } from './radar-digest-service.js';

const row = (o: object) => ({
  id: 'x', chain: 'base', address: '0xabc', symbol: 'T', name: 'T',
  price: 1, marketCap: 1000, marketCapSource: 'dex', liquidity: null,
  volume24h: null, volume1h: null, buys24h: null, sells24h: null, buyers24h: null,
  priceChange24h: null, pool: '', url: '', observedAt: 1, coinGeckoId: null, telegram: null,
  rank: 1, rankChange: null, score: 50, marketScore: 50,
  firstReportedAt: null, firstPrice: null, changeFirst: 0,
  previousPrice: null, changePrevious: null,
  social: { mentions: 0, authors: 0, channels: 0, platforms: 0, editorialMentions: 0, weakMentions: 0, score: null, changeMentions: null, searchTrending: false, examples: [] },
  reasons: [], ...o,
}) as any;

const snapshot: any = {
  id: '1', generatedAt: new Date('2026-09-06T19:00:00Z').getTime(),
  methodology: 'radar-v1', minMarketCap: 0, kind: 'report',
  rows: [
    row({ chain: 'solana', address: 'MintRug1', symbol: 'RUG', changeFirst: 40, price: 0.01, marketCap: 500000 }),
    row({ chain: 'base', address: '0xBase1', symbol: 'OKB', changeFirst: 15, price: 0.5, marketCap: 2000000 }),
  ],
  microcaps: [],
};

const stubFetch = async (url: string) => {
  if (url.includes('/tokens/' + RADAR_DIGEST_PORT)) {
    return { pairs: [{ quoteToken: { symbol: 'ETH' }, priceUsd: '0.0003', priceChange: { h24: 100 }, volume: { h24: 1000 }, marketCap: 300000, liquidity: { usd: 50000 } }] };
  }
  if (url.includes('rugcheck')) return { risks: [{ name: 'Creator history of rugged tokens' }] };
  if (url.includes('gopluslabs')) return { result: { '0xbase1': { is_honeypot: '0', is_mintable: '0', buy_tax: '0', sell_tax: '0' } } };
  if (url.includes('token-boosts')) return [{ tokenAddress: 'MintB1', chainId: 'solana' }];
  if (url.includes('/tokens/MintB1')) {
    return { pairs: [{ chainId: 'solana', baseToken: { address: 'MintB1', symbol: 'BST' } }] };
  }
  throw new Error('unexpected ' + url);
};

const stripUrls = (t: string) => t.replace(/https?:\/\/\S+/g, '');

describe('fetchRadarDigestText', () => {
  it('digest determinist cu semafoare si fara adrese vizibile', async () => {
    const out = await fetchRadarDigestText({
      loadSnapshot: async () => snapshot,
      fetchJson: stubFetch,
      now: new Date('2026-09-06T19:20:00Z'),
    });
    assert.ok(out.startsWith('# RADAR-SCAN '));
    assert.ok(out.includes('(script, fara AI)'));
    assert.ok(out.includes('[PORT]') && out.includes('$0.0003'));
    assert.ok(out.includes('🔴 rug'), 'RugCheck rugged -> rosu');
    assert.ok(out.includes('🟢 curat'), 'GoPlus curat -> verde');
    assert.ok(out.includes('[BST]'), 'boost prezent');
    assert.ok(out.includes('indisponibil in modul script'));
    assert.ok(!stripUrls(out).includes('0x'), 'nicio adresa vizibila');
    assert.ok(!stripUrls(out).includes('Mint'), 'nici mint vizibil');
  });

  it('snapshot lipsa -> o singura linie', async () => {
    const out = await fetchRadarDigestText({ loadSnapshot: async () => null });
    assert.equal(out, 'RADAR-SCAN: snapshot indisponibil (eroare citire Firestore) — fara date inventate.');
  });
});
