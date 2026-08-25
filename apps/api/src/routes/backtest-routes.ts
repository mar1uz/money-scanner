import { Router } from 'express';
import { AppState } from '../services/app-state.js';
import { BacktestSimulatorService } from '../services/backtest-service.js';
import {
  AssetMarketClass,
  BacktestComparisonResult,
  BacktestDirectionMode,
  BacktestParams,
  BacktestStrategy,
  Candle,
  Timeframe
} from '@money-scanner/shared';

export const backtestRouter = Router();
const simulator = new BacktestSimulatorService();

const validMarketClasses = new Set<AssetMarketClass>(['crypto', 'stocks', 'metals']);
const parseMarketClass = (value: unknown): AssetMarketClass | undefined => {
  const marketClass = String(value || '') as AssetMarketClass;
  return validMarketClasses.has(marketClass) ? marketClass : undefined;
};

const runWeeklyReclaim = async (
  symbol: string,
  marketClass: AssetMarketClass,
  params: Partial<BacktestParams>
) => {
  const marketData = AppState.getInstance().marketData;
  const [daily, weekly, confirmation] = await Promise.all([
    marketData.getCandles(symbol, '1d', 1000, marketClass),
    marketData.getCandles(symbol, '1w', 300, marketClass),
    marketData.getCandles(symbol, '8h', 2000, marketClass)
  ]);
  return simulator.runWeeklyReclaimBacktest(symbol, daily, weekly, confirmation, {
    ...params,
    timeframe: '1d',
    strategy: 'weekly_reclaim',
    marketClass
  });
};

const loadDeepDailyHistory = async (
  symbol: string,
  marketClass: AssetMarketClass,
  targetCount = 2000
): Promise<Candle[]> => {
  const marketData = AppState.getInstance().marketData;
  let candles = await marketData.getCandles(symbol, '1d', Math.min(1000, targetCount), marketClass);
  for (let page = 0; page < 3 && candles.length < targetCount && candles.length > 0; page += 1) {
    let older: Candle[];
    try {
      older = await marketData.getCandlesBefore(
        symbol,
        '1d',
        candles[0].timestamp,
        Math.min(1000, targetCount - candles.length),
        marketClass
      );
    } catch {
      break;
    }
    const known = new Set(candles.map(candle => candle.timestamp));
    const uniqueOlder = older.filter(candle => !known.has(candle.timestamp));
    if (!uniqueOlder.length) break;
    candles = [...uniqueOlder, ...candles].sort((left, right) => left.timestamp - right.timestamp);
  }
  return candles.slice(-targetCount);
};

const runConnorsRsi2 = async (
  symbol: string,
  marketClass: AssetMarketClass,
  params: Partial<BacktestParams>
) => simulator.runConnorsRsi2Backtest(
  symbol,
  await loadDeepDailyHistory(symbol, marketClass),
  { ...params, timeframe: '1d', strategy: 'connors_rsi2', marketClass }
);

const runResearchStrategy = (
  strategy: Extract<BacktestStrategy, 'weekly_reclaim' | 'connors_rsi2'>,
  symbol: string,
  marketClass: AssetMarketClass,
  params: Partial<BacktestParams>
) => strategy === 'connors_rsi2'
  ? runConnorsRsi2(symbol, marketClass, params)
  : runWeeklyReclaim(symbol, marketClass, params);

