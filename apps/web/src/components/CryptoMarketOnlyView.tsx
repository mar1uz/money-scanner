import React from 'react';
import { ArrowLeft, ExternalLink, RefreshCw, Info } from 'lucide-react';
import type { AssetDetailResponse } from '../types.js';
import type { Candle, Timeframe } from '../types.js';

const money = (value: unknown) => typeof value === 'number' && Number.isFinite(value)
  ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumSignificantDigits: 7 }).format(value)
  : '—';
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value)
  ? new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(value) : '—';

export const DexCandlestickChart: React.FC<{ candles: Candle[]; symbol: string }> = ({ candles, symbol }) => {
  const visible = candles.filter(c => [c.open, c.high, c.low, c.close, c.timestamp].every(Number.isFinite)).slice(-180);
  if (!visible.length) return null;
  const min = Math.min(...visible.map(c => c.low));
  const max = Math.max(...visible.map(c => c.high));
  const range = max - min || Math.max(max * 0.01, 1e-12);
  const y = (price: number) => 245 - ((price - min) / range) * 225;
  const step = 800 / visible.length;
  const width = Math.max(1.2, Math.min(7, step * 0.62));
  return <>
    <div className="mt-4 flex justify-between text-xs text-slate-400"><span>Min. {money(min)}</span><span>Max. {money(max)}</span></div>
    <svg viewBox="0 0 800 260" className="mt-2 w-full" role="img" aria-label={`Grafic OHLCV DEX ${symbol}`}>
      {[20, 76, 132, 188, 244].map(line => <line key={line} x1="0" x2="800" y1={line} y2={line} stroke="rgba(148,163,184,.12)" />)}
      {visible.map((candle, index) => {
        const x = (index + 0.5) * step;
        const up = candle.close >= candle.open;
        const color = up ? '#57DFA5' : '#FF8AA5';
        const top = Math.min(y(candle.open), y(candle.close));
        const bodyHeight = Math.max(1.5, Math.abs(y(candle.open) - y(candle.close)));
        return <g key={candle.timestamp}>
          <title>{`${new Date(candle.timestamp).toLocaleString('ro-RO')} · O ${candle.open} H ${candle.high} L ${candle.low} C ${candle.close} · Vol ${candle.volume}`}</title>
          <line x1={x} x2={x} y1={y(candle.high)} y2={y(candle.low)} stroke={color} strokeWidth="1" />
          <rect x={x - width / 2} y={top} width={width} height={bodyHeight} fill={color} rx="0.6" />
        </g>;
      })}
    </svg>
    <div className="flex justify-between text-xs text-slate-400"><span>{new Date(visible[0].timestamp).toLocaleDateString('ro-RO')}</span><span>{new Date(visible[visible.length - 1].timestamp).toLocaleString('ro-RO')}</span></div>
  </>;
};

