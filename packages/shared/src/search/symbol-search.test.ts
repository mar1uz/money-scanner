import test from 'node:test';
import assert from 'node:assert/strict';
import { TRADING_360_ASSETS } from '../constants/assets.js';
import {
  catalogToSearchCandidates,
  rankSymbolSearchCandidates,
  type SearchMarketClass,
  type SymbolSearchCandidate
} from './symbol-search.js';

/**
 * Ranking regressions for the search pipeline audit of 2026-09-25 (F5/F7, plan A7/B2).
 * The catalog below is the real one shipped in the repo, and every venue row is shaped
 * exactly like `binanceSearchCandidates`/`dynamicSearchCandidates` build it from the live
 * provider payloads (`api.binance.com/api/v3/exchangeInfo`, CoinGecko top-150).
 *
 * Wave B2 (F5): the response de-duplicates rows that describe the same asset AND the same
 * instrument, keeping the row the comparator ranks first and completing it with the exact
 * identity (coinGeckoId) of its absorbed siblings. These tests encode that response shape:
 * one row per asset + instrument, real collisions (different class, different coin, spot vs
 * perpetual) still separate.
 */
const catalog = catalogToSearchCandidates(TRADING_360_ASSETS);

/** Result identities handed to the search modal (it de-duplicates rows on `resultId`). */
const RESULT_ID = {
  btcCatalog: 'crypto:BINANCE:unknown:BTC:',
  btcUniverse: 'crypto:coin:bitcoin',
  btcusdtSpot: 'crypto:BINANCE:spot:BTCUSDT:',
  btcusdtPerp: 'crypto:BINANCEFUTURES:perpetual:BTCUSDT:',
  cakeusdtSpot: 'crypto:BINANCE:spot:CAKEUSDT:',
  cvxEquity: 'stocks:GLOBAL:unknown:CVX:',
  cvxConvex: 'crypto:coin:convex-finance'
} as const;

const catalogRow = (symbol: string, marketClass: SearchMarketClass): SymbolSearchCandidate => {
  const row = catalog.find(entry => entry.symbol === symbol && entry.marketClass === marketClass);
  assert.ok(row, `catalog row ${marketClass}:${symbol} must exist`);
  return row;
};

/** Binance spot quotes accepted by the route, longest first so suffix parsing stays exact. */
const SPOT_QUOTES = ['USDT', 'USDC', 'FDUSD', 'BTC', 'ETH', 'EUR'];

/** One live Binance spot pair, transcribed from the exchangeInfo payload. */
const binanceSpotPair = (pair: string): SymbolSearchCandidate => {
  const quote = SPOT_QUOTES.find(candidate => pair.endsWith(candidate));
  assert.ok(quote, `pair ${pair} must end in a supported spot quote`);
  const base = pair.slice(0, -quote.length);
  return {
    symbol: base, displaySymbol: pair, providerSymbol: pair, name: `${base} / ${quote}`,
    category: 'Crypto Spot', marketClass: 'crypto', exchange: 'BINANCE', instrumentType: 'spot',
    quoteCurrency: quote, aliases: [base, pair, `${base}/${quote}`], verified: true, matchType: 'binance'
  };
};

/** One live Binance USDT perpetual (futures exchangeInfo). */
const binancePerpetual = (pair: string): SymbolSearchCandidate => {
  const base = pair.slice(0, -'USDT'.length);
  return {
    symbol: `${pair}.P`, displaySymbol: `${pair}.P`, providerSymbol: pair,
    name: `${base} / USDT Perpetual`, category: 'Crypto Perpetual', marketClass: 'crypto',
    exchange: 'BINANCE Futures', instrumentType: 'perpetual', quoteCurrency: 'USDT',
    aliases: [base, pair, `${pair}.P`, `${base}/USDT perpetual`], verified: true, matchType: 'binance'
  };
};

