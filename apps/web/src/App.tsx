import React, { lazy, useState, useEffect, useRef } from 'react';
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
  fetchNarratives
} from './services/api.js';
import { Header } from './components/Header.js';
import { Sidebar } from './components/Sidebar.js';
import { MarketRegimeGauge } from './components/MarketRegimeGauge.js';
import { NarrativeBar } from './components/NarrativeBar.js';
import { NarrativeDetailModal } from './components/NarrativeDetailModal.js';
import { ScannerTable } from './components/ScannerTable.js';
import { DeferredPage } from './components/DeferredPage.js';
import { useLanguage } from './i18n.js';
import { AuthGate } from './components/AuthGate.js';
import { AssetNavigationProvider } from './components/AssetNavigation.js';
import { IntelligenceSourceFilter, UserProfile } from '@money-scanner/shared';
import { Zap, CheckCircle2, RefreshCw } from 'lucide-react';

const AssetDeepDiveView = lazy(() => import('./components/AssetDeepDiveView.js').then(m => ({ default: m.AssetDeepDiveView })));
const IntelligenceView = lazy(() => import('./components/IntelligenceView.js').then(m => ({ default: m.IntelligenceView })));
const AIBriefingView = lazy(() => import('./components/AIBriefingView.js').then(m => ({ default: m.AIBriefingView })));
const TopAlphaView = lazy(() => import('./components/TopAlphaView.js').then(m => ({ default: m.TopAlphaView })));
const BusinessQualityView = lazy(() => import('./components/BusinessQualityView.js').then(m => ({ default: m.BusinessQualityView })));
const BacktestView = lazy(() => import('./components/BacktestView.js').then(m => ({ default: m.BacktestView })));
const SystemStatusView = lazy(() => import('./components/SystemStatusView.js').then(m => ({ default: m.SystemStatusView })));
const AlertsCenterView = lazy(() => import('./components/AlertsCenterView.js').then(m => ({ default: m.AlertsCenterView })));
const USAStatusView = lazy(() => import('./components/USAStatusView.js').then(m => ({ default: m.USAStatusView })));
const CryptoRadarView = lazy(() => import('./components/CryptoRadarView.js').then(m => ({ default: m.CryptoRadarView })));
const CryptoBubbleView = lazy(() => import('./components/CryptoBubbleView.js').then(m => ({ default: m.CryptoBubbleView })));
const CryptoHeatMapView = lazy(() => import('./components/CryptoHeatMapView.js').then(m => ({ default: m.CryptoHeatMapView })));
const UniversalSearchModal = lazy(() => import('./components/UniversalSearchModal.js').then(m => ({ default: m.UniversalSearchModal })));

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
    coinPaprikaId: params.get('coinPaprikaId') || undefined
  };
};

