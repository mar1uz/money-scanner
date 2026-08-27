import { calculateRSI } from '@money-scanner/money-line';
import { atr, fetchYahoo, round, sma, weekStart } from './backtest-tight-risk-breakout.mjs';
import { SHORT_RESEARCH_ASSETS } from './backtest-weekly-donchian-short-50plus.mjs';
import { getScannerAssets } from '@money-scanner/shared';
import {
  prepareLongDonchianData,
  runLongDonchianVariant,
  summarizeLongDonchianRows
} from './research-donchian-frequency.mjs';

const DEVELOPMENT_ASSETS = SHORT_RESEARCH_ASSETS.filter(asset => asset.marketClass === 'stocks');
const developmentSymbols = new Set(DEVELOPMENT_ASSETS.map(asset => asset.symbol));
const SCANNER_HOLDOUT_ASSETS = getScannerAssets('stocks')
  .filter(asset => !developmentSymbols.has(asset.symbol))
  .map(asset => ({ symbol: asset.symbol, providerSymbol: asset.symbol, marketClass: 'stocks' }));
const SECOND_HOLDOUT_SYMBOLS = [
  'BRK-B', 'DIS', 'CMCSA', 'ABT', 'DHR', 'ACN', 'LIN', 'UPS', 'HON', 'MMM', 'AMGN', 'GILD',
  'CVS', 'CI', 'ELV', 'BKNG', 'MAR', 'RCL', 'F', 'GM', 'DE', 'EMR', 'ETN', 'SO', 'DUK', 'AEP',
  'CSX', 'UNP', 'NSC', 'USB', 'PNC', 'SCHW', 'BLK', 'SPGI', 'ICE', 'CME', 'CB', 'AON', 'APD', 'ECL'
];
const SECOND_HOLDOUT_ASSETS = SECOND_HOLDOUT_SYMBOLS.map(symbol => ({ symbol, providerSymbol: symbol, marketClass: 'stocks' }));

const BASELINE = {
  id: 'BASE_D55_EXIT20_ATR2_STOP4',
  entryWindow: 55,
  exitWindow: 20,
  atrStopMultiple: 2,
  maxStopPercent: 4,
  minimum52WeekHighRatio: 0,
  minimumMomentum252Percent: 0
};

const CANDIDATES = [
  { id: 'RSI5_X50_SMA5_ATR3', armThreshold: 5, confirmation: 'rsi50', exitSma: 5, atrStopMultiple: 3, maxArmBars: 10 },
  { id: 'RSI10_X50_SMA5_ATR3', armThreshold: 10, confirmation: 'rsi50', exitSma: 5, atrStopMultiple: 3, maxArmBars: 10 },
  { id: 'RSI5_X50_SMA10_ATR3', armThreshold: 5, confirmation: 'rsi50', exitSma: 10, atrStopMultiple: 3, maxArmBars: 10 },
  { id: 'RSI10_X50_SMA10_ATR3', armThreshold: 10, confirmation: 'rsi50', exitSma: 10, atrStopMultiple: 3, maxArmBars: 10 },
  { id: 'RSI5_REVERSAL_SMA5_ATR2', armThreshold: 5, confirmation: 'reversal', exitSma: 5, atrStopMultiple: 2, maxArmBars: 10 },
  { id: 'RSI10_REVERSAL_SMA5_ATR2', armThreshold: 10, confirmation: 'reversal', exitSma: 5, atrStopMultiple: 2, maxArmBars: 10 },
  { id: 'RSI5_REVERSAL_SMA10_ATR2', armThreshold: 5, confirmation: 'reversal', exitSma: 10, atrStopMultiple: 2, maxArmBars: 10 },
  { id: 'RSI10_REVERSAL_SMA10_ATR2', armThreshold: 10, confirmation: 'reversal', exitSma: 10, atrStopMultiple: 2, maxArmBars: 10 },
  { id: 'RSI5_X50_TP1_ATR2', armThreshold: 5, confirmation: 'rsi50', targetR: 1, atrStopMultiple: 2, maxArmBars: 10, maxHoldingBars: 10 },
  { id: 'RSI5_X50_TP1_5_ATR2', armThreshold: 5, confirmation: 'rsi50', targetR: 1.5, atrStopMultiple: 2, maxArmBars: 10, maxHoldingBars: 10 },
  { id: 'RSI10_X50_TP1_ATR2', armThreshold: 10, confirmation: 'rsi50', targetR: 1, atrStopMultiple: 2, maxArmBars: 10, maxHoldingBars: 10 },
  { id: 'RSI10_X50_TP1_5_ATR2', armThreshold: 10, confirmation: 'rsi50', targetR: 1.5, atrStopMultiple: 2, maxArmBars: 10, maxHoldingBars: 10 },
  { id: 'RSI5_REVERSAL_TP1_ATR2', armThreshold: 5, confirmation: 'reversal', targetR: 1, atrStopMultiple: 2, maxArmBars: 10, maxHoldingBars: 10 },
  { id: 'RSI5_REVERSAL_TP1_5_ATR2', armThreshold: 5, confirmation: 'reversal', targetR: 1.5, atrStopMultiple: 2, maxArmBars: 10, maxHoldingBars: 10 }
];

