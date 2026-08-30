import { AssetInfo, AssetInstrumentType } from '../types/market.js';

export type SearchMarketClass = 'stocks' | 'crypto' | 'metals' | 'forex' | 'macro' | 'unknown';
export type SearchMatchType = 'catalog' | 'binance' | 'coingecko' | 'yahoo' | 'direct';

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
    name: current.matchType === 'catalog' ? current.name : incoming.name,
    category: current.matchType === 'catalog' ? current.category : incoming.category,
    aliases: Array.from(new Set([...(current.aliases || []), ...(incoming.aliases || [])])),
    coinGeckoId: current.coinGeckoId || incoming.coinGeckoId,
    rank: availableRanks.length ? Math.min(...availableRanks) : undefined,
    marketCap: Math.max(current.marketCap || 0, incoming.marketCap || 0) || undefined,
    verified: current.verified !== false || incoming.verified !== false,
    matchType: current.matchType === 'catalog' ? current.matchType : incoming.matchType
  };
};

export const rankSymbolSearchCandidates = (
  input: string,
  candidates: SymbolSearchCandidate[],
  limit = 60
): SymbolSearchResult[] => {
  const query = parseSymbolSearchQuery(input);
  if (!query.compact && !normalizeSearchText(query.text)) return [];
  const textQuery = normalizeSearchText(query.text);
  const unique = new Map<string, SymbolSearchCandidate>();
  for (const candidate of candidates) {
    if (!candidate.symbol || !candidate.name) continue;
    const identity = identityFor(candidate);
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
    const pairExact = Boolean(
      query.base && query.quote && candidate.marketClass === 'crypto' &&
      symbol === query.base && compactSymbol(candidate.quoteCurrency || '') === query.quote
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
      matchScore += compactSymbol(candidate.quoteCurrency || '') === query.quote ? 80 : -80;
    }
    if (candidate.verified !== false) matchScore += 20;
    if (candidate.rank && candidate.rank > 0) matchScore += Math.max(0, 50 - Math.min(candidate.rank, 50));

    results.push({
      ...candidate,
      resultId: identityFor(candidate),
      matchScore,
      matchReason,
      isExact
    });
  }

  return results.sort((left, right) =>
    right.matchScore - left.matchScore ||
    Number(right.isExact) - Number(left.isExact) ||
    Number(right.verified !== false) - Number(left.verified !== false) ||
    (left.rank || Number.MAX_SAFE_INTEGER) - (right.rank || Number.MAX_SAFE_INTEGER) ||
    left.name.localeCompare(right.name)
  ).slice(0, limit);
};
