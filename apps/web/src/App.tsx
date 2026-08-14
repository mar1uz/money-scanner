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
import { Zap, BellRing, Sparkles } from 'lucide-react';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AppTab>('dashboard');
  const [timeframe, setTimeframe] = useState<Timeframe>('1h');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTier, setSelectedTier] = useState('ALL');
  const [watchlistOnly, setWatchlistOnly] = useState(false);
  const [watchlist, setWatchlist] = useState<string[]>(['BTC', 'ETH', 'SOL', 'SUI', 'FET']);
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
    setWatchlist(prev => 
      prev.includes(symbol) ? prev.filter(s => s !== symbol) : [...prev, symbol]
    );
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

  // Instant local filtering for table
  const filteredScannerRows = scannerRows.filter(r => {
    if (watchlistOnly && !watchlist.includes(r.symbol)) return false;
    if (selectedTier !== 'ALL' && r.tier !== selectedTier) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().replace(/^[$#]/, '').toUpperCase();
      const matchSym = r.symbol.toUpperCase().includes(q);
      const matchNm = r.name.toUpperCase().includes(q);
      const matchCat = r.category.toUpperCase().includes(q);
      if (!matchSym && !matchNm && !matchCat) return false;
    }
    return true;
  });

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
      />

      {/* Main Tab Navigation */}
      <Navigation
        activeTab={activeTab}
        onTabChange={setActiveTab}
        watchlistCount={watchlist.length}
      />

      {/* Notification Banner */}
      {bannerAlert && (
        <div className="bg-gradient-to-r from-cyan-600/30 to-emerald-600/30 border-b border-cyan-500/40 px-4 py-2 text-center text-xs font-mono text-cyan-200 flex items-center justify-center gap-2">
          <BellRing className="w-4 h-4 text-cyan-400 animate-bounce" />
          <span>{bannerAlert}</span>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 p-4 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
        {/* Dashboard View */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <MarketRegimeGauge overview={overview} />
            
            {/* Quick Scanner Highlights */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-cyan-400" />
                  <h2 className="text-base font-bold text-slate-100">Live Money Scanner Signals ({timeframe.toUpperCase()})</h2>
                </div>
                <button
                  onClick={() => setActiveTab('scanner')}
                  className="text-xs font-mono text-cyan-400 hover:underline"
                >
                  View Full Scanner (50 Assets) →
                </button>
              </div>

              <ScannerTable
                rows={filteredScannerRows.slice(0, 15)}
                onSelectAsset={setSelectedAssetSymbol}
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

        {/* Full Scanner Tab */}
        {activeTab === 'scanner' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-100">Deterministic Money Scanner Engine</h2>
                <p className="text-xs text-slate-400">
                  Ranking top 50 liquid crypto assets by original Money Line v1.0.0 composite scores, volume confirmation, and social momentum.
                </p>
              </div>
            </div>

            <ScannerTable
              rows={filteredScannerRows}
              onSelectAsset={setSelectedAssetSymbol}
              watchlist={watchlist}
              onToggleWatchlist={toggleWatchlist}
              selectedTier={selectedTier}
              onSelectTier={setSelectedTier}
              watchlistOnly={watchlistOnly}
              onToggleWatchlistOnly={() => setWatchlistOnly(!watchlistOnly)}
            />
          </div>
        )}

        {/* X Trends Tab */}
        {activeTab === 'trends' && <XTrendsView />}

        {/* News Tab */}
        {activeTab === 'news' && <NewsFeedView />}

        {/* AI Analyst Studio Tab */}
        {activeTab === 'ai' && <AIBriefingView />}

        {/* Backtest Strategy Tab */}
        {activeTab === 'backtest' && <BacktestView />}

        {/* System & Bot Health Tab */}
        {activeTab === 'status' && <SystemStatusView />}
      </main>

      {/* Asset Deep-Dive Modal */}
      {selectedAssetSymbol && (
        <AssetDetailModal
          symbol={selectedAssetSymbol}
          onClose={() => setSelectedAssetSymbol(null)}
          timeframe={timeframe}
        />
      )}

      {/* Footer */}
      <footer className="border-t border-background-border py-4 px-8 text-center text-xs font-mono text-slate-500 bg-background-card/40">
        Money Scanner © 2026 — Isolated Crypto Intelligence Application • Independent of RelayHub • Decision-Support Only
      </footer>
    </div>
  );
};
