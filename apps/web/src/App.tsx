import React, { lazy, useState, useEffect, useRef, useCallback, useDeferredValue } from 'react';
import {
  AppTab,
  Timeframe,
  MarketOverviewSummary,
  AssetScannerRow,
  NarrativeSummary,
  MarketNarrativeId
} from './types.js';
import {
  fetchMarketOverview,
  fetchScanner,
  fetchNarratives,
  parseAssetPairIdentityFromSearch,
  type AssetPairIdentity
} from './services/api.js';
import { Header } from './components/Header.js';
import { Sidebar } from './components/Sidebar.js';
import { MarketRegimeGauge } from './components/MarketRegimeGauge.js';
import { NarrativeBar } from './components/NarrativeBar.js';
import { NarrativeDetailModal } from './components/NarrativeDetailModal.js';
import { ScannerTable } from './components/ScannerTable.js';
import { DeferredPage } from './components/DeferredPage.js';
import { ScanLoadingBar } from './components/ScanLoadingBar.js';
import { useLanguage } from './i18n.js';
import { AuthGate } from './components/AuthGate.js';
import { AssetNavigationProvider } from './components/AssetNavigation.js';
import { SectionTabs } from './components/ui/SectionTabs.js';
import { Toast } from './components/ui/Toast.js';
import { useStableCallback } from './hooks/useStableCallback.js';
import { IntelligenceSourceFilter, UserProfile } from '@money-scanner/shared';
import { Zap, RefreshCw } from 'lucide-react';

const loaders = {
  asset: () => import('./components/AssetDeepDiveView.js'),
  intelligence: () => import('./components/IntelligenceView.js'),
  ai: () => import('./components/AIBriefingView.js'),
  top_alpha: () => import('./components/TopAlphaView.js'),
  business_quality: () => import('./components/BusinessQualityView.js'),
  backtest: () => import('./components/BacktestView.js'),
  status: () => import('./components/SystemStatusView.js'),
  alerts: () => import('./components/AlertsCenterView.js'),
  usa_status: () => import('./components/USAStatusView.js'),
  crypto_radar: () => import('./components/CryptoRadarView.js'),
  crypto_bubbles: () => import('./components/CryptoBubbleView.js'),
  crypto_heatmap: () => import('./components/CryptoHeatMapView.js'),
  search: () => import('./components/UniversalSearchModal.js')
};
const prefetchTab = (tab: AppTab) => { if (tab !== 'market') void loaders[tab]().catch(() => undefined); };

const AssetDeepDiveView = lazy(() => loaders.asset().then(m => ({ default: m.AssetDeepDiveView })));
const IntelligenceView = lazy(() => loaders.intelligence().then(m => ({ default: m.IntelligenceView })));
const AIBriefingView = lazy(() => loaders.ai().then(m => ({ default: m.AIBriefingView })));
const TopAlphaView = lazy(() => loaders.top_alpha().then(m => ({ default: m.TopAlphaView })));
const BusinessQualityView = lazy(() => loaders.business_quality().then(m => ({ default: m.BusinessQualityView })));
const BacktestView = lazy(() => loaders.backtest().then(m => ({ default: m.BacktestView })));
const SystemStatusView = lazy(() => loaders.status().then(m => ({ default: m.SystemStatusView })));
const AlertsCenterView = lazy(() => loaders.alerts().then(m => ({ default: React.memo(m.AlertsCenterView) })));
const USAStatusView = lazy(() => loaders.usa_status().then(m => ({ default: m.USAStatusView })));
const CryptoRadarView = lazy(() => loaders.crypto_radar().then(m => ({ default: m.CryptoRadarView })));
const CryptoBubbleView = lazy(() => loaders.crypto_bubbles().then(m => ({ default: m.CryptoBubbleView })));
const CryptoHeatMapView = lazy(() => loaders.crypto_heatmap().then(m => ({ default: m.CryptoHeatMapView })));
const UniversalSearchModal = lazy(() => loaders.search().then(m => ({ default: m.UniversalSearchModal })));

interface AuthenticatedAppProps {
  user: UserProfile;
  onLogout: () => Promise<void>;
}

