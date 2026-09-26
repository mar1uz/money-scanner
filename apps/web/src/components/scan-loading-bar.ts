export type ScanBarMode = 'determinate' | 'elapsed-only' | 'indeterminate';

export interface ScanBarState {
  mode: ScanBarMode;
  /** Real scanned/total percent. Null when a percent must not be shown. */
  percent: number | null;
  scanned: number | null;
  total: number | null;
}

/** Determinate only when the caller passed a finite scanned count and a total > 0. */
export function scanBarState(scanned?: number, total?: number): ScanBarState {
  const fractionProvided = scanned !== undefined || total !== undefined;
  if (!fractionProvided) return { mode: 'indeterminate', percent: null, scanned: null, total: null };
  if (
    typeof scanned === 'number' &&
    typeof total === 'number' &&
    Number.isFinite(scanned) &&
    Number.isFinite(total) &&
    total > 0 &&
    scanned >= 0
  ) {
    return { mode: 'determinate', percent: (scanned / total) * 100, scanned, total };
  }
  return { mode: 'elapsed-only', percent: null, scanned: null, total: null };
}

/** Width of the fill. 0 scanned is 0, never a fake minimum. Capped at the track. */
export function scanBarWidthPercent(percent: number | null): number {
  if (percent === null || !Number.isFinite(percent) || percent <= 0) return 0;
  return Math.min(100, percent);
}

export function formatScanBarLabel(state: ScanBarState, elapsedSeconds: number): string {
  if (state.mode === 'determinate' && state.scanned !== null && state.total !== null) {
    return `${state.scanned}/${state.total}`;
  }
  const seconds = Math.max(0, Math.floor(elapsedSeconds));
  if (state.mode === 'elapsed-only') return `${seconds}s`;
  return `Se încarcă… · ${seconds}s`;
}
