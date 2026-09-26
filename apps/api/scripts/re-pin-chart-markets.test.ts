// Fixture tests for the re-pin campaign tool: diff, formatting, planning and
// argument handling. No Firestore, no network: run with
//   cd "apps/api" && npx tsx --test scripts/re-pin-chart-markets.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertApplyConfirmed,
  candidateLabel,
  diffPin,
  LooseCandidate,
  LooseResolution,
  parseArgs,
  planApplyWrites,
  readPinsFromFile,
  renderConsoleSummary,
  renderDiffTable,
  repoRoot,
  summarizeDiffs,
  suspectedFabricatedListingStart,
  toStoredPin,
  verifyResolverBuild
} from './re-pin-chart-markets.js';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 8, 26, 12, 0, 0);

const candidate = (overrides: Partial<LooseCandidate> = {}): LooseCandidate => ({
  source: 'binance_spot',
  exchange: 'BINANCE',
  providerSymbol: 'AAAUSDT',
  tvSymbol: 'BINANCE:AAAUSDT',
  quoteCurrency: 'USDT',
  listingStart: Date.UTC(2019, 0, 1),
  volume24hQuote: 1_000_000,
  candleCapable: true,
  identityVerified: true,
  lastPrice: 12.34,
  ...overrides
});

const pin = (overrides: Partial<LooseResolution> & { key: string }): LooseResolution & { key: string } => ({
  symbol: overrides.key.split(':')[0],
  coinGeckoId: overrides.key.split(':')[1] || 'aaa',
  candle: candidate(),
  tv: candidate(),
  candidates: [candidate()],
  resolvedAt: NOW - 30 * DAY,
  ...overrides
});

