import { pathToFileURL } from 'node:url';
import { CROSS_ASSETS, prepare } from './research-cross-asset-strategies.mjs';
import { DAY_MS, atr, round, sma } from './backtest-tight-risk-breakout.mjs';

const STRATEGIES = [
  'donchian55_3r',
  'donchian100_3r',
  'momentum_pullback_3r',
  'sma20_reversal_2_5r',
  'squeeze_breakout_3r'
];

const names = {
  donchian55_3r: '12M Momentum + Donchian 55 + TP 3R',
  donchian100_3r: '12M Momentum + Donchian 100 + TP 3R',
  momentum_pullback_3r: '52W Momentum Pullback Reversal + TP 3R',
  sma20_reversal_2_5r: 'SMA20 Trend Pullback Reversal + TP 2.5R',
  squeeze_breakout_3r: 'ATR Squeeze + 20-Day Breakout + TP 3R'
};

const percentileRank = (values, current) => {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.filter(value => value <= current).length / finite.length : 1;
};

const enrich = data => {
  const { candles, closes } = data;
  return {
    ...data,
    sma20: sma(closes, 20),
    sma50: sma(closes, 50),
    atr5: atr(candles, 5),
    atr20: atr(candles, 20)
  };
};

const signalAt = (strategy, data, index) => {
  const { candles, closes, atr14, atr5, atr20, sma20, sma50, sma200 } = data;
  if (index < 260 || !Number.isFinite(atr14[index])) return undefined;
  const candle = candles[index];
  const previous = candles[index - 1];
  const momentum12 = candle.close / closes[index - 252] - 1;
  const high252 = Math.max(...candles.slice(index - 252, index).map(value => value.high));
  const nearHigh = candle.close / high252 >= 0.85;
  const broadTrend = momentum12 > 0
    && candle.close > sma200[index]
    && sma50[index] > sma50[index - 20];
  const atrPercentHistory = candles.slice(index - 252, index).map((value, offset) => {
    const sourceIndex = index - 252 + offset;
    return atr14[sourceIndex] / value.close * 100;
  });
  const atrPercent = atr14[index] / candle.close * 100;
  const controlledVolatility = percentileRank(atrPercentHistory, atrPercent) <= 0.8;
  const bullishConfirmation = candle.close > candle.open && candle.close > previous.high;

  if (strategy === 'donchian55_3r') {
    const previousHigh = Math.max(...candles.slice(index - 55, index).map(value => value.high));
    if (broadTrend && controlledVolatility && candle.close > previousHigh) {
      return { stopAtr: 2, stopLookback: 2, targetR: 3, reason: '12M pozitiv + Donchian 55' };
    }
  }
  if (strategy === 'donchian100_3r') {
    const previousHigh = Math.max(...candles.slice(index - 100, index).map(value => value.high));
    if (broadTrend && controlledVolatility && candle.close > previousHigh) {
      return { stopAtr: 2.5, stopLookback: 2, targetR: 3, reason: '12M pozitiv + Donchian 100' };
    }
  }
  if (strategy === 'momentum_pullback_3r') {
    const threeLowerCloses = candles[index - 1].close < candles[index - 2].close
      && candles[index - 2].close < candles[index - 3].close
      && candles[index - 3].close < candles[index - 4].close;
    if (broadTrend && nearHigh && controlledVolatility && threeLowerCloses
      && previous.close > sma50[index - 1] && bullishConfirmation) {
      return { stopAtr: 1.5, stopLookback: 5, targetR: 3, reason: '3-day pullback + bullish reversal' };
    }
  }
  if (strategy === 'sma20_reversal_2_5r') {
    const trendStack = broadTrend && sma20[index] > sma50[index] && sma50[index] > sma200[index];
    const touchedSma20 = candle.low <= sma20[index] + 0.15 * atr14[index] && candle.close > sma20[index];
    if (trendStack && nearHigh && controlledVolatility && touchedSma20 && bullishConfirmation) {
      return { stopAtr: 1.5, stopLookback: 4, targetR: 2.5, reason: 'SMA20 pullback + bullish reversal' };
    }
  }
  if (strategy === 'squeeze_breakout_3r') {
    const prior10 = candles.slice(index - 10, index);
    const baseHigh = Math.max(...prior10.map(value => value.high));
    const baseLow = Math.min(...prior10.map(value => value.low));
    const previousHigh20 = Math.max(...candles.slice(index - 20, index).map(value => value.high));
    const normalizedBase = (baseHigh - baseLow) <= 4 * atr20[index - 1];
    const squeezed = atr5[index - 1] <= 0.8 * atr20[index - 1]
      && percentileRank(atrPercentHistory, atr14[index - 1] / previous.close * 100) <= 0.5;
    if (broadTrend && nearHigh && squeezed && normalizedBase && candle.close > previousHigh20) {
      return { stopAtr: 1.5, stopLookback: 10, targetR: 3, reason: 'ATR squeeze + 20-day breakout' };
    }
  }
  return undefined;
};

