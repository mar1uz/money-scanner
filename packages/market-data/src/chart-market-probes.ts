import { BinanceMarketAdapter } from './adapters/binance.js';
import { BybitMarketAdapter } from './adapters/bybit.js';
import { OkxMarketAdapter } from './adapters/okx.js';
import { HyperliquidMarketAdapter } from './adapters/hyperliquid.js';
import { ChartMarketResolverDeps } from './chart-market-resolver.js';

const BINANCE_SPOT_URL = process.env.BINANCE_API_URL || 'https://data-api.binance.vision/api/v3';
const BINANCE_FUTURES_URL = process.env.BINANCE_FUTURES_API_URL || 'https://fapi.binance.com/fapi/v1';
const COINBASE_URL = process.env.COINBASE_API_URL || 'https://api.exchange.coinbase.com';
const KRAKEN_URL = process.env.KRAKEN_API_URL || 'https://api.kraken.com';

const fetchJson = async <T>(url: string, timeoutMs = 8_000): Promise<T> => {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<T>;
};

let futuresPerpCache: { values: Set<string>; updatedAt: number } | null = null;
const binanceFuturesPerpBases = async (): Promise<Set<string>> => {
  if (futuresPerpCache && Date.now() - futuresPerpCache.updatedAt < 15 * 60_000) return futuresPerpCache.values;
  const body = await fetchJson<{ symbols?: Array<{ status?: string; baseAsset?: string; quoteAsset?: string; contractType?: string }> }>(
    `${BINANCE_FUTURES_URL}/exchangeInfo`
  );
  const values = new Set<string>();
  for (const market of body.symbols || []) {
    if (market.status === 'TRADING' && market.contractType === 'PERPETUAL' && market.quoteAsset === 'USDT' && market.baseAsset) {
      values.add(market.baseAsset.toUpperCase());
    }
  }
  futuresPerpCache = { values, updatedAt: Date.now() };
  return values;
};

const firstBinanceDailyTs = async (kind: 'spot' | 'futures', pair: string): Promise<number | null> => {
  const base = kind === 'spot' ? BINANCE_SPOT_URL : BINANCE_FUTURES_URL;
  const rows = await fetchJson<any[]>(`${base}/klines?symbol=${pair}&interval=1d&startTime=0&limit=1`);
  const ts = Number(rows?.[0]?.[0]);
  return Number.isFinite(ts) && ts > 0 ? ts : null;
};

let coinbaseProductsCache: { values: Set<string>; updatedAt: number } | null = null;
const coinbaseUsdProducts = async (): Promise<Set<string>> => {
  if (coinbaseProductsCache && Date.now() - coinbaseProductsCache.updatedAt < 30 * 60_000) return coinbaseProductsCache.values;
  const rows = await fetchJson<Array<{ id?: string; status?: string; trading_disabled?: boolean }>>(`${COINBASE_URL}/products`);
  const values = new Set<string>();
  for (const product of rows || []) {
    const id = String(product.id || '').toUpperCase();
    if (id.endsWith('-USD') && product.status === 'online' && !product.trading_disabled) {
      values.add(id.slice(0, -4));
    }
  }
  coinbaseProductsCache = { values, updatedAt: Date.now() };
  return values;
};

const coinbaseFirstDailyTs = async (base: string): Promise<number | null> => {
  // Coinbase returns at most 300 buckets per request starting at `start`:
  // an early start therefore surfaces the listing-era candles first.
  const rows = await fetchJson<any[]>(
    `${COINBASE_URL}/products/${base}-USD/candles?granularity=86400&start=${encodeURIComponent('2015-01-01T00:00:00Z')}`
  );
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const times = rows.map(row => Number(row[0])).filter(Number.isFinite);
  return times.length ? Math.min(...times) * 1000 : null;
};

