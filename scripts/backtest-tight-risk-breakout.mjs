import { pathToFileURL } from 'node:url';

export const DAY_MS = 86_400_000;
const ATR_STOP_MULTIPLE = Number(process.env.ATR_STOP_MULTIPLE || 1.25);
export const ASSETS = [
  { symbol: 'BTC', marketClass: 'crypto' },
  { symbol: 'ETH', marketClass: 'crypto' },
  { symbol: 'SOL', marketClass: 'crypto' },
  { symbol: 'BNB', marketClass: 'crypto' },
  { symbol: 'XRP', marketClass: 'crypto' },
  { symbol: 'ADA', marketClass: 'crypto' },
  { symbol: 'DOGE', marketClass: 'crypto' },
  { symbol: 'LINK', marketClass: 'crypto' },
  { symbol: 'AVAX', marketClass: 'crypto' },
  { symbol: 'LTC', marketClass: 'crypto' },
  { symbol: 'SPY', marketClass: 'stocks' },
  { symbol: 'QQQ', marketClass: 'stocks' },
  { symbol: 'AAPL', marketClass: 'stocks' },
  { symbol: 'MSFT', marketClass: 'stocks' },
  { symbol: 'NVDA', marketClass: 'stocks' },
  { symbol: 'META', marketClass: 'stocks' },
  { symbol: 'DELL', marketClass: 'stocks' },
  { symbol: 'AMZN', marketClass: 'stocks' },
  { symbol: 'GOOGL', marketClass: 'stocks' },
  { symbol: 'TSLA', marketClass: 'stocks' },
  { symbol: 'AMD', marketClass: 'stocks' },
  { symbol: 'AVGO', marketClass: 'stocks' },
  { symbol: 'JPM', marketClass: 'stocks' },
  { symbol: 'V', marketClass: 'stocks' },
  { symbol: 'MA', marketClass: 'stocks' },
  { symbol: 'COST', marketClass: 'stocks' },
  { symbol: 'WMT', marketClass: 'stocks' },
  { symbol: 'LLY', marketClass: 'stocks' },
  { symbol: 'XOM', marketClass: 'stocks' },
  { symbol: 'NFLX', marketClass: 'stocks' }
];

export const round = (value, digits = 2) => Number(value.toFixed(digits));

export const sma = (values, period) => {
  const output = new Array(values.length).fill(Number.NaN);
  let total = 0;
  for (let index = 0; index < values.length; index += 1) {
    total += values[index];
    if (index >= period) total -= values[index - period];
    if (index >= period - 1) output[index] = total / period;
  }
  return output;
};

export const atr = (candles, period) => {
  const output = new Array(candles.length).fill(Number.NaN);
  if (candles.length < period) return output;
  const trueRanges = candles.map((candle, index) => index === 0
    ? candle.high - candle.low
    : Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - candles[index - 1].close),
      Math.abs(candle.low - candles[index - 1].close)
    ));
  let current = trueRanges.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  output[period - 1] = current;
  for (let index = period; index < candles.length; index += 1) {
    current = (current * (period - 1) + trueRanges[index]) / period;
    output[index] = current;
  }
  return output;
};

export const supertrendDirections = (candles, period, multiplier) => {
  const atrValues = atr(candles, period);
  const directions = new Array(candles.length).fill(1);
  let upperBand = 0;
  let lowerBand = 0;
  let direction = 1;
  candles.forEach((candle, index) => {
    const currentAtr = Number.isFinite(atrValues[index])
      ? atrValues[index]
      : candle.high - candle.low;
    const midpoint = (candle.high + candle.low) / 2;
    const basicUpper = midpoint + multiplier * currentAtr;
    const basicLower = midpoint - multiplier * currentAtr;
    if (index === 0) {
      upperBand = basicUpper;
      lowerBand = basicLower;
    } else {
      const previousUpper = upperBand;
      const previousLower = lowerBand;
      const previousClose = candles[index - 1].close;
      lowerBand = basicLower > previousLower || previousClose < previousLower ? basicLower : previousLower;
      upperBand = basicUpper < previousUpper || previousClose > previousUpper ? basicUpper : previousUpper;
      if (direction === 1 && candle.close > previousUpper) direction = -1;
      else if (direction === -1 && candle.close < previousLower) direction = 1;
    }
    directions[index] = direction;
  });
  return directions;
};

