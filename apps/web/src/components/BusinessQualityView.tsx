import React, { useEffect, useState } from 'react';
import { Scale, RefreshCw, ExternalLink, Coins, Info } from 'lucide-react';
import { fetchCryptoFourCriteriaScan } from '../services/api.js';
import type { CryptoCriteriaStatus, CryptoFourCriteriaScan, CryptoUndervaluedEntry } from '@money-scanner/shared';
import { useLanguage } from '../i18n.js';
import { useAssetNavigation } from './AssetNavigation.js';
import { CryptoBqAssetCard } from './CryptoBqAssetCard.js';

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
  const navigateAsset = useAssetNavigation();
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

  const plChips = (entry: CryptoUndervaluedEntry) => {
    const items: Array<{ label: string; full: string; value?: number }> = [
      { label: '24H', full: isRo ? 'P/L ultimele 24 de ore' : 'P/L last 24 hours', value: entry.priceChange24h },
      { label: isRo ? '7Z' : '7D', full: isRo ? 'P/L ultimele 7 zile' : 'P/L last 7 days', value: entry.priceChange7d }
    ];
    return items
      .filter(item => item.value !== undefined && Number.isFinite(item.value))
      .map(item => {
        const value = item.value as number;
        const tone = value >= 0
          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
          : 'border-rose-500/40 bg-rose-500/10 text-rose-300';
        return (
          <span
            key={item.label}
            title={`${item.full}: ${value >= 0 ? '+' : ''}${value.toFixed(2)}%`}
            className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[8px] font-bold tracking-wide ${tone}`}
          >
            {item.label} {value >= 0 ? '+' : ''}{value.toFixed(1)}%
          </span>
        );
      });
  };

  const methodology = isRo ? (scan?.methodology || []) : [
    '4x200 score: each rubric with complete data is worth 25 points; missing or incomplete data scores 0. No minimum performance thresholds apply.',
    'Growth: requires a 7-day TVL change or a computable fee acceleration (7d run-rate versus 30d).',
    'Network effect: pass only with 30d fees ≥ $100K AND TVL ≥ $10M; watch when below-threshold usage exists. A proxy, not exact active users.',
    'Sustainable revenue: requires a complete 30d revenue observation; for L1 networks (BTC, ETH, SOL) network fees are used.',
    'Holder value: requires complete reporting of buyback/burn, distributions or revenue-funded staking AND value > $0 over 30d; reported zero does not pass the criterion.',
    'Undervaluation model (Business Quality tab): quality score 0-75 = data completeness for Network Effect + Sustainable Revenue + Holder Value.',
    'Undervalued order (v9): purely by P/R, cheapest first; 3/4 and 4/4 criteria are treated the same (criteria stay displayed, they no longer sort). Index and quality decide only ties.',
    'Top Score (v9): fundamental score = 10 x log10(30d revenue) - 10 x log10(P/R); one decade more revenue is worth as much as a 10x lower P/R. Eligible only with 30d revenue ≥ $100K, market cap ≥ $10M and at least 3/4 criteria (3/4 and 4/4 treated the same, with or without TVL). Criteria do not sort (ties only).',
    'Valuation: P/R = market cap / (30d revenue x 365/30); fallback P/H from annualized buyback/burn when revenue is missing. Fees-only assets (no revenue/holder data) are excluded from the Undervalued ranking - P/F does not measure value capture.',
    'Undervalued eligibility (hard filter, v10): complete 30d fees ≥ $100K AND market cap ≥ $10M AND TVL ≥ $10M. Absent TVL is not the same as small TVL: when DefiLlama has no TVL at all for the asset (launchpads, apps, chains where TVL does not apply), the filter passes on fees alone; when TVL exists but is below $10M, the asset is not ranked. v11: at least 3/4 criteria (3/4 and 4/4 treated the same) and no stablecoins (USDT, USDC, RLUSD, DAI etc. - P/R is meaningless for a $1-pegged token).',
    'Undervaluation index = quality percentile - expensiveness percentile (log P/R) among assets on the same basis (revenue/holders), with midranks for ties; shown as information and used only on P/R ties.',
    'Holder yield: (30d holders revenue x 365/30) / MC x 100; the /FDV variant includes dilution. Extrapolated rate, not a guaranteed APY.',
    'Section selection (the 4-criteria view in AI Briefing): only coins with observable fees/revenue or reported buyback/burn are listed; sorted by criteria passed, then the size factor (log10 of 30d revenue; holder distributions count as revenue and fees are a fallback only when revenue data is completely missing), then revenue pace (7d vs 30d) and rank.'
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
                  ? 'Sortare de la cea mai subevaluată la cea mai supraevaluată, după Efect de rețea, Venit sustenabil și Valoare către holderi. Eligibile cu fees 30z complete ≥ $100K, market cap ≥ $10M și minim 3/4 criterii; fără stablecoins; pragul TVL ≥ $10M se aplică doar când DefiLlama raportează TVL.'
                  : 'Sorted from most undervalued to most overvalued, by Network Effect, Sustainable Revenue and Holder Value. Eligible with complete 30d fees ≥ $100K, market cap ≥ $10M and at least 3/4 criteria; stablecoins excluded; the TVL ≥ $10M check applies only when DefiLlama reports TVL.'}
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
              ? 'Index subevaluare = percentila calității (scor 0-75 din cei 3 factori) minus percentila scumpirii (log P/R; fallback P/H din buyback). +100 = calitate maximă la preț minim; -100 = invers. Activele fără revenue/holderi (inclusiv cele doar pe fees) nu sunt clasate.'
              : 'Undervaluation index = quality percentile (0-75 score from the 3 factors) minus expensiveness percentile (log P/R; P/H from buyback as fallback). +100 = top quality at the lowest price; -100 = the opposite. Assets without revenue/holder data (including fees-only ones) are not ranked.'}
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
            <div className="bq-card-grid">
            {(scan.undervalued || []).slice(0, 100).map((entry, position) => {
              const asset = (scan.assets || []).find(a => a.id === entry.assetId || a.coinGeckoId === entry.assetId);
              if (!asset) return null;
              return (
                <CryptoBqAssetCard
                  key={entry.assetId}
                  rank={position + 1}
                  asset={asset}
                  undervalued={entry}
                  language={language}
                  onNavigate={target => navigateAsset({ symbol: target.symbol, marketClass: 'crypto', coinGeckoId: target.coinGeckoId })}
                />
              );
            })}
            </div>
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
