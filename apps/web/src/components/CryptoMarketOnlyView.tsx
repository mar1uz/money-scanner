import React from 'react';
import { ArrowLeft, ExternalLink, RefreshCw, Info } from 'lucide-react';
import type { AssetDetailResponse } from '../types.js';

const money = (value: unknown) => typeof value === 'number' && Number.isFinite(value)
  ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumSignificantDigits: 7 }).format(value)
  : '—';

export const CryptoMarketOnlyView: React.FC<{
  data: AssetDetailResponse; onBack: () => void; onRefresh: () => void; loading?: boolean;
}> = ({ data, onBack, onRefresh, loading }) => {
  const { info, quote } = data;
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
  return <section className="space-y-5" aria-label={`Date de piață ${info.name}`}>
    <div className="flex flex-wrap items-center gap-3">
      <button onClick={onBack} className="rounded-xl border border-white/10 p-2.5 text-slate-300" aria-label="Înapoi"><ArrowLeft className="h-5 w-5" /></button>
      <div className="min-w-0 flex-1"><h1 className="text-xl font-bold text-white">{info.name} <span className="text-slate-400">${info.symbol}</span></h1>
        <p className="text-xs text-slate-400">Crypto · {quote.source}{info.rank > 0 ? ` · #${info.rank}` : ''}</p></div>
      <button onClick={onRefresh} disabled={loading} className="rounded-xl border border-white/10 p-2.5 text-cyan-300" aria-label="Reîncarcă datele"><RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} /></button>
    </div>
    <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline gap-3"><span className="text-3xl font-bold text-white">{money(quote.price)}</span>
        <span className={change !== null && change >= 0 ? 'text-emerald-300' : 'text-rose-300'}>{change === null ? '—' : `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`} <span className="text-xs text-slate-400">24h</span></span></div>
      <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[['Capitalizare', info.marketCap], ['Volum 24h (USD)', quote.volume24h], ['Maxim 24h', quote.high24h], ['Minim 24h', quote.low24h]].map(([label, value]) =>
          <div key={String(label)}><dt className="text-xs text-slate-400">{label}</dt><dd className="mt-1 break-words font-mono text-sm text-white">{money(value)}</dd></div>)}
      </dl>
      <p className={`mt-5 text-xs ${quote.isStale ? 'text-amber-300' : 'text-slate-400'}`}>
        {quote.isStale ? 'Date întârziate · ' : ''}Actualizare {quote.source}: {new Date(quote.timestamp).toLocaleString('ro-RO')}
      </p>
    </div>
    <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-5 sm:p-6">
      <h2 className="font-semibold text-white">Istoric de preț · ultimele 30 de zile disponibile</h2>
      <p className="mt-1 text-xs text-slate-400">Prețuri USD raportate de {quote.source}; puncte de preț, nu lumânări OHLCV.</p>
      {prices.length > 1 ? <>
        <div className="mt-4 flex justify-between text-xs text-slate-400"><span>Min. {money(low)}</span><span>Max. {money(high)}</span></div>
        <svg viewBox="0 0 800 260" className="mt-2 w-full" role="img" aria-label={`Istoric de preț ${info.name}`}><polyline points={points} fill="none" stroke="#22d3ee" strokeWidth="2.5" vectorEffect="non-scaling-stroke" /></svg>
        <div className="flex justify-between text-xs text-slate-400"><span>{new Date(start).toLocaleDateString('ro-RO')}</span><span>{new Date(end).toLocaleString('ro-RO')}</span></div>
      </> : <p className="py-10 text-sm text-slate-400">Istoricul de preț nu este disponibil momentan de la furnizor. Cotația de mai sus rămâne disponibilă.</p>}
    </div>
    <div className="flex gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100"><Info className="mt-0.5 h-5 w-5 shrink-0" /><p>Money Line indisponibil: nu avem lumânări OHLCV verificate pentru această monedă din sursele de tranzacționare integrate. Prezența în Bubbles nu presupune listare pe Binance. Nu calculăm semnale sau flipuri din simple puncte de preț.</p></div>
    <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-cyan-300">Deschide {info.name} pe {quote.source}<ExternalLink className="h-4 w-4" /></a>
  </section>;
};
