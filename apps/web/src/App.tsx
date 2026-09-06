import React, { useState, useEffect, useRef } from 'react';
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
import { UniversalSearchModal } from './components/UniversalSearchModal.js';
import { ScannerTable } from './components/ScannerTable.js';
import { AssetDeepDiveView } from './components/AssetDeepDiveView.js';
import { XTrendsView } from './components/XTrendsView.js';
import { NewsFeedView } from './components/NewsFeedView.js';
import { AIBriefingView } from './components/AIBriefingView.js';
import { BacktestView } from './components/BacktestView.js';
import { SystemStatusView } from './components/SystemStatusView.js';
import { AlertsCenterView } from './components/AlertsCenterView.js';
import { USAStatusView } from './components/USAStatusView.js';
import { CryptoRadarView } from './components/CryptoRadarView.js';
import { CryptoBubbleView } from './components/CryptoBubbleView.js';
import { CryptoHeatMapView } from './components/CryptoHeatMapView.js';
import { AuthGate } from './components/AuthGate.js';
import { AssetNavigationProvider } from './components/AssetNavigation.js';
import { UserProfile } from '@money-scanner/shared';
import { Zap, CheckCircle2, RefreshCw } from 'lucide-react';

interface AuthenticatedAppProps {
  user: UserProfile;
  onLogout: () => Promise<void>;
}

const VALID_TIMEFRAMES: Timeframe[] = ['1h', '4h', '8h', '1d', '1w', '1m'];
const VALID_MARKET_CLASSES = ['crypto', 'stocks', 'metals'] as const;

