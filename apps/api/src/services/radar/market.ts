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
export interface DexProfile {
    chainId: RadarChain;
    tokenAddress: string;
    description?: string;
    telegram: string | null;
}
export function parseDexProfiles(body: any): DexProfile[] {
    if (!Array.isArray(body)) return [];
    return body.flatMap((b: any) => {
        const chainId = String(b.chainId || '').toLowerCase();
        if (!CHAINS.includes(chainId as RadarChain) || !b.tokenAddress) return [];
        const telegram = (b.links || []).find((s: any) =>
            (s.type === 'telegram' || /t\.me\//i.test(s.url || '')) &&
            /^https:\/\/t\.me\/[A-Za-z0-9_]{5,32}\/?$/i.test(s.url || '')
        )?.url || null;
        return [{
            chainId: chainId as RadarChain,
            tokenAddress: String(b.tokenAddress),
            description: typeof b.description === 'string' ? b.description.slice(0, 300) : undefined,
            telegram
        }];
    });
}
export function detectUtilitySignals(t: RadarToken, description = ''): {
    utilityTags: string[];
    estimatedFees24h: number | null;
    hasBuyback: boolean;
    holderReward: string | null;
} {
    const text = `${t.name} ${t.symbol} ${description}`.toLowerCase();
    const tags: string[] = [];

    if (/\b(bot|scanner|sniper|tool|terminal|suite)\b/i.test(text)) {
        tags.push('⚙️ Bot / Tool');
    }
    if (/\b(buyback|buy-back|burn|deflation|buybacks)\b/i.test(text)) {
        tags.push('🔥 Buyback / Burn');
    }
    if (/\b(fee|revenue|revshare|yield|dividend|rewards?|cashflow)\b/i.test(text)) {
        tags.push('💰 Fee Share / RevShare');
    }
    if (/\b(ai|agent|neural|intelligence|intel)\b/i.test(text)) {
        tags.push('🤖 AI / Agent');
    }
    if (/\b(swap|dex|amm|router|pool)\b/i.test(text)) {
        tags.push('🔄 DEX / Swap');
    }

    const turnover = t.volume24h && t.marketCap && t.marketCap > 0 ? t.volume24h / t.marketCap : 0;
    if (turnover >= 0.4) {
        tags.push('📈 Rulaj ridicat (Comisioane)');
    }

    const estimatedFees24h = t.volume24h ? Math.round(t.volume24h * 0.003) : null;
    const hasBuyback = /\b(buyback|buy-back|burn|deflation)\b/i.test(text);

    let holderReward: string | null = null;
    if (hasBuyback) {
        holderReward = 'Buyback & ardere din comisioane de tranzacționare';
    } else if (/\b(revshare|revenue|fee|yield)\b/i.test(text)) {
        holderReward = 'Distribuție comisioane protocol / RevShare';
    } else if (estimatedFees24h && estimatedFees24h > 100) {
        holderReward = `Comisioane pool estimate: ~$${estimatedFees24h.toLocaleString()}/24h`;
    }

    return { utilityTags: tags, estimatedFees24h, hasBuyback, holderReward };
}
export async function collectMarket(tracked: RadarToken[]): Promise<{
    tokens: RadarToken[];
    sources: RadarSourceStatus[];
}> {
    const candidates = new Map<string, RadarToken>(), sources: RadarSourceStatus[] = [];
    const descriptionsByTokenId = new Map<string, string>();
    const merge = (row: RadarToken, desc = '') => {
        const old = candidates.get(row.id);
        const resolvedDesc = desc || descriptionsByTokenId.get(row.id) || '';
        const signals = detectUtilitySignals(row, resolvedDesc);
        row.utilityTags = signals.utilityTags;
        row.estimatedFees24h = signals.estimatedFees24h;
        row.hasBuyback = signals.hasBuyback;
        row.holderReward = signals.holderReward;
        if (!old) {
            candidates.set(row.id, row);
            return;
        }
        const winner = (row.liquidity || 0) > (old.liquidity || 0) ? row : old;
        const boostAmount = Math.max(old.boostAmount || 0, row.boostAmount || 0) || null;
        const mergedUtilityTags = [...new Set([...(old.utilityTags || []), ...(row.utilityTags || [])])];
        candidates.set(row.id, {
            ...winner,
            coinGeckoId: old.coinGeckoId || row.coinGeckoId,
            telegram: old.telegram || row.telegram,
            boostAmount,
            marketCap: old.marketCap && old.marketCap > 0 ? old.marketCap : row.marketCap,
            marketCapSource: old.marketCap && old.marketCap > 0 ? old.marketCapSource : row.marketCapSource,
            utilityTags: mergedUtilityTags,
            estimatedFees24h: winner.estimatedFees24h || old.estimatedFees24h || row.estimatedFees24h,
            hasBuyback: winner.hasBuyback || old.hasBuyback || row.hasBuyback,
            holderReward: winner.holderReward || old.holderReward || row.holderReward
        });
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

    // Free token profiles with rich project descriptions
    const profilesByTokenId = new Map<string, DexProfile>();
    try {
        const profilesRes = await fetchJson('https://api.dexscreener.com/token-profiles/latest/v1').catch(() => []);
        const profiles = parseDexProfiles(profilesRes);
        for (const p of profiles) {
            const id = tokenId(p.chainId, p.tokenAddress);
            profilesByTokenId.set(id, p);
            if (p.description) descriptionsByTokenId.set(id, p.description);
        }
        sources.push({
            id: 'dex:token-profiles',
            kind: 'attention',
            status: profilesByTokenId.size > 0 ? 'ok' : 'partial',
            items: profilesByTokenId.size,
            checkedAt: Date.now(),
            detail: 'Profile DEX Screener cu descrieri utilitare și legături comunitare (zero cost)'
        });
    } catch (e) {
        sources.push({
            id: 'dex:token-profiles',
            kind: 'attention',
            status: 'unavailable',
            items: 0,
            checkedAt: Date.now(),
            detail: (e as Error).message
        });
    }

    // Discover active microcap utility candidates ($200k-$500k) via search
    const utilityDiscoveredAddressesByChain = new Map<RadarChain, string[]>();
    try {
        const [botSearch, feeSearch, toolSearch] = await Promise.all([
            fetchJson('https://api.dexscreener.com/latest/dex/search?q=bot').catch(() => ({ pairs: [] })),
            fetchJson('https://api.dexscreener.com/latest/dex/search?q=fee').catch(() => ({ pairs: [] })),
            fetchJson('https://api.dexscreener.com/latest/dex/search?q=tool').catch(() => ({ pairs: [] }))
        ]);
        const searchPairs = [...(botSearch.pairs || []), ...(feeSearch.pairs || []), ...(toolSearch.pairs || [])];
        for (const p of searchPairs) {
            const chain = String(p.chainId || '').toLowerCase() as RadarChain;
            const cap = typeof p.marketCap === 'number' ? p.marketCap : (typeof p.fdv === 'number' ? p.fdv : 0);
            if (CHAINS.includes(chain) && p.baseToken?.address && cap >= 180000 && cap <= 550000) {
                const list = utilityDiscoveredAddressesByChain.get(chain) || [];
                list.push(p.baseToken.address);
                utilityDiscoveredAddressesByChain.set(chain, list);
                if (p.info?.description) {
                    descriptionsByTokenId.set(tokenId(chain, p.baseToken.address), String(p.info.description));
                }
            }
        }
    } catch {
        // Non-critical auxiliary discovery
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
                    const profile = profilesByTokenId.get(r.id);
                    if (profile && !r.telegram && profile.telegram) {
                        r.telegram = profile.telegram;
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
    // Explicit chain addresses, not ticker search. Refresh retained tokens, community-boosted tokens, and microcap utilities.
    for (const chain of CHAINS) {
        const boostedAddresses = Array.from(boostsByTokenId.values())
            .filter(b => b.chainId === chain)
            .map(b => b.tokenAddress);
        const profileAddresses = Array.from(profilesByTokenId.values())
            .filter(b => b.chainId === chain)
            .map(b => b.tokenAddress);
        const utilityAddresses = utilityDiscoveredAddressesByChain.get(chain) || [];
        const addresses = [...new Set([
            ...[...candidates.values()].filter(t => t.chain === chain).map(t => t.address),
            ...tracked.filter(t => t.chain === chain).map(t => t.address),
            ...boostedAddresses,
            ...profileAddresses,
            ...utilityAddresses
        ])].slice(0, 160);
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
                    const profile = profilesByTokenId.get(r.id);
                    if (profile && !r.telegram && profile.telegram) {
                        r.telegram = profile.telegram;
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
