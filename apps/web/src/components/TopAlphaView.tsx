import { midrankPercentile } from '@money-scanner/shared';
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
              <span translate="no" className="text-sm font-bold text-slate-100">${asset.symbol}</span>
              {asset.criteria.growth.status !== 'unknown' && (
                <span className={`text-[10px] font-mono ${asset.criteria.growth.status === 'pass' ? 'text-emerald-300' : asset.criteria.growth.status === 'watch' ? 'text-amber-300' : 'text-rose-300'}`}>{asset.criteria.growth.value}</span>
              )}
            </div>
            <span className="block text-[10px] text-slate-500 truncate"><bdi translate="no">{asset.name}</bdi> · MC {fmtUsd(asset.marketCap)}{asset.sector ? ` · ${asset.sector}` : ''}</span>
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
  const [loadingByClass, setLoadingByClass] = useState({ crypto: true, stocks: false });
  const [errorsByClass, setErrorsByClass] = useState<Record<'crypto' | 'stocks', string | null>>({ crypto: null, stocks: null });
  const loading = loadingByClass[assetClass];
  const error = errorsByClass[assetClass];

  const load = async (target: 'crypto' | 'stocks', refresh = false) => {
    setLoadingByClass(current => ({ ...current, [target]: true }));
    setErrorsByClass(current => ({ ...current, [target]: null }));
    try {
      if (target === 'crypto') setCryptoScan(await fetchCryptoFourCriteriaScan(refresh));
      else setStockScan(await fetchStockBusinessQualityScan(refresh));
    } catch (cause) {
      setErrorsByClass(current => ({ ...current, [target]: cause instanceof Error ? cause.message : 'Scan failed' }));
    } finally {
      setLoadingByClass(current => ({ ...current, [target]: false }));
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
  const topScoreAssets = (cryptoScan?.assets || []).filter(isMeasured);
  const undervaluedRows = (cryptoScan?.undervalued || [])
    .flatMap(entry => {
      const asset = cryptoAssetsById.get(entry.assetId);
      return asset ? [{ entry, asset }] : [];
    });
  const stockAssets = (stockScan?.assets || []);

  // Stocks undervalued (Marius, 2026-09-22): same model as crypto -
  // quality percentile minus expensiveness percentile of log(valuation
  // ratio). Ratio = P/FCF, fallback P/E, then P/S. Assets without a
  // usable ratio are not ranked (same honesty rule as crypto).
  const stockUndervalued = useMemo<StockUndervaluedRow[]>(() => {
    if (!stockScan) return [];
    const rows = stockScan.assets.flatMap(asset => {
      const m = asset.metrics || {};
      const positive = (value?: number) => value !== undefined && Number.isFinite(value) && value > 0;
      const ratio = positive(m.priceToFcf)
        ? { ratio: m.priceToFcf!, basis: 'P/FCF' }
        : positive(m.trailingPE)
          ? { ratio: m.trailingPE!, basis: 'P/E' }
          : positive(m.priceToSales)
            ? { ratio: m.priceToSales!, basis: 'P/S' }
            : null;
      return ratio ? [{ asset, ...ratio }] : [];
    });
    if (rows.length < 5) return [];
    return rows
      .map(r => {
        const peers = rows.filter(peer => peer.basis === r.basis);
        return { ...r, index: Math.round(midrankPercentile(peers.map(peer => peer.asset.score), r.asset.score))
          - Math.round(midrankPercentile(peers.map(peer => peer.ratio), r.ratio)) };
      })
      .sort((a, b) => b.asset.passedCriteria - a.asset.passedCriteria || b.index - a.index);
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
                  ? 'Scoruri Business Quality și evaluare relativă; nu reprezintă valoarea justă a monedei.'
                  : 'Business Quality scores and relative valuation; neither estimates fair value.'}
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

        {loading && !(assetClass === 'crypto' ? cryptoScan : stockScan) && <p className="py-8 text-center text-xs text-slate-500">{isRo ? 'Se \u00eencarc\u0103 clasamentele\u2026' : 'Loading leaderboards\u2026'}</p>}
        {error && (
          <div className="py-6 text-center space-y-2">
            <p className="text-sm text-rose-300">{error}</p>
            <button onClick={() => void load(assetClass, true)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 py-1.5 text-[10px] text-slate-300">
              <RefreshCw className="w-3 h-3" /> {isRo ? 'Re\u00eencearc\u0103' : 'Retry'}
            </button>
          </div>
        )}

        {(assetClass === 'crypto' ? cryptoScan : stockScan) && (
          <div className="rounded-xl border border-white/[0.08] p-3 text-[11px] text-slate-400 space-y-2">
            <p>{isRo ? 'Scanare' : 'Snapshot'}: {new Date((assetClass === 'crypto' ? cryptoScan! : stockScan!).generatedAt).toLocaleString(isRo ? 'ro-RO' : 'en-GB')} · {isRo ? 'Date păstrate până la 26h; Rescanează cere o actualizare (minimum 2 minute între cereri).' : 'Cached up to 26h; Rescan requests an update (minimum 2 minutes between requests).'}</p>
            {assetClass === 'crypto' && <>
              <p>{isRo ? 'Fees = comisioane totale; revenue = partea reținută de protocol; holderi = partea destinată deținătorilor. FEES/REV % compară media zilnică 7z cu media 30z, nu prețul.' : 'Fees = total user fees; revenue = protocol share; holders = tokenholder share. FEES/REV % compares 7d and 30d daily averages, not price.'}</p>
              <p>{isRo ? 'Scor intern: 25 puncte/pass, 12/watch, 0/fail sau necunoscut. Indicele compară doar aceeași bază P/R, P/F sau P/H; +80 nu înseamnă 80% subevaluare.' : 'Internal score: 25 points/pass, 12/watch, 0/fail or unknown. The index compares the same basis P/R, P/F or P/H; +80 does not mean 80% undervalued.'}</p>
              <a className="inline-block underline" href="https://defillama.com/data-definitions" target="_blank" rel="noreferrer">{isRo ? 'Definiții și metodologie DefiLlama' : 'DefiLlama definitions and methodology'}</a>
            </>}
          </div>
        )}

        {assetClass === 'crypto' && cryptoScan && (
          <>
            {ranking === 'score' && (
            <div className="space-y-2.5">
              <div>
                <h3 className="text-[11px] font-bold uppercase tracking-wide text-emerald-300">{isRo ? 'Scor top' : 'Top score'} · {topScoreAssets.length}</h3>
                <p className="text-[10px] text-slate-500">{isRo ? 'Calitate + accelera\u021bie, f\u0103r\u0103 s\u0103 se uite la pre\u021b. Sortat după criterii trecute, apoi revenue absolut pe 30z (log), apoi ritm de creștere.' : 'Quality + acceleration, price ignored. Sorted by criteria passed, then absolute 30d revenue (log), then growth pace.'}</p>
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
                <h3 className="text-[11px] font-bold uppercase tracking-wide text-amber-300">{isRo ? 'Subevaluate' : 'Undervalued'} · {undervaluedRows.length}</h3>
                <p className="text-[10px] text-slate-500">{isRo ? 'Mai întâi criteriile trecute (4/4, apoi 3/4, 2/4); în grupă: percentila calității minus percentila multiplului în aceeași grupă P/R, P/F sau P/H. Clasament relativ, nu preț țintă.' : 'Criteria passed first (4/4, then 3/4, 2/4); within each group: quality percentile minus valuation percentile within the same P/R, P/F or P/H group. Relative ranking, not a price target.'}</p>
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
                <h3 className="text-[11px] font-bold uppercase tracking-wide text-emerald-300">{isRo ? 'Scor top' : 'Top score'} · {stockAssets.length}</h3>
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
                <h3 className="text-[11px] font-bold uppercase tracking-wide text-amber-300">{isRo ? 'Subevaluate' : 'Undervalued'} · {stockUndervalued.length}</h3>
                <p className="text-[10px] text-slate-500">{isRo ? 'Mai întâi criteriile trecute, apoi indicele relativ în fiecare grupă P/FCF, P/E sau P/S. Bazele diferite nu se compară direct. Acțiunile fără multiplu utilizabil nu sunt clasate.' : 'Criteria passed first, then the relative index within each P/FCF, P/E or P/S group. Different denominators are not compared directly. Stocks without a usable multiple are not ranked.'}</p>
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
