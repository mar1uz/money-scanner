import type { RadarChain, RadarSourceStatus, RadarToken } from '@money-scanner/shared';

export interface TokenSecurityData {
    top10HoldersPct: number | null;
    isBundled: boolean | null;
    insidersDetected: boolean | null;
    rugScore: number | null;
    isHoneypot: boolean | null;
    buyTax: number | null;
    sellTax: number | null;
    securityRisks: string[];
}

const securityCache = new Map<string, { data: TokenSecurityData; timestamp: number }>();
const CACHE_TTL_MS = 15 * 60 * 1000;

export async function fetchJsonWithTimeout(url: string, timeoutMs = 8000): Promise<any> {
    const response = await fetch(url, {
        headers: {
            accept: 'application/json',
            'user-agent': 'MoneyScanner-Security/1.0'
        },
        signal: AbortSignal.timeout(timeoutMs)
    });
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
}

/**
 * Fetches security audit for a Solana token via zero-cost RugCheck API
 */
export async function auditSolanaToken(address: string): Promise<TokenSecurityData | null> {
    const cacheKey = `solana:${address}`;
    const cached = securityCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return cached.data;
    }

    try {
        const body = await fetchJsonWithTimeout(`https://api.rugcheck.xyz/v1/tokens/${encodeURIComponent(address)}/report`);
        if (!body) return null;

        // Top 10 holders percentage
        let top10HoldersPct: number | null = null;
        if (Array.isArray(body.topHolders) && body.topHolders.length > 0) {
            const sum = body.topHolders.slice(0, 10).reduce((acc: number, h: any) => acc + (typeof h.pct === 'number' ? h.pct : 0), 0);
            top10HoldersPct = Math.round(sum * 100) / 100;
        }

        // Insider clustering & networks
        const graphInsiders = typeof body.graphInsidersDetected === 'number'
            ? body.graphInsidersDetected > 0
            : Boolean(body.graphInsidersDetected);
        const hasInsiderHolders = Array.isArray(body.topHolders) && body.topHolders.some((h: any) => h.insider === true);
        const hasInsiderNetworks = Array.isArray(body.insiderNetworks) && body.insiderNetworks.length > 0;
        const insidersDetected = graphInsiders || hasInsiderHolders || hasInsiderNetworks;

        // Bundled launch detection
        const risks = Array.isArray(body.risks) ? body.risks : [];
        const isBundled = risks.some((r: any) => /bundle/i.test(r.name || '') || /bundle/i.test(r.description || '')) ||
            (Array.isArray(body.insiderNetworks) && body.insiderNetworks.some((n: any) => (n.activeAccounts || 0) > 8 && /bundle|cluster/i.test(n.id || '')));

        // Risk score
        const rugScore = typeof body.score === 'number' ? body.score : null;

        // Honeypot & taxes
        const isHoneypot = Boolean(body.rugged) || risks.some((r: any) => /freeze authority|honeypot/i.test(r.name || ''));
        const transferFeePct = body.transferFee?.pct ? Math.round(body.transferFee.pct * 100) / 100 : 0;
        const buyTax = transferFeePct;
        const sellTax = transferFeePct;

        const securityRisks = risks
            .filter((r: any) => r.level === 'warn' || r.level === 'danger')
            .map((r: any) => String(r.name || '').trim())
            .filter(Boolean);

        const data: TokenSecurityData = {
            top10HoldersPct,
            isBundled,
            insidersDetected,
            rugScore,
            isHoneypot,
            buyTax,
            sellTax,
            securityRisks
        };

        securityCache.set(cacheKey, { data, timestamp: Date.now() });
        return data;
    } catch {
        return null;
    }
}

const GOPLUS_CHAIN_IDS: Record<'base' | 'robinhood', string> = {
    base: '8453',
    robinhood: '4663'
};

/**
 * Fetches security audit for EVM tokens (Base, Robinhood) via zero-cost GoPlus Security API
 */
