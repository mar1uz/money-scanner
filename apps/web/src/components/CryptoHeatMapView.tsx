import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, LayoutGrid, RefreshCw } from 'lucide-react';
import {
  CryptoBubbleAsset,
  CryptoBubbleTimeframe,
  fetchCryptoBubbles,
  fetchScanner
} from '../services/api.js';
import { useLanguage } from '../i18n.js';

type HeatMapScope = 'crypto' | 'stocks';

interface CryptoHeatMapViewProps {
  onSelectAsset: (symbol: string, coinGeckoId?: string, marketClass?: string) => void;
}

interface HeatRect {
  coin: CryptoBubbleAsset;
  x: number;
  y: number;
  width: number;
  height: number;
}

const TIMEFRAMES: Array<{ id: CryptoBubbleTimeframe; label: string }> = [
  { id: '1d', label: '1D' },
  { id: '1w', label: '1W' },
  { id: '1m', label: '1M' }
];

const splitTreemap = (
  coins: CryptoBubbleAsset[],
  x: number,
  y: number,
  width: number,
  height: number,
  minimumWeight?: number
): HeatRect[] => {
  if (!coins.length) return [];
  if (coins.length === 1) return [{ coin: coins[0], x, y, width, height }];

  const weightFloor = minimumWeight ?? coins.reduce((sum, coin) => sum + Math.max(coin.marketCap, 1), 0) * 0.004;
  const weightOf = (coin: CryptoBubbleAsset) => Math.max(coin.marketCap, weightFloor);
  const total = coins.reduce((sum, coin) => sum + weightOf(coin), 0);
  let running = 0;
  let splitIndex = 1;
  for (let index = 0; index < coins.length - 1; index += 1) {
    running += weightOf(coins[index]);
    splitIndex = index + 1;
    if (running >= total / 2) break;
  }

  const first = coins.slice(0, splitIndex);
  const second = coins.slice(splitIndex);
  const firstWeight = first.reduce((sum, coin) => sum + weightOf(coin), 0);
  const ratio = Math.max(0.08, Math.min(0.92, firstWeight / total));

  if (width >= height) {
    const firstWidth = width * ratio;
    return [
      ...splitTreemap(first, x, y, firstWidth, height, weightFloor),
      ...splitTreemap(second, x + firstWidth, y, width - firstWidth, height, weightFloor)
    ];
  }

  const firstHeight = height * ratio;
  return [
    ...splitTreemap(first, x, y, width, firstHeight, weightFloor),
    ...splitTreemap(second, x, y + firstHeight, width, height - firstHeight, weightFloor)
  ];
};

const formatMarketCap = (value: number) => {
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  return `$${(value / 1e6).toFixed(0)}M`;
};

