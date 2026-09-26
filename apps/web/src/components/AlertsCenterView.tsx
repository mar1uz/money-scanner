import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BellPlus,
  BellRing,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Filter,
  RefreshCw,
  Radar,
  ScanSearch,
  Send,
  ShieldAlert,
  Target,
  Trash2,
  TrendingUp,
  Zap
} from 'lucide-react';
import { AssetScannerRow, Timeframe } from '../types.js';
import { NarrativeTag } from './NarrativeTag.js';
import { CryptoFundamentals, formatPriceToRevenue, formatRevenue30d, useCryptoFundamentals } from '../services/crypto-fundamentals.js';
import { DailySmaReclaimResult, DailySmaReclaimResultStatus, StockBusinessQualityAsset, TRADING_360_ASSETS } from '@money-scanner/shared';
import {
  ActiveAlertDashboardItem,
  AlertsDashboardResponse,
  AlertProgressStatus,
  clearAlerts,
  fetchAlertsDashboard,
  fetchStockBusinessQualityScan,
  FlipCandidateDashboardItem,
  FlipScanCoverageItem,
  FlipScanCoverageStatus,
  ManualAlertScanScope,
  runManualAlertScan,
  setBullishAlert
} from '../services/api.js';
import { translateText, useLanguage } from '../i18n.js';
import { ScanLoadingBar } from './ScanLoadingBar.js';
import { distanceFromLastClosedHigh } from './flip-distance-from-high.js';
import { StockBqChips, StockBqTiles, mcInline } from './StockBqBlocks.js';

interface AlertsCenterViewProps {
  knownAssets: AssetScannerRow[];
  watchlist: string[];
  onOpenAsset: (symbol: string, marketClass: AssetScannerRow['marketClass'], timeframe: Timeframe) => void;
}

const ALERT_STORAGE_PREFIX = 'moneyline-bullish-alert:';
export const ALERTS_COVERAGE_OPEN_KEY = 'ms-alerts-coverage-open';
export const ALERTS_SMA_OPEN_KEY = 'ms-alerts-sma-open';

type FlagStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function readPersistedOpen(key: string, fallback = true, storage?: FlagStorage | null): boolean {
  try {
    const store = storage === undefined ? globalThis.localStorage : storage;
    if (!store) return fallback;
    const raw = store.getItem(key);
    if (raw === '0') return false;
    if (raw === '1') return true;
  } catch {
    // private mode / missing storage
  }
  return fallback;
}

export function writePersistedOpen(key: string, open: boolean, storage?: FlagStorage | null): void {
  try {
    const store = storage === undefined ? globalThis.localStorage : storage;
    store?.setItem(key, open ? '1' : '0');
  } catch {
    // ignore quota / private mode
  }
}

let alertsDashboardCache: AlertsDashboardResponse | null = null;

export function peekAlertsDashboardCache(): AlertsDashboardResponse | null {
  return alertsDashboardCache;
}

export function rememberAlertsDashboard(data: AlertsDashboardResponse | null): void {
  alertsDashboardCache = data;
}

/** Re-entering Alerts must not refetch/rescan when a snapshot already exists. */
export function shouldAutoLoadAlertsDashboard(cache: AlertsDashboardResponse | null = alertsDashboardCache): boolean {
  return cache == null;
}

// Dates in the Alerts section follow the selected UI language, not always
// ro-RO (EN mode showed Romanian month abbreviations).
const dateLocale = (): string => {
  try { return localStorage.getItem('money_scanner_language') === 'en' ? 'en-GB' : 'ro-RO'; } catch { return 'ro-RO'; }
};