describe('diffPin', () => {
  it('reports UNCHANGED when source, listingStart and tvSymbol are identical', () => {
    const stored = pin({ key: 'AAA:aaa' });
    const next: LooseResolution = { symbol: 'AAA', coinGeckoId: 'aaa', candle: candidate(), tv: candidate(), candidates: [candidate()], resolvedAt: NOW };
    const diff = diffPin(stored, next, { now: NOW });
    assert.equal(diff.verdict, 'UNCHANGED');
    assert.equal(diff.changes.length, 0);
    assert.ok(diff.reasons.some(reason => reason.includes('nicio diferență materială')));
  });

  it('flags a removed fabricated listingStart as CHANGED with an explicit reason', () => {
    const krakenAge = NOW - 720 * DAY;
    const stored = pin({
      key: 'SKY:sky',
      candle: candidate({ source: 'mexc_spot', listingStart: Date.UTC(2024, 9, 5) }),
      tv: candidate({ source: 'kraken', exchange: 'KRAKEN', providerSymbol: 'SKYUSD', tvSymbol: 'KRAKEN:SKYUSD', listingStart: krakenAge, candleCapable: false })
    });
    const next: LooseResolution = {
      symbol: 'SKY', coinGeckoId: 'sky',
      candle: candidate({ source: 'binance_spot', providerSymbol: 'SKYUSDT', tvSymbol: 'BINANCE:SKYUSDT', listingStart: Date.UTC(2025, 4, 1) }),
      tv: candidate({ source: 'binance_spot', providerSymbol: 'SKYUSDT', tvSymbol: 'BINANCE:SKYUSDT', listingStart: Date.UTC(2025, 4, 1) }),
      resolvedAt: NOW
    };
    const diff = diffPin(stored, next, { now: NOW });
    assert.equal(diff.verdict, 'CHANGED');
    const fields = diff.changes.map(change => `${change.slot}.${change.field}`);
    assert.ok(fields.includes('tv.source'));
    assert.ok(fields.includes('tv.tvSymbol'));
    assert.ok(fields.includes('tv.listingStart'));
    assert.ok(diff.reasons.some(reason => reason.includes('listingStart corectat')));
    assert.equal(diff.fabricated.length, 1);
    assert.equal(diff.fabricated[0].source, 'kraken');
  });

  it('reports a listingStart that becomes correctly unknown as "fabricat eliminat"', () => {
    const krakenAge = NOW - 721 * DAY;
    const stored = pin({
      key: 'SKY:sky',
      candle: candidate({ source: 'mexc_spot', listingStart: Date.UTC(2024, 9, 5) }),
      tv: candidate({ source: 'kraken', exchange: 'KRAKEN', providerSymbol: 'SKYUSD', tvSymbol: 'KRAKEN:SKYUSD', listingStart: krakenAge, candleCapable: false })
    });
    const next: LooseResolution = {
      symbol: 'SKY', coinGeckoId: 'sky',
      candle: candidate({ source: 'mexc_spot', listingStart: Date.UTC(2024, 9, 5) }),
      tv: candidate({ source: 'kraken', exchange: 'KRAKEN', providerSymbol: 'SKYUSD', tvSymbol: 'KRAKEN:SKYUSD', listingStart: null, candleCapable: false }),
      resolvedAt: NOW
    };
    const diff = diffPin(stored, next, { now: NOW });
    assert.equal(diff.verdict, 'CHANGED');
    assert.deepEqual(diff.changes.map(change => `${change.slot}.${change.field}`), ['tv.listingStart']);
    assert.equal(diff.changes[0].from, krakenAge);
    assert.equal(diff.changes[0].to, null);
    assert.ok(diff.reasons.some(reason => reason.includes('listingStart fabricat eliminat')));
  });

  it('never counts live numbers (volume/lastPrice) as a change', () => {
    const stored = pin({ key: 'AAA:aaa' });
    const next: LooseResolution = {
      symbol: 'AAA', coinGeckoId: 'aaa',
      candle: candidate({ volume24hQuote: 42, lastPrice: 999 }),
      tv: candidate({ volume24hQuote: 42, lastPrice: 999 }),
      resolvedAt: NOW
    };
    assert.equal(diffPin(stored, next, { now: NOW }).verdict, 'UNCHANGED');
  });

  it('reports the fa1104a spot-volume fill as informational, not as a change', () => {
    const stored = pin({ key: 'AAA:aaa', candle: candidate({ volume24hQuote: null }), tv: candidate({ volume24hQuote: null }) });
    const next: LooseResolution = {
      symbol: 'AAA', coinGeckoId: 'aaa',
      candle: candidate({ volume24hQuote: 1_500_000_000 }),
      tv: candidate({ volume24hQuote: 1_500_000_000 }),
      resolvedAt: NOW
    };
    const diff = diffPin(stored, next, { now: NOW });
    assert.equal(diff.verdict, 'UNCHANGED');
    assert.deepEqual(diff.volumeSourceAdded.map(entry => entry.slot), ['candle', 'tv']);
    assert.equal(diff.volumeSourceAdded[0].source, 'binance_spot');
    assert.equal(summarizeDiffs([diff]).volumeSourceAddedPins.length, 1);
  });

  it('classifies a null recompute as RECOMPUTE_FAILED with the diagnostic error', () => {
    const diff = diffPin(pin({ key: 'AAA:aaa' }), null, { now: NOW, error: 'identitate CoinGecko indisponibilă (HTTP 429)' });
    assert.equal(diff.verdict, 'RECOMPUTE_FAILED');
    assert.match(diff.error || '', /429/);
    assert.equal(diff.next, null);
  });

  it('classifies a recompute that lost the candle identity as RECOMPUTE_FAILED', () => {
    const next: LooseResolution = { symbol: 'AAA', coinGeckoId: 'aaa', candle: candidate({ identityVerified: false }), tv: null, resolvedAt: NOW };
    assert.equal(diffPin(pin({ key: 'AAA:aaa' }), next, { now: NOW }).verdict, 'RECOMPUTE_FAILED');
  });

  it('classifies a different identity as IDENTITY_MISMATCH', () => {
    const next: LooseResolution = { symbol: 'AAA', coinGeckoId: 'other-coin', candle: candidate(), tv: candidate(), resolvedAt: NOW };
    assert.equal(diffPin(pin({ key: 'AAA:aaa' }), next, { now: NOW }).verdict, 'IDENTITY_MISMATCH');
  });

  it('skips pins whose source the current build cannot produce, unless explicitly included', () => {
    const stored = pin({
      key: 'GP:graphite-protocol',
      candle: candidate({ source: 'xt_spot', exchange: 'XT.COM', providerSymbol: 'gp_usdt', tvSymbol: 'XTCOM:GPUSDT' }),
      tv: candidate({ source: 'xt_spot', exchange: 'XT.COM', providerSymbol: 'gp_usdt', tvSymbol: 'XTCOM:GPUSDT' })
    });
    const next: LooseResolution = { symbol: 'GP', coinGeckoId: 'graphite-protocol', candle: candidate({ source: 'kucoin_spot', tvSymbol: 'KUCOIN:GPUSDT' }), tv: candidate({ source: 'kucoin_spot', tvSymbol: 'KUCOIN:GPUSDT' }), resolvedAt: NOW };
    const skipped = diffPin(stored, next, { now: NOW });
    assert.equal(skipped.verdict, 'SKIPPED_UNSUPPORTED_SOURCE');
    assert.equal(skipped.changes.length, 0);
    const included = diffPin(stored, next, { now: NOW, includeUnsupported: true });
    assert.equal(included.verdict, 'CHANGED');
    assert.ok(included.changes.some(change => change.field === 'source'));
  });
});