export async function auditEvmTokens(chain: 'base' | 'robinhood', addresses: string[]): Promise<Map<string, TokenSecurityData>> {
    const results = new Map<string, TokenSecurityData>();
    const chainId = GOPLUS_CHAIN_IDS[chain];
    if (!chainId || addresses.length === 0) return results;

    const uncachedAddresses: string[] = [];
    for (const addr of addresses) {
        const cacheKey = `${chain}:${addr.toLowerCase()}`;
        const cached = securityCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
            results.set(addr.toLowerCase(), cached.data);
        } else {
            uncachedAddresses.push(addr);
        }
    }

    if (uncachedAddresses.length === 0) return results;

    // GoPlus supports up to 25 addresses per call
    const CHUNK_SIZE = 25;
    for (let i = 0; i < uncachedAddresses.length; i += CHUNK_SIZE) {
        const chunk = uncachedAddresses.slice(i, i + CHUNK_SIZE);
        try {
            const url = `https://api.gopluslabs.io/api/v1/token_security/${chainId}?contract_addresses=${chunk.map(a => a.toLowerCase()).join(',')}`;
            const res = await fetchJsonWithTimeout(url);
            const dataMap = res?.result || {};

            for (const addr of chunk) {
                const normAddr = addr.toLowerCase();
                const item = dataMap[normAddr];
                if (!item) continue;

                const isHoneypot = item.is_honeypot === '1' || item.is_honeypot === 1 || item.cannot_sell_all === '1';
                const buyTax = item.buy_tax !== null && item.buy_tax !== undefined ? Math.round(parseFloat(item.buy_tax) * 10000) / 100 : 0;
                const sellTax = item.sell_tax !== null && item.sell_tax !== undefined ? Math.round(parseFloat(item.sell_tax) * 10000) / 100 : 0;

                // Wallet vs pool contract distinction
                const dexPools = new Set((item.dex || []).map((p: any) => String(p.pair || '').toLowerCase()));
                const burnAddrs = new Set([
                    '0x000000000000000000000000000000000000dead',
                    '0x0000000000000000000000000000000000000000'
                ]);

                const holders = Array.isArray(item.holders) ? item.holders : [];
                const walletHolders = holders.filter((h: any) => {
                    const hAddr = String(h.address || '').toLowerCase();
                    return !dexPools.has(hAddr) && !burnAddrs.has(hAddr);
                });

                const targetHolders = walletHolders.length > 0 ? walletHolders : holders;
                const top10HoldersPct = targetHolders.length > 0
                    ? Math.round(targetHolders.slice(0, 10).reduce((acc: number, h: any) => acc + (parseFloat(h.percent || '0') * 100), 0) * 100) / 100
                    : null;

                const creatorPercent = parseFloat(item.creator_percent || '0') * 100;
                const top3WalletPct = walletHolders.slice(0, 3).reduce((acc: number, h: any) => acc + (parseFloat(h.percent || '0') * 100), 0);

                const insidersDetected = creatorPercent > 25 || item.is_airdrop_scam === '1' || top3WalletPct > 50;
                const isBundled = item.is_airdrop_scam === '1' || (walletHolders.length > 0 && walletHolders.slice(0, 5).reduce((acc: number, h: any) => acc + (parseFloat(h.percent || '0') * 100), 0) > 75);

                // Compute standardized risk score for EVM
                let rugScore = 0;
                const securityRisks: string[] = [];
                if (isHoneypot) {
                    rugScore += 1000;
                    securityRisks.push('Honeypot: vânzare imposibilă');
                }
                if (sellTax > 10) {
                    rugScore += 300;
                    securityRisks.push(`Taxă mare la vânzare (${sellTax}%)`);
                }
                if (buyTax > 10) {
                    rugScore += 200;
                    securityRisks.push(`Taxă mare la cumpărare (${buyTax}%)`);
                }
                if (creatorPercent > 20) {
                    rugScore += 200;
                    securityRisks.push(`Creatorul deține ${creatorPercent.toFixed(1)}%`);
                }
                if (top10HoldersPct !== null && top10HoldersPct > 50) {
                    rugScore += 200;
                    securityRisks.push(`Top 10 holderi dețin ${top10HoldersPct.toFixed(1)}%`);
                }
                if (item.can_take_back_ownership === '1') {
                    rugScore += 200;
                    securityRisks.push('Proprietarul poate relua controlul');
                }
                if (item.selfdestruct === '1') {
                    rugScore += 300;
                    securityRisks.push('Contractul conține selfdestruct');
                }
                if (item.hidden_owner === '1') {
                    rugScore += 150;
                    securityRisks.push('Proprietar ascuns');
                }

                const data: TokenSecurityData = {
                    top10HoldersPct,
                    isBundled,
                    insidersDetected,
                    rugScore,
                    isHoneypot,
                    buyTax,
                    sellTax,
                    securityRisks
                };

                results.set(normAddr, data);
                securityCache.set(`${chain}:${normAddr}`, { data, timestamp: Date.now() });
            }
        } catch {
            // Failure on a chunk gracefully handled
        }
    }

    return results;
}

