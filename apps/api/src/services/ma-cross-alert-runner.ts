import { randomUUID } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { AssetInfo } from '@money-scanner/shared';
import { MarketDataService } from '@money-scanner/market-data';
import { MoneyLineEngine } from '@money-scanner/money-line';
import { TelegramBotHandler, telegramAssetLink } from '@money-scanner/notifications';
import {
  BtcRegime,
  MA_CROSS_RULE_ID,
  MA_CROSS_RULE_VERSION,
  MIN_MARKET_CAP,
  MaAlertEvent,
  computeBtcRegime,
  evaluateMaCross,
  formatBtcRegime
} from './ma-cross-alert-service.js';

const DAY_MS = 86_400_000;
const MAX_PART_LENGTH = 3_500;
const LOCK_TTL_MS = 20 * 60_000;
const RETENTION_MS = 90 * DAY_MS;
const STABLE_SYMBOLS = new Set(['USDT', 'USDC', 'DAI', 'FDUSD', 'USDE', 'USDS', 'TUSD', 'USDP', 'BUSD', 'PYUSD', 'USD1', 'RLUSD', 'USDG', 'USDD', 'USDY', 'USDF', 'USDGO', 'USYC', 'USDTB', 'USDAI', 'USD0', 'GHO', 'EURC', 'EUTBL', 'USTB', 'SOFID', 'APXUSD']);

const firestore = () => {
  const app = getApps()[0] || initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0610749770' });
  return getFirestore(app, 'money-scanner-360');
};

const safeJson = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const dayStart = (timestamp: number) => {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
};
const dayLabel = (timestamp: number) => new Date(timestamp).toISOString().slice(0, 10);

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => { timeout = setTimeout(() => reject(new Error(`Timeout după ${timeoutMs}ms`)), timeoutMs); })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};

const isRetryable = (error: unknown) => {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes('timeout') || message.includes('http 429') || message.includes('http 5') || message.includes('network') || message.includes('fetch');
};

interface AssetScan {
  asset: AssetInfo;
  events: MaAlertEvent[];
  mlScore?: number;
  status: 'EVALUATED' | 'INSUFFICIENT_HISTORY' | 'STALE_DATA' | 'ERROR';
  reason?: string;
}

export interface MaCrossReport {
  id: string;
  ruleId: string;
  ruleVersion: number;
  analyzedDay: string;
  analyzedDayTimestamp: number;
  startedAt: number;
  completedAt: number;
  durationMs: number;
  timezone: 'Europe/Oslo';
  status: 'complete' | 'partial' | 'failed';
  scanned: number;
  skippedMarketCap: number;
  errors: number;
  events: number;
  deliveries: { digest: number; individual: number; failed: number };
  error?: string;
}

export interface MaRetestRecord {
  id: string;
  ruleId: string;
  ruleVersion: number;
  analyzedDay: string;
  recordedAt: number;
  stage: 'daily_stage2' | 'weekly_stage2';
  symbol: string;
  marketClass: 'crypto';
  candleTimestamp: number;
  close: number;
  sma50: number;
  sma200: number;
  setup?: MaAlertEvent['setup'];
  rvol?: number;
  delivery: 'pending' | 'sent' | 'failed' | 'not_configured' | 'interrupted';
}

/** Orchestrates the daily 08:00 Europe/Oslo 2x2 MA cross/retest alert pass. */
export class MaCrossAlertRunner {
  private running?: Promise<MaCrossReport>;
  private readonly instanceId = randomUUID();
  private readonly engine = new MoneyLineEngine();

  constructor(
    private readonly marketData: MarketDataService,
    private readonly telegram: TelegramBotHandler
  ) {}