const AuthenticatedApp: React.FC<AuthenticatedAppProps> = ({ user, onLogout }) => {
  const { language } = useLanguage();
  const initialDeepLink = useRef(readMoneyLineDeepLink()).current;
  const [activeTab, setActiveTab] = useState<AppTab>(initialDeepLink.tab || 'market');
  const [timeframe, setTimeframe] = useState<Timeframe>(initialDeepLink.timeframe || '1w');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [selectedTier, setSelectedTier] = useState('ALL');
  const [selectedNarrative, setSelectedNarrative] = useState<MarketNarrativeId | 'ALL'>('ALL');
  const [inspectedNarrative, setInspectedNarrative] = useState<NarrativeSummary | null>(null);
  const [watchlistOnly, setWatchlistOnly] = useState(initialDeepLink.watchlistOnly);
  const [alertsVisited, setAlertsVisited] = useState(initialDeepLink.tab === 'alerts');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('money_scanner_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });
  
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
    if (activeTab === 'alerts') setAlertsVisited(true);
  }, [activeTab]);

  useEffect(() => {
    try {
      localStorage.setItem('money_scanner_sidebar_collapsed', String(sidebarCollapsed));
    } catch {}
  }, [sidebarCollapsed]);

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
    } else {
      url.searchParams.delete('asset');
      url.searchParams.delete('timeframe');
      url.searchParams.delete('marketClass');
      url.searchParams.delete('coinGeckoId');
      url.searchParams.delete('coinPaprikaId');
    }
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, [selectedAssetSymbol, selectedAssetMarketClass, selectedAssetCoinGeckoId, selectedAssetCoinPaprikaId, timeframe]);

  useEffect(() => {
    const restoreFromLocation = () => {
      const deepLink = readMoneyLineDeepLink();
      setSelectedAssetSymbol(deepLink.symbol);
      setSelectedAssetMarketClass(deepLink.marketClass);
      setSelectedAssetCoinGeckoId(deepLink.coinGeckoId);
      setSelectedAssetCoinPaprikaId(deepLink.coinPaprikaId);
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
    coinPaprikaId?: string
  ) => {
    const normalizedSymbol = symbol.replace(/^[$#]/, '').trim().toUpperCase();
    const verifiedClass = marketClass || scannerRows.find(row => row.symbol.toUpperCase() === normalizedSymbol)?.marketClass;
    if (selectedTimeframe) setTimeframe(selectedTimeframe);
    setSelectedAssetMarketClass(verifiedClass);
    setSelectedAssetCoinGeckoId(coinGeckoId);
    setSelectedAssetCoinPaprikaId(coinPaprikaId);
    setSelectedAssetSymbol(normalizedSymbol);
    const url = new URL(window.location.href);
    url.searchParams.set('asset', normalizedSymbol);
    url.searchParams.set('timeframe', selectedTimeframe || timeframe);
    if (verifiedClass) url.searchParams.set('marketClass', verifiedClass);
    if (coinGeckoId) url.searchParams.set('coinGeckoId', coinGeckoId);
    if (coinPaprikaId) url.searchParams.set('coinPaprikaId', coinPaprikaId);
    window.history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`);
  };

  const handleTabChange = (tab: AppTab) => {
    setWatchlistOnly(false);
    setSelectedAssetSymbol(null);
    setSelectedAssetMarketClass(undefined);
    setSelectedAssetCoinGeckoId(undefined);
    setSelectedAssetCoinPaprikaId(undefined);
    setActiveTab(tab);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    url.searchParams.delete('asset');
    url.searchParams.delete('marketClass');
    url.searchParams.delete('coinGeckoId');
    url.searchParams.delete('coinPaprikaId');
    url.searchParams.delete('watchlist');
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
    setWatchlistOnly(true);
    setActiveTab('market');
    const url = new URL(window.location.href);
    url.searchParams.set('tab', 'market');
    url.searchParams.set('watchlist', '1');
    url.searchParams.delete('asset');
    window.history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`);
  };

  const closeAsset = () => {
    if (new URLSearchParams(window.location.search).has('asset')) {
      window.history.back();
      return;
    }
    setSelectedAssetSymbol(null);
  };

  return (
    <AssetNavigationProvider onOpenAsset={({ symbol, marketClass, timeframe: targetTimeframe, coinGeckoId }) => openAsset(symbol, marketClass, targetTimeframe, coinGeckoId)}>
    <div className="app-shell min-h-screen flex bg-background text-slate-100 selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Persistent Left Sidebar (Desktop) + Bottom Nav (Mobile) */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        watchlistCount={watchlist.length}
        watchlistOnly={watchlistOnly}
        onLogoClick={() => handleTabChange('market')}
        onOpenSearchModal={() => setIsSearchModalOpen(true)}
        onOpenWatchlist={openWatchlist}
        onOpenAlerts={() => handleTabChange('alerts')}
        hideDesktopSidebar={Boolean(selectedAssetSymbol)}
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
      />

      {/* Main Wrapper with responsive margin for desktop sidebar and top padding for fixed header */}
      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${!selectedAssetSymbol && !sidebarCollapsed ? 'md:pl-[260px]' : ''} pb-20 md:pb-0 pt-[56px]`}>
        {/* Minimal Search & Control Header (Fixed at top of viewport) */}
        <Header
          timeframe={timeframe}
          onTimeframeChange={setTimeframe}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onOpenAlerts={() => handleTabChange('alerts')}
          isStale={overview?.providerStatus?.staleAssetsCount ? overview.providerStatus.staleAssetsCount > 0 : false}
          allAssets={scannerRows}
          onSelectAsset={(sym) => {
            openAsset(sym);
          }}
          watchlist={watchlist}
          onToggleWatchlist={toggleWatchlist}
          onRefreshMarket={refreshData}
          isRefreshing={loading}
          onOpenSearchModal={() => setIsSearchModalOpen(true)}
          hasSidebar={!selectedAssetSymbol && !sidebarCollapsed}
          hideTimeframe={Boolean(selectedAssetSymbol)}
          currentUser={user}
          onLogout={onLogout}
        />

        {/* Notification Banner */}
        {bannerAlert && (
          <div role="status" aria-live="polite" className="mx-4 lg:mx-8 mt-3 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs font-mono text-emerald-300 flex items-center justify-between shadow-glow-emerald animate-fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{bannerAlert}</span>
            </div>
            <button
              onClick={() => setBannerAlert(null)}
              className="text-slate-400 hover:text-slate-200 ml-4"
            >
              ✕
            </button>
          </div>
        )}

        {/* Main Content Area */}
        <main className="workspace-main flex-1 px-4 lg:px-10 py-8 space-y-8 max-w-[1600px] w-full mx-auto animate-fade-in">
          {/* Full-Page Asset Deep-Dive View */}
          {selectedAssetSymbol && (
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
          )}
          {/* Tab views stay mounted (hidden) while an asset is open so filter
              selection, scroll and loaded data survive back navigation instead
              of resetting to defaults and refetching. `contents` keeps the
              exact same layout as before when visible. */}
          <div className={selectedAssetSymbol ? 'hidden' : 'contents'}>
            <DeferredPage>
              {/* Tab 1: Market Intelligence (Gauges + Narrative Bar + Scanner Table) */}
              {activeTab === 'market' && (
                <div className="market-dashboard space-y-8">
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
                  <section className="market-intro">
                    <div>
                      <p className="eyebrow">MARKET INTELLIGENCE / 360°</p>
                      <h1>{language === 'ro' ? 'Piața, în perspectivă' : 'Markets, in perspective'}<span>.</span></h1>
                      <p className="intro-description">{language === 'ro' ? 'O privire de ansamblu. Semnalele care contează.' : 'The bigger picture. The signals that matter.'}</p>
                    </div>
                    <button className="intro-watchlist" onClick={() => setWatchlistOnly(!watchlistOnly)} aria-pressed={watchlistOnly}>
                      <span>{watchlistOnly ? (language === 'ro' ? 'Vezi toate activele' : 'View all assets') : (language === 'ro' ? 'Lista mea' : 'My watchlist')}</span>
                      <span className="intro-count">{watchlist.length}</span>
                    </button>
                  </section>
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
                    onSelectNarrative={(narr) => setSelectedNarrative(narr)}
                    onInspectNarrative={(narr) => setInspectedNarrative(narr)}
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

                      <div className="flex items-center gap-3">
                        <button
                          onClick={refreshData}
                          disabled={loading}
                          className="flex items-center gap-1.5 px-3 py-1 text-xs font-mono font-medium bg-white/[0.03] hover:bg-white/[0.07] text-slate-300 hover:text-cyan-300 border border-white/[0.06] rounded-xl transition-all disabled:opacity-50"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
                          <span>Actualizează</span>
                        </button>
                      </div>
                    </div>

                    <ScannerTable
                      rows={scannerRows}
                      onSelectAsset={(sym, marketClass, selectedTimeframe) => openAsset(sym, marketClass, selectedTimeframe)}
                      watchlist={watchlist}
                      onToggleWatchlist={toggleWatchlist}
                      onReorderWatchlist={handleReorderWatchlist}
                      selectedTier={selectedTier}
                      onSelectTier={setSelectedTier}
                      watchlistOnly={watchlistOnly}
                      onToggleWatchlistOnly={() => setWatchlistOnly(!watchlistOnly)}
                      selectedMarketClass={selectedMarketCategory}
                      onSelectMarketClass={setSelectedMarketCategory}
                      selectedNarrative={selectedNarrative}
                      onSelectNarrative={(narr) => setSelectedNarrative(narr as any)}
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
              )}

              {/* Top 100 cryptocurrencies, sized by market capitalization */}
              {activeTab === 'crypto_radar' && <CryptoRadarView isAdmin={user.role === 'Administrator'} />}
              {activeTab === 'crypto_bubbles' && (
                <CryptoBubbleView onSelectAsset={(symbol, coinGeckoId, coinPaprikaId) => openAsset(symbol, 'crypto', undefined, coinGeckoId, coinPaprikaId)} />
              )}

              {activeTab === 'crypto_heatmap' && (
                <CryptoHeatMapView onSelectAsset={(symbol, coinGeckoId, coinPaprikaId, marketClass) => openAsset(symbol, (marketClass as any) || 'crypto', undefined, coinGeckoId, coinPaprikaId)} />
              )}

              {/* Tab 2: USA Economic Status & Macro Intelligence */}
              {activeTab === 'usa_status' && <USAStatusView />}

              {/* Tab 3: X Narrative Intelligence & AI News Aggregator */}
              {activeTab === 'intelligence' && <IntelligenceView initialSource={initialDeepLink.intelligenceSource} />}

              {/* Top Alpha: both Business Quality leaderboards in one view */}
              {activeTab === 'top_alpha' && <TopAlphaView />}

              {/* Business Quality: hidden tab (no sidebar entry) - opened from the AI Briefing header button (Marius, 2026-09-22) */}
              {activeTab === 'business_quality' && <BusinessQualityView />}

              {/* Tab 5: AI Market Briefing & Interactive Chat */}
              {activeTab === 'ai' && <AIBriefingView onOpenBusinessQuality={() => handleTabChange('business_quality')} />}

              {/* Tab 6: Alerts — stay mounted after first visit so the last
                  scan snapshot is not refetched when leaving and coming back. */}
              {alertsVisited && (
                <div className={activeTab === 'alerts' ? undefined : 'hidden'} aria-hidden={activeTab !== 'alerts'}>
                  <AlertsCenterView
                    knownAssets={scannerRows}
                    watchlist={watchlist}
                    onOpenAsset={(symbol, marketClass, selectedTimeframe) => openAsset(symbol, marketClass, selectedTimeframe)}
                  />
                </div>
              )}

              {/* Tab 7: Backtest Engine */}
              {activeTab === 'backtest' && <BacktestView />}

              {/* Tab 8: System Status & Telemetry */}
              {activeTab === 'status' && <SystemStatusView />}
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
          openAsset(asset.symbol, marketClass, undefined, asset.coinGeckoId);
          setIsSearchModalOpen(false);
        }}
        allAssets={scannerRows}
        watchlist={watchlist}
        onToggleWatchlist={toggleWatchlist}
      />
      </DeferredPage>}
    </div>
    </AssetNavigationProvider>
  );
};

export const App: React.FC = () => (
  <AuthGate>
    {(user, logout) => <AuthenticatedApp user={user} onLogout={logout} />}
  </AuthGate>
);
