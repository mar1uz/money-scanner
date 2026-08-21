import { Router } from 'express';
import { AppState } from '../services/app-state.js';
import { MONEY_LINE_VERSION } from '@money-scanner/shared';

export const marketRouter = Router();

type BubbleTimeframe = '1d' | '1w' | '1m';

let cryptoBubblesCache: { data: unknown[]; updatedAt: number } | null = null;
const CRYPTO_BUBBLES_CACHE_MS = 60_000;

const formatCryptoBubbles = (coins: any[], timeframe: BubbleTimeframe) => {
  const changeField = timeframe === '1w'
    ? 'price_change_percentage_7d_in_currency'
    : timeframe === '1m'
      ? 'price_change_percentage_30d_in_currency'
      : 'price_change_percentage_24h_in_currency';

  return coins.map((coin: any) => ({
    id: coin.id,
    symbol: String(coin.symbol || '').toUpperCase(),
    name: coin.name,
    image: coin.image,
    rank: coin.market_cap_rank,
    price: coin.current_price,
    marketCap: coin.market_cap,
    change: typeof coin[changeField] === 'number' ? coin[changeField] : null
  }));
};

marketRouter.get('/crypto/bubbles', async (req, res) => {
  const requestedTimeframe = String(req.query.timeframe || '1d');
  const timeframe: BubbleTimeframe = requestedTimeframe === '1w' || requestedTimeframe === '1m'
    ? requestedTimeframe
    : '1d';

  try {
    if (!cryptoBubblesCache || Date.now() - cryptoBubblesCache.updatedAt > CRYPTO_BUBBLES_CACHE_MS) {
      const response = await fetch(
        'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false&price_change_percentage=24h,7d,30d',
        { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(10_000) }
      );
      if (!response.ok) throw new Error(`CoinGecko returned HTTP ${response.status}`);
      cryptoBubblesCache = { data: await response.json() as unknown[], updatedAt: Date.now() };
    }

    const bubbles = formatCryptoBubbles(cryptoBubblesCache.data, timeframe);

    res.set('Cache-Control', 'public, max-age=60');
    res.json(bubbles);
  } catch (err: any) {
    console.error('Crypto bubbles error:', err.message);
    if (cryptoBubblesCache) {
      return res.json(formatCryptoBubbles(cryptoBubblesCache.data, timeframe));
    }
    res.status(502).json({ error: 'Failed to fetch live crypto market data' });
  }
});

marketRouter.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'market-scanner-360-api',
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

marketRouter.get(['/overview', '/market/overview'], async (req, res) => {
  try {
    const appState = AppState.getInstance();
    const overview = await appState.marketData.getMarketOverview();
    res.json(overview);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to compute market overview', details: err.message });
  }
});

marketRouter.get(['/quotes', '/market/quotes'], async (req, res) => {
  try {
    const appState = AppState.getInstance();
    const quotes = await appState.marketData.getAllQuotes();
    res.json(quotes);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch quotes', details: err.message });
  }
});
