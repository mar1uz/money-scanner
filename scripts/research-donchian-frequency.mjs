import {
  DAY_MS,
  aggregateWeeks,
  atr,
  fetchYahoo,
  round,
  sma,
  supertrendDirections,
  weekStart
} from './backtest-tight-risk-breakout.mjs';
import { SHORT_RESEARCH_ASSETS } from './backtest-weekly-donchian-short-50plus.mjs';

const STOCKS = SHORT_RESEARCH_ASSETS.filter(asset => asset.marketClass === 'stocks');
const ENTRY_WINDOWS = [20, 30, 40, 55, 80];
const EXIT_WINDOW = 20;
const ATR_PERCENTILE_LIMIT = 0.70;
const MAX_STOP_PERCENT = 4;
const FEE_PER_SIDE_PERCENT = Number(process.env.FEE_PER_SIDE_PERCENT || 0.075);
const SLIPPAGE_PER_SIDE_PERCENT = Number(process.env.SLIPPAGE_PER_SIDE_PERCENT || 0.05);
const RISK_FRACTION = 0.005;

const percentileRank = (values, current) => {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.filter(value => value <= current).length / finite.length : 1;
};

const prepare = (asset, candles) => {
  const closes = candles.map(candle => candle.close);
  const sma50 = sma(closes, 50);
  const sma200 = sma(closes, 200);
  const atr14 = atr(candles, 14);
  const dailyFast = supertrendDirections(candles, 10, 2.5);
  const weeks = aggregateWeeks(candles);
  return {
    asset,
    candles,
    sma50,
    sma200,
    atr14,
    dailyFast,
    weeks,
    weeklySma40: sma(weeks.map(candle => candle.close), 40),
    weeklyFast: supertrendDirections(weeks, 10, 2.8),
    weeklySlow: supertrendDirections(weeks, 10, 3.8)
  };
};

const weeklyBullishAt = (data, weeklyIndex, requireSlope = true) => weeklyIndex >= 48
  && data.weeklyFast[weeklyIndex] < 0
  && data.weeklySlow[weeklyIndex] < 0
  && data.weeks[weeklyIndex].close > data.weeklySma40[weeklyIndex]
  && (!requireSlope || data.weeklySma40[weeklyIndex] > data.weeklySma40[weeklyIndex - 8]);

const baseFiltersAt = (data, index, weeklyIndex) => {
  if (index < 260 || !weeklyBullishAt(data, weeklyIndex)) return false;
  const { candles, sma50, sma200, atr14, dailyFast } = data;
  const candle = candles[index];
  const dailyTrend = candle.close > sma200[index]
    && sma50[index] > sma200[index]
    && sma50[index] > sma50[index - 20]
    && sma200[index] > sma200[index - 20]
    && dailyFast[index] < 0;
  if (!dailyTrend || candle.close <= candles[index - 252].close) return false;
  const currentAtrPercent = atr14[index] / candle.close * 100;
  const atrHistory = candles.slice(index - 252, index).map((value, offset) => {
    const sourceIndex = index - 252 + offset;
    return atr14[sourceIndex] / value.close * 100;
  });
  return Number.isFinite(atr14[index])
    && atr14[index] > 0
    && percentileRank(atrHistory, currentAtrPercent) <= ATR_PERCENTILE_LIMIT;
};

