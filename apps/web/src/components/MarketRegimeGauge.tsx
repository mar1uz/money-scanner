import React from 'react';
import { MarketOverviewSummary } from '../types.js';
import { TrendingUp, TrendingDown, Layers, Activity, DollarSign } from 'lucide-react';

interface MarketRegimeGaugeProps {
  overview: MarketOverviewSummary | null;
}

export const MarketRegimeGauge: React.FC<MarketRegimeGaugeProps> = ({ overview }) => {
  if (!overview) return null;

  const score = overview.regimeScore;
  const isBull = score >= 20;
  const isBear = score <= -20;

  const colorClass = isBull 
    ? 'text-cyber-emerald border-cyber-emerald/40 bg-cyber-emerald/10'
    : isBear 
    ? 'text-cyber-ruby border-cyber-ruby/40 bg-cyber-ruby/10'
    : 'text-slate-300 border-slate-700 bg-slate-800/40';

  const glowClass = isBull 
    ? 'shadow-glow-emerald' 
    : isBear 
    ? 'shadow-glow-ruby' 
    : '';

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {/* Regime Card */}
      <div className={`cyber-glass rounded-xl p-4 border transition-all ${glowClass}`}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs uppercase font-mono tracking-wider text-slate-400">Market Regime</span>
          <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${colorClass}`}>
            {score > 0 ? `+${score}` : score} / 100
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isBull ? (
            <TrendingUp className="w-6 h-6 text-cyber-emerald flex-shrink-0" />
          ) : isBear ? (
            <TrendingDown className="w-6 h-6 text-cyber-ruby flex-shrink-0" />
          ) : (
            <Activity className="w-6 h-6 text-slate-400 flex-shrink-0" />
          )}
          <div>
            <h3 className="text-base font-bold text-slate-100">{overview.regime}</h3>
            <p className="text-[11px] text-slate-400">Money Line Macro Composite</p>
          </div>
        </div>
      </div>

      {/* Market Breadth */}
      <div className="cyber-glass rounded-xl p-4 border border-background-border">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs uppercase font-mono tracking-wider text-slate-400">Market Breadth</span>
          <span className="text-xs font-mono font-bold text-cyber-cyan">
            {overview.marketBreadth.bullishPercent}% Bullish
          </span>
        </div>
        {/* Breadth Bar */}
        <div className="w-full h-2 rounded-full bg-slate-800 flex overflow-hidden my-2">
          <div 
            className="bg-cyber-emerald h-full transition-all duration-500" 
            style={{ width: `${(overview.marketBreadth.advancingCount / 50) * 100}%` }}
          />
          <div 
            className="bg-slate-500 h-full transition-all duration-500" 
            style={{ width: `${(overview.marketBreadth.neutralCount / 50) * 100}%` }}
          />
          <div 
            className="bg-cyber-ruby h-full transition-all duration-500" 
            style={{ width: `${(overview.marketBreadth.decliningCount / 50) * 100}%` }}
          />
        </div>
        <div className="flex justify-between text-[11px] text-slate-400 font-mono">
          <span className="text-emerald-400">{overview.marketBreadth.advancingCount} Up</span>
          <span className="text-slate-400">{overview.marketBreadth.neutralCount} Neutral</span>
          <span className="text-rose-400">{overview.marketBreadth.decliningCount} Down</span>
        </div>
      </div>

      {/* Total Market Cap & Volume */}
      <div className="cyber-glass rounded-xl p-4 border border-background-border">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs uppercase font-mono tracking-wider text-slate-400">Global Liquidity</span>
          <Layers className="w-4 h-4 text-cyan-400" />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-bold font-mono text-slate-100">$2.38T</span>
          <span className="text-xs text-slate-400 font-mono">Cap</span>
        </div>
        <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono mt-1">
          <span>24h Vol: ${(overview.total24hVolume / 1e9).toFixed(1)}B</span>
          <span className="text-cyan-400">BTC Dom: {overview.btcDominance}%</span>
        </div>
      </div>

      {/* Volatility & Freshness */}
      <div className="cyber-glass rounded-xl p-4 border border-background-border">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs uppercase font-mono tracking-wider text-slate-400">Volatility Index</span>
          <Activity className="w-4 h-4 text-amber-400" />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-bold font-mono text-amber-300">{overview.volatilityIndex}</span>
          <span className="text-xs text-slate-400 font-mono">/ 100 (Moderate)</span>
        </div>
        <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono mt-1">
          <span>Provider: Binance</span>
          <span className="text-emerald-400 font-mono">{overview.providerStatus.latencyMs}ms latency</span>
        </div>
      </div>
    </div>
  );
};
