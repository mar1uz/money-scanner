import io, sys

def patch(path, repls):
    src = io.open(path, encoding='utf-8').read()
    for i, (old, new) in enumerate(repls):
        n = src.count(old)
        assert n == 1, f"{path} repl#{i}: found {n} matches (need exactly 1):\n{old[:120]}"
        src = src.replace(old, new)
    io.open(path, 'w', encoding='utf-8').write(src)
    print(f"patched {path}: {len(repls)} replacements")

# ---------- InteractiveChart.tsx ----------
patch('apps/web/src/components/InteractiveChart.tsx', [
("""  onLoadMoreHistory?: () => void | Promise<void>;
  isLoadingHistory?: boolean;
  hasMoreHistory?: boolean;
}""",
"""  onLoadMoreHistory?: () => void | Promise<void>;
  isLoadingHistory?: boolean;
  hasMoreHistory?: boolean;
  /** CoinGecko page URL. When provided (asset deep-dive, crypto), the mobile
      nav bar shows CoinGecko in place of the TradingView-extern tab, which
      moves up into the flip-info row. Desktop layout is unchanged. */
  coinGeckoUrl?: string;
  /** Controlled tab state (optional). Lets the parent switch tabs from
      outside (the flip-row TradingView extern button on mobile). */
  activeTab?: 'chart' | 'tv_embed' | 'pinescript';
  onActiveTabChange?: (tab: 'chart' | 'tv_embed' | 'pinescript') => void;
}"""),
("""  isLoadingHistory = false,
  hasMoreHistory = true
}) => {""",
"""  isLoadingHistory = false,
  hasMoreHistory = true,
  coinGeckoUrl,
  activeTab: controlledActiveTab,
  onActiveTabChange
}) => {"""),
("""  const [activeTab, setActiveTab] = useState<'chart' | 'tv_embed' | 'pinescript'>('chart');""",
"""  const [internalTab, setInternalTab] = useState<'chart' | 'tv_embed' | 'pinescript'>('chart');
  const activeTab = controlledActiveTab ?? internalTab;
  const setActiveTab = (tab: 'chart' | 'tv_embed' | 'pinescript') => {
    setInternalTab(tab);
    if (onActiveTabChange) onActiveTabChange(tab);
  };"""),
("""<div className="flex items-center bg-background-card/90 border border-background-border rounded-xl p-1 shadow-inner">""",
"""<div className="flex flex-wrap items-center max-w-full bg-background-card/90 border border-background-border rounded-xl p-1 shadow-inner">"""),
("""              onClick={() => setActiveTab('tv_embed')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-mono rounded-lg transition-all ${""",
"""              onClick={() => setActiveTab('tv_embed')}
              className={`${coinGeckoUrl ? 'hidden sm:flex' : 'flex'} items-center gap-1.5 px-3.5 py-1.5 text-xs font-mono rounded-lg transition-all ${"""),
("""              <span>TradingView extern</span>
            </button>""",
"""              <span>TradingView extern</span>
            </button>

            {coinGeckoUrl && (
              <a
                href={coinGeckoUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="Deschide pe CoinGecko"
                className="sm:hidden flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-mono rounded-lg transition-all text-emerald-300 hover:text-emerald-200 border border-emerald-500/30 hover:border-emerald-400/50 bg-emerald-500/10"
              >
                <ExternalLink className="w-3.5 h-3.5 text-emerald-400" />
                <span>CoinGecko</span>
              </a>
            )}"""),
])

# ---------- AssetDeepDiveView.tsx ----------
patch('apps/web/src/components/AssetDeepDiveView.tsx', [
("""  const [activeInfoTab, setActiveInfoTab] = useState<InfoTab>('ai');""",
"""  const [activeInfoTab, setActiveInfoTab] = useState<InfoTab>('ai');
  const [chartTab, setChartTab] = useState<'chart' | 'tv_embed' | 'pinescript'>('chart');"""),
("""          {resolvedMarketClass === 'crypto' && (
            <a
              href={coinGeckoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto inline-flex items-center gap-1 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.08] px-2.5 py-1 text-[10px] font-bold text-emerald-200"
            >
              CoinGecko <ExternalLink className="w-3 h-3" />
            </a>
          )}""",
"""          <button
            onClick={() => setChartTab('tv_embed')}
            title="Deschide graficul TradingView extern"
            className={`ml-auto inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[10px] font-bold transition-all ${
              chartTab === 'tv_embed'
                ? 'border-blue-500/40 bg-blue-500/20 text-blue-200'
                : 'border-blue-500/25 bg-blue-500/[0.08] text-blue-200 hover:bg-blue-500/[0.14]'
            }`}
          >
            TradingView extern
          </button>"""),
("""          isLoadingHistory={loadingOlderHistory}
          hasMoreHistory={hasMoreHistory}
        />""",
"""          isLoadingHistory={loadingOlderHistory}
          hasMoreHistory={hasMoreHistory}
          coinGeckoUrl={resolvedMarketClass === 'crypto' ? coinGeckoUrl : undefined}
          activeTab={chartTab}
          onActiveTabChange={setChartTab}
        />"""),
])

# ---------- App.tsx ----------
patch('apps/web/src/App.tsx', [
("""                <div className="market-dashboard space-y-8">
                  <section className="market-intro">""",
"""                <div className="market-dashboard space-y-8">
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
                  <section className="market-intro">"""),
])

print("ALL PATCHES APPLIED")
