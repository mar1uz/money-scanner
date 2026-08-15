import {
  Candle,
  Timeframe,
  MoneyLineSignal,
  IndicatorRawValues,
  IndicatorContributions,
  MONEY_LINE_VERSION,
  getTierFromScore
} from '@money-scanner/shared';

import { calculateEMA, computeEMAAlignment } from './indicators/ema.js';
import { calculateROC, computeROCScore } from './indicators/roc.js';
import { calculateMACD, computeMACDScore } from './indicators/macd.js';
import { calculateRSI, computeRSIScore } from './indicators/rsi.js';
import { computeRVOLScore } from './indicators/rvol.js';
import { calculateATR, computeATRScore } from './indicators/atr.js';

export interface IndicatorWeights {
  emaAlignment: number; // 0.25
  emaSlope: number;     // 0.15
  roc: number;          // 0.15
  macd: number;         // 0.15
  rsi: number;          // 0.15
  rvol: number;         // 0.10
  volatility: number;   // 0.05
}

export const DEFAULT_WEIGHTS: IndicatorWeights = {
  emaAlignment: 0.25,
  emaSlope: 0.15,
  roc: 0.15,
  macd: 0.15,
  rsi: 0.15,
  rvol: 0.10,
  volatility: 0.05
};

export class MoneyLineEngine {
  private version = MONEY_LINE_VERSION;
  private weights: IndicatorWeights;

  constructor(weights: IndicatorWeights = DEFAULT_WEIGHTS) {
    this.weights = weights;
  }

  /**
   * Calculates deterministic Money Line signals for a series of candles.
   * Strictly processes closed candles and guarantees non-repainting.
   */
  public calculateSeries(
    symbol: string,
    timeframe: Timeframe,
    candles: Candle[]
  ): MoneyLineSignal[] {
    // Only process closed candles
    const closedCandles = candles.filter(c => c.isClosed !== false);
    if (closedCandles.length === 0) {
      return [];
    }

    const opens = closedCandles.map(c => c.open);
    const highs = closedCandles.map(c => c.high);
    const lows = closedCandles.map(c => c.low);
    const closes = closedCandles.map(c => c.close);
    const volumes = closedCandles.map(c => c.volume);

    // Precalculate all indicator series
    const ema20Series = calculateEMA(closes, 20);
    const ema50Series = calculateEMA(closes, 50);
    const ema200Series = calculateEMA(closes, 200);
    const roc9Series = calculateROC(closes, 9);
    const roc21Series = calculateROC(closes, 21);
    const macdSeries = calculateMACD(closes, 12, 26, 9);
    const rsi14Series = calculateRSI(closes, 14);
    const atr14Series = calculateATR(highs, lows, closes, 14);

    const signals: MoneyLineSignal[] = [];

    for (let i = 0; i < closedCandles.length; i++) {
      const candle = closedCandles[i];
      const price = candle.close;

      // Calculate component scores
      const emaRes = computeEMAAlignment(closes, i, ema20Series, ema50Series, ema200Series);
      const rocScore = computeROCScore(roc9Series[i], roc21Series[i]);
      const macdRes = computeMACDScore(macdSeries, i, price);
      const rsiRes = computeRSIScore(rsi14Series[i]);
      const rvolRes = computeRVOLScore(volumes, closes, opens, i, 20);
      
      const preliminaryTrend = (emaRes.alignmentScore + macdRes.score) / 2;
      const atrRes = computeATRScore(atr14Series[i], price, preliminaryTrend);

      // Weighted composite score
      const compositeScore = 
        emaRes.alignmentScore * this.weights.emaAlignment +
        emaRes.slopeScore * this.weights.emaSlope +
        rocScore * this.weights.roc +
        macdRes.score * this.weights.macd +
        rsiRes.score * this.weights.rsi +
        rvolRes.score * this.weights.rvol +
        atrRes.score * this.weights.volatility;

      const finalScore = Number(Math.max(-100, Math.min(100, compositeScore)).toFixed(1));
      const currentTier = getTierFromScore(finalScore);

      const prevSignal = i > 0 ? signals[i - 1] : undefined;
      const prevTier = prevSignal?.tier;
      const isTransition = prevTier !== undefined && prevTier !== currentTier;

      const rawIndicators: IndicatorRawValues = {
        ema20: Number((isNaN(emaRes.ema20) ? price : emaRes.ema20).toFixed(4)),
        ema50: Number((isNaN(emaRes.ema50) ? price : emaRes.ema50).toFixed(4)),
        ema200: Number((isNaN(emaRes.ema200) ? price : emaRes.ema200).toFixed(4)),
        ema20Slope: Number(emaRes.ema20Slope.toFixed(2)),
        roc9: Number((isNaN(roc9Series[i]) ? 0 : roc9Series[i]).toFixed(2)),
        roc21: Number((isNaN(roc21Series[i]) ? 0 : roc21Series[i]).toFixed(2)),
        macd: {
          line: Number(macdRes.line.toFixed(4)),
          signal: Number(macdRes.signal.toFixed(4)),
          histogram: Number(macdRes.histogram.toFixed(4)),
          histogramSlope: Number(macdRes.histogramSlope.toFixed(4))
        },
        rsi14: rsiRes.rsi14,
        rsiRegime: rsiRes.rsiRegime,
        rvol: rvolRes.rvol,
        volumeMA20: rvolRes.volumeMA20,
        atr14: atrRes.atr14,
        atrPercent: atrRes.atrPercent
      };

      const contributions: IndicatorContributions = {
        emaAlignmentScore: Number(emaRes.alignmentScore.toFixed(1)),
        emaSlopeScore: Number(emaRes.slopeScore.toFixed(1)),
        rocScore: Number(rocScore.toFixed(1)),
        macdScore: Number(macdRes.score.toFixed(1)),
        rsiScore: Number(rsiRes.score.toFixed(1)),
        rvolScore: Number(rvolRes.score.toFixed(1)),
        volatilityRegimeScore: Number(atrRes.score.toFixed(1)),
        mtfConfirmationScore: 0 // populated if multi-timeframe engine runs
      };

      const transitionTime = isTransition ? candle.timestamp : (prevSignal?.transitionTime || candle.timestamp);
      const transitionPrice = isTransition ? price : (prevSignal?.transitionPrice || price);
      const roiPercent = transitionPrice > 0
        ? Number((((price - transitionPrice) / transitionPrice) * 100).toFixed(2))
        : Number((((price - candle.open) / candle.open) * 100).toFixed(2));

      const signal: MoneyLineSignal = {
        symbol,
        timeframe,
        score: finalScore,
        tier: currentTier,
        previousTier: prevTier,
        isTransition,
        transitionTime,
        transitionPrice,
        roiPercent,
        rawIndicators,
        contributions,
        candleTimestamp: candle.timestamp,
        calculationTimestamp: Date.now(),
        version: this.version
      };

      signals.push(signal);
    }

    return signals;
  }

  /**
   * Helper to compute the latest single Money Line signal for an asset
   */
  public calculateLatest(
    symbol: string,
    timeframe: Timeframe,
    candles: Candle[]
  ): MoneyLineSignal | null {
    const series = this.calculateSeries(symbol, timeframe, candles);
    return series.length > 0 ? series[series.length - 1] : null;
  }
}
