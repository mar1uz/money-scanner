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
  Sparkles,
  RefreshCw,
  Clock,
  Coins,
  TrendingUp,
  Layers,
  Award
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
  const [selectedMarketClass, setSelectedMarketClass] = useState<'ALL' | 'crypto' | 'stocks' | 'metals'>('ALL');

  const tiers: { id: string; label: string; color: string }[] = [
    { id: 'ALL', label: 'Toate Semnalele', color: 'text-slate-300' },
    { id: 'Strong Bullish', label: 'Strong Bullish', color: 'text-emerald-400' },
    { id: 'Bullish', label: 'Bullish', color: 'text-green-400' },
    { id: 'Neutral', label: 'Neutral', color: 'text-slate-400' },
    { id: 'Bearish', label: 'Bearish', color: 'text-rose-400' },
    { id: 'Strong Bearish', label: 'Strong Bearish', color: 'text-red-500' }
  ];

  const marketClasses = [
    { id: 'ALL', label: 'Trading 360° (All)', icon: Layers },
    { id: 'crypto', label: 'Crypto 🪙', icon: Coins },
    { id: 'stocks', label: 'Stocks & Tech 📈', icon: TrendingUp },
    { id: 'metals', label: 'Metale & Gold 🥇', icon: Award }
  ];

  const cleanWatchlist = watchlist.map(w => w.replace(/^[$#]/, '').trim().toUpperCase());

  // Helper for human-readable flip age
  const formatFlipAge = (ts?: number) => {
    if (!ts) return 'Recent';
    const diff = Math.max(0, Date.now() - ts);
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (mins < 1) return 'Chiar acum';
    if (mins < 60) return `acum ${mins}m`;
    if (hours < 24) {
      const remMins = mins % 60;
      return `acum ${hours}h${remMins > 0 ? ` ${remMins}m` : ''}`;
    }
    const remHours = hours % 24;
    return `acum ${days}z${remHours > 0 ? ` ${remHours}h` : ''}`;
  };

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

  // Filter rows based on tier, watchlist, and 360° market class
  const filteredRows = rows.filter(r => {
    const sym = r.symbol.replace(/^[$#]/, '').trim().toUpperCase();
    if (watchlistOnly && !cleanWatchlist.includes(sym)) return false;
    if (selectedTier !== 'ALL' && r.tier !== selectedTier) return false;

    if (selectedMarketClass !== 'ALL') {
      const isStock = ['NVDA', 'TSLA', 'AAPL', 'MSFT', 'MSTR', 'COIN', 'SPY', 'QQQ'].includes(sym) || r.category?.includes('Stock') || r.category?.includes('Index') || r.category?.includes('Mega-Cap');
      const isMetal = ['XAU', 'XAG', 'PAXG', 'OIL', 'COPPER'].includes(sym) || r.category?.includes('Metal') || r.category?.includes('Commodity');
      const isCrypto = !isStock && !isMetal;

      if (selectedMarketClass === 'stocks' && !isStock) return false;
      if (selectedMarketClass === 'metals' && !isMetal) return false;
      if (selectedMarketClass === 'crypto' && !isCrypto) return false;
    }

    return true;
  });

  return (
    <div className="space-y-4">
      {/* 360° Market Class & Tier Filter Toolbar */}
      <div className="space-y-3 p-4 bg-background-card/90 border border-background-border rounded-2xl cyber-glass shadow-xl">
        {/* Top Filter: 360° Market Selector */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-background-border/60">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-slate-400 font-bold uppercase tracking-wider">
              Piață 360°:
            </span>
            <div className="flex flex-wrap items-center bg-background-surface border border-background-border rounded-xl p-0.5">
              {marketClasses.map(mc => (
                <button
                  key={mc.id}
                  onClick={() => setSelectedMarketClass(mc.id as any)}
                  className={`px-3 py-1.5 text-xs font-mono rounded-lg transition-all flex items-center gap-1.5 ${
                    selectedMarketClass === mc.id
                      ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-cyan-300 border border-cyan-500/40 font-bold shadow-glow-cyan'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <mc.icon className="w-3.5 h-3.5" />
                  <span>{mc.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onToggleWatchlistOnly}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-mono rounded-xl border transition-all ${
                watchlistOnly
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold shadow-glow-gold'
                  : 'bg-background-surface text-slate-400 border-background-border hover:text-slate-200'
              }`}
            >
              <Star className={`w-3.5 h-3.5 ${watchlistOnly ? 'fill-amber-400 text-amber-400' : 'text-slate-400'}`} />
              <span>Watchlist ({cleanWatchlist.length})</span>
            </button>
          </div>
        </div>

        {/* Bottom Filter: Tier Status Chips */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mr-2 font-mono">
            <Filter className="w-3.5 h-3.5 text-cyan-400" />
            <span>FILTRU TIER:</span>
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
      </div>

      {/* Cyber Table with Dedicated Flip Timer Column */}
      <div className="overflow-x-auto rounded-2xl border border-background-border cyber-glass shadow-2xl">
        <table className="w-full text-left text-xs">
          <thead className="bg-background-surface/80 border-b border-background-border text-[11px] font-mono uppercase tracking-wider text-slate-400">
            <tr>
              <th className="py-3.5 px-4">Asset</th>
              <th className="py-3.5 px-4">Preț</th>
              <th className="py-3.5 px-4">Variație 24h</th>
              <th className="py-3.5 px-4">Scor Money Line</th>
              <th className="py-3.5 px-4">Regim / Tier</th>
              <th className="py-3.5 px-4 text-cyan-300">De Când este Flip (Timp)</th>
              <th className="py-3.5 px-4">RVOL</th>
              <th className="py-3.5 px-4">Volatilitate ATR</th>
              <th className="py-3.5 px-4">X Momentum</th>
              <th className="py-3.5 px-4">AI Bias</th>
              <th className="py-3.5 px-4 text-right">Acțiuni</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-background-border/50">
            {filteredRows.length > 0 ? (
              filteredRows.map((row) => {
                const sym = row.symbol.replace(/^[$#]/, '').trim().toUpperCase();
                const isWatch = cleanWatchlist.includes(sym);
                const isPositiveChange = row.change24h >= 0;
                const isBull = row.tier?.includes('Bullish');
                const isBear = row.tier?.includes('Bearish');

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
                          title={isWatch ? "Elimină din Watchlist" : "Adaugă în Watchlist"}
                          className="text-slate-600 hover:text-amber-400 transition-colors p-1"
                        >
                          <Star className={`w-4 h-4 ${isWatch ? 'fill-amber-400 text-amber-400' : 'text-slate-600'}`} />
                        </button>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-slate-100 group-hover:text-cyan-300 transition-colors font-mono">
                              ${row.symbol}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono border border-slate-700">
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
                        <span className={`font-mono text-xs font-bold ${
                          isBull ? 'text-emerald-400' : (isBear ? 'text-rose-400' : 'text-slate-300')
                        }`}>
                          {row.tier}
                        </span>
                        {row.isTransition && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 animate-pulse">
                            NEW
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Dedicated Column: De Când este Flip (Flip Age) */}
                    <td className="py-3.5 px-4 font-mono">
                      {row.isTransition ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 animate-pulse shadow-glow-cyan">
                          <Zap className="w-3.5 h-3.5" /> FLIP NOU (Acum)
                        </span>
                      ) : (
                        <div className="flex items-center gap-1.5 text-xs">
                          <Clock className={`w-3.5 h-3.5 ${isBull ? 'text-emerald-400' : (isBear ? 'text-rose-400' : 'text-cyan-400')}`} />
                          <span className={`font-semibold ${isBull ? 'text-emerald-300' : (isBear ? 'text-rose-300' : 'text-slate-300')}`}>
                            {formatFlipAge(row.lastSignalChangeTime)}
                          </span>
                        </div>
                      )}
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
                        className="p-1.5 rounded-xl bg-background-surface hover:bg-slate-800 text-slate-400 hover:text-cyan-300 border border-transparent hover:border-cyan-500/30 transition-all shadow-sm"
                        title="Deschide Analiza Deep Dive"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={11} className="py-14 text-center text-slate-400 font-mono space-y-3">
                  {loading ? (
                    <div className="space-y-2">
                      <RefreshCw className="w-6 h-6 mx-auto animate-spin text-cyan-400" />
                      <p className="text-sm font-bold text-slate-200">Se încarcă semnalele Live Money Scanner...</p>
                      <p className="text-xs text-slate-500">Se sincronizează datele de piață 360°.</p>
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
                        Afișează Toate Activele 360°
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <Filter className="w-6 h-6 mx-auto text-slate-500" />
                      <p className="text-sm font-bold text-slate-200">Niciun activ găsit pentru filtrele curente.</p>
                      <button
                        onClick={() => { onSelectTier('ALL'); setSelectedMarketClass('ALL'); }}
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
