import React, { useEffect, useState } from 'react';
import { requestAskAiAnalysis } from '../services/api.js';

/** Acknowledges only that Firestore saved the request, not that analysis was sent. */
export const AskAiButton: React.FC<{
  symbol: string;
  marketClass: 'crypto' | 'stocks' | 'metals';
  coinGeckoId?: string;
  className?: string;
  /** chip: compact button used on cards. row: full-width line inside the asset link menu. */
  variant?: 'chip' | 'row';
}> = ({ symbol, marketClass, coinGeckoId, className = '', variant = 'chip' }) => {
  const [state, setState] = useState<'idle' | 'pending' | 'queued' | 'error'>('idle');
  useEffect(() => { setState('idle'); }, [symbol, marketClass, coinGeckoId]);
  const submit = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (state === 'pending' || state === 'queued') return;
    setState('pending');
    try { await requestAskAiAnalysis({ symbol, marketClass, coinGeckoId }); setState('queued'); }
    catch { setState('error'); }
  };
  const row = variant === 'row';
  return <span className={row ? 'block border-b border-[var(--t-line)] last:border-b-0' : 'inline-flex flex-wrap items-center gap-1.5'} onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
    <button type="button" onClick={event => void submit(event)} disabled={state === 'pending' || state === 'queued'} className={row
      ? `flex h-11 w-full min-h-0 items-center justify-between gap-3 bg-transparent px-3 text-left text-sm font-semibold text-[var(--t-text)] disabled:opacity-60 ${className}`
      : `rounded-lg border border-violet-500/30 bg-violet-500/[0.08] px-2.5 py-1.5 text-[11px] font-bold text-violet-200 disabled:opacity-60 ${className}`}>
      <span>Ask AI</span>
      {row && state === 'pending' && <span role="status" className="text-xs font-medium text-[var(--t-muted)]">Se înregistrează…</span>}
      {row && state === 'queued' && <span role="status" className="text-xs font-medium text-emerald-300">Cerere înregistrată · analiza va veni pe WhatsApp</span>}
      {row && state === 'error' && <span role="alert" className="text-xs font-medium text-rose-300">Nu am înregistrat cererea. Reîncearcă.</span>}
    </button>
    {!row && state === 'pending' && <span role="status" className="text-[10px] text-slate-400">Se înregistrează…</span>}
    {!row && state === 'queued' && <span role="status" className="text-[10px] text-emerald-300">Cerere înregistrată · analiza va veni pe WhatsApp</span>}
    {!row && state === 'error' && <span role="alert" className="text-[10px] text-rose-300">Nu am înregistrat cererea. Reîncearcă.</span>}
  </span>;
};
