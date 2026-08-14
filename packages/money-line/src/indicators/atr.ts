/**
 * Average True Range (ATR) and Volatility Regime Calculations
 */

export function calculateATR(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14
): number[] {
  if (closes.length < period + 1) {
    return new Array(closes.length).fill(NaN);
  }

  const tr: number[] = new Array(closes.length).fill(0);
  tr[0] = highs[0] - lows[0];

  for (let i = 1; i < closes.length; i++) {
    const hl = highs[i] - lows[i];
    const hc = Math.abs(highs[i] - closes[i - 1]);
    const lc = Math.abs(lows[i] - closes[i - 1]);
    tr[i] = Math.max(hl, hc, lc);
  }

  const result: number[] = new Array(closes.length).fill(NaN);
  let trSum = 0;
  for (let i = 0; i < period; i++) {
    trSum += tr[i];
  }
  let currentAtr = trSum / period;
  result[period - 1] = currentAtr;

  for (let i = period; i < closes.length; i++) {
    currentAtr = (currentAtr * (period - 1) + tr[i]) / period;
    result[i] = currentAtr;
  }

  return result;
}

export interface ATRScoreResult {
  atr14: number;
  atrPercent: number;
  score: number; // -100 to +100
}

export function computeATRScore(
  atr14: number,
  currentPrice: number,
  trendDirectionBias: number // -100 to +100 from EMAs & MACD
): ATRScoreResult {
  if (isNaN(atr14) || currentPrice <= 0) {
    return { atr14: 0, atrPercent: 0, score: 0 };
  }

  const atrPercent = (atr14 / currentPrice) * 100;

  // Volatility amplifies the dominant underlying direction:
  // Moderate volatility in an uptrend is bullish (+); extreme wild volatility during a breakdown is bearish (-)
  let score = 0;
  if (trendDirectionBias >= 0) {
    // Bullish trend with controlled volatility (1.5% to 5%)
    if (atrPercent >= 1.5 && atrPercent <= 6.0) {
      score = 40;
    } else if (atrPercent > 6.0) {
      // Overheated / erratic volatility
      score = 10;
    } else {
      // Low volatility compression (potential breakout pending)
      score = 20;
    }
  } else {
    // Bearish trend with expanding volatility = panic selling
    if (atrPercent >= 4.0) {
      score = -60;
    } else {
      score = -25;
    }
  }

  return {
    atr14: Number(atr14.toFixed(4)),
    atrPercent: Number(atrPercent.toFixed(2)),
    score
  };
}
