import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  ChevronRight,
  LayoutGrid,
  RefreshCw,
  Search,
  TrendingDown,
  TrendingUp
} from 'lucide-react';
import {
  CryptoBubbleAsset,
  CryptoBubbleTimeframe,
  fetchCryptoBubbles,
  fetchScanner
} from '../services/api.js';
import { useLanguage } from '../i18n.js';

type HeatMapScope = 'crypto' | 'stocks' | 'metals';
type SortField = 'rank' | 'price' | 'change' | 'changeYtd' | 'marketCap';
type SortDirection = 'asc' | 'desc';

interface CryptoHeatMapViewProps {
  onSelectAsset: (symbol: string, coinGeckoId?: string, marketClass?: string) => void;
}

interface HeatRect {
  coin: CryptoBubbleAsset;
  x: number;
  y: number;
  width: number;
  height: number;
}

const TIMEFRAMES: Array<{ id: CryptoBubbleTimeframe; label: string }> = [
  { id: '1d', label: '1D' },
  { id: '1w', label: '1W' },
  { id: '1m', label: '1M' }
];

const splitTreemap = (
  coins: CryptoBubbleAsset[],
  x: number,
  y: number,
  width: number,
  height: number,
  minimumWeight?: number
): HeatRect[] => {
  if (!coins.length) return [];
  if (coins.length === 1) return [{ coin: coins[0], x, y, width, height }];

  const weightFloor = minimumWeight ?? coins.reduce((sum, coin) => sum + Math.max(coin.marketCap, 1), 0) * 0.004;
  const weightOf = (coin: CryptoBubbleAsset) => Math.max(coin.marketCap, weightFloor);
  const total = coins.reduce((sum, coin) => sum + weightOf(coin), 0);
  let running = 0;
  let splitIndex = 1;
  for (let index = 0; index < coins.length - 1; index += 1) {
    running += weightOf(coins[index]);
    splitIndex = index + 1;
    if (running >= total / 2) break;
  }

  const first = coins.slice(0, splitIndex);
  const second = coins.slice(splitIndex);
  const firstWeight = first.reduce((sum, coin) => sum + weightOf(coin), 0);
  const ratio = Math.max(0.08, Math.min(0.92, firstWeight / total));

  if (width >= height) {
    const firstWidth = width * ratio;
    return [
      ...splitTreemap(first, x, y, firstWidth, height, weightFloor),
      ...splitTreemap(second, x + firstWidth, y, width - firstWidth, height, weightFloor)
    ];
  }

  const firstHeight = height * ratio;
  return [
    ...splitTreemap(first, x, y, width, firstHeight, weightFloor),
    ...splitTreemap(second, x, y + firstHeight, width, height - firstHeight, weightFloor)
  ];
};

const formatMarketCap = (value: number | undefined | null) => {
  if (!value || Number.isNaN(value)) return '$0';
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  return `$${(value / 1e6).toFixed(0)}M`;
};

