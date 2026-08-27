import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BellPlus,
  BellRing,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clock3,
  RefreshCw,
  Radar,
  ScanSearch,
  Send,
  ShieldAlert,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  Zap
} from 'lucide-react';
import { AssetScannerRow, Timeframe } from '../types.js';
import { StrategyAlertSnapshot } from '@money-scanner/shared';
import {
  ActiveAlertDashboardItem,
  AlertsDashboardResponse,
  AlertProgressStatus,
  clearAlerts,
  fetchAlertsDashboard,
  FlipCandidateDashboardItem,
  ManualAlertScanScope,
  runManualAlertScan,
  setBullishAlert
} from '../services/api.js';

interface AlertsCenterViewProps {
  knownAssets: AssetScannerRow[];
  watchlist: string[];
  onOpenAsset: (symbol: string, marketClass: AssetScannerRow['marketClass'], timeframe: Timeframe) => void;
}

const ALERT_STORAGE_PREFIX = 'moneyline-bullish-alert:';

const formatPrice = (value?: number) => {
  if (!value || !Number.isFinite(value)) return '—';
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: value < 1 ? 4 : 2,
    maximumFractionDigits: value < 1 ? 8 : 4
  })}`;
};

const formatDate = (value?: number) => value
  ? new Date(value).toLocaleString('ro-RO', { dateStyle: 'medium', timeStyle: 'short' })
  : '—';

const statusMeta: Record<AlertProgressStatus, { label: string; tone: string; bar: string }> = {
  CONFIRMED: { label: 'Confirmat bullish', tone: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/35', bar: 'bg-emerald-400' },
  AWAITING_CLOSE: { label: 'Așteaptă închiderea', tone: 'text-cyan-300 bg-cyan-500/15 border-cyan-500/35', bar: 'bg-cyan-400' },
  VERY_CLOSE: { label: 'Foarte aproape', tone: 'text-amber-200 bg-amber-500/15 border-amber-500/35', bar: 'bg-amber-300' },
  CLOSE: { label: 'Aproape', tone: 'text-amber-300 bg-amber-500/10 border-amber-500/25', bar: 'bg-amber-400' },
  WAITING: { label: 'În așteptare', tone: 'text-slate-300 bg-slate-500/10 border-slate-500/25', bar: 'bg-slate-400' },
  ERROR: { label: 'Date indisponibile', tone: 'text-rose-300 bg-rose-500/10 border-rose-500/30', bar: 'bg-rose-400' }
};

export const AlertsCenterView: React.FC<AlertsCenterViewProps> = ({ knownAssets, watchlist, onOpenAsset }) => {
  const [data, setData] = useState<AlertsDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [scanScope, setScanScope] = useState<ManualAlertScanScope | null>(null);
  const [scanMessage, setScanMessage] = useState('');
  const [removingId, setRemovingId] = useState('');
  const [clearingTarget, setClearingTarget] = useState<'active' | 'history' | 'all' | null>(null);
  const [preparingId, setPreparingId] = useState('');
  const [activeTab, setActiveTab] = useState<'ALL' | 'STRATEGIES' | 'FLIPS' | 'WATCHED'>('ALL');
  const [candidateFilter, setCandidateFilter] = useState<'ALL' | 'BULLISH' | 'BEARISH'>('ALL');
  const [candidateTimeframe, setCandidateTimeframe] = useState<'ALL' | '4h' | '8h' | '1d' | '1w'>('ALL');
  const [candidateSearch, setCandidateSearch] = useState('');
  const [confirmedFilter, setConfirmedFilter] = useState<'ALL' | 'BULLISH' | 'BEARISH'>('ALL');
  const [confirmedTimeframe, setConfirmedTimeframe] = useState<'ALL' | '4h' | '8h' | '1d' | '1w'>('ALL');
  const [confirmedSearch, setConfirmedSearch] = useState('');
  const restoredBrowserRules = useRef(false);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await fetchAlertsDashboard());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Nu am putut încărca alertele.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
    const timer = window.setInterval(() => void loadDashboard(), 60_000);
    return () => window.clearInterval(timer);
  }, [loadDashboard]);

  useEffect(() => {
    if (!data?.manualScan.running || scanScope) return;
    const timer = window.setInterval(() => {
      void fetchAlertsDashboard().then(setData).catch(() => undefined);
    }, 2_500);
    return () => window.clearInterval(timer);
  }, [data?.manualScan.running, scanScope]);

  // Existing alert choices live in the browser as a recovery layer. Restore
  // missing server rules after a Cloud Run revision change, then refresh the
  // central view. New values also remember marketClass; legacy "true" values
  // are resolved through the scanner universe to avoid ticker collisions.
  useEffect(() => {
    if (!data || restoredBrowserRules.current) return;
    const activeKeys = new Set(data.activeAlerts.map(alert => `${alert.symbol}:${alert.timeframe}`));
    const storedRules: Array<{ symbol: string; timeframe: Timeframe; marketClass: 'crypto' | 'stocks' | 'metals' }> = [];

    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(ALERT_STORAGE_PREFIX)) continue;
      const suffix = key.slice(ALERT_STORAGE_PREFIX.length);
      const separator = suffix.lastIndexOf(':');
      if (separator < 1) continue;
      const symbol = suffix.slice(0, separator).toUpperCase();
      const timeframe = suffix.slice(separator + 1) as Timeframe;
      if (!(['1h', '4h', '8h', '1d', '1w', '1m'] as Timeframe[]).includes(timeframe)) continue;
      if (activeKeys.has(`${symbol}:${timeframe}`)) continue;

      const rawValue = localStorage.getItem(key);
      let storedMarketClass: 'crypto' | 'stocks' | 'metals' | undefined;
      try {
        const parsed = rawValue?.startsWith('{') ? JSON.parse(rawValue) : undefined;
        if (parsed?.enabled === false) continue;
        if (parsed?.marketClass === 'crypto' || parsed?.marketClass === 'stocks' || parsed?.marketClass === 'metals') {
          storedMarketClass = parsed.marketClass;
        }
      } catch {}
      if (rawValue !== 'true' && !storedMarketClass) continue;

      const catalogAsset = knownAssets.find(asset => asset.symbol.toUpperCase() === symbol);
      const marketClass = storedMarketClass || catalogAsset?.marketClass;
      if (marketClass === 'crypto' || marketClass === 'stocks' || marketClass === 'metals') {
        storedRules.push({ symbol, timeframe, marketClass });
      }
    }

    if (!storedRules.length) {
      if (knownAssets.length > 0) restoredBrowserRules.current = true;
      return;
    }

    restoredBrowserRules.current = true;
    void Promise.allSettled(storedRules.map(rule =>
      setBullishAlert(rule.symbol, rule.timeframe, rule.marketClass, true)
    )).then(() => loadDashboard());
  }, [data, knownAssets, loadDashboard]);

  const summary = useMemo(() => {
    const active = data?.activeAlerts || [];
    return {
      active: active.length,
      close: Math.min(10, new Set((data?.flipCandidates || []).map(candidate => `${candidate.marketClass}:${candidate.symbol}`)).size),
      confirmed: data?.confirmedFlips?.length || 0,
      strategies: data?.strategySetups?.length || 0
    };
  }, [data]);

  const clearAlertGroup = async (target: 'active' | 'history' | 'all') => {
    const label = target === 'active' ? 'alertele urmărite' : target === 'history' ? 'istoricul flipurilor' : 'toate alertele';
    if (!window.confirm(`Ștergi ${label}? Această acțiune nu poate fi anulată.`)) return;
    setClearingTarget(target);
    setError('');
    try {
      const result = await clearAlerts(target);
      if (target === 'active' || target === 'all') {
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith(ALERT_STORAGE_PREFIX)) localStorage.removeItem(key);
        });
      }
      setScanMessage(`Ștergere finalizată: ${result.removedActive} alerte active și ${result.removedHistory} flipuri din istoric.`);
      await loadDashboard();
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : 'Alertele nu au putut fi șterse.');
    } finally {
      setClearingTarget(null);
    }
  };

  const removeAlert = async (alert: ActiveAlertDashboardItem) => {
    setRemovingId(alert.id);
    try {
      await setBullishAlert(alert.symbol, alert.timeframe, alert.marketClass, false);
      localStorage.removeItem(`${ALERT_STORAGE_PREFIX}${alert.symbol}:${alert.timeframe}`);
      await loadDashboard();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'Alerta nu a putut fi ștearsă.');
    } finally {
      setRemovingId('');
    }
  };

  const prepareCandidateAlert = async (candidate: FlipCandidateDashboardItem) => {
    if (candidate.direction !== 'BULLISH') {
      onOpenAsset(candidate.symbol, candidate.marketClass, candidate.timeframe);
      return;
    }
    setPreparingId(candidate.id);
    setError('');
    try {
      await setBullishAlert(candidate.symbol, candidate.timeframe, candidate.marketClass, true);
      localStorage.setItem(
        `${ALERT_STORAGE_PREFIX}${candidate.symbol}:${candidate.timeframe}`,
        JSON.stringify({ enabled: true, marketClass: candidate.marketClass })
      );
      setScanMessage(`Alerta bullish pentru $${candidate.symbol} ${candidate.timeframe.toUpperCase()} este activă.`);
      await loadDashboard();
    } catch (prepareError) {
      setError(prepareError instanceof Error ? prepareError.message : 'Alerta nu a putut fi pregătită.');
    } finally {
      setPreparingId('');
    }
  };

  const startManualScan = async (scope: ManualAlertScanScope) => {
    setScanScope(scope);
    setScanMessage('');
    setError('');
    const watchlistPayload = watchlist.slice(0, 50).map(symbol => {
      const normalizedSymbol = symbol.replace(/^[$#]/, '').trim().toUpperCase();
      const asset = knownAssets.find(item => item.symbol.toUpperCase() === normalizedSymbol);
      const marketClass = asset?.marketClass === 'crypto' || asset?.marketClass === 'stocks' || asset?.marketClass === 'metals'
        ? asset.marketClass
        : undefined;
      return { symbol: normalizedSymbol, marketClass };
    });
    const pollTimer = window.setInterval(() => {
      void fetchAlertsDashboard().then(setData).catch(() => undefined);
    }, 2_500);

    try {
      const result = await runManualAlertScan(scope, watchlistPayload);
      if (result.lastError) throw new Error(result.lastError);
      const scanTypeLabel = scope === 'strategies'
        ? 'Scanarea strategiei validate (Donchian 55)'
        : scope === 'quick'
          ? 'Scanarea rapidă (Watchlist)'
          : 'Scanarea de flips (4H/8H/1D/1W)';
      setScanMessage(
        `${scanTypeLabel} s-a încheiat cu succes: `
        + `${result.scannedAssets}/${result.totalAssets} active verificate, ${result.matches} setupuri/semnale găsite, ${result.errors} erori.`
      );
      await loadDashboard();
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : 'Scanarea manuală nu a putut fi pornită.');
      await loadDashboard();
    } finally {
      window.clearInterval(pollTimer);
      setScanScope(null);
    }
  };

  const activeScanScope = scanScope || (data?.manualScan.running ? data.manualScan.scope : null);
  const activeManualScanStatus = activeScanScope && data?.manualScan.running && data.manualScan.scope === activeScanScope
    ? data.manualScan
    : null;
  const scanProgress = activeManualScanStatus?.totalAssets
    ? Math.min(100, Math.round((activeManualScanStatus.scannedAssets / activeManualScanStatus.totalAssets) * 100))
    : 0;
  const visibleCandidates = useMemo(() => {
    const query = candidateSearch.replace(/^[$#]/, '').trim().toUpperCase();
    const filtered = (data?.flipCandidates || []).filter(candidate =>
      (candidateFilter === 'ALL' || candidate.direction === candidateFilter)
      && (candidateTimeframe === 'ALL' || candidate.timeframe === candidateTimeframe)
      && (!query || candidate.symbol.includes(query))
    );
    if (query || candidateTimeframe !== 'ALL') return filtered.slice(0, 10);

    const seenAssets = new Set<string>();
    return filtered.filter(candidate => {
      const key = `${candidate.marketClass}:${candidate.symbol}`;
      if (seenAssets.has(key)) return false;
      seenAssets.add(key);
      return true;
    }).slice(0, 10);
  }, [candidateFilter, candidateSearch, candidateTimeframe, data?.flipCandidates]);
  const topConfirmedFlips = useMemo(() => {
    const now = Date.now();
    const query = confirmedSearch.replace(/^[$#]/, '').trim().toUpperCase();
    const maxAgeByTimeframe = { '4h': 12 * 60 * 60_000, '8h': 24 * 60 * 60_000, '1d': 72 * 60 * 60_000, '1w': 14 * 24 * 60 * 60_000 } as const;
    const seenAssets = new Set<string>();
    return (data?.confirmedFlips || [])
      .filter(candidate => now - candidate.candleTimestamp <= maxAgeByTimeframe[candidate.timeframe])
      .filter(candidate =>
        (confirmedFilter === 'ALL' || candidate.direction === confirmedFilter)
        && (confirmedTimeframe === 'ALL' || candidate.timeframe === confirmedTimeframe)
        && (!query || candidate.symbol.includes(query))
      )
      .sort((left, right) => right.priorityScore - left.priorityScore || right.candleTimestamp - left.candleTimestamp)
      .filter(candidate => {
        const key = `${candidate.marketClass}:${candidate.symbol}`;
        if (seenAssets.has(key)) return false;
        seenAssets.add(key);
        return true;
      })
      .slice(0, 10);
  }, [confirmedFilter, confirmedSearch, confirmedTimeframe, data?.confirmedFlips]);

  const candidateFilterControls = (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-1 rounded-lg border border-white/[0.06] bg-white/[0.025] p-1">
        {(['ALL', 'BULLISH', 'BEARISH'] as const).map(filter => (
          <button
            key={filter}
            type="button"
            onClick={() => setCandidateFilter(filter)}
            className={`rounded-md px-2.5 py-1.5 text-[10px] font-bold transition ${candidateFilter === filter
              ? filter === 'BULLISH'
                ? 'bg-emerald-500/15 text-emerald-300'
                : filter === 'BEARISH'
                  ? 'bg-rose-500/15 text-rose-300'
                  : 'bg-violet-500/15 text-violet-200'
              : 'text-slate-500 hover:text-slate-300'}`}
          >{filter === 'ALL' ? 'TOATE' : filter}</button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1 rounded-lg border border-white/[0.06] bg-white/[0.025] p-1">
        {(['ALL', '4h', '8h', '1d', '1w'] as const).map(timeframe => (
          <button
            key={timeframe}
            type="button"
            onClick={() => setCandidateTimeframe(timeframe)}
            className={`min-w-10 flex-1 rounded-md px-2 py-1.5 font-mono text-[10px] font-bold uppercase transition ${candidateTimeframe === timeframe
              ? 'bg-cyan-500/15 text-cyan-200'
              : 'text-slate-500 hover:text-slate-300'}`}
          >{timeframe === 'ALL' ? 'TF toate' : timeframe}</button>
        ))}
      </div>
      <input
        value={candidateSearch}
        onChange={event => setCandidateSearch(event.target.value)}
        placeholder="Caută asset în candidați, ex. ETH"
        className="w-full rounded-lg border border-white/[0.07] bg-white/[0.025] px-3 py-2 font-mono text-[11px] text-slate-200 outline-none transition placeholder:text-slate-600 focus:border-cyan-500/30"
      />
    </div>
  );

  const confirmedFilterControls = (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-1 rounded-lg border border-white/[0.06] bg-white/[0.025] p-1">
        {(['ALL', 'BULLISH', 'BEARISH'] as const).map(filter => (
          <button
            key={filter}
            type="button"
            onClick={() => setConfirmedFilter(filter)}
            className={`rounded-md px-2.5 py-1.5 text-[10px] font-bold transition ${confirmedFilter === filter
              ? filter === 'BULLISH'
                ? 'bg-emerald-500/15 text-emerald-300'
                : filter === 'BEARISH'
                  ? 'bg-rose-500/15 text-rose-300'
                  : 'bg-violet-500/15 text-violet-200'
              : 'text-slate-500 hover:text-slate-300'}`}
          >{filter === 'ALL' ? 'TOATE' : filter}</button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1 rounded-lg border border-white/[0.06] bg-white/[0.025] p-1">
        {(['ALL', '4h', '8h', '1d', '1w'] as const).map(timeframe => (
          <button
            key={timeframe}
            type="button"
            onClick={() => setConfirmedTimeframe(timeframe)}
            className={`min-w-10 flex-1 rounded-md px-2 py-1.5 font-mono text-[10px] font-bold uppercase transition ${confirmedTimeframe === timeframe
              ? 'bg-cyan-500/15 text-cyan-200'
              : 'text-slate-500 hover:text-slate-300'}`}
          >{timeframe === 'ALL' ? 'TF toate' : timeframe}</button>
        ))}
      </div>
      <input
        value={confirmedSearch}
        onChange={event => setConfirmedSearch(event.target.value)}
        placeholder="Caută asset confirmat, ex. ETH"
        className="w-full rounded-lg border border-white/[0.07] bg-white/[0.025] px-3 py-2 font-mono text-[11px] text-slate-200 outline-none transition placeholder:text-slate-600 focus:border-cyan-500/30"
      />
    </div>
  );

  const flipCandidateCards = visibleCandidates.length ? (
    <div className="grid gap-3 lg:grid-cols-2">
      {visibleCandidates.map((candidate, index) => (
        <FlipCandidateCard
          key={candidate.id}
          candidate={candidate}
          rank={index + 1}
          preparing={preparingId === candidate.id}
          alertActive={Boolean(data?.activeAlerts.some(alert =>
            alert.symbol === candidate.symbol && alert.timeframe === candidate.timeframe
          ))}
          onPrepare={() => void prepareCandidateAlert(candidate)}
          onOpen={() => onOpenAsset(candidate.symbol, candidate.marketClass, candidate.timeframe)}
        />
      ))}
    </div>
  ) : data?.dailyRegimeScan.lastCompletedAt ? (
    <div className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02] px-5 py-8 text-center text-xs text-slate-500">
      Nu există candidați {candidateFilter === 'ALL' ? '' : candidateFilter.toLowerCase()} în Top 10 curent.
    </div>
  ) : (
    <div className="rounded-2xl border border-dashed border-violet-500/20 bg-violet-500/[0.04] px-5 py-8 text-center">
      <ScanSearch className="mx-auto h-7 w-7 text-violet-400" />
      <h3 className="mt-3 text-sm font-semibold text-slate-200">Rulează prima scanare completă</h3>
      <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-slate-500">Top 10 va fi populat după analiza universului crypto, stocks și metale.</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/[0.08] via-background-card to-violet-500/[0.05] p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-cyan-300">
              <BellRing className="h-5 w-5" />
              <span className="font-mono text-[11px] font-bold uppercase tracking-[0.2em]">Alert Command Center</span>
            </div>
            <h1 className="text-xl font-bold text-white sm:text-2xl">Alertele mele MoneyLine & Strategii</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Centrul separă <strong className="text-amber-300">strategia LONG validată</strong> (Weekly Trend + Donchian 55/20, numai stocks/ETF, risc maxim 4%) de <strong className="text-violet-300">Top 10 Flips</strong> (4H/8H/1D/1W, toate clasele).
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadDashboard()}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-cyan-500/30 hover:text-cyan-300 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Actualizează
          </button>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <SummaryCard icon={Sparkles} label="Strategii Trading (Donchian 55)" value={summary.strategies} tone="amber" />
          <SummaryCard icon={TrendingUp} label="Top Aproape Flip" value={summary.close} tone="cyan" />
          <SummaryCard icon={CheckCircle2} label="Flipuri Confirmate" value={summary.confirmed} tone="emerald" />
          <SummaryCard icon={BellRing} label="Alerte Urmărite" value={summary.active} tone="slate" />
        </div>

        <div className="mt-4 rounded-xl border border-violet-500/20 bg-violet-500/[0.06] p-3">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-violet-400/20 bg-violet-500/10">
                <CalendarClock className="h-4 w-4 text-violet-300" />
              </div>
              <div>
                <div className="text-xs font-bold text-violet-200">Comenzi de scanare separate</div>
                <p className="mt-1 max-w-2xl text-[11px] leading-5 text-slate-400">
                  Alege între <strong className="text-amber-300">Donchian 55 validat</strong> (numai stocks/ETF) și <strong className="text-violet-300">Top 10 Flips</strong> (4H, 8H, 1D, 1W). Modelele Macro/Sniper/Short rămân doar pentru cercetare, fără alerte automate.
                </p>
              </div>
            </div>

            <div className="flex shrink-0 flex-col gap-2 sm:items-end">
              <div className="text-left sm:text-right">
                <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                  {activeScanScope
                    ? `${activeScanScope === 'strategies' ? 'Scanare Strategii' : activeScanScope === 'quick' ? 'Scanare Rapidă' : 'Scanare Flips'} în curs`
                    : data?.manualScan.lastCompletedAt ? 'Ultima scanare' : 'Gata de rulare'}
                </div>
                <div className="mt-1 font-mono text-xs font-bold text-violet-200">
                  {activeScanScope
                    ? activeManualScanStatus?.totalAssets
                      ? `${activeManualScanStatus.scannedAssets}/${activeManualScanStatus.totalAssets} active · ${activeManualScanStatus.matches} setupuri`
                      : 'Pregătesc universul de scanare…'
                    : data?.manualScan.lastCompletedAt
                      ? `${formatDate(data.manualScan.lastCompletedAt)} · ${data.manualScan.matches} rezultate`
                      : 'Apasă un buton pentru a porni scanarea'}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void startManualScan('strategies')}
                  disabled={Boolean(activeScanScope)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-[11px] font-bold text-amber-200 shadow-sm transition hover:bg-amber-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Sparkles className={`h-3.5 w-3.5 ${activeScanScope === 'strategies' ? 'animate-pulse' : ''}`} /> Scanare Strategii (Donchian 55)
                </button>
                <button
                  type="button"
                  onClick={() => void startManualScan('flips')}
                  disabled={Boolean(activeScanScope)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-violet-500/40 bg-violet-500/15 px-3 py-2 text-[11px] font-bold text-violet-200 transition hover:bg-violet-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ScanSearch className={`h-3.5 w-3.5 ${activeScanScope === 'flips' || activeScanScope === 'full' ? 'animate-pulse' : ''}`} /> Scanare Top 10 Flips
                </button>
                <button
                  type="button"
                  onClick={() => void startManualScan('quick')}
                  disabled={Boolean(activeScanScope)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-[11px] font-bold text-cyan-200 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Zap className={`h-3.5 w-3.5 ${activeScanScope === 'quick' ? 'animate-pulse' : ''}`} /> Rapid (Watchlist)
                </button>
              </div>
            </div>
          </div>

          {activeScanScope && (
            <div className="mt-3">
              <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-400 via-cyan-400 to-violet-400 transition-all duration-500"
                  style={{ width: `${Math.max(3, scanProgress)}%` }}
                />
              </div>
              <p className="mt-2 text-[10px] text-slate-400">Scanarea rulează în fundal pe toate activele; semnalele eligibile vor trimite automat alertă pe Telegram.</p>
            </div>
          )}
        </div>
      </section>

      {scanMessage && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> {scanMessage}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] pb-3">
        <button
          type="button"
          onClick={() => setActiveTab('ALL')}
          className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${activeTab === 'ALL' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'text-slate-400 hover:text-slate-200'}`}
        >
          TOATE ({summary.strategies + summary.close + summary.confirmed + summary.active})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('STRATEGIES')}
          className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${activeTab === 'STRATEGIES' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'text-slate-400 hover:text-slate-200'}`}
        >
          STRATEGII DE TRADING ({summary.strategies})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('FLIPS')}
          className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${activeTab === 'FLIPS' ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30' : 'text-slate-400 hover:text-slate-200'}`}
        >
          TOP 10 FLIPURI ({summary.close + summary.confirmed})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('WATCHED')}
          className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${activeTab === 'WATCHED' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'text-slate-400 hover:text-slate-200'}`}
        >
          ALERTE URMĂRITE ({summary.active})
        </button>
      </div>

      {/* 1. STRATEGIES SECTION */}
      {(activeTab === 'ALL' || activeTab === 'STRATEGIES') && (
        <section className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-300" />
                <h2 className="text-sm font-bold text-slate-100">Strategii de Trading (Weekly Trend + Donchian 55/20 LONG)</h2>
              </div>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
                Numai stocks/ETF: Fast + Slow Weekly bullish, SMA 40 Weekly crescător, SMA 50/200 Daily aliniate și crescătoare, momentum pozitiv, breakout Donchian 55, volatilitate controlată și stop maxim 4%.
              </p>
            </div>
            {data?.strategySetups?.length ? (
              <span className="font-mono text-xs font-bold text-amber-300">
                {data.strategySetups.length} setupuri active
              </span>
            ) : null}
          </div>

          {data?.strategySetups?.length ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {data.strategySetups.map((setup, index) => (
                <StrategySetupCard
                  key={`${setup.strategy}:${setup.symbol}:${setup.candleTimestamp || index}`}
                  setup={setup}
                  onOpen={() => onOpenAsset(setup.symbol, setup.marketClass, setup.timeframe)}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-amber-500/20 bg-amber-500/[0.04] px-5 py-8 text-center">
              <Sparkles className="mx-auto h-7 w-7 text-amber-400" />
              <h3 className="mt-3 text-sm font-semibold text-slate-200">Niciun setup de strategie activ în memorie</h3>
              <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-slate-400">
                Apasă pe <strong className="text-amber-300">„Scanare Strategii (Donchian 55)”</strong> pentru a analiza universul stocks/ETF. Lipsa rezultatelor este normală: filtrele sunt intenționat rare și conservatoare.
              </p>
              <button
                type="button"
                onClick={() => void startManualScan('strategies')}
                disabled={Boolean(activeScanScope)}
                className="mt-4 inline-flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/20 px-4 py-2 text-xs font-bold text-amber-200 transition hover:bg-amber-500/30 disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" /> Pornește Scanarea de Strategii
              </button>
            </div>
          )}
        </section>
      )}

      {/* 2. TOP 10 FLIPS SECTION */}
      {(activeTab === 'ALL' || activeTab === 'FLIPS') && (
        <>
          <section className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Radar className="h-4 w-4 text-violet-300" />
                  <h2 className="text-sm font-bold text-slate-100">Top 10 aproape de flip</h2>
                </div>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
                  Un singur candidat per asset, din 4H/8H/1D/1W, ordonat după distanța ATR, alinierea ML 1W, SMA 50/200 și volum. „Așteaptă închiderea” nu este încă flip confirmat.
                </p>
              </div>
              {candidateFilterControls}
            </div>

            {flipCandidateCards}
          </section>

          <section className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                  <h2 className="text-sm font-bold text-slate-100">Top 10 alerte de trading confirmate</h2>
                </div>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
                  Cele mai recente flipuri pe lumânări închise, cu prioritate pentru 4H și confirmări 1W/SMA. Scorul este tehnic, nu procent de reușită.
                </p>
              </div>
              <div className="space-y-2">
                {confirmedFilterControls}
                <button
                  type="button"
                  onClick={() => void clearAlertGroup('history')}
                  disabled={clearingTarget !== null || !data?.confirmedFlips?.length}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-rose-500/25 bg-rose-500/[0.06] px-3 py-2 text-[10px] font-bold text-rose-300 transition hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Trash2 className={`h-3.5 w-3.5 ${clearingTarget === 'history' ? 'animate-pulse' : ''}`} /> Șterge istoricul
                </button>
              </div>
            </div>

            {topConfirmedFlips.length ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {topConfirmedFlips.map((candidate, index) => (
                  <ConfirmedFlipCard
                    key={`${candidate.id}:${candidate.candleTimestamp}`}
                    candidate={candidate}
                    rank={index + 1}
                    onOpen={() => onOpenAsset(candidate.symbol, candidate.marketClass, candidate.timeframe)}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02] px-5 py-8 text-center text-xs text-slate-500">
                Niciun flip confirmat nu corespunde filtrelor selectate în fereastra activă.
              </div>
            )}
          </section>
        </>
      )}

      {/* 3. WATCHED ALERTS SECTION */}
      {(activeTab === 'ALL' || activeTab === 'WATCHED') && (
        <section className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-100">Alerte urmărite</h2>
              <p className="mt-1 text-xs text-slate-500">Progresul este normalizat cu ATR până la Marginea Nor Slow, nivelul care confirmă flipul.</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden font-mono text-[10px] text-slate-600 sm:inline">AUTO REFRESH 60S</span>
              <button
                type="button"
                onClick={() => void clearAlertGroup('active')}
                disabled={clearingTarget !== null || !data?.activeAlerts.length}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-500/25 bg-rose-500/[0.06] px-2.5 py-1.5 text-[10px] font-bold text-rose-300 transition hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Trash2 className={`h-3.5 w-3.5 ${clearingTarget === 'active' ? 'animate-pulse' : ''}`} /> Șterge toate
              </button>
            </div>
          </div>

          {loading && !data ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {[0, 1].map(item => <div key={item} className="h-56 animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.03]" />)}
            </div>
          ) : data?.activeAlerts.length ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {data.activeAlerts
                .slice()
                .sort((left, right) => right.progressPercent - left.progressPercent)
                .map(alert => (
                  <ActiveAlertCard
                    key={alert.id}
                    alert={alert}
                    removing={removingId === alert.id}
                    onRemove={() => void removeAlert(alert)}
                    onOpen={() => onOpenAsset(alert.symbol, alert.marketClass, alert.timeframe)}
                  />
                ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/[0.10] bg-white/[0.02] px-5 py-12 text-center">
              <BellRing className="mx-auto h-8 w-8 text-slate-600" />
              <h3 className="mt-3 text-sm font-semibold text-slate-200">Nu ai alerte active</h3>
              <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-slate-500">Deschide un asset, alege timeframe-ul și apasă „Alertă plan”. Aplicația îl va monitoriza automat.</p>
            </div>
          )}
        </section>
      )}

    </div>
  );
};

const SummaryCard: React.FC<{ icon: React.ElementType; label: string; value: number | string; tone: 'cyan' | 'amber' | 'emerald' | 'rose' | 'slate' }> = ({ icon: Icon, label, value, tone }) => {
  const tones = {
    cyan: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/20',
    amber: 'text-amber-300 bg-amber-500/10 border-amber-500/20',
    emerald: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20',
    rose: 'text-rose-300 bg-rose-500/10 border-rose-500/20',
    slate: 'text-slate-200 bg-white/[0.03] border-white/[0.08]'
  };
  return (
    <div className={`rounded-xl border p-3 ${tones[tone]}`}>
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider opacity-75"><Icon className="h-3.5 w-3.5" /> {label}</div>
      <div className="mt-2 font-mono text-lg font-bold text-white">{value}</div>
    </div>
  );
};

const StrategySetupCard: React.FC<{
  setup: StrategyAlertSnapshot;
  onOpen: () => void;
}> = ({ setup, onOpen }) => {
  const isConfirmed = setup.stage === 'CONFIRMED';
  const isLong = setup.side === 'LONG';
  const isDonchian = setup.strategy === 'WEEKLY_DONCHIAN_55_LONG';
  const isMacro = setup.strategy === 'MONEYLINE_MACRO_LONG';
  const isSniper = setup.strategy === 'MONEYLINE_4H_SNIPER_LONG';

  const strategyTitle = isDonchian
    ? 'Weekly Trend + Donchian 55/20 LONG'
    : isMacro
      ? 'MoneyLine Macro Breakout LONG'
      : isSniper
        ? 'MoneyLine 4H Sniper LONG'
        : 'Bear Rally Fade SHORT';

  const tone = isConfirmed
    ? isLong ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300' : 'border-rose-500/25 bg-rose-500/10 text-rose-300'
    : 'border-amber-500/25 bg-amber-500/10 text-amber-300';

  const stageLabel = isConfirmed
    ? isDonchian ? 'Breakout Donchian 55 Confirmat' : 'Confirmat pe lumânare închisă'
    : isDonchian ? 'Aproape de Donchian 55 (Armat)' : 'Setup Armat';

  return (
    <article className="overflow-hidden rounded-2xl border border-white/[0.07] bg-background-card p-4 shadow-sm transition hover:border-amber-500/20">
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={onOpen} className="min-w-0 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <strong className="font-mono text-lg text-white">${setup.symbol}</strong>
            <span className="rounded-md border border-cyan-500/25 bg-cyan-500/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-cyan-300">
              {setup.timeframe.toUpperCase()}
            </span>
            <span className="rounded-md border border-white/[0.07] bg-white/[0.03] px-1.5 py-0.5 text-[9px] uppercase text-slate-500">
              {setup.marketClass}
            </span>
          </div>
          <div className="mt-1 text-xs font-semibold text-slate-200">{strategyTitle}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
            <Clock3 className="h-3 w-3" /> {formatDate(setup.candleTimestamp)}
          </div>
        </button>
        <span className={`shrink-0 rounded-lg border px-2 py-1 font-mono text-[10px] font-black ${tone}`}>
          {isConfirmed ? (isLong ? '🟢 CONFIRMAT LONG' : '🔴 CONFIRMAT SHORT') : '🟡 ARMAT'}
        </span>
      </div>

      <div className="mt-3 text-xs text-slate-400">
        <span className={`font-semibold ${isConfirmed ? (isLong ? 'text-emerald-300' : 'text-rose-300') : 'text-amber-300'}`}>
          {stageLabel}
        </span>
        {setup.distanceToBreakoutPercent !== undefined && !isConfirmed && (
          <span className="ml-2 font-mono text-[11px] text-amber-200">
            ({setup.distanceToBreakoutPercent.toFixed(2)}% sub Donchian 55)
          </span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <LevelBox label="Preț semnal" value={formatPrice(setup.signalPrice)} tone="slate" />
        <LevelBox label="Stop Loss" value={formatPrice(setup.stopLoss)} tone="rose" />
        <LevelBox label="Target 1 (1.5R)" value={formatPrice(setup.target1)} tone="emerald" />
        <LevelBox label="Target 2 (3.0R)" value={formatPrice(setup.target2)} tone="emerald" />
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <LevelBox label="Risc maxim" value={`-${setup.riskPercent.toFixed(2)}%`} tone={setup.riskPercent <= 4 ? 'cyan' : 'amber'} />
        <LevelBox label="Donchian 55" value={formatPrice(setup.donchianHigh55)} tone="cyan" />
        <LevelBox label="Trailing Low 20" value={formatPrice(setup.donchianLow20)} tone="slate" />
        <LevelBox label="ATR Percentile" value={setup.atrPercentile !== undefined ? `${setup.atrPercentile.toFixed(1)}%` : '—'} tone="slate" />
      </div>

      <button
        type="button"
        onClick={onOpen}
        className="mt-3 flex w-full items-center justify-between border-t border-white/[0.05] pt-3 text-[11px] text-slate-500 transition hover:text-cyan-300"
      >
        <span className="truncate">{setup.exitRule}</span>
        <span className="flex shrink-0 items-center gap-1 font-semibold text-cyan-300">
          Deschide graficul <ChevronRight className="h-3.5 w-3.5" />
        </span>
      </button>
    </article>
  );
};

const FlipCandidateCard: React.FC<{
  candidate: FlipCandidateDashboardItem;
  rank: number;
  preparing: boolean;
  alertActive: boolean;
  onPrepare: () => void;
  onOpen: () => void;
}> = ({ candidate, rank, preparing, alertActive, onPrepare, onOpen }) => {
  const bullish = candidate.direction === 'BULLISH';
  const directionTone = bullish
    ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
    : 'border-rose-500/25 bg-rose-500/10 text-rose-300';
  const statusLabel = candidate.status === 'CONFIRMED'
    ? 'Flip nou confirmat'
    : candidate.status === 'AWAITING_CLOSE'
      ? 'Așteaptă închiderea'
      : candidate.status === 'VERY_CLOSE'
        ? 'Foarte aproape'
        : 'Se apropie';
  const statusTone = candidate.status === 'CONFIRMED'
    ? bullish ? 'text-emerald-300' : 'text-rose-300'
    : candidate.status === 'AWAITING_CLOSE'
      ? 'text-cyan-300'
      : candidate.status === 'VERY_CLOSE'
        ? 'text-amber-300'
        : 'text-slate-400';
  const proximity = candidate.status === 'CONFIRMED' || candidate.status === 'AWAITING_CLOSE'
    ? 100
    : Math.max(4, Math.min(98, Math.round((1 - candidate.distanceAtr / 2.5) * 100)));
  const alignmentCount = [candidate.weeklyAligned, candidate.sma50Aligned, candidate.sma200Aligned].filter(Boolean).length;

  return (
    <article className="overflow-hidden rounded-2xl border border-white/[0.07] bg-background-card shadow-sm transition hover:border-violet-500/20">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <button type="button" onClick={onOpen} className="flex min-w-0 items-start gap-3 text-left">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-violet-500/20 bg-violet-500/10 font-mono text-xs font-black text-violet-200">#{rank}</div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <strong className="font-mono text-lg text-white">${candidate.symbol}</strong>
                <span className="rounded-md border border-cyan-500/25 bg-cyan-500/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-cyan-300">{candidate.timeframe.toUpperCase()}</span>
                <span className="rounded-md border border-white/[0.07] bg-white/[0.03] px-1.5 py-0.5 text-[9px] uppercase text-slate-500">{candidate.marketClass}</span>
              </div>
              <div className={`mt-1 text-[11px] font-semibold ${statusTone}`}>{statusLabel}</div>
            </div>
          </button>
          <span className={`shrink-0 rounded-lg border px-2 py-1 font-mono text-[10px] font-black ${directionTone}`}>
            {bullish ? '▲ BULL FLIP' : '▼ BEAR FLIP'}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-[1fr_auto] items-end gap-3">
          <div>
            <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider text-slate-600">
              <span>Distanță până la confirmare</span>
              <span>{proximity}%</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
              <div className={`h-full rounded-full ${bullish ? 'bg-emerald-400' : 'bg-rose-400'}`} style={{ width: `${proximity}%` }} />
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono text-xl font-black text-white">{candidate.distanceAtr.toFixed(2)} ATR</div>
            <div className="font-mono text-[10px] text-slate-500">{candidate.distancePercent.toFixed(2)}%</div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <LevelBox label="Preț acum" value={formatPrice(candidate.currentPrice)} tone="slate" />
          <LevelBox label={`${bullish ? 'Peste' : 'Sub'} Slow`} value={formatPrice(candidate.triggerPrice)} tone={bullish ? 'emerald' : 'rose'} />
          <LevelBox label="ML 1W" value={`${candidate.weeklyTier} · ${candidate.weeklyScore > 0 ? '+' : ''}${candidate.weeklyScore}`} tone={candidate.weeklyAligned ? (bullish ? 'emerald' : 'rose') : 'slate'} />
          <LevelBox label="Prioritate" value={`${candidate.priorityScore.toFixed(0)}/100`} tone={candidate.priorityScore >= 80 ? 'amber' : 'slate'} />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[9px] font-bold uppercase tracking-wide">
          <span className={`rounded-md border px-2 py-1 ${candidate.weeklyAligned ? directionTone : 'border-white/[0.06] text-slate-600'}`}>1W aliniat</span>
          <span className={`rounded-md border px-2 py-1 ${candidate.sma50Aligned ? directionTone : 'border-white/[0.06] text-slate-600'}`}>SMA 50</span>
          <span className={`rounded-md border px-2 py-1 ${candidate.sma200Aligned ? directionTone : 'border-white/[0.06] text-slate-600'}`}>SMA 200</span>
          <span className="rounded-md border border-white/[0.06] px-2 py-1 text-slate-500">RVOL {candidate.rvol.toFixed(2)}x</span>
          <span className="ml-auto text-slate-600">Confluență {alignmentCount}/3</span>
        </div>
      </div>

      <div className="grid grid-cols-2 border-t border-white/[0.05]">
        <button type="button" onClick={onOpen} className="flex items-center justify-center gap-1.5 px-3 py-3 text-[11px] font-semibold text-slate-400 transition hover:bg-white/[0.03] hover:text-cyan-300">
          Deschide graficul <ChevronRight className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onPrepare}
          disabled={preparing || alertActive}
          className={`flex items-center justify-center gap-1.5 border-l border-white/[0.05] px-3 py-3 text-[11px] font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${bullish
            ? 'text-emerald-300 hover:bg-emerald-500/[0.06]'
            : 'text-rose-300 hover:bg-rose-500/[0.06]'}`}
        >
          <BellPlus className={`h-3.5 w-3.5 ${preparing ? 'animate-pulse' : ''}`} />
          {alertActive ? 'Alertă activă' : bullish ? 'Pregătește alerta' : 'Vezi pragul bearish'}
        </button>
      </div>
    </article>
  );
};

const ConfirmedFlipCard: React.FC<{
  candidate: FlipCandidateDashboardItem;
  rank: number;
  onOpen: () => void;
}> = ({ candidate, rank, onOpen }) => {
  const bullish = candidate.direction === 'BULLISH';
  const tone = bullish
    ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
    : 'border-rose-500/25 bg-rose-500/10 text-rose-300';
  const alignmentCount = [candidate.weeklyAligned, candidate.sma50Aligned, candidate.sma200Aligned].filter(Boolean).length;
  return (
    <article className="rounded-2xl border border-white/[0.07] bg-background-card p-4 shadow-sm transition hover:border-emerald-500/20">
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={onOpen} className="flex min-w-0 items-start gap-3 text-left">
          <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border font-mono text-xs font-black ${tone}`}>#{rank}</div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <strong className="font-mono text-lg text-white">${candidate.symbol}</strong>
              <span className="rounded-md border border-cyan-500/25 bg-cyan-500/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-cyan-300">{candidate.timeframe.toUpperCase()}</span>
              <span className="rounded-md border border-white/[0.07] bg-white/[0.03] px-1.5 py-0.5 text-[9px] uppercase text-slate-500">{candidate.marketClass}</span>
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500"><Clock3 className="h-3 w-3" /> Confirmat {formatDate(candidate.candleTimestamp)}</div>
          </div>
        </button>
        <span className={`shrink-0 rounded-lg border px-2 py-1 font-mono text-[10px] font-black ${tone}`}>
          {bullish ? '▲ BULL FLIP' : '▼ BEAR FLIP'}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <LevelBox label="Preț confirmare" value={formatPrice(candidate.currentPrice)} tone="slate" />
        <LevelBox label="Scor setup" value={`${candidate.priorityScore.toFixed(0)}/100`} tone={candidate.priorityScore >= 80 ? 'amber' : 'cyan'} />
        <LevelBox label="ML 1W" value={`${candidate.weeklyTier} · ${candidate.weeklyScore > 0 ? '+' : ''}${candidate.weeklyScore}`} tone={candidate.weeklyAligned ? (bullish ? 'emerald' : 'rose') : 'slate'} />
        <LevelBox label="RVOL" value={`${candidate.rvol.toFixed(2)}x`} tone={candidate.rvol >= 1.2 ? 'emerald' : 'slate'} />
      </div>

      <button type="button" onClick={onOpen} className="mt-3 flex w-full items-center justify-between border-t border-white/[0.05] pt-3 text-[11px] text-slate-500 transition hover:text-cyan-300">
        <span>Confluență {alignmentCount}/3 · SMA50 {candidate.sma50Aligned ? 'aliniat' : 'neconfirmat'} · SMA200 {candidate.sma200Aligned ? 'aliniat' : 'neconfirmat'}</span>
        <span className="flex items-center gap-1 font-semibold text-cyan-300">Deschide {candidate.timeframe.toUpperCase()} <ChevronRight className="h-3.5 w-3.5" /></span>
      </button>
    </article>
  );
};

