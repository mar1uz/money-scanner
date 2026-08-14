import {
  MoneyLineSignal,
  MultiTimeframeSummary,
  getTierFromScore
} from '@money-scanner/shared';

export interface MTFWeights {
  '1d': number;
  '4h': number;
  '1h': number;
}

export const DEFAULT_MTF_WEIGHTS: MTFWeights = {
  '1d': 0.45,
  '4h': 0.35,
  '1h': 0.20
};

export function calculateMTFConfluence(
  signals: {
    '1h'?: MoneyLineSignal;
    '4h'?: MoneyLineSignal;
    '1d'?: MoneyLineSignal;
  },
  weights: MTFWeights = DEFAULT_MTF_WEIGHTS
): MultiTimeframeSummary {
  let weightedScoreSum = 0;
  let activeWeightSum = 0;

  if (signals['1d']) {
    weightedScoreSum += signals['1d'].score * weights['1d'];
    activeWeightSum += weights['1d'];
  }
  if (signals['4h']) {
    weightedScoreSum += signals['4h'].score * weights['4h'];
    activeWeightSum += weights['4h'];
  }
  if (signals['1h']) {
    weightedScoreSum += signals['1h'].score * weights['1h'];
    activeWeightSum += weights['1h'];
  }

  const compositeMtfScore = activeWeightSum > 0 
    ? Number((weightedScoreSum / activeWeightSum).toFixed(1))
    : 0;

  const confluenceTier = getTierFromScore(compositeMtfScore);

  return {
    '1h': signals['1h'],
    '4h': signals['4h'],
    '1d': signals['1d'],
    compositeMtfScore,
    confluenceTier
  };
}
