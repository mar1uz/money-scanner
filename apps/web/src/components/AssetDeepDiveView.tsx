import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AssetDetailResponse, Timeframe } from '../types.js';
import { TRADING_360_ASSETS } from '@money-scanner/shared';
import { fetchAssetDetail, fetchHistoricalCandles, triggerTestAlert } from '../services/api.js';
import { InteractiveChart } from './InteractiveChart.js';
import { useLanguage } from '../i18n.js';
import { OnchainDataCard } from './OnchainDataCard.js';
import { BusinessQualityAssetCard } from './BusinessQualityAssetCard.js';
import { formatPrice } from '../utils/price.js';
import { CryptoBusinessQualityCard } from './CryptoBusinessQualityCard.js';
import { StockBusinessQualityCard } from './StockBusinessQualityCard.js';
import { AssetProfileOverviewCard } from './AssetProfileOverviewCard.js';
import { CryptoMarketOnlyView } from './CryptoMarketOnlyView.js';
import { AssetExternalLinks } from './AssetExternalLinks.js';
import { useCryptoFundamentals } from '../services/crypto-fundamentals.js';
import {
  ArrowLeft,
  Zap,
  BellRing,
  Sparkles,
  ExternalLink,
  Newspaper,
  Star,
  Layers,
  Compass,
  CheckCircle2,
  AlertTriangle,
  BadgeCheck,
  TrendingUp,
  Target,
  ShieldAlert,
  FileText,
  Lightbulb,
  Calendar,
  ChevronRight,
  TrendingDown,
  RefreshCw,
  Twitter
} from 'lucide-react';

interface AssetDeepDiveViewProps {
  symbol: string;
  marketClass?: string;
  coinGeckoId?: string;
  coinPaprikaId?: string;
  timeframe: Timeframe;
  onTimeframeChange: (tf: Timeframe) => void;
  onBack: () => void;
  watchlist: string[];
  onToggleWatchlist: (symbol: string) => void;
}

type InfoTab = 'ai' | 'mtf' | 'social';

const stockAssetsByMarketCap = TRADING_360_ASSETS
  .filter(a => a.marketClass === 'stocks' && a.symbol !== 'DXY' && a.symbol !== 'VIX' && (a.marketCap || 0) > 0)
  .sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0));

const stockMarketCapRankMap = new Map<string, number>(
  stockAssetsByMarketCap.map((asset, index) => [asset.symbol.toUpperCase(), index + 1])
);

// NOTE: no catalog fallback map for crypto. Static catalog ranks go stale
// (catalog UNI said #145 vs live #28), so crypto shows only the live backend
// rank (CoinGecko market_cap_rank) and hides the badge when unknown.

/**
 * Picks the rank value fed into getMarketCapRank. Catalog fallback applies to
 * stocks only — crypto uses the live backend rank exclusively, so a stale
 * catalog number (catalog UNI said #145 vs live #28) can never render.
 */
export const resolveRankInput = (
  infoRank?: number | null,
  catalogRank?: number | null,
  marketClass?: string
): number | undefined => {
  if (marketClass === 'crypto') return infoRank ?? undefined;
  return infoRank ?? catalogRank ?? undefined;
};

