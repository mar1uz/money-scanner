import { Candle, AssetPriceQuote, TOP_50_CRYPTO_ASSETS } from '@money-scanner/shared';

export class FixtureMarketProvider {
  private basePrices: Map<string, number> = new Map([
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
    const periodMs = timeframeHours * 3600 * 1000;
    const startTimestamp = now - count * periodMs;

    // Seeded random walk based on symbol characters
    let seed = symbol.split('').reduce((acc, c) => acc + c.charCodeAt(0), 42);
    const pseudoRandom = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };

    let currentPrice = basePrice * 0.85;

    for (let i = 0; i < count; i++) {
      const isLast = i === count - 1;
      const trendFactor = Math.sin(i / 15) * 0.008 + 0.001;
      const noise = (pseudoRandom() - 0.49) * 0.02;
      const change = trendFactor + noise;

      const open = currentPrice;
      currentPrice = currentPrice * (1 + change);
      const high = Math.max(open, currentPrice) * (1 + pseudoRandom() * 0.008);
      const low = Math.min(open, currentPrice) * (1 - pseudoRandom() * 0.008);
      const volume = basePrice * (500 + pseudoRandom() * 1500);

      candles.push({
        timestamp: startTimestamp + i * periodMs,
        open: Number(open.toFixed(4)),
        high: Number(high.toFixed(4)),
        low: Number(low.toFixed(4)),
        close: Number(currentPrice.toFixed(4)),
        volume: Number(volume.toFixed(2)),
        isClosed: !isLast
      });
    }

    return candles;
  }

  public getPriceQuote(symbol: string): AssetPriceQuote {
    const basePrice = this.basePrices.get(symbol) || 10.0;
    const candles = this.getCandles(symbol, 24, 1);
    const latest = candles[candles.length - 1];
    const dayAgo = candles[0];

    const change24h = Number((((latest.close - dayAgo.open) / dayAgo.open) * 100).toFixed(2));
    const high24h = Math.max(...candles.map(c => c.high));
    const low24h = Math.min(...candles.map(c => c.low));
    const volume24h = candles.reduce((acc, c) => acc + c.volume, 0);

    return {
      symbol,
      price: latest.close,
      change24h,
      high24h,
      low24h,
      volume24h: Number(volume24h.toFixed(2)),
      timestamp: latest.timestamp,
      source: 'FixtureMarketProvider',
      isStale: false
    };
  }

  public getAllQuotes(): AssetPriceQuote[] {
    return TOP_50_CRYPTO_ASSETS.map(asset => this.getPriceQuote(asset.symbol));
  }
}
