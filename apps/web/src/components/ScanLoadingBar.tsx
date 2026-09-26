import React, { useEffect, useState } from 'react';
import { formatScanBarLabel, scanBarState, scanBarWidthPercent } from './scan-loading-bar.js';

export const ScanLoadingBar: React.FC<{
  active: boolean;
  /** Passed together with total only when the payload already carries a count. */
  scanned?: number;
  total?: number;
  className?: string;
}> = ({ active, scanned, total, className }) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!active) {
      setElapsed(0);
      return;
    }
    const started = Date.now();
    setElapsed(0);
    const id = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [active]);

  if (!active) return null;

  const state = scanBarState(scanned, total);
  const label = formatScanBarLabel(state, elapsed);
  const width = scanBarWidthPercent(state.percent);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      className={`shrink-0 ${className ?? ''}`.trim()}
    >
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--t-surface-raised)]">
        {state.mode === 'determinate' ? (
          <div className="h-full rounded-full bg-cyan-400 transition-[width] duration-300" style={{ width: `${width}%` }} />
        ) : null}
      </div>
      <p className="mt-1 font-mono text-[10px] tabular-nums text-slate-400">{label}</p>
    </div>
  );
};
