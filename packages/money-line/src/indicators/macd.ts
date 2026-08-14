import { calculateEMA } from './ema.js';

export interface MACDSeries {
  macdLine: number[];
  signalLine: number[];
  histogram: number[];
}

export function calculateMACD(
  closes: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9
): MACDSeries {
  const emaFast = calculateEMA(closes, fastPeriod);
  const emaSlow = calculateEMA(closes, slowPeriod);

  const macdLine: number[] = new Array(closes.length).fill(NaN);
  for (let i = 0; i < closes.length; i++) {
    if (!isNaN(emaFast[i]) && !isNaN(emaSlow[i])) {
      macdLine[i] = emaFast[i] - emaSlow[i];
    }
  }

  // To calculate Signal Line from macdLine, we filter valid numbers or pass along
  const validStartIndex = slowPeriod - 1;
  const validMacdValues: number[] = [];
  for (let i = validStartIndex; i < macdLine.length; i++) {
    validMacdValues.push(macdLine[i]);
  }

  const validSignalValues = calculateEMA(validMacdValues, signalPeriod);

  const signalLine: number[] = new Array(closes.length).fill(NaN);
  const histogram: number[] = new Array(closes.length).fill(NaN);

  for (let i = 0; i < validSignalValues.length; i++) {
    const targetIdx = validStartIndex + i;
    const sig = validSignalValues[i];
    signalLine[targetIdx] = sig;
    if (!isNaN(sig) && !isNaN(macdLine[targetIdx])) {
      histogram[targetIdx] = macdLine[targetIdx] - sig;
    }
  }

  return { macdLine, signalLine, histogram };
}

export interface MACDScoreResult {
  line: number;
  signal: number;
  histogram: number;
  histogramSlope: number;
  score: number; // -100 to +100
}

export function computeMACDScore(
  macdSeries: MACDSeries,
  idx: number,
  currentPrice: number
): MACDScoreResult {
  const line = isNaN(macdSeries.macdLine[idx]) ? 0 : macdSeries.macdLine[idx];
  const signal = isNaN(macdSeries.signalLine[idx]) ? 0 : macdSeries.signalLine[idx];
  const hist = isNaN(macdSeries.histogram[idx]) ? 0 : macdSeries.histogram[idx];

  const prevHist = (idx > 0 && !isNaN(macdSeries.histogram[idx - 1])) 
    ? macdSeries.histogram[idx - 1] 
    : hist;

  const histSlope = hist - prevHist;

  // Normalize histogram relative to current price to make score scale-invariant
  const normalizedHist = currentPrice > 0 ? (hist / currentPrice) * 100 : 0;
  const normalizedSlope = currentPrice > 0 ? (histSlope / currentPrice) * 100 : 0;

  let score = 0;
  if (hist > 0) {
    if (histSlope >= 0) {
      // Bullish and expanding
      score = Math.min(100, 50 + normalizedHist * 200 + normalizedSlope * 200);
    } else {
      // Bullish but momentum fading
      score = Math.max(10, 50 + normalizedHist * 200 + normalizedSlope * 200);
    }
  } else {
    if (histSlope <= 0) {
      // Bearish and expanding downward
      score = Math.max(-100, -50 + normalizedHist * 200 + normalizedSlope * 200);
    } else {
      // Bearish but momentum improving
      score = Math.min(-10, -50 + normalizedHist * 200 + normalizedSlope * 200);
    }
  }

  return {
    line,
    signal,
    histogram: hist,
    histogramSlope: histSlope,
    score: Math.max(-100, Math.min(100, score))
  };
}
