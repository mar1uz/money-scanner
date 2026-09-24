import React from 'react';
import type { StockBusinessQualityAsset } from '@money-scanner/shared';
import { translateText } from '../i18n.js';

// Shared stock Business Quality card blocks (criteria chips + metric tiles),
// extracted from TopAlphaView so the Alerts section stock cards can show the
// same full fundamentals set (Marius, 2026-09-24: "vreau sa aibă toate
// informațiile care se găsesc și în Top Alpha").

export const stockChipTone = (status: string): string =>
  status === 'pass'
    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
    : status === 'watch'
      ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
      : status === 'fail'
        ? 'border-rose-500/40 bg-rose-500/10 text-rose-300'
        : 'border-white/[0.08] bg-white/[0.02] text-slate-500';

export const indexTone = (index: number): string =>
  index >= 25 ? 'text-emerald-300' : index >= 0 ? 'text-cyan-300' : index >= -25 ? 'text-amber-300' : 'text-rose-300';

export const STOCK_CRITERIA: { key: keyof StockBusinessQualityAsset['criteria']; ro: string; en: string }[] = [
  { key: 'profitability', ro: 'Profitabilitate', en: 'Profitability' },
  { key: 'capitalEfficiency', ro: 'Eficien\u021ba capitalului', en: 'Capital efficiency' },
  { key: 'growth', ro: 'Cre\u0219tere', en: 'Growth' },
  { key: 'priceToRevenue', ro: 'Preț/Venituri', en: 'Price/Revenue' },
  { key: 'freeCashFlow', ro: 'Flux de numerar liber', en: 'Free cash flow' },
  { key: 'valuation', ro: 'Evaluare', en: 'Valuation' }
];
// Whole-word chip labels instead of an 8-char cut ("PROFITAB", "VALUATIO") - Marius, 2026-09-24 mobile audit.
export const STOCK_CHIP_SHORT: Partial<Record<keyof StockBusinessQualityAsset['criteria'], { ro: string; en: string }>> = {
  profitability: { ro: 'PROFIT', en: 'PROFIT' },
  capitalEfficiency: { ro: 'CAPITAL', en: 'CAPITAL' },
  growth: { ro: 'CREȘTERE', en: 'GROWTH' },
  priceToRevenue: { ro: 'P/R', en: 'P/R' },
  freeCashFlow: { ro: 'FCF', en: 'FCF' },
  valuation: { ro: 'EVALUARE', en: 'VALUE' },
};
// Display-only tiles (not scored, no chip): Solvency and P/E (Marius, 2026-09-24).
export const STOCK_EXTRA_TILES: { key: keyof StockBusinessQualityAsset['criteria']; ro: string; en: string }[] = [
  { key: 'solvency', ro: 'Solvabilitate', en: 'Solvency' },
  { key: 'peRatio', ro: 'P/E', en: 'P/E' },
];

export const fmtUsd = (value?: number): string => {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return '';
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
};

// Market cap on every card as small inline grey text, the stock-card
// subtitle style "Salesforce · MC $195.53B · Technology" (Marius,
// 2026-09-24, annotated screenshot; no tiles). Real data only: no verified
// market cap (metals/commodities) renders "MC \u2014", never an estimate.
export const mcInline = (value?: number): string => `MC ${fmtUsd(value) || '\u2014'}`;

export const StockBqChips: React.FC<{ asset: StockBusinessQualityAsset; language: 'ro' | 'en' }> = ({ asset, language }) => {
  const isRo = language === 'ro';
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
      {STOCK_CRITERIA.map(item => {
        const criterion = asset.criteria[item.key];
        if (!criterion) return null;
        return (
          <span key={item.key} title={`${isRo ? item.ro : item.en}: ${criterion.status} - ${translateText(criterion.explanation, language)}`} className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[8px] font-bold tracking-wide ${stockChipTone(criterion.status)}`}>
            {(isRo ? STOCK_CHIP_SHORT[item.key]?.ro : STOCK_CHIP_SHORT[item.key]?.en) ?? (isRo ? item.ro : item.en).toUpperCase()}
          </span>
        );
      })}
    </div>
  );
};

// Marius, 2026-09-24: on the Alerts stock cards P/R and P/E live together in
// ONE combined tile, and the whole tile is highlighted in the alerts accent
// colour so it is easy to spot ("PR și PE să fie amândouă în aceeași căsuță
// și să fie toată căsuța de altă culoare").
const CombinedPePrTile: React.FC<{ asset: StockBusinessQualityAsset; language: 'ro' | 'en' }> = ({ asset, language }) => {
  const pr = asset.criteria.priceToRevenue;
  const pe = asset.criteria.peRatio;
  const prValue = (pr?.value ?? 'N/A').replace(/^P\/R:\s*/, 'P/R ');
  const peValue = (pe?.value ?? 'N/A').replace(/^P\/E:\s*/, 'P/E ');
  const explanation = [pr?.explanation, pe?.explanation].filter(Boolean).join(' | ');
  return (
    <div className="rounded-lg border border-violet-500/50 bg-violet-500/[0.14] p-2.5">
      <span className="block text-[9px] font-mono uppercase text-violet-300">P/R · P/E</span>
      <span className="block mt-1 text-[11px] font-mono font-bold leading-snug text-violet-100 break-words" title={explanation ? translateText(explanation, language) : undefined}>
        {prValue} · {peValue}
      </span>
    </div>
  );
};

export const StockBqTiles: React.FC<{ asset: StockBusinessQualityAsset; language: 'ro' | 'en'; combinedPePr?: boolean }> = ({ asset, language, combinedPePr = false }) => {
  const isRo = language === 'ro';
  const items = [...STOCK_CRITERIA, ...STOCK_EXTRA_TILES].filter(item => !combinedPePr || (item.key !== 'priceToRevenue' && item.key !== 'peRatio'));
  const tiles: React.ReactNode[] = [];
  for (const item of items) {
    const criterion = asset.criteria[item.key];
    if (!criterion) continue;
    tiles.push(
      <div key={item.key} className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-2.5">
        <span className="block text-[9px] font-mono uppercase text-slate-600">{isRo ? item.ro : item.en}</span>
        {/* Full value, wraps instead of truncating (Marius, 2026-09-24: "Forwar..." was cut on mobile) */}
        <span className="block mt-1 text-[11px] font-mono font-bold leading-snug text-slate-100 break-words" title={translateText(criterion.explanation, language)}>{criterion.value}</span>
      </div>
    );
    // Combined P/R · P/E tile takes the Price/Revenue slot (after Growth).
    if (combinedPePr && item.key === 'growth') {
      tiles.push(<CombinedPePrTile key="pe-pr" asset={asset} language={language} />);
    }
  }
  return <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">{tiles}</div>;
};
