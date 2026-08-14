import React, { useState, useEffect } from 'react';
import {
  AppTab,
  Timeframe,
  MarketOverviewSummary,
  AssetScannerRow
} from './types.js';
import {
  fetchMarketOverview,
  fetchScanner,
  triggerTestAlert
} from './services/api.js';
import { Header } from './components/Header.js';
import { Navigation } from './components/Navigation.js';
import { MarketRegimeGauge } from './components/MarketRegimeGauge.js';
import { ScannerTable } from './components/ScannerTable.js';
import { AssetDeepDiveView } from './components/AssetDeepDiveView.js';
import { XTrendsView } from './components/XTrendsView.js';
import { NewsFeedView } from './components/NewsFeedView.js';
import { AIBriefingView } from './components/AIBriefingView.js';
import { BacktestView } from './components/BacktestView.js';
import { SystemStatusView } from './components/SystemStatusView.js';
import { Zap, BellRing, Sparkles, CheckCircle2, RefreshCw } from 'lucide-react';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AppTab>('dashboard');
  const [timeframe, setTimeframe] = useState<Timeframe>('1h');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTier, setSelectedTier] = useState('ALL');
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
  const [overview, setOverview] = useState<MarketOverviewSummary | null>(null);
  const [scannerRows, setScannerRows] = useState<AssetScannerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [bannerAlert, setBannerAlert] = useState<string | null>(null);

  const refreshData = async () => {
    setLoading(true);
    try {
      const [ov, rows] = await Promise.all([
        fetchMarketOverview(),
        fetchScanner(timeframe) // Always fetch all 50 assets master state
      ]);
      setOverview(ov);
      if (rows && rows.length > 0) {
        setScannerRows(rows);
      }
    } catch (err) {
      console.error('Data refresh error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
    // 5 minutes auto-refresh as requested
    const interval = setInterval(refreshData, 300000); 
    return () => clearInterval(interval);
  }, [timeframe]);

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
        ? `★ $${sym} a fost adăugat în Watchlist! Este activ în semnalele Live Scanner.`
        : `Active Watchlist: $${sym} a fost eliminat din listă.`
    );
    setTimeout(() => setBannerAlert(null), 4000);
  };

  const handleTriggerTestAlert = async () => {
    try {
      await triggerTestAlert('BTC');
      setBannerAlert('⚡ Test Telegram Alert dispatched successfully for $BTC!');
      setTimeout(() => setBannerAlert(null), 5000);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-slate-100 selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Top Header */}
      <Header
        timeframe={timeframe}
        onTimeframeChange={setTimeframe}
        onSearchClick={() => {
          setSelectedAssetSymbol(null);
          setActiveTab('scanner');
        }}
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
      />

      {/* Main Tab Navigation (Hidden when in Full-Page Deep Dive) */}
      {!selectedAssetSymbol && (
        <Navigation
          activeTab={activeTab}
          onTabChange={(tab) => {
            setSelectedAssetSymbol(null);
            setActiveTab(tab);
          }}
          watchlistCount={watchlist.length}
        />
      )}

      {/* Notification Banner */}
      {bannerAlert && (
        <div className="mx-4 lg:mx-8 mt-3 p-3 bg-gradient-to-r from-emerald-500/20 via-cyan-500/20 to-emerald-500/20 border border-emerald-500/40 rounded-xl text-xs font-mono text-emerald-300 flex items-center justify-between shadow-glow-emerald animate-fade-in">
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
      <main className="flex-1 px-4 lg:px-8 py-6 space-y-6 max-w-[1600px] w-full mx-auto">
        {/* Full-Page Asset Deep-Dive View */}
        {selectedAssetSymbol ? (
          <AssetDeepDiveView
            symbol={selectedAssetSymbol}
            initialTimeframe={timeframe}
            onBack={() => setSelectedAssetSymbol(null)}
            watchlist={watchlist}
            onToggleWatchlist={toggleWatchlist}
          />
        ) : (
          <>
            {/* Tab 1: Live Dashboard */}
            {activeTab === 'dashboard' && (
              <div className="space-y-6">
                {/* Top Market Intelligence Gauges */}
                {overview && (
                  <MarketRegimeGauge
                    overview={overview}
                  />
                )}

                {/* Live Money Scanner Signals Table */}
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-cyan-400" />
                      <h2 className="text-sm font-bold tracking-wide uppercase font-mono text-slate-200">
                        Live Money Scanner Signals ({timeframe.toUpperCase()})
                      </h2>
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        onClick={refreshData}
                        disabled={loading}
                        className="flex items-center gap-1.5 px-3 py-1 text-xs font-mono font-bold bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded-lg transition-all disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                        <span>Actualizează Datele</span>
                      </button>

                      <span className="text-xs font-mono text-slate-400 hidden sm:inline">
                        Auto-refresh: 5 min • Deterministic Engine
                      </span>
                    </div>
                  </div>

                  <ScannerTable
                    rows={scannerRows}
                    onSelectAsset={(sym) => setSelectedAssetSymbol(sym)}
                    watchlist={watchlist}
                    onToggleWatchlist={toggleWatchlist}
                    selectedTier={selectedTier}
                    onSelectTier={setSelectedTier}
                    watchlistOnly={watchlistOnly}
                    onToggleWatchlistOnly={() => setWatchlistOnly(!watchlistOnly)}
                    loading={loading}
                  />
                </div>
              </div>
            )}

            {/* Tab 2: Full Scanner */}
            {activeTab === 'scanner' && (
              <div className="space-y-4">
                <ScannerTable
                  rows={scannerRows}
                  onSelectAsset={(sym) => setSelectedAssetSymbol(sym)}
                  watchlist={watchlist}
                  onToggleWatchlist={toggleWatchlist}
                  selectedTier={selectedTier}
                  onSelectTier={setSelectedTier}
                  watchlistOnly={watchlistOnly}
                  onToggleWatchlistOnly={() => setWatchlistOnly(!watchlistOnly)}
                  loading={loading}
                />
              </div>
            )}

            {/* Tab 3: X Narrative Intelligence */}
            {activeTab === 'trends' && <XTrendsView />}

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
  );
};
