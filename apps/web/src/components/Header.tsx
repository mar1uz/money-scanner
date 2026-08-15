import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Activity,
  Shield,
  Zap,
  Search,
  BellRing,
  X,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  Star,
  Check,
  RefreshCw,
  CornerDownLeft
} from 'lucide-react';
import { Timeframe, AssetScannerRow } from '../types.js';
import { buildSearchUniverse, performAISearchMatch, SearchMatchResult } from '../services/ai-search.js';

interface HeaderProps {
  timeframe: Timeframe;
  onTimeframeChange: (tf: Timeframe) => void;
  onSearchClick: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onTriggerTestAlert: () => void;
  isStale?: boolean;
  allAssets?: AssetScannerRow[];
  onSelectAsset?: (symbol: string) => void;
  watchlist?: string[];
  onToggleWatchlist?: (symbol: string) => void;
  onRefreshMarket?: () => void;
  isRefreshing?: boolean;
  onLogoClick?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  timeframe,
  onTimeframeChange,
  searchQuery,
  onSearchChange,
  onTriggerTestAlert,
  isStale = false,
  allAssets = [],
  onSelectAsset,
  watchlist = [],
  onToggleWatchlist,
  onRefreshMarket,
  isRefreshing = false,
  onLogoClick
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Build semantic searchable asset universe
  const searchUniverse = useMemo(() => buildSearchUniverse(allAssets), [allAssets]);

