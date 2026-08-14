/**
 * Exponential Moving Average (EMA) and Alignment Calculations
 */

export function calculateEMA(values: number[], period: number): number[] {
  if (values.length < period) {
    return new Array(values.length).fill(NaN);
  }

  const result: number[] = new Array(values.length).fill(NaN);
  const multiplier = 2 / (period + 1);

  // Initial SMA for the first valid period
  let initialSum = 0;
  for (let i = 0; i < period; i++) {
    initialSum += values[i];
  }
  let currentEma = initialSum / period;
  result[period - 1] = currentEma;

  // Compute EMA for remaining values
  for (let i = period; i < values.length; i++) {
    currentEma = (values[i] - currentEma) * multiplier + currentEma;
    result[i] = currentEma;
  }

  return result;
}

export interface EMAAlignmentResult {
  ema20: number;
  ema50: number;
  ema200: number;
  alignmentScore: number; // -100 to +100
  slopeScore: number;     // -100 to +100
  ema20Slope: number;     // percentage slope
}

export function computeEMAAlignment(
  closes: number[],
  idx: number,
  ema20Series: number[],
  ema50Series: number[],
  ema200Series: number[]
): EMAAlignmentResult {
  const price = closes[idx];
  const e20 = ema20Series[idx];
  const e50 = ema50Series[idx];
  const e200 = isNaN(ema200Series[idx]) ? e50 : ema200Series[idx];

  let alignmentScore = 0;

  // Alignment check
  const priceAbove20 = price >= e20;
  const e20Above50 = e20 >= e50;
  const e50Above200 = e50 >= e200;

  if (priceAbove20 && e20Above50 && e50Above200) {
    // Perfect Bullish Stack
    alignmentScore = 100;
  } else if (priceAbove20 && e20Above50) {
    // Strong Bullish
    alignmentScore = 65;
  } else if (priceAbove20 && !e20Above50 && price >= e50) {
    // Early Bullish reversal
    alignmentScore = 30;
  } else if (!priceAbove20 && !e20Above50 && !e50Above200) {
    // Perfect Bearish Stack
    alignmentScore = -100;
  } else if (!priceAbove20 && !e20Above50) {
    // Strong Bearish
    alignmentScore = -65;
  } else if (!priceAbove20 && e20Above50 && price < e50) {
    // Early Bearish breakdown
    alignmentScore = -30;
  } else {
    // Range / Choppy
    alignmentScore = 0;
  }

  // Slope calculation over 3 periods
  let slopeScore = 0;
  let ema20Slope = 0;
  if (idx >= 3 && !isNaN(ema20Series[idx - 3]) && ema20Series[idx - 3] > 0) {
    const prevE20 = ema20Series[idx - 3];
    ema20Slope = ((e20 - prevE20) / prevE20) * 100;
    // Scale slope: +/- 1.5% slope -> +/- 100 score
    slopeScore = Math.max(-100, Math.min(100, (ema20Slope / 1.5) * 100));
  }

  return {
    ema20: e20,
    ema50: e50,
    ema200: e200,
    alignmentScore,
    slopeScore,
    ema20Slope
  };
}
