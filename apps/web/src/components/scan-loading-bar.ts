export type ScanBarMode = 'determinate' | 'elapsed-only' | 'indeterminate';

export interface ScanBarState {
  mode: ScanBarMode;
  /** Real scanned/total percent. Null when a percent must not be shown. */
  percent: number | null;
}

/** Determinate only when the caller passed a finite scanned count and a total > 0. */
export function scanBarState(scanned?: number, total?: number): ScanBarState {
  const fractionProvided = scanned !== undefined || total !== undefined;
  if (!fractionProvided) return { mode: 'indeterminate', percent: null };
  if (
    typeof scanned === 'number' &&
    typeof total === 'number' &&
    Number.isFinite(scanned) &&
    Number.isFinite(total) &&
    total > 0 &&
    scanned >= 0
  ) {
    return { mode: 'determinate', percent: (scanned / total) * 100 };
  }
  return { mode: 'elapsed-only', percent: null };
}

/** Width of the fill. 0 scanned is 0, never a fake minimum. Capped at the track. */
export function scanBarWidthPercent(percent: number | null): number {
  if (percent === null || !Number.isFinite(percent) || percent <= 0) return 0;
  return Math.min(100, percent);
}

export function formatScanPercent(percent: number): string {
  if (!Number.isFinite(percent) || percent <= 0) return '0%';
  const rounded = Math.round(percent);
  if (rounded === 0) {
    const one = percent.toFixed(1);
    return one === '0.0' ? `${percent.toFixed(2)}%` : `${one}%`;
  }
  return `${rounded}%`;
}

export function formatScanBarLabel(state: ScanBarState, elapsedSeconds: number): string {
  const seconds = Math.max(0, Math.floor(elapsedSeconds));
  if (state.mode === 'determinate' && state.percent !== null) {
    return `${formatScanPercent(state.percent)} · ${seconds}s`;
  }
  if (state.mode === 'elapsed-only') return `${seconds}s`;
  return `Se încarcă… · ${seconds}s`;
}
