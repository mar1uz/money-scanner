import {
  AssetMarketDataSource,
  Candle,
  DailySmaReclaimEvaluatorOptions,
  DailySmaReclaimMoneyLineContext,
  DailySmaReclaimResult,
  DailySmaReclaimSignal,
  DAILY_SMA_RECLAIM_RULE_ID,
  DAILY_SMA_RECLAIM_RULE_VERSION,
  SmaDirection
} from '@money-scanner/shared';
import { calculateATR, calculateSMA, MoneyLineEngine, calculateMoneyLineCloud } from '@money-scanner/money-line';

const DAY_MS = 86_400_000;

const validCandle = (candle: Candle) => [
  candle.timestamp,
  candle.open,
  candle.high,
  candle.low,
  candle.close,
  candle.volume
].every(value => Number.isFinite(value))
  && candle.timestamp >= 0
  && candle.open > 0
  && candle.high >= candle.low
  && candle.high >= candle.open
  && candle.high >= candle.close
  && candle.low <= candle.open
  && candle.low <= candle.close
  && candle.close > 0
  && candle.volume >= 0;

const dayStart = (timestamp: number) => {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
};

const dayLabel = (timestamp: number) => new Date(timestamp).toISOString().slice(0, 10);

const direction = (current: number, previous: number): SmaDirection => {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return 'UNAVAILABLE';
  if (current > previous) return 'RISING';
  if (current < previous) return 'FALLING';
  return 'FLAT';
};

const cloudContext = (
  symbol: string,
  timeframe: '1d' | '1w',
  candles: Candle[]
): DailySmaReclaimMoneyLineContext => {
  if (!candles.length) return {};
  const cloud = calculateMoneyLineCloud(candles, timeframe);
  const index = cloud.dirFast.length - 1;
  if (index < 0) return {};
  const fastBullish = cloud.dirFast[index] === -1;
  const slowBullish = cloud.dirSlow[index] === -1;
  let tier;
  let score;
  try {
    const engine = new MoneyLineEngine();
    const latest = engine.calculateLatest(symbol, timeframe, candles);
    tier = latest?.tier;
    score = latest?.score;
  } catch {
    // Cloud direction is the common engine's required context. A tier/score
    // failure must not turn a valid SMA reclaim into an error.
  }
  return {
    fastBullish,
    slowBullish,
    bullish: fastBullish && slowBullish,
    ...(tier ? { tier } : {}),
    ...(Number.isFinite(score) ? { score } : {}),
    candleTimestamp: candles[index].timestamp
  };
};

/** Builds complete Monday-Sunday UTC candles from closed daily crypto bars. */
export const deriveClosedUtcWeeks = (dailyCandles: Candle[]): Candle[] => {
  const groups = new Map<number, Candle[]>();
  for (const candle of dailyCandles) {
    const start = dayStart(candle.timestamp);
    const date = new Date(start);
    const mondayOffset = (date.getUTCDay() + 6) % 7;
    const weekStart = start - mondayOffset * DAY_MS;
    const list = groups.get(weekStart) || [];
    list.push({ ...candle, timestamp: start });
    groups.set(weekStart, list);
  }

  return Array.from(groups.entries())
    .sort(([left], [right]) => left - right)
    .flatMap(([weekStart, list]) => {
      const sorted = list.sort((left, right) => left.timestamp - right.timestamp);
      if (sorted.length !== 7) return [];
      for (let index = 1; index < sorted.length; index += 1) {
        if (sorted[index].timestamp !== sorted[index - 1].timestamp + DAY_MS) return [];
      }
      return [{
        timestamp: weekStart,
        open: sorted[0].open,
        high: Math.max(...sorted.map(candle => candle.high)),
        low: Math.min(...sorted.map(candle => candle.low)),
        close: sorted[sorted.length - 1].close,
        volume: sorted.reduce((sum, candle) => sum + candle.volume, 0),
        isClosed: true
      }];
    });
};

