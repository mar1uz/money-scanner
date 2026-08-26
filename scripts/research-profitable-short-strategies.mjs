import { pathToFileURL } from 'node:url';
import {
  DAY_MS,
  aggregateWeeks,
  atr,
  fetchBinance,
  round,
  sma,
  supertrendDirections,
  weekStart
} from './backtest-tight-risk-breakout.mjs';
import { SHORT_RESEARCH_ASSETS } from './backtest-weekly-donchian-short-50plus.mjs';

const STRATEGIES = [
  'rsi2_bear_rally',
  'sma20_failed_rally_2_5r',
  'sma50_failed_rally_3r',
  'three_day_rally_2_5r',
  'bear_flag_breakdown_3r',
  'relative_weak_sma20_2r',
  'relative_weak_sma20_3r',
  'relative_weak_bear_flag_2_5r'
];

const NAMES = {
  rsi2_bear_rally: 'Market Bear + RSI(2) Rally Fade',
  sma20_failed_rally_2_5r: 'Fast+Slow Market Bear + SMA20 Failed Rally + 2.5R',
  sma50_failed_rally_3r: 'Fast+Slow Market Bear + SMA50 Failed Rally + 3R',
  three_day_rally_2_5r: 'Fast+Slow Market Bear + 3-Day Rally Reversal + 2.5R',
  bear_flag_breakdown_3r: 'Fast+Slow Market Bear + Bear Flag Breakdown + 3R'
  ,relative_weak_sma20_2r: 'Relative Weakness + SMA20 Failed Rally + 2R'
  ,relative_weak_sma20_3r: 'Relative Weakness + SMA20 Failed Rally + 3R'
  ,relative_weak_bear_flag_2_5r: 'Relative Weakness + Bear Flag Breakdown + 2.5R'
};

const FEE_PER_SIDE = Number(process.env.FEE_PER_SIDE_PERCENT || 0.075);
const SLIPPAGE_PER_SIDE = Number(process.env.SLIPPAGE_PER_SIDE_PERCENT || 0.05);
const BORROW_APR = Number(process.env.BORROW_APR_PERCENT || 3);
const MAX_STOP_PERCENT = Number(process.env.MAX_STOP_PERCENT || 10);
const RISK_FRACTION = 0.0025;
export const FRESH_STOCK_HOLDOUT = [
  'DIS', 'CMCSA', 'T', 'VZ', 'UPS', 'FDX', 'AMGN', 'GILD', 'BKNG', 'ABNB',
  'NOW', 'PANW', 'MU', 'AMAT', 'LRCX', 'KLAC', 'SCHW', 'BLK', 'AXP', 'USB',
  'BK', 'MDLZ', 'PM', 'MO', 'DE', 'MMM', 'HON', 'ADP', 'ISRG', 'SYK',
  'CVS', 'CI', 'SO', 'DUK', 'NEE', 'PLD', 'AMT', 'EQIX', 'GM', 'F'
].map(symbol => ({ symbol, providerSymbol: symbol, marketClass: 'stocks' }));

