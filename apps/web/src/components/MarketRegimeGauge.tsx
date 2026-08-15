import React from 'react';
import { MarketOverviewSummary, AssetScannerRow } from '../types.js';
import {
  TrendingUp,
  TrendingDown,
  Layers,
  Activity,
  Coins,
  Award,
  Flame,
  ShieldAlert,
  Compass,
  Gauge,
  SlidersHorizontal
} from 'lucide-react';

export type MarketCategory = 'ALL' | 'crypto' | 'stocks' | 'metals';

interface MarketRegimeGaugeProps {
  overview: MarketOverviewSummary | null;
  rows?: AssetScannerRow[];
  selectedCategory?: MarketCategory;
  onSelectCategory?: (category: MarketCategory) => void;
}

export const MarketRegimeGauge: React.FC<MarketRegimeGaugeProps> = ({
  overview,
  rows = [],
  selectedCategory = 'ALL',
  onSelectCategory
}) => {
  const isStock = (sym: string, category?: string) =>
    ['SPACEX', 'NVDA', 'TSLA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'PLTR', 'AMD', 'MSTR', 'COIN', 'SPY', 'QQQ'].includes(sym.toUpperCase()) ||
    Boolean(category?.includes('Stock') || category?.includes('Index') || category?.includes('Mega-Cap'));

  const isMetal = (sym: string, category?: string) =>
    ['XAU', 'XAG', 'PAXG', 'OIL', 'COPPER'].includes(sym.toUpperCase()) ||
    Boolean(category?.includes('Metal') || category?.includes('Commodity'));

  const isCrypto = (sym: string, category?: string) =>
    !isStock(sym, category) && !isMetal(sym, category);

  // Filter rows based on selectedCategory
  const filteredRows = rows.filter(r => {
    const sym = r.symbol.replace(/^[$#]/, '').trim().toUpperCase();
    if (selectedCategory === 'ALL') return true;
    if (selectedCategory === 'crypto') return isCrypto(sym, r.category);
    if (selectedCategory === 'stocks') return isStock(sym, r.category);
    if (selectedCategory === 'metals') return isMetal(sym, r.category);
    return true;
  });

  const totalAssets = filteredRows.length || 1;

  // 1. Dynamic Market Breadth Calculation
  const advancingCount = filteredRows.filter(r => 
    r.tier?.includes('Bullish') || (r.change24h && r.change24h > 0)
  ).length;

  const decliningCount = filteredRows.filter(r => 
    r.tier?.includes('Bearish') || (r.change24h && r.change24h < 0)
  ).length;

  const neutralCount = Math.max(0, totalAssets - advancingCount - decliningCount);
  const bullishPercent = Math.round((advancingCount / totalAssets) * 100) || 50;

  // 2. Dynamic Market Regime & MoneyLine Score
  const avgMoneyLineScore = filteredRows.length > 0
    ? Math.round(filteredRows.reduce((acc, r) => acc + (r.moneyLineScore || 0), 0) / filteredRows.length)
    : (overview?.regimeScore || 45);

  const getRegimeDetails = () => {
    if (avgMoneyLineScore >= 50) {
      return {
        label: selectedCategory === 'stocks' ? 'STRONG BULLISH (Tech AI Boom)' : (selectedCategory === 'metals' ? 'STRONG BULLISH (Safe Haven)' : 'STRONG BULLISH (Risk-On)'),
        score: avgMoneyLineScore,
        isBull: true,
        isBear: false,
        colorClass: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10 shadow-glow-emerald',
        badge: 'Strong Bullish'
      };
    }
    if (avgMoneyLineScore >= 15) {
      return {
        label: selectedCategory === 'stocks' ? 'BULLISH EXPANSION' : (selectedCategory === 'metals' ? 'BULLISH ACCUMULATION' : 'BULLISH (Market Expansion)'),
        score: avgMoneyLineScore,
        isBull: true,
        isBear: false,
        colorClass: 'text-green-400 border-green-500/40 bg-green-500/10 shadow-glow-emerald',
        badge: 'Bullish'
      };
    }
    if (avgMoneyLineScore <= -40) {
      return {
        label: 'CAPITULATION (Risk-Off)',
        score: avgMoneyLineScore,
        isBull: false,
        isBear: true,
        colorClass: 'text-red-500 border-red-500/40 bg-red-500/10 shadow-glow-ruby',
        badge: 'Strong Bearish'
      };
    }
    if (avgMoneyLineScore <= -15) {
      return {
        label: 'BEARISH PULLBACK',
        score: avgMoneyLineScore,
        isBull: false,
        isBear: true,
        colorClass: 'text-rose-400 border-rose-500/40 bg-rose-500/10 shadow-glow-ruby',
        badge: 'Bearish'
      };
    }
    return {
      label: 'CONSOLIDATION / RANGE',
      score: avgMoneyLineScore,
      isBull: false,
      isBear: false,
      colorClass: 'text-slate-300 border-slate-700 bg-slate-800/40',
      badge: 'Neutral'
    };
  };

  const regimeInfo = getRegimeDetails();

  // 3. Dynamic Fear and Greed Index Calculation
  let rawFearGreed = Math.round(50 + (avgMoneyLineScore * 0.35) + ((bullishPercent - 50) * 0.35));
  if (selectedCategory === 'crypto') rawFearGreed = Math.min(95, Math.max(10, rawFearGreed + 4));
  if (selectedCategory === 'stocks') rawFearGreed = Math.min(92, Math.max(15, rawFearGreed + 2));
  if (selectedCategory === 'metals') rawFearGreed = Math.min(96, Math.max(20, rawFearGreed + 6));
  const fearGreedScore = Math.min(100, Math.max(0, rawFearGreed));

  const getFearGreedDetails = (score: number) => {
    if (score >= 75) {
      return {
        label: 'Extreme Greed',
        emoji: '🚀',
        colorClass: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/40 shadow-glow-emerald',
        barColor: 'bg-emerald-400'
      };
    }
    if (score >= 55) {
      return {
        label: 'Greed',
        emoji: '🔥',
        colorClass: 'text-green-400 bg-green-500/10 border-green-500/30 shadow-glow-emerald',
        barColor: 'bg-green-400'
      };
    }
    if (score >= 45) {
      return {
        label: 'Neutral',
        emoji: '⚖️',
        colorClass: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
        barColor: 'bg-amber-400'
      };
    }
    if (score >= 25) {
      return {
        label: 'Fear',
        emoji: '😨',
        colorClass: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
        barColor: 'bg-orange-400'
      };
    }
    return {
      label: 'Extreme Fear',
      emoji: '❄️',
      colorClass: 'text-rose-500 bg-rose-500/10 border-rose-500/40 shadow-glow-ruby',
      barColor: 'bg-rose-500'
    };
  };

  const fearGreedInfo = getFearGreedDetails(fearGreedScore);

  // 4. Dynamic Liquidity & Market Cap Calculation
  const totalMarketCap = filteredRows.reduce((acc, r) => acc + (r.marketCap || 0), 0);
  const total24hVol = filteredRows.reduce((acc, r) => acc + (r.volume24h || 0), 0);

  const formatLargeNumber = (num: number) => {
    if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
    return `$${num.toLocaleString()}`;
  };

  const marketCategories: { id: MarketCategory; label: string; icon: any; count: number }[] = [
    { id: 'ALL', label: 'Trading 360° (Toate)', icon: Layers, count: rows.length || 51 },
    { id: 'crypto', label: 'Crypto 🪙', icon: Coins, count: rows.filter(r => isCrypto(r.symbol, r.category)).length },
    { id: 'stocks', label: 'Stocks SUA 📈', icon: TrendingUp, count: rows.filter(r => isStock(r.symbol, r.category)).length },
    { id: 'metals', label: 'Metale & Gold 🥇', icon: Award, count: rows.filter(r => isMetal(r.symbol, r.category)).length }
  ];

  return (
    <div className="space-y-4 mb-6">
      {/* Top Market Selector Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-2 bg-background-card/90 border border-background-border rounded-2xl shadow-inner font-mono">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mr-1 px-2 hidden sm:flex">
            <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
            <span>Selectează Piața:</span>
          </div>

          {marketCategories.map(cat => (
            <button
              key={cat.id}
              onClick={() => onSelectCategory && onSelectCategory(cat.id)}
              className={`flex items-center gap-2 px-3.5 py-1.5 text-xs rounded-xl font-bold transition-all ${
                selectedCategory === cat.id
                  ? 'bg-gradient-to-r from-cyan-500/20 to-emerald-500/20 text-cyan-300 border border-cyan-500/40 shadow-glow-cyan'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
              }`}
            >
              <cat.icon className="w-3.5 h-3.5" />
              <span>{cat.label}</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                {cat.count}
              </span>
            </button>
          ))}
        </div>

        <div className="text-[11px] text-slate-400 hidden lg:flex items-center gap-2 pr-2">
          <span>Indicatori Calibrați pe: <strong className="text-cyan-300">{marketCategories.find(c => c.id === selectedCategory)?.label}</strong></span>
        </div>
      </div>

      {/* 4 Macro Intelligence Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Market Regime */}
        <div className={`cyber-glass rounded-2xl p-4 border transition-all ${regimeInfo.colorClass}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs uppercase font-mono tracking-wider text-slate-400">Market Regime</span>
            <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${regimeInfo.colorClass}`}>
              {regimeInfo.score > 0 ? `+${regimeInfo.score}` : regimeInfo.score} / 100
            </span>
          </div>
          <div className="flex items-center gap-3">
            {regimeInfo.isBull ? (
              <TrendingUp className="w-6 h-6 text-emerald-400 flex-shrink-0" />
            ) : regimeInfo.isBear ? (
              <TrendingDown className="w-6 h-6 text-rose-400 flex-shrink-0" />
            ) : (
              <Activity className="w-6 h-6 text-slate-400 flex-shrink-0" />
            )}
            <div>
              <h3 className="text-sm font-bold text-slate-100 line-clamp-1">{regimeInfo.label}</h3>
              <p className="text-[11px] text-slate-400">
                {selectedCategory === 'stocks' ? 'Mega-Cap Equities Structure' : (selectedCategory === 'metals' ? 'Sovereign Commodities Demand' : 'Money Line Trend Composite')}
              </p>
            </div>
          </div>
        </div>

        {/* Card 2: Market Breadth */}
        <div className="cyber-glass rounded-2xl p-4 border border-background-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs uppercase font-mono tracking-wider text-slate-400">Market Breadth</span>
            <span className="text-xs font-mono font-bold text-cyan-300">
              {bullishPercent}% Bullish
            </span>
          </div>
          {/* Multi-segment Breadth Bar */}
          <div className="w-full h-2 rounded-full bg-slate-800 flex overflow-hidden my-2 border border-slate-700/60">
            <div 
              className="bg-emerald-400 h-full transition-all duration-500" 
              style={{ width: `${(advancingCount / totalAssets) * 100}%` }}
              title={`${advancingCount} Up`}
            />
            <div 
              className="bg-slate-500 h-full transition-all duration-500" 
              style={{ width: `${(neutralCount / totalAssets) * 100}%` }}
              title={`${neutralCount} Neutral`}
            />
            <div 
              className="bg-rose-500 h-full transition-all duration-500" 
              style={{ width: `${(decliningCount / totalAssets) * 100}%` }}
              title={`${decliningCount} Down`}
            />
          </div>
          <div className="flex justify-between text-[11px] text-slate-400 font-mono">
            <span className="text-emerald-400 font-bold">{advancingCount} Up</span>
            <span className="text-slate-400">{neutralCount} Neutral</span>
            <span className="text-rose-400 font-bold">{decliningCount} Down</span>
          </div>
        </div>

        {/* Card 3: Global Liquidity & Market Cap */}
        <div className="cyber-glass rounded-2xl p-4 border border-background-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs uppercase font-mono tracking-wider text-slate-400">Global Liquidity</span>
            <Layers className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold font-mono text-slate-100">
              {totalMarketCap > 0 ? formatLargeNumber(totalMarketCap) : '$2.42T'}
            </span>
            <span className="text-xs text-slate-400 font-mono">Total Cap</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono mt-1">
            <span>24h Vol: {total24hVol > 0 ? formatLargeNumber(total24hVol) : '$78.4B'}</span>
            <span className="text-cyan-400">{filteredRows.length} Active {selectedCategory === 'ALL' ? '360°' : selectedCategory}</span>
          </div>
        </div>

        {/* Card 4: Fear and Greed Index (Replacing Volatility Index) */}
        <div className="cyber-glass rounded-2xl p-4 border border-background-border">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs uppercase font-mono tracking-wider text-slate-400">Fear &amp; Greed Index</span>
            <div className="flex items-center gap-1.5">
              <span className="text-sm">{fearGreedInfo.emoji}</span>
              <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${fearGreedInfo.colorClass}`}>
                {fearGreedInfo.label}
              </span>
            </div>
          </div>
          
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold font-mono text-slate-100">{fearGreedScore}</span>
            <span className="text-xs text-slate-400 font-mono">/ 100</span>
          </div>

          {/* Fear & Greed Visual Progress Gauge */}
          <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden my-1.5 border border-slate-700/60">
            <div 
              className={`h-full ${fearGreedInfo.barColor} transition-all duration-500`}
              style={{ width: `${fearGreedScore}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
            <span className="text-rose-400">0 Extreme Fear</span>
            <span className="text-amber-400">50 Neutral</span>
            <span className="text-emerald-400">100 Greed</span>
          </div>
        </div>
      </div>
    </div>
  );
};
