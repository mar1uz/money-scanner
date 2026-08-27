import { Candle, AssetMarketClass, StrategyAlertSnapshot } from '@money-scanner/shared';
import { calculateATR, calculateRSI, calculateSMA, calculateMoneyLineCloud } from '@money-scanner/money-line';

export interface StrategyAlertEvaluation {
  current?: StrategyAlertSnapshot;
  snapshots: StrategyAlertSnapshot[];
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

  if (daily.length < 50) return { snapshots: [], events: [] };

  const closes = daily.map(candle => candle.close);
  const highs = daily.map(candle => candle.high);
  const lows = daily.map(candle => candle.low);
  const rsi2 = calculateRSI(closes, 2);
  const sma5 = calculateSMA(closes, 5);
  const sma50 = calculateSMA(closes, 50);
  const sma200 = calculateSMA(closes, 200);
  const atr14 = calculateATR(highs, lows, closes, 14);
  const lastIndex = daily.length - 1;
  const previousIndex = Math.max(0, lastIndex - 1);

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

  const latestBenchmarkIndex = benchmark.length >= 50 ? benchmarkIndexFor(daily[lastIndex].timestamp) : -1;
  const benchmarkBearishAt = (index: number) => index >= 49
    && (benchmarkSma200[index] ? benchmarkCloses[index] < benchmarkSma200[index] : benchmarkCloses[index] < benchmarkSma50[index])
    && (benchmarkSma200[index] && benchmarkSma50[index] ? benchmarkSma50[index] < benchmarkSma200[index] : true);
  const assetBearishAt = (index: number) => index >= 49
    && (sma200[index] ? closes[index] < sma200[index] : closes[index] < sma50[index])
    && (sma50[index] && sma200[index] ? sma50[index] <= sma200[index] : true);
  const latestBenchmarkBearish = latestBenchmarkIndex >= 49 && benchmarkBearishAt(latestBenchmarkIndex);

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
    const atr = atr14[lastIndex] || (signalPrice * 0.03);
    const risk = customRisk !== undefined ? customRisk : Math.max(Number.isFinite(atr) ? atr * 2.0 : signalPrice * 0.03, signalPrice * 0.005);
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

  const snapshots: StrategyAlertSnapshot[] = [];
  const events: StrategyAlertSnapshot[] = [];

  const dailyCloud = calculateMoneyLineCloud(daily, '1d');

