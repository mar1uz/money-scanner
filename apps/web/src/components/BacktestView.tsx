import React, { useEffect, useState } from 'react';
import { BacktestResult, Timeframe } from '../types.js';
import { TOP_50_CRYPTO_ASSETS } from '@money-scanner/shared';
import { fetchBacktest } from '../services/api.js';
import {
  LineChart,
  Play,
  TrendingUp,
  Percent,
  Award,
  AlertOctagon,
  Clock,
  ShieldAlert
} from 'lucide-react';

export const BacktestView: React.FC = () => {
  const [selectedSymbol, setSelectedSymbol] = useState('BTC');
  const [timeframe, setTimeframe] = useState<Timeframe>('1h');
  const [entryTier, setEntryTier] = useState('Bullish');
  const [exitTier, setExitTier] = useState('Bearish');
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(false);

  const runSimulation = () => {
    setLoading(true);
    fetchBacktest(selectedSymbol, timeframe, entryTier, exitTier)
      .then(res => setResult(res))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    runSimulation();
  }, [selectedSymbol, timeframe, entryTier, exitTier]);

  return (
    <div className="space-y-6">
      {/* Simulation Controls Header */}
      <div className="cyber-glass rounded-xl p-5 border border-cyan-500/30 bg-cyan-500/5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <LineChart className="w-5 h-5 text-cyan-400" />
            <h2 className="text-base font-bold text-slate-100">Money Line Strategy Backtest Simulator</h2>
          </div>
          <p className="text-xs text-slate-400">
            Simulate historical performance of Money Line signals against a standard Buy & Hold benchmark with realistic fees and slippage.
          </p>
        </div>

        {/* Parameters Form */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Asset Select */}
          <select
            value={selectedSymbol}
            onChange={(e) => setSelectedSymbol(e.target.value)}
            className="bg-background-surface border border-background-border rounded-lg px-3 py-1.5 text-xs font-mono text-cyan-300 focus:outline-none focus:border-cyan-500"
          >
            {TOP_50_CRYPTO_ASSETS.map(a => (
              <option key={a.symbol} value={a.symbol}>${a.symbol} - {a.name}</option>
            ))}
          </select>

          {/* Timeframe Select */}
          <select
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value as Timeframe)}
            className="bg-background-surface border border-background-border rounded-lg px-3 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="1h">1H Timeframe</option>
            <option value="4h">4H Timeframe</option>
            <option value="1d">1D Timeframe</option>
          </select>

          {/* Entry Trigger */}
          <select
            value={entryTier}
            onChange={(e) => setEntryTier(e.target.value)}
            className="bg-background-surface border border-background-border rounded-lg px-3 py-1.5 text-xs font-mono text-emerald-400 focus:outline-none"
          >
            <option value="Strong Bullish">Entry: Strong Bullish</option>
            <option value="Bullish">Entry: Bullish</option>
          </select>

          {/* Exit Trigger */}
          <select
            value={exitTier}
            onChange={(e) => setExitTier(e.target.value)}
            className="bg-background-surface border border-background-border rounded-lg px-3 py-1.5 text-xs font-mono text-rose-400 focus:outline-none"
          >
            <option value="Bearish">Exit: Bearish</option>
            <option value="Strong Bearish">Exit: Strong Bearish</option>
            <option value="Neutral">Exit: Neutral</option>
          </select>

          <button
            onClick={runSimulation}
            disabled={loading}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/30 text-xs font-mono font-bold transition-all"
          >
            <Play className="w-3.5 h-3.5 fill-cyan-400 text-cyan-400" />
            <span>{loading ? 'Simulating...' : 'Run Simulation'}</span>
          </button>
        </div>
      </div>

      {result && (
        <>
          {/* Key KPI Metrics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="cyber-glass rounded-xl p-4 border border-background-border">
              <span className="text-[10px] uppercase font-mono text-slate-400">Strategy Return</span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className={`text-xl font-mono font-bold ${
                  result.totalReturnPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}>
                  {result.totalReturnPercent >= 0 ? `+${result.totalReturnPercent}%` : `${result.totalReturnPercent}%`}
                </span>
              </div>
              <span className="text-[11px] text-slate-500 font-mono mt-1 block">
                vs {result.buyAndHoldReturnPercent >= 0 ? `+${result.buyAndHoldReturnPercent}%` : `${result.buyAndHoldReturnPercent}%`} Buy&Hold
              </span>
            </div>

            <div className="cyber-glass rounded-xl p-4 border border-background-border">
              <span className="text-[10px] uppercase font-mono text-slate-400">Win Rate</span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-xl font-mono font-bold text-cyan-300">{result.winRate}%</span>
              </div>
              <span className="text-[11px] text-slate-500 font-mono mt-1 block">
                {result.winningTrades} Wins / {result.losingTrades} Losses
              </span>
            </div>

            <div className="cyber-glass rounded-xl p-4 border border-background-border">
              <span className="text-[10px] uppercase font-mono text-slate-400">Profit Factor</span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-xl font-mono font-bold text-emerald-400">{result.profitFactor}</span>
              </div>
              <span className="text-[11px] text-slate-500 font-mono mt-1 block">
                Gross Profit / Gross Loss
              </span>
            </div>

            <div className="cyber-glass rounded-xl p-4 border border-background-border">
              <span className="text-[10px] uppercase font-mono text-slate-400">Max Drawdown</span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-xl font-mono font-bold text-rose-400">-{result.maxDrawdownPercent}%</span>
              </div>
              <span className="text-[11px] text-slate-500 font-mono mt-1 block">
                Peak-to-trough risk
              </span>
            </div>

            <div className="cyber-glass rounded-xl p-4 border border-background-border">
              <span className="text-[10px] uppercase font-mono text-slate-400">Sharpe / Duration</span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-xl font-mono font-bold text-purple-300">{result.sharpeRatio}</span>
              </div>
              <span className="text-[11px] text-slate-500 font-mono mt-1 block">
                Avg {result.averageTradeDurationHours}h hold time
              </span>
            </div>
          </div>

          {/* Equity Curve SVG Chart */}
          <div className="cyber-glass rounded-xl p-5 border border-background-border space-y-3">
            <div className="flex items-center justify-between font-mono text-xs">
              <span className="font-bold text-slate-200">Equity Curve Simulation (Strategy vs Benchmark)</span>
              <div className="flex items-center gap-4 text-[11px]">
                <span className="flex items-center gap-1.5 text-cyan-300">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400"></span> Money Line Strategy
                </span>
                <span className="flex items-center gap-1.5 text-slate-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-500"></span> Buy & Hold Benchmark
                </span>
              </div>
            </div>

            {/* SVG Visualizer */}
            {result.equityCurve.length > 0 && (() => {
              const pts = result.equityCurve;
              const minEq = Math.min(...pts.map(p => Math.min(p.strategyEquity, p.benchmarkEquity)));
              const maxEq = Math.max(...pts.map(p => Math.max(p.strategyEquity, p.benchmarkEquity)));
              const range = maxEq - minEq || 1;
              const w = 800;
              const h = 200;

              const getSvgY = (val: number) => h - ((val - minEq) / range) * (h - 20) - 10;

              const stratPath = pts.map((p, idx) => {
                const x = (idx / (pts.length - 1)) * w;
                const y = getSvgY(p.strategyEquity);
                return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`;
              }).join(' ');

              const benchPath = pts.map((p, idx) => {
                const x = (idx / (pts.length - 1)) * w;
                const y = getSvgY(p.benchmarkEquity);
                return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`;
              }).join(' ');

              return (
                <div className="w-full overflow-hidden bg-background-surface/80 rounded-lg p-2 border border-background-border">
                  <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-48">
                    <line x1={0} y1={h / 2} x2={w} y2={h / 2} stroke="#1e293b" strokeDasharray="4 4" />
                    {/* Benchmark Path */}
                    <path d={benchPath} fill="none" stroke="#64748b" strokeWidth={1.5} strokeDasharray="3 3" />
                    {/* Strategy Path */}
                    <path d={stratPath} fill="none" stroke="#00f2fe" strokeWidth={2.5} />
                  </svg>
                </div>
              );
            })()}
          </div>

          {/* Trade Execution Log */}
          <div className="cyber-glass rounded-xl p-5 border border-background-border space-y-3">
            <h3 className="text-xs font-mono uppercase text-slate-400">Trade Execution Log ({result.trades.length} Closed Trades)</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-background-surface text-slate-400 border-b border-background-border text-[10px] uppercase">
                  <tr>
                    <th className="py-2 px-3">Trade</th>
                    <th className="py-2 px-3">Side</th>
                    <th className="py-2 px-3">Entry Price</th>
                    <th className="py-2 px-3">Exit Price</th>
                    <th className="py-2 px-3">Return %</th>
                    <th className="py-2 px-3">Net PnL</th>
                    <th className="py-2 px-3">Duration</th>
                    <th className="py-2 px-3">Exit Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-background-border/40">
                  {result.trades.map((t) => (
                    <tr key={t.id} className="hover:bg-background-surface/50">
                      <td className="py-2 px-3 text-slate-300">{t.id}</td>
                      <td className="py-2 px-3 text-emerald-400 font-bold">{t.side}</td>
                      <td className="py-2 px-3 text-slate-200">${t.entryPrice.toLocaleString()}</td>
                      <td className="py-2 px-3 text-slate-200">${t.exitPrice.toLocaleString()}</td>
                      <td className={`py-2 px-3 font-bold ${t.pnlPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {t.pnlPercent >= 0 ? `+${t.pnlPercent}%` : `${t.pnlPercent}%`}
                      </td>
                      <td className={`py-2 px-3 font-bold ${t.pnlNetUsd >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {t.pnlNetUsd >= 0 ? `+$${t.pnlNetUsd}` : `-$${Math.abs(t.pnlNetUsd)}`}
                      </td>
                      <td className="py-2 px-3 text-slate-400">{t.holdingHours}h</td>
                      <td className="py-2 px-3 text-cyan-300">{t.exitReason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Disclaimer */}
          <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 text-[11px] font-mono text-slate-400 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span>{result.disclaimer}</span>
          </div>
        </>
      )}
    </div>
  );
};
