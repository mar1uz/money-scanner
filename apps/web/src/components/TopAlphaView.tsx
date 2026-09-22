import React, { useEffect, useMemo, useState } from 'react';
import { Trophy, RefreshCw, Coins, TrendingUp, Scale } from 'lucide-react';
import { fetchCryptoFourCriteriaScan, fetchStockBusinessQualityScan } from '../services/api.js';
import type { CryptoFourCriteriaAsset, CryptoFourCriteriaScan, StockBusinessQualityAsset, StockBusinessQualityScan } from '@money-scanner/shared';
import { useLanguage } from '../i18n.js';
import { useAssetNavigation } from './AssetNavigation.js';
import { CryptoBqAssetCard } from './CryptoBqAssetCard.js';

const stockChipTone = (status: string): string =>
  status === 'pass'
    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
    : status === 'watch'
      ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
      : status === 'fail'
        ? 'border-rose-500/40 bg-rose-500/10 text-rose-300'
        : 'border-white/[0.08] bg-white/[0.02] text-slate-500';

const indexTone = (index: number): string =>
  index >= 25 ? 'text-emerald-300' : index >= 0 ? 'text-cyan-300' : index >= -25 ? 'text-amber-300' : 'text-rose-300';

type StockUndervaluedRow = { asset: StockBusinessQualityAsset; ratio: number; basis: string; index: number };

const STOCK_CRITERIA: { key: keyof StockBusinessQualityAsset['criteria']; ro: string; en: string }[] = [
  { key: 'profitability', ro: 'Profitabilitate', en: 'Profitability' },
  { key: 'capitalEfficiency', ro: 'Eficien\u021ba capitalului', en: 'Capital efficiency' },
  { key: 'growth', ro: 'Cre\u0219tere', en: 'Growth' },
  { key: 'solvency', ro: 'Solvabilitate', en: 'Solvency' },
  { key: 'freeCashFlow', ro: 'Flux de numerar liber', en: 'Free cash flow' },
  { key: 'valuation', ro: 'Evaluare', en: 'Valuation' }
];

const fmtUsd = (value?: number): string => {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return '';
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
};

