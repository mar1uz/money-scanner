import { Candle, MoneyLineSignal, MoneyLineTier, Timeframe } from '@money-scanner/shared';
import { MoneyLineCloudSeries } from './cloud-supertrend.js';

export type TradePlanAction = 'READY' | 'WAIT_RETEST' | 'AVOID';

export interface TradePlanProfile {
  timeframe: Timeframe;
  confirmationTimeframes: Timeframe[];
  entryLowAtr: number;
  entryHighAtr: number;
  stopBufferAtr: number;
  breakoutBufferAtr: number;
  targetRiskReward: number;
  maxChaseAtr: number;
  structureLookback: number;
}

export interface BullishTradePlan {
  timeframe: Timeframe;
  action: TradePlanAction;
  confidence: number;
  confirmationClose: number;
  currentPrice: number;
  entryLow: number;
  entryHigh: number;
  suggestedEntry: number;
  breakoutTrigger: number;
  stopLoss: number;
  target1: number;
  target2: number;
  target3?: number;
  targetRiskReward: number;
  target3RiskReward?: number;
  riskPercent: number;
  riskAtr: number;
  chaseAtr: number;
  resistanceRiskReward?: number;
  fastLine: number;
  slowLine: number;
  atr: number;
  rvol: number;
  rsi: number;
  score: number;
  tier: MoneyLineTier;
  confirmationSignals: Partial<Record<Timeframe, MoneyLineSignal>>;
  reasons: string[];
}

const PROFILES: Record<Timeframe, TradePlanProfile> = {
  '1h': {
    timeframe: '1h', confirmationTimeframes: ['4h', '1d'], entryLowAtr: 0.05, entryHighAtr: 0.30,
    stopBufferAtr: 0.25, breakoutBufferAtr: 0.05, targetRiskReward: 2, maxChaseAtr: 0.75,
    structureLookback: 6
  },
  '4h': {
    timeframe: '4h', confirmationTimeframes: ['1d', '1w'], entryLowAtr: 0.05, entryHighAtr: 0.25,
    stopBufferAtr: 0.25, breakoutBufferAtr: 0.05, targetRiskReward: 2.5, maxChaseAtr: 0.65,
    structureLookback: 6
  },
  '8h': {
    timeframe: '8h', confirmationTimeframes: ['1d', '1w'], entryLowAtr: 0.04, entryHighAtr: 0.22,
    stopBufferAtr: 0.25, breakoutBufferAtr: 0.04, targetRiskReward: 2.5, maxChaseAtr: 0.60,
    structureLookback: 6
  },
  '1d': {
    timeframe: '1d', confirmationTimeframes: ['1w', '1m'], entryLowAtr: 0.03, entryHighAtr: 0.20,
    stopBufferAtr: 0.20, breakoutBufferAtr: 0.03, targetRiskReward: 3, maxChaseAtr: 0.55,
    structureLookback: 5
  },
  '1w': {
    timeframe: '1w', confirmationTimeframes: ['1m'], entryLowAtr: 0.02, entryHighAtr: 0.18,
    stopBufferAtr: 0.18, breakoutBufferAtr: 0.02, targetRiskReward: 3, maxChaseAtr: 0.50,
    structureLookback: 4
  },
  '1m': {
    timeframe: '1m', confirmationTimeframes: [], entryLowAtr: 0.02, entryHighAtr: 0.15,
    stopBufferAtr: 0.15, breakoutBufferAtr: 0.02, targetRiskReward: 3, maxChaseAtr: 0.45,
    structureLookback: 4
  }
};

export function getTradePlanProfile(timeframe: Timeframe): TradePlanProfile {
  return PROFILES[timeframe];
}

function isBullishTier(tier?: MoneyLineTier) {
  return tier === 'Bullish' || tier === 'Strong Bullish';
}