// Latest Yahoo stock fundamentals (same pipeline as Top Alpha / stock cards,
// Steps 144-146): real data only, N/A when missing, ETFs insufficient-data.
// Flip cards are historical snapshots, so they show the latest honest values.
let stockScanAssetsCache: Map<string, StockBusinessQualityAsset> | null = null;
const useStockScanAssets = (): Map<string, StockBusinessQualityAsset> => {
  const [map, setMap] = useState<Map<string, StockBusinessQualityAsset>>(() => stockScanAssetsCache ?? new Map());
  useEffect(() => {
    if (stockScanAssetsCache) return;
    let alive = true;
    void fetchStockBusinessQualityScan()
      .then(scan => {
        const next = new Map<string, StockBusinessQualityAsset>();
        for (const asset of scan.assets || []) next.set(asset.symbol.toUpperCase(), asset);
        stockScanAssetsCache = next;
        if (alive) setMap(next);
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);
  return map;
};

// Market cap on every Alerts card (Marius, 2026-09-24), inline grey text
// under the ticker like the stock-card subtitle. Real sources only:
// crypto = CoinGecko market cap from the four-criteria scan (fallback: the
// live scanner row), stocks = Yahoo market cap from the stock BQ scan,
// metals = no verified source, so "MC \u2014".
const resolveCardMarketCap = (
  marketClass: string | undefined,
  symbol: string,
  cryptoFundamentals: Map<string, CryptoFundamentals>,
  stockAssets: Map<string, StockBusinessQualityAsset>,
  knownAssets?: AssetScannerRow[]
): number | undefined => {
  const key = symbol.toUpperCase();
  if (marketClass === 'crypto') {
    return cryptoFundamentals.get(key)?.marketCap
      ?? knownAssets?.find(row => row.marketClass === 'crypto' && row.symbol.toUpperCase() === key)?.marketCap;
  }
  if (marketClass === 'stocks') return stockAssets.get(key)?.marketCap;
  return undefined;
};

const CardMarketCapLine: React.FC<{ value?: number; sector?: string }> = ({ value, sector }) => {
  const { language } = useLanguage();
  return (
    <div className="alert-card-type mt-0.5 text-[10px] text-slate-500 truncate">
      {mcInline(value)}{sector ? ` · ${translateText(sector, language)}` : ''}
    </div>
  );
};

// Full Top Alpha stock-card info set on Alerts stock cards (Marius, 2026-09-24):
// the 6 criteria chips (MC + sector now sit inline under the ticker), and the metric tiles with P/R and
// P/E combined in one highlighted tile. Alert-specific data stays first.
const StockFundamentalsSection: React.FC<{ asset: StockBusinessQualityAsset }> = ({ asset }) => {
  const { language } = useLanguage();
  return (
    <div className="alert-card-type mt-3 rounded-xl border border-white/[0.06] bg-white/[0.015] p-2.5">
      <StockBqChips asset={asset} language={language} />
      <StockBqTiles asset={asset} language={language} combinedPePr />
    </div>
  );
};

const catalogNameBySymbol = new Map<string, string>(
  TRADING_360_ASSETS.map(asset => [asset.symbol.toUpperCase(), asset.name])
);

export const getAssetName = (symbol: string, candidateName?: string, knownAssets?: AssetScannerRow[]): string => {
  if (candidateName && candidateName.trim() && candidateName.toUpperCase() !== symbol.toUpperCase()) {
    return candidateName.trim();
  }
  const fromCatalog = catalogNameBySymbol.get(symbol.toUpperCase());
  if (fromCatalog) return fromCatalog;
  if (knownAssets?.length) {
    const fromKnown = knownAssets.find(a => a.symbol.toUpperCase() === symbol.toUpperCase())?.name;
    if (fromKnown) return fromKnown;
  }
  return symbol;
};

const formatPrice = (value?: number) => {
  if (!value || !Number.isFinite(value)) return '—';
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: value < 1 ? 4 : 2,
    maximumFractionDigits: value < 1 ? 8 : 4
  })}`;
};

const formatDate = (value?: number) => value
  ? new Date(value).toLocaleString(dateLocale(), { dateStyle: 'medium', timeStyle: 'short' })
  : '—';

const formatRelativeAge = (value?: number) => {
  if (!value) return '—';
  const elapsedMs = Math.max(0, Date.now() - value);
  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 60) return minutes <= 1 ? 'acum 1 minut' : `acum ${minutes} minute`;
  const hours = Math.floor(elapsedMs / 3_600_000);
  if (hours < 24) return hours === 1 ? 'acum 1 oră' : `acum ${hours} ore`;
  const days = Math.floor(elapsedMs / 86_400_000);
  return days === 1 ? 'acum 1 zi' : `acum ${days} zile`;
};

const FLIP_CONFIRMATION_DURATION_MS: Record<'4h' | '8h' | '1d' | '1w', number> = {
  '4h': 4 * 60 * 60_000,
  '8h': 8 * 60 * 60_000,
  '1d': 24 * 60 * 60_000,
  '1w': 7 * 24 * 60 * 60_000
};

const getFlipConfirmedAt = (candidate: FlipCandidateDashboardItem) => candidate.confirmedAt
  || Math.min(Date.now(), candidate.candleTimestamp + FLIP_CONFIRMATION_DURATION_MS[candidate.timeframe]);

const statusMeta: Record<AlertProgressStatus, { label: string; tone: string; bar: string }> = {
  CONFIRMED: { label: 'Confirmat bullish', tone: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/35', bar: 'bg-emerald-400' },
  AWAITING_CLOSE: { label: 'Așteaptă închiderea', tone: 'text-cyan-300 bg-cyan-500/15 border-cyan-500/35', bar: 'bg-cyan-400' },
  VERY_CLOSE: { label: 'Foarte aproape', tone: 'text-amber-200 bg-amber-500/15 border-amber-500/35', bar: 'bg-amber-300' },
  CLOSE: { label: 'Aproape', tone: 'text-amber-300 bg-amber-500/10 border-amber-500/25', bar: 'bg-amber-400' },
  WAITING: { label: 'În așteptare', tone: 'text-slate-300 bg-slate-500/10 border-slate-500/25', bar: 'bg-slate-400' },
  ERROR: { label: 'Date indisponibile', tone: 'text-rose-300 bg-rose-500/10 border-rose-500/30', bar: 'bg-rose-400' }
};

export const UPCOMING_FLIP_DISPLAY_LIMIT = 20;

const coverageStatusMeta: Record<FlipScanCoverageItem['status'], { label: string; tone: string }> = {
  CONFIRMED: { label: 'Confirmat', tone: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/25' },
  CANDIDATE: { label: 'Candidat', tone: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/25' },
  NO_SETUP: { label: 'Fără setup', tone: 'text-slate-400 bg-white/[0.04] border-white/[0.08]' },
  INSUFFICIENT_DATA: { label: 'Date insuficiente', tone: 'text-amber-300 bg-amber-500/10 border-amber-500/25' },
  ERROR: { label: 'Eroare', tone: 'text-rose-300 bg-rose-500/10 border-rose-500/25' }
};

export type ConfirmedMarketClassFilter = 'ALL' | 'crypto' | 'stocks';
export type CandidateMarketClassFilter = 'ALL' | 'crypto' | 'stocks';

export interface FilterFlipCandidatesOptions {
  candidateFilter?: 'ALL' | 'BULLISH' | 'BEARISH';
  candidateTimeframe?: 'ALL' | '4h' | '8h' | '1d' | '1w';
  candidateMarketClass?: CandidateMarketClassFilter;
  candidateSearch?: string;
  knownAssets?: AssetScannerRow[];
  limit?: number;
}

export function filterFlipCandidates(
  flipCandidates: FlipCandidateDashboardItem[] | undefined,
  options: FilterFlipCandidatesOptions = {}
): FlipCandidateDashboardItem[] {
  const {
    candidateFilter = 'ALL',
    candidateTimeframe = 'ALL',
    candidateMarketClass = 'ALL',
    candidateSearch = '',
    knownAssets,
    limit = UPCOMING_FLIP_DISPLAY_LIMIT
  } = options;

  const query = candidateSearch.replace(/^[$#]/, '').trim().toUpperCase();
  const filtered = (flipCandidates || []).filter(candidate => {
    const name = getAssetName(candidate.symbol, candidate.name, knownAssets).toUpperCase();
    return (candidateFilter === 'ALL' || candidate.direction === candidateFilter)
      && (candidateTimeframe === 'ALL' || candidate.timeframe === candidateTimeframe)
      && (candidateMarketClass === 'ALL' || candidate.marketClass === candidateMarketClass)
      && (!query || candidate.symbol.toUpperCase().includes(query) || name.includes(query));
  });

  if (query || candidateTimeframe !== 'ALL') return filtered.slice(0, limit);

  const seenAssets = new Set<string>();
  return filtered.filter(candidate => {
    const key = `${candidate.marketClass}:${candidate.symbol}`;
    if (seenAssets.has(key)) return false;
    seenAssets.add(key);
    return true;
  }).slice(0, limit);
}

export interface FilterConfirmedFlipsOptions {
  confirmedFilter?: 'ALL' | 'BULLISH' | 'BEARISH';
  confirmedTimeframe?: 'ALL' | '4h' | '8h' | '1d' | '1w';
  confirmedMarketClass?: ConfirmedMarketClassFilter;
  confirmedSearch?: string;
  knownAssets?: AssetScannerRow[];
}

export function filterConfirmedFlips(
  confirmedFlips: FlipCandidateDashboardItem[] | undefined,
  options: FilterConfirmedFlipsOptions = {}
): FlipCandidateDashboardItem[] {
  const {
    confirmedFilter = 'ALL',
    confirmedTimeframe = 'ALL',
    confirmedMarketClass = 'ALL',
    confirmedSearch = '',
    knownAssets
  } = options;

  const query = confirmedSearch.replace(/^[$#]/, '').trim().toUpperCase();
  const latestByAssetTimeframe = new Map<string, FlipCandidateDashboardItem>();
  (confirmedFlips || [])
    .slice()
    .sort((left, right) => getFlipConfirmedAt(right) - getFlipConfirmedAt(left))
    .forEach(candidate => {
      const key = `${candidate.marketClass}:${candidate.symbol}:${candidate.timeframe}`;
      if (!latestByAssetTimeframe.has(key)) latestByAssetTimeframe.set(key, candidate);
    });
  const seenAssets = new Set<string>();
  return Array.from(latestByAssetTimeframe.values())
    .filter(candidate => {
      const name = getAssetName(candidate.symbol, candidate.name, knownAssets).toUpperCase();
      return (confirmedFilter === 'ALL' || candidate.direction === confirmedFilter)
        && (confirmedTimeframe === 'ALL' || candidate.timeframe === confirmedTimeframe)
        && (confirmedMarketClass === 'ALL' || candidate.marketClass === confirmedMarketClass)
        && (!query || candidate.symbol.toUpperCase().includes(query) || name.includes(query));
    })
    .sort((left, right) => getFlipConfirmedAt(right) - getFlipConfirmedAt(left)
      || right.priorityScore - left.priorityScore)
    .filter(candidate => {
      const key = `${candidate.marketClass}:${candidate.symbol}`;
      if (seenAssets.has(key)) return false;
      seenAssets.add(key);
      return true;
    });
}

export const AlertsCenterView: React.FC<AlertsCenterViewProps> = ({ knownAssets, watchlist, onOpenAsset }) => {
  const [data, setData] = useState<AlertsDashboardResponse | null>(() => peekAlertsDashboardCache());
  const { language } = useLanguage();
  const cryptoFundamentals = useCryptoFundamentals();
  const stockScanAssets = useStockScanAssets();
  // Sort by P/R (Marius, 2026-09-23): applies to the current filtered
  // selection on every tab; cheapest first, coins without revenue last.
  const [sortByPriceToRevenue, setSortByPriceToRevenue] = useState(false);
  const priceToRevenueOf = useCallback((symbol: string, marketClass?: string) =>
    marketClass === 'crypto' ? cryptoFundamentals.get(symbol.toUpperCase())?.priceToRevenue : undefined,
  [cryptoFundamentals]);
  const sortByPR = useCallback(<T extends { symbol: string; marketClass?: string }>(items: T[]): T[] => {
    if (!sortByPriceToRevenue) return items;
    const value = (item: T) => priceToRevenueOf(item.symbol, item.marketClass) ?? Number.POSITIVE_INFINITY;
    return items.slice().sort((left, right) => value(left) - value(right));
  }, [priceToRevenueOf, sortByPriceToRevenue]);
  const [loading, setLoading] = useState(() => shouldAutoLoadAlertsDashboard());
  const [error, setError] = useState('');
  const [scanScope, setScanScope] = useState<ManualAlertScanScope | null>(null);
  const [scanMessage, setScanMessage] = useState('');
  const [removingId, setRemovingId] = useState('');
  const [clearingTarget, setClearingTarget] = useState<'active' | 'history' | 'all' | null>(null);
  const [preparingId, setPreparingId] = useState('');
  const [activeTab, setActiveTab] = useState<'ALL' | 'CONFIRMED' | 'FLIPS' | 'WATCHED'>('ALL');
  const [confirmedOpen, setConfirmedOpen] = useState(true);
  const [candidatesOpen, setCandidatesOpen] = useState(true);
  const [activeAlertsOpen, setActiveAlertsOpen] = useState(true);
  const [coverageOpen, setCoverageOpen] = useState(() => readPersistedOpen(ALERTS_COVERAGE_OPEN_KEY, true));
  const [candidateFilter, setCandidateFilter] = useState<'ALL' | 'BULLISH' | 'BEARISH'>('ALL');
  const [candidateTimeframe, setCandidateTimeframe] = useState<'ALL' | '4h' | '8h' | '1d' | '1w'>('ALL');
  const [candidateMarketClass, setCandidateMarketClass] = useState<CandidateMarketClassFilter>('ALL');
  const [candidateSearch, setCandidateSearch] = useState('');
  const [showAllCandidates, setShowAllCandidates] = useState(false);
  const [coverageSearch, setCoverageSearch] = useState('');
  const [coverageStatusFilter, setCoverageStatusFilter] = useState<FlipScanCoverageStatus | 'ALL'>('ALL');
  const [confirmedFilter, setConfirmedFilter] = useState<'ALL' | 'BULLISH' | 'BEARISH'>('ALL');
  const [confirmedTimeframe, setConfirmedTimeframe] = useState<'ALL' | '4h' | '8h' | '1d' | '1w'>('ALL');
  const [confirmedMarketClass, setConfirmedMarketClass] = useState<ConfirmedMarketClassFilter>('ALL');
  const [confirmedSearch, setConfirmedSearch] = useState('');
  const restoredBrowserRules = useRef(false);

  const applyDashboard = useCallback((next: AlertsDashboardResponse) => {
    rememberAlertsDashboard(next);
    setData(next);
  }, []);

  const loadDashboard = useCallback(async (mode: 'auto' | 'manual' | 'poll' = 'manual') => {
    if (mode === 'auto' && !shouldAutoLoadAlertsDashboard()) {
      const cached = peekAlertsDashboardCache();
      if (cached) setData(cached);
      setLoading(false);
      return;
    }
    if (mode !== 'poll') setLoading(true);
    if (mode !== 'poll') setError('');
    try {
      applyDashboard(await fetchAlertsDashboard());
    } catch (loadError) {
      if (mode !== 'poll') {
        setError(loadError instanceof Error ? loadError.message : 'Nu am putut încărca alertele.');
      }
    } finally {
      setLoading(false);
    }
  }, [applyDashboard]);

  useEffect(() => {
    // First visit fetches once. Re-entering Alerts reuses the last snapshot.
    // Live prices refresh only via the manual „Actualizează” button or while a scan runs.
    void loadDashboard('auto');
  }, [loadDashboard]);

  useEffect(() => {
    if (!data?.manualScan.running || scanScope) return;
    const timer = window.setInterval(() => {
      void fetchAlertsDashboard().then(applyDashboard).catch(() => undefined);
    }, 2_500);
    return () => window.clearInterval(timer);
  }, [applyDashboard, data?.manualScan.running, scanScope]);

  const toggleCoverageOpen = () => {
    setCoverageOpen(prev => {
      const next = !prev;
      writePersistedOpen(ALERTS_COVERAGE_OPEN_KEY, next);
      return next;
    });
  };

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
      close: Math.min(UPCOMING_FLIP_DISPLAY_LIMIT, new Set((data?.flipCandidates || []).map(candidate => `${candidate.marketClass}:${candidate.symbol}`)).size),
      confirmed: data?.confirmedFlips?.length || 0,
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
      void fetchAlertsDashboard().then(applyDashboard).catch(() => undefined);
    }, 2_500);

    try {
      const result = await runManualAlertScan(scope, watchlistPayload);
      if (result.lastError) throw new Error(result.lastError);
      const scanTypeLabel = scope === 'quick'
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
  const candidateOptions = useMemo(() => ({
    candidateFilter,
    candidateTimeframe,
    candidateMarketClass,
    candidateSearch,
    knownAssets
  }), [candidateFilter, candidateMarketClass, candidateSearch, candidateTimeframe, knownAssets]);
  const allMatchingCandidates = useMemo(() => {
    return filterFlipCandidates(data?.flipCandidates, { ...candidateOptions, limit: Number.POSITIVE_INFINITY });
  }, [candidateOptions, data?.flipCandidates]);
  const visibleCandidates = useMemo(() => {
    const limit = showAllCandidates ? Number.POSITIVE_INFINITY : UPCOMING_FLIP_DISPLAY_LIMIT;
    if (sortByPriceToRevenue) return sortByPR(allMatchingCandidates).slice(0, limit);
    return filterFlipCandidates(data?.flipCandidates, { ...candidateOptions, limit });
  }, [allMatchingCandidates, candidateOptions, data?.flipCandidates, showAllCandidates, sortByPR, sortByPriceToRevenue]);
  const visibleCoverage = useMemo(() => {
    const query = coverageSearch.trim().toUpperCase();
    return (data?.scanCoverage || []).filter(item => {
      if (coverageStatusFilter !== 'ALL' && item.status !== coverageStatusFilter) return false;
      return !query
        || item.symbol.toUpperCase().includes(query)
        || (item.name || '').toUpperCase().includes(query);
    });
  }, [coverageSearch, coverageStatusFilter, data?.scanCoverage]);
  const topConfirmedFlipsRaw = useMemo(() => {
    return filterConfirmedFlips(data?.confirmedFlips, {
      confirmedFilter,
      confirmedTimeframe,
      confirmedMarketClass,
      confirmedSearch,
      knownAssets
    });
  }, [confirmedFilter, confirmedMarketClass, confirmedSearch, confirmedTimeframe, data?.confirmedFlips, knownAssets]);
  const topConfirmedFlips = useMemo(() => sortByPR(topConfirmedFlipsRaw), [sortByPR, topConfirmedFlipsRaw]);
  const cryptoRankBySymbol = useMemo(() => new Map(
    (data?.scanCoverage || [])
      .filter(item => item.marketClass === 'crypto' && Number.isFinite(item.rank))
      .map(item => [item.symbol.toUpperCase(), item.rank as number])
  ), [data?.scanCoverage]);

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
        {(['ALL', 'crypto', 'stocks'] as const).map(marketClass => (
          <button
            key={marketClass}
            type="button"
            onClick={() => setCandidateMarketClass(marketClass)}
            className={`min-w-16 flex-1 rounded-md px-2.5 py-1.5 text-[10px] font-bold transition ${candidateMarketClass === marketClass
              ? marketClass === 'crypto'
                ? 'bg-cyan-500/15 text-cyan-300'
                : marketClass === 'stocks'
                  ? 'bg-blue-500/15 text-blue-300'
                  : 'bg-violet-500/15 text-violet-200'
              : 'text-slate-500 hover:text-slate-300'}`}
          >
            {marketClass === 'ALL' ? 'Toate' : marketClass === 'crypto' ? 'Crypto' : 'Stocks'}
          </button>
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
        {(['ALL', 'crypto', 'stocks'] as const).map(marketClass => (
          <button
            key={marketClass}
            type="button"
            onClick={() => setConfirmedMarketClass(marketClass)}
            className={`min-w-16 flex-1 rounded-md px-2.5 py-1.5 text-[10px] font-bold transition ${confirmedMarketClass === marketClass
              ? marketClass === 'crypto'
                ? 'bg-cyan-500/15 text-cyan-300'
                : marketClass === 'stocks'
                  ? 'bg-blue-500/15 text-blue-300'
                  : 'bg-violet-500/15 text-violet-200'
              : 'text-slate-500 hover:text-slate-300'}`}
          >
            {marketClass === 'ALL' ? 'Toate' : marketClass === 'crypto' ? 'Crypto' : 'Stocks'}
          </button>
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
          coinGeckoRank={candidate.marketCapRank ?? cryptoRankBySymbol.get(candidate.symbol.toUpperCase())}
          preparing={preparingId === candidate.id}
          alertActive={Boolean(data?.activeAlerts.some(alert =>
            alert.symbol === candidate.symbol && alert.timeframe === candidate.timeframe
          ))}
          knownAssets={knownAssets}
          fundamentals={candidate.marketClass === 'crypto' ? cryptoFundamentals.get(candidate.symbol.toUpperCase()) : undefined}
          stockAsset={candidate.marketClass === 'stocks' ? stockScanAssets.get(candidate.symbol.toUpperCase()) : undefined}
          marketCap={resolveCardMarketCap(candidate.marketClass, candidate.symbol, cryptoFundamentals, stockScanAssets, knownAssets)}
          onPrepare={() => void prepareCandidateAlert(candidate)}
          onOpen={() => onOpenAsset(candidate.symbol, candidate.marketClass, candidate.timeframe)}
        />
      ))}
    </div>
  ) : data?.dailyRegimeScan.lastCompletedAt ? (
    <div className="rounded-[30px] border border-dashed border-white/[0.08] bg-white/[0.02] px-5 py-8 text-center text-xs text-slate-500">
      Nu există candidați {candidateFilter === 'ALL' ? '' : candidateFilter.toLowerCase()} în Top {UPCOMING_FLIP_DISPLAY_LIMIT} curent.
    </div>
  ) : (
    <div className="rounded-[30px] border border-dashed border-violet-500/20 bg-violet-500/[0.04] px-5 py-8 text-center">
      <ScanSearch className="mx-auto h-7 w-7 text-violet-400" />
      <h3 className="mt-3 text-sm font-semibold text-slate-200">Rulează prima scanare completă</h3>
      <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-slate-500">Top {UPCOMING_FLIP_DISPLAY_LIMIT} va fi populat după analiza universului crypto, stocks și metale.</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <ScanLoadingBar
        active={loading || Boolean(activeScanScope)}
        scanned={activeScanScope ? (activeManualScanStatus?.scannedAssets ?? 0) : undefined}
        total={activeScanScope ? (activeManualScanStatus?.totalAssets ?? 0) : undefined}
      />
      <section className="overflow-hidden rounded-[30px] border border-cyan-500/20 bg-[var(--t-surface)] p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-cyan-300">
              <BellRing className="h-5 w-5" />
              <span className="font-mono text-[11px] font-bold uppercase tracking-[0.2em]">Alert Command Center</span>
            </div>
            <h1 className="text-xl font-bold text-white sm:text-2xl">Alertele mele MoneyLine</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Flipuri confirmate, Top 20 aproape de flip (4H/8H/1D/1W) și alertele urmărite.
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

        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
          <SummaryCard icon={CheckCircle2} label="Flipuri Confirmate" value={summary.confirmed} tone="emerald" />
          <SummaryCard icon={TrendingUp} label="Top Aproape Flip" value={summary.close} tone="cyan" />
          <SummaryCard icon={BellRing} label="Alerte Urmărite" value={summary.active} tone="slate" />
        </div>

        <div className="mt-4 rounded-xl border border-violet-500/20 bg-violet-500/[0.06] p-3">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-violet-400/20 bg-violet-500/10">
                <CalendarClock className="h-4 w-4 text-violet-300" />
              </div>
              <div>
                <div className="text-xs font-bold text-violet-200">Comenzi de scanare</div>
                <p className="mt-1 max-w-2xl text-[11px] leading-5 text-slate-400">
                  <strong className="text-violet-300">Top 20 Flips</strong> (4H, 8H, 1D, 1W) sau scanare rapidă pe watchlist.
                </p>
              </div>
            </div>

            <div className="flex shrink-0 flex-col gap-2 sm:items-end">
              <div className="text-left sm:text-right">
                <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                  {activeScanScope
                    ? `${activeScanScope === 'quick' ? 'Scanare Rapidă' : 'Scanare Flips'} în curs`
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
                  onClick={() => void startManualScan('flips')}
                  disabled={Boolean(activeScanScope)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-violet-500/40 bg-violet-500/15 px-3 py-2 text-[11px] font-bold text-violet-200 transition hover:bg-violet-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ScanSearch className={`h-3.5 w-3.5 ${activeScanScope === 'flips' || activeScanScope === 'full' ? 'animate-pulse' : ''}`} /> Scanare Top 20 Flips
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
            <p className="mt-3 text-[10px] text-slate-400">Scanarea rulează în fundal pe toate activele; semnalele eligibile vor trimite automat alertă pe Telegram.</p>
          )}
        </div>

        <div className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.025]">
          <button
            type="button"
            onClick={toggleCoverageOpen}
            aria-expanded={coverageOpen}
            title={coverageOpen ? 'Compactează acoperirea' : 'Extinde acoperirea'}
            className="flex w-full items-center justify-between gap-3 p-3 text-left text-xs font-bold text-slate-200"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg border border-cyan-500/25 bg-cyan-500/10 text-cyan-300">
                <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${coverageOpen ? '' : '-rotate-90'}`} />
              </span>
              <Radar className="h-4 w-4 shrink-0 text-cyan-300" />
              <span className="truncate">Acoperirea ultimei scanări</span>
            </span>
            <span className="shrink-0 font-mono text-[10px] text-cyan-300">
              {data?.dailyRegimeScan.coverage?.scannedAssets ?? data?.scanCoverage?.length ?? 0}/
              {data?.dailyRegimeScan.coverage?.totalAssets ?? 0} active
            </span>
          </button>
          {coverageOpen && (
          <div className="px-3 pb-3">
          <p className="text-[11px] leading-5 text-slate-500">
            Fiecare activ din univers este raportat, inclusiv cele fără setup sau cu date indisponibile. Astfel vezi exact ce a fost analizat.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {(['CONFIRMED', 'CANDIDATE', 'NO_SETUP', 'INSUFFICIENT_DATA', 'ERROR'] as const).map(status => {
              const isActive = coverageStatusFilter === status;
              return (
                <button
                  key={status}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setCoverageStatusFilter(current => current === status ? 'ALL' : status)}
                  title={isActive ? 'Renunță la filtru' : `Filtrează: ${coverageStatusMeta[status].label}`}
                  className={`rounded-lg border px-2 py-1.5 text-left transition ${isActive
                    ? coverageStatusMeta[status].tone
                    : 'border-white/[0.06] bg-[var(--t-surface-raised)] hover:border-cyan-500/30 hover:bg-white/[0.04]'}`}
                >
                  <div className={`flex items-center justify-between gap-1 text-[9px] uppercase tracking-wide ${isActive ? 'opacity-90' : 'text-slate-500'}`}>
                    <span className="truncate">{coverageStatusMeta[status].label}</span>
                    <Filter className={`h-2.5 w-2.5 shrink-0 ${isActive ? '' : 'opacity-45'}`} />
                  </div>
                  <div className={`mt-0.5 font-mono text-sm font-bold ${isActive ? '' : 'text-slate-200'}`}>{data?.dailyRegimeScan.coverage?.outcomes?.[status] ?? 0}</div>
                </button>
              );
            })}
          </div>
          {(data?.scanCoverage?.length ?? 0) > 0 && (
            <>
              <input
                value={coverageSearch}
                onChange={event => setCoverageSearch(event.target.value)}
                placeholder="Caută în acoperire, ex. BTC sau Apple"
                className="mt-3 w-full rounded-lg border border-white/[0.07] bg-white/[0.025] px-3 py-2 font-mono text-[11px] text-slate-200 outline-none placeholder:text-slate-600 focus:border-cyan-500/30"
              />
              {visibleCoverage.length > 0 ? (
                <div className="mt-3 grid max-h-72 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
                  {visibleCoverage.map(item => (
                    <button
                      key={`${item.marketClass}:${item.symbol}`}
                      type="button"
                      onClick={() => onOpenAsset(item.symbol, item.marketClass, '1w')}
                      title={`Deschide analiza Money Line pentru ${item.symbol}`}
                      className="rounded-lg border border-white/[0.06] bg-[var(--t-surface-raised)] px-2.5 py-2 text-left transition hover:border-cyan-500/35 hover:bg-cyan-500/[0.06]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[11px] font-bold text-slate-200">{item.symbol}</span>
                        <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold ${coverageStatusMeta[item.status].tone}`}>{coverageStatusMeta[item.status].label}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[9px] text-slate-500">
                        <span>{item.marketClass}{item.rank ? ` · #${item.rank}` : ''}</span>
                        <span className="flex items-center gap-0.5">
                          {item.weeklyConfirmed ? '1W confirmat' : item.weeklyCandidate ? '1W candidat' : '1W —'}
                          <ChevronRight className="h-3 w-3 shrink-0 opacity-50" />
                        </span>
                      </div>
                      {item.error && <div className="mt-1 truncate text-[9px] text-rose-300" title={item.error}>{item.error}</div>}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-[11px] text-slate-500">Niciun activ pentru filtrul selectat — apasă din nou pe filtru ca să revii la toate.</p>
              )}
            </>
          )}
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

      <DailySmaReclaimSection
        report={data?.dailySmaReclaim}
        onOpenAsset={onOpenAsset}
        cryptoFundamentals={cryptoFundamentals}
      />

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] pb-3">
        <button
          type="button"
          onClick={() => setActiveTab('ALL')}
          className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${activeTab === 'ALL' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'text-slate-400 hover:text-slate-200'}`}
        >
          TOATE ({summary.confirmed + summary.close + summary.active})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('CONFIRMED')}
          className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${activeTab === 'CONFIRMED' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'text-slate-400 hover:text-slate-200'}`}
        >
          {translateText('FLIPURI CONFIRMATE', language)} ({summary.confirmed})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('FLIPS')}
          className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${activeTab === 'FLIPS' ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30' : 'text-slate-400 hover:text-slate-200'}`}
        >
          APROAPE DE FLIP ({summary.close})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('WATCHED')}
          className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${activeTab === 'WATCHED' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'text-slate-400 hover:text-slate-200'}`}
        >
          ALERTE URMĂRITE ({summary.active})
        </button>
        <div className="ml-auto flex items-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.025] p-1" role="group" aria-label="Sortare">
          <span className="px-1.5 text-[10px] font-bold uppercase text-slate-500">Sortare</span>
          <button
            type="button"
            onClick={() => setSortByPriceToRevenue(false)}
            className={`rounded-md px-2.5 py-1 text-[10px] font-bold transition ${!sortByPriceToRevenue ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-slate-200'}`}
          >
            {translateText('Implicit', language)}
          </button>
          <button
            type="button"
            onClick={() => setSortByPriceToRevenue(true)}
            title="P/R = market cap / (revenue 30z × 365/30); cel mai ieftin primul, fără revenue la final"
            className={`rounded-md px-2.5 py-1 text-[10px] font-bold transition ${sortByPriceToRevenue ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-slate-200'}`}
          >
            P/R ↑
          </button>
        </div>
      </div>

      {/* 1. ISTORICUL CELUI MAI RECENT FLIP CONFIRMAT PER ASSET */}
      {(activeTab === 'ALL' || activeTab === 'CONFIRMED') && (
        <section className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <button
              type="button"
              onClick={() => setConfirmedOpen(prev => !prev)}
              className="flex items-start gap-2.5 text-left group transition focus:outline-none"
            >
              <div className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg border border-emerald-500/25 bg-emerald-500/10 text-emerald-300 group-hover:border-emerald-500/40 group-hover:bg-emerald-500/20 transition">
                <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${confirmedOpen ? '' : '-rotate-90'}`} />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                  <h2 className="text-sm font-bold text-slate-100 group-hover:text-emerald-300 transition">Flipuri Money Line confirmate</h2>
                  <span className="rounded-md border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-300">
                    {topConfirmedFlips.length} {translateText('confirmate', language)}
                  </span>
                </div>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
                  Ultimul flip confirmat pentru fiecare asset și timeframe, păstrat indiferent de vechime. Filtrează 1W + Bullish/Bearish pentru a vedea toate regimurile Weekly și data exactă a flipului.
                </p>
              </div>
            </button>
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

          {confirmedOpen && (
            topConfirmedFlips.length ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {topConfirmedFlips.map((candidate, index) => (
                  <ConfirmedFlipCard
                    key={`${candidate.id}:${candidate.candleTimestamp}`}
                    candidate={candidate}
                    rank={index + 1}
                    coinGeckoRank={candidate.marketCapRank ?? cryptoRankBySymbol.get(candidate.symbol.toUpperCase())}
                    knownAssets={knownAssets}
                    fundamentals={candidate.marketClass === 'crypto' ? cryptoFundamentals.get(candidate.symbol.toUpperCase()) : undefined}
                    stockAsset={candidate.marketClass === 'stocks' ? stockScanAssets.get(candidate.symbol.toUpperCase()) : undefined}
                    marketCap={resolveCardMarketCap(candidate.marketClass, candidate.symbol, cryptoFundamentals, stockScanAssets, knownAssets)}
                    onOpen={() => onOpenAsset(candidate.symbol, candidate.marketClass, candidate.timeframe)}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-[30px] border border-dashed border-white/[0.08] bg-white/[0.02] px-5 py-8 text-center text-xs text-slate-500">
                Niciun flip confirmat nu corespunde filtrelor selectate. Rulează „Scanare Top Flips” pentru a actualiza întregul univers.
              </div>
            )
          )}
        </section>
      )}

      {/* 2. TOP 20 APROAPE DE FLIP */}
      {(activeTab === 'ALL' || activeTab === 'FLIPS') && (
        <section className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <button
              type="button"
              onClick={() => setCandidatesOpen(prev => !prev)}
              className="flex items-start gap-2.5 text-left group transition focus:outline-none"
            >
              <div className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg border border-violet-500/25 bg-violet-500/10 text-violet-300 group-hover:border-violet-500/40 group-hover:bg-violet-500/20 transition">
                <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${candidatesOpen ? '' : '-rotate-90'}`} />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Radar className="h-4 w-4 text-violet-300" />
                  <h2 className="text-sm font-bold text-slate-100 group-hover:text-violet-300 transition">Top 20 aproape de flip</h2>
                  <span className="rounded-md border border-violet-500/25 bg-violet-500/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-violet-300">
                    {visibleCandidates.length} din {allMatchingCandidates.length} candidați
                  </span>
                </div>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
                  Un singur candidat per asset, din 4H/8H/1D/1W, ordonat după distanța ATR, alinierea ML 1W, SMA 50/200 și volum. „Așteaptă închiderea” nu este încă flip confirmat.
                </p>
              </div>
            </button>
            <div className="space-y-2">
              {candidateFilterControls}
              {allMatchingCandidates.length > UPCOMING_FLIP_DISPLAY_LIMIT && (
                <button
                  type="button"
                  onClick={() => setShowAllCandidates(prev => !prev)}
                  className="w-full rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-3 py-2 text-[10px] font-bold text-cyan-200 transition hover:bg-cyan-500/20"
                >
                  {showAllCandidates ? 'Arată primele 20' : `Arată toate (${allMatchingCandidates.length})`}
                </button>
              )}
            </div>
          </div>

          {candidatesOpen && flipCandidateCards}
        </section>
      )}

      {/* 4. TRACKED ALERTS (ALERTE URMĂRITE) */}
      {(activeTab === 'ALL' || activeTab === 'WATCHED') && (
        <section className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <button
              type="button"
              onClick={() => setActiveAlertsOpen(prev => !prev)}
              className="flex items-start gap-2.5 text-left group transition focus:outline-none"
            >
              <div className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg border border-cyan-500/25 bg-cyan-500/10 text-cyan-300 group-hover:border-cyan-500/40 group-hover:bg-cyan-500/20 transition">
                <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${activeAlertsOpen ? '' : '-rotate-90'}`} />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <BellRing className="h-4 w-4 text-cyan-300" />
                  <h2 className="text-sm font-bold text-slate-100 group-hover:text-cyan-300 transition">Tracked Alerts (Alerte urmărite)</h2>
                  <span className="rounded-md border border-cyan-500/25 bg-cyan-500/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-cyan-300">
                    {data?.activeAlerts.length || 0} active
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">Progresul este normalizat cu ATR până la Marginea Nor Slow, nivelul care confirmă flipul.</p>
              </div>
            </button>
            <div className="flex items-center gap-2">
              <span className="hidden font-mono text-[10px] text-slate-600 sm:inline">Doar refresh manual</span>
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

          {activeAlertsOpen && (
            loading && !data ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {[0, 1].map(item => <div key={item} className="h-56 animate-pulse rounded-[30px] border border-white/[0.06] bg-white/[0.03]" />)}
              </div>
            ) : data?.activeAlerts.length ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {sortByPR(data.activeAlerts
                  .slice()
                  .sort((left, right) => right.progressPercent - left.progressPercent))
                  .map(alert => (
                    <ActiveAlertCard
                      key={alert.id}
                      alert={alert}
                      removing={removingId === alert.id}
                      knownAssets={knownAssets}
                      stockAsset={alert.marketClass === 'stocks' ? stockScanAssets.get(alert.symbol.toUpperCase()) : undefined}
                      marketCap={resolveCardMarketCap(alert.marketClass, alert.symbol, cryptoFundamentals, stockScanAssets, knownAssets)}
                      onRemove={() => void removeAlert(alert)}
                      onOpen={() => onOpenAsset(alert.symbol, alert.marketClass, alert.timeframe)}
                    />
                  ))}
              </div>
            ) : (
              <div className="rounded-[30px] border border-dashed border-white/[0.10] bg-white/[0.02] px-5 py-12 text-center">
                <BellRing className="mx-auto h-8 w-8 text-slate-600" />
                <h3 className="mt-3 text-sm font-semibold text-slate-200">Nu ai alerte active</h3>
                <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-slate-500">Alertele active vor apărea aici.</p>
              </div>
            )
          )}
        </section>
      )}

    </div>
  );
};

const smaReclaimStatusMeta: Record<DailySmaReclaimResultStatus, { label: string; tone: string }> = {
  NEW_SIGNAL: { label: 'Semnal nou', tone: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/25' },
  ABOVE_BOTH: { label: 'Deja peste medii', tone: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/25' },
  NO_SIGNAL: { label: 'Fără semnal', tone: 'text-slate-400 bg-white/[0.04] border-white/[0.08]' },
  INSUFFICIENT_HISTORY: { label: 'Istoric insuficient', tone: 'text-amber-300 bg-amber-500/10 border-amber-500/25' },
  STALE_DATA: { label: 'Date neactualizate', tone: 'text-amber-200 bg-amber-500/10 border-amber-500/25' },
  ERROR: { label: 'Eroare', tone: 'text-rose-300 bg-rose-500/10 border-rose-500/25' }
};

const formatSmaDistance = (value?: number) => value === undefined || !Number.isFinite(value) ? 'indisponibil' : `${value.toFixed(2)} ATR`;

const DailySmaReclaimSection: React.FC<{
  report: import('@money-scanner/shared').DailySmaReclaimReport | null | undefined;
  onOpenAsset: AlertsCenterViewProps['onOpenAsset'];
  cryptoFundamentals?: Map<string, CryptoFundamentals>;
}> = ({ report, onOpenAsset, cryptoFundamentals }) => {
  const [open, setOpen] = useState(() => readPersistedOpen(ALERTS_SMA_OPEN_KEY, true));
  const toggleOpen = () => {
    setOpen(prev => {
      const next = !prev;
      writePersistedOpen(ALERTS_SMA_OPEN_KEY, next);
      return next;
    });
  };
  const headerButton = (
    <button
      type="button"
      onClick={toggleOpen}
      aria-expanded={open}
      title={open ? 'Compactează Recuperare SMA 50 + 200' : 'Extinde Recuperare SMA 50 + 200'}
      className="flex w-full items-start justify-between gap-3 text-left"
    >
      <span className="flex min-w-0 items-start gap-2.5">
        <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg border border-cyan-500/25 bg-cyan-500/10 text-cyan-300">
          <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${open ? '' : '-rotate-90'}`} />
        </span>
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2 text-cyan-300">
            <Radar className="h-5 w-5" />
            <h2 className="text-base font-bold text-white sm:text-lg">Recuperare SMA 50 + 200 · 1D</h2>
            <span className="rounded-md border border-cyan-500/25 bg-cyan-500/10 px-1.5 py-0.5 font-mono text-[10px]">DAILY_SMA50_200_RECLAIM</span>
          </span>
          {!open && report && (
            <span className="mt-1 block text-[11px] text-slate-500">
              {report.totals.newSignals} semnale noi · acoperire {report.totals.scanned}/{report.totals.total} · {report.analyzedDay}
            </span>
          )}
        </span>
      </span>
      {report && (
        <span className="shrink-0 text-right">
          <span className="block font-mono text-[10px] uppercase tracking-wider text-slate-500">Zi confirmare</span>
          <span className="mt-1 block font-mono text-sm font-bold text-cyan-200">{report.analyzedDay}</span>
          <span className="mt-1 block text-[10px] text-slate-500">08:00 Europe/Oslo · {report.status}</span>
        </span>
      )}
    </button>
  );

  if (!report) {
    return (
      <section className="rounded-[30px] border border-dashed border-cyan-500/20 bg-cyan-500/[0.03] p-5">
        {headerButton}
        {open && <p className="mt-3 text-xs leading-5 text-slate-500">Nu există încă un raport. Universul va fi evaluat zilnic la 08:00 Europe/Oslo.</p>}
      </section>
    );
  }
  const signals = report.results.filter(result => result.status === 'NEW_SIGNAL' && result.signal);
  const ordered = report.results.slice().sort((left, right) => (left.rank ?? 9999) - (right.rank ?? 9999) || left.symbol.localeCompare(right.symbol));
  return (
    <section className="space-y-4 rounded-[30px] border border-cyan-500/20 bg-[var(--t-surface)] p-4 sm:p-6">
      {headerButton}
      {open && (
      <>
      <p className="max-w-3xl text-xs leading-5 text-slate-400">Semnale bullish pe ultima lumânare UTC complet închisă. Universul este cel eligibil al proiectului: până la 150 de monede ordonate după CoinGecko, cu sursă de lumânări disponibilă și fără stablecoins; nu reprezintă automat primele 150 CoinGecko fără excluderi.</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        <SummaryCard icon={Zap} label="Semnale noi" value={report.totals.newSignals} tone="emerald" />
        <SummaryCard icon={TrendingUp} label="Peste ambele" value={report.totals.alreadyAboveBoth} tone="cyan" />
        <SummaryCard icon={ScanSearch} label="Fără semnal" value={report.totals.noSignal} tone="slate" />
        <SummaryCard icon={Clock3} label="Insuficient" value={report.totals.insufficientHistory} tone="amber" />
        <SummaryCard icon={AlertTriangle} label="Neactualizat" value={report.totals.staleData} tone="amber" />
        <SummaryCard icon={AlertTriangle} label="Erori" value={report.totals.errors} tone="rose" />
        <SummaryCard icon={CheckCircle2} label="Acoperire" value={`${report.totals.scanned}/${report.totals.total}`} tone="slate" />
      </div>
      <div className="rounded-xl border border-white/[0.07] bg-[var(--t-surface-raised)] px-3 py-2 text-[10px] text-slate-500">Sursă: {report.source} · execuție {report.durationMs}ms · {report.telegram ? `Telegram ${report.telegram.deliveredParts}/${report.telegram.parts} părți livrate` : 'Telegram neprocesat'}</div>
      {signals.length ? <div className="grid gap-3 lg:grid-cols-2">{signals.map(result => <DailySmaSignalCard key={result.symbol} result={result} marketCap={cryptoFundamentals?.get(result.symbol.toUpperCase())?.marketCap} onOpen={() => onOpenAsset(result.symbol, 'crypto', '1d')} />)}</div> : <div className="rounded-xl border border-dashed border-white/[0.08] px-4 py-5 text-center text-xs text-slate-500">Nu există traversări noi în ziua analizată. Monedele deja peste medii rămân vizibile în acoperirea de mai jos.</div>}
      <details className="rounded-xl border border-white/[0.07] bg-[var(--t-surface-raised)]" open>
        <summary className="cursor-pointer list-none px-3 py-2 text-xs font-bold text-slate-300">Acoperire completă ({ordered.length})</summary>
        <div className="grid max-h-80 gap-1.5 overflow-y-auto border-t border-white/[0.06] p-3 sm:grid-cols-2 lg:grid-cols-3">{ordered.map(result => <button key={result.symbol} type="button" onClick={() => onOpenAsset(result.symbol, 'crypto', '1d')} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2 text-left transition hover:border-cyan-500/30"><div className="flex items-center justify-between gap-2"><span className="font-mono text-[11px] font-bold text-slate-200">{result.symbol}</span><span className="font-mono text-[9px] text-slate-500">{result.rank ? `#${result.rank}` : '—'}</span></div><div className="mt-1 flex items-center justify-between gap-2"><span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold ${smaReclaimStatusMeta[result.status].tone}`}>{smaReclaimStatusMeta[result.status].label}</span><span className="truncate text-[9px] text-slate-600" title={result.reason}>{result.source}</span></div></button>)}</div>
      </details>
      </>
      )}
    </section>
  );
};

const DailySmaSignalCard: React.FC<{ result: DailySmaReclaimResult; marketCap?: number; onOpen: () => void }> = ({ result, marketCap, onOpen }) => {
  const signal = result.signal!;
  const dailyMl = signal.dailyMoneyLine;
  const weeklyMl = signal.weeklyMoneyLine;
  return <article className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.05] p-4"><div className="flex items-start justify-between gap-3"><button type="button" onClick={onOpen} className="min-w-0 text-left"><div className="flex flex-wrap items-center gap-2"><strong className="font-mono text-lg text-white">${result.symbol}</strong><span className="truncate text-xs font-semibold text-slate-300">{result.name}</span><span className="rounded border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] text-amber-200">{result.rank ? `CoinGecko #${result.rank}` : 'CoinGecko —'}</span></div><div className="mt-1 text-[10px] text-slate-500">{mcInline(marketCap)} · Confirmare: {reportDate(result.analyzedDay)}</div></button><span className="rounded border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-300">▲ SEMNAL NOU</span></div><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4"><LevelBox label="Închidere confirmare" value={formatPrice(signal.confirmationPrice)} tone="emerald" /><LevelBox label="Preț curent" value={formatPrice(result.currentPrice)} tone="cyan" /><LevelBox label="SMA 50 / 200" value={`${formatPrice(signal.sma50)} / ${formatPrice(signal.sma200)}`} tone="slate" /><LevelBox label="Distanță media superioară" value={formatSmaDistance(signal.distanceToUpperSmaAtr)} tone={signal.distanceLabel === 'EXTENDED' ? 'amber' : 'cyan'} /></div><div className="mt-3 flex flex-wrap gap-1.5 text-[9px] font-bold uppercase tracking-wide"><span className={`rounded border px-2 py-1 ${signal.rvolHighlighted ? 'border-amber-500/30 bg-amber-500/10 text-amber-200' : 'border-white/[0.07] text-slate-500'}`}>RVOL {signal.rvol?.toFixed(2) ?? 'indisponibil'}x</span><span className="rounded border border-white/[0.07] px-2 py-1 text-slate-500">SMA50 {signal.sma50Direction.toLowerCase()}</span><span className="rounded border border-white/[0.07] px-2 py-1 text-slate-500">SMA200 {signal.sma200Direction.toLowerCase()}</span><span className={`rounded border px-2 py-1 ${dailyMl.bullish ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300' : 'border-white/[0.07] text-slate-500'}`}>ML 1D {dailyMl.bullish ? 'bullish' : 'indisponibil/nebullish'}</span><span className={`rounded border px-2 py-1 ${weeklyMl?.bullish ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300' : 'border-white/[0.07] text-slate-500'}`}>ML 1W {weeklyMl?.bullish ? 'bullish' : 'indisponibil/nebullish'}</span></div><button type="button" onClick={onOpen} className="mt-3 flex w-full items-center justify-between border-t border-white/[0.06] pt-3 text-[11px] font-semibold text-cyan-300">Deschide graficul <ChevronRight className="h-3.5 w-3.5" /></button></article>;
};

