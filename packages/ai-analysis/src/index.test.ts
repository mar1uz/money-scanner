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
});