function isBearishTier(tier?: MoneyLineTier) {
  return tier === 'Bearish' || tier === 'Strong Bearish';
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Produces a deterministic, closed-candle LONG scenario. It is intentionally
 * not generative AI: Telegram delivery stays fast, repeatable and auditable.
 * The suggested entry is a retest zone; the breakout level is supplied as the
 * alternative for traders who do not want to leave a resting limit order.
 */
export function calculateBullishTradePlan(input: {
  timeframe: Timeframe;
  candles: Candle[];
  cloud: MoneyLineCloudSeries;
  signal: MoneyLineSignal;
  currentPrice: number;
  confirmationSignals?: Partial<Record<Timeframe, MoneyLineSignal>>;
}): BullishTradePlan {
  const { timeframe, cloud, signal } = input;
  const candles = input.candles
    .filter(candle => candle.isClosed !== false)
    .sort((left, right) => left.timestamp - right.timestamp);
  if (!candles.length) throw new Error('Trade plan requires at least one closed candle.');

  const profile = getTradePlanProfile(timeframe);
  const lastIndex = candles.length - 1;
  const lastCandle = candles[lastIndex];
  const rawAtr = signal.rawIndicators.atr14;
  const candleRange = Math.max(lastCandle.high - lastCandle.low, Math.abs(lastCandle.close) * 0.001);
  const atr = Number.isFinite(rawAtr) && rawAtr > 0 ? rawAtr : candleRange;
  const fastLine = cloud.lineFast[lastIndex] || lastCandle.close;
  const slowLine = cloud.lineSlow[lastIndex] || fastLine;
  const cloudRetestLine = Math.max(fastLine, slowLine);

  const entryLow = cloudRetestLine + atr * profile.entryLowAtr;
  const entryHigh = cloudRetestLine + atr * profile.entryHighAtr;
  const suggestedEntry = (entryLow + entryHigh) / 2;
  const breakoutTrigger = lastCandle.high + atr * profile.breakoutBufferAtr;

  const structureCandles = candles.slice(Math.max(0, candles.length - profile.structureLookback));
  const recentStructureLow = Math.min(...structureCandles.map(candle => candle.low));
  // Breaking either the Fast cloud support or the recent local structure
  // invalidates the early entry. The Slow line remains the wider trend guard.
  const earlyInvalidation = Math.max(cloudRetestLine, recentStructureLow);
  let stopLoss = earlyInvalidation - atr * profile.stopBufferAtr;
  if (stopLoss >= suggestedEntry) stopLoss = suggestedEntry - atr * 0.50;
  stopLoss = Math.max(0, stopLoss);

  const risk = Math.max(suggestedEntry - stopLoss, atr * 0.10);
  const target1 = suggestedEntry + risk * 1.5;
  const target2 = suggestedEntry + risk * profile.targetRiskReward;
  const target3RiskReward = timeframe === '1w' ? 5.5 : timeframe === '1d' ? 4.5 : timeframe === '8h' || timeframe === '4h' ? 3.5 : 2.5;
  const target3 = timeframe === '1w'
    ? Math.max(suggestedEntry + risk * target3RiskReward, suggestedEntry * 1.50)
    : suggestedEntry + risk * target3RiskReward;
  const riskPercent = suggestedEntry > 0 ? (risk / suggestedEntry) * 100 : 0;
  const riskAtr = risk / atr;
  const chaseAtr = Math.max(0, (input.currentPrice - entryHigh) / atr);

  const historicalHighs = candles
    .slice(Math.max(0, candles.length - Math.max(20, profile.structureLookback * 3)), -1)
    .map(candle => candle.high)
    // Ignore tiny overhead wicks inside normal ATR noise. Only a level at
    // least half an ATR above the proposed entry is treated as resistance.
    .filter(high => high > suggestedEntry + atr * 0.50)
    .sort((left, right) => left - right);
  const nearestResistance = historicalHighs[0];
  const resistanceRiskReward = nearestResistance
    ? (nearestResistance - suggestedEntry) / risk
    : undefined;

  const confirmationSignals = input.confirmationSignals || {};
  let confidence = 30;
  const reasons: string[] = [];

  if (signal.score >= 60) {
    confidence += 15;
    reasons.push(`scor ${timeframe.toUpperCase()} Strong Bullish`);
  } else if (signal.score >= 20) {
    confidence += 10;
    reasons.push(`scor ${timeframe.toUpperCase()} Bullish`);
  } else {
    confidence -= 20;
    reasons.push(`scor ${timeframe.toUpperCase()} încă ${signal.tier}`);
  }

  let bearishHigherTimeframe = false;
  profile.confirmationTimeframes.forEach((confirmationTimeframe, index) => {
    const confirmation = confirmationSignals[confirmationTimeframe];
    if (!confirmation) {
      reasons.push(`${confirmationTimeframe.toUpperCase()} indisponibil`);
      return;
    }
    const weight = index === 0 ? 15 : 10;
    if (isBullishTier(confirmation.tier)) {
      confidence += weight;
      reasons.push(`${confirmationTimeframe.toUpperCase()} ${confirmation.tier}`);
    } else if (isBearishTier(confirmation.tier)) {
      confidence -= weight + 10;
      bearishHigherTimeframe = true;
      reasons.push(`${confirmationTimeframe.toUpperCase()} contrar: ${confirmation.tier}`);
    } else {
      reasons.push(`${confirmationTimeframe.toUpperCase()} Neutral`);
    }
  });

  if (signal.rawIndicators.rvol >= 2) confidence += 12;
  else if (signal.rawIndicators.rvol >= 1.2) confidence += 9;
  else if (signal.rawIndicators.rvol >= 1) confidence += 4;
  else {
    confidence -= 10;
    reasons.push('volum sub medie');
  }

  if (signal.rawIndicators.rsi14 >= 52 && signal.rawIndicators.rsi14 <= 70) confidence += 8;
  else if (signal.rawIndicators.rsi14 > 75) {
    confidence -= 7;
    reasons.push('RSI extins');
  }

  if (signal.rawIndicators.atrPercent >= 1.5 && signal.rawIndicators.atrPercent <= 6) confidence += 6;
  else if (signal.rawIndicators.atrPercent > 8) {
    confidence -= 8;
    reasons.push('volatilitate foarte ridicată');
  }

  if (chaseAtr <= profile.maxChaseAtr) confidence += 8;
  else {
    confidence -= 15;
    reasons.push(`preț extins cu ${chaseAtr.toFixed(2)} ATR peste zona optimă`);
  }

  if (resistanceRiskReward !== undefined) {
    if (resistanceRiskReward >= 2) confidence += 6;
    else if (resistanceRiskReward < 1.2) {
      confidence -= 15;
      reasons.push('rezistență prea apropiată pentru R:R bun');
    }
  }

  if (riskAtr > 2.5) {
    confidence -= 10;
    reasons.push('stop tehnic prea larg');
  }

  confidence = Math.round(clamp(confidence, 0, 100));
  const hardInvalidation = bearishHigherTimeframe
    || signal.score < 20
    || signal.rawIndicators.rvol < 0.75
    || riskAtr > 2.5
    || (resistanceRiskReward !== undefined && resistanceRiskReward < 1.2);
  const action: TradePlanAction = hardInvalidation
    ? 'AVOID'
    : input.currentPrice > entryHigh || confidence < 65 || signal.rawIndicators.rvol < 1
      ? 'WAIT_RETEST'
      : 'READY';

  return {
    timeframe,
    action,
    confidence,
    confirmationClose: lastCandle.close,
    currentPrice: input.currentPrice,
    entryLow,
    entryHigh,
    suggestedEntry,
    breakoutTrigger,
    stopLoss,
    target1,
    target2,
    target3,
    targetRiskReward: profile.targetRiskReward,
    target3RiskReward,
    riskPercent,
    riskAtr,
    chaseAtr,
    resistanceRiskReward,
    fastLine,
    slowLine,
    atr,
    rvol: signal.rawIndicators.rvol,
    rsi: signal.rawIndicators.rsi14,
    score: signal.score,
    tier: signal.tier,
    confirmationSignals,
    reasons
  };
}