  public async listRetests(limit = 20, before?: string): Promise<{ items: MaRetestRecord[]; nextBefore: string | null }> {
    const capped = Math.min(50, Math.max(1, Math.floor(limit)));
    let query = firestore().collection('ma-cross-retest-events').orderBy('recordedAt', 'desc');
    if (before) {
      const after = await firestore().collection('ma-cross-retest-events').doc(before).get();
      if (!after.exists) throw new Error('Retest history cursor unavailable');
      query = query.startAfter(after);
    }
    const result = await query.limit(capped + 1).get();
    const items = result.docs.slice(0, capped).map(doc => {
      const row = doc.data() as MaRetestRecord;
      // A pending marker from an interrupted scan is not evidence of a message sent.
      return row.delivery === 'pending' && Date.now() - row.recordedAt > 20 * 60_000
        ? { ...row, delivery: 'interrupted' as const } : row;
    });
    return { items, nextBefore: result.size > capped ? items.at(-1)!.id : null };
  }

  private async recordRetest(analyzedDay: string, event: MaAlertEvent, key: string): Promise<void> {
    if (event.stage !== 'daily_stage2' && event.stage !== 'weekly_stage2') return;
    const record: MaRetestRecord = safeJson({
      id: key, ruleId: MA_CROSS_RULE_ID, ruleVersion: MA_CROSS_RULE_VERSION,
      analyzedDay, recordedAt: Date.now(),
      stage: event.stage, symbol: event.symbol, marketClass: event.marketClass,
      candleTimestamp: event.candleTimestamp, close: event.close,
      sma50: event.sma50, sma200: event.sma200,
      ...(event.setup ? { setup: event.setup } : {}),
      ...(event.rvol !== undefined ? { rvol: event.rvol } : {}),
      delivery: this.telegram.getDeliveryConfiguration().telegramConfigured ? 'pending' : 'not_configured'
    });
    await firestore().collection('ma-cross-retest-events').doc(key).create(record);
  }

  private async recordRetestDelivery(key: string, status: MaRetestRecord['delivery']): Promise<void> {
    await firestore().collection('ma-cross-retest-events').doc(key).update({ delivery: status, deliveredAt: Date.now() });
  }

  public run(now = Date.now()): Promise<MaCrossReport> {
    if (this.running) return this.running;
    this.running = this.execute(now).finally(() => { this.running = undefined; });
    return this.running;
  }

  private async claimLock(now: number): Promise<boolean> {
    try {
      const ref = firestore().doc('operations/ma-cross-alert-lock');
      return await firestore().runTransaction(async transaction => {
        const snapshot = await transaction.get(ref);
        const stored = snapshot.data() as { ownerId?: string; expiresAt?: number } | undefined;
        if (stored?.expiresAt && stored.expiresAt > now && stored.ownerId !== this.instanceId) return false;
        transaction.set(ref, { ownerId: this.instanceId, claimedAt: now, expiresAt: now + LOCK_TTL_MS });
        return true;
      });
    } catch {
      return true;
    }
  }

  private async releaseLock() {
    try {
      const ref = firestore().doc('operations/ma-cross-alert-lock');
      await firestore().runTransaction(async transaction => {
        const snapshot = await transaction.get(ref);
        if (snapshot.data()?.ownerId === this.instanceId) transaction.delete(ref);
      });
    } catch { /* expiry is the recovery path */ }
  }