const heatColor = (change: number | null) => {
  if (change === null) return 'rgba(71,85,105,0.72)';
  const intensity = Math.min(1, Math.abs(change) / 10);
  const alpha = 0.42 + intensity * 0.48;
  return change >= 0
    ? `rgba(5,150,105,${alpha})`
    : `rgba(225,29,72,${alpha})`;
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const getTileTypography = (rect: HeatRect) => {
  const area = rect.width * rect.height;
  const prominence = clamp((Math.sqrt(area) - 3) / 48, 0, 1);

  return {
    prominence,
    name: 11 + prominence * 25,
    change: 11 + prominence * 17,
    marketCap: 10 + prominence * 11
  };
};

export const CryptoHeatMapView: React.FC<CryptoHeatMapViewProps> = ({ onSelectAsset }) => {
  const { language } = useLanguage();
  const [scope, setScope] = useState<HeatMapScope>('crypto');
  const [timeframe, setTimeframe] = useState<CryptoBubbleTimeframe>('1d');
  const [coins, setCoins] = useState<CryptoBubbleAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isRo = language === 'ro';

  const loadCoins = async () => {
    setLoading(true);
    setError(null);
    try {
      if (scope === 'crypto') {
        const data = await fetchCryptoBubbles(timeframe);
        setCoins(data.slice(0, 50));
      } else {
        // Stocks: use scanner endpoint, map to CryptoBubbleAsset shape
        const tfMap: Record<CryptoBubbleTimeframe, string> = { '1d': '1d', '1w': '1w', '1m': '1w' };
        const rows = await fetchScanner(tfMap[timeframe] as any, undefined, undefined, false, undefined, 'stocks');
        const sorted = rows
          .filter(r => (r.marketCap ?? 0) > 0)
          .sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0))
          .slice(0, 50);
        const mapped: CryptoBubbleAsset[] = sorted.map((r, i) => ({
          id: r.symbol,
          symbol: r.symbol,
          name: r.name,
          image: '',
          rank: i + 1,
          price: r.price,
          marketCap: r.marketCap || 0,
          change: timeframe === '1d' ? r.change24h
            : timeframe === '1m' ? (r.changeYtd ?? r.timeframeChangePercent ?? r.change24h)
            : (r.timeframeChangePercent ?? r.change24h)
        }));
        setCoins(mapped);
      }
    } catch (loadError) {
      console.error(loadError);
      setError(isRo ? 'Heat map-ul live nu este disponibil momentan.' : 'The live heat map is currently unavailable.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCoins();
  }, [timeframe, scope]);

  const rectangles = useMemo(
    () => splitTreemap([...coins].sort((a, b) => b.marketCap - a.marketCap), 0, 0, 100, 100),
    [coins]
  );

  const scopeTitle = scope === 'crypto'
    ? (isRo ? 'Top 50 Crypto după Market Cap' : 'Top 50 Crypto by Market Cap')
    : (isRo ? 'Top 50 Stocks după Market Cap' : 'Top 50 Stocks by Market Cap');

  const scopeSubtitle = isRo
    ? 'Mărimea fiecărei zone reflectă capitalizarea, iar culoarea arată variația timeframe-ului selectat.'
    : 'Tile size reflects market capitalization and color shows the selected timeframe return.';

  const sourceLabel = scope === 'crypto'
    ? 'CoinGecko live · Market Cap weighted'
    : 'Market Scanner 360 · Market Cap weighted';

  return (
    <section className="space-y-5 tab-content-enter">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="flex items-center gap-2 text-cyan-300">
            <LayoutGrid className="h-5 w-5" />
            <span className="font-mono text-xs font-bold uppercase tracking-[0.18em]">Heat Map</span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">
            {scopeTitle}
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {scopeSubtitle}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start">
          {/* Scope toggle: Crypto / Stocks */}
          <div className="flex items-center rounded-xl border border-white/[0.07] bg-white/[0.03] p-1">
            {(['crypto', 'stocks'] as HeatMapScope[]).map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setScope(s)}
                className={`rounded-lg px-3.5 py-2 text-xs font-mono font-bold transition-all ${
                  scope === s
                    ? s === 'crypto'
                      ? 'bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/25'
                      : 'bg-blue-500/20 text-blue-200 ring-1 ring-blue-400/25'
                    : 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-200'
                }`}
              >
                {s === 'crypto' ? 'Crypto' : 'Stocks'}
              </button>
            ))}
          </div>

          {/* Timeframe pills */}
          <div className="flex items-center rounded-xl border border-white/[0.07] bg-white/[0.03] p-1">
            {TIMEFRAMES.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTimeframe(item.id)}
                className={`rounded-lg px-3.5 py-2 text-xs font-mono font-bold transition-all ${
                  timeframe === item.id
                    ? 'bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/25'
                    : 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-200'
                }`}
              >
                {item.label}
              </button>
            ))}
            <button
              type="button"
              onClick={loadCoins}
              disabled={loading}
              className="ml-1 rounded-lg p-2 text-slate-400 hover:bg-white/[0.06] hover:text-cyan-200 disabled:opacity-50"
              title={isRo ? 'Actualizează datele' : 'Refresh data'}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-white/[0.05] bg-white/[0.02] px-4 py-3 text-[11px] font-mono text-slate-400">
        <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500" />{isRo ? 'Creștere' : 'Gain'}</span>
        <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-rose-600" />{isRo ? 'Scădere' : 'Loss'}</span>
        <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-slate-600" />{isRo ? 'Fără date' : 'No data'}</span>
        <span className="ml-auto">{sourceLabel}</span>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          <AlertCircle className="h-4 w-4" />{error}
        </div>
      )}

      <div className="relative min-h-[720px] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#070b12] shadow-2xl">
        {loading && !coins.length ? (
          <div className="flex min-h-[720px] items-center justify-center gap-3 font-mono text-sm text-slate-400">
            <RefreshCw className="h-5 w-5 animate-spin text-cyan-400" />
            {isRo ? 'Se construiește heat map-ul live...' : 'Building the live heat map...'}
          </div>
        ) : rectangles.map(rect => {
          const positive = (rect.coin.change ?? 0) >= 0;
          const typography = getTileTypography(rect);
          const roomy = rect.width > 10 && rect.height > 9;
          return (
            <button
              key={rect.coin.id}
              type="button"
              onClick={() => onSelectAsset(
                rect.coin.symbol,
                scope === 'crypto' ? rect.coin.id : undefined,
                scope
              )}
              title={`${rect.coin.name} · #${rect.coin.rank} · ${formatMarketCap(rect.coin.marketCap)} · ${rect.coin.change === null ? '—' : `${rect.coin.change >= 0 ? '+' : ''}${rect.coin.change.toFixed(2)}%`}`}
              className="absolute overflow-hidden border border-black/50 p-0.5 text-center text-white transition-[filter,transform] duration-150 hover:z-20 hover:brightness-125 focus:z-20 focus:outline-none focus:ring-2 focus:ring-cyan-300"
              style={{
                left: `calc(${rect.x}% + 1px)`,
                top: `calc(${rect.y}% + 1px)`,
                width: `calc(${rect.width}% - 2px)`,
                height: `calc(${rect.height}% - 2px)`,
                backgroundColor: heatColor(rect.coin.change)
              }}
            >
              <span className="flex h-full min-w-0 flex-col items-center justify-center overflow-hidden leading-none">
                <span
                  className="flex max-w-full items-center justify-center gap-1.5 font-mono font-black tracking-tight"
                  style={{ fontSize: `${typography.name}px` }}
                >
                  {roomy && rect.coin.image && (
                    <img
                      src={rect.coin.image}
                      alt=""
                      className="shrink-0 rounded-full"
                      style={{ width: `${clamp(typography.name * 0.82, 14, 27)}px`, height: `${clamp(typography.name * 0.82, 14, 27)}px` }}
                      loading="lazy"
                    />
                  )}
                  <span className="truncate">{rect.coin.name}</span>
                </span>
                <span
                  className={`mt-px max-w-full truncate font-mono font-black ${positive ? 'text-emerald-50' : 'text-rose-50'}`}
                  style={{ fontSize: `${typography.change}px` }}
                >
                  {rect.coin.change === null ? '—' : `${positive ? '+' : ''}${rect.coin.change.toFixed(2)}%`}
                </span>
                <span
                  className="mt-px max-w-full truncate font-mono font-semibold text-white/80"
                  style={{ fontSize: `${typography.marketCap}px` }}
                >
                  {formatMarketCap(rect.coin.marketCap)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
};