/** CoinGecko top-150 row (dynamic universe / search provider), as the route builds it. */
const coinGeckoTradedRow = (
  symbol: string, name: string, coinGeckoId: string, rank: number, quoteCurrency = 'USDT'
): SymbolSearchCandidate => ({
  symbol, displaySymbol: symbol, name, category: 'Crypto Asset', marketClass: 'crypto',
  exchange: 'COINGECKO', instrumentType: 'spot', quoteCurrency,
  aliases: [coinGeckoId, name, symbol], coinGeckoId, rank, verified: true, matchType: 'universe'
});

/** Aliases only survive when the merge keeps them: the surviving row must still be findable. */
const assertReachable = (result: { aliases?: string[] }, aliases: string[]) => {
  for (const alias of aliases) {
    assert.ok(result.aliases?.includes(alias), `absorbed row must stay reachable through alias ${alias}`);
  }
};

test('one asset + one instrument collapse into a single row, and the comparator picks the survivor (CAKE)', () => {
  const candidates = [
    binanceSpotPair('CAKEBTC'), binanceSpotPair('CAKEUSDC'), binanceSpotPair('CAKEUSDT'),
    binancePerpetual('CAKEUSDT'), coinGeckoTradedRow('CAKE', 'PancakeSwap', 'pancakeswap-token', 84),
    catalogRow('CAKE', 'crypto')
  ];
  const results = rankSymbolSearchCandidates('CAKE', candidates);

  // Five rows used to answer this query (catalog, universe, three spot pairs) plus the perpetual.
  // The six same-asset rows collapse to two: the canonical spot row and the perpetual.
  assert.equal(results.length, 2, 'one row per asset + instrument');
  assert.equal(results[0]?.resultId, 'crypto:coin:pancakeswap-token');
  assert.equal(results[0]?.instrumentType, 'spot');
  assert.equal(results[1]?.resultId, 'crypto:BINANCEFUTURES:perpetual:CAKEUSDT:');
  assert.equal(results[1]?.symbol, 'CAKEUSDT.P');
  // The absorbed pairs are still reachable: their venue symbols stay as search aliases.
  assertReachable(results[0], ['CAKEUSDT', 'CAKEUSDC', 'CAKEBTC', 'CAKE/USDT', 'CAKE/BTC']);
});

test('the surviving row of a collapsed group is the one the comparator ranks first (primary quote when only pairs compete)', () => {
  // No canonical/universe row: the three spot pairs really are tied, so the A7 quote tie-break
  // (USDT before USDC before BTC) decides which of them survives - de-duplication must not.
  const results = rankSymbolSearchCandidates('CAKE', [
    binanceSpotPair('CAKEBTC'), binanceSpotPair('CAKEUSDC'), binanceSpotPair('CAKEUSDT')
  ]);
  assert.equal(results.length, 1);
  assert.equal(results[0]?.resultId, RESULT_ID.cakeusdtSpot);
  assert.equal(results[0]?.quoteCurrency, 'USDT');
  assert.equal(results[0]?.matchReason, 'symbol-exact');
  assert.equal(results[0]?.isExact, true);
});

test('an explicitly typed quote keeps its own row and inherits the exact asset identity', () => {
  const results = rankSymbolSearchCandidates('btc/eur', [
    binanceSpotPair('BTCEUR'), binanceSpotPair('BTCUSDT'), coinGeckoTradedRow('BTC', 'Bitcoin', 'bitcoin', 1)
  ]);
  assert.equal(results.length, 1, 'one BTC spot row: the EUR pair, not a second generic row');
  assert.equal(results[0]?.displaySymbol, 'BTCEUR');
  assert.equal(results[0]?.matchReason, 'symbol-exact');
  assert.equal(results[0]?.isExact, true);
  // The canonical row is merged into it: picking the EUR pair from search now carries the exact
  // identity forward (it used to be dropped, leaving the deep-dive to guess from the ticker).
  assert.equal(results[0]?.coinGeckoId, 'bitcoin');
  assert.equal(results[0]?.quoteCurrency, 'EUR');
});

