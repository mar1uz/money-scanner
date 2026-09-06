import {
  buildRadarDigest, selectDigestScope, summarizeGoPlus, summarizeRugCheck,
  type DigestBoost, type DigestPortQuote, type DigestSecurity
} from '@money-scanner/notifications';
import type { RadarSnapshot } from '@money-scanner/shared';
import { RadarStore } from './radar/store.js';

export const RADAR_DIGEST_PORT = '0xafa57c4c5a72d36530c8e816ad6e9a5947941536';

type FetchJson = (url: string, timeoutMs: number) => Promise<any>;
const defaultFetchJson: FetchJson = async (url, timeoutMs) => {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'User-Agent': 'money-scanner/radar-digest' }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
};

export interface RadarDigestDeps {
  loadSnapshot?: () => Promise<RadarSnapshot | null>;
  fetchJson?: FetchJson;
  now?: Date;
}

const clockLabel = (d: Date | number) =>
  new Intl.DateTimeFormat('ro-RO', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
  }).format(new Date(d)).replace(',', '');

async function portQuote(fetchJson: FetchJson): Promise<DigestPortQuote | null> {
  const data = await fetchJson(
    `https://api.dexscreener.com/latest/dex/tokens/${RADAR_DIGEST_PORT}`, 20000);
  const pairs: any[] = data?.pairs || [];
  if (!pairs.length) return null;
  const eth = pairs.find(p => p?.quoteToken?.symbol === 'ETH') || pairs[0];
  return {
    priceUsd: eth?.priceUsd !== undefined ? Number(eth.priceUsd) : null,
    priceChange24h: eth?.priceChange?.h24 !== undefined ? Number(eth.priceChange.h24) : null,
    volume24h: eth?.volume?.h24 !== undefined ? Number(eth.volume.h24) : null,
    marketCap: eth?.marketCap !== undefined ? Number(eth.marketCap) : null,
    liquidityUsd: eth?.liquidity?.usd !== undefined ? Number(eth.liquidity.usd) : null
  };
}

async function securityMap(
  snapshot: RadarSnapshot, fetchJson: FetchJson
): Promise<Record<string, DigestSecurity>> {
  const { movers, micros } = selectDigestScope(snapshot);
  const scope = [...movers, ...micros];
  const sec: Record<string, DigestSecurity> = {};
  const solana = scope.filter(r => r.chain === 'solana' && r.address);
  const base = scope.filter(r => r.chain === 'base' && r.address);
  await Promise.allSettled(solana.map(async r => {
    const data = await fetchJson(`https://api.rugcheck.xyz/v1/tokens/${r.address}/report`, 15000);
    const risks: string[] = (data?.risks || []).map((x: any) => x?.name || '');
    sec[r.address.toLowerCase()] = summarizeRugCheck(risks);
  }));
  if (base.length) {
    const data = await fetchJson(
      `https://api.gopluslabs.io/api/v1/token_security/8453?contract_addresses=${
        base.map(r => r.address).join(',')}`, 20000).catch(() => null);
    const result = data?.result || {};
    for (const r of base) {
      const t = result[r.address.toLowerCase()];
      if (t) sec[r.address.toLowerCase()] = summarizeGoPlus(t);
    }
  }
  return sec;
}

async function topBoosts(fetchJson: FetchJson): Promise<DigestBoost[]> {
  const top: any[] = await fetchJson('https://api.dexscreener.com/token-boosts/top/v1', 20000);
  const addrs = (top || []).slice(0, 30).map(b => b?.tokenAddress).filter(Boolean);
  if (!addrs.length) return [];
  const data = await fetchJson(
    `https://api.dexscreener.com/latest/dex/tokens/${addrs.join(',')}`, 20000);
  const meta = new Map<string, { name: string; chain: string }>();
  for (const p of data?.pairs || []) {
    const bt = p?.baseToken;
    if (bt?.address && !meta.has(bt.address)) {
      meta.set(bt.address, { name: bt.symbol || bt.name || '?', chain: p.chainId || '?' });
    }
  }
  const out: DigestBoost[] = [];
  for (const b of top || []) {
    const m = meta.get(b?.tokenAddress);
    if (m && (m.chain === 'solana' || m.chain === 'base' || m.chain === 'robinhood')) {
      out.push({ chain: m.chain, name: m.name, address: b.tokenAddress });
    }
    if (out.length === 3) break;
  }
  return out;
}

/**
 * Rezumat Radar determinist (fara AI), acelasi schelet ca digestul AI.
 * Fiecare sursa externa e izolata in try/catch: esecul uneia nu pica digestul.
 */
export async function fetchRadarDigestText(deps: RadarDigestDeps = {}): Promise<string> {
  const loadSnapshot = deps.loadSnapshot || (() => new RadarStore().latest('report'));
  const fetchJson = deps.fetchJson || defaultFetchJson;
  const now = deps.now || new Date();
  const snapshot = await loadSnapshot().catch(() => null);
  if (!snapshot) {
    return 'RADAR-SCAN: snapshot indisponibil (eroare citire Firestore) — fara date inventate.';
  }
  const [port, security, boosts] = await Promise.all([
    portQuote(fetchJson).catch(() => null),
    securityMap(snapshot, fetchJson).catch(() => ({})),
    topBoosts(fetchJson).catch(() => [])
  ]);
  return buildRadarDigest({
    snapshot,
    nowLabel: clockLabel(now),
    snapshotLabel: clockLabel(snapshot.generatedAt),
    portAddress: RADAR_DIGEST_PORT,
    port,
    security,
    boosts
  });
}
