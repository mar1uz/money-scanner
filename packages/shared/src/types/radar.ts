export type RadarChain = 'solana' | 'base' | 'robinhood';
export interface RadarSourceStatus {
    id: string;
    kind: 'market' | 'social' | 'attention' | 'editorial';
    status: 'ok' | 'partial' | 'unavailable' | 'not_configured';
    items: number;
    checkedAt: number;
    detail: string;
}
export interface RadarToken {
    id: string;
    chain: RadarChain;
    address: string;
    symbol: string;
    name: string;
    price: number;
    marketCap: number | null;
    marketCapSource: string;
    liquidity: number | null;
    volume24h: number | null;
    volume1h: number | null;
    buys24h: number | null;
    sells24h: number | null;
    buyers24h: number | null;
    priceChange24h: number | null;
    pool: string;
    url: string;
    observedAt: number;
    coinGeckoId: string | null;
    telegram: string | null;
}
export interface RadarPost {
    id: string;
    source: string;
    kind: 'social' | 'editorial';
    author: string;
    text: string;
    url: string;
    timestamp: number;
    engagement: number | null;
}
export interface RadarSocialEvidence {
    mentions: number;
    authors: number;
    channels: number;
    platforms: number;
    editorialMentions: number;
    weakMentions: number;
    score: number | null;
    changeMentions: number | null;
    searchTrending: boolean;
    examples: {
        source: string;
        url: string;
        text: string;
        match: string;
    }[];
}
export interface RadarRow extends RadarToken {
    rank: number;
    rankChange: number | null;
    score: number;
    marketScore: number;
    firstReportedAt: number | null;
    firstPrice: number | null;
    changeFirst: number | null;
    previousPrice: number | null;
    changePrevious: number | null;
    social: RadarSocialEvidence;
    reasons: string[];
}
export interface RadarExit {
    id: string;
    name: string;
    symbol: string;
    chain: RadarChain;
    address: string;
    previousRank: number;
    reason: 'below_threshold' | 'unavailable_or_outside_sample';
}
export interface RadarSnapshot {
    id: string;
    generatedAt: number;
    methodology: 'radar-v1';
    minMarketCap: 500000;
    rows: RadarRow[];
    exits: RadarExit[];
    sources: RadarSourceStatus[];
    discovered: number;
    excluded: {
        belowCap: number;
        unknownCap: number;
    };
    previousReportAt: number | null;
    coverage: string;
    kind: 'collection' | 'report';
}
export interface RadarBaseline {
    id: string;
    firstReportedAt: number;
    firstPrice: number;
}
export interface RadarReportSummary {
    id: string;
    generatedAt: number;
    count: number;
}
