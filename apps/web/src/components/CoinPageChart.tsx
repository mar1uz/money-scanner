import React, { useEffect, useRef, useState } from 'react';
import { fetchChartMarket } from '../services/api.js';
import type { Timeframe } from '../types.js';

export type CoinChartMarketResolver = (symbol: string, marketClass?: string, coinGeckoId?: string) => Promise<{ tvSymbol: string | null }>;

export type CoinChartMode = 'loading' | 'tv' | 'geckoterminal' | 'fallback';

// DexScreener chain ids that GeckoTerminal names differently.
const GECKO_NETWORK_ALIAS: Record<string, string> = {
  ethereum: 'eth',
  polygon: 'polygon_pos',
  avalanche: 'avax',
  cronos: 'cro',
  fantom: 'ftm',
  klaytn: 'klay-token',
  hyperliquid: 'hyperevm'
};

const TV_INTERVAL: Record<string, string> = { '1h': '60', '4h': '240', '8h': '480', '1d': 'D', '1w': 'W' };
const GT_RESOLUTION: Record<string, string> = { '1h': '1h', '4h': '4h', '8h': '4h', '1d': '1d', '1w': '1d' };

export interface CoinChartDexInfo {
  pairAddress: string;
  chainId: string;
  pairIsDust?: boolean;
}

/** Real interactive chart for the coin page: TradingView widget when the
 * server resolves an exchange symbol, otherwise the GeckoTerminal embed of
 * the primary DEX pool, otherwise the caller's fallback chart. */
export const CoinPageChart: React.FC<{
  symbol: string;
  marketClass: string;
  coinGeckoId?: string;
  timeframe: Timeframe;
  language: string;
  dex?: CoinChartDexInfo | null;
  fallbackTitle: string;
  fallbackSubtitle: string;
  fallback: React.ReactNode;
  resolver?: CoinChartMarketResolver;
}> = ({ symbol, marketClass, coinGeckoId, timeframe, language, dex, fallbackTitle, fallbackSubtitle, fallback, resolver }) => {
  const gtNetwork = dex && !dex.pairIsDust && dex.pairAddress && dex.chainId
    ? (GECKO_NETWORK_ALIAS[dex.chainId] || dex.chainId)
    : null;
  const gtPool = gtNetwork ? dex!.pairAddress : null;
  const [resolution, setResolution] = useState<{ mode: CoinChartMode; tvSymbol: string | null }>({ mode: 'loading', tvSymbol: null });
  const tvContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (marketClass !== 'crypto') {
      setResolution({ mode: 'fallback', tvSymbol: null });
      return;
    }
    let cancelled = false;
    setResolution({ mode: 'loading', tvSymbol: null });
    (resolver || fetchChartMarket)(symbol, marketClass, coinGeckoId)
      .then(result => {
        if (cancelled) return;
        if (result.tvSymbol) setResolution({ mode: 'tv', tvSymbol: result.tvSymbol });
        else setResolution({ mode: gtPool ? 'geckoterminal' : 'fallback', tvSymbol: null });
      })
      .catch(() => { if (!cancelled) setResolution({ mode: gtPool ? 'geckoterminal' : 'fallback', tvSymbol: null }); });
    return () => { cancelled = true; };
  }, [symbol, marketClass, coinGeckoId, gtNetwork, gtPool, resolver]);

  // Official TradingView widget embed.
  useEffect(() => {
    if (resolution.mode !== 'tv' || !resolution.tvSymbol || !tvContainerRef.current) return;
    const container = tvContainerRef.current;
    const uniqueId = `tv_coin_${symbol.replace(/[^a-zA-Z0-9]/g, '_')}`;
    container.innerHTML = `<div id="${uniqueId}" style="height:100%;width:100%"></div>`;
    const theme = (document.documentElement.dataset.theme || 'dark').startsWith('l') ? 'light' : 'dark';
    const init = () => {
      if (!(window as any).TradingView) return;
      new (window as any).TradingView.widget({
        autosize: true,
        symbol: resolution.tvSymbol,
        interval: TV_INTERVAL[timeframe] || 'D',
        timezone: 'Etc/UTC',
        theme,
        style: '1',
        locale: language === 'ro' ? 'ro' : 'en',
        enable_publishing: false,
        allow_symbol_change: false,
        hide_side_toolbar: true,
        withdateranges: true,
        details: false,
        hotlist: false,
        calendar: false,
        container_id: uniqueId
      });
    };
    if ((window as any).TradingView) {
      init();
      return;
    }
    const existingScript = document.getElementById('tradingview-widget-script');
    if (existingScript) {
      const poll = window.setInterval(() => {
        if ((window as any).TradingView) {
          window.clearInterval(poll);
          init();
        }
      }, 200);
      return () => window.clearInterval(poll);
    }
    const script = document.createElement('script');
    script.id = 'tradingview-widget-script';
    script.src = 'https://s3.tradingview.com/tv.js';
    script.async = true;
    script.onload = init;
    document.body.appendChild(script);
  }, [resolution.mode, resolution.tvSymbol, timeframe, symbol, language]);

  const isLight = typeof document !== 'undefined' && (document.documentElement.dataset.theme || 'dark').startsWith('l');
  const title = resolution.mode === 'tv'
    ? `Grafic live · TradingView ${resolution.tvSymbol}`
    : resolution.mode === 'geckoterminal'
      ? 'Grafic live DEX · GeckoTerminal'
      : fallbackTitle;
  const subtitle = resolution.mode === 'tv'
    ? 'Grafic interactiv cu lumânări reale de pe piața cu lichiditate, furnizat de TradingView.'
    : resolution.mode === 'geckoterminal'
      ? 'Grafic interactiv din pool-ul DEX principal, selectat după lichiditate (GeckoTerminal).'
      : fallbackSubtitle;

  return <div className="rounded-[30px] border border-white/10 bg-[var(--t-surface)] p-5 sm:p-6">
    <h2 className="font-semibold text-white">{title}</h2>
    <p className="mt-1 text-xs text-slate-400">{subtitle}</p>
    {resolution.mode === 'loading'
      ? <div className="mt-4 flex h-[420px] w-full items-center justify-center rounded-2xl border border-white/5 text-xs text-slate-500">Se încarcă graficul…</div>
      : resolution.mode === 'tv'
        ? <div ref={tvContainerRef} className="mt-4 h-[420px] w-full overflow-hidden rounded-2xl border border-white/5" />
        : resolution.mode === 'geckoterminal' && gtNetwork && gtPool
          ? <iframe
              key={`${gtNetwork}:${gtPool}:${timeframe}`}
              title={`Grafic GeckoTerminal ${symbol}`}
              src={`https://www.geckoterminal.com/${gtNetwork}/pools/${gtPool}?embed=1&info=0&swaps=0&grayscale=0&light_chart=${isLight ? '1' : '0'}&chart_type=price&resolution=${GT_RESOLUTION[timeframe] || '1d'}`}
              className="mt-4 h-[420px] w-full rounded-2xl border border-white/5"
              loading="lazy"
            />
          : fallback}
  </div>;
};
