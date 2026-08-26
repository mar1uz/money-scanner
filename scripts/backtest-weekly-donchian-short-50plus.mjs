import { pathToFileURL } from 'node:url';
import {
  DAY_MS,
  aggregateWeeks,
  atr,
  fetchBinance,
  fetchYahoo,
  round,
  sma,
  supertrendDirections,
  weekStart
} from './backtest-tight-risk-breakout.mjs';

const STOCKS = [
  'SPY', 'QQQ', 'IWM', 'DIA', 'XLK', 'XLF', 'XLE', 'XLV', 'XLI', 'XLP', 'XLY', 'XLU',
  'AAPL', 'MSFT', 'NVDA', 'META', 'AMZN', 'GOOGL', 'TSLA', 'AMD', 'AVGO', 'JPM', 'V', 'MA',
  'COST', 'WMT', 'LLY', 'XOM', 'NFLX', 'DELL', 'CRM', 'ORCL', 'ADBE', 'CSCO', 'INTC', 'QCOM',
  'TXN', 'IBM', 'UNH', 'JNJ', 'PFE', 'MRK', 'ABBV', 'TMO', 'HD', 'LOW', 'NKE', 'MCD',
  'SBUX', 'CAT', 'BA', 'GE', 'RTX', 'LMT', 'CVX', 'COP', 'GS', 'BAC', 'MS', 'C', 'KO', 'PEP', 'PG'
].map(symbol => ({ symbol, providerSymbol: symbol, marketClass: 'stocks' }));

const CRYPTO = [
  'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'LINK', 'AVAX', 'LTC',
  'DOT', 'TRX', 'BCH', 'XLM', 'UNI', 'ATOM', 'ETC', 'NEAR', 'AAVE', 'FIL'
].map(symbol => ({ symbol, providerSymbol: symbol, marketClass: 'crypto' }));

const METALS = [
  { symbol: 'XAU', providerSymbol: 'GC=F', marketClass: 'metals' },
  { symbol: 'XAG', providerSymbol: 'SI=F', marketClass: 'metals' },
  { symbol: 'COPPER', providerSymbol: 'HG=F', marketClass: 'metals' }
];

export const SHORT_RESEARCH_ASSETS = [...STOCKS, ...CRYPTO, ...METALS];
const FEE_PER_SIDE = Number(process.env.FEE_PER_SIDE_PERCENT || 0.075);
const SLIPPAGE_PER_SIDE = Number(process.env.SLIPPAGE_PER_SIDE_PERCENT || 0.05);
const BORROW_APR = Number(process.env.BORROW_APR_PERCENT || 0);
const MAX_STOP_PERCENT = Number(process.env.MAX_STOP_PERCENT || 4);
const RISK_FRACTION = 0.0025;

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
  const weeklySma40 = sma(weeks.map(candle => candle.close), 40);
  const weeklyFast = supertrendDirections(weeks, 10, 2.8);
  const weeklySlow = supertrendDirections(weeks, 10, 3.8);
  return {
    asset,
    candles,
    sma50,
    sma200,
    atr14,
    dailyFast,
    weeks,
    weeklySma40,
    weeklyFast,
    weeklySlow
  };
};

const weeklyBearishAt = (data, weeklyIndex, requireSlope = true) => weeklyIndex >= 48
  && data.weeklyFast[weeklyIndex] > 0
  && data.weeklySlow[weeklyIndex] > 0
  && data.weeks[weeklyIndex].close < data.weeklySma40[weeklyIndex]
  && (!requireSlope || data.weeklySma40[weeklyIndex] < data.weeklySma40[weeklyIndex - 8]);

