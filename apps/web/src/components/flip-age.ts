/** Compact flip age for the asset toolbar. Long form stays in the tooltip. */
export const formatFlipAgeShort = (ts?: number, now = Date.now()): string => {
  if (!ts) return 'Confirmat recent';
  const diff = Math.max(0, now - ts);
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'Chiar acum';
  if (mins < 60) return `acum ${mins} minute`;
  if (hours < 24) return `acum ${hours}h`;
  const remHours = hours % 24;
  return remHours > 0 ? `acum ${days}z ${remHours}h` : `acum ${days}z`;
};
