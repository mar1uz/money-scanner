import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  TrendingUp,
  DollarSign,
  Banknote,
  Scale,
  Sparkles,
  Award,
  AlertCircle,
  Loader2,
  PieChart
} from 'lucide-react';
import type {
  StockBusinessQualityScan,
  StockBusinessQualityAsset,
  StockCriteriaStatus
} from '../types.js';
import { fetchStockBusinessQualityScan } from '../services/api.js';
import { useLanguage } from '../i18n.js';

/* ─────────────────────────────────────────────────────────
   Lookup helper — exported for unit-testing without DOM
   ───────────────────────────────────────────────────────── */

export function findStockInScan(
  scan: StockBusinessQualityScan | null | undefined,
  symbol: string
): StockBusinessQualityAsset | null {
  if (!scan?.assets?.length || !symbol) return null;

  const normalizedSymbol = symbol.replace(/^[$#]/, '').trim().toUpperCase();
  const exactMatch = scan.assets.find(
    a => a.symbol.toUpperCase() === normalizedSymbol || a.id.toUpperCase() === normalizedSymbol
  );
  if (exactMatch) return exactMatch;

  return null;
}

/* ─────────────────────────────────────────────────────────
   Status styling helpers
   ───────────────────────────────────────────────────────── */

const STATUS_STYLES: Record<StockCriteriaStatus, { bg: string; border: string; text: string; dot: string; icon: string }> = {
  pass:    { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-300', dot: 'bg-emerald-400', icon: 'text-emerald-400' },
  watch:   { bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   text: 'text-amber-300',   dot: 'bg-amber-400',   icon: 'text-amber-400' },
  fail:    { bg: 'bg-rose-500/10',    border: 'border-rose-500/30',    text: 'text-rose-300',    dot: 'bg-rose-400',    icon: 'text-rose-400' },
  unknown: { bg: 'bg-slate-500/10',   border: 'border-slate-500/30',   text: 'text-slate-400',   dot: 'bg-slate-500',   icon: 'text-slate-500' }
};

const STATUS_LABELS_RO: Record<StockCriteriaStatus, string> = {
  pass: 'Confirmat',
  watch: 'De urmărit',
  fail: 'Respins',
  unknown: 'Date insuficiente'
};

const STATUS_LABELS_EN: Record<StockCriteriaStatus, string> = {
  pass: 'Confirmed',
  watch: 'Watch',
  fail: 'Failed',
  unknown: 'Insufficient Data'
};

const VERDICT_STYLES: Record<string, string> = {
  'Top AI Pick': 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  'Solid Quality': 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  'Watchlist': 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  'High Risk': 'bg-rose-500/15 text-rose-300 border-rose-500/30'
};

const CRITERIA_ICONS: Record<string, React.ReactNode> = {
  profitability: <DollarSign className="w-3.5 h-3.5" />,
  capitalEfficiency: <TrendingUp className="w-3.5 h-3.5" />,
  growth: <Sparkles className="w-3.5 h-3.5" />,
  solvency: <ShieldCheck className="w-3.5 h-3.5" />,
  freeCashFlow: <Banknote className="w-3.5 h-3.5" />,
  valuation: <Scale className="w-3.5 h-3.5" />
};

const CRITERIA_ORDER = [
  'profitability',
  'capitalEfficiency',
  'growth',
  'solvency',
  'freeCashFlow',
  'valuation'
] as const;

/* ─────────────────────────────────────────────────────────
   Component Props
   ───────────────────────────────────────────────────────── */

interface StockBusinessQualityCardProps {
  symbol: string;
  marketClass?: string;
}

export const StockBusinessQualityCard: React.FC<StockBusinessQualityCardProps> = ({
  symbol,
  marketClass
}) => {
  const { language } = useLanguage();
  const [scan, setScan] = useState<StockBusinessQualityScan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const isRo = language === 'ro';
  const statusLabels = isRo ? STATUS_LABELS_RO : STATUS_LABELS_EN;

  // Non-stock → hide completely
  if (marketClass && marketClass !== 'stocks') return null;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchStockBusinessQualityScan(false)
      .then(data => { if (!cancelled) setScan(data); })
      .catch(err => { if (!cancelled) setError(err?.message || 'Network error'); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, []);

  const asset = findStockInScan(scan, symbol);

  // ── Loading state ──
  if (loading) {
    return (
      <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] flex items-center gap-3">
        <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
        <span className="text-xs text-slate-400 font-mono">
          {isRo ? 'Se evaluează profitabilitatea și calitatea acțiunii…' : 'Evaluating stock profitability and business quality…'}
        </span>
      </div>
    );
  }

  // ── Error state — non-blocking ──
  if (error) {
    return (
      <div className="p-3.5 rounded-2xl bg-rose-950/10 border border-rose-500/15 flex items-center gap-2.5">
        <AlertCircle className="w-4 h-4 text-rose-400/60 shrink-0" />
        <span className="text-xs text-slate-400 font-mono">
          {isRo ? 'Eroare la încărcarea datelor de calitate a acțiunilor' : 'Error loading stock quality data'}
        </span>
      </div>
    );
  }

  // ── Asset not in Stock universe ──
  if (!asset) {
    const cleanSym = symbol.replace(/^[$#]/, '').toUpperCase();
    const yahooUrl = `https://finance.yahoo.com/quote/${encodeURIComponent(cleanSym)}`;

    return (
      <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-slate-500/10 border border-slate-500/20">
            <ShieldCheck className="w-4 h-4 text-slate-500" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-400 font-mono">
              Stock Business Quality & Profitability
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {isRo
                ? 'Acțiunea nu are încă suficiente date financiare în scannerul fundamental'
                : 'This stock does not yet have sufficient financial data in the fundamental scanner'}
            </p>
          </div>
        </div>
        <a
          href={yahooUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[11px] text-purple-400/80 hover:text-purple-300 transition-colors font-mono"
        >
          {isRo ? 'Vezi pe Yahoo Finance' : 'View on Yahoo Finance'}
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    );
  }

  // ── Asset found — render full card ──
  const verdictStyle = VERDICT_STYLES[asset.aiVerdict] || 'bg-slate-500/15 text-slate-400 border-slate-500/30';
  const verdictLabel = isRo ? asset.aiVerdictLabelRo : asset.aiVerdict;

  const generatedDate = scan?.generatedAt
    ? new Date(scan.generatedAt).toLocaleString(
        isRo ? 'ro-RO' : 'en-US',
        { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }
      )
    : null;

  return (
    <div className="rounded-2xl bg-gradient-to-b from-[#161B24] via-[#12151A] to-[#0D1015] border border-purple-500/25 shadow-lg overflow-hidden">
      {/* ── Compact Header (always visible) ── */}
      <button
        onClick={() => setExpanded(prev => !prev)}
        className="w-full p-4 sm:p-5 flex items-center justify-between gap-3 text-left hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-2 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-300 shrink-0">
            <Award className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-100 font-sans">
                Stock Business Quality & Profitability
              </h3>
              {asset.sector && (
                <span className="hidden sm:inline px-2 py-0.5 rounded-full text-[9px] font-mono bg-white/[0.04] border border-white/[0.08] text-slate-400">
                  {asset.sector}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className="text-xs font-mono text-purple-300 font-black">
                {asset.score} / 100
              </span>
              <span className="text-xs font-mono text-slate-400">
                {asset.passedCriteria}/6 {isRo ? 'criterii confirmate' : 'criteria confirmed'}
              </span>
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold border ${verdictStyle}`}>
                {verdictLabel}
              </span>
            </div>
          </div>
        </div>
        <div className="shrink-0 text-slate-500">
          {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </div>
      </button>

      {/* ── 6 Criteria Pills (always visible) ── */}
      <div className="px-4 sm:px-5 pb-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
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
                <span className={`text-[10px] font-mono font-semibold truncate ${style.text}`}>
                  {criterion.label}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                <span className={`text-[9px] font-mono ${style.text} opacity-85`}>
                  {statusLabels[criterion.status]}
                </span>
              </div>
              <span className="text-[10px] text-slate-300 font-mono leading-tight line-clamp-1">
                {criterion.value}
              </span>
            </div>
          );
        })}
      </div>

      {/* ── Expanded Details ── */}
      {expanded && (
        <div className="px-4 sm:px-5 pb-5 pt-2 space-y-4 border-t border-white/[0.06]">
          {/* AI Thesis */}
          <div className="p-3.5 rounded-xl bg-purple-500/[0.07] border border-purple-500/20">
            <div className="flex items-center gap-2 mb-1.5">
              <Sparkles className="w-3.5 h-3.5 text-purple-300" />
              <span className="text-xs font-mono font-bold text-purple-200 uppercase tracking-wide">
                {isRo ? 'Teză Calitativă AI & Profitabilitate' : 'AI Qualitative & Profitability Thesis'}
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              {asset.aiThesis}
            </p>
          </div>

          {/* Key Financial Indicators Dashboard */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <PieChart className="w-3.5 h-3.5 text-cyan-300" />
              <span className="text-xs font-mono font-bold text-slate-200 uppercase tracking-wide">
                {isRo ? 'Indicatori Financiari Cheie' : 'Key Financial Indicators'}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label: isRo ? 'Marjă Netă' : 'Net Margin', val: asset.metrics.netMargin !== undefined ? `${asset.metrics.netMargin.toFixed(1)}%` : 'N/A', tone: (asset.metrics.netMargin || 0) >= 15 ? 'text-emerald-300' : 'text-slate-200' },
                { label: isRo ? 'Marjă Operațională' : 'Operating Margin', val: asset.metrics.operatingMargin !== undefined ? `${asset.metrics.operatingMargin.toFixed(1)}%` : 'N/A', tone: (asset.metrics.operatingMargin || 0) >= 20 ? 'text-emerald-300' : 'text-slate-200' },
                { label: 'ROE (Return on Equity)', val: asset.metrics.roe !== undefined ? `${asset.metrics.roe.toFixed(1)}%` : 'N/A', tone: (asset.metrics.roe || 0) >= 20 ? 'text-emerald-300' : 'text-slate-200' },
                { label: isRo ? 'Creștere Venituri YoY' : 'Rev Growth YoY', val: asset.metrics.revenueGrowthYoY !== undefined ? `${asset.metrics.revenueGrowthYoY >= 0 ? '+' : ''}${asset.metrics.revenueGrowthYoY.toFixed(1)}%` : 'N/A', tone: (asset.metrics.revenueGrowthYoY || 0) >= 10 ? 'text-emerald-300' : 'text-slate-200' },
                { label: 'Free Cash Flow (FCF)', val: asset.metrics.freeCashFlow ? `$${(asset.metrics.freeCashFlow / 1e9).toFixed(1)}B` : 'N/A', tone: (asset.metrics.freeCashFlow || 0) > 0 ? 'text-emerald-300' : 'text-rose-300' },
                { label: 'Debt / Equity', val: asset.metrics.debtToEquity !== undefined ? asset.metrics.debtToEquity.toFixed(2) : 'N/A', tone: (asset.metrics.debtToEquity || 0) <= 1.0 ? 'text-emerald-300' : 'text-amber-300' },
                { label: 'Forward P/E', val: asset.metrics.forwardPE !== undefined ? `${asset.metrics.forwardPE.toFixed(1)}x` : 'N/A', tone: 'text-slate-200' },
                { label: 'PEG Ratio', val: asset.metrics.pegRatio !== undefined ? asset.metrics.pegRatio.toFixed(2) : 'N/A', tone: (asset.metrics.pegRatio || 0) <= 2.0 ? 'text-emerald-300' : 'text-amber-300' }
              ].map((item, idx) => (
                <div key={idx} className="p-2 rounded-lg bg-black/20 border border-white/[0.06]">
                  <span className="block text-[9px] font-mono text-slate-500 uppercase">{item.label}</span>
                  <span className={`block mt-0.5 text-xs font-mono font-bold ${item.tone}`}>{item.val}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Detailed Criteria Breakdown */}
          <div className="space-y-2.5">
            {CRITERIA_ORDER.map(key => {
              const criterion = asset.criteria[key];
              const style = STATUS_STYLES[criterion.status];
              return (
                <div
                  key={key}
                  className={`p-3 rounded-xl border ${style.bg} ${style.border} space-y-1.5`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={style.icon}>{CRITERIA_ICONS[key]}</span>
                      <span className={`text-xs font-mono font-bold ${style.text}`}>
                        {criterion.label}
                      </span>
                    </div>
                    <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border ${style.bg} ${style.border} ${style.text}`}>
                      {statusLabels[criterion.status]}
                    </span>
                  </div>
                  <div className="text-xs font-mono text-slate-200">
                    {criterion.value}
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    {criterion.explanation}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Methodology & Sources Footer */}
          <div className="pt-3 border-t border-white/[0.06] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 text-[10px] text-slate-500 font-mono">
            <div>
              {generatedDate && (
                <span>
                  {isRo ? 'Ultima verificare:' : 'Last verified:'} {generatedDate}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <a
                href={`https://finance.yahoo.com/quote/${encodeURIComponent(asset.symbol)}/key-statistics`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-purple-400/80 hover:text-purple-300 transition-colors"
              >
                <span>Yahoo Finance</span>
                <ExternalLink className="w-3 h-3" />
              </a>
              <a
                href={`https://www.sec.gov/edgar/searchedgar/companysearch`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-purple-400/80 hover:text-purple-300 transition-colors"
              >
                <span>SEC EDGAR</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
