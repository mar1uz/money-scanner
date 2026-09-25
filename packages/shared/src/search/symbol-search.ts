import { AssetInfo, AssetInstrumentType } from '../types/market.js';

export type SearchMarketClass = 'stocks' | 'crypto' | 'metals' | 'forex' | 'macro' | 'unknown';
export type SearchMatchType = 'catalog' | 'universe' | 'binance' | 'coingecko' | 'yahoo' | 'direct';

export interface SymbolSearchCandidate {
  symbol: string;
  displaySymbol?: string;
  providerSymbol?: string;
  name: string;
  category: string;
  marketClass: SearchMarketClass;
  exchange: string;
  instrumentType?: AssetInstrumentType;
  quoteCurrency?: string;
  aliases?: string[];
  coinGeckoId?: string;
  rank?: number;
  marketCap?: number;
  verified?: boolean;
  matchType: SearchMatchType;
  /** Last-good provider snapshot, not a fresh quote or verification. */
  staleAsOf?: number;
  price?: number;
  change24h?: number;
  changeYtd?: number;
  moneyLineScore?: number;
  tier?: string;
}

export interface SymbolSearchResult extends SymbolSearchCandidate {
  resultId: string;
  matchScore: number;
  matchReason: 'exchange-exact' | 'symbol-exact' | 'pair-exact' | 'name-exact' | 'alias-exact' | 'symbol-prefix' | 'name-prefix' | 'alias-prefix' | 'contains' | 'typo' | 'direct';
  isExact: boolean;
}

export interface ParsedSymbolQuery {
  raw: string;
  text: string;
  compact: string;
  exchange?: string;
  base?: string;
  quote?: string;
  perpetual: boolean;
}

const QUOTES = ['USDT', 'USDC', 'BUSD', 'USD', 'BTC', 'ETH', 'EUR', 'GBP', 'JPY'] as const;

/**
 * Quote preference used only as a deterministic tie-break when the query does not name a
 * quote itself (F7/A7). Order rationale, most representative first:
 *   USDT  — the dominant venue quote: 496 of the 865 accepted live Binance spot pairs;
 *   USDC  — second stablecoin venue (258 pairs), then FDUSD (32);
 *   USD   — the product's valuation unit and the quote of provider/catalog rows;
 *   BTC/ETH — crypto-denominated pairs: same liquidity, but the user asked for a $ quote;
 *   EUR   — fiat, but not the base currency of the product.
 */
const PRIMARY_SEARCH_QUOTES: readonly string[] = ['USDT', 'USDC', 'FDUSD', 'USD', 'BTC', 'ETH', 'EUR'];

/** Position in {@link PRIMARY_SEARCH_QUOTES}, or -1 for rows without a known quote. */
const primaryQuoteIndex = (candidate: SymbolSearchCandidate): number =>
  PRIMARY_SEARCH_QUOTES.indexOf(compactSymbol(candidate.quoteCurrency || ''));

export const normalizeSearchText = (value: string): string => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()
  .replace(/\s+/g, ' ');

