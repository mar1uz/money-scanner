import type { RadarChain, RadarToken, RadarPost, RadarSocialEvidence, RadarRow, RadarSnapshot, RadarBaseline } from '@money-scanner/shared';
export const CHAINS: RadarChain[] = ['solana', 'base', 'robinhood'];
export const tokenId = (chain: RadarChain, address: string) => `${chain}:${chain === 'solana' ? address : address.toLowerCase()}`;
export const numeric = (value: unknown): number | null => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
export const nonnegative = (value: unknown): number | null => { const n = numeric(value); return n !== null && n >= 0 ? n : null; };
export const percent = (current: number, old: number | null | undefined): number | null => old && old > 0 ? (current / old - 1) * 100 : null;
const clamp = (n: number) => Math.max(0, Math.min(100, n));
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function dedupePosts(posts: RadarPost[], now = Date.now()): RadarPost[] {
    const urls = new Set<string>(), texts = new Set<string>();
    return posts.filter(p => {
        if (!p.id || !p.author || !Number.isFinite(p.timestamp) || !/^https:\/\//.test(p.url) || p.timestamp > now + 60000 || p.timestamp < now - 86400000)
            return false;
        const text = p.text.toLowerCase().replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();
        if (text.length < 12 || urls.has(p.url) || texts.has(text))
            return false;
        urls.add(p.url);
        texts.add(text);
        return true;
    }).sort((a, b) => b.timestamp - a.timestamp).slice(0, 1500);
}
export function socialEvidence(token: RadarToken, all: RadarToken[], posts: RadarPost[], trending: Set<string>, available: boolean): RadarSocialEvidence {
    const chainHint = new RegExp(`\\b${escape(token.chain)}\\b`, 'i');
    const strong: {
        post: RadarPost;
        match: string;
    }[] = [];
    let weak = 0;
    for (const post of posts) {
        const text = post.text;
        const contracts = token.chain === 'solana' ? text.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/g) || [] : text.match(/0x[a-fA-F0-9]{40}(?![a-fA-F0-9])/g) || [];
        const exact = contracts.some(a => tokenId(token.chain, a) === token.id);
        const sameContractOtherChain = all.some(t => t.id !== token.id && t.address.toLowerCase() === token.address.toLowerCase());
        const channel = token.telegram && post.url.startsWith(`${token.telegram.replace(/\/$/, '')}/`);
        const genericName = ['solana', 'base', 'robinhood', 'ethereum', 'bitcoin', 'crypto', 'blockchain', 'defi', 'wrapped ether', 'wrapped sol'].includes(token.name.toLowerCase());
        const named = !genericName && token.name.length >= 5 && new RegExp(`(?:^|\\W)${escape(token.name)}(?:$|\\W)`, 'i').test(text);
        const symbol = /^[A-Za-z0-9]{2,15}$/.test(token.symbol) && new RegExp(`\\$${escape(token.symbol)}(?![A-Za-z0-9])`, 'i').test(text);
        const symbolCollision = all.some(t => t.id !== token.id && t.chain === token.chain && t.symbol.toLowerCase() === token.symbol.toLowerCase());
        let match = '';
        if (exact && (!sameContractOtherChain || chainHint.test(text)))
            match = 'contract';
        else if (channel)
            match = 'project-channel';
        else if (chainHint.test(text) && named && !symbolCollision)
            match = 'name+chain';
        else if (chainHint.test(text) && symbol && !symbolCollision)
            match = 'cashtag+chain';
        if (match)
            strong.push({ post, match });
        else if (symbol || named)
            weak++;
    }
    const social = strong.filter(x => x.post.kind === 'social');
    const authors = new Set(social.filter(x => x.post.source !== 'Telegram').map(x => `${x.post.source}:${x.post.author}`)).size;
    const channels = new Set(social.filter(x => x.post.source === 'Telegram').map(x => x.post.author)).size;
    const platforms = new Set(social.map(x => x.post.source)).size;
    const ALPHA_CHANNELS = new Set(['dexscreener_trending', 'dexscreener_alerts', 'solanatrending', 'solanaalpha', 'solanacalls', 'soltrend', 'solcalls', 'solana_gems', 'solanadegens']);
    const telegramCalls = social.filter(x => x.post.source === 'Telegram' && ALPHA_CHANNELS.has(x.post.author.toLowerCase())).length;
    const boostAmount = token.boostAmount || null;
    const boostScore = boostAmount && boostAmount > 0 ? Math.min(25, Math.round(Math.log10(1 + boostAmount) * 8.5)) : 0;
    const alphaCallBonus = Math.min(15, telegramCalls * 5);
    const baseScore = Math.min(authors, 15) * 4 + Math.min(channels, 5) * 3 + Math.min(platforms, 3) * 5 + Math.min(social.length, 20) / 2;
    const score = available ? Math.round(clamp(baseScore + boostScore + alphaCallBonus)) : null;
    return { mentions: social.length, authors, channels, platforms, editorialMentions: strong.length - social.length, weakMentions: weak, score, changeMentions: null, searchTrending: !!token.coinGeckoId && trending.has(token.coinGeckoId), boostAmount, telegramCalls, confluenceBonus: 0, examples: strong.slice(0, 3).map(x => ({ source: x.post.source, url: x.post.url, text: x.post.text.slice(0, 180), match: x.match })) };
}
export function rankTokens(tokens: RadarToken[], posts: RadarPost[], trending: Set<string>, socialAvailable: boolean, previous: RadarSnapshot | null, baselines: RadarBaseline[]): RadarRow[] {
    const before = new Map(previous?.rows.map(r => [r.id, r]) || []), baseline = new Map(baselines.map(b => [b.id, b]));
    return tokens.filter(t => t.marketCap !== null && t.marketCap >= 500000 && t.price > 0).map(t => {
        const social = socialEvidence(t, tokens, posts, trending, socialAvailable);
        const prev = before.get(t.id), first = baseline.get(t.id);
        social.changeMentions = prev && social.score !== null && prev.social.score !== null ? social.mentions - prev.social.mentions : null;
        // Fixed weights across runs; missing social evidence contributes nothing and is visible.
        const liquidity = Math.min(30, Math.log10(1 + (t.liquidity || 0) / 1000) * 10);
        const activity = Math.min(30, Math.log10(1 + (t.volume24h || 0) / 1000) * 10);
        const participation = t.buyers24h !== null ? Math.min(20, Math.log10(1 + t.buyers24h) * 7) : 0;
        const acceleration = t.volume24h && t.volume1h !== null ? Math.min(20, Math.max(0, t.volume1h / (t.volume24h / 24) - 1) * 5) : 0;
        const marketScore = Math.round(liquidity + activity + participation + acceleration);

        let confluenceBonus = 0;
        const hasStrongOnChain = marketScore >= 35 && (t.liquidity || 0) >= 50000;
        const hasCommunityHype = (social.score || 0) >= 15 || (t.boostAmount || 0) >= 10 || (social.telegramCalls || 0) >= 1;
        if (hasStrongOnChain && hasCommunityHype) {
            const onChainFactor = Math.min(1, marketScore / 65);
            const socialFactor = Math.min(1, ((social.score || 0) + (t.boostAmount ? 15 : 0) + (social.telegramCalls ? 10 : 0)) / 45);
            confluenceBonus = Math.round(15 * onChainFactor * socialFactor);
        }
        social.confluenceBonus = confluenceBonus;

        const baseScore = Math.round(marketScore * .7 + (social.score || 0) * .3);

        // Wallet safety & insider penalties
        let safetyPenalty = 0;
        if (t.top10HoldersPct !== null && t.top10HoldersPct !== undefined && t.top10HoldersPct > 50) {
            const concentrationPenalty = Math.round(Math.min(25, (t.top10HoldersPct - 50) * 0.8));
            safetyPenalty += concentrationPenalty;
        }
        if (t.insidersDetected || t.isBundled) {
            safetyPenalty += 25;
        }
        if (t.isHoneypot) {
            safetyPenalty += 50;
        }
        if ((t.sellTax !== null && t.sellTax !== undefined && t.sellTax > 10) || (t.buyTax !== null && t.buyTax !== undefined && t.buyTax > 10)) {
            safetyPenalty += 15;
        }
        if (t.rugScore !== null && t.rugScore !== undefined && t.rugScore > 1000) {
            safetyPenalty += 15;
        }

        const totalScore = clamp(baseScore + confluenceBonus - safetyPenalty);

        const reasons: string[] = [`Volum și lichiditate: pool principal`];
        if (confluenceBonus >= 4) {
            reasons.push(`🚀 Confluență ridicată (+${confluenceBonus} pct): volum/lichiditate on-chain corelate cu promovare comunitară activă`);
        }
        if (t.boostAmount && t.boostAmount > 0) {
            reasons.push(`⚡ Promovat de comunitate: ${t.boostAmount} boosturi DEX Screener`);
        }
        if (social.telegramCalls && social.telegramCalls > 0) {
            reasons.push(`📢 Alertat în ${social.telegramCalls} canal(e) Telegram alpha`);
        }
        // Safety reason tags
        if (t.top10HoldersPct !== null && t.top10HoldersPct !== undefined && t.top10HoldersPct > 50) {
            reasons.push(`⚠️ Concentrare ridicată: top 10 holderi dețin ${t.top10HoldersPct.toFixed(1)}%`);
        }
        if (t.insidersDetected || t.isBundled) {
            reasons.push(`🚨 Risc lansare bundled / insideri`);
        }
        if (t.isHoneypot) {
            reasons.push(`🚨 Honeypot detectat: vânzarea este restricționată`);
        }
        if ((t.sellTax !== null && t.sellTax !== undefined && t.sellTax > 10) || (t.buyTax !== null && t.buyTax !== undefined && t.buyTax > 10)) {
            reasons.push(`⚠️ Taxe ridicate la tranzacționare (Buy: ${t.buyTax || 0}%, Sell: ${t.sellTax || 0}%)`);
        }
        if (t.rugScore !== null && t.rugScore !== undefined && t.rugScore > 1000) {
            reasons.push(`⚠️ Scor de risc RugCheck ridicat (${t.rugScore})`);
        }
        if (t.top10HoldersPct !== null && t.top10HoldersPct !== undefined && t.top10HoldersPct <= 50 && !t.insidersDetected && !t.isBundled && !t.isHoneypot) {
            reasons.push(`🛡️ Verificare portofele: top 10 holderi ${t.top10HoldersPct.toFixed(1)}%, fără clustere de insideri`);
        }

        reasons.push(social.score === null ? 'Surse sociale indisponibile' : `${social.authors} autori / ${social.channels} canale / ${social.mentions} mențiuni asociate${t.boostAmount ? ` / ${t.boostAmount} boosturi` : ''}`);
        reasons.push('Scor euristic; nu este un semnal de cumpărare');
        if (t.liquidity !== null && t.liquidity < 50000)
            reasons.push('Lichiditate redusă');
        if (t.volume24h && t.liquidity && t.volume24h / t.liquidity > 50)
            reasons.push('Rulaj/lichiditate ridicat — verificați volum artificial');
        return { ...t, rank: 0, rankChange: null, score: totalScore, marketScore, firstReportedAt: first?.firstReportedAt ?? null, firstPrice: first?.firstPrice ?? null, changeFirst: percent(t.price, first?.firstPrice), previousPrice: prev?.price ?? null, changePrevious: percent(t.price, prev?.price), social, reasons };
    }).sort((a, b) => b.score - a.score || (b.volume24h || 0) - (a.volume24h || 0) || a.id.localeCompare(b.id)).map((r, i) => ({ ...r, rank: i + 1, rankChange: before.has(r.id) ? before.get(r.id)!.rank - i - 1 : null }));
}

