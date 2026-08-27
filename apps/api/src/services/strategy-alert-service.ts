import { Candle, AssetMarketClass, StrategyAlertSnapshot } from '@money-scanner/shared';
import { calculateATR, calculateSMA, calculateMoneyLineCloud } from '@money-scanner/money-line';

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
 * Production strategy scanner.
 *
 * Only the stocks/ETF Weekly Trend + Donchian 55/20 LONG model is enabled
 * here. Experimental models remain available in Backtest Lab, but do not
 * create dashboard or Telegram trade alerts.
 */
export const evaluateDailyStrategyAlerts = (
  symbol: string,
  marketClass: AssetMarketClass,
  candleInput: Candle[],
  _benchmarkInput: Candle[],
  weeklyInput: Candle[] = [],
  _candles4hInput: Candle[] = []
): StrategyAlertEvaluation => {
  if (marketClass !== 'stocks') return { snapshots: [], events: [] };

  const daily = closedCandles(candleInput);
  const weekly = closedCandles(weeklyInput);
  if (daily.length < 261 || weekly.length < 49) return { snapshots: [], events: [] };

  const closes = daily.map(candle => candle.close);
  const highs = daily.map(candle => candle.high);
  const lows = daily.map(candle => candle.low);
  const sma50 = calculateSMA(closes, 50);
  const sma200 = calculateSMA(closes, 200);
  const atr14 = calculateATR(highs, lows, closes, 14);
  const dailyCloud = calculateMoneyLineCloud(daily, '1d');
  const lastIndex = daily.length - 1;
  const previousIndex = lastIndex - 1;

  const weeklyCloses = weekly.map(candle => candle.close);
  const weeklySma40 = calculateSMA(weeklyCloses, 40);
  const weeklyCloud = calculateMoneyLineCloud(weekly, '1w');
  const weeklyIndex = weekly.length - 1;
  const weeklySlopeIndex = weeklyIndex - 8;
  const weeklyBullish = weeklySlopeIndex >= 39
    && weeklyCloud.dirFast[weeklyIndex] < 0
    && weeklyCloud.dirSlow[weeklyIndex] < 0
    && weeklyCloses[weeklyIndex] > weeklySma40[weeklyIndex]
    && weeklySma40[weeklyIndex] > weeklySma40[weeklySlopeIndex];

  const dailyTrend = closes[lastIndex] > sma200[lastIndex]
    && sma50[lastIndex] > sma200[lastIndex]
    && sma50[lastIndex] > sma50[lastIndex - 20]
    && sma200[lastIndex] > sma200[lastIndex - 20]
    && dailyCloud.dirFast[lastIndex] < 0;
  const positiveMomentum = closes[lastIndex] > closes[lastIndex - 252];

  const currentAtr = atr14[lastIndex];
  const currentAtrPercent = currentAtr / closes[lastIndex] * 100;
  const atrHistory = daily.slice(lastIndex - 252, lastIndex).map((candle, offset) => {
    const sourceIndex = lastIndex - 252 + offset;
    return atr14[sourceIndex] / candle.close * 100;
  });
  const atrRank = percentileRank(atrHistory, currentAtrPercent);
  const controlledVolatility = Number.isFinite(currentAtr) && currentAtr > 0 && atrRank <= 0.70;

  const previousHigh55 = Math.max(...daily.slice(lastIndex - 55, lastIndex).map(candle => candle.high));
  const previousHigh55AtPriorClose = Math.max(...daily.slice(previousIndex - 55, previousIndex).map(candle => candle.high));
  const freshBreakout = closes[lastIndex] > previousHigh55
    && closes[previousIndex] <= previousHigh55AtPriorClose;
  const distanceToBreakout = previousHigh55 - closes[lastIndex];
  const nearBreakout = distanceToBreakout >= 0 && distanceToBreakout <= currentAtr;
  const previousDistance = previousHigh55AtPriorClose - closes[previousIndex];
  const freshArm = nearBreakout && (previousDistance < 0 || previousDistance > (atr14[previousIndex] || currentAtr));

  if (!weeklyBullish || !dailyTrend || !positiveMomentum || !controlledVolatility || (!freshBreakout && !nearBreakout)) {
    return { snapshots: [], events: [] };
  }

  // Match the validated backtest: use the wider (lower) of the two-candle
  // structural stop and 2 ATR. Reject the setup instead of tightening its stop.
  const structuralStop = Math.min(daily[previousIndex].low, daily[lastIndex].low) - 0.1 * currentAtr;
  const volatilityStop = closes[lastIndex] - 2 * currentAtr;
  const stopLoss = Math.min(structuralStop, volatilityStop);
  const risk = closes[lastIndex] - stopLoss;
  const riskPercent = risk / closes[lastIndex] * 100;
  if (!(stopLoss > 0 && risk > 0 && riskPercent <= 4)) return { snapshots: [], events: [] };

  const stage: StrategyAlertSnapshot['stage'] = freshBreakout ? 'CONFIRMED' : 'ARMED';
  const signalPrice = closes[lastIndex];
  const snapshot: StrategyAlertSnapshot = {
    id: `${marketClass}:${symbol}:WEEKLY_DONCHIAN_55_LONG:1d`,
    strategy: 'WEEKLY_DONCHIAN_55_LONG',
    stage,
    side: 'LONG',
    symbol,
    marketClass,
    timeframe: '1d',
    candleTimestamp: daily[lastIndex].timestamp,
    armedCandleTimestamp: stage === 'ARMED' ? daily[lastIndex].timestamp : undefined,
    signalPrice: roundPrice(signalPrice),
    entryReference: roundPrice(signalPrice),
    stopLoss: roundPrice(stopLoss),
    target1: roundPrice(signalPrice + risk * 1.5),
    target2: roundPrice(signalPrice + risk * 3),
    riskPercent: Number(riskPercent.toFixed(2)),
    atr14: roundPrice(currentAtr),
    sma50: roundPrice(sma50[lastIndex]),
    sma200: roundPrice(sma200[lastIndex]),
    sma200TwentyDaysAgo: roundPrice(sma200[lastIndex - 20]),
    donchianHigh55: roundPrice(previousHigh55),
    donchianLow20: roundPrice(Math.min(...daily.slice(lastIndex - 19, lastIndex + 1).map(candle => candle.low))),
    weeklySma40: roundPrice(weeklySma40[weeklyIndex]),
    weeklySma40EightWeeksAgo: roundPrice(weeklySma40[weeklySlopeIndex]),
    weeklyFastBullish: weeklyCloud.dirFast[weeklyIndex] < 0,
    weeklySlowBullish: weeklyCloud.dirSlow[weeklyIndex] < 0,
    atrPercentile: Number((atrRank * 100).toFixed(1)),
    momentum252Percent: Number(((closes[lastIndex] / closes[lastIndex - 252] - 1) * 100).toFixed(2)),
    distanceToBreakoutPercent: Number((Math.max(0, distanceToBreakout) / signalPrice * 100).toFixed(2)),
    maxRiskPercent: 4,
    exitRule: 'Intrare numai la următorul open dacă gap-ul este ≤ 1 ATR și riscul rămâne ≤ 4%; apoi trailing Donchian low 20 sau invalidarea regimului Weekly.'
  };

  return {
    current: snapshot,
    snapshots: [snapshot],
    events: freshBreakout || freshArm ? [snapshot] : []
  };
};