const VALID_TIMEFRAMES: Timeframe[] = ['1h', '4h', '8h', '1d', '1w', '1m'];
const VALID_MARKET_CLASSES = ['crypto', 'stocks', 'metals'] as const;
const VALID_TABS: AppTab[] = ['market', 'crypto_radar', 'crypto_bubbles', 'crypto_heatmap', 'top_alpha', 'business_quality', 'usa_status', 'intelligence', 'ai', 'alerts', 'backtest', 'status'];

const readMoneyLineDeepLink = () => {
  const params = new URLSearchParams(window.location.search);
  const rawSymbol = (params.get('asset') || '').replace(/^[$#]/, '').trim().toUpperCase();
  const rawTimeframe = params.get('timeframe')?.toLowerCase() as Timeframe | undefined;
  const rawMarketClass = params.get('marketClass')?.toLowerCase();
  const rawTab = params.get('tab');
  const rawSource = params.get('source');
  const legacySource: IntelligenceSourceFilter | undefined = rawTab === 'trends'
    ? 'social'
    : rawTab === 'news' ? 'news' : undefined;
  const intelligenceSource: IntelligenceSourceFilter = rawSource === 'news' || rawSource === 'social' || rawSource === 'all'
    ? rawSource
    : legacySource || 'all';
  const tab = rawTab === 'trends' || rawTab === 'news'
    ? 'intelligence'
    : rawTab && VALID_TABS.includes(rawTab as AppTab) ? rawTab as AppTab : undefined;
  return {
    symbol: /^[A-Z0-9][A-Z0-9._:-]{0,30}$/.test(rawSymbol) ? rawSymbol : null,
    timeframe: rawTimeframe && VALID_TIMEFRAMES.includes(rawTimeframe) ? rawTimeframe : undefined,
    marketClass: VALID_MARKET_CLASSES.includes(rawMarketClass as typeof VALID_MARKET_CLASSES[number])
      ? rawMarketClass as typeof VALID_MARKET_CLASSES[number]
      : undefined,
    tab,
    intelligenceSource,
    watchlistOnly: params.get('watchlist') === '1',
    coinGeckoId: params.get('coinGeckoId') || undefined,
    coinPaprikaId: params.get('coinPaprikaId') || undefined,
    // Exact venue pair of the search row the deep link was opened from
    // (providerSymbol/exchange/instrumentType/quoteCurrency). Absent for every
    // previous link shape: those keep the legacy fetch untouched.
    pairIdentity: parseAssetPairIdentityFromSearch(window.location.search)
  };
};

/** Sets or removes the exact-pair deep-link parameters as one unit (F6/B3). */
const writeAssetPairIdentityParams = (url: URL, identity?: AssetPairIdentity) => {
  const fields: Array<[string, string | undefined]> = [
    ['providerSymbol', identity?.providerSymbol],
    ['exchange', identity?.exchange],
    ['instrumentType', identity?.instrumentType],
    ['quoteCurrency', identity?.quoteCurrency]
  ];
  for (const [key, value] of fields) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
};

const AuthenticatedApp: React.FC<AuthenticatedAppProps> = ({ user, onLogout }) => {
  const { language } = useLanguage();
  const initialDeepLink = useRef(readMoneyLineDeepLink()).current;
  const [activeTab, setActiveTab] = useState<AppTab>(initialDeepLink.tab || 'market');
  // Content follows the deferred tab so the previous view stays readable while a lazy chunk loads.
  const contentTab = useDeferredValue(activeTab);
  const tabPending = contentTab !== activeTab;
  const [timeframe, setTimeframe] = useState<Timeframe>(initialDeepLink.timeframe || '1w');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [selectedTier, setSelectedTier] = useState('ALL');
  const [selectedNarrative, setSelectedNarrative] = useState<MarketNarrativeId | 'ALL'>('ALL');
  const [inspectedNarrative, setInspectedNarrative] = useState<NarrativeSummary | null>(null);
  const [watchlistOnly, setWatchlistOnly] = useState(initialDeepLink.watchlistOnly);
  const [alertsVisited, setAlertsVisited] = useState(initialDeepLink.tab === 'alerts');

  const watchlistStorageKey = `money_scanner_watchlist_${user.id}`;

  // Persistent watchlist is isolated per authenticated account in this browser.
  const [watchlist, setWatchlist] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(watchlistStorageKey);
      if (saved) return JSON.parse(saved);
    } catch {}
    return ['BTC', 'ETH', 'SOL', 'SUI', 'FET'];
  });

  const [selectedAssetSymbol, setSelectedAssetSymbol] = useState<string | null>(initialDeepLink.symbol);
  const [selectedAssetMarketClass, setSelectedAssetMarketClass] = useState<AssetScannerRow['marketClass']>(initialDeepLink.marketClass);
  const [selectedAssetCoinGeckoId, setSelectedAssetCoinGeckoId] = useState<string | undefined>(initialDeepLink.coinGeckoId);
  const [selectedAssetCoinPaprikaId, setSelectedAssetCoinPaprikaId] = useState<string | undefined>(initialDeepLink.coinPaprikaId);
  const [selectedAssetPairIdentity, setSelectedAssetPairIdentity] = useState<AssetPairIdentity | undefined>(initialDeepLink.pairIdentity);
  const [selectedMarketCategory, setSelectedMarketCategory] = useState<'ALL' | 'crypto' | 'stocks' | 'metals'>('ALL');
  const [overview, setOverview] = useState<MarketOverviewSummary | null>(null);
  const [narratives, setNarratives] = useState<NarrativeSummary[]>([]);
  const [scannerRows, setScannerRows] = useState<AssetScannerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [bannerAlert, setBannerAlert] = useState<string | null>(null);
  const refreshRequestId = useRef(0);

  const refreshData = async () => {
    const requestId = ++refreshRequestId.current;
    setLoading(true);
    try {
      // Each section renders as soon as its data arrives. Scanner and sectors
      // share one server-side scan (including the minute scheduler's result).
      const results = await Promise.allSettled([
        fetchMarketOverview().then(value => {
          if (requestId === refreshRequestId.current) setOverview(value);
        }),
        fetchScanner(timeframe, undefined, undefined, undefined, undefined, selectedMarketCategory).then(rows => {
          if (requestId !== refreshRequestId.current || !rows.length) return;
          // Enforce the selected market class even with stale upstream data.
          setScannerRows(selectedMarketCategory === 'crypto'
            ? rows.filter(row => row.marketClass === 'crypto')
            : rows);
        }),
        fetchNarratives(timeframe, selectedMarketCategory).then(items => {
          if (requestId !== refreshRequestId.current || !items.length) return;
          setNarratives(items);
          setSelectedNarrative(current =>
            current === 'ALL' || items.some(narrative => narrative.id === current) ? current : 'ALL'
          );
        })
      ]);
      for (const result of results) {
        if (result.status === 'rejected') console.error('Data refresh error:', result.reason);
      }
    } catch (err) {
      console.error('Data refresh error:', err);
    } finally {
      if (requestId === refreshRequestId.current) setLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 300000); 
    return () => clearInterval(interval);
  }, [timeframe, selectedMarketCategory]);

  useEffect(() => {
    if (contentTab === 'alerts') setAlertsVisited(true);
  }, [contentTab]);

  // Keep a shareable URL in sync with the open Money Line chart. Telegram
  // alerts use these same parameters, including the alert's exact timeframe.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (selectedAssetSymbol) {
      url.searchParams.set('asset', selectedAssetSymbol);
      url.searchParams.set('timeframe', timeframe);
      if (selectedAssetMarketClass) url.searchParams.set('marketClass', selectedAssetMarketClass);
      else url.searchParams.delete('marketClass');
      if (selectedAssetCoinGeckoId) url.searchParams.set('coinGeckoId', selectedAssetCoinGeckoId);
      else url.searchParams.delete('coinGeckoId');
      if (selectedAssetCoinPaprikaId) url.searchParams.set('coinPaprikaId', selectedAssetCoinPaprikaId);
      else url.searchParams.delete('coinPaprikaId');
      writeAssetPairIdentityParams(url, selectedAssetPairIdentity);
    } else {
      url.searchParams.delete('asset');
      url.searchParams.delete('timeframe');
      url.searchParams.delete('marketClass');
      url.searchParams.delete('coinGeckoId');
      url.searchParams.delete('coinPaprikaId');
      writeAssetPairIdentityParams(url);
    }
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, [selectedAssetSymbol, selectedAssetMarketClass, selectedAssetCoinGeckoId, selectedAssetCoinPaprikaId, selectedAssetPairIdentity, timeframe]);

  useEffect(() => {
    const restoreFromLocation = () => {
      const deepLink = readMoneyLineDeepLink();
      setSelectedAssetSymbol(deepLink.symbol);
      setSelectedAssetMarketClass(deepLink.marketClass);
      setSelectedAssetCoinGeckoId(deepLink.coinGeckoId);
      setSelectedAssetCoinPaprikaId(deepLink.coinPaprikaId);
      setSelectedAssetPairIdentity(deepLink.pairIdentity);
      setActiveTab(deepLink.tab || 'market');
      setWatchlistOnly(deepLink.watchlistOnly);
      if (deepLink.timeframe) setTimeframe(deepLink.timeframe);
    };
    window.addEventListener('popstate', restoreFromLocation);
    return () => window.removeEventListener('popstate', restoreFromLocation);
  }, []);

  const toggleWatchlist = (symbol: string) => {
    const sym = symbol.toUpperCase();
    const isAdding = !watchlist.includes(sym);
    const updated = isAdding
      ? [...watchlist, sym]
      : watchlist.filter(s => s !== sym);

    setWatchlist(updated);
    try {
      localStorage.setItem(watchlistStorageKey, JSON.stringify(updated));
    } catch {}

    setBannerAlert(
      isAdding
        ? `★ $${sym} a fost adăugat în Watchlist!`
        : `Active Watchlist: $${sym} a fost eliminat.`
    );
    setTimeout(() => setBannerAlert(null), 3500);
  };

  const handleReorderWatchlist = (newOrder: string[]) => {
    setWatchlist(newOrder);
    localStorage.setItem(watchlistStorageKey, JSON.stringify(newOrder));
  };

  const openAsset = (
    symbol: string,
    marketClass?: AssetScannerRow['marketClass'],
    selectedTimeframe?: Timeframe,
    coinGeckoId?: string,
    coinPaprikaId?: string,
    pairIdentity?: AssetPairIdentity
  ) => {
    const normalizedSymbol = symbol.replace(/^[$#]/, '').trim().toUpperCase();
    const verifiedClass = marketClass || scannerRows.find(row => row.symbol.toUpperCase() === normalizedSymbol)?.marketClass;
    if (selectedTimeframe) setTimeframe(selectedTimeframe);
    setSelectedAssetMarketClass(verifiedClass);
    setSelectedAssetCoinGeckoId(coinGeckoId);
    setSelectedAssetCoinPaprikaId(coinPaprikaId);
    setSelectedAssetPairIdentity(pairIdentity);
    setSelectedAssetSymbol(normalizedSymbol);
    const url = new URL(window.location.href);
    url.searchParams.set('asset', normalizedSymbol);
    url.searchParams.set('timeframe', selectedTimeframe || timeframe);
    if (verifiedClass) url.searchParams.set('marketClass', verifiedClass);
    if (coinGeckoId) url.searchParams.set('coinGeckoId', coinGeckoId);
    if (coinPaprikaId) url.searchParams.set('coinPaprikaId', coinPaprikaId);
    // Always rewritten: a row without an exact pair must clear the previous
    // one, otherwise the next deep-dive would open with a foreign identity.
    writeAssetPairIdentityParams(url, pairIdentity);
    window.history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`);
  };

  const handleTabChange = (tab: AppTab) => {
    setWatchlistOnly(false);
    setSelectedAssetSymbol(null);
    setSelectedAssetMarketClass(undefined);
    setSelectedAssetCoinGeckoId(undefined);
    setSelectedAssetCoinPaprikaId(undefined);
    setSelectedAssetPairIdentity(undefined);
    setActiveTab(tab);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    url.searchParams.delete('asset');
    url.searchParams.delete('marketClass');
    url.searchParams.delete('coinGeckoId');
    url.searchParams.delete('coinPaprikaId');
    url.searchParams.delete('watchlist');
    writeAssetPairIdentityParams(url);
    if (tab !== 'intelligence') {
      url.searchParams.delete('sector');
      url.searchParams.delete('period');
      url.searchParams.delete('source');
    }
    window.history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`);
  };

  const openWatchlist = () => {
    setSelectedAssetSymbol(null);
    setSelectedAssetMarketClass(undefined);
    setSelectedAssetCoinGeckoId(undefined);
    setSelectedAssetCoinPaprikaId(undefined);
    setSelectedAssetPairIdentity(undefined);
    setWatchlistOnly(true);
    setActiveTab('market');
    const url = new URL(window.location.href);
    url.searchParams.set('tab', 'market');
    url.searchParams.set('watchlist', '1');
    url.searchParams.delete('asset');
    writeAssetPairIdentityParams(url);
    window.history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`);
  };

  const closeAsset = () => {
    if (new URLSearchParams(window.location.search).has('asset')) {
      window.history.back();
      return;
    }
    setSelectedAssetSymbol(null);
  };

  // Stable identities for memoised children (ScannerTable, MarketRegimeGauge, NarrativeBar, AlertsCenterView, Sidebar, Header).
  const openAssetFromRow = useStableCallback((sym: string, marketClass?: AssetScannerRow['marketClass'], tf?: Timeframe) => openAsset(sym, marketClass, tf));
  const navigateToAsset = useStableCallback(({ symbol, marketClass, timeframe: tf, coinGeckoId }: { symbol: string; marketClass?: AssetScannerRow['marketClass']; timeframe?: Timeframe; coinGeckoId?: string }) => openAsset(symbol, marketClass, tf, coinGeckoId));
  const toggleWatchlistStable = useStableCallback(toggleWatchlist);
  const reorderWatchlistStable = useStableCallback(handleReorderWatchlist);
  const toggleWatchlistOnly = useCallback(() => setWatchlistOnly(v => !v), []);
  const selectNarrative = useCallback((narr: string) => setSelectedNarrative(narr as MarketNarrativeId | 'ALL'), []);
  const tabChangeStable = useStableCallback(handleTabChange);
  const refreshStable = useStableCallback(refreshData);
  const openSearch = useCallback(() => setIsSearchModalOpen(true), []);

  // Warm the most-used lazy chunks once the page is idle (skipped under Save-Data).
  useEffect(() => {
    const saveData = (navigator as unknown as { connection?: { saveData?: boolean } }).connection?.saveData;
    if (saveData) return;
    const run = () => { void loaders.alerts().catch(() => undefined); void loaders.asset().catch(() => undefined); };
    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    const id = idle ? idle(run) : window.setTimeout(run, 2500);
    return () => { if (!idle) window.clearTimeout(id); };
  }, []);

  return (
    <AssetNavigationProvider onOpenAsset={navigateToAsset}>
    <div className="app-shell min-h-screen flex bg-background text-slate-100 selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Persistent Left Sidebar (Desktop) + Bottom Nav (Mobile) */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={tabChangeStable}
        onLogoClick={() => handleTabChange('market')}
        currentUser={user}
        onLogout={onLogout}
        onPrefetchTab={prefetchTab}
      />

      {/* Main Wrapper: the 84px rail offsets content on desktop; top padding clears the fixed header */}
      <div className="flex-1 flex flex-col min-w-0 md:pl-[var(--ms-rail-w)] pb-20 md:pb-0 pt-[56px]">
        {/* Minimal Search & Control Header (Fixed at top of viewport) */}
        <Header
          timeframe={timeframe}
          onTimeframeChange={setTimeframe}
          hideTimeframe={Boolean(selectedAssetSymbol) || activeTab !== 'market'}
          onRefreshMarket={refreshStable}
          isRefreshing={loading}
          onOpenSearchModal={openSearch}
        />

        {/* Main Content Area */}
        <main className={`workspace-main flex-1 px-4 lg:px-10 py-8 space-y-8 max-w-[1600px] w-full mx-auto ${tabPending ? 'ms-tab-pending' : ''}`}>
          {/* Full-Page Asset Deep-Dive View */}
          {selectedAssetSymbol && (
            <div className="ms-tab-enter">
            <DeferredPage>
            <AssetDeepDiveView
              symbol={selectedAssetSymbol}
              marketClass={selectedAssetMarketClass}
              coinGeckoId={selectedAssetCoinGeckoId}
              coinPaprikaId={selectedAssetCoinPaprikaId}
              timeframe={timeframe}
              onTimeframeChange={setTimeframe}
                onBack={closeAsset}
              watchlist={watchlist}
              onToggleWatchlist={toggleWatchlist}
            />
            </DeferredPage>
            </div>
          )}
          {/* Tab views stay mounted (hidden) while an asset is open so filter
              selection, scroll and loaded data survive back navigation instead
              of resetting to defaults and refetching. `contents` keeps the
              exact same layout as before when visible. */}
          <div className={selectedAssetSymbol ? 'hidden' : 'contents'}>
            <SectionTabs activeTab={activeTab} onTabChange={tabChangeStable} onPrefetchTab={prefetchTab} />
              {/* Tab 1: Market Intelligence (Gauges + Narrative Bar + Scanner Table). Stays mounted while hidden, like Alerts. */}
              <div className={contentTab === 'market' ? 'market-dashboard space-y-8 ms-tab-enter' : 'hidden'} aria-hidden={contentTab !== 'market'}>
                  <h1 className="sr-only">{language === 'ro' ? 'Piață' : 'Markets'}</h1>
                  <ScanLoadingBar active={loading} />
                  {loading && scannerRows.length === 0 && (
                    <div role="status" aria-live="polite" className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-cyan-500/25 bg-cyan-500/[0.07] px-6 py-12 text-center">
                      <RefreshCw className="w-9 h-9 animate-spin text-cyan-400" />
                      <p className="text-base font-bold font-mono text-slate-100">
                        {language === 'ro' ? 'Se încarcă datele de piață…' : 'Loading market data…'}
                      </p>
                      <p className="text-xs font-mono text-slate-400">
                        {language === 'ro' ? 'Se calculează semnalele 360°. Poate dura câteva secunde.' : 'Computing 360° signals. This can take a few seconds.'}
                      </p>
                    </div>
                  )}
                  {/* Top Market Intelligence Gauges */}
                  <MarketRegimeGauge
                    overview={overview}
                    rows={scannerRows}
                    selectedCategory={selectedMarketCategory}
                    onSelectCategory={setSelectedMarketCategory}
                  />

                  {/* Interactive Narrative & Sector Alpha Bar */}
                  <details className="sector-disclosure">
                    <summary><span>{language === 'ro' ? 'Sectoare & narațiuni' : 'Sectors & narratives'} <small>{selectedNarrative === 'ALL' ? (language === 'ro' ? 'Explorează tendințele pieței' : 'Explore market trends') : `Filtru activ: ${narratives.find(n => n.id === selectedNarrative)?.shortName || selectedNarrative}`}</small></span><span className="disclosure-plus" aria-hidden="true">+</span></summary>
                  <NarrativeBar
                    narratives={narratives}
                    timeframe={timeframe}
                    selectedNarrative={selectedNarrative}
                    onSelectNarrative={selectNarrative}
                    onInspectNarrative={setInspectedNarrative}
                    loading={loading}
                  />

                  </details>

                  {/* Scanner Signals Header & Table */}
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                      <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-cyan-400" />
                        <h2 className="text-xl font-semibold tracking-tight text-slate-100">
                          {language === 'ro' ? 'Semnale de piață' : 'Market signals'} · {timeframe.toUpperCase()}
                          {selectedNarrative !== 'ALL' && (
                            <span className="text-cyan-400 font-bold ml-2">
                              • Filtrat: {narratives.find(n => n.id === selectedNarrative)?.shortName || selectedNarrative}
                            </span>
                          )}
                        </h2>
                      </div>

                    </div>

                    <ScannerTable
                      rows={scannerRows}
                      onSelectAsset={openAssetFromRow}
                      watchlist={watchlist}
                      onToggleWatchlist={toggleWatchlistStable}
                      onReorderWatchlist={reorderWatchlistStable}
                      selectedTier={selectedTier}
                      onSelectTier={setSelectedTier}
                      watchlistOnly={watchlistOnly}
                      onToggleWatchlistOnly={toggleWatchlistOnly}
                      selectedMarketClass={selectedMarketCategory}
                      onSelectMarketClass={setSelectedMarketCategory}
                      selectedNarrative={selectedNarrative}
                      onSelectNarrative={selectNarrative}
                      loading={loading}
                    />
                  </div>

                  {/* Narrative Details Modal */}
                  {inspectedNarrative && (
                    <NarrativeDetailModal
                      narrative={inspectedNarrative}
                      rows={scannerRows}
                      onClose={() => setInspectedNarrative(null)}
                      onSelectAsset={(sym) => {
                        setInspectedNarrative(null);
                        openAsset(sym);
                      }}
                      watchlist={watchlist}
                      onToggleWatchlist={toggleWatchlist}
                      timeframe={timeframe}
                    />
                  )}
              </div>

              <DeferredPage>
              {(alertsVisited || contentTab === 'alerts') && (
                <div className={contentTab === 'alerts' ? 'ms-tab-enter' : 'hidden'} aria-hidden={contentTab !== 'alerts'}>
                  <AlertsCenterView
                    knownAssets={scannerRows}
                    watchlist={watchlist}
                    onOpenAsset={openAssetFromRow}
                  />
                </div>
              )}
              {contentTab !== 'market' && contentTab !== 'alerts' && (
                <div key={contentTab} className="ms-tab-enter space-y-8">
                  {/* Top 100 cryptocurrencies, sized by market capitalization */}
                  {contentTab === 'crypto_radar' && <CryptoRadarView isAdmin={user.role === 'Administrator'} />}
                  {contentTab === 'crypto_bubbles' && (
                    <CryptoBubbleView onSelectAsset={(symbol, coinGeckoId, coinPaprikaId) => openAsset(symbol, 'crypto', undefined, coinGeckoId, coinPaprikaId)} />
                  )}

                  {contentTab === 'crypto_heatmap' && (
                    <CryptoHeatMapView onSelectAsset={(symbol, coinGeckoId, coinPaprikaId, marketClass) => openAsset(symbol, (marketClass as any) || 'crypto', undefined, coinGeckoId, coinPaprikaId)} />
                  )}

                  {/* Tab 2: USA Economic Status & Macro Intelligence */}
                  {contentTab === 'usa_status' && <USAStatusView />}

                  {/* Tab 3: X Narrative Intelligence & AI News Aggregator */}
                  {contentTab === 'intelligence' && <IntelligenceView initialSource={initialDeepLink.intelligenceSource} />}

                  {/* Top Alpha: both Business Quality leaderboards in one view */}
                  {contentTab === 'top_alpha' && <TopAlphaView />}

                  {/* Business Quality: hidden tab (no sidebar entry) - opened from the AI Briefing header button (Marius, 2026-09-22) */}
                  {contentTab === 'business_quality' && <BusinessQualityView />}

                  {/* Tab 5: AI Market Briefing & Interactive Chat */}
                  {contentTab === 'ai' && <AIBriefingView onOpenBusinessQuality={() => handleTabChange('business_quality')} />}

                  {/* Tab 7: Backtest Engine */}
                  {contentTab === 'backtest' && <BacktestView />}

                  {/* Tab 8: System Status & Telemetry */}
                  {contentTab === 'status' && <SystemStatusView />}
                </div>
              )}
            </DeferredPage>
          </div>
        </main>
      </div>

      {/* Universal TradingView-Style Search Spotlight Modal */}
      {isSearchModalOpen && <DeferredPage>
      <UniversalSearchModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        onSelectAsset={(asset) => {
          const marketClass = asset.marketClass === 'crypto' || asset.marketClass === 'stocks' || asset.marketClass === 'metals'
            ? asset.marketClass
            : undefined;
          // The clicked row's own venue identity travels with the deep-dive
          // (F6/B3): without it every row sharing a ticker (BTCEUR, BTCUSDT,
          // CAKEBTC) would open the same anonymous asset.
          const pairIdentity: AssetPairIdentity | undefined = asset.providerSymbol && asset.exchange
            ? {
                providerSymbol: asset.providerSymbol,
                exchange: asset.exchange,
                ...(asset.instrumentType ? { instrumentType: asset.instrumentType } : {}),
                ...(asset.quoteCurrency ? { quoteCurrency: asset.quoteCurrency } : {})
              }
            : undefined;
          openAsset(asset.symbol, marketClass, undefined, asset.coinGeckoId, undefined, pairIdentity);
          setIsSearchModalOpen(false);
        }}
        allAssets={scannerRows}
        watchlist={watchlist}
        onToggleWatchlist={toggleWatchlist}
      />
      </DeferredPage>}
      <div id="ms-overlays" />
      <Toast message={bannerAlert} onDismiss={() => setBannerAlert(null)} />
    </div>
    </AssetNavigationProvider>
  );
};

export const App: React.FC = () => (
  <AuthGate>
    {(user, logout) => <AuthenticatedApp user={user} onLogout={logout} />}
  </AuthGate>
);
