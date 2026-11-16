import { AssetLinksMenu } from './AssetLinksMenu.js';
import React, { useMemo, useState } from 'react';
import { Segmented } from './ui/Segmented.js';
import { useLanguage } from '../i18n.js';
import { formatPrice } from '../utils/price.js';
import {
  AssetScannerRow,
  MoneyLineTier,
  Timeframe
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
  Award,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  GripVertical,
  SlidersHorizontal,
  X,
  DollarSign,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  ChevronLeft
} from 'lucide-react';

export type SortField =
  | 'symbol'
  | 'price'
  | 'change24h'
  | 'changeYtd'
  | 'moneyLine1hPercent'
  | 'moneyLine4hPercent'
  | 'moneyLine8hPercent'
  | 'moneyLine1dPercent'
  | 'moneyLine1wPercent'
  | 'marketCap'
  | 'moneyLineScore'
  | 'tier'
  | 'rvol'
  | 'volatilityAtrPercent'
  | 'xTrendScore'
  | 'aiConfidence';

export type SortDirection = 'asc' | 'desc' | 'newFlip';
type MoneyLineSortField =
  | 'moneyLine1hPercent'
  | 'moneyLine4hPercent'
  | 'moneyLine8hPercent'
  | 'moneyLine1dPercent'
  | 'moneyLine1wPercent';

const MONEY_LINE_SORT_FIELDS = new Set<SortField>([
  'moneyLine1hPercent',
  'moneyLine4hPercent',
  'moneyLine8hPercent',
  'moneyLine1dPercent',
  'moneyLine1wPercent'
]);

const isMoneyLineSortField = (field: SortField | null): field is MoneyLineSortField =>
  Boolean(field && MONEY_LINE_SORT_FIELDS.has(field));

const getMoneyLineTimeframe = (field: SortField | null): Timeframe | undefined => {
  if (field === 'moneyLine1hPercent') return '1h';
  if (field === 'moneyLine4hPercent') return '4h';
  if (field === 'moneyLine8hPercent') return '8h';
  if (field === 'moneyLine1dPercent') return '1d';
  if (field === 'moneyLine1wPercent') return '1w';
  return undefined;
};

const getMoneyLineFlipState = (row: AssetScannerRow, field: MoneyLineSortField) => {
  if (field === 'moneyLine1hPercent') {
    return { isTransition: Boolean(row.moneyLine1hIsTransition), flipTime: row.moneyLine1hFlipTime || 0 };
  }
  if (field === 'moneyLine4hPercent') {
    return { isTransition: Boolean(row.moneyLine4hIsTransition), flipTime: row.moneyLine4hFlipTime || 0 };
  }
  if (field === 'moneyLine8hPercent') {
    return { isTransition: Boolean(row.moneyLine8hIsTransition), flipTime: row.moneyLine8hFlipTime || 0 };
  }
  if (field === 'moneyLine1dPercent') {
    return { isTransition: Boolean(row.moneyLine1dIsTransition), flipTime: row.moneyLine1dFlipTime || 0 };
  }
  return { isTransition: Boolean(row.moneyLine1wIsTransition), flipTime: row.moneyLine1wFlipTime || 0 };
};

// Tier numerical weight for sorting
const getTierWeight = (tier: string) => {
  switch (tier) {
    case 'Strong Bullish': return 5;
    case 'Bullish': return 4;
    case 'Neutral': return 3;
    case 'Bearish': return 2;
    case 'Strong Bearish': return 1;
    default: return 0;
  }
};

interface ScannerTableProps {
  rows: AssetScannerRow[];
  onSelectAsset: (
    symbol: string,
    marketClass?: AssetScannerRow['marketClass'],
    timeframe?: Timeframe
  ) => void;
  watchlist: string[];
  onToggleWatchlist: (symbol: string) => void;
  onReorderWatchlist?: (newOrder: string[]) => void;
  selectedTier: string;
  onSelectTier: (tier: string) => void;
  watchlistOnly: boolean;
  onToggleWatchlistOnly: () => void;
  selectedMarketClass?: 'ALL' | 'crypto' | 'stocks' | 'metals';
  onSelectMarketClass?: (market: 'ALL' | 'crypto' | 'stocks' | 'metals') => void;
  selectedNarrative?: string;
  onSelectNarrative?: (narrative: string) => void;
  loading?: boolean;
}

