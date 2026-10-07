import { Candle, Timeframe } from '@money-scanner/shared';

export interface MoneyLineCloudSeries {
  lineFast: number[];
  dirFast: number[];
  lineSlow: number[];
  dirSlow: number[];
  sma50: number[];
  sma200: number[];
  buySignals: boolean[];
  sellSignals: boolean[];
}

export const getMoneyLineCloudParameters = (timeframe: Timeframe | string) => {
  const tf = timeframe.toLowerCase();
  if (tf === '1h') return { fastFactor: 2.2, slowFactor: 3.0, atrLength: 12 };
  if (tf === '4h' || tf === '8h' || tf === '1d') return { fastFactor: 2.5, slowFactor: 3.5, atrLength: 10 };
  if (tf === '1w' || tf === '1m') return { fastFactor: 2.8, slowFactor: 3.8, atrLength: 10 };
  return { fastFactor: 2.0, slowFactor: 3.0, atrLength: 10 };
};

/**
 * Simple moving average of candle closes over a trailing window, computed with
 * a running sum so the whole series costs O(n) instead of O(n * period).
 *
 * The result is identical to averaging `candles.slice(start, index + 1)` per
 * index, including the shorter window used before the period is filled. The
 * running sum subtracts the close that leaves the window and adds the one that
 * enters it, so values differ from the previous slice-and-reduce form only by
 * floating-point summation order (~1e-13 relative), never by a different set of
 * real closes.
 */
function rollingSimpleMovingAverage(candles: Candle[], period: number): number[] {
  const output: number[] = new Array(candles.length);
  let sum = 0;
  for (let index = 0; index < candles.length; index++) {
    sum += candles[index].close;
    if (index >= period) sum -= candles[index - period].close;
    const windowSize = index + 1 < period ? index + 1 : period;
    output[index] = sum / windowSize;
  }
  return output;
}

/**
 * Server-side counterpart of the native chart's MoneyLine cloud. It only
 * receives closed candles when used by alert monitoring, so a notification
 * cannot be produced by an unfinished/repainting candle.
 */
export function calculateMoneyLineCloud(candles: Candle[], timeframe: Timeframe | string): MoneyLineCloudSeries {
  if (!candles.length) {
    return {
      lineFast: [],
      dirFast: [],
      lineSlow: [],
      dirSlow: [],
      sma50: [],
      sma200: [],
      buySignals: [],
      sellSignals: []
    };
  }

  const { fastFactor, slowFactor, atrLength } = getMoneyLineCloudParameters(timeframe);
  const trueRange = candles.map((candle, index) => {
    if (index === 0) return candle.high - candle.low;
    const previousClose = candles[index - 1].close;
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose)
    );
  });

  const seedCount = Math.max(1, Math.min(atrLength, trueRange.length));
  let previousAtr = trueRange.slice(0, seedCount).reduce((sum, value) => sum + value, 0) / seedCount;
  const atr = trueRange.map((value, index) => {
    if (index < atrLength) return previousAtr;
    previousAtr = (previousAtr * (atrLength - 1) + value) / atrLength;
    return previousAtr;
  });

  const calculateSupertrend = (multiplier: number) => {
    const line: number[] = [];
    const dir: number[] = [];
    let upperBand = 0;
    let lowerBand = 0;
    let currentDirection = 1;

    candles.forEach((candle, index) => {
      const currentAtr = atr[index] || (candle.high - candle.low);
      const midpoint = (candle.high + candle.low) / 2;
      const basicUpper = midpoint + multiplier * currentAtr;
      const basicLower = midpoint - multiplier * currentAtr;

      if (index === 0) {
        upperBand = basicUpper;
        lowerBand = basicLower;
        currentDirection = candle.close > basicUpper ? -1 : 1;
      } else {
        const previousClose = candles[index - 1].close;
        const previousLower = lowerBand;
        const previousUpper = upperBand;
        lowerBand = basicLower > previousLower || previousClose < previousLower ? basicLower : previousLower;
        upperBand = basicUpper < previousUpper || previousClose > previousUpper ? basicUpper : previousUpper;

        if (currentDirection === 1 && candle.close > previousUpper) currentDirection = -1;
        else if (currentDirection === -1 && candle.close < previousLower) currentDirection = 1;
      }

      line.push(currentDirection === -1 ? lowerBand : upperBand);
      dir.push(currentDirection);
    });

    return { line, dir };
  };

  const fast = calculateSupertrend(fastFactor);
  const slow = calculateSupertrend(slowFactor);
  const sma50 = rollingSimpleMovingAverage(candles, 50);
  const sma200 = rollingSimpleMovingAverage(candles, 200);
  const buySignals = slow.dir.map((direction, index) => index > 0 && direction === -1 && slow.dir[index - 1] === 1);
  const sellSignals = slow.dir.map((direction, index) => index > 0 && direction === 1 && slow.dir[index - 1] === -1);

  return {
    lineFast: fast.line,
    dirFast: fast.dir,
    lineSlow: slow.line,
    dirSlow: slow.dir,
    sma50,
    sma200,
    buySignals,
    sellSignals
  };
}
