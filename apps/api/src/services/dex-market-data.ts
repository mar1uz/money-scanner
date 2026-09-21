import type { Candle, Timeframe } from '@money-scanner/shared';
import type { CryptoMarketProfile } from './crypto-market-profile.js';

export interface DexPairMetrics {
  chainId: string;
  dexId: string;
  dexUrl: string;
  pairAddress: string;
  contractAddress: string;
  quoteSymbol: string;
  priceUsd: number | null;
  priceChange: { m5: number | null; h1: number | null; h6: number | null; h24: number | null };
  volume: { m5: number | null; h1: number | null; h6: number | null; h24: number | null };
  liquidityUsd: number | null;
  fdvUsd: number | null;
  marketCapUsd: number | null;
  transactions24h: { buys: number; sells: number } | null;
  pairCreatedAt: number | null;
  candles: Candle[];
  candleSource: string;
  /** True when the best exact DEX pair holds dust liquidity while the asset trades real volume elsewhere (CEX / own venue). */
  pairIsDust?: boolean;
}

const finite = (value: unknown): number | null => {
  const parsed = typeof value === 'string' && value.trim() ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null;
};
const positive = (value: unknown): number | null => {
  const parsed = finite(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
};
const safeSegment = (value: unknown) => typeof value === 'string' && /^[a-zA-Z0-9._:-]{1,160}$/.test(value) ? value : null;
const sameAddress = (left: unknown, right: unknown) => String(left || '').toLowerCase() === String(right || '').toLowerCase();

const geckoNetworkId = (dexChainId: string): string => ({
  ethereum: 'eth', polygon: 'polygon_pos', avalanche: 'avax', arbitrum: 'arbitrum',
  optimism: 'optimism', bsc: 'bsc', base: 'base', solana: 'solana', robinhood: 'robinhood'
} as Record<string, string>)[dexChainId] || dexChainId;

// A pair below this liquidity cannot represent a market doing real aggregate volume.
const DUST_PAIR_MAX_LIQUIDITY_USD = 25_000;
const REAL_MARKET_VOLUME_MIN_USD = 100_000;
// CoinGecko market_chart granularity: days=1 -> 5-minute points, 2-90 -> hourly, >90 -> daily.
const MARKET_CHART_DAYS: Record<Timeframe, number> = { '1h': 1, '4h': 14, '8h': 14, '1d': 90, '1w': 90, '1m': 365 };

const candleRequest = (timeframe: Timeframe) => ({
  '1h': { unit: 'hour', aggregate: 1, sourceDurationMs: 3_600_000 },
  '4h': { unit: 'hour', aggregate: 1, sourceDurationMs: 3_600_000 },
  // GeckoTerminal supports hour aggregates 1/4/12 and day aggregate 1.
  // Build the app's other intervals only by aggregating real source candles.
  '8h': { unit: 'hour', aggregate: 1, sourceDurationMs: 3_600_000 },
  '1d': { unit: 'day', aggregate: 1, sourceDurationMs: 86_400_000 },
  '1w': { unit: 'day', aggregate: 1, sourceDurationMs: 86_400_000 },
  '1m': { unit: 'day', aggregate: 1, sourceDurationMs: 86_400_000 }
})[timeframe];

export function normalizeDexCandles(rows: unknown, timeframe: Timeframe, now = Date.now(), durationMs = candleRequest(timeframe).sourceDurationMs): Candle[] {
  if (!Array.isArray(rows)) return [];
  const normalized = new Map<number, Candle>();
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 6) continue;
    const seconds = positive(row[0]);
    const [open, high, low, close, volume] = row.slice(1, 6).map(positive);
    if (seconds === null || open === null || high === null || low === null || close === null || volume === null) continue;
    if (seconds <= 0 || open <= 0 || high <= 0 || low <= 0 || close <= 0 || high < Math.max(open, close, low) || low > Math.min(open, close, high)) continue;
    const timestamp = seconds * 1000;
    normalized.set(timestamp, { timestamp, open, high, low, close, volume, isClosed: now >= timestamp + durationMs });
  }
  return [...normalized.values()].sort((a, b) => a.timestamp - b.timestamp);
}

const bucketStart = (timestamp: number, timeframe: Timeframe) => {
  if (timeframe === '4h') return Math.floor(timestamp / 14_400_000) * 14_400_000;
  if (timeframe === '8h') return Math.floor(timestamp / 28_800_000) * 28_800_000;
  const date = new Date(timestamp);
  if (timeframe === '1w') {
    const utcDayStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    return utcDayStart - ((date.getUTCDay() + 6) % 7) * 86_400_000; // Monday 00:00 UTC
  }
  if (timeframe === '1m') return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  return timestamp;
};

