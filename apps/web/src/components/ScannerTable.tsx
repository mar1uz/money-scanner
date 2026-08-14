import React, { useState } from 'react';
import {
  AssetScannerRow,
  MoneyLineTier
} from '../types.js';
import {
  ArrowUpRight,
  ArrowDownRight,
  Flame,
  Star,
  Zap,
  Filter,
  Eye,
  Sparkles
} from 'lucide-react';

interface ScannerTableProps {
  rows: AssetScannerRow[];
  onSelectAsset: (symbol: string) => void;
  watchlist: string[];
  onToggleWatchlist: (symbol: string) => void;
  selectedTier: string;
  onSelectTier: (tier: string) => void;
  watchlistOnly: boolean;
  onToggleWatchlistOnly: () => void;
}

export const ScannerTable: React.FC<ScannerTableProps> = ({
  rows,
  onSelectAsset,
  watchlist,
  onToggleWatchlist,
  selectedTier,
  onSelectTier,
  watchlistOnly,
  onToggleWatchlistOnly
}) => {
  const tiers: { id: string; label: string; color: string }[] = [
    { id: 'ALL', label: 'All Signals', color: 'text-slate-300' },
    { id: 'Strong Bullish', label: 'Strong Bullish', color: 'text-emerald-400' },
    { id: 'Bullish', label: 'Bullish', color: 'text-green-400' },
    { id: 'Neutral', label: 'Neutral', color: 'text-slate-400' },
    { id: 'Bearish', label: 'Bearish', color: 'text-rose-400' },
    { id: 'Strong Bearish', label: 'Strong Bearish', color: 'text-red-500' }
  ];

  const getScoreBadge = (score: number, tier: MoneyLineTier) => {
    let color = 'bg-slate-800 text-slate-300 border-slate-700';
    let glow = '';

    if (tier === 'Strong Bullish') {
      color = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-glow-emerald';
    } else if (tier === 'Bullish') {
      color = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    } else if (tier === 'Bearish') {
      color = 'bg-rose-500/10 text-rose-400 border-rose-500/20';
    } else if (tier === 'Strong Bearish') {
      color = 'bg-rose-500/20 text-rose-300 border-rose-500/40 shadow-glow-ruby';
    }

    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-mono text-xs font-bold border ${color}`}>
        <Zap className="w-3 h-3" />
        {score > 0 ? `+${score}` : score}
      </span>
    );
  };

  const filteredRows = rows.filter(r => {
    if (watchlistOnly && !watchlist.includes(r.symbol)) return false;
    if (selectedTier !== 'ALL' && r.tier !== selectedTier) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-background-card/80 border border-background-border rounded-xl">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mr-2 font-mono">
            <Filter className="w-3.5 h-3.5 text-cyan-400" />
            <span>FILTER BY TIER:</span>
          </div>
          {tiers.map(t => (
            <button
              key={t.id}
              onClick={() => onSelectTier(t.id)}
              className={`px-3 py-1 text-xs font-mono rounded-lg transition-all border ${
                selectedTier === t.id
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-glow-cyan font-bold'
                  : 'bg-background-surface text-slate-400 border-background-border hover:border-slate-700 hover:text-slate-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <button
          onClick={onToggleWatchlistOnly}
          className={`flex items-center gap-1.5 px-3 py-1 text-xs font-mono rounded-lg border transition-all ${
            watchlistOnly
              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
              : 'bg-background-surface text-slate-400 border-background-border hover:text-slate-200'
          }`}
        >
          <Star className={`w-3.5 h-3.5 ${watchlistOnly ? 'fill-amber-400 text-amber-400' : 'text-slate-400'}`} />
          <span>Watchlist Only ({watchlist.length})</span>
        </button>
      </div>

      {/* Cyber Table */}
      <div className="overflow-x-auto rounded-xl border border-background-border cyber-glass">
        <table className="w-full text-left text-xs">
          <thead className="bg-background-surface/80 border-b border-background-border text-[11px] font-mono uppercase tracking-wider text-slate-400">
            <tr>
              <th className="py-3.5 px-4">Asset</th>
              <th className="py-3.5 px-4">Price</th>
              <th className="py-3.5 px-4">24h Change</th>
              <th className="py-3.5 px-4">Money Line</th>
              <th className="py-3.5 px-4">Tier Status</th>
              <th className="py-3.5 px-4">RVOL</th>
              <th className="py-3.5 px-4">Volatility (ATR)</th>
              <th className="py-3.5 px-4">X Momentum</th>
              <th className="py-3.5 px-4">AI Bias</th>
              <th className="py-3.5 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-background-border/50">
            {filteredRows.map((row) => {
              const isWatch = watchlist.includes(row.symbol);
              const isPositiveChange = row.change24h >= 0;

              return (
                <tr
                  key={row.symbol}
                  onClick={() => onSelectAsset(row.symbol)}
                  className="hover:bg-background-surface/60 transition-colors cursor-pointer group"
                >
                  {/* Symbol & Name */}
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleWatchlist(row.symbol);
                        }}
                        className="text-slate-600 hover:text-amber-400 transition-colors"
                      >
                        <Star className={`w-4 h-4 ${isWatch ? 'fill-amber-400 text-amber-400' : ''}`} />
                      </button>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-slate-100 group-hover:text-cyan-300 transition-colors font-mono">
                            ${row.symbol}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
                            {row.category}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-400">{row.name}</span>
                      </div>
                    </div>
                  </td>

                  {/* Price */}
                  <td className="py-3.5 px-4 font-mono font-semibold text-slate-200">
                    ${row.price < 1 ? row.price.toFixed(4) : row.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>

                  {/* 24h Change */}
                  <td className="py-3.5 px-4 font-mono">
                    <span className={`inline-flex items-center gap-0.5 font-bold ${
                      isPositiveChange ? 'text-emerald-400' : 'text-rose-400'
                    }`}>
                      {isPositiveChange ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                      {isPositiveChange ? `+${row.change24h}%` : `${row.change24h}%`}
                    </span>
                  </td>

                  {/* Money Line Score */}
                  <td className="py-3.5 px-4">
                    {getScoreBadge(row.moneyLineScore, row.tier)}
                  </td>

                  {/* Tier & Transition Badge */}
                  <td className="py-3.5 px-4 font-mono">
                    <div className="flex items-center gap-1.5">
                      <span className={`font-semibold ${
                        row.tier.includes('Bullish') ? 'text-emerald-400' : (row.tier.includes('Bearish') ? 'text-rose-400' : 'text-slate-400')
                      }`}>
                        {row.tier}
                      </span>
                      {row.isTransition && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 uppercase font-bold animate-pulse">
                          NEW
                        </span>
                      )}
                    </div>
                  </td>

                  {/* RVOL */}
                  <td className="py-3.5 px-4 font-mono">
                    <span className={`font-medium ${row.rvol >= 1.8 ? 'text-cyan-400 font-bold' : 'text-slate-300'}`}>
                      {row.rvol}x
                    </span>
                  </td>

                  {/* Volatility */}
                  <td className="py-3.5 px-4 font-mono text-slate-400">
                    {row.volatilityAtrPercent}%
                  </td>

                  {/* X Trend Momentum */}
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-1 font-mono text-slate-300">
                      <Flame className={`w-3.5 h-3.5 ${row.xTrendScore > 40 ? 'text-amber-400' : 'text-slate-500'}`} />
                      <span>{row.xTrendScore}</span>
                    </div>
                  </td>

                  {/* AI Bias */}
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-1 font-mono text-xs">
                      <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                      <span className="text-slate-300">88% Conf</span>
                    </div>
                  </td>

                  {/* Action Button */}
                  <td className="py-3.5 px-4 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectAsset(row.symbol);
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1 rounded bg-slate-800 hover:bg-cyan-500/20 hover:text-cyan-300 hover:border-cyan-500/30 text-slate-300 border border-slate-700 transition-all font-mono text-xs"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Deep-Dive</span>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
