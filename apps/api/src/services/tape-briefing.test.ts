import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTapeNarratives, buildTopScore, narrativeTickers, publicRegimeLabel } from './tape-briefing.js';

test('narratives keep name, status, summary and live 24h chips but never the internal score', () => {
  const out = buildTapeNarratives([
    { name: 'Crypto Infra', status: 'HOT', score: 100, summary: 'Verified average 24h move is 8.17% across 10 tracked assets.', assets: ['$ZRO', 'TIA', 'not a ticker!'] },
    { name: 'Memes', status: 'weird', summary: '', assets: ['PEPE'] }
  ], { ZRO: 8.5, TIA: -1.25 });
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], { name: 'Crypto Infra', status: 'HOT', summary: 'Verified average 24h move is 8.17% across 10 tracked assets.', assets: [{ symbol: 'ZRO', change24h: 8.5 }, { symbol: 'TIA', change24h: -1.25 }] });
  assert.equal(out[1].status, 'NEUTRAL');
  assert.equal(out[1].assets[0].change24h, null, 'no quote means no invented value');
  assert.ok(!JSON.stringify(out).includes('"score"'));
});

test('narrative tickers are unique and ticker-shaped', () => {
  assert.deepEqual(narrativeTickers([{ name: 'a', status: 'HOT', summary: '', assets: ['$ZRO', 'zro', 'TIA', 'Some Name'] }]), ['ZRO', 'TIA']);
});

test('top score takes the first five measured assets and exposes no score fields', () => {
  const asset = (symbol: string, fees: number) => ({
    id: symbol.toLowerCase(), symbol, name: symbol + ' name', marketCap: 1e8, priceChange24h: 1, priceChange7d: -2, score: 100,
    criteria: { growth: { status: 'pass' }, networkEffect: { status: 'watch' }, sustainableRevenue: { status: 'pass' }, holderValue: { status: 'nonsense' } },
    metrics: { fees30d: fees, revenue30d: fees / 2, holdersRevenue30d: fees / 4 }
  });
  const out = buildTopScore([asset('AAA', 0), asset('BBB', 10), asset('CCC', 20), asset('DDD', 30), asset('EEE', 40), asset('FFF', 50), asset('GGG', 60)]);
  assert.deepEqual(out.map(e => e.symbol), ['BBB', 'CCC', 'DDD', 'EEE', 'FFF']);
  assert.deepEqual(out[0].criteria, { growth: 'pass', networkEffect: 'watch', sustainableRevenue: 'pass', holderValue: 'unknown' });
  assert.equal(out[0].marketCap, 1e8);
  assert.ok(!JSON.stringify(out).includes('score'));
});

test('regime label passes plain words and drops numbers', () => {
  assert.equal(publicRegimeLabel('Bullish Trend'), 'Bullish Trend');
  assert.equal(publicRegimeLabel('Score 72'), null);
  assert.equal(publicRegimeLabel(''), null);
});

test('stock top picks follow the app filter and drop score and verdict', async () => {
  const { buildStockTop } = await import('./tape-briefing.js');
  const s = (symbol: string, score: number, classification = 'partial') => ({
    symbol, name: symbol + ' Inc', sector: 'Tech', marketCap: 2e12, price: 100, score, classification, aiVerdict: 'Top AI Pick',
    criteria: { profitability: { status: 'pass' }, valuation: { status: 'fail' } },
    metrics: { netMargin: 30, roe: 40, revenueGrowthYoY: 12, fcfMargin: 25, forwardPE: 28 }
  });
  const out = buildStockTop([s('AAA', 50), s('BBB', 85), s('CCC', 60, 'top-pick'), s('DDD', 90)] as any);
  assert.deepEqual(out.map(e => e.symbol), ['BBB', 'CCC', 'DDD']);
  assert.equal(out[0].pe, 28);
  assert.equal(out[0].criteria.profitability, 'pass');
  assert.equal(out[0].criteria.growth, 'unknown');
  const json = JSON.stringify(out);
  assert.ok(!json.includes('score') && !json.includes('Verdict') && !json.includes('Top AI Pick'));
});
