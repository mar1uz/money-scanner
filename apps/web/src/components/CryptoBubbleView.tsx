import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CircleDot, RefreshCw } from 'lucide-react';
import { CRYPTO_SPOT_ASSETS } from '@money-scanner/shared';
import { createGrowthBubbleLayout, rankCryptoBubbles, validChange } from './crypto-bubble-layout.js';
import {
  CryptoBubbleAsset,
  fetchCryptoBubbles
} from '../services/api.js';

interface CryptoBubbleViewProps {
  onSelectAsset: (symbol: string, coinGeckoId?: string, coinPaprikaId?: string) => void;
}

const categoryOf = (coin: CryptoBubbleAsset) => CRYPTO_SPOT_ASSETS.find(asset =>
  asset.symbol === coin.symbol && (asset.name.toLowerCase() === coin.name.toLowerCase() || asset.coinGeckoId === coin.id)
)?.category || 'Neclasificat';

const formatChange = (value: number | null) => validChange(value)
  ? `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
  : '—';

const formatMarketCap = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '—';
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  return `$${(value / 1e3).toFixed(0)}K`;
};

const formatPrice = (value: number) => Number.isFinite(value) && value > 0
  ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD',
    ...(value < 1 ? { maximumSignificantDigits: 4 } : { maximumFractionDigits: 2 }) }).format(value)
  : '—';

export const CryptoBubbleView: React.FC<CryptoBubbleViewProps> = ({ onSelectAsset }) => {
  const [coins, setCoins] = useState<CryptoBubbleAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasWidth, setCanvasWidth] = useState(0);

  const loadCoins = async () => {
    setLoading(true);
    setError(null);
    try {
      setCoins(await fetchCryptoBubbles('1d'));
      setLastUpdated(new Date());
    } catch (err) {
      console.error(err);
      setError('Actualizarea a eșuat. Datele afișate anterior pot fi vechi. Încearcă din nou.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCoins();
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;
    const observer = new ResizeObserver(([entry]) => setCanvasWidth(Math.round(entry.contentRect.width)));
    observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, []);

  const rankedCoins = useMemo(() => rankCryptoBubbles(coins), [coins]);
  const { placements: bubbleLayout, height: canvasHeight } = useMemo(
    () => createGrowthBubbleLayout(rankedCoins, canvasWidth),
    [rankedCoins, canvasWidth]
  );
  const gainers = rankedCoins.filter(coin => validChange(coin.change) && coin.change > 0).length;

  return (
    <section className="space-y-5 tab-content-enter">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="flex items-center gap-2 text-fuchsia-300">
            <CircleDot className="w-5 h-5" />
            <span className="font-mono text-xs font-bold tracking-[0.18em] uppercase">Momentum · 24 ore</span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">Crypto Bubble</h1>
          <p className="mt-1 text-sm text-slate-400">Câștigătorii ultimelor 24 de ore. Cu cât creșterea procentuală este mai mare, cu atât bula este mai mare.</p>
        </div>

        <div className="flex items-center gap-2 self-start rounded-xl border border-white/[0.07] bg-white/[0.03] p-1">
          <span className="rounded-lg bg-fuchsia-500/20 px-3.5 py-2 text-xs font-mono font-bold text-fuchsia-200">24H</span>
          <button
            type="button"
            onClick={loadCoins}
            disabled={loading}
            title="Actualizează datele"
            aria-label="Actualizează datele"
            className="ml-1 rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-fuchsia-200 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-white/[0.05] bg-white/[0.02] px-4 py-3 text-[11px] font-mono text-slate-400">
        <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-emerald-400" />Creștere</span>
        <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-rose-400" />Scădere</span>
        <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-slate-500" />Neutru / fără date</span>
        <span>Bule mari = creșteri mari pe 24h · scăderile rămân mici</span>
        <span className="ml-auto text-slate-500">{lastUpdated ? `Actualizat ${lastUpdated.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })}` : 'Se încarcă datele...'}</span>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          <AlertCircle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}

      <div ref={canvasRef} className="crypto-bubble-canvas overflow-hidden rounded-2xl border border-white/[0.06] bg-[radial-gradient(circle_at_18%_10%,rgba(167,139,250,0.12),transparent_32%),radial-gradient(circle_at_82%_72%,rgba(200,241,105,0.08),transparent_34%),linear-gradient(135deg,rgba(17,20,27,0.95),rgba(11,13,16,0.95))]">
        {loading && coins.length === 0 ? (
          <div className="flex min-h-[540px] items-center justify-center gap-3 text-sm font-mono text-slate-400"><RefreshCw className="h-5 w-5 animate-spin text-fuchsia-400" />Se încarcă top 100...</div>
        ) : (
          <div className="relative w-full" style={{ height: canvasHeight }}>
            {bubbleLayout.map(({ coin, x, y, size }) => {
              const positive = validChange(coin.change) && coin.change > 0;
              return (
                <button
                  key={coin.id}
                  type="button"
                  onClick={() => onSelectAsset(coin.symbol, coin.coinGeckoId, coin.coinPaprikaId)}
                  style={{
                    width: size,
                    height: size,
                    left: x - size / 2,
                    top: y - size / 2
                  }}
                  className={`crypto-bubble absolute flex flex-col items-center justify-center overflow-hidden rounded-full border p-2 text-center transition-[box-shadow,border-color,transform] duration-200 hover:z-20 hover:scale-105 hover:shadow-[0_0_28px_rgba(196,181,253,0.32)] focus:z-20 focus:outline-none focus:ring-2 focus:ring-fuchsia-300 ${
                    !validChange(coin.change) || coin.change === 0
                      ? 'border-slate-500/30 bg-slate-500/10 text-slate-300'
                      : positive
                        ? 'border-emerald-400/35 bg-emerald-400/[0.14] text-emerald-50'
                        : 'border-rose-400/35 bg-rose-400/[0.14] text-rose-50'
                  }`}
                  aria-label={`${coin.name}: ${formatChange(coin.change)} în ultimele 24 de ore`}
                  title={`${coin.name} · ${categoryOf(coin)} · 24h: ${formatChange(coin.change)}`}
                >
                  <span className="absolute inset-0 bg-[radial-gradient(circle_at_35%_25%,rgba(255,255,255,0.22),transparent_35%)]" />
                  {size > 92 && coin.image && <img src={coin.image} alt="" className="relative mb-1 h-5 w-5 rounded-full" loading="lazy" />}
                  <span className="relative max-w-full truncate font-mono font-bold" style={{ fontSize: size > 120 ? 17 : size > 90 ? 13 : 10 }}>
                    {coin.symbol}
                  </span>
                  <span className="relative mt-0.5 font-mono font-bold" style={{ fontSize: size > 120 ? 20 : size > 90 ? 14 : 10 }}>{formatChange(coin.change)}</span>
                  {size > 120 && <span className="relative mt-1 max-w-full truncate text-[10px] text-white/60">{categoryOf(coin)}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-slate-950/40">
        <div className="border-b border-white/[0.06] px-4 py-5 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-white">Top 100 · Creștere în ultimele 24h</h2>
            {coins.length > 0 && <span className="text-xs font-mono text-emerald-300">{gainers} în creștere / {rankedCoins.length} afișate</span>}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-400">
            Ordine descrescătoare după variația procentuală pe 24h. Bulele și tabelul arată aceleași monede.
            {coins.length > 0 && ` Univers analizat: ${coins.length} monede din sursa de date, selectate după capitalizare.`}
            {' '}Categoriile cunoscute ajută la compararea narativelor; datele lipsă apar la final.
          </p>
        </div>
        {rankedCoins.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Top 100 monede ordonate descrescător după variația procentuală din ultimele 24 de ore</caption>
              <thead className="bg-white/[0.03] text-[11px] uppercase tracking-wider text-slate-400">
                <tr>
                  <th scope="col" className="px-3 py-3 sm:px-5">#</th>
                  <th scope="col" className="px-3 py-3">Monedă</th>
                  <th scope="col" aria-sort="descending" className="whitespace-nowrap px-3 py-3 text-right text-emerald-300">24h ↓</th>
                  <th scope="col" className="whitespace-nowrap px-4 py-3">Narativ / categorie</th>
                  <th scope="col" className="px-4 py-3 text-right">Preț</th>
                  <th scope="col" className="px-4 py-3 text-right">Capitalizare</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {rankedCoins.map((coin, index) => (
                  <tr key={coin.id} className="transition-colors hover:bg-white/[0.04]">
                    <td className="px-3 py-3 font-mono text-xs text-slate-500 sm:px-5">{index + 1}</td>
                    <td className="px-3 py-3">
                      <button type="button" onClick={() => onSelectAsset(coin.symbol, coin.coinGeckoId, coin.coinPaprikaId)} className="flex items-center gap-2.5 rounded-md text-left focus:outline-none focus:ring-2 focus:ring-fuchsia-300" aria-label={`Analizează ${coin.name}`}>
                        {coin.image && <img src={coin.image} alt="" className="hidden h-7 w-7 rounded-full sm:block" loading="lazy" />}
                        <span><span className="block font-mono font-bold text-slate-100">{coin.symbol}</span><span className="block max-w-[130px] truncate text-xs text-slate-500 sm:max-w-[220px]">{coin.name}</span></span>
                      </button>
                    </td>
                    <td className={`whitespace-nowrap px-3 py-3 text-right font-mono font-bold ${!validChange(coin.change) || coin.change === 0 ? 'text-slate-400' : coin.change > 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{formatChange(coin.change)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-400">{categoryOf(coin)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-xs text-slate-300">{formatPrice(coin.price)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-xs text-slate-400">{formatMarketCap(coin.marketCap)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p role="status" className="px-6 py-8 text-center text-sm text-slate-400">{loading ? 'Se încarcă clasamentul...' : 'Nu sunt disponibile date pentru clasament. Încearcă actualizarea.'}</p>
        )}
      </div>
    </section>
  );
};
