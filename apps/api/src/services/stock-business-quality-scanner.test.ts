import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildStockBusinessQualityScan } from './stock-business-quality-scanner.js';

describe('Stock Business Quality & Profitability Scanner', () => {
  it('builds stock catalog coverage, 6 criteria and declared source identities without network access', () => {
    const scan = buildStockBusinessQualityScan();

    assert.ok(scan.scannedCount > 50, `Expected at least 50 scanned stocks, got ${scan.scannedCount}`);
    assert.equal(scan.coveredCount, scan.assets.filter(asset => asset.classification !== 'insufficient-data').length);
    assert.ok(scan.coveredCount > 0 && scan.coveredCount <= scan.scannedCount);
    assert.ok(scan.assets.some(asset => asset.classification === 'insufficient-data'), 'Curated-only scan must not imply full live coverage');
    assert.ok(scan.assets.length === scan.scannedCount);
    assert.ok(scan.methodology.length === 6, 'Expected 6 methodology criteria');
    assert.deepEqual(scan.sources.map(source => source.id), ['yahoo-finance', 'sec-edgar']);
    assert.deepEqual(scan.sources.map(source => new URL(source.url).hostname), ['finance.yahoo.com', 'www.sec.gov']);
    assert.ok(typeof scan.disclaimer === 'string' && scan.disclaimer.length > 20);
  });

  it('correctly evaluates Top AI Picks with high margins, ROE, FCF and fortress balance sheet', () => {
    const scan = buildStockBusinessQualityScan();
    const nvda = scan.assets.find(a => a.symbol === 'NVDA');

    assert.ok(nvda, 'NVDA should be in the scanned assets');
    assert.ok(nvda.score >= 80, `Expected NVDA score >= 80, got ${nvda.score}`);
    assert.ok(nvda.passedCriteria >= 5, `Expected NVDA to pass at least 5 criteria, got ${nvda.passedCriteria}`);
    assert.equal(nvda.aiVerdict, 'Top AI Pick');
    assert.equal(nvda.criteria.profitability.status, 'pass');
    assert.equal(nvda.criteria.capitalEfficiency.status, 'pass');
    assert.equal(nvda.criteria.growth.status, 'pass');
    assert.equal(nvda.criteria.freeCashFlow.status, 'pass');
    assert.ok(nvda.metrics.netMargin && nvda.metrics.netMargin > 50);
    assert.ok(nvda.metrics.roe && nvda.metrics.roe > 100);
    assert.ok(nvda.metrics.freeCashFlow && nvda.metrics.freeCashFlow > 50_000_000_000);
  });

  it('correctly evaluates software and consumer platform leaders (MSFT, AAPL, GOOGL, META)', () => {
    const scan = buildStockBusinessQualityScan();
    const techLeaders = ['MSFT', 'AAPL', 'GOOGL', 'META'];

    for (const sym of techLeaders) {
      const asset = scan.assets.find(a => a.symbol === sym);
      assert.ok(asset, `${sym} should be found in scan`);
      assert.ok(asset.score >= 75, `Expected ${sym} score >= 75, got ${asset.score}`);
      assert.ok(asset.passedCriteria >= 3, `Expected ${sym} passedCriteria >= 3, got ${asset.passedCriteria}`);
      assert.equal(asset.criteria.profitability.status, 'pass');
      assert.equal(asset.criteria.freeCashFlow.status, 'pass');
    }
  });

  it('ranks top AI recommended assets at the top of the scan', () => {
    const scan = buildStockBusinessQualityScan();

    assert.ok(scan.assets.length > 10);
    const topAsset = scan.assets[0];
    const tenthAsset = scan.assets[9];

    assert.ok(topAsset.score >= tenthAsset.score, 'Assets should be sorted descending by AI score');
    assert.ok(topAsset.score >= 85, `Top asset score should be >= 85, got ${topAsset.score}`);
  });

  it('aggregates counts for top picks, high profitability, growth & FCF, and dividend value', () => {
    const scan = buildStockBusinessQualityScan();

    assert.ok(scan.topPicksCount >= 5, `Expected >= 5 top picks, got ${scan.topPicksCount}`);
    assert.ok(scan.highProfitabilityCount >= 5, `Expected >= 5 high profitability assets, got ${scan.highProfitabilityCount}`);
    assert.ok(scan.growthFcfCount >= 5, `Expected >= 5 growth+FCF assets, got ${scan.growthFcfCount}`);
    assert.ok(scan.dividendValueCount >= 3, `Expected >= 3 dividend value assets, got ${scan.dividendValueCount}`);
  });

  it('generates rich qualitative AI investment thesis for each stock', () => {
    const scan = buildStockBusinessQualityScan();
    const google = scan.assets.find(a => a.symbol === 'GOOGL');

    assert.ok(google);
    assert.ok(google.aiThesis.length > 30, 'Expected non-empty AI thesis');
    assert.ok(google.aiThesis.includes('$GOOGL'));
    assert.ok(google.aiVerdictLabelRo.length > 0);
  });
});