const ScannerTableImpl: React.FC<ScannerTableProps> = ({
  rows,
  onSelectAsset,
  watchlist,
  onToggleWatchlist,
  onReorderWatchlist,
  selectedTier,
  onSelectTier,
  watchlistOnly,
  onToggleWatchlistOnly,
  selectedMarketClass: controlledMarketClass,
  onSelectMarketClass: controlledSetMarketClass,
  selectedNarrative,
  onSelectNarrative,
  loading = false
}) => {
  const [internalMarketClass, setInternalMarketClass] = useState<'ALL' | 'crypto' | 'stocks' | 'metals'>('ALL');
  const selectedMarketClass = controlledMarketClass !== undefined ? controlledMarketClass : internalMarketClass;
  const setSelectedMarketClass = controlledSetMarketClass || setInternalMarketClass;

  // Default sort order: Market Cap DESC
  const [sortField, setSortField] = useState<SortField | null>('marketCap');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [isMlExpanded, setIsMlExpanded] = useState<boolean>(false);
  const [draggedSymbol, setDraggedSymbol] = useState<string | null>(null);
  const [dragOverSymbol, setDragOverSymbol] = useState<string | null>(null);
  const { language } = useLanguage();
  const [density, setDensity] = useState<'essential' | 'full'>(() => { try { return localStorage.getItem('ms-scanner-density') === 'full' ? 'full' : 'essential'; } catch { return 'essential'; } });
  const changeDensity = (next: 'essential' | 'full') => { setDensity(next); try { localStorage.setItem('ms-scanner-density', next); } catch {} };

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

  const cleanWatchlist = useMemo(() => watchlist.map(w => w.replace(/^[$#]/, '').trim().toUpperCase()), [watchlist]);
  const watchSet = useMemo(() => new Set(cleanWatchlist), [cleanWatchlist]);

  // Helper for formatting Market Cap
  const formatMarketCap = (cap?: number) => {
    if (!cap || cap <= 0) return '-';
    if (cap >= 1e12) return `$${(cap / 1e12).toFixed(2)}T`;
    if (cap >= 1e9) return `$${(cap / 1e9).toFixed(2)}B`;
    if (cap >= 1e6) return `$${(cap / 1e6).toFixed(2)}M`;
    return `$${cap.toLocaleString()}`;
  };

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

  // Helper for X Social Momentum badge
  const renderXMomentum = (score?: number) => {
    if (typeof score !== 'number') {
      return <span className="text-xs text-slate-500">—</span>;
    }
    if (score >= 70) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-glow-gold">
          <Flame className="w-3 h-3 text-amber-400 animate-pulse" />
          {score.toFixed(1)} <span className="text-[10px] text-amber-400/80">Viral</span>
        </span>
      );
    }
    if (score >= 45) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-mono font-semibold bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
          <Flame className="w-3 h-3 text-cyan-400" />
          {score.toFixed(1)} <span className="text-[10px] text-cyan-400/80">High</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-mono text-slate-400 bg-slate-800/60 border border-slate-700/50">
        <Flame className="w-3 h-3 text-slate-500" />
        {score.toFixed(1)}
      </span>
    );
  };

  // Helper for Actionable AI Verdict Badge
  const renderAIVerdict = (conf?: number) => {
    if (typeof conf !== 'number') {
      return <span className="text-xs text-slate-500">—</span>;
    }
    const pct = (conf * 100).toFixed(0);
    if (conf >= 0.80) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-glow-emerald">
          <Sparkles className="w-3 h-3 text-emerald-400" />
          Strong Buy ({pct}%)
        </span>
      );
    }
    if (conf >= 0.60) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
          <Sparkles className="w-3 h-3 text-emerald-400" />
          Buy ({pct}%)
        </span>
      );
    }
    if (conf >= 0.40) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-mono font-medium bg-slate-800 text-slate-300 border border-slate-700">
          <Sparkles className="w-3 h-3 text-slate-400" />
          Neutral ({pct}%)
        </span>
      );
    }
    if (conf >= 0.25) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-mono font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30">
          <Sparkles className="w-3 h-3 text-rose-400" />
          Sell ({pct}%)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-glow-ruby">
        <Sparkles className="w-3 h-3 text-rose-400" />
        Risk-Off ({pct}%)
      </span>
    );
  };

  // Helper for rendering multi-timeframe MoneyLine cells (1h, 4h, 8h, 1d, 1w)
  const renderMoneyLineCell = (
    tf: '1h' | '4h' | '8h' | '1d' | '1w',
    isTransition?: boolean,
    tier?: MoneyLineTier,
    flipTime?: number,
    percent?: number,
    symbol?: string,
    marketClass?: AssetScannerRow['marketClass']
  ) => {
    const isBull = tier?.includes('Bullish');
    const isBear = tier?.includes('Bearish');
    const tfLabel = tf.toUpperCase();

    return (
      <td
        data-col={`ml-${tf}`}
        className="py-3.5 px-4 font-mono hover:bg-cyan-500/[0.06] transition-colors"
        onClick={(event) => {
          event.stopPropagation();
          onSelectAsset(symbol || '', marketClass, tf);
        }}
        title={`Deschide ${symbol} pe MoneyLine ${tfLabel}`}
      >
        <div className="flex flex-col gap-0.5">
          {isTransition ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 animate-pulse w-fit">
              <Zap className="w-3 h-3" /> FLIP NOU {tfLabel}
            </span>
          ) : (
            <div className="flex items-center gap-1.5 text-xs">
              <Clock className={`w-3.5 h-3.5 ${
                isBull ? 'text-emerald-400' : (isBear ? 'text-rose-400' : 'text-slate-400')
              }`} />
              <span className={`font-semibold ${
                isBull ? 'text-emerald-300' : (isBear ? 'text-rose-300' : 'text-slate-300')
              }`}>
                {formatFlipAge(flipTime)}
              </span>
            </div>
          )}

          {/* Procentul dedesubt */}
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`inline-flex items-center gap-0.5 font-bold text-[11px] ${
              (percent || 0) > 0 ? 'text-emerald-400' : ((percent || 0) < 0 ? 'text-rose-400' : 'text-slate-400')
            }`}>
              {(percent || 0) > 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : ((percent || 0) < 0 ? <ArrowDownRight className="w-3.5 h-3.5" /> : null)}
              {(percent || 0) > 0 ? `+${(percent || 0).toFixed(2)}%` : `${(percent || 0).toFixed(2)}%`}
            </span>
            {tier && (
              <span className={`inline-block text-[9px] px-1.5 py-0.2 rounded border font-semibold ${
                isBull
                  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                  : (isBear
                    ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                    : 'bg-slate-800 text-slate-400 border-slate-700')
              }`}>
                {tier.replace('Strong ', 'S. ')}
              </span>
            )}
          </div>
        </div>
      </td>
    );
  };

  // Handle header sorting click
  const handleSort = (field: SortField) => {
    if (field === 'moneyLine1hPercent' || field === 'moneyLine4hPercent' || field === 'moneyLine8hPercent' || field === 'moneyLine1dPercent') {
      setIsMlExpanded(true);
    }
    if (sortField === field) {
      setSortDirection(prev => {
        if (!isMoneyLineSortField(field)) return prev === 'asc' ? 'desc' : 'asc';
        if (prev === 'asc') return 'desc';
        if (prev === 'desc') return 'newFlip';
        return 'asc';
      });
    } else {
      setSortField(field);
      setSortDirection(isMoneyLineSortField(field) ? 'asc' : 'desc');
    }
  };

  // Drag and Drop reordering for Watchlist
  const handleDragStart = (e: React.DragEvent, symbol: string) => {
    e.dataTransfer.setData('text/plain', symbol);
    setDraggedSymbol(symbol);
  };

  const handleDragOver = (e: React.DragEvent, targetSymbol: string) => {
    e.preventDefault();
    if (draggedSymbol && draggedSymbol !== targetSymbol) {
      setDragOverSymbol(targetSymbol);
    }
  };

  const handleDrop = (e: React.DragEvent, targetSymbol: string) => {
    e.preventDefault();
    const sourceSymbol = draggedSymbol || e.dataTransfer.getData('text/plain');
    if (!sourceSymbol || sourceSymbol === targetSymbol) {
      setDraggedSymbol(null);
      setDragOverSymbol(null);
      return;
    }

    const currentList = [...cleanWatchlist];
    const sourceIdx = currentList.indexOf(sourceSymbol.toUpperCase());
    const targetIdx = currentList.indexOf(targetSymbol.toUpperCase());

    if (sourceIdx !== -1 && targetIdx !== -1) {
      currentList.splice(sourceIdx, 1);
      currentList.splice(targetIdx, 0, sourceSymbol.toUpperCase());
      if (onReorderWatchlist) {
        onReorderWatchlist(currentList);
      }
    }

    setDraggedSymbol(null);
    setDragOverSymbol(null);
  };

  // Move watchlist item UP or DOWN in the vertical list
  const handleMoveWatchlist = (e: React.MouseEvent, symbol: string, direction: 'up' | 'down') => {
    e.stopPropagation();
    const sym = symbol.toUpperCase();
    const currentList = [...cleanWatchlist];
    const idx = currentList.indexOf(sym);
    if (idx === -1) return;

    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= currentList.length) return;

    currentList.splice(idx, 1);
    currentList.splice(newIdx, 0, sym);
    if (onReorderWatchlist) {
      onReorderWatchlist(currentList);
    }
  };

  const isNewFlipMode = sortDirection === 'newFlip' && isMoneyLineSortField(sortField);
  const activeMoneyLineTimeframe = getMoneyLineTimeframe(sortField);

  // Filter and sort derived rows. Memoized so the table does not re-sort on unrelated renders.
  const filteredRows = useMemo(() => {
    // Filter rows based on tier, watchlist, narrative and 360° market class
    let result = rows.filter(r => {
      const sym = r.symbol.replace(/^[$#]/, '').trim().toUpperCase();
      if (watchlistOnly && !cleanWatchlist.includes(sym)) return false;
      if (selectedTier !== 'ALL' && r.tier !== selectedTier) return false;
      if (selectedNarrative && selectedNarrative !== 'ALL') {
        if (!r.narratives?.includes(selectedNarrative as any)) return false;
      }

      if (selectedMarketClass !== 'ALL') {
        // Market class comes from the verified backend asset definition. Do not
        // use ticker/category guesses here: a Crypto selection must contain only
        // assets explicitly classified as crypto.
        if (selectedMarketClass === 'crypto') return r.marketClass === 'crypto';
        if (r.marketClass) return r.marketClass === selectedMarketClass;
        const isStock = ['SPACEX', 'NVDA', 'TSLA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'PLTR', 'AMD', 'MSTR', 'COIN', 'SPY', 'QQQ'].includes(sym) || r.category?.includes('Stock') || r.category?.includes('Index') || r.category?.includes('Mega-Cap');
        const isMetal = ['XAU', 'XAG', 'PAXG', 'OIL', 'COPPER'].includes(sym) || r.category?.includes('Metal') || r.category?.includes('Commodity');

        if (selectedMarketClass === 'stocks' && !isStock) return false;
        if (selectedMarketClass === 'metals' && !isMetal) return false;
      }

      return true;
    });

    // NEW FLIP is an exact current-closed-candle filter for the selected Money
    // Line timeframe. It intentionally does not mix older transitions into view.
    if (isNewFlipMode) {
      result = result.filter(row => getMoneyLineFlipState(row, sortField).isTransition);
      result = [...result].sort((left, right) => {
        const timeDifference = getMoneyLineFlipState(right, sortField).flipTime - getMoneyLineFlipState(left, sortField).flipTime;
        return timeDifference || (right.marketCap || 0) - (left.marketCap || 0);
      });
    } else if (sortField) {
      result = [...result].sort((a, b) => {
        let comparison = 0;
        switch (sortField) {
          case 'symbol':
            comparison = a.symbol.localeCompare(b.symbol);
            break;
          case 'price':
            comparison = a.price - b.price;
            break;
          case 'change24h':
            comparison = a.change24h - b.change24h;
            break;
          case 'changeYtd':
            comparison = (a.changeYtd || 0) - (b.changeYtd || 0);
            break;
          case 'moneyLine1hPercent':
            comparison = (a.moneyLine1hPercent || 0) - (b.moneyLine1hPercent || 0);
            break;
          case 'moneyLine4hPercent':
            comparison = (a.moneyLine4hPercent || 0) - (b.moneyLine4hPercent || 0);
            break;
          case 'moneyLine8hPercent':
            comparison = (a.moneyLine8hPercent || 0) - (b.moneyLine8hPercent || 0);
            break;
          case 'moneyLine1dPercent':
            comparison = (a.moneyLine1dPercent || 0) - (b.moneyLine1dPercent || 0);
            break;
          case 'moneyLine1wPercent':
            comparison = (a.moneyLine1wPercent || 0) - (b.moneyLine1wPercent || 0);
            break;
          case 'marketCap':
            comparison = (a.marketCap || 0) - (b.marketCap || 0);
            break;
          case 'moneyLineScore':
            comparison = a.moneyLineScore - b.moneyLineScore;
            break;
          case 'tier':
            comparison = getTierWeight(a.tier) - getTierWeight(b.tier);
            break;
          case 'rvol':
            comparison = a.rvol - b.rvol;
            break;
          case 'volatilityAtrPercent':
            comparison = a.volatilityAtrPercent - b.volatilityAtrPercent;
            break;
          case 'xTrendScore':
            comparison = (a.xTrendScore ?? Number.NEGATIVE_INFINITY) - (b.xTrendScore ?? Number.NEGATIVE_INFINITY);
            break;
          case 'aiConfidence':
            comparison = (a.aiConfidence ?? Number.NEGATIVE_INFINITY) - (b.aiConfidence ?? Number.NEGATIVE_INFINITY);
            break;
          default:
            comparison = 0;
        }
        return sortDirection === 'asc' ? comparison : -comparison;
      });
    } else if (watchlistOnly) {
      // Keep custom manual drag order when watchlistOnly is active and no column sort is clicked
      result = [...result].sort((a, b) => {
        const idxA = cleanWatchlist.indexOf(a.symbol.toUpperCase());
        const idxB = cleanWatchlist.indexOf(b.symbol.toUpperCase());
        if (idxA === -1) return 1;
        if (idxB === -1) return -1;
        return idxA - idxB;
      });
    }
    return result;
  }, [rows, watchlistOnly, cleanWatchlist, selectedTier, selectedNarrative, selectedMarketClass, sortField, sortDirection, isNewFlipMode]);

  // Header Sort Icon helper
  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 text-slate-600 group-hover:text-slate-400 transition-colors" />;
    }
    if (sortDirection === 'newFlip' && isMoneyLineSortField(field)) {
      return <Zap className="w-3.5 h-3.5 text-cyan-300 fill-cyan-400/30 animate-pulse" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="w-3 h-3 text-cyan-400 font-bold" />
    ) : (
      <ArrowDown className="w-3 h-3 text-cyan-400 font-bold" />
    );
  };

  return (
    <div className="scanner-section space-y-5" data-density={density}>
      {/* 360° Market Class & Tier Filter Toolbar */}
      <div className="scanner-toolbar">
        <Segmented ariaLabel={language === 'ro' ? 'Filtru semnale' : 'Signal filter'} scrollable size="sm"
          options={tiers.map(t => ({ value: t.id, label: t.label }))} value={selectedTier} onChange={onSelectTier} />
        <div className="scanner-toolbar-right">
          <Segmented ariaLabel="Watchlist" size="sm"
            options={[{ value: 'all', label: language === 'ro' ? 'Toate' : 'All' }, { value: 'watch', label: 'Watchlist', badge: cleanWatchlist.length }]}
            value={watchlistOnly ? 'watch' : 'all'} onChange={() => onToggleWatchlistOnly()} />
          <Segmented className="hidden md:inline-flex" ariaLabel={language === 'ro' ? 'Coloane' : 'Columns'} size="sm"
            options={[{ value: 'essential', label: language === 'ro' ? 'Esențial' : 'Essential' }, { value: 'full', label: language === 'ro' ? 'Complet' : 'Full' }]}
            value={density} onChange={changeDensity} />
            {/* Active Sort Pill with Reset Button */}
            {sortField && !(sortField === 'marketCap' && sortDirection === 'desc') && (
              <div className="flex items-center gap-1.5 text-xs font-mono bg-white/[0.04] px-2.5 py-1 rounded-xl border border-white/[0.08]">
                <span className="text-slate-500">Sort:</span>
                <span className="text-cyan-300 font-semibold uppercase">
                  {sortField === 'marketCap'
                    ? 'Market Cap'
                    : sortField === 'moneyLine1hPercent'
                    ? 'ML 1H'
                    : sortField === 'moneyLine4hPercent'
                    ? 'ML 4H'
                    : sortField === 'moneyLine8hPercent'
                    ? 'ML 8H'
                    : sortField === 'moneyLine1dPercent'
                    ? 'ML 1D'
                    : sortField === 'moneyLine1wPercent'
                    ? 'ML 1W'
                    : sortField} ({sortDirection === 'newFlip' ? 'NEW FLIP ACUM' : sortDirection.toUpperCase()})
                </span>
                <button
                  onClick={() => { setSortField('marketCap'); setSortDirection('desc'); }}
                  className="text-slate-500 hover:text-rose-400 transition-colors ml-0.5"
                  title="Resetează la ordinea Market Cap"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
        </div>
      </div>

      {/* Cyber Table with Interactive Sortable Column Headers & 2D Sticky Headers */}
      <div className="overflow-auto max-h-[75vh] md:max-h-[82vh] rounded-[30px] border border-white/[0.08] card-base relative custom-scrollbar scanner-table-scroll">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="sticky top-0 z-20 bg-[var(--t-surface)] border-b border-white/[0.08] text-[11px] font-mono uppercase tracking-wider text-slate-400 select-none">
            <tr>
              {/* Asset Name & Symbol Header - Sticky TOP and LEFT (Corner cell z-30) */}
              <th data-col="asset"
                onClick={() => handleSort('symbol')}
                className="sticky top-0 left-0 z-30 bg-[var(--t-surface)] border-b border-white/[0.08] border-r border-white/[0.06] py-4 px-4 cursor-pointer hover:text-cyan-300 transition-colors group"
              >
                <div className="flex items-center gap-1.5">
                  <span>Asset</span>
                  {renderSortIcon('symbol')}
                </div>
              </th>

              {/* Price Header */}
              <th data-col="price"
                onClick={() => handleSort('price')}
                className="sticky top-0 bg-[var(--t-surface)] border-b border-white/[0.08] py-3.5 px-4 cursor-pointer hover:text-cyan-300 transition-colors group"
              >
                <div className="flex items-center gap-1.5">
                  <span>Preț</span>
                  {renderSortIcon('price')}
                </div>
              </th>

              {/* Expand/Collapse Timeframe Arrow Button Header */}
              <th data-col="ml-toggle"
                onClick={() => setIsMlExpanded(prev => !prev)}
                className="sticky top-0 bg-[var(--t-surface)] border-b border-white/[0.08] py-3.5 px-2 cursor-pointer hover:text-cyan-300 transition-colors group select-none text-center"
                title={isMlExpanded ? 'Restrânge: afișează doar ML 1W' : 'Apasă săgeata pentru a deschide toate timeframe-urile (ML 1H, 4H, 8H, 1D, 1W)'}
              >
                <div className="flex items-center justify-center">
                  <button
                    type="button"
                    className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono font-bold transition-all shadow-sm ${
                      isMlExpanded
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-glow-cyan'
                        : 'bg-white/[0.06] text-slate-300 border border-white/[0.12] hover:bg-cyan-500/20 hover:text-cyan-300 hover:border-cyan-500/30'
                    }`}
                  >
                    <ChevronRight className={`w-3.5 h-3.5 transition-transform duration-300 ${isMlExpanded ? 'rotate-180 text-cyan-400' : 'text-slate-400 group-hover:text-cyan-300'}`} />
                    <span>{isMlExpanded ? 'Restrânge' : '1h-1d'}</span>
                  </button>
                </div>
              </th>

              {/* Sub-timeframes ML 1H, 4H, 8H, 1D when expanded */}
              {isMlExpanded && (
                <>
                  {/* ML 1H Header */}
                  <th data-col="ml-1h"
                    onClick={() => handleSort('moneyLine1hPercent')}
                    title="Click: crescător → descrescător → NEW FLIP acum"
                    className="sticky top-0 bg-[var(--t-surface)] border-b border-white/[0.08] py-3.5 px-4 cursor-pointer hover:text-cyan-300 transition-colors group animate-fade-in"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>ML 1H</span>
                      {renderSortIcon('moneyLine1hPercent')}
                    </div>
                  </th>

                  {/* ML 4H Header */}
                  <th data-col="ml-4h"
                    onClick={() => handleSort('moneyLine4hPercent')}
                    title="Click: crescător → descrescător → NEW FLIP acum"
                    className="sticky top-0 bg-[var(--t-surface)] border-b border-white/[0.08] py-3.5 px-4 cursor-pointer hover:text-cyan-300 transition-colors group animate-fade-in"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>ML 4H</span>
                      {renderSortIcon('moneyLine4hPercent')}
                    </div>
                  </th>

                  {/* ML 8H Header */}
                  <th data-col="ml-8h"
                    onClick={() => handleSort('moneyLine8hPercent')}
                    title="Click: crescător → descrescător → NEW FLIP acum"
                    className="sticky top-0 bg-[var(--t-surface)] border-b border-white/[0.08] py-3.5 px-4 cursor-pointer hover:text-cyan-300 transition-colors group animate-fade-in"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>ML 8H</span>
                      {renderSortIcon('moneyLine8hPercent')}
                    </div>
                  </th>

                  {/* ML 1D Header */}
                  <th data-col="ml-1d"
                    onClick={() => handleSort('moneyLine1dPercent')}
                    title="Click: crescător → descrescător → NEW FLIP acum"
                    className="sticky top-0 bg-[var(--t-surface)] border-b border-white/[0.08] py-3.5 px-4 cursor-pointer hover:text-cyan-300 transition-colors group animate-fade-in"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>ML 1D</span>
                      {renderSortIcon('moneyLine1dPercent')}
                    </div>
                  </th>
                </>
              )}

              {/* ML 1W (Weekly Flip & %) Header (Always visible) */}
              <th data-col="ml-1w"
                onClick={() => handleSort('moneyLine1wPercent')}
                title="Click: crescător → descrescător → NEW FLIP acum"
                className="sticky top-0 bg-[var(--t-surface)] border-b border-white/[0.08] py-3.5 px-4 cursor-pointer hover:text-cyan-300 transition-colors group"
              >
                <div className="flex items-center gap-1.5">
                  <span>ML 1W</span>
                  {renderSortIcon('moneyLine1wPercent')}
                </div>
              </th>

              {/* 24h Change Header */}
              <th data-col="change24h"
                onClick={() => handleSort('change24h')}
                className="sticky top-0 bg-[var(--t-surface)] border-b border-white/[0.08] py-3.5 px-4 cursor-pointer hover:text-cyan-300 transition-colors group"
              >
                <div className="flex items-center gap-1.5">
                  <span>Var. 24h</span>
                  {renderSortIcon('change24h')}
                </div>
              </th>

              {/* YTD % Change Header */}
              <th data-col="changeYtd"
                onClick={() => handleSort('changeYtd')}
                className="sticky top-0 bg-[var(--t-surface)] border-b border-white/[0.08] py-3.5 px-4 cursor-pointer hover:text-cyan-300 transition-colors group"
              >
                <div className="flex items-center gap-1.5">
                  <span>YTD %</span>
                  {renderSortIcon('changeYtd')}
                </div>
              </th>

              {/* Market Cap Header */}
              <th data-col="marketCap"
                onClick={() => handleSort('marketCap')}
                className="sticky top-0 bg-[var(--t-surface)] border-b border-white/[0.08] py-3.5 px-4 cursor-pointer hover:text-cyan-300 transition-colors group text-cyan-300"
              >
                <div className="flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Market Cap</span>
                  {renderSortIcon('marketCap')}
                </div>
              </th>

              {/* Money Line Score Header */}
              <th data-col="score"
                onClick={() => handleSort('moneyLineScore')}
                className="sticky top-0 bg-[var(--t-surface)] border-b border-white/[0.08] py-3.5 px-4 cursor-pointer hover:text-cyan-300 transition-colors group"
              >
                <div className="flex items-center gap-1.5">
                  <span>Scor Money Line</span>
                  {renderSortIcon('moneyLineScore')}
                </div>
              </th>

              {/* Tier Status Header */}
              <th data-col="tier"
                onClick={() => handleSort('tier')}
                className="sticky top-0 bg-[var(--t-surface)] border-b border-white/[0.08] py-3.5 px-4 cursor-pointer hover:text-cyan-300 transition-colors group"
              >
                <div className="flex items-center gap-1.5">
                  <span>Regim / Tier</span>
                  {renderSortIcon('tier')}
                </div>
              </th>

              {/* RVOL Header */}
              <th data-col="rvol"
                onClick={() => handleSort('rvol')}
                className="sticky top-0 bg-[var(--t-surface)] border-b border-white/[0.08] py-3.5 px-4 cursor-pointer hover:text-cyan-300 transition-colors group"
              >
                <div className="flex items-center gap-1.5">
                  <span>RVOL</span>
                  {renderSortIcon('rvol')}
                </div>
              </th>

              {/* Volatility ATR Header */}
              <th data-col="atr"
                onClick={() => handleSort('volatilityAtrPercent')}
                className="sticky top-0 bg-[var(--t-surface)] border-b border-white/[0.08] py-3.5 px-4 cursor-pointer hover:text-cyan-300 transition-colors group"
              >
                <div className="flex items-center gap-1.5">
                  <span>Volatilitate ATR</span>
                  {renderSortIcon('volatilityAtrPercent')}
                </div>
              </th>

              {/* X Momentum Header */}
              <th data-col="x"
                onClick={() => handleSort('xTrendScore')}
                className="sticky top-0 bg-[var(--t-surface)] border-b border-white/[0.08] py-3.5 px-4 cursor-pointer hover:text-cyan-300 transition-colors group"
              >
                <div className="flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5 text-amber-400" />
                  <span>X Momentum</span>
                  {renderSortIcon('xTrendScore')}
                </div>
              </th>

              {/* AI Bias & Verdict Header */}
              <th data-col="ai"
                onClick={() => handleSort('aiConfidence')}
                className="sticky top-0 bg-[var(--t-surface)] border-b border-white/[0.08] py-3.5 px-4 cursor-pointer hover:text-cyan-300 transition-colors group"
              >
                <div className="flex items-center gap-1.5">
                  <span>AI Verdict</span>
                  {renderSortIcon('aiConfidence')}
                </div>
              </th>

              <th className="sticky top-0 bg-[var(--t-surface)] border-b border-white/[0.08] py-3.5 px-4 text-right">Acțiuni</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {filteredRows.length > 0 ? (
              filteredRows.map((row) => {
                const sym = row.symbol.replace(/^[$#]/, '').trim().toUpperCase();
                const isWatch = watchSet.has(sym);
                const isPositiveChange = row.change24h >= 0;
                const isBull = row.tier?.includes('Bullish');
                const isBear = row.tier?.includes('Bearish');
                const isDragging = draggedSymbol === sym;
                const isOver = dragOverSymbol === sym;

                return (
                  <tr
                    key={row.symbol}
                    tabIndex={0}
                    draggable={isWatch}
                    onDragStart={(e) => handleDragStart(e, sym)}
                    onDragOver={(e) => handleDragOver(e, sym)}
                    onDrop={(e) => handleDrop(e, sym)}
                    onDragEnd={() => { setDraggedSymbol(null); setDragOverSymbol(null); }}
                    onClick={() => onSelectAsset(row.symbol, row.marketClass, activeMoneyLineTimeframe)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onSelectAsset(row.symbol, row.marketClass, activeMoneyLineTimeframe);
                      }
                    }}
                    className={`hover:bg-white/[0.03] transition-colors cursor-pointer group ${
                      isDragging ? 'opacity-30 bg-white/[0.02]' : (isOver ? 'bg-cyan-500/10 border-cyan-400' : '')
                    }`}
                  >
                    {/* Symbol & Name Column - Sticky LEFT (z-10) with matching solid background */}
                    <td data-col="asset" className="sticky left-0 z-10 bg-[var(--t-surface)] group-hover:bg-[var(--t-surface-raised)] border-r border-white/[0.06] py-3.5 px-4 font-mono font-bold transition-colors">
                      <div className="flex items-center gap-2">
                        {watchlistOnly && onReorderWatchlist && (
                          <div className="flex flex-col gap-0.5 text-slate-500 hover:text-slate-300 transition-colors">
                            <button
                              onClick={(e) => handleMoveWatchlist(e, sym, 'up')}
                              disabled={cleanWatchlist.indexOf(sym) === 0}
                              className="p-0.5 hover:text-cyan-300 hover:bg-white/[0.08] disabled:opacity-20 rounded transition-colors"
                              title="Mută mai sus în Watchlist"
                            >
                              <ChevronUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => handleMoveWatchlist(e, sym, 'down')}
                              disabled={cleanWatchlist.indexOf(sym) === cleanWatchlist.length - 1}
                              className="p-0.5 hover:text-cyan-300 hover:bg-white/[0.08] disabled:opacity-20 rounded transition-colors"
                              title="Mută mai jos în Watchlist"
                            >
                              <ChevronDown className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); onToggleWatchlist(row.symbol); }}
                          className="text-slate-500 hover:text-amber-400 transition-colors p-1"
                          title={isWatch ? 'Elimină din Watchlist' : 'Adaugă la Watchlist'}
                        >
                          <Star className={`w-3.5 h-3.5 ${isWatch ? 'fill-amber-400 text-amber-400' : ''}`} />
                        </button>
                        <div>
                          <div className="text-white group-hover:text-cyan-300 transition-colors text-sm font-bold flex items-center gap-1.5">
                            <span>${row.symbol}</span>
                            {row.marketClass && (
                              <span className={`text-[9px] font-mono px-1 py-0.2 rounded uppercase border font-semibold ${
                                row.marketClass === 'stocks'
                                  ? 'bg-blue-500/10 text-blue-300 border-blue-500/20'
                                  : row.marketClass === 'crypto'
                                    ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20'
                                    : 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                              }`}>
                                {row.marketClass === 'stocks' ? 'STK' : row.marketClass === 'crypto' ? 'CRY' : 'MET'}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 font-sans font-normal truncate max-w-[120px]">
                            <bdi translate="no">{row.name}</bdi>
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Price */}
                    <td data-col="price" className="py-3.5 px-4 font-mono font-medium">
                      ${formatPrice(row.price)}
                    </td>

                    {/* Expand/Collapse Column indicator/spacer */}
                    <td data-col="ml-toggle" className="py-3.5 px-2 text-center text-slate-600 font-mono text-[10px]">
                      <div className="w-1 h-1 rounded-full bg-white/[0.1] mx-auto"></div>
                    </td>

                    {/* If expanded: ML 1H, ML 4H, ML 8H, ML 1D */}
                    {isMlExpanded && (
                      <>
                        {renderMoneyLineCell('1h', row.moneyLine1hIsTransition, row.moneyLine1hTier, row.moneyLine1hFlipTime, row.moneyLine1hPercent, row.symbol, row.marketClass)}
                        {renderMoneyLineCell('4h', row.moneyLine4hIsTransition, row.moneyLine4hTier, row.moneyLine4hFlipTime, row.moneyLine4hPercent, row.symbol, row.marketClass)}
                        {renderMoneyLineCell('8h', row.moneyLine8hIsTransition, row.moneyLine8hTier, row.moneyLine8hFlipTime, row.moneyLine8hPercent, row.symbol, row.marketClass)}
                        {renderMoneyLineCell('1d', row.moneyLine1dIsTransition, row.moneyLine1dTier, row.moneyLine1dFlipTime, row.moneyLine1dPercent, row.symbol, row.marketClass)}
                      </>
                    )}

                    {/* ML 1W (Always visible) */}
                    {renderMoneyLineCell('1w', row.moneyLine1wIsTransition, row.moneyLine1wTier, row.moneyLine1wFlipTime, row.moneyLine1wPercent, row.symbol, row.marketClass)}

                    {/* 24h Change */}
                    <td data-col="change24h" className="py-3.5 px-4 font-mono">
                      <span className={`inline-flex items-center gap-0.5 font-bold ${
                        isPositiveChange ? 'text-emerald-400' : 'text-rose-400'
                      }`}>
                        {isPositiveChange ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                        {isPositiveChange ? `+${row.change24h}%` : `${row.change24h}%`}
                      </span>
                    </td>

                    {/* YTD % */}
                    <td data-col="changeYtd" className="py-3.5 px-4 font-mono">
                      {row.changeYtd !== undefined ? (
                        <span className={`inline-flex items-center gap-0.5 font-bold ${
                          row.changeYtd >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}>
                          {row.changeYtd >= 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                          {row.changeYtd >= 0 ? `+${row.changeYtd}%` : `${row.changeYtd}%`}
                        </span>
                      ) : (
                        <span className="text-slate-500">-</span>
                      )}
                    </td>

                    {/* Market Cap Column */}
                    <td data-col="marketCap" className="py-3.5 px-4 font-mono font-bold text-cyan-300">
                      {formatMarketCap(row.marketCap)}
                    </td>

                    {/* Money Line Score */}
                    <td data-col="score" className="py-3.5 px-4 font-mono">
                      {getScoreBadge(row.moneyLineScore, row.tier)}
                    </td>

                    {/* Tier Status & Transition */}
                    <td data-col="tier" className="py-3.5 px-4">
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

                    {/* RVOL */}
                    <td data-col="rvol" className="py-3.5 px-4 font-mono text-slate-300">
                      <span className={row.rvol > 1.5 ? 'text-cyan-400 font-bold' : ''}>
                        {row.rvol.toFixed(2)}x
                      </span>
                    </td>

                    {/* ATR Volatility */}
                    <td data-col="atr" className="py-3.5 px-4 font-mono text-slate-400">
                      {row.volatilityAtrPercent.toFixed(2)}%
                    </td>

                    {/* X Momentum */}
                    <td data-col="x" className="py-3.5 px-4 font-mono">
                      {renderXMomentum(row.xTrendScore)}
                    </td>

                    {/* AI Verdict */}
                    <td data-col="ai" className="py-3.5 px-4 font-mono">
                      {renderAIVerdict(row.aiConfidence)}
                    </td>

                    {/* Actions */}
                    <td data-col="actions" className="py-3.5 px-4 text-right">
                      <div onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()} className="flex items-center justify-end gap-2 whitespace-nowrap"><AssetLinksMenu symbol={row.symbol} marketClass={row.marketClass} />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectAsset(row.symbol, row.marketClass, activeMoneyLineTimeframe);
                        }}
                        className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-cyan-500/20 text-slate-400 hover:text-cyan-300 border border-white/[0.06] hover:border-cyan-500/30 transition-all"
                        title="Deschide Panoul de Analiză Detaliată"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={isMlExpanded ? 19 : 15} className="py-14 text-center text-slate-400 font-mono space-y-3">
                  {loading ? (
                    <div className="space-y-2">
                      <RefreshCw className="w-6 h-6 mx-auto animate-spin text-cyan-400" />
                      <p className="text-sm font-bold text-slate-200">Se încarcă semnalele Live Market Scanner 360...</p>
                      <p className="text-xs text-slate-500">Se sincronizează datele de piață 360°.</p>
                    </div>
                  ) : isNewFlipMode ? (
                    <div className="space-y-3">
                      <Zap className="w-7 h-7 mx-auto text-cyan-400" />
                      <p className="text-sm font-bold text-slate-200">Niciun NEW FLIP confirmat pe ultima lumânare închisă.</p>
                      <p className="text-xs text-slate-500">
                        Timeframe urmărit: <span className="text-cyan-300 font-bold">
                          {sortField === 'moneyLine1hPercent'
                            ? 'ML 1H'
                            : sortField === 'moneyLine4hPercent'
                            ? 'ML 4H'
                            : sortField === 'moneyLine8hPercent'
                            ? 'ML 8H'
                            : sortField === 'moneyLine1dPercent'
                            ? 'ML 1D'
                            : 'ML 1W'}
                        </span>
                      </p>
                      <button
                        onClick={() => setSortDirection('desc')}
                        className="px-3.5 py-1.5 text-xs font-bold font-mono rounded-lg bg-cyan-500/15 text-cyan-300 border border-cyan-500/35 hover:bg-cyan-500/25 transition-all"
                      >
                        Revino la sortare descrescătoare
                      </button>
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
                        onClick={() => { onSelectTier('ALL'); setSelectedMarketClass('ALL'); setSortField('marketCap'); setSortDirection('desc'); }}
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

export const ScannerTable = React.memo(ScannerTableImpl);