const run = (data, entryWindow, startTimestamp, endTimestamp, frictionMultiplier = 1) => {
  const { candles, atr14, weeks } = data;
  const fee = FEE_PER_SIDE_PERCENT * frictionMultiplier;
  const slippage = SLIPPAGE_PER_SIDE_PERCENT * frictionMultiplier;
  let capital = 10_000;
  let peak = capital;
  let maxDrawdown = 0;
  let weeklyIndex = -1;
  let pendingEntry;
  let pendingExit;
  let position;
  let signals = 0;
  let rejected = 0;
  const trades = [];

  const closePosition = (rawPrice, candle, reason) => {
    const exitPrice = rawPrice * (1 - slippage / 100);
    const grossPnl = (exitPrice - position.entryPrice) * position.quantity;
    const fees = (position.entryPrice + exitPrice) * position.quantity * fee / 100;
    const netPnl = grossPnl - fees;
    const rMultiple = netPnl / position.initialRiskCash;
    capital += netPnl;
    peak = Math.max(peak, capital);
    maxDrawdown = Math.max(maxDrawdown, (peak - capital) / peak * 100);
    trades.push({
      rMultiple,
      initialRiskPercent: position.initialRiskPercent,
      holdingDays: Math.max(1, Math.round((candle.timestamp - position.entryTimestamp) / DAY_MS)),
      reason
    });
    position = undefined;
    pendingExit = undefined;
  };

  for (let index = 260; index < candles.length; index += 1) {
    const candle = candles[index];
    const currentWeek = weekStart(candle.timestamp);
    while (weeklyIndex + 1 < weeks.length && weeks[weeklyIndex + 1].timestamp < currentWeek) weeklyIndex += 1;
    if (candle.timestamp < startTimestamp || candle.timestamp > endTimestamp) {
      pendingEntry = undefined;
      pendingExit = undefined;
      position = undefined;
      continue;
    }

    if (pendingExit && position) closePosition(candle.open, candle, pendingExit);

    if (pendingEntry && !position) {
      const entryPrice = candle.open * (1 + slippage / 100);
      const gapOk = entryPrice <= pendingEntry.signalClose + pendingEntry.atr;
      const structuralStop = Math.min(...candles.slice(pendingEntry.signalIndex - 1, pendingEntry.signalIndex + 1)
        .map(value => value.low)) - 0.1 * pendingEntry.atr;
      const volatilityStop = entryPrice - 2 * pendingEntry.atr;
      const initialStop = Math.min(structuralStop, volatilityStop);
      const riskPerUnit = entryPrice - initialStop;
      const riskPercent = riskPerUnit / entryPrice * 100;
      if (gapOk && riskPerUnit > 0 && riskPercent <= MAX_STOP_PERCENT) {
        const quantity = Math.min(capital * RISK_FRACTION / riskPerUnit, capital / entryPrice);
        position = {
          entryTimestamp: candle.timestamp,
          entryPrice,
          initialStop,
          activeStop: initialStop,
          initialRiskPercent: riskPercent,
          initialRiskCash: riskPerUnit * quantity,
          quantity
        };
      } else rejected += 1;
      pendingEntry = undefined;
    }

    if (position) {
      if (candle.low <= position.activeStop) {
        closePosition(Math.min(candle.open, position.activeStop), candle, 'StopLoss');
      } else {
        const donchianLow = Math.min(...candles.slice(Math.max(0, index - EXIT_WINDOW + 1), index + 1)
          .map(value => value.low));
        position.activeStop = Math.max(position.activeStop, donchianLow);
        if (!weeklyBullishAt(data, weeklyIndex, false)) pendingExit = 'WeeklyTrendInvalidation';
      }
    }

    if (!position && !pendingEntry && baseFiltersAt(data, index, weeklyIndex)) {
      const previousHigh = Math.max(...candles.slice(index - entryWindow, index).map(value => value.high));
      if (candle.close > previousHigh) {
        signals += 1;
        pendingEntry = {
          signalIndex: index,
          signalClose: candle.close,
          atr: atr14[index]
        };
      }
    }

    if ((index === candles.length - 1 || candle.timestamp === endTimestamp) && position) {
      closePosition(candle.close, candle, 'EndPeriod');
    }
  }

  if (position) {
    const finalCandle = candles.findLast(candle => candle.timestamp <= endTimestamp) || candles.at(-1);
    closePosition(finalCandle.close, finalCandle, 'EndPeriod');
  }
  return { symbol: data.asset.symbol, signals, rejected, trades, capital, maxDrawdown };
};

const summarize = rows => {
  const trades = rows.flatMap(row => row.trades);
  const winners = trades.filter(trade => trade.rMultiple > 0);
  const losers = trades.filter(trade => trade.rMultiple <= 0);
  const grossWins = winners.reduce((sum, trade) => sum + trade.rMultiple, 0);
  const grossLosses = Math.abs(losers.reduce((sum, trade) => sum + trade.rMultiple, 0));
  const stops = trades.map(trade => trade.initialRiskPercent).sort((left, right) => left - right);
  return {
    assets: rows.length,
    activeAssets: rows.filter(row => row.trades.length).length,
    profitableAssets: rows.filter(row => row.capital > 10_000).length,
    signals: rows.reduce((sum, row) => sum + row.signals, 0),
    rejected: rows.reduce((sum, row) => sum + row.rejected, 0),
    trades: trades.length,
    winRate: trades.length ? round(winners.length / trades.length * 100, 1) : 0,
    profitFactor: grossLosses ? round(grossWins / grossLosses) : grossWins ? 99 : 0,
    expectancyR: trades.length ? round(trades.reduce((sum, trade) => sum + trade.rMultiple, 0) / trades.length) : 0,
    medianStopPercent: stops.length ? round(stops[Math.floor(stops.length / 2)]) : 0,
    averageHoldingDays: trades.length
      ? round(trades.reduce((sum, trade) => sum + trade.holdingDays, 0) / trades.length, 1)
      : 0,
    averageMaxDrawdownPercent: rows.length
      ? round(rows.reduce((sum, row) => sum + row.maxDrawdown, 0) / rows.length)
      : 0
  };
};

