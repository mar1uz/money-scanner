import { Router } from 'express';
import { AppState } from '../services/app-state.js';
import { MONEY_LINE_VERSION } from '@money-scanner/shared';

export const marketRouter = Router();

type BubbleTimeframe = '1d' | '1w' | '1m';

let cryptoBubblesCache: { data: unknown[]; source: 'coingecko' | 'coinpaprika'; updatedAt: number } | null = null;
const CRYPTO_BUBBLES_CACHE_MS = 180_000; // 3 minutes cache

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
    change: typeof coin[changeField] === 'number' ? coin[changeField] : null,
    changeYtd: typeof coin.price_change_percentage_1y_in_currency === 'number'
      ? Number(coin.price_change_percentage_1y_in_currency.toFixed(2))
      : (typeof coin.price_change_percentage_1y === 'number' ? Number(coin.price_change_percentage_1y.toFixed(2)) : null)
  }));
};

const formatCoinPaprikaBubbles = (coins: any[], timeframe: BubbleTimeframe) => {
  return coins.map((c: any) => {
    const q = c.quotes?.USD || {};
    const change = timeframe === '1w'
      ? q.percent_change_7d
      : timeframe === '1m'
        ? q.percent_change_30d
        : q.percent_change_24h;
    return {
      id: c.id,
      symbol: String(c.symbol || '').toUpperCase(),
      name: c.name,
      image: '',
      rank: c.rank,
      price: q.price,
      marketCap: q.market_cap,
      change: typeof change === 'number' ? change : null,
      changeYtd: typeof q.percent_change_1y === 'number' ? q.percent_change_1y : null
    };
  });
};

marketRouter.get('/crypto/bubbles', async (req, res) => {
  const requestedTimeframe = String(req.query.timeframe || '1d');
  const timeframe: BubbleTimeframe = requestedTimeframe === '1w' || requestedTimeframe === '1m'
    ? requestedTimeframe
    : '1d';

  try {
    if (!cryptoBubblesCache || Date.now() - cryptoBubblesCache.updatedAt > CRYPTO_BUBBLES_CACHE_MS) {
      try {
        const response = await fetch(
          'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=150&page=1&sparkline=false&price_change_percentage=24h,7d,30d,1y',
          { headers: { accept: 'application/json', 'user-agent': 'MoneyScanner360/1.0' }, signal: AbortSignal.timeout(10_000) }
        );
        if (!response.ok) throw new Error(`CoinGecko returned HTTP ${response.status}`);
        cryptoBubblesCache = { data: await response.json() as unknown[], source: 'coingecko', updatedAt: Date.now() };
      } catch (cgErr: any) {
        console.warn('CoinGecko bubbles failed, attempting CoinPaprika fallback:', cgErr.message);
        const paprikaResponse = await fetch(
          'https://api.coinpaprika.com/v1/tickers?quotes=USD&limit=150',
          { headers: { accept: 'application/json', 'user-agent': 'MoneyScanner360/1.0' }, signal: AbortSignal.timeout(10_000) }
        );
        if (!paprikaResponse.ok) throw new Error(`CoinPaprika returned HTTP ${paprikaResponse.status}`);
        cryptoBubblesCache = { data: await paprikaResponse.json() as unknown[], source: 'coinpaprika', updatedAt: Date.now() };
      }
    }

    const bubbles = cryptoBubblesCache.source === 'coinpaprika'
      ? formatCoinPaprikaBubbles(cryptoBubblesCache.data, timeframe)
      : formatCryptoBubbles(cryptoBubblesCache.data, timeframe);

    res.set('Cache-Control', 'public, max-age=60');
    return res.json(bubbles);
  } catch (err: any) {
    console.error('Crypto bubbles upstream error, serving AppState fallback:', err.message);
    if (cryptoBubblesCache) {
      const bubbles = cryptoBubblesCache.source === 'coinpaprika'
        ? formatCoinPaprikaBubbles(cryptoBubblesCache.data, timeframe)
        : formatCryptoBubbles(cryptoBubblesCache.data, timeframe);
      return res.json(bubbles);
    }

    try {
      const appState = AppState.getInstance();
      const rows = await appState.refreshSignals(timeframe === '1m' ? '1w' : timeframe, 'crypto');
      const fallbackBubbles = rows
        .filter(r => r.marketClass === 'crypto')
        .sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0))
        .slice(0, 150)
        .map((r, i) => ({
          id: r.symbol.toLowerCase(),
          symbol: r.symbol.toUpperCase(),
          name: r.name,
          image: '',
          rank: i + 1,
          price: r.price,
          marketCap: r.marketCap || 0,
          change: timeframe === '1d' ? r.change24h : (r.timeframeChangePercent ?? r.change24h),
          changeYtd: r.changeYtd ?? null
        }));
      return res.json(fallbackBubbles);
    } catch (fallbackErr: any) {
      return res.status(502).json({ error: 'Failed to fetch live crypto market data' });
    }
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