export const weekStart = timestamp => {
  const value = new Date(timestamp);
  const dayFromMonday = (value.getUTCDay() + 6) % 7;
  value.setUTCDate(value.getUTCDate() - dayFromMonday);
  value.setUTCHours(0, 0, 0, 0);
  return value.getTime();
};

export const aggregateWeeks = daily => {
  const weeks = [];
  for (const candle of daily) {
    const timestamp = weekStart(candle.timestamp);
    const current = weeks.at(-1);
    if (!current || current.timestamp !== timestamp) {
      weeks.push({ ...candle, timestamp, isClosed: true });
    } else {
      current.high = Math.max(current.high, candle.high);
      current.low = Math.min(current.low, candle.low);
      current.close = candle.close;
      current.volume += candle.volume;
    }
  }
  return weeks;
};

export const fetchBinance = async symbol => {
  let output = [];
  let endTime;
  while (output.length < 3000) {
    const suffix = endTime ? `&endTime=${endTime}` : '';
    const response = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${symbol}USDT&interval=1d&limit=1000${suffix}`);
    if (!response.ok) throw new Error(`Binance HTTP ${response.status}`);
    const rows = await response.json();
    if (!rows.length) break;
    const page = rows.map(row => ({
      timestamp: Number(row[0]),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5]),
      isClosed: Number(row[6]) < Date.now()
    }));
    output = [...page.filter(candle => !output.some(existing => existing.timestamp === candle.timestamp)), ...output]
      .sort((left, right) => left.timestamp - right.timestamp);
    if (page.length < 1000) break;
    endTime = page[0].timestamp - 1;
  }
  return output.filter(candle => candle.isClosed).slice(-3000);
};

export const fetchYahoo = async symbol => {
  const response = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=10y&interval=1d&events=div%2Csplits&includePrePost=false`,
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

const percentileRank = (values, current) => {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return 1;
  return finite.filter(value => value <= current).length / finite.length;
};

const run = (asset, candles, evaluationStartTimestamp) => {
  const closes = candles.map(candle => candle.close);
  const volumes = candles.map(candle => candle.volume);
  const sma50 = sma(closes, 50);
  const sma200 = sma(closes, 200);
  const volume20 = sma(volumes, 20);
  const atr5 = atr(candles, 5);
  const atr14 = atr(candles, 14);
  const atr20 = atr(candles, 20);
  const dailyFast = supertrendDirections(candles, 10, 2.5);
  const dailySlow = supertrendDirections(candles, 10, 3.5);
  const weeks = aggregateWeeks(candles);
  const weeklyCloses = weeks.map(candle => candle.close);
  const weeklySma40 = sma(weeklyCloses, 40);
  const weeklyFast = supertrendDirections(weeks, 10, 2.8);
  const weeklySlow = supertrendDirections(weeks, 10, 3.8);
  const maxRiskPercent = asset.marketClass === 'crypto' ? 6 : 4;
  const baseRangeLimit = asset.marketClass === 'crypto' ? 8 : 5;
  const breakoutRvol = 1;
  const feePerSide = 0.075;
  const slippagePerSide = 0.05;
  const riskFraction = 0.005;
  const trades = [];
  let capital = 10_000;
  let peak = capital;
  let maxDrawdown = 0;
  let candidate;
  let pendingEntry;
  let pendingExit;
  let position;
  let riskRejected = 0;
  let breakoutCandidates = 0;
  let retestConfirmed = 0;
  let weeklyIndex = -1;
  const eligibility = { weekly: 0, daily: 0, contraction: 0, nearHigh: 0, breakout: 0, allBeforeBreakout: 0 };

  const closePosition = (rawPrice, candle, reason) => {
    const exitPrice = rawPrice * (1 - slippagePerSide / 100);
    const pnlPerUnit = exitPrice - position.entryPrice;
    const grossPnl = pnlPerUnit * position.quantity;
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
      pnlPercent: pnlPerUnit / position.entryPrice * 100,
      rMultiple,
      reason,
      holdingDays: Math.max(1, Math.round((candle.timestamp - position.entryTimestamp) / DAY_MS))
    });
    position = undefined;
    pendingExit = undefined;
  };

  for (let index = 260; index < candles.length; index += 1) {
    const candle = candles[index];
    const currentWeek = weekStart(candle.timestamp);
    while (weeklyIndex + 1 < weeks.length && weeks[weeklyIndex + 1].timestamp < currentWeek) weeklyIndex += 1;
    const inEvaluation = candle.timestamp >= evaluationStartTimestamp;

    if (!inEvaluation) {
      candidate = undefined;
      pendingEntry = undefined;
      pendingExit = undefined;
      position = undefined;
      continue;
    }

    if (pendingExit && position) closePosition(candle.open, candle, pendingExit);

    if (pendingEntry && !position) {
      const entryPrice = candle.open * (1 + slippagePerSide / 100);
      const gapOk = entryPrice <= pendingEntry.signalClose + pendingEntry.atr;
      const structuralStop = pendingEntry.retestLow - 0.1 * pendingEntry.atr;
      const volatilityStop = entryPrice - ATR_STOP_MULTIPLE * pendingEntry.atr;
      const initialStop = Math.min(structuralStop, volatilityStop);
      const riskPerUnit = entryPrice - initialStop;
      const riskPercent = riskPerUnit / entryPrice * 100;
      if (gapOk && riskPerUnit > 0 && riskPercent <= maxRiskPercent) {
        const riskCashTarget = capital * riskFraction;
        const quantityByRisk = riskCashTarget / riskPerUnit;
        const quantityByCash = capital / entryPrice;
        const quantity = Math.min(quantityByRisk, quantityByCash);
        position = {
          entryTimestamp: candle.timestamp,
          entryPrice,
          initialStop,
          initialRiskPercent: riskPercent,
          initialRiskCash: riskPerUnit * quantity,
          targetPrice: entryPrice + 2 * riskPerUnit,
          quantity,
          highestHigh: candle.high,
          barsHeld: 0
        };
      } else {
        riskRejected += 1;
      }
      pendingEntry = undefined;
    }

    if (position) {
      position.barsHeld += 1;
      position.highestHigh = Math.max(position.highestHigh, candle.high);
      const stopHit = candle.low <= position.initialStop;
      const targetHit = candle.high >= position.targetPrice;
      if (stopHit) {
        closePosition(Math.min(candle.open, position.initialStop), candle, 'StopLoss');
      } else if (targetHit) {
        closePosition(position.targetPrice, candle, 'TakeProfit2R');
      } else {
        const mfeR = (position.highestHigh - position.entryPrice) / (position.entryPrice - position.initialStop);
        const weeklyBullish = weeklyIndex >= 8
          && weeklyFast[weeklyIndex] < 0
          && weeklySlow[weeklyIndex] < 0;
        if (position.barsHeld >= 5 && mfeR < 0.5) pendingExit = 'TimeStop';
        else if (candle.close < sma50[index] || !weeklyBullish) pendingExit = 'TrendInvalidation';
      }
    }

    if (position || pendingEntry) continue;
    if (candidate && index > candidate.expiresAt) candidate = undefined;

    if (candidate && index > candidate.breakoutIndex) {
      const retested = candle.low <= candidate.pivot + 0.5 * atr14[index]
        && candle.close >= candidate.pivot
        && candle.close > candle.open
        && candle.volume < candidate.breakoutVolume;
      if (retested) {
        retestConfirmed += 1;
        pendingEntry = {
          signalClose: candle.close,
          atr: atr14[index],
          retestLow: candle.low,
          pivot: candidate.pivot
        };
        candidate = undefined;
        continue;
      }
    }

    if (candidate) continue;
    if (weeklyIndex < 48 || !Number.isFinite(sma200[index]) || !Number.isFinite(atr20[index])) continue;
    const weeklyBullish = weeklyFast[weeklyIndex] < 0
      && weeklySlow[weeklyIndex] < 0
      && weeks[weeklyIndex].close > weeklySma40[weeklyIndex]
      && weeklySma40[weeklyIndex] > weeklySma40[weeklyIndex - 8];
    const dailyTrend = candle.close > sma50[index]
      && sma50[index] > sma200[index]
      && sma50[index] > sma50[index - 20]
      && sma200[index] > sma200[index - 20]
      && dailyFast[index] < 0
      && dailySlow[index] < 0;
    const previous10 = candles.slice(index - 10, index);
    const previous20 = candles.slice(index - 20, index);
    const previous252 = candles.slice(index - 252, index);
    const pivot = Math.max(...previous20.map(value => value.high));
    const high252 = Math.max(...previous252.map(value => value.high));
    const baseHigh = Math.max(...previous10.map(value => value.high));
    const baseLow = Math.min(...previous10.map(value => value.low));
    const baseRangePercent = (baseHigh - baseLow) / candles[index - 1].close * 100;
    const atrPercentHistory = candles.slice(index - 252, index).map((value, offset) => {
      const sourceIndex = index - 252 + offset;
      return atr14[sourceIndex] / value.close * 100;
    });
    const currentAtrPercent = atr14[index - 1] / candles[index - 1].close * 100;
    const contraction = atr5[index - 1] <= 0.8 * atr20[index - 1]
      && percentileRank(atrPercentHistory, currentAtrPercent) <= 0.4
      && baseRangePercent <= baseRangeLimit;
    const nearHigh = candle.close / high252 >= 0.9;
    const breakout = candle.close > pivot && candle.volume >= breakoutRvol * volume20[index];
    if (weeklyBullish) eligibility.weekly += 1;
    if (dailyTrend) eligibility.daily += 1;
    if (contraction) eligibility.contraction += 1;
    if (nearHigh) eligibility.nearHigh += 1;
    if (breakout) eligibility.breakout += 1;
    if (weeklyBullish && dailyTrend && contraction && nearHigh) eligibility.allBeforeBreakout += 1;
    if (weeklyBullish && dailyTrend && contraction && nearHigh && breakout) {
      breakoutCandidates += 1;
      candidate = {
        pivot,
        breakoutIndex: index,
        breakoutVolume: candle.volume,
        expiresAt: index + 10
      };
    }
  }

  if (position) closePosition(candles.at(-1).close, candles.at(-1), 'EndPeriod');
  const winners = trades.filter(trade => trade.rMultiple > 0);
  const losers = trades.filter(trade => trade.rMultiple <= 0);
  const grossWinR = winners.reduce((sum, trade) => sum + trade.rMultiple, 0);
  const grossLossR = Math.abs(losers.reduce((sum, trade) => sum + trade.rMultiple, 0));
  const initialRisks = trades.map(trade => trade.initialRiskPercent).sort((left, right) => left - right);
  return {
    symbol: asset.symbol,
    marketClass: asset.marketClass,
    periodStart: new Date(evaluationStartTimestamp).toISOString().slice(0, 10),
    periodEnd: new Date(candles.at(-1).timestamp).toISOString().slice(0, 10),
    breakouts: breakoutCandidates,
    retests: retestConfirmed,
    rejected: riskRejected,
    trades: trades.length,
    wins: winners.length,
    winRate: trades.length ? round(winners.length / trades.length * 100, 1) : 0,
    profitFactor: grossLossR ? round(grossWinR / grossLossR) : grossWinR ? 99 : 0,
    expectancyR: trades.length ? round(trades.reduce((sum, trade) => sum + trade.rMultiple, 0) / trades.length) : 0,
    returnPercent: round((capital / 10_000 - 1) * 100),
    maxDrawdownPercent: round(maxDrawdown),
    medianStopPercent: initialRisks.length ? round(initialRisks[Math.floor(initialRisks.length / 2)]) : 0,
    averageHoldingDays: trades.length ? round(trades.reduce((sum, trade) => sum + trade.holdingDays, 0) / trades.length, 1) : 0,
    eligibility,
    tradeLog: trades
  };
};

