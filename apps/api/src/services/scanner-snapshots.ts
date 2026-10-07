import type { AssetScannerRow } from '@money-scanner/shared';

/**
 * Per-instance results shared by the scheduled scan and dashboard readers.
 *
 * `maxAgeMs` bounds how long a completed scan is served to readers. It is set
 * just under the production cache-warmer cadence so the scheduled scan always
 * refreshes the snapshot first and a dashboard reader reuses that result instead
 * of triggering a second full-universe computation. Rows carry the real
 * `lastUpdated` timestamp of their scan, so freshness stays visible either way.
 */
export class ScannerSnapshots {
  private readonly completed = new Map<string, { rows: AssetScannerRow[]; completedAt: number }>();
  private readonly running = new Map<string, Promise<AssetScannerRow[]>>();

  constructor(
    private readonly now = Date.now,
    private readonly maxEntries = 64,
    private readonly maxAgeMs = 165_000
  ) {}

  async read(key: string, scan: () => Promise<AssetScannerRow[]>): Promise<AssetScannerRow[]> {
    const snapshot = this.completed.get(key);
    if (snapshot && this.now() - snapshot.completedAt < this.maxAgeMs) {
      return [...snapshot.rows];
    }
    return this.refresh(key, scan);
  }

  // Scheduled/manual refreshes always run, even if the previous result is fresh.
  // An already running scan for the same scope can satisfy concurrent callers.
  async refresh(key: string, scan: () => Promise<AssetScannerRow[]>): Promise<AssetScannerRow[]> {
    let pending = this.running.get(key);
    if (!pending) {
      pending = Promise.resolve().then(scan).then(rows => {
        // Do not cache an empty result after a transient provider outage.
        if (rows.length) {
          this.completed.delete(key);
          this.completed.set(key, { rows: [...rows], completedAt: this.now() });
          while (this.completed.size > this.maxEntries) {
            this.completed.delete(this.completed.keys().next().value!);
          }
        }
        return rows;
      }).finally(() => { this.running.delete(key); });
      this.running.set(key, pending);
    }
    // Route-level sorting must not mutate the stored order for other readers.
    return [...await pending];
  }
}
