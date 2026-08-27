import { fetchYahoo, round } from './backtest-tight-risk-breakout.mjs';
import { SHORT_RESEARCH_ASSETS } from './backtest-weekly-donchian-short-50plus.mjs';
import {
  prepareLongDonchianData,
  runLongDonchianVariant,
  summarizeLongDonchianRows
} from './research-donchian-frequency.mjs';

const DEVELOPMENT_ASSETS = SHORT_RESEARCH_ASSETS.filter(asset => asset.marketClass === 'stocks');
const NEW_HOLDOUT_SYMBOLS = [
  'BRK-B', 'DIS', 'CMCSA', 'ABT', 'DHR', 'ACN', 'LIN', 'UPS', 'HON', 'MMM', 'AMGN', 'GILD',
  'CVS', 'CI', 'ELV', 'BKNG', 'MAR', 'RCL', 'F', 'GM', 'DE', 'EMR', 'ETN', 'SO', 'DUK', 'AEP',
  'CSX', 'UNP', 'NSC', 'USB', 'PNC', 'SCHW', 'BLK', 'SPGI', 'ICE', 'CME', 'CB', 'MMC', 'AON',
  'APD', 'ECL'
];
const NEW_HOLDOUT_ASSETS = NEW_HOLDOUT_SYMBOLS.map(symbol => ({
  symbol,
  providerSymbol: symbol,
  marketClass: 'stocks'
}));

const candidate = (id, entryWindow, exitWindow, atrStopMultiple = 2, maxStopPercent = 8) => ({
  id,
  entryWindow,
  exitWindow,
  atrStopMultiple,
  maxStopPercent,
  minimum52WeekHighRatio: 0,
  minimumMomentum252Percent: 0
});

const CANDIDATES = [
  candidate('BASE_D55_EXIT20_ATR2_STOP4', 55, 20, 2, 4),
  candidate('D55_EXIT40_ATR2_STOP8', 55, 40),
  candidate('D80_EXIT40_ATR2_STOP8', 80, 40),
  candidate('D80_EXIT50_ATR2_STOP8', 80, 50),
  candidate('D100_EXIT40_ATR2_STOP8', 100, 40),
  candidate('D100_EXIT50_ATR2_STOP8', 100, 50),
  candidate('D120_EXIT60_ATR2_STOP8', 120, 60),
  candidate('D55_EXIT40_ATR2_5_STOP8', 55, 40, 2.5),
  candidate('D80_EXIT40_ATR2_5_STOP8', 80, 40, 2.5),
  candidate('D100_EXIT50_ATR2_5_STOP8', 100, 50, 2.5)
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
  const endIndex = endFraction >= 1 ? eligible.length - 1 : Math.floor(eligible.length * endFraction) - 1;
  return [eligible[startIndex].timestamp, eligible[Math.max(startIndex, endIndex)].timestamp];
};

const evaluate = (datasets, config, startFraction, endFraction, frictionMultiplier = 1) => {
  const rows = datasets.map(data => {
    const [start, end] = bounds(data, startFraction, endFraction);
    return runLongDonchianVariant(data, config, start, end, frictionMultiplier);
  });
  return summarizeLongDonchianRows(rows);
};

const score = (result, baseline) => round(
  (result.profitFactor - baseline.profitFactor) * 2
  + (result.expectancyR - baseline.expectancyR)
  + Math.min(1, result.trades / Math.max(1, baseline.trades)) * 0.1,
  4
);

const main = async () => {
  const development = await fetchDatasets(DEVELOPMENT_ASSETS);
  const newHoldout = await fetchDatasets(NEW_HOLDOUT_ASSETS);
  if (development.datasets.length < 50 || newHoldout.datasets.length < 35) {
    throw new Error(`Istoric insuficient: development=${development.datasets.length}, holdout=${newHoldout.datasets.length}`);
  }

  const calibration = Object.fromEntries(CANDIDATES.map(config => [
    config.id,
    evaluate(development.datasets, config, 0, 0.6)
  ]));
  const validation = Object.fromEntries(CANDIDATES.map(config => [
    config.id,
    evaluate(development.datasets, config, 0.6, 0.8)
  ]));
  const baselineValidation = validation.BASE_D55_EXIT20_ATR2_STOP4;
  const eligible = CANDIDATES.slice(1).filter(config => {
    const train = calibration[config.id];
    const test = validation[config.id];
    return train.profitFactor >= 1.25
      && train.expectancyR > 0
      && test.trades >= Math.max(60, baselineValidation.trades * 0.6)
      && test.profitFactor >= baselineValidation.profitFactor + 0.15
      && test.expectancyR >= baselineValidation.expectancyR + 0.05;
  }).sort((left, right) => score(validation[right.id], baselineValidation) - score(validation[left.id], baselineValidation));
  const selected = eligible[0];
  const finalists = [CANDIDATES[0], ...(selected ? [selected] : [])];

  const newHoldoutAll = Object.fromEntries(finalists.map(config => [config.id, evaluate(newHoldout.datasets, config, 0, 1)]));
  const newHoldoutRecent30 = Object.fromEntries(finalists.map(config => [config.id, evaluate(newHoldout.datasets, config, 0.7, 1)]));
  const newHoldoutRecent30DoubleCosts = Object.fromEntries(finalists.map(config => [
    config.id,
    evaluate(newHoldout.datasets, config, 0.7, 1, 2)
  ]));
  const chronologicalFinal = Object.fromEntries(finalists.map(config => [config.id, evaluate(development.datasets, config, 0.8, 1)]));

  process.stdout.write(`${JSON.stringify({
    generatedAt: new Date().toISOString(),
    protocol: 'Slow-exit candidates selected on 63 development assets (60/20). Decisive holdout uses 41 separate stocks not used by round 1 or production candidate selection.',
    developmentAssets: development.datasets.length,
    developmentFailures: development.failures,
    newHoldoutAssets: newHoldout.datasets.length,
    newHoldoutFailures: newHoldout.failures,
    candidates: CANDIDATES,
    calibration,
    validation,
    selectedCandidate: selected?.id || null,
    chronologicalFinal,
    newHoldoutAll,
    newHoldoutRecent30,
    newHoldoutRecent30DoubleCosts
  }, null, 2)}\n`);
};

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