const main = async () => {
  const datasets = [];
  for (const asset of ASSETS) {
    const candles = asset.marketClass === 'crypto'
      ? await fetchBinance(asset.symbol)
      : await fetchYahoo(asset.symbol);
    if (candles.length < 500) throw new Error(`${asset.symbol}: numai ${candles.length} lumânări.`);
    datasets.push({ asset, candles });
  }

  const fullRows = datasets.map(({ asset, candles }) => run(
    asset,
    candles,
    candles[Math.min(300, candles.length - 1)].timestamp
  ));
  const holdoutRows = datasets.map(({ asset, candles }) => {
    const evaluationStart = candles[Math.min(300, candles.length - 1)].timestamp;
    const eligible = candles.filter(candle => candle.timestamp >= evaluationStart);
    const holdoutStart = eligible[Math.floor(eligible.length * 0.7)]?.timestamp || evaluationStart;
    return run(asset, candles, holdoutStart);
  });

  const aggregate = rows => {
    const trades = rows.reduce((sum, row) => sum + row.trades, 0);
    const wins = rows.reduce((sum, row) => sum + row.wins, 0);
    const allTrades = rows.flatMap(row => row.tradeLog);
    const grossWinR = allTrades.filter(trade => trade.rMultiple > 0).reduce((sum, trade) => sum + trade.rMultiple, 0);
    const grossLossR = Math.abs(allTrades.filter(trade => trade.rMultiple <= 0).reduce((sum, trade) => sum + trade.rMultiple, 0));
    return {
      assets: rows.length,
      profitableAssets: rows.filter(row => row.returnPercent > 0).length,
      breakouts: rows.reduce((sum, row) => sum + row.breakouts, 0),
      retests: rows.reduce((sum, row) => sum + row.retests, 0),
      rejected: rows.reduce((sum, row) => sum + row.rejected, 0),
      trades,
      winRate: trades ? round(wins / trades * 100, 1) : 0,
      profitFactor: grossLossR ? round(grossWinR / grossLossR) : grossWinR ? 99 : 0,
      expectancyR: trades ? round(allTrades.reduce((sum, trade) => sum + trade.rMultiple, 0) / trades) : 0,
      averageReturnPercent: round(rows.reduce((sum, row) => sum + row.returnPercent, 0) / rows.length),
      averageMaxDrawdownPercent: round(rows.reduce((sum, row) => sum + row.maxDrawdownPercent, 0) / rows.length),
      medianStopPercent: (() => {
        const stops = allTrades.map(trade => trade.initialRiskPercent).sort((left, right) => left - right);
        return stops.length ? round(stops[Math.floor(stops.length / 2)]) : 0;
      })()
    };
  };

  const printable = rows => rows.map(({ tradeLog, ...row }) => row);
  process.stdout.write(`${JSON.stringify({
    generatedAt: new Date().toISOString(),
    strategy: 'Weekly Trend + Daily Volatility Contraction Breakout-Retest · Tight Risk',
    assumptions: {
      entry: 'next Daily open after bullish retest',
      target: '2R',
      riskPerTradePercent: 0.5,
      maxStopStocksPercent: 4,
      maxStopCryptoPercent: 6,
      atrStopMultiple: ATR_STOP_MULTIPLE,
      feePerSidePercent: 0.075,
      slippagePerSidePercent: 0.05,
      sameBarPolicy: 'stop before target'
    },
    full: {
      aggregate: aggregate(fullRows),
      rows: printable(fullRows),
      tradeLog: fullRows.flatMap(row => row.tradeLog.map(trade => ({ symbol: row.symbol, ...trade })))
    },
    holdout30: { aggregate: aggregate(holdoutRows), rows: printable(holdoutRows) }
  }, null, 2)}\n`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