const compactSymbol = (value: string): string => value
  .toUpperCase()
  .replace(/^[$#]/, '')
  .replace(/[^A-Z0-9]/g, '');

export const parseSymbolSearchQuery = (input: string): ParsedSymbolQuery => {
  const raw = input.trim().replace(/^[$#]/, '');
  const colonIndex = raw.indexOf(':');
  const exchange = colonIndex > 0 ? compactSymbol(raw.slice(0, colonIndex)) : undefined;
  const text = colonIndex > 0 ? raw.slice(colonIndex + 1).trim() : raw;
  const upper = text.toUpperCase();
  const perpetual = /(?:\.P|[-_/ ]PERP(?:ETUAL)?)$/i.test(text);
  const withoutPerpetual = upper.replace(/\.P$/, '').replace(/[-_/ ]PERP(?:ETUAL)?$/, '');
  const compact = compactSymbol(withoutPerpetual);
  const quote = QUOTES.find(candidate => compact.length > candidate.length + 1 && compact.endsWith(candidate));
  const base = quote ? compact.slice(0, -quote.length) : undefined;
  return { raw, text, compact, exchange, base, quote, perpetual };
};

export const catalogToSearchCandidates = (assets: AssetInfo[]): SymbolSearchCandidate[] => assets.map(asset => ({
  symbol: asset.symbol.toUpperCase(),
  displaySymbol: asset.providerSymbol || asset.symbol.toUpperCase(),
  providerSymbol: asset.providerSymbol,
  name: asset.name,
  category: asset.category,
  marketClass: asset.marketClass || 'unknown',
  exchange: asset.exchange || (asset.marketClass === 'crypto' ? 'BINANCE' : 'GLOBAL'),
  instrumentType: asset.instrumentType,
  quoteCurrency: asset.quoteCurrency,
  aliases: asset.aliases,
  coinGeckoId: asset.coinGeckoId,
  rank: asset.rank,
  marketCap: asset.marketCap,
  verified: true,
  matchType: 'catalog'
}));

const levenshteinDistance = (left: string, right: string): number => {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
    let diagonal = previous[0];
    previous[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
      const above = previous[rightIndex];
      previous[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + 1,
        diagonal + Number(left[leftIndex - 1] !== right[rightIndex - 1])
      );
      diagonal = above;
    }
  }
  return previous[right.length];
};

const exchangeMatches = (queryExchange: string | undefined, candidateExchange: string): boolean => {
  if (!queryExchange) return false;
  const normalizedExchange = compactSymbol(candidateExchange);
  return normalizedExchange === queryExchange || normalizedExchange.startsWith(queryExchange) || queryExchange.startsWith(normalizedExchange);
};

const identityFor = (candidate: SymbolSearchCandidate): string => [
  candidate.marketClass,
  compactSymbol(candidate.exchange),
  candidate.instrumentType || 'unknown',
  compactSymbol(candidate.providerSymbol || candidate.displaySymbol || candidate.symbol),
  candidate.coinGeckoId || ''
].join(':');

const mergeCandidate = (current: SymbolSearchCandidate, incoming: SymbolSearchCandidate): SymbolSearchCandidate => {
  const availableRanks = [current.rank, incoming.rank].filter((rank): rank is number => Number.isFinite(rank));
  return {
    ...current,
    ...incoming,
    staleAsOf: current.staleAsOf && incoming.staleAsOf ? Math.min(current.staleAsOf, incoming.staleAsOf) : undefined,
    name: current.matchType === 'catalog' || current.matchType === 'universe' ? current.name : incoming.name,
    category: current.matchType === 'catalog' || current.matchType === 'universe' ? current.category : incoming.category,
    aliases: Array.from(new Set([...(current.aliases || []), ...(incoming.aliases || [])])),
    coinGeckoId: current.coinGeckoId || incoming.coinGeckoId,
    rank: availableRanks.length ? Math.min(...availableRanks) : undefined,
    marketCap: Math.max(current.marketCap || 0, incoming.marketCap || 0) || undefined,
    verified: current.verified !== false || incoming.verified !== false,
    matchType: current.matchType === 'catalog' || current.matchType === 'universe' ? current.matchType : incoming.matchType
  };
};

/**
 * Instrument dimension of the response de-duplication key (audit F5 / plan B2).
 * Crypto rows without an explicit instrument type are spot instruments - the
 * catalog convention - so the generic catalog row joins the real spot pair row
 * of the same asset. Spot and perpetual stay distinct instruments (BTCUSDT spot
 * and BTCUSDT.P both survive); equity/etf/forex/index rows keep their own type.
 */
const searchInstrumentKey = (candidate: SymbolSearchCandidate): string => candidate.instrumentType
  || (candidate.marketClass === 'crypto' ? 'spot' : 'unknown');

interface DedupeEntry {
  row: SymbolSearchResult;
  /** Position in the comparator-sorted response: the first entry is the strongest. */
  index: number;
}

interface DedupeGroup {
  /** Exact-identity clusters (coinGeckoId), first-seen order. */
  identified: Map<string, DedupeEntry[]>;
  /** Rows without an exact identity: they cannot be proven to be a different asset. */
  unattributed: DedupeEntry[];
}

/**
 * Folds a duplicate into the surviving row. The winner keeps its own identity,
 * instrument, exchange, aliases of its own venue, matchScore and position - the
 * comparator already decided which row is the strongest, and de-duplication must
 * not re-decide scores or order. The absorbed row only completes what the winner
 * cannot answer alone: above all the exact asset identity (coinGeckoId).
 */
const absorbDuplicate = (winner: SymbolSearchResult, absorbed: SymbolSearchResult): SymbolSearchResult => {
  const ranks = [winner.rank, absorbed.rank].filter((rank): rank is number => Number.isFinite(rank));
  return {
    ...winner,
    coinGeckoId: winner.coinGeckoId || absorbed.coinGeckoId,
    aliases: Array.from(new Set([...(winner.aliases || []), ...(absorbed.aliases || [])])),
    rank: ranks.length ? Math.min(...ranks) : undefined,
    marketCap: Math.max(winner.marketCap || 0, absorbed.marketCap || 0) || undefined,
    verified: winner.verified !== false || absorbed.verified !== false,
    price: winner.price || absorbed.price,
    change24h: winner.change24h || absorbed.change24h,
    changeYtd: winner.changeYtd || absorbed.changeYtd,
    moneyLineScore: winner.moneyLineScore || absorbed.moneyLineScore,
    tier: winner.tier || absorbed.tier,
    // A last-good snapshot must never lose its marker while being merged: the row
    // wears the timestamp of the source its displayed numbers actually come from.
    staleAsOf: winner.staleAsOf ?? (!winner.price && absorbed.price ? absorbed.staleAsOf : undefined)
  };
};

const collapseDuplicates = (entries: DedupeEntry[]): SymbolSearchResult => {
  const [first, ...rest] = [...entries].sort((left, right) => left.index - right.index);
  return rest.reduce((winner, entry) => absorbDuplicate(winner, entry.row), first.row);
};

/**
 * Response-level de-duplication (audit F5 / plan B2): one row per asset AND
 * instrument, carrying the strongest identity available.
 *
 * Key: `marketClass : instrumentType : ticker` (the venue symbol the row
 * displays), with `coinGeckoId` as the exact-identity separator. Two rows that
 * prove different CoinGecko assets therefore never merge (a real ticker collision
 * between two different coins stays visible), while a row without any exact
 * identity describes the same instrument as the group's strongest identified row
 * and is merged into it - that is how the generic catalog row joins the real pair
 * row, and how BTCEUR/BTCFDUSD/BTCUSDC/BTCUSDT stop shadowing each other behind
 * "BTC" (they all display the base ticker; the surviving row is the one the
 * comparator ranks first, and it inherits the exact identity).
 *
 * Class collisions are preserved by the class dimension: LIT stays both the AMEX
 * metals ETF and the crypto instrument, CVX both the equity and the crypto asset.
 *
 * Note for the future: if the product ever decides that every venue quote of one
 * asset deserves its own row (BTCUSDT *and* BTCEUR *and* BTCFDUSD side by side),
 * the quote belongs in the group key below - nothing else about this contract has
 * to change. Today the surviving row is the quote the comparator prefers (USDT).
 */
const dedupeSearchResults = (results: SymbolSearchResult[]): SymbolSearchResult[] => {
  const groups = new Map<string, DedupeGroup>();
  results.forEach((row, index) => {
    const key = [row.marketClass, searchInstrumentKey(row), compactSymbol(row.symbol)].join(':');
    const group: DedupeGroup = groups.get(key) || { identified: new Map<string, DedupeEntry[]>(), unattributed: [] };
    const identity = (row.coinGeckoId || '').toLowerCase();
    if (identity) group.identified.set(identity, [...(group.identified.get(identity) || []), { row, index }]);
    else group.unattributed.push({ row, index });
    groups.set(key, group);
  });

  const deduped: SymbolSearchResult[] = [];
  for (const group of groups.values()) {
    const clusters = [...group.identified.values()];
    // Unattributed rows join the first-seen identified cluster (its leader is the
    // strongest row of the group); without any exact identity they all collapse.
    if (clusters.length) clusters[0] = [...clusters[0], ...group.unattributed];
    for (const cluster of clusters.length ? clusters : [group.unattributed]) {
      deduped.push(collapseDuplicates(cluster));
    }
  }
  return deduped;
};

export const rankSymbolSearchCandidates = (
  input: string,
  candidates: SymbolSearchCandidate[],
  limit = 60
): SymbolSearchResult[] => {
  const query = parseSymbolSearchQuery(input);
  if (!query.compact && !normalizeSearchText(query.text)) return [];
  const textQuery = normalizeSearchText(query.text);
  const words = textQuery.split(' ').filter(Boolean);
  const unique = new Map<string, SymbolSearchCandidate>();
  for (const candidate of candidates) {
    if (!candidate.symbol || !candidate.name) continue;
    const identity = candidate.marketClass === 'crypto' && candidate.instrumentType !== 'perpetual' && candidate.coinGeckoId
      ? `crypto:coin:${candidate.coinGeckoId.toLowerCase()}`
      : identityFor(candidate);
    unique.set(identity, unique.has(identity) ? mergeCandidate(unique.get(identity)!, candidate) : candidate);
  }

  const results: SymbolSearchResult[] = [];
  for (const candidate of unique.values()) {
    const symbol = compactSymbol(candidate.symbol.replace(/\.P$/i, ''));
    const display = compactSymbol(candidate.displaySymbol || '');
    const provider = compactSymbol(candidate.providerSymbol || '');
    const name = normalizeSearchText(candidate.name);
    const aliases = (candidate.aliases || []).map(normalizeSearchText).filter(Boolean);
    const exchangeExact = exchangeMatches(query.exchange, candidate.exchange);
    const marketSymbolExact = [display, provider].filter(Boolean).includes(query.compact);
    // The query spells out this row's own venue symbol as a pair ('BTCUSDT', 'BTC/USDT', 'BTC-USDT').
    const typedPairExact = marketSymbolExact && Boolean(query.base && query.quote);
    const pairExact = Boolean(
      query.base && query.quote && candidate.marketClass === 'crypto' &&
      symbol === query.base && (compactSymbol(candidate.quoteCurrency || '') === query.quote || candidate.coinGeckoId)
    );
    const symbolExact = [symbol, display, provider].filter(Boolean).includes(query.compact);
    const nameExact = Boolean(textQuery && name === textQuery);
    const aliasExact = Boolean(textQuery && aliases.includes(textQuery));

    let matchScore = 0;
    let matchReason: SymbolSearchResult['matchReason'] = 'contains';
    let isExact = false;

    if (query.exchange && exchangeExact && (symbolExact || pairExact)) {
      matchScore = marketSymbolExact ? 1460 : 1400;
      matchReason = 'exchange-exact';
      isExact = true;
    } else if (typedPairExact) {
      // The exact venue symbol the user typed. A concrete pair row scored 1500 here while the
      // generic base-asset row reached 1619 (pair-exact 1280 + quote 80 + base 100 +
      // catalog/universe 90 + rank 49 + verified 20, measured on live payloads), so the typed
      // pair was answered with the generic asset. Still an exact symbol match, but scored above
      // every decomposition-only row. Exchange-qualified queries are decided by the branch above.
      matchScore = 1500;
      matchReason = 'symbol-exact';
      isExact = true;
    } else if (symbolExact) {
      matchScore = 1300;
      matchReason = 'symbol-exact';
      isExact = true;
    } else if (pairExact) {
      matchScore = 1280;
      matchReason = 'pair-exact';
      isExact = true;
    } else if (nameExact) {
      matchScore = 1200;
      matchReason = 'name-exact';
      isExact = true;
    } else if (aliasExact) {
      matchScore = 1150;
      matchReason = 'alias-exact';
      isExact = true;
    } else if (query.compact.length >= 1 && [symbol, display, provider].some(value => value.startsWith(query.compact))) {
      matchScore = 950;
      matchReason = 'symbol-prefix';
    } else if (textQuery.length >= 2 && name.startsWith(textQuery)) {
      matchScore = 850;
      matchReason = 'name-prefix';
    } else if (textQuery.length >= 2 && aliases.some(alias => alias.startsWith(textQuery))) {
      matchScore = 800;
      matchReason = 'alias-prefix';
    } else if (textQuery.length >= 3 && (name.includes(textQuery) || aliases.some(alias => alias.includes(textQuery)))) {
      matchScore = 600;
      matchReason = 'contains';
    } else if (words.length >= 2 && words.every(word => [name, ...aliases, symbol.toLowerCase(), display.toLowerCase()].some(value => value.split(' ').some(token => token.startsWith(word))))) {
      matchScore = 560;
      matchReason = 'contains';
    } else if (
      query.compact.length >= 4 &&
      [symbol, display, provider].filter(Boolean).some(value => levenshteinDistance(query.compact, value) === 1)
    ) {
      matchScore = 500;
      matchReason = 'typo';
    } else {
      continue;
    }

    if (query.exchange && !exchangeExact) matchScore -= 160;
    if (query.perpetual) matchScore += candidate.instrumentType === 'perpetual' ? 120 : -220;
    else if (query.base && query.quote && candidate.instrumentType === 'perpetual') matchScore -= 100;
    if (query.quote && candidate.marketClass === 'crypto') {
      matchScore += compactSymbol(candidate.quoteCurrency || '') === query.quote ? 80 : candidate.coinGeckoId && symbol === query.base ? 0 : -80;
    }
    if (candidate.verified !== false) matchScore += 20;
    if (candidate.instrumentType === 'perpetual' && !query.perpetual) matchScore -= 150;
    if (query.exchange && query.base && query.quote && candidate.instrumentType !== 'spot' && candidate.instrumentType !== 'perpetual') matchScore -= 130;
    if (candidate.marketClass === 'crypto' && candidate.instrumentType !== 'perpetual' && query.base && symbol === query.base) matchScore += 100;
    if (!query.exchange && (candidate.matchType === 'catalog' || candidate.matchType === 'universe')) matchScore += 90;
    if (candidate.staleAsOf) matchScore -= 15;
    // A full-name query for a canonical coin must not be stolen by a meme token's ticker.
    if (nameExact && candidate.marketClass === 'crypto') matchScore += 180;
    if (symbolExact && query.compact.length > 6 && candidate.rank && candidate.rank > 1000) matchScore -= 200;
    if (candidate.rank && candidate.rank > 0) matchScore += Math.max(0, 50 - Math.min(candidate.rank, 50));

    results.push({
      ...candidate,
      resultId: candidate.marketClass === 'crypto' && candidate.instrumentType !== 'perpetual' && candidate.coinGeckoId
        ? `crypto:coin:${candidate.coinGeckoId.toLowerCase()}` : identityFor(candidate),
      matchScore,
      matchReason,
      isExact
    });
  }

  const ranked = results.sort((left, right) => {
    const ordered = right.matchScore - left.matchScore ||
      Number(right.isExact) - Number(left.isExact) ||
      Number(right.verified !== false) - Number(left.verified !== false) ||
      (left.rank || Number.MAX_SAFE_INTEGER) - (right.rank || Number.MAX_SAFE_INTEGER);
    if (ordered) return ordered;
    // The query did not name a quote itself: among rows that are otherwise identical prefer the
    // primary quote over the alphabetical accident that used to decide this (BTC before USDT).
    // Rows without a known quote have no opinion and fall through to the name comparison.
    if (!query.quote) {
      const leftQuote = primaryQuoteIndex(left);
      const rightQuote = primaryQuoteIndex(right);
      if (leftQuote >= 0 && rightQuote >= 0 && leftQuote !== rightQuote) return leftQuote - rightQuote;
    }
    return left.name.localeCompare(right.name);
  });
  // F5/B2: the response carries one row per asset and instrument. The collapse runs on the
  // scored, comparator-ordered set (the surviving row is the first of its group, so the order
  // above is never re-decided) and the caller's limit applies to the de-duplicated list.
  return dedupeSearchResults(ranked).slice(0, limit);
};
