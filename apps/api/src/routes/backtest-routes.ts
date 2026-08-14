import { Router } from 'express';
import { AppState } from '../services/app-state.js';
import { BacktestSimulatorService } from '../services/backtest-service.js';
import { Timeframe } from '@money-scanner/shared';

export const backtestRouter = Router();
const simulator = new BacktestSimulatorService();

backtestRouter.get('/backtest/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const timeframe = (req.query.timeframe as Timeframe) || '1h';
    const appState = AppState.getInstance();

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

    const candles = await appState.marketData.getCandles(symbol, timeframe, 250);
    const result = simulator.runBacktest(symbol, candles, params);

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to run custom backtest simulation', details: err.message });
  }
});
