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
      sma200: [],
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

  // 200 Simple Moving Average (SMA 200)
  const sma200: number[] = [];
  const smaLen = 200;
  for (let i = 0; i < candles.length; i++) {
    const windowStart = Math.max(0, i - smaLen + 1);
    let sumClose = 0;
    for (let j = windowStart; j <= i; j++) {
      sumClose += candles[j].close;
    }
    const count = i - windowStart + 1;
    sma200.push(Number((sumClose / count).toFixed(2)));
  }

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
    sma200,
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
  const svgOverlayRef = useRef<SVGSVGElement>(null);
  const tvWidgetContainerRef = useRef<HTMLDivElement>(null);
  const chartApiRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  const [activeTab, setActiveTab] = useState<'chart' | 'tv_embed' | 'pinescript'>('chart');
  const [activeInterval, setActiveInterval] = useState<string>(timeframe);
  const [copiedPine, setCopiedPine] = useState(false);
  const [latestState, setLatestState] = useState<{
    status: string;
    fastLine: number;
    slowLine: number;
    sma200: number;
    isAboveSma200: boolean;
  } | null>(null);

  // Technical Analysis Drawing Suite State
  const [activeTool, setActiveTool] = useState<DrawingTool>('select');
  const [drawings, setDrawings] = useState<ChartDrawing[]>([]);
  const [currentStart, setCurrentStart] = useState<{ x: number; y: number; timeIndex: number; price: number } | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [, setViewportTick] = useState(0); // Trigger SVG re-renders on pan/zoom

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

  // Helper to map symbol to TradingView symbol with exchange prefix
  const getTradingViewSymbol = (sym: string) => {
    const s = sym.toUpperCase().trim();
    if (s.includes(':')) return s;
    if (s === 'BTC.D' || s === 'BTCD') return 'CRYPTOCAP:BTC.D';
    if (s === 'ETH.D' || s === 'ETHD') return 'CRYPTOCAP:ETH.D';
    if (s === 'USDT.D' || s === 'USDTD') return 'CRYPTOCAP:USDT.D';
    if (s === 'TOTAL') return 'CRYPTOCAP:TOTAL';
    if (s === 'TOTAL2') return 'CRYPTOCAP:TOTAL2';
    if (s === 'TOTAL3') return 'CRYPTOCAP:TOTAL3';
    if (s === 'DXY' || s === 'DYXY') return 'TVC:DXY';
    if (s === 'VIX') return 'CBOE:VIX';
    if (s === 'US10Y' || s === 'TNX') return 'TVC:US10Y';
    if (s === 'US02Y') return 'TVC:US02Y';
    if (s === 'EURUSD' || s === 'EUR/USD') return 'FX:EURUSD';
    if (s === 'GBPUSD' || s === 'GBP/USD') return 'FX:GBPUSD';
    if (s === 'USDJPY' || s === 'USD/JPY') return 'FX:USDJPY';
    if (s === 'XAU' || s === 'GOLD') return 'TVC:GOLD';
    if (s === 'XAG' || s === 'SILVER') return 'TVC:SILVER';
    if (s === 'OIL' || s === 'USOIL') return 'TVC:USOIL';
    if (s === 'BRENT' || s === 'UKOIL') return 'TVC:UKOIL';
    if (s === 'NATGAS') return 'TVC:NATGAS';
    if (s === 'COPPER') return 'CAPITALCOM:COPPER';
    if (s === 'PLATINUM' || s === 'PL') return 'TVC:PLATINUM';
    if (s === 'PALLADIUM' || s === 'PA') return 'TVC:PALLADIUM';
    if (s === 'SPACEX') return 'NASDAQ:ARKX';
    if (['NVDA', 'TSLA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'AMD', 'PLTR', 'QQQ', 'NFLX', 'SMCI', 'ARM', 'AVGO', 'QCOM', 'INTC', 'TSM', 'ORCL', 'IBM', 'HOOD'].includes(s)) {
      return `NASDAQ:${s}`;
    }
    if (['SPY', 'MSTR', 'COIN', 'DJI', 'DIA', 'IWM', 'JPM', 'V', 'MA', 'LLY', 'XOM', 'BA'].includes(s)) {
      return `NYSE:${s}`;
    }
    if (s.endsWith('USDT') || s.endsWith('USD') || s.endsWith('BTC')) {
      return `BINANCE:${s}`;
    }
    return `BINANCE:${s}USDT`;
  };

  const isDominanceOrRatio = ['BTC.D', 'ETH.D', 'USDT.D', 'US10Y', 'US02Y'].includes(symbol.toUpperCase());
  const isStockOrMetal = ['SPACEX', 'NVDA', 'TSLA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'PLTR', 'AMD', 'MSTR', 'COIN', 'SPY', 'QQQ', 'XAU', 'XAG', 'OIL', 'COPPER', 'DXY', 'DYXY', 'VIX', 'EURUSD', 'GBPUSD', 'USDJPY', 'BRENT', 'NATGAS', 'SILVER', 'GOLD', 'PLATINUM', 'PALLADIUM'].includes(symbol.toUpperCase());
  const quoteCurrency = isDominanceOrRatio ? '%' : (isStockOrMetal ? 'USD' : 'USDT');
  const tvSymbol = getTradingViewSymbol(symbol);

  // 1. Primary Lightweight Charts Engine with MoneyLine Overlay Force v1
  useEffect(() => {
    if (activeTab !== 'chart' || !chartContainerRef.current || !candles || candles.length === 0) {
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

    chartApiRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#f43f5e',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#f43f5e'
    });
    candleSeriesRef.current = candleSeries;

    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: '#06b6d4',
      priceFormat: { type: 'volume' },
      priceScaleId: ''
    });

    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 }
    });

    // Compute MoneyLine Overlay Force v1 mathematically
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

    // Fast Supertrend Line
    const fastLineSeries = chart.addSeries(LineSeries, {
      color: '#10b981',
      lineWidth: 2,
      title: 'MoneyLine Baza Nor (Fast)',
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

    // Slow Supertrend Line (Cloud Edge)
    const slowLineSeries = chart.addSeries(LineSeries, {
      color: '#059669',
      lineWidth: 1,
      lineStyle: 2,
      title: 'MoneyLine Margine Nor (Slow)',
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

    // SMA 200 Macro Baseline
    const sma200Series = chart.addSeries(LineSeries, {
      color: '#fbbf24', // Amber/Yellow
      lineWidth: 2,
      lineStyle: 0,
      title: 'SMA 200 Macro Baseline',
      priceLineVisible: false
    });

    const formattedSma200 = moneyLine.sma200.map((val, idx) => {
      const timeInSec = Math.floor(candles[idx].timestamp / 1000);
      return {
        time: (timeInSec + idx * 60) as any,
        value: val
      };
    });
    sma200Series.setData(formattedSma200);

    // BUY and SELL Signal Triangles
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

    // Set latest state for summary header
    const lastIdx = candles.length - 1;
    if (lastIdx >= 0) {
      const isBullFast = moneyLine.dirFast[lastIdx] < 0;
      const isBullSlow = moneyLine.dirSlow[lastIdx] < 0;
      const lastSma200 = moneyLine.sma200[lastIdx] || 0;
      const lastClose = candles[lastIdx].close;
      setLatestState({
        status: isBullFast && isBullSlow ? 'BULLISH' : (!isBullFast && !isBullSlow ? 'BEARISH' : 'TRANSITION'),
        fastLine: moneyLine.lineFast[lastIdx] || 0,
        slowLine: moneyLine.lineSlow[lastIdx] || 0,
        sma200: lastSma200,
        isAboveSma200: lastClose >= lastSma200
      });
    }

    chart.timeScale().fitContent();

    // Subscribe to pan/zoom changes to keep SVG drawings locked to chart coordinates
    chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
      setViewportTick(t => t + 1);
    });

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartApiRef.current = null;
      candleSeriesRef.current = null;
    };
  }, [activeTab, candles, activeInterval, symbol]);

  // 2. Official TradingView Embed Widget (when tv_embed tab is selected)
  useEffect(() => {
    if (activeTab !== 'tv_embed' || !tvWidgetContainerRef.current) {
      return;
    }

    const container = tvWidgetContainerRef.current;
    const uniqueId = `tv_chart_${symbol}_${Math.random().toString(36).substring(7)}`;
    container.innerHTML = `<div id="${uniqueId}" style="height: 560px; width: 100%;"></div>`;

    const tvInterval = activeInterval === '1h' ? '60' : (activeInterval === '4h' ? '240' : (activeInterval === '8h' ? '480' : (activeInterval === '1d' ? 'D' : (activeInterval === '1w' ? 'W' : 'M'))));

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
          hide_side_toolbar: false,
          details: true,
          hotlist: true,
          calendar: true
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

  // --- SVG Drawing Coordinate Projection Helpers ---
  const getCoordinatesForPoint = (timeIndex: number, price: number): { x: number; y: number } | null => {
    if (!chartApiRef.current || !candleSeriesRef.current || !candles || candles.length === 0) return null;
    const validIdx = Math.max(0, Math.min(candles.length - 1, timeIndex));
    const c = candles[validIdx];
    const timeInSec = Math.floor(c.timestamp / 1000) + validIdx * 60;

    const x = chartApiRef.current.timeScale().timeToCoordinate(timeInSec as any);
    const y = candleSeriesRef.current.priceToCoordinate(price);

    if (x === null || y === null) return null;
    return { x, y };
  };

  const getPointFromMouse = (e: React.MouseEvent<SVGSVGElement>): { x: number; y: number; timeIndex: number; price: number } | null => {
    if (!svgOverlayRef.current || !chartApiRef.current || !candleSeriesRef.current || !candles || candles.length === 0) return null;
    const rect = svgOverlayRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const price = candleSeriesRef.current.coordinateToPrice(y) || candles[candles.length - 1].close;
    const timeVal = chartApiRef.current.timeScale().coordinateToTime(x) as any;

    let timeIndex = candles.length - 1;
    if (typeof timeVal === 'number') {
      const foundIdx = candles.findIndex((c, idx) => {
        const tSec = Math.floor(c.timestamp / 1000) + idx * 60;
        return tSec >= timeVal;
      });
      if (foundIdx !== -1) timeIndex = foundIdx;
    }

    return { x, y, timeIndex, price };
  };

  // SVG Mouse Event Handlers
  const handleSvgMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (activeTool === 'select') return;
    const pt = getPointFromMouse(e);
    if (!pt) return;

    if (activeTool === 'horizontal') {
      const newDrawing: ChartDrawing = {
        id: `h_${Date.now()}`,
        type: 'horizontal',
        p1: { timeIndex: pt.timeIndex, price: pt.price },
        color: '#38bdf8'
      };
      setDrawings(prev => [...prev, newDrawing]);
      setActiveTool('select');
      return;
    }

    setCurrentStart(pt);
  };

  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgOverlayRef.current) return;
    const rect = svgOverlayRef.current.getBoundingClientRect();
    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleSvgMouseUp = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!currentStart) return;
    const pt = getPointFromMouse(e);
    if (!pt) {
      setCurrentStart(null);
      return;
    }

    if (activeTool === 'trendline' || activeTool === 'fibonacci' || activeTool === 'ruler') {
      const newDrawing: ChartDrawing = {
        id: `${activeTool}_${Date.now()}`,
        type: activeTool,
        p1: { timeIndex: currentStart.timeIndex, price: currentStart.price },
        p2: { timeIndex: pt.timeIndex, price: pt.price },
        color: activeTool === 'fibonacci' ? '#fbbf24' : (activeTool === 'ruler' ? '#38bdf8' : '#06b6d4')
      };
      setDrawings(prev => [...prev, newDrawing]);
    }

    setCurrentStart(null);
    setActiveTool('select');
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

