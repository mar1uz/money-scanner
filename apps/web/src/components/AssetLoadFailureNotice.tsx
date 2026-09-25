import React from 'react';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { AssetExternalLinks } from './AssetExternalLinks.js';
import type { Language } from '../i18n.js';

// ---------------------------------------------------------------------------
// Failure semantics for GET /api/assets/:symbol
//
// The route answers 503 only when the identity gate refuses the coin
// (fail-closed: "Verified exchange candles unavailable for the selected
// coin."). That is a deliberate policy answer, not an outage, and the page must
// say so. Real incidents keep their own wording, so a user can always tell
// "this coin has no verified market" from "the platform is broken" and from
// "your connection dropped".
// ---------------------------------------------------------------------------

export type AssetLoadFailureKind = 'no-verified-market' | 'server-error' | 'request-rejected' | 'network';

export interface AssetLoadFailure {
  kind: AssetLoadFailureKind;
  status?: number;
}

/**
 * Classifies a fetchAssetDetail rejection. fetchAssetDetail rejects with
 * `HTTP <status>: ...`, so the status carried by the error message is the only
 * signal available here; anything without a status never reached the server.
 */
export const classifyAssetLoadFailure = (error: unknown): AssetLoadFailure => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const status = Number(message.match(/\bHTTP (\d{3})\b/)?.[1] ?? Number.NaN);
  if (status === 503) return { kind: 'no-verified-market', status };
  if (Number.isFinite(status)) return { kind: status >= 500 ? 'server-error' : 'request-rejected', status };
  return { kind: 'network' };
};

export interface AssetLoadFailureCopy {
  /** 'refusal' = deliberate fail-closed answer, 'incident' = real failure. */
  tone: 'refusal' | 'incident';
  pill?: string;
  title: string;
  body: string;
  hint?: string;
}

/**
 * User-facing copy for a failed asset page, in both languages (kept next to the
 * notice that renders it so the wording cannot drift from the state it
 * describes). The identity refusal never reads as a temporary outage; network
 * and server failures always say what actually broke.
 */
export const buildAssetLoadFailureCopy = (
  failure: AssetLoadFailure | null,
  context: { language: Language; symbol: string; isCrypto: boolean }
): AssetLoadFailureCopy => {
  const { language, symbol, isCrypto } = context;
  const ticker = `$${symbol}`;
  const statusSuffix = failure?.status ? ` (HTTP ${failure.status})` : '';

  if (failure?.kind === 'no-verified-market') {
    if (isCrypto) {
      return language === 'en'
        ? {
          tone: 'refusal',
          pill: 'Identity check refused',
          title: `${ticker} · no verified market for real candles`,
          body: `We could not confirm this coin's identity on the verified exchanges (Binance, Bybit, OKX, MEXC, Hyperliquid), so we have no real candles for it and do not show Money Line signals that could belong to a different asset. This is not a temporary network outage.`,
          hint: 'Check the real listing through the external sources below.'
        }
        : {
          tone: 'refusal',
          pill: 'Verificare de identitate respinsă',
          title: `${ticker} · fără piață verificată pentru lumânări reale`,
          body: `Nu am putut confirma identitatea monedei pe bursele verificate (Binance, Bybit, OKX, MEXC, Hyperliquid), așa că nu avem lumânări reale pentru ea și nu afișăm semnale Money Line care ar putea aparține altui activ. Nu este o pană temporară de rețea.`,
          hint: 'Verifică listarea reală prin sursele externe de mai jos.'
        };
    }
    return language === 'en'
      ? {
        tone: 'refusal',
        title: `${ticker} · no verified market data`,
        body: 'The server refuses to serve unverified market data for this asset. This is not a temporary network outage.'
      }
      : {
        tone: 'refusal',
        title: `${ticker} · fără date de piață verificate`,
        body: 'Serverul refuză să servească date de piață neverificate pentru acest activ. Nu este o pană temporară de rețea.'
      };
  }

  if (failure?.kind === 'network') {
    return language === 'en'
      ? {
        tone: 'incident',
        title: `${ticker} · connection interrupted`,
        body: 'The request to the server failed at the network level — no response or timeout. No data was loaded; check your connection and try again.'
      }
      : {
        tone: 'incident',
        title: `${ticker} · conexiune întreruptă`,
        body: 'Cererea către server a eșuat la nivel de rețea — fără răspuns sau timeout. Datele nu au fost încărcate; verifică conexiunea și reîncearcă.'
      };
  }

  if (failure?.kind === 'server-error') {
    return language === 'en'
      ? {
        tone: 'incident',
        title: `${ticker} · internal server error${statusSuffix}`,
        body: 'The server returned an internal error for this request. No data was loaded; try again in a moment.'
      }
      : {
        tone: 'incident',
        title: `${ticker} · eroare internă de server${statusSuffix}`,
        body: 'Serverul a răspuns cu o eroare internă la această cerere. Datele nu au fost încărcate; reîncearcă în câteva momente.'
      };
  }

  if (failure?.kind === 'request-rejected') {
    return language === 'en'
      ? {
        tone: 'incident',
        title: `${ticker} · request rejected${statusSuffix}`,
        body: 'The server rejected the request for this asset. Check your session (sign-in) and try again.'
      }
      : {
        tone: 'incident',
        title: `${ticker} · cerere refuzată${statusSuffix}`,
        body: 'Serverul a respins cererea pentru acest activ. Verifică sesiunea (autentificarea) și reîncearcă.'
      };
  }

  return language === 'en'
    ? {
      tone: 'incident',
      title: `${ticker} · data unavailable`,
      body: 'We could not load the data for this asset. Try again.'
    }
    : {
      tone: 'incident',
      title: `${ticker} · date indisponibile`,
      body: 'Nu am putut încărca datele pentru acest activ. Reîncearcă.'
    };
};