const ActiveAlertCard: React.FC<{ alert: ActiveAlertDashboardItem; removing: boolean; onRemove: () => void; onOpen: () => void }> = ({ alert, removing, onRemove, onOpen }) => {
  const meta = statusMeta[alert.status];
  return (
    <article className="rounded-2xl border border-white/[0.07] bg-background-card p-4 shadow-sm transition hover:border-cyan-500/20">
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={onOpen} className="min-w-0 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <strong className="font-mono text-lg text-white">${alert.symbol}</strong>
            <span className="rounded-md border border-cyan-500/25 bg-cyan-500/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-cyan-300">{alert.timeframe.toUpperCase()}</span>
            <span className="rounded-md border border-white/[0.07] bg-white/[0.03] px-1.5 py-0.5 text-[9px] uppercase text-slate-500">{alert.marketClass}</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-500">ML {alert.moneyLineTier || '—'} {alert.moneyLineScore !== undefined ? `(${alert.moneyLineScore > 0 ? '+' : ''}${alert.moneyLineScore})` : ''}</div>
        </button>
        <div className="flex items-center gap-2">
          <span className={`rounded-lg border px-2 py-1 text-[10px] font-bold ${meta.tone}`}>{meta.label}</span>
          <button
            type="button"
            onClick={event => { event.stopPropagation(); onRemove(); }}
            disabled={removing}
            className="grid h-8 w-8 place-items-center rounded-lg border border-white/[0.07] text-slate-500 transition hover:border-rose-500/30 hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-50"
            title="Șterge alerta"
          ><Trash2 className={`h-4 w-4 ${removing ? 'animate-pulse' : ''}`} /></button>
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-end justify-between gap-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Progres spre trigger</div>
            <div className="mt-1 text-xs text-slate-300">
              {alert.status === 'CONFIRMED'
                ? 'Flip bullish confirmat; alerta așteaptă următorul ciclu.'
                : alert.status === 'AWAITING_CLOSE'
                  ? `Prețul a trecut ${formatPrice(alert.triggerPrice)}; trebuie să se închidă lumânarea.`
                  : `Mai trebuie aproximativ +${alert.distancePercent.toFixed(2)}% până la ${formatPrice(alert.triggerPrice)}.`}
            </div>
          </div>
          <strong className="font-mono text-2xl text-white">{alert.progressPercent}%</strong>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/[0.05]">
          <div className={`h-full rounded-full transition-all duration-700 ${meta.bar}`} style={{ width: `${Math.max(2, alert.progressPercent)}%` }} />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <LevelBox label="Preț acum" value={formatPrice(alert.currentPrice)} tone="slate" />
        <LevelBox label="Trigger Slow" value={formatPrice(alert.triggerPrice)} tone="cyan" />
        <LevelBox label="Fast" value={alert.fastBullish ? 'Bullish' : 'Bearish'} tone={alert.fastBullish ? 'emerald' : 'rose'} />
        <LevelBox label="Slow" value={alert.slowBullish ? 'Bullish' : 'Bearish'} tone={alert.slowBullish ? 'emerald' : 'rose'} />
      </div>

      {alert.lastPlan && (
        <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl border border-white/[0.06] bg-black/10 p-2.5">
          <div className="flex items-center gap-2"><Target className="h-3.5 w-3.5 text-cyan-400" /><div><div className="text-[9px] uppercase text-slate-600">Ultimul entry</div><div className="font-mono text-[11px] text-cyan-300">{formatPrice(alert.lastPlan.suggestedEntry)}</div></div></div>
          <div className="flex items-center gap-2"><ShieldAlert className="h-3.5 w-3.5 text-rose-400" /><div><div className="text-[9px] uppercase text-slate-600">Ultimul SL</div><div className="font-mono text-[11px] text-rose-300">{formatPrice(alert.lastPlan.stopLoss)}</div></div></div>
          <div className="flex items-center gap-2"><TrendingUp className="h-3.5 w-3.5 text-emerald-400" /><div><div className="text-[9px] uppercase text-slate-600">Ultimul TP2</div><div className="font-mono text-[11px] text-emerald-300">{formatPrice(alert.lastPlan.target2)}</div></div></div>
        </div>
      )}

      {alert.lastError && <div className="mt-3 text-[11px] text-rose-300">{alert.lastError}</div>}
      <button type="button" onClick={onOpen} className="mt-3 flex w-full items-center justify-between border-t border-white/[0.05] pt-3 text-[11px] font-semibold text-slate-500 transition hover:text-cyan-300">
        <span>Setată {formatDate(alert.createdAt)} · evaluată {formatDate(alert.lastEvaluatedCandle)}</span>
        <span className="flex items-center gap-1">Deschide graficul <ChevronRight className="h-3.5 w-3.5" /></span>
      </button>
    </article>
  );
};

const LevelBox: React.FC<{ label: string; value: string; tone: 'slate' | 'cyan' | 'rose' | 'amber' | 'emerald' }> = ({ label, value, tone }) => {
  const colors = { slate: 'text-slate-200', cyan: 'text-cyan-300', rose: 'text-rose-300', amber: 'text-amber-300', emerald: 'text-emerald-300' };
  return (
    <div className="rounded-lg border border-white/[0.05] bg-white/[0.025] px-2.5 py-2">
      <div className="text-[9px] font-bold uppercase tracking-wider text-slate-600">{label}</div>
      <div className={`mt-1 truncate font-mono text-[11px] font-bold ${colors[tone]}`}>{value}</div>
    </div>
  );
};