const bucketEnd = (start: number, timeframe: Timeframe) => timeframe === '1m'
  ? Date.UTC(new Date(start).getUTCFullYear(), new Date(start).getUTCMonth() + 1, 1)
  : start + (timeframe === '1w' ? 604_800_000 : timeframe === '4h' ? 14_400_000 : 28_800_000);

export function aggregateDexCandles(candles: Candle[], timeframe: Timeframe, now = Date.now()): Candle[] {
  if (timeframe !== '4h' && timeframe !== '8h' && timeframe !== '1w' && timeframe !== '1m') return candles;
  const buckets = new Map<number, Candle[]>();
  for (const candle of candles) {
    const start = bucketStart(candle.timestamp, timeframe);
    const bucket = buckets.get(start) || [];
    bucket.push(candle);
    buckets.set(start, bucket);
  }
  return [...buckets.entries()].sort(([left], [right]) => left - right).map(([timestamp, rows]) => {
    rows.sort((a, b) => a.timestamp - b.timestamp);
    return {
      timestamp, open: rows[0].open, high: Math.max(...rows.map(row => row.high)), low: Math.min(...rows.map(row => row.low)),
      close: rows[rows.length - 1].close, volume: rows.reduce((sum, row) => sum + row.volume, 0),
      isClosed: rows.every(row => row.isClosed) && now >= bucketEnd(timestamp, timeframe)
    };
  });
}

export function selectExactMostLiquidPair(rows: unknown, profile: CryptoMarketProfile, contractAddress: string): any | null {
  if (!Array.isArray(rows)) return null;
  const exact = rows.filter((pair: any) => {
    const baseName = String(pair?.baseToken?.name || '').trim().toLowerCase();
    const profileName = profile.name.trim().toLowerCase();
    const profileSymbol = profile.symbol.trim().toLowerCase();
    const nameMatches = baseName === profileName || baseName === profileSymbol;
    return sameAddress(pair?.baseToken?.address, contractAddress)
      && String(pair?.baseToken?.symbol || '').toUpperCase() === profile.symbol
      && nameMatches
      && safeSegment(pair?.chainId) && safeSegment(pair?.pairAddress) && typeof pair?.url === 'string' && /^https:\/\/dexscreener\.com\//.test(pair.url);
  });
  return exact.sort((left: any, right: any) =>
    (positive(right?.liquidity?.usd) || 0) - (positive(left?.liquidity?.usd) || 0)
    || (positive(right?.volume?.h24) || 0) - (positive(left?.volume?.h24) || 0)
  )[0] || null;
}

export class DexMarketDataService {
  private cache = new Map<string, { value: DexPairMetrics | null; fetchedAt: number }>();
  private pairCache = new Map<string, { selected: any; contractAddress: string; fetchedAt: number }>();
  private sourceCandleCache = new Map<string, { candles: Candle[]; fetchedAt: number }>();
  constructor(private fetcher: typeof fetch = fetch) {}

  private async json(url: string, coinGecko = false): Promise<any> {
    const response = await this.fetcher(url, {
      signal: AbortSignal.timeout(8_000), headers: {
        accept: 'application/json',
        ...(coinGecko && process.env.COINGECKO_API_KEY ? { 'x-cg-demo-api-key': process.env.COINGECKO_API_KEY } : {})
      }
    });
    if (!response.ok) throw new Error(`DEX fallback HTTP ${response.status}`);
    return response.json();
  }

