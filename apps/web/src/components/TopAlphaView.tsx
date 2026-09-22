import React, { useEffect, useMemo, useState } from 'react';
import { Trophy, RefreshCw, Coins, TrendingUp } from 'lucide-react';
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

/**
 * Top Alpha (Marius, 2026-09-22): one simple screen with BOTH Business
 * Quality leaderboards - Top Score (quality + acceleration, price ignored)
 * and Undervalued (quality relative to price) - behind an asset-class
 * selector. Crypto shows both rankings; stocks shows the quality top picks
 * (no undervalued model exists for equities yet).
 */
export const TopAlphaView: React.FC = () => {
  const { language } = useLanguage();
  const isRo = language === 'ro';
  const navigateAsset = useAssetNavigation();
  const [assetClass, setAssetClass] = useState<'crypto' | 'stocks'>('crypto');
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

  const stockCriteriaItems = (asset: StockBusinessQualityAsset) => [
    { key: 'profitability', label: isRo ? 'PROFIT' : 'PROFIT', full: isRo ? 'Profitabilitate' : 'Profitability' },
    { key: 'capitalEfficiency', label: isRo ? 'CAPITAL' : 'CAPITAL', full: isRo ? 'Eficien\u021ba capitalului' : 'Capital efficiency' },
    { key: 'growth', label: isRo ? 'CRE\u0218TERE' : 'GROWTH', full: isRo ? 'Cre\u0219tere' : 'Growth' },
    { key: 'solvency', label: isRo ? 'SOLV' : 'SOLV', full: isRo ? 'Solvabilitate' : 'Solvency' },
    { key: 'freeCashFlow', label: 'FCF', full: isRo ? 'Flux de numerar liber' : 'Free cash flow' },
    { key: 'valuation', label: isRo ? 'PRE\u021a' : 'VALUE', full: isRo ? 'Evaluare' : 'Valuation' }
  ] as const;

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

            <div className="space-y-2.5 pt-3 border-t border-white/[0.06]">
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
          </>
        )}

        {assetClass === 'stocks' && stockScan && (
          <div className="space-y-2.5">
            <div>
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-emerald-300">{isRo ? 'Calitate top' : 'Top quality'}</h3>
              <p className="text-[10px] text-slate-500">{isRo ? 'Sortat dup\u0103 scorul pe 6 criterii: profitabilitate, eficien\u021ba capitalului, cre\u0219tere, solvabilitate, FCF, evaluare.' : 'Sorted by the 6-criteria score: profitability, capital efficiency, growth, solvency, FCF, valuation.'}</p>
            </div>
            {stockAssets.map((asset, index) => (
              <article
                key={asset.id}
                role="button"
                tabIndex={0}
                onClick={() => navigateAsset({ symbol: asset.symbol, marketClass: 'stocks' })}
                onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); navigateAsset({ symbol: asset.symbol, marketClass: 'stocks' }); } }}
                className="cursor-pointer rounded-xl border border-white/[0.07] bg-[var(--t-surface-raised)] p-3 sm:p-4 transition-colors hover:border-cyan-500/30"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`w-7 text-center text-sm font-mono font-black ${index < 3 ? 'text-emerald-300' : 'text-slate-500'}`}>{index + 1}</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-100">${asset.symbol}</span>
                        {asset.criteria.growth.status !== 'unknown' && (
                          <span className={`text-[10px] font-mono ${asset.criteria.growth.status === 'pass' ? 'text-emerald-300' : asset.criteria.growth.status === 'watch' ? 'text-amber-300' : 'text-rose-300'}`}>{asset.criteria.growth.value}</span>
                        )}
                      </div>
                      <span className="block text-[10px] text-slate-500 truncate">{asset.name}{asset.sector ? ` \u00b7 ${asset.sector}` : ''}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`text-lg font-mono font-black ${asset.passedCriteria >= 5 ? 'text-emerald-300' : asset.score >= 50 ? 'text-amber-300' : 'text-slate-400'}`}>{asset.score}</span>
                    <span className="text-[9px] text-slate-600"> / 100 \u00b7 {asset.passedCriteria}/6</span>
                    <span className="block text-[9px] font-mono text-cyan-300">{isRo ? asset.aiVerdictLabelRo : asset.aiVerdict}</span>
                  </div>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  {stockCriteriaItems(asset).map(item => {
                    const criterion = asset.criteria[item.key];
                    return (
                      <span key={item.key} title={`${item.full}: ${criterion.status} - ${criterion.explanation}`} className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[8px] font-bold tracking-wide ${stockChipTone(criterion.status)}`}>
                        {item.label}
                      </span>
                    );
                  })}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
                  {stockCriteriaItems(asset).map(item => {
                    const criterion = asset.criteria[item.key];
                    return (
                      <div key={item.key} className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-2.5">
                        <span className="block text-[9px] font-mono uppercase text-slate-600">{item.full}</span>
                        <span className="block mt-1 text-[11px] font-mono font-bold text-slate-100 truncate" title={criterion.explanation}>{criterion.value}</span>
                      </div>
                    );
                  })}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
