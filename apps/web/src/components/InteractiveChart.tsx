import React, { useState } from 'react';
import { Candle } from '../types.js';

interface InteractiveChartProps {
  candles: Candle[];
  symbol: string;
  timeframe: string;
}

export const InteractiveChart: React.FC<InteractiveChartProps> = ({
  candles,
  symbol,
  timeframe
}) => {
  const [hoveredCandle, setHoveredCandle] = useState<Candle | null>(null);

  if (!candles || candles.length === 0) {
    return <div className="p-8 text-center text-slate-500 font-mono">Loading chart candles...</div>;
  }

  const chartCandles = candles.slice(-60); // Show last 60 bars for clarity
  const minPrice = Math.min(...chartCandles.map(c => c.low));
  const maxPrice = Math.max(...chartCandles.map(c => c.high));
  const priceRange = maxPrice - minPrice || 1;

  const maxVolume = Math.max(...chartCandles.map(c => c.volume));

  const svgWidth = 800;
  const svgHeight = 320;
  const chartHeight = 240;
  const volumeHeight = 60;
  const candleWidth = Math.max(4, (svgWidth / chartCandles.length) * 0.7);
  const candleStep = svgWidth / chartCandles.length;

  const getY = (price: number) => {
    return chartHeight - ((price - minPrice) / priceRange) * (chartHeight - 20) - 10;
  };

  const getVolY = (vol: number) => {
    return svgHeight - (vol / (maxVolume || 1)) * volumeHeight;
  };

  return (
    <div className="w-full bg-background-surface/80 rounded-xl p-4 border border-background-border">
      {/* Chart Header Info */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-2 border-b border-background-border font-mono text-xs">
        <div className="flex items-center gap-3">
          <span className="font-bold text-slate-200">${symbol} / USDT</span>
          <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
            {timeframe.toUpperCase()}
          </span>
          <span className="text-slate-400">
            {hoveredCandle ? new Date(hoveredCandle.timestamp).toLocaleString() : 'Latest Candles'}
          </span>
        </div>

        {hoveredCandle ? (
          <div className="flex items-center gap-3 text-[11px]">
            <span>O: <strong className="text-slate-200">{hoveredCandle.open}</strong></span>
            <span>H: <strong className="text-emerald-400">{hoveredCandle.high}</strong></span>
            <span>L: <strong className="text-rose-400">{hoveredCandle.low}</strong></span>
            <span>C: <strong className="text-slate-200">{hoveredCandle.close}</strong></span>
            <span>V: <strong className="text-cyan-400">{hoveredCandle.volume.toLocaleString()}</strong></span>
          </div>
        ) : (
          <div className="text-[11px] text-slate-400">Hover over candles for details</div>
        )}
      </div>

      {/* SVG Canvas */}
      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-auto cursor-crosshair select-none"
        >
          {/* Background Grid Lines */}
          {[0.25, 0.5, 0.75].map((pct, idx) => {
            const priceAtLine = minPrice + priceRange * (1 - pct);
            const y = chartHeight * pct;
            return (
              <g key={idx}>
                <line x1={0} y1={y} x2={svgWidth} y2={y} stroke="#1e293b" strokeDasharray="3 3" />
                <text x={svgWidth - 60} y={y - 4} fill="#64748b" fontSize="9" fontFamily="monospace">
                  ${priceAtLine.toFixed(2)}
                </text>
              </g>
            );
          })}

          {/* Volume Separator */}
          <line x1={0} y1={chartHeight + 10} x2={svgWidth} y2={chartHeight + 10} stroke="#1e293b" />

          {/* Candlesticks & Volume */}
          {chartCandles.map((c, idx) => {
            const x = idx * candleStep + candleStep / 2;
            const isUp = c.close >= c.open;
            const color = isUp ? '#10b981' : '#f43f5e';
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
                onMouseEnter={() => setHoveredCandle(c)}
                onMouseLeave={() => setHoveredCandle(null)}
                className="transition-opacity hover:opacity-80"
              >
                {/* Wick */}
                <line x1={x} y1={highY} x2={x} y2={lowY} stroke={color} strokeWidth={1.2} />
                {/* Candle Body */}
                <rect
                  x={x - candleWidth / 2}
                  y={bodyY}
                  width={candleWidth}
                  height={bodyHeight}
                  fill={color}
                  rx={1}
                />
                {/* Volume Bar */}
                <rect
                  x={x - candleWidth / 2}
                  y={volY}
                  width={candleWidth}
                  height={svgHeight - volY}
                  fill={isUp ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)'}
                />
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-background-border text-[11px] text-slate-400 font-mono">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span> Bullish Close
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-400"></span> Bearish Close
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400"></span> Volume RVOL
          </span>
        </div>
        <span>High: ${maxPrice.toFixed(2)} | Low: ${minPrice.toFixed(2)}</span>
      </div>
    </div>
  );
};