describe('suspectedFabricatedListingStart', () => {
  it('flags Kraken ~720d and Coinbase ~300-350d listing dates', () => {
    assert.equal(suspectedFabricatedListingStart(candidate({ source: 'kraken', listingStart: NOW - 721 * DAY }), NOW)?.source, 'kraken');
    assert.equal(suspectedFabricatedListingStart(candidate({ source: 'coinbase', listingStart: NOW - 327 * DAY }), NOW)?.source, 'coinbase');
  });

  it('does not flag real listing dates or nulls', () => {
    assert.equal(suspectedFabricatedListingStart(candidate({ source: 'kraken', listingStart: Date.UTC(2013, 8, 10) }), NOW), null);
    assert.equal(suspectedFabricatedListingStart(candidate({ source: 'coinbase', listingStart: NOW - 30 * DAY }), NOW), null);
    assert.equal(suspectedFabricatedListingStart(candidate({ source: 'kraken', listingStart: null }), NOW), null);
    assert.equal(suspectedFabricatedListingStart(null, NOW), null);
  });
});

describe('summarizeDiffs + rendering', () => {
  const stored = pin({ key: 'AAA:aaa' });
  const changedPin = pin({ key: 'BBB:bbb', candle: candidate({ source: 'okx_spot', providerSymbol: 'BBB-USDT', tvSymbol: 'OKX:BBBUSDT' }), tv: candidate({ source: 'okx_spot', providerSymbol: 'BBB-USDT', tvSymbol: 'OKX:BBBUSDT' }) });
  const nextChanged: LooseResolution = { symbol: 'BBB', coinGeckoId: 'bbb', candle: candidate({ source: 'binance_spot' }), tv: candidate({ source: 'binance_spot' }), resolvedAt: NOW };
  const unsupported = pin({
    key: 'GP:graphite-protocol',
    candle: candidate({ source: 'xt_spot', tvSymbol: 'XTCOM:GPUSDT' }),
    tv: candidate({ source: 'xt_spot', tvSymbol: 'XTCOM:GPUSDT' })
  });
  const diffs = [
    diffPin(stored, { symbol: 'AAA', coinGeckoId: 'aaa', candle: candidate(), tv: candidate(), resolvedAt: NOW }, { now: NOW }),
    diffPin(changedPin, nextChanged, { now: NOW }),
    diffPin(unsupported, { symbol: 'GP', coinGeckoId: 'graphite-protocol', candle: candidate(), tv: candidate(), resolvedAt: NOW }, { now: NOW }),
    diffPin(pin({ key: 'CCC:ccc' }), null, { now: NOW, error: 'boom' })
  ];

  it('counts verdicts and per-field changes', () => {
    const summary = summarizeDiffs(diffs);
    assert.equal(summary.pins, 4);
    assert.equal(summary.changed, 1);
    assert.equal(summary.unchanged, 1);
    assert.equal(summary.skippedUnsupported, 1);
    assert.equal(summary.failed, 1);
    assert.equal(summary.byField.candleSource, 1);
    assert.equal(summary.byField.tvSource, 1);
    assert.deepEqual(summary.changedKeys, ['BBB:bbb']);
    assert.deepEqual(summary.unchangedKeys, ['AAA:aaa']);
    assert.deepEqual(summary.skippedKeys, ['GP:graphite-protocol']);
    assert.deepEqual(summary.failedKeys, ['CCC:ccc']);
  });

  it('renders the console summary with every counter', () => {
    const text = renderConsoleSummary(summarizeDiffs(diffs));
    assert.match(text, /pinuri citite:\s+4/);
    assert.match(text, /SCHIMBATE:\s+1/);
    assert.match(text, /saltate \(sursă nesuportată\): 1/);
  });

  it('renders a markdown table with one header and one row per diff', () => {
    const table = renderDiffTable(diffs, { now: NOW, onlyChanged: true });
    const lines = table.split('\n');
    assert.equal(lines[0].split('|').filter(Boolean).length, 9);
    assert.equal(lines.length, 3); // header + divider + the single changed row
    assert.match(lines[2], /BBB:bbb/);
    assert.match(lines[2], /\| DA \|/);
  });

  it('escapes pipes coming from reason text so the table stays intact', () => {
    const table = renderDiffTable([diffPin(changedPin, nextChanged, { now: NOW })], { now: NOW });
    assert.ok(!table.split('\n')[2].includes('| |'));
    assert.equal(table.split('\n')[2].split('|').filter(Boolean).length, 9);
  });

  it('formats candidate labels with date, age and tv symbol', () => {
    const label = candidateLabel(candidate({ source: 'binance_spot', listingStart: Date.UTC(2019, 0, 1) }), NOW);
    assert.match(label, /^binance_spot·2019-01-01 \(\d+z\)·BINANCE:AAAUSDT$/);
    assert.equal(candidateLabel(null, NOW), 'null');
  });
});

