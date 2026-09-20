import { Candle } from '@money-scanner/shared';
import { calculateATR, calculateSMA } from '@money-scanner/money-line';

/**
 * Pure, non-repainting evaluator for the 2x2 MA alert system (08:00 Europe/Oslo
 * daily pass, last CLOSED candles only):
 *   daily stage1  - close crosses ABOVE daily SMA50 while SMA50 > SMA200
 *   daily stage2  - bullish alignment (close > SMA50 > SMA200) retests SMA50 and holds
 *   weekly stage1 - close crosses above BOTH weekly SMA50 and SMA200
 *   weekly stage2 - retest of the higher weekly MA holds
 * The evaluator emits raw events; the runner owns one-shot state and delivery.
 */

export const MA_CROSS_RULE_ID = 'MA_2X2_CROSS_RETEST';
export const MA_CROSS_RULE_VERSION = 1;
export const MIN_MARKET_CAP = 100_000_000;

export type MaAlertStage = 'daily_stage1' | 'daily_stage2' | 'weekly_stage1' | 'weekly_stage2';

export interface MaSetupBlock {
  entryZoneLow: number;
  entryZoneHigh: number;
  stop: number;
  invalidation: string;
  gainSinceFlipPct?: number;
}

export interface MaAlertEvent {
  stage: MaAlertStage;
  symbol: string;
  marketClass: 'crypto';
  candleTimestamp: number;
  close: number;
  sma50: number;
  sma200: number;
  setup?: MaSetupBlock;
  rvol?: number;
}

export interface MaCrossEvaluation {
  symbol: string;
  status: 'EVALUATED' | 'INSUFFICIENT_HISTORY' | 'STALE_DATA';
  reason?: string;
  dailyEvents: MaAlertEvent[];
  weeklyEvents: MaAlertEvent[];
  dailyClose?: number;
  dailySma50?: number;
  dailySma200?: number;
}

const DAY_MS = 86_400_000;
const dayStart = (timestamp: number) => {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
};

const validClosed = (candles: Candle[]): Candle[] => candles
  .filter(candle => candle.isClosed !== false)
  .filter(candle => [candle.timestamp, candle.open, candle.high, candle.low, candle.close].every(Number.isFinite)
    && candle.high >= candle.low && candle.close > 0)
  .sort((left, right) => left.timestamp - right.timestamp);

/** Last index where SMA50 crossed above SMA200 (the confirmed flip), or -1. */
export const lastGoldenCrossIndex = (sma50: number[], sma200: number[]): number => {
  for (let index = sma50.length - 1; index > 0; index -= 1) {
    if (!Number.isFinite(sma50[index]) || !Number.isFinite(sma200[index])
      || !Number.isFinite(sma50[index - 1]) || !Number.isFinite(sma200[index - 1])) continue;
    if (sma50[index - 1] <= sma200[index - 1] && sma50[index] > sma200[index]) return index;
  }
  return -1;
};

const rvolOf = (volumes: number[], lastIndex: number): number | undefined => {
  const window = volumes.slice(Math.max(0, lastIndex - 20), lastIndex);
  if (window.length !== 20) return undefined;
  const average = window.reduce((sum, volume) => sum + volume, 0) / 20;
  return average > 0 ? volumes[lastIndex] / average : undefined;
};

