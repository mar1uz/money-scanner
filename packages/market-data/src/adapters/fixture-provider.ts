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
      'NVDA': 18.53,
      'BTC': -26.59,
      'ETH': -35.96,
      'SOL': -38.66,
      'BNB': -30.35,
      'SUI': -53.58,
      'FET': -38.50,
      'RENDER': -1.79,
      'TAO': -12.23,
      'NEAR': 7.60,
      'INJ': -42.50,
      'AAVE': -38.96,
      'PEPE': -36.14,
      'DOGE': -40.43,
      'SHIB': -32.50,
      'UNI': -28.40,
      'ICP': -35.20,
      'AVAX': -48.69,
      'ADA': -47.93,
      'XRP': -45.78,
      'DOT': -58.64,
      'PLTR': 24.50,
      'TSLA': -25.88,
      'AAPL': 12.24,
      'MSFT': 4.40,
      'GOOGL': 8.50,
      'AMZN': 6.00,
      'META': 8.20,
      'TSM': 14.50,
      'AVGO': 12.80,
      'ARM': 18.40,
      'WMT': 16.20,
      'COST': 8.50,
      'PG': 4.20,
      'KO': 2.80,
      'PEP': -1.40,
      'MCD': 1.20,
      'XOM': 4.20,
      'CVX': -2.50,
      'XAU': 2.23,
      'XAG': 4.10,
      'OIL': -4.40,
      'LMT': 14.20,
      'RTX': 14.50,
      'SPACEX': 25.00,
      'SPY': 5.80,
      'QQQ': 6.40
    };

    if (knownYtd[symbol] !== undefined) {
      return Number((knownYtd[symbol] + change24h * 0.1).toFixed(2));
    }

    const isPositive = (symbol.charCodeAt(0) * 7 + (symbol.charCodeAt(1) || 0) * 11) % 100 > 60;
    const base = isPositive 
      ? ((symbol.charCodeAt(0) * 13) % 25 + 2.5) 
      : -((symbol.charCodeAt(0) * 9) % 40 + 5.0);
    return Number((base + (change24h * 0.1)).toFixed(2));
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
