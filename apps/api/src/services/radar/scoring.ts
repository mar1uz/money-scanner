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
    if (!p.id || !p.author || !Number.isFinite(p.timestamp) || !/^https:\/\//.test(p.url) || p.timestamp > now + 60_000 || p.timestamp < now - 86_400_000) return false;
    const text = p.text.toLowerCase().replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();
    if (text.length < 12 || urls.has(p.url) || texts.has(text)) return false;
    urls.add(p.url); texts.add(text); return true;
  }).sort((a,b) => b.timestamp-a.timestamp).slice(0,1500);
}
export function socialEvidence(token: RadarToken, all: RadarToken[], posts: RadarPost[], trending: Set<string>, available: boolean): RadarSocialEvidence {
  const chainHint = new RegExp(`\\b${escape(token.chain)}\\b`, 'i');
  const strong: {post: RadarPost; match: string}[] = []; let weak = 0;
  for (const post of posts) {
    const text = post.text;
    const contracts = token.chain === 'solana' ? text.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/g) || [] : text.match(/0x[a-fA-F0-9]{40}(?![a-fA-F0-9])/g) || [];
    const exact = contracts.some(a => tokenId(token.chain,a) === token.id);
    const sameContractOtherChain = all.some(t => t.id !== token.id && t.address.toLowerCase() === token.address.toLowerCase());
    const channel = token.telegram && post.url.startsWith(`${token.telegram.replace(/\/$/,'')}/`);
    const named = token.name.length >= 5 && new RegExp(`(?:^|\\W)${escape(token.name)}(?:$|\\W)`,'i').test(text);
    const symbol = /^[A-Za-z0-9]{2,15}$/.test(token.symbol) && new RegExp(`\\$${escape(token.symbol)}(?![A-Za-z0-9])`,'i').test(text);
    const symbolCollision = all.some(t=>t.id!==token.id && t.chain===token.chain && t.symbol.toLowerCase()===token.symbol.toLowerCase());
    let match = '';
    if (exact && (!sameContractOtherChain || chainHint.test(text))) match='contract';
    else if (channel) match='project-channel';
    else if (chainHint.test(text) && named && !symbolCollision) match='name+chain';
    else if (chainHint.test(text) && symbol && !symbolCollision) match='cashtag+chain';
    if (match) strong.push({post,match}); else if (symbol || named) weak++;
  }
  const social = strong.filter(x=>x.post.kind==='social');
  const authors = new Set(social.filter(x=>x.post.source!=='Telegram').map(x=>`${x.post.source}:${x.post.author}`)).size;
  const channels = new Set(social.filter(x=>x.post.source==='Telegram').map(x=>x.post.author)).size;
  const platforms = new Set(social.map(x=>x.post.source)).size;
  const score = available ? Math.round(clamp(Math.min(authors,15)*4 + Math.min(channels,5)*3 + Math.min(platforms,3)*5 + Math.min(social.length,20)/2)) : null;
  return { mentions:social.length, authors,channels,platforms,editorialMentions:strong.length-social.length,weakMentions:weak,score,changeMentions:null,searchTrending:!!token.coinGeckoId && trending.has(token.coinGeckoId),examples:strong.slice(0,3).map(x=>({source:x.post.source,url:x.post.url,text:x.post.text.slice(0,180),match:x.match})) };
}
export function rankTokens(tokens: RadarToken[], posts: RadarPost[], trending: Set<string>, socialAvailable: boolean, previous: RadarSnapshot | null, baselines: RadarBaseline[]): RadarRow[] {
  const before=new Map(previous?.rows.map(r=>[r.id,r]) || []), baseline=new Map(baselines.map(b=>[b.id,b]));
  return tokens.filter(t=> t.marketCap !== null && t.marketCap >= 500_000 && t.price>0).map(t=>{
    const social=socialEvidence(t,tokens,posts,trending,socialAvailable);
    const prev=before.get(t.id), first=baseline.get(t.id);
    social.changeMentions=prev && social.score !== null && prev.social.score !== null ? social.mentions-prev.social.mentions : null;
    // Fixed weights across runs; missing social evidence contributes nothing and is visible.
    const liquidity = Math.min(30,Math.log10(1+(t.liquidity || 0)/1000)*10);
    const activity = Math.min(30,Math.log10(1+(t.volume24h || 0)/1000)*10);
    const participation = t.buyers24h !== null ? Math.min(20,Math.log10(1+t.buyers24h)*7) : 0;
    const acceleration=t.volume24h && t.volume1h!==null ? Math.min(20,Math.max(0,t.volume1h/(t.volume24h/24)-1)*5) : 0;
    const marketScore=Math.round(liquidity+activity+participation+acceleration);
    const reasons=[`Volum și lichiditate: pool principal`,social.score===null ? 'Surse sociale indisponibile' : `${social.authors} autori / ${social.channels} canale / ${social.mentions} mențiuni asociate`, 'Scor euristic; nu este un semnal de cumpărare'];
    if (t.liquidity!==null && t.liquidity<50_000) reasons.push('Lichiditate redusă');
    if (t.volume24h && t.liquidity && t.volume24h/t.liquidity>50) reasons.push('Rulaj/lichiditate ridicat — verificați volum artificial');
    return {...t,rank:0,rankChange:null,score:Math.round(marketScore*.7+(social.score||0)*.3),marketScore,firstReportedAt:first?.firstReportedAt??null,firstPrice:first?.firstPrice??null,changeFirst:percent(t.price,first?.firstPrice),previousPrice:prev?.price??null,changePrevious:percent(t.price,prev?.price),social,reasons};
  }).sort((a,b)=>b.score-a.score||(b.volume24h||0)-(a.volume24h||0)||a.id.localeCompare(b.id)).map((r,i)=>({...r,rank:i+1,rankChange:before.has(r.id)? before.get(r.id)!.rank-i-1:null}));
}
