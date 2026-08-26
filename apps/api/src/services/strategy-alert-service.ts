import { Candle, AssetMarketClass, StrategyAlertSnapshot } from '@money-scanner/shared';
import { calculateATR, calculateRSI, calculateSMA } from '@money-scanner/money-line';

export interface StrategyAlertEvaluation {
  current?: StrategyAlertSnapshot;
  events: StrategyAlertSnapshot[];
}

const roundPrice = (value: number) => Number(value.toFixed(8));

const closedCandles = (candles: Candle[]) => candles
  .filter(candle => candle.isClosed !== false)
  .sort((left, right) => left.timestamp - right.timestamp);

/**
 * Evaluates the two production research strategies on the latest closed Daily
 * candle. It deliberately emits events only on a fresh threshold transition;
 * repeated scans of the same candle are handled again by persisted
 * idempotency keys in AppState.
 */
export const evaluateDailyStrategyAlerts = (
  symbol: string,
  marketClass: Extract<AssetMarketClass, 'crypto' | 'stocks'>,
  candleInput: Candle[],
  benchmarkInput: Candle[]
): StrategyAlertEvaluation => {
  const daily = closedCandles(candleInput);
  const benchmark = closedCandles(benchmarkInput);
  if (daily.length < 220 || benchmark.length < 220) return { events: [] };

  const closes = daily.map(candle => candle.close);
  const highs = daily.map(candle => candle.high);
  const lows = daily.map(candle => candle.low);
  const rsi2 = calculateRSI(closes, 2);
  const sma5 = calculateSMA(closes, 5);
  const sma50 = calculateSMA(closes, 50);
  const sma200 = calculateSMA(closes, 200);
  const atr14 = calculateATR(highs, lows, closes, 14);
  const lastIndex = daily.length - 1;
  const previousIndex = lastIndex - 1;

  const benchmarkCloses = benchmark.map(candle => candle.close);
  const benchmarkSma50 = calculateSMA(benchmarkCloses, 50);
  const benchmarkSma200 = calculateSMA(benchmarkCloses, 200);
  const benchmarkSymbol = marketClass === 'crypto' ? 'BTC' as const : 'SPY' as const;
  const benchmarkIndexFor = (timestamp: number) => {
    let low = 0;
    let high = benchmark.length - 1;
    let result = -1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (benchmark[middle].timestamp <= timestamp) {
        result = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    return result;
  };
  const latestBenchmarkIndex = benchmarkIndexFor(daily[lastIndex].timestamp);
  if (latestBenchmarkIndex < 199) return { events: [] };

  const benchmarkBearishAt = (index: number) => index >= 199
    && benchmarkCloses[index] < benchmarkSma200[index]
    && benchmarkSma50[index] < benchmarkSma200[index];
  const assetBearishAt = (index: number) => index >= 219
    && closes[index] < sma200[index]
    && sma50[index] < sma200[index]
    && sma200[index] < sma200[index - 20];
  const latestBenchmarkBearish = benchmarkBearishAt(latestBenchmarkIndex);

  const createSnapshot = (
    strategy: StrategyAlertSnapshot['strategy'],
    stage: StrategyAlertSnapshot['stage'],
    side: StrategyAlertSnapshot['side'],
    armedIndex?: number
  ): StrategyAlertSnapshot => {
    const signalPrice = closes[lastIndex];
    const atr = atr14[lastIndex];
    const risk = Math.max(Number.isFinite(atr) ? atr * 3 : signalPrice * 0.03, signalPrice * 0.005);
    const stopLoss = side === 'LONG'
      ? Math.max(signalPrice * 0.01, signalPrice - risk)
      : signalPrice + risk;
    return {
      id: `${marketClass}:${symbol}:${strategy}`,
      strategy,
      stage,
      side,
      symbol,
      marketClass,
      timeframe: '1d',
      candleTimestamp: daily[lastIndex].timestamp,
      armedCandleTimestamp: armedIndex === undefined ? undefined : daily[armedIndex].timestamp,
      confirmationWindowRemaining: armedIndex === undefined ? undefined : Math.max(0, 3 - (lastIndex - armedIndex)),
      signalPrice: roundPrice(signalPrice),
      entryReference: roundPrice(signalPrice),
      stopLoss: roundPrice(stopLoss),
      target1: roundPrice(side === 'LONG' ? signalPrice + risk * 1.5 : signalPrice - risk * 1.5),
      target2: roundPrice(side === 'LONG' ? signalPrice + risk * 2.5 : signalPrice - risk * 2.5),
      riskPercent: Number((risk / signalPrice * 100).toFixed(2)),
      atr14: roundPrice(atr),
      rsi2: Number(rsi2[lastIndex].toFixed(2)),
      previousRsi2: Number(rsi2[previousIndex].toFixed(2)),
      sma5: roundPrice(sma5[lastIndex]),
      sma50: roundPrice(sma50[lastIndex]),
      sma200: roundPrice(sma200[lastIndex]),
      sma200TwentyDaysAgo: roundPrice(sma200[lastIndex - 20]),
      exitRule: side === 'LONG'
        ? 'Ieșire la următorul open după o închidere Daily peste SMA 5.'
        : 'Acoperire la următorul open după o închidere Daily sub SMA 5.',
      benchmarkSymbol,
      benchmarkClose: roundPrice(benchmarkCloses[latestBenchmarkIndex]),
      benchmarkSma50: roundPrice(benchmarkSma50[latestBenchmarkIndex]),
      benchmarkSma200: roundPrice(benchmarkSma200[latestBenchmarkIndex]),
      benchmarkBearish: latestBenchmarkBearish
    };
  };

  const events: StrategyAlertSnapshot[] = [];

  // Published Connors RSI(2) long pullback: trend above SMA200, extreme RSI(2)
  // below 5, then execute at the following Daily open.
  const longTrigger = closes[lastIndex] > sma200[lastIndex] && rsi2[lastIndex] < 5;
  const previousLongTrigger = closes[previousIndex] > sma200[previousIndex] && rsi2[previousIndex] < 5;
  if (longTrigger && !previousLongTrigger) {
    const snapshot = createSnapshot('CONNORS_RSI2_LONG', 'CONFIRMED', 'LONG');
    events.push(snapshot);
    return { current: snapshot, events };
  }

  // Bear Rally Fade: the rebound is armed only while both the asset and its
  // broad benchmark remain in the pre-defined bear regime. Entry requires an
  // RSI(2) cross back below 50 within the next three closed Daily candles.
  let armedIndex = -1;
  for (let index = lastIndex; index >= Math.max(220, lastIndex - 3); index--) {
    const benchmarkIndex = benchmarkIndexFor(daily[index].timestamp);
    const crossedAbove95 = rsi2[index] > 95 && rsi2[index - 1] <= 95;
    if (crossedAbove95 && assetBearishAt(index) && benchmarkBearishAt(benchmarkIndex)) {
      armedIndex = index;
      break;
    }
  }

  if (armedIndex >= 0 && assetBearishAt(lastIndex) && latestBenchmarkBearish) {
    const barsSinceArm = lastIndex - armedIndex;
    const confirmed = barsSinceArm >= 1 && barsSinceArm <= 3
      && rsi2[previousIndex] >= 50 && rsi2[lastIndex] < 50;
    if (confirmed) {
      const snapshot = createSnapshot('BEAR_RALLY_FADE_SHORT', 'CONFIRMED', 'SHORT', armedIndex);
      events.push(snapshot);
      return { current: snapshot, events };
    }

    if (barsSinceArm <= 3 && rsi2[lastIndex] >= 50) {
      const snapshot = createSnapshot('BEAR_RALLY_FADE_SHORT', 'ARMED', 'SHORT', armedIndex);
      if (barsSinceArm === 0) events.push(snapshot);
      return { current: snapshot, events };
    }
  }

  return { events };
};