export const fetchYahooMaximumHistory = async symbol => {
  const period2 = Math.floor(Date.now() / 1000);
  const response = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=0&period2=${period2}&interval=1d&events=div%2Csplits&includePrePost=false`,
    { headers: { 'User-Agent': 'Mozilla/5.0' } }
  );
  if (!response.ok) throw new Error(`Yahoo HTTP ${response.status}`);
  const result = (await response.json())?.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  const adjusted = result?.indicators?.adjclose?.[0]?.adjclose || [];
  if (!result?.timestamp || !quote) throw new Error('Yahoo nu a returnat lumânări.');
  return result.timestamp.flatMap((timestamp, index) => {
    const rawClose = quote.close?.[index];
    const adjustedClose = adjusted[index];
    const fields = [quote.open?.[index], quote.high?.[index], quote.low?.[index], rawClose];
    if (!fields.every(value => typeof value === 'number' && Number.isFinite(value))) return [];
    const adjustment = typeof adjustedClose === 'number' && rawClose > 0 ? adjustedClose / rawClose : 1;
    return [{
      timestamp: timestamp * 1000,
      open: quote.open[index] * adjustment,
      high: quote.high[index] * adjustment,
      low: quote.low[index] * adjustment,
      close: rawClose * adjustment,
      volume: Number(quote.volume?.[index] || 0),
      isClosed: timestamp * 1000 < Date.now() - DAY_MS
    }];
  }).filter(candle => candle.isClosed);
};

const rsi = (values, period) => {
  const output = new Array(values.length).fill(Number.NaN);
  if (values.length <= period) return output;
  let gain = 0;
  let loss = 0;
  for (let index = 1; index <= period; index += 1) {
    const change = values[index] - values[index - 1];
    gain += Math.max(change, 0);
    loss += Math.max(-change, 0);
  }
  let averageGain = gain / period;
  let averageLoss = loss / period;
  output[period] = averageLoss === 0 ? 100 : 100 - 100 / (1 + averageGain / averageLoss);
  for (let index = period + 1; index < values.length; index += 1) {
    const change = values[index] - values[index - 1];
    averageGain = (averageGain * (period - 1) + Math.max(change, 0)) / period;
    averageLoss = (averageLoss * (period - 1) + Math.max(-change, 0)) / period;
    output[index] = averageLoss === 0 ? 100 : 100 - 100 / (1 + averageGain / averageLoss);
  }
  return output;
};

const percentileRank = (values, current) => {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.filter(value => value <= current).length / finite.length : 1;
};

const prepare = (asset, candles) => {
  const closes = candles.map(candle => candle.close);
  const weeks = aggregateWeeks(candles);
  return {
    asset,
    candles,
    closes,
    sma5: sma(closes, 5),
    sma20: sma(closes, 20),
    sma50: sma(closes, 50),
    sma200: sma(closes, 200),
    atr14: atr(candles, 14),
    rsi2: rsi(closes, 2),
    rsi14: rsi(closes, 14),
    dailyFast: supertrendDirections(candles, 10, 2.5),
    weeks,
    weeklySma40: sma(weeks.map(candle => candle.close), 40),
    weeklyFast: supertrendDirections(weeks, 10, 2.8),
    weeklySlow: supertrendDirections(weeks, 10, 3.8)
  };
};

const latestIndexAtOrBefore = (candles, timestamp) => {
  let low = 0;
  let high = candles.length - 1;
  let answer = -1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (candles[middle].timestamp <= timestamp) {
      answer = middle;
      low = middle + 1;
    } else high = middle - 1;
  }
  return answer;
};

const benchmarkState = (data, timestamp) => {
  const index = latestIndexAtOrBefore(data.candles, timestamp);
  if (index < 260) return { baseBear: false, confirmedBear: false, rebound: true };
  const close = data.candles[index].close;
  const baseBear = close < data.sma200[index]
    && data.sma50[index] < data.sma200[index]
    && data.sma200[index] < data.sma200[index - 20];
  const fastNegative = close < data.closes[index - 21] && close < data.sma20[index];
  const slowNegative = close < data.closes[index - 252];
  return { baseBear, confirmedBear: baseBear && fastNegative && slowNegative, rebound: !fastNegative };
};

const assetBearState = (data, index, weeklyIndex, strictWeekly) => {
  if (index < 260) return false;
  const close = data.candles[index].close;
  const dailyBear = close < data.sma200[index]
    && data.sma50[index] < data.sma200[index]
    && data.sma50[index] < data.sma50[index - 20]
    && data.sma200[index] < data.sma200[index - 20]
    && close < data.closes[index - 252];
  if (!dailyBear || !strictWeekly) return dailyBear;
  return weeklyIndex >= 48
    && data.weeklyFast[weeklyIndex] > 0
    && data.weeklySlow[weeklyIndex] > 0
    && data.weeks[weeklyIndex].close < data.weeklySma40[weeklyIndex]
    && data.weeklySma40[weeklyIndex] < data.weeklySma40[weeklyIndex - 8];
};

const controlledVolatility = (data, index) => {
  const current = data.atr14[index] / data.candles[index].close * 100;
  const history = data.candles.slice(index - 252, index).map((candle, offset) => {
    const sourceIndex = index - 252 + offset;
    return data.atr14[sourceIndex] / candle.close * 100;
  });
  return percentileRank(history, current) <= 0.85;
};

const hasRelativeWeakness = (data, benchmark, index, timestamp) => {
  const benchmarkIndex = latestIndexAtOrBefore(benchmark.candles, timestamp);
  if (index < 63 || benchmarkIndex < 63) return false;
  const assetReturn = data.candles[index].close / data.candles[index - 63].close - 1;
  const benchmarkReturn = benchmark.candles[benchmarkIndex].close / benchmark.candles[benchmarkIndex - 63].close - 1;
  return assetReturn <= benchmarkReturn - 0.05;
};

const statelessSignal = (strategy, data, benchmark, index, weeklyIndex) => {
  const candle = data.candles[index];
  const previous = data.candles[index - 1];
  const market = benchmarkState(benchmark, candle.timestamp);
  if (!assetBearState(data, index, weeklyIndex, true) || !market.confirmedBear || !controlledVolatility(data, index)) {
    return undefined;
  }
  const bearishConfirmation = candle.close < candle.open && candle.close < previous.low;
  const relativeWeak = hasRelativeWeakness(data, benchmark, index, candle.timestamp);

  if (strategy === 'sma20_failed_rally_2_5r') {
    const touched = candle.high >= data.sma20[index] - 0.15 * data.atr14[index];
    if (touched && candle.close < data.sma20[index] && bearishConfirmation && data.rsi14[index - 1] >= 45) {
      return { stopLookback: 5, stopAtr: 1.5, targetR: 2.5, reason: 'SMA20 failed rally' };
    }
  }
  if (strategy === 'sma50_failed_rally_3r') {
    const touched = candle.high >= data.sma50[index] - 0.2 * data.atr14[index];
    if (touched && candle.close < data.sma50[index] && bearishConfirmation && data.rsi14[index - 1] >= 45) {
      return { stopLookback: 8, stopAtr: 2, targetR: 3, reason: 'SMA50 failed rally' };
    }
  }
  if (strategy === 'three_day_rally_2_5r') {
    const rallied = data.candles[index - 1].close > data.candles[index - 2].close
      && data.candles[index - 2].close > data.candles[index - 3].close
      && data.candles[index - 1].close > data.sma20[index - 1];
    if (rallied && bearishConfirmation) {
      return { stopLookback: 5, stopAtr: 1.5, targetR: 2.5, reason: '3-day rally reversal' };
    }
  }
  if (strategy === 'bear_flag_breakdown_3r') {
    const prior = data.candles.slice(index - 6, index);
    const upDays = prior.slice(1).filter((value, offset) => value.close > prior[offset].close).length;
    const range = Math.max(...prior.map(value => value.high)) - Math.min(...prior.map(value => value.low));
    const flag = upDays >= 3 && range <= 4.5 * data.atr14[index - 1];
    const breakdown = candle.close < Math.min(...prior.map(value => value.low));
    if (flag && breakdown && candle.close < candle.open) {
      return { stopLookback: 7, stopAtr: 2, targetR: 3, reason: 'Bear flag breakdown after rally' };
    }
  }
  if (strategy === 'relative_weak_sma20_2r' || strategy === 'relative_weak_sma20_3r') {
    const touched = candle.high >= data.sma20[index] - 0.15 * data.atr14[index];
    if (relativeWeak && touched && candle.close < data.sma20[index] && bearishConfirmation && data.rsi14[index - 1] >= 45) {
      return {
        stopLookback: 5,
        stopAtr: 1.5,
        targetR: strategy === 'relative_weak_sma20_2r' ? 2 : 3,
        reason: 'Relative weakness + SMA20 failed rally'
      };
    }
  }
  if (strategy === 'relative_weak_bear_flag_2_5r') {
    const prior = data.candles.slice(index - 6, index);
    const upDays = prior.slice(1).filter((value, offset) => value.close > prior[offset].close).length;
    const range = Math.max(...prior.map(value => value.high)) - Math.min(...prior.map(value => value.low));
    const flag = upDays >= 3 && range <= 4.5 * data.atr14[index - 1];
    const breakdown = candle.close < Math.min(...prior.map(value => value.low));
    if (relativeWeak && flag && breakdown && candle.close < candle.open) {
      return { stopLookback: 7, stopAtr: 2, targetR: 2.5, reason: 'Relative weakness + bear flag breakdown' };
    }
  }
  return undefined;
};

const run = (strategy, data, benchmark, startTimestamp, endTimestamp) => {
  let capital = 10_000;
  let peak = capital;
  let maxDrawdown = 0;
  let weeklyIndex = -1;
  let armed;
  let pendingEntry;
  let pendingExit;
  let position;
  let signals = 0;
  let rejected = 0;
  const trades = [];

  const closePosition = (rawPrice, candle, reason) => {
    const exitPrice = rawPrice * (1 + SLIPPAGE_PER_SIDE / 100);
    const holdingDays = Math.max(1, Math.round((candle.timestamp - position.entryTimestamp) / DAY_MS));
    const grossPnl = (position.entryPrice - exitPrice) * position.quantity;
    const fees = (position.entryPrice + exitPrice) * position.quantity * FEE_PER_SIDE / 100;
    const financing = position.entryPrice * position.quantity * BORROW_APR / 100 * holdingDays / 365;
    const netPnl = grossPnl - fees - financing;
    const rMultiple = netPnl / position.initialRiskCash;
    capital += netPnl;
    peak = Math.max(peak, capital);
    maxDrawdown = Math.max(maxDrawdown, (peak - capital) / peak * 100);
    trades.push({ rMultiple, holdingDays, initialRiskPercent: position.initialRiskPercent, reason });
    position = undefined;
    pendingExit = undefined;
  };

  for (let index = 260; index < data.candles.length; index += 1) {
    const candle = data.candles[index];
    const currentWeek = weekStart(candle.timestamp);
    while (weeklyIndex + 1 < data.weeks.length && data.weeks[weeklyIndex + 1].timestamp < currentWeek) weeklyIndex += 1;
    if (candle.timestamp < startTimestamp || candle.timestamp > endTimestamp) {
      armed = undefined;
      pendingEntry = undefined;
      pendingExit = undefined;
      position = undefined;
      continue;
    }

    if (pendingExit && position) closePosition(candle.open, candle, pendingExit);
    if (pendingEntry && !position) {
      const entryPrice = candle.open * (1 - SLIPPAGE_PER_SIDE / 100);
      const gapOk = entryPrice >= pendingEntry.signalClose - pendingEntry.atr;
      const start = Math.max(0, pendingEntry.signalIndex - pendingEntry.stopLookback + 1);
      const structuralStop = Math.max(...data.candles.slice(start, pendingEntry.signalIndex + 1).map(value => value.high))
        + 0.1 * pendingEntry.atr;
      const atrStop = entryPrice + pendingEntry.stopAtr * pendingEntry.atr;
      const initialStop = Math.max(structuralStop, atrStop);
      const riskPerUnit = initialStop - entryPrice;
      const riskPercent = riskPerUnit / entryPrice * 100;
      if (gapOk && riskPerUnit > 0 && riskPercent <= MAX_STOP_PERCENT) {
        const quantity = Math.min(capital * RISK_FRACTION / riskPerUnit, capital / entryPrice);
        position = {
          entryTimestamp: candle.timestamp,
          entryPrice,
          initialStop,
          targetPrice: pendingEntry.targetR ? entryPrice - pendingEntry.targetR * riskPerUnit : undefined,
          initialRiskPercent: riskPercent,
          initialRiskCash: riskPerUnit * quantity,
          quantity,
          exitMode: pendingEntry.exitMode,
          barsHeld: 0
        };
      } else rejected += 1;
      pendingEntry = undefined;
    }

    if (position) {
      position.barsHeld += 1;
      if (candle.high >= position.initialStop) {
        closePosition(Math.max(candle.open, position.initialStop), candle, 'StopLoss');
      } else if (position.targetPrice && candle.low <= position.targetPrice) {
        closePosition(position.targetPrice, candle, 'TakeProfit');
      } else {
        const market = benchmarkState(benchmark, candle.timestamp);
        if (position.exitMode === 'sma5' && candle.close < data.sma5[index]) pendingExit = 'SMA5Cover';
        else if (market.rebound || candle.close > data.sma50[index] || position.barsHeld >= 60) {
          pendingExit = market.rebound ? 'BenchmarkRebound' : candle.close > data.sma50[index] ? 'TrendInvalidation' : 'TimeExit60D';
        }
      }
    }

    if (!position && !pendingEntry) {
      let signal;
      if (strategy === 'rsi2_bear_rally') {
        const market = benchmarkState(benchmark, candle.timestamp);
        const regime = assetBearState(data, index, weeklyIndex, false) && market.baseBear;
        const armedNow = regime && data.rsi2[index - 1] <= 95 && data.rsi2[index] > 95;
        if (armedNow) armed = { index, expires: index + 3 };
        if (armed && (index > armed.expires || !regime)) armed = undefined;
        const confirmed = armed && index > armed.index
          && data.rsi2[index - 1] >= 50 && data.rsi2[index] < 50;
        if (confirmed) {
          signal = { stopLookback: 5, stopAtr: 3, exitMode: 'sma5', reason: 'RSI(2) bear rally confirmation' };
          armed = undefined;
        }
      } else signal = statelessSignal(strategy, data, benchmark, index, weeklyIndex);
      if (signal) {
        signals += 1;
        pendingEntry = { ...signal, signalIndex: index, signalClose: candle.close, atr: data.atr14[index] };
      }
    }

    if ((index === data.candles.length - 1 || candle.timestamp === endTimestamp) && position) {
      closePosition(candle.close, candle, 'EndPeriod');
    }
  }
  if (position) {
    const finalCandle = data.candles.findLast(candle => candle.timestamp <= endTimestamp) || data.candles.at(-1);
    closePosition(finalCandle.close, finalCandle, 'EndPeriod');
  }

  const winners = trades.filter(trade => trade.rMultiple > 0);
  const losers = trades.filter(trade => trade.rMultiple <= 0);
  const grossWins = winners.reduce((sum, trade) => sum + trade.rMultiple, 0);
  const grossLosses = Math.abs(losers.reduce((sum, trade) => sum + trade.rMultiple, 0));
  const stops = trades.map(trade => trade.initialRiskPercent).sort((left, right) => left - right);
  return {
    symbol: data.asset.symbol,
    marketClass: data.asset.marketClass,
    periodStart: new Date(startTimestamp).toISOString().slice(0, 10),
    periodEnd: new Date(endTimestamp).toISOString().slice(0, 10),
    signals,
    rejected,
    trades: trades.length,
    wins: winners.length,
    winRate: trades.length ? round(winners.length / trades.length * 100, 1) : 0,
    profitFactor: grossLosses ? round(grossWins / grossLosses) : grossWins ? 99 : 0,
    expectancyR: trades.length ? round(trades.reduce((sum, trade) => sum + trade.rMultiple, 0) / trades.length) : 0,
    returnPercent: round((capital / 10_000 - 1) * 100),
    maxDrawdownPercent: round(maxDrawdown),
    medianStopPercent: stops.length ? round(stops[Math.floor(stops.length / 2)]) : 0,
    tradeLog: trades
  };
};

const summarizeScope = rows => {
  const trades = rows.flatMap(row => row.tradeLog);
  const winners = trades.filter(trade => trade.rMultiple > 0);
  const losers = trades.filter(trade => trade.rMultiple <= 0);
  const grossWins = winners.reduce((sum, trade) => sum + trade.rMultiple, 0);
  const grossLosses = Math.abs(losers.reduce((sum, trade) => sum + trade.rMultiple, 0));
  const stops = trades.map(trade => trade.initialRiskPercent).sort((left, right) => left - right);
  return {
    assets: rows.length,
    activeAssets: rows.filter(row => row.trades).length,
    profitableAssets: rows.filter(row => row.returnPercent > 0).length,
    signals: rows.reduce((sum, row) => sum + row.signals, 0),
    rejected: rows.reduce((sum, row) => sum + row.rejected, 0),
    trades: trades.length,
    winRate: trades.length ? round(winners.length / trades.length * 100, 1) : 0,
    profitFactor: grossLosses ? round(grossWins / grossLosses) : grossWins ? 99 : 0,
    expectancyR: trades.length ? round(trades.reduce((sum, trade) => sum + trade.rMultiple, 0) / trades.length) : 0,
    medianStopPercent: stops.length ? round(stops[Math.floor(stops.length / 2)]) : 0,
    averageReturnPercent: rows.length ? round(rows.reduce((sum, row) => sum + row.returnPercent, 0) / rows.length) : 0,
    averageMaxDrawdownPercent: rows.length ? round(rows.reduce((sum, row) => sum + row.maxDrawdownPercent, 0) / rows.length) : 0
  };
};

const summarize = rows => ({
  all: summarizeScope(rows),
  byClass: Object.fromEntries(['stocks', 'crypto', 'metals'].map(marketClass => [
    marketClass,
    summarizeScope(rows.filter(row => row.marketClass === marketClass))
  ]))
});

const fetchAll = async assets => {
  const datasets = [];
  const failures = [];
  for (let start = 0; start < assets.length; start += 8) {
    const batch = assets.slice(start, start + 8);
    const results = await Promise.allSettled(batch.map(async asset => {
      const candles = asset.marketClass === 'crypto'
        ? await fetchBinance(asset.providerSymbol)
        : await fetchYahooMaximumHistory(asset.providerSymbol);
      if (candles.length < 600) throw new Error(`istoric insuficient: ${candles.length}`);
      return prepare(asset, candles);
    }));
    results.forEach((result, index) => result.status === 'fulfilled'
      ? datasets.push(result.value)
      : failures.push({ symbol: batch[index].symbol, error: String(result.reason?.message || result.reason) }));
  }
  return { datasets, failures };
};

const main = async () => {
  const phase = process.env.PHASE || 'calibration';
  const freshHoldout = phase === 'fresh';
  const fetchAssets = freshHoldout
    ? [SHORT_RESEARCH_ASSETS.find(asset => asset.symbol === 'SPY' && asset.marketClass === 'stocks'), ...FRESH_STOCK_HOLDOUT]
    : SHORT_RESEARCH_ASSETS;
  const { datasets, failures } = await fetchAll(fetchAssets);
  const lookup = new Map(datasets.map(data => [`${data.asset.marketClass}:${data.asset.symbol}`, data]));
  const selected = process.env.CANDIDATE;
  const candidates = phase === 'final' || freshHoldout ? STRATEGIES.filter(value => value === selected) : STRATEGIES;
  if (!candidates.length) throw new Error('CANDIDATE valid este obligatoriu pentru faza finală/fresh.');
  const results = candidates.map(strategy => {
    const evaluationDatasets = freshHoldout
      ? datasets.filter(data => data.asset.symbol !== 'SPY')
      : datasets;
    const rows = evaluationDatasets.map(data => {
      const benchmark = data.asset.marketClass === 'crypto'
        ? lookup.get('crypto:BTC')
        : lookup.get('stocks:SPY');
      const eligible = data.candles.slice(300);
      const split60 = eligible[Math.floor(eligible.length * 0.6)].timestamp;
      const split80 = eligible[Math.floor(eligible.length * 0.8)].timestamp;
      const startTimestamp = freshHoldout ? eligible[0].timestamp
        : phase === 'calibration' ? eligible[0].timestamp : phase === 'validation' ? split60 : split80;
      const endTimestamp = freshHoldout ? eligible.at(-1).timestamp
        : phase === 'calibration'
        ? data.candles.findLast(candle => candle.timestamp < split60).timestamp
        : phase === 'validation'
          ? data.candles.findLast(candle => candle.timestamp < split80).timestamp
          : eligible.at(-1).timestamp;
      return run(strategy, data, benchmark, startTimestamp, endTimestamp);
    });
    return {
      strategy,
      name: NAMES[strategy],
      summary: summarize(rows),
      rows: rows.map(({ tradeLog, ...row }) => row)
    };
  });
  process.stdout.write(`${JSON.stringify({
    generatedAt: new Date().toISOString(),
    phase,
    assumptions: {
      assets: datasets.length,
      riskPerTradePercent: RISK_FRACTION * 100,
      maximumStopPercent: MAX_STOP_PERCENT,
      feePerSidePercent: FEE_PER_SIDE,
      slippagePerSidePercent: SLIPPAGE_PER_SIDE,
      annualBorrowOrFundingPercent: BORROW_APR,
      protocol: freshHoldout
        ? 'cross-sectional holdout: full available history of previously unused assets'
        : '60% calibration / 20% validation / locked 20% final'
    },
    failures,
    results
  }, null, 2)}\n`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
