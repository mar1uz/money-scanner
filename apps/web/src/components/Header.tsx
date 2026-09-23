import React, { useState, useRef, useEffect, useMemo } from 'react';
import { formatPrice } from '../utils/price.js';
import {
  Search,
  X,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  Star,
  RefreshCw,
  CornerDownLeft,
  Bell,
  LogOut
} from 'lucide-react';
import { Timeframe, AssetScannerRow } from '../types.js';
import { buildSearchUniverse, performAISearchMatch, SearchMatchResult } from '../services/ai-search.js';
import { UserProfile } from '@money-scanner/shared';

interface HeaderProps {
  timeframe: Timeframe;
  onTimeframeChange: (tf: Timeframe) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onOpenAlerts?: () => void;
  isStale?: boolean;
  allAssets?: AssetScannerRow[];
  onSelectAsset?: (symbol: string) => void;
  watchlist?: string[];
  onToggleWatchlist?: (symbol: string) => void;
  onRefreshMarket?: () => void;
  isRefreshing?: boolean;
  onOpenSearchModal?: () => void;
  hasSidebar?: boolean;
  hideTimeframe?: boolean;
  currentUser?: UserProfile;
  onLogout?: () => Promise<void>;
}

export const Header: React.FC<HeaderProps> = ({
  timeframe,
  onTimeframeChange,
  searchQuery,
  onSearchChange,
  onOpenAlerts,
  allAssets = [],
  onSelectAsset,
  watchlist = [],
  onToggleWatchlist,
  onRefreshMarket,
  isRefreshing = false,
  onOpenSearchModal,
  hasSidebar = false,
  hideTimeframe = false,
  currentUser,
  onLogout
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

  // Global Type-to-Search Listener
  useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (onOpenSearchModal) {
          onOpenSearchModal();
          return;
        }
      }

      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const activeEl = document.activeElement;
        const isInputActive = activeEl && (
          activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.tagName === 'SELECT'
        );
        if (!isInputActive) {
          e.preventDefault();
          if (onOpenSearchModal) {
            onOpenSearchModal();
            return;
          }
        }
      }

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

    }

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [onSearchChange, onOpenSearchModal]);

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
    <header className={`app-header fixed top-0 right-0 ${hasSidebar ? 'left-0 md:left-[260px]' : 'left-0'} z-40 border-b border-white/[0.08] px-2 sm:px-6 lg:px-8 h-[56px] flex items-center justify-between gap-1.5 sm:gap-4 transition-all`}>
      {/* Mobile search is a real fixed-width control, so it cannot overlap the timeframe pills. */}
      <button
        type="button"
        onClick={onOpenSearchModal}
        aria-label="Caută active"
        title="Caută active"
        className="sm:hidden grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-cyan-500/20 bg-white/[0.03] text-cyan-400 transition-colors hover:bg-cyan-500/10"
      >
        <Search className="h-4 w-4" />
      </button>

      {/* Central AI Search Bar (desktop/tablet spotlight trigger) */}
      <div ref={dropdownRef} className="hidden sm:block flex-1 max-w-xl mx-auto relative min-w-0">
        <div 
          onClick={() => {
            if (onOpenSearchModal) onOpenSearchModal();
          }}
          className="relative cursor-pointer group"
        >
          <Search className="absolute left-3 sm:left-3.5 top-2.5 w-4 h-4 text-cyan-400 group-hover:scale-110 transition-transform" />
          
          <input
            ref={searchInputRef}
            type="text"
            readOnly={Boolean(onOpenSearchModal)}
            value={searchQuery}
            onClick={(e) => {
              if (onOpenSearchModal) {
                e.preventDefault();
                onOpenSearchModal();
              }
            }}
            onChange={(e) => {
              onSearchChange(e.target.value);
              setIsDropdownOpen(true);
            }}
            placeholder="Caută un activ, simbol sau companie…"
            className="w-full bg-white/[0.03] group-hover:bg-white/[0.06] border border-white/[0.07] group-hover:border-cyan-500/40 rounded-xl sm:rounded-[30px] pl-9 sm:pl-10 pr-9 py-2 text-xs font-mono text-slate-100 placeholder-slate-400 focus:outline-none transition-all shadow-inner cursor-pointer"
          />

          {searchQuery ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSearchChange('');
                setIsDropdownOpen(false);
              }}
              className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            <div className="absolute right-2.5 top-2 hidden sm:flex items-center gap-1 text-[10px] font-mono text-slate-400 bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/[0.06]">
              <span>⌘K</span>
            </div>
          )}
        </div>

        {/* AI Dropdown with Full-Screen Dark Backdrop Overlay (Guarantees zero bleed-through) */}
        {isDropdownOpen && searchQuery.trim() && (
          <>
            {/* Backdrop overlay covering all screen elements */}
            <div 
              className="fixed inset-0 bg-black/80 backdrop-blur-md z-40 animate-fade-in"
              onClick={() => setIsDropdownOpen(false)}
            />

            {/* Dropdown Container */}
            <div className="absolute left-0 right-0 top-full mt-2 bg-[var(--t-surface-raised)] border border-cyan-500/40 rounded-[30px] shadow-2xl overflow-hidden z-50 animate-fade-in max-h-[440px] overflow-y-auto divide-y divide-white/[0.04]">
              <div className="p-2.5 bg-white/[0.04] text-[10px] font-mono text-slate-400 flex items-center justify-between border-b border-white/[0.06]">
                <span className="flex items-center gap-1 text-cyan-300 font-bold">
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                  REZULTATE AI ({matchingAssets.length})
                </span>
                <span className="text-slate-400 flex items-center gap-1.5">
                  <span><strong className="text-cyan-300">↑ / ↓</strong></span>
                  <span>•</span>
                  <span>Selectează: <strong className="text-emerald-400">Enter ↵</strong></span>
                </span>
              </div>

            {matchingAssets.length > 0 ? (
              <div className="divide-y divide-white/[0.03]">
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
                          : 'hover:bg-white/[0.03] border-transparent text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onToggleWatchlist) onToggleWatchlist(asset.symbol);
                          }}
                          className={`p-1.5 rounded-lg border transition-all ${
                            isInWatchlist
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-glow-gold'
                              : 'bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-cyan-300 border-white/[0.06]'
                          }`}
                        >
                          {isInWatchlist ? <Star className="w-3.5 h-3.5 fill-amber-300 text-amber-300" /> : <Plus className="w-3.5 h-3.5" />}
                        </button>

                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-mono font-bold text-xs border transition-all ${
                          asset.isTopMatch
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-glow-emerald'
                            : 'bg-white/[0.04] text-cyan-300 border-white/[0.06]'
                        }`}>
                          ${asset.symbol}
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-semibold text-xs text-slate-100 group-hover:text-cyan-300 font-mono">
                              <bdi translate="no">{asset.name}</bdi>
                            </span>
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-white/[0.04] text-slate-400 font-mono">
                              {asset.category}
                            </span>
                            {asset.exchange && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-violet-500/10 text-violet-300 border border-violet-500/20 font-mono">
                                {asset.exchange}{asset.instrumentType ? ` · ${asset.instrumentType.toUpperCase()}` : ''}
                              </span>
                            )}
                            {asset.isTopMatch && (
                              <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[9px] font-bold font-mono flex items-center gap-0.5">
                                <Sparkles className="w-2.5 h-2.5 text-emerald-400" />
                                ✨ TOP MATCH
                              </span>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-2 mt-0.5 text-[11px] font-mono">
                            {asset.price > 0 && (
                              <span className="text-slate-300 font-semibold">
                                ${formatPrice(asset.price)}
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
                          (asset.tier.includes('Bearish') ? 'bg-rose-500/10 text-rose-300 border-rose-500/30' : 'bg-white/[0.04] text-slate-300 border-white/[0.06]')
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
                <p>Niciun activ găsit pentru <span className="text-cyan-300 font-bold">"{searchQuery}"</span>.</p>
                <p className="text-[11px] text-slate-500">
                  Încearcă: <span className="text-cyan-400">ASML</span>, <span className="text-cyan-400">aur</span>, <span className="text-cyan-400">NVDA</span>, <span className="text-cyan-400">BTC</span> sau <span className="text-cyan-400">DXY</span>.
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>

      {/* Right Controls: Timeframe Pills, Live Status, Refresh */}
      <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5 sm:flex-none sm:gap-2.5">
        {/* Timeframe pills hidden on the asset detail page, which has its own single row */}
        {!hideTimeframe && (
          <div className="flex min-w-0 flex-1 items-center rounded-full border border-white/[0.08] bg-white/[0.03] p-1 sm:flex-none">
            {(['1h', '4h', '8h', '1d', '1w', '1m'] as Timeframe[]).map((tf) => (
              <button
                key={tf}
                onClick={() => onTimeframeChange(tf)}
                className={`min-w-0 min-h-0 flex-1 px-2.5 py-1.5 text-[12px] font-mono rounded-full transition-all sm:flex-none sm:px-3.5 sm:text-[13px] ${
                  timeframe === tf
                    ? 'bg-cyan-500/25 text-cyan-200 font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tf.toUpperCase()}
              </button>
            ))}
          </div>
        )}

        {/* Refresh Button (desktop only) */}
        {onRefreshMarket && (
          <button
            onClick={onRefreshMarket}
            disabled={isRefreshing}
            title="Actualizează Datele de Piață"
            className="hidden md:flex items-center justify-center w-9 h-9 min-h-0 rounded-full bg-white/[0.03] hover:bg-white/[0.07] text-slate-300 hover:text-cyan-300 border border-white/[0.06] transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-cyan-400' : ''}`} />
          </button>
        )}

        {/* Central Alerts Page */}
        {onOpenAlerts && (
          <button
            onClick={onOpenAlerts}
            title="Deschide alertele mele"
            className="flex items-center justify-center w-9 h-9 min-h-0 shrink-0 rounded-full text-slate-400 hover:text-cyan-300 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] transition-all"
          >
            <Bell className="w-4 h-4 text-cyan-400" />
          </button>
        )}

        {currentUser && onLogout && (
          <button
            type="button"
            onClick={() => void onLogout()}
            title={`Deconectare ${currentUser.email}`}
            className="hidden md:flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-2 py-1 text-slate-300 transition-all hover:bg-rose-500/10 hover:text-rose-200"
          >
            {currentUser.avatarUrl ? (
              <img src={currentUser.avatarUrl} alt="" className="h-5 w-5 rounded-full border border-cyan-400/30" referrerPolicy="no-referrer" />
            ) : (
              <span className="grid h-5 w-5 place-items-center rounded-full bg-cyan-500/15 text-[9px] font-bold text-cyan-300">{(currentUser.name || currentUser.email || 'U').slice(0, 1).toUpperCase()}</span>
            )}
            <span className="max-w-[105px] truncate text-[10px] font-mono">{currentUser.name || currentUser.email}</span>
            <LogOut className="h-3.5 w-3.5" />
          </button>
        )}

      </div>
    </header>
  );
};

