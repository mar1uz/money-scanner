import { randomUUID } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { AssetInfo } from '@money-scanner/shared';
import { MarketDataService } from '@money-scanner/market-data';
import { MoneyLineEngine } from '@money-scanner/money-line';
import { calculateSMA } from '@money-scanner/money-line';
import { computeBtcRegime } from './ma-cross-alert-service.js';
import { StructureSnapshot, STRUCTURE_SCANNER_RULE_ID, STRUCTURE_SCANNER_RULE_VERSION, detectStructure } from './structure-scanner-service.js';

/**
 * PAPER/LOGGING-FIRST structure scanner (🔵 tier). Runs on 4H/8H/1D candle
 * closes, detects S/R zone + regression-channel confluence, applies the JEV
 * quality gate (daily regime, BTC confluence) and logs every hit to Firestore
 * for forward-testing. NEVER sends Telegram messages.
 */

const DAY_MS = 86_400_000;
const RETENTION_MS = 90 * DAY_MS;
const LOCK_TTL_MS = 20 * 60_000;
const MIN_MARKET_CAP = 100_000_000;
const STABLE_SYMBOLS = new Set(['USDT', 'USDC', 'DAI', 'FDUSD', 'USDE', 'USDS', 'TUSD', 'USDP', 'BUSD', 'PYUSD', 'USD1', 'RLUSD', 'USDG', 'USDD', 'USDY', 'USDF', 'USDGO', 'USYC', 'USDTB', 'USDAI', 'USD0', 'GHO', 'EURC', 'EUTBL', 'USTB', 'SOFID', 'APXUSD']);
export type StructureScanTimeframe = '4h' | '8h' | '1d';
const TIMEFRAMES: StructureScanTimeframe[] = ['4h', '8h', '1d'];

const firestore = () => {
  const app = getApps()[0] || initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0610749770' });
  return getFirestore(app, 'money-scanner-360');
};

const safeJson = <T>(value: T): T => JSON.parse(JSON.stringify(value));

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

export interface StructureScanReport {
  id: string;
  ruleId: string;
  ruleVersion: number;
  startedAt: number;
  completedAt: number;
  durationMs: number;
  scanned: number;
  errors: number;
  confluences: number;
  logged: number;
  error?: string;
}

export class StructureScannerRunner {
  private running?: Promise<StructureScanReport>;
  private readonly instanceId = randomUUID();
  private readonly engine = new MoneyLineEngine();

  constructor(private readonly marketData: MarketDataService) {}

  public run(now = Date.now(), timeframes: StructureScanTimeframe[] = TIMEFRAMES): Promise<StructureScanReport> {
    if (this.running) return this.running;
    this.running = this.execute(now, timeframes).finally(() => { this.running = undefined; });
    return this.running;
  }

  private async claimLock(now: number): Promise<boolean> {
    try {
      const ref = firestore().doc('operations/structure-scanner-lock');
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
      const ref = firestore().doc('operations/structure-scanner-lock');
      await firestore().runTransaction(async transaction => {
        const snapshot = await transaction.get(ref);
        if (snapshot.data()?.ownerId === this.instanceId) transaction.delete(ref);
      });
    } catch { /* expiry is the recovery path */ }
  }

  /** Daily bullish alignment gate for the JEV filter. */
  private dailyBullish(closes: number[]): boolean | undefined {
    if (closes.length < 201) return undefined;
    const lastIndex = closes.length - 1;
    const sma50 = calculateSMA(closes, 50)[lastIndex];
    const sma200 = calculateSMA(closes, 200)[lastIndex];
    if (!Number.isFinite(sma50) || !Number.isFinite(sma200)) return undefined;
    return closes[lastIndex] > sma50 && sma50 > sma200;
  }