export const getMarketCapRank = (
  symbol: string,
  marketClass?: string,
  rawRank?: number,
  marketCap?: number
): number | null => {
  const sym = symbol.replace(/^[$#]/, '').trim().toUpperCase();
  const resolvedClass = marketClass || TRADING_360_ASSETS.find(a => a.symbol.toUpperCase() === sym)?.marketClass;

  if (resolvedClass === 'stocks') {
    const fromMap = stockMarketCapRankMap.get(sym);
    if (fromMap !== undefined) return fromMap;
    if (marketCap && marketCap > 0) {
      const idx = stockAssetsByMarketCap.findIndex(s => (s.marketCap || 0) <= marketCap);
      return idx === -1 ? stockAssetsByMarketCap.length + 1 : idx + 1;
    }
    if (rawRank && rawRank > 0 && rawRank < 999) return rawRank;
    return null;
  }

  if (resolvedClass === 'crypto') {
    // Live backend rank only (CoinGecko market_cap_rank). A stale catalog
    // number must never render as global rank — hide the badge instead.
    if (rawRank && rawRank > 0 && rawRank < 999) return rawRank;
    return null;
  }

  if (rawRank && rawRank > 0 && rawRank < 999) return rawRank;
  return null;
};

export const formatMarketCap = (value?: number | null): string => {
  if (!value || !Number.isFinite(value) || value <= 0) return '—';
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) {
    const b = value / 1e9;
    return `$${b >= 100 ? b.toFixed(1) : b.toFixed(2)}B`;
  }
  if (value >= 1e6) {
    const m = value / 1e6;
    return `$${m >= 100 ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  return `$${value.toLocaleString('en-US')}`;
};

export const AssetDeepDiveView: React.FC<AssetDeepDiveViewProps> = ({
  symbol,
  marketClass,
  coinGeckoId,
  coinPaprikaId,
  timeframe,
  onTimeframeChange,
  onBack,
  watchlist,
  onToggleWatchlist
}) => {
  const [data, setData] = useState<AssetDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [alertSent, setAlertSent] = useState(false);
  const [activeInfoTab, setActiveInfoTab] = useState<InfoTab>('ai');
  const [chartTab, setChartTab] = useState<'chart' | 'tv_embed' | 'pinescript'>('chart');
  const { language } = useLanguage();
  const cryptoFundamentals = useCryptoFundamentals();
  const [showFlipTooltip, setShowFlipTooltip] = useState(false);
  const [loadingOlderHistory, setLoadingOlderHistory] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  const historyRequestActiveRef = useRef(false);
  const detailRequestRef = useRef(0);
  const historyContextRef = useRef(`${symbol}:${timeframe}`);
  historyContextRef.current = `${symbol}:${timeframe}`;

  const loadData = () => {
    const requestId = ++detailRequestRef.current;
    setLoading(true);
    setLoadError(null);
    fetchAssetDetail(symbol, timeframe, marketClass, coinGeckoId, coinPaprikaId)
      .then(result => { if (requestId === detailRequestRef.current) setData(result); })
      .catch(error => {
        if (requestId !== detailRequestRef.current) return;
        console.error(error);
        setData(null);
        setLoadError('Instrumentul a fost găsit, dar datele de piață nu au putut fi încărcate momentan.');
      })
      .finally(() => { if (requestId === detailRequestRef.current) setLoading(false); });
  };

  useEffect(() => {
    setData(null);
    setHasMoreHistory(true);
    setLoadingOlderHistory(false);
    historyRequestActiveRef.current = false;
    loadData();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return () => { detailRequestRef.current++; };
  }, [symbol, timeframe, marketClass, coinGeckoId, coinPaprikaId]);

  const loadOlderHistory = useCallback(async () => {
    if (historyRequestActiveRef.current || loadingOlderHistory || !hasMoreHistory) return;
    const currentCandles = data?.candles || [];
    if (!currentCandles.length) return;

    const oldestTimestamp = currentCandles.reduce(
      (oldest, candle) => Math.min(oldest, candle.timestamp),
      Number.POSITIVE_INFINITY
    );
    if (!Number.isFinite(oldestTimestamp)) return;

    const requestContext = `${symbol}:${timeframe}`;
    historyRequestActiveRef.current = true;
    setLoadingOlderHistory(true);
    try {
      const response = await fetchHistoricalCandles(
        symbol,
        timeframe,
        oldestTimestamp,
        marketClass || data?.info?.marketClass,
        1000
      );
      if (historyContextRef.current !== requestContext) return;

      if (!response.candles.length) {
        setHasMoreHistory(false);
        return;
      }

      setData(current => {
        if (!current || historyContextRef.current !== requestContext) return current;
        const mergedByTimestamp = new Map<number, typeof response.candles[number]>();
        for (const candle of response.candles) mergedByTimestamp.set(candle.timestamp, candle);
        for (const candle of current.candles) mergedByTimestamp.set(candle.timestamp, candle);
        return {
          ...current,
          candles: Array.from(mergedByTimestamp.values()).sort((left, right) => left.timestamp - right.timestamp)
        };
      });
      setHasMoreHistory(response.hasMore);
    } catch (error) {
      console.error('Historical candle load failed:', error);
    } finally {
      if (historyContextRef.current === requestContext) {
        historyRequestActiveRef.current = false;
        setLoadingOlderHistory(false);
      }
    }
  }, [data, hasMoreHistory, loadingOlderHistory, marketClass, symbol, timeframe]);

  const handleSendAlert = async () => {
    try {
      await triggerTestAlert(symbol);
      setAlertSent(true);
      setTimeout(() => setAlertSent(false), 4000);
    } catch (e) {
      console.error(e);
    }
  };

  const isInWatchlist = watchlist.map(w => w.replace(/^[$#]/, '').trim().toUpperCase()).includes(symbol.toUpperCase());
  const quote = data?.quote;
  const explanation = data?.aiExplanation;

  // Find exact signal for currently active timeframe
  const currentTfSignal = (data?.multiTimeframe?.[timeframe as keyof typeof data.multiTimeframe] as any) || data?.activeSignal;
  const isBull = currentTfSignal?.tier?.includes('Bullish');
  const isBear = currentTfSignal?.tier?.includes('Bearish');
  const forceScore = currentTfSignal?.score || 0;

  // Compute flip time elapsed
  const formatFlipAge = (ts?: number) => {
    if (!ts) return 'Confirmat recent';
    const diff = Math.max(0, Date.now() - ts);
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (mins < 1) return 'Chiar acum (pe această lumânare)';
    if (mins < 60) return `acum ${mins} minute`;
    if (hours < 24) {
      const remMins = mins % 60;
      return `acum ${hours} ${hours === 1 ? 'oră' : 'ore'}${remMins > 0 ? ` și ${remMins} min` : ''}`;
    }
    const remHours = hours % 24;
    return `acum ${days} ${days === 1 ? 'zi' : 'zile'}${remHours > 0 ? ` și ${remHours} ore` : ''}`;
  };

  const flipTimeFormatted = currentTfSignal?.transitionTime
    ? new Date(currentTfSignal.transitionTime).toLocaleString('ro-RO', { timeZone: 'UTC', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' UTC'
    : '';

  // Bias styling
  const biasColor = isBull ? 'text-emerald-400' : (isBear ? 'text-rose-400' : 'text-slate-400');
  const biasDotColor = isBull ? 'bg-emerald-400' : (isBear ? 'bg-rose-400' : 'bg-slate-500');
  const biasLabel = isBull ? 'Bullish' : (isBear ? 'Bearish' : 'Neutral');
  const biasBorderColor = isBull ? 'border-emerald-500/30' : (isBear ? 'border-rose-500/30' : 'border-slate-700');
  const resolvedMarketClass = marketClass || data?.info?.marketClass;
  const resolvedCoinGeckoId = coinGeckoId || data?.info?.coinGeckoId;
  const coinGeckoUrl = resolvedCoinGeckoId
    ? `https://www.coingecko.com/en/coins/${encodeURIComponent(resolvedCoinGeckoId)}`
    : `https://www.coingecko.com/en/search?query=${encodeURIComponent(data?.info?.name || symbol)}`;

  if (loading && !data) {
    return (
      <div className="p-16 text-center text-slate-400 font-mono space-y-3">
        <Zap className="w-8 h-8 mx-auto animate-spin text-cyan-400" />
        <p className="text-sm">Loading {symbol}...</p>
      </div>
    );
  }

  if (!loading && !data) {
    return (
      <div className="p-6 sm:p-12 text-center font-mono space-y-4">
        <AlertTriangle className="w-9 h-9 mx-auto text-amber-300" />
        <div>
          <h2 className="text-base font-bold text-slate-100">${symbol} · date indisponibile temporar</h2>
          <p className="mt-2 text-sm text-slate-400">{loadError}</p>
        </div>
        <AssetExternalLinks className="justify-center" symbol={symbol} marketClass={marketClass} coinGeckoId={coinGeckoId} language={language} />
        <div className="flex items-center justify-center gap-3">
          <button onClick={onBack} className="px-4 py-2 rounded-xl border border-white/[0.08] text-slate-300 hover:bg-white/[0.04]">
            Înapoi
          </button>
          <button onClick={loadData} className="px-4 py-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20">
            Reîncearcă
          </button>
        </div>
      </div>
    );
  }

  if (data?.dataAvailability === 'aggregated-price-only' || data?.dataAvailability === 'dex-fallback') {
    return <CryptoMarketOnlyView data={data} timeframe={timeframe} onBack={onBack} onRefresh={loadData} loading={loading} onTimeframeChange={onTimeframeChange} />;
  }

  // Only provider-verified posts explicitly tagged with this asset are shown.
  // There is deliberately no fallback to the global social feed.
  const backendXPosts = (data as any)?.xPosts || [];
  const displayXPosts = backendXPosts.filter((post: any) =>
    post.mentionedSymbols?.some((mentioned: string) => mentioned.toUpperCase() === symbol.toUpperCase())
  );

  // Combine news + social into a unified feed
  const newsItems = (data?.news || []).slice(0, 4).map((n: any) => ({ ...n, _type: 'news' as const }));
  const socialItems = displayXPosts.slice(0, 4).map((p: any) => ({ ...p, _type: 'social' as const }));
  const unifiedFeed = [...newsItems, ...socialItems].slice(0, 6);

  const infoClass = marketClass || data?.info?.marketClass;
  // Match the catalog by market class too: crypto CVX (Convex) must not
  // pick up Chevron's stock market cap through the shared ticker.
  const catalogAsset = TRADING_360_ASSETS.find(a => a.symbol.toUpperCase() === symbol.toUpperCase() && (!infoClass || a.marketClass === infoClass));
  const effectiveMarketCap = data?.info?.marketCap || catalogAsset?.marketCap || (data?.quote as any)?.marketCap || 0;
  const rawRank = resolveRankInput(data?.info?.rank, catalogAsset?.rank, infoClass);
  // Instinct-authored guide take (outbox contract), language-matched with
  // fallback to the other language.
  const guideTake = language === 'en'
    ? (data?.investmentGuide?.en || data?.investmentGuide?.ro)
    : (data?.investmentGuide?.ro || data?.investmentGuide?.en);
  const profileTake = language === 'en'
    ? (data?.assetProfile?.en || data?.assetProfile?.ro)
    : (data?.assetProfile?.ro || data?.assetProfile?.en);
  const marketCapRank = getMarketCapRank(symbol, infoClass, rawRank, effectiveMarketCap);

  return (
    <div className="space-y-0 animate-fade-in">

      {/* ═══════════════════════════════════════════════════════════════════
          ZONE 1 — Sticky Compact Header
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="asset-header-sticky px-4 sm:px-6 py-3 mb-4 -mx-4 lg:-mx-8">
        <div className="flex flex-col gap-2.5 max-w-[1600px] mx-auto sm:flex-row sm:items-center sm:justify-between sm:gap-3">

          {/* Left: Back + Asset Identity + Price */}
          <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:gap-3">
            <button
              onClick={onBack}
              className="p-2 rounded-lg text-slate-400 hover:text-cyan-300 hover:bg-white/[0.04] transition-all shrink-0"
              title="Înapoi la Scanner"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 sm:flex-nowrap">
              {marketCapRank !== null && (
                <span
                  className="px-1.5 py-0.5 rounded-md border border-cyan-500/30 bg-cyan-500/10 font-mono text-[11px] font-bold text-cyan-300 shrink-0"
                  title={`Locul #${marketCapRank} în clasamentul după Market Cap`}
                >
                  #{marketCapRank}
                </span>
              )}
              <span className="text-sm font-bold text-slate-100 font-mono shrink-0">
                ${symbol}
              </span>
              <span className="text-sm text-slate-400 font-sans truncate hidden sm:inline">
                {data?.info?.name || symbol}
              </span>
              <span className="text-sm font-bold text-slate-100 font-mono shrink-0">
                ${formatPrice(quote?.price)}
              </span>
              <span className={`text-xs font-bold font-mono shrink-0 ${quote?.change24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {quote?.change24h >= 0 ? `+${quote?.change24h}%` : `${quote?.change24h}%`}
              </span>
              {quote?.changeYtd !== undefined && (
                <span className={`text-[11px] font-mono font-semibold px-2 py-0.5 rounded-md border shrink-0 hidden md:inline-flex items-center gap-1 ${
                  quote.changeYtd >= 0 
                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' 
                    : 'bg-rose-500/10 text-rose-300 border-rose-500/20'
                }`}>
                  <span className="text-slate-400 font-normal">YTD:</span>
                  <span>{quote.changeYtd >= 0 ? `+${quote.changeYtd}%` : `${quote.changeYtd}%`}</span>
                </span>
              )}
              {effectiveMarketCap > 0 && (
                <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-md border shrink-0 sm:hidden inline-flex items-center gap-1 border-white/[0.08] bg-white/[0.03] text-slate-300">
                  <span className="text-slate-400 font-normal">MCap:</span>
                  <span className="font-bold text-cyan-300">{formatMarketCap(effectiveMarketCap)}</span>
                </span>
              )}
            </div>

            {/* Bias Badge with Flip Tooltip */}
            <div className="relative shrink-0 hidden sm:block">
              <button
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-semibold border transition-all ${biasBorderColor} bg-white/[0.03]`}
                onMouseEnter={() => setShowFlipTooltip(true)}
                onMouseLeave={() => setShowFlipTooltip(false)}
                onClick={() => setShowFlipTooltip(prev => !prev)}
              >
                <span className={`w-2 h-2 rounded-full ${biasDotColor}`}></span>
                <span className={biasColor}>{biasLabel}</span>
                <span className="text-slate-400">{forceScore > 0 ? `+${forceScore}` : forceScore}</span>
              </button>

              {/* Flip Timer Tooltip */}
              {showFlipTooltip && (
                <div className="absolute top-full left-0 mt-2 z-50 w-64 p-3 rounded-xl bg-background-card border border-white/[0.08] shadow-elevated font-mono text-xs space-y-1.5 animate-fade-in">
                  <div className="flex items-center gap-1.5 text-slate-300">
                    <span className="text-[10px] uppercase tracking-wider text-slate-500">Flip ({timeframe.toUpperCase()})</span>
                  </div>
                  <div className={`font-semibold ${biasColor}`}>
                    {formatFlipAge(currentTfSignal?.transitionTime)}
                  </div>
                  {flipTimeFormatted && (
                    <div className="text-slate-500 text-[11px]">
                      Confirmat: {flipTimeFormatted}
                    </div>
                  )}
                  <div className="text-slate-500 text-[11px]">
                    Tier: {currentTfSignal?.tier || 'Neutral'}
                  </div>
                </div>
              )}
            </div>

            {/* Market Cap Badge (where the red arrow points in the screenshot!) */}
            {effectiveMarketCap > 0 && (
              <div
                className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-semibold border border-white/[0.08] bg-white/[0.03] text-slate-300 shrink-0"
                title={`Capitalizare de piață: $${effectiveMarketCap.toLocaleString('en-US')}`}
              >
                <span className="text-slate-500 font-normal text-[10px] uppercase">MCap:</span>
                <span className="font-bold text-cyan-300">{formatMarketCap(effectiveMarketCap)}</span>
              </div>
            )}
          </div>

          {/* Right: Timeframe pills + Actions */}
          <div className="flex w-full min-w-0 items-center gap-1.5 sm:w-auto sm:shrink-0 sm:gap-2">
            {/* Timeframe pills */}
            <div className="flex min-w-0 flex-1 items-center rounded-lg border border-white/[0.06] bg-white/[0.03] p-0.5 sm:flex-none">
              {(['1h', '4h', '8h', '1d', '1w', '1m'] as Timeframe[]).map((tf) => (
                <button
                  key={tf}
                  onClick={() => onTimeframeChange(tf)}
                  className={`min-w-0 flex-1 px-1.5 py-1 text-[10px] font-mono rounded-md transition-all sm:flex-none sm:px-2.5 sm:text-[11px] ${
                    timeframe === tf
                      ? 'bg-cyan-500/15 text-cyan-300 font-bold'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {tf.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Action icons */}
            {resolvedMarketClass === 'crypto' && (
              <a
                href={coinGeckoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.08] text-[10px] font-bold text-emerald-200 hover:bg-emerald-500/[0.14] transition-all"
                title={resolvedCoinGeckoId ? 'Deschide pagina exactă CoinGecko' : 'Caută activul pe CoinGecko'}
              >
                CoinGecko <ExternalLink className="w-3 h-3" />
              </a>
            )}
            <button
              onClick={() => onToggleWatchlist(symbol)}
              className={`shrink-0 p-1.5 sm:p-2 rounded-lg transition-all ${
                isInWatchlist
                  ? 'text-amber-300 hover:bg-amber-500/10'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.04]'
              }`}
              title={isInWatchlist ? 'Scoate din Watchlist' : 'Adaugă în Watchlist'}
            >
              <Star className={`w-4 h-4 ${isInWatchlist ? 'fill-amber-300' : ''}`} />
            </button>

            <button
              onClick={handleSendAlert}
              className={`shrink-0 p-1.5 sm:p-2 rounded-lg transition-all ${
                alertSent
                  ? 'text-emerald-400 bg-emerald-500/10'
                  : 'text-slate-500 hover:text-cyan-300 hover:bg-white/[0.04]'
              }`}
              title={alertSent ? 'Alertă trimisă!' : 'Trimite alertă Telegram'}
            >
              <BellRing className="w-4 h-4" />
            </button>

            <button
              onClick={loadData}
              className="shrink-0 p-1.5 sm:p-2 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/[0.04] transition-all"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Mobile: Bias badge row (visible only on small screens) */}
        <div className="flex items-center gap-2 mt-2 sm:hidden max-w-[1600px] mx-auto">
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-semibold border ${biasBorderColor} bg-white/[0.03]`}>
            <span className={`w-2 h-2 rounded-full ${biasDotColor}`}></span>
            <span className={biasColor}>{biasLabel} {forceScore > 0 ? `+${forceScore}` : forceScore}</span>
          </div>
          <span className="text-[11px] text-slate-500 font-mono">
            {formatFlipAge(currentTfSignal?.transitionTime)}
          </span>
          <button
            onClick={() => setChartTab('tv_embed')}
            title="Deschide graficul TradingView extern"
            className={`ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold whitespace-nowrap transition-all ${
              chartTab === 'tv_embed'
                ? 'border-blue-500/50 bg-blue-500/20 text-blue-100'
                : 'border-blue-500/30 bg-blue-500/[0.08] text-blue-200 hover:bg-blue-500/[0.16]'
            }`}
          >
            TradingView <ExternalLink className="h-3 w-3 shrink-0" />
          </button>
        </div>
        <AssetExternalLinks
          showTradingView={false}
          className="mt-2 max-w-[1600px] mx-auto"
          symbol={symbol}
          marketClass={resolvedMarketClass}
          coinGeckoId={resolvedCoinGeckoId}
          protocolSlugs={data?.businessQuality?.asset?.protocolSlugs}
          contractAddress={data?.dexMarket?.contractAddress}
          narrative={data?.businessQuality?.asset?.narrative || cryptoFundamentals.get(symbol.toUpperCase())?.narrative}
          language={language}
        />
      </div>


      {/* ═══════════════════════════════════════════════════════════════════
          ZONE 2 — Chart Full-Bleed
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="mb-5">
        <InteractiveChart
          candles={data?.candles || []}
          symbol={symbol}
          marketClass={marketClass || data?.info?.marketClass}
          assetQuoteCurrency={data?.info?.quoteCurrency}
          timeframe={timeframe}
          onTimeframeChange={onTimeframeChange}
          onLoadMoreHistory={loadOlderHistory}
          isLoadingHistory={loadingOlderHistory}
          hasMoreHistory={hasMoreHistory}
          coinGeckoUrl={resolvedMarketClass === 'crypto' ? coinGeckoUrl : undefined}
          activeTab={chartTab}
          onActiveTabChange={setChartTab}
        />
      </div>


      {/* ═══════════════════════════════════════════════════════════════════
          ZONE 3 — Tabbed Info Panels
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="bg-background-card/60 rounded-xl border border-white/[0.04] overflow-hidden">

        {/* Tab Navigation */}
        <div className="tab-nav overflow-x-auto px-1">
          <button
            className={`tab-item ${activeInfoTab === 'ai' ? 'tab-active' : ''}`}
            onClick={() => setActiveInfoTab('ai')}
          >
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              Analiză AI
            </span>
          </button>
          <button
            className={`tab-item ${activeInfoTab === 'mtf' ? 'tab-active' : ''}`}
            onClick={() => setActiveInfoTab('mtf')}
          >
            <span className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" />
              Multi-Timeframe
            </span>
          </button>
          <button
            className={`tab-item ${activeInfoTab === 'social' ? 'tab-active' : ''}`}
            onClick={() => setActiveInfoTab('social')}
          >
            <span className="flex items-center gap-1.5">
              <Newspaper className="w-3.5 h-3.5" />
              Știri & Social
            </span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-5" key={activeInfoTab}>
          <div className="tab-content-enter">

            {/* ─── TAB: AI Analysis & Economic Forward Guidance ─── */}
            {activeInfoTab === 'ai' && (
              <div className="space-y-6">
                {/* 0. 📘 PROFIL ACTIV, CE FACE & ISTORIC */}
                <AssetProfileOverviewCard
                  symbol={symbol}
                  name={data?.info?.name || explanation?.assetName}
                  category={data?.info?.category || explanation?.sectorOrNarrative || data?.businessQuality?.asset?.narrative || cryptoFundamentals.get(symbol.toUpperCase())?.narrative}
                  marketClass={resolvedMarketClass}
                  coinGeckoId={resolvedCoinGeckoId}
                  instinctTake={profileTake}
                />

                <OnchainDataCard data={data?.onchain} />

                {data?.businessQuality && !(explanation && resolvedMarketClass === 'crypto') && <BusinessQualityAssetCard businessQuality={data.businessQuality} language={language} />}

                {explanation ? (
                  <>
                    {/* 1. 🎯 GHID DE INVESTIȚIE & VERDICT STRATEGIC */}
                    <div className="p-4 sm:p-5 rounded-[30px] bg-[var(--t-surface)] border border-cyan-500/30 shadow-xl space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/[0.06]">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300">
                            <Target className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-bold text-slate-100 font-sans">Ghid de Investiție & Verdict AI</h3>
                              {explanation.sectorOrNarrative && (
                                <span className="px-2 py-0.5 rounded-md bg-white/[0.05] border border-white/[0.08] text-[10px] font-mono text-cyan-300">
                                  {explanation.sectorOrNarrative}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-400 font-sans mt-0.5">
                              {explanation.investmentGuidance?.verdictLabelRo || 'Analiză strategică bazată pe fundamente economice și impuls Money Line.'}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className={`px-3 py-1.5 rounded-xl text-xs font-mono font-black border tracking-wide uppercase shadow-sm ${
                            (explanation.investmentGuidance?.verdict === 'Strong Buy' || explanation.overallBias.includes('Bullish'))
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-glow-emerald'
                              : ((explanation.investmentGuidance?.verdict === 'Trim / Caution' || explanation.overallBias.includes('Bearish'))
                                ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 shadow-glow-rose'
                                : 'bg-amber-500/20 text-amber-300 border-amber-500/40')
                          }`}>
                            {explanation.investmentGuidance?.verdict || explanation.overallBias}
                          </span>
                          {explanation.investmentGuidance?.targetHorizon && (
                            <span className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[11px] font-mono text-slate-300">
                              <Calendar className="w-3 h-3 text-cyan-400" />
                              <span>{explanation.investmentGuidance.targetHorizon}</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {guideTake && (
                        <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.08] space-y-2">
                          <p className="text-[10px] font-mono text-slate-500">
                            {guideTake.source === 'instinct-agent' ? 'Instinct' : 'AI Gateway'} · {guideTake.model} · {new Date(guideTake.generatedAt).toLocaleDateString(language === 'ro' ? 'ro-RO' : 'en-GB')}
                          </p>
                          <h4 className="text-sm font-bold text-slate-50 font-sans">{guideTake.headline}</h4>
                          {guideTake.paragraphs.map((paragraph, index) => (
                            <p key={index} className="text-xs text-slate-300 leading-relaxed font-sans">{paragraph}</p>
                          ))}
                          {guideTake.bullets && guideTake.bullets.length > 0 && (
                            <ul className="list-disc pl-4 space-y-1 text-xs text-slate-300 font-sans">
                              {guideTake.bullets.map((bullet, index) => <li key={index}>{bullet}</li>)}
                            </ul>
                          )}
                        </div>
                      )}

                      {/* Recommended Action Card */}
                      {explanation.investmentGuidance?.recommendedAction && (
                        <div className="p-3.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-xs text-cyan-200 leading-relaxed font-sans flex items-start gap-2.5">
                          <Lightbulb className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                          <div>
                            <strong className="text-cyan-300">Recomandare Acțiune: </strong>
                            <span>{explanation.investmentGuidance.recommendedAction}</span>
                          </div>
                        </div>
                      )}

                      {/* 2 Columns: Why Invest vs Key Risks */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                        {/* Why Invest */}
                        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 space-y-2.5">
                          <h4 className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 font-mono">
                            <CheckCircle2 className="w-4 h-4" /> De ce merită investit (Catalizatori)
                          </h4>
                          <ul className="space-y-2">
                            {(explanation.investmentGuidance?.whyInvest || explanation.bullishCatalysts).map((item: string, i: number) => (
                              <li key={i} className="flex items-start gap-2 text-xs text-slate-200 leading-relaxed font-sans">
                                <span className="text-emerald-400 font-bold mt-0.5 shrink-0">✓</span>
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* Key Risks */}
                        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 space-y-2.5">
                          <h4 className="text-xs font-bold text-rose-400 flex items-center gap-1.5 font-mono">
                            <AlertTriangle className="w-4 h-4" /> Riscuri Specifice de Monitorizat
                          </h4>
                          <ul className="space-y-2">
                            {(explanation.investmentGuidance?.keyRisks || explanation.downsideRisks).map((risk: string, i: number) => (
                              <li key={i} className="flex items-start gap-2 text-xs text-slate-200 leading-relaxed font-sans">
                                <span className="text-rose-400 font-bold mt-0.5 shrink-0">✕</span>
                                <span>{risk}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>

                    {/* 2. 🔮 PERSPECTIVĂ & FORWARD ECONOMIC */}
                    {explanation.economicForward && (
                      <div className="p-4 sm:p-5 rounded-[30px] bg-white/[0.02] border border-white/[0.06] space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-cyan-400" />
                            <h3 className="text-sm font-bold text-slate-100 font-sans">Perspectivă & Forward Economic ({explanation.assetName || symbol})</h3>
                          </div>
                          <span className="text-[11px] font-mono text-slate-400">
                            Analiză Sectorială & Macro
                          </span>
                        </div>

                        <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-sans bg-[var(--t-surface-raised)] p-3.5 rounded-xl border border-white/[0.04]">
                          {explanation.economicForward.industryOutlook}
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                          {/* Growth Catalysts */}
                          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] space-y-2">
                            <span className="text-[11px] font-bold text-cyan-300 font-mono flex items-center gap-1">
                              <span>⚡</span> Catalizatori de Creștere
                            </span>
                            <ul className="space-y-1.5">
                              {explanation.economicForward.growthCatalysts.map((c: string, i: number) => (
                                <li key={i} className="text-[11px] text-slate-300 leading-snug flex items-start gap-1.5">
                                  <span className="text-cyan-400 shrink-0">•</span>
                                  <span>{c}</span>
                                </li>
                              ))}
                            </ul>
                          </div>

                          {/* Macro Tailwinds */}
                          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] space-y-2">
                            <span className="text-[11px] font-bold text-emerald-300 font-mono flex items-center gap-1">
                              <span>🌤️</span> Vânturi Macro Favorabile
                            </span>
                            <ul className="space-y-1.5">
                              {explanation.economicForward.macroTailwinds.map((t: string, i: number) => (
                                <li key={i} className="text-[11px] text-slate-300 leading-snug flex items-start gap-1.5">
                                  <span className="text-emerald-400 shrink-0">•</span>
                                  <span>{t}</span>
                                </li>
                              ))}
                            </ul>
                          </div>

                          {/* Macro Headwinds */}
                          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] space-y-2">
                            <span className="text-[11px] font-bold text-amber-300 font-mono flex items-center gap-1">
                              <span>🌧️</span> Presiuni & Vânturi Contrare
                            </span>
                            <ul className="space-y-1.5">
                              {explanation.economicForward.macroHeadwinds.map((h: string, i: number) => (
                                <li key={i} className="text-[11px] text-slate-300 leading-snug flex items-start gap-1.5">
                                  <span className="text-amber-400 shrink-0">•</span>
                                  <span>{h}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 3. 📊 REZUMAT ULTIMELE RAPOARTE ECONOMICE & FINANCIARE */}
                    {explanation.recentReports && explanation.recentReports.length > 0 && (
                      <div className="p-4 sm:p-5 rounded-[30px] bg-white/[0.02] border border-white/[0.06] space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-emerald-400" />
                            <h3 className="text-sm font-bold text-slate-100 font-sans">Sinteză Ultimele Rapoarte Economice & Financiare</h3>
                          </div>
                          <span className="text-[11px] font-mono text-emerald-400/80 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                            Rezultate Oficiale
                          </span>
                        </div>

                        <div className="space-y-3">
                          {explanation.recentReports.map((report: any, idx: number) => (
                            <div key={idx} className="p-3.5 rounded-xl bg-[var(--t-surface-raised)] border border-white/[0.05] space-y-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <h4 className="text-xs font-bold text-slate-100 font-mono flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                                  <span>{report.title}</span>
                                </h4>
                                <span className="text-[10px] font-mono text-slate-400 px-2 py-0.5 rounded bg-white/[0.04]">
                                  {report.period}
                                </span>
                              </div>

                              <p className="text-xs text-slate-300 leading-relaxed font-sans">
                                {report.summary}
                              </p>

                              {/* KPI Metric Badges */}
                              {report.metrics && report.metrics.length > 0 && (
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                                  {report.metrics.map((m: any, mIdx: number) => (
                                    <div key={mIdx} className={`p-2 rounded-lg border flex flex-col ${
                                      m.sentiment === 'positive'
                                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                                        : (m.sentiment === 'negative'
                                          ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                                          : 'bg-white/[0.03] border-white/[0.06] text-slate-300')
                                    }`}>
                                      <span className="text-[9px] text-slate-400 font-mono uppercase">{m.label}</span>
                                      <span className="text-xs font-bold font-mono mt-0.5">{m.value}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 4. 🛡️ TEZĂ TEHNICĂ & SUPORT / REZISTENȚĂ */}
                    <div className="p-4 sm:p-5 rounded-[30px] bg-white/[0.02] border border-white/[0.06] space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Compass className="w-4 h-4 text-cyan-400" />
                          <h3 className="text-sm font-bold text-slate-100 font-sans">Teză Tehnică & Niveluri S/R</h3>
                        </div>
                        <span className="text-[11px] font-mono text-slate-400">
                          {(explanation.confidence * 100).toFixed(0)}% încredere tehnică
                        </span>
                      </div>

                      <p className="text-xs text-slate-300 leading-relaxed font-sans">
                        {explanation.technicalThesis}
                      </p>

                      {/* S/R Inline Widget */}
                      <div className="flex flex-wrap items-center justify-between gap-2 py-2.5 px-3.5 rounded-xl bg-[var(--t-surface-raised)] border border-white/[0.05] font-mono text-xs">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1.5">
                            <span className="text-emerald-400/70">S2</span>
                            <span className="text-emerald-300 font-semibold">${explanation.keySupportResistance.supportLevels[1]}</span>
                          </div>
                          <span className="text-slate-700">|</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-emerald-400/70">S1</span>
                            <span className="text-emerald-300 font-semibold">${explanation.keySupportResistance.supportLevels[0]}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-500/15 border border-cyan-500/30">
                          <span className="text-cyan-300 font-bold">
                            Preț: ${formatPrice(quote?.price)}
                          </span>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1.5">
                            <span className="text-rose-400/70">R1</span>
                            <span className="text-rose-300 font-semibold">${explanation.keySupportResistance.resistanceLevels[0]}</span>
                          </div>
                          <span className="text-slate-700">|</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-rose-400/70">R2</span>
                            <span className="text-rose-300 font-semibold">${explanation.keySupportResistance.resistanceLevels[1]}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 5. 🛡️ CRYPTO BUSINESS QUALITY · 4 CRITERIA */}
                    <CryptoBusinessQualityCard
                      coinGeckoId={resolvedCoinGeckoId}
                      symbol={symbol}
                      marketClass={resolvedMarketClass}
                    />

                    {/* 6. 🏆 STOCK BUSINESS QUALITY & PROFITABILITY */}
                    <StockBusinessQualityCard
                      symbol={symbol}
                      marketClass={resolvedMarketClass}
                    />
                  </>
                ) : (
                  <p className="text-sm text-slate-500 font-mono">Analiza AI detaliată se generează în fundal pentru acest asset.</p>
                )}
              </div>
            )}


            {/* ─── TAB: Multi-Timeframe Matrix ─── */}
            {activeInfoTab === 'mtf' && (
              <div className="space-y-4">
                {/* Composite Score Summary */}
                {data?.multiTimeframe && (
                  <div className="flex items-center justify-between text-xs font-mono mb-3">
                    <span className="text-slate-400">Confluență compozită:</span>
                    <span className={`px-2.5 py-1 rounded-lg font-semibold border ${
                      data.multiTimeframe.confluenceTier?.includes('Bullish')
                        ? 'text-emerald-300 border-emerald-500/20 bg-emerald-500/5'
                        : (data.multiTimeframe.confluenceTier?.includes('Bearish')
                          ? 'text-rose-300 border-rose-500/20 bg-rose-500/5'
                          : 'text-slate-300 border-slate-700 bg-slate-800/50')
                    }`}>
                      {data.multiTimeframe.confluenceTier} ({data.multiTimeframe.compositeMtfScore > 0 ? `+${data.multiTimeframe.compositeMtfScore}` : data.multiTimeframe.compositeMtfScore})
                    </span>
                  </div>
                )}

                {/* Compact 6-Column Grid */}
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {['1h', '4h', '8h', '1d', '1w', '1m'].map((tf) => {
                    const mtfSignal = data?.multiTimeframe?.[tf as keyof typeof data.multiTimeframe] as any;
                    const tfIsBull = mtfSignal?.tier?.includes('Bullish');
                    const tfIsBear = mtfSignal?.tier?.includes('Bearish');
                    const rawRoi = mtfSignal?.roiPercent !== undefined
                      ? mtfSignal.roiPercent
                      : (mtfSignal?.rawIndicators?.roc9 !== undefined ? Number(mtfSignal.rawIndicators.roc9.toFixed(2)) : 0);
                    const isRoiPos = rawRoi > 0;
                    const isRoiNeg = rawRoi < 0;

                    const borderLeft = tfIsBull
                      ? 'border-l-emerald-400'
                      : (tfIsBear ? 'border-l-rose-400' : 'border-l-slate-600');

                    return (
                      <button
                        key={tf}
                        onClick={() => onTimeframeChange(tf as Timeframe)}
                        className={`text-left p-3 rounded-lg border-l-2 transition-all ${borderLeft} ${
                          timeframe === tf
                            ? 'bg-cyan-500/[0.07] border border-r border-t border-b border-cyan-500/20'
                            : 'bg-white/[0.02] border border-r border-t border-b border-white/[0.04] hover:bg-white/[0.04]'
                        }`}
                        title={`ROI: ${isRoiPos ? '+' : ''}${rawRoi}% | RVOL: ${mtfSignal?.rawIndicators?.rvol ? `${mtfSignal.rawIndicators.rvol}x` : '1.0x'}`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[11px] font-mono font-bold text-slate-300 uppercase">{tf}</span>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            tfIsBull ? 'bg-emerald-400' : (tfIsBear ? 'bg-rose-400' : 'bg-slate-600')
                          }`}></span>
                        </div>
                        <div className={`text-sm font-bold font-mono ${
                          tfIsBull ? 'text-emerald-300' : (tfIsBear ? 'text-rose-300' : 'text-slate-400')
                        }`}>
                          {mtfSignal?.score > 0 ? `+${mtfSignal.score}` : (mtfSignal?.score !== undefined ? mtfSignal.score : '–')}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                          {mtfSignal?.tier?.replace('Strong ', 'S.') || 'Neutral'}
                        </div>
                        {/* ROI inline subtle */}
                        <div className={`text-[10px] font-mono mt-1 ${
                          isRoiPos ? 'text-emerald-400/70' : (isRoiNeg ? 'text-rose-400/70' : 'text-slate-600')
                        }`}>
                          {isRoiPos ? `+${rawRoi}%` : `${rawRoi}%`}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}


            {/* ─── TAB: News & Social (Unified Feed) ─── */}
            {activeInfoTab === 'social' && (
              <div className="space-y-0 divide-y divide-white/[0.04]">
                {unifiedFeed.length > 0 ? (
                  unifiedFeed.map((item: any, idx: number) => (
                    <div key={item.id || idx} className="py-3.5 first:pt-0 last:pb-0">
                      {item._type === 'news' ? (
                        /* News Item */
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-start gap-3 group"
                        >
                          <Newspaper className="w-4 h-4 text-slate-600 mt-0.5 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[10px] font-mono font-semibold text-cyan-400/70 uppercase">{item.source}</span>
                              {item.sentiment && (
                                <span className="text-[10px] font-mono text-emerald-400/60">{item.sentiment}</span>
                              )}
                            </div>
                            <h4 className="text-sm text-slate-200 group-hover:text-cyan-300 transition-colors leading-snug line-clamp-2 font-sans">
                              {item.title}
                            </h4>
                            <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">{item.summary}</p>
                          </div>
                          <ExternalLink className="w-3 h-3 text-slate-700 group-hover:text-cyan-400 mt-1 shrink-0 transition-colors" />
                        </a>
                      ) : (
                        /* Social/X Post */
                        <div className="flex items-start gap-3">
                          <Twitter className="w-4 h-4 text-[#1DA1F2]/40 mt-0.5 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className="text-xs font-semibold text-slate-200 font-mono">{item.authorName}</span>
                              <BadgeCheck className="w-3 h-3 text-cyan-500/50" />
                              <span className="text-[11px] text-slate-600 font-mono">{item.authorHandle}</span>
                            </div>
                            <p className="text-sm text-slate-300 leading-relaxed line-clamp-3 font-sans">
                              {item.text}
                            </p>
                            <div className="flex items-center gap-4 mt-1.5 text-[10px] font-mono text-slate-600">
                              <span>❤️ {item.likes?.toLocaleString() || item.likeCount?.toLocaleString()}</span>
                              <span>🔁 {item.reposts?.toLocaleString() || item.repostCount?.toLocaleString()}</span>
                              <a
                                href={item.url || `https://x.com/search?q=%24${symbol}&f=live`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[#1DA1F2]/50 hover:text-[#1DA1F2] transition-colors flex items-center gap-0.5"
                              >
                                Citește pe X <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500 font-mono py-4">Nu există știri sau postări recente pentru ${symbol}.</p>
                )}

                {/* Search on X link */}
                <div className="pt-3">
                  <a
                    href={`https://x.com/search?q=%24${symbol}&f=live`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-cyan-400 transition-colors font-mono"
                  >
                    Caută ${symbol} pe X <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
};