const percentileRank = (values, current) => {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.filter(value => value <= current).length / finite.length : 1;
};

const enrich = data => {
  const closes = data.candles.map(candle => candle.close);
  return {
    ...data,
    rsi2: calculateRSI(closes, 2),
    sma5: sma(closes, 5),
    sma10: sma(closes, 10)
  };
};

const weeklyBullishAt = (data, weeklyIndex, requireSlope = true) => weeklyIndex >= 48
  && data.weeklyFast[weeklyIndex] < 0
  && data.weeklySlow[weeklyIndex] < 0
  && data.weeks[weeklyIndex].close > data.weeklySma40[weeklyIndex]
  && (!requireSlope || data.weeklySma40[weeklyIndex] > data.weeklySma40[weeklyIndex - 8]);

const trendFiltersAt = (data, index, weeklyIndex) => {
  if (index < 260 || !weeklyBullishAt(data, weeklyIndex)) return false;
  const { candles, sma50, sma200, atr14, dailyFast } = data;
  const close = candles[index].close;
  if (!(close > sma200[index]
    && sma50[index] > sma200[index]
    && sma50[index] > sma50[index - 20]
    && sma200[index] > sma200[index - 20]
    && dailyFast[index] < 0
    && close > candles[index - 252].close)) return false;
  const atrPercent = atr14[index] / close * 100;
  const history = candles.slice(index - 252, index).map((candle, offset) => {
    const sourceIndex = index - 252 + offset;
    return atr14[sourceIndex] / candle.close * 100;
  });
  return Number.isFinite(atr14[index]) && atr14[index] > 0 && percentileRank(history, atrPercent) <= 0.70;
};

