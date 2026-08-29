import React, { createContext, useCallback, useContext } from 'react';
import { AssetMarketClass, Timeframe, TRADING_360_ASSETS } from '../types.js';

export interface AssetNavigationTarget {
  symbol: string;
  marketClass?: AssetMarketClass;
  timeframe?: Timeframe;
  coinGeckoId?: string;
}

type AssetNavigator = (target: AssetNavigationTarget) => void;

const AssetNavigationContext = createContext<AssetNavigator | null>(null);

export const AssetNavigationProvider: React.FC<{
  onOpenAsset: AssetNavigator;
  children: React.ReactNode;
}> = ({ onOpenAsset, children }) => (
  <AssetNavigationContext.Provider value={onOpenAsset}>
    {children}
  </AssetNavigationContext.Provider>
);

export const useAssetNavigation = () => {
  const navigate = useContext(AssetNavigationContext);
  if (!navigate) throw new Error('Asset navigation is not available outside AssetNavigationProvider.');
  return navigate;
};

export const useDelegatedAssetNavigation = () => {
  const navigate = useAssetNavigation();
  return useCallback((event: React.MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement | null;
    const assetElement = target?.closest<HTMLElement>('[data-asset-symbol]');
    if (!assetElement) return;
    event.preventDefault();
    event.stopPropagation();
    const marketClass = assetElement.dataset.assetMarketClass as AssetMarketClass | undefined;
    const timeframe = assetElement.dataset.assetTimeframe as Timeframe | undefined;
    navigate({
      symbol: assetElement.dataset.assetSymbol || '',
      marketClass,
      timeframe,
      coinGeckoId: assetElement.dataset.coingeckoId
    });
  }, [navigate]);
};

export const AssetLink: React.FC<{
  symbol: string;
  marketClass?: AssetMarketClass;
  timeframe?: Timeframe;
  coinGeckoId?: string;
  className?: string;
  title?: string;
  children?: React.ReactNode;
  onBeforeNavigate?: () => void;
}> = ({
  symbol,
  marketClass,
  timeframe,
  coinGeckoId,
  className = '',
  title,
  children,
  onBeforeNavigate
}) => {
  const navigate = useAssetNavigation();
  return (
    <button
      type="button"
      onClick={event => {
        event.stopPropagation();
        onBeforeNavigate?.();
        navigate({ symbol, marketClass, timeframe, coinGeckoId });
      }}
      title={title || `Deschide ${symbol} în graficul Money Line`}
      className={`cursor-pointer transition-colors hover:text-cyan-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/70 ${className}`}
    >
      {children ?? `$${symbol}`}
    </button>
  );
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const catalogBySymbol = new Map(TRADING_360_ASSETS.map(asset => [asset.symbol.toUpperCase(), asset]));

/** Links explicit asset mentions inside prose without turning ordinary words into tickers. */
export const AssetMentionText: React.FC<{
  text: string;
  symbols: string[];
  marketClass?: AssetMarketClass;
  className?: string;
}> = ({ text, symbols, marketClass, className = '' }) => {
  const targets = Array.from(new Set(symbols.map(symbol => symbol.replace(/^\$/, '').toUpperCase()).filter(Boolean)));
  if (!targets.length) return <span className={className}>{text}</span>;
  const variants = targets.flatMap(symbol => {
    const name = catalogBySymbol.get(symbol)?.name;
    return [`$${symbol}`, symbol, ...(name && name.length >= 3 ? [name] : [])];
  }).sort((left, right) => right.length - left.length);
  const matcher = new RegExp(`(?<![A-Za-z0-9])(${variants.map(escapeRegExp).join('|')})(?![A-Za-z0-9])`, 'gi');
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(matcher)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push(text.slice(cursor, index));
    const raw = match[0];
    const normalized = raw.replace(/^\$/, '').toUpperCase();
    const byName = targets.find(symbol => catalogBySymbol.get(symbol)?.name.toUpperCase() === raw.toUpperCase());
    const resolvedSymbol = raw.startsWith('$') || raw === raw.toUpperCase() ? normalized : byName;
    if (resolvedSymbol && targets.includes(resolvedSymbol)) {
      parts.push(
        <AssetLink key={`${index}:${resolvedSymbol}`} symbol={resolvedSymbol} marketClass={marketClass} className="inline font-inherit text-cyan-300 underline decoration-cyan-500/25 underline-offset-2">
          {raw}
        </AssetLink>
      );
    } else {
      parts.push(raw);
    }
    cursor = index + raw.length;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <span className={className}>{parts}</span>;
};
