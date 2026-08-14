import React, { useState, useEffect, useRef } from 'react';
import { Candle, Timeframe } from '../types.js';
import {
  createChart,
  createSeriesMarkers,
  IChartApi,
  ISeriesApi,
  ColorType,
  CrosshairMode,
  CandlestickSeries,
  LineSeries,
  HistogramSeries
} from 'lightweight-charts';
import {
  Zap,
  TrendingUp,
  Activity,
  Copy,
  Check,
  Code,
  Sparkles,
  ExternalLink,
  Info,
  BarChart2,
  Sliders,
  Layers,
  Maximize2
} from 'lucide-react';

interface InteractiveChartProps {
  candles: Candle[];
  symbol: string;
  timeframe: string;
  onTimeframeChange?: (tf: Timeframe) => void;
}

// Map ticker to official TradingView exchange and pair
export function getTradingViewSymbol(sym: string): string {
  const s = sym.toUpperCase();
  if (['NVDA', 'TSLA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'AMD', 'PLTR', 'QQQ'].includes(s)) {
    return `NASDAQ:${s}`;
  }
  if (['SPY', 'MSTR', 'COIN'].includes(s)) {
    return `NYSE:${s}`;
  }
  if (s === 'XAU') return 'TVC:GOLD';
  if (s === 'XAG') return 'TVC:SILVER';
  if (s === 'OIL') return 'TVC:USOIL';
  if (s === 'COPPER') return 'CAPITALCOM:COPPER';
  if (s === 'SPACEX') return 'NASDAQ:ARKX';
  return `BINANCE:${s}USDT`;
}

export function mapTimeframeToTv(tf: string): string {
  const t = tf.toLowerCase();
  if (t === '1h') return '60';
  if (t === '4h') return '240';
  if (t === '8h') return '480';
  if (t === '1d') return 'D';
  if (t === '1w') return 'W';
  if (t === '1m') return 'M';
  return '60';
}

// Exact MoneyLine Overlay Force v1 Mathematical Computation
export function calculateMoneyLineForce(candles: Candle[], timeframe: string) {
  if (!candles || candles.length === 0) {
    return {
      lineFast: [],
      dirFast: [],
      lineSlow: [],
      dirSlow: [],
      cloudColor: [],
      buySignals: [],
      sellSignals: []
    };
  }

  // --- Parametri Adaptabili (Logică Cloud) ---
  let f_fast = 2.0;
  let f_slow = 3.0;
  let atr_len = 10;

  const tf = timeframe.toLowerCase();
  if (tf === '1h') {
    f_fast = 2.2;
    f_slow = 3.0;
    atr_len = 12;
  } else if (tf === '4h' || tf === '1d') {
    f_fast = 2.5;
    f_slow = 3.5;
    atr_len = 10;
  } else if (tf === '1w' || tf === '1m') {
    f_fast = 2.8;
    f_slow = 3.8;
    atr_len = 10;
  }

  // Calculate True Range and Wilder's RMA ATR
  const tr: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      tr.push(candles[i].high - candles[i].low);
    } else {
      const hl = candles[i].high - candles[i].low;
      const hc = Math.abs(candles[i].high - candles[i - 1].close);
      const lc = Math.abs(candles[i].low - candles[i - 1].close);
      tr.push(Math.max(hl, hc, lc));
    }
  }

  const atr: number[] = [];
  let sum = 0;
  for (let i = 0; i < atr_len && i < tr.length; i++) sum += tr[i];
  let prevAtr = sum / Math.max(1, Math.min(atr_len, tr.length));
  for (let i = 0; i < tr.length; i++) {
    if (i < atr_len) {
      atr.push(prevAtr);
    } else {
      const curAtr = (prevAtr * (atr_len - 1) + tr[i]) / atr_len;
      atr.push(curAtr);
      prevAtr = curAtr;
    }
  }

  // Standard Supertrend algorithm (ta.supertrend)
  const calcSupertrend = (multiplier: number) => {
    const line: number[] = [];
    const dir: number[] = []; // -1 = Up (Bullish), +1 = Down (Bearish)

    let upperBand = 0;
    let lowerBand = 0;
    let currentDir = 1;

    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      const curAtr = atr[i] || (c.high - c.low);
      const hl2 = (c.high + c.low) / 2;

      const basicUpper = hl2 + multiplier * curAtr;
      const basicLower = hl2 - multiplier * curAtr;

      if (i === 0) {
        upperBand = basicUpper;
        lowerBand = basicLower;
        currentDir = c.close > basicUpper ? -1 : 1;
      } else {
        const prevClose = candles[i - 1].close;
        const prevLower = lowerBand;
        const prevUpper = upperBand;

        lowerBand = (basicLower > prevLower || prevClose < prevLower) ? basicLower : prevLower;
        upperBand = (basicUpper < prevUpper || prevClose > prevUpper) ? basicUpper : prevUpper;

        if (currentDir === 1 && c.close > prevUpper) {
          currentDir = -1; // Bullish flip
        } else if (currentDir === -1 && c.close < prevLower) {
          currentDir = 1; // Bearish flip
        }
      }

      const val = currentDir === -1 ? lowerBand : upperBand;
      line.push(Number(val.toFixed(2)));
      dir.push(currentDir);
    }

    return { line, dir };
  };

  const fast = calcSupertrend(f_fast);
  const slow = calcSupertrend(f_slow);

  // Buy & Sell signal identification (ta.change(dirSlow))
  const buySignals: boolean[] = [];
  const sellSignals: boolean[] = [];

  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      buySignals.push(false);
      sellSignals.push(false);
    } else {
      const prevDirSlow = slow.dir[i - 1];
      const curDirSlow = slow.dir[i];
      buySignals.push(curDirSlow === -1 && prevDirSlow === 1);
      sellSignals.push(curDirSlow === 1 && prevDirSlow === -1);
    }
  }

  return {
    lineFast: fast.line,
    dirFast: fast.dir,
    lineSlow: slow.line,
    dirSlow: slow.dir,
    buySignals,
    sellSignals
  };
}

