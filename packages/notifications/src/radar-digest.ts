import type { RadarChain, RadarRow, RadarSnapshot } from '@money-scanner/shared';

export type DigestSemaphore = 'green' | 'yellow' | 'red';
export interface DigestSecurity { level: DigestSemaphore; reason: string; }
export interface DigestBoost { chain: RadarChain; name: string; address: string; }
export interface DigestPortQuote {
  priceUsd: number | null;
  priceChange24h: number | null;
  volume24h: number | null;
  marketCap: number | null;
  liquidityUsd: number | null;
}
export interface RadarDigestInput {
  snapshot: RadarSnapshot;
  /** Ora afisata in titlu, formata de apelant (ex '2026-09-06 22:20'). */
  nowLabel: string;
  /** Eticheta generarii snapshotului, formata de apelant (ex '14:00'). */
  snapshotLabel: string;
  portAddress: string;
  port?: DigestPortQuote | null;
  /** Cheie = adresa lowercase. Lipsa = 🟡 neverificat. */
  security?: Record<string, DigestSecurity>;
  boosts?: DigestBoost[];
  fomoBase?: string;
}

const SEM: Record<DigestSemaphore, string> = { green: '🟢', yellow: '🟡', red: '🔴' };
const PORT_ADDRESS_DEFAULT = '0xafa57c4c5a72d36530c8e816ad6e9a5947941536';
const FOMO_DEFAULT = 'https://fomo.family/tokens';

