import { Candle, Timeframe } from '@money-scanner/shared';

export const TIMEFRAME_MS: Record<Timeframe, number> = {
  '1h': 3_600_000,
  '4h': 4 * 3_600_000,
  '8h': 8 * 3_600_000,
  '1d': 24 * 3_600_000,
  '1w': 7 * 24 * 3_600_000,
  '1m': 31 * 24 * 3_600_000
};

/** Aggregates UTC-aligned 4h candles into 8h candles (00, 08, 16 UTC buckets). */
export function aggregate4hTo8h(candles4h: Candle[]): Candle[] {
  const buckets = new Map<number, Candle>();
  for (const c of candles4h) {
    const bucketStart = Math.floor(c.timestamp / TIMEFRAME_MS['8h']) * TIMEFRAME_MS['8h'];
    const existing = buckets.get(bucketStart);
    if (!existing) {
      buckets.set(bucketStart, { ...c, timestamp: bucketStart });
    } else {
      existing.high = Math.max(existing.high, c.high);
      existing.low = Math.min(existing.low, c.low);
      existing.close = c.close;
      existing.volume += c.volume;
      existing.isClosed = existing.isClosed && c.isClosed;
    }
  }
  return Array.from(buckets.values()).sort((a, b) => a.timestamp - b.timestamp);
}