const formatPrice = (value: number | undefined | null) => {
  if (value === undefined || value === null || Number.isNaN(value)) return '$0.00';
  if (value >= 1000) {
    return '$' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (value >= 1) {
    return '$' + value.toFixed(2);
  }
  if (value >= 0.001) {
    return '$' + value.toFixed(4);
  }
  return '$' + value.toFixed(6);
};

const heatColor = (change: number | null) => {
  if (change === null) return 'rgba(71,85,105,0.72)';
  const intensity = Math.min(1, Math.abs(change) / 10);
  const alpha = 0.42 + intensity * 0.48;
  return change >= 0
    ? `rgba(5,150,105,${alpha})`
    : `rgba(225,29,72,${alpha})`;
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const getTileTypography = (rect: HeatRect) => {
  const area = rect.width * rect.height;
  const prominence = clamp((Math.sqrt(area) - 3) / 48, 0, 1);

  return {
    prominence,
    name: 11 + prominence * 25,
    change: 11 + prominence * 17,
    marketCap: 10 + prominence * 11
  };
};

export const CryptoHeatMapView: React.FC<CryptoHeatMapViewProps> = ({ onSelectAsset }) => {
  const { language } = useLanguage();
  const [scope, setScope] = useState<HeatMapScope>('crypto');
  const [timeframe, setTimeframe] = useState<CryptoBubbleTimeframe>('1d');
  const [coins, setCoins] = useState<CryptoBubbleAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Detailed list state
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('rank');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const isRo = language === 'ro';

  const loadCoins = async () => {
    setLoading(true);
    setError(null);
    try {
      if (scope === 'crypto') {
        try {
          const data = await fetchCryptoBubbles(timeframe);
          if (data && data.length > 0) {
            setCoins(data.slice(0, 150));
            return;
          }
        } catch (cgErr) {
          console.warn('fetchCryptoBubbles failed, falling back to scanner crypto assets:', cgErr);
        }

        // Resilient Fallback: fetchScanner for crypto (up to 150)
        const tfMap: Record<CryptoBubbleTimeframe, string> = { '1d': '1d', '1w': '1w', '1m': '1w' };
        const rows = await fetchScanner(tfMap[timeframe] as any, undefined, undefined, false, undefined, 'crypto');
        const sorted = rows
          .filter(r => (r.marketCap ?? 0) > 0 || r.price > 0)
          .sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0))
          .slice(0, 150);
        const mapped: CryptoBubbleAsset[] = sorted.map((r, i) => ({
          id: r.symbol.toLowerCase(),
          symbol: r.symbol,
          name: r.name,
          image: '',
          rank: i + 1,
          price: r.price,
          marketCap: r.marketCap || 0,
          change: timeframe === '1d' ? r.change24h
            : timeframe === '1m' ? (r.changeYtd ?? r.timeframeChangePercent ?? r.change24h)
            : (r.timeframeChangePercent ?? r.change24h),
          changeYtd: r.changeYtd ?? null
        }));
        setCoins(mapped);
      } else if (scope === 'stocks') {
        // Stocks: use scanner endpoint, slice up to 100
        const tfMap: Record<CryptoBubbleTimeframe, string> = { '1d': '1d', '1w': '1w', '1m': '1w' };
        const rows = await fetchScanner(tfMap[timeframe] as any, undefined, undefined, false, undefined, 'stocks');
        const sorted = rows
          .filter(r => (r.marketCap ?? 0) > 0 || r.price > 0)
          .sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0))
          .slice(0, 100);
        const mapped: CryptoBubbleAsset[] = sorted.map((r, i) => ({
          id: r.symbol,
          symbol: r.symbol,
          name: r.name,
          image: '',
          rank: i + 1,
          price: r.price,
          marketCap: r.marketCap || 0,
          change: timeframe === '1d' ? r.change24h
            : timeframe === '1m' ? (r.changeYtd ?? r.timeframeChangePercent ?? r.change24h)
            : (r.timeframeChangePercent ?? r.change24h),
          changeYtd: r.changeYtd ?? null
        }));
        setCoins(mapped);
      } else {
        // Metals & Commodities: use scanner endpoint, slice up to 50 (or all available in catalog)
        const tfMap: Record<CryptoBubbleTimeframe, string> = { '1d': '1d', '1w': '1w', '1m': '1w' };
        const rows = await fetchScanner(tfMap[timeframe] as any, undefined, undefined, false, undefined, 'metals');
        const sorted = rows
          .filter(r => (r.marketCap ?? 0) > 0 || r.price > 0)
          .sort((a, b) => {
            if ((b.marketCap || 0) !== (a.marketCap || 0)) {
              return (b.marketCap || 0) - (a.marketCap || 0);
            }
            return (b.price || 0) - (a.price || 0);
          })
          .slice(0, 50);
        const mapped: CryptoBubbleAsset[] = sorted.map((r, i) => ({
          id: r.symbol,
          symbol: r.symbol,
          name: r.name,
          image: '',
          rank: i + 1,
          price: r.price,
          marketCap: r.marketCap || 0,
          change: timeframe === '1d' ? r.change24h
            : timeframe === '1m' ? (r.changeYtd ?? r.timeframeChangePercent ?? r.change24h)
            : (r.timeframeChangePercent ?? r.change24h),
          changeYtd: r.changeYtd ?? null
        }));
        setCoins(mapped);
      }
    } catch (loadError) {
      console.error(loadError);
      setError(isRo ? 'Heat map-ul live nu este disponibil momentan.' : 'The live heat map is currently unavailable.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCoins();
  }, [timeframe, scope]);

  const rectangles = useMemo(
    () => splitTreemap([...coins].sort((a, b) => b.marketCap - a.marketCap), 0, 0, 100, 100),
    [coins]
  );

  const filteredAndSortedCoins = useMemo(() => {
    let list = [...coins];
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase().replace(/^[$#]/, '');
      list = list.filter(
        c => c.symbol.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      let valA: number = 0;
      let valB: number = 0;

      switch (sortField) {
        case 'rank':
          valA = a.rank;
          valB = b.rank;
          break;
        case 'price':
          valA = a.price ?? 0;
          valB = b.price ?? 0;
          break;
        case 'change':
          valA = a.change ?? -9999;
          valB = b.change ?? -9999;
          break;
        case 'changeYtd':
          valA = a.changeYtd ?? -9999;
          valB = b.changeYtd ?? -9999;
          break;
        case 'marketCap':
          valA = a.marketCap ?? 0;
          valB = b.marketCap ?? 0;
          break;
      }

      if (sortDirection === 'asc') {
        return valA > valB ? 1 : valA < valB ? -1 : 0;
      } else {
        return valA < valB ? 1 : valA > valB ? -1 : 0;
      }
    });

    return list;
  }, [coins, searchQuery, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      // Default to descending for numbers/percentages, ascending for rank
      setSortDirection(field === 'rank' ? 'asc' : 'desc');
    }
  };

  const scopeTitle = scope === 'crypto'
    ? (isRo ? 'Top 150 Crypto după Market Cap' : 'Top 150 Crypto by Market Cap')
    : scope === 'stocks'
    ? (isRo ? 'Top 100 Stocks după Market Cap' : 'Top 100 Stocks by Market Cap')
    : (isRo ? `Metale & Mărfuri — Top ${coins.length} după Market Cap` : `Metals & Commodities — Top ${coins.length} by Market Cap`);

  const scopeSubtitle = isRo
    ? 'Mărimea fiecărei zone reflectă capitalizarea, iar culoarea arată variația timeframe-ului selectat.'
    : 'Tile size reflects market capitalization and color shows the selected timeframe return.';

  const sourceLabel = scope === 'crypto'
    ? 'CoinGecko live · Market Cap weighted (Top 150)'
    : scope === 'stocks'
    ? 'Market Scanner 360 · Market Cap weighted (Top 100)'
    : `Market Scanner 360 · Market Cap weighted (Top ${coins.length})`;

  return (
    <section className="space-y-6 tab-content-enter pb-12">
      {/* ── Header ── */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="flex items-center gap-2 text-cyan-300">
            <LayoutGrid className="h-5 w-5" />
            <span className="font-mono text-xs font-bold uppercase tracking-[0.18em]">Heat Map</span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">
            {scopeTitle}
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {scopeSubtitle}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start">
          {/* Scope toggle: Crypto (Top 150) / Stocks (Top 100) / Metals (Top 50) */}
          <div className="flex items-center rounded-xl border border-white/[0.07] bg-white/[0.03] p-1 gap-1">
            {(['crypto', 'stocks', 'metals'] as HeatMapScope[]).map(s => {
              const label = s === 'crypto'
                ? 'Crypto (Top 150)'
                : s === 'stocks'
                ? 'Stocks (Top 100)'
                : (isRo ? 'Metale (Top 50)' : 'Metals (Top 50)');

              const isSelected = scope === s;
              const colorClass = isSelected
                ? s === 'crypto'
                  ? 'bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/25 shadow-sm'
                  : s === 'stocks'
                  ? 'bg-blue-500/20 text-blue-200 ring-1 ring-blue-400/25 shadow-sm'
                  : 'bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/25 shadow-sm'
                : 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-200';

              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setScope(s)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-mono font-bold transition-all ${colorClass}`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Timeframe pills */}
          <div className="flex items-center rounded-xl border border-white/[0.07] bg-white/[0.03] p-1">
            {TIMEFRAMES.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTimeframe(item.id)}
                className={`rounded-lg px-3.5 py-2 text-xs font-mono font-bold transition-all ${
                  timeframe === item.id
                    ? 'bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/25'
                    : 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-200'
                }`}
              >
                {item.label}
              </button>
            ))}
            <button
              type="button"
              onClick={loadCoins}
              disabled={loading}
              className="ml-1 rounded-lg p-2 text-slate-400 hover:bg-white/[0.06] hover:text-cyan-200 disabled:opacity-50"
              title={isRo ? 'Actualizează datele' : 'Refresh data'}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Legend ── */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-white/[0.05] bg-white/[0.02] px-4 py-3 text-[11px] font-mono text-slate-400">
        <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500" />{isRo ? 'Creștere' : 'Gain'}</span>
        <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-rose-600" />{isRo ? 'Scădere' : 'Loss'}</span>
        <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-slate-600" />{isRo ? 'Fără date' : 'No data'}</span>
        <span className="ml-auto">{sourceLabel}</span>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          <AlertCircle className="h-4 w-4" />{error}
        </div>
      )}

      {/* ── Treemap Squares Visual ── */}
      <div className="relative min-h-[520px] sm:min-h-[640px] md:min-h-[720px] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#202b22] shadow-2xl">
        {loading && !coins.length ? (
          <div className="flex min-h-[520px] items-center justify-center gap-3 font-mono text-sm text-slate-400">
            <RefreshCw className="h-5 w-5 animate-spin text-cyan-400" />
            {isRo ? 'Se construiește heat map-ul live...' : 'Building the live heat map...'}
          </div>
        ) : rectangles.map(rect => {
          const positive = (rect.coin.change ?? 0) >= 0;
          const typography = getTileTypography(rect);
          const roomy = rect.width > 10 && rect.height > 9;
          return (
            <button
              key={rect.coin.id}
              type="button"
              onClick={() => onSelectAsset(
                rect.coin.symbol,
                scope === 'crypto' ? rect.coin.id : undefined,
                scope
              )}
              title={`${rect.coin.name} · #${rect.coin.rank} · ${formatMarketCap(rect.coin.marketCap)} · Preț: ${formatPrice(rect.coin.price)} · ${rect.coin.change === null ? '—' : `${rect.coin.change >= 0 ? '+' : ''}${rect.coin.change.toFixed(2)}%`} · YTD: ${rect.coin.changeYtd !== undefined && rect.coin.changeYtd !== null ? `${rect.coin.changeYtd >= 0 ? '+' : ''}${rect.coin.changeYtd.toFixed(2)}%` : '—'}`}
              className="absolute overflow-hidden border border-black/50 p-0.5 text-center text-white transition-[filter,transform] duration-150 hover:z-20 hover:brightness-125 focus:z-20 focus:outline-none focus:ring-2 focus:ring-cyan-300"
              style={{
                left: `calc(${rect.x}% + 1px)`,
                top: `calc(${rect.y}% + 1px)`,
                width: `calc(${rect.width}% - 2px)`,
                height: `calc(${rect.height}% - 2px)`,
                backgroundColor: heatColor(rect.coin.change)
              }}
            >
              <span className="flex h-full min-w-0 flex-col items-center justify-center overflow-hidden leading-none">
                <span
                  className="flex max-w-full items-center justify-center gap-1.5 font-mono font-black tracking-tight"
                  style={{ fontSize: `${typography.name}px` }}
                >
                  {roomy && rect.coin.image && (
                    <img
                      src={rect.coin.image}
                      alt=""
                      className="shrink-0 rounded-full"
                      style={{ width: `${clamp(typography.name * 0.82, 14, 27)}px`, height: `${clamp(typography.name * 0.82, 14, 27)}px` }}
                      loading="lazy"
                    />
                  )}
                  <span className="truncate">{rect.coin.name}</span>
                </span>
                <span
                  className={`mt-px max-w-full truncate font-mono font-black ${positive ? 'text-emerald-50' : 'text-rose-50'}`}
                  style={{ fontSize: `${typography.change}px` }}
                >
                  {rect.coin.change === null ? '—' : `${positive ? '+' : ''}${rect.coin.change.toFixed(2)}%`}
                </span>
                <span
                  className="mt-px max-w-full truncate font-mono font-semibold text-white/80"
                  style={{ fontSize: `${typography.marketCap}px` }}
                >
                  {formatMarketCap(rect.coin.marketCap)}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Top Detailed List / Table (Optimized for Mobile & Desktop) ── */}
      <div className="rounded-2xl border border-white/[0.08] bg-[#202b22] shadow-xl overflow-hidden">
        {/* Subheader & Search */}
        <div className="p-4 sm:p-5 border-b border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-white/[0.02] to-transparent">
          <div>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase border ${
                scope === 'crypto'
                  ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20'
                  : scope === 'stocks'
                  ? 'bg-blue-500/10 text-blue-300 border-blue-500/20'
                  : 'bg-amber-500/10 text-amber-300 border-amber-500/20'
              }`}>
                {scope === 'crypto' ? 'Crypto' : scope === 'stocks' ? 'Stocks' : 'Metale'}
              </span>
              <h2 className="text-base sm:text-lg font-bold text-white font-sans">
                {scopeTitle}
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5 font-sans">
              {isRo
                ? 'Listă completă cu preț live, variație interval și randament YTD %.'
                : 'Detailed breakdown with live price, timeframe return and YTD % return.'}
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Search Input */}
            <div className="relative flex-1 sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={isRo ? `Caută în ${scope === 'crypto' ? 'Top 150 Crypto' : scope === 'stocks' ? 'Top 100 Stocks' : 'Metale'}...` : `Search in ${scope === 'crypto' ? 'Top 150 Crypto' : scope === 'stocks' ? 'Top 100 Stocks' : 'Metals'}...`}
                className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 font-mono"
              />
            </div>
            <span className="shrink-0 px-2.5 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-[11px] font-mono text-slate-400">
              {filteredAndSortedCoins.length} / {coins.length}
            </span>
          </div>
        </div>

        {/* Desktop Table (Visible on md+) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/[0.06] bg-white/[0.02] text-[11px] font-mono uppercase text-slate-400">
                <th
                  onClick={() => handleSort('rank')}
                  className="py-3 px-4 font-semibold cursor-pointer hover:text-cyan-300 transition-colors w-16"
                >
                  <span className="flex items-center gap-1">
                    # {sortField === 'rank' && (sortDirection === 'asc' ? '▲' : '▼')}
                  </span>
                </th>
                <th className="py-3 px-4 font-semibold">Asset</th>
                <th
                  onClick={() => handleSort('price')}
                  className="py-3 px-4 font-semibold text-right cursor-pointer hover:text-cyan-300 transition-colors"
                >
                  <span className="flex items-center justify-end gap-1">
                    {isRo ? 'Preț' : 'Price'} {sortField === 'price' && (sortDirection === 'asc' ? '▲' : '▼')}
                  </span>
                </th>
                <th
                  onClick={() => handleSort('change')}
                  className="py-3 px-4 font-semibold text-right cursor-pointer hover:text-cyan-300 transition-colors"
                >
                  <span className="flex items-center justify-end gap-1">
                    {isRo ? 'Variație' : 'Change'} ({timeframe.toUpperCase()}) {sortField === 'change' && (sortDirection === 'asc' ? '▲' : '▼')}
                  </span>
                </th>
                <th
                  onClick={() => handleSort('changeYtd')}
                  className="py-3 px-4 font-semibold text-right cursor-pointer hover:text-cyan-300 transition-colors"
                >
                  <span className="flex items-center justify-end gap-1">
                    YTD % {sortField === 'changeYtd' && (sortDirection === 'asc' ? '▲' : '▼')}
                  </span>
                </th>
                <th
                  onClick={() => handleSort('marketCap')}
                  className="py-3 px-4 font-semibold text-right cursor-pointer hover:text-cyan-300 transition-colors"
                >
                  <span className="flex items-center justify-end gap-1">
                    Market Cap {sortField === 'marketCap' && (sortDirection === 'asc' ? '▲' : '▼')}
                  </span>
                </th>
                <th className="py-3 px-4 text-center font-semibold w-28">
                  {isRo ? 'Acțiune' : 'Action'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04] text-xs font-mono">
              {filteredAndSortedCoins.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500 font-mono">
                    {isRo ? 'Niciun asset găsit.' : 'No assets found.'}
                  </td>
                </tr>
              ) : (
                filteredAndSortedCoins.map(coin => {
                  const isChangePos = (coin.change ?? 0) >= 0;
                  const isYtdPos = (coin.changeYtd ?? 0) >= 0;
                  const hasYtd = coin.changeYtd !== undefined && coin.changeYtd !== null;

                  return (
                    <tr
                      key={coin.id}
                      onClick={() => onSelectAsset(coin.symbol, scope === 'crypto' ? coin.id : undefined, scope)}
                      className="hover:bg-white/[0.03] transition-colors cursor-pointer group"
                    >
                      {/* Rank */}
                      <td className="py-3.5 px-4 text-slate-500 font-bold">
                        #{coin.rank}
                      </td>

                      {/* Asset Info */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          {coin.image ? (
                            <img
                              src={coin.image}
                              alt={coin.symbol}
                              className="w-6 h-6 rounded-full shrink-0"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-[10px] font-bold text-blue-300 shrink-0">
                              {coin.symbol.slice(0, 2)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-white group-hover:text-cyan-300 transition-colors">
                                ${coin.symbol}
                              </span>
                              <span className="text-[10px] text-slate-500 font-sans truncate max-w-[140px]">
                                {coin.name}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Price */}
                      <td className="py-3.5 px-4 text-right font-semibold text-slate-100">
                        {formatPrice(coin.price)}
                      </td>

                      {/* Timeframe Change % */}
                      <td className="py-3.5 px-4 text-right">
                        {coin.change === null ? (
                          <span className="text-slate-500">—</span>
                        ) : (
                          <span className={`inline-flex items-center gap-0.5 font-bold ${
                            isChangePos ? 'text-emerald-400' : 'text-rose-400'
                          }`}>
                            {isChangePos ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                            {isChangePos ? `+${coin.change.toFixed(2)}%` : `${coin.change.toFixed(2)}%`}
                          </span>
                        )}
                      </td>

                      {/* YTD % */}
                      <td className="py-3.5 px-4 text-right">
                        {!hasYtd ? (
                          <span className="text-slate-500">—</span>
                        ) : (
                          <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md font-bold text-[11px] border ${
                            isYtdPos
                              ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
                              : 'bg-rose-500/10 border-rose-500/25 text-rose-300'
                          }`}>
                            {isYtdPos ? `+${coin.changeYtd!.toFixed(2)}%` : `${coin.changeYtd!.toFixed(2)}%`}
                          </span>
                        )}
                      </td>

                      {/* Market Cap */}
                      <td className="py-3.5 px-4 text-right font-semibold text-slate-300">
                        {formatMarketCap(coin.marketCap)}
                      </td>

                      {/* Action */}
                      <td className="py-3.5 px-4 text-center">
                        <span className="inline-flex items-center gap-1 text-[11px] text-cyan-400/80 group-hover:text-cyan-300 group-hover:underline">
                          Money Line <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards Layout (Visible on mobile screens < md) */}
        <div className="md:hidden divide-y divide-white/[0.05]">
          {filteredAndSortedCoins.length === 0 ? (
            <div className="p-6 text-center text-slate-500 font-mono text-xs">
              {isRo ? 'Niciun asset găsit.' : 'No assets found.'}
            </div>
          ) : (
            filteredAndSortedCoins.map(coin => {
              const isChangePos = (coin.change ?? 0) >= 0;
              const isYtdPos = (coin.changeYtd ?? 0) >= 0;
              const hasYtd = coin.changeYtd !== undefined && coin.changeYtd !== null;

              return (
                <button
                  key={coin.id}
                  type="button"
                  onClick={() => onSelectAsset(coin.symbol, scope === 'crypto' ? coin.id : undefined, scope)}
                  className="w-full p-3.5 text-left hover:bg-white/[0.04] transition-colors flex flex-col gap-2.5"
                >
                  {/* Top Row: Rank, Icon, Symbol, Name & Price */}
                  <div className="flex items-center justify-between gap-2 w-full">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-white/[0.05] text-slate-400 shrink-0">
                        #{coin.rank}
                      </span>
                      {coin.image ? (
                        <img
                          src={coin.image}
                          alt={coin.symbol}
                          className="w-5 h-5 rounded-full shrink-0"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-[9px] font-bold text-blue-300 shrink-0">
                          {coin.symbol.slice(0, 2)}
                        </div>
                      )}
                      <div className="min-w-0 truncate">
                        <span className="font-mono font-bold text-white text-xs mr-1.5">
                          ${coin.symbol}
                        </span>
                        <span className="text-[11px] text-slate-400 font-sans truncate">
                          {coin.name}
                        </span>
                      </div>
                    </div>

                    <div className="shrink-0 text-right font-mono font-bold text-slate-100 text-xs">
                      {formatPrice(coin.price)}
                    </div>
                  </div>

                  {/* Bottom Row: Market Cap, Interval Change, YTD % Badge */}
                  <div className="flex items-center justify-between gap-2 text-[11px] font-mono w-full pt-1 border-t border-white/[0.03]">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500 text-[10px]">MCap:</span>
                      <span className="text-slate-300 font-semibold">
                        {formatMarketCap(coin.marketCap)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Change % */}
                      {coin.change !== null && (
                        <span className={`inline-flex items-center gap-0.5 font-bold ${
                          isChangePos ? 'text-emerald-400' : 'text-rose-400'
                        }`}>
                          {isChangePos ? '+' : ''}{coin.change.toFixed(2)}%
                        </span>
                      )}

                      {/* YTD % Badge */}
                      {hasYtd && (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                          isYtdPos
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                            : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
                        }`}>
                          {isYtdPos ? `+${coin.changeYtd!.toFixed(1)}%` : `${coin.changeYtd!.toFixed(1)}%`} <span className="text-[9px] opacity-70">YTD</span>
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
};
