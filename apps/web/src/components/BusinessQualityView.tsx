import React, { useEffect, useState } from 'react';
import { Scale, RefreshCw, ExternalLink, Coins, Info } from 'lucide-react';
import { fetchCryptoFourCriteriaScan } from '../services/api.js';
import type { CryptoCriteriaStatus, CryptoFourCriteriaScan, CryptoUndervaluedEntry } from '@money-scanner/shared';
import { useLanguage } from '../i18n.js';

const statusTone = (status: CryptoCriteriaStatus): string =>
  status === 'pass'
    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
    : status === 'watch'
      ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
      : status === 'fail'
        ? 'border-rose-500/40 bg-rose-500/10 text-rose-300'
        : 'border-white/[0.08] bg-white/[0.02] text-slate-500';

const indexTone = (index: number): string =>
  index >= 25 ? 'text-emerald-300' : index >= 0 ? 'text-cyan-300' : index >= -25 ? 'text-amber-300' : 'text-rose-300';

const fmtUsd = (value?: number): string => {
  if (!value || !Number.isFinite(value)) return '—';
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${Math.round(value)}`;
};

export const BusinessQualityView: React.FC = () => {
  const { language } = useLanguage();
  const isRo = language === 'ro';
  const [scan, setScan] = useState<CryptoFourCriteriaScan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async (refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      setScan(await fetchCryptoFourCriteriaScan(refresh));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Scan failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const factorChips = (entry: CryptoUndervaluedEntry) => {
    const items: Array<{ label: string; full: string; status: CryptoCriteriaStatus }> = [
      { label: isRo ? 'REȚEA' : 'NETWORK', full: isRo ? 'Efect de rețea' : 'Network effect', status: entry.factorStatuses.networkEffect },
      { label: isRo ? 'VENIT' : 'REVENUE', full: isRo ? 'Venit sustenabil' : 'Sustainable revenue', status: entry.factorStatuses.sustainableRevenue },
      { label: isRo ? 'HOLDERI' : 'HOLDERS', full: isRo ? 'Valoare către holderi' : 'Holder value', status: entry.factorStatuses.holderValue }
    ];
    return items.map(item => (
      <span
        key={item.label}
        title={`${item.full}: ${item.status}`}
        className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[8px] font-bold tracking-wide ${statusTone(item.status)}`}
      >
        {item.label}
      </span>
    ));
  };

  const methodology = isRo ? (scan?.methodology || []) : [
    'Growth: 7-day TVL change or fee acceleration (7d run-rate versus 30d).',
    'Network effect: conservative proxy based on fees, TVL and multi-chain reach; it does not claim exact active users.',
    'Sustainable revenue: material revenue observed concurrently across 24h, 7d and 30d windows.',
    'Holder value: holder revenue reported as buyback/burn, direct distribution or revenue-funded staking.',
    'Undervaluation model: quality score 0-75 = Network Effect + Sustainable Revenue + Holder Value (same thresholds).',
    'Valuation: P/R = market cap / (30d revenue x 12); fallbacks P/F from fees and P/H from annualized buyback/burn when those are the only data.',
    'Undervaluation index = quality percentile minus expensiveness percentile (log P/R) across the covered universe. Assets without fees/revenue are not ranked.'
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-[30px] border border-amber-500/20 bg-[var(--t-surface)] p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300">
              <Scale className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100 font-sans">
                {isRo ? 'Calitate Business Crypto · 3 Factori' : 'Crypto Business Quality · 3 Factors'}
              </h2>
              <p className="text-[11px] text-slate-400 font-sans">
                {isRo
                  ? 'Sortare de la cea mai subevaluată la cea mai supraevaluată, după Efect de rețea, Venit sustenabil și Valoare către holderi.'
                  : 'Sorted from most undervalued to most overvalued, by Network Effect, Sustainable Revenue and Holder Value.'}
              </p>
            </div>
          </div>
          <button
            onClick={() => void load(true)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-2.5 py-1.5 text-[10px] font-semibold text-slate-300 hover:text-amber-200 disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            {isRo ? 'Rescanează' : 'Rescan'}
          </button>
        </div>

        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 flex items-start gap-2">
          <Info className="w-3.5 h-3.5 text-amber-300 shrink-0 mt-0.5" />
          <p className="text-[10px] leading-relaxed text-slate-400">
            {isRo
              ? 'Index subevaluare = percentila calității (scor 0-75 din cei 3 factori) minus percentila scumpirii (log P/R; fallback P/F din fees sau P/H din buyback). +100 = calitate maximă la preț minim; -100 = invers. Activele fără fees/revenue/buyback nu sunt clasate.'
              : 'Undervaluation index = quality percentile (0-75 score from the 3 factors) minus expensiveness percentile (log P/R; P/F from fees or P/H from buyback as fallback). +100 = top quality at the lowest price; -100 = the opposite. Assets without fees/revenue/buyback are not ranked.'}
          </p>
        </div>

        {scan && (
          <div className="grid grid-cols-3 gap-2.5">
            {[
              [isRo ? 'Clasate' : 'Ranked', scan.undervalued?.length ?? 0, 'text-emerald-300'],
              [isRo ? 'Neclasate' : 'Unranked', scan.unrankedCount ?? 0, 'text-slate-300'],
              [isRo ? 'Actualizat' : 'Updated', new Date(scan.generatedAt).toLocaleTimeString(isRo ? 'ro-RO' : 'en-GB', { hour: '2-digit', minute: '2-digit' }), 'text-cyan-300']
            ].map(([label, value, tone]) => (
              <div key={String(label)} className="rounded-xl border border-white/[0.07] bg-[var(--t-surface-raised)] p-3">
                <span className="block text-[9px] font-mono uppercase text-slate-600">{label}</span>
                <span className={`block mt-1 text-xl font-mono font-black ${tone}`}>{value}</span>
              </div>
            ))}
          </div>
        )}

        {loading && !scan && <p className="py-8 text-center text-xs text-slate-500">{isRo ? 'Se scanează top 200 crypto…' : 'Scanning top 200 crypto…'}</p>}
        {error && !scan && (
          <div className="py-6 text-center space-y-2">
            <p className="text-sm text-rose-300">{error}</p>
            <button onClick={() => void load(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 py-1.5 text-[10px] text-slate-300">
              <RefreshCw className="w-3 h-3" /> {isRo ? 'Reîncearcă' : 'Retry'}
            </button>
          </div>
        )}

        {scan && (
          <div className="space-y-2">
            {(scan.undervalued || []).slice(0, 100).map((entry, position) => (
              <article key={entry.assetId} className="rounded-xl border border-white/[0.07] bg-[var(--t-surface-raised)] p-3 sm:p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`w-7 text-center text-sm font-mono font-black ${position < 3 ? 'text-emerald-300' : 'text-slate-500'}`}>{position + 1}</span>
                    {entry.image ? <img src={entry.image} alt="" className="w-8 h-8 rounded-full bg-white/[0.04]" loading="lazy" /> : <Coins className="w-8 h-8 text-slate-600" />}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-100">${entry.symbol}</span>
                        <span className="text-[10px] font-mono text-slate-600">{entry.marketCapRank > 0 ? `#${entry.marketCapRank}` : ''}</span>
                        <span className="text-[10px] font-mono text-slate-600">{fmtUsd(entry.marketCap)}</span>
                      </div>
                      <span className="block text-[10px] text-slate-500 truncate">{entry.name}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`text-lg font-mono font-black ${indexTone(entry.undervaluationIndex)}`}>
                      {entry.undervaluationIndex > 0 ? '+' : ''}{entry.undervaluationIndex}
                    </span>
                    <span className="block text-[9px] font-mono text-slate-600">
                      {entry.valuationBasis === 'revenue' ? 'P/R' : entry.valuationBasis === 'fees' ? 'P/F' : 'P/H'} {entry.valuationRatio.toFixed(1)}x
                      {entry.valuationBasis === 'fees' && <span className="text-amber-400"> · fees</span>}
                      {entry.valuationBasis === 'holders' && <span className="text-purple-300"> · buyback</span>}
                    </span>
                  </div>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  {factorChips(entry)}
                  <span className="ml-auto text-[9px] font-mono text-slate-500">
                    {isRo ? 'calitate' : 'quality'} {entry.qualityScore}/75 · {isRo ? 'pct' : 'pct'} {entry.qualityPercentile} · {isRo ? 'ieftin' : 'cheap'} {100 - entry.expensivenessPercentile}%
                  </span>
                </div>
              </article>
            ))}
            {(scan.undervalued || []).length > 100 && (
              <p className="py-1 text-center text-[10px] text-slate-600">
                {isRo ? `Afișate 100 din ${(scan.undervalued || []).length} clasate` : `Showing 100 of ${(scan.undervalued || []).length} ranked`}
              </p>
            )}
            {scan.unrankedCount > 0 && (
              <p className="pt-1 text-center text-[10px] text-slate-600">
                {isRo
                  ? `${scan.unrankedCount} active neclasate: nu există fees/revenue/buyback observate pe DefiLlama, deci nu pot fi evaluate corect.`
                  : `${scan.unrankedCount} unranked assets: no fees/revenue/buyback observed on DefiLlama, so they cannot be scored honestly.`}
              </p>
            )}
          </div>
        )}

        {scan && (
          <>
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3 pt-2 border-t border-white/[0.06]">
              <div className="space-y-1">
                {methodology.map(item => <p key={item} className="text-[9px] text-slate-600 leading-relaxed">• {item}</p>)}
              </div>
              <div className="flex flex-wrap gap-1.5 lg:justify-end">
                {scan.sources.map(source => (
                  <a key={source.id} href={source.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-md border border-white/[0.06] px-2 py-1 text-[9px] text-slate-500 hover:text-cyan-300">
                    <ExternalLink className="w-2.5 h-2.5" />{source.domain}
                  </a>
                ))}
              </div>
            </div>
            <p className="text-[9px] text-slate-600">
              {isRo
                ? scan.disclaimer
                : 'Fundamental research scanner, not a buy signal. A pass means the current proxy threshold is met, and the undervaluation index is a percentile-based heuristic, not a fair-value estimate.'}
            </p>
          </>
        )}
      </div>
    </div>
  );
};
