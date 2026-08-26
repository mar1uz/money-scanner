import { pathToFileURL } from 'node:url';
import {
  ASSETS,
  DAY_MS,
  atr,
  fetchBinance,
  fetchYahoo,
  round,
  sma
} from './backtest-tight-risk-breakout.mjs';

export const CROSS_ASSETS = [
  ...ASSETS,
  { symbol: 'XAU', providerSymbol: 'GC=F', marketClass: 'metals' },
  { symbol: 'XAG', providerSymbol: 'SI=F', marketClass: 'metals' },
  { symbol: 'COPPER', providerSymbol: 'HG=F', marketClass: 'metals' }
];

const STRATEGIES = [
  'monthly_tsmom12',
  'monthly_multi_horizon',
  'donchian55_tsmom',
  'donchian100_tsmom',
  'ema20_100_tsmom'
];

const names = {
  monthly_tsmom12: 'Monthly 12-Month Time-Series Momentum',
  monthly_multi_horizon: 'Monthly 1/3/12-Month Composite Momentum',
  donchian55_tsmom: '12M Momentum + Donchian 55/20',
  donchian100_tsmom: '12M Momentum + Donchian 100/50',
  ema20_100_tsmom: '12M Momentum + EMA20/100 Trend'
};
const MAX_INITIAL_STOP_PERCENT = Number(process.env.MAX_INITIAL_STOP_PERCENT || 8);
const DONCHIAN_STOP_ATR = Number(process.env.DONCHIAN_STOP_ATR || 2);

const ema = (values, period) => {
  const output = new Array(values.length).fill(Number.NaN);
  if (values.length < period) return output;
  let current = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  output[period - 1] = current;
  const multiplier = 2 / (period + 1);
  for (let index = period; index < values.length; index += 1) {
    current = (values[index] - current) * multiplier + current;
    output[index] = current;
  }
  return output;
};

const percentileRank = (values, current) => {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.filter(value => value <= current).length / finite.length : 1;
};

export const prepare = async asset => {
  const candles = asset.marketClass === 'crypto'
    ? await fetchBinance(asset.symbol)
    : await fetchYahoo(asset.providerSymbol || asset.symbol);
  const closes = candles.map(candle => candle.close);
  const atr14 = atr(candles, 14);
  return {
    asset,
    candles,
    closes,
    atr14,
    sma200: sma(closes, 200),
    ema20: ema(closes, 20),
    ema100: ema(closes, 100)
  };
};

const monthKey = timestamp => {
  const date = new Date(timestamp);
  return date.getUTCFullYear() * 12 + date.getUTCMonth();
};

const signalAt = (strategy, data, index) => {
  const { candles, closes, atr14, sma200, ema20, ema100 } = data;
  if (index < 260 || !Number.isFinite(atr14[index])) return undefined;
  const candle = candles[index];
  const next = candles[index + 1];
  const isMonthEnd = !next || monthKey(next.timestamp) !== monthKey(candle.timestamp);
  const momentum1 = candle.close / closes[index - 21] - 1;
  const momentum3 = candle.close / closes[index - 63] - 1;
  const momentum12 = candle.close / closes[index - 252] - 1;
  const atrPercent = atr14[index] / candle.close * 100;
  const atrHistory = candles.slice(index - 252, index).map((value, offset) => {
    const sourceIndex = index - 252 + offset;
    return atr14[sourceIndex] / value.close * 100;
  });
  const controlledVolatility = percentileRank(atrHistory, atrPercent) <= 0.8;

  if (strategy === 'monthly_tsmom12' && isMonthEnd && momentum12 > 0 && controlledVolatility) {
    return { stopAtr: 2.5, trailingAtr: 3, exitMode: 'monthly12', reason: '12M momentum pozitiv la final de lună' };
  }
  if (strategy === 'monthly_multi_horizon' && isMonthEnd) {
    const positiveHorizons = [momentum1, momentum3, momentum12].filter(value => value > 0).length;
    if (positiveHorizons >= 2 && controlledVolatility) {
      return { stopAtr: 2.5, trailingAtr: 3, exitMode: 'monthlyComposite', reason: 'Cel puțin 2 din 1M/3M/12M pozitive' };
    }
  }
  if (strategy === 'donchian55_tsmom') {
    const previousHigh = Math.max(...candles.slice(index - 55, index).map(value => value.high));
    if (momentum12 > 0 && controlledVolatility && candle.close > previousHigh) {
      return { stopAtr: DONCHIAN_STOP_ATR, exitMode: 'donchian20', reason: '12M pozitiv + Donchian 55 breakout' };
    }
  }
  if (strategy === 'donchian100_tsmom') {
    const previousHigh = Math.max(...candles.slice(index - 100, index).map(value => value.high));
    if (momentum12 > 0 && controlledVolatility && candle.close > previousHigh) {
      return { stopAtr: 2.5, exitMode: 'donchian50', reason: '12M pozitiv + Donchian 100 breakout' };
    }
  }
  if (strategy === 'ema20_100_tsmom') {
    const crossed = ema20[index - 1] <= ema100[index - 1] && ema20[index] > ema100[index];
    if (momentum12 > 0 && controlledVolatility && crossed && candle.close > sma200[index]) {
      return { stopAtr: 2.5, trailingAtr: 3, exitMode: 'emaCross', reason: '12M pozitiv + EMA20 cross EMA100' };
    }
  }
  return undefined;
};

