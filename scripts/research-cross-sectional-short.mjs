import { pathToFileURL } from 'node:url';
import { DAY_MS, atr, round, sma } from './backtest-tight-risk-breakout.mjs';
import { SHORT_RESEARCH_ASSETS } from './backtest-weekly-donchian-short-50plus.mjs';
import { FRESH_STOCK_HOLDOUT, fetchYahooMaximumHistory } from './research-profitable-short-strategies.mjs';

const STOCKS = [...SHORT_RESEARCH_ASSETS.filter(asset => asset.marketClass === 'stocks'), ...FRESH_STOCK_HOLDOUT]
  .filter((asset, index, values) => values.findIndex(value => value.symbol === asset.symbol) === index);
const STRATEGIES = ['weakest_3m_2r', 'weakest_6m_2r', 'weakest_12m_2r', 'weakest_6m_monthly', 'weakest_6m_deepbear_2r'];
const FEE = Number(process.env.FEE_PER_SIDE_PERCENT || 0.075);
const SLIPPAGE = Number(process.env.SLIPPAGE_PER_SIDE_PERCENT || 0.05);
const BORROW_APR = Number(process.env.BORROW_APR_PERCENT || 3);

const prepare = (asset, candles) => {
  const closes = candles.map(candle => candle.close);
  return { asset, candles, closes, sma20: sma(closes, 20), sma200: sma(closes, 200), atr14: atr(candles, 14) };
};

const dateKey = timestamp => new Date(timestamp).toISOString().slice(0, 10);
const monthKey = timestamp => new Date(timestamp).toISOString().slice(0, 7);

const closeTrade = (position, rawExit, exitTimestamp, reason) => {
  const exit = rawExit * (1 + SLIPPAGE / 100);
  const days = Math.max(1, Math.round((exitTimestamp - position.entryTimestamp) / DAY_MS));
  const gross = (position.entry - exit) * position.quantity;
  const fees = (position.entry + exit) * position.quantity * FEE / 100;
  const borrow = position.entry * position.quantity * BORROW_APR / 100 * days / 365;
  const net = gross - fees - borrow;
  return { rMultiple: net / position.riskCash, days, reason, initialRiskPercent: position.riskPercent };
};

const marketBear = (spy, index) => index >= 252
  && spy.closes[index] < spy.closes[index - 21]
  && spy.closes[index] < spy.closes[index - 252]
  && spy.closes[index] < spy.sma200[index];

const deepBear = (spy, index) => {
  const high252 = Math.max(...spy.closes.slice(index - 251, index + 1));
  return spy.closes[index] / high252 - 1 <= -0.2;
};