describe('planApplyWrites', () => {
  const changed = diffPin(
    pin({ key: 'BBB:bbb', candle: candidate({ source: 'okx_spot', providerSymbol: 'BBB-USDT' }) }),
    { symbol: 'BBB', coinGeckoId: 'bbb', candle: candidate(), tv: candidate(), resolvedAt: NOW },
    { now: NOW }
  );
  const unchanged = diffPin(pin({ key: 'AAA:aaa' }), { symbol: 'AAA', coinGeckoId: 'aaa', candle: candidate(), tv: candidate(), resolvedAt: NOW }, { now: NOW });
  const failed = diffPin(pin({ key: 'CCC:ccc' }), null, { now: NOW, error: 'boom' });
  const skipped = diffPin(
    pin({ key: 'GP:graphite-protocol', candle: candidate({ source: 'xt_spot' }), tv: candidate({ source: 'xt_spot' }) }),
    { symbol: 'GP', coinGeckoId: 'graphite-protocol', candle: candidate(), tv: candidate(), resolvedAt: NOW },
    { now: NOW }
  );
  const resolutions = new Map<string, LooseResolution>([
    ['BBB:bbb', { symbol: 'BBB', coinGeckoId: 'bbb', candle: candidate(), tv: candidate(), resolvedAt: NOW }],
    ['AAA:aaa', { symbol: 'AAA', coinGeckoId: 'aaa', candle: candidate(), tv: candidate(), resolvedAt: NOW }],
    ['GP:graphite-protocol', { symbol: 'GP', coinGeckoId: 'graphite-protocol', candle: candidate(), tv: candidate(), resolvedAt: NOW }]
  ]);

  it('plans a write only for CHANGED pins and skips everything else', () => {
    const { writes, skipped: skippedPlans } = planApplyWrites([changed, unchanged, failed, skipped], resolutions);
    assert.deepEqual(writes.map(entry => entry.key), ['BBB:bbb']);
    assert.deepEqual(skippedPlans.map(entry => entry.verdict).sort(), ['RECOMPUTE_FAILED', 'SKIPPED_UNSUPPORTED_SOURCE', 'UNCHANGED']);
  });

  it('refuses to plan a write when the recomputed candle lost identity verification', () => {
    const unverified = diffPin(
      pin({ key: 'BBB:bbb', candle: candidate({ source: 'okx_spot' }) }),
      { symbol: 'BBB', coinGeckoId: 'bbb', candle: candidate(), tv: candidate(), resolvedAt: NOW },
      { now: NOW }
    );
    const badResolutions = new Map([['BBB:bbb', { symbol: 'BBB', coinGeckoId: 'bbb', candle: candidate({ identityVerified: false }), tv: null, resolvedAt: NOW } as LooseResolution]]);
    assert.equal(planApplyWrites([unverified], badResolutions).writes.length, 0);
  });
});

