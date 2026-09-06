import type { RadarRow } from '@money-scanner/shared';

export type RadarSecurityLevel = 'clean' | 'warning' | 'danger' | 'unknown';

export interface RadarSecurityStatus {
  level: RadarSecurityLevel;
  dotColorClass: string;
  badgeColorClass: string;
  badgeLabel: string;
  title: string;
  ariaLabel: string;
}

export type RadarSecurityInput = Pick<
  RadarRow,
  'top10HoldersPct' | 'isBundled' | 'insidersDetected' | 'isHoneypot' | 'rugScore'
> & {
  name?: string;
};

export function getRadarSecurityStatus(row: RadarSecurityInput): RadarSecurityStatus {
  const isDanger = Boolean(
    row.isHoneypot ||
    row.insidersDetected ||
    row.isBundled ||
    (row.rugScore !== null && row.rugScore !== undefined && row.rugScore > 500)
  );

  if (isDanger) {
    const dangerReasons: string[] = [];
    if (row.isHoneypot) dangerReasons.push('Contract Honeypot detectat');
    if (row.insidersDetected && row.isBundled) dangerReasons.push('Lansare bundled și insideri');
    else if (row.insidersDetected) dangerReasons.push('Rețele / clustere de insideri detectate');
    else if (row.isBundled) dangerReasons.push('Lansare bundled suspectă');
    if (row.rugScore !== null && row.rugScore !== undefined && row.rugScore > 500) {
      dangerReasons.push(`Scor risc audit ridicat (${row.rugScore})`);
    }

    const badgeLabel = row.isHoneypot
      ? '🚨 Honeypot'
      : (row.insidersDetected || row.isBundled)
      ? '🚨 Bundled/Insiders'
      : row.rugScore !== null && row.rugScore !== undefined && row.rugScore > 500
      ? `🚨 Risc: ${row.rugScore}`
      : '🚨 Risc securitate';

    const holderText =
      row.top10HoldersPct !== null && row.top10HoldersPct !== undefined
        ? ` · Top 10 holderi: ${row.top10HoldersPct.toFixed(0)}%`
        : '';

    const reasonSummary = dangerReasons.length ? dangerReasons.join(', ') : 'Risc critic identificat';
    const title = `Pericol: ${reasonSummary}${holderText}`;

    return {
      level: 'danger',
      dotColorClass: 'bg-rose-500 ring-rose-500/30 shadow-sm shadow-rose-500/50',
      badgeColorClass: 'bg-rose-500/20 text-rose-400 border border-rose-500/30',
      badgeLabel,
      title,
      ariaLabel: row.name ? `Securitate ${row.name}: ${title}` : title,
    };
  }

  if (row.top10HoldersPct !== null && row.top10HoldersPct !== undefined) {
    if (row.top10HoldersPct > 50) {
      const pctStr = `${row.top10HoldersPct.toFixed(0)}%`;
      const title = `Atenție: Top 10 holderi dețin ${pctStr} din cantitate (concentrare ridicată)`;
      return {
        level: 'warning',
        dotColorClass: 'bg-amber-400 ring-amber-400/30 shadow-sm shadow-amber-400/50',
        badgeColorClass: 'bg-amber-400/15 text-amber-300 border border-amber-400/30',
        badgeLabel: `⚠️ Top 10: ${pctStr}`,
        title,
        ariaLabel: row.name ? `Securitate ${row.name}: ${title}` : title,
      };
    }

    const pctStr = `${row.top10HoldersPct.toFixed(0)}%`;
    const title = `Curat: Top 10 holderi dețin ${pctStr} din cantitate (securitate verificată)`;
    return {
      level: 'clean',
      dotColorClass: 'bg-emerald-400 ring-emerald-400/30 shadow-sm shadow-emerald-400/50',
      badgeColorClass: 'bg-emerald-400/15 text-emerald-300 border border-emerald-400/30',
      badgeLabel: `🛡️ Top 10: ${pctStr}`,
      title,
      ariaLabel: row.name ? `Securitate ${row.name}: ${title}` : title,
    };
  }

  const title = 'Audit securitate / holderi în curs de colectare';
  return {
    level: 'unknown',
    dotColorClass: 'bg-slate-500 ring-slate-500/30',
    badgeColorClass: 'text-slate-500 text-xs',
    badgeLabel: '—',
    title,
    ariaLabel: row.name ? `Securitate ${row.name}: ${title}` : title,
  };
}
