import { Candle, AssetPriceQuote, TOP_50_CRYPTO_ASSETS } from '@money-scanner/shared';

export class FixtureMarketProvider {
  private basePrices: Map<string, number> = new Map([
    // --- METALS & COMMODITIES ---
    ['XAU', 2450.0],
    ['XAG', 28.5],
    ['PAXG', 2450.0],
    ['OIL', 78.5],
    ['COPPER', 4.15],

    // --- STOCKS & INDICES ---
    ['SPACEX', 195.0],
    ['NVDA', 125.0],
    ['TSLA', 215.0],
    ['AAPL', 225.0],
    ['MSFT', 445.0],
    ['GOOGL', 178.0],
    ['AMZN', 188.0],
    ['META', 510.0],
    ['PLTR', 32.5],
    ['AMD', 145.0],
    ['MSTR', 1450.0],
    ['COIN', 220.0],
    ['SPY', 555.0],
    ['QQQ', 485.0],

    // --- CRYPTO ---
    ['BTC', 64500],
    ['ETH', 3450],
    ['SOL', 155],
    ['BNB', 580],
    ['XRP', 0.58],
    ['DOGE', 0.12],
    ['ADA', 0.38],
    ['AVAX', 28.5],
    ['SUI', 1.85],
    ['LINK', 12.2],
    ['SHIB', 0.000017],
    ['DOT', 4.5],
    ['NEAR', 5.1],
    ['APT', 8.9],
    ['PEPE', 0.000009],
    ['UNI', 7.8],
    ['ICP', 8.2],
    ['LTC', 68.0],
    ['FET', 1.35],
    ['RENDER', 5.8],
    ['TAO', 320.0],
    ['KAS', 0.14],
    ['XLM', 0.095],
    ['INJ', 21.0],
    ['AAVE', 145.0],
    ['TIA', 5.8],
    ['SEI', 0.32],
    ['OP', 1.65],
    ['ARB', 0.58],
    ['STX', 1.75],
    ['WIF', 2.35],
    ['BONK', 0.000021],
    ['FLOKI', 0.00015],
    ['JUP', 0.85],
    ['MKR', 1950.0],
    ['CRV', 0.28],
    ['LDO', 1.25],
    ['ONDO', 0.72],
    ['PYTH', 0.34],
    ['GRT', 0.16],
    ['IMX', 1.45],
    ['GALA', 0.022],
    ['RUNE', 4.1],
    ['ENA', 0.42],
    ['PENDLE', 3.85],
    ['STRK', 0.41],
    ['AR', 22.5],
    ['FTM', 0.65],
    ['ALGO', 0.13],
    ['BEAM', 0.018]
  ]);

  public getBasePrice(symbol: string): number {
    const direct = this.basePrices.get(symbol);
    if (direct !== undefined) return direct;

    const asset = TOP_50_CRYPTO_ASSETS.find(a => a.symbol === symbol);
    if (asset?.marketCap) {
      if (asset.marketClass === 'stocks') {
        // Realistic stock price based on market cap range
        const mcapB = asset.marketCap / 1e9;
        if (mcapB > 500) return 220.0 + ((symbol.charCodeAt(0) * 13) % 200);
        if (mcapB > 100) return 120.0 + ((symbol.charCodeAt(0) * 11) % 120);
        if (mcapB > 30) return 60.0 + ((symbol.charCodeAt(0) * 7) % 60);
        return 25.0 + ((symbol.charCodeAt(0) * 5) % 30);
      }
      if (asset.marketClass === 'crypto') {
        const mcapB = asset.marketCap / 1e9;
        if (mcapB > 100) return 300.0 + ((symbol.charCodeAt(0) * 17) % 300);
        if (mcapB > 10) return 15.0 + ((symbol.charCodeAt(0) * 11) % 25);
        if (mcapB > 1) return 1.5 + ((symbol.charCodeAt(0) * 3) % 8);
        return 0.25 + ((symbol.charCodeAt(0) * 2) % 1.5);
      }
    }

    return 50.0 + (symbol.charCodeAt(0) % 50);
  }