export const CryptoMarketOnlyView: React.FC<{
  data: AssetDetailResponse; timeframe: Timeframe; onBack: () => void; onRefresh: () => void; loading?: boolean;
  onTimeframeChange?: (tf: Timeframe) => void;
}> = ({ data, timeframe, onBack, onRefresh, loading, onTimeframeChange }) => {
  const { info, quote } = data;
  const dex = data.dexMarket;
  const sourceUrl = info.coinGeckoId
    ? `https://www.coingecko.com/en/coins/${encodeURIComponent(info.coinGeckoId)}`
    : `https://coinpaprika.com/coin/${encodeURIComponent(info.coinPaprikaId)}/`;
  const prices = (data.priceHistory || []).filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]) && p[1] > 0);
  const low = prices.length ? Math.min(...prices.map(p => p[1])) : 0;
  const high = prices.length ? Math.max(...prices.map(p => p[1])) : 0;
  const start = prices[0]?.[0] || 0;
  const end = prices[prices.length - 1]?.[0] || 0;
  const points = prices.map(([time, price]) => `${10 + (time - start) / (end - start || 1) * 780},${high === low ? 130 : 240 - (price - low) / (high - low) * 220}`).join(' ');
  const change = typeof quote.change24h === 'number' && Number.isFinite(quote.change24h) ? quote.change24h : null;
  const minCandles = timeframe === '1w' ? 15 : (timeframe === '1d' ? 30 : 210);

  return <section className="space-y-5" aria-label={`Date de piață ${info.name}`}>
    <div className="flex flex-wrap items-center gap-3">
      <button onClick={onBack} className="rounded-xl border border-white/10 p-2.5 text-slate-300" aria-label="Înapoi"><ArrowLeft className="h-5 w-5" /></button>
      <div className="min-w-0 flex-1"><h1 className="text-xl font-bold text-white">{info.name} <span className="text-slate-400">${info.symbol}</span></h1>
        <p className="text-xs text-slate-400">Crypto · {quote.source}{info.rank > 0 ? ` · #${info.rank}` : ''}</p></div>
      {onTimeframeChange && (
        <div className="flex items-center rounded-lg border border-white/[0.06] bg-white/[0.03] p-0.5">
          {(['1h', '4h', '8h', '1d', '1w'] as Timeframe[]).map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => onTimeframeChange(tf)}
              className={`px-2 py-1 text-[11px] font-mono rounded-md transition-all ${
                timeframe === tf
                  ? 'bg-cyan-500/15 text-cyan-300 font-bold'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {tf.toUpperCase()}
            </button>
          ))}
        </div>
      )}
      <button onClick={onRefresh} disabled={loading} className="rounded-xl border border-white/10 p-2.5 text-cyan-300" aria-label="Reîncarcă datele"><RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} /></button>
    </div>
    <div className="rounded-[30px] border border-white/10 bg-[var(--t-surface)] p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline gap-3">
        <span className="text-3xl font-bold text-white">{money(quote.price)}</span>
        <span className={change !== null && change >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
          {change === null ? '—' : `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`} <span className="text-xs text-slate-400">24h</span>
        </span>
        {data.activeSignal && (
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-bold border ${
            data.activeSignal.tier.toLowerCase().includes('bullish')
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : data.activeSignal.tier.toLowerCase().includes('bearish')
                ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                : 'border-slate-500/30 bg-slate-500/10 text-slate-300'
          }`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            Money Line: {data.activeSignal.tier} {data.activeSignal.score > 0 ? `+${data.activeSignal.score.toFixed(1)}` : data.activeSignal.score.toFixed(1)}
          </span>
        )}
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[['Capitalizare', info.marketCap], ['Volum 24h (USD)', quote.volume24h], ['Maxim 24h', quote.high24h], ['Minim 24h', quote.low24h]].map(([label, value]) =>
          <div key={String(label)}><dt className="text-xs text-slate-400">{label}</dt><dd className="mt-1 break-words font-mono text-sm text-white">{money(value)}</dd></div>)}
      </dl>
      <p className={`mt-5 text-xs ${quote.isStale ? 'text-amber-300' : 'text-slate-400'}`}>
        {quote.isStale ? 'Date întârziate · ' : ''}Actualizare {quote.source}: {new Date(quote.timestamp).toLocaleString('ro-RO')}
      </p>
    </div>
    {dex && <div className="rounded-[30px] border border-fuchsia-500/20 bg-fuchsia-500/[0.04] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold text-white">Piața DEX principală</h2><p className="mt-1 text-xs text-slate-400">Pereche selectată după lichiditatea USD raportată de DEX Screener.</p></div>
        <a href={dex.dexUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-fuchsia-400/25 px-3 py-1.5 text-xs text-fuchsia-200">DEX Screener <ExternalLink className="h-3.5 w-3.5" /></a></div>
      <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[['Lichiditate', money(dex.liquidityUsd)], ['Volum DEX 24h', money(dex.volume.h24)], ['FDV', money(dex.fdvUsd)], ['Tranzacții 24h', dex.transactions24h ? `${number(dex.transactions24h.buys)} buy / ${number(dex.transactions24h.sells)} sell` : '—'],
          ['Rețea', dex.chainId], ['DEX', dex.dexId], ['Pereche', `${info.symbol}/${dex.quoteSymbol || '—'}`], ['Variație DEX 1h', dex.priceChange.h1 === null ? '—' : `${dex.priceChange.h1 >= 0 ? '+' : ''}${dex.priceChange.h1.toFixed(2)}%`]].map(([label, value]) =>
          <div key={String(label)}><dt className="text-xs text-slate-400">{label}</dt><dd className="mt-1 break-words font-mono text-sm text-white">{value}</dd></div>)}
      </dl>
      <p className="mt-4 truncate font-mono text-[10px] text-slate-500" title={dex.contractAddress}>Contract: {dex.contractAddress}</p>
    </div>}
    <div className="rounded-[30px] border border-white/10 bg-[var(--t-surface)] p-5 sm:p-6">
      <h2 className="font-semibold text-white">{dex?.candles?.length ? `Grafic OHLCV DEX · ${timeframe.toUpperCase()}` : 'Istoric de preț · ultimele 30 de zile disponibile'}</h2>
      <p className="mt-1 text-xs text-slate-400">{dex?.candles?.length
        ? `Lumânări reale USD din pool-ul selectat de DEX Screener, furnizate de ${dex.candleSource}. Ultima lumânare poate fi încă deschisă.`
        : `Prețuri USD raportate de ${quote.source}; puncte de preț, nu lumânări OHLCV.`}</p>
      {dex?.candles?.length ? <DexCandlestickChart candles={dex.candles} symbol={info.symbol} /> : prices.length > 1 ? <>
        <div className="mt-4 flex justify-between text-xs text-slate-400"><span>Min. {money(low)}</span><span>Max. {money(high)}</span></div>
        <svg viewBox="0 0 800 260" className="mt-2 w-full" role="img" aria-label={`Istoric de preț ${info.name}`}><polyline points={points} fill="none" stroke="#CDEE7F" strokeWidth="2.5" vectorEffect="non-scaling-stroke" /></svg>
        <div className="flex justify-between text-xs text-slate-400"><span>{new Date(start).toLocaleDateString('ro-RO')}</span><span>{new Date(end).toLocaleString('ro-RO')}</span></div>
      </> : <p className="py-10 text-sm text-slate-400">Istoricul de preț nu este disponibil momentan de la furnizor. Cotația de mai sus rămâne disponibilă.</p>}
    </div>
    <div className={`flex gap-3 rounded-xl border p-4 text-sm ${data.activeSignal ? 'border-cyan-500/20 bg-cyan-500/5 text-cyan-100' : 'border-amber-500/20 bg-amber-500/5 text-amber-100'}`}><Info className="mt-0.5 h-5 w-5 shrink-0" /><p>{data.activeSignal
      ? `Money Line ${timeframe.toUpperCase()} calculat din ${data.candles.filter(c => c.isClosed).length} lumânări DEX închise: ${data.activeSignal.tier}, scor ${data.activeSignal.score}.`
      : dex?.candles?.length
        ? `Graficul DEX este disponibil, dar Money Line necesită minimum ${minCandles} lumânări închise. Sunt disponibile ${data.candles.filter(c => c.isClosed).length} pentru ${timeframe.toUpperCase()}; nu afișăm un semnal incomplet.`
        : 'Money Line indisponibil: nu avem lumânări OHLCV verificate. Nu calculăm semnale sau flipuri din simple puncte de preț.'}</p></div>
    <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-cyan-300">Deschide {info.name} pe {quote.source}<ExternalLink className="h-4 w-4" /></a>
  </section>;
};
