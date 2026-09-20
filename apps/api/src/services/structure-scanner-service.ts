import { Candle } from '@money-scanner/shared';
import { calculateATR } from '@money-scanner/money-line';

/**
 * Pure geometric structure detector (PAPER/LOGGING-FIRST, 🔵 tier).
 * Detects pivot-cluster S/R zones and a linear regression channel on the
 * given closed candles (4H/8H/1D). No trade language: levels and facts only.
 */

export const STRUCTURE_SCANNER_RULE_ID = 'STRUCTURE_SCANNER_PAPER';
export const STRUCTURE_SCANNER_RULE_VERSION = 1;

export interface StructureZone {
  kind: 'support' | 'resistance';
  level: number;
  touches: number;
  firstTouch: number;
  lastTouch: number;
  /** Distance of the current close to the zone, in ATR. */
  distanceAtr: number;
}

export interface RegressionChannel {
  lookback: number;
  mid: number;
  upper: number;
  lower: number;
  /** Standard deviations of the close from the regression mid line. */
  positionSigma: number;
  /** Regression slope per bar, in % of the mid line. */
  slopePctPerBar: number;
  direction: 'UP' | 'DOWN' | 'FLAT';
}

export interface StructureSnapshot {
  symbol: string;
  timeframe: '4h' | '8h' | '1d';
  candleTimestamp: number;
  close: number;
  atr14: number;
  supports: StructureZone[];
  resistances: StructureZone[];
  channel?: RegressionChannel;
  /** True when price sits at a support zone AND the lower channel half, or at a
   *  resistance zone AND the upper channel half. */
  confluence: boolean;
  confluenceSide?: 'support' | 'resistance';
  reason?: string;
}

const validClosed = (candles: Candle[]): Candle[] => candles
  .filter(candle => candle.isClosed !== false)
  .filter(candle => [candle.timestamp, candle.open, candle.high, candle.low, candle.close].every(Number.isFinite)
    && candle.high >= candle.low && candle.close > 0)
  .sort((left, right) => left.timestamp - right.timestamp);

interface Pivot { index: number; timestamp: number; price: number; kind: 'high' | 'low'; }

/** Swing pivots: strict extreme over `width` bars on both sides. */
export const findPivots = (candles: Candle[], width = 3): Pivot[] => {
  const pivots: Pivot[] = [];
  for (let index = width; index < candles.length - width; index += 1) {
    let isHigh = true;
    let isLow = true;
    for (let offset = 1; offset <= width; offset += 1) {
      if (candles[index].high <= candles[index - offset].high || candles[index].high < candles[index + offset].high) isHigh = false;
      if (candles[index].low >= candles[index - offset].low || candles[index].low > candles[index + offset].low) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh) pivots.push({ index, timestamp: candles[index].timestamp, price: candles[index].high, kind: 'high' });
    if (isLow) pivots.push({ index, timestamp: candles[index].timestamp, price: candles[index].low, kind: 'low' });
  }
  return pivots;
};

/** Cluster pivot prices into zones; a new zone starts when the gap exceeds the tolerance. */
export const clusterZones = (pivots: Pivot[], tolerance: number): { level: number; touches: number; firstTouch: number; lastTouch: number; lastIndex: number }[] => {
  const sorted = [...pivots].sort((left, right) => left.price - right.price);
  const zones: { prices: number[]; firstTouch: number; lastTouch: number; lastIndex: number }[] = [];
  for (const pivot of sorted) {
    const zone = zones.at(-1);
    if (zone && pivot.price - zone.prices.at(-1)! <= tolerance) {
      zone.prices.push(pivot.price);
      zone.firstTouch = Math.min(zone.firstTouch, pivot.timestamp);
      zone.lastTouch = Math.max(zone.lastTouch, pivot.timestamp);
      zone.lastIndex = Math.max(zone.lastIndex, pivot.index);
    } else {
      zones.push({ prices: [pivot.price], firstTouch: pivot.timestamp, lastTouch: pivot.timestamp, lastIndex: pivot.index });
    }
  }
  return zones
    .filter(zone => zone.prices.length >= 2)
    .map(zone => ({
      level: zone.prices.reduce((sum, price) => sum + price, 0) / zone.prices.length,
      touches: zone.prices.length,
      firstTouch: zone.firstTouch,
      lastTouch: zone.lastTouch,
      lastIndex: zone.lastIndex
    }));
};