  private async execute(now: number): Promise<MaCrossReport> {
    const analyzedTimestamp = dayStart(now) - DAY_MS;
    const analyzedDay = dayLabel(analyzedTimestamp);
    const startedAt = Date.now();
    const reportId = `${MA_CROSS_RULE_ID}:${analyzedDay}`;
    const report: MaCrossReport = {
      id: reportId, ruleId: MA_CROSS_RULE_ID, ruleVersion: MA_CROSS_RULE_VERSION,
      analyzedDay, analyzedDayTimestamp: analyzedTimestamp, startedAt,
      completedAt: 0, durationMs: 0, timezone: 'Europe/Oslo', status: 'failed',
      scanned: 0, skippedMarketCap: 0, errors: 0, events: 0,
      deliveries: { digest: 0, individual: 0, failed: 0 }
    };
    if (!(await this.claimLock(now))) {
      report.error = 'Scanarea MA 2x2 rulează deja pe altă instanță.';
      return report;
    }
    try {
      const universeAll = (await this.marketData.getFlipUniverseCryptoAssets())
        .filter(asset => asset.marketClass === 'crypto' && !STABLE_SYMBOLS.has(asset.symbol.toUpperCase()));
      const universe = universeAll
        .filter(asset => Number.isFinite(asset.marketCap) && (asset.marketCap as number) > MIN_MARKET_CAP)
        .slice(0, 150);
      report.skippedMarketCap = universeAll.length - universe.length;

      const regime = await this.loadBtcRegime(analyzedTimestamp);
      const scans: AssetScan[] = [];
      for (let index = 0; index < universe.length; index += 5) {
        const batch = universe.slice(index, index + 5);
        const settled = await Promise.all(batch.map(asset => this.scanAsset(asset, analyzedTimestamp)));
        scans.push(...settled);
      }
      report.scanned = scans.filter(scan => scan.status === 'EVALUATED').length;
      report.errors = scans.filter(scan => scan.status === 'ERROR').length;

      const allEvents: { scan: AssetScan; event: MaAlertEvent }[] = [];
      for (const scan of scans) for (const event of scan.events) allEvents.push({ scan, event });
      report.events = allEvents.length;

      const fresh = await this.filterDelivered(reportId, allEvents, analyzedTimestamp);
      await this.deliver(report, reportId, fresh, regime);

      report.status = report.errors ? 'partial' : 'complete';
      report.completedAt = Date.now();
      report.durationMs = report.completedAt - startedAt;
      await this.persistReport(report);
      return safeJson(report);
    } catch (error) {
      report.error = error instanceof Error ? error.message : String(error);
      report.completedAt = Date.now();
      report.durationMs = report.completedAt - startedAt;
      await this.persistReport(report);
      return safeJson(report);
    } finally {
      await this.releaseLock();
    }
  }

  private async loadBtcRegime(analyzedTimestamp: number): Promise<BtcRegime | null> {
    try {
      const candles = await withTimeout(this.marketData.getCandles('BTC', '1d', 260, 'crypto'), 18_000);
      let mlScore: number | undefined;
      let mlTier: string | undefined;
      try {
        const latest = this.engine.calculateLatest('BTC', '1d', candles);
        mlScore = latest?.score;
        mlTier = latest?.tier ? String(latest.tier) : undefined;
      } catch { /* score is supplemental */ }
      return computeBtcRegime(candles, mlScore, mlTier);
    } catch {
      return null;
    }
  }

