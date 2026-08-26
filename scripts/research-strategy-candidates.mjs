import {
  ASSETS,
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

const STRATEGIES = [
  'sma20_pullback',
  'sma50_reclaim',
  'nr7_breakout',
  'momentum_reversal',
  'donchian55'
];
const FEE_PER_SIDE = Number(process.env.FEE_PER_SIDE || 0.075);
const SLIPPAGE_PER_SIDE = Number(process.env.SLIPPAGE_PER_SIDE || 0.05);
const DONCHIAN_ENTRY_BARS = Number(process.env.DONCHIAN_ENTRY_BARS || 55);
const DONCHIAN_EXIT_BARS = Number(process.env.DONCHIAN_EXIT_BARS || 20);

const strategyNames = {
  sma20_pullback: 'Weekly Trend + Daily SMA20 Pullback Reversal',
  sma50_reclaim: 'Weekly Trend + Daily SMA50 Reclaim',
  nr7_breakout: 'Weekly Trend + NR7 Breakout',
  momentum_reversal: '52-Week High + Three-Day Pullback Reversal',
  donchian55: 'Weekly Trend + Donchian 55/20'
};

const percentileRank = (values, current) => {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.filter(value => value <= current).length / finite.length : 1;
};

const prepare = (asset, candles) => {
  const closes = candles.map(candle => candle.close);
  const volumes = candles.map(candle => candle.volume);
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const sma200 = sma(closes, 200);
  const volume20 = sma(volumes, 20);
  const atr14 = atr(candles, 14);
  const dailyFast = supertrendDirections(candles, 10, 2.5);
  const dailySlow = supertrendDirections(candles, 10, 3.5);
  const weeks = aggregateWeeks(candles);
  const weeklySma40 = sma(weeks.map(candle => candle.close), 40);
  const weeklyFast = supertrendDirections(weeks, 10, 2.8);
  const weeklySlow = supertrendDirections(weeks, 10, 3.8);
  return {
    asset,
    candles,
    sma20,
    sma50,
    sma200,
    volume20,
    atr14,
    dailyFast,
    dailySlow,
    weeks,
    weeklySma40,
    weeklyFast,
    weeklySlow
  };
};

const detectSignal = (strategy, data, index, weeklyIndex) => {
  const {
    asset,
    candles,
    sma20,
    sma50,
    sma200,
    volume20,
    atr14,
    dailyFast,
    dailySlow,
    weeks,
    weeklySma40,
    weeklyFast,
    weeklySlow
  } = data;
  const candle = candles[index];
  const previous = candles[index - 1];
  if (weeklyIndex < 48 || index < 260 || !Number.isFinite(atr14[index])) return undefined;
  const weeklyBullish = weeklyFast[weeklyIndex] < 0
    && weeklySlow[weeklyIndex] < 0
    && weeks[weeklyIndex].close > weeklySma40[weeklyIndex]
    && weeklySma40[weeklyIndex] > weeklySma40[weeklyIndex - 8];
  const broadDailyTrend = candle.close > sma200[index]
    && sma50[index] > sma200[index]
    && sma50[index] > sma50[index - 20]
    && sma200[index] > sma200[index - 20];
  if (!weeklyBullish || !broadDailyTrend) return undefined;

  const high252 = Math.max(...candles.slice(index - 252, index).map(value => value.high));
  const nearHigh = candle.close / high252 >= 0.9;
  const bullishClose = candle.close > candle.open && candle.close > previous.high;
  const atrPercent = atr14[index] / candle.close * 100;
  const atrHistory = candles.slice(index - 252, index).map((value, offset) => {
    const sourceIndex = index - 252 + offset;
    return atr14[sourceIndex] / value.close * 100;
  });
  const controlledVolatility = percentileRank(atrHistory, atrPercent) <= 0.7;

  if (strategy === 'sma20_pullback') {
    const touched = candle.low <= sma20[index] + 0.15 * atr14[index];
    const reclaimed = candle.close > sma20[index] && bullishClose;
    if (nearHigh && controlledVolatility && touched && reclaimed && dailyFast[index] < 0 && dailySlow[index] < 0) {
      return { stopLookback: 4, stopAtrMultiple: 1.5, targetR: 2, reason: 'Pullback SMA20 + bullish reversal' };
    }
  }

  if (strategy === 'sma50_reclaim') {
    const crossed = previous.close <= sma50[index - 1] && candle.close > sma50[index];
    if (controlledVolatility && crossed && bullishClose && dailyFast[index] < 0) {
      return { stopLookback: 6, stopAtrMultiple: 1.5, targetR: 2, reason: 'Reclaim SMA50 + bullish reversal' };
    }
  }

  if (strategy === 'nr7_breakout') {
    const previousRanges = candles.slice(index - 7, index).map(value => value.high - value.low);
    const previousIsNr7 = previousRanges.at(-1) === Math.min(...previousRanges);
    const breakout = candle.close > previous.high && candle.close > candle.open;
    if (nearHigh && controlledVolatility && previousIsNr7 && breakout && candle.volume >= 0.8 * volume20[index]) {
      return { stopLookback: 2, stopAtrMultiple: 1.5, targetR: 2, reason: 'NR7 + breakout confirmat' };
    }
  }

  if (strategy === 'momentum_reversal') {
    const threeDayPullback = candles[index - 1].close < candles[index - 2].close
      && candles[index - 2].close < candles[index - 3].close
      && candles[index - 1].close > sma50[index - 1];
    if (nearHigh && controlledVolatility && threeDayPullback && bullishClose && dailySlow[index] < 0) {
      return { stopLookback: 5, stopAtrMultiple: 1.5, targetR: 2, reason: 'Pullback 3 zile + reversare lângă 52W high' };
    }
  }

  if (strategy === 'donchian55') {
    const previousHigh55 = Math.max(...candles.slice(index - DONCHIAN_ENTRY_BARS, index).map(value => value.high));
    const twelveMonthMomentum = candle.close > candles[index - 252].close;
    if (controlledVolatility && twelveMonthMomentum && candle.close > previousHigh55 && dailyFast[index] < 0) {
      return { stopLookback: 2, stopAtrMultiple: 2, reason: 'Donchian 55 + trend 12 luni', trailingDonchian: true };
    }
  }

  return undefined;
};

const runStrategy = (strategy, data, startTimestamp, endTimestamp) => {
  const { asset, candles, sma50, atr14, weeks, weeklySma40, weeklyFast, weeklySlow } = data;
  const maxRiskPercent = asset.marketClass === 'crypto' ? 6 : 4;
  const feePerSide = FEE_PER_SIDE;
  const slippagePerSide = SLIPPAGE_PER_SIDE;
  const riskFraction = 0.005;
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
      exitPrice,
      initialStop: position.initialStop,
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
      const entryPrice = candle.open * (1 + slippagePerSide / 100);
      const gapOk = entryPrice <= pendingEntry.signalClose + pendingEntry.atr;
      const sourceStart = Math.max(0, pendingEntry.signalIndex - pendingEntry.stopLookback + 1);
      const structuralStop = Math.min(...candles.slice(sourceStart, pendingEntry.signalIndex + 1).map(value => value.low))
        - 0.1 * pendingEntry.atr;
      const volatilityStop = entryPrice - pendingEntry.stopAtrMultiple * pendingEntry.atr;
      const initialStop = Math.min(structuralStop, volatilityStop);
      const riskPerUnit = entryPrice - initialStop;
      const riskPercent = riskPerUnit / entryPrice * 100;
      if (gapOk && riskPerUnit > 0 && riskPercent <= maxRiskPercent) {
        const riskCashTarget = capital * riskFraction;
        const quantity = Math.min(riskCashTarget / riskPerUnit, capital / entryPrice);
        position = {
          entryTimestamp: candle.timestamp,
          entryPrice,
          initialStop,
          activeStop: initialStop,
          initialRiskPercent: riskPercent,
          initialRiskCash: riskPerUnit * quantity,
          targetPrice: pendingEntry.targetR ? entryPrice + pendingEntry.targetR * riskPerUnit : undefined,
          quantity,
          trailingDonchian: pendingEntry.trailingDonchian,
          entryReason: pendingEntry.reason
        };
      } else {
        rejected += 1;
      }
      pendingEntry = undefined;
    }

    if (position) {
      const stopHit = candle.low <= position.activeStop;
      const targetHit = position.targetPrice && candle.high >= position.targetPrice;
      if (stopHit) {
        closePosition(Math.min(candle.open, position.activeStop), candle, 'StopLoss');
      } else if (targetHit) {
        closePosition(position.targetPrice, candle, 'TakeProfit2R');
      } else {
        const weeklyBullish = weeklyIndex >= 48
          && weeklyFast[weeklyIndex] < 0
          && weeklySlow[weeklyIndex] < 0
          && weeks[weeklyIndex].close > weeklySma40[weeklyIndex];
        if (position.trailingDonchian) {
          const donchianLow20 = Math.min(...candles.slice(
            Math.max(0, index - DONCHIAN_EXIT_BARS + 1),
            index + 1
          ).map(value => value.low));
          position.activeStop = Math.max(position.activeStop, donchianLow20);
          if (!weeklyBullish) pendingExit = 'WeeklyTrendInvalidation';
        } else if (!weeklyBullish || candle.close < sma50[index]) {
          pendingExit = 'TrendInvalidation';
        }
      }
    }

    if (!position && !pendingEntry) {
      const signal = detectSignal(strategy, data, index, weeklyIndex);
      if (signal) {
        signals += 1;
        pendingEntry = {
          ...signal,
          signalIndex: index,
          signalClose: candle.close,
          atr: atr14[index]
        };
      }
    }

    if (index === candles.length - 1 || candle.timestamp === endTimestamp) {
      if (position) closePosition(candle.close, candle, 'EndPeriod');
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

const aggregate = rows => {
  const allTrades = rows.flatMap(row => row.tradeLog);
  const winners = allTrades.filter(trade => trade.rMultiple > 0);
  const losers = allTrades.filter(trade => trade.rMultiple <= 0);
  const grossWins = winners.reduce((sum, trade) => sum + trade.rMultiple, 0);
  const grossLosses = Math.abs(losers.reduce((sum, trade) => sum + trade.rMultiple, 0));
  const stops = allTrades.map(trade => trade.initialRiskPercent).sort((left, right) => left - right);
  return {
    assets: rows.length,
    activeAssets: rows.filter(row => row.trades > 0).length,
    profitableAssets: rows.filter(row => row.returnPercent > 0).length,
    signals: rows.reduce((sum, row) => sum + row.signals, 0),
    rejected: rows.reduce((sum, row) => sum + row.rejected, 0),
    trades: allTrades.length,
    winRate: allTrades.length ? round(winners.length / allTrades.length * 100, 1) : 0,
    profitFactor: grossLosses ? round(grossWins / grossLosses) : grossWins ? 99 : 0,
    expectancyR: allTrades.length
      ? round(allTrades.reduce((sum, trade) => sum + trade.rMultiple, 0) / allTrades.length)
      : 0,
    averageReturnPercent: round(rows.reduce((sum, row) => sum + row.returnPercent, 0) / rows.length),
    averageMaxDrawdownPercent: round(rows.reduce((sum, row) => sum + row.maxDrawdownPercent, 0) / rows.length),
    medianStopPercent: stops.length ? round(stops[Math.floor(stops.length / 2)]) : 0
  };
};

const main = async () => {
  const datasets = [];
  for (const asset of ASSETS) {
    const candles = asset.marketClass === 'crypto'
      ? await fetchBinance(asset.symbol)
      : await fetchYahoo(asset.symbol);
    datasets.push(prepare(asset, candles));
  }
  const phase = process.env.PHASE || 'train';
  const selected = process.env.CANDIDATE;
  const candidates = phase === 'train'
    ? STRATEGIES
    : STRATEGIES.includes(selected) ? [selected] : [];
  if (!candidates.length) throw new Error('Pentru validare este necesar CANDIDATE=<strategie>.');

  const results = candidates.map(strategy => {
    const rows = datasets.map(data => {
      const evaluationStart = data.candles[Math.min(300, data.candles.length - 1)].timestamp;
      const eligible = data.candles.filter(candle => candle.timestamp >= evaluationStart);
      const splitTimestamp = eligible[Math.floor(eligible.length * 0.7)].timestamp;
      const startTimestamp = phase === 'train' ? evaluationStart : splitTimestamp;
      const endTimestamp = phase === 'train'
        ? (eligible.findLast(candle => candle.timestamp < splitTimestamp)?.timestamp || splitTimestamp)
        : eligible.at(-1).timestamp;
      return runStrategy(strategy, data, startTimestamp, endTimestamp);
    });
    return {
      strategy,
      name: strategyNames[strategy],
      phase,
      aggregate: aggregate(rows),
      rows: rows.map(({ tradeLog, ...row }) => row),
      tradeLog: rows.flatMap(row => row.tradeLog.map(trade => ({ symbol: row.symbol, ...trade })))
    };
  });

  process.stdout.write(`${JSON.stringify({
    generatedAt: new Date().toISOString(),
    phase,
    assumptions: {
      riskPerTradePercent: 0.5,
      maxStopStocksPercent: 4,
      maxStopCryptoPercent: 6,
      feePerSidePercent: FEE_PER_SIDE,
      slippagePerSidePercent: SLIPPAGE_PER_SIDE,
      donchianEntryBars: DONCHIAN_ENTRY_BARS,
      donchianExitBars: DONCHIAN_EXIT_BARS,
      sameBarPolicy: 'stop before target',
      selection: 'calibrare 70%; holdout cronologic 30% deschis numai după alegerea candidatului'
    },
    results
  }, null, 2)}\n`);
};

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
