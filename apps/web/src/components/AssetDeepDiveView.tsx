import React, { useState, useEffect } from 'react';
import { AssetDetailResponse, Timeframe } from '../types.js';
import { fetchAssetDetail, triggerTestAlert } from '../services/api.js';
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
  RefreshCw
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
  const [loading, setLoading] = useState(true);
  const [alertSent, setAlertSent] = useState(false);

  const loadData = () => {
    setLoading(true);
    fetchAssetDetail(symbol, activeTf)
      .then(res => setData(res))
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

  const isInWatchlist = watchlist.includes(symbol);
  const signal = data?.activeSignal;
  const quote = data?.quote;
  const explanation = data?.aiExplanation;

  if (loading && !data) {
    return (
      <div className="p-16 text-center text-slate-400 font-mono space-y-3">
        <Zap className="w-8 h-8 mx-auto animate-spin text-cyan-400" />
        <p className="text-sm">Loading full genesis history &amp; Money Line signals for ${symbol}...</p>
      </div>
    );
  }

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
            <span>Back to Dashboard</span>
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
            <span>{isInWatchlist ? 'In Watchlist' : 'Add to Watchlist'}</span>
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
            <span>{alertSent ? 'Alert Dispatched!' : 'Telegram Alert'}</span>
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

      {/* Main Full-Width Interactive TradingView Chart */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-bold tracking-wide uppercase font-mono text-slate-200">
              Interactive TradingView Chart with MoneyLine Overlay Force v1 ({activeTf.toUpperCase()})
            </h2>
          </div>
          <span className="text-xs font-mono text-slate-400 hidden sm:inline">
            Up to 1500 Historical Bars from Launch
          </span>
        </div>

        <InteractiveChart
          candles={data?.candles || []}
          symbol={symbol}
          timeframe={activeTf}
          onTimeframeChange={setActiveTf}
        />
      </div>

      {/* Multi-Timeframe Confluence Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-cyan-400" />
            Multi-Timeframe Confluence Matrix (1H, 4H, 8H, 1D, 1W, 1M)
          </h2>
          {data?.multiTimeframe && (
            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="text-slate-400">Composite Confluence:</span>
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
            const isBull = mtfSignal?.tier?.includes('Bullish');
            const isBear = mtfSignal?.tier?.includes('Bearish');

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
                    isBull ? 'bg-emerald-500/20 text-emerald-300' :
                    (isBear ? 'bg-rose-500/20 text-rose-300' : 'bg-slate-800 text-slate-400')
                  }`}>
                    {mtfSignal?.tier || 'Neutral'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-400 text-[11px]">Score:</span>
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
                  <h3 className="font-bold text-base text-slate-100 font-mono">AI Analyst Technical Thesis</h3>
                </div>
                <span className="text-xs font-mono px-2.5 py-1 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold">
                  {(explanation.confidence * 100).toFixed(0)}% Confidence
                </span>
              </div>

              <p className="text-sm text-slate-200 leading-relaxed font-sans font-medium">
                {explanation.technicalThesis}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className="p-3.5 rounded-xl bg-background-surface/80 border border-background-border space-y-1">
                  <span className="text-[11px] font-mono uppercase text-slate-400 block">Money Line Context</span>
                  <p className="text-xs text-slate-300">{explanation.moneyLineContext}</p>
                </div>
                <div className="p-3.5 rounded-xl bg-background-surface/80 border border-background-border space-y-1">
                  <span className="text-[11px] font-mono uppercase text-slate-400 block">X Social Velocity</span>
                  <p className="text-xs text-slate-300">{explanation.socialNarrativeContext}</p>
                </div>
              </div>

              {/* Bullish & Downside Catalysts */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 space-y-2">
                  <span className="font-bold text-xs text-emerald-400 flex items-center gap-1.5 font-mono">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Bullish Catalysts
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
                    <AlertTriangle className="w-3.5 h-3.5" /> Downside Risks
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
                <h3 className="font-bold text-sm text-slate-100 font-mono">Key Price Pivots &amp; ATR</h3>
              </div>

              <div className="space-y-3 font-mono text-xs">
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 space-y-1">
                  <span className="text-rose-400 font-bold block text-[11px]">RESISTANCE LEVELS</span>
                  <div className="flex justify-between text-slate-200">
                    <span>R2 (Major Expansion):</span>
                    <strong className="text-rose-300">${explanation.keySupportResistance.resistanceLevels[1]}</strong>
                  </div>
                  <div className="flex justify-between text-slate-200">
                    <span>R1 (Immediate Pivot):</span>
                    <strong className="text-rose-300">${explanation.keySupportResistance.resistanceLevels[0]}</strong>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700 space-y-1">
                  <span className="text-slate-400 font-bold block text-[11px]">CURRENT PRICE</span>
                  <div className="text-center text-lg font-bold text-cyan-300">
                    ${quote?.price < 1 ? quote?.price?.toFixed(4) : quote?.price?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-1">
                  <span className="text-emerald-400 font-bold block text-[11px]">SUPPORT LEVELS</span>
                  <div className="flex justify-between text-slate-200">
                    <span>S1 (Primary EMA Defense):</span>
                    <strong className="text-emerald-300">${explanation.keySupportResistance.supportLevels[0]}</strong>
                  </div>
                  <div className="flex justify-between text-slate-200">
                    <span>S2 (Major Trend Floor):</span>
                    <strong className="text-emerald-300">${explanation.keySupportResistance.supportLevels[1]}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Real News & X Posts for this Symbol */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Real News */}
        <div className="cyber-glass rounded-2xl p-6 border border-background-border space-y-3">
          <div className="flex items-center gap-2 font-mono text-xs text-slate-300">
            <Newspaper className="w-4 h-4 text-cyan-400" />
            <h3 className="font-bold text-sm text-slate-100">Breaking News for ${symbol}</h3>
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
            <p className="text-xs text-slate-400 font-mono">No specific news articles detected in the past 24h.</p>
          )}
        </div>

        {/* Live X (Twitter) Discussions */}
        <div className="cyber-glass rounded-2xl p-6 border border-background-border space-y-3">
          <div className="flex items-center justify-between font-mono text-xs text-slate-300">
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-amber-400" />
              <h3 className="font-bold text-sm text-slate-100">X (Twitter) Sentiment &amp; Alpha</h3>
            </div>
            <a
              href={`https://x.com/search?q=%24${symbol}%20min_faves%3A20&f=live`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-400 hover:underline flex items-center gap-1 text-[11px]"
            >
              <span>Search ${symbol} on X</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div className="p-4 rounded-xl bg-background-surface/80 border border-background-border space-y-3 font-mono text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Cashtag:</span>
              <span className="text-cyan-300 font-bold">${symbol}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Top Verified Community:</span>
              <a
                href="https://x.com/lookonchain"
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-200 hover:text-cyan-300 flex items-center gap-1"
              >
                <span>@lookonchain</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
            <a
              href={`https://x.com/search?q=%24${symbol}%20min_faves%3A20&f=live`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-amber-500/20 to-cyan-500/20 border border-amber-500/30 hover:border-cyan-500/40 text-cyan-200 font-bold text-xs flex items-center justify-center gap-2 transition-all block text-center mt-2"
            >
              <span>Open Live ${symbol} Tweets Stream ↗</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
