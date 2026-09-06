import type { RadarSortKey } from './crypto-radar-sort.js';

export interface RadarHeaderDef {
  key: RadarSortKey;
  label: string;
  width: number;
}

export const RADAR_MAIN_HEADERS: RadarHeaderDef[] = [
  { key: 'rank', label: 'Loc', width: 60 },
  { key: 'name', label: 'Monedă / rețea', width: 200 },
  { key: 'price', label: 'Preț USD', width: 100 },
  { key: 'priceChange24h', label: 'Δ 24H', width: 90 },
  { key: 'firstPrice', label: 'Primul raport', width: 110 },
  { key: 'changeFirst', label: 'Δ inițial', width: 90 },
  { key: 'changePrevious', label: 'Δ precedent', width: 105 },
  { key: 'marketCap', label: 'Market cap', width: 105 },
  { key: 'volume24h', label: 'Volum 24h', width: 105 },
  { key: 'liquidity', label: 'Lichiditate', width: 105 },
  { key: 'top10HoldersPct', label: 'Securitate / Hold.', width: 135 },
  { key: 'score', label: 'Scor / social', width: 125 }
];

export const RADAR_MICRO_HEADERS: RadarHeaderDef[] = [
  { key: 'rank', label: 'Loc', width: 60 },
  { key: 'name', label: 'Monedă / rețea', width: 200 },
  { key: 'price', label: 'Preț USD', width: 100 },
  { key: 'priceChange24h', label: 'Δ 24H', width: 90 },
  { key: 'marketCap', label: 'Market cap', width: 105 },
  { key: 'volume24h', label: 'Volum 24h', width: 105 },
  { key: 'estimatedFees24h', label: 'Comisioane 24h', width: 120 },
  { key: 'liquidity', label: 'Lichiditate', width: 105 },
  { key: 'top10HoldersPct', label: 'Securitate / Hold.', width: 135 },
  { key: 'score', label: 'Scor / utilitate', width: 145 }
];

export function getRadarTableMinWidth(headers: RadarHeaderDef[]): number {
  return headers.reduce((sum, h) => sum + h.width, 0);
}
