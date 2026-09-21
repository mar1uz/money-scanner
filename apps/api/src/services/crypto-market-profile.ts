// Aggregator market data is not exchange OHLCV. Never turn sampled prices or
// rolling 24h volume into candles / Money Line signals.
export type CryptoProvider = 'coingecko' | 'coinpaprika';
import type { Timeframe, MoneyLineSignal } from '@money-scanner/shared';
import { dexMarketData, type DexMarketDataService } from './dex-market-data.js';
export interface CryptoReference { coinGeckoId?: string; coinPaprikaId?: string }
export interface CryptoMarketProfile {
  id: string;
  provider: CryptoProvider;
  symbol: string;
  name: string;
  price: number;
  change24h: number | null;
  marketCap: number | null;
  rank: number | null;
  high24h: number | null;
  low24h: number | null;
  volume24h: number | null;
  timestamp: number;
}

const numberOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

export function normalizeCryptoProfile(row: any, provider: CryptoProvider): CryptoMarketProfile | null {
  const quote = provider === 'coinpaprika' ? row?.quotes?.USD : row;
  const price = numberOrNull(provider === 'coinpaprika' ? quote?.price : quote?.current_price);
  const timestamp = Date.parse(row?.last_updated);
  if (!row?.id || !row?.symbol || !row?.name || price === null || price <= 0 || !Number.isFinite(timestamp)) return null;
  return {
    id: row.id, provider, symbol: String(row.symbol).toUpperCase(), name: row.name, price, timestamp,
    change24h: numberOrNull(provider === 'coinpaprika' ? quote?.percent_change_24h : quote?.price_change_percentage_24h),
    marketCap: numberOrNull(quote?.market_cap),
    rank: numberOrNull(provider === 'coinpaprika' ? row.rank : row.market_cap_rank),
    high24h: numberOrNull(quote?.high_24h), low24h: numberOrNull(quote?.low_24h),
    volume24h: numberOrNull(provider === 'coinpaprika' ? quote?.volume_24h : quote?.total_volume)
  };
}

export class CryptoMarketProfiles {
  private profiles = new Map<string, { value: CryptoMarketProfile; fetchedAt: number }>();
  private history = new Map<string, { prices: number[][]; fetchedAt: number }>();
  constructor(private fetcher: typeof fetch = fetch) {}

  remember(rows: unknown[], provider: CryptoProvider) {
    for (const row of rows) {
      const value = normalizeCryptoProfile(row, provider);
      if (value) this.profiles.set(`${provider}:${value.id}`, { value, fetchedAt: Date.now() });
    }
  }

  private async json(url: string): Promise<any> {
    const response = await this.fetcher(url, {
      signal: AbortSignal.timeout(8_000),
      headers: { accept: 'application/json', ...(process.env.COINGECKO_API_KEY && url.startsWith('https://api.coingecko.com/')
        ? { 'x-cg-demo-api-key': process.env.COINGECKO_API_KEY } : {}) }
    });
    if (!response.ok) throw new Error(`Crypto provider HTTP ${response.status}`);
    return response.json();
  }

