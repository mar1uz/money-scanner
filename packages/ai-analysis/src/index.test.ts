import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AIMarketAnalystService } from './ai-analyst.js';
import { MarketOverviewSummary, MoneyLineSignal } from '@money-scanner/shared';

describe('AI Market Analyst Engine', () => {
  it('generates structured market briefing with all required fields', async () => {
    const analyst = new AIMarketAnalystService();
    const overview: MarketOverviewSummary = {
      regime: 'Bullish Trend',
      regimeScore: 55,
      btcDominance: 56.5,
      totalMarketCap: 2.4e12,
      total24hVolume: 85e9,
      marketBreadth: {
        advancingCount: 35,
        decliningCount: 10,
        neutralCount: 5,
        bullishPercent: 70
      },
      volatilityIndex: 38.0,
      lastUpdated: Date.now(),
      providerStatus: {
        primary: 'operational',
        latencyMs: 25,
        staleAssetsCount: 0
      }
    };

    const dummySignal: MoneyLineSignal = {
      symbol: 'BTC',
      timeframe: '1h',
      score: 75,
      tier: 'Strong Bullish',
      isTransition: false,
      rawIndicators: {
        ema20: 64000,
        ema50: 63000,
        ema200: 60000,
        ema20Slope: 1.2,
        roc9: 2.5,
        roc21: 4.1,
        macd: { line: 120, signal: 90, histogram: 30, histogramSlope: 5 },
        rsi14: 65,
        rsiRegime: 'Bullish',
        rvol: 1.8,
        volumeMA20: 5000,
        atr14: 800,
        atrPercent: 1.25
      },
      contributions: {
        emaAlignmentScore: 100,
        emaSlopeScore: 80,
        rocScore: 70,
        macdScore: 85,
        rsiScore: 60,
        rvolScore: 75,
        volatilityRegimeScore: 40,
        mtfConfirmationScore: 0
      },
      candleTimestamp: Date.now() - 3600 * 1000,
      calculationTimestamp: Date.now(),
      version: 'v1.0.0'
    };

    const briefing = await analyst.generateMarketBriefing(overview, { BTC: dummySignal }, [], []);

    assert.ok(briefing.marketRegime === 'Bullish Trend');
    assert.ok(briefing.executiveSummary.length > 50);
    assert.ok(briefing.keyDrivers.length >= 3);
    assert.ok(briefing.bullishFactors.length >= 2);
    assert.ok(briefing.confidenceScore > 0.5);
    assert.ok(briefing.assetsToWatch.length > 0);
  });

  it('generates asset explanation with support/resistance and evidence links', async () => {
    const analyst = new AIMarketAnalystService();
    const dummySignal: MoneyLineSignal = {
      symbol: 'SOL',
      timeframe: '4h',
      score: 65,
      tier: 'Strong Bullish',
      isTransition: false,
      rawIndicators: {
        ema20: 150,
        ema50: 145,
        ema200: 135,
        ema20Slope: 0.8,
        roc9: 3.2,
        roc21: 5.5,
        macd: { line: 2.1, signal: 1.5, histogram: 0.6, histogramSlope: 0.2 },
        rsi14: 62,
        rsiRegime: 'Bullish',
        rvol: 1.6,
        volumeMA20: 20000,
        atr14: 4.5,
        atrPercent: 3.0
      },
      contributions: {
        emaAlignmentScore: 100,
        emaSlopeScore: 60,
        rocScore: 65,
        macdScore: 70,
        rsiScore: 55,
        rvolScore: 60,
        volatilityRegimeScore: 30,
        mtfConfirmationScore: 0
      },
      candleTimestamp: Date.now() - 4 * 3600 * 1000,
      calculationTimestamp: Date.now(),
      version: 'v1.0.0'
    };

    const explanation = await analyst.generateAssetExplanation('SOL', 152.5, dummySignal, [], []);

    assert.equal(explanation.symbol, 'SOL');
    assert.equal(explanation.overallBias, 'Strong Bullish');
    assert.ok(explanation.keySupportResistance.supportLevels[0] < 152.5);
    assert.ok(explanation.keySupportResistance.resistanceLevels[0] > 152.5);
    assert.ok(explanation.evidence.length > 0);
  });

  it('builds a deterministic cited news synthesis when no AI key is configured', async () => {
    const previousKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      const analyst = new AIMarketAnalystService();
      const synthesis = await analyst.generateNewsSynthesis([
        {
          id: 'real_story',
          title: 'Bitcoin market liquidity improves',
          summary: 'Verified market report.',
          source: 'Example News',
          url: 'https://example.com/bitcoin-liquidity',
          publishedAt: Date.now(),
          category: 'General',
          mentionedSymbols: ['BTC']
        }
      ], [], 'ro');

      assert.equal(synthesis.mode, 'deterministic');
      assert.equal(synthesis.segments.length, 1);
      assert.deepEqual(synthesis.segments[0].sourceIds, ['news:real_story']);
      assert.equal(synthesis.sources[0].url, 'https://example.com/bitcoin-liquidity');
    } finally {
      if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = previousKey;
    }
  });

  it('builds a scoped deterministic intelligence report when Gemini is unavailable', async () => {
    const previousKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      const analyst = new AIMarketAnalystService();
      const report = await analyst.generateMarketIntelligence(
        'metals',
        'ro',
        [
          { symbol: 'XAU', name: 'Gold', change24h: 1.4, narrative: 'Metale Prețioase' },
          { symbol: 'XAG', name: 'Silver', change24h: -0.2, narrative: 'Metale Prețioase' }
        ],
        [{ name: 'Metale Prețioase', averageChange24h: 0.6, assetCount: 2, leaders: ['XAU', 'XAG'] }],
        [],
        []
      );

      assert.equal(report.scope, 'metals');
      assert.equal(report.mode, 'deterministic');
      assert.equal(report.narratives[0].name, 'Metale Prețioase');
      assert.equal(report.discoveries.length, 0);
      const answer = await analyst.askMarketIntelligenceQuestion('Ce influențează aurul?', report, 'ro');
      assert.match(answer.answer, /raportul metals/i);
    } finally {
      if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = previousKey;
    }
  });

  it('uses Gemini with verified feeds when Google Search quota is unavailable', async () => {
    const originalFetch = globalThis.fetch;
    let requestCount = 0;
    globalThis.fetch = (async () => {
      requestCount += 1;
      if (requestCount === 1) {
        return new Response(JSON.stringify({ error: { message: 'quota exhausted' } }), { status: 429 });
      }
      return new Response(JSON.stringify({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                headline: 'Crypto narrative briefing',
                macroRegime: 'Selective risk-on',
                executiveSummary: 'Verified feeds show selective momentum while macro risks remain mixed.',
                macroDrivers: [
                  { title: 'Liquidity', impact: 'Bullish', analysis: 'Liquidity conditions improved.', horizon: '1-4 weeks' },
                  { title: 'Regulation', impact: 'Mixed', analysis: 'Policy remains uncertain.', horizon: '1-3 months' },
                  { title: 'Risk appetite', impact: 'Mixed', analysis: 'Breadth remains selective.', horizon: 'Days' }
                ],
                narratives: [
                  { name: 'Layer 1', status: 'HOT', score: 78, summary: 'Layer 1 assets lead.', whyNow: 'Momentum improved.', assets: ['BTC', 'SOL'], catalysts: ['Liquidity'], risks: ['Reversal'] },
                  { name: 'AI', status: 'EMERGING', score: 61, summary: 'AI protocols are active.', whyNow: 'New launches.', assets: ['TAO'], catalysts: ['Adoption'], risks: ['Valuation'] },
                  { name: 'DeFi', status: 'NEUTRAL', score: 50, summary: 'DeFi is mixed.', whyNow: 'Flows are balanced.', assets: ['AAVE'], catalysts: [], risks: ['Smart contracts'] }
                ],
                discoveries: [{ name: 'Pons', symbol: 'PONS', category: 'Launchpad', status: 'Verified', whyItMatters: 'A new launchpad claim.', notableConnection: 'Robinhood claim', catalyst: 'Launch', risks: ['Early project'] }],
                riskRadar: ['Liquidity reversal', 'Regulatory shock', 'Smart-contract risk'],
                confidenceScore: 70
              })
            }]
          }
        }]
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;

    try {
      const analyst = new AIMarketAnalystService('fake-key');
      const now = Date.now();
      const report = await analyst.generateMarketIntelligence(
        'crypto',
        'en',
        [{ symbol: 'BTC', name: 'Bitcoin', change24h: 1.2, narrative: 'Layer 1' }],
        [{ name: 'Layer 1', averageChange24h: 1.2, assetCount: 1, leaders: ['BTC'] }],
        [
          { id: 'n1', title: 'PONS launchpad claim', summary: 'Claim details.', source: 'Publisher One', url: 'https://example.com/pons', publishedAt: now, category: 'Protocol', mentionedSymbols: ['PONS'] },
          { id: 'n2', title: 'Bitcoin liquidity improves', summary: 'Liquidity details.', source: 'Publisher Two', url: 'https://example.org/btc', publishedAt: now, category: 'Institutional', mentionedSymbols: ['BTC'] },
          { id: 'n3', title: 'Policy risk persists', summary: 'Policy details.', source: 'Publisher Three', url: 'https://example.net/policy', publishedAt: now, category: 'Regulation', mentionedSymbols: [] }
        ],
        []
      );

      assert.equal(requestCount, 2);
      assert.equal(report.mode, 'ai-sources');
      assert.equal(report.sources.length, 3);
      assert.equal(report.discoveries[0].status, 'Unverified');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