describe('parseArgs', () => {
  it('parses the documented flags', () => {
    const options = parseArgs(['--apply', '--yes', '--only=BTC,ETH', '--exclude=SKY', '--limit=5', '--passes=3', '--include-unsupported', '--all-rows']);
    assert.equal(options.apply, true);
    assert.equal(options.yes, true);
    assert.deepEqual(options.only, ['BTC', 'ETH']);
    assert.deepEqual(options.exclude, ['SKY']);
    assert.equal(options.limit, 5);
    assert.equal(options.passes, 3);
    assert.equal(options.includeUnsupported, true);
    assert.equal(options.allRows, true);
  });

  it('defaults to a read-only dry run and rejects unknown flags', () => {
    const options = parseArgs([]);
    assert.equal(options.apply, false);
    assert.equal(options.yes, false);
    assert.equal(options.passes, 2);
    assert.throws(() => parseArgs(['--write']), /unknown flag/);
  });
});

describe('pin loading + build guard', () => {
  it('maps a Firestore document (with audit extras) into a StoredPin', () => {
    const stored = toStoredPin('AAA:aaa', {
      symbol: 'AAA', coinGeckoId: 'aaa', candle: candidate(), tv: candidate(), candidates: [candidate()],
      resolvedAt: 123, rePinAudit: { version: 2 }
    });
    assert.equal(stored.symbol, 'AAA');
    assert.equal(stored.coinGeckoId, 'aaa');
    assert.equal(stored.candle?.source, 'binance_spot');
    assert.deepEqual(stored.extra, { rePinAudit: { version: 2 } });
  });

  it('reads pins from a dumped fixture file', () => {
    const root = repoRoot();
    const dir = join(root, 'tmp/re-pin/test-fixtures');
    mkdirSync(dir, { recursive: true });
    const path = join(dir, 'pins-fixture.json');
    writeFileSync(path, JSON.stringify([
      { id: 'AAA:aaa', symbol: 'AAA', coinGeckoId: 'aaa', candle: candidate(), tv: candidate(), candidates: [], resolvedAt: 7 },
      { symbol: '', coinGeckoId: '' }
    ]));
    const pins = readPinsFromFile(path);
    assert.equal(pins.length, 1);
    assert.equal(pins[0].key, 'AAA:aaa');
    assert.equal(pins[0].resolvedAt, 7);
  });

  it('verifies that the built resolver contains the fa1104a fix markers', () => {
    const check = verifyResolverBuild(repoRoot());
    assert.equal(check.ok, true, check.details);
    assert.deepEqual(check.markers, {
      KRAKEN_OHLC_WINDOW: true,
      COINBASE_TRUNCATED_CANDLE_COUNT: true,
      binanceSpotQuoteVolume24h: true
    });
  });

  it('fails closed for a build without the fix markers', () => {
    const check = verifyResolverBuild('/tmp/definitely-not-a-repo');
    assert.equal(check.ok, false);
    assert.match(check.details, /nu pot citi/);
  });

  it('requires --yes before any apply can write pins', () => {
    assert.throws(() => assertApplyConfirmed(parseArgs(['--apply'])), /--apply necesită și --yes/);
    assert.doesNotThrow(() => assertApplyConfirmed(parseArgs(['--apply', '--yes'])));
    assert.doesNotThrow(() => assertApplyConfirmed(parseArgs([])));
  });
});