const esc = (s: string) => s.replace(/([_*[\]`])/g, '\\$1');
const dexLink = (chain: RadarChain, address: string, name: string) =>
  `[${esc(name)}](https://dexscreener.com/${chain}/${address})`;

export const fmtPrice = (p: number | null): string => {
  if (p === null || !isFinite(p)) return '?';
  if (p === 0) return '$0';
  if (p >= 1) return `$${p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
  return `$${parseFloat(p.toPrecision(3))}`;
};

export const fmtMoney = (v: number | null): string => {
  if (v === null || !isFinite(v)) return '?';
  const a = Math.abs(v);
  if (a >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000) return `$${(v / 1_000).toFixed(0)}k`;
  return `$${v.toFixed(0)}`;
};

const short = (chg: number | null) => (chg === null ? '?' : `${chg >= 0 ? '+' : ''}${chg.toFixed(1)}%`);

export interface DigestScope { movers: RadarRow[]; micros: RadarRow[]; }

/** Randurile care intra in digest: MISCARI (|changeFirst| > 10%, max 6, desc) + MICROCAPS (max 5). */
export function selectDigestScope(snapshot: RadarSnapshot): DigestScope {
  const rows = snapshot.rows || [];
  return {
    movers: rows
      .filter(r => r.changeFirst !== null && Math.abs(r.changeFirst) > 10)
      .sort((a, b) => (b.changeFirst || 0) - (a.changeFirst || 0))
      .slice(0, 6),
    micros: (snapshot.microcaps || []).slice(0, 5)
  };
}

const secOf = (security: Record<string, DigestSecurity> | undefined, address: string): DigestSecurity =>
  security?.[address.toLowerCase()] || { level: 'yellow', reason: 'neverificat' };

const RISK_TOKENS: Array<[RegExp, string]> = [
  [/honeypot/i, 'honeypot'],
  [/mint/i, 'mint'],
  [/freeze/i, 'freeze'],
  [/control/i, 'control'],
  [/lp.*unlock|unlock.*lp/i, 'LP neblocat'],
  [/single holder|concentration|top.?10/i, 'holders concentrati'],
  [/mutable|metadata/i, 'metadata'],
  [/rugged|rug history|creator.*rug/i, 'rug'],
  [/tax|fee/i, 'taxe'],
];

/** RugCheck risks[] -> semafor. Lista goala = verde. */
export function summarizeRugCheck(risks: string[]): DigestSecurity {
  if (!risks.length) return { level: 'green', reason: 'curat' };
  const hits = RISK_TOKENS.filter(([re]) => risks.some(r => re.test(r))).map(([, t]) => t);
  const uniq = [...new Set(hits)].slice(0, 2);
  return { level: 'red', reason: uniq.join('+') || 'risc' };
}

/** GoPlus token_security -> semafor. */
export function summarizeGoPlus(t: {
  is_honeypot?: string; is_mintable?: string; buy_tax?: string; sell_tax?: string;
}): DigestSecurity {
  if (t.is_honeypot === '1') return { level: 'red', reason: 'honeypot' };
  if (t.is_mintable === '1') return { level: 'red', reason: 'mint' };
  const tax = Math.max(parseFloat(t.buy_tax || '0') || 0, parseFloat(t.sell_tax || '0') || 0);
  if (tax >= 10) return { level: 'red', reason: `taxa ${tax}%` };
  if (tax > 0) return { level: 'yellow', reason: `taxa ${tax}%` };
  return { level: 'green', reason: 'curat' };
}

/**
 * Digest determinist, fara AI: acelasi schelet ca raportul AI (PORT / MISCARI /
 * MICROCAPS), dar fara X trending si fara confluente (limite declarate in text).
 * NICIO adresa vizibila in afara URL-urilor.
 */
export function buildRadarDigest(input: RadarDigestInput): string {
  const portAddr = (input.portAddress || PORT_ADDRESS_DEFAULT).trim();
  const fomo = input.fomoBase || FOMO_DEFAULT;
  const rows = input.snapshot.rows || [];
  const { movers, micros: micro } = selectDigestScope(input.snapshot);
  const boosts = (input.boosts || []).slice(0, 3);
  const portRow = rows.find(r => r.address.toLowerCase() === portAddr.toLowerCase());
  const q = input.port;
  const portLine = portRow
    ? `${dexLink(portRow.chain, portRow.address, portRow.symbol || portRow.name)} ` +
      `${fmtPrice(portRow.price)} | ${short(portRow.changeFirst)} | mcap ${fmtMoney(portRow.marketCap)}`
    : q
      ? `[PORT](https://dexscreener.com/robinhood/${portAddr}) ` +
        `${fmtPrice(q.priceUsd)} | ${short(q.priceChange24h)} | mcap ${fmtMoney(q.marketCap)} | vol ${fmtMoney(q.volume24h)}`
      : `[PORT](https://dexscreener.com/robinhood/${portAddr}) — cotatie indisponibila`;
  const portSec = secOf(input.security, portAddr);
  const lines: string[] = [
    `# RADAR-SCAN ${input.nowLabel} (script, fara AI)`,
    `Snapshot: ${input.snapshotLabel} · ${rows.length} randuri`,
    ``,
    `${portLine} | ${SEM[portSec.level]} ${portSec.reason}`,
    `[cumpara in FOMO](${fomo}/robinhood/${portAddr})`,
    ``,
    `*MISCARI (>10%):*`,
    ...movers.map(r => {
      const s = secOf(input.security, r.address);
      return `${dexLink(r.chain, r.address, r.symbol || r.name)} ${fmtPrice(r.price)} | ` +
        `${short(r.changeFirst)} | ${fmtMoney(r.marketCap)} | ${SEM[s.level]} ${s.reason}`;
    }),
    ...(movers.length ? [] : ['(niciuna)']),
    ``,
    `*MICROCAPS:*`,
    ...micro.map(r => {
      const s = secOf(input.security, r.address);
      return `${dexLink(r.chain, r.address, r.symbol || r.name)} ${fmtPrice(r.price)} | ` +
        `${fmtMoney(r.marketCap)} | ${SEM[s.level]} ${s.reason}`;
    }),
    ...(micro.length ? [] : ['(niciunul)']),
    ``,
    `*X:* indisponibil in modul script — /scan pentru trending + confluente AI`,
    `*CONFLUENTE:* indisponibil in modul script`,
  ];
  if (boosts.length) {
    lines.push(
      ``,
      `*Promovat (reclame platite):* ` +
        boosts.map(b => dexLink(b.chain, b.address, b.name)).join(' · '),
    );
  }
  return lines.join('\n');
}
