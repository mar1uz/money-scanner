import React, { useEffect, useMemo, useState } from 'react';
import {
  AssetMarketClass,
  BacktestComparisonResult,
  BacktestDirectionMode,
  BacktestResult,
  BacktestStrategy
} from '../types.js';
import { fetchResearchBacktest, fetchResearchComparison } from '../services/api.js';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  ExternalLink,
  GitCompareArrows,
  LineChart,
  Play,
  ShieldAlert,
  Target,
  TrendingDown,
  TrendingUp
} from 'lucide-react';
import { AssetLink } from './AssetNavigation.js';

interface BacktestAssetOption {
  symbol: string;
  name: string;
  marketClass: AssetMarketClass;
}

const BACKTEST_ASSETS: BacktestAssetOption[] = [
  { symbol: 'BTC', name: 'Bitcoin', marketClass: 'crypto' },
  { symbol: 'ETH', name: 'Ethereum', marketClass: 'crypto' },
  { symbol: 'SOL', name: 'Solana', marketClass: 'crypto' },
  { symbol: 'BNB', name: 'BNB', marketClass: 'crypto' },
  { symbol: 'XRP', name: 'XRP', marketClass: 'crypto' },
  { symbol: 'DOGE', name: 'Dogecoin', marketClass: 'crypto' },
  { symbol: 'LINK', name: 'Chainlink', marketClass: 'crypto' },
  { symbol: 'SUI', name: 'Sui', marketClass: 'crypto' },
  { symbol: 'SPY', name: 'S&P 500 ETF', marketClass: 'stocks' },
  { symbol: 'QQQ', name: 'Nasdaq 100 ETF', marketClass: 'stocks' },
  { symbol: 'IWM', name: 'Russell 2000 ETF', marketClass: 'stocks' },
  { symbol: 'NVDA', name: 'NVIDIA', marketClass: 'stocks' },
  { symbol: 'AAPL', name: 'Apple', marketClass: 'stocks' },
  { symbol: 'MSFT', name: 'Microsoft', marketClass: 'stocks' },
  { symbol: 'AMZN', name: 'Amazon', marketClass: 'stocks' },
  { symbol: 'META', name: 'Meta', marketClass: 'stocks' },
  { symbol: 'GOOGL', name: 'Alphabet', marketClass: 'stocks' },
  { symbol: 'TSLA', name: 'Tesla', marketClass: 'stocks' },
  { symbol: 'XAU', name: 'Gold', marketClass: 'metals' },
  { symbol: 'XAG', name: 'Silver', marketClass: 'metals' },
  { symbol: 'COPPER', name: 'Copper', marketClass: 'metals' }
];

type ResearchStrategy = Extract<BacktestStrategy, 'weekly_donchian_long' | 'bear_rally_fade' | 'weekly_reclaim'>;
const STRATEGY_META: Record<ResearchStrategy, { title: string; description: string; scope: string }> = {
  weekly_donchian_long: {
    title: 'Strategia 1 · Weekly Trend + Donchian 55/20 LONG',
    description: 'Cumpără numai breakout-uri Daily peste maximul ultimelor 55 de sesiuni, într-un regim MoneyLine Weekly bullish și cu trend Daily matur. Riscul este plafonat la 4%, iar ieșirea urmărește minimul Donchian pe 20 de sesiuni.',
    scope: 'Strategia recomandată și alertată live exclusiv pentru acțiuni și ETF-uri lichide; nu se aplică crypto sau metalelor.'
  },
  bear_rally_fade: {
    title: 'Strategia 2 · Bear Rally Fade SHORT',
    description: 'Vinde revenirea numai într-un regim bearish confirmat de asset și de benchmark. RSI(2) peste 95 armează setup-ul, iar revenirea sub 50 în maximum 3 închideri confirmă intrarea.',
    scope: 'SHORT pe crypto lichid (confirmare BTC) și acțiuni/ETF-uri SUA lichide (confirmare SPY). Nu se aplică metalelor; riscul short poate fi nelimitat.'
  },
  weekly_reclaim: {
    title: 'Weekly Trend + Daily SMA50 Reclaim',
    description: 'Regimul Weekly decide direcția. Pullback-ul Daily armează setup-ul, iar reclaim-ul SMA50 este confirmat de MoneyLine Fast Daily și Slow 8H.',
    scope: 'Model MoneyLine experimental, cu frecvență mai redusă și istoric comun limitat de datele 8H.'
  }
};

