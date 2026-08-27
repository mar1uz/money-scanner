import { getScannerAssets } from '@money-scanner/shared';
import { fetchYahoo, round } from './backtest-tight-risk-breakout.mjs';
import { SHORT_RESEARCH_ASSETS } from './backtest-weekly-donchian-short-50plus.mjs';
import {
  prepareLongDonchianData,
  runLongDonchianVariant,
  summarizeLongDonchianRows
} from './research-donchian-frequency.mjs';

const DEVELOPMENT_ASSETS = SHORT_RESEARCH_ASSETS.filter(asset => asset.marketClass === 'stocks');
const developmentSymbols = new Set(DEVELOPMENT_ASSETS.map(asset => asset.symbol));
const FRESH_ASSETS = getScannerAssets('stocks')
  .filter(asset => !developmentSymbols.has(asset.symbol))
  .map(asset => ({ symbol: asset.symbol, providerSymbol: asset.symbol, marketClass: 'stocks' }));

const CANDIDATES = [
  {
    id: 'BASE_D55_ATR2_STOP4',
    entryWindow: 55,
    atrStopMultiple: 2,
    maxStopPercent: 4,
    minimum52WeekHighRatio: 0,
    minimumMomentum252Percent: 0
  },
  {
    id: 'D55_ATR2_STOP8',
    entryWindow: 55,
    atrStopMultiple: 2,
    maxStopPercent: 8,
    minimum52WeekHighRatio: 0,
    minimumMomentum252Percent: 0
  },
  {
    id: 'D80_ATR2_STOP8',
    entryWindow: 80,
    atrStopMultiple: 2,
    maxStopPercent: 8,
    minimum52WeekHighRatio: 0,
    minimumMomentum252Percent: 0
  },
  {
    id: 'D55_ATR2_5_STOP8',
    entryWindow: 55,
    atrStopMultiple: 2.5,
    maxStopPercent: 8,
    minimum52WeekHighRatio: 0,
    minimumMomentum252Percent: 0
  },
  {
    id: 'D80_ATR2_5_STOP8',
    entryWindow: 80,
    atrStopMultiple: 2.5,
    maxStopPercent: 8,
    minimum52WeekHighRatio: 0,
    minimumMomentum252Percent: 0
  },
  {
    id: 'HIGH52_D55_ATR2_STOP8',
    entryWindow: 55,
    atrStopMultiple: 2,
    maxStopPercent: 8,
    minimum52WeekHighRatio: 0.95,
    minimumMomentum252Percent: 0
  },
  {
    id: 'HIGH52_D80_ATR2_STOP8',
    entryWindow: 80,
    atrStopMultiple: 2,
    maxStopPercent: 8,
    minimum52WeekHighRatio: 0.95,
    minimumMomentum252Percent: 0
  },
  {
    id: 'MOM20_D55_ATR2_STOP8',
    entryWindow: 55,
    atrStopMultiple: 2,
    maxStopPercent: 8,
    minimum52WeekHighRatio: 0.95,
    minimumMomentum252Percent: 20
  },
  {
    id: 'MOM20_D80_ATR2_STOP8',
    entryWindow: 80,
    atrStopMultiple: 2,
    maxStopPercent: 8,
    minimum52WeekHighRatio: 0.95,
    minimumMomentum252Percent: 20
  }
];

const fetchDatasets = async assets => {
  const datasets = [];
  const failures = [];
  for (let start = 0; start < assets.length; start += 8) {
    const batch = assets.slice(start, start + 8);
    const settled = await Promise.allSettled(batch.map(async asset => {
      const candles = await fetchYahoo(asset.providerSymbol);
      if (candles.length < 800) throw new Error(`istoric insuficient: ${candles.length}`);
      return prepareLongDonchianData(asset, candles);
    }));
    settled.forEach((result, index) => {
      if (result.status === 'fulfilled') datasets.push(result.value);
      else failures.push({ symbol: batch[index].symbol, error: String(result.reason?.message || result.reason) });
    });
  }
  return { datasets, failures };
};

const bounds = (data, startFraction, endFraction) => {
  const eligible = data.candles.slice(300);
  const startIndex = Math.min(eligible.length - 1, Math.floor(eligible.length * startFraction));
  const endIndex = endFraction >= 1
    ? eligible.length - 1
    : Math.max(startIndex, Math.floor(eligible.length * endFraction) - 1);
  return [eligible[startIndex].timestamp, eligible[endIndex].timestamp];
};