  private async scanAsset(asset: AssetInfo, expectedTimestamp: number): Promise<AssetScan> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const [daily, weekly] = await Promise.all([
          withTimeout(this.marketData.getCandles(asset.symbol, '1d', 340, 'crypto'), 18_000),
          withTimeout(this.marketData.getCandles(asset.symbol, '1w', 260, 'crypto'), 18_000)
        ]);
        const evaluation = evaluateMaCross(asset.symbol, daily, weekly, { expectedDayTimestamp: expectedTimestamp });
        let mlScore: number | undefined;
        if (evaluation.dailyEvents.length || evaluation.weeklyEvents.length) {
          try {
            mlScore = this.engine.calculateLatest(asset.symbol, '1d', daily)?.score;
          } catch { /* supplemental */ }
        }
        return {
          asset,
          events: [...evaluation.dailyEvents, ...evaluation.weeklyEvents],
          ...(mlScore !== undefined ? { mlScore } : {}),
          status: evaluation.status,
          ...(evaluation.reason ? { reason: evaluation.reason } : {})
        };
      } catch (error) {
        lastError = error;
        if (!isRetryable(error) || attempt === 2) break;
        await new Promise(resolve => setTimeout(resolve, 150 * (attempt + 1)));
      }
    }
    return { asset, events: [], status: 'ERROR', reason: lastError instanceof Error ? lastError.message : String(lastError) };
  }

  /** One-shot guard: re-arm rules per stage, dedupe via Firestore delivery claims. */
  private async filterDelivered(
    reportId: string,
    allEvents: { scan: AssetScan; event: MaAlertEvent }[],
    analyzedTimestamp: number
  ): Promise<{ scan: AssetScan; event: MaAlertEvent; key: string }[]> {
    const fresh: { scan: AssetScan; event: MaAlertEvent; key: string }[] = [];
    for (const { scan, event } of allEvents) {
      const day = dayLabel(event.candleTimestamp);
      const key = `${reportId}:${event.stage}:${event.symbol}:${day}`.replace(/[^a-zA-Z0-9:_-]/g, '_');
      if (event.stage === 'daily_stage2' || event.stage === 'weekly_stage2') {
        // Retest alerts are one-shot per asset per episode: re-arm only after the
        // level was lost (close back below the MA) since the previous fire.
        const rearmed = await this.retestRearmed(event);
        if (!rearmed) continue;
      }
      if (!(await this.claimDelivery(key))) continue;
      if (event.stage === 'daily_stage2' || event.stage === 'weekly_stage2') {
        try { await this.recordRetest(dayLabel(analyzedTimestamp), event, key); }
        catch (error) {
          console.error('Retest event persistence failed; alert not delivered:', error);
          // A failed create may have committed despite an acknowledgement error.
          // Keep the claim when the record cannot be read; never send unrecorded.
          const ref = firestore().collection('ma-cross-retest-events').doc(key);
          const persisted = await ref.get().catch(() => null);
          if (persisted?.exists) { fresh.push({ scan, event, key }); continue; }
          if (persisted) {
            try {
              await firestore().runTransaction(async tx => {
                const claim = firestore().collection('ma-cross-alert-deliveries').doc(key);
                const rearm = firestore().collection('ma-cross-alert-state').doc(`${event.stage}:${event.symbol}`);
                const [currentClaim, currentRearm] = await Promise.all([tx.get(claim), tx.get(rearm)]);
                if (currentClaim.data()?.status !== 'sending') return;
                tx.delete(claim);
                if (currentRearm.data()?.awaitingRearm === true && currentRearm.data()?.lastEventKey === `${dayLabel(event.candleTimestamp)}:${event.stage}:${event.symbol}`) {
                  tx.set(rearm, { awaitingRearm: false }, { merge: true });
                }
              });
            } catch (recoveryError) { console.error('Retest retry state recovery failed:', recoveryError); }
          }
          continue;
        }
      }
      fresh.push({ scan, event, key });
    }
    return fresh;
  }

  private async retestRearmed(event: MaAlertEvent): Promise<boolean> {
    try {
      const ref = firestore().collection('ma-cross-alert-state').doc(`${event.stage}:${event.symbol}`);
      const stored = (await ref.get()).data() as { lastClose?: number; lastSma?: number; awaitingRearm?: boolean } | undefined;
      const lost = stored?.awaitingRearm && Number.isFinite(stored.lastClose) && Number.isFinite(stored.lastSma)
        ? (stored.lastClose as number) < (stored.lastSma as number)
        : false;
      if (stored?.awaitingRearm && !lost) {
        // Update re-arm check with the newest close for tomorrow's pass.
        await ref.set({ lastClose: event.close, lastSma: event.stage === 'daily_stage2' ? event.sma50 : Math.max(event.sma50, event.sma200), updatedAt: Date.now(), expiresAt: Date.now() + RETENTION_MS }, { merge: true });
        return false;
      }
      await ref.set({ awaitingRearm: true, lastEventKey: `${dayLabel(event.candleTimestamp)}:${event.stage}:${event.symbol}`, lastClose: event.close, lastSma: event.stage === 'daily_stage2' ? event.sma50 : Math.max(event.sma50, event.sma200), updatedAt: Date.now(), expiresAt: Date.now() + RETENTION_MS }, { merge: true });
      return true;
    } catch (error) {
      console.error("MA retest rearm state unavailable:", error);
      return false;
    }
  }

  private async claimDelivery(key: string): Promise<boolean> {
    try {
      const ref = firestore().collection('ma-cross-alert-deliveries').doc(key);
      return await firestore().runTransaction(async transaction => {
        const snapshot = await transaction.get(ref);
        if (snapshot.exists) return false;
        transaction.create(ref, { status: 'sending', updatedAt: Date.now(), expiresAt: Date.now() + RETENTION_MS });
        return true;
      });
    } catch (error) {
      console.error('MA delivery claim unavailable:', error);
      return false;
    }
  }

  private async finishDelivery(key: string, status: 'sent' | 'failed') {
    try {
      await firestore().collection('ma-cross-alert-deliveries').doc(key).set({ status, updatedAt: Date.now(), expiresAt: Date.now() + RETENTION_MS }, { merge: true });
    } catch { /* report still records the outcome */ }
  }

  /** JEV quality order: MoneyLine score desc, then market-cap rank asc. */
  private jevRank(items: { scan: AssetScan; event: MaAlertEvent; key: string }[]) {
    return [...items].sort((left, right) =>
      (right.scan.mlScore ?? -Infinity) - (left.scan.mlScore ?? -Infinity)
      || (left.scan.asset.rank ?? 9999) - (right.scan.asset.rank ?? 9999));
  }

  private async deliver(
    report: MaCrossReport,
    reportId: string,
    fresh: { scan: AssetScan; event: MaAlertEvent; key: string }[],
    regime: BtcRegime | null
  ) {
    if (!this.telegram.getDeliveryConfiguration().telegramConfigured) return;
    const regimeLine = formatBtcRegime(regime);
    const disclaimer = '_Niveluri factuale din date; nu este semnal de cumpărare._';

    // Stage-1 crosses: ONE batched digest, JEV top-5.
    const stage1 = this.jevRank(fresh.filter(item => item.event.stage === 'daily_stage1' || item.event.stage === 'weekly_stage1'));
    const dailyCrosses = stage1.filter(item => item.event.stage === 'daily_stage1').slice(0, 5);
    const weeklyCrosses = stage1.filter(item => item.event.stage === 'weekly_stage1').slice(0, 5);
    const digestLines: string[] = [];
    if (dailyCrosses.length) {
      digestLines.push(`🔔🟡 *Treceri peste SMA50 (1D) · ${dayLabel(report.analyzedDayTimestamp)}*`, regimeLine, '');
      for (const { event, scan } of dailyCrosses) {
        digestLines.push(`• ${telegramAssetLink({ symbol: event.symbol, timeframe: '1d', marketClass: 'crypto' })} ${scan.asset.rank ? `#${scan.asset.rank}` : ''} · închidere $${event.close.toPrecision(8)} · SMA50 $${event.sma50.toPrecision(8)} · SMA200 $${event.sma200.toPrecision(8)}${event.rvol !== undefined ? ` · RVOL ${event.rvol.toFixed(2)}x` : ''}`);
      }
      digestLines.push('');
    }
    if (weeklyCrosses.length) {
      digestLines.push(`🚨🟡 *Treceri peste SMA50 + SMA200 (1W) · ${dayLabel(report.analyzedDayTimestamp)}*`, '');
      for (const { event, scan } of weeklyCrosses) {
        digestLines.push(`• ${telegramAssetLink({ symbol: event.symbol, timeframe: '1w', marketClass: 'crypto' })} ${scan.asset.rank ? `#${scan.asset.rank}` : ''} · închidere $${event.close.toPrecision(8)} · SMA50 $${event.sma50.toPrecision(8)} · SMA200 $${event.sma200.toPrecision(8)}`);
      }
      digestLines.push('');
    }
    if (digestLines.length) {
      digestLines.push(disclaimer);
      const sent = await this.sendParts(digestLines.join('\n'));
      for (const item of [...dailyCrosses, ...weeklyCrosses]) {
        await this.finishDelivery(item.key, sent ? 'sent' : 'failed');
      }
      if (sent) report.deliveries.digest += 1;
      else report.deliveries.failed += 1;
    }

    // Retest alerts: individual messages with the computed setup block.
    const retests = this.jevRank(fresh.filter(item => item.event.stage === 'daily_stage2' || item.event.stage === 'weekly_stage2'));
    for (const { event, key } of retests) {
      const lines: string[] = [];
      if (event.stage === 'daily_stage2') {
        const setup = event.setup!;
        lines.push(
          `🔔🟢 *Retest SMA50 confirmat (1D)*`,
          `${telegramAssetLink({ symbol: event.symbol, timeframe: '1d', marketClass: 'crypto' })}`,
          `Închidere $${event.close.toPrecision(8)} · SMA50 $${event.sma50.toPrecision(8)} · SMA200 $${event.sma200.toPrecision(8)}`,
          ``,
          `*Setup (niveluri factuale):*`,
          `Zonă retest: $${setup.entryZoneLow.toPrecision(8)} – $${setup.entryZoneHigh.toPrecision(8)}`,
          `Stop sub SMA50/structură: $${setup.stop.toPrecision(8)}`,
          `Invalidare: ${setup.invalidation}`,
          ...(setup.gainSinceFlipPct !== undefined ? [`Mișcare de la flip confirmat: ${setup.gainSinceFlipPct >= 0 ? '+' : ''}${setup.gainSinceFlipPct.toFixed(1)}%`] : []),
          ...(event.rvol !== undefined ? [`RVOL: ${event.rvol.toFixed(2)}x`] : [])
        );
      } else {
        const higher = Math.max(event.sma50, event.sma200);
        lines.push(
          `🚨🟢 *Retest medie săptămânală confirmat (1W)*`,
          `${telegramAssetLink({ symbol: event.symbol, timeframe: '1w', marketClass: 'crypto' })}`,
          `Închidere $${event.close.toPrecision(8)} · SMA50 $${event.sma50.toPrecision(8)} · SMA200 $${event.sma200.toPrecision(8)}`,
          `Media retestată: $${higher.toPrecision(8)}`,
          `Confirmare la închiderea săptămânii înapoi peste medie.`
        );
      }
      lines.push('', regimeLine, disclaimer);
      const sent = await this.sendParts(lines.join('\n'));
      await this.finishDelivery(key, sent ? 'sent' : 'failed');
      try { await this.recordRetestDelivery(key, sent ? 'sent' : 'failed'); }
      catch (error) { console.error('Retest delivery persistence failed:', error); }
      if (sent) report.deliveries.individual += 1;
      else report.deliveries.failed += 1;
    }
  }

  private async sendParts(text: string): Promise<boolean> {
    const lines = text.split('\n');
    const parts: string[] = [];
    let current = '';
    for (const line of lines) {
      if (current && current.length + line.length + 1 > MAX_PART_LENGTH) {
        parts.push(current);
        current = '';
      }
      current += `${current ? '\n' : ''}${line}`;
    }
    if (current) parts.push(current);
    if (!parts.length) return true;
    for (let index = 0; index < parts.length; index += 1) {
      const delivered = await this.telegram.sendMarkdown(`${parts.length > 1 ? `*Partea ${index + 1}/${parts.length}*\n` : ''}${parts[index]}`);
      if (!delivered) return false;
    }
    return true;
  }

  private async persistReport(report: MaCrossReport) {
    try {
      const db = firestore();
      const payload = safeJson({ ...report, updatedAt: Date.now(), expiresAt: Date.now() + RETENTION_MS });
      await db.collection('ma-cross-alert-reports').doc(report.id).set(payload);
      await db.doc('operations/ma-cross-alert').set({ latestReportId: report.id, updatedAt: Date.now() }, { merge: true });
    } catch (error) {
      console.warn('MA cross report persistence failed:', error instanceof Error ? error.message : error);
    }
  }
}
