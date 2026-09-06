import type { RadarChain } from '../types/radar.js';

// Chain + contract identifies the asset even when symbols collide or pools change.
// Token-address routes are supported by DEX Screener and work for historical exits too.
export function radarTokenChartUrl(token: { chain: RadarChain; address: string }): string {
  return `https://dexscreener.com/${encodeURIComponent(token.chain)}/${encodeURIComponent(token.address)}`;
}
