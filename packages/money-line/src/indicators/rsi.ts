/**
 * Relative Strength Index (RSI) using Wilder's Smoothing
 */

export function calculateRSI(closes: number[], period = 14): number[] {
  if (closes.length < period + 1) {
    return new Array(closes.length).fill(NaN);
  }

  const result: number[] = new Array(closes.length).fill(NaN);
  let gains = 0;
  let losses = 0;

  // First period average gain/loss
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) {
      gains += diff;
    } else {
      losses += Math.abs(diff);
    }
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  if (avgLoss === 0) {
    result[period] = 100;
  } else {
    const rs = avgGain / avgLoss;
    result[period] = 100 - (100 / (1 + rs));
  }

  // Wilder's smoothing for subsequent periods
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const currentGain = diff >= 0 ? diff : 0;
    const currentLoss = diff < 0 ? Math.abs(diff) : 0;

    avgGain = (avgGain * (period - 1) + currentGain) / period;
    avgLoss = (avgLoss * (period - 1) + currentLoss) / period;

    if (avgLoss === 0) {
      result[i] = 100;
    } else {
      const rs = avgGain / avgLoss;
      result[i] = 100 - (100 / (1 + rs));
    }
  }

  return result;
}

export type RSIRegime = 'Oversold' | 'Bearish' | 'Neutral' | 'Bullish' | 'Overbought';

export interface RSIScoreResult {
  rsi14: number;
  rsiRegime: RSIRegime;
  score: number; // -100 to +100
}

export function computeRSIScore(rsi: number): RSIScoreResult {
  if (isNaN(rsi)) {
    return { rsi14: 50, rsiRegime: 'Neutral', score: 0 };
  }

  let rsiRegime: RSIRegime = 'Neutral';
  let score = 0;

  if (rsi >= 70) {
    rsiRegime = 'Overbought';
    // Highly bullish momentum, slight risk of topping
    score = 80 + Math.min(20, (rsi - 70));
  } else if (rsi >= 55) {
    rsiRegime = 'Bullish';
    // Linear scale between 55 (+20) and 70 (+80)
    score = 20 + ((rsi - 55) / 15) * 60;
  } else if (rsi > 45) {
    rsiRegime = 'Neutral';
    // Linear scale between 45 (-20) and 55 (+20)
    score = ((rsi - 50) / 5) * 20;
  } else if (rsi > 30) {
    rsiRegime = 'Bearish';
    // Linear scale between 30 (-80) and 45 (-20)
    score = -80 + ((rsi - 30) / 15) * 60;
  } else {
    rsiRegime = 'Oversold';
    // Extremely bearish breakdown or oversold condition
    score = -80 - Math.min(20, (30 - rsi));
  }

  return {
    rsi14: Number(rsi.toFixed(2)),
    rsiRegime,
    score: Math.max(-100, Math.min(100, score))
  };
}
