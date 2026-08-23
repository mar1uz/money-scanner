import { Candle } from '@money-scanner/shared';

/**
 * Aggregates 1-hour candles into a larger hourly period deterministically.
 */
export function aggregateCandles(candles1h: Candle[], targetPeriodHours: 4 | 8 | 24): Candle[] {
  if (candles1h.length === 0) return [];

  const targetPeriodMs = targetPeriodHours * 3600 * 1000;
  const grouped = new Map<number, Candle[]>();

  for (const c of candles1h) {
    // Floor timestamp to the period boundary
    const periodStart = Math.floor(c.timestamp / targetPeriodMs) * targetPeriodMs;
    if (!grouped.has(periodStart)) {
      grouped.set(periodStart, []);
    }
    grouped.get(periodStart)!.push(c);
  }

  const aggregated: Candle[] = [];
  const sortedStarts = Array.from(grouped.keys()).sort((a, b) => a - b);

  for (const start of sortedStarts) {
    const list = grouped.get(start)!;
    if (list.length === 0) continue;

    // Market sessions contain gaps (overnight/weekends), so candle count alone
    // cannot decide closure. The aggregate is closed when all source bars are.
    const isComplete = list.every(candle => candle.isClosed);
    const open = list[0].open;
    const close = list[list.length - 1].close;
    let high = -Infinity;
    let low = Infinity;
    let volume = 0;

    for (const item of list) {
      if (item.high > high) high = item.high;
      if (item.low < low) low = item.low;
      volume += item.volume;
    }

    aggregated.push({
      timestamp: start,
      open,
      high,
      low,
      close,
      volume: Number(volume.toFixed(2)),
      isClosed: isComplete
    });
  }

  return aggregated;
}