let krakenPairsCache: { byBase: Map<string, string>; updatedAt: number } | null = null;
const krakenUsdPairs = async (): Promise<Map<string, string>> => {
  if (krakenPairsCache && Date.now() - krakenPairsCache.updatedAt < 30 * 60_000) return krakenPairsCache.byBase;
  const body = await fetchJson<{ result?: Record<string, { base?: string; quote?: string; altname?: string; status?: string }> }>(
    `${KRAKEN_URL}/0/public/AssetPairs`
  );
  const byBase = new Map<string, string>();
  for (const [pairName, row] of Object.entries(body.result || {})) {
    if (row.quote !== 'ZUSD' || !row.base || row.status === 'delisted') continue;
    // Strip Kraken's X/Z currency prefixes (XXBT -> XBT -> BTC mapping handled by altname).
    const alt = String(row.altname || pairName).toUpperCase();
    if (!alt.endsWith('USD')) continue;
    byBase.set(alt.slice(0, -3), pairName);
  }
  krakenPairsCache = { byBase, updatedAt: Date.now() };
  return byBase;
};

const krakenFirstDailyTs = async (pairName: string): Promise<number | null> => {
  const body = await fetchJson<{ result?: Record<string, any> }>(
    `${KRAKEN_URL}/0/public/OHLC?pair=${encodeURIComponent(pairName)}&interval=1440&since=0`
  );
  const result = body.result || {};
  const key = Object.keys(result).find(name => name !== 'last');
  const rows = key ? result[key] : [];
  const ts = Number(rows?.[0]?.[0]);
  return Number.isFinite(ts) && ts > 0 ? ts * 1000 : null;
};

const MEXC_URL = process.env.MEXC_API_URL || 'https://api.mexc.com/api/v3';
const GATE_URL = process.env.GATE_API_URL || 'https://api.gateio.ws/api/v4';
const BITGET_URL = process.env.BITGET_API_URL || 'https://api.bitget.com/api/v2';
const KUCOIN_URL = process.env.KUCOIN_API_URL || 'https://api.kucoin.com';

// TradingView carries these smaller venues; they supply the external chart
// symbol for assets the majors do not list (Marius, 2026-09-23: BP is
// MEXC:BPUSDT on TradingView, not "TradingView-less").
const smallVenueCache = new Map<string, { values: Set<string>; updatedAt: number }>();
const smallVenueUsdtBases = async (key: string, load: () => Promise<Set<string>>): Promise<Set<string>> => {
  const cached = smallVenueCache.get(key);
  if (cached && Date.now() - cached.updatedAt < 30 * 60_000) return cached.values;
  const values = await load();
  smallVenueCache.set(key, { values, updatedAt: Date.now() });
  return values;
};

const mexcUsdtBases = () => smallVenueUsdtBases('mexc', async () => {
  const body = await fetchJson<{ symbols?: Array<{ status?: string; baseAsset?: string; quoteAsset?: string; isSpotTradingAllowed?: boolean }> }>(`${MEXC_URL}/exchangeInfo`);
  const values = new Set<string>();
  for (const market of body.symbols || []) {
    if (market.quoteAsset === 'USDT' && market.baseAsset && market.status !== '3' && market.isSpotTradingAllowed !== false) {
      values.add(market.baseAsset.toUpperCase());
    }
  }
  return values;
});

const gateUsdtBases = () => smallVenueUsdtBases('gate', async () => {
  const rows = await fetchJson<Array<{ base?: string; quote?: string; trade_status?: string }>>(`${GATE_URL}/spot/currency_pairs`);
  const values = new Set<string>();
  for (const row of rows || []) {
    if (row.quote === 'USDT' && row.base && row.trade_status === 'tradable') values.add(row.base.toUpperCase());
  }
  return values;
});

const bitgetUsdtBases = () => smallVenueUsdtBases('bitget', async () => {
  const body = await fetchJson<{ data?: Array<{ baseCoin?: string; quoteCoin?: string; status?: string }> }>(`${BITGET_URL}/spot/public/symbols`);
  const values = new Set<string>();
  for (const market of body.data || []) {
    if (market.quoteCoin === 'USDT' && market.baseCoin && market.status === 'online') values.add(market.baseCoin.toUpperCase());
  }
  return values;
});

