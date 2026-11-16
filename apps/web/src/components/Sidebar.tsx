import React, { useEffect, useRef, useState } from 'react';
import {
  LayoutGrid,
  BellRing,
  Compass,
  BrainCircuit,
  MoreHorizontal,
  LineChart,
  Activity,
  LogOut,
  Zap,
  type LucideIcon
} from 'lucide-react';
import type { UserProfile } from '@money-scanner/shared';
import { AppTab } from '../types.js';
import { ThemeSwatchGrid } from './ThemeSwitcher.js';
import { Sheet } from './ui/Sheet.js';
import { Segmented } from './ui/Segmented.js';
import { useLanguage } from '../i18n.js';
import { useOutsideDismiss } from '../hooks/useOutsideDismiss.js';
import { useMobileViewport } from '../hooks/useMobileViewport.js';
import { useSlidingPill } from '../hooks/useSlidingPill.js';
import {
  GROUP_DEFAULT_TAB,
  GROUP_LABELS,
  NAV_GROUP_OF,
  PRIMARY_GROUPS,
  TAB_LABELS,
  type NavGroupId
} from '../navigation.js';

interface SidebarProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  onLogoClick?: () => void;
  hideDesktopSidebar?: boolean;
  currentUser?: UserProfile;
  onLogout?: () => Promise<void>;
  onPrefetchTab?: (tab: AppTab) => void;
}

const GROUP_ICONS: Record<NavGroupId, LucideIcon> = {
  market: LayoutGrid,
  alerts: BellRing,
  explore: Compass,
  research: BrainCircuit,
  more: MoreHorizontal
};

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  onLogoClick,
  hideDesktopSidebar,
  currentUser,
  onLogout,
  onPrefetchTab
}) => {
  useMobileViewport();
  const [moreOpen, setMoreOpen] = useState(false);
  const railRef = useRef<HTMLElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const railMoreRef = useRef<HTMLButtonElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const lastTab = useRef<Partial<Record<NavGroupId, AppTab>>>({});
  useOutsideDismiss(moreOpen, () => setMoreOpen(false), [moreButtonRef, railMoreRef, moreMenuRef]);
  const { language, setLanguage } = useLanguage();

  const activeGroup: NavGroupId = moreOpen ? 'more' : NAV_GROUP_OF[activeTab];
  useEffect(() => {
    lastTab.current[NAV_GROUP_OF[activeTab]] = activeTab;
  }, [activeTab]);
  useSlidingPill(railRef, activeGroup);
  useSlidingPill(dockRef, activeGroup);

  const selectGroup = (group: NavGroupId) => {
    if (group === 'more') {
      setMoreOpen(value => !value);
      return;
    }
    setMoreOpen(false);
    onTabChange(lastTab.current[group] ?? GROUP_DEFAULT_TAB[group]);
  };

  const prefetchGroup = (group: NavGroupId) => {
    if (group === 'more') return;
    onPrefetchTab?.(lastTab.current[group] ?? GROUP_DEFAULT_TAB[group]);
  };

  return (
    <>
      {!hideDesktopSidebar && (
        <aside className="app-sidebar ms-rail hidden md:flex">
          <button onClick={onLogoClick} className="brand-link ms-rail-brand" aria-label="Market Scanner — pagina principală">
            <span className="brand-mark"><Zap size={20} strokeWidth={2.5} /></span>
          </button>
          <nav ref={railRef} className="ms-rail-nav" aria-label="Navigare principală">
            <span className="ms-rail-pill" aria-hidden="true" />
            {PRIMARY_GROUPS.map(group => {
              const Icon = GROUP_ICONS[group];
              return (
                <button
                  key={group}
                  type="button"
                  ref={group === 'more' ? railMoreRef : undefined}
                  className="ms-rail-item"
                  data-active={activeGroup === group}
                  aria-current={activeGroup === group && group !== 'more' ? 'page' : undefined}
                  aria-expanded={group === 'more' ? moreOpen : undefined}
                  onClick={() => selectGroup(group)}
                  onPointerEnter={() => prefetchGroup(group)}
                >
                  <Icon size={22} strokeWidth={1.8} />
                  <span data-i18n-skip>{GROUP_LABELS[group][language]}</span>
                </button>
              );
            })}
          </nav>
        </aside>
      )}

      <nav aria-label="Navigare mobilă" className="mobile-dock ms-dock md:hidden">
        <div ref={dockRef} className="mobile-nav ms-dock-track">
          <span className="ms-dock-pill" aria-hidden="true" />
          {PRIMARY_GROUPS.map(group => {
            const Icon = GROUP_ICONS[group];
            return (
              <button
                key={group}
                type="button"
                ref={group === 'more' ? moreButtonRef : undefined}
                className="ms-dock-item"
                data-active={activeGroup === group}
                aria-current={activeGroup === group && group !== 'more' ? 'page' : undefined}
                aria-expanded={group === 'more' ? moreOpen : undefined}
                onClick={() => selectGroup(group)}
                onPointerEnter={() => prefetchGroup(group)}
              >
                <Icon size={20} strokeWidth={1.8} />
                <span data-i18n-skip>{GROUP_LABELS[group][language]}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <Sheet open={moreOpen} onClose={() => { setMoreOpen(false); (railMoreRef.current?.offsetParent ? railMoreRef : moreButtonRef).current?.focus(); }} ariaLabel={GROUP_LABELS.more[language]} placement="rail" panelRef={moreMenuRef}>
        <div className="ms-rise ms-more">
          <section>
            <h2 className="ms-more-title">{language === 'ro' ? 'Instrumente' : 'Tools'}</h2>
            <button
              type="button"
              className="ms-row"
              aria-current={activeTab === 'backtest' ? 'page' : undefined}
              onClick={() => { setMoreOpen(false); onTabChange('backtest'); }}
            >
              <LineChart size={18} strokeWidth={1.8} />
              <span data-i18n-skip>{TAB_LABELS.backtest[language]}</span>
            </button>
            <button
              type="button"
              className="ms-row"
              aria-current={activeTab === 'status' ? 'page' : undefined}
              onClick={() => { setMoreOpen(false); onTabChange('status'); }}
            >
              <Activity size={18} strokeWidth={1.8} />
              <span data-i18n-skip>{TAB_LABELS.status[language]}</span>
            </button>
          </section>
          <section>
            <h2 className="ms-more-title">{language === 'ro' ? 'Temă' : 'Theme'}</h2>
            <ThemeSwatchGrid />
          </section>
          <section>
            <h2 className="ms-more-title">{language === 'ro' ? 'Limbă' : 'Language'}</h2>
            <Segmented
              ariaLabel="Limbă / Language"
              full
              skipTranslate
              options={[{ value: 'ro', label: 'Română' }, { value: 'en', label: 'English' }]}
              value={language}
              onChange={setLanguage}
            />
          </section>
          {currentUser && onLogout && (
            <section className="ms-more-account">
              <span translate="no" className="ms-more-user">{currentUser.name || currentUser.email}</span>
              <button type="button" className="ms-btn ms-btn--secondary ms-btn--sm" onClick={() => void onLogout()}>
                <LogOut size={15} />
                {language === 'ro' ? 'Deconectare' : 'Sign out'}
              </button>
            </section>
          )}
        </div>
      </Sheet>
    </>
  );
};
