import { AssetMarketClass, Timeframe } from '@money-scanner/shared';

export const DEFAULT_MONEY_SCANNER_URL = 'https://scanner.relayhub.no';

/** Public dashboard URL: env override, then the public hostname. */
export const resolvePublicBaseUrl = (): string =>
  process.env.PUBLIC_BASE_URL || process.env.DASHBOARD_BASE_URL || DEFAULT_MONEY_SCANNER_URL;

export interface MoneyLineAssetLinkOptions {
  baseUrl?: string;
  symbol: string;
  timeframe?: Timeframe;
  marketClass?: AssetMarketClass;
  coinGeckoId?: string;
}

/** Builds the SPA deep link understood by the authenticated Money Line view. */
export const buildMoneyLineAssetUrl = ({
  baseUrl = resolvePublicBaseUrl(),
  symbol,
  timeframe,
  marketClass,
  coinGeckoId
}: MoneyLineAssetLinkOptions) => {
  const url = new URL(baseUrl);
  url.searchParams.set('asset', symbol.replace(/^[$#]/, '').trim().toUpperCase());
  if (timeframe) url.searchParams.set('timeframe', timeframe);
  if (marketClass) url.searchParams.set('marketClass', marketClass);
  if (coinGeckoId) url.searchParams.set('coinGeckoId', coinGeckoId);
  return url.toString();
};

/** Telegram Markdown link whose visible ticker opens the matching Money Line chart. */
export const telegramAssetLink = (options: MoneyLineAssetLinkOptions) => {
  const symbol = options.symbol.replace(/^[$#]/, '').trim().toUpperCase();
  return `[$${symbol}](${buildMoneyLineAssetUrl({ ...options, symbol })})`;
};