test('the concrete pair the user typed survives the collapse and inherits the canonical identity', () => {
  const candidates = [
    catalogRow('BTC', 'crypto'), coinGeckoTradedRow('BTC', 'Bitcoin', 'bitcoin', 1),
    binanceSpotPair('BTCUSDT'), binancePerpetual('BTCUSDT'),
    binanceSpotPair('BTCEUR'), binanceSpotPair('BTCUSDC'), binanceSpotPair('BTCFDUSD')
  ];

  for (const query of ['btcusdt', 'BTC/USDT', 'BTC-USDT']) {
    const results = rankSymbolSearchCandidates(query, candidates);
    const spot = results.filter(result => result.symbol === 'BTC' && result.instrumentType === 'spot');
    assert.equal(spot.length, 1, `q=${query}: one spot row for the asset`);
    assert.equal(spot[0]?.resultId, RESULT_ID.btcusdtSpot, `q=${query} must answer with the typed spot pair`);
    assert.equal(spot[0]?.coinGeckoId, 'bitcoin', `q=${query}: the canonical identity must ride along`);
    // The generic rows and the pairs that reach this query (USDT/USDC siblings match at the
    // typo tier) are absorbed, not hidden: their symbols stay searchable as aliases.
    assertReachable(spot[0]!, ['BTC', 'BTCUSDT', 'bitcoin', 'BTCUSDC']);
    // The perpetual is a different instrument: it keeps its own row, below the typed spot pair.
    const perp = results.find(result => result.instrumentType === 'perpetual');
    assert.ok(perp, `q=${query}: the perpetual keeps its own row`);
    assert.equal(perp?.resultId, RESULT_ID.btcusdtPerp);
    assert.ok(results.indexOf(perp) > 0, `q=${query}: the perpetual stays below the typed pair`);
  }
});

test('a bare ticker query answers with the canonical asset row, one row per instrument', () => {
  const results = rankSymbolSearchCandidates('BTC', [
    catalogRow('BTC', 'crypto'), coinGeckoTradedRow('BTC', 'Bitcoin', 'bitcoin', 1),
    binanceSpotPair('BTCUSDT'), binanceSpotPair('BTCEUR'), binanceSpotPair('BTCUSDC'), binancePerpetual('BTCUSDT')
  ]);
  assert.equal(results[0]?.resultId, RESULT_ID.btcUniverse);
  assert.equal(results[0]?.matchReason, 'symbol-exact');
  assert.equal(results[0]?.coinGeckoId, 'bitcoin');
  assert.equal(results.filter(result => result.symbol === 'BTC').length, 1, 'the generic and pair rows collapse into one');
  assert.equal(results[0]?.displaySymbol, 'BTC');
  assertReachable(results[0], ['BTCUSDT', 'BTCEUR', 'BTCUSDC', 'BTC/USDT']);
  const perp = results.find(result => result.instrumentType === 'perpetual');
  assert.equal(perp?.resultId, RESULT_ID.btcusdtPerp, 'the perpetual stays a distinct instrument');
});

test('keeps the LIT collision: the metals ETF and the crypto perpetual both stay, each in its class', () => {
  const etf = catalogRow('LIT', 'metals');
  const perpetual = catalogRow('LITUSDT.P', 'crypto');
  const results = rankSymbolSearchCandidates('LIT', [
    coinGeckoTradedRow('LIT', 'Lighter', 'lighter', 72), etf, perpetual, binanceSpotPair('LITEBUSDT')
  ]);

  const etfRow = results.find(result => result.marketClass === 'metals' && result.symbol === 'LIT');
  assert.ok(etfRow, 'the metals ETF row must survive the tie-break');
  assert.equal(etfRow.instrumentType, 'etf');
  const perpRow = results.find(result => result.instrumentType === 'perpetual');
  assert.ok(perpRow, 'LITUSDT.P must not be filtered out');
  assert.equal(perpRow.marketClass, 'crypto');
  assert.equal(perpRow.symbol, 'LITUSDT.P');
  // The perpetual is an alias match (1110) and must stay below the two exact ETF/asset rows (1410).
  assert.ok(results.indexOf(perpRow) >= 2, 'the perpetual stays below the exact ticker rows');
});