const reportDate = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString(dateLocale(), { dateStyle: 'medium' });

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

const FlipCandidateCard: React.FC<{
  candidate: FlipCandidateDashboardItem;
  rank: number;
  coinGeckoRank?: number;
  preparing: boolean;
  alertActive: boolean;
  knownAssets?: AssetScannerRow[];
  fundamentals?: CryptoFundamentals;
  stockAsset?: StockBusinessQualityAsset;
  marketCap?: number;
  onPrepare: () => void;
  onOpen: () => void;
}> = ({ candidate, rank, coinGeckoRank, preparing, alertActive, knownAssets, fundamentals, stockAsset, marketCap, onPrepare, onOpen }) => {
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
  const confirmationPrice = candidate.confirmationPrice || candidate.currentPrice;
  const moveFromFlip = confirmationPrice > 0
    ? ((candidate.currentPrice - confirmationPrice) / confirmationPrice) * 100
    : 0;
  const moveFromFlipLabel = `${moveFromFlip >= 0 ? '+' : ''}${moveFromFlip.toFixed(2)}%`;
  const highDistance = distanceFromLastClosedHigh(candidate.currentPrice, candidate.lastClosedHigh);
  const assetName = getAssetName(candidate.symbol, candidate.name, knownAssets);
  const showName = assetName && assetName.toUpperCase() !== candidate.symbol.toUpperCase();

  return (
    <article className="overflow-hidden rounded-[30px] border border-white/[0.07] bg-background-card shadow-sm transition hover:border-violet-500/20">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <button type="button" onClick={onOpen} className="flex min-w-0 items-start gap-3 text-left">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-violet-500/20 bg-violet-500/10 font-mono text-xs font-black text-violet-200">#{rank}</div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <strong className="font-mono text-lg text-white">${candidate.symbol}</strong>
                {showName && (
                  <span className="text-xs sm:text-sm font-semibold text-slate-200 truncate max-w-[170px] sm:max-w-[280px]" title={assetName}>
                    {assetName}
                  </span>
                )}
                {candidate.marketClass === 'crypto' && coinGeckoRank && (
                  <span className="rounded-md border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-200">CoinGecko #{coinGeckoRank}</span>
                )}
                {candidate.marketClass === 'crypto' && <NarrativeTag narrative={fundamentals?.narrative} />}
                <span className="rounded-md border border-cyan-500/25 bg-cyan-500/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-cyan-300">{candidate.timeframe.toUpperCase()}</span>
                <span className="rounded-md border border-white/[0.07] bg-white/[0.03] px-1.5 py-0.5 text-[9px] uppercase text-slate-500">{candidate.marketClass}</span>
              </div>
              <CardMarketCapLine value={marketCap} sector={stockAsset?.sector} />
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
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/[0.05]">
              <div className={`h-full rounded-full ${bullish ? 'bg-emerald-400' : 'bg-rose-400'}`} style={{ width: `${proximity}%` }} />
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono text-xl font-black text-white">{candidate.distanceAtr.toFixed(2)} ATR</div>
            <div className="font-mono text-[10px] text-slate-500">{candidate.distancePercent.toFixed(2)}%</div>
          </div>
        </div>

        {candidate.status === 'CONFIRMED' ? (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <LevelBox label="Închidere flip" value={formatPrice(confirmationPrice)} tone={bullish ? 'emerald' : 'rose'} />
            <LevelBox label="Preț acum" value={formatPrice(candidate.currentPrice)} tone="cyan" />
            <LevelBox label="Față de high" value={highDistance?.label ?? '—'} tone={highDistance?.tone ?? 'slate'} />
            <LevelBox label="Față de flip" value={moveFromFlipLabel} tone={moveFromFlip >= 0 ? 'emerald' : 'rose'} />
            <LevelBox label="Confirmat" value={formatRelativeAge(getFlipConfirmedAt(candidate))} tone="slate" />
            <LevelBox label="ML 1W" value={`${candidate.weeklyTier} · ${candidate.weeklyScore > 0 ? '+' : ''}${candidate.weeklyScore}`} tone={candidate.weeklyAligned ? (bullish ? 'emerald' : 'rose') : 'slate'} />
            <LevelBox label="Prioritate" value={`${candidate.priorityScore.toFixed(0)}/100`} tone={candidate.priorityScore >= 80 ? 'amber' : 'slate'} />
            {candidate.marketClass === 'crypto' && <FundamentalBoxes fundamentals={fundamentals} />}
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <LevelBox label="Preț acum" value={formatPrice(candidate.currentPrice)} tone="slate" />
            <LevelBox label="Față de high" value={highDistance?.label ?? '—'} tone={highDistance?.tone ?? 'slate'} />
            <LevelBox label={`${bullish ? 'Peste' : 'Sub'} Slow`} value={formatPrice(candidate.triggerPrice)} tone={bullish ? 'emerald' : 'rose'} />
            <LevelBox label="ML 1W" value={`${candidate.weeklyTier} · ${candidate.weeklyScore > 0 ? '+' : ''}${candidate.weeklyScore}`} tone={candidate.weeklyAligned ? (bullish ? 'emerald' : 'rose') : 'slate'} />
            <LevelBox label="Prioritate" value={`${candidate.priorityScore.toFixed(0)}/100`} tone={candidate.priorityScore >= 80 ? 'amber' : 'slate'} />
            {candidate.marketClass === 'crypto' && <FundamentalBoxes fundamentals={fundamentals} />}
          </div>
        )}

        {candidate.marketClass === 'stocks' && stockAsset && <StockFundamentalsSection asset={stockAsset} />}

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
  coinGeckoRank?: number;
  knownAssets?: AssetScannerRow[];
  fundamentals?: CryptoFundamentals;
  stockAsset?: StockBusinessQualityAsset;
  marketCap?: number;
  onOpen: () => void;
}> = ({ candidate, rank, coinGeckoRank, knownAssets, fundamentals, stockAsset, marketCap, onOpen }) => {
  const bullish = candidate.direction === 'BULLISH';
  const tone = bullish
    ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
    : 'border-rose-500/25 bg-rose-500/10 text-rose-300';
  const alignmentCount = [candidate.weeklyAligned, candidate.sma50Aligned, candidate.sma200Aligned].filter(Boolean).length;
  const confirmationPrice = candidate.confirmationPrice || candidate.currentPrice;
  const moveFromFlip = confirmationPrice > 0
    ? ((candidate.currentPrice - confirmationPrice) / confirmationPrice) * 100
    : 0;
  const moveFromFlipLabel = `${moveFromFlip >= 0 ? '+' : ''}${moveFromFlip.toFixed(2)}%`;
  const highDistance = distanceFromLastClosedHigh(candidate.currentPrice, candidate.lastClosedHigh);
  const confirmedAtTimestamp = getFlipConfirmedAt(candidate);
  const assetName = getAssetName(candidate.symbol, candidate.name, knownAssets);
  const showName = assetName && assetName.toUpperCase() !== candidate.symbol.toUpperCase();

  return (
    <article className="rounded-[30px] border border-white/[0.07] bg-background-card p-4 shadow-sm transition hover:border-emerald-500/20">
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={onOpen} className="flex min-w-0 items-start gap-3 text-left">
          <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border font-mono text-xs font-black ${tone}`}>#{rank}</div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <strong className="font-mono text-lg text-white">${candidate.symbol}</strong>
              {showName && (
                <span className="text-xs sm:text-sm font-semibold text-slate-200 truncate max-w-[170px] sm:max-w-[280px]" title={assetName}>
                  {assetName}
                </span>
              )}
              {candidate.marketClass === 'crypto' && coinGeckoRank && (
                <span className="rounded-md border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-200">CoinGecko #{coinGeckoRank}</span>
              )}
              {candidate.marketClass === 'crypto' && <NarrativeTag narrative={fundamentals?.narrative} />}
              <span className="rounded-md border border-cyan-500/25 bg-cyan-500/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-cyan-300">{candidate.timeframe.toUpperCase()}</span>
              <span className="rounded-md border border-white/[0.07] bg-white/[0.03] px-1.5 py-0.5 text-[9px] uppercase text-slate-500">{candidate.marketClass}</span>
            </div>
            <CardMarketCapLine value={marketCap} sector={stockAsset?.sector} />
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500"><Clock3 className="h-3 w-3 shrink-0" /> Confirmat {formatRelativeAge(confirmedAtTimestamp)} · {formatDate(confirmedAtTimestamp)}</div>
          </div>
        </button>
        <div className="flex flex-col items-end gap-1">
          <span className={`shrink-0 rounded-lg border px-2 py-1 font-mono text-[10px] font-black ${tone}`}>
            {bullish ? '▲ BULL FLIP' : '▼ BEAR FLIP'}
          </span>
          <span className={`font-mono text-[11px] font-bold ${moveFromFlip >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {moveFromFlipLabel} de la flip
          </span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <LevelBox label="Închidere flip" value={formatPrice(confirmationPrice)} tone={bullish ? 'emerald' : 'rose'} />
        <LevelBox label="Preț actual" value={formatPrice(candidate.currentPrice)} tone="cyan" />
        <LevelBox label="Față de high" value={highDistance?.label ?? '—'} tone={highDistance?.tone ?? 'slate'} />
        <LevelBox label="Față de flip" value={moveFromFlipLabel} tone={moveFromFlip >= 0 ? 'emerald' : 'rose'} />
        <LevelBox label="Scor setup" value={`${candidate.priorityScore.toFixed(0)}/100`} tone={candidate.priorityScore >= 80 ? 'amber' : 'cyan'} />
        <LevelBox label="ML 1W" value={`${candidate.weeklyTier} · ${candidate.weeklyScore > 0 ? '+' : ''}${candidate.weeklyScore}`} tone={candidate.weeklyAligned ? (bullish ? 'emerald' : 'rose') : 'slate'} />
        <LevelBox label="RVOL" value={`${candidate.rvol.toFixed(2)}x`} tone={candidate.rvol >= 1.2 ? 'emerald' : 'slate'} />
        {candidate.marketClass === 'crypto' && <FundamentalBoxes fundamentals={fundamentals} />}
      </div>

      {candidate.marketClass === 'stocks' && stockAsset && <StockFundamentalsSection asset={stockAsset} />}

      <button type="button" onClick={onOpen} className="mt-3 flex w-full items-center justify-between border-t border-white/[0.05] pt-3 text-[11px] text-slate-500 transition hover:text-cyan-300">
        <span>Confluență {alignmentCount}/3 · SMA50 {candidate.sma50Aligned ? 'aliniat' : 'neconfirmat'} · SMA200 {candidate.sma200Aligned ? 'aliniat' : 'neconfirmat'}</span>
        <span className="flex items-center gap-1 font-semibold text-cyan-300">Deschide {candidate.timeframe.toUpperCase()} <ChevronRight className="h-3.5 w-3.5" /></span>
      </button>
    </article>
  );
};

const ActiveAlertCard: React.FC<{ alert: ActiveAlertDashboardItem; removing: boolean; knownAssets?: AssetScannerRow[]; stockAsset?: StockBusinessQualityAsset; marketCap?: number; onRemove: () => void; onOpen: () => void }> = ({ alert, removing, knownAssets, stockAsset, marketCap, onRemove, onOpen }) => {
  const meta = statusMeta[alert.status];
  const assetName = getAssetName(alert.symbol, undefined, knownAssets);
  const showName = assetName && assetName.toUpperCase() !== alert.symbol.toUpperCase();

  return (
    <article className="rounded-[30px] border border-white/[0.07] bg-background-card p-4 shadow-sm transition hover:border-cyan-500/20">
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={onOpen} className="min-w-0 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <strong className="font-mono text-lg text-white">${alert.symbol}</strong>
            {showName && (
              <span className="text-xs sm:text-sm font-semibold text-slate-200 truncate max-w-[170px] sm:max-w-[280px]" title={assetName}>
                {assetName}
              </span>
            )}
            <span className="rounded-md border border-cyan-500/25 bg-cyan-500/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-cyan-300">{alert.timeframe.toUpperCase()}</span>
            <span className="rounded-md border border-white/[0.07] bg-white/[0.03] px-1.5 py-0.5 text-[9px] uppercase text-slate-500">{alert.marketClass}</span>
          </div>
          <CardMarketCapLine value={marketCap} sector={stockAsset?.sector} />
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
        <div className="h-2.5 overflow-hidden rounded-full bg-white/[0.05]">
          <div className={`h-full rounded-full transition-all duration-700 ${meta.bar}`} style={{ width: `${Math.max(2, alert.progressPercent)}%` }} />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <LevelBox label="Preț acum" value={formatPrice(alert.currentPrice)} tone="slate" />
        <LevelBox label="Trigger Slow" value={formatPrice(alert.triggerPrice)} tone="cyan" />
        <LevelBox label="Fast" value={alert.fastBullish ? 'Bullish' : 'Bearish'} tone={alert.fastBullish ? 'emerald' : 'rose'} />
        <LevelBox label="Slow" value={alert.slowBullish ? 'Bullish' : 'Bearish'} tone={alert.slowBullish ? 'emerald' : 'rose'} />
      </div>

      {alert.marketClass === 'stocks' && stockAsset && <StockFundamentalsSection asset={stockAsset} />}

      {alert.lastPlan && (
        <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl border border-white/[0.06] bg-[var(--t-surface-raised)] p-2.5">
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

// P/R = MC / (revenue 30d x 365/30); "—" when revenue is missing.
const FundamentalBoxes: React.FC<{ fundamentals?: CryptoFundamentals }> = ({ fundamentals }) => (
  <>
    <LevelBox label="P/R" value={formatPriceToRevenue(fundamentals?.priceToRevenue)} tone={fundamentals?.priceToRevenue !== undefined ? 'cyan' : 'slate'} />
    <LevelBox label="Revenue 30z" value={formatRevenue30d(fundamentals?.revenue30d)} tone="slate" />
  </>
);

const LevelBox: React.FC<{ label: string; value: string; tone: 'slate' | 'cyan' | 'rose' | 'amber' | 'emerald' }> = ({ label, value, tone }) => {
  const colors = { slate: 'text-slate-200', cyan: 'text-cyan-300', rose: 'text-rose-300', amber: 'text-amber-300', emerald: 'text-emerald-300' };
  return (
    <div className="rounded-lg border border-white/[0.05] bg-white/[0.025] px-2.5 py-2">
      <div className="text-[9px] font-bold uppercase tracking-wider text-slate-600">{label}</div>
      <div className={`mt-1 truncate font-mono text-[11px] font-bold ${colors[tone]}`}>{value}</div>
    </div>
  );
};
