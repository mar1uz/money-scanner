import React from 'react';
import {
  LayoutDashboard,
  ScanLine,
  Flame,
  Newspaper,
  BrainCircuit,
  LineChart,
  Activity
} from 'lucide-react';
import { AppTab } from '../types.js';

interface NavigationProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  watchlistCount: number;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  onTabChange,
  watchlistCount
}) => {
  const tabs = [
    { id: 'dashboard', label: 'Market Dashboard', icon: LayoutDashboard },
    { id: 'scanner', label: 'Money Scanner', icon: ScanLine, badge: '50 Assets' },
    { id: 'trends', label: 'X Trends & Narratives', icon: Flame },
    { id: 'news', label: 'News Intelligence', icon: Newspaper },
    { id: 'ai', label: 'AI Market Analyst', icon: BrainCircuit, badge: 'Gemini' },
    { id: 'backtest', label: 'Strategy Backtest', icon: LineChart },
    { id: 'status', label: 'System & Bot Health', icon: Activity }
  ];

  return (
    <nav className="flex items-center gap-1.5 overflow-x-auto py-2 px-4 lg:px-8 bg-background-card/60 border-b border-background-border text-xs scrollbar-none">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id as AppTab)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-medium transition-all whitespace-nowrap ${
              isActive
                ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/10 text-cyan-300 border border-cyan-500/30 shadow-glow-cyan'
                : 'text-slate-400 hover:text-slate-200 hover:bg-background-surface'
            }`}
          >
            <Icon className={`w-4 h-4 ${isActive ? 'text-cyber-cyan' : 'text-slate-400'}`} />
            <span>{tab.label}</span>
            {tab.badge && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                isActive
                  ? 'bg-cyan-500/20 text-cyan-300'
                  : 'bg-slate-800 text-slate-400'
              }`}>
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
};
