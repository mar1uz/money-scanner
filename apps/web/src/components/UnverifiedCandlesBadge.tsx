import React from 'react';
import { Info } from 'lucide-react';
import type { Language } from '../i18n.js';

/**
 * Discreet page-level marker for the price-only aggregator response
 * (dataAvailability: 'aggregated-price-only'): the quote is real (CoinGecko /
 * CoinPaprika), but there are no verified exchange OHLCV candles, so Money Line
 * and flips are deliberately absent. The label states the actual reason the
 * Money Line is missing instead of leaving the user to guess, and it must not
 * read as an outage.
 *
 * The RO/EN pair lives here next to the label it renders (same `language`
 * mechanism the asset page uses for its own bilingual strings) so the wording
 * ships with the marker. Uses the pill styling already used for asset badges.
 */
export const UnverifiedCandlesBadge: React.FC<{ language: Language }> = ({ language }) => {
  const label = language === 'en' ? 'Indexed · no verified candles' : 'Indexat · fără lumânări verificate';
  const detail = language === 'en'
    ? 'Real aggregated price (CoinGecko / CoinPaprika), no exchange-verified candles — that is why Money Line and flips are missing. This is not a data outage.'
    : 'Preț real din agregator (CoinGecko / CoinPaprika), fără lumânări verificate de bursă — de aceea Money Line și flipurile lipsesc. Nu este o pană de date.';

  return (
    <div className="flex flex-wrap items-center gap-2 font-mono" title={detail}>
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-amber-500/25 bg-amber-500/[0.08] text-[11px] font-bold text-amber-200">
        <Info className="w-3 h-3" />
        {label}
      </span>
      <span className="text-[11px] text-slate-500">{detail}</span>
    </div>
  );
};