const run = (strategy, data, startTimestamp, endTimestamp) => {
  const { asset, candles, atr14, sma50 } = data;
  const feePerSide = Number(process.env.FEE_PER_SIDE_PERCENT || 0.075);
  const slippagePerSide = Number(process.env.SLIPPAGE_PER_SIDE_PERCENT || 0.05);
  const maxStopPercent = 10;
  const riskFraction = 0.005;
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
      initialRiskPercent: position.initialRiskPercent,
      rMultiple,
      reason,
      holdingDays: Math.max(1, Math.round((candle.timestamp - position.entryTimestamp) / DAY_MS)),
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
      const sourceStart = Math.max(0, pendingEntry.signalIndex - pendingEntry.stopLookback + 1);
      const structuralStop = Math.min(...candles.slice(sourceStart, pendingEntry.signalIndex + 1).map(value => value.low))
        - 0.1 * pendingEntry.atr;
      const atrStop = entryPrice - pendingEntry.stopAtr * pendingEntry.atr;
      const initialStop = Math.min(structuralStop, atrStop);
      const riskPerUnit = entryPrice - initialStop;
      const riskPercent = riskPerUnit / entryPrice * 100;
      if (gapOk && riskPerUnit > 0 && riskPercent <= maxStopPercent) {
        const quantity = Math.min(capital * riskFraction / riskPerUnit, capital / entryPrice);
        position = {
          entryTimestamp: candle.timestamp,
          entryPrice,
          initialStop,
          targetPrice: entryPrice + pendingEntry.targetR * riskPerUnit,
          initialRiskPercent: riskPercent,
          initialRiskCash: riskPerUnit * quantity,
          quantity,
          targetR: pendingEntry.targetR,
          entryReason: pendingEntry.reason,
          barsHeld: 0
        };
      } else {
        rejected += 1;
      }
      pendingEntry = undefined;
    }

    if (position) {
      position.barsHeld += 1;
      const stopHit = candle.low <= position.initialStop;
      const targetHit = candle.high >= position.targetPrice;
      if (stopHit) {
        closePosition(Math.min(candle.open, position.initialStop), candle, 'StopLoss');
      } else if (targetHit) {
        closePosition(position.targetPrice, candle, `TakeProfit${position.targetR}R`);
      } else if (candle.close < sma50[index] || position.barsHeld >= 90) {
        pendingExit = candle.close < sma50[index] ? 'TrendInvalidation' : 'TimeExit90D';
      }
    }

    if (!position && !pendingEntry) {
      const signal = signalAt(strategy, data, index);
      if (signal) {
        signals += 1;
        pendingEntry = { ...signal, signalIndex: index, signalClose: candle.close, atr: atr14[index] };
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
    averageHoldingDays: trades.length
      ? round(trades.reduce((sum, trade) => sum + trade.holdingDays, 0) / trades.length, 1)
      : 0,
    tradeLog: trades
  };
};

const summarize = rows => {
  const scope = scopedRows => {
    const trades = scopedRows.flatMap(row => row.tradeLog);
    const winners = trades.filter(trade => trade.rMultiple > 0);
    const losers = trades.filter(trade => trade.rMultiple <= 0);
    const grossWins = winners.reduce((sum, trade) => sum + trade.rMultiple, 0);
    const grossLosses = Math.abs(losers.reduce((sum, trade) => sum + trade.rMultiple, 0));
    const stops = trades.map(trade => trade.initialRiskPercent).sort((left, right) => left - right);
    return {
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
    };
  };
  return {
    all: scope(rows),
    byClass: Object.fromEntries(['stocks', 'crypto', 'metals'].map(marketClass => [
      marketClass,
      scope(rows.filter(row => row.marketClass === marketClass))
    ]))
  };
};

const main = async () => {
  const datasets = [];
  for (const asset of CROSS_ASSETS) datasets.push(enrich(await prepare(asset)));
  const phase = process.env.PHASE || 'calibration';
  const requested = process.env.CANDIDATE;
  const candidates = phase === 'final'
    ? STRATEGIES.includes(requested) ? [requested] : []
    : STRATEGIES;
  if (!candidates.length) throw new Error('CANDIDATE este obligatoriu pentru faza finală.');

  const results = candidates.map(strategy => {
    const rows = datasets.map(data => {
      const eligible = data.candles.slice(300);
      const split60 = eligible[Math.floor(eligible.length * 0.6)].timestamp;
      const split80 = eligible[Math.floor(eligible.length * 0.8)].timestamp;
      const startTimestamp = phase === 'calibration' ? eligible[0].timestamp : phase === 'validation' ? split60 : split80;
      const endTimestamp = phase === 'calibration'
        ? data.candles.findLast(candle => candle.timestamp < split60).timestamp
        : phase === 'validation'
          ? data.candles.findLast(candle => candle.timestamp < split80).timestamp
          : eligible.at(-1).timestamp;
      return run(strategy, data, startTimestamp, endTimestamp);
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
      maximumStopPercent: 10,
      riskPerTradePercent: 0.5,
      targetRiskReward: '2.5R or 3R',
      feePerSidePercent: Number(process.env.FEE_PER_SIDE_PERCENT || 0.075),
      slippagePerSidePercent: Number(process.env.SLIPPAGE_PER_SIDE_PERCENT || 0.05),
      sameBarPolicy: 'stop before target',
      protocol: '60% calibration, 20% validation, 20% final'
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
