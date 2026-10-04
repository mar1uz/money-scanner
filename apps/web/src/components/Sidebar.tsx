import React, { useRef, useLayoutEffect, useState } from 'react';
import {
  LayoutGrid,
  Landmark,
  Radio,
  BrainCircuit,
  LineChart,
  CircleDot,
  Activity,
  ChevronLeft,
  ChevronRight,
  Zap,
  Star,
  Search,
  BellRing,
  MoreHorizontal,
  Scale
} from 'lucide-react';
import { AppTab } from '../types.js';
import { ThemeSwitcher } from './ThemeSwitcher.js';
import { useLanguage } from '../i18n.js';
import { useOutsideDismiss } from '../hooks/useOutsideDismiss.js';
import { useMobileViewport } from '../hooks/useMobileViewport.js';

interface SidebarProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  watchlistCount: number;
  watchlistOnly?: boolean;
  onLogoClick?: () => void;
  onOpenSearchModal?: () => void;
  onOpenWatchlist?: () => void;
  onOpenAlerts?: () => void;
  hideDesktopSidebar?: boolean;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  watchlistCount,
  watchlistOnly = false,
  onLogoClick,
  onOpenSearchModal,
  onOpenWatchlist,
  onOpenAlerts,
  hideDesktopSidebar,
  collapsed = false,
  onCollapsedChange
}) => {
  useMobileViewport();
  const activeTabRef = useRef<HTMLButtonElement | null>(null);
  const watchlistTabRef = useRef<HTMLButtonElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [lens, setLens] = useState({ x: 0, width: 64 });
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  useOutsideDismiss(moreOpen, () => setMoreOpen(false), [moreButtonRef, moreMenuRef]);
  const { language, setLanguage } = useLanguage();

  const navItems: { id: AppTab; label: string; shortLabel: string; icon: any; accent?: string; badge?: string }[] = [
    { id: 'market', label: 'Market Scanner', shortLabel: 'Scanner', icon: LayoutGrid, accent: 'text-cyan-400' },
    { id: 'crypto_heatmap', label: 'Market Heat Map', shortLabel: 'Heat Map', icon: LayoutGrid, accent: 'text-emerald-400', badge: '360°' },
    { id: 'crypto_radar', label: 'Crypto Radar', shortLabel: 'Radar', icon: Radio, accent: 'text-cyan-400', badge: '3 chains' },
    { id: 'crypto_bubbles', label: 'Crypto Bubble', shortLabel: 'Bubbles', icon: CircleDot, accent: 'text-fuchsia-400', badge: '100' },
    { id: 'top_alpha', label: 'Top Alpha', shortLabel: 'Alpha', icon: Scale, accent: 'text-amber-400', badge: 'α' },
    { id: 'ai', label: 'AI Briefing', shortLabel: 'AI Briefing', icon: BrainCircuit, accent: 'text-purple-400', badge: 'AI' },
    { id: 'usa_status', label: 'USA Macro', shortLabel: 'USA Macro', icon: Landmark, accent: 'text-blue-400', badge: '🇺🇸' },
    { id: 'intelligence', label: 'Intelligence', shortLabel: 'Intelligence', icon: Radio, accent: 'text-violet-400', badge: 'AI' },
    { id: 'backtest', label: 'Backtest Lab', shortLabel: 'Backtest', icon: LineChart, accent: 'text-emerald-400' },
    { id: 'status', label: 'System & Bot Health', shortLabel: 'Status', icon: Activity, accent: 'text-emerald-400' }
  ];
  const scanner = navItems.filter(item => item.id === 'market');
  const explore = navItems.filter(item => ['crypto_heatmap', 'crypto_radar', 'crypto_bubbles'].includes(item.id));
  const research = navItems.filter(item => ['top_alpha', 'ai', 'usa_status', 'intelligence', 'backtest'].includes(item.id));
  const renderDesktopItem = (item: typeof navItems[number]) => {
    const Icon = item.icon;
    const selected = activeTab === item.id && !(item.id === 'market' && watchlistOnly);
    return <button key={item.id} onClick={() => onTabChange(item.id)} aria-current={selected ? 'page' : undefined} className={`sidebar-nav-item ${selected ? 'is-active' : ''}`}>
      <Icon size={18} strokeWidth={1.7} /><span>{item.label}</span>
      {item.badge && <span className="nav-ai-badge">{item.badge}</span>}
    </button>;
  };

  // The lens stays in the scrollable track, so it follows both selection and swipes.
  useLayoutEffect(() => {
    const active = watchlistOnly ? watchlistTabRef.current : activeTabRef.current;
    const track = scrollContainerRef.current;
    if (!active || !track) return;
    const measure = () => {
      setLens({ x: active.offsetLeft, width: active.offsetWidth });
      track.scrollTo({
        left: active.offsetLeft - (track.clientWidth - active.offsetWidth) / 2,
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    observer.observe(active);
    return () => observer.disconnect();
  }, [activeTab, watchlistOnly]);

  return (
    <>
      {!hideDesktopSidebar && <>
        <aside aria-hidden={collapsed} ref={element => element?.toggleAttribute('inert', collapsed)}
          className={`app-sidebar hidden md:flex w-[260px] flex-col fixed left-0 top-0 h-screen z-50 sidebar-transition ${collapsed ? '-translate-x-full pointer-events-none' : 'translate-x-0'}`}>
          <div className="sidebar-brand">
            <button onClick={onLogoClick} className="brand-link" aria-label="Market Scanner — pagina principală">
              <span className="brand-mark"><Zap size={20} strokeWidth={2.5} /></span>
              <span>Market<span className="brand-second">Scanner</span></span>
            </button>
            <button className="sidebar-collapse" onClick={() => onCollapsedChange?.(true)} aria-label="Retrage meniul lateral"><ChevronLeft size={16} /></button>
          </div>
          <nav className="sidebar-links flex-1 overflow-y-auto" aria-label="Navigare principală">
            <p className="nav-group-label">WORKSPACE</p>
            {scanner.map(renderDesktopItem)}
            <button onClick={onOpenWatchlist} aria-current={watchlistOnly ? 'page' : undefined} className={`sidebar-nav-item ${watchlistOnly ? 'is-active' : ''}`}><Star size={18} /><span>Watchlist</span><strong className="nav-count">{watchlistCount}</strong></button>
            <button onClick={onOpenAlerts} aria-current={activeTab === 'alerts' ? 'page' : undefined} className={`sidebar-nav-item ${activeTab === 'alerts' ? 'is-active' : ''}`}><BellRing size={18} /><span>Alerte</span></button>
            <p className="nav-group-label">EXPLORARE</p>
            {explore.map(renderDesktopItem)}
            <p className="nav-group-label">CERCETARE</p>
            {research.map(renderDesktopItem)}
          </nav>
          <div className="sidebar-footer">
            <button onClick={() => onTabChange('status')} aria-current={activeTab === 'status' ? 'page' : undefined} className={`sidebar-nav-item ${activeTab === 'status' ? 'is-active' : ''}`}><Activity size={17} /><span>System & Bot Health</span></button>
            <p>Mai multă claritate. Mai puțin zgomot.</p>
          </div>
        </aside>
        {collapsed && <button onClick={() => onCollapsedChange?.(false)} className="hidden md:flex fixed left-0 top-[64px] z-[60] h-11 w-8 items-center justify-center rounded-r-xl border border-white/10 bg-background-card text-cyan-300" aria-label="Deschide meniul lateral"><ChevronRight size={19} /></button>}
      </>}
      <nav aria-label="Navigare mobilă" className="mobile-dock md:hidden">
        <div className="mobile-nav">
          <div ref={scrollContainerRef} className="mobile-nav-track no-scrollbar">
            <span className="mobile-nav-lens" aria-hidden="true" style={{ width: lens.width, transform: `translateX(${lens.x}px)` }} />
            <button ref={activeTab === 'market' ? activeTabRef : undefined} onClick={() => { setMoreOpen(false); onTabChange('market'); }} aria-current={activeTab === 'market' && !moreOpen ? 'page' : undefined} className={`mobile-nav-item ${activeTab === 'market' && !moreOpen ? 'is-active' : ''}`}><LayoutGrid size={19} /><span>Scanner</span></button>
            <button ref={watchlistOnly ? watchlistTabRef : undefined} onClick={() => { setMoreOpen(false); onOpenWatchlist?.(); }} aria-current={watchlistOnly ? 'page' : undefined} className={`mobile-nav-item ${watchlistOnly ? 'is-active' : ''}`}><Star size={19} /><span>Watchlist</span><b>{watchlistCount}</b></button>
            <button onClick={() => { setMoreOpen(false); onOpenAlerts?.(); }} aria-current={activeTab === 'alerts' ? 'page' : undefined} className={`mobile-nav-item ${activeTab === 'alerts' ? 'is-active' : ''}`}><BellRing size={19} /><span>Alerte</span></button>
            <button ref={moreButtonRef} onClick={() => setMoreOpen(value => !value)} aria-expanded={moreOpen} className={`mobile-nav-item ${moreOpen ? 'is-active' : ''}`}><MoreHorizontal size={19} /><span>Mai mult</span></button>
          </div>
        </div>
        {onOpenSearchModal && <button onClick={onOpenSearchModal} className="mobile-search-orb" aria-label="Caută active"><Search size={21} strokeWidth={1.9} /></button>}
        {moreOpen && <div ref={moreMenuRef} className="mobile-more-menu" role="menu">
          {navItems.filter(item => item.id !== 'market' && item.id !== 'status').map(item => { const Icon = item.icon; return <button role="menuitem" key={item.id} onClick={() => { setMoreOpen(false); onTabChange(item.id); }}><Icon size={17} /><span>{item.label}</span></button>; })}
          <button role="menuitem" onClick={() => { setMoreOpen(false); onTabChange('status'); }}><Activity size={17} /><span>System & Bot Health</span></button>
          <div className="mobile-more-sep" aria-hidden="true" />
          <div className="mobile-more-setting">
            <span className="mobile-more-setting-label">Temă</span>
            <ThemeSwitcher />
          </div>
          <div className="mobile-more-setting">
            <span className="mobile-more-setting-label">Limbă</span>
            <span className="mobile-more-langs">
              <button type="button" data-active={language === 'ro'} aria-pressed={language === 'ro'} onClick={() => setLanguage('ro')}>Română</button>
              <button type="button" data-active={language === 'en'} aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>English</button>
            </span>
          </div>
        </div>}
      </nav>
    </>
  );
};

