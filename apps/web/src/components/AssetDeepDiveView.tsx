import React, { useState, useEffect } from 'react';
import { AssetDetailResponse, Timeframe } from '../types.js';
import { fetchAssetDetail, triggerTestAlert } from '../services/api.js';
import { InteractiveChart } from './InteractiveChart.js';
import {
  ArrowLeft,
  Zap,
  BellRing,
  Sparkles,
  ExternalLink,
  Newspaper,
  Star,
  Layers,
  Compass,
  CheckCircle2,
  AlertTriangle,
  BadgeCheck,
  TrendingUp,
  Target,
  ShieldAlert,
  FileText,
  Lightbulb,
  Calendar,
  ChevronRight,
  TrendingDown,
  RefreshCw,
  Twitter
} from 'lucide-react';

interface AssetDeepDiveViewProps {
  symbol: string;
  marketClass?: string;
  timeframe: Timeframe;
  onTimeframeChange: (tf: Timeframe) => void;
  onBack: () => void;
  watchlist: string[];
  onToggleWatchlist: (symbol: string) => void;
}

type InfoTab = 'mtf' | 'ai' | 'social';

export const AssetDeepDiveView: React.FC<AssetDeepDiveViewProps> = ({
  symbol,
  marketClass,
  timeframe,
  onTimeframeChange,
  onBack,
  watchlist,
  onToggleWatchlist
}) => {
  const [data, setData] = useState<AssetDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [alertSent, setAlertSent] = useState(false);
  const [activeInfoTab, setActiveInfoTab] = useState<InfoTab>('mtf');
  const [showFlipTooltip, setShowFlipTooltip] = useState(false);

  const loadData = () => {
    setLoading(true);
    fetchAssetDetail(symbol, timeframe, marketClass)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [symbol, timeframe, marketClass]);

  const handleSendAlert = async () => {
    try {
      await triggerTestAlert(symbol);
      setAlertSent(true);
      setTimeout(() => setAlertSent(false), 4000);
    } catch (e) {
      console.error(e);
    }
  };

  const isInWatchlist = watchlist.map(w => w.replace(/^[$#]/, '').trim().toUpperCase()).includes(symbol.toUpperCase());
  const quote = data?.quote;
  const explanation = data?.aiExplanation;

  // Find exact signal for currently active timeframe
  const currentTfSignal = (data?.multiTimeframe?.[timeframe as keyof typeof data.multiTimeframe] as any) || data?.activeSignal;
  const isBull = currentTfSignal?.tier?.includes('Bullish');
  const isBear = currentTfSignal?.tier?.includes('Bearish');
  const forceScore = currentTfSignal?.score || 0;

  // Compute flip time elapsed
  const formatFlipAge = (ts?: number) => {
    if (!ts) return 'Confirmat recent';
    const diff = Math.max(0, Date.now() - ts);
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (mins < 1) return 'Chiar acum (pe această lumânare)';
    if (mins < 60) return `acum ${mins} minute`;
    if (hours < 24) {
      const remMins = mins % 60;
      return `acum ${hours} ${hours === 1 ? 'oră' : 'ore'}${remMins > 0 ? ` și ${remMins} min` : ''}`;
    }
    const remHours = hours % 24;
    return `acum ${days} ${days === 1 ? 'zi' : 'zile'}${remHours > 0 ? ` și ${remHours} ore` : ''}`;
  };

  const flipTimeFormatted = currentTfSignal?.transitionTime
    ? new Date(currentTfSignal.transitionTime).toLocaleString('ro-RO', { timeZone: 'UTC', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' UTC'
    : '';

  // Bias styling
  const biasColor = isBull ? 'text-emerald-400' : (isBear ? 'text-rose-400' : 'text-slate-400');
  const biasDotColor = isBull ? 'bg-emerald-400' : (isBear ? 'bg-rose-400' : 'bg-slate-500');
  const biasLabel = isBull ? 'Bullish' : (isBear ? 'Bearish' : 'Neutral');
  const biasBorderColor = isBull ? 'border-emerald-500/30' : (isBear ? 'border-rose-500/30' : 'border-slate-700');

  if (loading && !data) {
    return (
      <div className="p-16 text-center text-slate-400 font-mono space-y-3">
        <Zap className="w-8 h-8 mx-auto animate-spin text-cyan-400" />
        <p className="text-sm">Loading {symbol}...</p>
      </div>
    );
  }

  // Only provider-verified posts explicitly tagged with this asset are shown.
  // There is deliberately no fallback to the global social feed.
  const backendXPosts = (data as any)?.xPosts || [];
  const displayXPosts = backendXPosts.filter((post: any) =>
    post.mentionedSymbols?.some((mentioned: string) => mentioned.toUpperCase() === symbol.toUpperCase())
  );

  // Combine news + social into a unified feed
  const newsItems = (data?.news || []).slice(0, 4).map((n: any) => ({ ...n, _type: 'news' as const }));
  const socialItems = displayXPosts.slice(0, 4).map((p: any) => ({ ...p, _type: 'social' as const }));
  const unifiedFeed = [...newsItems, ...socialItems].slice(0, 6);

  return (
    <div className="space-y-0 animate-fade-in">

      {/* ═══════════════════════════════════════════════════════════════════
          ZONE 1 — Sticky Compact Header
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="asset-header-sticky px-4 sm:px-6 py-3 mb-4 -mx-4 lg:-mx-8">
        <div className="flex items-center justify-between gap-3 max-w-[1600px] mx-auto">

          {/* Left: Back + Asset Identity + Price */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={onBack}
              className="p-2 rounded-lg text-slate-400 hover:text-cyan-300 hover:bg-white/[0.04] transition-all shrink-0"
              title="Înapoi la Scanner"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-sm font-bold text-slate-100 font-mono shrink-0">
                ${symbol}
              </span>
              <span className="text-sm text-slate-400 font-sans truncate hidden sm:inline">
                {data?.info?.name || symbol}
              </span>
              <span className="text-sm font-bold text-slate-100 font-mono shrink-0">
                ${quote?.price < 1 ? quote?.price?.toFixed(4) : quote?.price?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
              <span className={`text-xs font-bold font-mono shrink-0 ${quote?.change24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {quote?.change24h >= 0 ? `+${quote?.change24h}%` : `${quote?.change24h}%`}
              </span>
              {quote?.changeYtd !== undefined && (
                <span className={`text-[11px] font-mono font-semibold px-2 py-0.5 rounded-md border shrink-0 hidden md:inline-flex items-center gap-1 ${
                  quote.changeYtd >= 0 
                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' 
                    : 'bg-rose-500/10 text-rose-300 border-rose-500/20'
                }`}>
                  <span className="text-slate-400 font-normal">YTD:</span>
                  <span>{quote.changeYtd >= 0 ? `+${quote.changeYtd}%` : `${quote.changeYtd}%`}</span>
                </span>
              )}
            </div>

            {/* Bias Badge with Flip Tooltip */}
            <div className="relative shrink-0 hidden sm:block">
              <button
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-semibold border transition-all ${biasBorderColor} bg-white/[0.03]`}
                onMouseEnter={() => setShowFlipTooltip(true)}
                onMouseLeave={() => setShowFlipTooltip(false)}
                onClick={() => setShowFlipTooltip(prev => !prev)}
              >
                <span className={`w-2 h-2 rounded-full ${biasDotColor}`}></span>
                <span className={biasColor}>{biasLabel}</span>
                <span className="text-slate-400">{forceScore > 0 ? `+${forceScore}` : forceScore}</span>
              </button>

              {/* Flip Timer Tooltip */}
              {showFlipTooltip && (
                <div className="absolute top-full left-0 mt-2 z-50 w-64 p-3 rounded-xl bg-background-card border border-white/[0.08] shadow-elevated font-mono text-xs space-y-1.5 animate-fade-in">
                  <div className="flex items-center gap-1.5 text-slate-300">
                    <span className="text-[10px] uppercase tracking-wider text-slate-500">Flip ({timeframe.toUpperCase()})</span>
                  </div>
                  <div className={`font-semibold ${biasColor}`}>
                    {formatFlipAge(currentTfSignal?.transitionTime)}
                  </div>
                  {flipTimeFormatted && (
                    <div className="text-slate-500 text-[11px]">
                      Confirmat: {flipTimeFormatted}
                    </div>
                  )}
                  <div className="text-slate-500 text-[11px]">
                    Tier: {currentTfSignal?.tier || 'Neutral'}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: Timeframe pills + Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Timeframe pills */}
            <div className="flex items-center bg-white/[0.03] border border-white/[0.06] rounded-lg p-0.5">
              {(['1h', '4h', '8h', '1d', '1w', '1m'] as Timeframe[]).map((tf) => (
                <button
                  key={tf}
                  onClick={() => onTimeframeChange(tf)}
                  className={`px-2 sm:px-2.5 py-1 text-[11px] font-mono rounded-md transition-all ${
                    timeframe === tf
                      ? 'bg-cyan-500/15 text-cyan-300 font-bold'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {tf.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Action icons */}
            <button
              onClick={() => onToggleWatchlist(symbol)}
              className={`p-2 rounded-lg transition-all ${
                isInWatchlist
                  ? 'text-amber-300 hover:bg-amber-500/10'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.04]'
              }`}
              title={isInWatchlist ? 'Scoate din Watchlist' : 'Adaugă în Watchlist'}
            >
              <Star className={`w-4 h-4 ${isInWatchlist ? 'fill-amber-300' : ''}`} />
            </button>

            <button
              onClick={handleSendAlert}
              className={`p-2 rounded-lg transition-all ${
                alertSent
                  ? 'text-emerald-400 bg-emerald-500/10'
                  : 'text-slate-500 hover:text-cyan-300 hover:bg-white/[0.04]'
              }`}
              title={alertSent ? 'Alertă trimisă!' : 'Trimite alertă Telegram'}
            >
              <BellRing className="w-4 h-4" />
            </button>

            <button
              onClick={loadData}
              className="p-2 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/[0.04] transition-all"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Mobile: Bias badge row (visible only on small screens) */}
        <div className="flex items-center gap-2 mt-2 sm:hidden max-w-[1600px] mx-auto">
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-semibold border ${biasBorderColor} bg-white/[0.03]`}>
            <span className={`w-2 h-2 rounded-full ${biasDotColor}`}></span>
            <span className={biasColor}>{biasLabel} {forceScore > 0 ? `+${forceScore}` : forceScore}</span>
          </div>
          <span className="text-[11px] text-slate-500 font-mono">
            {formatFlipAge(currentTfSignal?.transitionTime)}
          </span>
        </div>
      </div>


      {/* ═══════════════════════════════════════════════════════════════════
          ZONE 2 — Chart Full-Bleed
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="mb-5">
        <InteractiveChart
          candles={data?.candles || []}
          symbol={symbol}
          marketClass={marketClass || data?.info?.marketClass}
          timeframe={timeframe}
          onTimeframeChange={onTimeframeChange}
        />
      </div>


      {/* ═══════════════════════════════════════════════════════════════════
          ZONE 3 — Tabbed Info Panels
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="bg-background-card/60 rounded-xl border border-white/[0.04] overflow-hidden">

        {/* Tab Navigation */}
        <div className="tab-nav overflow-x-auto px-1">
          <button
            className={`tab-item ${activeInfoTab === 'mtf' ? 'tab-active' : ''}`}
            onClick={() => setActiveInfoTab('mtf')}
          >
            <span className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" />
              Multi-Timeframe
            </span>
          </button>
          <button
            className={`tab-item ${activeInfoTab === 'ai' ? 'tab-active' : ''}`}
            onClick={() => setActiveInfoTab('ai')}
          >
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              Analiză AI
            </span>
          </button>
          <button
            className={`tab-item ${activeInfoTab === 'social' ? 'tab-active' : ''}`}
            onClick={() => setActiveInfoTab('social')}
          >
            <span className="flex items-center gap-1.5">
              <Newspaper className="w-3.5 h-3.5" />
              Știri & Social
            </span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-5" key={activeInfoTab}>
          <div className="tab-content-enter">

            {/* ─── TAB: Multi-Timeframe Matrix ─── */}
            {activeInfoTab === 'mtf' && (
              <div className="space-y-4">
                {/* Composite Score Summary */}
                {data?.multiTimeframe && (
                  <div className="flex items-center justify-between text-xs font-mono mb-3">
                    <span className="text-slate-400">Confluență compozită:</span>
                    <span className={`px-2.5 py-1 rounded-lg font-semibold border ${
                      data.multiTimeframe.confluenceTier?.includes('Bullish')
                        ? 'text-emerald-300 border-emerald-500/20 bg-emerald-500/5'
                        : (data.multiTimeframe.confluenceTier?.includes('Bearish')
                          ? 'text-rose-300 border-rose-500/20 bg-rose-500/5'
                          : 'text-slate-300 border-slate-700 bg-slate-800/50')
                    }`}>
                      {data.multiTimeframe.confluenceTier} ({data.multiTimeframe.compositeMtfScore > 0 ? `+${data.multiTimeframe.compositeMtfScore}` : data.multiTimeframe.compositeMtfScore})
                    </span>
                  </div>
                )}

                {/* Compact 6-Column Grid */}
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {['1h', '4h', '8h', '1d', '1w', '1m'].map((tf) => {
                    const mtfSignal = data?.multiTimeframe?.[tf as keyof typeof data.multiTimeframe] as any;
                    const tfIsBull = mtfSignal?.tier?.includes('Bullish');
                    const tfIsBear = mtfSignal?.tier?.includes('Bearish');
                    const rawRoi = mtfSignal?.roiPercent !== undefined
                      ? mtfSignal.roiPercent
                      : (mtfSignal?.rawIndicators?.roc9 !== undefined ? Number(mtfSignal.rawIndicators.roc9.toFixed(2)) : 0);
                    const isRoiPos = rawRoi > 0;
                    const isRoiNeg = rawRoi < 0;

                    const borderLeft = tfIsBull
                      ? 'border-l-emerald-400'
                      : (tfIsBear ? 'border-l-rose-400' : 'border-l-slate-600');

                    return (
                      <button
                        key={tf}
                        onClick={() => onTimeframeChange(tf as Timeframe)}
                        className={`text-left p-3 rounded-lg border-l-2 transition-all ${borderLeft} ${
                          timeframe === tf
                            ? 'bg-cyan-500/[0.07] border border-r border-t border-b border-cyan-500/20'
                            : 'bg-white/[0.02] border border-r border-t border-b border-white/[0.04] hover:bg-white/[0.04]'
                        }`}
                        title={`ROI: ${isRoiPos ? '+' : ''}${rawRoi}% | RVOL: ${mtfSignal?.rawIndicators?.rvol ? `${mtfSignal.rawIndicators.rvol}x` : '1.0x'}`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[11px] font-mono font-bold text-slate-300 uppercase">{tf}</span>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            tfIsBull ? 'bg-emerald-400' : (tfIsBear ? 'bg-rose-400' : 'bg-slate-600')
                          }`}></span>
                        </div>
                        <div className={`text-sm font-bold font-mono ${
                          tfIsBull ? 'text-emerald-300' : (tfIsBear ? 'text-rose-300' : 'text-slate-400')
                        }`}>
                          {mtfSignal?.score > 0 ? `+${mtfSignal.score}` : (mtfSignal?.score !== undefined ? mtfSignal.score : '–')}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                          {mtfSignal?.tier?.replace('Strong ', 'S.') || 'Neutral'}
                        </div>
                        {/* ROI inline subtle */}
                        <div className={`text-[10px] font-mono mt-1 ${
                          isRoiPos ? 'text-emerald-400/70' : (isRoiNeg ? 'text-rose-400/70' : 'text-slate-600')
                        }`}>
                          {isRoiPos ? `+${rawRoi}%` : `${rawRoi}%`}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}


            {/* ─── TAB: AI Analysis & Economic Forward Guidance ─── */}
            {activeInfoTab === 'ai' && (
              <div className="space-y-6">
                {explanation ? (
                  <>
                    {/* 1. 🎯 GHID DE INVESTIȚIE & VERDICT STRATEGIC */}
                    <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-b from-[#0c142b] to-[#070b16] border border-cyan-500/30 shadow-xl space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/[0.06]">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300">
                            <Target className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-bold text-slate-100 font-sans">Ghid de Investiție & Verdict AI</h3>
                              {explanation.sectorOrNarrative && (
                                <span className="px-2 py-0.5 rounded-md bg-white/[0.05] border border-white/[0.08] text-[10px] font-mono text-cyan-300">
                                  {explanation.sectorOrNarrative}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-400 font-sans mt-0.5">
                              {explanation.investmentGuidance?.verdictLabelRo || 'Analiză strategică bazată pe fundamente economice și impuls Money Line.'}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className={`px-3 py-1.5 rounded-xl text-xs font-mono font-black border tracking-wide uppercase shadow-sm ${
                            (explanation.investmentGuidance?.verdict === 'Strong Buy' || explanation.overallBias.includes('Bullish'))
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-glow-emerald'
                              : ((explanation.investmentGuidance?.verdict === 'Trim / Caution' || explanation.overallBias.includes('Bearish'))
                                ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 shadow-glow-rose'
                                : 'bg-amber-500/20 text-amber-300 border-amber-500/40')
                          }`}>
                            {explanation.investmentGuidance?.verdict || explanation.overallBias}
                          </span>
                          {explanation.investmentGuidance?.targetHorizon && (
                            <span className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[11px] font-mono text-slate-300">
                              <Calendar className="w-3 h-3 text-cyan-400" />
                              <span>{explanation.investmentGuidance.targetHorizon}</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Recommended Action Card */}
                      {explanation.investmentGuidance?.recommendedAction && (
                        <div className="p-3.5 rounded-xl bg-cyan-950/30 border border-cyan-500/20 text-xs text-cyan-200 leading-relaxed font-sans flex items-start gap-2.5">
                          <Lightbulb className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                          <div>
                            <strong className="text-cyan-300">Recomandare Acțiune: </strong>
                            <span>{explanation.investmentGuidance.recommendedAction}</span>
                          </div>
                        </div>
                      )}

                      {/* 2 Columns: Why Invest vs Key Risks */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                        {/* Why Invest */}
                        <div className="p-3.5 rounded-xl bg-emerald-950/15 border border-emerald-500/20 space-y-2.5">
                          <h4 className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 font-mono">
                            <CheckCircle2 className="w-4 h-4" /> De ce merită investit (Catalizatori)
                          </h4>
                          <ul className="space-y-2">
                            {(explanation.investmentGuidance?.whyInvest || explanation.bullishCatalysts).map((item: string, i: number) => (
                              <li key={i} className="flex items-start gap-2 text-xs text-slate-200 leading-relaxed font-sans">
                                <span className="text-emerald-400 font-bold mt-0.5 shrink-0">✓</span>
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* Key Risks */}
                        <div className="p-3.5 rounded-xl bg-rose-950/15 border border-rose-500/20 space-y-2.5">
                          <h4 className="text-xs font-bold text-rose-400 flex items-center gap-1.5 font-mono">
                            <AlertTriangle className="w-4 h-4" /> Riscuri Specifice de Monitorizat
                          </h4>
                          <ul className="space-y-2">
                            {(explanation.investmentGuidance?.keyRisks || explanation.downsideRisks).map((risk: string, i: number) => (
                              <li key={i} className="flex items-start gap-2 text-xs text-slate-200 leading-relaxed font-sans">
                                <span className="text-rose-400 font-bold mt-0.5 shrink-0">✕</span>
                                <span>{risk}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>

                    {/* 2. 🔮 PERSPECTIVĂ & FORWARD ECONOMIC */}
                    {explanation.economicForward && (
                      <div className="p-4 sm:p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-cyan-400" />
                            <h3 className="text-sm font-bold text-slate-100 font-sans">Perspectivă & Forward Economic ({explanation.assetName || symbol})</h3>
                          </div>
                          <span className="text-[11px] font-mono text-slate-400">
                            Analiză Sectorială & Macro
                          </span>
                        </div>

                        <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-sans bg-black/20 p-3.5 rounded-xl border border-white/[0.04]">
                          {explanation.economicForward.industryOutlook}
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                          {/* Growth Catalysts */}
                          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] space-y-2">
                            <span className="text-[11px] font-bold text-cyan-300 font-mono flex items-center gap-1">
                              <span>⚡</span> Catalizatori de Creștere
                            </span>
                            <ul className="space-y-1.5">
                              {explanation.economicForward.growthCatalysts.map((c: string, i: number) => (
                                <li key={i} className="text-[11px] text-slate-300 leading-snug flex items-start gap-1.5">
                                  <span className="text-cyan-400 shrink-0">•</span>
                                  <span>{c}</span>
                                </li>
                              ))}
                            </ul>
                          </div>

                          {/* Macro Tailwinds */}
                          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] space-y-2">
                            <span className="text-[11px] font-bold text-emerald-300 font-mono flex items-center gap-1">
                              <span>🌤️</span> Vânturi Macro Favorabile
                            </span>
                            <ul className="space-y-1.5">
                              {explanation.economicForward.macroTailwinds.map((t: string, i: number) => (
                                <li key={i} className="text-[11px] text-slate-300 leading-snug flex items-start gap-1.5">
                                  <span className="text-emerald-400 shrink-0">•</span>
                                  <span>{t}</span>
                                </li>
                              ))}
                            </ul>
                          </div>

                          {/* Macro Headwinds */}
                          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] space-y-2">
                            <span className="text-[11px] font-bold text-amber-300 font-mono flex items-center gap-1">
                              <span>🌧️</span> Presiuni & Vânturi Contrare
                            </span>
                            <ul className="space-y-1.5">
                              {explanation.economicForward.macroHeadwinds.map((h: string, i: number) => (
                                <li key={i} className="text-[11px] text-slate-300 leading-snug flex items-start gap-1.5">
                                  <span className="text-amber-400 shrink-0">•</span>
                                  <span>{h}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 3. 📊 REZUMAT ULTIMELE RAPOARTE ECONOMICE & FINANCIARE */}
                    {explanation.recentReports && explanation.recentReports.length > 0 && (
                      <div className="p-4 sm:p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-emerald-400" />
                            <h3 className="text-sm font-bold text-slate-100 font-sans">Sinteză Ultimele Rapoarte Economice & Financiare</h3>
                          </div>
                          <span className="text-[11px] font-mono text-emerald-400/80 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                            Rezultate Oficiale
                          </span>
                        </div>

                        <div className="space-y-3">
                          {explanation.recentReports.map((report: any, idx: number) => (
                            <div key={idx} className="p-3.5 rounded-xl bg-black/30 border border-white/[0.05] space-y-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <h4 className="text-xs font-bold text-slate-100 font-mono flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                                  <span>{report.title}</span>
                                </h4>
                                <span className="text-[10px] font-mono text-slate-400 px-2 py-0.5 rounded bg-white/[0.04]">
                                  {report.period}
                                </span>
                              </div>

                              <p className="text-xs text-slate-300 leading-relaxed font-sans">
                                {report.summary}
                              </p>

                              {/* KPI Metric Badges */}
                              {report.metrics && report.metrics.length > 0 && (
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                                  {report.metrics.map((m: any, mIdx: number) => (
                                    <div key={mIdx} className={`p-2 rounded-lg border flex flex-col ${
                                      m.sentiment === 'positive'
                                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                                        : (m.sentiment === 'negative'
                                          ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                                          : 'bg-white/[0.03] border-white/[0.06] text-slate-300')
                                    }`}>
                                      <span className="text-[9px] text-slate-400 font-mono uppercase">{m.label}</span>
                                      <span className="text-xs font-bold font-mono mt-0.5">{m.value}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 4. 🛡️ TEZĂ TEHNICĂ & SUPORT / REZISTENȚĂ */}
                    <div className="p-4 sm:p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Compass className="w-4 h-4 text-cyan-400" />
                          <h3 className="text-sm font-bold text-slate-100 font-sans">Teză Tehnică & Niveluri S/R</h3>
                        </div>
                        <span className="text-[11px] font-mono text-slate-400">
                          {(explanation.confidence * 100).toFixed(0)}% încredere tehnică
                        </span>
                      </div>

                      <p className="text-xs text-slate-300 leading-relaxed font-sans">
                        {explanation.technicalThesis}
                      </p>

                      {/* S/R Inline Widget */}
                      <div className="flex flex-wrap items-center justify-between gap-2 py-2.5 px-3.5 rounded-xl bg-black/40 border border-white/[0.05] font-mono text-xs">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1.5">
                            <span className="text-emerald-400/70">S2</span>
                            <span className="text-emerald-300 font-semibold">${explanation.keySupportResistance.supportLevels[1]}</span>
                          </div>
                          <span className="text-slate-700">|</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-emerald-400/70">S1</span>
                            <span className="text-emerald-300 font-semibold">${explanation.keySupportResistance.supportLevels[0]}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-500/15 border border-cyan-500/30">
                          <span className="text-cyan-300 font-bold">
                            Preț: ${quote?.price < 1 ? quote?.price?.toFixed(4) : quote?.price?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1.5">
                            <span className="text-rose-400/70">R1</span>
                            <span className="text-rose-300 font-semibold">${explanation.keySupportResistance.resistanceLevels[0]}</span>
                          </div>
                          <span className="text-slate-700">|</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-rose-400/70">R2</span>
                            <span className="text-rose-300 font-semibold">${explanation.keySupportResistance.resistanceLevels[1]}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-slate-500 font-mono">Analiza AI nu este disponibilă pentru acest asset.</p>
                )}
              </div>
            )}


            {/* ─── TAB: News & Social (Unified Feed) ─── */}
            {activeInfoTab === 'social' && (
              <div className="space-y-0 divide-y divide-white/[0.04]">
                {unifiedFeed.length > 0 ? (
                  unifiedFeed.map((item: any, idx: number) => (
                    <div key={item.id || idx} className="py-3.5 first:pt-0 last:pb-0">
                      {item._type === 'news' ? (
                        /* News Item */
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-start gap-3 group"
                        >
                          <Newspaper className="w-4 h-4 text-slate-600 mt-0.5 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[10px] font-mono font-semibold text-cyan-400/70 uppercase">{item.source}</span>
                              {item.sentiment && (
                                <span className="text-[10px] font-mono text-emerald-400/60">{item.sentiment}</span>
                              )}
                            </div>
                            <h4 className="text-sm text-slate-200 group-hover:text-cyan-300 transition-colors leading-snug line-clamp-2 font-sans">
                              {item.title}
                            </h4>
                            <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">{item.summary}</p>
                          </div>
                          <ExternalLink className="w-3 h-3 text-slate-700 group-hover:text-cyan-400 mt-1 shrink-0 transition-colors" />
                        </a>
                      ) : (
                        /* Social/X Post */
                        <div className="flex items-start gap-3">
                          <Twitter className="w-4 h-4 text-[#1DA1F2]/40 mt-0.5 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className="text-xs font-semibold text-slate-200 font-mono">{item.authorName}</span>
                              <BadgeCheck className="w-3 h-3 text-cyan-500/50" />
                              <span className="text-[11px] text-slate-600 font-mono">{item.authorHandle}</span>
                            </div>
                            <p className="text-sm text-slate-300 leading-relaxed line-clamp-3 font-sans">
                              {item.text}
                            </p>
                            <div className="flex items-center gap-4 mt-1.5 text-[10px] font-mono text-slate-600">
                              <span>❤️ {item.likes?.toLocaleString() || item.likeCount?.toLocaleString()}</span>
                              <span>🔁 {item.reposts?.toLocaleString() || item.repostCount?.toLocaleString()}</span>
                              <a
                                href={item.url || `https://x.com/search?q=%24${symbol}&f=live`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[#1DA1F2]/50 hover:text-[#1DA1F2] transition-colors flex items-center gap-0.5"
                              >
                                Citește pe X <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500 font-mono py-4">Nu există știri sau postări recente pentru ${symbol}.</p>
                )}

                {/* Search on X link */}
                <div className="pt-3">
                  <a
                    href={`https://x.com/search?q=%24${symbol}&f=live`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-cyan-400 transition-colors font-mono"
                  >
                    Caută ${symbol} pe X <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
};