const formatPercent = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
const formatPrice = (value?: number) => value && Number.isFinite(value)
  ? `$${value.toLocaleString('en-US', { maximumFractionDigits: value < 1 ? 6 : 2 })}`
  : '—';
const formatDate = (value: number) => new Date(value).toLocaleDateString('ro-RO', {
  day: '2-digit', month: 'short', year: 'numeric'
});

export const BacktestView: React.FC = () => {
  const [strategy, setStrategy] = useState<ResearchStrategy>('weekly_donchian_long');
  const [assetKey, setAssetKey] = useState('stocks:SPY');
  const [directionMode, setDirectionMode] = useState<BacktestDirectionMode>('LONG_ONLY');
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [comparison, setComparison] = useState<BacktestComparisonResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [error, setError] = useState('');
  const availableAssets = useMemo(
    () => strategy === 'weekly_reclaim'
      ? BACKTEST_ASSETS
      : strategy === 'weekly_donchian_long'
        ? BACKTEST_ASSETS.filter(asset => asset.marketClass === 'stocks')
        : BACKTEST_ASSETS.filter(asset => asset.marketClass !== 'metals'),
    [strategy]
  );
  const effectiveDirectionMode: BacktestDirectionMode = strategy === 'bear_rally_fade'
    ? 'SHORT_ONLY'
    : strategy === 'weekly_donchian_long' ? 'LONG_ONLY' : directionMode;
  const selectedAsset = useMemo(() => {
    const [marketClass, symbol] = assetKey.split(':') as [AssetMarketClass, string];
    return availableAssets.find(asset => asset.symbol === symbol && asset.marketClass === marketClass) || availableAssets[0];
  }, [assetKey, availableAssets]);

  const runSimulation = () => {
    setLoading(true);
    setError('');
    fetchResearchBacktest(strategy, selectedAsset.symbol, selectedAsset.marketClass, effectiveDirectionMode)
      .then(setResult)
      .catch(loadError => setError(loadError instanceof Error ? loadError.message : 'Backtest indisponibil.'))
      .finally(() => setLoading(false));
  };

  const runComparison = () => {
    setComparisonLoading(true);
    setError('');
    fetchResearchComparison(strategy, effectiveDirectionMode)
      .then(setComparison)
      .catch(loadError => setError(loadError instanceof Error ? loadError.message : 'Comparația nu a putut fi rulată.'))
      .finally(() => setComparisonLoading(false));
  };

  useEffect(() => {
    runSimulation();
  }, [assetKey, effectiveDirectionMode, strategy]);

  useEffect(() => {
    setComparison(null);
  }, [strategy, effectiveDirectionMode]);

  useEffect(() => {
    if (!availableAssets.some(asset => `${asset.marketClass}:${asset.symbol}` === assetKey)) {
      setAssetKey(`${availableAssets[0].marketClass}:${availableAssets[0].symbol}`);
    }
  }, [assetKey, availableAssets]);

  return (
    <div className="space-y-6 pb-8">
      <section className="rounded-[30px] border border-cyan-500/25 bg-gradient-to-br from-cyan-500/[0.08] via-background-card to-violet-500/[0.06] p-4 sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-cyan-300">
              <LineChart className="h-5 w-5" />
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em]">Cercetare pe lumânări închise</span>
            </div>
            <h1 className="mt-2 text-xl font-bold text-white sm:text-2xl">{STRATEGY_META[strategy].title}</h1>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              {STRATEGY_META[strategy].description} Ordinul intră la următoarea deschidere Daily.
            </p>
            <div className="mt-3 inline-flex rounded-lg border border-emerald-500/20 bg-emerald-500/[0.07] px-2.5 py-1.5 text-[10px] leading-4 text-emerald-200/80">{STRATEGY_META[strategy].scope}</div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(190px,1fr)_minmax(180px,1fr)_auto_auto_auto]">
            <select
              value={strategy}
              onChange={event => setStrategy(event.target.value as ResearchStrategy)}
              className="rounded-xl border border-emerald-500/25 bg-background-surface px-3 py-2.5 text-xs font-mono text-emerald-200 outline-none focus:border-emerald-500/50"
            >
              <option value="weekly_donchian_long">Strategia 1 · LONG Donchian 55/20</option>
              <option value="bear_rally_fade">Strategia 2 · SHORT Bear Rally</option>
              <option value="weekly_reclaim">Experimentală · MoneyLine Reclaim</option>
            </select>
            <select
              value={assetKey}
              onChange={event => setAssetKey(event.target.value)}
              className="rounded-xl border border-white/[0.09] bg-background-surface px-3 py-2.5 text-xs font-mono text-cyan-200 outline-none focus:border-cyan-500/50"
            >
              {availableAssets.map(asset => (
                <option key={`${asset.marketClass}:${asset.symbol}`} value={`${asset.marketClass}:${asset.symbol}`}>
                  ${asset.symbol} · {asset.name} · {asset.marketClass}
                </option>
              ))}
            </select>
            <AssetLink
              symbol={selectedAsset.symbol}
              marketClass={selectedAsset.marketClass}
              timeframe="1d"
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-cyan-500/25 bg-cyan-500/[0.08] px-3 py-2.5 text-xs font-bold text-cyan-200"
            >
              ${selectedAsset.symbol} Money Line <ExternalLink className="h-3.5 w-3.5" />
            </AssetLink>
            {strategy === 'weekly_reclaim' ? (
              <select
                value={directionMode}
                onChange={event => setDirectionMode(event.target.value as BacktestDirectionMode)}
                className="rounded-xl border border-white/[0.09] bg-background-surface px-3 py-2.5 text-xs font-mono text-slate-200 outline-none focus:border-cyan-500/50"
              >
                <option value="LONG_ONLY">Doar LONG</option>
                <option value="LONG_SHORT">LONG + SHORT · cercetare</option>
              </select>
            ) : (
              <div className={`inline-flex items-center justify-center rounded-xl border px-3 py-2.5 font-mono text-xs font-bold ${strategy === 'bear_rally_fade' ? 'border-rose-500/25 bg-rose-500/10 text-rose-200' : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200'}`}>
                {strategy === 'bear_rally_fade' ? 'Doar SHORT' : 'Doar LONG'}
              </div>
            )}
            <button
              type="button"
              onClick={runSimulation}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-500/35 bg-cyan-500/15 px-4 py-2.5 text-xs font-bold text-cyan-200 transition hover:bg-cyan-500/25 disabled:opacity-60"
            >
              <Play className={`h-3.5 w-3.5 ${loading ? 'animate-pulse' : ''}`} /> {loading ? 'Calculez…' : 'Rulează'}
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {loading && !result ? (
        <div className="h-72 animate-pulse rounded-[30px] border border-white/[0.06] bg-white/[0.03]" />
      ) : result ? (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <MetricCard label="Randament" value={formatPercent(result.totalReturnPercent)} detail={`Buy & Hold ${formatPercent(result.buyAndHoldReturnPercent)}`} tone={result.totalReturnPercent >= 0 ? 'emerald' : 'rose'} icon={TrendingUp} />
            <MetricCard label="Win rate" value={`${result.winRate.toFixed(1)}%`} detail={`${result.winningTrades} win / ${result.losingTrades} loss`} tone="cyan" icon={Target} />
            <MetricCard label="Profit factor" value={result.profitFactor.toFixed(2)} detail={`${result.totalTrades} tranzacții`} tone={result.profitFactor >= 1.2 ? 'emerald' : 'amber'} icon={BarChart3} />
            <MetricCard label="Expectancy" value={`${(result.expectancyR || 0) >= 0 ? '+' : ''}${(result.expectancyR || 0).toFixed(2)}R`} detail={`${(result.averageTradeReturnPercent || 0).toFixed(2)}% / trade`} tone={(result.expectancyR || 0) > 0 ? 'emerald' : 'rose'} icon={Activity} />
            <MetricCard label="Max drawdown" value={`-${result.maxDrawdownPercent.toFixed(2)}%`} detail="Peak-to-trough" tone="rose" icon={TrendingDown} />
            <MetricCard label="Sharpe anualizat" value={result.sharpeRatio.toFixed(2)} detail={`${Math.round(result.averageTradeDurationHours / 24)} zile mediu`} tone="violet" icon={ShieldAlert} />
          </section>

          {result.validation && (
            <section className={`rounded-xl border p-3 sm:p-4 ${result.validation.profitable ? 'border-emerald-500/25 bg-emerald-500/[0.055]' : 'border-rose-500/25 bg-rose-500/[0.055]'}`}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Verificare cronologică · ultimele 30% din istoric</div>
                  <div className="mt-1 text-xs text-slate-500">Perioadă ținută separat începând cu {formatDate(result.validation.startTimestamp)}; indicatorii păstrează istoricul anterior numai pentru încălzire.</div>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  <MiniStat label="Trades" value={String(result.validation.totalTrades)} />
                  <MiniStat label="Win rate" value={`${result.validation.winRate.toFixed(1)}%`} />
                  <MiniStat label="PF" value={result.validation.profitFactor.toFixed(2)} />
                  <MiniStat label="Return" value={formatPercent(result.validation.totalReturnPercent)} />
                  <MiniStat label="Max DD" value={`-${result.validation.maxDrawdownPercent.toFixed(2)}%`} />
                </div>
              </div>
            </section>
          )}

          <section className="grid gap-4 xl:grid-cols-[1.45fr_0.55fr]">
            <PriceChart result={result} />
            <div className="rounded-[30px] border border-white/[0.07] bg-background-card p-4">
              <h2 className="text-sm font-bold text-slate-100">Reguli testate</h2>
              <div className="mt-3 space-y-2">
                {(result.strategyRules || []).map((rule, index) => (
                  <div key={rule} className="flex gap-2 rounded-lg border border-white/[0.05] bg-white/[0.025] p-2.5 text-[11px] leading-5 text-slate-400">
                    <span className="font-mono font-black text-cyan-400">{index + 1}</span><span>{rule}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] p-3 text-[10px] leading-5 text-amber-100/70">
                {result.params.strategy === 'weekly_donchian_long'
                  ? 'Breakout-ul se confirmă numai la închiderea Daily peste maximul precedentelor 55 de sesiuni. Intrarea este la următorul open doar dacă gap-ul este maximum 1 ATR și stopul rezultat rămâne sub 4%.'
                  : result.params.strategy === 'bear_rally_fade'
                    ? 'RSI(2) peste 95 doar armează setup-ul. Intrarea SHORT are loc numai după confirmarea sub 50, la următorul open. Riscul unei poziții short poate depăși capitalul inițial.'
                  : 'Un semnal produs la închiderea Daily se execută la următoarea deschidere. Dacă stopul și ținta sunt atinse în aceeași lumânare, backtestul presupune conservator că stopul a fost primul.'}
              </div>
              {!!result.strategySources?.length && (
                <div className="mt-3 space-y-1.5">
                  {result.strategySources.map(source => (
                    <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-[10px] text-cyan-300/75 hover:text-cyan-200">
                      <ExternalLink className="h-3 w-3" /> {source.label}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </section>

          <EquityChart result={result} />

          <section className="rounded-[30px] border border-violet-500/20 bg-violet-500/[0.04] p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2"><GitCompareArrows className="h-4 w-4 text-violet-300" /><h2 className="text-sm font-bold text-slate-100">Verificare multi-asset</h2></div>
                <p className="mt-1 text-xs text-slate-500">{strategy === 'weekly_reclaim' ? '10 active din crypto, acțiuni și metale' : strategy === 'weekly_donchian_long' ? '10 acțiuni și ETF-uri lichide' : '7 active lichide din crypto și acțiuni'} — aceleași reguli, fără optimizare individuală.</p>
              </div>
              <button
                type="button"
                onClick={runComparison}
                disabled={comparisonLoading}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-2.5 text-xs font-bold text-violet-200 transition hover:bg-violet-500/20 disabled:opacity-60"
              >
                <GitCompareArrows className={`h-4 w-4 ${comparisonLoading ? 'animate-pulse' : ''}`} /> {comparisonLoading ? 'Compar…' : `Compară ${strategy === 'weekly_reclaim' || strategy === 'weekly_donchian_long' ? 10 : 7} active`}
              </button>
            </div>
            {comparison && <ComparisonTable comparison={comparison} />}
          </section>

          <TradeLog result={result} />

          <div className="flex items-start gap-2 rounded-xl border border-slate-800 bg-slate-900/80 p-3 text-[11px] leading-5 text-slate-400">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" /> <span>{result.disclaimer}</span>
          </div>
        </>
      ) : null}
    </div>
  );
};

const MetricCard: React.FC<{
  label: string;
  value: string;
  detail: string;
  tone: 'cyan' | 'emerald' | 'rose' | 'amber' | 'violet';
  icon: React.ElementType;
}> = ({ label, value, detail, tone, icon: Icon }) => {
  const colors = {
    cyan: 'text-cyan-300 border-cyan-500/15',
    emerald: 'text-emerald-300 border-emerald-500/15',
    rose: 'text-rose-300 border-rose-500/15',
    amber: 'text-amber-300 border-amber-500/15',
    violet: 'text-violet-300 border-violet-500/15'
  };
  return (
    <div className={`rounded-xl border bg-background-card p-3 ${colors[tone]}`}>
      <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-500"><Icon className="h-3.5 w-3.5" /> {label}</div>
      <div className={`mt-2 font-mono text-lg font-black ${colors[tone].split(' ')[0]}`}>{value}</div>
      <div className="mt-1 truncate font-mono text-[9px] text-slate-600">{detail}</div>
    </div>
  );
};

const PriceChart: React.FC<{ result: BacktestResult }> = ({ result }) => {
  const points = result.priceSeries || [];
  if (!points.length) return null;
  const isDonchian = result.params.strategy === 'weekly_donchian_long';
  const isBearRally = result.params.strategy === 'bear_rally_fade';
  const isRsiStrategy = isBearRally;
  const rsiThreshold = result.params.rsi2EntryThreshold ?? 5;
  const rsiConfirmation = result.params.rsi2ConfirmationThreshold ?? 50;
  const width = 900;
  const height = 300;
  const fastValue = (point: typeof points[number]) => isRsiStrategy ? (point.sma5 ?? point.sma50) : point.sma50;
  const values = points.flatMap(point => [
    point.close,
    fastValue(point),
    point.sma200,
    ...(isDonchian ? [point.donchianHigh55, point.donchianLow20] : [])
  ]).filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = maxValue - minValue || 1;
  const minTime = points[0].timestamp;
  const maxTime = points[points.length - 1].timestamp;
  const timeRange = maxTime - minTime || 1;
  const x = (timestamp: number) => ((timestamp - minTime) / timeRange) * (width - 24) + 12;
  const y = (value: number) => height - ((value - minValue) / range) * (height - 30) - 15;
  const path = (selector: (point: typeof points[number]) => number) => points.map((point, index) =>
    `${index ? 'L' : 'M'} ${x(point.timestamp).toFixed(2)} ${y(selector(point)).toFixed(2)}`
  ).join(' ');
  const rsiPath = points.map((point, index) => {
    const value = Math.max(0, Math.min(100, point.rsi2 ?? 50));
    const rsiY = 66 - value / 100 * 58;
    return `${index ? 'L' : 'M'} ${x(point.timestamp).toFixed(2)} ${rsiY.toFixed(2)}`;
  }).join(' ');
  const pointAt = (timestamp: number) => points.reduce((best, point) =>
    Math.abs(point.timestamp - timestamp) < Math.abs(best.timestamp - timestamp) ? point : best
  , points[0]);

  return (
    <div className="rounded-[30px] border border-white/[0.07] bg-background-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-slate-100">Preț, {isRsiStrategy ? 'SMA5' : 'SMA50'}{isDonchian ? ', Donchian 55/20' : ''} și execuții</h2>
          <p className="mt-1 font-mono text-[10px] text-slate-600">{formatDate(points[0].timestamp)} — {formatDate(points[points.length - 1].timestamp)}</p>
        </div>
        <div className="flex flex-wrap gap-3 text-[9px] font-bold uppercase">
          <span className="text-slate-200">● Preț</span><span className="text-cyan-300">— {isRsiStrategy ? 'SMA5' : 'SMA50'}</span><span className="text-amber-300">— SMA200</span>{isDonchian && <><span className="text-violet-300">— D55</span><span className="text-emerald-300">— D20</span></>}<span className="text-emerald-300">▲ Entry</span><span className="text-rose-300">× Exit</span>
        </div>
      </div>
      <div className="mt-4 overflow-hidden rounded-xl border border-white/[0.05] bg-[var(--t-surface-raised)] p-2">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-64 w-full" role="img" aria-label="Grafic backtest cu intrări și ieșiri">
          {[0.25, 0.5, 0.75].map(level => <line key={level} x1="0" y1={height * level} x2={width} y2={height * level} stroke="#1D222B" strokeDasharray="4 5" />)}
          <path d={path(point => point.close)} fill="none" stroke="#e2e8f0" strokeWidth="1.5" opacity="0.9" />
          <path d={path(fastValue)} fill="none" stroke="#CDEE7F" strokeWidth="1.7" />
          <path d={path(point => point.sma200)} fill="none" stroke="#FFC24B" strokeWidth="1.7" />
          {isDonchian && <path d={path(point => point.donchianHigh55 ?? point.close)} fill="none" stroke="#A78BFA" strokeWidth="1.4" strokeDasharray="5 4" />}
          {isDonchian && <path d={path(point => point.donchianLow20 ?? point.close)} fill="none" stroke="#57DFA5" strokeWidth="1.4" strokeDasharray="5 4" />}
          {result.trades.map(trade => {
            const entryPoint = pointAt(trade.entryTimestamp);
            const exitPoint = pointAt(trade.exitTimestamp);
            const entryX = x(trade.entryTimestamp);
            const entryY = y(entryPoint.close);
            const exitX = x(trade.exitTimestamp);
            const exitY = y(exitPoint.close);
            const entryColor = trade.side === 'LONG' ? '#57DFA5' : '#FF8AA5';
            return (
              <g key={trade.id}>
                <path d={`M ${entryX} ${entryY - 8} L ${entryX - 5} ${entryY + 2} L ${entryX + 5} ${entryY + 2} Z`} fill={entryColor} />
                <line x1={exitX - 4} y1={exitY - 4} x2={exitX + 4} y2={exitY + 4} stroke="#FF8AA5" strokeWidth="2" />
                <line x1={exitX + 4} y1={exitY - 4} x2={exitX - 4} y2={exitY + 4} stroke="#FF8AA5" strokeWidth="2" />
              </g>
            );
          })}
        </svg>
      </div>
      {isRsiStrategy && (
        <div className="mt-2 rounded-xl border border-white/[0.05] bg-[var(--t-surface-raised)] px-2 py-1.5">
          <div className="mb-1 flex items-center justify-between font-mono text-[8px] uppercase text-slate-600">
            <span>RSI(2)</span>
            <span>{isBearRally ? `Armare > ${rsiThreshold} · confirmare < ${rsiConfirmation}` : `Armare < ${rsiThreshold} · confirmare > ${rsiConfirmation}`}</span>
          </div>
          <svg viewBox={`0 0 ${width} 72`} className="h-16 w-full" role="img" aria-label="RSI 2 și pragul de intrare">
            <line x1="0" y1={66 - rsiThreshold / 100 * 58} x2={width} y2={66 - rsiThreshold / 100 * 58} stroke={isBearRally ? '#FF8AA5' : '#57DFA5'} strokeDasharray="4 5" opacity="0.75" />
            <line x1="0" y1={66 - rsiConfirmation / 100 * 58} x2={width} y2={66 - rsiConfirmation / 100 * 58} stroke={isBearRally ? '#FFC24B' : '#57DFA5'} strokeDasharray="4 5" opacity="0.65" />
            <path d={rsiPath} fill="none" stroke="#A78BFA" strokeWidth="1.5" />
            {points.filter(point => isBearRally ? point.armedShort || point.shortTrigger : point.armedLong || point.longTrigger).map(point => {
              const value = Math.max(0, Math.min(100, point.rsi2 ?? 50));
              const confirmed = isBearRally ? point.shortTrigger : point.longTrigger;
              return <circle key={point.timestamp} cx={x(point.timestamp)} cy={66 - value / 100 * 58} r={confirmed ? 3.6 : 2.6} fill={confirmed ? (isBearRally ? '#FF8AA5' : '#57DFA5') : '#FFC24B'} />;
            })}
          </svg>
        </div>
      )}
    </div>
  );
};

const EquityChart: React.FC<{ result: BacktestResult }> = ({ result }) => {
  const points = result.equityCurve;
  if (!points.length) return null;
  const width = 900;
  const height = 220;
  const min = Math.min(...points.flatMap(point => [point.strategyEquity, point.benchmarkEquity]));
  const max = Math.max(...points.flatMap(point => [point.strategyEquity, point.benchmarkEquity]));
  const range = max - min || 1;
  const y = (value: number) => height - ((value - min) / range) * (height - 24) - 12;
  const path = (field: 'strategyEquity' | 'benchmarkEquity') => points.map((point, index) =>
    `${index ? 'L' : 'M'} ${(index / Math.max(1, points.length - 1) * width).toFixed(2)} ${y(point[field]).toFixed(2)}`
  ).join(' ');
  return (
    <section className="rounded-[30px] border border-white/[0.07] bg-background-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-slate-100">Curba capitalului, marcată la piață</h2>
        <div className="flex gap-3 text-[9px] font-bold uppercase"><span className="text-cyan-300">— Strategie</span><span className="text-slate-400">-- Buy & Hold</span></div>
      </div>
      <div className="mt-4 overflow-hidden rounded-xl border border-white/[0.05] bg-[var(--t-surface-raised)] p-2">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-48 w-full">
          <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="#1D222B" strokeDasharray="4 5" />
          <path d={path('benchmarkEquity')} fill="none" stroke="#64748b" strokeWidth="1.4" strokeDasharray="4 4" />
          <path d={path('strategyEquity')} fill="none" stroke="#CDEE7F" strokeWidth="2.2" />
        </svg>
      </div>
    </section>
  );
};

const ComparisonTable: React.FC<{ comparison: BacktestComparisonResult }> = ({ comparison }) => (
  <div className="mt-4 space-y-3">
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      <MiniStat label="Active valide" value={`${comparison.aggregate.profitableAssets}/${comparison.aggregate.testedAssets} profitabile`} />
      <MiniStat label="Tranzacții" value={String(comparison.aggregate.totalTrades)} />
      <MiniStat label="Win rate ponderat" value={`${comparison.aggregate.weightedWinRate}%`} />
      <MiniStat label="PF median" value={comparison.aggregate.medianProfitFactor.toFixed(2)} />
      <MiniStat label="Expectancy medie" value={`${comparison.aggregate.averageExpectancyR >= 0 ? '+' : ''}${comparison.aggregate.averageExpectancyR.toFixed(2)}R`} />
      <MiniStat label="DD mediu" value={`-${comparison.aggregate.averageMaxDrawdownPercent.toFixed(2)}%`} />
    </div>
    <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
      <table className="w-full min-w-[760px] text-left font-mono text-[10px]">
        <thead className="bg-white/[0.035] uppercase text-slate-500"><tr><th className="px-3 py-2">Asset</th><th>Trades</th><th>Win rate</th><th>Profit factor</th><th>Expectancy</th><th>Return</th><th>Buy & Hold</th><th>Max DD</th><th>Perioadă</th></tr></thead>
        <tbody className="divide-y divide-white/[0.05]">
          {comparison.rows.map(row => (
            <tr key={`${row.marketClass}:${row.symbol}`} className="text-slate-300">
              <td className="px-3 py-2.5"><AssetLink symbol={row.symbol} marketClass={row.marketClass} timeframe="1d" className="font-bold text-white">${row.symbol}</AssetLink> <span className="ml-1 text-[8px] uppercase text-slate-600">{row.marketClass}</span>{row.error && <div className="text-rose-400">{row.error}</div>}</td>
              <td>{row.totalTrades}</td><td>{row.winRate.toFixed(1)}%</td><td className={row.profitFactor >= 1.2 ? 'text-emerald-300' : 'text-amber-300'}>{row.profitFactor.toFixed(2)}</td><td className={row.expectancyR > 0 ? 'text-emerald-300' : 'text-rose-300'}>{row.expectancyR >= 0 ? '+' : ''}{row.expectancyR.toFixed(2)}R</td><td className={row.totalReturnPercent >= 0 ? 'text-emerald-300' : 'text-rose-300'}>{formatPercent(row.totalReturnPercent)}</td><td>{formatPercent(row.buyAndHoldReturnPercent)}</td><td className="text-rose-300">-{row.maxDrawdownPercent.toFixed(2)}%</td><td className="text-slate-600">{row.periodStart ? `${formatDate(row.periodStart)} – ${formatDate(row.periodEnd)}` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const MiniStat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-lg border border-white/[0.05] bg-black/10 p-2.5"><div className="text-[8px] font-bold uppercase tracking-wider text-slate-600">{label}</div><div className="mt-1 font-mono text-xs font-bold text-violet-200">{value}</div></div>
);

const TradeLog: React.FC<{ result: BacktestResult }> = ({ result }) => (
  <section className="rounded-[30px] border border-white/[0.07] bg-background-card p-4 sm:p-5">
    <h2 className="text-sm font-bold text-slate-100">Execuții ({result.trades.length})</h2>
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[900px] text-left font-mono text-[10px]">
        <thead className="border-b border-white/[0.06] uppercase text-slate-500"><tr><th className="px-2 py-2">Trade</th><th>Side</th><th>Entry</th><th>Stop inițial</th><th>Țintă</th><th>Exit</th><th>Net</th><th>R</th><th>Durată</th><th>Motiv exit</th></tr></thead>
        <tbody className="divide-y divide-white/[0.05]">
          {result.trades.map(trade => (
            <tr key={trade.id} className="text-slate-300"><td className="px-2 py-2.5">{trade.id}</td><td className={trade.side === 'LONG' ? 'text-emerald-300' : 'text-rose-300'}>{trade.side}</td><td>{formatPrice(trade.entryPrice)}</td><td className="text-rose-300">{formatPrice(trade.initialStop)}</td><td className="text-emerald-300">{formatPrice(trade.targetPrice)}</td><td>{formatPrice(trade.exitPrice)}</td><td className={trade.pnlPercent >= 0 ? 'text-emerald-300' : 'text-rose-300'}>{formatPercent(trade.pnlPercent)}</td><td className={(trade.rMultiple || 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'}>{(trade.rMultiple || 0).toFixed(2)}R</td><td>{Math.round(trade.holdingHours / 24)}z</td><td className="max-w-[220px] truncate text-slate-500" title={trade.exitReasonDetail}>{trade.exitReason}</td></tr>
          ))}
          {!result.trades.length && <tr><td colSpan={10} className="px-3 py-8 text-center text-slate-600">Nu au existat setup-uri care să treacă toate filtrele în perioada disponibilă.</td></tr>}
        </tbody>
      </table>
    </div>
  </section>
);