const evaluate = (datasets, candidate, startFraction, endFraction, frictionMultiplier = 1) => {
  const rows = datasets.map(data => {
    const [start, end] = bounds(data, startFraction, endFraction);
    return runLongDonchianVariant(data, candidate, start, end, frictionMultiplier);
  });
  return summarizeLongDonchianRows(rows);
};

const improvementScore = (result, baseline) => {
  const pfGain = result.profitFactor - baseline.profitFactor;
  const expectancyGain = result.expectancyR - baseline.expectancyR;
  const frequencyRatio = baseline.trades ? result.trades / baseline.trades : 0;
  return round(pfGain * 2 + expectancyGain + Math.min(1, frequencyRatio) * 0.1, 4);
};

const main = async () => {
  const development = await fetchDatasets(DEVELOPMENT_ASSETS);
  const fresh = await fetchDatasets(FRESH_ASSETS);
  if (development.datasets.length < 50) throw new Error('Eșantionul de dezvoltare are sub 50 active valide.');
  if (fresh.datasets.length < 30) throw new Error('Holdout-ul transversal are sub 30 active valide.');

  const calibration = Object.fromEntries(CANDIDATES.map(candidate => [
    candidate.id,
    evaluate(development.datasets, candidate, 0, 0.6)
  ]));
  const validation = Object.fromEntries(CANDIDATES.map(candidate => [
    candidate.id,
    evaluate(development.datasets, candidate, 0.6, 0.8)
  ]));
  const baselineValidation = validation.BASE_D55_ATR2_STOP4;
  const eligible = CANDIDATES.slice(1).filter(candidate => {
    const train = calibration[candidate.id];
    const test = validation[candidate.id];
    return train.profitFactor >= 1.2
      && train.expectancyR > 0
      && test.trades >= Math.max(60, baselineValidation.trades * 0.6)
      && test.profitFactor >= baselineValidation.profitFactor + 0.1
      && test.expectancyR >= baselineValidation.expectancyR + 0.05;
  }).sort((left, right) => improvementScore(validation[right.id], baselineValidation)
    - improvementScore(validation[left.id], baselineValidation));
  const selected = eligible[0];
  const finalists = [CANDIDATES[0], ...(selected ? [selected] : [])];

  const chronologicalFinal = Object.fromEntries(finalists.map(candidate => [
    candidate.id,
    evaluate(development.datasets, candidate, 0.8, 1)
  ]));
  const chronologicalDoubleCosts = Object.fromEntries(finalists.map(candidate => [
    candidate.id,
    evaluate(development.datasets, candidate, 0.8, 1, 2)
  ]));
  const crossSectionalHoldout = Object.fromEntries(finalists.map(candidate => [
    candidate.id,
    evaluate(fresh.datasets, candidate, 0, 1)
  ]));
  const crossSectionalRecent30 = Object.fromEntries(finalists.map(candidate => [
    candidate.id,
    evaluate(fresh.datasets, candidate, 0.7, 1)
  ]));
  const crossSectionalRecent30DoubleCosts = Object.fromEntries(finalists.map(candidate => [
    candidate.id,
    evaluate(fresh.datasets, candidate, 0.7, 1, 2)
  ]));

  process.stdout.write(`${JSON.stringify({
    generatedAt: new Date().toISOString(),
    protocol: 'Candidate selection on 63 development stocks/ETFs using 60% calibration + 20% validation. Final 20% and 49 previously unused scanner symbols are opened only for the frozen winner.',
    sources: [
      'George & Hwang (2004), The 52-Week High and Momentum Investing',
      'Moskowitz, Ooi & Pedersen (2012), Time Series Momentum',
      'Moreira & Muir (2017), Volatility-Managed Portfolios'
    ],
    assumptions: {
      maximumStopPercent: 8,
      baselineMaximumStopPercent: 4,
      riskPerTradePercent: 0.5,
      feePerSidePercent: 0.075,
      slippagePerSidePercent: 0.05,
      exit: 'Donchian low 20 or Weekly trend invalidation',
      selectionGate: 'PF validation gain >= 0.10, expectancy gain >= 0.05R, >=60% of baseline trades, positive calibration PF >=1.20'
    },
    developmentAssets: development.datasets.length,
    developmentFailures: development.failures,
    freshAssets: fresh.datasets.length,
    freshFailures: fresh.failures,
    candidates: CANDIDATES,
    calibration,
    validation,
    selectedCandidate: selected?.id || null,
    chronologicalFinal,
    chronologicalDoubleCosts,
    crossSectionalHoldout,
    crossSectionalRecent30,
    crossSectionalRecent30DoubleCosts
  }, null, 2)}\n`);
};

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
