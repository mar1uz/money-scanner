import React from 'react';
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
  Sparkles,
  RefreshCw,
  Layers
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
  loading?: boolean;
}

export const ScannerTable: React.FC<ScannerTableProps> = ({
  rows,
  onSelectAsset,
  watchlist,
  onToggleWatchlist,
  selectedTier,
  onSelectTier,
  watchlistOnly,
  onToggleWatchlistOnly,
  loading = false
}) => {
  const tiers: { id: string; label: string; color: string }[] = [
    { id: 'ALL', label: 'All Signals', color: 'text-slate-300' },
    { id: 'Strong Bullish', label: 'Strong Bullish', color: 'text-emerald-400' },
    { id: 'Bullish', label: 'Bullish', color: 'text-green-400' },
    { id: 'Neutral', label: 'Neutral', color: 'text-slate-400' },
    { id: 'Bearish', label: 'Bearish', color: 'text-rose-400' },
    { id: 'Strong Bearish', label: 'Strong Bearish', color: 'text-red-500' }
  ];

  const cleanWatchlist = watchlist.map(w => w.replace(/^[$#]/, '').trim().toUpperCase());

  const getScoreBadge = (score: number, tier: MoneyLineTier) => {
    let color = 'bg-slate-800 text-slate-300 border-slate-700';

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
    const sym = r.symbol.replace(/^[$#]/, '').trim().toUpperCase();
    if (watchlistOnly && !cleanWatchlist.includes(sym)) return false;
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

        <div className="flex items-center gap-2">
          <button
            onClick={onToggleWatchlistOnly}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-mono rounded-lg border transition-all ${
              watchlistOnly
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold shadow-glow-gold'
                : 'bg-background-surface text-slate-400 border-background-border hover:text-slate-200'
            }`}
          >
            <Star className={`w-3.5 h-3.5 ${watchlistOnly ? 'fill-amber-400 text-amber-400' : 'text-slate-400'}`} />
            <span>Watchlist Only ({cleanWatchlist.length})</span>
          </button>
        </div>
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
            {filteredRows.length > 0 ? (
              filteredRows.map((row) => {
                const sym = row.symbol.replace(/^[$#]/, '').trim().toUpperCase();
                const isWatch = cleanWatchlist.includes(sym);
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
                          title={isWatch ? "Remove from Watchlist" : "Add to Watchlist"}
                          className="text-slate-600 hover:text-amber-400 transition-colors p-1"
                        >
                          <Star className={`w-4 h-4 ${isWatch ? 'fill-amber-400 text-amber-400' : 'text-slate-600'}`} />
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
                    <td className="py-3.5 px-4 font-mono">
                      {getScoreBadge(row.moneyLineScore, row.tier)}
                    </td>

                    {/* Tier Status & Transition */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-slate-200">{row.tier}</span>
                        {row.isTransition && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 animate-pulse">
                            NEW
                          </span>
                        )}
                      </div>
                    </td>

                    {/* RVOL */}
                    <td className="py-3.5 px-4 font-mono text-slate-300">
                      <span className={row.rvol > 1.5 ? 'text-cyan-400 font-bold' : ''}>
                        {row.rvol.toFixed(2)}x
                      </span>
                    </td>

                    {/* ATR Volatility */}
                    <td className="py-3.5 px-4 font-mono text-slate-400">
                      {row.volatilityAtrPercent.toFixed(2)}%
                    </td>

                    {/* X Momentum */}
                    <td className="py-3.5 px-4 font-mono">
                      <span className="flex items-center gap-1 text-amber-400 font-semibold">
                        <Flame className="w-3.5 h-3.5" />
                        {row.xTrendScore.toFixed(1)}
                      </span>
                    </td>

                    {/* AI Bias */}
                    <td className="py-3.5 px-4 font-mono">
                      <span className="flex items-center gap-1 text-purple-300 text-xs font-medium">
                        <Sparkles className="w-3.5 h-3.5" />
                        {(row.aiConfidence * 100).toFixed(0)}%
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectAsset(row.symbol);
                        }}
                        className="p-1.5 rounded-lg bg-background-surface hover:bg-slate-800 text-slate-400 hover:text-cyan-300 transition-colors"
                        title="View Full-Page Deep Dive Analysis"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={10} className="py-14 text-center text-slate-400 font-mono space-y-3">
                  {loading ? (
                    <div className="space-y-2">
                      <RefreshCw className="w-6 h-6 mx-auto animate-spin text-cyan-400" />
                      <p className="text-sm font-bold text-slate-200">Se încarcă semnalele Live Money Scanner...</p>
                      <p className="text-xs text-slate-500">Se calculează matricea pe lumânările recente.</p>
                    </div>
                  ) : watchlistOnly ? (
                    <div className="space-y-3">
                      <Star className="w-6 h-6 mx-auto text-amber-400/80" />
                      <p className="text-sm font-bold text-slate-200">Niciun activ din Watchlist pentru filtrele selectate.</p>
                      <p className="text-xs text-slate-400">Active în Watchlist: <span className="text-cyan-300">{cleanWatchlist.join(', ') || 'Niciunul'}</span></p>
                      <button
                        onClick={onToggleWatchlistOnly}
                        className="px-3.5 py-1.5 text-xs font-bold font-mono rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/30 transition-all shadow-glow-cyan"
                      >
                        Afișează Toate Activele (50)
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <Filter className="w-6 h-6 mx-auto text-slate-500" />
                      <p className="text-sm font-bold text-slate-200">Niciun activ găsit pentru categoria "{selectedTier}".</p>
                      <button
                        onClick={() => onSelectTier('ALL')}
                        className="px-3.5 py-1.5 text-xs font-bold font-mono rounded-lg bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 transition-all"
                      >
                        Resetează Filtrele
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