const shouldExitAtClose = (position, data, index) => {
  const { candles, closes, ema20, ema100 } = data;
  const candle = candles[index];
  if (position.exitMode === 'monthly12') {
    const next = candles[index + 1];
    const isMonthEnd = !next || monthKey(next.timestamp) !== monthKey(candle.timestamp);
    return isMonthEnd && candle.close <= closes[index - 252];
  }
  if (position.exitMode === 'monthlyComposite') {
    const next = candles[index + 1];
    const isMonthEnd = !next || monthKey(next.timestamp) !== monthKey(candle.timestamp);
    if (!isMonthEnd) return false;
    const returns = [21, 63, 252].map(lookback => candle.close / closes[index - lookback] - 1);
    return returns.filter(value => value > 0).length < 2;
  }
  if (position.exitMode === 'emaCross') return ema20[index] < ema100[index];
  return false;
};

export const run = (strategy, data, startTimestamp, endTimestamp) => {
  const { asset, candles, atr14 } = data;
  const feePerSide = 0.075;
  const slippagePerSide = 0.05;
  const riskFraction = 0.005;
  const maxStopPercent = MAX_INITIAL_STOP_PERCENT;
  let capital = 10_000;
  let peak = capital;
  let maxDrawdown = 0;
  let pendingEntry;
  let pendingExit;
  let position;
  let signals = 0;
  let rejected = 0;
  const trades = [];

  const closePosition = (rawPrice, candle, reason) => {
    const exitPrice = rawPrice * (1 - slippagePerSide / 100);
    const grossPnl = (exitPrice - position.entryPrice) * position.quantity;
    const fees = (position.entryPrice + exitPrice) * position.quantity * feePerSide / 100;
    const netPnl = grossPnl - fees;
    const rMultiple = netPnl / position.initialRiskCash;
    capital += netPnl;
    peak = Math.max(peak, capital);
    maxDrawdown = Math.max(maxDrawdown, (peak - capital) / peak * 100);
    trades.push({
      entryTimestamp: position.entryTimestamp,
      exitTimestamp: candle.timestamp,
      entryPrice: position.entryPrice,
      initialRiskPercent: position.initialRiskPercent,
      rMultiple,
      holdingDays: Math.max(1, Math.round((candle.timestamp - position.entryTimestamp) / DAY_MS)),
      reason,
      entryReason: position.entryReason
    });
    position = undefined;
    pendingExit = undefined;
  };

  for (let index = 260; index < candles.length; index += 1) {
    const candle = candles[index];
    if (candle.timestamp < startTimestamp || candle.timestamp > endTimestamp) {
      pendingEntry = undefined;
      pendingExit = undefined;
      position = undefined;
      continue;
    }
    if (pendingExit && position) closePosition(candle.open, candle, pendingExit);

    if (pendingEntry && !position) {
      const entryPrice = candle.open * (1 + slippagePerSide / 100);
      const gapOk = entryPrice <= pendingEntry.signalClose + pendingEntry.atr;
      const initialStop = entryPrice - pendingEntry.stopAtr * pendingEntry.atr;
      const riskPerUnit = entryPrice - initialStop;
      const riskPercent = riskPerUnit / entryPrice * 100;
      if (gapOk && riskPercent > 0 && riskPercent <= maxStopPercent) {
        const quantity = Math.min(capital * riskFraction / riskPerUnit, capital / entryPrice);
        position = {
          entryTimestamp: candle.timestamp,
          entryPrice,
          initialStop,
          activeStop: initialStop,
          highestClose: candle.close,
          initialRiskPercent: riskPercent,
          initialRiskCash: riskPerUnit * quantity,
          quantity,
          trailingAtr: pendingEntry.trailingAtr,
          exitMode: pendingEntry.exitMode,
          entryReason: pendingEntry.reason
        };
      } else {
        rejected += 1;
      }
      pendingEntry = undefined;
    }

    if (position) {
      if (candle.low <= position.activeStop) {
        closePosition(Math.min(candle.open, position.activeStop), candle, 'StopLoss');
      } else {
        position.highestClose = Math.max(position.highestClose, candle.close);
        if (position.exitMode === 'donchian20' || position.exitMode === 'donchian50') {
          const lookback = position.exitMode === 'donchian20' ? 20 : 50;
          const channelLow = Math.min(...candles.slice(Math.max(0, index - lookback + 1), index + 1).map(value => value.low));
          position.activeStop = Math.max(position.activeStop, channelLow);
        } else if (position.trailingAtr) {
          position.activeStop = Math.max(position.activeStop, position.highestClose - position.trailingAtr * atr14[index]);
        }
        if (shouldExitAtClose(position, data, index)) pendingExit = 'TrendExit';
      }
    }

    if (!position && !pendingEntry) {
      const signal = signalAt(strategy, data, index);
      if (signal) {
        signals += 1;
        pendingEntry = { ...signal, signalClose: candle.close, atr: atr14[index] };
      }
    }

    if (candle.timestamp === endTimestamp && position) closePosition(candle.close, candle, 'EndPeriod');
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

export const summarize = rows => {
  const byClass = Object.fromEntries(['stocks', 'crypto', 'metals'].map(marketClass => {
    const scopedRows = rows.filter(row => row.marketClass === marketClass);
    const trades = scopedRows.flatMap(row => row.tradeLog);
    const winners = trades.filter(trade => trade.rMultiple > 0);
    const losers = trades.filter(trade => trade.rMultiple <= 0);
    const grossWins = winners.reduce((sum, trade) => sum + trade.rMultiple, 0);
    const grossLosses = Math.abs(losers.reduce((sum, trade) => sum + trade.rMultiple, 0));
    const stops = trades.map(trade => trade.initialRiskPercent).sort((left, right) => left - right);
    return [marketClass, {
      assets: scopedRows.length,
      activeAssets: scopedRows.filter(row => row.trades > 0).length,
      profitableAssets: scopedRows.filter(row => row.returnPercent > 0).length,
      trades: trades.length,
      winRate: trades.length ? round(winners.length / trades.length * 100, 1) : 0,
      profitFactor: grossLosses ? round(grossWins / grossLosses) : grossWins ? 99 : 0,
      expectancyR: trades.length ? round(trades.reduce((sum, trade) => sum + trade.rMultiple, 0) / trades.length) : 0,
      medianStopPercent: stops.length ? round(stops[Math.floor(stops.length / 2)]) : 0,
      averageReturnPercent: scopedRows.length
        ? round(scopedRows.reduce((sum, row) => sum + row.returnPercent, 0) / scopedRows.length)
        : 0,
      averageMaxDrawdownPercent: scopedRows.length
        ? round(scopedRows.reduce((sum, row) => sum + row.maxDrawdownPercent, 0) / scopedRows.length)
        : 0
    }];
  }));
  const trades = rows.flatMap(row => row.tradeLog);
  const winners = trades.filter(trade => trade.rMultiple > 0);
  const losers = trades.filter(trade => trade.rMultiple <= 0);
  return {
    all: {
      assets: rows.length,
      profitableAssets: rows.filter(row => row.returnPercent > 0).length,
      trades: trades.length,
      winRate: trades.length ? round(winners.length / trades.length * 100, 1) : 0,
      profitFactor: losers.length
        ? round(winners.reduce((sum, trade) => sum + trade.rMultiple, 0)
          / Math.abs(losers.reduce((sum, trade) => sum + trade.rMultiple, 0)))
        : winners.length ? 99 : 0,
      expectancyR: trades.length ? round(trades.reduce((sum, trade) => sum + trade.rMultiple, 0) / trades.length) : 0
    },
    byClass
  };
};

const main = async () => {
  const data = [];
  for (const asset of CROSS_ASSETS) data.push(await prepare(asset));
  const phase = process.env.PHASE || 'calibration';
  const requested = process.env.CANDIDATE;
  const candidates = phase === 'final'
    ? STRATEGIES.includes(requested) ? [requested] : []
    : STRATEGIES;
  if (!candidates.length) throw new Error('CANDIDATE este obligatoriu pentru faza finală.');

  const results = candidates.map(strategy => {
    const rows = data.map(assetData => {
      const eligible = assetData.candles.slice(300);
      const split60 = eligible[Math.floor(eligible.length * 0.6)].timestamp;
      const split80 = eligible[Math.floor(eligible.length * 0.8)].timestamp;
      const startTimestamp = phase === 'calibration'
        ? eligible[0].timestamp
        : phase === 'validation' ? split60 : split80;
      const endTimestamp = phase === 'calibration'
        ? assetData.candles.findLast(candle => candle.timestamp < split60).timestamp
        : phase === 'validation'
          ? assetData.candles.findLast(candle => candle.timestamp < split80).timestamp
          : eligible.at(-1).timestamp;
      return run(strategy, assetData, startTimestamp, endTimestamp);
    });
    return {
      strategy,
      name: names[strategy],
      phase,
      summary: summarize(rows),
      rows: rows.map(({ tradeLog, ...row }) => row)
    };
  });
  process.stdout.write(`${JSON.stringify({
    generatedAt: new Date().toISOString(),
    phase,
    assumptions: {
      direction: 'LONG_ONLY',
      riskPerTradePercent: 0.5,
      maximumInitialStopPercent: MAX_INITIAL_STOP_PERCENT,
      donchianStopAtr: DONCHIAN_STOP_ATR,
      feePerSidePercent: 0.075,
      slippagePerSidePercent: 0.05,
      protocol: '60% calibration, 20% validation, 20% final holdout'
    },
    results
  }, null, 2)}\n`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
