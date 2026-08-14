/**
 * Relative Volume (RVOL) and Volume-Price Confirmation Calculations
 */

export function calculateSMA(values: number[], period: number): number[] {
  const result: number[] = new Array(values.length).fill(NaN);
  if (values.length < period) return result;

  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += values[i];
  }
  result[period - 1] = sum / period;

  for (let i = period; i < values.length; i++) {
    sum += values[i] - values[i - period];
    result[i] = sum / period;
  }

  return result;
}

export interface RVOLScoreResult {
  rvol: number;
  volumeMA20: number;
  score: number; // -100 to +100
}

export function computeRVOLScore(
  volumes: number[],
  closes: number[],
  opens: number[],
  idx: number,
  period = 20
): RVOLScoreResult {
  const volumeMA20Series = calculateSMA(volumes, period);
  const currentVolume = volumes[idx];
  const volMA = volumeMA20Series[idx];

  if (isNaN(volMA) || volMA === 0) {
    return { rvol: 1.0, volumeMA20: currentVolume, score: 0 };
  }

  const rvol = currentVolume / volMA;
  const candleReturn = opens[idx] > 0 ? ((closes[idx] - opens[idx]) / opens[idx]) * 100 : 0;

  let score = 0;
  if (candleReturn >= 0) {
    // Bullish candle
    if (rvol >= 2.0) {
      // High volume breakout / accumulation
      score = Math.min(100, 60 + (rvol - 2.0) * 20);
    } else if (rvol >= 1.0) {
      score = 20 + (rvol - 1.0) * 40;
    } else {
      // Low volume move
      score = rvol * 20;
    }
  } else {
    // Bearish candle
    if (rvol >= 2.0) {
      // Heavy volume distribution / dump
      score = Math.max(-100, -60 - (rvol - 2.0) * 20);
    } else if (rvol >= 1.0) {
      score = -20 - (rvol - 1.0) * 40;
    } else {
      // Low volume consolidation pullback
      score = -rvol * 20;
    }
  }

  return {
    rvol: Number(rvol.toFixed(2)),
    volumeMA20: Number(volMA.toFixed(2)),
    score: Math.max(-100, Math.min(100, score))
  };
}
