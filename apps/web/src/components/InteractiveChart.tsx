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
  BarChart2
} from 'lucide-react';

interface InteractiveChartProps {
  candles: Candle[];
  symbol: string;
  timeframe: string;
  onTimeframeChange?: (tf: Timeframe) => void;
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
    let direction = 1;

    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      const hl2 = (c.high + c.low) / 2;
      const curAtr = atr[i] || 1;

      const basicUpper = hl2 + multiplier * curAtr;
      const basicLower = hl2 - multiplier * curAtr;

      if (i === 0) {
        upperBand = basicUpper;
        lowerBand = basicLower;
        direction = c.close > upperBand ? -1 : 1;
      } else {
        const prevClose = candles[i - 1].close;
        const prevUpper = upperBand;
        const prevLower = lowerBand;

        lowerBand = (basicLower > prevLower || prevClose < prevLower) ? basicLower : prevLower;
        upperBand = (basicUpper < prevUpper || prevClose > prevUpper) ? basicUpper : prevUpper;

        if (direction === 1 && c.close > prevUpper) {
          direction = -1; // Bullish crossover
        } else if (direction === -1 && c.close < prevLower) {
          direction = 1; // Bearish crossunder
        }
      }

      line.push(direction === -1 ? lowerBand : upperBand);
      dir.push(direction);
    }

    return { line, dir };
  };

  const fast = calcSupertrend(f_fast);
  const slow = calcSupertrend(f_slow);

  const buySignals: boolean[] = [];
  const sellSignals: boolean[] = [];
  const cloudColor: string[] = [];

  for (let i = 0; i < candles.length; i++) {
    const isBull = fast.dir[i] < 0 && slow.dir[i] < 0;
    const isBear = fast.dir[i] > 0 && slow.dir[i] > 0;
    cloudColor.push(isBull ? '#10b981' : (isBear ? '#f43f5e' : '#64748b'));

    if (i > 0) {
      // buySignal = ta.change(dirSlow) < 0
      const buy = slow.dir[i - 1] === 1 && slow.dir[i] === -1;
      // sellSignal = ta.change(dirSlow) > 0
      const sell = slow.dir[i - 1] === -1 && slow.dir[i] === 1;
      buySignals.push(buy);
      sellSignals.push(sell);
    } else {
      buySignals.push(false);
      sellSignals.push(false);
    }
  }

  return {
    lineFast: fast.line,
    dirFast: fast.dir,
    lineSlow: slow.line,
    dirSlow: slow.dir,
    cloudColor,
    buySignals,
    sellSignals
  };
}

export const InteractiveChart: React.FC<InteractiveChartProps> = ({
  candles = [],
  symbol,
  timeframe = '1h',
  onTimeframeChange
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<'chart' | 'pinescript'>('chart');
  const [activeInterval, setActiveInterval] = useState<string>(timeframe);
  const [copiedPine, setCopiedPine] = useState(false);
  const [latestState, setLatestState] = useState<{
    status: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    fastLine: number;
    slowLine: number;
    buySignal: boolean;
    sellSignal: boolean;
  } | null>(null);

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

// --- Plotare Linii (Se vor lipi obligatoriu de preț datorită numelui nou) ---
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
      height: 440,
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

    // 1. Add Candlestick Series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#f43f5e',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#f43f5e'
    });

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
    if (candles.length > 0) {
      const lastIdx = candles.length - 1;
      const isBull = moneyLine.dirFast[lastIdx] < 0 && moneyLine.dirSlow[lastIdx] < 0;
      const isBear = moneyLine.dirFast[lastIdx] > 0 && moneyLine.dirSlow[lastIdx] > 0;
      setLatestState({
        status: isBull ? 'BULLISH' : (isBear ? 'BEARISH' : 'NEUTRAL'),
        fastLine: moneyLine.lineFast[lastIdx],
        slowLine: moneyLine.lineSlow[lastIdx],
        buySignal: moneyLine.buySignals[lastIdx],
        sellSignal: moneyLine.sellSignals[lastIdx]
      });
    }

    // Fit chart viewport to recent content
    chart.timeScale().fitContent();

    // Responsive window resize listener
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

  const tvExternalUrl = `https://www.tradingview.com/chart/?symbol=BINANCE:${symbol.toUpperCase()}USDT&interval=${
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
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded-lg transition-all ${
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

      {/* Main Tab 1: TradingView Chart with MoneyLine Overlay Force v1 */}
      {activeTab === 'chart' && (
        <div className="space-y-3">
          {/* Real-time Indicator Status Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 bg-background-card/80 rounded-xl border border-background-border text-xs font-mono">
            <div className="flex items-center gap-4">
              <span className="font-bold text-slate-100 text-sm">${symbol} / USDT</span>
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

          {/* TradingView Lightweight Chart Viewport */}
          <div className="relative w-full rounded-xl overflow-hidden bg-background-card border border-background-border">
            <div ref={chartContainerRef} className="w-full h-[440px]" />
          </div>

          {/* Money Line Indicator Legend */}
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
                Scriptul exact furnizat cu adaptare automată a parametrilor (1H, 4H, 1D, 1W, 1M) și colorare nor.
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