  // --- 1. STRATEGY: MONEYLINE MACRO TREND LONG (Weekly Bull / Confluence + Daily Bull + Price > MAs) ---
  if (daily.length >= 50) {
    const weeklyCloses = weekly.map(candle => candle.close);
    const weeklySma40 = calculateSMA(weeklyCloses, 40);
    const weeklyCloud = weekly.length >= 20 ? calculateMoneyLineCloud(weekly, '1w') : undefined;
    const lastWeeklyIdx = weeklyCloud ? weeklyCloud.dirSlow.length - 1 : -1;

    const isWeeklyBull = lastWeeklyIdx >= 0 && weeklyCloud
      ? (weeklyCloud.dirFast[lastWeeklyIdx] < 0 || weeklyCloud.dirSlow[lastWeeklyIdx] < 0 || (weeklyCloses[lastWeeklyIdx] > (weeklySma40[lastWeeklyIdx] || 0)))
      : true;

    const isDailyBullFast = dailyCloud.dirFast[lastIndex] < 0;
    const isDailyBullSlow = dailyCloud.dirSlow[lastIndex] < 0;
    const isDailyBull = isDailyBullFast || isDailyBullSlow;
    const isDailyBullFlip = dailyCloud.buySignals[lastIndex]
      || (dailyCloud.dirFast[lastIndex] < 0 && dailyCloud.dirFast[previousIndex] > 0)
      || (dailyCloud.dirSlow[lastIndex] < 0 && dailyCloud.dirSlow[previousIndex] > 0);

    const isAboveSma = closes[lastIndex] > (sma50[lastIndex] || 0)
      || (sma200[lastIndex] ? closes[lastIndex] > sma200[lastIndex] : true)
      || (sma50[lastIndex] && sma200[lastIndex] ? sma50[lastIndex] >= sma200[lastIndex] : true);

    if (isWeeklyBull && isDailyBull && isAboveSma) {
      const cloudSupport = isDailyBullSlow
        ? dailyCloud.lineSlow[lastIndex]
        : (isDailyBullFast ? dailyCloud.lineFast[lastIndex] : closes[lastIndex] - 2.0 * atr14[lastIndex]);
      let stop = Math.max(cloudSupport, closes[lastIndex] - 2.5 * (atr14[lastIndex] || closes[lastIndex] * 0.03));
      if (stop >= closes[lastIndex]) stop = closes[lastIndex] - 2.0 * (atr14[lastIndex] || closes[lastIndex] * 0.03);
      const risk = closes[lastIndex] - stop;
      const maxRiskPercent = marketClass === 'crypto' ? 20 : marketClass === 'metals' ? 12 : 10;

      if (risk > 0 && (risk / closes[lastIndex] * 100) <= maxRiskPercent) {
        const stage: StrategyAlertSnapshot['stage'] = isDailyBullFlip ? 'CONFIRMED' : 'ARMED';
        const snapshot = createSnapshot(
          'MONEYLINE_MACRO_LONG',
          stage,
          'LONG',
          '1d',
          risk,
          stop
        );
        snapshots.push(snapshot);
        if (isDailyBullFlip) events.push(snapshot);
      }
    }
  }

  // --- 2. STRATEGY: MONEYLINE 4H SNIPER CONFLUENCE (Daily Bull + 4H Bull / Flip) ---
  if (candles4h.length >= 30 && daily.length >= 50) {
    const cloud4h = calculateMoneyLineCloud(candles4h, '4h');
    const last4hIdx = candles4h.length - 1;
    const prev4hIdx = Math.max(0, last4hIdx - 1);

    const isDailyBull = dailyCloud.dirFast[lastIndex] < 0
      || dailyCloud.dirSlow[lastIndex] < 0
      || closes[lastIndex] > (sma50[lastIndex] || 0);

    const is4hBullFast = cloud4h.dirFast[last4hIdx] < 0;
    const is4hBullSlow = cloud4h.dirSlow[last4hIdx] < 0;
    const is4hBull = is4hBullFast || is4hBullSlow;
    const is4hBullFlip = cloud4h.buySignals[last4hIdx]
      || (cloud4h.dirFast[last4hIdx] < 0 && cloud4h.dirFast[prev4hIdx] > 0)
      || (cloud4h.dirSlow[last4hIdx] < 0 && cloud4h.dirSlow[prev4hIdx] > 0);

    const c4hClose = candles4h[last4hIdx].close;
    const atr4h = atr14[lastIndex] ? atr14[lastIndex] * 0.5 : c4hClose * 0.03;

    if (isDailyBull && is4hBull) {
      const cloud4hSupport = is4hBullSlow
        ? cloud4h.lineSlow[last4hIdx]
        : (is4hBullFast ? cloud4h.lineFast[last4hIdx] : c4hClose * 0.96);
      let stop4h = Math.max(cloud4hSupport, c4hClose - 2.5 * atr4h);
      if (stop4h >= c4hClose) stop4h = c4hClose - 2.0 * atr4h;
      const risk4h = c4hClose - stop4h;
      const maxRiskPercent4h = marketClass === 'crypto' ? 15 : marketClass === 'metals' ? 8 : 6;

      if (risk4h > 0 && (risk4h / c4hClose * 100) <= maxRiskPercent4h) {
        const stage: StrategyAlertSnapshot['stage'] = is4hBullFlip ? 'CONFIRMED' : 'ARMED';
        const snapshot = createSnapshot(
          'MONEYLINE_4H_SNIPER_LONG',
          stage,
          'LONG',
          '4h',
          risk4h,
          stop4h,
          undefined,
          c4hClose,
          candles4h[last4hIdx].timestamp
        );
        snapshots.push(snapshot);
        if (is4hBullFlip) events.push(snapshot);
      }
    }
  }

