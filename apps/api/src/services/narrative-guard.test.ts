import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AIContentTake, MarketIntelligenceReport } from '@money-scanner/shared';
import { answerIssues, buildInstinctReport, findNarrativeIssues, isServableTake } from './narrative-guard.js';

const take = (over: Partial<AIContentTake> = {}): AIContentTake => ({
  headline: 'Crypto majors hold above weekly triggers',
  paragraphs: ['Total crypto market cap is $2.96T, up 1.2% in 24h.'],
  bullets: ['BTC $87,120, +1.4% 24h'],
  model: 'Instinct',
  generatedAt: Date.now(),
  source: 'instinct-agent',
  ...over
});

describe('narrative guard - units', () => {
  it('rejects total market cap written in billions (the 2026-09-23 bug)', () => {
    assert.equal(findNarrativeIssues(['Total market cap is $2.96 billion today.']).length, 1);
    assert.equal(findNarrativeIssues(['The global crypto market cap sits at 2.96B.']).length, 1);
    assert.equal(findNarrativeIssues(['Capitalizarea totală a pieței este de 2,96 miliarde $.']).length, 1);
  });
  it('accepts trillions and ignores single-asset caps', () => {
    assert.deepEqual(findNarrativeIssues(['Total crypto market cap: $2.96T (+1.2% 24h).']), []);
    assert.deepEqual(findNarrativeIssues(['Capitalizarea totală: 2,96 trilioane $.']), []);
    assert.deepEqual(findNarrativeIssues(['JUP market cap is $1.4B with $19.23M fees in 30d.']), []);
  });
  it('rejects absurd trillions', () => {
    assert.equal(findNarrativeIssues(['Total market cap reached $2,960 trillion.']).length, 1);
  });
});

describe('narrative guard - stale central-bank news', () => {
  it('rejects an undated Fed decision (stale news presented as new)', () => {
    assert.equal(findNarrativeIssues(['The Fed raised rates for the first time since 2023.']).length, 1);
    assert.equal(findNarrativeIssues(['Fed a majorat dobânzile pentru prima dată din 2023.']).length, 1);
  });
  it('accepts a dated decision', () => {
    assert.deepEqual(findNarrativeIssues(['The Fed hike on Sep 16 still weighs on gold.']), []);
    assert.deepEqual(findNarrativeIssues(['Majorarea Fed din 16 sept. încă apasă pe aur.']), []);
  });
  it('ignores unrelated mentions', () => {
    assert.deepEqual(findNarrativeIssues(['AI chips lead a record Nasdaq; metals split.']), []);
  });
});

describe('servable takes', () => {
  it('serves only clean Instinct takes', () => {
    assert.equal(isServableTake(take()), true);
    assert.equal(isServableTake(take({ source: 'ai-gateway' })), false);
    assert.equal(isServableTake(take({ paragraphs: ['Total market cap is $2.96 billion.'] })), false);
  });
});

describe('buildInstinctReport', () => {
  const geminiReport = {
    scope: 'crypto', headline: 'Bitcoin Breaks Above $87,000 Amid Hawkish Fed Rate Hike', macroRegime: 'Bearish',
    executiveSummary: 'The Fed enacted its first rate hike since 2023.', macroDrivers: [{ title: 'Fed', impact: 'Bearish', analysis: 'x', horizon: 'y' }],
    narratives: [{ name: 'L1', status: 'HOT', score: 85, summary: 'model', whyNow: 'model', assets: ['BTC'], catalysts: ['a'], risks: ['b'] }],
    discoveries: [{}], riskRadar: ['Hawkish Fed'], sources: [{ id: 'v1', title: 't', url: 'https://example.com/a', domain: 'example.com' }],
    confidenceScore: 82, generatedAt: 1, dataFreshness: 'x', mode: 'ai-sources', model: 'gemini', searchQueries: ['q'], disclaimer: 'd'
  } as unknown as MarketIntelligenceReport;

  it('replaces model prose with the Instinct briefing', () => {
    const out = buildInstinctReport(geminiReport, { briefing: take(), marketIntelligence: take({ headline: 'Trigger map' }) }, 'en');
    assert.equal(out.mode, 'instinct');
    assert.equal(out.headline, 'Crypto majors hold above weekly triggers');
    assert.deepEqual(out.macroDrivers, []);
    assert.deepEqual(out.riskRadar, []);
    assert.deepEqual(out.discoveries, []);
    assert.deepEqual(out.narratives, []);
    assert.equal(out.aiTake?.headline, 'Trigger map');
    assert.equal(out.sources.length, 1);
    assert.ok(!JSON.stringify(out).includes('Hawkish'));
  });
  it('never falls back to model prose when no Instinct briefing exists', () => {
    const out = buildInstinctReport(geminiReport, {}, 'en');
    assert.equal(out.mode, 'deterministic');
    assert.ok(!JSON.stringify(out).includes('rate hike'));
  });
  it('keeps deterministic price-computed narrative cards', () => {
    const out = buildInstinctReport({ ...geminiReport, mode: 'deterministic' } as MarketIntelligenceReport, { briefing: take() }, 'en');
    assert.equal(out.narratives.length, 1);
    assert.deepEqual(out.narratives[0].risks, []);
  });
});

describe('narrative guard - single asset caps stay allowed', () => {
  it('does not flag a single-asset cap in a crypto sentence', () => {
    assert.deepEqual(findNarrativeIssues(['Crypto: SOL market cap is $90B after a 3% day.']), []);
  });
});

describe('ask box answer guard', () => {
  const briefing = 'Crypto majors hold above weekly triggers\nBTC $87,120, +1.4% 24h. Total crypto market cap is $2.96T.\nNVDA leads AI chips, +3.2% on the week.';
  it('passes an answer that only uses briefing numbers', () => {
    assert.deepEqual(answerIssues('BTC is at $87,120 (+1.4% in 24h) and NVDA is up 3.2% on the week.', briefing), []);
  });
  it('rejects numbers that are not in the briefing', () => {
    assert.ok(answerIssues('BTC could reach $95,000 soon.', briefing).some(i => i.startsWith('ungrounded-number')));
  });
  it('rejects unit errors and undated Fed news', () => {
    assert.ok(answerIssues('Total market cap is $2.96 billion.', briefing).some(i => i.startsWith('unit')));
    assert.ok(answerIssues('The Fed raised rates for the first time since 2023.', briefing).length > 0);
  });
});
