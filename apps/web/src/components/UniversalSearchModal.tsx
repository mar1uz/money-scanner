import React, { useState, useEffect, useRef, useMemo } from 'react';
import { formatPrice } from '../utils/price.js';
import {
  Search,
  X,
  Sparkles,
  ArrowUpRight,
  TrendingUp,
  Star,
  Plus,
  Globe,
  Coins,
  Building2,
  Gem,
  CornerDownLeft,
  Loader2,
  Clock,
  BadgeCheck,
  AlertTriangle
} from 'lucide-react';
import {
  TRADING_360_ASSETS,
  catalogToSearchCandidates,
  rankSymbolSearchCandidates
} from '@money-scanner/shared';
import { AssetScannerRow } from '../types.js';
import { searchUniversalAssets, SearchAssetItem } from '../services/api.js';
import { AssetExternalLinks } from './AssetExternalLinks.js';

interface UniversalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAsset: (asset: SearchAssetItem) => void;
  allAssets: AssetScannerRow[];
  watchlist: string[];
  onToggleWatchlist: (symbol: string) => void;
}

type MarketCategoryTab = 'ALL' | 'stocks' | 'crypto' | 'metals' | 'forex';

const RECENT_SEARCHES_KEY = 'money_scanner_recent_searches_v2';
const LOCAL_SEARCH_CANDIDATES = catalogToSearchCandidates(TRADING_360_ASSETS);

// Last-good snapshots: any row the API serves from its cached provider data
// carries `staleAsOf` (ms). Those rows are visibly flagged and lose the green
// "verificat" badge — old data must never be dressed up as a fresh quote
// (golden rule #1). Past this age the badge escalates to the alert colour.
const STALE_ALERT_MS = 15 * 60_000;

const pad2 = (value: number) => String(value).padStart(2, '0');

/** HH:MM of the last-good snapshot, rendered inside the stale badge. */
const formatStaleClock = (staleAsOf: number) => {
  const date = new Date(staleAsOf);
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
};

