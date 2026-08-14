import React, { useState, useEffect } from 'react';
import { AssetDetailResponse, Timeframe } from '../types.js';
import { fetchAssetDetail, triggerTestAlert, fetchXPosts } from '../services/api.js';
import { InteractiveChart } from './InteractiveChart.js';
import {
  ArrowLeft,
  Zap,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  BellRing,
  Sparkles,
  ExternalLink,
  Flame,
  Newspaper,
  Star,
  Layers,
  Compass,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Clock,
  Activity,
  Twitter,
  BadgeCheck
} from 'lucide-react';

interface AssetDeepDiveViewProps {
  symbol: string;
  initialTimeframe?: Timeframe;
  onBack: () => void;
  watchlist: string[];
  onToggleWatchlist: (symbol: string) => void;
}

export const AssetDeepDiveView: React.FC<AssetDeepDiveViewProps> = ({
  symbol,
  initialTimeframe = '1h',
  onBack,
  watchlist,
  onToggleWatchlist
}) => {
  const [activeTf, setActiveTf] = useState<Timeframe>(initialTimeframe);
  const [data, setData] = useState<AssetDetailResponse | null>(null);
  const [xPosts, setXPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [alertSent, setAlertSent] = useState(false);

  const loadData = () => {
    setLoading(true);
    Promise.all([
      fetchAssetDetail(symbol, activeTf),
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
  }, [symbol, activeTf]);

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
  const currentTfSignal = (data?.multiTimeframe?.[activeTf as keyof typeof data.multiTimeframe] as any) || data?.activeSignal;
  const isBull = currentTfSignal?.tier?.includes('Bullish');
  const isBear = currentTfSignal?.tier?.includes('Bearish');
  const forceScore = currentTfSignal?.score || 0;
  const forcePercent = Math.min(100, Math.abs(forceScore));

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

  if (loading && !data) {
    return (
      <div className="p-16 text-center text-slate-400 font-mono space-y-3">
        <Zap className="w-8 h-8 mx-auto animate-spin text-cyan-400" />
        <p className="text-sm">Loading full genesis history &amp; Money Line signals for ${symbol}...</p>
      </div>
    );
  }

  // Filter X posts for this asset or general top alpha
  const assetXPosts = xPosts.filter(p => p.symbols?.includes(symbol) || p.text?.includes(`$${symbol}`));
  const displayXPosts = assetXPosts.length > 0 ? assetXPosts : xPosts.slice(0, 3);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Full-Page Header & Navigation */}
      <div className="cyber-glass rounded-2xl p-4 sm:p-6 border border-cyan-500/30 bg-background-card/90 shadow-2xl flex flex-wrap items-center justify-between gap-4">
        {/* Back Button & Asset Identity */}
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 hover:border-cyan-500/50 transition-all font-mono text-xs font-bold group shadow-sm"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            <span>Înapoi la Scanner</span>
          </button>

          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-cyan-500/20 to-emerald-500/20 border border-cyan-500/40 flex items-center justify-center text-xl font-bold font-mono text-cyan-300 shadow-glow-cyan">
              ${symbol}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold text-slate-100 font-mono">
                  {data?.info?.name || symbol}
                </h1>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono border border-slate-700">
                  {data?.info?.category || 'Layer 1'}
                </span>
                <span className="text-xs font-mono text-slate-400">Rank #{data?.info?.rank || 1}</span>
              </div>
              <div className="flex items-center gap-3 text-sm font-mono mt-0.5">
                <span className="font-bold text-slate-100 text-base">
                  ${quote?.price < 1 ? quote?.price?.toFixed(4) : quote?.price?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
                <span className={`font-bold ${quote?.change24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {quote?.change24h >= 0 ? `+${quote?.change24h}%` : `${quote?.change24h}%`} (24h)
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Controls & Watchlist Toggle */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Watchlist Toggle */}
          <button
            onClick={() => onToggleWatchlist(symbol)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-mono text-xs font-bold border transition-all ${
              isInWatchlist
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-glow-gold'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700 hover:border-cyan-500/40'
            }`}
          >
            <Star className={`w-4 h-4 ${isInWatchlist ? 'fill-amber-300 text-amber-300' : 'text-slate-400'}`} />
            <span>{isInWatchlist ? 'În Watchlist' : 'Adaugă în Watchlist'}</span>
          </button>

          {/* Timeframe selector */}
          <div className="flex items-center bg-background-surface border border-background-border rounded-xl p-0.5">
            {(['1h', '4h', '8h', '1d', '1w', '1m'] as Timeframe[]).map((tf) => (
              <button
                key={tf}
                onClick={() => setActiveTf(tf)}
                className={`px-3 py-1.5 text-xs font-mono rounded-lg transition-all ${
                  activeTf === tf
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-bold shadow-glow-cyan'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tf.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Telegram Alert Button */}
          <button
            onClick={handleSendAlert}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/30 text-xs font-mono font-bold transition-all shadow-sm"
          >
            <BellRing className="w-4 h-4" />
            <span>{alertSent ? 'Alertă Trimisă!' : 'Alertă Telegram'}</span>
          </button>

          <button
            onClick={loadData}
            title="Refresh Data"
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* DEDICATED RUBRIC: Money Line Bias, Strength & Flip Timer on Selected Timeframe */}
      <div className={`cyber-glass rounded-2xl p-5 border transition-all shadow-xl ${
        isBull 
          ? 'bg-gradient-to-r from-emerald-500/10 via-background-card to-emerald-500/5 border-emerald-500/40 shadow-glow-emerald' 
          : (isBear ? 'bg-gradient-to-r from-rose-500/10 via-background-card to-rose-500/5 border-rose-500/40 shadow-glow-ruby' : 'bg-background-card/90 border-slate-700')
      }`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Bias Badge & Money Line Score */}
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center border shadow-lg ${
              isBull 
                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' 
                : (isBear ? 'bg-rose-500/20 border-rose-500/50 text-rose-400' : 'bg-slate-800 border-slate-700 text-slate-400')
            }`}>
              {isBull ? <TrendingUp className="w-6 h-6 animate-pulse" /> : (isBear ? <TrendingDown className="w-6 h-6 animate-pulse" /> : <Activity className="w-6 h-6" />)}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase font-mono tracking-wider text-slate-400">
                  Regim Money Line ({activeTf.toUpperCase()})
                </span>
                <span className={`px-2.5 py-0.5 rounded-md text-xs font-mono font-bold border ${
                  isBull 
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' 
                    : (isBear ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' : 'bg-slate-800 text-slate-300 border-slate-700')
                }`}>
                  {currentTfSignal?.tier || 'Neutral'}
                </span>
              </div>

              <div className="flex items-baseline gap-3 mt-1">
                <span className={`text-2xl font-bold font-mono tracking-tight ${
                  isBull ? 'text-emerald-300' : (isBear ? 'text-rose-300' : 'text-slate-200')
                }`}>
                  {isBull ? '🟢 BULLISH' : (isBear ? '🔴 BEARISH' : '⚪ NEUTRAL')}
                </span>
                <span className="text-sm font-mono text-slate-300">
                  Scor: <strong className="text-slate-100">{forceScore > 0 ? `+${forceScore}` : forceScore}</strong> / 100
                </span>
              </div>
            </div>
          </div>

          {/* Flip Timer & Time Elapsed Section */}
          <div className="flex flex-col sm:items-end justify-center bg-background-surface/80 p-3.5 rounded-xl border border-background-border font-mono text-xs space-y-1">
            <div className="flex items-center gap-1.5 text-slate-400">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              <span>TIMP DE LA ULTIMUL FLIP ({activeTf.toUpperCase()}):</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`font-bold text-sm ${isBull ? 'text-emerald-400' : (isBear ? 'text-rose-400' : 'text-slate-200')}`}>
                {formatFlipAge(currentTfSignal?.transitionTime)}
              </span>
            </div>
            {flipTimeFormatted && (
              <span className="text-[11px] text-slate-500">
                Data confirmării: {flipTimeFormatted}
              </span>
            )}
          </div>
        </div>

        {/* Progress Bar showing Bullish / Bearish Force % */}
        <div className="mt-4 pt-3 border-t border-background-border/50 space-y-1.5">
          <div className="flex justify-between text-xs font-mono text-slate-300">
            <span>Intensitate Trend {activeTf.toUpperCase()} ({isBull ? 'Bullish Force' : (isBear ? 'Bearish Pressure' : 'Momentum')}):</span>
            <span className={`font-bold ${isBull ? 'text-emerald-400' : (isBear ? 'text-rose-400' : 'text-slate-400')}`}>
              {forcePercent.toFixed(1)}%
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                isBull ? 'bg-gradient-to-r from-emerald-500 to-cyan-400' : (isBear ? 'bg-gradient-to-r from-rose-500 to-red-600' : 'bg-slate-600')
              }`}
              style={{ width: `${Math.max(5, forcePercent)}%` }}
            ></div>
          </div>
        </div>
      </div>

      {/* Main Full-Width Interactive TradingView Chart */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-bold tracking-wide uppercase font-mono text-slate-200">
              Grafic Interactiv TradingView cu MoneyLine Overlay Force v1 ({activeTf.toUpperCase()})
            </h2>
          </div>
          <span className="text-xs font-mono text-slate-400 hidden sm:inline">
            Până la 1500 de lumânări istorice de la lansare
          </span>
        </div>

        <InteractiveChart
          candles={data?.candles || []}
          symbol={symbol}
          timeframe={activeTf}
          onTimeframeChange={setActiveTf}
        />
      </div>

      {/* Multi-Timeframe Confluence Grid (6 Timeframes) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-cyan-400" />
            Matricea Multi-Timeframe Confluence (1H, 4H, 8H, 1D, 1W, 1M)
          </h2>
          {data?.multiTimeframe && (
            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="text-slate-400">Scor Compozit:</span>
              <span className={`px-2.5 py-0.5 rounded font-bold border ${
                data.multiTimeframe.confluenceTier?.includes('Bullish')
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-glow-emerald'
                  : (data.multiTimeframe.confluenceTier?.includes('Bearish') ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 shadow-glow-ruby' : 'bg-slate-800 text-slate-300 border-slate-700')
              }`}>
                {data.multiTimeframe.confluenceTier} ({data.multiTimeframe.compositeMtfScore > 0 ? `+${data.multiTimeframe.compositeMtfScore}` : data.multiTimeframe.compositeMtfScore})
              </span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {['1h', '4h', '8h', '1d', '1w', '1m'].map((tf) => {
            const mtfSignal = data?.multiTimeframe?.[tf as keyof typeof data.multiTimeframe] as any;
            const tfIsBull = mtfSignal?.tier?.includes('Bullish');
            const tfIsBear = mtfSignal?.tier?.includes('Bearish');

            return (
              <div
                key={tf}
                onClick={() => setActiveTf(tf as Timeframe)}
                className={`cyber-glass rounded-xl p-3.5 border transition-all cursor-pointer space-y-2 ${
                  activeTf === tf
                    ? 'border-cyan-500/60 bg-cyan-500/10 shadow-glow-cyan'
                    : 'border-background-border hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between font-mono text-xs">
                  <span className="font-bold text-slate-200 uppercase">{tf}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                    tfIsBull ? 'bg-emerald-500/20 text-emerald-300' :
                    (tfIsBear ? 'bg-rose-500/20 text-rose-300' : 'bg-slate-800 text-slate-400')
                  }`}>
                    {mtfSignal?.tier || 'Neutral'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-400 text-[11px]">Scor:</span>
                  <span className="font-bold text-slate-200">
                    {mtfSignal?.score > 0 ? `+${mtfSignal.score}` : (mtfSignal?.score !== undefined ? mtfSignal.score : '-')}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs font-mono text-[11px]">
                  <span className="text-slate-400">RVOL:</span>
                  <span className="text-slate-300">{mtfSignal?.rawIndicators?.rvol ? `${mtfSignal.rawIndicators.rvol}x` : '1.0x'}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* AI Market Analyst Deep-Dive Thesis & Structure */}
      {explanation && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main AI Thesis */}
          <div className="lg:col-span-2 space-y-4">
            <div className="cyber-glass rounded-2xl p-6 border border-purple-500/30 bg-purple-500/5 space-y-4 shadow-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-purple-400" />
                  <h3 className="font-bold text-base text-slate-100 font-mono">Teză Tehnică AI Market Analyst</h3>
                </div>
                <span className="text-xs font-mono px-2.5 py-1 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold">
                  {(explanation.confidence * 100).toFixed(0)}% Încredere
                </span>
              </div>

              <p className="text-sm text-slate-200 leading-relaxed font-sans font-medium">
                {explanation.technicalThesis}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className="p-3.5 rounded-xl bg-background-surface/80 border border-background-border space-y-1">
                  <span className="text-[11px] font-mono uppercase text-slate-400 block">Context Money Line</span>
                  <p className="text-xs text-slate-300">{explanation.moneyLineContext}</p>
                </div>
                <div className="p-3.5 rounded-xl bg-background-surface/80 border border-background-border space-y-1">
                  <span className="text-[11px] font-mono uppercase text-slate-400 block">Viteză Socială &amp; X Trends</span>
                  <p className="text-xs text-slate-300">{explanation.socialNarrativeContext}</p>
                </div>
              </div>

              {/* Bullish & Downside Catalysts */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 space-y-2">
                  <span className="font-bold text-xs text-emerald-400 flex items-center gap-1.5 font-mono">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Catalizatori Bullish
                  </span>
                  <ul className="space-y-1 text-xs text-slate-300">
                    {explanation.bullishCatalysts.map((c: string, i: number) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="text-emerald-400 font-bold">•</span>
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="p-4 rounded-xl bg-rose-500/5 border border-rose-500/20 space-y-2">
                  <span className="font-bold text-xs text-rose-400 flex items-center gap-1.5 font-mono">
                    <AlertTriangle className="w-3.5 h-3.5" /> Riscuri &amp; Invalidation
                  </span>
                  <ul className="space-y-1 text-xs text-slate-300">
                    {explanation.downsideRisks.map((r: string, i: number) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="text-rose-400 font-bold">•</span>
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Key Support & Resistance Levels */}
          <div className="space-y-4">
            <div className="cyber-glass rounded-2xl p-6 border border-background-border space-y-4">
              <div className="flex items-center gap-2">
                <Compass className="w-5 h-5 text-cyan-400" />
                <h3 className="font-bold text-sm text-slate-100 font-mono">Pivoți Cheie &amp; Nivele Tehnice</h3>
              </div>

              <div className="space-y-3 font-mono text-xs">
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 space-y-1">
                  <span className="text-rose-400 font-bold block text-[11px]">NIVELE DE REZISTENȚĂ</span>
                  <div className="flex justify-between text-slate-200">
                    <span>R2 (Major Expansion):</span>
                    <strong className="text-rose-300">${explanation.keySupportResistance.resistanceLevels[1]}</strong>
                  </div>
                  <div className="flex justify-between text-slate-200">
                    <span>R1 (Pivot Imediat):</span>
                    <strong className="text-rose-300">${explanation.keySupportResistance.resistanceLevels[0]}</strong>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700 space-y-1">
                  <span className="text-slate-400 font-bold block text-[11px]">PREȚ CURENT</span>
                  <div className="text-center text-lg font-bold text-cyan-300">
                    ${quote?.price < 1 ? quote?.price?.toFixed(4) : quote?.price?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-1">
                  <span className="text-emerald-400 font-bold block text-[11px]">NIVELE DE SUPORT</span>
                  <div className="flex justify-between text-slate-200">
                    <span>S1 (Suport Primar EMA):</span>
                    <strong className="text-emerald-300">${explanation.keySupportResistance.supportLevels[0]}</strong>
                  </div>
                  <div className="flex justify-between text-slate-200">
                    <span>S2 (Podea Trend Major):</span>
                    <strong className="text-emerald-300">${explanation.keySupportResistance.supportLevels[1]}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Real News & Top Verified X Tweets Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Real News */}
        <div className="cyber-glass rounded-2xl p-6 border border-background-border space-y-3">
          <div className="flex items-center justify-between font-mono text-xs text-slate-300">
            <div className="flex items-center gap-2">
              <Newspaper className="w-4 h-4 text-cyan-400" />
              <h3 className="font-bold text-sm text-slate-100">Știri de Ultimă Oră pentru ${symbol}</h3>
            </div>
            <span className="text-slate-500 text-[11px]">Surse: CoinDesk, Decrypt, Bloomberg</span>
          </div>
          {data?.news && data.news.length > 0 ? (
            <div className="space-y-2.5">
              {data.news.slice(0, 3).map((n) => (
                <a
                  key={n.id}
                  href={n.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-3 rounded-xl bg-background-surface/80 hover:bg-background-surface border border-background-border hover:border-cyan-500/40 transition-all block space-y-1 group"
                >
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                    <span className="font-bold text-cyan-400">{n.source}</span>
                    <span>{new Date(n.publishedAt).toLocaleDateString()}</span>
                  </div>
                  <h4 className="font-bold text-xs text-slate-200 group-hover:text-cyan-300 line-clamp-1">
                    {n.title}
                  </h4>
                  <p className="text-[11px] text-slate-400 line-clamp-2">{n.summary}</p>
                </a>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 font-mono">Nu există știri specifice detectate în ultimele 24h.</p>
          )}
        </div>

        {/* Live Top Verified Crypto Twitter (X) Posts */}
        <div className="cyber-glass rounded-2xl p-6 border border-background-border space-y-3">
          <div className="flex items-center justify-between font-mono text-xs text-slate-300">
            <div className="flex items-center gap-2">
              <Twitter className="w-4 h-4 text-[#1DA1F2]" />
              <h3 className="font-bold text-sm text-slate-100">Top Postări &amp; Alpha pe X</h3>
            </div>
            <a
              href={`https://x.com/search?q=%24${symbol}%20min_faves%3A20&f=live`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-400 hover:underline flex items-center gap-1 text-[11px]"
            >
              <span>Caută ${symbol} pe X</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div className="space-y-3">
            {displayXPosts.map((post: any) => (
              <div
                key={post.id}
                className="p-3.5 rounded-xl bg-background-surface/80 border border-background-border hover:border-cyan-500/30 transition-all space-y-2"
              >
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-slate-200 font-mono">{post.authorName}</span>
                    <BadgeCheck className="w-3.5 h-3.5 text-cyan-400" />
                    <span className="text-[11px] text-slate-500 font-mono">{post.authorHandle}</span>
                  </div>
                  <a
                    href={post.url || `https://x.com/search?q=%24${symbol}&f=live`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#1DA1F2]/10 hover:bg-[#1DA1F2]/20 text-[#1DA1F2] border border-[#1DA1F2]/30 text-[10px] font-mono font-bold transition-all"
                  >
                    <span>Citește pe X</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>

                <p className="text-xs text-slate-300 font-sans leading-relaxed">
                  {post.text}
                </p>

                <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 pt-1">
                  <span>❤️ {post.likeCount?.toLocaleString()} aprecieri • 🔁 {post.repostCount?.toLocaleString()} reposts</span>
                  <span className="text-cyan-400 font-semibold">{post.sentiment || 'Bullish Alpha'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
