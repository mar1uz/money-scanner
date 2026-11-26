import { randomUUID } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
  AssetInfo,
  DailySmaReclaimCoverageTotals,
  DailySmaReclaimReport,
  DailySmaReclaimResult,
  DAILY_SMA_RECLAIM_RULE_ID,
  DAILY_SMA_RECLAIM_RULE_VERSION
} from '@money-scanner/shared';
import { MarketDataService } from '@money-scanner/market-data';
import { TelegramBotHandler, resolvePublicBaseUrl, telegramAssetLink } from '@money-scanner/notifications';
import { evaluateDailySmaReclaim } from './daily-sma-reclaim-service.js';

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

interface DeliveryState { status: 'sending' | 'sent' | 'uncertain' | 'not_configured'; updatedAt: number; }

/** Orchestrates the daily SMA reclaim scan independently of strategy alerts. */
export class DailySmaReclaimRunner {
  private running?: Promise<DailySmaReclaimReport>;
  private latest?: DailySmaReclaimReport;
  private readonly instanceId = randomUUID();

  constructor(
    private readonly marketData: MarketDataService,
    private readonly telegram: TelegramBotHandler
  ) {}

  public async getLatest(): Promise<DailySmaReclaimReport | null> {
    if (this.latest) return safeJson(this.latest);
    try {
      const root = await firestore().doc('operations/daily-sma-reclaim').get();
      const latestId = root.data()?.latestReportId as string | undefined;
      if (!latestId) return null;
      const report = await this.readReport(latestId);
      if (report) this.latest = report;
      return report ? safeJson(report) : null;
    } catch (error) {
      console.warn('Daily SMA reclaim restore failed:', error instanceof Error ? error.message : error);
      return null;
    }
  }

  public run(now = Date.now()): Promise<DailySmaReclaimReport> {
    if (this.running) return this.running;
    this.running = this.execute(now).finally(() => { this.running = undefined; });
    return this.running;
  }

  private async claimLock(now: number): Promise<boolean> {
    try {
      const ref = firestore().doc('operations/daily-sma-reclaim-lock');
      return firestore().runTransaction(async transaction => {
        const snapshot = await transaction.get(ref);
        const stored = snapshot.data() as { ownerId?: string; expiresAt?: number } | undefined;
        if (stored?.expiresAt && stored.expiresAt > now && stored.ownerId !== this.instanceId) return false;
        transaction.set(ref, { ownerId: this.instanceId, claimedAt: now, expiresAt: now + LOCK_TTL_MS });
        return true;
      });
    } catch (error) {
      // Local/test environments may not have Firestore credentials. The
      // process-level promise still prevents duplicate work there.
      console.warn('Daily SMA reclaim lock unavailable:', error instanceof Error ? error.message : error);
      return true;
    }
  }

  private async ownsLock(): Promise<boolean> {
    try {
      const stored = (await firestore().doc('operations/daily-sma-reclaim-lock').get()).data() as { ownerId?: string; expiresAt?: number } | undefined;
      return stored?.ownerId === this.instanceId && Number(stored.expiresAt) > Date.now();
    } catch { return true; }
  }

  private async releaseLock() {
    try {
      const ref = firestore().doc('operations/daily-sma-reclaim-lock');
      await firestore().runTransaction(async transaction => {
        const snapshot = await transaction.get(ref);
        if (snapshot.data()?.ownerId === this.instanceId) transaction.delete(ref);
      });
    } catch { /* expiry remains the recovery path */ }
  }