  private async execute(now: number, timeframes: StructureScanTimeframe[] = TIMEFRAMES): Promise<StructureScanReport> {
    const startedAt = Date.now();
    const dateLabel = new Date(now).toISOString().slice(0, 13).replace('T', 'h'); // day + UTC hour bucket
    const report: StructureScanReport = {
      id: `${STRUCTURE_SCANNER_RULE_ID}:${dateLabel}`,
      ruleId: STRUCTURE_SCANNER_RULE_ID, ruleVersion: STRUCTURE_SCANNER_RULE_VERSION,
      startedAt, completedAt: 0, durationMs: 0,
      scanned: 0, errors: 0, confluences: 0, logged: 0
    };
    if (!(await this.claimLock(now))) {
      report.error = 'Scanarea STRUCTURE_SCANNER rulează deja pe altă instanță.';
      report.completedAt = Date.now();
      return report;
    }
    try {
      const universe = (await this.marketData.getFlipUniverseCryptoAssets())
        .filter(asset => asset.marketClass === 'crypto' && !STABLE_SYMBOLS.has(asset.symbol.toUpperCase()))
        .filter(asset => Number.isFinite(asset.marketCap) && (asset.marketCap as number) > MIN_MARKET_CAP)
        .slice(0, 150);

      let btcLabel: string | undefined;
      try {
        const btcCandles = await withTimeout(this.marketData.getCandles('BTC', '1d', 260, 'crypto'), 18_000);
        btcLabel = computeBtcRegime(btcCandles)?.label;
      } catch { /* confluence tag stays undefined */ }

      for (let index = 0; index < universe.length; index += 5) {
        const batch = universe.slice(index, index + 5);
        const settled = await Promise.all(batch.map(asset => this.scanAsset(asset, btcLabel, dateLabel, timeframes)));
        for (const outcome of settled) {
          if (outcome.error) { report.errors += 1; continue; }
          report.scanned += 1;
          report.confluences += outcome.confluences;
          report.logged += outcome.logged;
        }
      }
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

  private async scanAsset(
    asset: AssetInfo,
    btcLabel: string | undefined,
    dateLabel: string,
    timeframes: StructureScanTimeframe[] = TIMEFRAMES
  ): Promise<{ error?: string; confluences: number; logged: number }> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const [fourH, eightH, daily] = await Promise.all([
          timeframes.includes('4h') ? withTimeout(this.marketData.getCandles(asset.symbol, '4h', 200, 'crypto'), 18_000) : Promise.resolve([]),
          timeframes.includes('8h') ? withTimeout(this.marketData.getCandles(asset.symbol, '8h', 200, 'crypto'), 18_000) : Promise.resolve([]),
          withTimeout(this.marketData.getCandles(asset.symbol, '1d', 250, 'crypto'), 18_000)
        ]);
        const candlesByTf: Record<'4h' | '8h' | '1d', typeof fourH> = { '4h': fourH, '8h': eightH, '1d': daily };
        const assetDailyBullish = this.dailyBullish(daily.filter(c => c.isClosed !== false).map(c => c.close));
        let mlScore: number | undefined;
        try {
          mlScore = this.engine.calculateLatest(asset.symbol, '1d', daily)?.score;
        } catch { /* supplemental */ }

        let confluences = 0;
        let logged = 0;
        for (const timeframe of timeframes) {
          const snapshot = detectStructure(asset.symbol, timeframe, candlesByTf[timeframe]);
          if (!snapshot?.confluence || !snapshot.confluenceSide) continue;
          confluences += 1;
          const side = snapshot.confluenceSide;
          const zone = (side === 'support' ? snapshot.supports : snapshot.resistances)
            .find(candidate => candidate.distanceAtr <= 0.5);
          const passesJev = side === 'support'
            ? btcLabel !== 'BEARISH' && assetDailyBullish === true
            : btcLabel !== 'BULLISH' && assetDailyBullish === false;
          const entry = {
            ruleId: STRUCTURE_SCANNER_RULE_ID,
            ruleVersion: STRUCTURE_SCANNER_RULE_VERSION,
            symbol: snapshot.symbol,
            timeframe,
            candleTimestamp: snapshot.candleTimestamp,
            close: snapshot.close,
            side,
            zone: zone ? { level: zone.level, touches: zone.touches, distanceAtr: zone.distanceAtr } : null,
            channel: snapshot.channel ? {
              mid: snapshot.channel.mid, upper: snapshot.channel.upper, lower: snapshot.channel.lower,
              positionSigma: snapshot.channel.positionSigma, direction: snapshot.channel.direction,
              slopePctPerBar: snapshot.channel.slopePctPerBar
            } : null,
            atr14: snapshot.atr14,
            marketCap: asset.marketCap ?? null,
            rank: asset.rank ?? null,
            mlScore: mlScore ?? null,
            btcRegime: btcLabel ?? null,
            assetDailyBullish: assetDailyBullish ?? null,
            passesJev,
            tier: 'paper',
            scannedAt: Date.now(),
            expiresAt: Date.now() + RETENTION_MS
          };
          if (await this.logOnce(asset.symbol, timeframe, side, dateLabel, entry)) logged += 1;
        }
        return { confluences, logged };
      } catch (error) {
        lastError = error;
        if (!isRetryable(error) || attempt === 2) break;
        await new Promise(resolve => setTimeout(resolve, 150 * (attempt + 1)));
      }
    }
    return { error: lastError instanceof Error ? lastError.message : String(lastError), confluences: 0, logged: 0 };
  }

  /** One log entry per symbol/timeframe/side per hour-bucket day label. */
  private async logOnce(symbol: string, timeframe: string, side: string, dateLabel: string, entry: unknown): Promise<boolean> {
    try {
      const key = `${symbol}:${timeframe}:${side}:${dateLabel}`.replace(/[^a-zA-Z0-9:_-]/g, '_');
      const ref = firestore().collection('structure-scanner-logs').doc(key);
      return await firestore().runTransaction(async transaction => {
        const snapshot = await transaction.get(ref);
        if (snapshot.exists) return false;
        transaction.create(ref, safeJson(entry));
        return true;
      });
    } catch {
      return false;
    }
  }

  private async persistReport(report: StructureScanReport) {
    try {
      const db = firestore();
      await db.collection('structure-scanner-reports').doc(report.id).set(safeJson({ ...report, updatedAt: Date.now(), expiresAt: Date.now() + RETENTION_MS }));
      await db.doc('operations/structure-scanner').set({ latestReportId: report.id, updatedAt: Date.now() }, { merge: true });
    } catch (error) {
      console.warn('Structure scanner report persistence failed:', error instanceof Error ? error.message : error);
    }
  }
}