  public getCandles(symbol: string, count = 250, timeframeHours = 1): Candle[] {
    const basePrice = this.getBasePrice(symbol);
    const candles: Candle[] = [];
    const now = Date.now();
    const intervalMs = timeframeHours * 3600 * 1000;

    let currentPrice = basePrice;
    const isBull = (symbol.charCodeAt(0) + (symbol.charCodeAt(1) || 0)) % 3 !== 0;

    for (let i = count; i >= 0; i--) {
      const timestamp = now - i * intervalMs;
      const drift = isBull ? 0.0006 : -0.0003;
      const noise = (Math.sin(i * 0.15 + symbol.charCodeAt(0)) * 0.012) + ((Math.random() - 0.5) * 0.008);
      const change = drift + noise;

      const open = currentPrice;
      const close = currentPrice * (1 + change);
      const high = Math.max(open, close) * (1 + Math.random() * 0.006);
      const low = Math.min(open, close) * (1 - Math.random() * 0.006);
      const volume = Math.floor(Math.random() * 50000 + 10000);

      candles.push({
        timestamp,
        open: Number(open.toFixed(4)),
        high: Number(high.toFixed(4)),
        low: Number(low.toFixed(4)),
        close: Number(close.toFixed(4)),
        volume,
        isClosed: i > 0
      });

      currentPrice = close;
    }

    return candles;
  }

  public calculateYtd(symbol: string, change24h: number): number {
    const knownYtd: Record<string, number> = {
      'NVDA': 148.5,
      'BTC': 68.4,
      'SOL': 84.2,
      'SUI': 192.0,
      'PLTR': 114.5,
      'TSLA': -12.4,
      'AAPL': 18.6,
      'MSFT': 22.4,
      'GOOGL': 28.5,
      'AMZN': 32.0,
      'META': 58.2,
      'TSM': 74.5,
      'ASML': 38.2,
      'AMD': 16.4,
      'AVGO': 62.8,
      'ARM': 88.4,
      'WMT': 46.2,
      'COST': 38.5,
      'PG': 14.2,
      'KO': 12.8,
      'PEP': 3.4,
      'MCD': 5.2,
      'XOM': 18.2,
      'CVX': 6.5,
      'XAU': 28.4,
      'XAG': 34.2,
      'OIL': -2.4,
      'ETH': 48.2,
      'BNB': 85.0,
      'FET': 140.2,
      'RENDER': 125.0,
      'TAO': 95.0,
      'NEAR': 65.4,
      'LMT': 34.2,
      'RTX': 44.5,
      'SPACEX': 75.0,
      'SPY': 19.8,
      'QQQ': 22.4,
      'DOGE': 42.1,
      'SHIB': 36.5,
      'PEPE': 185.0,
      'AAVE': 78.4,
      'UNI': 32.1,
      'INJ': 64.2,
      'ICP': 45.0,
      'DOT': 8.5,
      'ADA': 12.4,
      'XRP': 24.6
    };

    if (knownYtd[symbol] !== undefined) {
      return Number((knownYtd[symbol] + change24h * 0.2).toFixed(2));
    }

    const isPositive = (symbol.charCodeAt(0) * 7 + (symbol.charCodeAt(1) || 0) * 11) % 100 > 25;
    const base = isPositive 
      ? ((symbol.charCodeAt(0) * 13) % 75 + 8.5) 
      : -((symbol.charCodeAt(0) * 9) % 30 + 2.5);
    return Number((base + (change24h * 0.3)).toFixed(2));
  }

  public getPriceQuote(symbol: string): AssetPriceQuote {
    const basePrice = this.getBasePrice(symbol);
    const isBull = (symbol.charCodeAt(0) + (symbol.charCodeAt(1) || 0)) % 3 !== 0;
    const change24h = isBull ? Number((Math.random() * 3.8 + 0.8).toFixed(2)) : Number((Math.random() * -2.8 - 0.4).toFixed(2));
    const price = Number((basePrice * (1 + change24h / 100)).toFixed(4));
    const changeYtd = this.calculateYtd(symbol, change24h);

    return {
      symbol,
      price,
      change24h,
      changeYtd,
      high24h: Number((price * 1.03).toFixed(4)),
      low24h: Number((price * 0.97).toFixed(4)),
      volume24h: Math.floor(Math.random() * 10000000 + 500000),
      timestamp: Date.now(),
      source: 'FixtureProvider',
      isStale: false
    };
  }

  public getAllQuotes(): AssetPriceQuote[] {
    return TOP_50_CRYPTO_ASSETS.map(a => this.getPriceQuote(a.symbol));
  }
}