  private async execute(now: number): Promise<DailySmaReclaimReport> {
    const analyzedTimestamp = dayStart(now) - DAY_MS;
    const analyzedDay = dayLabel(analyzedTimestamp);
    const startedAt = Date.now();
    const reportId = `${DAILY_SMA_RECLAIM_RULE_ID}:${analyzedDay}`;
    const locked = await this.claimLock(now);
    if (!locked) {
      const existing = await this.getLatest();
      if (existing) return existing;
      throw new Error('Scanarea DAILY_SMA50_200_RECLAIM rulează deja pe altă instanță.');
    }

    try {
      const universe = (await this.marketData.getFlipUniverseCryptoAssets())
        .filter(asset => asset.marketClass === 'crypto' && !STABLE_SYMBOLS.has(asset.symbol.toUpperCase()))
        .slice(0, 150);
      const results: DailySmaReclaimResult[] = [];
      let errors = 0;
      for (let index = 0; index < universe.length; index += 5) {
        const batch = universe.slice(index, index + 5);
        const settled = await Promise.all(batch.map(asset => this.scanAsset(asset, analyzedTimestamp)));
        settled.forEach(result => {
          results.push(result);
          if (result.status === 'ERROR') errors += 1;
        });
      }
      results.sort((left, right) => (left.rank ?? 9999) - (right.rank ?? 9999) || left.symbol.localeCompare(right.symbol));
      const totals = this.totals(results, universe.length);
      const report: DailySmaReclaimReport = {
        id: reportId,
        ruleId: DAILY_SMA_RECLAIM_RULE_ID,
        ruleVersion: DAILY_SMA_RECLAIM_RULE_VERSION,
        analyzedDay,
        analyzedDayTimestamp: analyzedTimestamp,
        startedAt,
        completedAt: Date.now(),
        durationMs: Date.now() - startedAt,
        source: 'CoinGecko market-cap rank + Binance/Hyperliquid daily candles',
        timezone: 'Europe/Oslo',
        status: universe.length === 0 || !results.length
          ? 'failed'
          : (errors || totals.staleData || totals.insufficientHistory ? 'partial' : 'complete'),
        totals,
        results
      };
      if (await this.ownsLock()) await this.persist(report);
      const telegram = await this.deliver(report);
      report.telegram = telegram;
      if (await this.ownsLock()) await this.persist(report);
      this.latest = safeJson(report);
      await this.cleanup(Date.now());
      return safeJson(report);
    } catch (error) {
      const report: DailySmaReclaimReport = {
        id: reportId,
        ruleId: DAILY_SMA_RECLAIM_RULE_ID,
        ruleVersion: DAILY_SMA_RECLAIM_RULE_VERSION,
        analyzedDay,
        analyzedDayTimestamp: analyzedTimestamp,
        startedAt,
        completedAt: Date.now(),
        durationMs: Date.now() - startedAt,
        source: 'CoinGecko market-cap rank + Binance/Hyperliquid daily candles',
        timezone: 'Europe/Oslo',
        status: 'failed',
        totals: this.totals([], 0),
        results: [],
        error: error instanceof Error ? error.message : String(error)
      };
      if (await this.ownsLock()) await this.persist(report);
      this.latest = report;
      return safeJson(report);
    } finally {
      await this.releaseLock();
    }
  }

