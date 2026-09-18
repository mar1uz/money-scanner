import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REGIME_TAPE_DISCLOSURE,
  REGIME_TAPE_VERSION,
  RegimeTapeEvent
} from '@money-scanner/shared';
import { MoneyLineEngine } from '@money-scanner/money-line';
import {
  buildRegimeTapeEventId,
  buildXPreview,
  isValidWaitlistEmail,
  outcomesDue,
  RegimeTapeService
} from './regime-tape-service.js';

const DAY_MS = 86_400_000;

const sampleEvent = (overrides: Partial<RegimeTapeEvent> = {}): RegimeTapeEvent => ({
  id: 'tape:crypto:BTC:1d:1704067200000',
  symbol: 'BTC',
  name: 'Bitcoin',
  marketClass: 'crypto',
  timeframe: '1d',
  previousTier: 'Neutral',
  tier: 'Bullish',
  score: 34.2,
  previousScore: 10.1,
  transitionPrice: 42000,
  candleCloseTime: 1704067200000,
  detectedAt: 1704153600000,
  source: 'Binance/Hyperliquid public candles',
  methodVersion: 'v1.0.0',
  tapeVersion: REGIME_TAPE_VERSION,
  contributions: {
    emaAlignmentScore: 50, emaSlopeScore: 20, rocScore: 15, macdScore: 25,
    rsiScore: 10, rvolScore: 5, volatilityRegimeScore: 0, mtfConfirmationScore: 0
  },
  ...overrides
});

test('buildRegimeTapeEventId is deterministic and idempotent', () => {
  const a = buildRegimeTapeEventId('crypto', 'btc', '1d', 1704067200000);
  const b = buildRegimeTapeEventId('crypto', 'BTC', '1d', 1704067200000);
  assert.equal(a, b);
  assert.equal(a, 'tape:crypto:BTC:1d:1704067200000');
});

test('outcomesDue returns only elapsed, unfilled windows', () => {
  const event = sampleEvent();
  const t0 = event.candleCloseTime;
  assert.deepEqual(outcomesDue(event, t0 + 12 * 3_600_000), []);
  assert.deepEqual(outcomesDue(event, t0 + DAY_MS), ['d1']);
  assert.deepEqual(outcomesDue(event, t0 + 8 * DAY_MS), ['d1', 'd7']);
  assert.deepEqual(outcomesDue(event, t0 + 31 * DAY_MS), ['d1', 'd7', 'd30']);
  const withD1 = sampleEvent({ outcomes: { d1: { price: 43000, returnPct: 2.38, measuredAt: t0 + DAY_MS } } });
  assert.deepEqual(outcomesDue(withD1, t0 + 31 * DAY_MS), ['d7', 'd30']);
});

test('isValidWaitlistEmail accepts normal emails and rejects junk', () => {
  assert.equal(isValidWaitlistEmail('marius@example.com'), true);
  assert.equal(isValidWaitlistEmail('a.b+c@sub.domain.co'), true);
  assert.equal(isValidWaitlistEmail('not-an-email'), false);
  assert.equal(isValidWaitlistEmail('no@dot'), false);
  assert.equal(isValidWaitlistEmail(''), false);
  assert.equal(isValidWaitlistEmail('x'.repeat(400) + '@x.com'), false);
});

test('buildXPreview states facts with disclosure and never predicts returns', () => {
  const report: any = {
    id: 'tape-scan:2026-09-18', startedAt: Date.UTC(2026, 8, 18, 6),
    status: 'complete', universeSize: 170, scanned: 168, errors: 2,
    newEvents: 1, outcomesUpdated: 5, timeframes: ['1d', '1w'],
    methodVersion: 'v1.0.0', tapeVersion: REGIME_TAPE_VERSION, coverage: []
  };
  const text = buildXPreview([sampleEvent()], report);
  assert.match(text, /BTC \(1d\): Neutral -> Bullish/);
  assert.match(text, /170 scanned|Scanned: 168/);
  assert.match(text, /scanner\.relayhub\.no\/tape/);
  assert.ok(text.includes(REGIME_TAPE_DISCLOSURE));
  assert.doesNotMatch(text.toLowerCase(), /will rise|will go up|guaranteed|buy now/);
});

test('detectTransition only records real tier changes on closed candles', () => {
  const engine = new MoneyLineEngine();
  const service = new (RegimeTapeService as any)(null, engine, null);
  const asset: any = { symbol: 'TEST', name: 'Test Asset', marketClass: 'crypto', rank: 1 };

  const mkCandles = (closes: number[]) => closes.map((close, i) => ({
    timestamp: Date.UTC(2026, 0, 1) + i * DAY_MS,
    open: close * 0.99, high: close * 1.02, low: close * 0.98, close,
    volume: 1_000_000, isClosed: true
  }));

  // Flat price: tier stays Neutral, no transition.
  const flat = service.detectTransition(asset, '1d', mkCandles(new Array(250).fill(100)), Date.now());
  assert.equal(flat, null);

  // Strong rally into the last candles: latest tier must differ from a
  // deliberately crashed previous segment.
  const crashThenRally = [...new Array(230).fill(100), ...Array.from({ length: 20 }, (_, i) => 100 - i * 2), ...Array.from({ length: 5 }, (_, i) => 60 + i * 8)];
  const event = service.detectTransition(asset, '1d', mkCandles(crashThenRally), Date.now());
  if (event) {
    assert.equal(event.symbol, 'TEST');
    assert.notEqual(event.tier, event.previousTier);
    assert.equal(event.id, buildRegimeTapeEventId('crypto', 'TEST', '1d', event.candleCloseTime));
    assert.equal(event.methodVersion, 'v1.0.0');
    assert.equal(event.tapeVersion, REGIME_TAPE_VERSION);
    assert.ok(Number.isFinite(event.score));
  }
  // An open (unclosed) candle must never anchor a tape event.
  const withOpen = mkCandles([...new Array(249).fill(100), 200]);
  withOpen[withOpen.length - 1].isClosed = false;
  const noEvent = service.detectTransition(asset, '1d', withOpen, Date.now());
  assert.equal(noEvent, null);
});
