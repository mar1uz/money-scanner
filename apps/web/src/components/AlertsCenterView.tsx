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
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  Zap
} from 'lucide-react';
import { AssetScannerRow, StrategyAlertSnapshot, Timeframe } from '../types.js';
import {
  ActiveAlertDashboardItem,
  AlertsDashboardResponse,
  AlertProgressStatus,
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

const actionLabel = (action?: 'READY' | 'WAIT_RETEST' | 'AVOID') => {
  if (action === 'READY') return 'Setup valid';
  if (action === 'WAIT_RETEST') return 'Așteaptă retest';
  if (action === 'AVOID') return 'Evită';
  return 'Plan indisponibil';
};

export const AlertsCenterView: React.FC<AlertsCenterViewProps> = ({ knownAssets, watchlist, onOpenAsset }) => {
  const [data, setData] = useState<AlertsDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [scanScope, setScanScope] = useState<ManualAlertScanScope | null>(null);
  const [scanMessage, setScanMessage] = useState('');
  const [removingId, setRemovingId] = useState('');
  const [preparingId, setPreparingId] = useState('');
  const [candidateFilter, setCandidateFilter] = useState<'ALL' | 'BULLISH' | 'BEARISH'>('ALL');
  const [strategyFilter, setStrategyFilter] = useState<'ALL' | 'MACRO' | 'CONNORS' | 'SNIPER' | 'BEAR_FADE'>('ALL');
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
      active: active.length + (data?.strategySetups?.length || 0),
      close: active.filter(alert => ['AWAITING_CLOSE', 'VERY_CLOSE', 'CLOSE'].includes(alert.status)).length,
      confirmed: data?.history.length || 0
    };
  }, [data]);

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
      setScanMessage(
        `${scope === 'quick' ? 'Scanarea rapidă' : 'Scanarea completă'} s-a încheiat: `
        + `${result.scannedAssets}/${result.totalAssets} active verificate, ${result.matches} setup-uri, ${result.errors} erori.`
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
  const visibleCandidates = (data?.flipCandidates || []).filter(candidate =>
    candidateFilter === 'ALL' || candidate.direction === candidateFilter
  );

  const visibleStrategies = useMemo(() => {
    if (!data?.strategySetups) return [];
    if (strategyFilter === 'ALL') return data.strategySetups;
    if (strategyFilter === 'MACRO') return data.strategySetups.filter(s => s.strategy === 'MONEYLINE_MACRO_LONG');
    if (strategyFilter === 'CONNORS') return data.strategySetups.filter(s => s.strategy === 'CONNORS_RSI2_LONG');
    if (strategyFilter === 'SNIPER') return data.strategySetups.filter(s => s.strategy === 'MONEYLINE_4H_SNIPER_LONG');
    if (strategyFilter === 'BEAR_FADE') return data.strategySetups.filter(s => s.strategy === 'BEAR_RALLY_FADE_SHORT');
    return data.strategySetups;
  }, [data?.strategySetups, strategyFilter]);

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/[0.08] via-background-card to-violet-500/[0.05] p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-cyan-300">
              <BellRing className="h-5 w-5" />
              <span className="font-mono text-[11px] font-bold uppercase tracking-[0.2em]">Alert Command Center</span>
            </div>
            <h1 className="text-xl font-bold text-white sm:text-2xl">Alertele mele MoneyLine</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              MoneyLine, Connors RSI(2) LONG și Bear Rally Fade SHORT sunt evaluate numai pe lumânări închise. Armările nu recomandă intrarea; doar confirmările sunt trimise ca setup executabil.
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
          <SummaryCard icon={BellRing} label="Alerte active" value={summary.active} tone="cyan" />
          <SummaryCard icon={TrendingUp} label="Aproape de trigger" value={summary.close} tone="amber" />
          <SummaryCard icon={CheckCircle2} label="Declanșări salvate" value={summary.confirmed} tone="emerald" />
          <SummaryCard icon={Send} label="Telegram" value={data?.telegramConfigured ? 'Conectat' : 'Neconfigurat'} tone={data?.telegramConfigured ? 'emerald' : 'rose'} />
        </div>

        <div className="mt-4 rounded-xl border border-violet-500/20 bg-violet-500/[0.06] p-3">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-violet-400/20 bg-violet-500/10">
                <CalendarClock className="h-4 w-4 text-violet-300" />
              </div>
              <div>
                <div className="text-xs font-bold text-violet-200">Scanare ML 1W → ML 1D + SMA 50</div>
                <p className="mt-1 max-w-2xl text-[11px] leading-5 text-slate-400">
                  Automat zilnic la <strong className="text-slate-200">12:00 Europe/Oslo</strong>. Rapid verifică watchlist-ul și alertele active; Complet verifică întregul univers crypto, stocks și metale.
                </p>
              </div>
            </div>

            <div className="flex shrink-0 flex-col gap-2 sm:items-end">
              <div className="text-left sm:text-right">
                <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                  {activeScanScope
                    ? `${activeScanScope === 'quick' ? 'Scanare rapidă' : 'Scanare completă'} în curs`
                    : data?.dailyRegimeScan.lastCompletedAt ? 'Ultima scanare completă' : 'Programată'}
                </div>
                <div className="mt-1 font-mono text-xs font-bold text-violet-200">
                  {activeScanScope
                    ? activeManualScanStatus?.totalAssets
                      ? `${activeManualScanStatus.scannedAssets}/${activeManualScanStatus.totalAssets} active · ${activeManualScanStatus.matches} setup-uri`
                      : 'Pregătesc universul de scanare…'
                    : data?.manualScan.lastCompletedAt
                      ? `${formatDate(data.manualScan.lastCompletedAt)} · ${data.manualScan.matches} setup-uri`
                      : data?.dailyRegimeScan.lastCompletedAt
                        ? `${formatDate(data.dailyRegimeScan.lastCompletedAt)} · ${data.dailyRegimeScan.matches} semnale`
                        : 'Următoarea rulare: 12:00'}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void startManualScan('quick')}
                  disabled={Boolean(activeScanScope)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-[11px] font-bold text-cyan-200 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Zap className={`h-3.5 w-3.5 ${activeScanScope === 'quick' ? 'animate-pulse' : ''}`} /> Rapid
                </button>
                <button
                  type="button"
                  onClick={() => void startManualScan('full')}
                  disabled={Boolean(activeScanScope)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-[11px] font-bold text-violet-200 transition hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ScanSearch className={`h-3.5 w-3.5 ${activeScanScope === 'full' ? 'animate-pulse' : ''}`} /> Complet
                </button>
              </div>
            </div>
          </div>

          {activeScanScope && (
            <div className="mt-3">
              <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-400 transition-all duration-500"
                  style={{ width: `${Math.max(3, scanProgress)}%` }}
                />
              </div>
              <p className="mt-2 text-[10px] text-slate-500">Poți rămâne pe această pagină; rezultatele și alertele Telegram sunt protejate împotriva duplicării.</p>
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

      <section className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-cyan-300" />
              <h2 className="text-sm font-bold text-slate-100">Strategii Validate Live & Alerte Automate</h2>
            </div>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
              Semnale pe lumânări închise cu filtre macro: MoneyLine Macro Trend (Daily), Connors RSI(2) Dip-Pullback, 4H Sniper Confluence și Bear Rally Fade.
            </p>
          </div>
          <div className="flex flex-wrap gap-1 rounded-lg border border-white/[0.06] bg-white/[0.025] p-1">
            {([
              { id: 'ALL', label: 'TOATE' },
              { id: 'MACRO', label: 'ML MACRO' },
              { id: 'CONNORS', label: 'CONNORS RSI(2)' },
              { id: 'SNIPER', label: '4H SNIPER' },
              { id: 'BEAR_FADE', label: 'BEAR FADE' }
            ] as const).map(filter => (
              <button
                key={filter.id}
                type="button"
                onClick={() => setStrategyFilter(filter.id)}
                className={`rounded-md px-2.5 py-1 text-[10px] font-bold transition ${
                  strategyFilter === filter.id
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-sm'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {visibleStrategies.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {visibleStrategies.map(setup => (
              <StrategySetupCard
                key={setup.id}
                setup={setup}
                onOpen={() => onOpenAsset(setup.symbol, setup.marketClass, setup.timeframe)}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02] px-5 py-7 text-center text-xs text-slate-500">
            Niciun setup {strategyFilter === 'ALL' ? '' : strategyFilter} activ la ultima scanare. Apasă „Rapid” pentru watchlist sau „Complet” pentru întregul univers.
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Radar className="h-4 w-4 text-violet-300" />
              <h2 className="text-sm font-bold text-slate-100">Top 10 flipuri apropiate</h2>
            </div>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">
              Clasament după distanța până la Slow normalizată cu ATR, contextul ML 1W, SMA 50/200 și volum. Se actualizează după scanarea completă.
            </p>
          </div>
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
        </div>

        {visibleCandidates.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {visibleCandidates.map((candidate, index) => (
              <FlipCandidateCard
                key={candidate.id}
                candidate={candidate}
                rank={(data?.flipCandidates || []).findIndex(item => item.id === candidate.id) + 1 || index + 1}
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
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-100">Alerte urmărite</h2>
            <p className="mt-1 text-xs text-slate-500">Progresul este normalizat cu ATR până la Marginea Nor Slow, nivelul care confirmă flipul.</p>
          </div>
          <span className="font-mono text-[10px] text-slate-600">AUTO REFRESH 60S</span>
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

      <section className="space-y-3 pb-6">
        <div>
          <h2 className="text-sm font-bold text-slate-100">Istoric alerte declanșate</h2>
          <p className="mt-1 text-xs text-slate-500">Nivelurile sunt snapshot-ul calculat când alerta a fost trimisă; nu se modifică ulterior.</p>
        </div>

        {data?.history.length ? (
          <div className="space-y-2">
            {data.history.map(item => {
              const plan = item.tradePlan;
              const regime = item.regimeScan;
              const strategy = item.strategySetup;
              const isRiskOff = regime?.scenario === 'WEEKLY_BULL_DAILY_BEAR';
              const isStrategyLong = strategy?.side === 'LONG';
              const isStrategyShort = strategy?.side === 'SHORT';
              const strategyArmed = strategy?.stage === 'ARMED';
              return (
                <div key={item.id} className="rounded-2xl border border-white/[0.07] bg-background-card p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${strategyArmed
                        ? 'border-amber-500/25 bg-amber-500/10'
                        : isRiskOff || isStrategyShort
                          ? 'border-rose-500/25 bg-rose-500/10'
                          : 'border-emerald-500/25 bg-emerald-500/10'}`}>
                        {strategy
                          ? isStrategyShort
                            ? <TrendingDown className={`h-5 w-5 ${strategyArmed ? 'text-amber-400' : 'text-rose-400'}`} />
                            : <TrendingUp className={`h-5 w-5 ${strategyArmed ? 'text-amber-400' : 'text-emerald-400'}`} />
                          : regime
                          ? <TrendingUp className={`h-5 w-5 ${isRiskOff ? 'rotate-180 text-rose-400' : 'text-emerald-400'}`} />
                          : <CheckCircle2 className="h-5 w-5 text-emerald-400" />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <strong className="font-mono text-base text-white">${item.symbol}</strong>
                          <span className="rounded-md border border-cyan-500/25 bg-cyan-500/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-cyan-300">{item.timeframe.toUpperCase()}</span>
                          <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${item.isDelivered ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300' : 'border-rose-500/25 bg-rose-500/10 text-rose-300'}`}>
                            {item.isDelivered ? 'Telegram trimis' : 'Netrimis'}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500"><Clock3 className="h-3 w-3" /> {formatDate(item.timestamp)}</div>
                      </div>
                    </div>

                    {strategy ? strategyArmed ? (
                      <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4 lg:max-w-3xl">
                        <LevelBox label="Close semnal" value={formatPrice(strategy.signalPrice)} tone="slate" />
                        <LevelBox label="RSI(2)" value={strategy.rsi2 !== undefined ? strategy.rsi2.toFixed(2) : '—'} tone="amber" />
                        <LevelBox label="Confirmare" value={isStrategyLong ? 'RSI(2) peste 50' : `Sub 50 · max ${strategy.confirmationWindowRemaining ?? 3} close`} tone="amber" />
                        {isStrategyLong
                          ? <LevelBox label="Invalidare" value={`Close sub ${formatPrice(strategy.sma200)}`} tone="slate" />
                          : <LevelBox label={`Benchmark ${strategy.benchmarkSymbol}`} value={strategy.benchmarkBearish ? 'Bearish' : 'Neconfirmat'} tone={strategy.benchmarkBearish ? 'rose' : 'slate'} />}
                      </div>
                    ) : (
                      <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4 lg:max-w-3xl">
                        <LevelBox label="Entry referință" value={formatPrice(strategy.entryReference)} tone="cyan" />
                        <LevelBox label={`Stop · ${strategy.riskPercent.toFixed(2)}%`} value={formatPrice(strategy.stopLoss)} tone="rose" />
                        <LevelBox label="Țintă · 1.5R" value={formatPrice(strategy.target1)} tone="amber" />
                        <LevelBox label="Țintă · 3.0R" value={formatPrice(strategy.target2)} tone="emerald" />
                      </div>
                    ) : plan ? (
                      <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4 lg:max-w-3xl">
                        <LevelBox label="Entry" value={formatPrice(plan.suggestedEntry)} tone="cyan" />
                        <LevelBox label="Stop loss" value={formatPrice(plan.stopLoss)} tone="rose" />
                        <LevelBox label="TP 1 · 1.5R" value={formatPrice(plan.target1)} tone="amber" />
                        <LevelBox label={`TP 2 · ${plan.targetRiskReward.toFixed(1)}R`} value={formatPrice(plan.target2)} tone="emerald" />
                      </div>
                    ) : regime ? (
                      <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4 lg:max-w-3xl">
                        <LevelBox label="ML 1W" value={`${regime.weeklyTier} · ${regime.weeklyScore > 0 ? '+' : ''}${regime.weeklyScore}`} tone={regime.weeklyScore > 0 ? 'emerald' : 'rose'} />
                        <LevelBox label="Flip ML 1D" value={`${regime.previousDailyTier} → ${regime.dailyTier}`} tone={isRiskOff ? 'rose' : 'emerald'} />
                        <LevelBox label="Închidere 1D" value={formatPrice(item.price)} tone="slate" />
                        <LevelBox label={`SMA 50 · ${regime.distanceToSma50Percent > 0 ? '+' : ''}${regime.distanceToSma50Percent.toFixed(2)}%`} value={formatPrice(regime.sma50)} tone="amber" />
                      </div>
                    ) : (
                      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs text-slate-500">Alertă veche — fără snapshot SL/TP</div>
                    )}

                    <div className="flex items-center gap-3 lg:justify-end">
                      {strategy && <span className={`font-mono text-xs font-bold ${strategyArmed ? 'text-amber-300' : isStrategyShort ? 'text-rose-300' : 'text-emerald-300'}`}>{strategyArmed ? `${strategy.side} ARMAT` : `${strategy.side} CONFIRMAT`}</span>}
                      {plan && <span className="font-mono text-xs font-bold text-slate-300">{actionLabel(plan.action)} · {plan.confidence}/100</span>}
                      {regime && <span className={`font-mono text-xs font-bold ${isRiskOff ? 'text-rose-300' : 'text-emerald-300'}`}>{isRiskOff ? 'RISK-OFF' : 'REVERSAL LONG'}</span>}
                      <button
                        type="button"
                        onClick={() => onOpenAsset(item.symbol, strategy?.marketClass || regime?.marketClass, item.timeframe)}
                        className="grid h-8 w-8 place-items-center rounded-lg border border-white/[0.07] text-slate-400 transition hover:border-cyan-500/30 hover:text-cyan-300"
                        title="Deschide graficul"
                      ><ChevronRight className="h-4 w-4" /></button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02] px-5 py-8 text-center text-xs text-slate-500">Istoricul se va popula după prima alertă MoneyLine declanșată.</div>
        )}
      </section>
    </div>
  );
};

const SummaryCard: React.FC<{ icon: React.ElementType; label: string; value: number | string; tone: 'cyan' | 'amber' | 'emerald' | 'rose' }> = ({ icon: Icon, label, value, tone }) => {
  const tones = {
    cyan: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/20',
    amber: 'text-amber-300 bg-amber-500/10 border-amber-500/20',
    emerald: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20',
    rose: 'text-rose-300 bg-rose-500/10 border-rose-500/20'
  };
  return (
    <div className={`rounded-xl border p-3 ${tones[tone]}`}>
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider opacity-75"><Icon className="h-3.5 w-3.5" /> {label}</div>
      <div className="mt-2 font-mono text-lg font-bold text-white">{value}</div>
    </div>
  );
};

const StrategySetupCard: React.FC<{ setup: StrategyAlertSnapshot; onOpen: () => void }> = ({ setup, onOpen }) => {
  const isLong = setup.side === 'LONG';
  const armed = setup.stage === 'ARMED';
  const tone = armed
    ? 'border-amber-500/25 bg-amber-500/10 text-amber-300'
    : isLong
    ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
    : 'border-rose-500/25 bg-rose-500/10 text-rose-300';

  const title = setup.strategy === 'CONNORS_RSI2_LONG'
    ? 'Connors RSI(2) Dip-Pullback'
    : setup.strategy === 'BEAR_RALLY_FADE_SHORT'
    ? 'Bear Rally Fade'
    : setup.strategy === 'MONEYLINE_MACRO_LONG'
    ? 'MoneyLine Macro Trend Breakout'
    : 'MoneyLine 4H Sniper Confluence';

  return (
    <article className="rounded-2xl border border-white/[0.07] bg-background-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={onOpen} className="flex min-w-0 items-start gap-3 text-left">
          <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${tone}`}>
            {isLong ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <strong className="font-mono text-lg text-white">${setup.symbol}</strong>
              <span className="rounded-md border border-cyan-500/25 bg-cyan-500/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-cyan-300">{setup.timeframe.toUpperCase()}</span>
              <span className="rounded-md border border-white/[0.07] bg-white/[0.03] px-1.5 py-0.5 text-[9px] uppercase text-slate-500">{setup.marketClass}</span>
            </div>
            <div className="mt-1 text-[11px] font-medium text-slate-300">{title}</div>
          </div>
        </button>
        <span className={`shrink-0 rounded-lg border px-2 py-1 font-mono text-[10px] font-black ${tone}`}>
          {armed ? '⚠ ARMAT' : isLong ? '▲ LONG CONFIRMAT' : '▼ SHORT CONFIRMAT'}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <LevelBox label="Close semnal" value={formatPrice(setup.signalPrice)} tone="slate" />
        {setup.rsi2 !== undefined ? (
          <LevelBox label="RSI(2)" value={setup.rsi2.toFixed(2)} tone={armed ? 'amber' : isLong ? 'emerald' : 'rose'} />
        ) : (
          <LevelBox label="SMA 50" value={formatPrice(setup.sma50)} tone="amber" />
        )}
        <LevelBox label="SMA 200" value={formatPrice(setup.sma200)} tone="cyan" />
        <LevelBox label="ATR 14" value={formatPrice(setup.atr14)} tone="slate" />
      </div>

      {armed ? (
        <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2.5 text-xs leading-5 text-amber-100/80">
          {isLong
            ? <>Nu intra încă. Așteaptă RSI(2) peste 50 pe o lumânare Daily închisă. Setup-ul se invalidează sub SMA200.</>
            : <>Nu intra încă. Așteaptă RSI(2) sub 50; fereastră rămasă: <strong>{setup.confirmationWindowRemaining ?? 3} închideri Daily</strong>.</>}
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <LevelBox label="Entry referință" value={formatPrice(setup.entryReference)} tone="cyan" />
          <LevelBox label={`Stop · ${setup.riskPercent.toFixed(2)}%`} value={formatPrice(setup.stopLoss)} tone="rose" />
          <LevelBox label="Țintă · 1.5R" value={formatPrice(setup.target1)} tone="amber" />
          <LevelBox label="Țintă · 3.0R" value={formatPrice(setup.target2)} tone="emerald" />
        </div>
      )}

      <button type="button" onClick={onOpen} className="mt-3 flex w-full items-center justify-between border-t border-white/[0.05] pt-3 text-[11px] text-slate-500 transition hover:text-cyan-300">
        <span>{armed
          ? isLong ? 'Confirmare conservatoare: RSI(2) trebuie să revină peste 50' : `Benchmark ${setup.benchmarkSymbol} bearish confirmat`
          : setup.exitRule || `Execuție la următorul open ${setup.timeframe.toUpperCase()}; nivelurile se recalculează la fill`}</span>
        <span className="flex items-center gap-1 font-semibold text-cyan-300">Deschide {setup.timeframe.toUpperCase()} <ChevronRight className="h-3.5 w-3.5" /></span>
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
