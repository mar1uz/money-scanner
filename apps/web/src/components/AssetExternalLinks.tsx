import React, { useEffect, useState } from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';
import { NarrativeTag } from './NarrativeTag.js';

// Manual fallback buttons on every coin page (Marius, 2026-09-23): TradingView,
// DefiLlama and "copy contract address", shown whether or not the in-app chart
// loads, so he can look a coin up on TradingView / DefiLlama / Dexscreener.

interface Props {
  symbol: string;
  marketClass?: string;
  coinGeckoId?: string;
  /** DefiLlama protocol slug(s) from the business-quality scan, when known. */
  protocolSlugs?: string[];
  /** Contract address already known (DEX fallback). */
  contractAddress?: string;
  language?: 'ro' | 'en';
  className?: string;
  /** Main narrative tag; crypto shows "Crypto" when unknown. */
  narrative?: string;
}

interface Identifier { value: string; kind: 'contract' | 'coingecko' | 'symbol'; chain?: string }

// CoinGecko metadata is fetched once per coin per page load.
const platformCache = new Map<string, Promise<{ address: string; chain: string } | null>>();

const loadContractFromCoinGecko = (id: string) => {
  let pending = platformCache.get(id);
  if (!pending) {
    pending = fetch(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false`)
      .then(res => (res.ok ? res.json() : null))
      .then((meta: any) => {
        if (!meta) return null;
        const entries = Object.entries(meta.platforms || {})
          .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim().length > 0);
        const preferred = entries.find(([chain]) => chain === meta.asset_platform_id) || entries[0];
        return preferred ? { chain: preferred[0], address: preferred[1].trim() } : null;
      })
      .catch(() => {
        platformCache.delete(id);
        return null;
      });
    platformCache.set(id, pending);
  }
  return pending;
};

export const tradingViewUrl = (symbol: string, marketClass?: string) => {
  const ticker = symbol.toUpperCase().replace(/[^A-Z0-9.]/g, '');
  return marketClass === 'crypto' || !marketClass
    ? `https://www.tradingview.com/symbols/${encodeURIComponent(`${ticker}USD`)}/`
    : `https://www.tradingview.com/symbols/${encodeURIComponent(ticker)}/`;
};

export const defiLlamaUrl = (symbol: string, protocolSlugs?: string[]) => {
  const slug = protocolSlugs?.find(Boolean);
  return slug
    ? `https://defillama.com/protocol/${encodeURIComponent(slug)}`
    : `https://defillama.com/token/${encodeURIComponent(symbol.toLowerCase())}`;
};

export const AssetExternalLinks: React.FC<Props> = ({ symbol, marketClass, coinGeckoId, protocolSlugs, contractAddress, language = 'ro', className = '', narrative }) => {
  const isRo = language === 'ro';
  const isCrypto = marketClass === 'crypto' || !marketClass;
  const [fetched, setFetched] = useState<{ address: string; chain: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setFetched(null);
    if (!isCrypto || contractAddress || !coinGeckoId) return;
    let alive = true;
    void loadContractFromCoinGecko(coinGeckoId).then(result => { if (alive) setFetched(result); });
    return () => { alive = false; };
  }, [coinGeckoId, contractAddress, isCrypto]);

  const identifier: Identifier = contractAddress
    ? { value: contractAddress, kind: 'contract' }
    : fetched
      ? { value: fetched.address, kind: 'contract', chain: fetched.chain }
      : coinGeckoId
        ? { value: coinGeckoId, kind: 'coingecko' }
        : { value: symbol.toUpperCase(), kind: 'symbol' };

  const copyLabel = identifier.kind === 'contract'
    ? (isRo ? 'Copiază adresa' : 'Copy address')
    : identifier.kind === 'coingecko'
      ? (isRo ? 'Copiază ID CoinGecko' : 'Copy CoinGecko ID')
      : (isRo ? 'Copiază ticker' : 'Copy ticker');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(identifier.value);
    } catch {
      const area = document.createElement('textarea');
      area.value = identifier.value;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const btn = 'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition-all whitespace-nowrap';
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {isCrypto && <NarrativeTag narrative={narrative} className="py-1.5 text-[11px]" />}
      <a href={tradingViewUrl(symbol, marketClass)} target="_blank" rel="noopener noreferrer" className={`${btn} border-blue-500/30 bg-blue-500/[0.08] text-blue-200 hover:bg-blue-500/[0.16]`}>
        TradingView <ExternalLink className="h-3 w-3" />
      </a>
      {isCrypto && (
        <a href={defiLlamaUrl(symbol, protocolSlugs)} target="_blank" rel="noopener noreferrer" className={`${btn} border-violet-500/30 bg-violet-500/[0.08] text-violet-200 hover:bg-violet-500/[0.16]`}>
          DefiLlama <ExternalLink className="h-3 w-3" />
        </a>
      )}
      {isCrypto && (
        <button type="button" onClick={() => void copy()} title={`${identifier.chain ? `${identifier.chain}: ` : ''}${identifier.value}`} className={`${btn} border-emerald-500/30 bg-emerald-500/[0.08] text-emerald-200 hover:bg-emerald-500/[0.16]`}>
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? (isRo ? 'Copiat' : 'Copied') : copyLabel}
          {identifier.kind === 'contract' && !copied && (
            <span className="font-mono text-[10px] font-normal text-emerald-300/70">{identifier.value.slice(0, 6)}…{identifier.value.slice(-4)}</span>
          )}
        </button>
      )}
    </div>
  );
};