const liveCandidates = (datasets, entryWindow) => {
  const buckets = { confirmed: 0, within1Atr: 0, within1_5Atr: 0, within2Atr: 0 };
  const rows = [];
  for (const data of datasets) {
    const index = data.candles.length - 1;
    const currentWeek = weekStart(data.candles[index].timestamp);
    let weeklyIndex = -1;
    while (weeklyIndex + 1 < data.weeks.length && data.weeks[weeklyIndex + 1].timestamp < currentWeek) weeklyIndex += 1;
    if (!baseFiltersAt(data, index, weeklyIndex)) continue;
    const candle = data.candles[index];
    const threshold = Math.max(...data.candles.slice(index - entryWindow, index).map(value => value.high));
    const distanceAtr = Math.max(0, threshold - candle.close) / data.atr14[index];
    const structuralStop = Math.min(data.candles[index - 1].low, candle.low) - 0.1 * data.atr14[index];
    const stop = Math.min(structuralStop, candle.close - 2 * data.atr14[index]);
    const riskPercent = (candle.close - stop) / candle.close * 100;
    if (!(riskPercent > 0 && riskPercent <= MAX_STOP_PERCENT)) continue;
    if (candle.close > threshold) buckets.confirmed += 1;
    else {
      if (distanceAtr <= 1) buckets.within1Atr += 1;
      if (distanceAtr <= 1.5) buckets.within1_5Atr += 1;
      if (distanceAtr <= 2) buckets.within2Atr += 1;
    }
    if (distanceAtr <= 2 || candle.close > threshold) {
      rows.push({ symbol: data.asset.symbol, distanceAtr: round(distanceAtr), riskPercent: round(riskPercent) });
    }
  }
  return { ...buckets, rows: rows.sort((left, right) => left.distanceAtr - right.distanceAtr) };
};

const fetchAll = async () => {
  const datasets = [];
  const failures = [];
  for (let start = 0; start < STOCKS.length; start += 8) {
    const batch = STOCKS.slice(start, start + 8);
    const results = await Promise.allSettled(batch.map(async asset => {
      const candles = await fetchYahoo(asset.providerSymbol);
      if (candles.length < 800) throw new Error(`istoric insuficient: ${candles.length}`);
      return prepare(asset, candles);
    }));
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') datasets.push(result.value);
      else failures.push({ symbol: batch[index].symbol, error: String(result.reason?.message || result.reason) });
    });
  }
  return { datasets, failures };
};

const periodsFor = data => {
  const eligible = data.candles.slice(300);
  const validationStart = eligible[Math.floor(eligible.length * 0.60)].timestamp;
  const finalStart = eligible[Math.floor(eligible.length * 0.80)].timestamp;
  return {
    calibration: [eligible[0].timestamp, data.candles.findLast(candle => candle.timestamp < validationStart).timestamp],
    validation: [validationStart, data.candles.findLast(candle => candle.timestamp < finalStart).timestamp],
    final: [finalStart, eligible.at(-1).timestamp]
  };
};

const evaluate = (datasets, entryWindow, period, frictionMultiplier = 1) => summarize(datasets.map(data => {
  const [start, end] = periodsFor(data)[period];
  return run(data, entryWindow, start, end, frictionMultiplier);
}));

const main = async () => {
  const { datasets, failures } = await fetchAll();
  if (datasets.length < 50) throw new Error(`Doar ${datasets.length} active valide; sunt necesare minimum 50.`);
  const calibration = Object.fromEntries(ENTRY_WINDOWS.map(window => [window, evaluate(datasets, window, 'calibration')]));
  const validation = Object.fromEntries(ENTRY_WINDOWS.map(window => [window, evaluate(datasets, window, 'validation')]));
  // The final segment is reported for the frozen production baseline and each
  // frequency candidate for diagnosis. It must not be used for further tuning.
  const final = Object.fromEntries(ENTRY_WINDOWS.map(window => [window, evaluate(datasets, window, 'final')]));
  const finalDoubleCosts = Object.fromEntries(ENTRY_WINDOWS.map(window => [window, evaluate(datasets, window, 'final', 2)]));
  process.stdout.write(`${JSON.stringify({
    generatedAt: new Date().toISOString(),
    protocol: '63 stocks/ETF requested; 60% calibration, 20% validation, 20% final chronological segment; identical filters/stops/exits; only Donchian entry window changes',
    assumptions: {
      riskPerTradePercent: RISK_FRACTION * 100,
      maximumInitialStopPercent: MAX_STOP_PERCENT,
      atrPercentileLimit: ATR_PERCENTILE_LIMIT * 100,
      feePerSidePercent: FEE_PER_SIDE_PERCENT,
      slippagePerSidePercent: SLIPPAGE_PER_SIDE_PERCENT,
      exitWindow: EXIT_WINDOW,
      sameBarPolicy: 'stop before trailing-stop update'
    },
    assets: datasets.length,
    failures,
    calibration,
    validation,
    final,
    finalDoubleCosts,
    liveCandidateCounts: Object.fromEntries(ENTRY_WINDOWS.map(window => [window, liveCandidates(datasets, window)]))
  }, null, 2)}\n`);
};

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
