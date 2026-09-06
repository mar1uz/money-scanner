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

function isValidPercentage(val: unknown): val is number {
  return typeof val === 'number' && Number.isFinite(val) && val >= 0 && val <= 100;
}

export function getRadarSecurityStatus(row?: RadarSecurityInput | null): RadarSecurityStatus {
  const r = row ?? ({} as RadarSecurityInput);

  const hasHighRugScore =
    typeof r.rugScore === 'number' && Number.isFinite(r.rugScore) && r.rugScore > 500;

  const isDanger = Boolean(
    r.isHoneypot ||
    r.insidersDetected ||
    r.isBundled ||
    hasHighRugScore
  );

  if (isDanger) {
    const dangerReasons: string[] = [];
    if (r.isHoneypot) dangerReasons.push('Contract Honeypot detectat');
    if (r.insidersDetected && r.isBundled) dangerReasons.push('Lansare bundled și insideri');
    else if (r.insidersDetected) dangerReasons.push('Rețele / clustere de insideri detectate');
    else if (r.isBundled) dangerReasons.push('Lansare bundled suspectă');
    if (hasHighRugScore) {
      dangerReasons.push(`Scor risc audit ridicat (${r.rugScore})`);
    }

    const badgeLabel = r.isHoneypot
      ? '🚨 Honeypot'
      : (r.insidersDetected || r.isBundled)
      ? '🚨 Bundled/Insiders'
      : hasHighRugScore
      ? `🚨 Risc: ${r.rugScore}`
      : '🚨 Risc securitate';

    const holderText = isValidPercentage(r.top10HoldersPct)
      ? ` · Top 10 holderi: ${r.top10HoldersPct.toFixed(0)}%`
      : '';

    const reasonSummary = dangerReasons.length ? dangerReasons.join(', ') : 'Risc critic identificat';
    const title = `Pericol: ${reasonSummary}${holderText}`;

    return {
      level: 'danger',
      dotColorClass: 'bg-rose-500 ring-rose-500/30 shadow-sm shadow-rose-500/50',
      badgeColorClass: 'bg-rose-500/20 text-rose-400 border border-rose-500/30',
      badgeLabel,
      title,
      ariaLabel: r.name ? `Securitate ${r.name}: ${title}` : title,
    };
  }

  if (isValidPercentage(r.top10HoldersPct)) {
    const pctStr = `${r.top10HoldersPct.toFixed(0)}%`;
    if (r.top10HoldersPct > 50) {
      const title = `Atenție: Top 10 holderi dețin ${pctStr} din cantitate (concentrare ridicată)`;
      return {
        level: 'warning',
        dotColorClass: 'bg-amber-400 ring-amber-400/30 shadow-sm shadow-amber-400/50',
        badgeColorClass: 'bg-amber-400/15 text-amber-300 border border-amber-400/30',
        badgeLabel: `⚠️ Top 10: ${pctStr}`,
        title,
        ariaLabel: r.name ? `Securitate ${r.name}: ${title}` : title,
      };
    }

    const title = `Curat: Top 10 holderi dețin ${pctStr} din cantitate (securitate verificată)`;
    return {
      level: 'clean',
      dotColorClass: 'bg-emerald-400 ring-emerald-400/30 shadow-sm shadow-emerald-400/50',
      badgeColorClass: 'bg-emerald-400/15 text-emerald-300 border border-emerald-400/30',
      badgeLabel: `🛡️ Top 10: ${pctStr}`,
      title,
      ariaLabel: r.name ? `Securitate ${r.name}: ${title}` : title,
    };
  }

  const title = 'Audit securitate / holderi în curs de colectare';
  return {
    level: 'unknown',
    dotColorClass: 'bg-slate-500 ring-slate-500/30',
    badgeColorClass: 'text-slate-500 text-xs',
    badgeLabel: '—',
    title,
    ariaLabel: r.name ? `Securitate ${r.name}: ${title}` : title,
  };
}
