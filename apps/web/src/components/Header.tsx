import React, { useEffect } from 'react';
import { Search, RefreshCw } from 'lucide-react';
import { Timeframe, AssetScannerRow } from '../types.js';
import { Segmented } from './ui/Segmented.js';

const TIMEFRAMES: Timeframe[] = ['1h', '4h', '8h', '1d', '1w', '1m'];

interface HeaderProps {
  timeframe: Timeframe;
  onTimeframeChange: (tf: Timeframe) => void;
  hideTimeframe?: boolean;
  onRefreshMarket?: () => void;
  isRefreshing?: boolean;
  onOpenSearchModal?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  timeframe,
  onTimeframeChange,
  hideTimeframe = false,
  onRefreshMarket,
  isRefreshing = false,
  onOpenSearchModal,
}) => {
  // Global shortcuts: ⌘/Ctrl+K always, and "/" outside text fields, open search.
  useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        onOpenSearchModal?.();
        return;
      }
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const tag = document.activeElement?.tagName;
        const isInputActive = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
        if (!isInputActive) {
          e.preventDefault();
          onOpenSearchModal?.();
        }
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [onOpenSearchModal]);

  return (
    <header className="app-header fixed top-0 right-0 left-0 md:left-[var(--ms-rail-w)] z-40 h-[56px] px-3 sm:px-6 lg:px-8 flex items-center gap-2 sm:gap-3">
      <button type="button" onClick={onOpenSearchModal} className="ms-search-trigger" aria-label="Caută active" title="Caută active">
        <Search size={16} />
        <span className="hidden sm:inline">Caută un activ, simbol sau companie…</span>
        <kbd className="hidden sm:inline" data-i18n-skip>⌘K</kbd>
      </button>
      <div className="hidden sm:block flex-1" />
      {!hideTimeframe && (
        <Segmented
          ariaLabel="Timeframe"
          size="sm"
          skipTranslate
          full
          className="min-w-0 flex-1 sm:flex-none sm:!w-[264px]"
          options={TIMEFRAMES.map((tf) => ({ value: tf, label: tf.toUpperCase() }))}
          value={timeframe}
          onChange={onTimeframeChange}
        />
      )}
      {!hideTimeframe && onRefreshMarket && (
        <button
          type="button"
          onClick={onRefreshMarket}
          disabled={isRefreshing}
          className="ms-icon-btn"
          title="Actualizează Datele de Piață"
          aria-label="Actualizează Datele de Piață"
        >
          <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
        </button>
      )}
    </header>
  );
};
