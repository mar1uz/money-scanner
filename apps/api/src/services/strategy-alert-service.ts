import { Candle, AssetMarketClass, StrategyAlertSnapshot } from '@money-scanner/shared';
import { calculateATR, calculateRSI, calculateSMA, calculateMoneyLineCloud } from '@money-scanner/money-line';

export interface StrategyAlertEvaluation {
  current?: StrategyAlertSnapshot;
  events: StrategyAlertSnapshot[];
}

const roundPrice = (value: number) => Number(value.toFixed(8));

const closedCandles = (candles: Candle[]) => candles
  .filter(candle => candle.isClosed !== false)
  .sort((left, right) => left.timestamp - right.timestamp);

const percentileRank = (values: number[], current: number) => {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.filter(value => value <= current).length / finite.length : 1;
};

/**
 * Evaluates the production research & MoneyLine strategies on the latest closed candles.
 * Emits events only on fresh threshold transitions; repeated scans of the same candle
 * are protected by persisted idempotency keys in AppState.
 */
export const evaluateDailyStrategyAlerts = (
  symbol: string,
  marketClass: AssetMarketClass,
  candleInput: Candle[],
  benchmarkInput: Candle[],
  weeklyInput: Candle[] = [],
  candles4hInput: Candle[] = []
): StrategyAlertEvaluation => {
  const daily = closedCandles(candleInput);
  const benchmark = closedCandles(benchmarkInput);
  const weekly = closedCandles(weeklyInput);
  const candles4h = closedCandles(candles4hInput);

  if (daily.length < 200) return { events: [] };

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

  const latestBenchmarkIndex = benchmark.length >= 200 ? benchmarkIndexFor(daily[lastIndex].timestamp) : -1;
  const benchmarkBearishAt = (index: number) => index >= 199
    && benchmarkCloses[index] < benchmarkSma200[index]
    && benchmarkSma50[index] < benchmarkSma200[index];
  const assetBearishAt = (index: number) => index >= 219
    && closes[index] < sma200[index]
    && sma50[index] < sma200[index]
    && sma200[index] < sma200[index - 20];
  const latestBenchmarkBearish = latestBenchmarkIndex >= 199 && benchmarkBearishAt(latestBenchmarkIndex);

  const createSnapshot = (
    strategy: StrategyAlertSnapshot['strategy'],
    stage: StrategyAlertSnapshot['stage'],
    side: StrategyAlertSnapshot['side'],
    timeframe: '1d' | '4h' = '1d',
    customRisk?: number,
    customStop?: number,
    armedIndex?: number,
    customPrice?: number,
    customTimestamp?: number
  ): StrategyAlertSnapshot => {
    const signalPrice = customPrice !== undefined ? customPrice : closes[lastIndex];
    const atr = atr14[lastIndex];
    const risk = customRisk !== undefined ? customRisk : Math.max(Number.isFinite(atr) ? atr * 2.5 : signalPrice * 0.03, signalPrice * 0.005);
    const stopLoss = customStop !== undefined ? customStop : (side === 'LONG' ? Math.max(signalPrice * 0.01, signalPrice - risk) : signalPrice + risk);
    const candleTimestamp = customTimestamp !== undefined ? customTimestamp : daily[lastIndex].timestamp;

    let exitRule = '';
    if (strategy === 'WEEKLY_DONCHIAN_55_LONG') {
      exitRule = 'Trailing stop la minimul ultimelor 20 de sesiuni; ieșire și dacă regimul Weekly devine invalid.';
    } else if (strategy === 'BEAR_RALLY_FADE_SHORT') {
      exitRule = 'Acoperire la următorul open după o închidere Daily sub SMA 5 (sau stop 3 ATR).';
    } else if (strategy === 'MONEYLINE_MACRO_LONG') {
      exitRule = 'Take-Profit 1.5R / 3.0R sau ieșire la Bear Flip pe MoneyLine Daily.';
    } else if (strategy === 'MONEYLINE_4H_SNIPER_LONG') {
      exitRule = 'Take-Profit 1.5R / 3.0R sau ieșire la Bear Flip pe MoneyLine 4H.';
    }

    return {
      id: `${marketClass}:${symbol}:${strategy}:${timeframe}`,
      strategy,
      stage,
      side,
      symbol,
      marketClass,
      timeframe,
      candleTimestamp,
      armedCandleTimestamp: armedIndex === undefined ? undefined : daily[armedIndex]?.timestamp,
      confirmationWindowRemaining: armedIndex === undefined || strategy !== 'BEAR_RALLY_FADE_SHORT'
        ? undefined
        : Math.max(0, 3 - (lastIndex - armedIndex)),
      signalPrice: roundPrice(signalPrice),
      entryReference: roundPrice(signalPrice),
      stopLoss: roundPrice(stopLoss),
      target1: roundPrice(side === 'LONG' ? signalPrice + risk * 1.5 : signalPrice - risk * 1.5),
      target2: roundPrice(side === 'LONG' ? signalPrice + risk * 3.0 : signalPrice - risk * 3.0),
      riskPercent: Number((risk / signalPrice * 100).toFixed(2)),
      atr14: roundPrice(atr),
      rsi2: Number(rsi2[lastIndex]?.toFixed(2) || 0),
      previousRsi2: Number(rsi2[previousIndex]?.toFixed(2) || 0),
      sma5: roundPrice(sma5[lastIndex] || 0),
      sma50: roundPrice(sma50[lastIndex] || 0),
      sma200: roundPrice(sma200[lastIndex] || 0),
      sma200TwentyDaysAgo: roundPrice(sma200[Math.max(0, lastIndex - 20)] || 0),
      exitRule,
      benchmarkSymbol,
      benchmarkClose: latestBenchmarkIndex >= 0 ? roundPrice(benchmarkCloses[latestBenchmarkIndex]) : undefined,
      benchmarkSma50: latestBenchmarkIndex >= 0 ? roundPrice(benchmarkSma50[latestBenchmarkIndex]) : undefined,
      benchmarkSma200: latestBenchmarkIndex >= 0 ? roundPrice(benchmarkSma200[latestBenchmarkIndex]) : undefined,
      benchmarkBearish: latestBenchmarkBearish
    };
  };

  const events: StrategyAlertSnapshot[] = [];
  let currentSnapshot: StrategyAlertSnapshot | undefined;

  // --- 1. STRATEGY: MONEYLINE MACRO TREND LONG (Weekly Bull + Daily Bull Flip + Price > SMA 200) ---
  if (weekly.length >= 40) {
    const dailyCloud = calculateMoneyLineCloud(daily, '1d');
    const weeklyCloud = calculateMoneyLineCloud(weekly, '1w');
    const lastWeeklyIdx = weekly.length - 1;

    const isWeeklyBull = weeklyCloud.dirSlow[lastWeeklyIdx] === -1; // -1 = Bullish in MoneyLine Cloud
    const isDailyBullFlip = dailyCloud.buySignals[lastIndex] || (dailyCloud.dirSlow[lastIndex] === -1 && dailyCloud.dirSlow[previousIndex] === 1);
    const isAboveSma200 = closes[lastIndex] > (sma200[lastIndex] || 0);
    const isRisingSma50 = (sma50[lastIndex] || 0) >= (sma50[Math.max(0, lastIndex - 10)] || 0);

    if (isWeeklyBull && isAboveSma200 && isRisingSma50) {
      const stop = Math.max(dailyCloud.lineSlow[lastIndex] || 0, closes[lastIndex] - 2.2 * atr14[lastIndex]);
      const risk = closes[lastIndex] - stop;

      if (risk > 0 && risk / closes[lastIndex] <= 0.12) {
        const snapshot = createSnapshot(
          'MONEYLINE_MACRO_LONG',
          'CONFIRMED',
          'LONG',
          '1d',
          risk,
          stop
        );
        currentSnapshot = snapshot;
        if (isDailyBullFlip) events.push(snapshot);
      }
    }
  }

  // --- 2. STRATEGY: MONEYLINE 4H SNIPER CONFLUENCE (Weekly/Daily Bull + 4H Bull Flip) ---
  if (candles4h.length >= 50) {
    const cloud4h = calculateMoneyLineCloud(candles4h, '4h');
    const dailyCloud = calculateMoneyLineCloud(daily, '1d');
    const last4hIdx = candles4h.length - 1;
    const prev4hIdx = last4hIdx - 1;

    const isDailyBull = dailyCloud.dirSlow[lastIndex] === -1;
    const is4hBullFlip = cloud4h.buySignals[last4hIdx] || (cloud4h.dirSlow[last4hIdx] === -1 && cloud4h.dirSlow[prev4hIdx] === 1);
    const c4hClose = candles4h[last4hIdx].close;
    const stop4h = cloud4h.lineSlow[last4hIdx] || (c4hClose * 0.95);
    const risk4h = c4hClose - stop4h;

    if (isDailyBull && risk4h > 0 && risk4h / c4hClose <= 0.07) {
      const snapshot = createSnapshot(
        'MONEYLINE_4H_SNIPER_LONG',
        'CONFIRMED',
        'LONG',
        '4h',
        risk4h,
        stop4h,
        undefined,
        c4hClose,
        candles4h[last4hIdx].timestamp
      );
      if (!currentSnapshot) currentSnapshot = snapshot;
      if (is4hBullFlip) events.push(snapshot);
    }
  }

  // --- 3. STRATEGY: WEEKLY TREND + DONCHIAN 55/20 LONG ---
  // This replaces Connors in production. It is intentionally stocks/ETF-only,
  // matching the validated holdout scope. A near-breakout state is informational;
  // execution is confirmed only by a fresh Daily close above the prior 55-session high.
  if (marketClass === 'stocks' && daily.length >= 261 && weekly.length >= 49) {
    const weeklyCloses = weekly.map(candle => candle.close);
    const weeklySma40 = calculateSMA(weeklyCloses, 40);
    const weeklyCloud = calculateMoneyLineCloud(weekly, '1w');
    const dailyCloud = calculateMoneyLineCloud(daily, '1d');
    const weeklyIndex = weekly.length - 1;
    const weeklyBullish = weeklyCloud.dirFast[weeklyIndex] < 0
      && weeklyCloud.dirSlow[weeklyIndex] < 0
      && weeklyCloses[weeklyIndex] > weeklySma40[weeklyIndex]
      && weeklySma40[weeklyIndex] > weeklySma40[weeklyIndex - 8];
    const broadDailyTrend = closes[lastIndex] > sma200[lastIndex]
      && sma50[lastIndex] > sma200[lastIndex]
      && sma50[lastIndex] > sma50[lastIndex - 20]
      && sma200[lastIndex] > sma200[lastIndex - 20];
    const positiveMomentum = closes[lastIndex] > closes[lastIndex - 252];
    const currentAtrPercent = atr14[lastIndex] / closes[lastIndex] * 100;
    const atrHistory = daily.slice(lastIndex - 252, lastIndex).map((candle, offset) => {
      const sourceIndex = lastIndex - 252 + offset;
      return atr14[sourceIndex] / candle.close * 100;
    });
    const atrRank = percentileRank(atrHistory, currentAtrPercent);
    const controlledVolatility = atrRank <= 0.7;
    const previousHigh55 = Math.max(...daily.slice(lastIndex - 55, lastIndex).map(candle => candle.high));
    const previousHigh55AtPriorClose = Math.max(...daily.slice(previousIndex - 55, previousIndex).map(candle => candle.high));
    const freshBreakout = closes[lastIndex] > previousHigh55
      && closes[previousIndex] <= previousHigh55AtPriorClose;
    const distanceToBreakout = previousHigh55 - closes[lastIndex];
    const nearBreakout = distanceToBreakout >= 0 && distanceToBreakout <= atr14[lastIndex];
    const previousDistance = previousHigh55AtPriorClose - closes[previousIndex];
    const freshArm = nearBreakout && (previousDistance < 0 || previousDistance > atr14[previousIndex]);
    const dailyFastBullish = dailyCloud.dirFast[lastIndex] < 0;

    if (weeklyBullish && broadDailyTrend && positiveMomentum && controlledVolatility && dailyFastBullish
      && (freshBreakout || nearBreakout)) {
      const structuralStop = Math.min(daily[previousIndex].low, daily[lastIndex].low) - 0.1 * atr14[lastIndex];
      const volatilityStop = closes[lastIndex] - 2 * atr14[lastIndex];
      const stop = Math.min(structuralStop, volatilityStop);
      const risk = closes[lastIndex] - stop;
      const riskPercent = risk / closes[lastIndex] * 100;

      if (risk > 0 && riskPercent <= 4) {
        const stage: StrategyAlertSnapshot['stage'] = freshBreakout ? 'CONFIRMED' : 'ARMED';
        const snapshot: StrategyAlertSnapshot = {
          ...createSnapshot(
            'WEEKLY_DONCHIAN_55_LONG',
            stage,
            'LONG',
            '1d',
            risk,
            stop,
            stage === 'ARMED' ? lastIndex : undefined
          ),
          rsi2: undefined,
          previousRsi2: undefined,
          sma5: undefined,
          donchianHigh55: roundPrice(previousHigh55),
          donchianLow20: roundPrice(Math.min(...daily.slice(lastIndex - 19, lastIndex + 1).map(candle => candle.low))),
          weeklySma40: roundPrice(weeklySma40[weeklyIndex]),
          weeklySma40EightWeeksAgo: roundPrice(weeklySma40[weeklyIndex - 8]),
          weeklyFastBullish: true,
          weeklySlowBullish: true,
          atrPercentile: Number((atrRank * 100).toFixed(1)),
          momentum252Percent: Number(((closes[lastIndex] / closes[lastIndex - 252] - 1) * 100).toFixed(2)),
          distanceToBreakoutPercent: Number((Math.max(0, distanceToBreakout) / closes[lastIndex] * 100).toFixed(2)),
          maxRiskPercent: 4
        };
        currentSnapshot = snapshot;
        if (freshBreakout || freshArm) events.push(snapshot);
      }
    }
  }

  // --- 4. STRATEGY: BEAR RALLY FADE SHORT (Arm > 95 -> Confirm < 50 in 3 bars) ---
  if ((marketClass === 'crypto' || marketClass === 'stocks') && latestBenchmarkIndex >= 199) {
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
        const snapshot = createSnapshot('BEAR_RALLY_FADE_SHORT', 'CONFIRMED', 'SHORT', '1d', undefined, undefined, armedIndex);
        events.push(snapshot);
        if (!currentSnapshot) currentSnapshot = snapshot;
      } else if (barsSinceArm <= 3 && rsi2[lastIndex] >= 50) {
        const snapshot = createSnapshot('BEAR_RALLY_FADE_SHORT', 'ARMED', 'SHORT', '1d', undefined, undefined, armedIndex);
        if (barsSinceArm === 0) events.push(snapshot);
        if (!currentSnapshot) currentSnapshot = snapshot;
      }
    }
  }

  return { current: currentSnapshot, events };
};
