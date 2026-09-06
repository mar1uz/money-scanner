import type { RadarRow } from '@money-scanner/shared';

export type RadarSortKey =
  | 'rank'
  | 'name'
  | 'price'
  | 'priceChange24h'
  | 'firstPrice'
  | 'changeFirst'
  | 'changePrevious'
  | 'marketCap'
  | 'volume24h'
  | 'liquidity'
  | 'score';

export type RadarSortDirection = 'asc' | 'desc';

const value = (row: RadarRow, key: RadarSortKey): string | number | null => {
  if (key === 'name') return `${row.name}\u0000${row.chain}`.toLocaleLowerCase('ro');
  return row[key];
};

export function sortRadarRows(rows: RadarRow[], key: RadarSortKey, direction: RadarSortDirection): RadarRow[] {
  return [...rows].sort((a, b) => {
    const left = value(a, key);
    const right = value(b, key);
    if (left === null && right === null) return a.rank - b.rank;
    if (left === null) return 1;
    if (right === null) return -1;
    const compared = typeof left === 'string'
      ? left.localeCompare(String(right), 'ro', { sensitivity: 'base' })
      : left - Number(right);
    return (direction === 'asc' ? compared : -compared) || a.rank - b.rank;
  });
}