/**
 * Asset page state for "the detail call failed": the refusal keeps the amber
 * shield (a deliberate answer, not an incident), real failures use the rose
 * warning triangle. Wording comes from buildAssetLoadFailureCopy, so this view
 * can never render a generic outage message for a refused identity.
 */
export const AssetLoadFailureNotice: React.FC<{
  failure: AssetLoadFailure | null;
  symbol: string;
  marketClass?: string;
  coinGeckoId?: string;
  coinPaprikaId?: string;
  language: Language;
  onBack: () => void;
  onRetry: () => void;
}> = ({ failure, symbol, marketClass, coinGeckoId, coinPaprikaId, language, onBack, onRetry }) => {
  const copy = buildAssetLoadFailureCopy(failure, {
    language,
    symbol,
    isCrypto: marketClass === 'crypto' || Boolean(coinGeckoId) || Boolean(coinPaprikaId)
  });

  return (
    <div className="p-6 sm:p-12 text-center font-mono space-y-4">
      {copy.tone === 'refusal'
        ? <ShieldAlert className="w-9 h-9 mx-auto text-amber-300" />
        : <AlertTriangle className="w-9 h-9 mx-auto text-rose-300" />}
      <div className="max-w-2xl mx-auto space-y-3">
        <div>
          <h2 className="text-base font-bold text-slate-100">{copy.title}</h2>
          <p className="mt-2 text-sm text-slate-400">{copy.body}</p>
        </div>
        {copy.pill && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-amber-500/30 bg-amber-500/10 text-[11px] font-bold text-amber-200">
            {copy.pill}
          </span>
        )}
        {copy.hint && (
          <p className="text-xs text-slate-500">{copy.hint}</p>
        )}
      </div>
      <AssetExternalLinks className="justify-center" symbol={symbol} marketClass={marketClass} coinGeckoId={coinGeckoId} language={language} />
      <div className="flex items-center justify-center gap-3">
        <button onClick={onBack} className="px-4 py-2 rounded-xl border border-white/[0.08] text-slate-300 hover:bg-white/[0.04]">
          Înapoi
        </button>
        <button onClick={onRetry} className="px-4 py-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20">
          Reîncearcă
        </button>
      </div>
    </div>
  );
};
