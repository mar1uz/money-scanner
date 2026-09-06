import type { RadarChain, RadarToken, RadarSourceStatus } from '@money-scanner/shared';
import { CHAINS, tokenId, numeric, nonnegative } from './scoring.js';
export async function fetchJson(url: string): Promise<any> {
    const response = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'MoneyScanner-Radar/1.0' }, signal: AbortSignal.timeout(12000) });
    if (!response.ok)
        throw new Error(`HTTP ${response.status}`);
    return response.json();
}
export function parseGeckoPools(chain: RadarChain, body: any, now = Date.now()): RadarToken[] {
    const included = new Map<string, any>((body.included || []).map((r: any) => [r.id, r.attributes]));
    return (body.data || []).flatMap((p: any) => {
        const a = p.attributes, ref = p.relationships?.base_token?.data?.id, t = included.get(ref);
        if (!a || !t?.address || !t.symbol || !t.name || !String(ref).startsWith(`${chain}_`))
            return [];
        const price = nonnegative(a.base_token_price_usd);
        if (!price)
            return [];
        return [{ id: tokenId(chain, t.address), chain, address: t.address, symbol: String(t.symbol).slice(0, 30), name: String(t.name).slice(0, 100), price, marketCap: nonnegative(a.market_cap_usd) || null, marketCapSource: 'GeckoTerminal market_cap_usd', liquidity: nonnegative(a.reserve_in_usd), volume24h: nonnegative(a.volume_usd?.h24), volume1h: nonnegative(a.volume_usd?.h1), buys24h: nonnegative(a.transactions?.h24?.buys), sells24h: nonnegative(a.transactions?.h24?.sells), buyers24h: nonnegative(a.transactions?.h24?.buyers), priceChange24h: numeric(a.price_change_percentage?.h24), pool: a.address, url: `https://www.geckoterminal.com/${chain}/pools/${encodeURIComponent(a.address)}`, observedAt: now, coinGeckoId: t.coingecko_coin_id || null, telegram: null }];
    });
}
export function parseDexPairs(chain: RadarChain, body: any, allowed: Set<string>, now = Date.now()): RadarToken[] {
    return (Array.isArray(body) ? body : body.pairs || []).flatMap((p: any) => {
        const t = p.baseToken;
        if (p.chainId !== chain || !t?.address || !allowed.has(tokenId(chain, t.address)))
            return [];
        const price = nonnegative(p.priceUsd);
        if (!price)
            return [];
        const telegram = (p.info?.socials || []).find((s: any) => s.type === 'telegram' && /^https:\/\/t\.me\/[A-Za-z0-9_]{5,32}\/?$/.test(s.url || ''))?.url || null;
        return [{ id: tokenId(chain, t.address), chain, address: t.address, symbol: String(t.symbol || '').slice(0, 30), name: String(t.name || t.symbol || '').slice(0, 100), price, marketCap: nonnegative(p.marketCap) || null, marketCapSource: 'DEX Screener marketCap (provider reported)', liquidity: nonnegative(p.liquidity?.usd), volume24h: nonnegative(p.volume?.h24), volume1h: nonnegative(p.volume?.h1), buys24h: nonnegative(p.txns?.h24?.buys), sells24h: nonnegative(p.txns?.h24?.sells), buyers24h: null, priceChange24h: numeric(p.priceChange?.h24), pool: p.pairAddress, url: `https://dexscreener.com/${chain}/${encodeURIComponent(p.pairAddress)}`, observedAt: now, coinGeckoId: null, telegram }];
    });
}
export interface DexBoost {
    chainId: RadarChain;
    tokenAddress: string;
    totalAmount: number;
    telegram: string | null;
}
export function parseDexBoosts(body: any): DexBoost[] {
    if (!Array.isArray(body)) return [];
    return body.flatMap((b: any) => {
        const chainId = String(b.chainId || '').toLowerCase();
        if (!CHAINS.includes(chainId as RadarChain) || !b.tokenAddress) return [];
        const totalAmount = nonnegative(b.totalAmount) || nonnegative(b.amount) || 0;
        const telegram = (b.links || []).find((s: any) =>
            (s.type === 'telegram' || /t\.me\//i.test(s.url || '')) &&
            /^https:\/\/t\.me\/[A-Za-z0-9_]{5,32}\/?$/i.test(s.url || '')
        )?.url || null;
        return [{
            chainId: chainId as RadarChain,
            tokenAddress: String(b.tokenAddress),
            totalAmount,
            telegram
        }];
    });
}
export async function collectMarket(tracked: RadarToken[]): Promise<{
    tokens: RadarToken[];
    sources: RadarSourceStatus[];
}> {
    const candidates = new Map<string, RadarToken>(), sources: RadarSourceStatus[] = [];
    const merge = (row: RadarToken) => {
        const old = candidates.get(row.id);
        if (!old) {
            candidates.set(row.id, row);
            return;
        }
        const winner = (row.liquidity || 0) > (old.liquidity || 0) ? row : old;
        const boostAmount = Math.max(old.boostAmount || 0, row.boostAmount || 0) || null;
        candidates.set(row.id, { ...winner, coinGeckoId: old.coinGeckoId || row.coinGeckoId, telegram: old.telegram || row.telegram,
            boostAmount,
            marketCap: old.marketCap && old.marketCap > 0 ? old.marketCap : row.marketCap, marketCapSource: old.marketCap && old.marketCap > 0 ? old.marketCapSource : row.marketCapSource });
    };
    const boostsByTokenId = new Map<string, DexBoost>();
    try {
        const [topRes, latestRes] = await Promise.all([
            fetchJson('https://api.dexscreener.com/token-boosts/top/v1').catch(() => []),
            fetchJson('https://api.dexscreener.com/token-boosts/latest/v1').catch(() => [])
        ]);
        const allBoosts = [...parseDexBoosts(topRes), ...parseDexBoosts(latestRes)];
        for (const b of allBoosts) {
            const id = tokenId(b.chainId, b.tokenAddress);
            const prev = boostsByTokenId.get(id);
            if (!prev || b.totalAmount > prev.totalAmount) {
                boostsByTokenId.set(id, {
                    ...b,
                    telegram: b.telegram || prev?.telegram || null
                });
            }
        }
        sources.push({
            id: 'dex:token-boosts',
            kind: 'attention',
            status: boostsByTokenId.size > 0 ? 'ok' : 'partial',
            items: boostsByTokenId.size,
            checkedAt: Date.now(),
            detail: 'Top și cele mai recente boosturi de comunitate DEX Screener (zero cost)'
        });
    } catch (e) {
        sources.push({
            id: 'dex:token-boosts',
            kind: 'attention',
            status: 'unavailable',
            items: 0,
            checkedAt: Date.now(),
            detail: (e as Error).message
        });
    }
    for (const chain of CHAINS) {
        for (const path of ['trending_pools', 'new_pools']) {
            const id = `gecko:${chain}:${path}`;
            try {
                const body = await fetchJson(`https://api.geckoterminal.com/api/v2/networks/${chain}/${path}?include=base_token,quote_token&page=1`);
                if (!Array.isArray(body.data))
                    throw new Error('Invalid pool response');
                const rows = parseGeckoPools(chain, body);
                rows.forEach(r => {
                    const boost = boostsByTokenId.get(r.id);
                    if (boost) {
                        r.boostAmount = boost.totalAmount;
                        if (!r.telegram && boost.telegram) r.telegram = boost.telegram;
                    }
                    merge(r);
                });
                sources.push({ id, kind: 'market', status: 'ok', items: rows.length, checkedAt: Date.now(), detail: 'Prima pagină; eșantion de pooluri, nu întreaga rețea' });
            }
            catch (e) {
                sources.push({ id, kind: 'market', status: 'unavailable', items: 0, checkedAt: Date.now(), detail: (e as Error).message });
            }
            await new Promise(r => setTimeout(r, 2200));
        }
    }
    // Explicit chain addresses, not ticker search. Refresh retained tokens and query community-boosted tokens.
    for (const chain of CHAINS) {
        const boostedAddresses = Array.from(boostsByTokenId.values())
            .filter(b => b.chainId === chain)
            .map(b => b.tokenAddress);
        const addresses = [...new Set([
            ...[...candidates.values()].filter(t => t.chain === chain).map(t => t.address),
            ...tracked.filter(t => t.chain === chain).map(t => t.address),
            ...boostedAddresses
        ])].slice(0, 150);
        let count = 0, failures = 0;
        for (let i = 0; i < addresses.length; i += 30) {
            const chunk = addresses.slice(i, i + 30);
            try {
                const body = await fetchJson(`https://api.dexscreener.com/tokens/v1/${chain}/${chunk.map(encodeURIComponent).join(',')}`);
                if (!Array.isArray(body))
                    throw new Error('Invalid token response');
                const rows = parseDexPairs(chain, body, new Set(chunk.map(a => tokenId(chain, a))));
                rows.forEach(r => {
                    const boost = boostsByTokenId.get(r.id);
                    if (boost) {
                        r.boostAmount = boost.totalAmount;
                        if (!r.telegram && boost.telegram) r.telegram = boost.telegram;
                    }
                    merge(r);
                });
                count += rows.length;
            }
            catch {
                failures++;
            }
        }
        sources.push({ id: `dex:${chain}`, kind: 'market', status: failures ? (count ? 'partial' : 'unavailable') : 'ok', items: count, checkedAt: Date.now(), detail: `Pool principal par token; ${addresses.length} contracte solicitate${failures ? `; ${failures} cereri eșuate` : ''}` });
    }
    return { tokens: [...candidates.values()], sources };
}
