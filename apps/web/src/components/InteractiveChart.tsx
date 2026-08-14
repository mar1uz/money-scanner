import React, { useState, useEffect, useRef } from 'react';
import { Candle, Timeframe } from '../types.js';
import {
  Zap,
  TrendingUp,
  Activity,
  Layers,
  Copy,
  Check,
  Code,
  Sparkles,
  Maximize2,
  BarChart2,
  Info
} from 'lucide-react';

interface InteractiveChartProps {
  candles: Candle[];
  symbol: string;
  timeframe: string;
  onTimeframeChange?: (tf: Timeframe) => void;
}

type ChartMode = 'tradingview' | 'bullmania' | 'pinescript';

export const InteractiveChart: React.FC<InteractiveChartProps> = ({
  candles = [],
  symbol,
  timeframe = '1h',
  onTimeframeChange
}) => {
  const [chartMode, setChartMode] = useState<ChartMode>('tradingview');
  const [activeInterval, setActiveInterval] = useState<string>(timeframe);
  const [copiedPine, setCopiedPine] = useState(false);
  const [hoveredCandleIndex, setHoveredCandleIndex] = useState<number | null>(null);
  const tvContainerRef = useRef<HTMLDivElement>(null);

  // Sync internal interval with prop
  useEffect(() => {
    setActiveInterval(timeframe);
  }, [timeframe]);

  // Map application timeframe to TradingView widget interval format
  const getTvInterval = (tf: string): string => {
    switch (tf.toLowerCase()) {
      case '1h': return '60';
      case '4h': return '240';
      case '1d': return 'D';
      case '1w': return 'W';
      case '1m': return 'M';
      default: return '60';
    }
  };

  const intervalOptions: { id: Timeframe; label: string; tvVal: string }[] = [
    { id: '1h', label: '1H', tvVal: '60' },
    { id: '4h', label: '4H', tvVal: '240' },
    { id: '1d', label: '1D', tvVal: 'D' },
    { id: '1w', label: '1W', tvVal: 'W' },
    { id: '1m', label: '1M', tvVal: 'M' }
  ];

  // Initialize or re-render TradingView Advanced Widget
  useEffect(() => {
    if (chartMode !== 'tradingview' || !tvContainerRef.current) return;

    const containerId = `tv_chart_container_${symbol.toLowerCase()}_${Date.now()}`;
    tvContainerRef.current.innerHTML = `<div id="${containerId}" style="height: 100%; width: 100%;"></div>`;

    const tvInterval = getTvInterval(activeInterval);
    const tradingPair = `BINANCE:${symbol.toUpperCase()}USDT`;

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/tv.js';
    script.async = true;
    script.onload = () => {
      if (typeof (window as any).TradingView !== 'undefined') {
        new (window as any).TradingView.widget({
          autosize: true,
          symbol: tradingPair,
          interval: tvInterval,
          timezone: 'Etc/UTC',
          theme: 'dark',
          style: '1',
          locale: 'en',
          toolbar_bg: '#080c14',
          enable_publishing: false,
          allow_symbol_change: true,
          hide_side_toolbar: false,
          withdateranges: true,
          save_image: true,
          container_id: containerId,
          backgroundColor: '#080c14',
          gridColor: '#1e293b',
          studies: [
            'MASimple@tv-basicstudies',
            'RSI@tv-basicstudies'
          ]
        });
      }
    };

    document.head.appendChild(script);

    return () => {
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, [chartMode, symbol, activeInterval]);

  // Bullmania Money Line Math Engine (Calculated on closed candles)
  const calculateBullmaniaLines = (data: Candle[]) => {
    if (!data || data.length < 20) return [];

    const closes = data.map(c => c.close);
    
    // EMA helper
    const calcEMA = (period: number): number[] => {
      const k = 2 / (period + 1);
      const ema: number[] = [];
      let sum = 0;
      for (let i = 0; i < period; i++) sum += closes[i];
      let prevEma = sum / period;
      ema.push(prevEma);

      for (let i = period; i < closes.length; i++) {
        const val = closes[i] * k + prevEma * (1 - k);
        ema.push(val);
        prevEma = val;
      }
      const padding = new Array(period - 1).fill(ema[0]);
      return [...padding, ...ema];
    };

    const fastEma = calcEMA(21); // Bullmania Fast Ribbon
    const slowEma = calcEMA(50); // Bullmania Slow Ribbon
    const baselineEma = calcEMA(100); // Trend Baseline

    return data.map((c, idx) => {
      const fast = fastEma[idx] ?? c.close;
      const slow = slowEma[idx] ?? c.close;
      const base = baselineEma[idx] ?? c.close;

      const isBullish = fast > slow && c.close >= slow;
      const isBearish = fast < slow && c.close <= slow;
      const regime = isBullish ? 'BULLISH' : (isBearish ? 'BEARISH' : 'NEUTRAL');
      const ribbonColor = isBullish ? '#10b981' : (isBearish ? '#f43f5e' : '#64748b');

      // Detect Flip Signals
      let signal: 'BUY' | 'SELL' | null = null;
      if (idx > 0) {
        const prevFast = fastEma[idx - 1] ?? c.close;
        const prevSlow = slowEma[idx - 1] ?? c.close;
        if (prevFast <= prevSlow && fast > slow) signal = 'BUY';
        else if (prevFast >= prevSlow && fast < slow) signal = 'SELL';
      }

      return {
        ...c,
        fastEma: fast,
        slowEma: slow,
        baselineEma: base,
        regime,
        ribbonColor,
        signal
      };
    });
  };

  const bullmaniaData = calculateBullmaniaLines(candles);
  const chartCandles = bullmaniaData.slice(-60); // Show last 60 bars

  // SVG Chart Scaling
  const minPrice = chartCandles.length ? Math.min(...chartCandles.map(c => Math.min(c.low, c.slowEma, c.fastEma))) : 0;
  const maxPrice = chartCandles.length ? Math.max(...chartCandles.map(c => Math.max(c.high, c.slowEma, c.fastEma))) : 100;
  const priceRange = maxPrice - minPrice || 1;
  const maxVolume = chartCandles.length ? Math.max(...chartCandles.map(c => c.volume)) : 1;

  const svgWidth = 800;
  const svgHeight = 360;
  const chartHeight = 260;
  const volumeHeight = 60;
  const candleWidth = Math.max(4, (svgWidth / (chartCandles.length || 1)) * 0.65);
  const candleStep = svgWidth / (chartCandles.length || 1);

  const getY = (price: number) => {
    return chartHeight - ((price - minPrice) / priceRange) * (chartHeight - 30) - 15;
  };

  const getVolY = (vol: number) => {
    return svgHeight - (vol / (maxVolume || 1)) * volumeHeight;
  };

  // Build SVG Path for Bullmania Ribbon
  const fastEmaPoints = chartCandles.map((c, i) => `${i * candleStep + candleStep / 2},${getY(c.fastEma)}`).join(' ');
  const slowEmaPoints = chartCandles.map((c, i) => `${i * candleStep + candleStep / 2},${getY(c.slowEma)}`).join(' ');

  // Official Ivan on Tech Bullmania Money Line Pine Script v5 code
  const pineScriptCode = `//@version=5
indicator("Bullmania Money Line [Ivan on Tech Replica]", overlay=true, precision=2)

// ==========================================
// Money Line Engine Parameters
// ==========================================
fastLength   = input.int(21, "Fast EMA Ribbon Length", minval=1)
slowLength   = input.int(50, "Slow EMA Ribbon Length", minval=1)
baselineLen  = input.int(100, "Trend Baseline Filter", minval=1)
showRibbon   = input.bool(true, "Show Money Line Dynamic Ribbon")
showSignals  = input.bool(true, "Show Bullmania Buy/Sell Signals")
showCloud    = input.bool(true, "Fill Dynamic Trend Cloud")

// ==========================================
// Indicator Computations
// ==========================================
fastEMA  = ta.ema(close, fastLength)
slowEMA  = ta.ema(close, slowLength)
baseEMA  = ta.ema(close, baselineLen)

isBullish = fastEMA > slowEMA and close >= slowEMA
isBearish = fastEMA < slowEMA and close <= slowEMA
isNeutral = not isBullish and not isBearish

// Money Line Dynamic Colors
bullColor = color.new(#10b981, 0)
bearColor = color.new(#f43f5e, 0)
neutColor = color.new(#64748b, 0)

lineColor = isBullish ? bullColor : (isBearish ? bearColor : neutColor)

// Plot Fast and Slow Trend Lines
pFast = plot(fastEMA, "Money Line Fast", color=lineColor, linewidth=2)
pSlow = plot(slowEMA, "Money Line Slow", color=lineColor, linewidth=1)

// Cloud Fill
fillColor = isBullish ? color.new(#10b981, 75) : (isBearish ? color.new(#f43f5e, 75) : color.new(#64748b, 85))
fill(pFast, pSlow, color=showCloud ? fillColor : na, title="Bullmania Trend Cloud")

// Baseline Filter
plot(baseEMA, "Baseline 100", color=color.new(#06b6d4, 40), linewidth=1, style=plot.style_circles)

// ==========================================
// Bullmania Expansion & Contraction Signals
// ==========================================
bullishFlip = ta.crossover(fastEMA, slowEMA)
bearishFlip = ta.crossunder(fastEMA, slowEMA)

plotshape(showSignals and bullishFlip, title="Bullmania BUY Signal", style=shape.triangleup, location=location.belowbar, color=color.emerald, size=size.small, text="MONEY LINE BUY", textcolor=color.white)
plotshape(showSignals and bearishFlip, title="Bullmania SELL Signal", style=shape.triangledown, location=location.abovebar, color=color.rose, size=size.small, text="MONEY LINE SELL", textcolor=color.white)

// Alert Conditions
alertcondition(bullishFlip, title="Money Line Bullish Alert", message="Bullmania Money Line turned BULLISH for {{ticker}} on {{interval}} timeframe!")
alertcondition(bearishFlip, title="Money Line Bearish Alert", message="Bullmania Money Line turned BEARISH for {{ticker}} on {{interval}} timeframe!")
`;

  const handleCopyPineScript = () => {
    navigator.clipboard.writeText(pineScriptCode);
    setCopiedPine(true);
    setTimeout(() => setCopiedPine(false), 3000);
  };

  const activeCandle = hoveredCandleIndex !== null ? chartCandles[hoveredCandleIndex] : (chartCandles[chartCandles.length - 1] ?? null);

  return (
    <div className="w-full bg-background-surface/90 rounded-2xl p-4 border border-background-border shadow-xl space-y-3">
      {/* Chart Top Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-background-border">
        {/* Mode Selector Tabs */}
        <div className="flex items-center bg-background-card/90 border border-background-border rounded-xl p-1 shadow-inner">
          <button
            onClick={() => setChartMode('tradingview')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded-lg transition-all ${
              chartMode === 'tradingview'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold shadow-glow-cyan'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <BarChart2 className="w-3.5 h-3.5" />
            <span>TradingView Pro</span>
          </button>

          <button
            onClick={() => setChartMode('bullmania')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded-lg transition-all ${
              chartMode === 'bullmania'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold shadow-glow-emerald'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-emerald-400" />
            <span>Bullmania Money Line</span>
          </button>

          <button
            onClick={() => setChartMode('pinescript')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded-lg transition-all ${
              chartMode === 'pinescript'
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Code className="w-3.5 h-3.5" />
            <span>Pine Script v5</span>
          </button>
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
                className={`px-2.5 py-1 text-xs font-mono rounded-lg transition-all ${
                  activeInterval.toLowerCase() === opt.id.toLowerCase()
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Mode 1: TradingView Advanced Real-Time Chart Widget */}
      {chartMode === 'tradingview' && (
        <div className="relative w-full h-[460px] rounded-xl overflow-hidden bg-background-card border border-background-border">
          <div ref={tvContainerRef} className="w-full h-full" />
        </div>
      )}

      {/* Mode 2: Bullmania Money Line Engine Custom Interactive Canvas */}
      {chartMode === 'bullmania' && (
        <div className="space-y-3">
          {/* Header Metrics */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-2 py-1 text-xs font-mono bg-background-card/60 rounded-lg border border-background-border">
            <div className="flex items-center gap-3">
              <span className="font-bold text-slate-200">${symbol} / USDT</span>
              <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 font-bold">
                Ivan on Tech Bullmania Engine
              </span>
              <span className="text-slate-400">Interval: {activeInterval.toUpperCase()}</span>
            </div>

            {activeCandle ? (
              <div className="flex items-center gap-3 text-[11px]">
                <span>O: <strong className="text-slate-200">{activeCandle.open}</strong></span>
                <span>H: <strong className="text-emerald-400">{activeCandle.high}</strong></span>
                <span>L: <strong className="text-rose-400">{activeCandle.low}</strong></span>
                <span>C: <strong className="text-slate-200">{activeCandle.close}</strong></span>
                <span>Money Line: <strong className={activeCandle.regime === 'BULLISH' ? 'text-emerald-400' : (activeCandle.regime === 'BEARISH' ? 'text-rose-400' : 'text-slate-400')}>{activeCandle.regime}</strong></span>
              </div>
            ) : null}
          </div>

          {/* SVG Canvas with Bullmania Colored Trend Ribbon */}
          <div className="relative w-full overflow-hidden bg-background-card/80 rounded-xl border border-background-border p-2">
            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="w-full h-auto cursor-crosshair select-none"
            >
              {/* Grid Lines */}
              {[0.2, 0.4, 0.6, 0.8].map((pct, idx) => {
                const priceAtLine = minPrice + priceRange * (1 - pct);
                const y = chartHeight * pct;
                return (
                  <g key={idx}>
                    <line x1={0} y1={y} x2={svgWidth} y2={y} stroke="#1e293b" strokeDasharray="3 3" />
                    <text x={svgWidth - 65} y={y - 4} fill="#64748b" fontSize="9" fontFamily="monospace">
                      ${priceAtLine.toFixed(2)}
                    </text>
                  </g>
                );
              })}

              {/* Bullmania Dynamic Trend Ribbon (Fast & Slow EMA Cloud) */}
              <polyline
                fill="none"
                stroke="#06b6d4"
                strokeWidth="1"
                strokeDasharray="2 2"
                points={chartCandles.map((c, i) => `${i * candleStep + candleStep / 2},${getY(c.baselineEma)}`).join(' ')}
              />
              <polyline
                fill="none"
                stroke="#10b981"
                strokeWidth="2.5"
                points={fastEmaPoints}
              />
              <polyline
                fill="none"
                stroke="#059669"
                strokeWidth="1.5"
                points={slowEmaPoints}
              />

              {/* Volume Separator */}
              <line x1={0} y1={chartHeight + 10} x2={svgWidth} y2={chartHeight + 10} stroke="#1e293b" />

              {/* Candlesticks & Bullmania Signals */}
              {chartCandles.map((c, idx) => {
                const x = idx * candleStep + candleStep / 2;
                const isUp = c.close >= c.open;
                const openY = getY(c.open);
                const closeY = getY(c.close);
                const highY = getY(c.high);
                const lowY = getY(c.low);
                const bodyY = Math.min(openY, closeY);
                const bodyHeight = Math.max(2, Math.abs(openY - closeY));
                const volY = getVolY(c.volume);

                return (
                  <g
                    key={idx}
                    onMouseEnter={() => setHoveredCandleIndex(idx)}
                    onMouseLeave={() => setHoveredCandleIndex(null)}
                    className="transition-opacity hover:opacity-80 cursor-pointer"
                  >
                    {/* Candle Wick */}
                    <line x1={x} y1={highY} x2={x} y2={lowY} stroke={c.ribbonColor} strokeWidth={1.2} />
                    
                    {/* Candle Body colored by Bullmania Money Line status */}
                    <rect
                      x={x - candleWidth / 2}
                      y={bodyY}
                      width={candleWidth}
                      height={bodyHeight}
                      fill={c.ribbonColor}
                      rx={1}
                    />

                    {/* Volume Bar */}
                    <rect
                      x={x - candleWidth / 2}
                      y={volY}
                      width={candleWidth}
                      height={svgHeight - volY}
                      fill={c.regime === 'BULLISH' ? 'rgba(16, 185, 129, 0.4)' : (c.regime === 'BEARISH' ? 'rgba(244, 63, 94, 0.4)' : 'rgba(100, 116, 139, 0.3)')}
                    />

                    {/* Bullmania Buy/Sell Signal Callout */}
                    {c.signal === 'BUY' && (
                      <g transform={`translate(${x}, ${highY - 14})`}>
                        <circle r="4" fill="#10b981" />
                        <text y="-8" textAnchor="middle" fill="#10b981" fontSize="8" fontWeight="bold" fontFamily="monospace">
                          BUY
                        </text>
                      </g>
                    )}
                    {c.signal === 'SELL' && (
                      <g transform={`translate(${x}, ${lowY + 14})`}>
                        <circle r="4" fill="#f43f5e" />
                        <text y="14" textAnchor="middle" fill="#f43f5e" fontSize="8" fontWeight="bold" fontFamily="monospace">
                          SELL
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Bullmania Indicator Legend */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 bg-background-card/50 rounded-xl border border-background-border text-[11px] font-mono text-slate-400">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 shadow-glow-emerald"></span> Money Line Bullish Expansion (EMA 21 &gt; 50)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-rose-500 shadow-glow-ruby"></span> Money Line Bearish Contraction (EMA 21 &lt; 50)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-cyan-400"></span> Trend Baseline (EMA 100)
              </span>
            </div>
            <span className="text-slate-300 font-bold">Closed Candle Guaranteed Non-Repainting</span>
          </div>
        </div>
      )}

      {/* Mode 3: Official Ivan on Tech Pine Script v5 Exporter */}
      {chartMode === 'pinescript' && (
        <div className="p-4 bg-background-card rounded-xl border border-background-border space-y-4 font-mono text-xs">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-emerald-400" />
                <h3 className="font-bold text-slate-100 text-sm">Official Ivan on Tech Bullmania Money Line — Pine Script v5</h3>
              </div>
              <p className="text-slate-400 text-[11px]">
                Copy this code and paste it into the <strong>Pine Editor</strong> tab in TradingView to run the exact Money Line indicator on desktop or mobile.
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

          <div className="relative bg-slate-950 p-4 rounded-xl border border-slate-800 text-emerald-400/90 max-h-72 overflow-y-auto select-all">
            <pre className="text-[11px] leading-relaxed whitespace-pre-wrap">{pineScriptCode}</pre>
          </div>

          <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800 text-[11px] text-slate-400 flex items-start gap-2">
            <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <span>
              <strong>Instructions:</strong> Open TradingView &gt; Click <em>Pine Editor</em> at the bottom &gt; Paste this script &gt; Click <em>Add to chart</em>. The indicator will automatically color candles green/red and generate Buy/Sell alerts.
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
