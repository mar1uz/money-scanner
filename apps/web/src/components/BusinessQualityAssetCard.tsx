import React from 'react';
import { CheckCircle2, CircleHelp, XCircle, Sparkles, Scale } from 'lucide-react';
import type { CryptoCriteriaStatus } from '@money-scanner/shared';
import type { AssetDetailResponse } from '../types.js';

type BusinessQuality = NonNullable<AssetDetailResponse['businessQuality']>;

const tone = (status: CryptoCriteriaStatus) => status === 'pass'
  ? 'border-emerald-500/25 bg-emerald-500/[0.07] text-emerald-200'
  : status === 'watch'
    ? 'border-amber-500/25 bg-amber-500/[0.07] text-amber-200'
    : status === 'fail'
      ? 'border-rose-500/25 bg-rose-500/[0.07] text-rose-200'
      : 'border-white/[0.08] bg-white/[0.03] text-slate-400';

const statusIcon = (status: CryptoCriteriaStatus) => status === 'pass'
  ? <CheckCircle2 className="w-3.5 h-3.5" />
  : status === 'unknown'
    ? <CircleHelp className="w-3.5 h-3.5" />
    : <XCircle className="w-3.5 h-3.5" />;

export const BusinessQualityAssetCard: React.FC<{ businessQuality?: BusinessQuality; language: 'ro' | 'en' }> = ({ businessQuality, language }) => {
  if (!businessQuality || businessQuality.status === 'unavailable') return null;
  const isRo = language === 'ro';
  const asset = businessQuality.asset;
  const narrative = isRo
    ? (businessQuality.narrative?.ro || businessQuality.narrative?.en)
    : (businessQuality.narrative?.en || businessQuality.narrative?.ro);

  const criterionLabels = isRo
    ? ['Creștere', 'Efect de rețea', 'Venit sustenabil', 'Valoare către holderi']
    : ['Growth', 'Network effect', 'Sustainable revenue', 'Holder value'];
  const englishExplanations: Record<CryptoCriteriaStatus, string[]> = {
    pass: [
      'TVL or annualized fee run-rate is accelerating by at least 5%.',
      'Relevant economic activity plus TVL or multi-chain reach; this is a proxy, not an exact user count.',
      'Revenue is material and present across the 24h, 7d and 30d windows.',
      'DefiLlama reports buyback/burn, direct distribution or revenue-funded staking.'
    ],
    watch: [
      'Activity is stable or growing slowly and needs monitoring.',
      'Usage is measurable, but the network-effect proxy threshold is not yet met.',
      'Revenue exists but is too small, irregular or recent for confirmation.',
      'The mechanism exists, but observed value is still small or irregular.'
    ],
    fail: [
      'The activity proxy is contracting versus the comparable period.',
      'The network-effect proxy is not met.',
      'Tracked activity produces no retained protocol revenue in this window.',
      'Revenue exists, but no value transfer to token holders is reported.'
    ],
    unknown: [
      'No comparable free user/activity series is available.',
      'The free source has no comparable usage evidence for this token.',
      'No comparable DefiLlama observation exists for this token.',
      'Without observed revenue, fee sharing or distribution cannot be confirmed.'
    ]
  };
  // Valuation multiple (Marius, 2026-09-22): mcap / annualized revenue,
  // fees then holder revenue as basis fallback. Replaces the growth card;
  // growth shows inline in the header.
  const valuationMultiple = () => {
    if (!asset) return null;
    const metrics = asset.metrics || {};
    const basis = (metrics.revenue30d || 0) > 0
      ? { annualized: metrics.revenue30d! * 12, ro: 'mcap / revenue anualizat (30z × 12)', en: 'mcap / annualized revenue (30d × 12)' }
      : (metrics.fees30d || 0) > 0
        ? { annualized: metrics.fees30d! * 12, ro: 'mcap / fees anualizate (30z × 12)', en: 'mcap / annualized fees (30d × 12)' }
        : (metrics.holdersRevenue30d || 0) > 0
          ? { annualized: metrics.holdersRevenue30d! * 12, ro: 'mcap / valoare holderi anualizată (30z × 12)', en: 'mcap / annualized holder value (30d × 12)' }
          : null;
    if (!basis || asset.marketCap <= 0) return null;
    return { ratio: asset.marketCap / basis.annualized, label: isRo ? basis.ro : basis.en };
  };
  const multiple = valuationMultiple();
  const localizedValue = (value: string) => isRo ? value : value
    .replace('Date insuficiente', 'Insufficient data')
    .replace('$0 observat', '$0 observed')
    .replace(/\/ 30z/g, '/ 30d');

  return (
    <div className="rounded-[30px] border border-cyan-500/20 bg-[var(--t-surface)] p-5 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-white">{isRo ? 'Business Quality · 4 criterii' : 'Business Quality · 4 criteria'}</h2>
        {asset && (
          <span className="font-mono text-sm font-black text-emerald-300">
            {asset.score}<span className="text-[10px] font-semibold text-slate-500"> /100 · {asset.passedCriteria}/4 {isRo ? 'trecute' : 'pass'}</span>
            {asset.criteria.growth.status !== 'unknown' && (
              <span className={`ml-2 text-[10px] font-semibold ${asset.criteria.growth.status === 'pass' ? 'text-emerald-300' : asset.criteria.growth.status === 'watch' ? 'text-amber-300' : 'text-rose-300'}`}>{localizedValue(asset.criteria.growth.value)}</span>
            )}
          </span>
        )}
      </div>

      {asset ? (
        <div className="grid gap-2.5 sm:grid-cols-2">
          <div className="rounded-xl border p-3 border-cyan-500/25 bg-cyan-500/[0.07] text-cyan-200">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider"><Scale className="w-3 h-3" />{isRo ? 'Multiplu' : 'Multiple'}</span>
            </div>
            <p className="mt-1.5 font-mono text-sm font-bold">{multiple ? `${multiple.ratio.toFixed(1)}x` : '—'}</p>
            <p className="mt-1 text-[11px] leading-relaxed opacity-80">{multiple ? multiple.label : (isRo ? 'Fără fees/revenue observabil pentru multiplu.' : 'No observable fees/revenue for a multiple.')}</p>
          </div>
          {(['networkEffect', 'sustainableRevenue', 'holderValue'] as const).map((key, zeroIndex) => {
            const index = zeroIndex + 1;
            const criterion = asset.criteria[key];
            return (
              <div key={key} className={`rounded-xl border p-3 ${tone(criterion.status)}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider">{criterionLabels[index]}</span>
                  {statusIcon(criterion.status)}
                </div>
                <p className="mt-1.5 font-mono text-sm font-bold">{localizedValue(criterion.value)}</p>
                <p className="mt-1 text-[11px] leading-relaxed opacity-80">
                  {isRo ? criterion.explanation : englishExplanations[criterion.status][index]}
                </p>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs leading-relaxed text-slate-400">
          {isRo
            ? 'Acest activ nu are acoperire DefiLlama pentru fees, revenue sau buyback — nu afișăm cifre inventate.'
            : 'This asset has no DefiLlama coverage for fees, revenue or buybacks - we do not show invented numbers.'}
        </p>
      )}

      {narrative && (
        <div className="rounded-xl border border-purple-500/20 bg-purple-500/[0.05] p-4">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-purple-300">
            <Sparkles className="w-3 h-3" />
            {isRo ? 'Ce generează venitul · Instinct' : 'What generates the revenue · Instinct'}
          </div>
          <p className="mt-1.5 text-sm font-semibold text-slate-100">{narrative.headline}</p>
          {narrative.paragraphs.map((paragraph, index) => (
            <p key={index} className="mt-1 text-xs leading-relaxed text-slate-300">{paragraph}</p>
          ))}
        </div>
      )}

      <p className="text-[10px] text-slate-600">
        {isRo
          ? 'Date: DefiLlama (fees / revenue / holders revenue, 30 zile) · se actualizează la fiecare scanare.'
          : 'Source: DefiLlama (fees / revenue / holders revenue, 30d) · refreshed with every scan.'}
      </p>
    </div>
  );
};
