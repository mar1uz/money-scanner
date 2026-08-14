import React from 'react';
import { Activity, Shield, Zap, Search, BellRing } from 'lucide-react';
import { Timeframe } from '../types.js';

interface HeaderProps {
  timeframe: Timeframe;
  onTimeframeChange: (tf: Timeframe) => void;
  onSearchClick: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onTriggerTestAlert: () => void;
  isStale?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  timeframe,
  onTimeframeChange,
  searchQuery,
  onSearchChange,
  onTriggerTestAlert,
  isStale = false
}) => {
  return (
    <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-background-border px-4 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-4">
      {/* Brand Identity */}
      <div className="flex items-center gap-3">
        <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500/20 via-background-card to-emerald-500/20 border border-cyan-500/30 shadow-glow-cyan">
          <Zap className="w-5 h-5 text-cyber-cyan" />
          <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyber-cyan opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyber-cyan"></span>
          </span>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-lg tracking-wider bg-gradient-to-r from-white via-slate-100 to-cyan-400 bg-clip-text text-transparent">
              MONEY SCANNER
            </span>
            <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              v1.0.0
            </span>
          </div>
          <p className="text-[11px] text-slate-400">Crypto Intelligence & Deterministic Money Line</p>
        </div>
      </div>

      {/* Global Search Bar */}
      <div className="flex-1 max-w-md hidden md:block">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search asset, symbol, or cashtag (e.g. BTC, SOL)..."
            className="w-full bg-background-surface/80 border border-background-border rounded-lg pl-9 pr-4 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30 transition-all font-mono"
          />
        </div>
      </div>

      {/* Controls & User Pill */}
      <div className="flex items-center gap-3">
        {/* Timeframe Selector */}
        <div className="flex items-center bg-background-surface border border-background-border rounded-lg p-0.5">
          {(['1h', '4h', '1d'] as Timeframe[]).map((tf) => (
            <button
              key={tf}
              onClick={() => onTimeframeChange(tf)}
              className={`px-3 py-1 text-xs font-mono font-medium rounded-md transition-all ${
                timeframe === tf
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-glow-cyan'
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
            {isStale ? 'STALE' : 'LIVE'}
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