const kucoinUsdtBases = () => smallVenueUsdtBases('kucoin', async () => {
  const body = await fetchJson<{ data?: Array<{ baseCurrency?: string; quoteCurrency?: string; enableTrading?: boolean }> }>(`${KUCOIN_URL}/api/v2/symbols`);
  const values = new Set<string>();
  for (const market of body.data || []) {
    if (market.quoteCurrency === 'USDT' && market.baseCurrency && market.enableTrading) values.add(market.baseCurrency.toUpperCase());
  }
  return values;
});

/** Builds the resolver dependency probes from the live adapters and public exchange APIs. */
export function buildChartMarketResolverDeps(
  binance: BinanceMarketAdapter,
  bybit: BybitMarketAdapter,
  okx: OkxMarketAdapter,
  hyperliquid: HyperliquidMarketAdapter
): ChartMarketResolverDeps {
  return {
    isOnBinanceSpot: async base => (await binance.getSupportedUsdtBaseAssets()).has(base),
    binanceSpotFirstDailyTs: base => firstBinanceDailyTs('spot', `${base}USDT`),
    isOnBinanceFutures: async base => (await binanceFuturesPerpBases()).has(base),
    binanceFuturesFirstDailyTs: base => firstBinanceDailyTs('futures', `${base}USDT`),
    binanceFuturesQuoteVolume24h: async base => {
      const row = await fetchJson<{ quoteVolume?: string }>(`${BINANCE_FUTURES_URL}/ticker/24hr?symbol=${base}USDT`);
      const volume = Number(row?.quoteVolume);
      return Number.isFinite(volume) ? volume : null;
    },
    isOnBybitSpot: async base => (await bybit.getSupportedSpotUsdtAssets()).has(base),
    bybitFirstDailyTs: base => bybit.firstDailyCandleTs(`${base}USDT`),
    bybitQuoteVolume24h: async base => (await bybit.fetch24hTicker(`${base}USDT`, base)).volume24h,
    okxSpotInstrument: async base => (await okx.getSpotUsdtInstruments()).get(base) || null,
    okxQuoteVolume24h: async instId => (await okx.fetch24hTicker(instId, instId)).volume24h,
    isOnHyperliquid: async base => (await hyperliquid.getTradableCoins()).has(base),
    hyperliquidFirstDailyTs: base => hyperliquid.firstDailyCandleTs(base),
    hyperliquidQuoteVolume24h: base => hyperliquid.quoteVolume24h(base),
    isOnCoinbase: async base => (await coinbaseUsdProducts()).has(base),
    coinbaseFirstDailyTs: coinbaseFirstDailyTs,
    coinbaseQuoteVolume24h: async base => {
      const stats = await fetchJson<{ volume?: string; last?: string }>(`${COINBASE_URL}/products/${base}-USD/stats`);
      const volume = Number(stats?.volume) * Number(stats?.last);
      return Number.isFinite(volume) ? volume : null;
    },
    isOnKraken: async base => (await krakenUsdPairs()).has(base),
    krakenFirstDailyTs: async base => {
      const pairName = (await krakenUsdPairs()).get(base);
      return pairName ? krakenFirstDailyTs(pairName) : null;
    },
    krakenQuoteVolume24h: async base => {
      const pairName = (await krakenUsdPairs()).get(base);
      if (!pairName) return null;
      const body = await fetchJson<{ result?: Record<string, { c?: string[]; v?: string[] }> }>(
        `${KRAKEN_URL}/0/public/Ticker?pair=${encodeURIComponent(pairName)}`
      );
      const row = Object.values(body.result || {})[0];
      const volume = Number(row?.v?.[1]) * Number(row?.c?.[0]);
      return Number.isFinite(volume) ? volume : null;
    },
    isOnMexcSpot: async base => (await mexcUsdtBases()).has(base),
    isOnGateSpot: async base => (await gateUsdtBases()).has(base),
    isOnBitgetSpot: async base => (await bitgetUsdtBases()).has(base),
    isOnKucoinSpot: async base => (await kucoinUsdtBases()).has(base)
  };
}