const readMoneyLineDeepLink = () => {
  const params = new URLSearchParams(window.location.search);
  const rawSymbol = (params.get('asset') || '').replace(/^[$#]/, '').trim().toUpperCase();
  const rawTimeframe = params.get('timeframe')?.toLowerCase() as Timeframe | undefined;
  const rawMarketClass = params.get('marketClass')?.toLowerCase();
  return {
    symbol: /^[A-Z0-9][A-Z0-9._:-]{0,30}$/.test(rawSymbol) ? rawSymbol : null,
    timeframe: rawTimeframe && VALID_TIMEFRAMES.includes(rawTimeframe) ? rawTimeframe : undefined,
    marketClass: VALID_MARKET_CLASSES.includes(rawMarketClass as typeof VALID_MARKET_CLASSES[number])
      ? rawMarketClass as typeof VALID_MARKET_CLASSES[number]
      : undefined,
    coinGeckoId: params.get('coinGeckoId') || undefined,
    coinPaprikaId: params.get('coinPaprikaId') || undefined
  };
};

const AuthenticatedApp: React.FC<AuthenticatedAppProps> = ({ user, onLogout }) => {
  const initialDeepLink = useRef(readMoneyLineDeepLink()).current;
  const [activeTab, setActiveTab] = useState<AppTab>(new URLSearchParams(window.location.search).get('tab') === 'crypto_radar' ? 'crypto_radar' : 'market');
  const [timeframe, setTimeframe] = useState<Timeframe>(initialDeepLink.timeframe || '1w');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [selectedTier, setSelectedTier] = useState('ALL');
  const [selectedNarrative, setSelectedNarrative] = useState<MarketNarrativeId | 'ALL'>('ALL');
  const [inspectedNarrative, setInspectedNarrative] = useState<NarrativeSummary | null>(null);
  const [watchlistOnly, setWatchlistOnly] = useState(false);
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
      const [ovRes, rowsRes] = await Promise.allSettled([
        fetchMarketOverview(),
        fetchScanner(timeframe, undefined, undefined, undefined, undefined, selectedMarketCategory)
      ]);
      if (requestId !== refreshRequestId.current) return;
      if (ovRes.status === 'fulfilled') {
        setOverview(ovRes.value);
      }
      if (rowsRes.status === 'fulfilled' && rowsRes.value && rowsRes.value.length > 0) {
        // Defense in depth: Crypto view must never render a non-crypto row,
        // even if an upstream response is stale or incorrectly classified.
        const verifiedRows = selectedMarketCategory === 'crypto'
          ? rowsRes.value.filter(row => row.marketClass === 'crypto')
          : rowsRes.value;
        setScannerRows(verifiedRows);
      }
      // The scanner request warms quote/candle caches; loading narrative rollups
      // afterwards avoids issuing the same provider requests twice.
      const narrRes = await fetchNarratives(timeframe, selectedMarketCategory);
      if (requestId === refreshRequestId.current && narrRes.length > 0) {
        setNarratives(narrRes);
        setSelectedNarrative(current =>
          current === 'ALL' || narrRes.some(narrative => narrative.id === current)
            ? current
            : 'ALL'
        );
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
  };

  return (
    <AssetNavigationProvider onOpenAsset={({ symbol, marketClass, timeframe: targetTimeframe, coinGeckoId }) => openAsset(symbol, marketClass, targetTimeframe, coinGeckoId)}>
    <div className="min-h-screen flex bg-background text-slate-100 selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Persistent Left Sidebar (Desktop) + Bottom Nav (Mobile) */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={(tab) => {
          setSelectedAssetSymbol(null);
          setSelectedAssetMarketClass(undefined);
          setSelectedAssetCoinGeckoId(undefined);
          setActiveTab(tab);
        }}
        watchlistCount={watchlist.length}
        onLogoClick={() => {
          setSelectedAssetSymbol(null);
          setSelectedAssetMarketClass(undefined);
          setSelectedAssetCoinGeckoId(undefined);
          setActiveTab('market');
        }}
        onOpenSearchModal={() => setIsSearchModalOpen(true)}
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
          onOpenAlerts={() => {
            setSelectedAssetSymbol(null);
            setSelectedAssetMarketClass(undefined);
            setSelectedAssetCoinGeckoId(undefined);
            setActiveTab('alerts');
          }}
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
          currentUser={user}
          onLogout={onLogout}
        />

        {/* Notification Banner */}
        {bannerAlert && (
          <div className="mx-4 lg:mx-8 mt-3 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs font-mono text-emerald-300 flex items-center justify-between shadow-glow-emerald animate-fade-in">
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
        <main className="flex-1 px-4 lg:px-8 py-6 space-y-6 max-w-[1600px] w-full mx-auto animate-fade-in">
          {/* Full-Page Asset Deep-Dive View */}
          {selectedAssetSymbol && (
            <AssetDeepDiveView
              symbol={selectedAssetSymbol}
              marketClass={selectedAssetMarketClass}
              coinGeckoId={selectedAssetCoinGeckoId}
              coinPaprikaId={selectedAssetCoinPaprikaId}
              timeframe={timeframe}
              onTimeframeChange={setTimeframe}
              onBack={() => {
                setSelectedAssetSymbol(null);
                setSelectedAssetMarketClass(undefined);
                setSelectedAssetCoinGeckoId(undefined);
                setSelectedAssetCoinPaprikaId(undefined);
              }}
              watchlist={watchlist}
              onToggleWatchlist={toggleWatchlist}
            />
          )}
          {/* Tab views stay mounted (hidden) while an asset is open so filter
              selection, scroll and loaded data survive back navigation instead
              of resetting to defaults and refetching. `contents` keeps the
              exact same layout as before when visible. */}
          <div className={selectedAssetSymbol ? 'hidden' : 'contents'}>
              {/* Tab 1: Market Intelligence (Gauges + Narrative Bar + Scanner Table) */}
              {activeTab === 'market' && (
                <div className="space-y-6">
                  {/* Top Market Intelligence Gauges */}
                  <MarketRegimeGauge
                    overview={overview}
                    rows={scannerRows}
                    selectedCategory={selectedMarketCategory}
                    onSelectCategory={setSelectedMarketCategory}
                  />

                  {/* Interactive Narrative & Sector Alpha Bar */}
                  <NarrativeBar
                    narratives={narratives}
                    timeframe={timeframe}
                    selectedNarrative={selectedNarrative}
                    onSelectNarrative={(narr) => setSelectedNarrative(narr)}
                    onInspectNarrative={(narr) => setInspectedNarrative(narr)}
                    loading={loading}
                  />

                  {/* Scanner Signals Header & Table */}
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                      <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-cyan-400" />
                        <h2 className="text-xs font-bold tracking-wider uppercase font-mono text-slate-300">
                          Semnale Live Market Scanner 360 ({timeframe.toUpperCase()})
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
                <CryptoHeatMapView onSelectAsset={(symbol, coinGeckoId, marketClass) => openAsset(symbol, (marketClass as any) || 'crypto', undefined, coinGeckoId)} />
              )}

              {/* Tab 2: USA Economic Status & Macro Intelligence */}
              {activeTab === 'usa_status' && <USAStatusView />}

              {/* Tab 3: X Narrative Intelligence & AI News Aggregator */}
              {activeTab === 'trends' && <XTrendsView onSelectAsset={(sym) => openAsset(sym)} />}

              {/* Tab 4: News Feed */}
              {activeTab === 'news' && <NewsFeedView />}

              {/* Tab 5: AI Market Briefing & Interactive Chat */}
              {activeTab === 'ai' && <AIBriefingView />}

              {/* Tab 6: Backtest Engine */}
              {activeTab === 'alerts' && (
                <AlertsCenterView
                  knownAssets={scannerRows}
                  watchlist={watchlist}
                  onOpenAsset={(symbol, marketClass, selectedTimeframe) => openAsset(symbol, marketClass, selectedTimeframe)}
                />
              )}

              {/* Tab 7: Backtest Engine */}
              {activeTab === 'backtest' && <BacktestView />}

              {/* Tab 8: System Status & Telemetry */}
              {activeTab === 'status' && <SystemStatusView />}
          </div>
        </main>
      </div>

      {/* Universal TradingView-Style Search Spotlight Modal */}
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
    </div>
    </AssetNavigationProvider>
  );
};

export const App: React.FC = () => (
  <AuthGate>
    {(user, logout) => <AuthenticatedApp user={user} onLogout={logout} />}
  </AuthGate>
);
