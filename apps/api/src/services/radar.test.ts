import test from 'node:test';
import assert from 'node:assert/strict';
import type { RadarToken, RadarPost, RadarSnapshot } from '@money-scanner/shared';
import { tokenId, rankTokens, rankMicrocaps, socialEvidence, dedupePosts } from './radar/scoring.js';
import { parseGeckoPools, parseDexPairs, parseDexBoosts, detectUtilitySignals } from './radar/market.js';
import { parseTelegram, parseRss } from './radar/social.js';
import { reportSlot, reportText, REPORT_INTERVAL } from './radar/service.js';
const now = Date.now();
const token = (overrides: Partial<RadarToken> = {}): RadarToken => ({ id: 'base:0x1111111111111111111111111111111111111111', chain: 'base', address: '0x1111111111111111111111111111111111111111', symbol: 'ALPHA', name: 'Alpha Protocol', price: 1, marketCap: 500000, marketCapSource: 'test', liquidity: 100000, volume24h: 100000, volume1h: 10000, buys24h: 200, sells24h: 100, buyers24h: 80, priceChange24h: 10, pool: 'pool', url: 'https://dexscreener.com/base/pool', observedAt: now, coinGeckoId: null, telegram: null, ...overrides });
const post = (overrides: Partial<RadarPost> = {}): RadarPost => ({ id: 'a', source: 'Mastodon', kind: 'social', author: 'alice', text: 'Following Alpha Protocol on Base today', url: 'https://mastodon.social/@alice/1', timestamp: now, engagement: null, ...overrides });
const rank = (tokens: RadarToken[]) => rankTokens(tokens, [], new Set(), true, null, []);
test('cap boundary is inclusive, unknown cap excluded, null price not eligible', () => { assert.equal(rank([token()]).length, 1); assert.equal(rank([token({ marketCap: 499999 })]).length, 0); assert.equal(rank([token({ marketCap: null })]).length, 0); assert.equal(rank([token({ price: 0 })]).length, 0); });
test('identity is chain-specific and Solana addresses remain case sensitive', () => { assert.notEqual(tokenId('solana', 'AbCd'), tokenId('solana', 'abcd')); assert.equal(tokenId('base', '0xAB'), tokenId('base', '0xab')); assert.notEqual(tokenId('base', '0xab'), tokenId('robinhood', '0xab')); });
test('FDV is never a market cap fallback', () => { const t = token(); const rows = parseDexPairs('base', [{ chainId: 'base', baseToken: { address: t.address, symbol: t.symbol, name: t.name }, priceUsd: '1', fdv: 9000000, pairAddress: 'pool' }], new Set([t.id])); assert.equal(rows[0].marketCap, null); assert.equal(rank(rows).length, 0); });
test('DEX parser rejects the wrong chain and case-mutated Solana contracts', () => { const base = token(); assert.deepEqual(parseDexPairs('base', [{ chainId: 'robinhood', baseToken: { address: base.address }, priceUsd: 1 }], new Set([base.id])), []); assert.deepEqual(parseDexPairs('solana', [{ chainId: 'solana', baseToken: { address: 'aBcD' }, priceUsd: 1 }], new Set([tokenId('solana', 'AbCd')])), []); });
test('Gecko uses base token metadata and ignores quote prices / FDV', () => { const rows = parseGeckoPools('base', { included: [{ id: 'base_a', attributes: { address: 'a', name: 'Alpha', symbol: 'ALPHA' } }], data: [{ attributes: { base_token_price_usd: '2', quote_token_price_usd: '5', fdv_usd: '50000000', address: 'pool' }, relationships: { base_token: { data: { id: 'base_a' } } } }] }); assert.equal(rows[0].price, 2); assert.equal(rows[0].marketCap, null); });
test('unavailable social evidence remains null; no matching posts is observed zero', () => { assert.equal(socialEvidence(token(), [token()], [], new Set(), false).score, null); assert.equal(socialEvidence(token(), [token()], [], new Set(), true).score, 0); });
test('ambiguous ticker without chain is not scored', () => { const e = socialEvidence(token(), [token()], [post({ text: 'Everyone is buying $ALPHA today!' })], new Set(), true); assert.equal(e.mentions, 0); assert.equal(e.weakMentions, 1); });
test('same EVM address on two chains requires chain context', () => { const a = token(), b = token({ chain: 'robinhood', id: tokenId('robinhood', token().address) }); assert.equal(socialEvidence(a, [a, b], [post({ text: 'Buy ' + a.address })], new Set(), true).mentions, 0); assert.equal(socialEvidence(a, [a, b], [post({ text: 'Base contract ' + a.address })], new Set(), true).mentions, 1); });
test('Telegram channels are not misrepresented as unique community members', () => { const t = token({ telegram: 'https://t.me/alphatoken' }); const e = socialEvidence(t, [t], [post({ source: 'Telegram', author: 'alphatoken', url: 'https://t.me/alphatoken/1', text: 'Our weekly community update is here' })], new Set(), true); assert.equal(e.channels, 1); assert.equal(e.authors, 0); assert.equal(e.mentions, 1); });
test('editorial articles cannot boost the community score', () => { const e = socialEvidence(token(), [token()], [post({ kind: 'editorial', source: 'CoinDesk' })], new Set(), true); assert.equal(e.editorialMentions, 1); assert.equal(e.score, 0); });
test('duplicate campaigns and stale posts are discarded', () => { const p = post(); assert.equal(dedupePosts([p, post({ id: 'b', url: 'https://example.org/post' })], now).length, 1); assert.equal(dedupePosts([post({ timestamp: now - 90000000 })], now).length, 0); });
test('report comparisons preserve original baseline and previous rank', () => { const row = rank([token()])[0]; const previous = { rows: [{ ...row, price: 2, rank: 4 }], generatedAt: now - REPORT_INTERVAL } as RadarSnapshot; const result = rankTokens([token({ price: 3 })], [], new Set(), true, previous, [{ id: token().id, firstPrice: 1, firstReportedAt: now - 2 * REPORT_INTERVAL }])[0]; assert.equal(result.changeFirst, 200); assert.equal(result.changePrevious, 50); assert.equal(result.rankChange, 3); assert.equal(result.firstPrice, 1); });
test('ranking tie-breaks deterministically and report slots are fixed 12h UTC', () => { const b = token({ id: 'base:z', address: 'z' }); assert.equal(rank([b, token()])[0].id, rank([token(), b])[0].id); assert.equal(reportSlot(1000), reportSlot(REPORT_INTERVAL - 1)); assert.notEqual(reportSlot(REPORT_INTERVAL - 1), reportSlot(REPORT_INTERVAL)); });
test('Telegram parser retains missing engagement as null and real date', () => { const p = parseTelegram('alpha', '<div class="tgme_widget_message_wrap"><div data-post="alpha/1"><div class="tgme_widget_message_text js-message_text">Alpha community update</div><time datetime="2026-09-06T12:00:00Z"></time></div>'); assert.equal(p[0].engagement, null); assert.equal(p[0].timestamp, Date.parse('2026-09-06T12:00:00Z')); });
test('RSS is editorial and only valid dated HTTPS items accepted', () => { const p = parseRss('<item><title>Base Alpha Protocol launches</title><link>https://example.org/story</link><pubDate>Sun, 06 Sep 2026 12:00:00 GMT</pubDate></item>', 'Example'); assert.equal(p[0].kind, 'editorial'); assert.equal(parseRss('<item><title>fake</title></item>', 'Example').length, 0); });
test('report includes full name, chain, contract and initial comparison', () => { const snapshot = { rows: rank([token()]), sources: [], exits: [], generatedAt: now } as unknown as RadarSnapshot; const text = reportText(snapshot); assert.ok(text.includes('Alpha Protocol (ALPHA)')); assert.ok(text.includes(token().address)); assert.ok(text.includes('De la primul raport')); });
test('Telegram HTML links token names by contract and escapes token-supplied markup', () => {
    const snapshot = { rows: rank([token({ name: 'Alpha <b> & "Beta"', symbol: 'A&B' })]), sources: [], exits: [], generatedAt: now } as unknown as RadarSnapshot;
    const html = reportText(snapshot, 'html');
    assert.ok(html.includes(`<a href="https://dexscreener.com/base/${token().address}">Alpha &lt;b&gt; &amp; &quot;Beta&quot; (A&amp;B)</a>`));
    assert.equal(html.includes('<b>'), false);
    assert.equal((html.match(/<a href=/g) || []).length, 1);
    assert.ok(reportText(snapshot).includes('Alpha <b> & "Beta" (A&B)'));
});
import { RadarStore } from './radar/store.js';
function fakeStore() {
    const docs = new Map<string, any>();
    const db: any = { doc: (path: string) => ({ path, get: async () => ({ exists: docs.has(path), data: () => docs.get(path) }), set: async (value: any, opts: any) => docs.set(path, opts?.merge ? { ...docs.get(path), ...value } : value) }), runTransaction: async (run: any) => {
            const pending: (() => void)[] = [];
            const result = await run({ get: async (ref: any) => ({ exists: docs.has(ref.path), data: () => docs.get(ref.path) }), set: (ref: any, value: any) => pending.push(() => docs.set(ref.path, value)), create: (ref: any, value: any) => pending.push(() => { if (docs.has(ref.path))
                    throw new Error('exists'); docs.set(ref.path, value); }), delete: (ref: any) => pending.push(() => docs.delete(ref.path)) });
            pending.forEach(fn => fn());
            return result;
        } };
    return { store: new RadarStore(db), docs };
}
test('distributed lease excludes concurrent runs and owner release does not release another lease', async () => { const { store, docs } = fakeStore(); const first = await store.acquire(); assert.ok(first); assert.equal(await store.acquire(), null); await store.release('someone-else'); assert.equal(docs.get('radar-state/lease').token, first); await store.release(first!); assert.ok(await store.acquire()); });
test('expired workers cannot persist a report', async () => { const { store, docs } = fakeStore(); const lease = await store.acquire(); docs.get('radar-state/lease').expiresAt = 0; await assert.rejects(store.saveReport({ id: '1788652800000' } as RadarSnapshot, lease!), /expired/); assert.equal(docs.has('radar-reports/1788652800000'), false); });
test('report is immutable per slot; baseline and delivery claims are persisted only once', async () => { const { store, docs } = fakeStore(); const lease = await store.acquire(); const snapshot = { id: '1788652800000', generatedAt: now, rows: rank([token()]) } as RadarSnapshot; const saved = await store.saveReport(snapshot, lease!); assert.equal(saved.rows[0].firstPrice, 1); const repeated = await store.saveReport({ ...snapshot, rows: rank([token({ price: 4 })]) }, lease!); assert.equal(repeated.rows[0].price, 1); assert.equal(docs.get(`radar-tokens/${encodeURIComponent(token().id)}`).firstPrice, 1); assert.equal(await store.claimDelivery(snapshot.id), true); assert.equal(await store.claimDelivery(snapshot.id), false); });
test('generic chain names are not treated as token mentions', () => { const t = token({ name: 'Solana', symbol: 'SOL' }); assert.equal(socialEvidence(t, [t], [post({ text: 'Solana and Base are two popular blockchains' })], new Set(), true).mentions, 0); });
test('parseDexBoosts filters supported chains and extracts contract, boost amount, and telegram link', () => {
    const raw = [
        { chainId: 'solana', tokenAddress: 'sol111', totalAmount: 250, links: [{ type: 'telegram', url: 'https://t.me/solalpha' }] },
        { chainId: 'base', tokenAddress: '0xbase', amount: 50 },
        { chainId: 'bsc', tokenAddress: '0xbsc', totalAmount: 100 },
        { chainId: 'ethereum', tokenAddress: '0xeth', totalAmount: 500 }
    ];
    const parsed = parseDexBoosts(raw);
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].chainId, 'solana');
    assert.equal(parsed[0].tokenAddress, 'sol111');
    assert.equal(parsed[0].totalAmount, 250);
    assert.equal(parsed[0].telegram, 'https://t.me/solalpha');
    assert.equal(parsed[1].chainId, 'base');
    assert.equal(parsed[1].totalAmount, 50);
});
test('community boosts elevate social score and are visible in evidence', () => {
    const normalToken = token();
    const boostedToken = token({ boostAmount: 300 });
    const evidenceNormal = socialEvidence(normalToken, [normalToken], [], new Set(), true);
    const evidenceBoosted = socialEvidence(boostedToken, [boostedToken], [], new Set(), true);
    assert.equal(evidenceNormal.score, 0);
    assert.ok(evidenceBoosted.score !== null && evidenceBoosted.score >= 20);
    assert.equal(evidenceBoosted.boostAmount, 300);
});
test('Telegram alpha channels are identified as dedicated calls', () => {
    const t = token();
    const callPost = post({
        source: 'Telegram',
        author: 'dexscreener_trending',
        text: `Token $ALPHA is trending on Base: ${t.address}`
    });
    const evidence = socialEvidence(t, [t], [callPost], new Set(), true);
    assert.equal(evidence.channels, 1);
    assert.equal(evidence.telegramCalls, 1);
    assert.ok(evidence.score !== null && evidence.score >= 5);
});
test('on-chain liquidity & volume correlated with community hype award confluence bonus and higher rank', () => {
    const quietToken = token({ id: 'base:0xquiet', address: '0xquiet', symbol: 'QUIET', name: 'Quiet Token', liquidity: 150000, volume24h: 200000, buyers24h: 150 });
    const hypedToken = token({ id: 'base:0xhyped', address: '0xhyped', symbol: 'HYPED', name: 'Hyped Token', liquidity: 150000, volume24h: 200000, buyers24h: 150, boostAmount: 150 });
    const callPost = post({
        source: 'Telegram',
        author: 'solanatrending',
        text: `Trending Base token $HYPED contract ${hypedToken.address}`
    });
    const ranked = rankTokens([quietToken, hypedToken], [callPost], new Set(), true, null, []);
    assert.equal(ranked[0].id, hypedToken.id);
    assert.ok(ranked[0].score > ranked[1].score);
    assert.ok(ranked[0].social.confluenceBonus && ranked[0].social.confluenceBonus > 0);
    assert.ok(ranked[0].reasons.some(r => r.includes('Confluență ridicată')));
    assert.ok(ranked[0].reasons.some(r => r.includes('boosturi DEX Screener')));
});
test('high holder concentration (>50%) penalizes score and appends explicit warning tag', () => {
    const normalToken = token({ id: 'base:0xnormal', address: '0xnormal', top10HoldersPct: 28.5 });
    const concentratedToken = token({ id: 'base:0xwhale', address: '0xwhale', top10HoldersPct: 78.4 });
    const ranked = rankTokens([normalToken, concentratedToken], [], new Set(), true, null, []);
    const normalRow = ranked.find(r => r.id === normalToken.id)!;
    const whaleRow = ranked.find(r => r.id === concentratedToken.id)!;
    assert.ok(normalRow.score > whaleRow.score);
    assert.ok(whaleRow.reasons.some(r => r.includes('Concentrare ridicată: top 10 holderi dețin 78.4%')));
    assert.ok(normalRow.reasons.some(r => r.includes('Verificare portofele')));
});
test('bundled launch / insider network detection penalizes score and appends alert tag', () => {
    const cleanToken = token({ id: 'solana:clean111', chain: 'solana', address: 'clean111', insidersDetected: false, isBundled: false });
    const bundledToken = token({ id: 'solana:bundle111', chain: 'solana', address: 'bundle111', insidersDetected: true, isBundled: true });
    const ranked = rankTokens([cleanToken, bundledToken], [], new Set(), true, null, []);
    const cleanRow = ranked.find(r => r.id === cleanToken.id)!;
    const bundledRow = ranked.find(r => r.id === bundledToken.id)!;
    assert.ok(cleanRow.score > bundledRow.score);
    assert.ok(bundledRow.reasons.some(r => r.includes('Risc lansare bundled / insideri')));
});
test('honeypot detection applies heavy penalty and explicit warning', () => {
    const honeypot = token({ id: 'base:0xtrap', address: '0xtrap', isHoneypot: true });
    const ranked = rankTokens([honeypot], [], new Set(), true, null, []);
    assert.equal(ranked.length, 1);
    assert.ok(ranked[0].score <= 25);
    assert.ok(ranked[0].reasons.some(r => r.includes('Honeypot detectat')));
});
test('detectUtilitySignals extracts bot, buyback, revshare and computes fee estimates', () => {
    const botToken = token({ name: 'Sniper Bot Terminal', symbol: 'BOT', volume24h: 200000, marketCap: 300000 });
    const botSignals = detectUtilitySignals(botToken, 'Advanced trading bot terminal with revenue sharing');
    assert.ok(botSignals.utilityTags.includes('⚙️ Bot / Tool'));
    assert.ok(botSignals.utilityTags.includes('💰 Fee Share / RevShare'));
    assert.ok(botSignals.utilityTags.includes('📈 Rulaj ridicat (Comisioane)'));
    assert.equal(botSignals.estimatedFees24h, 600); // 200,000 * 0.003
    assert.ok(botSignals.holderReward !== null);

    const buybackToken = token({ name: 'HyperBurn Protocol', symbol: 'BURN', volume24h: 50000, marketCap: 250000 });
    const buybackSignals = detectUtilitySignals(buybackToken, 'Automatic buyback and burn from trading volume');
    assert.ok(buybackSignals.utilityTags.includes('🔥 Buyback / Burn'));
    assert.equal(buybackSignals.hasBuyback, true);
    assert.ok(buybackSignals.holderReward?.includes('Buyback'));
});
test('rankMicrocaps filters $200k-$500k range, ranks by fees & utility, and applies safety checks', () => {
    const microUtility = token({
        id: 'solana:micro1', chain: 'solana', address: 'micro1', name: 'Alpha Bot', symbol: 'ABOT',
        price: 0.35, marketCap: 350000, liquidity: 40000, volume24h: 120000,
        utilityTags: ['⚙️ Bot / Tool'], estimatedFees24h: 360, hasBuyback: true,
        top10HoldersPct: 32.0, insidersDetected: false, isBundled: false
    });
    const microRisky = token({
        id: 'solana:micro2', chain: 'solana', address: 'micro2', name: 'Risky Bot', symbol: 'RBOT',
        price: 0.35, marketCap: 350000, liquidity: 40000, volume24h: 120000,
        utilityTags: ['⚙️ Bot / Tool'], estimatedFees24h: 360,
        top10HoldersPct: 85.0, insidersDetected: true, isBundled: true
    });
    const tooSmall = token({ id: 'base:small', address: 'small', marketCap: 150000, price: 1 });
    const tooBig = token({ id: 'base:big', address: 'big', marketCap: 600000, price: 1 });

    const microcaps = rankMicrocaps([microUtility, microRisky, tooSmall, tooBig], [], new Set(), true, null, []);
    assert.equal(microcaps.length, 2);
    assert.equal(microcaps[0].id, microUtility.id);
    assert.equal(microcaps[1].id, microRisky.id);
    assert.ok(microcaps[0].score > microcaps[1].score);
    assert.equal(microcaps[0].isMicrocap, true);
    assert.ok(microcaps[0].reasons.some(r => r.includes('Generare comisioane')));
    assert.ok(microcaps[0].reasons.some(r => r.includes('Utilitate activă')));
    assert.ok(microcaps[0].reasons.some(r => r.includes('Mecanism buyback')));
    assert.ok(microcaps[1].reasons.some(r => r.includes('Concentrare ridicată')));
    assert.ok(microcaps[1].reasons.some(r => r.includes('Risc lansare bundled / insideri')));
});