export function evaluateMaCross(
  symbol: string,
  dailyInput: Candle[],
  weeklyInput: Candle[],
  options: { expectedDayTimestamp?: number; minDailyCandles?: number } = {}
): MaCrossEvaluation {
  const upper = symbol.toUpperCase();
  const daily = validClosed(dailyInput).map(candle => ({ ...candle, timestamp: dayStart(candle.timestamp) }));
  const minDaily = options.minDailyCandles ?? 201;
  const expected = dayStart(options.expectedDayTimestamp ?? Date.now());
  if (daily.length < minDaily) {
    return { symbol: upper, status: 'INSUFFICIENT_HISTORY', reason: `Lumânări zilnice: ${daily.length}/${minDaily}.`, dailyEvents: [], weeklyEvents: [] };
  }
  const last = daily[daily.length - 1];
  if (last.timestamp !== expected) {
    return { symbol: upper, status: 'STALE_DATA', reason: `Ultima zi închisă: ${new Date(last.timestamp).toISOString().slice(0, 10)}.`, dailyEvents: [], weeklyEvents: [] };
  }

  const closes = daily.map(candle => candle.close);
  const volumes = daily.map(candle => candle.volume);
  const lastIndex = daily.length - 1;
  const sma50 = calculateSMA(closes, 50);
  const sma200 = calculateSMA(closes, 200);
  const atr14 = calculateATR(daily.map(c => c.high), daily.map(c => c.low), closes, 14)[lastIndex];
  const c50 = sma50[lastIndex];
  const c200 = sma200[lastIndex];
  const p50 = sma50[lastIndex - 1];
  const p200 = sma200[lastIndex - 1];
  const dailyEvents: MaAlertEvent[] = [];
  const weeklyEvents: MaAlertEvent[] = [];

  const goldenIndex = lastGoldenCrossIndex(sma50, sma200);
  const gainSinceFlipPct = goldenIndex > 0
    ? (closes[lastIndex] / closes[goldenIndex] - 1) * 100
    : undefined;

  // Daily stage 1: fresh cross above SMA50 while SMA50 > SMA200.
  if (Number.isFinite(c50) && Number.isFinite(c200) && Number.isFinite(p50)
    && closes[lastIndex] > c50 && closes[lastIndex - 1] <= p50 && c50 > c200) {
    dailyEvents.push({ stage: 'daily_stage1', symbol: upper, marketClass: 'crypto', candleTimestamp: last.timestamp, close: closes[lastIndex], sma50: c50, sma200: c200, ...(rvolOf(volumes, lastIndex) !== undefined ? { rvol: rvolOf(volumes, lastIndex) } : {}) });
  }

  // Daily stage 2: bullish alignment, candle dips to/under SMA50, closes back above (holds).
  if (Number.isFinite(c50) && Number.isFinite(c200) && Number.isFinite(p50) && Number.isFinite(p200)
    && closes[lastIndex] > c50 && c50 > c200
    && closes[lastIndex - 1] > p50 && p50 > p200
    && daily[lastIndex].low <= c50) {
    const atr = Number.isFinite(atr14) && atr14 > 0 ? atr14 : c50 * 0.02;
    const stop = Math.min(daily[lastIndex].low, c50) - 0.5 * atr;
    dailyEvents.push({
      stage: 'daily_stage2', symbol: upper, marketClass: 'crypto', candleTimestamp: last.timestamp,
      close: closes[lastIndex], sma50: c50, sma200: c200,
      setup: {
        entryZoneLow: daily[lastIndex].low,
        entryZoneHigh: c50,
        stop,
        invalidation: `închidere 1D sub $${stop.toPrecision(6)}`,
        ...(gainSinceFlipPct !== undefined ? { gainSinceFlipPct } : {})
      },
      ...(rvolOf(volumes, lastIndex) !== undefined ? { rvol: rvolOf(volumes, lastIndex) } : {})
    });
  }

  // Weekly evaluation on closed weekly candles.
  const weekly = validClosed(weeklyInput);
  if (weekly.length >= 201) {
    const wCloses = weekly.map(candle => candle.close);
    const wLast = weekly.length - 1;
    const wSma50 = calculateSMA(wCloses, 50);
    const wSma200 = calculateSMA(wCloses, 200);
    const w50 = wSma50[wLast];
    const w200 = wSma200[wLast];
    const w50p = wSma50[wLast - 1];
    const w200p = wSma200[wLast - 1];
    const wClose = wCloses[wLast];
    const wPrevClose = wCloses[wLast - 1];
    const higherNow = Math.max(w50, w200);
    const higherPrev = Math.max(w50p, w200p);

    // Weekly stage 1: cross above BOTH weekly SMA50 and SMA200.
    if (Number.isFinite(w50) && Number.isFinite(w200) && Number.isFinite(w50p) && Number.isFinite(w200p)
      && wClose > w50 && wClose > w200
      && (wPrevClose <= w50p || wPrevClose <= w200p)) {
      weeklyEvents.push({ stage: 'weekly_stage1', symbol: upper, marketClass: 'crypto', candleTimestamp: weekly[wLast].timestamp, close: wClose, sma50: w50, sma200: w200 });
    }

    // Weekly stage 2: retest of the higher weekly MA holds (close back above it).
    if (Number.isFinite(higherNow) && Number.isFinite(higherPrev)
      && wPrevClose > higherPrev
      && weekly[wLast].low <= higherNow
      && wClose > higherNow) {
      weeklyEvents.push({ stage: 'weekly_stage2', symbol: upper, marketClass: 'crypto', candleTimestamp: weekly[wLast].timestamp, close: wClose, sma50: w50, sma200: w200 });
    }
  }

  return {
    symbol: upper,
    status: 'EVALUATED',
    dailyEvents,
    weeklyEvents,
    dailyClose: closes[lastIndex],
    dailySma50: c50,
    dailySma200: c200
  };
}

/** BTC market regime line reused in every message (codebase MoneyLine concept + SMA alignment). */
export interface BtcRegime {
  label: 'BULLISH' | 'BEARISH' | 'MIXED';
  close: number;
  sma50: number;
  sma200: number;
  mlScore?: number;
  mlTier?: string;
}

export function computeBtcRegime(dailyInput: Candle[], mlScore?: number, mlTier?: string): BtcRegime | null {
  const daily = validClosed(dailyInput).map(candle => ({ ...candle, timestamp: dayStart(candle.timestamp) }));
  if (daily.length < 201) return null;
  const closes = daily.map(candle => candle.close);
  const lastIndex = daily.length - 1;
  const sma50 = calculateSMA(closes, 50)[lastIndex];
  const sma200 = calculateSMA(closes, 200)[lastIndex];
  const close = closes[lastIndex];
  if (!Number.isFinite(sma50) || !Number.isFinite(sma200)) return null;
  const label = close > sma50 && sma50 > sma200 ? 'BULLISH'
    : close < sma50 && sma50 < sma200 ? 'BEARISH' : 'MIXED';
  return { label, close, sma50, sma200, ...(mlScore !== undefined ? { mlScore } : {}), ...(mlTier ? { mlTier } : {}) };
}

export const formatBtcRegime = (regime: BtcRegime | null): string => {
  if (!regime) return 'Regim BTC: indisponibil';
  const alignment = regime.label === 'BULLISH' ? 'peste SMA50/SMA200'
    : regime.label === 'BEARISH' ? 'sub SMA50/SMA200' : 'aliniere mixtă';
  const score = regime.mlScore !== undefined ? ` · ML ${regime.mlScore > 0 ? '+' : ''}${regime.mlScore}` : '';
  return `Regim BTC: ${regime.label}${score} · ${alignment}`;
};
