import { useEffect, useState } from 'react';
import { fetchCryptoFourCriteriaScan } from './api.js';
import type { CryptoFourCriteriaAsset } from '../types.js';

/** 30d revenue -> annual revenue. */
export const PR_ANNUALIZATION = 365 / 30;

export interface CryptoFundamentals {
  coinGeckoId?: string;
  marketCap?: number;
  revenue30d?: number;
  /** P/R = marketCap / (revenue30d x 365/30); undefined when revenue is missing. */
  priceToRevenue?: number;
  /** Main narrative tag from the scan (DeFi, L1, Meme...). */
  narrative?: string;
}

export const computePriceToRevenue = (marketCap?: number, revenue30d?: number): number | undefined => {
  if (!marketCap || !Number.isFinite(marketCap) || marketCap <= 0) return undefined;
  if (!revenue30d || !Number.isFinite(revenue30d) || revenue30d <= 0) return undefined;
  return marketCap / (revenue30d * PR_ANNUALIZATION);
};

export const formatPriceToRevenue = (value?: number): string => {
  if (value === undefined || !Number.isFinite(value)) return '\u2014';
  if (value >= 1000) return `${Math.round(value).toLocaleString('en-US')}x`;
  return `${value.toFixed(1)}x`;
};

export const formatRevenue30d = (value?: number): string => {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return '\u2014';
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${Math.round(value)}`;
};

export const fundamentalsFromAsset = (asset: CryptoFourCriteriaAsset): CryptoFundamentals => {
  const revenue30d = asset.metrics?.revenue30d;
  return { coinGeckoId: asset.coinGeckoId, marketCap: asset.marketCap, revenue30d, priceToRevenue: computePriceToRevenue(asset.marketCap, revenue30d), narrative: asset.narrative };
};

// One shared scan request per page load; every coin card reads from it.
let cached: Promise<Map<string, CryptoFundamentals>> | null = null;

export const loadCryptoFundamentals = (): Promise<Map<string, CryptoFundamentals>> => {
  if (!cached) {
    cached = fetchCryptoFourCriteriaScan(false)
      .then(scan => {
        const bySymbol = new Map<string, { rank: number; value: CryptoFundamentals }>();
        for (const asset of scan.assets || []) {
          const key = asset.symbol.toUpperCase();
          const rank = Number.isFinite(asset.marketCapRank) && asset.marketCapRank > 0 ? asset.marketCapRank : Number.MAX_SAFE_INTEGER;
          const existing = bySymbol.get(key);
          // Ticker collisions: keep the larger (better-ranked) coin.
          if (!existing || rank < existing.rank) bySymbol.set(key, { rank, value: fundamentalsFromAsset(asset) });
        }
        return new Map([...bySymbol].map(([key, entry]) => [key, entry.value]));
      })
      .catch(() => {
        cached = null;
        return new Map<string, CryptoFundamentals>();
      });
  }
  return cached;
};

export const useCryptoFundamentals = (): Map<string, CryptoFundamentals> => {
  const [map, setMap] = useState<Map<string, CryptoFundamentals>>(() => new Map());
  useEffect(() => {
    let alive = true;
    void loadCryptoFundamentals().then(next => { if (alive) setMap(next); });
    return () => { alive = false; };
  }, []);
  return map;
};