/** Least-squares regression channel over the last `lookback` closes. */
export const regressionChannel = (candles: Candle[], lookback = 120): RegressionChannel | undefined => {
  if (candles.length < lookback) return undefined;
  const slice = candles.slice(-lookback);
  const ys = slice.map(candle => candle.close);
  const n = ys.length;
  const sumX = (n - 1) * n / 2;
  const sumX2 = (n - 1) * n * (2 * (n - 1) + 1) / 6;
  const sumY = ys.reduce((sum, y) => sum + y, 0);
  const sumXY = ys.reduce((sum, y, x) => sum + x * y, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  const residuals = ys.map((y, x) => y - (intercept + slope * x));
  const sigma = Math.sqrt(residuals.reduce((sum, r) => sum + r * r, 0) / n);
  const mid = intercept + slope * (n - 1);
  const close = ys[n - 1];
  const slopePctPerBar = mid > 0 ? (slope / mid) * 100 : 0;
  return {
    lookback,
    mid,
    upper: mid + 2 * sigma,
    lower: mid - 2 * sigma,
    positionSigma: sigma > 0 ? (close - mid) / sigma : 0,
    slopePctPerBar,
    direction: slopePctPerBar > 0.02 ? 'UP' : slopePctPerBar < -0.02 ? 'DOWN' : 'FLAT'
  };
};

export function detectStructure(
  symbol: string,
  timeframe: '4h' | '8h' | '1d',
  input: Candle[],
  options: { pivotWidth?: number; channelLookback?: number } = {}
): StructureSnapshot | null {
  const candles = validClosed(input);
  if (candles.length < 60) return null;
  const closes = candles.map(candle => candle.close);
  const atr14 = calculateATR(candles.map(c => c.high), candles.map(c => c.low), closes, 14).at(-1) ?? NaN;
  const atr = Number.isFinite(atr14) && atr14 > 0 ? atr14 : closes.at(-1)! * 0.01;
  const close = closes.at(-1)!;
  const tolerance = Math.max(0.75 * atr, close * 0.004);

  const zones = clusterZones(findPivots(candles, options.pivotWidth ?? 3), tolerance);
  const toZone = (zone: { level: number; touches: number; firstTouch: number; lastTouch: number }, kind: 'support' | 'resistance'): StructureZone => ({
    kind, level: zone.level, touches: zone.touches,
    firstTouch: zone.firstTouch, lastTouch: zone.lastTouch,
    distanceAtr: Math.abs(close - zone.level) / atr
  });
  const byStrength = (left: { touches: number; lastTouch: number }, right: { touches: number; lastTouch: number }) =>
    right.touches - left.touches || right.lastTouch - left.lastTouch;
  const supports = zones.filter(zone => zone.level < close).sort(byStrength).slice(0, 3).map(zone => toZone(zone, 'support'));
  const resistances = zones.filter(zone => zone.level > close).sort(byStrength).slice(0, 3).map(zone => toZone(zone, 'resistance'));

  const channel = regressionChannel(candles, options.channelLookback ?? 120);
  const nearSupport = supports.find(zone => zone.distanceAtr <= 0.5);
  const nearResistance = resistances.find(zone => zone.distanceAtr <= 0.5);
  let confluence = false;
  let confluenceSide: 'support' | 'resistance' | undefined;
  if (channel) {
    if (nearSupport && channel.positionSigma <= -0.5) { confluence = true; confluenceSide = 'support'; }
    else if (nearResistance && channel.positionSigma >= 0.5) { confluence = true; confluenceSide = 'resistance'; }
  }

  return {
    symbol: symbol.toUpperCase(),
    timeframe,
    candleTimestamp: candles.at(-1)!.timestamp,
    close,
    atr14: atr,
    supports,
    resistances,
    ...(channel ? { channel } : {}),
    confluence,
    ...(confluenceSide ? { confluenceSide } : {})
  };
}