const run = (strategy, datasets, spy, startTimestamp, endTimestamp) => {
  const lookback = strategy.includes('_3m_') ? 63 : strategy.includes('_12m_') ? 252 : 126;
  const fixedTarget = strategy !== 'weakest_6m_monthly';
  const byDate = new Map(datasets.flatMap(data => data.candles.map((candle, index) => [
    `${data.asset.symbol}:${dateKey(candle.timestamp)}`,
    { data, candle, index }
  ])));
  const spyDates = new Map(spy.candles.map((candle, index) => [dateKey(candle.timestamp), index]));
  const positions = new Map();
  const pending = [];
  const trades = [];
  let signals = 0;
  let rejected = 0;

  for (let spyIndex = 252; spyIndex < spy.candles.length - 1; spyIndex += 1) {
    const candle = spy.candles[spyIndex];
    if (candle.timestamp < startTimestamp || candle.timestamp > endTimestamp) continue;
    const currentMonth = monthKey(candle.timestamp);
    const nextMonth = monthKey(spy.candles[spyIndex + 1].timestamp);
    const isMonthEnd = currentMonth !== nextMonth;

    for (let index = pending.length - 1; index >= 0; index -= 1) {
      const order = pending[index];
      if (order.entryDate !== dateKey(candle.timestamp)) continue;
      const row = byDate.get(`${order.symbol}:${order.entryDate}`);
      if (!row || positions.has(order.symbol)) {
        pending.splice(index, 1);
        continue;
      }
      const entry = row.candle.open * (1 - SLIPPAGE / 100);
      const riskPerUnit = Math.min(2 * order.atr, entry * 0.08);
      if (!(riskPerUnit > 0)) {
        rejected += 1;
      } else {
        const quantity = Math.min(10_000 * 0.0025 / riskPerUnit, 10_000 / entry);
        positions.set(order.symbol, {
          entry,
          entryTimestamp: row.candle.timestamp,
          entryIndex: row.index,
          stop: entry + riskPerUnit,
          target: fixedTarget ? entry - 2 * riskPerUnit : undefined,
          riskPercent: riskPerUnit / entry * 100,
          riskCash: riskPerUnit * quantity,
          quantity
        });
      }
      pending.splice(index, 1);
    }

    for (const [symbol, position] of positions) {
      const row = byDate.get(`${symbol}:${dateKey(candle.timestamp)}`);
      if (!row) continue;
      if (row.candle.high >= position.stop) {
        trades.push(closeTrade(position, Math.max(row.candle.open, position.stop), row.candle.timestamp, 'StopLoss'));
        positions.delete(symbol);
      } else if (position.target && row.candle.low <= position.target) {
        trades.push(closeTrade(position, position.target, row.candle.timestamp, 'TakeProfit2R'));
        positions.delete(symbol);
      } else if (!marketBear(spy, spyIndex) || row.index - position.entryIndex >= 21) {
        position.exitNext = !marketBear(spy, spyIndex) ? 'MarketRebound' : 'MonthlyExit';
      }
    }

    for (const [symbol, position] of positions) {
      if (!position.exitNext) continue;
      const nextRow = byDate.get(`${symbol}:${dateKey(spy.candles[spyIndex + 1].timestamp)}`);
      if (!nextRow) continue;
      trades.push(closeTrade(position, nextRow.candle.open, nextRow.candle.timestamp, position.exitNext));
      positions.delete(symbol);
    }

    if (!isMonthEnd || !marketBear(spy, spyIndex) || (strategy.includes('deepbear') && !deepBear(spy, spyIndex))) continue;
    const ranked = datasets.flatMap(data => {
      const row = byDate.get(`${data.asset.symbol}:${dateKey(candle.timestamp)}`);
      if (!row || row.index < Math.max(252, lookback) || positions.has(data.asset.symbol)) return [];
      const close = row.candle.close;
      const eligible = close < data.sma200[row.index] && close < data.sma20[row.index];
      if (!eligible) return [];
      return [{ symbol: data.asset.symbol, momentum: close / data.closes[row.index - lookback] - 1, atr: data.atr14[row.index] }];
    }).sort((left, right) => left.momentum - right.momentum);
    const selected = ranked.slice(0, Math.max(1, Math.ceil(ranked.length * 0.1)));
    signals += selected.length;
    for (const item of selected) pending.push({
      ...item,
      entryDate: dateKey(spy.candles[spyIndex + 1].timestamp)
    });
  }

  const finalSpy = spy.candles.findLast(candle => candle.timestamp <= endTimestamp) || spy.candles.at(-1);
  for (const [symbol, position] of positions) {
    const row = byDate.get(`${symbol}:${dateKey(finalSpy.timestamp)}`);
    if (row) trades.push(closeTrade(position, row.candle.close, row.candle.timestamp, 'EndPeriod'));
  }
  const winners = trades.filter(trade => trade.rMultiple > 0);
  const losers = trades.filter(trade => trade.rMultiple <= 0);
  const grossWins = winners.reduce((sum, trade) => sum + trade.rMultiple, 0);
  const grossLosses = Math.abs(losers.reduce((sum, trade) => sum + trade.rMultiple, 0));
  const stops = trades.map(trade => trade.initialRiskPercent).sort((a, b) => a - b);
  return {
    signals,
    rejected,
    trades: trades.length,
    wins: winners.length,
    winRate: trades.length ? round(winners.length / trades.length * 100, 1) : 0,
    profitFactor: grossLosses ? round(grossWins / grossLosses) : grossWins ? 99 : 0,
    expectancyR: trades.length ? round(trades.reduce((sum, trade) => sum + trade.rMultiple, 0) / trades.length) : 0,
    medianStopPercent: stops.length ? round(stops[Math.floor(stops.length / 2)]) : 0
  };
};

const main = async () => {
  const results = await Promise.allSettled(STOCKS.map(async asset => {
    const candles = await fetchYahooMaximumHistory(asset.providerSymbol);
    return prepare(asset, candles);
  }));
  const datasets = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
  const failures = results.flatMap((result, index) => result.status === 'rejected'
    ? [{ symbol: STOCKS[index].symbol, error: String(result.reason?.message || result.reason) }]
    : []);
  const spy = datasets.find(data => data.asset.symbol === 'SPY');
  const eligible = spy.candles.slice(300);
  const split60 = eligible[Math.floor(eligible.length * 0.6)].timestamp;
  const split80 = eligible[Math.floor(eligible.length * 0.8)].timestamp;
  const phase = process.env.PHASE || 'calibration';
  const candidate = process.env.CANDIDATE;
  const strategies = phase === 'final' ? STRATEGIES.filter(value => value === candidate) : STRATEGIES;
  const start = phase === 'calibration' ? eligible[0].timestamp : phase === 'validation' ? split60 : split80;
  const end = phase === 'calibration'
    ? spy.candles.findLast(candle => candle.timestamp < split60).timestamp
    : phase === 'validation'
      ? spy.candles.findLast(candle => candle.timestamp < split80).timestamp
      : eligible.at(-1).timestamp;
  process.stdout.write(`${JSON.stringify({
    phase,
    assumptions: {
      assets: datasets.length,
      selection: 'bottom 10% relative momentum at month-end',
      feePerSidePercent: FEE,
      slippagePerSidePercent: SLIPPAGE,
      annualBorrowPercent: BORROW_APR,
      maximumStopPercent: 8,
      riskPerTradePercent: 0.25,
      periodStart: dateKey(start),
      periodEnd: dateKey(end)
    },
    failures,
    results: strategies.map(strategy => ({ strategy, result: run(strategy, datasets, spy, start, end) }))
  }, null, 2)}\n`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