export const InteractiveChart: React.FC<InteractiveChartProps> = ({
  candles,
  symbol,
  timeframe,
  onTimeframeChange
}) => {
  const tvWidgetContainerRef = useRef<HTMLDivElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);

  const [activeTab, setActiveTab] = useState<'tv_official' | 'moneyline_cloud' | 'pinescript'>('tv_official');
  const [activeInterval, setActiveInterval] = useState<string>(timeframe);
  const [copiedPine, setCopiedPine] = useState(false);
  const [latestState, setLatestState] = useState<{ status: string; fastLine: number; slowLine: number } | null>(null);

  useEffect(() => {
    setActiveInterval(timeframe);
  }, [timeframe]);

  const intervalOptions: { id: Timeframe; label: string }[] = [
    { id: '1h', label: '1H' },
    { id: '4h', label: '4H' },
    { id: '8h', label: '8H' },
    { id: '1d', label: '1D' },
    { id: '1w', label: '1W' },
    { id: '1m', label: '1M' }
  ];

  const isStockOrMetal = ['SPACEX', 'NVDA', 'TSLA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'PLTR', 'AMD', 'MSTR', 'COIN', 'SPY', 'QQQ', 'XAU', 'XAG', 'OIL', 'COPPER'].includes(symbol.toUpperCase());
  const quoteCurrency = isStockOrMetal ? 'USD' : 'USDT';
  const tvSymbol = getTradingViewSymbol(symbol);

  // 1. Official TradingView Advanced Widget with ALL Official Drawing Tools & Native Indicators
  useEffect(() => {
    if (activeTab !== 'tv_official' || !tvWidgetContainerRef.current) {
      return;
    }

    const container = tvWidgetContainerRef.current;
    const uniqueId = `tv_chart_${symbol}_${Math.random().toString(36).substring(7)}`;
    container.innerHTML = `<div id="${uniqueId}" style="height: 560px; width: 100%;"></div>`;

    const tvInterval = mapTimeframeToTv(activeInterval);

    const initWidget = () => {
      if ((window as any).TradingView) {
        new (window as any).TradingView.widget({
          autosize: true,
          symbol: tvSymbol,
          interval: tvInterval,
          timezone: 'Etc/UTC',
          theme: 'dark',
          style: '1',
          locale: 'en',
          toolbar_bg: '#080c14',
          enable_publishing: false,
          allow_symbol_change: true,
          container_id: uniqueId,
          withdateranges: true,
          hide_side_toolbar: false, // SHOW ALL OFFICIAL TRADINGVIEW DRAWING TOOLS!
          details: true,
          hotlist: true,
          calendar: true,
          studies: [
            'Supertrend@tv-basicstudies',
            'MASimple@tv-basicstudies'
          ],
          studies_overrides: {},
          disabled_features: [],
          enabled_features: [
            'study_templates',
            'use_localstorage_for_settings',
            'show_object_tree',
            'drawing_templates'
          ]
        });
      }
    };

    if (!(window as any).TradingView) {
      const script = document.createElement('script');
      script.id = 'tradingview-widget-script';
      script.src = 'https://s3.tradingview.com/tv.js';
      script.async = true;
      script.onload = initWidget;
      document.body.appendChild(script);
    } else {
      initWidget();
    }
  }, [activeTab, symbol, activeInterval, tvSymbol]);

  // 2. Proprietary MoneyLine Overlay Force v1 Cloud Visualizer
  useEffect(() => {
    if (activeTab !== 'moneyline_cloud' || !chartContainerRef.current || !candles || candles.length === 0) {
      return;
    }

    const container = chartContainerRef.current;
    container.innerHTML = '';

    const chart = createChart(container, {
      width: container.clientWidth,
      height: 540,
      layout: {
        background: { type: ColorType.Solid, color: '#080c14' },
        textColor: '#94a3b8'
      },
      grid: {
        vertLines: { color: 'rgba(30, 41, 59, 0.4)' },
        horzLines: { color: 'rgba(30, 41, 59, 0.4)' }
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#38bdf8', width: 1, style: 3 },
        horzLine: { color: '#38bdf8', width: 1, style: 3 }
      },
      rightPriceScale: {
        borderColor: '#1e293b',
        scaleMargins: { top: 0.1, bottom: 0.2 }
      },
      timeScale: {
        borderColor: '#1e293b',
        timeVisible: true,
        secondsVisible: false
      }
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#f43f5e',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#f43f5e'
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: '#06b6d4',
      priceFormat: { type: 'volume' },
      priceScaleId: ''
    });

    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 }
    });

    const moneyLine = calculateMoneyLineForce(candles, activeInterval);

    const formattedCandles = candles.map((c, idx) => {
      const timeInSec = Math.floor(c.timestamp / 1000);
      return {
        time: (timeInSec + idx * 60) as any,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close
      };
    });

    const formattedVolume = candles.map((c, idx) => {
      const isUp = c.close >= c.open;
      const timeInSec = Math.floor(c.timestamp / 1000);
      return {
        time: (timeInSec + idx * 60) as any,
        value: c.volume,
        color: isUp ? 'rgba(16, 185, 129, 0.25)' : 'rgba(244, 63, 94, 0.25)'
      };
    });

    candleSeries.setData(formattedCandles);
    volumeSeries.setData(formattedVolume);

    const fastLineSeries = chart.addSeries(LineSeries, {
      color: '#10b981',
      lineWidth: 2,
      title: 'MoneyLine Baza Nor',
      priceLineVisible: false
    });

    const formattedFastLine = moneyLine.lineFast.map((val, idx) => {
      const timeInSec = Math.floor(candles[idx].timestamp / 1000);
      const isBull = moneyLine.dirFast[idx] < 0;
      return {
        time: (timeInSec + idx * 60) as any,
        value: val,
        color: isBull ? '#10b981' : '#f43f5e'
      };
    });
    fastLineSeries.setData(formattedFastLine);

    const slowLineSeries = chart.addSeries(LineSeries, {
      color: '#059669',
      lineWidth: 1,
      lineStyle: 2,
      title: 'MoneyLine Margine Nor',
      priceLineVisible: false
    });

    const formattedSlowLine = moneyLine.lineSlow.map((val, idx) => {
      const timeInSec = Math.floor(candles[idx].timestamp / 1000);
      const isBull = moneyLine.dirSlow[idx] < 0;
      return {
        time: (timeInSec + idx * 60) as any,
        value: val,
        color: isBull ? 'rgba(16, 185, 129, 0.7)' : 'rgba(244, 63, 94, 0.7)'
      };
    });
    slowLineSeries.setData(formattedSlowLine);

    const markers: any[] = [];
    candles.forEach((c, idx) => {
      const timeInSec = Math.floor(c.timestamp / 1000) + idx * 60;
      if (moneyLine.buySignals[idx]) {
        markers.push({
          time: timeInSec,
          position: 'belowBar',
          color: '#10b981',
          shape: 'arrowUp',
          text: 'BUY',
          size: 2
        });
      } else if (moneyLine.sellSignals[idx]) {
        markers.push({
          time: timeInSec,
          position: 'aboveBar',
          color: '#f43f5e',
          shape: 'arrowDown',
          text: 'SELL',
          size: 2
        });
      }
    });

    if (markers.length > 0) {
      createSeriesMarkers(candleSeries, markers);
    }

    const lastIdx = candles.length - 1;
    if (lastIdx >= 0) {
      const isBullFast = moneyLine.dirFast[lastIdx] < 0;
      const isBullSlow = moneyLine.dirSlow[lastIdx] < 0;
      setLatestState({
        status: isBullFast && isBullSlow ? 'BULLISH' : (!isBullFast && !isBullSlow ? 'BEARISH' : 'TRANSITION'),
        fastLine: moneyLine.lineFast[lastIdx] || 0,
        slowLine: moneyLine.lineSlow[lastIdx] || 0
      });
    }

    chart.timeScale().fitContent();

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [activeTab, candles, activeInterval, symbol]);

  const handleCopyPineScript = () => {
    navigator.clipboard.writeText(pineScriptCode);
    setCopiedPine(true);
    setTimeout(() => setCopiedPine(false), 3000);
  };

  const pineScriptCode = `//@version=6
indicator("MoneyLine Overlay Force v1", overlay=true, precision=2)

// --- Parametri Adaptabili (Logică Cloud) ---
get_cloud_params() =>
    float f_fast = 2.0
    float f_slow = 3.0
    int atr_len = 10
    
    if timeframe.isminutes
        if timeframe.multiplier < 15
            f_fast  := 1.8
            f_slow  := 2.6
            atr_len := 14
        else if timeframe.multiplier < 60
            f_fast  := 2.2
            f_slow  := 3.0
            atr_len := 12
    else if timeframe.isdaily
        f_fast  := 2.5
        f_slow  := 3.5
        atr_len := 10
        
    [f_fast, f_slow, atr_len]

[fastFactor, slowFactor, atrLen] = get_cloud_params()

useAuto = input.bool(true, title="Adaptare Automată?")
manualAtr = input.int(10, title="Manual: ATR Length", minval=1)
manualFast = input.float(2.0, title="Manual: Multiplicator Rapid", step=0.1)
manualSlow = input.float(3.0, title="Manual: Multiplicator Lent", step=0.1)

finalAtr   = useAuto ? atrLen : manualAtr
finalFast  = useAuto ? fastFactor : manualFast
finalSlow  = useAuto ? slowFactor : manualSlow

// --- Calculul celor două linii din care se formează Norul ---
[lineFast, dirFast] = ta.supertrend(finalFast, finalAtr)
[lineSlow, dirSlow] = ta.supertrend(finalSlow, finalAtr)

// --- Plotare Linii ---
plotFast = plot(lineFast, color=dirFast < 0 ? color.new(color.green, 30) : color.new(color.red, 30), linewidth=1, title="Baza Nor")
plotSlow = plot(lineSlow, color=dirSlow < 0 ? color.new(color.green, 50) : color.new(color.red, 50), linewidth=1, title="Margine Nor")

// --- Colorare Nor ---
cloudColor = (dirFast < 0 and dirSlow < 0) ? color.new(color.green, 85) : 
             (dirFast > 0 and dirSlow > 0) ? color.new(color.red, 85) : color.new(color.gray, 90)

fill(plotFast, plotSlow, color=cloudColor, title="Money Line Cloud Fill")

// --- Semnale BUY / SELL ---
buySignal  = ta.change(dirSlow) < 0
sellSignal = ta.change(dirSlow) > 0

plotshape(buySignal, title="BUY", style=shape.triangleup, location=location.belowbar, color=color.green, size=size.small, text="BUY", textcolor=color.green)
plotshape(sellSignal, title="SELL", style=shape.triangledown, location=location.abovebar, color=color.red, size=size.small, text="SELL", textcolor=color.red)
`;

  return (
    <div className="w-full bg-background-surface/90 rounded-2xl p-4 border border-background-border shadow-2xl space-y-4">
      {/* Top Header & Chart View Selector */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-background-border">
        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-background-card/90 border border-background-border rounded-xl p-1 shadow-inner">
            {/* Tab 1: Official TradingView Advanced Widget */}
            <button
              onClick={() => setActiveTab('tv_official')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-mono rounded-lg transition-all ${
                activeTab === 'tv_official'
                  ? 'bg-gradient-to-r from-blue-500/20 to-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold shadow-glow-cyan'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <BarChart2 className="w-3.5 h-3.5 text-cyan-400" />
              <span>TradingView Oficial (Toate Instrumentele)</span>
            </button>

            {/* Tab 2: Proprietary MoneyLine Visualizer */}
            <button
              onClick={() => setActiveTab('moneyline_cloud')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-mono rounded-lg transition-all ${
                activeTab === 'moneyline_cloud'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold shadow-glow-emerald'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Zap className="w-3.5 h-3.5 text-emerald-400" />
              <span>MoneyLine Cloud Force</span>
            </button>

            {/* Tab 3: Pine Script Code */}
            <button
              onClick={() => setActiveTab('pinescript')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-mono rounded-lg transition-all ${
                activeTab === 'pinescript'
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Code className="w-3.5 h-3.5" />
              <span>Pine Script v6 Code</span>
            </button>
          </div>

          <a
            href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tvSymbol)}&interval=${mapTimeframeToTv(activeInterval)}`}
            target="_blank"
            rel="noopener noreferrer"
            title="Deschide direct pe tradingview.com"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 transition-all shadow-sm"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Deschide Tab Nou</span>
          </a>
        </div>

        {/* Timeframe Interval Controls (1H -> 1M) */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-mono text-slate-400 mr-1 hidden sm:inline">Interval:</span>
          <div className="flex items-center bg-background-card border border-background-border rounded-xl p-0.5">
            {intervalOptions.map(opt => (
              <button
                key={opt.id}
                onClick={() => {
                  setActiveInterval(opt.id);
                  if (onTimeframeChange) onTimeframeChange(opt.id);
                }}
                className={`px-3 py-1 text-xs font-mono rounded-lg transition-all ${
                  activeInterval.toLowerCase() === opt.id.toLowerCase()
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-bold shadow-glow-cyan'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Tab 1: Official TradingView Advanced Widget */}
      {activeTab === 'tv_official' && (
        <div className="space-y-3">
          {/* Status Sub-bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 bg-background-card/80 rounded-xl border border-background-border text-xs font-mono">
            <div className="flex items-center gap-3">
              <span className="font-bold text-slate-100 text-sm">{tvSymbol} ({activeInterval.toUpperCase()})</span>
              <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 text-[10px] font-bold">
                Instrumente Oficiale TradingView Active (Linie Trend, Fib, Riglă, Indicatori)
              </span>
            </div>

            <div className="flex items-center gap-2 text-slate-400 text-[11px]">
              <span>Cotație: <strong className="text-slate-200">${quoteCurrency}</strong></span>
              <span>•</span>
              <span className="text-emerald-400">Live Real-Time Feed</span>
            </div>
          </div>

          {/* Official TradingView Embedded Container */}
          <div className="w-full rounded-2xl overflow-hidden bg-background-card border border-background-border shadow-2xl">
            <div ref={tvWidgetContainerRef} className="w-full h-[560px]" />
          </div>
        </div>
      )}

      {/* Main Tab 2: Proprietary MoneyLine Overlay Force v1 */}
      {activeTab === 'moneyline_cloud' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 bg-background-card/80 rounded-xl border border-background-border text-xs font-mono">
            <div className="flex items-center gap-4">
              <span className="font-bold text-slate-100 text-sm">${symbol} / {quoteCurrency}</span>
              <div className="flex items-center gap-2">
                <span className="text-slate-400">Cloud Status:</span>
                <span className={`px-2.5 py-0.5 rounded font-bold border ${
                  latestState?.status === 'BULLISH'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-glow-emerald'
                    : (latestState?.status === 'BEARISH' ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 shadow-glow-ruby' : 'bg-slate-800 text-slate-300 border-slate-700')
                }`}>
                  {latestState?.status || 'BULLISH'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-4 text-[11px] text-slate-300">
              <span>Baza Nor (Fast): <strong className="text-emerald-400">${latestState?.fastLine ? latestState.fastLine.toFixed(2) : '-'}</strong></span>
              <span>Margine Nor (Slow): <strong className="text-slate-300">${latestState?.slowLine ? latestState.slowLine.toFixed(2) : '-'}</strong></span>
            </div>
          </div>

          <div className="relative w-full rounded-2xl overflow-hidden bg-background-card border border-background-border">
            <div ref={chartContainerRef} className="w-full h-[540px]" />
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 bg-background-card/50 rounded-xl border border-background-border text-[11px] font-mono text-slate-400">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-glow-emerald"></span> Baza Nor (Fast Supertrend)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span> Margine Nor (Slow Supertrend)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-2 rounded bg-emerald-500/40 border border-emerald-500/60"></span> MoneyLine Cloud Fill
              </span>
              <span className="flex items-center gap-1.5 text-emerald-300 font-bold">
                ▲ BUY Signal
              </span>
              <span className="flex items-center gap-1.5 text-rose-400 font-bold">
                ▼ SELL Signal
              </span>
            </div>
            <span className="text-slate-300 font-bold">Dual Supertrend Cloud Logic</span>
          </div>
        </div>
      )}

      {/* Main Tab 3: Pine Script v6 Source Code */}
      {activeTab === 'pinescript' && (
        <div className="p-4 bg-background-card rounded-xl border border-background-border space-y-4 font-mono text-xs">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-emerald-400" />
                <h3 className="font-bold text-slate-100 text-sm">MoneyLine Overlay Force v1 — Pine Script v6</h3>
              </div>
              <p className="text-slate-400 text-[11px]">
                Scriptul exact furnizat cu adaptare automată a parametrilor (1H, 4H, 8H, 1D, 1W, 1M) și colorare nor.
              </p>
            </div>

            <button
              onClick={handleCopyPineScript}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                copiedPine
                  ? 'bg-emerald-500 text-slate-950 shadow-glow-emerald'
                  : 'bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 hover:opacity-90 shadow-glow-cyan'
              }`}
            >
              {copiedPine ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copiedPine ? 'COPIED TO CLIPBOARD!' : 'COPY PINE SCRIPT'}</span>
            </button>
          </div>

          <div className="relative bg-slate-950 p-4 rounded-xl border border-slate-800 text-emerald-400/90 max-h-80 overflow-y-auto select-all">
            <pre className="text-[11px] leading-relaxed whitespace-pre-wrap">{pineScriptCode}</pre>
          </div>

          <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800 text-[11px] text-slate-400 flex items-start gap-2">
            <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <span>
              <strong>Instrucțiuni:</strong> Deschide TradingView &gt; Click pe <em>Pine Editor</em> &gt; Lipește scriptul &gt; Click <em>Add to chart</em>.
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
