import { Router } from 'express';
import { AppState } from '../services/app-state.js';
import { MONEY_LINE_VERSION } from '@money-scanner/shared';

export const marketRouter = Router();

marketRouter.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'crypto-scanner-api',
    version: MONEY_LINE_VERSION,
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: Date.now()
  });
});

marketRouter.get('/status', (req, res) => {
  const appState = AppState.getInstance();
  const monitor = appState.marketData.getHealthMonitor();
  res.json({
    providers: monitor.getAllHealth(),
    cachedSignalsCount: appState.cachedSignals.size,
    alertHistoryCount: appState.alertHistory.length,
    timestamp: Date.now()
  });
});

marketRouter.get('/overview', async (req, res) => {
  try {
    const appState = AppState.getInstance();
    const overview = await appState.marketData.getMarketOverview();
    res.json(overview);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to compute market overview', details: err.message });
  }
});

marketRouter.get('/quotes', async (req, res) => {
  try {
    const appState = AppState.getInstance();
    const quotes = await appState.marketData.getAllQuotes();
    res.json(quotes);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch quotes', details: err.message });
  }
});
