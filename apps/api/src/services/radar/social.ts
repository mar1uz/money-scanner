import type { RadarPost, RadarSourceStatus, RadarToken } from '@money-scanner/shared';
import { createHash } from 'node:crypto';
import { fetchJson } from './market.js';
import { dedupePosts } from './scoring.js';
const plain = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
const id = (s: string) => createHash('sha256').update(s).digest('hex');
async function getText(url: string) { const r = await fetch(url, { headers: { 'user-agent': 'MoneyScanner-Radar/1.0' }, signal: AbortSignal.timeout(12000) }); if (!r.ok)
    throw new Error(`HTTP ${r.status}`); return r.text(); }
export function parseTelegram(channel: string, html: string): RadarPost[] {
    const starts = Array.from(html.matchAll(/<div class="tgme_widget_message_wrap\b/g), m => m.index!);
    return starts.flatMap((start, i) => {
        const b = html.slice(start, starts[i + 1] || html.length), m = /data-post="([^"/]+)\/(\d+)"/.exec(b), date = /<time datetime="([^"]+)"/.exec(b), text = /<div class="tgme_widget_message_text js-message_text"[^>]*>([\s\S]*?)<\/div>/.exec(b);
        if (!m || !date || !text || m[1].toLowerCase() !== channel.toLowerCase())
            return [];
        const url = `https://t.me/${channel}/${m[2]}`;
        return [{ id: id(url), source: 'Telegram', kind: 'social', author: channel, text: plain(text[1]).slice(0, 1800), url, timestamp: Date.parse(date[1]), engagement: null }];
    });
}
export function parseRss(xml: string, source: string): RadarPost[] {
    return Array.from(xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/g)).flatMap(m => {
        const get = (tag: string) => new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`).exec(m[1])?.[1] || '';
        const url = plain(get('link')), title = plain(get('title')), timestamp = Date.parse(get('pubDate'));
        return /^https:\/\//.test(url) && title && Number.isFinite(timestamp) ? [{ id: id(url), source, kind: 'editorial' as const, author: source, text: title.slice(0, 500), url, timestamp, engagement: null }] : [];
    });
}
export async function collectSocial(tokens: RadarToken[]): Promise<{
    posts: RadarPost[];
    sources: RadarSourceStatus[];
    trending: Set<string>;
}> {
    const posts: RadarPost[] = [], sources: RadarSourceStatus[] = [], trending = new Set<string>();
    const tasks: {
        id: string;
        kind: RadarSourceStatus['kind'];
        run: () => Promise<RadarPost[]>;
    }[] = [];
    const channels = [...new Set((process.env.RADAR_TELEGRAM_CHANNELS || 'cointelegraph,watcherguru,solana').split(',').map(x => x.trim()).concat(tokens.filter(t => t.marketCap !== null && t.marketCap >= 500000).sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0)).flatMap(t => t.telegram ? [t.telegram.split('/')[3]] : [])))].filter(x => /^[A-Za-z0-9_]{5,32}$/.test(x)).slice(0, 16);
    for (const channel of channels)
        tasks.push({ id: `telegram:${channel}`, kind: 'social', run: async () => { const html = await getText(`https://t.me/s/${channel}`); if (!html.includes('tgme_widget_message_wrap'))
                throw new Error('Arhivă publică de mesaje indisponibilă'); return parseTelegram(channel, html); } });
    for (const query of ['solana', 'base crypto', 'robinhood chain'])
        tasks.push({ id: `bluesky:${query}`, kind: 'social', run: async () => {
                const data = await fetchJson(`https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?${new URLSearchParams({ q: query, sort: 'latest', limit: '50' })}`);
                if (!Array.isArray(data.posts))
                    throw new Error('Invalid posts response');
                return data.posts.flatMap((p: any) => {
                    const key = String(p.uri || '').split('/').pop();
                    if (!p.author?.handle || !key)
                        return [];
                    const url = `https://bsky.app/profile/${encodeURIComponent(p.author.handle)}/post/${key}`;
                    return [{ id: id(url), source: 'Bluesky', kind: 'social', author: p.author.did || p.author.handle, text: String(p.record?.text || '').slice(0, 1800), url, timestamp: Date.parse(p.record?.createdAt), engagement: typeof p.likeCount === 'number' ? p.likeCount + (p.repostCount || 0) + (p.replyCount || 0) : null }];
                });
            } });
    for (const tag of ['crypto', 'solana', 'base', 'defi'])
        tasks.push({ id: `mastodon:${tag}`, kind: 'social', run: async () => {
                const data = await fetchJson(`https://mastodon.social/api/v1/timelines/tag/${tag}?limit=40`);
                if (!Array.isArray(data))
                    throw new Error('Invalid timeline');
                return data.filter(p => p.visibility === 'public' && !p.reblog && !p.account?.bot).map((p: any) => ({ id: id(p.url || p.uri), source: 'Mastodon', kind: 'social', author: p.account?.url || p.account?.acct || '', text: plain(p.content || '').slice(0, 1800), url: p.url || p.uri, timestamp: Date.parse(p.created_at), engagement: typeof p.favourites_count === 'number' ? p.favourites_count + (p.reblogs_count || 0) + (p.replies_count || 0) : null }));
            } });
    for (const [name, url] of [['CoinDesk', 'https://www.coindesk.com/arc/outboundfeeds/rss/'], ['Cointelegraph', 'https://cointelegraph.com/rss'], ['Decrypt', 'https://decrypt.co/feed'], ['Blockworks', 'https://blockworks.co/feed'], ['The Block', 'https://www.theblock.co/rss.xml']])
        tasks.push({ id: `rss:${name}`, kind: 'editorial', run: async () => { const xml = await getText(url); if (!/<rss[\s>]|<feed[\s>]/i.test(xml))
                throw new Error('Flux RSS indisponibil'); return parseRss(xml, name); } });
    const hub = process.env.RADAR_FARCASTER_HUB_URL;
    if (hub) {
        for (const channel of ['base', 'solana'])
            tasks.push({ id: `farcaster:${channel}`, kind: 'social', run: async () => {
                    const endpoint = new URL(hub);
                    if (endpoint.protocol !== 'https:')
                        throw new Error('HTTPS Snapchain endpoint required');
                    const data = await fetchJson(`${hub.replace(/\/$/, '')}/v1/castsByParent?${new URLSearchParams({ url: `https://warpcast.com/~/channel/${channel}`, pageSize: '100', reverse: 'true' })}`);
                    if (!Array.isArray(data.messages))
                        throw new Error('Invalid Snapchain response');
                    return data.messages.filter((m: any) => m.data?.castAddBody?.text).map((m: any) => ({ id: id(m.hash), source: 'Farcaster', kind: 'social', author: String(m.data.fid), text: m.data.castAddBody.text.slice(0, 1800), url: `https://farcaster.xyz/~/conversations/${m.hash}`, timestamp: (1609459200 + m.data.timestamp) * 1000, engagement: null }));
                } });
    }
    else
        sources.push({ id: 'farcaster', kind: 'social', status: 'not_configured', items: 0, checkedAt: Date.now(), detail: 'Adaptor pregătit; necesită endpoint Snapchain HTTPS accesibil. Niciun serviciu plătit activat.' });
    tasks.push({ id: 'coingecko:search-interest', kind: 'attention', run: async () => { const data = await fetchJson('https://api.coingecko.com/api/v3/search/trending'); if (!Array.isArray(data.coins))
            throw new Error('Invalid trending response'); for (const c of data.coins)
            if (c.item?.id)
                trending.add(c.item.id); return []; } });
    // Bounded concurrency, independent failures, observed counts rather than fabricated zeros.
    for (let i = 0; i < tasks.length; i += 4)
        await Promise.all(tasks.slice(i, i + 4).map(async (t) => {
            try {
                const rows = dedupePosts(await t.run());
                posts.push(...rows);
                sources.push({ id: t.id, kind: t.kind, status: 'ok', items: t.kind === 'attention' ? trending.size : rows.length, checkedAt: Date.now(), detail: t.kind === 'editorial' ? 'Titluri editoriale; nu participanți comunitari' : t.id.startsWith('telegram:') ? 'Postări canal public; autorul reprezintă canalul, nu membrii' : 'Eșantion public; acoperire limitată' });
            }
            catch (e) {
                sources.push({ id: t.id, kind: t.kind, status: 'unavailable', items: 0, checkedAt: Date.now(), detail: (e as Error).message });
            }
        }));
    return { posts: dedupePosts(posts), sources, trending };
}