const unavailable = (
  symbol: string,
  options: DailySmaReclaimEvaluatorOptions,
  status: DailySmaReclaimResult['status'],
  reason: string,
  analyzedTimestamp: number,
  evaluatedAt: number
): DailySmaReclaimResult => ({
  ruleId: DAILY_SMA_RECLAIM_RULE_ID,
  ruleVersion: DAILY_SMA_RECLAIM_RULE_VERSION,
  symbol: symbol.toUpperCase(),
  name: options.name || symbol.toUpperCase(),
  marketClass: 'crypto',
  ...(Number.isFinite(options.rank) ? { rank: options.rank } : {}),
  source: options.source || 'unknown',
  pair: options.pair || `${symbol.toUpperCase()}USDT`,
  analyzedDay: dayLabel(analyzedTimestamp),
  analyzedDayTimestamp: analyzedTimestamp,
  evaluatedAt,
  status,
  reason
});

/**
 * Pure, non-repainting evaluator for DAILY_SMA50_200_RECLAIM.
 * It intentionally does not create a trade plan or infer missing history.
 */
export const evaluateDailySmaReclaim = (
  symbol: string,
  input: Candle[],
  options: DailySmaReclaimEvaluatorOptions = {}
): DailySmaReclaimResult => {
  const evaluatedAt = options.evaluatedAt || Date.now();
  const invalidClosed = input.some(candle => candle.isClosed !== false && !validCandle(candle));
  if (invalidClosed) {
    const expectedTimestamp = dayStart(options.expectedDayTimestamp ?? Date.now());
    return unavailable(symbol, options, 'INSUFFICIENT_HISTORY', 'Istoricul conține valori OHLCV invalide.', expectedTimestamp, evaluatedAt);
  }
  const closed = input
    .filter(candle => candle.isClosed !== false)
    .filter(validCandle)
    .map(candle => ({ ...candle, timestamp: dayStart(candle.timestamp) }))
    .sort((left, right) => left.timestamp - right.timestamp);
  const latestInputTimestamp = input.length ? Math.max(...input.map(candle => candle.timestamp)) : 0;
  const expectedTimestamp = dayStart(options.expectedDayTimestamp ?? latestInputTimestamp);
  const latest = closed.at(-1);

  if (!latest) {
    return unavailable(symbol, options, 'INSUFFICIENT_HISTORY', 'Nu există lumânări zilnice valide și închise.', expectedTimestamp, evaluatedAt);
  }
  if (latest.timestamp !== expectedTimestamp) {
    return unavailable(symbol, options, 'STALE_DATA', `Ultima lumânare închisă este ${dayLabel(latest.timestamp)}, nu ${dayLabel(expectedTimestamp)}.`, expectedTimestamp, evaluatedAt);
  }

  const unique = new Set<number>();
  for (const candle of closed) {
    if (unique.has(candle.timestamp)) {
      return unavailable(symbol, options, 'INSUFFICIENT_HISTORY', 'Istoricul zilnic conține lumânări duplicate.', expectedTimestamp, evaluatedAt);
    }
    unique.add(candle.timestamp);
  }
  for (let index = 1; index < closed.length; index += 1) {
    if (closed[index].timestamp !== closed[index - 1].timestamp + DAY_MS) {
      return unavailable(symbol, options, 'INSUFFICIENT_HISTORY', 'Istoricul zilnic conține zile lipsă.', expectedTimestamp, evaluatedAt);
    }
  }
  if (closed.length < 201) {
    return unavailable(symbol, options, 'INSUFFICIENT_HISTORY', `Sunt necesare minimum 201 lumânări zilnice consecutive; disponibile ${closed.length}.`, expectedTimestamp, evaluatedAt);
  }

  const closes = closed.map(candle => candle.close);
  const highs = closed.map(candle => candle.high);
  const lows = closed.map(candle => candle.low);
  const volumes = closed.map(candle => candle.volume);
  const lastIndex = closed.length - 1;
  const previousIndex = lastIndex - 1;
  const sma50 = calculateSMA(closes, 50);
  const sma200 = calculateSMA(closes, 200);
  const atr14 = calculateATR(highs, lows, closes, 14)[lastIndex];
  const currentSma50 = sma50[lastIndex];
  const currentSma200 = sma200[lastIndex];
  const previousSma50 = sma50[previousIndex];
  const previousSma200 = sma200[previousIndex];
  const aboveBoth = closes[lastIndex] > currentSma50 && closes[lastIndex] > currentSma200;
  const newSignal = aboveBoth && (closes[previousIndex] <= previousSma50 || closes[previousIndex] <= previousSma200);
  const previousVolumes = volumes.slice(Math.max(0, lastIndex - 20), lastIndex);
  const volumeAverage = previousVolumes.length === 20
    ? previousVolumes.reduce((sum, volume) => sum + volume, 0) / 20
    : NaN;
  const rvol = volumeAverage > 0 ? volumes[lastIndex] / volumeAverage : undefined;
  const upperSma = Math.max(currentSma50, currentSma200);
  const distanceToUpperSmaAtr = Number.isFinite(atr14) && atr14 > 0
    ? (closes[lastIndex] - upperSma) / atr14
    : undefined;
  const weeklyCandles = (options.weeklyCandles || deriveClosedUtcWeeks(closed))
    .filter(candle => candle.isClosed !== false && candle.timestamp + 7 * DAY_MS - 1 <= expectedTimestamp + DAY_MS - 1);
  const signal: DailySmaReclaimSignal = {
    confirmationPrice: closes[lastIndex],
    previousClose: closes[previousIndex],
    sma50: currentSma50,
    sma200: currentSma200,
    previousSma50,
    previousSma200,
    sma50Direction: direction(currentSma50, sma50[lastIndex - 5]),
    sma200Direction: direction(currentSma200, sma200[lastIndex - 5]),
    ...(Number.isFinite(atr14) && atr14 > 0 ? { atr14 } : {}),
    ...(distanceToUpperSmaAtr !== undefined ? {
      distanceToUpperSmaAtr,
      ...(distanceToUpperSmaAtr <= 1 ? { distanceLabel: 'NEAR_MEDIANS' as const } : {}),
      ...(distanceToUpperSmaAtr > 2 ? { distanceLabel: 'EXTENDED' as const } : {})
    } : {}),
    ...(rvol !== undefined ? { rvol } : {}),
    rvolHighlighted: rvol !== undefined && rvol >= 1.5,
    dailyMoneyLine: cloudContext(symbol, '1d', closed),
    ...(weeklyCandles.length ? { weeklyMoneyLine: cloudContext(symbol, '1w', weeklyCandles) } : {})
  };
  const result = {
    ...unavailable(symbol, options, newSignal ? 'NEW_SIGNAL' : aboveBoth ? 'ABOVE_BOTH' : 'NO_SIGNAL',
      newSignal ? 'Închiderea zilei a recuperat ambele medii.' : aboveBoth ? 'Prețul se menține peste SMA 50 și SMA 200.' : 'Nu există recuperare a ambelor medii în ultima zi închisă.',
      expectedTimestamp, evaluatedAt),
    ...(newSignal ? { eventId: `${DAILY_SMA_RECLAIM_RULE_ID}:v${DAILY_SMA_RECLAIM_RULE_VERSION}:${symbol.toUpperCase()}:${options.source || 'unknown'}:${options.pair || `${symbol.toUpperCase()}USDT`}:${dayLabel(expectedTimestamp)}` } : {}),
    ...(aboveBoth ? { signal } : {})
  };
  return result;
};

export const dailySmaReclaimStatusCounts = (results: DailySmaReclaimResult[]) => results.reduce((counts, result) => {
  counts[result.status] = (counts[result.status] || 0) + 1;
  return counts;
}, {} as Record<string, number>);
