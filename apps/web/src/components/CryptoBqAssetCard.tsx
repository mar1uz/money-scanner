import React from 'react';
import { cryptoValuation } from '@money-scanner/shared';
import { Activity, Network, Banknote, HandCoins, Scale, Coins } from 'lucide-react';
import type { CryptoCriteriaStatus, CryptoFourCriteriaAsset, CryptoUndervaluedEntry } from '@money-scanner/shared';
import { computePriceToRevenue, formatPriceToRevenue } from '../services/crypto-fundamentals.js';
import { NarrativeTag } from './NarrativeTag.js';
import { mcInline } from './StockBqBlocks.js';

const chipTone = (status: CryptoCriteriaStatus): string =>
  status === 'pass'
    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
    : status === 'watch'
      ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
      : status === 'fail'
        ? 'border-rose-500/40 bg-rose-500/10 text-rose-300'
        : 'border-white/[0.08] bg-white/[0.02] text-slate-500';

const fmtUsd = (value?: number): string => {
  if (value === undefined || !Number.isFinite(value) || value < 0) return '\u2014';
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${Math.round(value)}`;
};

const fmtGrowth = (value?: number): string | null => {
  if (value === undefined || !Number.isFinite(value)) return null;
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
};

/**
 * Unified Business Quality card (Marius, 2026-09-22): the same information
 * on every BQ card - criteria chips (growth, network effect, sustainable
 * revenue, holder value), the real 30d input numbers, the valuation MULTIPLE
 * in place of the old growth card, and growth as a simple % next to the name.
 * Used by the Top Alpha view (both leaderboards) and the undervalued ranking.
 */
export const CryptoBqAssetCard: React.FC<{
  rank: number;
  asset: CryptoFourCriteriaAsset;
  undervalued?: CryptoUndervaluedEntry;
  language: 'ro' | 'en';
  onNavigate: (asset: CryptoFourCriteriaAsset) => void;
}> = ({ rank, asset, undervalued, language, onNavigate }) => {
  const isRo = language === 'ro';
  const metrics = asset.metrics || {};
  // Marius, 2026-09-22: show both paces explicitly labeled; TVL demoted to the tooltip breakdown.
  const feePace = fmtGrowth(metrics.feeRunRateChange);
  const revPace = fmtGrowth(metrics.revenueRunRateChange);
  const tvlPace = fmtGrowth(metrics.tvlChange7d);
  const paceTip = [
    isRo ? 'Media zilnică 7z vs media zilnică 30z' : '7d daily average vs 30d daily average',
    feePace ? `FEES ${feePace}` : null,
    revPace ? `REV ${revPace}` : null,
    tvlPace ? `TVL 7z ${tvlPace}` : null,
  ].filter(Boolean).join(' \u00b7 ');
  const valuation = cryptoValuation(asset);
  const priceToRevenue = computePriceToRevenue(asset.marketCap, metrics.revenue30d);
  const tvlMeetsGate = (metrics.tvl ?? 0) >= 10_000_000;
  const multipleBasis = valuation.basis === 'revenue' ? 'P/R' : valuation.basis === 'fees' ? 'P/F' : 'P/H';
  const percent = (value?: number) => value === undefined ? '—' : `${value.toFixed(2)}%`;
  const basisLabel = valuation.basis === 'revenue' ? 'revenue' : valuation.basis === 'fees' ? 'fees' : isRo ? 'valoare holderi' : 'holder value';
  const criteriaItems: { label: string; full: string; status: CryptoCriteriaStatus; icon: React.ReactNode }[] = [
    { label: isRo ? 'CRE\u0218TERE' : 'GROWTH', full: isRo ? 'Cre\u0219tere' : 'Growth', status: asset.criteria.growth.status, icon: <Activity className="w-3 h-3" /> },
    { label: isRo ? 'RE\u021AEA' : 'NETWORK', full: isRo ? 'Efect de re\u021bea' : 'Network effect', status: asset.criteria.networkEffect.status, icon: <Network className="w-3 h-3" /> },
    { label: isRo ? 'VENIT' : 'REVENUE', full: isRo ? 'Venit sustenabil' : 'Sustainable revenue', status: asset.criteria.sustainableRevenue.status, icon: <Banknote className="w-3 h-3" /> },
    { label: isRo ? 'HOLDERI' : 'HOLDERS', full: isRo ? 'Valoare c\u0103tre holderi' : 'Holder value', status: asset.criteria.holderValue.status, icon: <HandCoins className="w-3 h-3" /> }
  ];
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => onNavigate(asset)}
      onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onNavigate(asset); } }}
      className="cursor-pointer rounded-xl border border-white/[0.07] bg-[var(--t-surface-raised)] p-3 sm:p-4 transition-colors hover:border-cyan-500/30"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={`w-7 text-center text-sm font-mono font-black ${rank <= 3 ? 'text-emerald-300' : 'text-slate-500'}`}>{rank}</span>
          {asset.image ? <img src={asset.image} alt="" className="w-8 h-8 rounded-full bg-white/[0.04]" loading="lazy" /> : <Coins className="w-8 h-8 text-slate-600" />}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span translate="no" className="text-sm font-bold text-slate-100">${asset.symbol}</span>
              <span className="text-[10px] font-mono text-slate-600">{asset.marketCapRank > 0 ? `#${asset.marketCapRank}` : ''}</span>
              <NarrativeTag narrative={asset.narrative} />
              {(feePace || revPace) && (
                <span className="inline-flex flex-wrap items-center gap-1 text-[9px] font-mono" title={paceTip}>
                  {feePace && (
                    <span className="inline-flex items-center gap-0.5 rounded border border-white/[0.08] px-1 py-px">
                      <span className="text-slate-500">FEES</span>
                      <span className={feePace.startsWith('+') ? 'text-emerald-300' : 'text-rose-300'}>{feePace}</span>
                    </span>
                  )}
                  {revPace && (
                    <span className="inline-flex items-center gap-0.5 rounded border border-white/[0.08] px-1 py-px">
                      <span className="text-slate-500">REV</span>
                      <span className={revPace.startsWith('+') ? 'text-emerald-300' : 'text-rose-300'}>{revPace}</span>
                    </span>
                  )}
                </span>
              )}
            </div>
            <span className="block text-[10px] text-slate-500 truncate"><bdi translate="no">{asset.name}</bdi> · {mcInline(asset.marketCap)}</span>
          </div>
        </div>
        <div className="text-right" title={isRo ? 'Scor intern: pass = 25, watch = 12, fail/necunoscut = 0. Nu este probabilitate sau randament.' : 'Internal score: pass = 25, watch = 12, fail/unknown = 0. Not a probability or return.'}>
          <span className={`text-lg font-mono font-black ${asset.passedCriteria >= 3 ? 'text-emerald-300' : asset.score >= 50 ? 'text-amber-300' : 'text-slate-400'}`}>{asset.score}</span>
          <span className="text-[9px] text-slate-600"> / 100 · {asset.passedCriteria}/4</span>
          {undervalued && (
            <span className={`block text-[9px] font-mono ${undervalued.undervaluationIndex >= 25 ? 'text-emerald-300' : undervalued.undervaluationIndex >= 0 ? 'text-cyan-300' : 'text-amber-300'}`}>
              index {undervalued.undervaluationIndex > 0 ? '+' : ''}{undervalued.undervaluationIndex}
            </span>
          )}
        </div>
      </div>
      {/* Marius (2026-09-23): MC and TVL up top, as large as the metric tiles,
          so the size of every protocol is visible at a glance. TVL is green
          when it clears the $10M Network threshold, amber below it. */}
      <div className="grid grid-cols-2 gap-2 mt-3">
        <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-2.5">
          <span className="block text-[9px] font-mono uppercase text-slate-600">{isRo ? 'Market cap' : 'Market cap'}</span>
          <span className="block mt-1 text-sm font-mono font-bold text-slate-100">{fmtUsd(asset.marketCap)}</span>
        </div>
        <div className={`rounded-lg border p-2.5 ${tvlMeetsGate ? 'border-emerald-500/25 bg-emerald-500/[0.05]' : 'border-amber-500/25 bg-amber-500/[0.05]'}`} title={isRo ? 'Prag Efect de rețea: TVL ≥ $10M' : 'Network effect threshold: TVL ≥ $10M'}>
          <span className={`block text-[9px] font-mono uppercase ${tvlMeetsGate ? 'text-emerald-300' : 'text-amber-300'}`}>TVL</span>
          <span className="block mt-1 text-sm font-mono font-bold text-slate-100">{fmtUsd(metrics.tvl)}</span>
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {criteriaItems.map(item => (
          <span key={item.label} title={`${item.full}: ${item.status}`} className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[8px] font-bold tracking-wide ${chipTone(item.status)}`}>
            {item.icon}{item.label}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 mt-3">
        <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-2.5">
          <span className="block text-[9px] font-mono uppercase text-slate-600">{isRo ? 'Fees / 30z' : 'Fees / 30d'}</span>
          <span className="block mt-1 text-sm font-mono font-bold text-slate-100">{fmtUsd(metrics.fees30d)}</span>
        </div>
        <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-2.5">
          <span className="block text-[9px] font-mono uppercase text-slate-600">{isRo ? 'Revenue / 30z' : 'Revenue / 30d'}</span>
          <span className="block mt-1 text-sm font-mono font-bold text-slate-100">{fmtUsd(metrics.revenue30d)}</span>
        </div>
        <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-2.5">
          <span className="block text-[9px] font-mono uppercase text-slate-600">{isRo ? 'Valoare holderi / 30z' : 'Holder value / 30d'}</span>
          <span className="block mt-1 text-sm font-mono font-bold text-slate-100">{fmtUsd(metrics.holdersRevenue30d)}</span>
        </div>
        <div className="rounded-lg border border-cyan-500/25 bg-cyan-500/[0.07] p-2.5">
          <span className="inline-flex items-center gap-1 text-[9px] font-mono uppercase text-cyan-300"><Scale className="w-3 h-3" />P/R</span>
          <span className="block mt-1 text-sm font-mono font-bold text-cyan-100">{formatPriceToRevenue(priceToRevenue)}</span>
          <span className="block text-[8px] font-mono text-cyan-300/70">
            {priceToRevenue !== undefined
              ? 'MC / (revenue 30d \u00d7 365/30)'
              : valuation.multiple !== undefined
                ? `${isRo ? 'fără revenue' : 'no revenue'} \u00b7 ${multipleBasis} ${valuation.multiple.toFixed(1)}x`
                : (isRo ? 'fără revenue' : 'no revenue')}
          </span>
        </div>
        <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/[0.05] p-2.5">
          <span className="block text-[9px] font-mono uppercase text-emerald-300">{isRo ? 'Randament holderi' : 'Holder yield'}</span>
          <span className="block mt-1 text-sm font-mono font-bold text-slate-100">{percent(valuation.holderYield)}</span>
          <span className="block text-[9px] text-slate-400">{isRo ? 'Holderi 30z × 365/30 / MC' : 'Holders 30d × 365/30 / MC'}</span>
        </div>
        <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-2.5">
          <span className="block text-[9px] font-mono uppercase text-slate-400">{isRo ? 'Randament / FDV' : 'Yield / FDV'}</span>
          <span className="block mt-1 text-sm font-mono font-bold text-slate-100">{percent(valuation.dilutedHolderYield)}</span>
          <span className="block text-[9px] text-slate-400">FDV {fmtUsd(asset.fullyDilutedValuation)}{valuation.dilutionMultiple !== undefined ? ` · ${valuation.dilutionMultiple.toFixed(2)}× MC` : ''}</span>
        </div>
      </div>
      <p className="mt-2 text-[10px] text-slate-400">{isRo ? 'Ritm extrapolat din 30z, nu APY garantat. Buyback/burn nu este o plată directă. — = date lipsă sau incomplete.' : '30d pace extrapolated, not guaranteed APY. Buybacks/burns are not direct payouts. — = missing or incomplete data.'}</p>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-400" onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
        {asset.coinGeckoId && <a className="underline" target="_blank" rel="noreferrer" href={`https://www.coingecko.com/en/coins/${encodeURIComponent(asset.coinGeckoId)}`}>CoinGecko</a>}
        {asset.marketDataSource === 'coinpaprika' && <a className="underline" target="_blank" rel="noreferrer" href={`https://coinpaprika.com/coin/${encodeURIComponent(asset.id)}/`}>CoinPaprika</a>}
        {asset.protocolSlugs?.map(slug => <a key={slug} className="underline" target="_blank" rel="noreferrer" href={`https://defillama.com/protocol/${encodeURIComponent(slug)}`}>{slug}</a>)}
      </div>
    </article>
  );
};