// --- Indicator Macro SMA 200 ---
sma200 = ta.sma(close, 200)
plot(sma200, color=color.new(color.yellow, 0), linewidth=2, title="SMA 200 Macro Baseline")
`;

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
              <span>MoneyLine Force v1 (Cu Nor &amp; Semnale)</span>
            </button>

            <button
              onClick={() => setActiveTab('tv_embed')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-mono rounded-lg transition-all ${
                activeTab === 'tv_embed'
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <BarChart2 className="w-3.5 h-3.5 text-blue-400" />
              <span>TradingView Iframe</span>
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
            href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tvSymbol)}&interval=${
              activeInterval === '1h' ? '60' : (activeInterval === '4h' ? '240' : (activeInterval === '8h' ? '480' : (activeInterval === '1d' ? 'D' : (activeInterval === '1w' ? 'W' : 'M'))))
            }`}
            target="_blank"
            rel="noopener noreferrer"
            title="Open in Official TradingView with your Account"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 transition-all shadow-sm"
          >
            <BarChart2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Deschide Tab TradingView</span>
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

      {/* Main Tab 1: MoneyLine TradingView Native Chart with Drawing Toolbar */}
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

            <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-300">
              <span>Baza Nor (Fast): <strong className="text-emerald-400">${latestState?.fastLine ? latestState.fastLine.toFixed(2) : '-'}</strong></span>
              <span>Margine Nor (Slow): <strong className="text-slate-300">${latestState?.slowLine ? latestState.slowLine.toFixed(2) : '-'}</strong></span>
              <span className="flex items-center gap-1.5 font-mono">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-glow-gold"></span>
                <span>SMA 200: <strong className="text-amber-300">${latestState?.sma200 ? (latestState.sma200 < 1 ? latestState.sma200.toFixed(4) : latestState.sma200.toLocaleString(undefined, { minimumFractionDigits: 2 })) : '-'}</strong></span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold border ${
                  latestState?.isAboveSma200
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                    : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                }`}>
                  {latestState?.isAboveSma200 ? '▲ Peste (Bull)' : '▼ Sub (Bear)'}
                </span>
              </span>
              <button
                onClick={handleCopyPineScript}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold transition-all ml-2"
                title="Copiază codul MoneyLine Overlay Force v1 pentru contul tău TradingView"
              >
                {copiedPine ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-emerald-400" />}
                <span>{copiedPine ? 'COPIAT!' : 'Copiază Pine Script'}</span>
              </button>
            </div>
          </div>

          {/* Chart View Container with Floating Drawing Tools & SVG Overlay */}
          <div className="relative w-full rounded-2xl overflow-hidden bg-background-card border border-background-border">
            {/* Left Floating Technical Drawing Toolbar */}
            <div className="absolute left-3 top-3 z-30 flex flex-col items-center gap-1.5 p-1.5 bg-background-card/95 backdrop-blur-md border border-background-border rounded-xl shadow-2xl">
              {/* Pointer / Cursor Mode */}
              <button
                onClick={() => { setActiveTool('select'); setCurrentStart(null); }}
                title="Cursor / Pan & Zoom"
                className={`p-2 rounded-lg transition-all ${
                  activeTool === 'select'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-glow-cyan'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <MousePointer className="w-4 h-4" />
              </button>

              <div className="w-4 h-[1px] bg-slate-800 my-0.5" />

              {/* Trendline Tool */}
              <button
                onClick={() => { setActiveTool('trendline'); setCurrentStart(null); }}
                title="Linie de Trend (Click pe start, trage și lasă)"
                className={`p-2 rounded-lg transition-all ${
                  activeTool === 'trendline'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-glow-cyan'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <TrendingUp className="w-4 h-4" />
              </button>

              {/* Fibonacci Retracement Tool */}
              <button
                onClick={() => { setActiveTool('fibonacci'); setCurrentStart(null); }}
                title="Fibonacci Retracement (Niveluri 23.6%, 38.2%, 50%, 61.8% Golden Pocket, 78.6%)"
                className={`p-2 rounded-lg transition-all ${
                  activeTool === 'fibonacci'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-glow-gold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Layers className="w-4 h-4" />
              </button>

              {/* Horizontal Support/Resistance Ray */}
              <button
                onClick={() => { setActiveTool('horizontal'); setCurrentStart(null); }}
                title="Nivel Orizontal Suport / Rezistență (Click pentru a plasa)"
                className={`p-2 rounded-lg transition-all ${
                  activeTool === 'horizontal'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-glow-cyan'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Minus className="w-4 h-4" />
              </button>

              {/* Measurement Ruler Tool */}
              <button
                onClick={() => { setActiveTool('ruler'); setCurrentStart(null); }}
                title="Riglă de Măsurat (% Variație & Diferență Preț)"
                className={`p-2 rounded-lg transition-all ${
                  activeTool === 'ruler'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-glow-cyan'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Maximize2 className="w-4 h-4" />
              </button>

              <div className="w-4 h-[1px] bg-slate-800 my-0.5" />

              {/* Undo Last Drawing */}
              <button
                onClick={handleUndo}
                disabled={drawings.length === 0}
                title="Anulează ultimul desen (Undo)"
                className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
              >
                <Undo2 className="w-4 h-4" />
              </button>

              {/* Clear All Drawings */}
              <button
                onClick={handleClearAll}
                disabled={drawings.length === 0}
                title="Șterge toate desenele"
                className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            {/* TradingView Lightweight Charts DOM Canvas */}
            <div ref={chartContainerRef} className="w-full h-[540px]" />

            {/* Synchronized Vector SVG Drawing Overlay Layer */}
            <svg
              ref={svgOverlayRef}
              onMouseDown={handleSvgMouseDown}
              onMouseMove={handleSvgMouseMove}
              onMouseUp={handleSvgMouseUp}
              className={`absolute inset-0 w-full h-full z-20 ${
                activeTool === 'select' ? 'pointer-events-none' : 'cursor-crosshair'
              }`}
            >
              {/* Render Saved User Drawings */}
              {drawings.map((d) => {
                const c1 = getCoordinatesForPoint(d.p1.timeIndex, d.p1.price);
                const c2 = d.p2 ? getCoordinatesForPoint(d.p2.timeIndex, d.p2.price) : null;
                if (!c1) return null;

                // 1. Trendline
                if (d.type === 'trendline' && c2) {
                  return (
                    <g key={d.id}>
                      <line
                        x1={c1.x}
                        y1={c1.y}
                        x2={c2.x}
                        y2={c2.y}
                        stroke={d.color || '#06b6d4'}
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                      <circle cx={c1.x} cy={c1.y} r="3.5" fill={d.color || '#06b6d4'} />
                      <circle cx={c2.x} cy={c2.y} r="3.5" fill={d.color || '#06b6d4'} />
                    </g>
                  );
                }

                // 2. Horizontal Support / Resistance Level Ray
                if (d.type === 'horizontal') {
                  return (
                    <g key={d.id}>
                      <line
                        x1={0}
                        y1={c1.y}
                        x2={2000}
                        y2={c1.y}
                        stroke={d.color || '#38bdf8'}
                        strokeWidth="1.5"
                        strokeDasharray="5 5"
                      />
                      <rect
                        x={10}
                        y={c1.y - 10}
                        width="80"
                        height="20"
                        rx="4"
                        fill="#080c14"
                        stroke={d.color || '#38bdf8'}
                        strokeWidth="1"
                      />
                      <text
                        x={50}
                        y={c1.y + 4}
                        fill="#38bdf8"
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

                // 3. Fibonacci Retracement Levels
                if (d.type === 'fibonacci' && c2 && d.p2) {
                  const fibLevels = [
                    { level: 0.0, label: '0.0% (Start)', color: '#94a3b8' },
                    { level: 0.236, label: '23.6%', color: '#38bdf8' },
                    { level: 0.382, label: '38.2%', color: '#34d399' },
                    { level: 0.5, label: '50.0%', color: '#fbbf24' },
                    { level: 0.618, label: '61.8% Golden Pocket', color: '#f59e0b' },
                    { level: 0.786, label: '78.6%', color: '#fb7185' },
                    { level: 1.0, label: '100.0% (End)', color: '#e879f9' }
                  ];

                  const priceDiff = d.p2.price - d.p1.price;
                  const startX = Math.min(c1.x, c2.x);
                  const endX = Math.max(c1.x, c2.x) + 300;

                  return (
                    <g key={d.id}>
                      <line
                        x1={c1.x}
                        y1={c1.y}
                        x2={c2.x}
                        y2={c2.y}
                        stroke="#64748b"
                        strokeWidth="1"
                        strokeDasharray="3 3"
                      />
                      {fibLevels.map((fib) => {
                        const levelPrice = d.p1.price + priceDiff * fib.level;
                        const levelY = candleSeriesRef.current?.priceToCoordinate(levelPrice);
                        if (levelY === null || levelY === undefined) return null;

                        return (
                          <g key={fib.level}>
                            <line
                              x1={startX}
                              y1={levelY}
                              x2={endX}
                              y2={levelY}
                              stroke={fib.color}
                              strokeWidth={fib.level === 0.618 ? 2 : 1}
                              strokeDasharray={fib.level === 0.618 ? undefined : '4 4'}
                              opacity={fib.level === 0.618 ? 1 : 0.8}
                            />
                            <rect
                              x={startX + 5}
                              y={levelY - 9}
                              width="135"
                              height="18"
                              rx="3"
                              fill="#080c14"
                              stroke={fib.color}
                              strokeWidth="0.8"
                            />
                            <text
                              x={startX + 10}
                              y={levelY + 3}
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
                if (d.type === 'ruler' && c2 && d.p2) {
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
            <div className="flex flex-wrap items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-glow-emerald"></span> Baza Nor (Fast Supertrend)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span> Margine Nor (Slow Supertrend)
              </span>
              <span className="flex items-center gap-1.5 text-amber-300 font-bold">
                <span className="w-3 h-1 rounded-full bg-amber-400 shadow-glow-gold"></span> SMA 200 Macro Baseline
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

      {/* Main Tab 2: TradingView Official Embed Iframe */}
      {activeTab === 'tv_embed' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 bg-background-card/80 rounded-xl border border-background-border text-xs font-mono">
            <div className="flex items-center gap-3">
              <span className="font-bold text-slate-100 text-sm">{tvSymbol} ({activeInterval.toUpperCase()})</span>
              <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/30 text-[10px] font-bold">
                TradingView Direct Web Iframe
              </span>
            </div>
            <div className="text-slate-400 text-[11px]">
              Cotație: <strong className="text-slate-200">${quoteCurrency}</strong>
            </div>
          </div>

          <div className="w-full rounded-2xl overflow-hidden bg-background-card border border-background-border shadow-2xl">
            <div ref={tvWidgetContainerRef} className="w-full h-[560px]" />
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
                Scriptul exact cu adaptare automată a parametrilor (1H, 4H, 8H, 1D, 1W, 1M) și colorare nor.
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
