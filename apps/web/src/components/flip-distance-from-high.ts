export type DistanceFromHighTone = 'emerald' | 'rose';

export interface DistanceFromLastClosedHigh {
  percent: number;
  label: string;
  tone: DistanceFromHighTone;
}

const finitePositive = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

/** Signed percent of currentPrice versus the last closed candle high.
 * Returns null when either input is missing, non-finite, or not positive —
 * callers render a dash and must not invent 0. */
export function distanceFromLastClosedHigh(
  currentPrice: number | null | undefined,
  lastClosedHigh: number | null | undefined
): DistanceFromLastClosedHigh | null {
  if (!finitePositive(lastClosedHigh) || !finitePositive(currentPrice)) return null;
  const raw = ((currentPrice - lastClosedHigh) / lastClosedHigh) * 100;
  if (!Number.isFinite(raw)) return null;
  const percent = Math.round(raw * 100) / 100;
  const label = `${percent >= 0 ? '+' : ''}${percent.toFixed(2)}%`;
  return {
    percent,
    label,
    tone: percent >= 0 ? 'emerald' : 'rose'
  };
}