/** Full local timestamp of the last-good snapshot, used by the tooltip. */
const formatStaleStamp = (staleAsOf: number) => {
  const date = new Date(staleAsOf);
  return `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)}.${date.getFullYear()} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
};

export const UniversalSearchModal: React.FC<UniversalSearchModalProps> = ({
  isOpen,
  onClose,
  onSelectAsset,
  allAssets = [],
  watchlist = [],
  onToggleWatchlist
}) => {
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<MarketCategoryTab>('ALL');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [remoteResults, setRemoteResults] = useState<SearchAssetItem[]>([]);
  const [isLoadingRemote, setIsLoadingRemote] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Load recent searches from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(RECENT_SEARCHES_KEY);
      if (saved) {
        setRecentSearches(JSON.parse(saved));
      } else {
        setRecentSearches(['NVDA', 'BTC', 'ASML', 'SOL', 'TSLA', 'AAPL', 'XAU']);
      }
    } catch (e) {
      setRecentSearches(['NVDA', 'BTC', 'ASML', 'SOL', 'TSLA', 'AAPL', 'XAU']);
    }
  }, []);

  const saveRecentSearch = (sym: string) => {
    const cleanSym = sym.replace(/^[$#]/, '').trim().toUpperCase();
    const updated = [cleanSym, ...recentSearches.filter(s => s !== cleanSym)].slice(0, 8);
    setRecentSearches(updated);
    try {
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
    } catch (e) {}
  };

  // Focus input automatically when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [isOpen]);

  // The same deterministic ranking engine runs locally for instant catalog
  // matches and on the API for exchange/provider discovery.
  const localMatches = useMemo<SearchAssetItem[]>(() => {
    if (!query.trim()) return [];
    return rankSymbolSearchCandidates(query, LOCAL_SEARCH_CANDIDATES, 40).map(result => {
      const live = allAssets.find(asset =>
        asset.symbol.toUpperCase() === result.symbol.toUpperCase() &&
        (!result.marketClass || asset.marketClass === result.marketClass)
      );
      return {
        ...result,
        price: live?.price || result.price || 0,
        change24h: live?.change24h || result.change24h || 0,
        changeYtd: live?.changeYtd || result.changeYtd || 0,
        moneyLineScore: live?.moneyLineScore || result.moneyLineScore || 0,
        tier: live?.tier || result.tier || 'Neutral'
      };
    });
  }, [query, allAssets]);

  // Asynchronous remote universal symbol search (Yahoo Finance / Binance / Global)
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setRemoteResults([]);
      setIsLoadingRemote(false);
      return;
    }

    const controller = new AbortController();
    setIsLoadingRemote(true);
    const timer = setTimeout(async () => {
      try {
        const results = await searchUniversalAssets(q, controller.signal);
        setRemoteResults(results);
      } catch (err) {
        if (!controller.signal.aborted) setRemoteResults([]);
      } finally {
        if (!controller.signal.aborted) setIsLoadingRemote(false);
      }
    }, 180);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  // Preserve instrument identity. Identical text tickers on different markets
  // are separate results, just as they are in TradingView symbol search.
  const unifiedResults: SearchAssetItem[] = useMemo(() => {
    if (!query.trim()) return [];
    const map = new Map<string, SearchAssetItem>();
    for (const local of localMatches) map.set(local.resultId, local);
    for (const remote of remoteResults) {
      const local = map.get(remote.resultId);
      map.set(remote.resultId, local ? {
        ...local,
        ...remote,
        price: remote.price || local.price,
        change24h: remote.change24h || local.change24h,
        changeYtd: remote.changeYtd || local.changeYtd,
        moneyLineScore: remote.moneyLineScore || local.moneyLineScore,
        tier: remote.tier === 'Neutral' ? local.tier : remote.tier
      } : remote);
    }

    let list = Array.from(map.values());

    // Filter by selected category tab
    if (selectedCategory !== 'ALL') {
      list = list.filter(item => {
        if (selectedCategory === 'stocks') return item.marketClass === 'stocks';
        if (selectedCategory === 'crypto') return item.marketClass === 'crypto';
        if (selectedCategory === 'metals') return item.marketClass === 'metals';
        if (selectedCategory === 'forex') return item.marketClass === 'forex' || item.marketClass === 'macro';
        return true;
      });
    }

    return list.sort((left, right) =>
      right.matchScore - left.matchScore ||
      Number(right.isExact) - Number(left.isExact) ||
      (left.rank || Number.MAX_SAFE_INTEGER) - (right.rank || Number.MAX_SAFE_INTEGER)
    ).slice(0, 60);
  }, [query, localMatches, remoteResults, selectedCategory]);

  // Reset highlight index when results or query changes
  useEffect(() => {
    setHighlightedIndex(0);
  }, [unifiedResults.length, query]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (unifiedResults.length === 0) return;
      const next = (highlightedIndex + 1) % unifiedResults.length;
      setHighlightedIndex(next);
      itemRefs.current[next]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (unifiedResults.length === 0) return;
      const prev = (highlightedIndex - 1 + unifiedResults.length) % unifiedResults.length;
      setHighlightedIndex(prev);
      itemRefs.current[prev]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (unifiedResults.length > 0) {
        const target = unifiedResults[highlightedIndex] || unifiedResults[0];
        handleSelect(target);
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  const handleSelect = (asset: SearchAssetItem) => {
    saveRecentSearch(asset.displaySymbol || asset.symbol);
    onSelectAsset(asset);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div 
      role="dialog"
      aria-modal="true"
      aria-label="Căutare active"
      className="fixed inset-0 z-[100] flex items-start justify-center pt-3 sm:pt-14 px-2.5 sm:px-4 bg-black/90 ms-scrim-enter"
      onClick={onClose}
    >
      <div
        className="ms-dialog-enter relative w-full max-w-2xl flex flex-col bg-[var(--t-surface-raised)] border border-cyan-500/40 rounded-[30px] sm:rounded-[32px] shadow-[0_20px_60px_rgba(0,0,0,0.95)] overflow-hidden max-h-[92vh] sm:max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Header Input */}
        <div className="relative p-3.5 sm:p-4 border-b border-white/[0.08] bg-[var(--t-surface-raised)] flex items-center gap-2.5 sm:gap-3">
          <Search className="w-5 h-5 text-cyan-400 shrink-0" />
          
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ticker, nume sau pereche: NVDA, BTCUSDT, NASDAQ:ASML..."
            aria-label="Caută active după ticker sau nume"
            className="w-full bg-transparent text-sm sm:text-base font-mono text-slate-100 placeholder-slate-500 focus:outline-none"
          />

          {isLoadingRemote && (
            <Loader2 className="w-4 h-4 text-cyan-400 animate-spin shrink-0" />
          )}

          {query && (
            <button
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="p-1 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/[0.05] transition-colors shrink-0"
              title="Șterge textul"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={onClose}
            className="px-2.5 py-1 text-xs font-mono text-slate-400 hover:text-slate-200 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] rounded-xl transition-all shrink-0"
          >
            ESC
          </button>
        </div>

        {/* Category Tabs */}
        <div className="flex items-center gap-1.5 px-3 sm:px-4 py-2 border-b border-white/[0.04] bg-white/[0.01] overflow-x-auto no-scrollbar text-xs font-mono">
          <button
            onClick={() => setSelectedCategory('ALL')}
            className={`px-3 py-1 rounded-xl transition-all shrink-0 flex items-center gap-1.5 ${
              selectedCategory === 'ALL'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Toate</span>
          </button>

          <button
            onClick={() => setSelectedCategory('stocks')}
            className={`px-3 py-1 rounded-xl transition-all shrink-0 flex items-center gap-1.5 ${
              selectedCategory === 'stocks'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Stocks 📈</span>
          </button>

          <button
            onClick={() => setSelectedCategory('crypto')}
            className={`px-3 py-1 rounded-xl transition-all shrink-0 flex items-center gap-1.5 ${
              selectedCategory === 'crypto'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'
            }`}
          >
            <Coins className="w-3.5 h-3.5" />
            <span>Crypto 🪙</span>
          </button>

          <button
            onClick={() => setSelectedCategory('metals')}
            className={`px-3 py-1 rounded-xl transition-all shrink-0 flex items-center gap-1.5 ${
              selectedCategory === 'metals'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'
            }`}
          >
            <Gem className="w-3.5 h-3.5" />
            <span>Metale & Marfuri 🥇</span>
          </button>

          <button
            onClick={() => setSelectedCategory('forex')}
            className={`px-3 py-1 rounded-xl transition-all shrink-0 flex items-center gap-1.5 ${
              selectedCategory === 'forex'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Macro / Forex 🌐</span>
          </button>
        </div>

        {/* Results List or Recent Searches */}
        <div ref={listRef} className="flex-1 overflow-y-auto p-2 sm:p-3 space-y-1">
          {query.trim() ? (
            unifiedResults.length > 0 ? (
              <div className="divide-y divide-white/[0.03]">
                {unifiedResults.map((item, index) => {
                  const isHighlighted = highlightedIndex === index;
                  const isInWatchlist = watchlist.includes(item.symbol.toUpperCase());
                  const visibleSymbol = item.displaySymbol || item.symbol;
                  const isPos = item.change24h >= 0;
                  const isBull = item.tier?.includes('Bullish');
                  const isBear = item.tier?.includes('Bearish');
                  const staleAsOf = typeof item.staleAsOf === 'number' && item.staleAsOf > 0 ? item.staleAsOf : null;
                  const isSeverelyStale = staleAsOf !== null && Date.now() - staleAsOf > STALE_ALERT_MS;

                  return (
                    <div
                      key={item.resultId}
                      ref={el => itemRefs.current[index] = el}
                      onMouseEnter={() => setHighlightedIndex(index)}
                      onClick={() => handleSelect(item)}
                      className={`p-3 rounded-xl transition-all flex items-center justify-between cursor-pointer group border-l-2 ${
                        isHighlighted
                          ? 'bg-cyan-500/15 border-cyan-400 text-slate-100 shadow-inner'
                          : 'hover:bg-white/[0.03] border-transparent text-slate-300'
                      }`}
                    >
                      {/* Left: Star + Symbol Badge + Name */}
                      <div className="flex items-center gap-3 min-w-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleWatchlist(item.symbol);
                          }}
                          className={`p-1.5 rounded-lg border transition-all ${
                            isInWatchlist
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-glow-gold'
                              : 'bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-cyan-300 border-white/[0.06]'
                          }`}
                          title={isInWatchlist ? 'Scoate din Watchlist' : 'Adaugă în Watchlist'}
                        >
                          {isInWatchlist ? <Star className="w-3.5 h-3.5 fill-amber-300 text-amber-300" /> : <Plus className="w-3.5 h-3.5" />}
                        </button>

                        <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center font-mono font-bold text-xs text-cyan-300 shrink-0">
                          ${visibleSymbol.slice(0, 8)}
                        </div>

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-bold text-sm text-slate-100 group-hover:text-cyan-300 transition-colors font-mono">
                              ${visibleSymbol}
                            </span>
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white/[0.04] text-slate-400 border border-white/[0.04]">
                              {item.exchange || 'GLOBAL'}
                            </span>
                            {item.instrumentType && (
                              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-violet-500/10 text-violet-300 border border-violet-500/20 uppercase">
                                {item.instrumentType}
                              </span>
                            )}
                            {staleAsOf !== null ? (
                              // Last-good snapshot from the API: old data is
                              // stigmatised and never wears the green badge.
                              <span
                                className={`inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                                  isSeverelyStale
                                    ? 'bg-rose-500/10 text-rose-300 border-rose-500/20'
                                    : 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                                }`}
                                title={`Ultimul snapshot valid: ${formatStaleStamp(staleAsOf)} — nu este o cotație proaspătă.`}
                              >
                                <Clock className="w-3 h-3" /> {`Date vechi • ${formatStaleClock(staleAsOf)}`}
                              </span>
                            ) : item.verified !== false ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                                <BadgeCheck className="w-3 h-3" /> verificat
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                                <AlertTriangle className="w-3 h-3" /> direct
                              </span>
                            )}
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800/80 text-slate-400">
                              {item.category}
                            </span>
                          </div>

                          <div className="text-xs text-slate-400 truncate font-sans mt-0.5">
                            <bdi translate="no">{item.name}</bdi>
                          </div>
                          {(item.marketClass === 'crypto' || item.marketClass === 'stocks' || item.marketClass === 'metals') && <div onClick={event => event.stopPropagation()} className="mt-1"><AssetExternalLinks symbol={item.symbol} marketClass={item.marketClass} coinGeckoId={item.coinGeckoId} showNarrative={false} /></div>}
                        </div>
                      </div>

                      {/* Right: Price + 24h + YTD + Action */}
                      <div className="flex items-center gap-3 sm:gap-4 shrink-0 font-mono">
                        {item.price > 0 && (
                          <div className="flex flex-col items-end text-right">
                            <span className="text-xs font-bold text-slate-200">
                              ${formatPrice(item.price)}
                            </span>
                            <div className="flex items-center gap-1.5 text-[10px]">
                              <span className={isPos ? 'text-emerald-400' : 'text-rose-400'}>
                                {isPos ? `+${item.change24h}%` : `${item.change24h}%`}
                              </span>
                              {item.changeYtd !== undefined && item.changeYtd !== 0 && (
                                <span className={`hidden sm:inline ${item.changeYtd >= 0 ? 'text-emerald-400/80' : 'text-rose-400/80'}`}>
                                  YTD: {item.changeYtd >= 0 ? `+${item.changeYtd}%` : `${item.changeYtd}%`}
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        {item.tier && item.tier !== 'Active' && item.tier !== 'Neutral' && (
                          <span className={`hidden md:inline-flex px-2 py-0.5 rounded text-[10px] font-bold border ${
                            isBull ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' :
                            (isBear ? 'bg-rose-500/10 text-rose-300 border-rose-500/30' : 'bg-white/[0.04] text-slate-300 border-white/[0.06]')
                          }`}>
                            {item.tier}
                          </span>
                        )}

                        {isHighlighted ? (
                          <div className="flex items-center gap-1 text-[11px] font-bold text-cyan-300 bg-cyan-500/20 border border-cyan-500/40 px-2 py-1 rounded-lg animate-pulse">
                            <CornerDownLeft className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Deschide</span>
                          </div>
                        ) : (
                          <div className="p-1 rounded text-slate-500 group-hover:text-cyan-300">
                            <ArrowUpRight className="w-4 h-4" />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-8 text-center space-y-3 font-mono">
                {isLoadingRemote ? (
                  <>
                    <Loader2 className="w-6 h-6 text-cyan-400 animate-spin mx-auto" />
                    <p className="text-sm text-slate-400">Verific bursele și furnizorii de simboluri…</p>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-6 h-6 text-amber-300 mx-auto" />
                    <p className="text-sm text-slate-300">Nu am găsit un instrument pentru <strong className="text-cyan-300">{query}</strong>.</p>
                    <p className="text-xs text-slate-500">Încearcă tickerul complet, perechea sau prefixul bursei, de exemplu BINANCE:BTCUSDT.</p>
                  </>
                )}
              </div>
            )
          ) : (
            /* Empty State: Recent Searches & Trending */
            <div className="p-4 space-y-5">
              {/* Recent Searches */}
              <div>
                <div className="flex items-center gap-1.5 text-xs font-mono text-slate-400 mb-2.5">
                  <Clock className="w-3.5 h-3.5 text-cyan-400" />
                  <span>CĂUTĂRI RECENTE & RAPIDE</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {recentSearches.map(sym => (
                    <button
                      key={sym}
                      onClick={() => {
                        setQuery(sym);
                        inputRef.current?.focus();
                      }}
                      className="px-3 py-1.5 rounded-xl bg-white/[0.03] hover:bg-cyan-500/15 border border-white/[0.06] hover:border-cyan-500/30 text-xs font-mono text-slate-200 hover:text-cyan-300 transition-all flex items-center gap-1.5"
                    >
                      <span className="font-bold">${sym}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Suggestions Categories */}
              <div>
                <div className="flex items-center gap-1.5 text-xs font-mono text-slate-400 mb-2.5">
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                  <span>EXEMPLE DE SYMBOL SEARCH</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
                  <button
                    onClick={() => { setQuery('ASML'); inputRef.current?.focus(); }}
                    className="p-2.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.04] text-left transition-all flex items-center justify-between group"
                  >
                    <div>
                      <span className="font-bold text-slate-200 group-hover:text-cyan-300">$ASML</span>
                      <span className="block text-[11px] text-slate-500">Lider mondial litografie cipuri</span>
                    </div>
                    <ArrowUpRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-cyan-300" />
                  </button>

                  <button
                    onClick={() => { setQuery('NVDA'); inputRef.current?.focus(); }}
                    className="p-2.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.04] text-left transition-all flex items-center justify-between group"
                  >
                    <div>
                      <span className="font-bold text-slate-200 group-hover:text-cyan-300">$NVDA</span>
                      <span className="block text-[11px] text-slate-500">Nvidia AI Hardware & GPU</span>
                    </div>
                    <ArrowUpRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-cyan-300" />
                  </button>

                  <button
                    onClick={() => { setQuery('BINANCE:ETHUSDT'); inputRef.current?.focus(); }}
                    className="p-2.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.04] text-left transition-all flex items-center justify-between group"
                  >
                    <div>
                      <span className="font-bold text-slate-200 group-hover:text-cyan-300">BINANCE:ETHUSDT</span>
                      <span className="block text-[11px] text-slate-500">Pereche spot pe bursă exactă</span>
                    </div>
                    <ArrowUpRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-cyan-300" />
                  </button>

                  <button
                    onClick={() => { setQuery('gold'); inputRef.current?.focus(); }}
                    className="p-2.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.04] text-left transition-all flex items-center justify-between group"
                  >
                    <div>
                      <span className="font-bold text-slate-200 group-hover:text-cyan-300">gold</span>
                      <span className="block text-[11px] text-slate-500">Metal prețios refugiu ($XAU)</span>
                    </div>
                    <ArrowUpRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-cyan-300" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Hints */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-white/[0.06] bg-background-surface/50 text-[11px] font-mono text-slate-500">
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline">Navighează: <strong className="text-slate-400">↑ / ↓</strong></span>
            <span>Selectează: <strong className="text-emerald-400">Enter ↵</strong></span>
            <span>Închide: <strong className="text-slate-400">ESC</strong></span>
          </div>
          <span className="text-cyan-400/80">Symbol Search · burse și perechi</span>
        </div>
      </div>
    </div>
  );
};
