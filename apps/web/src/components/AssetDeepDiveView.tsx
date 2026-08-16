import React, { useState, useEffect } from 'react';
import { AssetDetailResponse, Timeframe } from '../types.js';
import { fetchAssetDetail, triggerTestAlert, fetchXPosts } from '../services/api.js';
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
  RefreshCw,
  Twitter,
  BadgeCheck
} from 'lucide-react';

interface AssetDeepDiveViewProps {
  symbol: string;
  timeframe: Timeframe;
  onTimeframeChange: (tf: Timeframe) => void;
  onBack: () => void;
  watchlist: string[];
  onToggleWatchlist: (symbol: string) => void;
}

type InfoTab = 'mtf' | 'ai' | 'social';

export const AssetDeepDiveView: React.FC<AssetDeepDiveViewProps> = ({
  symbol,
  timeframe,
  onTimeframeChange,
  onBack,
  watchlist,
  onToggleWatchlist
}) => {
  const [data, setData] = useState<AssetDetailResponse | null>(null);
  const [xPosts, setXPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [alertSent, setAlertSent] = useState(false);
  const [activeInfoTab, setActiveInfoTab] = useState<InfoTab>('mtf');
  const [showFlipTooltip, setShowFlipTooltip] = useState(false);

  const loadData = () => {
    setLoading(true);
    Promise.all([
      fetchAssetDetail(symbol, timeframe),
      fetchXPosts().catch(() => [])
    ])
      .then(([detailRes, postsRes]) => {
        setData(detailRes);
        setXPosts(postsRes);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [symbol, timeframe]);

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

  // Use asset-specific X posts from backend API or local filter
  const backendXPosts = (data as any)?.xPosts || [];
  const assetXPosts = xPosts.filter(p => p.symbols?.includes(symbol) || p.text?.toUpperCase().includes(`$${symbol.toUpperCase()}`));
  const displayXPosts = backendXPosts.length > 0 ? backendXPosts : (assetXPosts.length > 0 ? assetXPosts : xPosts.slice(0, 5));

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


            {/* ─── TAB: AI Analysis ─── */}
            {activeInfoTab === 'ai' && (
              <div className="space-y-5">
                {explanation ? (
                  <>
                    {/* Thesis + Confidence */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-slate-200 font-sans">Teză Tehnică</h3>
                        <span className="text-[11px] font-mono text-slate-500">
                          {(explanation.confidence * 100).toFixed(0)}% încredere
                        </span>
                      </div>
                      <p className="text-sm text-slate-300 leading-relaxed font-sans">
                        {explanation.technicalThesis}
                      </p>
                    </div>

                    {/* S/R Inline Widget */}
                    <div className="flex flex-wrap items-center gap-3 py-3 px-4 rounded-lg bg-white/[0.02] border border-white/[0.04] font-mono text-xs">
                      <Compass className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <div className="flex items-center gap-1.5">
                        <span className="text-emerald-400/70">S2</span>
                        <span className="text-emerald-300 font-semibold">${explanation.keySupportResistance.supportLevels[1]}</span>
                      </div>
                      <span className="text-slate-700">|</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-emerald-400/70">S1</span>
                        <span className="text-emerald-300 font-semibold">${explanation.keySupportResistance.supportLevels[0]}</span>
                      </div>
                      <span className="text-slate-700">|</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-cyan-400/70">Preț</span>
                        <span className="text-cyan-300 font-semibold">
                          ${quote?.price < 1 ? quote?.price?.toFixed(4) : quote?.price?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <span className="text-slate-700">|</span>
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

                    {/* Bullish / Bearish Catalysts in 2 columns */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5 font-mono">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Catalizatori Bullish
                        </h4>
                        <ul className="space-y-1.5">
                          {explanation.bullishCatalysts.map((c: string, i: number) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-slate-300 leading-relaxed">
                              <span className="text-emerald-500 mt-1 shrink-0">•</span>
                              <span>{c}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-rose-400 flex items-center gap-1.5 font-mono">
                          <AlertTriangle className="w-3.5 h-3.5" /> Riscuri & Invalidation
                        </h4>
                        <ul className="space-y-1.5">
                          {explanation.downsideRisks.map((r: string, i: number) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-slate-300 leading-relaxed">
                              <span className="text-rose-500 mt-1 shrink-0">•</span>
                              <span>{r}</span>
                            </li>
                          ))}
                        </ul>
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