  // AI Semantic Approximate Matcher
  const matchingAssets: SearchMatchResult[] = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return performAISearchMatch(searchQuery, searchUniverse);
  }, [searchQuery, searchUniverse]);

  // Reset highlighted index when search changes
  useEffect(() => {
    setHighlightedIndex(0);
  }, [searchQuery]);

  // Global Type-to-Search Listener: Typing anywhere in app opens and types in search
  useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      
      const activeEl = document.activeElement;
      const isInputActive = activeEl && (
        activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        activeEl.tagName === 'SELECT' ||
        (activeEl as HTMLElement).isContentEditable
      );

      if (isInputActive) {
        if (e.key === 'Escape') {
          setIsDropdownOpen(false);
          (activeEl as HTMLElement).blur();
        }
        return;
      }

      // Check if it's a printable character (letters, numbers, symbols)
      if (e.key.length === 1 && !e.repeat) {
        if (searchInputRef.current) {
          searchInputRef.current.focus();
          onSearchChange(e.key);
          setIsDropdownOpen(true);
          setHighlightedIndex(0);
          e.preventDefault();
        }
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [onSearchChange]);

  const rawQuery = searchQuery.trim().replace(/^[$#]/, '');

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard navigation handler for Search Input
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isDropdownOpen) {
        setIsDropdownOpen(true);
        setHighlightedIndex(0);
        return;
      }
      if (matchingAssets.length === 0) return;
      const nextIndex = (highlightedIndex + 1) % matchingAssets.length;
      setHighlightedIndex(nextIndex);
      itemRefs.current[nextIndex]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isDropdownOpen) {
        setIsDropdownOpen(true);
        setHighlightedIndex(matchingAssets.length - 1);
        return;
      }
      if (matchingAssets.length === 0) return;
      const prevIndex = (highlightedIndex - 1 + matchingAssets.length) % matchingAssets.length;
      setHighlightedIndex(prevIndex);
      itemRefs.current[prevIndex]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (matchingAssets.length > 0) {
        const target = matchingAssets[highlightedIndex] || matchingAssets[0];
        if (onSelectAsset) onSelectAsset(target.symbol);
        setIsDropdownOpen(false);
        if (searchInputRef.current) searchInputRef.current.blur();
      } else if (rawQuery) {
        if (onSelectAsset) onSelectAsset(rawQuery.toUpperCase());
        setIsDropdownOpen(false);
        if (searchInputRef.current) searchInputRef.current.blur();
      }
    } else if (e.key === 'Escape') {
      setIsDropdownOpen(false);
      if (searchInputRef.current) searchInputRef.current.blur();
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-md border-b border-background-border px-4 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-4">
      {/* Brand Identity (Clickable to return Home/Dashboard) */}
      <div 
        onClick={onLogoClick}
        title="Mergi la Pagina Principală (Dashboard)"
        className="flex items-center gap-3 cursor-pointer group hover:opacity-90 transition-all select-none"
      >
        <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500/20 via-background-card to-emerald-500/20 border border-cyan-500/30 shadow-glow-cyan group-hover:border-cyan-400/60 transition-all">
          <Zap className="w-5 h-5 text-cyber-cyan group-hover:scale-110 transition-transform" />
          <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyber-cyan opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyber-cyan"></span>
          </span>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-lg tracking-wider bg-gradient-to-r from-white via-cyan-300 to-emerald-400 bg-clip-text text-transparent group-hover:from-cyan-200 group-hover:to-emerald-300">
              MARKET SCANNER 360
            </span>
            <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              v1.0.0
            </span>
          </div>
          <p className="text-[11px] text-slate-400 group-hover:text-slate-300 transition-colors">Trading 360° • Crypto, Stocks &amp; Metale • Money Line Engine</p>
        </div>
      </div>

      {/* Global AI Semantic Search Bar with Keyboard Navigation (Arrow Up / Down / Enter) */}
      <div ref={dropdownRef} className="w-full order-3 md:order-2 md:w-auto md:flex-1 max-w-md relative block">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-cyan-400/70" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => {
              onSearchChange(e.target.value);
              setIsDropdownOpen(true);
            }}
            onFocus={() => setIsDropdownOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder="Căutare AI: monedă Vitalik, aur, mașini electrice, plăci video, DXY..."
            className="w-full bg-background-surface border border-background-border rounded-xl pl-9 pr-8 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/30 transition-all font-mono"
          />
          {searchQuery && (
            <button
              onClick={() => {
                onSearchChange('');
                setIsDropdownOpen(false);
              }}
              className="absolute right-2.5 top-2.5 text-slate-500 hover:text-slate-300"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Live Search Suggestions Dropdown with AI Ranking & Arrow Navigation */}
        {isDropdownOpen && searchQuery.trim() && (
          <div className="absolute left-0 right-0 top-full mt-2 bg-background-card/95 backdrop-blur-xl border border-cyan-500/30 rounded-xl shadow-2xl overflow-hidden z-50 animate-fade-in max-h-[420px] overflow-y-auto divide-y divide-background-border">
            <div className="p-2.5 bg-background-surface/90 text-[10px] font-mono text-slate-400 flex items-center justify-between border-b border-background-border">
              <span className="flex items-center gap-1 text-cyan-300 font-bold">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                POTRIVIRE AI INTELIGENTĂ ({matchingAssets.length})
              </span>
              <span className="text-slate-400 flex items-center gap-1.5">
                <span>Navighează cu <strong className="text-cyan-300">↑ / ↓</strong></span>
                <span>•</span>
                <span>Selectează cu <strong className="text-emerald-400">Enter ↵</strong></span>
              </span>
            </div>

            {matchingAssets.length > 0 ? (
              <div className="divide-y divide-background-border/50">
                {matchingAssets.map((asset, index) => {
                  const isInWatchlist = watchlist.map(w => w.replace(/^[$#]/, '').trim().toUpperCase()).includes(asset.symbol.toUpperCase());
                  const isUp = asset.change24h >= 0;
                  const isHighlighted = highlightedIndex === index;

                  return (
                    <div
                      key={asset.symbol}
                      ref={el => itemRefs.current[index] = el}
                      onMouseEnter={() => setHighlightedIndex(index)}
                      onClick={() => {
                        if (onSelectAsset) onSelectAsset(asset.symbol);
                        setIsDropdownOpen(false);
                      }}
                      className={`p-3 transition-all flex items-center justify-between cursor-pointer group border-l-2 ${
                        isHighlighted
                          ? 'bg-cyan-500/15 border-cyan-400 text-slate-100 shadow-inner'
                          : 'hover:bg-background-surface/80 border-transparent text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onToggleWatchlist) onToggleWatchlist(asset.symbol);
                          }}
                          title={isInWatchlist ? "Remove from Watchlist" : "Add to Watchlist"}
                          className={`p-1.5 rounded-lg border transition-all ${
                            isInWatchlist
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-glow-gold'
                              : 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-cyan-300 border-slate-700'
                          }`}
                        >
                          {isInWatchlist ? <Star className="w-3.5 h-3.5 fill-amber-300 text-amber-300" /> : <Plus className="w-3.5 h-3.5" />}
                        </button>

                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-mono font-bold text-xs border transition-all ${
                          asset.isTopMatch
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-glow-emerald'
                            : 'bg-slate-800 text-cyan-300 border-slate-700'
                        }`}>
                          ${asset.symbol}
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-bold text-xs text-slate-100 group-hover:text-cyan-300 font-mono">
                              {asset.name}
                            </span>
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
                              {asset.category}
                            </span>
                            {asset.isTopMatch && (
                              <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[9px] font-bold font-mono shadow-glow-emerald flex items-center gap-0.5">
                                <Sparkles className="w-2.5 h-2.5 text-emerald-400" />
                                ✨ AI TOP MATCH
                              </span>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-2 mt-0.5 text-[11px] font-mono">
                            {asset.price > 0 && (
                              <span className="text-slate-300 font-semibold">
                                ${asset.price < 1 ? asset.price.toFixed(4) : asset.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </span>
                            )}
                            {asset.matchReason && (
                              <span className="text-[10px] text-cyan-400/80 italic">
                                • {asset.matchReason}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 font-mono text-xs">
                        {asset.price > 0 && (
                          <span className={`flex items-center font-semibold text-[11px] ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                            {isUp ? `+${asset.change24h}%` : `${asset.change24h}%`}
                          </span>
                        )}
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          asset.tier.includes('Bullish') ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' :
                          (asset.tier.includes('Bearish') ? 'bg-rose-500/10 text-rose-300 border-rose-500/30' : 'bg-slate-800 text-slate-300 border-slate-700')
                        }`}>
                          {asset.moneyLineScore > 0 ? `+${asset.moneyLineScore}` : asset.moneyLineScore}
                        </span>

                        {isHighlighted && (
                          <span className="hidden sm:flex items-center gap-1 text-[10px] font-bold text-cyan-300 bg-cyan-500/20 border border-cyan-500/40 px-1.5 py-0.5 rounded animate-pulse">
                            <CornerDownLeft className="w-3 h-3" />
                            <span>Selectează</span>
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-6 text-center text-xs font-mono text-slate-400 space-y-2">
                <p>Niciun activ potrivit pentru <span className="text-cyan-300 font-bold">"{searchQuery}"</span>.</p>
                <p className="text-[11px] text-slate-500">
                  Încearcă termeni precum: <span className="text-cyan-400">moneda Vitalik</span>, <span className="text-cyan-400">aur</span>, <span className="text-cyan-400">mașini electrice</span>, <span className="text-cyan-400">plăci video</span>, <span className="text-cyan-400">SpaceX</span>, sau <span className="text-cyan-400">DXY</span>.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Controls & User Pill */}
      <div className="flex items-center gap-3">
        {/* Manual Market Refresh Button */}
        {onRefreshMarket && (
          <button
            onClick={onRefreshMarket}
            disabled={isRefreshing}
            title="Actualizează Datele de Piață"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-bold bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded-xl transition-all shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Actualizează Date</span>
          </button>
        )}

        {/* Timeframe Selector (1H, 4H, 8H, 1D, 1W, 1M) */}
        <div className="flex items-center bg-background-surface border border-background-border rounded-lg p-0.5">
          {(['1h', '4h', '8h', '1d', '1w', '1m'] as Timeframe[]).map((tf) => (
            <button
              key={tf}
              onClick={() => onTimeframeChange(tf)}
              className={`px-3 py-1 text-xs font-mono font-medium rounded-md transition-all ${
                timeframe === tf
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-glow-cyan font-bold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-background-hover'
              }`}
            >
              {tf.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Live Data Status Indicator */}
        <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-background-surface border border-background-border">
          <span className="relative flex h-2 w-2">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isStale ? 'bg-amber-400' : 'bg-emerald-400'}`}></span>
            <span className={`relative inline-flex rounded-full h-2 w-2 ${isStale ? 'bg-amber-400' : 'bg-emerald-400'}`}></span>
          </span>
          <span className="text-[11px] font-mono text-slate-300 hidden sm:inline">
            {isStale ? 'STALE' : 'LIVE (5m)'}
          </span>
        </div>

        {/* Test Alert Button */}
        <button
          onClick={onTriggerTestAlert}
          title="Send Test Telegram Alert"
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg transition-all"
        >
          <BellRing className="w-3.5 h-3.5 text-cyan-400" />
          <span className="hidden sm:inline">Test Alert</span>
        </button>

        {/* User Role Pill */}
        <div className="flex items-center gap-2 pl-2 border-l border-background-border">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white text-xs font-bold ring-1 ring-cyan-400/40">
            M
          </div>
          <div className="hidden lg:block text-left">
            <div className="text-xs font-semibold text-slate-200">Marius PJ</div>
            <div className="text-[10px] text-cyan-400 font-mono">Administrator</div>
          </div>
        </div>
      </div>
    </header>
  );
};
