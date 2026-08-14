import {
  MoneyLineSignal,
  MultiTimeframeSummary,
  getTierFromScore
} from '@money-scanner/shared';

export interface MTFWeights {
  '1m'?: number;
  '1w'?: number;
  '1d': number;
  '8h'?: number;
  '4h': number;
  '1h': number;
}

export const DEFAULT_MTF_WEIGHTS: MTFWeights = {
  '1m': 0.15,
  '1w': 0.20,
  '1d': 0.25,
  '8h': 0.15,
  '4h': 0.15,
  '1h': 0.10
};

export function calculateMTFConfluence(
  signals: {
    '1h'?: MoneyLineSignal;
    '4h'?: MoneyLineSignal;
    '8h'?: MoneyLineSignal;
    '1d'?: MoneyLineSignal;
    '1w'?: MoneyLineSignal;
    '1m'?: MoneyLineSignal;
  },
  weights: MTFWeights = DEFAULT_MTF_WEIGHTS
): MultiTimeframeSummary {
  let weightedScoreSum = 0;
  let activeWeightSum = 0;

  const tfs: ('1h' | '4h' | '8h' | '1d' | '1w' | '1m')[] = ['1m', '1w', '1d', '8h', '4h', '1h'];

  for (const tf of tfs) {
    const sig = signals[tf];
    const weight = weights[tf] || 0.15;
    if (sig) {
      weightedScoreSum += sig.score * weight;
      activeWeightSum += weight;
    }
  }

  const compositeMtfScore = activeWeightSum > 0 
    ? Number((weightedScoreSum / activeWeightSum).toFixed(1))
    : 0;

  const confluenceTier = getTierFromScore(compositeMtfScore);

  return {
    '1h': signals['1h'],
    '4h': signals['4h'],
    '8h': signals['8h'],
    '1d': signals['1d'],
    '1w': signals['1w'],
    '1m': signals['1m'],
    compositeMtfScore,
    confluenceTier
  };
}