  // --- 3. STRATEGY: WEEKLY TREND + DONCHIAN 55/20 LONG ---
  // Evaluates Weekly Trend + Donchian 55/20 across stocks, crypto and metals.
  // A near-breakout state is ARMED; execution is CONFIRMED only by a fresh Daily close above Donchian High 55.
  if (daily.length >= 60 && weekly.length >= 25) {
    const weeklyCloses = weekly.map(candle => candle.close);
    const weeklySma40 = calculateSMA(weeklyCloses, 40);
    const weeklyCloud = calculateMoneyLineCloud(weekly, '1w');
    const weeklyIndex = weekly.length - 1;
    const weeklyBullish = (weeklyCloud.dirFast[weeklyIndex] < 0 || weeklyCloud.dirSlow[weeklyIndex] < 0 || (weeklyCloses[weeklyIndex] > (weeklySma40[weeklyIndex] || 0)))
      && (weeklyIndex < 8 || (weeklySma40[weeklyIndex] || 0) >= (weeklySma40[Math.max(0, weeklyIndex - 8)] || 0) * 0.98);

    const broadDailyTrend = closes[lastIndex] > (sma50[lastIndex] || 0)
      && (sma200[lastIndex] ? closes[lastIndex] > sma200[lastIndex] || (sma50[lastIndex] || 0) >= (sma200[lastIndex] || 0) : true);

    const lookback55 = Math.min(55, Math.max(20, lastIndex - 1));
    const previousHigh55 = Math.max(...daily.slice(Math.max(0, lastIndex - lookback55), lastIndex).map(candle => candle.high));
    const previousHigh55AtPriorClose = Math.max(...daily.slice(Math.max(0, previousIndex - lookback55), previousIndex).map(candle => candle.high));
    const freshBreakout = closes[lastIndex] > previousHigh55
      && closes[previousIndex] <= previousHigh55AtPriorClose;
    const distanceToBreakout = previousHigh55 - closes[lastIndex];
    const nearBreakout = distanceToBreakout >= 0 && distanceToBreakout <= 1.5 * (atr14[lastIndex] || closes[lastIndex] * 0.03);
    const previousDistance = previousHigh55AtPriorClose - closes[previousIndex];
    const freshArm = nearBreakout && (previousDistance < 0 || previousDistance > (atr14[previousIndex] || closes[previousIndex] * 0.03));
    const dailyFastBullish = dailyCloud.dirFast[lastIndex] < 0 || dailyCloud.dirSlow[lastIndex] < 0 || closes[lastIndex] > (sma50[lastIndex] || 0);

    const momentumWindow = Math.min(252, Math.max(50, lastIndex));
    const positiveMomentum = closes[lastIndex] >= (closes[Math.max(0, lastIndex - momentumWindow)] || 0) * 0.95;

    const currentAtrPercent = ((atr14[lastIndex] || closes[lastIndex] * 0.03) / closes[lastIndex]) * 100;
    const atrHistory = daily.slice(Math.max(0, lastIndex - momentumWindow), lastIndex).map((candle, offset) => {
      const sourceIndex = Math.max(0, lastIndex - momentumWindow) + offset;
      return ((atr14[sourceIndex] || candle.close * 0.03) / candle.close) * 100;
    });
    const atrRank = percentileRank(atrHistory, currentAtrPercent);
    const controlledVolatility = atrRank <= (marketClass === 'crypto' ? 0.85 : 0.80);

    if (weeklyBullish && broadDailyTrend && positiveMomentum && controlledVolatility && dailyFastBullish
      && (freshBreakout || nearBreakout)) {
      const structuralStop = Math.min(daily[previousIndex].low, daily[lastIndex].low) - 0.1 * (atr14[lastIndex] || closes[lastIndex] * 0.02);
      const volatilityStop = closes[lastIndex] - 2.5 * (atr14[lastIndex] || closes[lastIndex] * 0.03);
      let stop = Math.max(structuralStop, volatilityStop);
      if (stop >= closes[lastIndex]) stop = closes[lastIndex] - 2.0 * (atr14[lastIndex] || closes[lastIndex] * 0.03);
      const risk = closes[lastIndex] - stop;
      const riskPercent = (risk / closes[lastIndex]) * 100;
      const maxRiskPercent = marketClass === 'crypto' ? 15 : marketClass === 'metals' ? 10 : 8;

      if (risk > 0 && riskPercent <= maxRiskPercent) {
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
          donchianLow20: roundPrice(Math.min(...daily.slice(Math.max(0, lastIndex - 19), lastIndex + 1).map(candle => candle.low))),
          weeklySma40: roundPrice(weeklySma40[weeklyIndex] || 0),
          weeklySma40EightWeeksAgo: roundPrice(weeklySma40[Math.max(0, weeklyIndex - 8)] || 0),
          weeklyFastBullish: true,
          weeklySlowBullish: true,
          atrPercentile: Number((atrRank * 100).toFixed(1)),
          momentum252Percent: Number(((closes[lastIndex] / (closes[Math.max(0, lastIndex - momentumWindow)] || 1) - 1) * 100).toFixed(2)),
          distanceToBreakoutPercent: Number((Math.max(0, distanceToBreakout) / closes[lastIndex] * 100).toFixed(2)),
          maxRiskPercent
        };
        snapshots.push(snapshot);
        if (freshBreakout || freshArm) events.push(snapshot);
      }
    }
  }

  // --- 4. STRATEGY: BEAR RALLY FADE SHORT (Arm > 90 -> Confirm < 50 in 3 bars) ---
  if ((marketClass === 'crypto' || marketClass === 'stocks') && (latestBenchmarkIndex >= 49 || !latestBenchmarkBearish)) {
    let armedIndex = -1;
    for (let index = lastIndex; index >= Math.max(49, lastIndex - 3); index--) {
      const crossedAbove90 = (rsi2[index] || 0) > 90 && (rsi2[index - 1] || 0) <= 90;
      if (crossedAbove90 && assetBearishAt(index)) {
        armedIndex = index;
        break;
      }
    }

    if (armedIndex >= 0 && assetBearishAt(lastIndex)) {
      const barsSinceArm = lastIndex - armedIndex;
      const confirmed = barsSinceArm >= 1 && barsSinceArm <= 3
        && (rsi2[previousIndex] || 0) >= 50 && (rsi2[lastIndex] || 0) < 50;

      const shortStop = Math.max(highs[lastIndex], highs[previousIndex]) + (atr14[lastIndex] || closes[lastIndex] * 0.03);
      const shortRisk = shortStop - closes[lastIndex];

      if (confirmed) {
        const snapshot = createSnapshot('BEAR_RALLY_FADE_SHORT', 'CONFIRMED', 'SHORT', '1d', shortRisk, shortStop, armedIndex);
        events.push(snapshot);
        snapshots.push(snapshot);
      } else if (barsSinceArm <= 3 && (rsi2[lastIndex] || 0) >= 50) {
        const snapshot = createSnapshot('BEAR_RALLY_FADE_SHORT', 'ARMED', 'SHORT', '1d', shortRisk, shortStop, armedIndex);
        if (barsSinceArm === 0) events.push(snapshot);
        snapshots.push(snapshot);
      }
    }
  }

  const currentSnapshot = snapshots.find(s => s.stage === 'CONFIRMED') || snapshots[0];
  return { current: currentSnapshot, snapshots, events };
};

