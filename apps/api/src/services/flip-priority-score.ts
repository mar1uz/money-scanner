// Component-based setup score for MoneyLine flip candidates and confirmed flips.
// Approved model (2026-09-21): replaces the old saturating formula in which every
// confirmed flip clamped to 100/100 (92 base + 22 status boost). The 0-100 scale
// is kept, but every point now comes from an interpretable component, so two
// confirmed flips can score very differently.

export interface FlipPriorityScoreInput {
  direction: 'BULLISH' | 'BEARISH';
  currentPrice: number;
  triggerPrice: number;
  atr: number;
  moneyLineScore: number;
  weeklyTier: string;
  rvol: number;
  sma50: number;
  sma200: number;
}

export interface FlipPriorityScoreBreakdown {
  distanceScore: number;
  mlQualityScore: number;
  weeklyScore: number;
  volumeScore: number;
  structureScore: number;
  total: number;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export function calculateFlipPriorityScore(input: FlipPriorityScoreInput): FlipPriorityScoreBreakdown {
  const bullish = input.direction === 'BULLISH';

  // 1) Distance from the flip trigger in ATR (0-30). Fresh at the trigger = 30;
  //    3+ ATR away (extended chase for a confirmed flip, far approach for a
  //    candidate) = 0. Uses the real price-to-trigger distance for every status,
  //    including confirmed flips (the old formula zeroed it for them).
  const extensionAtr = input.atr > 0
    ? Math.abs(input.triggerPrice - input.currentPrice) / input.atr
    : 3;
  const distanceScore = 30 * (1 - Math.min(extensionAtr, 3) / 3);

  // 2) MoneyLine signal quality (0-25): engine composite (-100..+100), linear.
  const ml = Number.isFinite(input.moneyLineScore) ? input.moneyLineScore : 0;
  const mlQualityScore = clamp01((ml + 100) / 200) * 25;

  // 3) Weekly MTF alignment (0-20): Strong tier in the flip direction = 20,
  //    regular aligned tier = 14, unaligned = 0.
  const weeklyScore = bullish
    ? (input.weeklyTier === 'Strong Bullish' ? 20 : input.weeklyTier === 'Bullish' ? 14 : 0)
    : (input.weeklyTier === 'Strong Bearish' ? 20 : input.weeklyTier === 'Bearish' ? 14 : 0);

  // 4) Volume at flip (0-15): RVOL >= 2 = 15, linear between 0.8 and 2, <= 0.8 = 0.
  const rvol = Number.isFinite(input.rvol) ? input.rvol : 0;
  const volumeScore = clamp01((rvol - 0.8) / 1.2) * 15;

  // 5) SMA structure (0-10): price on the right side of SMA50 (+4) and SMA200 (+3),
  //    plus SMA50 vs SMA200 aligned with the flip direction (+3).
  const priceRightOfSma50 = bullish ? input.currentPrice >= input.sma50 : input.currentPrice <= input.sma50;
  const priceRightOfSma200 = bullish ? input.currentPrice >= input.sma200 : input.currentPrice <= input.sma200;
  const smaCrossAligned = bullish ? input.sma50 > input.sma200 : input.sma50 < input.sma200;
  const structureScore = (priceRightOfSma50 ? 4 : 0) + (priceRightOfSma200 ? 3 : 0) + (smaCrossAligned ? 3 : 0);

  const total = Math.max(0, Math.min(100,
    distanceScore + mlQualityScore + weeklyScore + volumeScore + structureScore
  ));

  return { distanceScore, mlQualityScore, weeklyScore, volumeScore, structureScore, total };
}