  private async scanAsset(asset: AssetInfo, expectedTimestamp: number): Promise<DailySmaReclaimResult> {
    const source = asset.marketDataSource || 'binance_spot';
    const pair = source === 'hyperliquid' ? (asset.providerSymbol || asset.symbol) : `${asset.providerSymbol || asset.symbol}USDT`;
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const candles = await withTimeout(this.marketData.getCandles(asset.symbol, '1d', 340, 'crypto'), 18_000);
        const result = evaluateDailySmaReclaim(asset.symbol, candles, {
          expectedDayTimestamp: expectedTimestamp,
          evaluatedAt: Date.now(),
          source,
          pair,
          name: asset.name,
          rank: asset.rank
        });
        if (result.signal && !result.currentPrice) {
          try {
            const quote = await withTimeout(this.marketData.getPriceQuote(asset.symbol, 'crypto'), 8_000);
            if (Number.isFinite(quote.price) && quote.price > 0) {
              result.currentPrice = quote.price;
              result.currentPriceAt = quote.timestamp;
            }
          } catch { /* current price is supplemental; confirmation stays daily-close based */ }
        }
        return result;
      } catch (error) {
        lastError = error;
        if (!isRetryable(error) || attempt === 2) break;
        await new Promise(resolve => setTimeout(resolve, 150 * (attempt + 1)));
      }
    }
    return {
      ruleId: DAILY_SMA_RECLAIM_RULE_ID,
      ruleVersion: DAILY_SMA_RECLAIM_RULE_VERSION,
      symbol: asset.symbol.toUpperCase(),
      name: asset.name,
      marketClass: 'crypto',
      ...(Number.isFinite(asset.rank) ? { rank: asset.rank } : {}),
      source,
      pair,
      analyzedDay: dayLabel(expectedTimestamp),
      analyzedDayTimestamp: expectedTimestamp,
      evaluatedAt: Date.now(),
      status: 'ERROR',
      reason: 'Furnizorul de lumânări nu a răspuns după două reîncercări.',
      providerError: lastError instanceof Error ? lastError.message : String(lastError)
    };
  }

  private totals(results: DailySmaReclaimResult[], total: number): DailySmaReclaimCoverageTotals {
    const count = (status: DailySmaReclaimResult['status']) => results.filter(result => result.status === status).length;
    return { total, scanned: results.length, newSignals: count('NEW_SIGNAL'), alreadyAboveBoth: count('ABOVE_BOTH'), noSignal: count('NO_SIGNAL'), insufficientHistory: count('INSUFFICIENT_HISTORY'), staleData: count('STALE_DATA'), errors: count('ERROR') };
  }

  private splitMessage(text: string): string[] {
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
    return parts.length ? parts : ['Raport SMA indisponibil.'];
  }

  private formatTelegram(report: DailySmaReclaimReport): string {
    const { totals } = report;
    const lines = [
      `📊 *${DAILY_SMA_RECLAIM_RULE_ID} · 1D*`,
      `*Zi analizată:* ${report.analyzedDay} · *Sursă:* ${report.source}`,
      `*Acoperire:* ${totals.scanned}/${totals.total} · noi ${totals.newSignals} · deja peste ambele ${totals.alreadyAboveBoth} · fără semnal ${totals.noSignal} · insuficient ${totals.insufficientHistory} · neactualizat ${totals.staleData} · erori ${totals.errors}`,
      ''
    ];
    const signals = report.results.filter(result => result.status === 'NEW_SIGNAL').sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999));
    if (signals.length) {
      lines.push('*Traversări noi:*');
      for (const result of signals) {
        const signal = result.signal!;
        lines.push(`🟢 ${telegramAssetLink({ symbol: result.symbol, timeframe: '1d', marketClass: 'crypto' })} ${result.rank ? `#${result.rank}` : '—'} · închidere confirmare $${signal.confirmationPrice.toPrecision(8)} · SMA50 $${signal.sma50.toPrecision(8)} · SMA200 $${signal.sma200.toPrecision(8)} · RVOL ${signal.rvol?.toFixed(2) ?? 'indisponibil'}x`);
      }
    } else {
      lines.push('*Fără traversări noi astăzi.*');
      if (totals.errors || totals.staleData || totals.insufficientHistory) {
        lines.push('⚠️ Datele sunt incomplete sau neactualizate; acest raport nu trebuie interpretat ca „zero oportunități”.');
      }
    }
    lines.push('', `_Semnalul folosește numai lumânarea UTC închisă; nu generează ordine, SL/TP sau probabilități._`, `🔗 [Deschide Alarmele](${resolvePublicBaseUrl()})`);
    return lines.join('\n');
  }

  private async claimDelivery(key: string): Promise<boolean> {
    try {
      const ref = firestore().collection('daily-sma-reclaim-deliveries').doc(key);
      return firestore().runTransaction(async transaction => {
        const snapshot = await transaction.get(ref);
        if (snapshot.exists) return false;
        transaction.create(ref, { status: 'sending', updatedAt: Date.now(), expiresAt: Date.now() + RETENTION_MS });
        return true;
      });
    } catch { return true; }
  }

  private async finishDelivery(key: string, status: DeliveryState['status']) {
    try { await firestore().collection('daily-sma-reclaim-deliveries').doc(key).set({ status, updatedAt: Date.now(), expiresAt: Date.now() + RETENTION_MS }, { merge: true }); } catch { /* delivery is still represented in report */ }
  }

  private async deliver(report: DailySmaReclaimReport) {
    const destinationConfigured = Boolean(this.telegram.getDeliveryConfiguration().telegramConfigured);
    const parts = this.splitMessage(this.formatTelegram(report));
    let deliveredParts = 0;
    let uncertainParts = 0;
    const chatId = this.telegram.getDefaultChatId() || 'unconfigured';
    for (let index = 0; index < parts.length; index += 1) {
      const key = `${report.id}:${chatId}:${index + 1}`.replace(/[^a-zA-Z0-9:_-]/g, '_');
      if (!destinationConfigured) {
        await this.finishDelivery(key, 'not_configured');
        continue;
      }
      if (!(await this.claimDelivery(key))) continue;
      const delivered = await this.telegram.sendMarkdown(`${parts.length > 1 ? `*Partea ${index + 1}/${parts.length}*\n` : ''}${parts[index]}`);
      if (delivered) deliveredParts += 1;
      else { uncertainParts += 1; await this.finishDelivery(key, 'uncertain'); continue; }
      await this.finishDelivery(key, 'sent');
    }
    return { destinationConfigured, parts: parts.length, deliveredParts, uncertainParts };
  }

  private async persist(report: DailySmaReclaimReport) {
    try {
      const db = firestore();
      const root = db.doc('operations/daily-sma-reclaim');
      const metadata = safeJson({ ...report, results: undefined, latestReportId: report.id, updatedAt: Date.now(), expiresAt: Date.now() + RETENTION_MS });
      delete (metadata as any).results;
      await root.set(metadata, { merge: true });
      const batch = db.batch();
      const results = report.results;
      const reportDoc = db.collection('daily-sma-reclaim-reports').doc(report.id);
      batch.set(reportDoc, metadata);
      for (let index = 0; index < results.length; index += 50) {
        const segment = db.collection('daily-sma-reclaim-reports').doc(report.id).collection('segments').doc(String(Math.floor(index / 50)).padStart(4, '0'));
        batch.set(segment, { reportId: report.id, index, results: safeJson(results.slice(index, index + 50)), expiresAt: Date.now() + RETENTION_MS });
      }
      await batch.commit();
      const stateBatch = db.batch();
      for (const result of results) {
        stateBatch.set(db.collection('daily-sma-reclaim-state').doc(`${result.marketClass}:${result.symbol}`), {
          symbol: result.symbol, marketClass: result.marketClass, lastProcessedDay: result.analyzedDay,
          lastStatus: result.status, updatedAt: Date.now(), result: safeJson(result)
        }, { merge: true });
      }
      await stateBatch.commit();
    } catch (error) {
      console.warn('Daily SMA reclaim persistence failed:', error instanceof Error ? error.message : error);
    }
  }

  private async readReport(id: string): Promise<DailySmaReclaimReport | null> {
    const root = await firestore().collection('daily-sma-reclaim-reports').doc(id).get();
    if (!root.exists) return null;
    const metadata = root.data() as Omit<DailySmaReclaimReport, 'results'>;
    const segments = await root.ref.collection('segments').orderBy('index').get();
    const results = segments.docs.flatMap(document => (document.data().results || []) as DailySmaReclaimResult[]);
    return { ...metadata, results } as DailySmaReclaimReport;
  }

  private async cleanup(now: number) {
    try {
      let remaining = 100;
      const db = firestore();
      const expiredReports = await db.collection('daily-sma-reclaim-reports').where('expiresAt', '<', now).limit(remaining).get();
      for (const document of expiredReports.docs) {
        if (remaining <= 0) break;
        const segments = await document.ref.collection('segments').where('expiresAt', '<', now).limit(Math.max(0, remaining - 1)).get();
        const batch = db.batch();
        batch.delete(document.ref);
        segments.docs.forEach(segment => batch.delete(segment.ref));
        await batch.commit();
        remaining -= 1 + segments.size;
      }
      if (remaining > 0) {
        const deliveries = await db.collection('daily-sma-reclaim-deliveries').where('expiresAt', '<', now).limit(remaining).get();
        if (!deliveries.empty) {
          const batch = db.batch();
          deliveries.docs.forEach(document => batch.delete(document.ref));
          await batch.commit();
          remaining -= deliveries.size;
        }
      }
      // Keep this operation bounded; Firestore usage is observable through the
      // collection count and each scan's duration/error fields.
      await firestore().doc('operations/daily-sma-reclaim').set({ lastCleanupAt: now, cleanupLimit: 100 }, { merge: true });
    } catch (error) { console.warn('Daily SMA reclaim cleanup failed:', error instanceof Error ? error.message : error); }
  }
}
