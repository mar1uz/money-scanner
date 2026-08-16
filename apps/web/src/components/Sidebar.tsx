import React, { useState } from 'react';
import {
  LayoutGrid,
  Landmark,
  Radio,
  Newspaper,
  BrainCircuit,
  LineChart,
  Activity,
  ChevronLeft,
  ChevronRight,
  Zap,
  Star,
  Settings,
  Search
} from 'lucide-react';
import { AppTab } from '../types.js';

interface SidebarProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  watchlistCount: number;
  onLogoClick?: () => void;
  onOpenSearchModal?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  watchlistCount,
  onLogoClick,
  onOpenSearchModal
}) => {
  const [collapsed, setCollapsed] = useState(false);

  const navItems: { id: AppTab; label: string; icon: any; accent?: string; badge?: string }[] = [
    { id: 'market', label: 'Market Intelligence', icon: LayoutGrid, accent: 'text-cyan-400' },
    { id: 'usa_status', label: 'USA Macro', icon: Landmark, accent: 'text-blue-400', badge: '🇺🇸' },
    { id: 'trends', label: 'X Intelligence', icon: Radio, accent: 'text-violet-400' },
    { id: 'news', label: 'News Feed', icon: Newspaper, accent: 'text-amber-400' },
    { id: 'ai', label: 'AI Analyst', icon: BrainCircuit, accent: 'text-purple-400', badge: 'AI' },
    { id: 'backtest', label: 'Backtest Lab', icon: LineChart, accent: 'text-emerald-400' }
  ];

  return (
    <>
      {/* ─── Desktop Sidebar ─── */}
      <aside
        className={`hidden md:flex flex-col fixed left-0 top-0 h-screen z-50 bg-background-card/95 backdrop-blur-xl border-r border-white/[0.04] sidebar-transition ${
          collapsed ? 'w-16' : 'w-[260px]'
        }`}
      >
        {/* Logo */}
        <div
          onClick={onLogoClick}
          className="flex items-center gap-3 px-4 h-14 border-b border-white/[0.04] cursor-pointer group shrink-0"
        >
          <div className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-500/20 to-violet-500/20 border border-cyan-500/20 shrink-0 group-hover:border-cyan-500/40 transition-all">
            <Zap className="w-4 h-4 text-cyan-400 group-hover:scale-110 transition-transform" />
            <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400"></span>
            </span>
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <span className="font-semibold text-sm tracking-wide bg-gradient-to-r from-white via-cyan-200 to-cyan-400 bg-clip-text text-transparent block leading-tight">
                Market Scanner
              </span>
              <span className="text-[10px] text-slate-500 block">360° Intelligence</span>
            </div>
          )}
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 py-3 px-2 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                title={collapsed ? item.label : undefined}
                className={`w-full flex items-center gap-3 rounded-xl transition-all group relative ${
                  collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'
                } ${
                  isActive
                    ? 'bg-white/[0.07] text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
                }`}
              >
                {/* Active indicator bar */}
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-cyan-400" />
                )}

                <Icon className={`w-[18px] h-[18px] shrink-0 ${isActive ? (item.accent || 'text-cyan-400') : 'text-slate-500 group-hover:text-slate-300'} transition-colors`} />
                
                {!collapsed && (
                  <>
                    <span className={`text-[13px] ${isActive ? 'font-semibold' : 'font-medium'} truncate`}>
                      {item.label}
                    </span>
                    {item.badge && (
                      <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-md font-mono ${
                        isActive ? 'bg-cyan-500/15 text-cyan-300' : 'bg-white/[0.04] text-slate-500'
                      }`}>
                        {item.badge}
                      </span>
                    )}
                  </>
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom Section */}
        <div className="px-2 pb-3 space-y-1.5 border-t border-white/[0.04] pt-3 shrink-0">
          {/* System Status Link */}
          <button
            onClick={() => onTabChange('status')}
            title={collapsed ? 'System Status' : undefined}
            className={`w-full flex items-center gap-3 rounded-xl transition-all ${
              collapsed ? 'justify-center px-2 py-2' : 'px-3 py-2'
            } ${
              activeTab === 'status'
                ? 'bg-white/[0.07] text-white'
                : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.04]'
            }`}
          >
            <Activity className={`w-4 h-4 shrink-0 ${activeTab === 'status' ? 'text-emerald-400' : ''}`} />
            {!collapsed && <span className="text-[12px] font-medium">System & Bot Health</span>}
          </button>

          {/* Watchlist Counter */}
          {!collapsed && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.03]">
              <Star className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[11px] text-slate-400">
                Watchlist: <strong className="text-slate-200">{watchlistCount} active</strong>
              </span>
            </div>
          )}

          {/* Collapse Toggle */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={`w-full flex items-center gap-2 rounded-xl px-3 py-2 text-slate-500 hover:text-slate-300 hover:bg-white/[0.04] transition-all ${
              collapsed ? 'justify-center' : ''
            }`}
          >
            {collapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <>
                <ChevronLeft className="w-4 h-4" />
                <span className="text-[11px] font-medium">Collapse</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* ─── Mobile Bottom Navigation ─── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background-card/95 backdrop-blur-xl border-t border-white/[0.06] px-1.5 pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-around py-1.5">
          {/* Market Tab */}
          <button
            onClick={() => onTabChange('market')}
            className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl transition-all min-w-[50px] ${
              activeTab === 'market' ? 'text-cyan-400' : 'text-slate-500'
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
            <span className={`text-[9px] font-medium ${activeTab === 'market' ? 'text-cyan-300' : 'text-slate-500'}`}>
              Market
            </span>
            {activeTab === 'market' && <div className="w-4 h-0.5 rounded-full bg-cyan-400 mt-0.5" />}
          </button>

          {/* Dedicated Universal Search Button */}
          {onOpenSearchModal && (
            <button
              onClick={onOpenSearchModal}
              className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl text-cyan-400 hover:text-cyan-300 transition-all min-w-[50px]"
            >
              <div className="p-1 rounded-lg bg-cyan-500/15 border border-cyan-500/30">
                <Search className="w-4 h-4 text-cyan-300" />
              </div>
              <span className="text-[9px] font-bold text-cyan-300">
                Caută
              </span>
            </button>
          )}

          {/* Other Nav Items */}
          {navItems.slice(1, 4).map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl transition-all min-w-[50px] ${
                  isActive ? 'text-cyan-400' : 'text-slate-500'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-cyan-400' : ''}`} />
                <span className={`text-[9px] font-medium ${isActive ? 'text-cyan-300' : 'text-slate-500'}`}>
                  {item.label.split(' ')[0]}
                </span>
                {isActive && (
                  <div className="w-4 h-0.5 rounded-full bg-cyan-400 mt-0.5" />
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};