test('two different assets sharing one ticker never merge (LIT: lighter + litentry, live provider rows)', () => {
  // Both rows come from real provider payloads: the CoinGecko top-250 universe lists Lighter
  // (rank 73), and the live `/search?query=lit` payload also returns Litentry with symbol LIT
  // (rank 1593). The ticker collision is real, so both rows must survive the collapse.
  const litentry: SymbolSearchCandidate = {
    symbol: 'LIT', displaySymbol: 'LIT', name: 'Litentry', category: 'Crypto Asset', marketClass: 'crypto',
    exchange: 'COINGECKO', instrumentType: 'spot', quoteCurrency: 'USD',
    aliases: ['litentry', 'Litentry', 'LIT'], coinGeckoId: 'litentry', rank: 1593,
    verified: true, matchType: 'coingecko'
  };
  const results = rankSymbolSearchCandidates('LIT', [
    catalogRow('LIT', 'metals'), catalogRow('LITUSDT.P', 'crypto'),
    coinGeckoTradedRow('LIT', 'Lighter', 'lighter', 73), litentry
  ]);

  const cryptoSpot = results.filter(result => result.marketClass === 'crypto' && result.instrumentType === 'spot');
  assert.deepEqual(cryptoSpot.map(result => result.coinGeckoId).sort(), ['lighter', 'litentry']);
  assert.ok(results.some(result => result.marketClass === 'metals' && result.instrumentType === 'etf'));
  assert.ok(results.some(result => result.symbol === 'LITUSDT.P' && result.instrumentType === 'perpetual'));
});

test('keeps the CVX collision between the equity and the crypto asset, both exact and both present', () => {
  const results = rankSymbolSearchCandidates('CVX', [
    catalogRow('CVX', 'stocks'), coinGeckoTradedRow('CVX', 'Convex Finance', 'convex-finance', 195),
    binanceSpotPair('CVXUSDC'), binanceSpotPair('CVXUSDT'), binancePerpetual('CVXUSDT')
  ]);

  const classes = new Set(results.map(result => result.marketClass));
  assert.ok(classes.has('stocks') && classes.has('crypto'), 'the class collision must stay visible');
  assert.ok(results.some(result => result.resultId === RESULT_ID.cvxEquity && result.isExact));
  assert.ok(results.some(result => result.resultId === RESULT_ID.cvxConvex && result.isExact));
  // The equity keeps its rank-based lead (rank 102 vs 195), so the quote tie-break cannot invert it.
  assert.equal(results[0]?.resultId, RESULT_ID.cvxEquity);
  // One crypto spot row instead of three: the USDT/USDC pairs merge into the canonical identity
  // (still reachable as aliases) and the perpetual stays a separate instrument.
  assert.equal(results.length, 3);
  assert.equal(results.filter(result => result.resultId.startsWith('crypto:BINANCE:spot:')).length, 0);
  const cryptoSpot = results.find(result => result.marketClass === 'crypto' && result.instrumentType === 'spot');
  assert.equal(cryptoSpot?.resultId, RESULT_ID.cvxConvex);
  assertReachable(cryptoSpot!, ['CVXUSDT', 'CVXUSDC']);
});

