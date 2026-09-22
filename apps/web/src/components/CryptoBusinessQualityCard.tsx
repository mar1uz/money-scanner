import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  TrendingUp,
  Network,
  DollarSign,
  Users,
  AlertCircle,
  Loader2,
  Scale
} from 'lucide-react';
import type { CryptoFourCriteriaScan, CryptoFourCriteriaAsset, CryptoCriteriaStatus } from '../types.js';
import { fetchCryptoFourCriteriaScan } from '../services/api.js';
import { useLanguage } from '../i18n.js';

/* ─────────────────────────────────────────────────────────
   Lookup helper — exported for unit-testing without DOM
   ───────────────────────────────────────────────────────── */

export function findAssetInScan(
  scan: CryptoFourCriteriaScan | null | undefined,
  coinGeckoId: string | undefined,
  symbol: string
): CryptoFourCriteriaAsset | null {
  if (!scan?.assets?.length) return null;

  // 1. Match by CoinGecko ID (highest confidence)
  if (coinGeckoId) {
    const byId = scan.assets.find(
      a => a.coinGeckoId?.toLowerCase() === coinGeckoId.toLowerCase() ||
           a.id?.toLowerCase() === coinGeckoId.toLowerCase()
    );
    if (byId) return byId;
  }

  // 2. Match by symbol ONLY if unambiguous (exactly 1 match)
  const normalizedSymbol = symbol.replace(/^[$#]/, '').toUpperCase();
  const symbolMatches = scan.assets.filter(
    a => a.symbol.toUpperCase() === normalizedSymbol
  );
  if (symbolMatches.length === 1) return symbolMatches[0];

  // Ambiguous or not found
  return null;
}

/* ─────────────────────────────────────────────────────────
   Status styling helpers
   ───────────────────────────────────────────────────────── */

const STATUS_STYLES: Record<CryptoCriteriaStatus, { bg: string; border: string; text: string; dot: string; icon: string }> = {
  pass:    { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-300', dot: 'bg-emerald-400', icon: 'text-emerald-400' },
  watch:   { bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   text: 'text-amber-300',   dot: 'bg-amber-400',   icon: 'text-amber-400' },
  fail:    { bg: 'bg-rose-500/10',    border: 'border-rose-500/30',    text: 'text-rose-300',    dot: 'bg-rose-400',    icon: 'text-rose-400' },
  unknown: { bg: 'bg-slate-500/10',   border: 'border-slate-500/30',   text: 'text-slate-400',   dot: 'bg-slate-500',   icon: 'text-slate-500' }
};

const STATUS_LABELS_RO: Record<CryptoCriteriaStatus, string> = {
  pass: 'Confirmat',
  watch: 'De urmărit',
  fail: 'Respins',
  unknown: 'Date insuficiente'
};

const STATUS_LABELS_EN: Record<CryptoCriteriaStatus, string> = {
  pass: 'Confirmed',
  watch: 'Watch',
  fail: 'Failed',
  unknown: 'Insufficient Data'
};

const CLASSIFICATION_LABELS_RO: Record<string, string> = {
  'all-four': '4/4 confirmat',
  'first-three': 'Primele 3 confirmate',
  'partial': 'Parțial',
  'insufficient-data': 'Date insuficiente'
};

const CLASSIFICATION_LABELS_EN: Record<string, string> = {
  'all-four': '4/4 confirmed',
  'first-three': 'First 3 confirmed',
  'partial': 'Partial',
  'insufficient-data': 'Insufficient Data'
};

const CRITERIA_ICONS: Record<string, React.ReactNode> = {
  growth: <TrendingUp className="w-3.5 h-3.5" />,
  networkEffect: <Network className="w-3.5 h-3.5" />,
  sustainableRevenue: <DollarSign className="w-3.5 h-3.5" />,
  holderValue: <Users className="w-3.5 h-3.5" />
};

const CRITERIA_ORDER = ['growth', 'networkEffect', 'sustainableRevenue', 'holderValue'] as const;

/* ─────────────────────────────────────────────────────────
   Component Props
   ───────────────────────────────────────────────────────── */

interface CryptoBusinessQualityCardProps {
  coinGeckoId?: string;
  symbol: string;
  marketClass?: string;
}

export const CryptoBusinessQualityCard: React.FC<CryptoBusinessQualityCardProps> = ({
  coinGeckoId,
  symbol,
  marketClass
}) => {
  const { language } = useLanguage();
  const [scan, setScan] = useState<CryptoFourCriteriaScan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const isRo = language === 'ro';
  const statusLabels = isRo ? STATUS_LABELS_RO : STATUS_LABELS_EN;
  const classLabels = isRo ? CLASSIFICATION_LABELS_RO : CLASSIFICATION_LABELS_EN;

  // Non-crypto → hide completely
  if (marketClass && marketClass !== 'crypto') return null;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchCryptoFourCriteriaScan(false)
      .then(data => { if (!cancelled) setScan(data); })
      .catch(err => { if (!cancelled) setError(err?.message || 'Network error'); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, []);

  const asset = findAssetInScan(scan, coinGeckoId, symbol);

  // ── Loading state ──
  if (loading) {
    return (
      <div className="p-4 rounded-[30px] bg-white/[0.02] border border-white/[0.06] flex items-center gap-3">
        <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
        <span className="text-xs text-slate-400 font-mono">
          {isRo ? 'Se verifică calitatea crypto…' : 'Checking crypto quality…'}
        </span>
      </div>
    );
  }

  // ── Error state — non-blocking ──
  if (error) {
    return (
      <div className="p-3.5 rounded-[30px] bg-rose-500/10 border border-rose-500/15 flex items-center gap-2.5">
        <AlertCircle className="w-4 h-4 text-rose-400/60 shrink-0" />
        <span className="text-xs text-slate-400 font-mono">
          {isRo ? 'Eroare la încărcarea datelor de calitate crypto' : 'Error loading crypto quality data'}
        </span>
      </div>
    );
  }

  // ── Asset not in Top 200 ──
  if (!asset) {
    const geckoUrl = coinGeckoId
      ? `https://www.coingecko.com/en/coins/${encodeURIComponent(coinGeckoId)}`
      : null;

    return (
      <div className="p-4 rounded-[30px] bg-white/[0.02] border border-white/[0.06] space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-slate-500/10 border border-slate-500/20">
            <ShieldCheck className="w-4 h-4 text-slate-500" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-400 font-mono">
              Crypto Business Quality · 4 Criteria
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {isRo
                ? 'Assetul nu are încă suficiente date în scannerul Top 200'
                : 'This asset does not yet have sufficient data in the Top 200 scanner'}
            </p>
          </div>
        </div>
        {geckoUrl && (
          <a
            href={geckoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[11px] text-cyan-400/70 hover:text-cyan-300 transition-colors font-mono"
          >
            {isRo ? 'Vezi pe CoinGecko' : 'View on CoinGecko'}
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    );
  }

  // ── Asset found — render full card ──
  const classificationStyle = asset.classification === 'all-four'
    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
    : asset.classification === 'first-three'
      ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
      : asset.classification === 'partial'
        ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
        : 'bg-slate-500/15 text-slate-400 border-slate-500/30';

  const generatedDate = scan?.generatedAt
    ? new Date(scan.generatedAt).toLocaleString(
        isRo ? 'ro-RO' : 'en-US',
        { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }
      )
    : null;

  // Valuation multiple (Marius, 2026-09-22): mcap / annualized revenue,
  // fees then holder revenue as basis fallback. Same number as the
  // MULTIPLE card in the ranking views.
  const valuationMultiple = (() => {
    const metrics = asset.metrics || {};
    const basis = (metrics.revenue30d || 0) > 0
      ? { annualized: metrics.revenue30d! * 12, ro: 'mcap / revenue anualizat (30z \u00d7 12)', en: 'mcap / annualized revenue (30d \u00d7 12)' }
      : (metrics.fees30d || 0) > 0
        ? { annualized: metrics.fees30d! * 12, ro: 'mcap / fees anualizate (30z \u00d7 12)', en: 'mcap / annualized fees (30d \u00d7 12)' }
        : (metrics.holdersRevenue30d || 0) > 0
          ? { annualized: metrics.holdersRevenue30d! * 12, ro: 'mcap / valoare holderi anualizat\u0103 (30z \u00d7 12)', en: 'mcap / annualized holder value (30d \u00d7 12)' }
          : null;
    if (!basis || asset.marketCap <= 0) return null;
    return { ratio: asset.marketCap / basis.annualized, label: isRo ? basis.ro : basis.en };
  })();

  return (
    <div className="rounded-[30px] bg-[var(--t-surface)] border border-cyan-500/20 shadow-lg overflow-hidden">
      {/* ── Compact Header (always visible) ── */}
      <button
        onClick={() => setExpanded(prev => !prev)}
        className="w-full p-4 sm:p-5 flex items-center justify-between gap-3 text-left hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-100 font-sans">
              Crypto Business Quality · 4 Criteria
            </h3>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className="text-xs font-mono text-cyan-300 font-bold">
                {asset.score} / 100
              </span>
              <span className="text-xs font-mono text-slate-400">
                {asset.passedCriteria}/4 {isRo ? 'criterii confirmate' : 'criteria confirmed'}
              </span>
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold border ${classificationStyle}`}>
                {classLabels[asset.classification] || asset.classification}
              </span>
            </div>
          </div>
        </div>
        <div className="shrink-0 text-slate-500">
          {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </div>
      </button>

      {/* ── Valuation multiple strip (Marius, 2026-09-22) ── */}
      {valuationMultiple && (
        <div className="mx-4 sm:mx-5 mb-3 -mt-1 flex flex-wrap items-center gap-2 rounded-xl border border-cyan-500/25 bg-cyan-500/[0.07] px-3 py-2">
          <Scale className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
          <span className="text-[10px] font-mono uppercase tracking-wide text-cyan-300">{isRo ? 'Multiplu' : 'Multiple'}</span>
          <span className="text-sm font-mono font-black text-cyan-100">{valuationMultiple.ratio.toFixed(1)}x</span>
          <span className="text-[9px] font-mono text-cyan-300/70">{valuationMultiple.label}</span>
        </div>
      )}


      {/* ── 4 Criteria Pills (always visible) ── */}
      <div className="px-4 sm:px-5 pb-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
        {CRITERIA_ORDER.map(key => {
          const criterion = asset.criteria[key];
          const style = STATUS_STYLES[criterion.status];
          return (
            <div
              key={key}
              className={`p-2.5 rounded-xl border ${style.bg} ${style.border} flex flex-col gap-1.5`}
            >
              <div className="flex items-center gap-1.5">
                <span className={style.icon}>{CRITERIA_ICONS[key]}</span>
                <span className={`text-[11px] font-mono font-semibold ${style.text}`}>
                  {criterion.label}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                <span className={`text-[10px] font-mono ${style.text} opacity-80`}>
                  {statusLabels[criterion.status]}
                </span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono leading-tight line-clamp-1">
                {criterion.value}
              </span>
            </div>
          );
        })}
      </div>

      {/* ── Expanded Details ── */}
      {expanded && (
        <div className="px-4 sm:px-5 pb-5 pt-1 space-y-4 border-t border-white/[0.05]">
          {/* Detailed criteria breakdown */}
          <div className="space-y-3">
            {CRITERIA_ORDER.map(key => {
              const criterion = asset.criteria[key];
              const style = STATUS_STYLES[criterion.status];
              return (
                <div
                  key={key}
                  className={`p-3.5 rounded-xl border ${style.bg} ${style.border} space-y-2`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={style.icon}>{CRITERIA_ICONS[key]}</span>
                      <span className={`text-xs font-mono font-bold ${style.text}`}>
                        {criterion.label}
                      </span>
                    </div>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold border ${style.bg} ${style.border} ${style.text}`}>
                      {statusLabels[criterion.status]}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 font-mono">
                    {criterion.value}
                  </p>
                  <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
                    {criterion.explanation}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Last verified + Sources */}
          <div className="space-y-2.5 pt-2 border-t border-white/[0.04]">
            {generatedDate && (
              <p className="text-[11px] text-slate-500 font-mono">
                {isRo ? 'Verificat ultima dată' : 'Last verified'}: {generatedDate}
              </p>
            )}

            {/* Sources */}
            {scan?.sources && scan.sources.length > 0 && (
              <div>
                <p className="text-[11px] text-slate-500 font-mono mb-1.5">
                  {isRo ? 'Surse de date' : 'Data sources'}:
                </p>
                <div className="flex flex-wrap gap-2">
                  {scan.sources.map((src, i) => (
                    <a
                      key={i}
                      href={src.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.03] border border-white/[0.06] text-[10px] font-mono text-slate-400 hover:text-cyan-300 hover:border-cyan-500/30 transition-colors"
                    >
                      {src.title || src.domain}
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Methodology */}
            {scan?.methodology && scan.methodology.length > 0 && (
              <details className="group">
                <summary className="text-[11px] text-slate-500 font-mono cursor-pointer hover:text-slate-300 transition-colors">
                  {isRo ? 'Metodologie' : 'Methodology'} ▸
                </summary>
                <ul className="mt-2 space-y-1.5 pl-2">
                  {scan.methodology.map((m, i) => (
                    <li key={i} className="text-[10px] text-slate-500 leading-relaxed flex items-start gap-1.5">
                      <span className="text-cyan-500/50 shrink-0 mt-0.5">•</span>
                      <span>{m}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {/* Disclaimer */}
            {scan?.disclaimer && (
              <p className="text-[10px] text-slate-600 leading-relaxed italic">
                {scan.disclaimer}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
