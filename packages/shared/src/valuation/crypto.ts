import type { CryptoFourCriteriaAsset } from '../types/ai.js';

/** A trailing 30-day window, extrapolated to 365 days; not a forecast. */
export const CRYPTO_ANNUALIZATION_FACTOR = 365 / 30;

export function cryptoValuation(asset: Pick<CryptoFourCriteriaAsset, 'marketCap' | 'fullyDilutedValuation' | 'metrics'>) {
  const positive = (value?: number): value is number => value !== undefined && Number.isFinite(value) && value > 0;
  const { revenue30d, fees30d, holdersRevenue30d } = asset.metrics;
  const basis: 'revenue' | 'fees' | 'holders' | undefined = positive(revenue30d) ? 'revenue' : positive(fees30d) ? 'fees' : positive(holdersRevenue30d) ? 'holders' : undefined;
  const amount = basis === 'revenue' ? revenue30d : basis === 'fees' ? fees30d : holdersRevenue30d;
  const annualized = positive(amount) ? amount * CRYPTO_ANNUALIZATION_FACTOR : undefined;
  const holderAnnualized = holdersRevenue30d !== undefined && Number.isFinite(holdersRevenue30d) && holdersRevenue30d >= 0
    ? holdersRevenue30d * CRYPTO_ANNUALIZATION_FACTOR : undefined;
  return {
    basis,
    multiple: positive(asset.marketCap) && positive(annualized) ? asset.marketCap / annualized : undefined,
    holderYield: positive(asset.marketCap) && holderAnnualized !== undefined ? holderAnnualized / asset.marketCap * 100 : undefined,
    dilutedHolderYield: positive(asset.fullyDilutedValuation) && holderAnnualized !== undefined ? holderAnnualized / asset.fullyDilutedValuation * 100 : undefined,
    dilutionMultiple: positive(asset.marketCap) && positive(asset.fullyDilutedValuation) ? asset.fullyDilutedValuation / asset.marketCap : undefined
  };
}

/** Midrank percentile: tied values have equal, centered ranks. */
export function midrankPercentile(values: number[], value: number): number {
  if (values.length <= 1) return 50;
  const below = values.filter(item => item < value).length;
  const equal = values.filter(item => item === value).length;
  return 100 * (below + (equal - 1) / 2) / (values.length - 1);
}