test('the typed-pair tier keys on the row own symbol: btcusdc answers with BTCUSDC, not BTCUSDT', () => {
  const results = rankSymbolSearchCandidates('btcusdc', [
    binanceSpotPair('BTCUSDT'), binanceSpotPair('BTCUSDC'), binancePerpetual('BTCUSDT')
  ]);
  assert.equal(results[0]?.displaySymbol, 'BTCUSDC');
  assert.equal(results[0]?.quoteCurrency, 'USDC');
  // The USDT pair only reached the one-character typo tier; it is now absorbed by the row the
  // user actually typed, and stays reachable as an alias. The perpetual keeps its own row.
  assert.equal(results.length, 2);
  assert.equal(results.filter(result => result.instrumentType === 'spot').length, 1);
  assertReachable(results[0], ['BTCUSDT']);
  assert.equal(results[1]?.resultId, RESULT_ID.btcusdtPerp);
});

test('de-duplication rewrites neither scores nor reasons of the surviving row', () => {
  const candidates = [
    catalogRow('BTC', 'crypto'), coinGeckoTradedRow('BTC', 'Bitcoin', 'bitcoin', 1),
    binanceSpotPair('BTCUSDT'), binanceSpotPair('BTCEUR'), binancePerpetual('BTCUSDT')
  ];
  const [survivor] = rankSymbolSearchCandidates('BTCEUR', candidates);
  const alone = rankSymbolSearchCandidates('BTCEUR', [binanceSpotPair('BTCEUR')])[0];

  assert.equal(survivor?.resultId, 'crypto:BINANCE:spot:BTCEUR:');
  assert.equal(survivor?.matchScore, alone?.matchScore, 'the surviving row keeps its own score');
  assert.equal(survivor?.matchReason, alone?.matchReason);
  assert.equal(survivor?.isExact, alone?.isExact);
  assert.equal(survivor?.verified, alone?.verified);
  // The absorbed canonical row scored lower for this query, so it could never have been the
  // survivor: the collapse never promotes a row the comparator had already placed below.
  const canonicalAlone = rankSymbolSearchCandidates('BTCEUR', [coinGeckoTradedRow('BTC', 'Bitcoin', 'bitcoin', 1)])[0];
  assert.ok(
    (survivor?.matchScore || 0) > (canonicalAlone?.matchScore || 0),
    'the EUR pair outranks the canonical row on its own score'
  );
});

test('a last-good snapshot marker survives the merge that carries its numbers (F12, golden rule #1)', () => {
  // The typed pair has no price of its own; the absorbed canonical row has one, from a snapshot.
  const snapshot = { ...coinGeckoTradedRow('BTC', 'Bitcoin', 'bitcoin', 1), price: 61_000, staleAsOf: 1_758_800_000_000 };
  const merged = rankSymbolSearchCandidates('btcusdt', [snapshot, binanceSpotPair('BTCUSDT')]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.displaySymbol, 'BTCUSDT', 'the typed pair survives');
  assert.equal(merged[0]?.price, 61_000, 'the surviving row takes the only price available');
  assert.equal(merged[0]?.staleAsOf, 1_758_800_000_000, 'and it must wear that snapshot marker');

  // A row that already carries its own numbers never loses its own marker to a merge either.
  const typedSnapshot = { ...binanceSpotPair('BTCUSDT'), price: 61_000, staleAsOf: 1_758_800_000_000 };
  const kept = rankSymbolSearchCandidates('btcusdt', [
    typedSnapshot, coinGeckoTradedRow('BTC', 'Bitcoin', 'bitcoin', 1)
  ]);
  assert.equal(kept[0]?.price, 61_000);
  assert.equal(kept[0]?.staleAsOf, 1_758_800_000_000);

  // Conversely, a fresh row with its own price does not get flagged by an absorbed snapshot row:
  // the displayed numbers are fresh, and an identity is not a quote.
  const fresh = rankSymbolSearchCandidates('btcusdt', [
    { ...binanceSpotPair('BTCUSDT'), price: 62_000 }, snapshot
  ]);
  assert.equal(fresh[0]?.price, 62_000);
  assert.equal(fresh[0]?.staleAsOf, undefined);
});
