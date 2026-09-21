/**
 * Single price formatter for the whole web app.
 * Prices below $1 need significant digits, not fixed decimals:
 * a $0.0000105 asset must never render as $0.0000 (BONK/PEPE/SHIB class).
 * Below $1: 4 significant digits. $1 and above: locale string, 2 decimals.
 */
export const formatPrice = (value?: number | null): string => {
  if (value === undefined || value === null || !Number.isFinite(value)) return '-';
  if (value === 0) return '0';
  const abs = Math.abs(value);
  if (abs >= 1) return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const decimals = Math.min(12, Math.ceil(-Math.log10(abs)) + 3);
  return value.toFixed(decimals);
};
