import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CircleDot, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import {
  CryptoBubbleAsset,
  CryptoBubbleTimeframe,
  fetchCryptoBubbles
} from '../services/api.js';

interface CryptoBubbleViewProps {
  onSelectAsset: (symbol: string) => void;
}

const TIMEFRAMES: { id: CryptoBubbleTimeframe; label: string; description: string }[] = [
  { id: '1d', label: '1D', description: '24 ore' },
  { id: '1w', label: '1S', description: '7 zile' },
  { id: '1m', label: '1M', description: '30 zile' }
];

const formatMarketCap = (value: number) => {
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  return `$${(value / 1e6).toFixed(0)}M`;
};

const formatPrice = (value: number) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: value < 1 ? 4 : 2
}).format(value);

export const CryptoBubbleView: React.FC<CryptoBubbleViewProps> = ({ onSelectAsset }) => {
  const [timeframe, setTimeframe] = useState<CryptoBubbleTimeframe>('1d');
  const [coins, setCoins] = useState<CryptoBubbleAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadCoins = async () => {
    setLoading(true);
    setError(null);
    try {
      setCoins(await fetchCryptoBubbles(timeframe));
      setLastUpdated(new Date());
    } catch (err) {
      console.error(err);
      setError('Datele live nu sunt disponibile momentan. Încearcă din nou.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCoins();
  }, [timeframe]);

  const maxMarketCap = useMemo(() => Math.max(...coins.map((coin) => coin.marketCap), 1), [coins]);

  return (
    <section className="space-y-5 tab-content-enter">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="flex items-center gap-2 text-fuchsia-300">
            <CircleDot className="w-5 h-5" />
            <span className="font-mono text-xs font-bold tracking-[0.18em] uppercase">Crypto Heatmap</span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">Crypto Bubble</h1>
          <p className="mt-1 text-sm text-slate-400">Top 100 monede după capitalizarea de piață. Dimensiunea bulei reflectă market cap-ul.</p>
        </div>

        <div className="flex items-center gap-2 self-start rounded-xl border border-white/[0.07] bg-white/[0.03] p-1">
          {TIMEFRAMES.map((item) => (
            <button
              key={item.id}
              type="button"
              title={item.description}
              onClick={() => setTimeframe(item.id)}
              className={`rounded-lg px-3.5 py-2 text-xs font-mono font-bold transition-all ${
                timeframe === item.id
                  ? 'bg-fuchsia-500/20 text-fuchsia-200 shadow-sm ring-1 ring-fuchsia-400/25'
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
            title="Actualizează datele"
            className="ml-1 rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-fuchsia-200 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-white/[0.05] bg-white/[0.02] px-4 py-3 text-[11px] font-mono text-slate-400">
        <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-emerald-400" />Creștere</span>
        <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-rose-400" />Scădere</span>
        <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-slate-500" />Fără date</span>
        <span className="ml-auto text-slate-500">{lastUpdated ? `Actualizat ${lastUpdated.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })}` : 'Se încarcă datele...'}</span>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          <AlertCircle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}

      <div className="crypto-bubble-canvas min-h-[760px] overflow-hidden rounded-2xl border border-white/[0.06] bg-[radial-gradient(circle_at_50%_0%,rgba(192,38,211,0.10),transparent_42%),linear-gradient(135deg,rgba(15,20,32,0.95),rgba(7,10,19,0.95))]">
        {loading && coins.length === 0 ? (
          <div className="flex min-h-[540px] items-center justify-center gap-3 text-sm font-mono text-slate-400"><RefreshCw className="h-5 w-5 animate-spin text-fuchsia-400" />Se încarcă top 100...</div>
        ) : (
          <div className="flex min-h-[760px] flex-wrap content-center items-center justify-center gap-3 p-4 sm:gap-4 sm:p-6">
            {coins.map((coin) => {
              const positive = (coin.change ?? 0) >= 0;
              // The circle area, not merely its diameter, follows the market cap.
              const size = Math.round(66 + Math.sqrt(coin.marketCap / maxMarketCap) * 154);
              return (
                <button
                  key={coin.id}
                  type="button"
                  onClick={() => onSelectAsset(coin.symbol)}
                  style={{
                    width: size,
                    height: size,
                    flex: `0 0 ${size}px`
                  }}
                  className={`crypto-bubble relative flex flex-col items-center justify-center overflow-hidden rounded-full border p-2 text-center transition-[box-shadow,border-color] duration-200 hover:shadow-[0_0_28px_rgba(232,121,249,0.32)] focus:outline-none focus:ring-2 focus:ring-fuchsia-300 ${
                    coin.change === null
                      ? 'border-slate-500/30 bg-slate-500/10 text-slate-300'
                      : positive
                        ? 'border-emerald-400/35 bg-emerald-400/[0.14] text-emerald-50'
                        : 'border-rose-400/35 bg-rose-400/[0.14] text-rose-50'
                  }`}
                  title={`${coin.name} · #${coin.rank} · ${coin.change === null ? 'Fără date' : `${coin.change >= 0 ? '+' : ''}${coin.change.toFixed(2)}%`}`}
                >
                  <span className="absolute inset-0 bg-[radial-gradient(circle_at_35%_25%,rgba(255,255,255,0.22),transparent_35%)]" />
                  <span className="relative flex items-center gap-1.5 font-mono text-[10px] font-bold sm:text-xs">
                    {coin.image && <img src={coin.image} alt="" className="h-4 w-4 rounded-full" loading="lazy" />}
                    {coin.symbol}
                  </span>
                  <span className="relative mt-0.5 font-mono text-[11px] font-bold sm:text-sm">{coin.change === null ? '—' : `${positive ? '+' : ''}${coin.change.toFixed(2)}%`}</span>
                  {size > 130 && <span className="relative mt-0.5 text-[9px] text-white/55">{formatMarketCap(coin.marketCap)}</span>}
                  {size > 150 && <span className="relative text-[9px] text-white/45">{formatPrice(coin.price)}</span>}
                  {coin.change !== null && (positive ? <TrendingUp className="relative mt-1 h-3 w-3 opacity-75" /> : <TrendingDown className="relative mt-1 h-3 w-3 opacity-75" />)}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