const StockBqCard: React.FC<{
  rank: number;
  asset: StockBusinessQualityAsset;
  undervalued?: StockUndervaluedRow;
  language: 'ro' | 'en';
  onNavigate: () => void;
}> = ({ rank, asset, undervalued, language, onNavigate }) => {
  const isRo = language === 'ro';
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onNavigate}
      onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onNavigate(); } }}
      className="cursor-pointer rounded-xl border border-white/[0.07] bg-[var(--t-surface-raised)] p-3 sm:p-4 transition-colors hover:border-cyan-500/30"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={`w-7 text-center text-sm font-mono font-black ${rank <= 3 ? 'text-emerald-300' : 'text-slate-500'}`}>{rank}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-100">${asset.symbol}</span>
              {asset.criteria.growth.status !== 'unknown' && (
                <span className={`text-[10px] font-mono ${asset.criteria.growth.status === 'pass' ? 'text-emerald-300' : asset.criteria.growth.status === 'watch' ? 'text-amber-300' : 'text-rose-300'}`}>{asset.criteria.growth.value}</span>
              )}
            </div>
            <span className="block text-[10px] text-slate-500 truncate">{asset.name} · MC {fmtUsd(asset.marketCap)}{asset.sector ? ` · ${asset.sector}` : ''}</span>
          </div>
        </div>
        <div className="text-right">
          <span className={`text-lg font-mono font-black ${asset.passedCriteria >= 5 ? 'text-emerald-300' : asset.score >= 50 ? 'text-amber-300' : 'text-slate-400'}`}>{asset.score}</span>
          <span className="text-[9px] text-slate-600"> / 100 · {asset.passedCriteria}/6</span>
          {undervalued ? (
            <span className={`block text-[9px] font-mono ${indexTone(undervalued.index)}`}>
              index {undervalued.index > 0 ? '+' : ''}{undervalued.index} · {undervalued.basis} {undervalued.ratio.toFixed(1)}x
            </span>
          ) : (
            <span className="block text-[9px] font-mono text-cyan-300">{isRo ? asset.aiVerdictLabelRo : asset.aiVerdict}</span>
          )}
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {STOCK_CRITERIA.map(item => {
          const criterion = asset.criteria[item.key];
          return (
            <span key={item.key} title={`${isRo ? item.ro : item.en}: ${criterion.status} - ${criterion.explanation}`} className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[8px] font-bold tracking-wide ${stockChipTone(criterion.status)}`}>
              {(isRo ? item.ro : item.en).toUpperCase().slice(0, 8)}
            </span>
          );
        })}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
        {STOCK_CRITERIA.map(item => {
          const criterion = asset.criteria[item.key];
          return (
            <div key={item.key} className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-2.5">
              <span className="block text-[9px] font-mono uppercase text-slate-600">{isRo ? item.ro : item.en}</span>
              <span className="block mt-1 text-[11px] font-mono font-bold text-slate-100 truncate" title={criterion.explanation}>{criterion.value}</span>
            </div>
          );
        })}
      </div>
    </article>
  );
};

/**
 * Top Alpha (Marius, 2026-09-22): one simple screen with BOTH Business
 * Quality leaderboards - Top Score and Undervalued - for BOTH crypto and
 * stocks, behind an asset-class selector. Stocks undervalued uses the same
 * model as crypto: quality percentile minus expensiveness percentile of the
 * log valuation ratio (P/FCF, fallback P/E then P/S), computed from the
 * stock business-quality scan metrics.
 */
export const TopAlphaView: React.FC = () => {
  const { language } = useLanguage();
  const isRo = language === 'ro';
  const navigateAsset = useAssetNavigation();
  const [assetClass, setAssetClass] = useState<'crypto' | 'stocks'>('crypto');
  const [ranking, setRanking] = useState<'score' | 'undervalued'>('score');
  const [cryptoScan, setCryptoScan] = useState<CryptoFourCriteriaScan | null>(null);
  const [stockScan, setStockScan] = useState<StockBusinessQualityScan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async (target: 'crypto' | 'stocks', refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      if (target === 'crypto') setCryptoScan(await fetchCryptoFourCriteriaScan(refresh));
      else setStockScan(await fetchStockBusinessQualityScan(refresh));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Scan failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (assetClass === 'crypto' && !cryptoScan) void load('crypto');
    if (assetClass === 'stocks' && !stockScan) void load('stocks');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetClass]);

  const isMeasured = (asset: CryptoFourCriteriaAsset) =>
    (asset.metrics.fees30d || 0) > 0 || (asset.metrics.revenue30d || 0) > 0 || (asset.metrics.holdersRevenue30d || 0) > 0;

  const cryptoAssetsById = useMemo(
    () => new Map((cryptoScan?.assets || []).flatMap(asset => [[asset.id, asset] as const, ...(asset.coinGeckoId ? [[asset.coinGeckoId, asset] as const] : [])])),
    [cryptoScan]
  );
  const topScoreAssets = (cryptoScan?.assets || []).filter(isMeasured).slice(0, 10);
  const undervaluedRows = (cryptoScan?.undervalued || [])
    .slice(0, 10)
    .flatMap(entry => {
      const asset = cryptoAssetsById.get(entry.assetId);
      return asset ? [{ entry, asset }] : [];
    });
  const stockAssets = (stockScan?.assets || []).slice(0, 10);

  // Stocks undervalued (Marius, 2026-09-22): same model as crypto -
  // quality percentile minus expensiveness percentile of log(valuation
  // ratio). Ratio = P/FCF, fallback P/E, then P/S. Assets without a
  // usable ratio are not ranked (same honesty rule as crypto).
  const stockUndervalued = useMemo<StockUndervaluedRow[]>(() => {
    if (!stockScan) return [];
    const rows = stockScan.assets.flatMap(asset => {
      const m = asset.metrics || {};
      const ratio = (m.priceToFcf || 0) > 0
        ? { ratio: m.priceToFcf!, basis: 'P/FCF' }
        : (m.trailingPE || 0) > 0
          ? { ratio: m.trailingPE!, basis: 'P/E' }
          : (m.priceToSales || 0) > 0
            ? { ratio: m.priceToSales!, basis: 'P/S' }
            : null;
      return ratio ? [{ asset, ...ratio }] : [];
    });
    if (rows.length < 5) return [];
    const qualitySorted = rows.map(r => r.asset.score).slice().sort((a, b) => a - b);
    const expSorted = rows.map(r => Math.log(r.ratio)).sort((a, b) => a - b);
    const percentile = (sorted: number[], value: number) =>
      Math.round((sorted.filter(v => v < value).length / sorted.length) * 100);
    return rows
      .map(r => ({
        ...r,
        index: percentile(qualitySorted, r.asset.score) - percentile(expSorted, Math.log(r.ratio))
      }))
      .sort((a, b) => b.index - a.index)
      .slice(0, 10);
  }, [stockScan]);

  return (
    <div className="space-y-4">
      <div className="rounded-[30px] border border-amber-500/20 bg-[var(--t-surface)] p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300">
              <Trophy className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100 font-sans">Top Alpha</h2>
              <p className="text-[11px] text-slate-400 font-sans">
                {isRo
                  ? 'Ambele clasamente Business Quality \u00eentr-un singur ecran: scorul top \u0219i cele mai subevaluate.'
                  : 'Both Business Quality leaderboards in one screen: top score and most undervalued.'}
              </p>
            </div>
          </div>
          <button
            onClick={() => void load(assetClass, true)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-2.5 py-1.5 text-[10px] font-semibold text-slate-300 hover:text-amber-200 disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            {isRo ? 'Rescaneaz\u0103' : 'Rescan'}
          </button>
        </div>

        {/* Asset-class selector (Marius, 2026-09-22): full-width segmented control, mobile-first. */}
        <div className="grid grid-cols-2 gap-1 rounded-xl border border-white/[0.07] bg-[var(--t-surface-raised)] p-1">
          {(['crypto', 'stocks'] as const).map(option => (
            <button
              key={option}
              onClick={() => setAssetClass(option)}
              aria-pressed={assetClass === option}
              className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-bold uppercase tracking-wide transition ${assetClass === option ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40' : 'text-slate-500 border border-transparent hover:text-slate-300'}`}
            >
              {option === 'crypto' ? <Coins className="w-3.5 h-3.5" /> : <TrendingUp className="w-3.5 h-3.5" />}
              {option === 'crypto' ? 'Crypto' : (isRo ? 'Ac\u021bii' : 'Stocks')}
            </button>
          ))}
        </div>

        {/* Ranking sub-tabs (Marius, 2026-09-22): Scor top | Subevaluate side by side, one tap away */}
        <div className="grid grid-cols-2 gap-1 rounded-xl border border-white/[0.07] bg-[var(--t-surface-raised)] p-1">
          {(['score', 'undervalued'] as const).map(option => (
            <button
              key={option}
              onClick={() => setRanking(option)}
              aria-pressed={ranking === option}
              className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-bold uppercase tracking-wide transition ${ranking === option ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40' : 'text-slate-500 border border-transparent hover:text-slate-300'}`}
            >
              {option === 'score' ? <Trophy className="w-3.5 h-3.5" /> : <Scale className="w-3.5 h-3.5" />}
              {option === 'score' ? (isRo ? 'Scor top' : 'Top score') : (isRo ? 'Subevaluate' : 'Undervalued')}
            </button>
          ))}
        </div>

        {loading && !cryptoScan && !stockScan && <p className="py-8 text-center text-xs text-slate-500">{isRo ? 'Se \u00eencarc\u0103 clasamentele\u2026' : 'Loading leaderboards\u2026'}</p>}
        {error && (
          <div className="py-6 text-center space-y-2">
            <p className="text-sm text-rose-300">{error}</p>
            <button onClick={() => void load(assetClass, true)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 py-1.5 text-[10px] text-slate-300">
              <RefreshCw className="w-3 h-3" /> {isRo ? 'Re\u00eencearc\u0103' : 'Retry'}
            </button>
          </div>
        )}

        {assetClass === 'crypto' && cryptoScan && (
          <>
            {ranking === 'score' && (
            <div className="space-y-2.5">
              <div>
                <h3 className="text-[11px] font-bold uppercase tracking-wide text-emerald-300">{isRo ? 'Scor top' : 'Top score'}</h3>
                <p className="text-[10px] text-slate-500">{isRo ? 'Calitate + accelera\u021bie, f\u0103r\u0103 s\u0103 se uite la pre\u021b. Sortat dup\u0103 criterii trecute, apoi ritm de cre\u0219tere.' : 'Quality + acceleration, price ignored. Sorted by criteria passed, then growth pace.'}</p>
              </div>
              {topScoreAssets.map((asset, index) => (
                <CryptoBqAssetCard
                  key={asset.id}
                  rank={index + 1}
                  asset={asset}
                  language={language}
                  onNavigate={target => navigateAsset({ symbol: target.symbol, marketClass: 'crypto', coinGeckoId: target.coinGeckoId })}
                />
              ))}
            </div>
            )}

            {ranking === 'undervalued' && (
            <div className="space-y-2.5">
              <div>
                <h3 className="text-[11px] font-bold uppercase tracking-wide text-amber-300">{isRo ? 'Subevaluate' : 'Undervalued'}</h3>
                <p className="text-[10px] text-slate-500">{isRo ? 'Calitate raportat\u0103 la pre\u021b: percentila calit\u0103\u021bii minus percentila scumpirii (log mcap / revenue anualizat).' : 'Quality relative to price: quality percentile minus expensiveness percentile (log mcap / annualized revenue).'}</p>
              </div>
              {undervaluedRows.map(({ entry, asset }, index) => (
                <CryptoBqAssetCard
                  key={entry.assetId}
                  rank={index + 1}
                  asset={asset}
                  undervalued={entry}
                  language={language}
                  onNavigate={target => navigateAsset({ symbol: target.symbol, marketClass: 'crypto', coinGeckoId: target.coinGeckoId })}
                />
              ))}
            </div>
            )}
          </>
        )}

        {assetClass === 'stocks' && stockScan && (
          <>
            {ranking === 'score' && (
            <div className="space-y-2.5">
              <div>
                <h3 className="text-[11px] font-bold uppercase tracking-wide text-emerald-300">{isRo ? 'Scor top' : 'Top score'}</h3>
                <p className="text-[10px] text-slate-500">{isRo ? 'Sortat dup\u0103 scorul pe 6 criterii: profitabilitate, eficien\u021ba capitalului, cre\u0219tere, solvabilitate, FCF, evaluare.' : 'Sorted by the 6-criteria score: profitability, capital efficiency, growth, solvency, FCF, valuation.'}</p>
              </div>
              {stockAssets.map((asset, index) => (
                <StockBqCard
                  key={asset.id}
                  rank={index + 1}
                  asset={asset}
                  language={language}
                  onNavigate={() => navigateAsset({ symbol: asset.symbol, marketClass: 'stocks' })}
                />
              ))}
            </div>
            )}

            {ranking === 'undervalued' && (
            <div className="space-y-2.5">
              <div>
                <h3 className="text-[11px] font-bold uppercase tracking-wide text-amber-300">{isRo ? 'Subevaluate' : 'Undervalued'}</h3>
                <p className="text-[10px] text-slate-500">{isRo ? 'Acela\u0219i model ca la crypto: percentila calit\u0103\u021bii minus percentila scumpirii (log P/FCF; fallback P/E, apoi P/S). Ac\u021biunile f\u0103r\u0103 multiplu utilizabil nu sunt clasate.' : 'Same model as crypto: quality percentile minus expensiveness percentile (log P/FCF; P/E then P/S fallbacks). Stocks without a usable multiple are not ranked.'}</p>
              </div>
              {stockUndervalued.length === 0 && (
                <p className="py-3 text-center text-[10px] text-slate-600">{isRo ? 'Prea pu\u021bine ac\u021biuni cu multiplu utilizabil \u00een scanul curent.' : 'Too few stocks with a usable multiple in the current scan.'}</p>
              )}
              {stockUndervalued.map((row, index) => (
                <StockBqCard
                  key={row.asset.id}
                  rank={index + 1}
                  asset={row.asset}
                  undervalued={row}
                  language={language}
                  onNavigate={() => navigateAsset({ symbol: row.asset.symbol, marketClass: 'stocks' })}
                />
              ))}
            </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
