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
import { AssetDetailModal } from './components/AssetDetailModal.js';
import { XTrendsView } from './components/XTrendsView.js';
import { NewsFeedView } from './components/NewsFeedView.js';
import { AIBriefingView } from './components/AIBriefingView.js';
import { BacktestView } from './components/BacktestView.js';
import { SystemStatusView } from './components/SystemStatusView.js';
import { Zap, BellRing, Sparkles, CheckCircle2 } from 'lucide-react';

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
    try {
      const [ov, rows] = await Promise.all([
        fetchMarketOverview(),
        fetchScanner(timeframe) // Always fetch all 50 assets master state
      ]);
      setOverview(ov);
      setScannerRows(rows);
    } catch (err) {
      console.error('Data refresh error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 15000); // 15s live refresh
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
        onSearchClick={() => setActiveTab('scanner')}
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
      />

      {/* Main Tab Navigation */}
      <Navigation
        activeTab={activeTab}
        onTabChange={setActiveTab}
        watchlistCount={watchlist.length}
      />

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
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-cyan-400" />
                  <h2 className="text-sm font-bold tracking-wide uppercase font-mono text-slate-200">
                    Live Money Scanner Signals ({timeframe.toUpperCase()})
                  </h2>
                </div>
                <span className="text-xs font-mono text-slate-400">
                  Auto-refreshing every 15s • Deterministic Non-Repainting Engine
                </span>
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
      </main>

      {/* Asset Deep-Dive Modal */}
      {selectedAssetSymbol && (
        <AssetDetailModal
          symbol={selectedAssetSymbol}
          timeframe={timeframe}
          onClose={() => setSelectedAssetSymbol(null)}
        />
      )}
    </div>
  );
};