  async resolve(symbol: string, reference: CryptoReference = {}): Promise<CryptoMarketProfile> {
    symbol = symbol.toUpperCase();
    if (reference.coinGeckoId && reference.coinPaprikaId) throw new Error('Ambiguous crypto provider');
    let provider: CryptoProvider = reference.coinPaprikaId ? 'coinpaprika' : 'coingecko';
    let id = reference.coinPaprikaId || reference.coinGeckoId;
    if (id && !/^[a-zA-Z0-9_-]{1,150}$/.test(id)) throw new Error('Invalid crypto provider ID');
    if (!id) {
      const matches = [...this.profiles.values()].filter(entry => entry.value.symbol === symbol);
      if (matches.length === 1) ({ id, provider } = matches[0].value);
      else {
        const result = await this.json(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(symbol)}`);
        const exact = (result.coins || []).filter((coin: any) => String(coin.symbol).toUpperCase() === symbol);
        if (exact.length !== 1) throw new Error('Crypto symbol missing or ambiguous; select the exact coin');
        id = exact[0].id;
      }
    }
    const key = `${provider}:${id}`;
    const cached = this.profiles.get(key);
    // A provider ID must also match the selected ticker, never silently switch assets.
    if (cached && cached.value.symbol !== symbol) throw new Error('Crypto identity mismatch');
    if (cached && Date.now() - cached.fetchedAt < 180_000) return cached.value;
    try {
      const response = provider === 'coinpaprika'
        ? await this.json(`https://api.coinpaprika.com/v1/tickers/${encodeURIComponent(id!)}`)
        : await this.json(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(id!)}&sparkline=false`);
      const row = provider === 'coinpaprika' ? response : response.find((item: any) => item.id === id);
      const profile = normalizeCryptoProfile(row, provider);
      if (!profile || profile.id !== id || profile.symbol !== symbol) throw new Error('Crypto identity or quote unavailable');
      this.profiles.set(key, { value: profile, fetchedAt: Date.now() });
      return profile;
    } catch (error) {
      // Bounded stale fallback with original provider timestamp, labelled by the UI.
      if (cached && Date.now() - cached.value.timestamp < 60 * 60_000) return cached.value;
      throw error;
    }
  }

  /** Exact-ticker candidates, best market-cap rank first, for disambiguating
   * shared tickers (CVX: Convex Finance vs a tokenized Chevron stock). */
  async resolveCandidates(symbol: string, limit = 3): Promise<CryptoMarketProfile[]> {
    symbol = symbol.toUpperCase();
    const result = await this.json(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(symbol)}`);
    const exact = (result.coins || [])
      .filter((coin: any) => String(coin.symbol).toUpperCase() === symbol)
      .sort((a: any, b: any) => (a.market_cap_rank || 999999) - (b.market_cap_rank || 999999))
      .slice(0, limit);
    const profiles: CryptoMarketProfile[] = [];
    for (const coin of exact) {
      try {
        profiles.push(await this.resolve(symbol, { coinGeckoId: coin.id }));
      } catch { /* skip unverifiable candidates */ }
    }
    return profiles;
  }

  async prices(profile: CryptoMarketProfile): Promise<number[][]> {
    if (profile.provider !== 'coingecko') return [];
    const key = `${profile.provider}:${profile.id}`;
    const cached = this.history.get(key);
    if (cached && Date.now() - cached.fetchedAt < 180_000) return cached.prices;
    try {
      const response = await this.json(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(profile.id)}/market_chart?vs_currency=usd&days=30`);
      const points = new Map<number, number>();
      for (const point of Array.isArray(response.prices) ? response.prices : []) {
        if (Array.isArray(point) && numberOrNull(point[0]) !== null && point[0] > 0 && numberOrNull(point[1]) !== null && point[1] > 0) points.set(point[0], point[1]);
      }
      const prices = [...points].sort((a, b) => a[0] - b[0]);
      this.history.set(key, { prices, fetchedAt: Date.now() });
      return prices;
    } catch {
      return cached && Date.now() - cached.fetchedAt < 60 * 60_000 ? cached.prices : [];
    }
  }
}

export const cryptoMarketProfiles = new CryptoMarketProfiles();

export async function aggregatedCryptoDetail(
  symbol: string,
  timeframe: Timeframe,
  reference: CryptoReference,
  profiles = cryptoMarketProfiles,
  dex: Pick<DexMarketDataService, 'load'> = dexMarketData,
  calculateLatest?: (symbol: string, timeframe: Timeframe, candles: import('@money-scanner/shared').Candle[]) => MoneyLineSignal | null
) {
  const profile = await profiles.resolve(symbol, reference);
  const [priceHistory, dexMarket] = await Promise.all([profiles.prices(profile), dex.load(profile, timeframe)]);
  const source = profile.provider === 'coingecko' ? 'CoinGecko' : 'CoinPaprika';
  const candles = dexMarket?.candles || [];
  const closedCandles = candles.filter(candle => candle.isClosed);
  const minCandles = timeframe === '1w' ? 15 : (timeframe === '1d' ? 30 : 210);
  const activeSignal = calculateLatest && dexMarket?.candleSource === 'GeckoTerminal' && closedCandles.length >= minCandles ? calculateLatest(symbol, timeframe, closedCandles) : null;
  return {
    info: {
      symbol: profile.symbol, name: profile.name, marketClass: 'crypto', quoteCurrency: 'USD',
      marketCap: profile.marketCap, rank: profile.rank,
      coinGeckoId: profile.provider === 'coingecko' ? profile.id : undefined,
      coinPaprikaId: profile.provider === 'coinpaprika' ? profile.id : undefined
    },
    quote: { ...profile, source, isStale: Date.now() - profile.timestamp > 10 * 60_000 },
    activeTimeframe: timeframe, activeSignal, multiTimeframe: null,
    candles, priceHistory, dexMarket, news: [], xTrends: [], aiExplanation: null,
    dataAvailability: dexMarket ? 'dex-fallback' : 'aggregated-price-only', lastUpdated: profile.timestamp
  };
}