/**
 * Enriches candidate tokens with wallet safety, insider detection, and risk metrics.
 */
export async function enrichTokensWithSecurity(tokens: RadarToken[]): Promise<{
    tokens: RadarToken[];
    sources: RadarSourceStatus[];
}> {
    const sources: RadarSourceStatus[] = [];
    const solanaTokens = tokens.filter(t => t.chain === 'solana');
    const baseTokens = tokens.filter(t => t.chain === 'base');
    const robinhoodTokens = tokens.filter(t => t.chain === 'robinhood');

    const enrichedMap = new Map<string, TokenSecurityData>();

    // 1. Solana Security via RugCheck API
    let solanaSuccessCount = 0;
    const solanaCandidates = solanaTokens.slice(0, 40); // limit to prioritized tokens per run
    for (const t of solanaCandidates) {
        const audit = await auditSolanaToken(t.address);
        if (audit) {
            enrichedMap.set(t.id, audit);
            solanaSuccessCount++;
        }
        // Polite delay between individual Solana RugCheck calls
        await new Promise(r => setTimeout(r, 120));
    }
    sources.push({
        id: 'rugcheck:solana',
        kind: 'editorial',
        status: solanaCandidates.length === 0 ? 'ok' : (solanaSuccessCount > 0 ? 'ok' : 'partial'),
        items: solanaSuccessCount,
        checkedAt: Date.now(),
        detail: `RugCheck API: top holderi, insider clustering și detectare honeypot/bundled (${solanaSuccessCount}/${solanaCandidates.length} verificate)`
    });

    // 2. Base Security via GoPlus API
    const baseCandidates = baseTokens.slice(0, 50);
    const baseResults = await auditEvmTokens('base', baseCandidates.map(t => t.address));
    baseCandidates.forEach(t => {
        const audit = baseResults.get(t.address.toLowerCase());
        if (audit) enrichedMap.set(t.id, audit);
    });
    sources.push({
        id: 'goplus:base',
        kind: 'editorial',
        status: baseCandidates.length === 0 ? 'ok' : (baseResults.size > 0 ? 'ok' : 'partial'),
        items: baseResults.size,
        checkedAt: Date.now(),
        detail: `GoPlus Security: filtrare LP pool vs wallet, taxe buy/sell și verificare contract (${baseResults.size}/${baseCandidates.length} verificate)`
    });

    // 3. Robinhood Chain Security via GoPlus API
    const robinhoodCandidates = robinhoodTokens.slice(0, 50);
    const robinhoodResults = await auditEvmTokens('robinhood', robinhoodCandidates.map(t => t.address));
    robinhoodCandidates.forEach(t => {
        const audit = robinhoodResults.get(t.address.toLowerCase());
        if (audit) enrichedMap.set(t.id, audit);
    });
    sources.push({
        id: 'goplus:robinhood',
        kind: 'editorial',
        status: robinhoodCandidates.length === 0 ? 'ok' : 'ok',
        items: robinhoodResults.size,
        checkedAt: Date.now(),
        detail: `GoPlus Security: verificări securitate Robinhood Chain (${robinhoodResults.size}/${robinhoodCandidates.length} verificate)`
    });

    // Merge security data into tokens
    const enrichedTokens = tokens.map(t => {
        const audit = enrichedMap.get(t.id);
        if (!audit) return t;
        return {
            ...t,
            top10HoldersPct: audit.top10HoldersPct,
            isBundled: audit.isBundled,
            insidersDetected: audit.insidersDetected,
            rugScore: audit.rugScore,
            isHoneypot: audit.isHoneypot,
            buyTax: audit.buyTax,
            sellTax: audit.sellTax,
            securityRisks: audit.securityRisks
        };
    });

    return { tokens: enrichedTokens, sources };
}
