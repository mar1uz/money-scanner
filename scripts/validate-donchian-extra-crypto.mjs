import { prepare, run, summarize } from './research-cross-asset-strategies.mjs';

const symbols = [
  'TRX', 'ZEC', 'XLM', 'BCH', 'HBAR', 'SHIB', 'SUI', 'UNI', 'NEAR', 'TAO', 'AAVE', 'ONDO',
  'PEPE', 'DOT', 'WLD', 'ENA', 'ICP', 'ETC', 'QNT', 'NEXO', 'JST', 'ALGO', 'ATOM', 'RENDER'
];

const main = async () => {
  const datasets = [];
  const skipped = [];
  for (const symbol of symbols) {
    try {
      const data = await prepare({ symbol, marketClass: 'crypto' });
      if (data.candles.length < 700) {
        skipped.push({ symbol, reason: `istoric insuficient: ${data.candles.length} lumânări` });
      } else {
        datasets.push(data);
      }
    } catch (error) {
      skipped.push({ symbol, reason: error instanceof Error ? error.message : String(error) });
    }
  }

  const fullRows = datasets.map(data => run(
    'donchian55_tsmom',
    data,
    data.candles[300].timestamp,
    data.candles.at(-1).timestamp
  ));
  const recentRows = datasets.map(data => {
    const eligible = data.candles.slice(300);
    return run(
      'donchian55_tsmom',
      data,
      eligible[Math.floor(eligible.length * 0.8)].timestamp,
      eligible.at(-1).timestamp
    );
  });
  process.stdout.write(`${JSON.stringify({
    generatedAt: new Date().toISOString(),
    strategy: '12M Momentum + Donchian 55/20',
    validationType: 'cross-sectional holdout; crypto assets absent from candidate selection',
    eligibleSymbols: datasets.map(data => data.asset.symbol),
    skipped,
    fullHistoryAfterWarmup: {
      summary: summarize(fullRows).byClass.crypto,
      rows: fullRows.map(({ tradeLog, ...row }) => row)
    },
    recent20Percent: {
      summary: summarize(recentRows).byClass.crypto,
      rows: recentRows.map(({ tradeLog, ...row }) => row)
    }
  }, null, 2)}\n`);
};

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