const runCandidate = (data, config, startTimestamp, endTimestamp, frictionMultiplier = 1) => {
  const { candles, atr14, rsi2, sma5, sma10, weeks } = data;
  const fee = 0.075 * frictionMultiplier;
  const slippage = 0.05 * frictionMultiplier;
  const exitAverage = config.exitSma === 10 ? sma10 : config.exitSma === 5 ? sma5 : undefined;
  let capital = 10_000;
  let peak = capital;
  let maxDrawdown = 0;
  let weeklyIndex = -1;
  let armedIndex = -1;
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
      holdingDays: Math.max(1, Math.round((candle.timestamp - position.entryTimestamp) / 86_400_000)),
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
      armedIndex = -1;
      pendingEntry = undefined;
      pendingExit = undefined;
      position = undefined;
      continue;
    }

    if (pendingExit && position) closePosition(candle.open, candle, pendingExit);
    if (pendingEntry && !position) {
      const entryPrice = candle.open * (1 + slippage / 100);
      const gapOk = entryPrice <= pendingEntry.signalClose + pendingEntry.atr;
      const initialStop = entryPrice - config.atrStopMultiple * pendingEntry.atr;
      const riskPerUnit = entryPrice - initialStop;
      const riskPercent = riskPerUnit / entryPrice * 100;
      if (gapOk && initialStop > 0 && riskPercent > 0 && riskPercent <= 8) {
        const quantity = Math.min(capital * 0.005 / riskPerUnit, capital / entryPrice);
        position = {
          entryIndex: index,
          entryTimestamp: candle.timestamp,
          entryPrice,
          initialStop,
          targetPrice: config.targetR ? entryPrice + config.targetR * riskPerUnit : undefined,
          initialRiskPercent: riskPercent,
          initialRiskCash: riskPerUnit * quantity,
          quantity
        };
      } else rejected += 1;
      pendingEntry = undefined;
    }

    if (position) {
      if (candle.low <= position.initialStop) {
        closePosition(Math.min(candle.open, position.initialStop), candle, 'StopLoss');
      } else if (position.targetPrice && candle.high >= position.targetPrice) {
        closePosition(position.targetPrice, candle, `TakeProfit${config.targetR}R`);
      } else if (exitAverage && candle.close > exitAverage[index]) {
        pendingExit = `CloseAboveSMA${config.exitSma}`;
      } else if (config.maxHoldingBars && index - position.entryIndex >= config.maxHoldingBars) {
        pendingExit = `TimeStop${config.maxHoldingBars}`;
      } else if (!weeklyBullishAt(data, weeklyIndex, false)) {
        pendingExit = 'WeeklyTrendInvalidation';
      }
    }

    const filtersValid = trendFiltersAt(data, index, weeklyIndex);
    if (armedIndex >= 0 && (!filtersValid || index - armedIndex > config.maxArmBars)) armedIndex = -1;
    if (!position && !pendingEntry && filtersValid && armedIndex < 0 && rsi2[index] < config.armThreshold) {
      armedIndex = index;
    }

    if (!position && !pendingEntry && armedIndex >= 0 && index > armedIndex && filtersValid) {
      const confirmed = config.confirmation === 'rsi50'
        ? rsi2[index - 1] <= 50 && rsi2[index] > 50
        : candle.close > candles[index - 1].high && candle.close > candle.open;
      if (confirmed) {
        signals += 1;
        pendingEntry = { signalClose: candle.close, atr: atr14[index] };
        armedIndex = -1;
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

const fetchDatasets = async assets => {
  const datasets = [];
  const failures = [];
  for (let start = 0; start < assets.length; start += 8) {
    const batch = assets.slice(start, start + 8);
    const settled = await Promise.allSettled(batch.map(async asset => {
      const candles = await fetchYahoo(asset.providerSymbol);
      if (candles.length < 800) throw new Error(`istoric insuficient: ${candles.length}`);
      return enrich(prepareLongDonchianData(asset, candles));
    }));
    settled.forEach((result, index) => {
      if (result.status === 'fulfilled') datasets.push(result.value);
      else failures.push({ symbol: batch[index].symbol, error: String(result.reason?.message || result.reason) });
    });
  }
  return { datasets, failures };
};

const bounds = (data, startFraction, endFraction) => {
  const eligible = data.candles.slice(300);
  const startIndex = Math.min(eligible.length - 1, Math.floor(eligible.length * startFraction));
  const endIndex = endFraction >= 1 ? eligible.length - 1 : Math.floor(eligible.length * endFraction) - 1;
  return [eligible[startIndex].timestamp, eligible[Math.max(startIndex, endIndex)].timestamp];
};

const evaluateCandidate = (datasets, config, startFraction, endFraction, frictionMultiplier = 1) => {
  const rows = datasets.map(data => {
    const [start, end] = bounds(data, startFraction, endFraction);
    return runCandidate(data, config, start, end, frictionMultiplier);
  });
  return summarizeLongDonchianRows(rows);
};

const evaluateBaseline = (datasets, startFraction, endFraction, frictionMultiplier = 1) => {
  const rows = datasets.map(data => {
    const [start, end] = bounds(data, startFraction, endFraction);
    return runLongDonchianVariant(data, BASELINE, start, end, frictionMultiplier);
  });
  return summarizeLongDonchianRows(rows);
};

const main = async () => {
  const development = await fetchDatasets(DEVELOPMENT_ASSETS);
  const scannerHoldout = await fetchDatasets(SCANNER_HOLDOUT_ASSETS);
  const secondHoldout = await fetchDatasets(SECOND_HOLDOUT_ASSETS);
  if (development.datasets.length < 50 || scannerHoldout.datasets.length < 40 || secondHoldout.datasets.length < 35) {
    throw new Error('Univers insuficient pentru protocolul de validare.');
  }

  const baselineCalibration = evaluateBaseline(development.datasets, 0, 0.6);
  const baselineValidation = evaluateBaseline(development.datasets, 0.6, 0.8);
  const calibration = Object.fromEntries(CANDIDATES.map(config => [config.id, evaluateCandidate(development.datasets, config, 0, 0.6)]));
  const validation = Object.fromEntries(CANDIDATES.map(config => [config.id, evaluateCandidate(development.datasets, config, 0.6, 0.8)]));
  const eligible = CANDIDATES.filter(config => {
    const train = calibration[config.id];
    const test = validation[config.id];
    return train.profitFactor >= 1.15
      && train.expectancyR > 0
      && test.trades >= 60
      && test.winRate >= baselineValidation.winRate + 5
      && test.profitFactor >= 1.2
      && test.expectancyR > 0.05;
  }).sort((left, right) => {
    const leftResult = validation[left.id];
    const rightResult = validation[right.id];
    return (rightResult.winRate + rightResult.profitFactor * 10 + rightResult.expectancyR * 10)
      - (leftResult.winRate + leftResult.profitFactor * 10 + leftResult.expectancyR * 10);
  });
  const selected = eligible[0];
  const finalCandidate = selected ? {
    chronological: evaluateCandidate(development.datasets, selected, 0.8, 1),
    chronologicalDoubleCosts: evaluateCandidate(development.datasets, selected, 0.8, 1, 2),
    scannerHoldoutRecent30: evaluateCandidate(scannerHoldout.datasets, selected, 0.7, 1),
    scannerHoldoutRecent30DoubleCosts: evaluateCandidate(scannerHoldout.datasets, selected, 0.7, 1, 2),
    secondHoldoutRecent30: evaluateCandidate(secondHoldout.datasets, selected, 0.7, 1),
    secondHoldoutRecent30DoubleCosts: evaluateCandidate(secondHoldout.datasets, selected, 0.7, 1, 2)
  } : null;
  const finalBaseline = {
    chronological: evaluateBaseline(development.datasets, 0.8, 1),
    chronologicalDoubleCosts: evaluateBaseline(development.datasets, 0.8, 1, 2),
    scannerHoldoutRecent30: evaluateBaseline(scannerHoldout.datasets, 0.7, 1),
    scannerHoldoutRecent30DoubleCosts: evaluateBaseline(scannerHoldout.datasets, 0.7, 1, 2),
    secondHoldoutRecent30: evaluateBaseline(secondHoldout.datasets, 0.7, 1),
    secondHoldoutRecent30DoubleCosts: evaluateBaseline(secondHoldout.datasets, 0.7, 1, 2)
  };

  process.stdout.write(`${JSON.stringify({
    generatedAt: new Date().toISOString(),
    protocol: 'RSI(2) pullback candidates selected on 63 stocks using 60% calibration + 20% validation; final comparisons use the remaining 20% and recent 30% of two separate symbol universes.',
    developmentAssets: development.datasets.length,
    scannerHoldoutAssets: scannerHoldout.datasets.length,
    secondHoldoutAssets: secondHoldout.datasets.length,
    failures: [...development.failures, ...scannerHoldout.failures, ...secondHoldout.failures],
    baseline: BASELINE,
    candidates: CANDIDATES,
    baselineCalibration,
    baselineValidation,
    calibration,
    validation,
    selectedCandidate: selected?.id || null,
    finalBaseline,
    finalCandidate
  }, null, 2)}\n`);
};

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
