import type { CryptoBubbleAsset } from '../services/api.js';

export const validChange = (change: number | null): change is number =>
  typeof change === 'number' && Number.isFinite(change);

export const rankCryptoBubbles = (coins: CryptoBubbleAsset[]): CryptoBubbleAsset[] =>
  [...coins].sort((a, b) => {
    if (!validChange(a.change)) return validChange(b.change) ? 1 : a.id.localeCompare(b.id);
    if (!validChange(b.change)) return -1;
    return b.change - a.change || a.id.localeCompare(b.id);
  }).slice(0, 100);

export interface BubblePlacement {
  coin: CryptoBubbleAsset;
  x: number;
  y: number;
  size: number;
}

// A readable baseline area plus an area proportional to positive 24h gain.
// Negative/missing changes stay small: a large loss must not look like a winner.
export const createGrowthBubbleLayout = (coins: CryptoBubbleAsset[], width: number) => {
  if (!coins.length || width <= 0) return { placements: [] as BubblePlacement[], height: 520 };
  const gap = 5;
  const minimumSize = Math.max(1, Math.min(width - gap * 2, width < 560 ? 60 : 66));
  const maximumSize = Math.max(1, Math.min(width - gap * 2, width < 560 ? 146 : 190));
  const ordered = rankCryptoBubbles(coins);
  const maxGain = Math.max(1, ...ordered.map(coin => validChange(coin.change) ? coin.change : 0));
  const weights = ordered.map(coin => validChange(coin.change) ? Math.max(0, coin.change) / maxGain : 0);
  let height = width < 560 ? 1600 : width < 900 ? 1000 : 760;
  const baselineArea = ordered.length * minimumSize ** 2;
  height = Math.max(height, Math.ceil(baselineArea / (width * 0.35)));
  const gainArea = Math.min(maximumSize ** 2 - minimumSize ** 2,
    Math.max(0, width * height * 0.5 - baselineArea) / Math.max(1, weights.reduce((a, b) => a + b, 0)));
  const sizes = weights.map(weight => Math.sqrt(minimumSize ** 2 + gainArea * weight));
  height = Math.max(height, Math.ceil(sizes.reduce((sum, size) => sum + (size + gap) ** 2, 0) / (width * 0.5)));

  // Retry with more room, never shrink individual coins or silently omit them.
  for (let pass = 0; pass < 6; pass += 1) {
    const placements: BubblePlacement[] = [];
    let seed = 246813579;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let index = 0; index < ordered.length; index += 1) {
      const size = sizes[index];
      const radius = size / 2;
      for (let attempt = 0; attempt < 1200; attempt += 1) {
        const x = radius + gap + random() * Math.max(0, width - size - gap * 2);
        const y = radius + gap + random() * Math.max(0, height - size - gap * 2);
        if (placements.every(other => Math.hypot(x - other.x, y - other.y) >= radius + other.size / 2 + gap)) {
          placements.push({ coin: ordered[index], x, y, size });
          break;
        }
      }
      if (placements.length !== index + 1) break;
    }
    if (placements.length === ordered.length) return { placements, height };
    height = Math.ceil(height * 1.2);
  }

  // Deterministic shelf fallback guarantees completeness even in narrow embeds.
  const placements: BubblePlacement[] = [];
  let x = gap;
  let y = gap;
  let rowHeight = 0;
  ordered.forEach((coin, index) => {
    const size = sizes[index];
    if (x + size + gap > width && x > gap) {
      x = gap;
      y += rowHeight + gap;
      rowHeight = 0;
    }
    placements.push({ coin, x: x + size / 2, y: y + size / 2, size });
    x += size + gap;
    rowHeight = Math.max(rowHeight, size);
  });
  return { placements, height: y + rowHeight + gap };
};
