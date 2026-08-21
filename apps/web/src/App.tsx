import React, { useState, useEffect } from 'react';
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
  triggerTestAlert
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
import { USAStatusView } from './components/USAStatusView.js';
import { CryptoBubbleView } from './components/CryptoBubbleView.js';
import { Zap, CheckCircle2, RefreshCw } from 'lucide-react';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AppTab>('market');
  const [timeframe, setTimeframe] = useState<Timeframe>('1w');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [selectedTier, setSelectedTier] = useState('ALL');
  const [selectedNarrative, setSelectedNarrative] = useState<MarketNarrativeId | 'ALL'>('ALL');
  const [inspectedNarrative, setInspectedNarrative] = useState<NarrativeSummary | null>(null);
  const [watchlistOnly, setWatchlistOnly] = useState(false);
  
  // Persistent Watchlist from localStorage
  const [watchlist, setWatchlist] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('money_scanner_watchlist');
      if (saved) return JSON.parse(saved);
    } catch {}
    return ['BTC', 'ETH', 'SOL', 'SUI', 'FET'];
  });

  const [selectedAssetSymbol, setSelectedAssetSymbol] = useState<string | null>(null);
  const [selectedMarketCategory, setSelectedMarketCategory] = useState<'ALL' | 'crypto' | 'stocks' | 'metals'>('ALL');
  const [overview, setOverview] = useState<MarketOverviewSummary | null>(null);
  const [narratives, setNarratives] = useState<NarrativeSummary[]>([]);
  const [scannerRows, setScannerRows] = useState<AssetScannerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [bannerAlert, setBannerAlert] = useState<string | null>(null);

  const refreshData = async () => {
    setLoading(true);
    try {
      const [ovRes, rowsRes] = await Promise.allSettled([
        fetchMarketOverview(),
        fetchScanner(timeframe, undefined, undefined, undefined, undefined, selectedMarketCategory)
      ]);
      if (ovRes.status === 'fulfilled') {
        setOverview(ovRes.value);
      }
      if (rowsRes.status === 'fulfilled' && rowsRes.value && rowsRes.value.length > 0) {
        setScannerRows(rowsRes.value);
      }
      // The scanner request warms quote/candle caches; loading narrative rollups
      // afterwards avoids issuing the same provider requests twice.
      const narrRes = await fetchNarratives(timeframe, selectedMarketCategory);
      if (narrRes.length > 0) {
        setNarratives(narrRes);
      }
    } catch (err) {
      console.error('Data refresh error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 300000); 
    return () => clearInterval(interval);
  }, [timeframe, selectedMarketCategory]);

  const toggleWatchlist = (symbol: string) => {
    const sym = symbol.toUpperCase();
    const isAdding = !watchlist.includes(sym);
    const updated = isAdding
      ? [...watchlist, sym]
      : watchlist.filter(s => s !== sym);

    setWatchlist(updated);
    try {
      localStorage.setItem('money_scanner_watchlist', JSON.stringify(updated));
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
    localStorage.setItem('money_scanner_watchlist', JSON.stringify(newOrder));
  };

  const handleTriggerTestAlert = async () => {
    try {
      await triggerTestAlert('BTC');
      setBannerAlert('⚡ Test Alert expediat cu succes pe Telegram pentru $BTC!');
      setTimeout(() => setBannerAlert(null), 4000);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="min-h-screen flex bg-background text-slate-100 selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Persistent Left Sidebar (Desktop) + Bottom Nav (Mobile) */}
      {!selectedAssetSymbol && (
        <Sidebar
          activeTab={activeTab}
          onTabChange={(tab) => {
            setSelectedAssetSymbol(null);
            setActiveTab(tab);
          }}
          watchlistCount={watchlist.length}
          onLogoClick={() => {
            setSelectedAssetSymbol(null);
            setActiveTab('market');
          }}
          onOpenSearchModal={() => setIsSearchModalOpen(true)}
        />
      )}

      {/* Main Wrapper with responsive margin for desktop sidebar and top padding for fixed header */}
      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${!selectedAssetSymbol ? 'md:pl-[260px] pb-16 md:pb-0' : ''} pt-[56px]`}>
        {/* Minimal Search & Control Header (Fixed at top of viewport) */}
        <Header
          timeframe={timeframe}
          onTimeframeChange={setTimeframe}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onTriggerTestAlert={handleTriggerTestAlert}
          isStale={overview?.providerStatus.staleAssetsCount ? overview.providerStatus.staleAssetsCount > 0 : false}
          allAssets={scannerRows}
          onSelectAsset={(sym) => {
            setSelectedAssetSymbol(sym);
          }}
          watchlist={watchlist}
          onToggleWatchlist={toggleWatchlist}
          onRefreshMarket={refreshData}
          isRefreshing={loading}
          onOpenSearchModal={() => setIsSearchModalOpen(true)}
          hasSidebar={!selectedAssetSymbol}
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
          {selectedAssetSymbol ? (
            <AssetDeepDiveView
              symbol={selectedAssetSymbol}
              timeframe={timeframe}
              onTimeframeChange={setTimeframe}
              onBack={() => setSelectedAssetSymbol(null)}
              watchlist={watchlist}
              onToggleWatchlist={toggleWatchlist}
            />
          ) : (
            <>
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
                      onSelectAsset={(sym) => setSelectedAssetSymbol(sym)}
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
                        setSelectedAssetSymbol(sym);
                      }}
                      watchlist={watchlist}
                      onToggleWatchlist={toggleWatchlist}
                    />
                  )}
                </div>
              )}

              {/* Top 100 cryptocurrencies, sized by market capitalization */}
              {activeTab === 'crypto_bubbles' && (
                <CryptoBubbleView onSelectAsset={(symbol) => setSelectedAssetSymbol(symbol)} />
              )}

              {/* Tab 2: USA Economic Status & Macro Intelligence */}
              {activeTab === 'usa_status' && <USAStatusView />}

              {/* Tab 3: X Narrative Intelligence & AI News Aggregator */}
              {activeTab === 'trends' && <XTrendsView onSelectAsset={(sym) => setSelectedAssetSymbol(sym)} />}

              {/* Tab 4: News Feed */}
              {activeTab === 'news' && <NewsFeedView />}

              {/* Tab 5: AI Market Briefing & Interactive Chat */}
              {activeTab === 'ai' && <AIBriefingView />}

              {/* Tab 6: Backtest Engine */}
              {activeTab === 'backtest' && <BacktestView />}

              {/* Tab 7: System Status & Telemetry */}
              {activeTab === 'status' && <SystemStatusView />}
            </>
          )}
        </main>
      </div>

      {/* Universal TradingView-Style Search Spotlight Modal */}
      <UniversalSearchModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        onSelectAsset={(sym) => {
          setSelectedAssetSymbol(sym);
          setIsSearchModalOpen(false);
        }}
        allAssets={scannerRows}
        watchlist={watchlist}
        onToggleWatchlist={toggleWatchlist}
      />
    </div>
  );
};
