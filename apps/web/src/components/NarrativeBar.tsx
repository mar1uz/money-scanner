import React from 'react';
import { NarrativeSummary, MarketNarrativeId, Timeframe } from '../types.js';
import { useLanguage } from '../i18n.js';
import {
  BrainCircuit,
  Cpu,
  ShoppingBag,
  Cloud,
  Flame,
  Rocket,
  Layers,
  Coins,
  BarChart3,
  ShoppingCart,
  Gem,
  Factory,
  BatteryCharging,
  Boxes,
  Bot,
  Smile,
  Network,
  Landmark,
  Gamepad2,
  TrendingUp,
  TrendingDown,
  ChevronRight,
  Sparkles,
  SlidersHorizontal,
  X,
  Eye
} from 'lucide-react';

interface NarrativeBarProps {
  narratives: NarrativeSummary[];
  selectedNarrative: MarketNarrativeId | 'ALL';
  onSelectNarrative: (narrativeId: MarketNarrativeId | 'ALL') => void;
  onInspectNarrative: (narrative: NarrativeSummary) => void;
  timeframe: Timeframe;
  loading?: boolean;
}

const NARRATIVE_ICONS: Record<string, React.FC<{ className?: string }>> = {
  BrainCircuit,
  Cpu,
  ShoppingBag,
  Cloud,
  Flame,
  Rocket,
  Layers,
  Coins,
  BarChart3,
  ShoppingCart,
  Gem,
  Factory,
  BatteryCharging,
  Boxes,
  Bot,
  Smile,
  Network,
  Landmark,
  Gamepad2
};

export const NarrativeBar: React.FC<NarrativeBarProps> = ({
  narratives,
  selectedNarrative,
  onSelectNarrative,
  onInspectNarrative,
  timeframe,
  loading = false
}) => {
  const { language } = useLanguage();
  const formatMarketCap = (cap?: number) => {
    if (!cap) return '-';
    if (cap >= 1e12) return `$${(cap / 1e12).toFixed(2)}T`;
    if (cap >= 1e9) return `$${(cap / 1e9).toFixed(1)}B`;
    if (cap >= 1e6) return `$${(cap / 1e6).toFixed(0)}M`;
    return `$${cap.toLocaleString()}`;
  };

  return (
    <div className="space-y-3">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
            <Sparkles className="w-4 h-4 text-cyan-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold tracking-wider uppercase font-mono text-slate-200">
                {language === 'ro'
                  ? 'Narative & Sectoare Alpha · Categorii Multi-Asset'
                  : 'Alpha Narratives & Sectors · Multi-Asset Categories'}
              </h2>
              {selectedNarrative !== 'ALL' && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-semibold">
                  Filtru Activ
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 font-sans">
              {language === 'ro'
                ? `Performanță agregată pe ultima lumânare ${timeframe.toUpperCase()} închisă și compoziție după Market Cap`
                : `Aggregated performance on the latest closed ${timeframe.toUpperCase()} candle and Market Cap composition`}
            </p>
          </div>
        </div>

        {selectedNarrative !== 'ALL' && (
          <button
            onClick={() => onSelectNarrative('ALL')}
            className="flex items-center gap-1.5 px-3 py-1 text-xs font-mono font-medium rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-cyan-300 border border-white/[0.08] transition-all"
          >
            <X className="w-3.5 h-3.5" />
            <span>Resetează la Toate Activele</span>
          </button>
        )}
      </div>

      {/* Horizontal Scrollable / Grid Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 xl:grid-cols-8 gap-2.5">
        {narratives.map((n) => {
          const isSelected = selectedNarrative === n.id;
          const performance = n.avgChangePercent ?? n.avgChange24h;
          const isPositive = performance >= 0;
          const IconComponent = NARRATIVE_ICONS[n.icon] || Sparkles;

          return (
            <div
              key={n.id}
              onClick={() => onSelectNarrative(isSelected ? 'ALL' : n.id)}
              className={`group relative flex flex-col justify-between p-3 rounded-xl border transition-all cursor-pointer select-none ${
                isSelected
                  ? 'bg-cyan-500/[0.08] border-cyan-500/50 shadow-glow-cyan'
                  : 'bg-background-card/80 hover:bg-background-hover/80 border-white/[0.05] hover:border-white/[0.15]'
              }`}
            >
              {/* Card Top: Icon + Count */}
              <div className="flex items-center justify-between mb-2">
                <div className={`p-1.5 rounded-lg border transition-colors ${
                  isSelected
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                    : 'bg-white/[0.03] text-slate-400 border-white/[0.06] group-hover:text-slate-200'
                }`}>
                  <IconComponent className="w-3.5 h-3.5" />
                </div>

                <span className="text-[10px] font-mono text-slate-500 group-hover:text-slate-400">
                  {n.assetCount} active
                </span>
              </div>

              {/* Card Middle: Title */}
              <div className="mb-2">
                <h3 className={`text-xs font-semibold truncate leading-tight transition-colors ${
                  isSelected ? 'text-cyan-200 font-bold' : 'text-slate-200 group-hover:text-white'
                }`} title={n.name}>
                  {n.shortName}
                </h3>
                <span className="text-[10px] font-mono text-slate-500 block truncate">
                  {formatMarketCap(n.totalMarketCap)}
                </span>
              </div>

              {/* Card Bottom: % Performance Badge + Inspect Button */}
              <div className="pt-2 border-t border-white/[0.04] flex items-end justify-between gap-1">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[8px] uppercase tracking-wide font-mono text-slate-500">Medie {timeframe.toUpperCase()}</span>
                  <div className={`flex items-center gap-1 font-mono text-xs font-bold ${
                    isPositive ? 'text-emerald-400' : 'text-rose-400'
                  }`}>
                    {isPositive ? (
                      <TrendingUp className="w-3 h-3" />
                    ) : (
                      <TrendingDown className="w-3 h-3" />
                    )}
                    <span>{isPositive ? `+${performance}%` : `${performance}%`}</span>
                  </div>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onInspectNarrative(n);
                  }}
                  title="Inspectează toate firmele din această narativă"
                  className="p-1 rounded text-slate-500 hover:text-cyan-300 hover:bg-white/[0.06] transition-colors"
                >
                  <Eye className="w-3 h-3" />
                </button>
              </div>

              {/* Active Indicator Strip */}
              {isSelected && (
                <div className="absolute top-0 left-3 right-3 h-[2px] rounded-full bg-cyan-400 shadow-glow-cyan" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
