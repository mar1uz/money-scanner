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
  MousePointer,
  Minus,
  Maximize2,
  Trash2,
  Undo2,
  Sliders,
  Layers
} from 'lucide-react';

interface InteractiveChartProps {
  candles: Candle[];
  symbol: string;
  timeframe: string;
  onTimeframeChange?: (tf: Timeframe) => void;
}

export type DrawingTool = 'select' | 'trendline' | 'fibonacci' | 'horizontal' | 'ruler';

export interface ChartDrawing {
  id: string;
  type: 'trendline' | 'fibonacci' | 'horizontal' | 'ruler';
  p1: { timeIndex: number; price: number };
  p2?: { timeIndex: number; price: number };
  color?: string;
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
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  const [activeTab, setActiveTab] = useState<'chart' | 'pinescript'>('chart');
  const [activeInterval, setActiveInterval] = useState<string>(timeframe);
  const [copiedPine, setCopiedPine] = useState(false);
  const [latestState, setLatestState] = useState<{ status: string; fastLine: number; slowLine: number } | null>(null);

  // Drawing Tools State
  const [activeTool, setActiveTool] = useState<DrawingTool>('select');
  const [drawings, setDrawings] = useState<ChartDrawing[]>([]);
  const [currentStart, setCurrentStart] = useState<{ timeIndex: number; price: number; x: number; y: number } | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number; price: number } | null>(null);
  const [, setRenderTrigger] = useState(0); // Trigger SVG re-renders on scroll/zoom

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

  // Pine Script v6 exact source code
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

  // Render TradingView Lightweight Charts with MoneyLine Overlay Force v1
  useEffect(() => {
    if (activeTab !== 'chart' || !chartContainerRef.current || !candles || candles.length === 0) {
      return;
    }

    const container = chartContainerRef.current;
    container.innerHTML = '';

    const chart = createChart(container, {
      width: container.clientWidth,
      height: 480,
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
        vertLine: {
          color: '#38bdf8',
          width: 1,
          style: 3
        },
        horzLine: {
          color: '#38bdf8',
          width: 1,
          style: 3
        }
      },
      rightPriceScale: {
        borderColor: '#1e293b',
        scaleMargins: {
          top: 0.1,
          bottom: 0.2
        }
      },
      timeScale: {
        borderColor: '#1e293b',
        timeVisible: true,
        secondsVisible: false
      }
    });

    chartInstanceRef.current = chart;

    // 1. Add Candlestick Series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#f43f5e',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#f43f5e'
    });
    candleSeriesRef.current = candleSeries;

    // 2. Add Volume Histogram Series
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: '#06b6d4',
      priceFormat: {
        type: 'volume'
      },
      priceScaleId: '' // overlay on separate scale
    });

    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0
      }
    });

    // Calculate MoneyLine Overlay Force v1
    const moneyLine = calculateMoneyLineForce(candles, activeInterval);

    // Format candle and volume data
    const formattedCandles = candles.map((c, idx) => {
      const timeInSec = Math.floor(c.timestamp / 1000);
      return {
        time: (timeInSec + idx * 60) as any, // ensure strictly unique ascending time
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

    // 3. Fast Supertrend Line (Baza Nor)
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

    // 4. Slow Supertrend Line (Margine Nor)
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

    // 5. Add BUY and SELL Signal Markers
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

    // Set latest state metrics
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

    // Fit content & subscribe to range changes for SVG overlay synchronization
    chart.timeScale().fitContent();
    chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
      setRenderTrigger(prev => prev + 1);
    });

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
        setRenderTrigger(prev => prev + 1);
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartInstanceRef.current = null;
      candleSeriesRef.current = null;
    };
  }, [activeTab, candles, activeInterval, symbol]);

  // Convert (timeIndex, price) to pixel coordinates (x, y)
  const getCoordinates = (timeIndex: number, price: number) => {
    if (!chartInstanceRef.current || !candleSeriesRef.current || !candles || candles.length === 0) {
      return null;
    }
    const idx = Math.max(0, Math.min(candles.length - 1, timeIndex));
    const c = candles[idx];
    const timeInSec = Math.floor(c.timestamp / 1000) + idx * 60;
    const x = chartInstanceRef.current.timeScale().timeToCoordinate(timeInSec as any);
    const y = candleSeriesRef.current.priceToCoordinate(price);

    if (x === null || y === null) return null;
    return { x, y };
  };

  // Convert pixel coordinates (x, y) to (timeIndex, price)
  const getPointFromPixels = (x: number, y: number) => {
    if (!chartInstanceRef.current || !candleSeriesRef.current || !candles || candles.length === 0) {
      return null;
    }
    const time = chartInstanceRef.current.timeScale().coordinateToTime(x) as number;
    const price = candleSeriesRef.current.coordinateToPrice(y) as number;

    if (time === null || price === null) return null;

    // Find closest candle index
    let closestIdx = 0;
    let minDiff = Infinity;
    candles.forEach((c, idx) => {
      const timeInSec = Math.floor(c.timestamp / 1000) + idx * 60;
      const diff = Math.abs(timeInSec - time);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = idx;
      }
    });

    return { timeIndex: closestIdx, price: Number(price.toFixed(4)) };
  };

  // Handle drawing mouse interactions
  const handleOverlayPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (activeTool === 'select') return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const pt = getPointFromPixels(x, y);
    if (!pt) return;

    if (activeTool === 'horizontal') {
      const newDrawing: ChartDrawing = {
        id: `h_${Date.now()}`,
        type: 'horizontal',
        p1: { timeIndex: pt.timeIndex, price: pt.price }
      };
      setDrawings(prev => [...prev, newDrawing]);
      setActiveTool('select');
      return;
    }

    if (!currentStart) {
      // First point of 2-point drawing
      setCurrentStart({ timeIndex: pt.timeIndex, price: pt.price, x, y });
    } else {
      // Second point: finalize drawing
      const newDrawing: ChartDrawing = {
        id: `${activeTool}_${Date.now()}`,
        type: activeTool as any,
        p1: { timeIndex: currentStart.timeIndex, price: currentStart.price },
        p2: { timeIndex: pt.timeIndex, price: pt.price }
      };
      setDrawings(prev => [...prev, newDrawing]);
      setCurrentStart(null);
      setActiveTool('select');
    }
  };

  const handleOverlayPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const pt = getPointFromPixels(x, y);
    if (pt) {
      setMousePos({ x, y, price: pt.price });
    }
  };

  const handleUndo = () => {
    setDrawings(prev => prev.slice(0, -1));
  };

  const handleClearAll = () => {
    setDrawings([]);
    setCurrentStart(null);
  };

  const handleCopyPineScript = () => {
    navigator.clipboard.writeText(pineScriptCode);
    setCopiedPine(true);
    setTimeout(() => setCopiedPine(false), 3000);
  };

  // Helper to map symbol to TradingView symbol with exchange prefix
  const getTradingViewSymbol = (sym: string) => {
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
  };

  const isStockOrMetal = ['SPACEX', 'NVDA', 'TSLA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'PLTR', 'AMD', 'MSTR', 'COIN', 'SPY', 'QQQ', 'XAU', 'XAG', 'OIL', 'COPPER'].includes(symbol.toUpperCase());
  const quoteCurrency = isStockOrMetal ? 'USD' : 'USDT';

  const tvExternalUrl = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(getTradingViewSymbol(symbol))}&interval=${
    activeInterval === '1h' ? '60' : (activeInterval === '4h' ? '240' : (activeInterval === '8h' ? '480' : (activeInterval === '1d' ? 'D' : (activeInterval === '1w' ? 'W' : 'M'))))
  }`;

  return (
    <div className="w-full bg-background-surface/90 rounded-2xl p-4 border border-background-border shadow-2xl space-y-4">
      {/* Chart Navigation & Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-background-border">
        {/* Navigation Mode */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-background-card/90 border border-background-border rounded-xl p-1 shadow-inner">
            <button
              onClick={() => setActiveTab('chart')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-mono rounded-lg transition-all ${
                activeTab === 'chart'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold shadow-glow-emerald'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Zap className="w-3.5 h-3.5 text-emerald-400" />
              <span>MoneyLine Overlay Force v1</span>
            </button>

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
            href={tvExternalUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Open in Official TradingView with your Account"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 transition-all shadow-sm"
          >
            <BarChart2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Open in TradingView</span>
            <ExternalLink className="w-3 h-3 text-slate-400" />
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
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold shadow-glow-emerald'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Tab 1: TradingView Chart with Interactive Drawing Suite */}
      {activeTab === 'chart' && (
        <div className="space-y-3">
          {/* Real-time Indicator Status Bar */}
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

          {/* Chart Workspace with Floating Technical Drawing Dock */}
          <div className="relative w-full rounded-2xl overflow-hidden bg-background-card border border-background-border flex">
            {/* Left-side Floating Technical Drawing Toolbar (TradingView Style) */}
            <div className="absolute left-3 top-3 z-30 flex flex-col gap-1.5 p-1.5 bg-background-card/95 backdrop-blur-md border border-background-border rounded-xl shadow-2xl">
              {/* Select Tool */}
              <button
                type="button"
                onClick={() => { setActiveTool('select'); setCurrentStart(null); }}
                title="Cursor / Select (Navigare)"
                className={`p-2 rounded-lg transition-all ${
                  activeTool === 'select'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-glow-cyan'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <MousePointer className="w-4 h-4" />
              </button>

              {/* Trendline Tool */}
              <button
                type="button"
                onClick={() => { setActiveTool('trendline'); setCurrentStart(null); }}
                title="Linie de Trend (Apasă pe 2 puncte)"
                className={`p-2 rounded-lg transition-all ${
                  activeTool === 'trendline'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-glow-emerald'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <TrendingUp className="w-4 h-4" />
              </button>

              {/* Fibonacci Tool */}
              <button
                type="button"
                onClick={() => { setActiveTool('fibonacci'); setCurrentStart(null); }}
                title="Fibonacci Retracement (Apasă pe High & Low)"
                className={`p-2 rounded-lg transition-all ${
                  activeTool === 'fibonacci'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-glow-gold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Layers className="w-4 h-4" />
              </button>

              {/* Horizontal Support/Resistance Level */}
              <button
                type="button"
                onClick={() => { setActiveTool('horizontal'); setCurrentStart(null); }}
                title="Nivel Orizontal Suport/Rezistență"
                className={`p-2 rounded-lg transition-all ${
                  activeTool === 'horizontal'
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-glow-cyan'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Minus className="w-4 h-4" />
              </button>

              {/* Measurement Ruler */}
              <button
                type="button"
                onClick={() => { setActiveTool('ruler'); setCurrentStart(null); }}
                title="Riglă de Măsurare Preț & % Procent"
                className={`p-2 rounded-lg transition-all ${
                  activeTool === 'ruler'
                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 shadow-glow-cyan'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Maximize2 className="w-4 h-4" />
              </button>

              <div className="h-px bg-slate-800 my-0.5" />

              {/* Undo Button */}
              <button
                type="button"
                onClick={handleUndo}
                disabled={drawings.length === 0}
                title="Anulează Ultimul Desen"
                className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 disabled:opacity-30 transition-colors"
              >
                <Undo2 className="w-4 h-4" />
              </button>

              {/* Clear All Drawings Button */}
              <button
                type="button"
                onClick={handleClearAll}
                disabled={drawings.length === 0}
                title="Șterge Toate Desenele"
                className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 disabled:opacity-30 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            {/* Drawing Tool Status Indicator Pill */}
            {activeTool !== 'select' && (
              <div className="absolute top-3 left-16 z-30 px-3 py-1.5 rounded-xl bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 font-mono text-xs flex items-center gap-2 shadow-glow-cyan animate-pulse">
                <Sparkles className="w-3.5 h-3.5" />
                <span>
                  {activeTool === 'trendline' && (currentStart ? 'Apasă al doilea punct pentru a finaliza Linia de Trend' : 'Selectează punctul de pornire al Trendline-ului')}
                  {activeTool === 'fibonacci' && (currentStart ? 'Apasă al doilea punct (High/Low) pentru nivelurile Fibonacci' : 'Selectează primul punct Fibonacci')}
                  {activeTool === 'horizontal' && 'Apasă oriunde pe grafic pentru a plasa Nivelul Orizontal'}
                  {activeTool === 'ruler' && (currentStart ? 'Apasă al doilea punct pentru a măsura procentul și variația' : 'Apasă primul punct de măsurare')}
                </span>
                <button
                  onClick={() => { setActiveTool('select'); setCurrentStart(null); }}
                  className="text-slate-400 hover:text-slate-100 ml-1 font-bold"
                >
                  ✕
                </button>
              </div>
            )}

            {/* TradingView Lightweight Chart Canvas Viewport */}
            <div ref={chartContainerRef} className="w-full h-[480px]" />

            {/* High-Performance SVG Drawing Overlay Layer */}
            <svg
              className={`absolute inset-0 w-full h-[480px] z-20 ${
                activeTool !== 'select' ? 'cursor-crosshair' : 'pointer-events-none'
              }`}
              onPointerDown={handleOverlayPointerDown}
              onPointerMove={handleOverlayPointerMove}
            >
              {/* Render Saved Drawings */}
              {drawings.map(d => {
                const c1 = getCoordinates(d.p1.timeIndex, d.p1.price);
                const c2 = d.p2 ? getCoordinates(d.p2.timeIndex, d.p2.price) : null;

                if (!c1) return null;

                // 1. Horizontal Ray / Level
                if (d.type === 'horizontal') {
                  return (
                    <g key={d.id}>
                      <line
                        x1="0"
                        y1={c1.y}
                        x2="100%"
                        y2={c1.y}
                        stroke="#a855f7"
                        strokeWidth="1.5"
                        strokeDasharray="4 4"
                      />
                      <rect
                        x="10"
                        y={c1.y - 10}
                        width="80"
                        height="20"
                        rx="4"
                        fill="#581c87"
                        stroke="#a855f7"
                        strokeWidth="1"
                      />
                      <text
                        x="50"
                        y={c1.y + 4}
                        fill="#f3e8ff"
                        textAnchor="middle"
                        fontFamily="monospace"
                        fontSize="10"
                        fontWeight="bold"
                      >
                        ${d.p1.price < 1 ? d.p1.price.toFixed(4) : d.p1.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </text>
                    </g>
                  );
                }

                if (!c2 || !d.p2) return null;

                // 2. Trend Line
                if (d.type === 'trendline') {
                  return (
                    <g key={d.id}>
                      <line
                        x1={c1.x}
                        y1={c1.y}
                        x2={c2.x}
                        y2={c2.y}
                        stroke="#06b6d4"
                        strokeWidth="2.5"
                      />
                      <circle cx={c1.x} cy={c1.y} r="4.5" fill="#06b6d4" stroke="#080c14" strokeWidth="2" />
                      <circle cx={c2.x} cy={c2.y} r="4.5" fill="#06b6d4" stroke="#080c14" strokeWidth="2" />
                    </g>
                  );
                }

                // 3. Fibonacci Retracement Levels
                if (d.type === 'fibonacci') {
                  const fibLevels = [
                    { level: 0.0, label: '0.0% (Base)', color: '#94a3b8' },
                    { level: 0.236, label: '23.6%', color: '#f43f5e' },
                    { level: 0.382, label: '38.2%', color: '#fb923c' },
                    { level: 0.5, label: '50.0% (Mid)', color: '#38bdf8' },
                    { level: 0.618, label: '61.8% (Golden Pocket)', color: '#fbbf24' },
                    { level: 0.786, label: '78.6%', color: '#34d399' },
                    { level: 1.0, label: '100.0% (Target)', color: '#c084fc' }
                  ];

                  const priceDiff = d.p2.price - d.p1.price;
                  const minX = Math.min(c1.x, c2.x);
                  const maxX = Math.max(c1.x, c2.x) + 300;

                  return (
                    <g key={d.id}>
                      {/* Trendline anchor connector */}
                      <line
                        x1={c1.x}
                        y1={c1.y}
                        x2={c2.x}
                        y2={c2.y}
                        stroke="#64748b"
                        strokeWidth="1"
                        strokeDasharray="3 3"
                      />
                      {fibLevels.map(fib => {
                        const levelPrice = d.p1.price + priceDiff * fib.level;
                        const coords = getCoordinates(d.p1.timeIndex, levelPrice);
                        if (!coords) return null;

                        return (
                          <g key={fib.level}>
                            <line
                              x1={minX}
                              y1={coords.y}
                              x2={maxX}
                              y2={coords.y}
                              stroke={fib.color}
                              strokeWidth={fib.level === 0.618 ? '2' : '1.2'}
                              strokeDasharray={fib.level === 0.618 ? 'none' : '4 2'}
                              opacity={0.85}
                            />
                            <text
                              x={minX + 8}
                              y={coords.y - 4}
                              fill={fib.color}
                              fontFamily="monospace"
                              fontSize="10"
                              fontWeight="bold"
                            >
                              {fib.label} — ${levelPrice < 1 ? levelPrice.toFixed(4) : levelPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </text>
                          </g>
                        );
                      })}
                    </g>
                  );
                }

                // 4. Measurement Ruler
                if (d.type === 'ruler') {
                  const left = Math.min(c1.x, c2.x);
                  const top = Math.min(c1.y, c2.y);
                  const width = Math.abs(c2.x - c1.x);
                  const height = Math.abs(c2.y - c1.y);
                  const priceDiff = d.p2.price - d.p1.price;
                  const pct = ((d.p2.price - d.p1.price) / d.p1.price) * 100;
                  const isUp = pct >= 0;

                  return (
                    <g key={d.id}>
                      <rect
                        x={left}
                        y={top}
                        width={width}
                        height={height}
                        fill={isUp ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)'}
                        stroke={isUp ? '#10b981' : '#f43f5e'}
                        strokeWidth="1.5"
                        strokeDasharray="4 4"
                      />
                      <rect
                        x={left + width / 2 - 60}
                        y={top + height / 2 - 12}
                        width="120"
                        height="24"
                        rx="6"
                        fill="#080c14"
                        stroke={isUp ? '#10b981' : '#f43f5e'}
                        strokeWidth="1"
                      />
                      <text
                        x={left + width / 2}
                        y={top + height / 2 + 4}
                        fill={isUp ? '#34d399' : '#fb7185'}
                        textAnchor="middle"
                        fontFamily="monospace"
                        fontSize="10"
                        fontWeight="bold"
                      >
                        {isUp ? `+${pct.toFixed(2)}%` : `${pct.toFixed(2)}%`} (${priceDiff > 0 ? `+${priceDiff.toFixed(2)}` : priceDiff.toFixed(2)})
                      </text>
                    </g>
                  );
                }

                return null;
              })}

              {/* Active Drawing Preview (Rubberband) */}
              {currentStart && mousePos && (
                <g>
                  {activeTool === 'trendline' && (
                    <line
                      x1={currentStart.x}
                      y1={currentStart.y}
                      x2={mousePos.x}
                      y2={mousePos.y}
                      stroke="#06b6d4"
                      strokeWidth="2"
                      strokeDasharray="3 3"
                    />
                  )}
                  {activeTool === 'fibonacci' && (
                    <g>
                      <line
                        x1={currentStart.x}
                        y1={currentStart.y}
                        x2={mousePos.x}
                        y2={mousePos.y}
                        stroke="#fbbf24"
                        strokeWidth="1.5"
                        strokeDasharray="4 4"
                      />
                      <line
                        x1={Math.min(currentStart.x, mousePos.x)}
                        y1={mousePos.y}
                        x2={Math.max(currentStart.x, mousePos.x) + 200}
                        y2={mousePos.y}
                        stroke="#fbbf24"
                        strokeWidth="1.5"
                      />
                    </g>
                  )}
                  {activeTool === 'ruler' && (
                    <rect
                      x={Math.min(currentStart.x, mousePos.x)}
                      y={Math.min(currentStart.y, mousePos.y)}
                      width={Math.abs(mousePos.x - currentStart.x)}
                      height={Math.abs(mousePos.y - currentStart.y)}
                      fill="rgba(56, 189, 248, 0.15)"
                      stroke="#38bdf8"
                      strokeWidth="1.5"
                      strokeDasharray="4 4"
                    />
                  )}
                </g>
              )}
            </svg>
          </div>

          {/* Money Line Indicator Legend & Tool Guidance */}
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
            <div className="flex items-center gap-2 text-cyan-300">
              <Sliders className="w-3.5 h-3.5" />
              <span>Instrumente Active: Linie de Trend, Fibonacci Retracement, Nivel Orizontal, Riglă %</span>
            </div>
          </div>
        </div>
      )}

      {/* Main Tab 2: Pine Script v6 Source Code */}
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
