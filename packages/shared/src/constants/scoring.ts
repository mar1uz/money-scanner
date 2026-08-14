import { MoneyLineTier } from '../types/indicators.js';

export const MONEY_LINE_VERSION = 'v1.0.0';

export interface ScoreBand {
  min: number;
  max: number;
  tier: MoneyLineTier;
  label: string;
  color: string;
  bgRgba: string;
}

export const MONEY_LINE_BANDS: ScoreBand[] = [
  { min: 60, max: 100, tier: 'Strong Bullish', label: 'Strong Bullish', color: '#10b981', bgRgba: 'rgba(16, 185, 129, 0.15)' },
  { min: 20, max: 59.99, tier: 'Bullish', label: 'Bullish', color: '#34d399', bgRgba: 'rgba(52, 211, 153, 0.12)' },
  { min: -19.99, max: 19.99, tier: 'Neutral', label: 'Neutral', color: '#94a3b8', bgRgba: 'rgba(148, 163, 184, 0.12)' },
  { min: -59.99, max: -20, tier: 'Bearish', label: 'Bearish', color: '#f87171', bgRgba: 'rgba(248, 113, 113, 0.12)' },
  { min: -100, max: -60, tier: 'Strong Bearish', label: 'Strong Bearish', color: '#ef4444', bgRgba: 'rgba(239, 68, 68, 0.15)' }
];

export function getTierFromScore(score: number): MoneyLineTier {
  const clamped = Math.max(-100, Math.min(100, score));
  if (clamped >= 60) return 'Strong Bullish';
  if (clamped >= 20) return 'Bullish';
  if (clamped > -20) return 'Neutral';
  if (clamped > -60) return 'Bearish';
  return 'Strong Bearish';
}