backtestRouter.get('/backtest-compare', async (req, res) => {
  const directionMode: BacktestDirectionMode = req.query.directionMode === 'LONG_SHORT' ? 'LONG_SHORT' : 'LONG_ONLY';
  const strategy: Extract<BacktestStrategy, 'weekly_reclaim' | 'connors_rsi2'> = req.query.strategy === 'weekly_reclaim'
    ? 'weekly_reclaim'
    : 'connors_rsi2';
  const assets: Array<{ symbol: string; marketClass: AssetMarketClass }> = [
    { symbol: 'BTC', marketClass: 'crypto' },
    { symbol: 'ETH', marketClass: 'crypto' },
    { symbol: 'SOL', marketClass: 'crypto' },
    { symbol: 'SPY', marketClass: 'stocks' },
    { symbol: 'QQQ', marketClass: 'stocks' },
    { symbol: 'NVDA', marketClass: 'stocks' },
    { symbol: 'AAPL', marketClass: 'stocks' },
    { symbol: 'XAU', marketClass: 'metals' },
    { symbol: 'XAG', marketClass: 'metals' },
    { symbol: 'COPPER', marketClass: 'metals' }
  ];
  const rows: BacktestComparisonResult['rows'] = [];
  const concurrency = 3;

  for (let index = 0; index < assets.length; index += concurrency) {
    const batch = assets.slice(index, index + concurrency);
    const settled = await Promise.allSettled(batch.map(async asset => ({
      asset,
      result: await runResearchStrategy(strategy, asset.symbol, asset.marketClass, { directionMode })
    })));
    settled.forEach((entry, batchIndex) => {
      const asset = batch[batchIndex];
      if (entry.status === 'fulfilled') {
        const result = entry.value.result;
        rows.push({
          symbol: asset.symbol,
          marketClass: asset.marketClass,
          totalTrades: result.totalTrades,
          winRate: result.winRate,
          profitFactor: result.profitFactor,
          expectancyR: result.expectancyR || 0,
          totalReturnPercent: result.totalReturnPercent,
          buyAndHoldReturnPercent: result.buyAndHoldReturnPercent,
          maxDrawdownPercent: result.maxDrawdownPercent,
          sharpeRatio: result.sharpeRatio,
          periodStart: result.params.startTimestamp,
          periodEnd: result.params.endTimestamp
        });
      } else {
        rows.push({
          symbol: asset.symbol,
          marketClass: asset.marketClass,
          totalTrades: 0,
          winRate: 0,
          profitFactor: 0,
          expectancyR: 0,
          totalReturnPercent: 0,
          buyAndHoldReturnPercent: 0,
          maxDrawdownPercent: 0,
          sharpeRatio: 0,
          periodStart: 0,
          periodEnd: 0,
          error: entry.reason instanceof Error ? entry.reason.message : 'Backtest indisponibil.'
        });
      }
    });
  }

  const validRows = rows.filter(row => !row.error);
  const totalTrades = validRows.reduce((sum, row) => sum + row.totalTrades, 0);
  const sortedProfitFactors = validRows.map(row => row.profitFactor).sort((left, right) => left - right);
  const medianProfitFactor = sortedProfitFactors.length
    ? sortedProfitFactors[Math.floor(sortedProfitFactors.length / 2)]
    : 0;
  const average = (values: number[]) => values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
  const payload: BacktestComparisonResult = {
    strategy,
    directionMode,
    rows,
    aggregate: {
      testedAssets: validRows.length,
      profitableAssets: validRows.filter(row => row.totalReturnPercent > 0).length,
      totalTrades,
      weightedWinRate: totalTrades
        ? Number((validRows.reduce((sum, row) => sum + row.winRate * row.totalTrades, 0) / totalTrades).toFixed(1))
        : 0,
      medianProfitFactor: Number(medianProfitFactor.toFixed(2)),
      averageExpectancyR: Number(average(validRows.map(row => row.expectancyR)).toFixed(2)),
      averageReturnPercent: Number(average(validRows.map(row => row.totalReturnPercent)).toFixed(2)),
      averageMaxDrawdownPercent: Number(average(validRows.map(row => row.maxDrawdownPercent)).toFixed(2))
    },
    generatedAt: Date.now()
  };
  res.set('Cache-Control', 'no-store');
  res.json(payload);
});

backtestRouter.get('/backtest/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const timeframe = (req.query.timeframe as Timeframe) || '1h';
    const appState = AppState.getInstance();

    if (req.query.strategy === 'weekly_reclaim') {
      const marketClass = parseMarketClass(req.query.marketClass) || 'crypto';
      const result = await runWeeklyReclaim(symbol, marketClass, {
        directionMode: req.query.directionMode === 'LONG_SHORT' ? 'LONG_SHORT' : 'LONG_ONLY'
      });
      return res.json(result);
    }
    if (req.query.strategy === 'connors_rsi2') {
      const marketClass = parseMarketClass(req.query.marketClass) || 'crypto';
      const result = await runConnorsRsi2(symbol, marketClass, {
        directionMode: req.query.directionMode === 'LONG_SHORT' ? 'LONG_SHORT' : 'LONG_ONLY'
      });
      return res.json(result);
    }

    const candles = await appState.marketData.getCandles(symbol, timeframe, 250);
    const result = simulator.runBacktest(symbol, candles, {
      timeframe,
      entryTierThreshold: (req.query.entryTier as any) || 'Bullish',
      exitTierThreshold: (req.query.exitTier as any) || 'Bearish'
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to run backtest simulation', details: err.message });
  }
});

backtestRouter.post('/backtest/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const appState = AppState.getInstance();
    const params = req.body || {};
    const timeframe = (params.timeframe as Timeframe) || '1h';

    if (params.strategy === 'weekly_reclaim') {
      const marketClass = parseMarketClass(params.marketClass) || 'crypto';
      const result = await runWeeklyReclaim(symbol, marketClass, params);
      return res.json(result);
    }
    if (params.strategy === 'connors_rsi2') {
      const marketClass = parseMarketClass(params.marketClass) || 'crypto';
      const result = await runConnorsRsi2(symbol, marketClass, params);
      return res.json(result);
    }

    const candles = await appState.marketData.getCandles(symbol, timeframe, 250);
    const result = simulator.runBacktest(symbol, candles, params);

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to run custom backtest simulation', details: err.message });
  }
});
