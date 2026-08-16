import React, { useState } from 'react';
import { NarrativeSummary, AssetScannerRow } from '../types.js';
import {
  X,
  TrendingUp,
  TrendingDown,
  Layers,
  ArrowUpRight,
  Search,
  ExternalLink,
  ShieldCheck,
  Zap,
  Star,
  Award
} from 'lucide-react';

interface NarrativeDetailModalProps {
  narrative: NarrativeSummary | null;
  rows: AssetScannerRow[];
  onClose: () => void;
  onSelectAsset: (symbol: string) => void;
  watchlist: string[];
  onToggleWatchlist: (symbol: string) => void;
}

export const NarrativeDetailModal: React.FC<NarrativeDetailModalProps> = ({
  narrative,
  rows,
  onClose,
  onSelectAsset,
  watchlist,
  onToggleWatchlist
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<'marketCap' | 'change24h' | 'changeYtd' | 'moneyLineScore' | 'name'>('marketCap');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  if (!narrative) return null;

  // Filter rows belonging to this narrative
  const constituentRows = rows.filter(r => 
    narrative.symbols.includes(r.symbol) || r.narratives?.includes(narrative.id)
  );

  const filteredRows = constituentRows.filter(r => {
    const q = searchTerm.toLowerCase();
    return (
      r.symbol.toLowerCase().includes(q) ||
      r.name.toLowerCase().includes(q) ||
      r.category.toLowerCase().includes(q)
    );
  });

  const sortedRows = [...filteredRows].sort((a, b) => {
    let valA = a[sortField] || 0;
    let valB = b[sortField] || 0;
    if (typeof valA === 'string') {
      return sortOrder === 'asc' 
        ? (valA as string).localeCompare(valB as string) 
        : (valB as string).localeCompare(valA as string);
    }
    return sortOrder === 'asc' ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
  });

  const formatMarketCap = (cap?: number) => {
    if (!cap) return '-';
    if (cap >= 1e12) return `$${(cap / 1e12).toFixed(2)}T`;
    if (cap >= 1e9) return `$${(cap / 1e9).toFixed(1)}B`;
    if (cap >= 1e6) return `$${(cap / 1e6).toFixed(0)}M`;
    return `$${cap.toLocaleString()}`;
  };

  const isPos = narrative.avgChange24h >= 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-fade-in">
      <div 
        className="relative w-full max-w-4xl max-h-[90vh] flex flex-col bg-background-card border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between p-5 border-b border-white/[0.06] bg-background-surface/50">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 text-xs font-mono font-semibold">
                Narativă AI
              </span>
              <h2 className="text-lg font-bold text-slate-100 font-sans">
                {narrative.name}
              </h2>
            </div>
            <p className="text-xs text-slate-400 font-sans max-w-xl leading-relaxed">
              {narrative.tagline}
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/[0.06] transition-all"
            title="Închide"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Narrative Metrics Ribbon */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-background-surface/30 border-b border-white/[0.04] text-xs font-mono">
          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
            <span className="text-slate-500 block text-[10px] uppercase">Variație Medie 24h</span>
            <div className={`flex items-center gap-1 text-sm font-bold mt-0.5 ${
              isPos ? 'text-emerald-400' : 'text-rose-400'
            }`}>
              {isPos ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              <span>{isPos ? `+${narrative.avgChange24h}%` : `${narrative.avgChange24h}%`}</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
            <span className="text-slate-500 block text-[10px] uppercase">Market Cap Total</span>
            <span className="text-sm font-bold text-slate-200 block mt-0.5">
              {formatMarketCap(narrative.totalMarketCap)}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
            <span className="text-slate-500 block text-[10px] uppercase">Bullish Confluence</span>
            <span className="text-sm font-bold text-cyan-300 block mt-0.5">
              {narrative.bullishPercent}% Active Bull
            </span>
          </div>

          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
            <span className="text-slate-500 block text-[10px] uppercase">Compoziție Sector</span>
            <span className="text-sm font-bold text-slate-300 block mt-0.5">
              {narrative.assetCount} Firme / Tokenuri
            </span>
          </div>
        </div>

        {/* Search & Sort Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-white/[0.04]">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Caută firmă sau ticker în această narativă..."
              className="w-full pl-9 pr-4 py-1.5 text-xs font-mono bg-white/[0.03] border border-white/[0.08] rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
            />
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
            <span>Sortează:</span>
            <button
              onClick={() => {
                if (sortField === 'marketCap') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                else { setSortField('marketCap'); setSortOrder('desc'); }
              }}
              className={`px-2.5 py-1 rounded-lg border transition-all ${
                sortField === 'marketCap'
                  ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30 font-bold'
                  : 'bg-white/[0.02] border-white/[0.04] text-slate-400 hover:text-slate-200'
              }`}
            >
              Market Cap {sortField === 'marketCap' && (sortOrder === 'desc' ? '▼' : '▲')}
            </button>
            <button
              onClick={() => {
                if (sortField === 'change24h') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                else { setSortField('change24h'); setSortOrder('desc'); }
              }}
              className={`px-2.5 py-1 rounded-lg border transition-all ${
                sortField === 'change24h'
                  ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30 font-bold'
                  : 'bg-white/[0.02] border-white/[0.04] text-slate-400 hover:text-slate-200'
              }`}
            >
              24h % {sortField === 'change24h' && (sortOrder === 'desc' ? '▼' : '▲')}
            </button>
            <button
              onClick={() => {
                if (sortField === 'changeYtd') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                else { setSortField('changeYtd'); setSortOrder('desc'); }
              }}
              className={`px-2.5 py-1 rounded-lg border transition-all ${
                sortField === 'changeYtd'
                  ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30 font-bold'
                  : 'bg-white/[0.02] border-white/[0.04] text-slate-400 hover:text-slate-200'
              }`}
            >
              YTD % {sortField === 'changeYtd' && (sortOrder === 'desc' ? '▼' : '▲')}
            </button>
            <button
              onClick={() => {
                if (sortField === 'moneyLineScore') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                else { setSortField('moneyLineScore'); setSortOrder('desc'); }
              }}
              className={`px-2.5 py-1 rounded-lg border transition-all ${
                sortField === 'moneyLineScore'
                  ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30 font-bold'
                  : 'bg-white/[0.02] border-white/[0.04] text-slate-400 hover:text-slate-200'
              }`}
            >
              Scor ML {sortField === 'moneyLineScore' && (sortOrder === 'desc' ? '▼' : '▲')}
            </button>
          </div>
        </div>

        {/* Constituent Assets Table */}
        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          {sortedRows.length > 0 ? (
            <div className="divide-y divide-white/[0.04]">
              {sortedRows.map((asset) => {
                const isWatchlisted = watchlist.includes(asset.symbol.toUpperCase());
                const isChangePos = asset.change24h >= 0;
                const isBull = asset.tier?.includes('Bullish');
                const isBear = asset.tier?.includes('Bearish');

                return (
                  <div
                    key={asset.symbol}
                    onClick={() => {
                      onClose();
                      onSelectAsset(asset.symbol);
                    }}
                    className="flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-white/[0.04] transition-colors cursor-pointer group"
                  >
                    {/* Left: Star + Symbol + Name */}
                    <div className="flex items-center gap-3 min-w-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleWatchlist(asset.symbol);
                        }}
                        className={`p-1 rounded transition-colors ${
                          isWatchlisted ? 'text-amber-400' : 'text-slate-600 hover:text-slate-400'
                        }`}
                        title={isWatchlisted ? 'Scoate din Watchlist' : 'Adaugă în Watchlist'}
                      >
                        <Star className={`w-3.5 h-3.5 ${isWatchlisted ? 'fill-amber-400' : ''}`} />
                      </button>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-100 text-sm group-hover:text-cyan-300 transition-colors">
                            ${asset.symbol}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white/[0.04] text-slate-400 border border-white/[0.04]">
                            {asset.category}
                          </span>
                        </div>
                        <span className="text-xs text-slate-400 truncate block font-sans">
                          {asset.name}
                        </span>
                      </div>
                    </div>

                    {/* Middle: Market Cap & Price */}
                    <div className="hidden sm:flex flex-col items-end font-mono">
                      <span className="text-xs font-semibold text-slate-200">
                        ${asset.price < 1 ? asset.price.toFixed(4) : asset.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        Cap: {formatMarketCap(asset.marketCap)}
                      </span>
                    </div>

                    {/* Right: 24h & YTD Performance + Tier + Drilldown */}
                    <div className="flex items-center gap-4">
                      {/* Performance Badges */}
                      <div className="flex flex-col items-end font-mono text-xs font-bold min-w-[75px]">
                        <span className={isChangePos ? 'text-emerald-400' : 'text-rose-400'}>
                          {isChangePos ? `+${asset.change24h}%` : `${asset.change24h}%`} <span className="text-[10px] text-slate-500 font-normal">24h</span>
                        </span>
                        {asset.changeYtd !== undefined && (
                          <span className={`text-[11px] ${asset.changeYtd >= 0 ? 'text-emerald-400/90' : 'text-rose-400/90'}`}>
                            {asset.changeYtd >= 0 ? `+${asset.changeYtd}%` : `${asset.changeYtd}%`} <span className="text-[10px] text-slate-500 font-normal">YTD</span>
                          </span>
                        )}
                      </div>

                      {/* Tier Badge */}
                      <div className={`hidden md:flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono font-semibold border ${
                        isBull 
                          ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                          : (isBear 
                            ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                            : 'bg-slate-800 text-slate-300 border-slate-700')
                      }`}>
                        <span>{asset.tier}</span>
                        <span className="text-slate-400">({asset.moneyLineScore > 0 ? `+${asset.moneyLineScore}` : asset.moneyLineScore})</span>
                      </div>

                      {/* Action Arrow */}
                      <div className="p-1.5 rounded-lg text-slate-500 group-hover:text-cyan-300 group-hover:bg-cyan-500/10 transition-colors">
                        <ArrowUpRight className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-8 text-center text-slate-500 font-mono text-xs">
              Niciun asset găsit pentru căutarea "{searchTerm}".
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-white/[0.06] bg-background-surface/50 text-xs font-mono text-slate-500">
          <span>Afișate {sortedRows.length} din {constituentRows.length} active</span>
          <span className="text-cyan-400/80">Click pe orice rând pentru a deschide graficul TradingView</span>
        </div>
      </div>
    </div>
  );
};
