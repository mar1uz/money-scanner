import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { RadarSnapshot } from '@money-scanner/shared';
import {
  buildRadarDigest, summarizeRugCheck, summarizeGoPlus, fmtMoney, fmtPrice,
} from './radar-digest.js';

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
});

const snap = (rows: object[], micro: object[] = []) => ({
  id: '1', generatedAt: 1, methodology: 'radar-v1', minMarketCap: 0,
  rows, microcaps: micro, exits: [], sources: [], discovered: 0,
  excluded: { belowCap: 0, unknownCap: 0 }, previousReportAt: null, coverage: '', kind: 'report',
}) as unknown as RadarSnapshot;

const stripUrls = (t: string) => t.replace(/https?:\/\/\S+/g, '');

describe('buildRadarDigest', () => {
  it('movers only |chg|>10, max 6, desc; microcaps max 5; no visible address', () => {
    const rows = [
      row({ chain: 'base', address: '0xBIG1', symbol: 'UP', changeFirst: 72.4, price: 0.0192, marketCap: 18947981 }),
      row({ chain: 'solana', address: 'Mint111', symbol: 'DN', changeFirst: -22.9, price: 0.03, marketCap: 100 }),
      row({ chain: 'robinhood', address: '0xSMALL', symbol: 'FLAT', changeFirst: 3.1, price: 1, marketCap: 5 }),
    ];
    const micro = Array.from({ length: 7 }, (_, i) =>
      row({ chain: 'base', address: `0xM${i}`, symbol: `M${i}`, price: 0.001, marketCap: 200000 }));
    const out = buildRadarDigest({
      snapshot: snap(rows, micro), nowLabel: '2026-09-06 22:20', snapshotLabel: '14:00',
      portAddress: '0xafa57c4c5a72d36530c8e816ad6e9a5947941536',
    });
    assert.ok(out.includes('# RADAR-SCAN 2026-09-06 22:20 (script, fara AI)'));
    assert.ok(out.includes('UP') && out.includes('DN') && !out.includes('FLAT'));
    assert.ok(out.indexOf('UP') < out.indexOf('DN'), 'desc');
    assert.equal((out.match(/\[M\d\]/g) || []).length, 5, 'micro cap la 5');
    assert.ok(!stripUrls(out).includes('0x'), 'nicio adresa vizibila');
    assert.ok(!stripUrls(out).includes('Mint111'), 'nici mint vizibil');
    assert.ok(out.includes('indisponibil in modul script'));
    assert.ok(out.includes('[cumpara in FOMO](https://fomo.family/tokens/robinhood/0xafa5'));
  });

  it('security default yellow; summarize helpers', () => {
    const out = buildRadarDigest({
      snapshot: snap([row({ address: '0xSEC', symbol: 'S', changeFirst: 50 })]),
      nowLabel: 't', snapshotLabel: 's', portAddress: '0xP',
      security: { '0xsec': { level: 'red', reason: 'mint+freeze' } },
    });
    assert.ok(out.includes('🔴 mint+freeze'));
    assert.ok(out.includes('🟡 neverificat'), 'PORT fara security');
    assert.deepEqual(summarizeRugCheck([]), { level: 'green', reason: 'curat' });
    assert.equal(summarizeRugCheck(['Mint Authority still enabled', 'Freeze Authority still enabled']).level, 'red');
    assert.deepEqual(summarizeRugCheck(['Creator history of rugged tokens']), { level: 'red', reason: 'rug' });
    assert.equal(summarizeGoPlus({ is_honeypot: '0', is_mintable: '0', buy_tax: '0', sell_tax: '0' }).level, 'green');
    assert.equal(summarizeGoPlus({ is_honeypot: '1' }).level, 'red');
  });

  it('formatare preturi si bani', () => {
    assert.equal(fmtPrice(0.000159), '$0.000159');
    assert.equal(fmtPrice(0.0192), '$0.0192');
    assert.equal(fmtMoney(18947981), '$18.9M');
    assert.equal(fmtMoney(636000), '$636k');
  });
});
