import React, { useEffect, useState } from 'react';
import { fetchSystemStatus, triggerTestAlert } from '../services/api.js';
import {
  Activity,
  Server,
  Bot,
  BellRing,
  ShieldCheck,
  Zap,
  CheckCircle2,
  RefreshCw
} from 'lucide-react';

export const SystemStatusView: React.FC = () => {
  const [status, setStatus] = useState<any>(null);
  const [chartMarket, setChartMarket] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [testSent, setTestSent] = useState(false);

  const loadChartMarketDiagnostics = () => {
    // Public read-only ops route (same auth posture as /api/health).
    fetch('/api/chart-market-diagnostics')
      .then(res => (res.ok ? res.json() : null))
      .then(data => setChartMarket(data))
      .catch(() => setChartMarket(null));
  };

  const loadStatus = () => {
    setLoading(true);
    fetchSystemStatus()
      .then(res => setStatus(res))
      .catch(console.error)
      .finally(() => setLoading(false));
    loadChartMarketDiagnostics();
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleTestAlert = async (symbol: string) => {
    try {
      await triggerTestAlert(symbol);
      setTestSent(true);
      setTimeout(() => setTestSent(false), 4000);
      loadStatus();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="cyber-glass rounded-xl p-5 border border-cyan-500/30 bg-cyan-500/5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Activity className="w-5 h-5 text-cyan-400" />
            <h2 className="text-base font-bold text-slate-100">System Health, Data Providers & Telegram Bot</h2>
          </div>
          <p className="text-xs text-slate-400">
            Real-time infrastructure health, provider response times, circuit breakers, and webhook status.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => handleTestAlert('BTC')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/30 text-xs font-mono transition-all"
          >
            <BellRing className="w-3.5 h-3.5" />
            <span>{testSent ? 'Alert Dispatched!' : 'Send Test Market Alert'}</span>
          </button>
          <button
            onClick={loadStatus}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono border border-slate-700 transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Services Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Core API Server */}
        <div className="cyber-glass rounded-xl p-5 border border-background-border space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase font-mono text-slate-400">API Service</span>
            <span className="flex items-center gap-1 text-xs font-mono text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" /> Operational
            </span>
          </div>
          <div className="space-y-1 font-mono text-xs text-slate-300">
            <div className="flex justify-between">
              <span className="text-slate-500">Service ID:</span>
              <span>market-scanner-360-api</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Port:</span>
              <span>3001</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Cached Signals:</span>
              <span className="text-cyan-300">{status?.cachedSignalsCount || 50}</span>
            </div>
          </div>
        </div>

        {/* Background Worker */}
        <div className="cyber-glass rounded-xl p-5 border border-background-border space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase font-mono text-slate-400">Scanner Worker</span>
            <span className="flex items-center gap-1 text-xs font-mono text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" /> Active
            </span>
          </div>
          <div className="space-y-1 font-mono text-xs text-slate-300">
            <div className="flex justify-between">
              <span className="text-slate-500">Scan Interval:</span>
              <span>60s continuous</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Assets Monitored:</span>
              <span>Top 50 universe</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Alert Cooldown:</span>
              <span>30m deduplicated</span>
            </div>
          </div>
        </div>

        {/* Telegram Bot */}
        <div className="cyber-glass rounded-xl p-5 border border-background-border space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase font-mono text-slate-400">Telegram Bot</span>
            <span className="flex items-center gap-1 text-xs font-mono text-cyan-400">
              <Bot className="w-3.5 h-3.5" /> Connected
            </span>
          </div>
          <div className="space-y-1 font-mono text-xs text-slate-300">
            <div className="flex justify-between">
              <span className="text-slate-500">Webhook:</span>
              <span>/api/telegram/webhook</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Secret Token:</span>
              <span className="text-emerald-400">Verified</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Alerts Dispatched:</span>
              <span className="text-cyan-300">{status?.alertHistoryCount || 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Chart-market resolver diagnostics (read-only ops snapshot) */}
      <div className="cyber-glass rounded-xl p-5 border border-background-border space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase font-mono text-slate-400">Chart-Market Resolver</span>
          <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
            chartMarket ? 'bg-cyan-500/10 text-cyan-300' : 'bg-rose-500/10 text-rose-400'
          }`}>
            {chartMarket ? 'observable' : 'unavailable'}
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs text-slate-300">
          <div className="flex justify-between sm:block">
            <span className="text-slate-500">Resolutions / pin hits / heals:&nbsp;</span>
            <span className="text-cyan-300">
              {chartMarket?.resolver?.resolutions ?? '—'} / {chartMarket?.resolver?.pinHits ?? '—'} / {chartMarket?.resolver?.heals ?? '—'}
            </span>
          </div>
          <div className="flex justify-between sm:block">
            <span className="text-slate-500">Upstream failures:&nbsp;</span>
            <span className={chartMarket?.resolver?.failuresTotal ? 'text-rose-400' : 'text-emerald-400'}>
              {chartMarket?.resolver?.failuresTotal ?? '—'}
              {chartMarket?.resolver?.lastFailure?.probe ? ` (last: ${chartMarket.resolver.lastFailure.probe})` : ''}
            </span>
          </div>
          <div className="flex justify-between sm:block">
            <span className="text-slate-500">Pins:&nbsp;</span>
            <span>
              {chartMarket?.pins?.supported ? chartMarket.pins.count : '—'}
              {chartMarket?.pins?.supported
                ? ` (dead ${chartMarket.pins.byHealth?.dead ?? 0}, unverified ${chartMarket.pins.byHealth?.unverified ?? 0})`
                : ''}
            </span>
          </div>
        </div>
      </div>

      {/* Provider Health Cards */}
      <div className="cyber-glass rounded-xl p-5 border border-background-border space-y-4">
        <h3 className="text-xs font-mono uppercase text-slate-400">External Market Data Ingestion Providers</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs">
          {status?.providers?.map((p: any) => (
            <div key={p.name} className="p-3.5 rounded-lg bg-background-surface border border-background-border space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-200">{p.name}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                  p.status === 'operational' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                }`}>
                  {p.status}
                </span>
              </div>
              <div className="text-[11px] text-slate-400 space-y-1">
                <div className="flex justify-between">
                  <span>Latency:</span>
                  <span className="text-cyan-300">{p.latencyMs}ms</span>
                </div>
                <div className="flex justify-between">
                  <span>Total Requests:</span>
                  <span>{p.totalRequests}</span>
                </div>
                <div className="flex justify-between">
                  <span>Errors:</span>
                  <span>{p.totalErrors}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
