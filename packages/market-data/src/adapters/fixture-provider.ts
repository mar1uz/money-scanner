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

  public getCandles(symbol: string, count = 250, timeframeHours = 1): Candle[] {
    const basePrice = this.basePrices.get(symbol) || 10.0;
    const candles: Candle[] = [];
    const now = Date.now();
    const intervalMs = timeframeHours * 3600 * 1000;

    let currentPrice = basePrice;
    const isBull = symbol === 'BTC' || symbol === 'SOL' || symbol === 'NVDA' || symbol === 'XAU' || symbol === 'SUI';

    for (let i = count; i >= 0; i--) {
      const timestamp = now - i * intervalMs;
      const drift = isBull ? 0.0008 : -0.0004;
      const noise = (Math.sin(i * 0.15) * 0.012) + ((Math.random() - 0.5) * 0.008);
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

  public getPriceQuote(symbol: string): AssetPriceQuote {
    const basePrice = this.basePrices.get(symbol) || 10.0;
    const isBull = symbol === 'BTC' || symbol === 'SOL' || symbol === 'NVDA' || symbol === 'XAU' || symbol === 'SUI';
    const change24h = isBull ? Number((Math.random() * 4 + 1.2).toFixed(2)) : Number((Math.random() * -3 - 0.5).toFixed(2));
    const price = Number((basePrice * (1 + change24h / 100)).toFixed(4));

    return {
      symbol,
      price,
      change24h,
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