/**
 * Discovers and ranks promising microcap utility projects in the $200,000 - $500,000 market cap range.
 * Scores fee generation, active utility, buybacks, and community hype while strictly penalizing bundled/insider risks.
 */
export function rankMicrocaps(tokens: RadarToken[], posts: RadarPost[], trending: Set<string>, socialAvailable: boolean, previous: RadarSnapshot | null, baselines: RadarBaseline[]): RadarRow[] {
    const before = new Map((previous?.microcaps || []).map(r => [r.id, r])), baseline = new Map(baselines.map(b => [b.id, b]));
    return tokens.filter(t => t.marketCap !== null && t.marketCap >= 200000 && t.marketCap < 500000 && t.price > 0).map(t => {
        const social = socialEvidence(t, tokens, posts, trending, socialAvailable);
        const prev = before.get(t.id), first = baseline.get(t.id);
        social.changeMentions = prev && social.score !== null && prev.social.score !== null ? social.mentions - prev.social.mentions : null;

        const turnover = t.volume24h && t.marketCap && t.marketCap > 0 ? t.volume24h / t.marketCap : 0;
        const volumeScore = Math.min(25, Math.log10(1 + (t.volume24h || 0) / 500) * 8);
        const turnoverBonus = Math.min(15, turnover * 10);
        const liquidityScore = Math.min(20, Math.log10(1 + (t.liquidity || 0) / 1000) * 8);
        const marketScore = Math.round(volumeScore + turnoverBonus + liquidityScore);

        const utilityBonus = (t.utilityTags && t.utilityTags.length > 0 ? 15 : 0) + (t.hasBuyback ? 10 : 0);
        const socialScore = Math.round((social.score || 0) * 0.25);
        const boostScore = t.boostAmount ? Math.min(15, Math.round(Math.log10(1 + t.boostAmount) * 5)) : 0;

        let safetyPenalty = 0;
        if (t.top10HoldersPct !== null && t.top10HoldersPct !== undefined && t.top10HoldersPct > 50) {
            safetyPenalty += Math.round(Math.min(30, (t.top10HoldersPct - 50) * 0.9));
        }
        if (t.insidersDetected || t.isBundled) {
            safetyPenalty += 25;
        }
        if (t.isHoneypot) {
            safetyPenalty += 50;
        }
        if ((t.sellTax !== null && t.sellTax !== undefined && t.sellTax > 10) || (t.buyTax !== null && t.buyTax !== undefined && t.buyTax > 10)) {
            safetyPenalty += 20;
        }
        if (t.rugScore !== null && t.rugScore !== undefined && t.rugScore > 1000) {
            safetyPenalty += 20;
        }

        const totalScore = clamp(marketScore + utilityBonus + socialScore + boostScore - safetyPenalty);

        const fees = t.estimatedFees24h || Math.round((t.volume24h || 0) * 0.003);
        const reasons: string[] = [
            `💸 Generare comisioane: ~$${fees.toLocaleString()}/24h (rulaj ${(turnover * 100).toFixed(0)}% din cap)`
        ];
        if (t.utilityTags && t.utilityTags.length > 0) {
            reasons.push(`⚙️ Utilitate activă: ${t.utilityTags.join(' · ')}`);
        }
        if (t.hasBuyback) {
            reasons.push(`🔥 Mecanism buyback / deflație detectat`);
        }
        if (t.holderReward) {
            reasons.push(`🎁 Beneficiu holderi: ${t.holderReward}`);
        }
        if (t.boostAmount && t.boostAmount > 0) {
            reasons.push(`⚡ Promovat de comunitate: ${t.boostAmount} boosturi DEX Screener`);
        }
        if (social.telegramCalls && social.telegramCalls > 0) {
            reasons.push(`📢 Alertat în ${social.telegramCalls} canal(e) Telegram alpha`);
        }

        // Wallet safety reason tags
        if (t.top10HoldersPct !== null && t.top10HoldersPct !== undefined && t.top10HoldersPct > 50) {
            reasons.push(`⚠️ Concentrare ridicată: top 10 holderi dețin ${t.top10HoldersPct.toFixed(1)}%`);
        }
        if (t.insidersDetected || t.isBundled) {
            reasons.push(`🚨 Risc lansare bundled / insideri`);
        }
        if (t.isHoneypot) {
            reasons.push(`🚨 Honeypot detectat: vânzarea este blocată sau restricționată`);
        }
        if (t.top10HoldersPct !== null && t.top10HoldersPct !== undefined && t.top10HoldersPct <= 50 && !t.insidersDetected && !t.isBundled && !t.isHoneypot) {
            reasons.push(`🛡️ Verificare securitate: top 10 holderi ${t.top10HoldersPct.toFixed(1)}%, fără lansare bundled`);
        }

        reasons.push('Microcap utilitar ($200k-$500k) — profil de risc asimetric');

        return {
            ...t,
            isMicrocap: true,
            rank: 0,
            rankChange: null,
            score: totalScore,
            marketScore,
            firstReportedAt: first?.firstReportedAt ?? null,
            firstPrice: first?.firstPrice ?? null,
            changeFirst: percent(t.price, first?.firstPrice),
            previousPrice: prev?.price ?? null,
            changePrevious: percent(t.price, prev?.price),
            social,
            reasons
        };
    }).sort((a, b) => b.score - a.score || (b.volume24h || 0) - (a.volume24h || 0) || a.id.localeCompare(b.id)).map((r, i) => ({ ...r, rank: i + 1, rankChange: before.has(r.id) ? before.get(r.id)!.rank - i - 1 : null }));
}
