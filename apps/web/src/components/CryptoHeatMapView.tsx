import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, LayoutGrid, RefreshCw } from 'lucide-react';
import {
  CryptoBubbleAsset,
  CryptoBubbleTimeframe,
  fetchCryptoBubbles
} from '../services/api.js';
import { useLanguage } from '../i18n.js';

interface CryptoHeatMapViewProps {
  onSelectAsset: (symbol: string) => void;
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
  height: number
): HeatRect[] => {
  if (!coins.length) return [];
  if (coins.length === 1) return [{ coin: coins[0], x, y, width, height }];

  const total = coins.reduce((sum, coin) => sum + Math.max(coin.marketCap, 1), 0);
  let running = 0;
  let splitIndex = 1;
  for (let index = 0; index < coins.length - 1; index += 1) {
    running += Math.max(coins[index].marketCap, 1);
    splitIndex = index + 1;
    if (running >= total / 2) break;
  }

  const first = coins.slice(0, splitIndex);
  const second = coins.slice(splitIndex);
  const firstWeight = first.reduce((sum, coin) => sum + Math.max(coin.marketCap, 1), 0);
  const ratio = Math.max(0.08, Math.min(0.92, firstWeight / total));

  if (width >= height) {
    const firstWidth = width * ratio;
    return [
      ...splitTreemap(first, x, y, firstWidth, height),
      ...splitTreemap(second, x + firstWidth, y, width - firstWidth, height)
    ];
  }

  const firstHeight = height * ratio;
  return [
    ...splitTreemap(first, x, y, width, firstHeight),
    ...splitTreemap(second, x, y + firstHeight, width, height - firstHeight)
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
    marketCap: 10 + prominence * 11,
    symbol: 9 + prominence * 7
  };
};

export const CryptoHeatMapView: React.FC<CryptoHeatMapViewProps> = ({ onSelectAsset }) => {
  const { language } = useLanguage();
  const [timeframe, setTimeframe] = useState<CryptoBubbleTimeframe>('1d');
  const [coins, setCoins] = useState<CryptoBubbleAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCoins = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCryptoBubbles(timeframe);
      setCoins(data.slice(0, 50));
    } catch (loadError) {
      console.error(loadError);
      setError(language === 'ro' ? 'Heat map-ul live nu este disponibil momentan.' : 'The live heat map is currently unavailable.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCoins();
  }, [timeframe]);

  const rectangles = useMemo(
    () => splitTreemap([...coins].sort((a, b) => b.marketCap - a.marketCap), 0, 0, 100, 100),
    [coins]
  );

  return (
    <section className="space-y-5 tab-content-enter">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="flex items-center gap-2 text-cyan-300">
            <LayoutGrid className="h-5 w-5" />
            <span className="font-mono text-xs font-bold uppercase tracking-[0.18em]">Crypto Heat Map</span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">
            {language === 'ro' ? 'Top 50 Crypto după Market Cap' : 'Top 50 Crypto by Market Cap'}
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {language === 'ro'
              ? 'Mărimea fiecărei zone reflectă capitalizarea, iar culoarea arată variația timeframe-ului selectat.'
              : 'Tile size reflects market capitalization and color shows the selected timeframe return.'}
          </p>
        </div>

        <div className="flex items-center gap-2 self-start rounded-xl border border-white/[0.07] bg-white/[0.03] p-1">
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
            title={language === 'ro' ? 'Actualizează datele' : 'Refresh data'}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-white/[0.05] bg-white/[0.02] px-4 py-3 text-[11px] font-mono text-slate-400">
        <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500" />{language === 'ro' ? 'Creștere' : 'Gain'}</span>
        <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-rose-600" />{language === 'ro' ? 'Scădere' : 'Loss'}</span>
        <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-slate-600" />{language === 'ro' ? 'Fără date' : 'No data'}</span>
        <span className="ml-auto">CoinGecko live · Market Cap weighted</span>
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
            {language === 'ro' ? 'Se construiește heat map-ul live...' : 'Building the live heat map...'}
          </div>
        ) : rectangles.map(rect => {
          const positive = (rect.coin.change ?? 0) >= 0;
          const typography = getTileTypography(rect);
          const roomy = rect.width > 10 && rect.height > 9;
          return (
            <button
              key={rect.coin.id}
              type="button"
              onClick={() => onSelectAsset(rect.coin.symbol)}
              title={`${rect.coin.name} · #${rect.coin.rank} · ${formatMarketCap(rect.coin.marketCap)} · ${rect.coin.change === null ? '—' : `${rect.coin.change >= 0 ? '+' : ''}${rect.coin.change.toFixed(2)}%`}`}
              className="absolute overflow-hidden border border-black/50 p-1.5 text-center text-white transition-[filter,transform] duration-150 hover:z-20 hover:brightness-125 focus:z-20 focus:outline-none focus:ring-2 focus:ring-cyan-300"
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
                  className="mt-0.5 max-w-full truncate font-mono font-semibold uppercase text-white/75"
                  style={{ fontSize: `${typography.symbol}px` }}
                >
                  {rect.coin.symbol}
                </span>
                <span
                  className={`mt-1 max-w-full truncate font-mono font-black ${positive ? 'text-emerald-50' : 'text-rose-50'}`}
                  style={{ fontSize: `${typography.change}px` }}
                >
                  {rect.coin.change === null ? '—' : `${positive ? '+' : ''}${rect.coin.change.toFixed(2)}%`}
                </span>
                <span
                  className="mt-1 max-w-full truncate font-mono font-semibold text-white/80"
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