  private async coinGeckoCandles(profile: CryptoMarketProfile, timeframe: Timeframe): Promise<Candle[]> {
    const chart = await this.json(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(profile.id)}/market_chart?vs_currency=usd&days=${MARKET_CHART_DAYS[timeframe]}`, true);
    const prices = Array.isArray(chart?.prices) ? chart.prices : [];
    const volumes = Array.isArray(chart?.total_volumes) ? chart.total_volumes : [];
    const rows: unknown[] = [];
    for (let index = 0; index < prices.length; index++) {
      const point = prices[index];
      if (!Array.isArray(point)) continue;
      const ms = positive(point[0]);
      const price = positive(point[1]);
      if (!ms || !price) continue;
      rows.push([Math.floor(ms / 1000), price, price, price, price, positive(volumes[index]?.[1]) || 0]);
    }
    const request = candleRequest(timeframe);
    return aggregateDexCandles(normalizeDexCandles(rows, timeframe, Date.now(), request.sourceDurationMs), timeframe);
  }

  async load(profile: CryptoMarketProfile, timeframe: Timeframe): Promise<DexPairMetrics | null> {
    if (profile.provider !== 'coingecko') return null;
    const key = `${profile.id}:${timeframe}`;
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.fetchedAt < 60_000) return cached.value;
    try {
      let pairing = this.pairCache.get(profile.id);
      if (!pairing || Date.now() - pairing.fetchedAt >= 60_000) {
        const metadata = await this.json(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(profile.id)}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false`, true);
        if (metadata?.id !== profile.id || String(metadata?.symbol).toUpperCase() !== profile.symbol || String(metadata?.name).trim().toLowerCase() !== profile.name.trim().toLowerCase()) return null;
        const preferredPlatform = metadata?.asset_platform_id;
        const platforms = Object.entries(metadata?.platforms || {}).filter((entry): entry is [string, string] => Boolean(safeSegment(entry[0]) && safeSegment(entry[1])));
        const ordered = platforms.sort(([left], [right]) => Number(right === preferredPlatform) - Number(left === preferredPlatform));
        let selected: any | null = null;
        let contractAddress = '';
        for (const [, address] of ordered) {
          const result = await this.json(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(address)}`);
          selected = selectExactMostLiquidPair(result?.pairs, profile, address);
          if (selected) { contractAddress = address; break; }
        }
        if (!selected) { this.cache.set(key, { value: null, fetchedAt: Date.now() }); return null; }
        pairing = { selected, contractAddress, fetchedAt: Date.now() };
        this.pairCache.set(profile.id, pairing);
      }
      const { selected, contractAddress } = pairing;
      const pairIsDust = (positive(selected?.liquidity?.usd) || 0) < DUST_PAIR_MAX_LIQUIDITY_USD
        && (profile.volume24h || 0) > REAL_MARKET_VOLUME_MIN_USD;

      const chainId = safeSegment(selected.chainId)!;
      const pairAddress = safeSegment(selected.pairAddress)!;
      const request = candleRequest(timeframe);
      let candles: Candle[] = [];
      let candleSource = 'GeckoTerminal';
      if (pairIsDust) {
        try {
          candles = await this.coinGeckoCandles(profile, timeframe);
          if (candles.length > 0) candleSource = 'CoinGecko';
        } catch { candles = []; }
      } else {
        const sourceKey = `${chainId}:${pairAddress}:${request.unit}`;
        const cachedSource = this.sourceCandleCache.get(sourceKey);
        let sourceCandles = cachedSource && Date.now() - cachedSource.fetchedAt < 60_000 ? cachedSource.candles : undefined;
        if (!sourceCandles) {
          try {
            const ohlcv = await this.json(`https://api.geckoterminal.com/api/v2/networks/${encodeURIComponent(geckoNetworkId(chainId))}/pools/${encodeURIComponent(pairAddress)}/ohlcv/${request.unit}?aggregate=${request.aggregate}&limit=1000&currency=usd&token=base`);
            sourceCandles = normalizeDexCandles(ohlcv?.data?.attributes?.ohlcv_list, timeframe, Date.now(), request.sourceDurationMs);
            this.sourceCandleCache.set(sourceKey, { candles: sourceCandles, fetchedAt: Date.now() });
          } catch {
            sourceCandles = cachedSource && Date.now() - cachedSource.fetchedAt < 10 * 60_000 ? cachedSource.candles : [];
          }
        }
        candles = aggregateDexCandles(sourceCandles, timeframe);
      }
      const tx = selected?.txns?.h24;
      const value: DexPairMetrics = {
        chainId, pairAddress, contractAddress, dexId: String(selected.dexId || 'DEX'), dexUrl: selected.url,
        quoteSymbol: String(selected?.quoteToken?.symbol || ''), priceUsd: positive(selected.priceUsd),
        priceChange: { m5: finite(selected?.priceChange?.m5), h1: finite(selected?.priceChange?.h1), h6: finite(selected?.priceChange?.h6), h24: finite(selected?.priceChange?.h24) },
        volume: { m5: positive(selected?.volume?.m5), h1: positive(selected?.volume?.h1), h6: positive(selected?.volume?.h6), h24: positive(selected?.volume?.h24) },
        liquidityUsd: positive(selected?.liquidity?.usd), fdvUsd: positive(selected?.fdv), marketCapUsd: positive(selected?.marketCap),
        transactions24h: Number.isInteger(tx?.buys) && tx.buys >= 0 && Number.isInteger(tx?.sells) && tx.sells >= 0 ? { buys: tx.buys, sells: tx.sells } : null,
        pairCreatedAt: positive(selected.pairCreatedAt), candles, candleSource, pairIsDust
      };
      this.cache.set(key, { value, fetchedAt: Date.now() });
      return value;
    } catch {
      return cached && Date.now() - cached.fetchedAt < 10 * 60_000 ? cached.value : null;
    }
  }
}

export const dexMarketData = new DexMarketDataService();