const detectSignal = (data, index, weeklyIndex) => {
  const { candles, sma50, sma200, atr14, dailyFast } = data;
  if (index < 260 || !weeklyBearishAt(data, weeklyIndex)) return undefined;
  const candle = candles[index];
  const dailyBearish = candle.close < sma200[index]
    && sma50[index] < sma200[index]
    && sma50[index] < sma50[index - 20]
    && sma200[index] < sma200[index - 20];
  if (!dailyBearish || dailyFast[index] <= 0 || candle.close >= candles[index - 252].close) return undefined;

  const atrPercent = atr14[index] / candle.close * 100;
  const atrHistory = candles.slice(index - 252, index).map((value, offset) => {
    const sourceIndex = index - 252 + offset;
    return atr14[sourceIndex] / value.close * 100;
  });
  const controlledVolatility = percentileRank(atrHistory, atrPercent) <= 0.7;
  const previousLow55 = Math.min(...candles.slice(index - 55, index).map(value => value.low));
  if (!controlledVolatility || candle.close >= previousLow55) return undefined;
  return {
    signalIndex: index,
    signalClose: candle.close,
    atr: atr14[index],
    reason: 'Weekly bearish + Daily Donchian 55 breakdown'
  };
};

const run = (data, startTimestamp, endTimestamp) => {
  const { asset, candles, atr14, weeks } = data;
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
    const exitPrice = rawPrice * (1 + SLIPPAGE_PER_SIDE / 100);
    const holdingDays = Math.max(1, Math.round((candle.timestamp - position.entryTimestamp) / DAY_MS));
    const grossPnl = (position.entryPrice - exitPrice) * position.quantity;
    const fees = (position.entryPrice + exitPrice) * position.quantity * FEE_PER_SIDE / 100;
    const borrow = position.entryPrice * position.quantity * BORROW_APR / 100 * holdingDays / 365;
    const netPnl = grossPnl - fees - borrow;
    const rMultiple = netPnl / position.initialRiskCash;
    capital += netPnl;
    peak = Math.max(peak, capital);
    maxDrawdown = Math.max(maxDrawdown, (peak - capital) / peak * 100);
    trades.push({
      entryTimestamp: position.entryTimestamp,
      exitTimestamp: candle.timestamp,
      initialRiskPercent: position.initialRiskPercent,
      holdingDays,
      rMultiple,
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
      const entryPrice = candle.open * (1 - SLIPPAGE_PER_SIDE / 100);
      const gapOk = entryPrice >= pendingEntry.signalClose - pendingEntry.atr;
      const sourceStart = Math.max(0, pendingEntry.signalIndex - 1);
      const structuralStop = Math.max(...candles.slice(sourceStart, pendingEntry.signalIndex + 1).map(value => value.high))
        + 0.1 * pendingEntry.atr;
      const atrStop = entryPrice + 2 * pendingEntry.atr;
      const initialStop = Math.max(structuralStop, atrStop);
      const riskPerUnit = initialStop - entryPrice;
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
      if (candle.high >= position.activeStop) {
        closePosition(Math.max(candle.open, position.activeStop), candle, 'StopLoss');
      } else {
        const donchianHigh20 = Math.max(...candles.slice(Math.max(0, index - 19), index + 1).map(value => value.high));
        position.activeStop = Math.min(position.activeStop, donchianHigh20);
        if (!weeklyBearishAt(data, weeklyIndex, false)) pendingExit = 'WeeklyTrendInvalidation';
      }
    }

    if (!position && !pendingEntry) {
      const signal = detectSignal(data, index, weeklyIndex);
      if (signal) {
        signals += 1;
        pendingEntry = signal;
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

  const winners = trades.filter(trade => trade.rMultiple > 0);
  const losers = trades.filter(trade => trade.rMultiple <= 0);
  const grossWins = winners.reduce((sum, trade) => sum + trade.rMultiple, 0);
  const grossLosses = Math.abs(losers.reduce((sum, trade) => sum + trade.rMultiple, 0));
  const stops = trades.map(trade => trade.initialRiskPercent).sort((left, right) => left - right);
  return {
    symbol: asset.symbol,
    marketClass: asset.marketClass,
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
    averageHoldingDays: trades.length
      ? round(trades.reduce((sum, trade) => sum + trade.holdingDays, 0) / trades.length, 1)
      : 0,
    tradeLog: trades
  };
};

const scope = rows => {
  const trades = rows.flatMap(row => row.tradeLog);
  const winners = trades.filter(trade => trade.rMultiple > 0);
  const losers = trades.filter(trade => trade.rMultiple <= 0);
  const grossWins = winners.reduce((sum, trade) => sum + trade.rMultiple, 0);
  const grossLosses = Math.abs(losers.reduce((sum, trade) => sum + trade.rMultiple, 0));
  const stops = trades.map(trade => trade.initialRiskPercent).sort((left, right) => left - right);
  return {
    assets: rows.length,
    activeAssets: rows.filter(row => row.trades > 0).length,
    profitableAssets: rows.filter(row => row.returnPercent > 0).length,
    signals: rows.reduce((sum, row) => sum + row.signals, 0),
    rejected: rows.reduce((sum, row) => sum + row.rejected, 0),
    trades: trades.length,
    winRate: trades.length ? round(winners.length / trades.length * 100, 1) : 0,
    profitFactor: grossLosses ? round(grossWins / grossLosses) : grossWins ? 99 : 0,
    expectancyR: trades.length ? round(trades.reduce((sum, trade) => sum + trade.rMultiple, 0) / trades.length) : 0,
    medianStopPercent: stops.length ? round(stops[Math.floor(stops.length / 2)]) : 0,
    averageReturnPercent: rows.length ? round(rows.reduce((sum, row) => sum + row.returnPercent, 0) / rows.length) : 0,
    averageMaxDrawdownPercent: rows.length
      ? round(rows.reduce((sum, row) => sum + row.maxDrawdownPercent, 0) / rows.length)
      : 0
  };
};

const summarize = rows => ({
  all: scope(rows),
  byClass: Object.fromEntries(['stocks', 'crypto', 'metals'].map(marketClass => [
    marketClass,
    scope(rows.filter(row => row.marketClass === marketClass))
  ]))
});

const fetchAsset = async asset => {
  const candles = asset.marketClass === 'crypto'
    ? await fetchBinance(asset.providerSymbol)
    : await fetchYahoo(asset.providerSymbol);
  if (candles.length < 600) throw new Error(`istoric insuficient: ${candles.length} lumânări`);
  return prepare(asset, candles);
};

const fetchAll = async () => {
  const datasets = [];
  const failures = [];
  const batchSize = 8;
  for (let start = 0; start < SHORT_RESEARCH_ASSETS.length; start += batchSize) {
    const batch = SHORT_RESEARCH_ASSETS.slice(start, start + batchSize);
    const results = await Promise.allSettled(batch.map(fetchAsset));
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') datasets.push(result.value);
      else failures.push({ symbol: batch[index].symbol, error: String(result.reason?.message || result.reason) });
    });
  }
  return { datasets, failures };
};

const main = async () => {
  const { datasets, failures } = await fetchAll();
  if (datasets.length < 50) throw new Error(`Doar ${datasets.length} active valide; sunt necesare minimum 50.`);
  const inSampleRows = [];
  const holdoutRows = [];
  for (const data of datasets) {
    const eligible = data.candles.slice(300);
    const split = eligible[Math.floor(eligible.length * 0.7)].timestamp;
    const inSampleEnd = data.candles.findLast(candle => candle.timestamp < split).timestamp;
    inSampleRows.push(run(data, eligible[0].timestamp, inSampleEnd));
    holdoutRows.push(run(data, split, eligible.at(-1).timestamp));
  }
  process.stdout.write(`${JSON.stringify({
    generatedAt: new Date().toISOString(),
    strategy: 'WEEKLY_TREND_DONCHIAN_55_20_SHORT',
    assumptions: {
      direction: 'SHORT_ONLY',
      testedAssets: datasets.length,
      requestedAssets: SHORT_RESEARCH_ASSETS.length,
      riskPerTradePercent: RISK_FRACTION * 100,
      maximumInitialStopPercent: MAX_STOP_PERCENT,
      feePerSidePercent: FEE_PER_SIDE,
      slippagePerSidePercent: SLIPPAGE_PER_SIDE,
      annualBorrowPercent: BORROW_APR,
      sameBarPolicy: 'stop evaluated before trailing-stop update',
      protocol: '70% in-sample and final 30% chronological holdout; no parameter tuning'
    },
    failures,
    inSample: { summary: summarize(inSampleRows), rows: inSampleRows.map(({ tradeLog, ...row }) => row) },
    holdout: { summary: summarize(holdoutRows), rows: holdoutRows.map(({ tradeLog, ...row }) => row) }
  }, null, 2)}\n`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
