import React, { useEffect, useState } from 'react';
import { AssetDetailResponse, Timeframe } from '../types.js';
import { fetchAssetDetail, triggerTestAlert } from '../services/api.js';
import { InteractiveChart } from './InteractiveChart.js';
import {
  X,
  Zap,
  TrendingUp,
  BrainCircuit,
  Flame,
  Newspaper,
  ShieldAlert,
  CheckCircle,
  ExternalLink,
  BellRing
} from 'lucide-react';

interface AssetDetailModalProps {
  symbol: string | null;
  onClose: () => void;
  timeframe: Timeframe;
}

export const AssetDetailModal: React.FC<AssetDetailModalProps> = ({
  symbol,
  onClose,
  timeframe: initialTimeframe
}) => {
  const [data, setData] = useState<AssetDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTf, setActiveTf] = useState<Timeframe>(initialTimeframe);
  const [alertSent, setAlertSent] = useState(false);

  useEffect(() => {
    if (!symbol) return;
    setLoading(true);
    fetchAssetDetail(symbol, activeTf)
      .then(res => setData(res))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [symbol, activeTf]);

  if (!symbol) return null;

  const handleSendAlert = async () => {
    try {
      await triggerTestAlert(symbol);
      setAlertSent(true);
      setTimeout(() => setAlertSent(false), 4000);
    } catch (e) {
      console.error(e);
    }
  };

  const signal = data?.activeSignal;
  const quote = data?.quote;
  const explanation = data?.aiExplanation;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-5xl bg-background-card border border-background-border rounded-2xl shadow-2xl overflow-hidden my-8 cyber-glass">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-6 border-b border-background-border bg-background-surface/40">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-cyan-500/20 to-emerald-500/20 border border-cyan-500/30 flex items-center justify-center text-xl font-bold font-mono text-cyan-400 shadow-glow-cyan">
              ${symbol}
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold text-slate-100">{data?.info?.name || symbol}</h2>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                  {data?.info?.category || 'Layer 1'}
                </span>
                <span className="text-xs font-mono text-slate-500">Rank #{data?.info?.rank || 1}</span>
              </div>
              <div className="flex items-center gap-3 text-sm font-mono mt-1">
                <span className="font-bold text-slate-200">${quote?.price?.toLocaleString()}</span>
                <span className={`font-bold ${quote?.change24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {quote?.change24h >= 0 ? `+${quote?.change24h}%` : `${quote?.change24h}%`} (24h)
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Timeframe selector inside modal */}
            <div className="flex items-center bg-background-surface border border-background-border rounded-lg p-0.5">
              {(['1h', '4h', '8h', '1d', '1w', '1m'] as Timeframe[]).map((tf) => (
                <button
                  key={tf}
                  onClick={() => setActiveTf(tf)}
                  className={`px-3 py-1 text-xs font-mono rounded-md transition-all ${
                    activeTf === tf
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tf.toUpperCase()}
                </button>
              ))}
            </div>

            <button
              onClick={handleSendAlert}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/30 text-xs font-mono transition-all"
            >
              <BellRing className="w-4 h-4" />
              <span>{alertSent ? 'Alert Dispatched!' : 'Telegram Alert'}</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-lg bg-background-surface text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        {loading ? (
          <div className="p-16 text-center text-slate-400 font-mono">
            <Zap className="w-8 h-8 mx-auto mb-3 animate-bounce text-cyan-400" />
            Calculating Money Line indicators & gathering AI thesis...
          </div>
        ) : (
          <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
            {/* Multi-Timeframe Confluence Grid (6 Timeframes) */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
              {(['1h', '4h', '8h', '1d', '1w', '1m'] as Timeframe[]).map((tf) => {
                const sig = data?.multiTimeframe?.[tf as keyof typeof data.multiTimeframe] as any;
                const isBull = sig?.tier?.includes('Bullish');
                const isBear = sig?.tier?.includes('Bearish');
                const rawRoi = sig?.roiPercent !== undefined 
                  ? sig.roiPercent 
                  : (sig?.rawIndicators?.roc9 !== undefined ? Number(sig.rawIndicators.roc9.toFixed(2)) : 0);
                const isRoiPos = rawRoi > 0;
                const isRoiNeg = rawRoi < 0;

                return (
                  <div
                    key={tf}
                    onClick={() => setActiveTf(tf)}
                    className={`cyber-glass rounded-xl p-3 border transition-all cursor-pointer space-y-1.5 ${
                      activeTf === tf
                        ? 'border-cyan-500/60 bg-cyan-500/10 shadow-glow-cyan'
                        : 'border-background-border hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] font-mono">
                      <span className="font-bold text-slate-200 uppercase">{tf}</span>
                      <span className={`px-1.5 py-0.2 rounded font-bold ${
                        isBull ? 'bg-emerald-500/20 text-emerald-300' :
                        (isBear ? 'bg-rose-500/20 text-rose-300' : 'bg-slate-800 text-slate-400')
                      }`}>
                        {sig?.tier || 'Neutral'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-[10px] text-slate-400">ROI:</span>
                      <span className={`font-bold text-[11px] ${
                        isRoiPos ? 'text-emerald-400' : (isRoiNeg ? 'text-rose-400' : 'text-slate-300')
                      }`}>
                        {isRoiPos ? `+${rawRoi}%` : `${rawRoi}%`}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-[10px] text-slate-400">Scor:</span>
                      <span className={`font-bold ${
                        isBull ? 'text-emerald-300' : (isBear ? 'text-rose-300' : 'text-slate-300')
                      }`}>
                        {sig?.score > 0 ? `+${sig.score}` : (sig?.score !== undefined ? sig.score : '-')}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Interactive Chart */}
            <InteractiveChart
              candles={data?.candles || []}
              symbol={symbol}
              marketClass={data?.info?.marketClass}
              timeframe={activeTf}
              onTimeframeChange={setActiveTf}
            />

            {/* Technical Indicator Matrix */}
            {signal && (
              <div className="cyber-glass rounded-xl p-4 border border-background-border">
                <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-cyan-400" />
                  Deterministic Indicator Matrix ({signal.version})
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 font-mono text-xs">
                  <div className="bg-background-surface p-2.5 rounded-lg border border-background-border">
                    <span className="text-[10px] text-slate-400 block">EMA 20</span>
                    <span className="font-bold text-slate-200">${signal.rawIndicators.ema20}</span>
                  </div>
                  <div className="bg-background-surface p-2.5 rounded-lg border border-background-border">
                    <span className="text-[10px] text-slate-400 block">EMA 50</span>
                    <span className="font-bold text-slate-200">${signal.rawIndicators.ema50}</span>
                  </div>
                  <div className="bg-background-surface p-2.5 rounded-lg border border-background-border">
                    <span className="text-[10px] text-slate-400 block">EMA 200</span>
                    <span className="font-bold text-slate-200">${signal.rawIndicators.ema200}</span>
                  </div>
                  <div className="bg-background-surface p-2.5 rounded-lg border border-background-border">
                    <span className="text-[10px] text-slate-400 block">MACD Hist</span>
                    <span className={`font-bold ${signal.rawIndicators.macd.histogram >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {signal.rawIndicators.macd.histogram}
                    </span>
                  </div>
                  <div className="bg-background-surface p-2.5 rounded-lg border border-background-border">
                    <span className="text-[10px] text-slate-400 block">RSI (14)</span>
                    <span className="font-bold text-slate-200">{signal.rawIndicators.rsi14} ({signal.rawIndicators.rsiRegime})</span>
                  </div>
                  <div className="bg-background-surface p-2.5 rounded-lg border border-background-border">
                    <span className="text-[10px] text-slate-400 block">RVOL / ATR %</span>
                    <span className="font-bold text-cyan-400">{signal.rawIndicators.rvol}x / {signal.rawIndicators.atrPercent}%</span>
                  </div>
                </div>
              </div>
            )}

            {/* AI Analyst Thesis */}
            {explanation && (
              <div className="cyber-glass rounded-xl p-5 border border-purple-500/30 bg-purple-500/5 space-y-4">
                <div className="flex items-center justify-between border-b border-purple-500/20 pb-3">
                  <div className="flex items-center gap-2">
                    <BrainCircuit className="w-5 h-5 text-purple-400" />
                    <h3 className="text-sm font-bold text-slate-100">AI Market Analyst Thesis</h3>
                  </div>
                  <span className="text-xs font-mono px-2.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40">
                    85% Model Confidence
                  </span>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed font-sans">
                  {explanation.technicalThesis}
                </p>

                {/* Support & Resistance */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-xs">
                  <div className="bg-background-surface/80 p-3 rounded-lg border border-emerald-500/20">
                    <span className="text-[11px] text-emerald-400 font-bold block mb-1">Key Support Zones</span>
                    <div className="flex gap-3 text-slate-200">
                      <span>S1: ${explanation.keySupportResistance.supportLevels[0]}</span>
                      <span>S2: ${explanation.keySupportResistance.supportLevels[1]}</span>
                    </div>
                  </div>
                  <div className="bg-background-surface/80 p-3 rounded-lg border border-rose-500/20">
                    <span className="text-[11px] text-rose-400 font-bold block mb-1">Key Resistance Zones</span>
                    <div className="flex gap-3 text-slate-200">
                      <span>R1: ${explanation.keySupportResistance.resistanceLevels[0]}</span>
                      <span>R2: ${explanation.keySupportResistance.resistanceLevels[1]}</span>
                    </div>
                  </div>
                </div>

                {/* Pro / Con Drivers */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <h4 className="font-bold text-emerald-400 mb-2 flex items-center gap-1.5">
                      <CheckCircle className="w-3.5 h-3.5" /> Bullish Catalysts
                    </h4>
                    <ul className="space-y-1.5 text-slate-300">
                      {explanation.bullishCatalysts.map((c: string, idx: number) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-emerald-400">•</span>
                          <span>{c}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-bold text-rose-400 mb-2 flex items-center gap-1.5">
                      <ShieldAlert className="w-3.5 h-3.5" /> Downside Risks
                    </h4>
                    <ul className="space-y-1.5 text-slate-300">
                      {explanation.downsideRisks.map((r: string, idx: number) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-rose-400">•</span>
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* Social & News Tabs in Modal */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* X Social Sentiment */}
              <div className="cyber-glass rounded-xl p-4 border border-background-border">
                <h4 className="text-xs font-mono uppercase text-slate-400 mb-3 flex items-center gap-2">
                  <Flame className="w-4 h-4 text-amber-400" />
                  X Community & Topic Velocity
                </h4>
                {data?.xTrends && data.xTrends.length > 0 ? (
                  <div className="space-y-2">
                    {data.xTrends.map((t: any) => (
                      <div key={t.id} className="p-2.5 rounded-lg bg-background-surface text-xs space-y-1">
                        <div className="flex justify-between font-mono font-bold">
                          <span className="text-cyan-300">{t.cashtag}</span>
                          <span className="text-amber-400">Velocity: {t.velocityScore}</span>
                        </div>
                        <p className="text-slate-300 text-[11px]">{t.topic}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 font-mono">No abnormal viral spikes on X right now.</p>
                )}
              </div>

              {/* News Stream */}
              <div className="cyber-glass rounded-xl p-4 border border-background-border">
                <h4 className="text-xs font-mono uppercase text-slate-400 mb-3 flex items-center gap-2">
                  <Newspaper className="w-4 h-4 text-cyan-400" />
                  Latest Related News
                </h4>
                {data?.news && data.news.length > 0 ? (
                  <div className="space-y-2">
                    {data.news.map((n: any) => (
                      <a
                        key={n.id}
                        href={n.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block p-2.5 rounded-lg bg-background-surface hover:bg-background-hover transition-colors text-xs space-y-1 group"
                      >
                        <div className="flex justify-between font-mono text-[10px] text-slate-400">
                          <span>{n.source}</span>
                          <span className="text-emerald-400">{n.sentiment}</span>
                        </div>
                        <p className="text-slate-200 font-medium group-hover:text-cyan-300 text-[11px] flex items-center justify-between">
                          <span>{n.title}</span>
                          <ExternalLink className="w-3 h-3 text-slate-500 ml-1 flex-shrink-0" />
                        </p>
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 font-mono">No direct breaking news in the last 24h.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
