import { randomUUID } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
  AssetInfo,
  AssetMarketClass,
  Candle,
  MONEY_LINE_VERSION,
  MoneyLineTier,
  REGIME_TAPE_DISCLOSURE,
  REGIME_TAPE_TIMEFRAMES,
  REGIME_TAPE_VERSION,
  RegimeTapeCoverageItem,
  RegimeTapeEvent,
  RegimeTapeOutcomeKey,
  RegimeTapeScanReport,
  RegimeTapeWaitlistEntry,
  Timeframe,
  getScannerAssets
} from '@money-scanner/shared';
import { MarketDataService } from '@money-scanner/market-data';
import { MoneyLineEngine } from '@money-scanner/money-line';
import { TelegramBotHandler } from '@money-scanner/notifications';

const DAY_MS = 86_400_000;
const LOCK_TTL_MS = 20 * 60_000;
const SCAN_CANDLES: Record<Timeframe, number> = { '1h': 0, '4h': 0, '8h': 0, '1d': 340, '1w': 260, '1m': 0 };
const OUTCOME_WINDOWS: Record<RegimeTapeOutcomeKey, number> = { d1: DAY_MS, d7: 7 * DAY_MS, d30: 30 * DAY_MS };
const MAX_OUTCOME_UPDATES_PER_SCAN = 60;
const CONCURRENCY = 4;
const STABLE_SYMBOLS = new Set(['USDT', 'USDC', 'DAI', 'FDUSD', 'USDE', 'USDS', 'TUSD', 'USDP', 'BUSD', 'PYUSD', 'USD1', 'RLUSD', 'USDG', 'USDD', 'USDY', 'USDF', 'USDGO', 'USYC', 'USDTB', 'USDAI', 'USD0', 'GHO', 'EURC', 'EUTBL', 'USTB', 'SOFID', 'APXUSD']);

const firestore = () => {
  const app = getApps()[0] || initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0610749770' });
  return getFirestore(app, 'money-scanner-360');
};

export const buildRegimeTapeEventId = (
  marketClass: AssetMarketClass,
  symbol: string,
  timeframe: Timeframe,
  candleCloseTime: number
): string => `tape:${marketClass}:${symbol.toUpperCase()}:${timeframe}:${candleCloseTime}`;

export const regimeTapeSource = (marketClass: AssetMarketClass): string =>
  marketClass === 'crypto'
    ? 'Binance/Hyperliquid public candles'
    : marketClass === 'stocks'
      ? 'Yahoo Finance public chart API'
      : 'Yahoo Finance public chart API (metals)';

/** Pure: which forward-outcome windows are due for an event at `now`. */
export const outcomesDue = (event: RegimeTapeEvent, now: number): RegimeTapeOutcomeKey[] =>
  (Object.keys(OUTCOME_WINDOWS) as RegimeTapeOutcomeKey[]).filter(
    key => !event.outcomes?.[key] && now - event.candleCloseTime >= OUTCOME_WINDOWS[key]
  );

export const isValidWaitlistEmail = (email: string): boolean =>
  /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,24}$/.test(email) && email.length <= 320;

/** Pure: manual-review X preview. Facts only, never predictions. */
export const buildXPreview = (events: RegimeTapeEvent[], report: RegimeTapeScanReport): string => {
  const lines: string[] = [];
  const day = new Date(report.startedAt).toISOString().slice(0, 10);
  lines.push(`Money Line Regime Tape - ${day} (UTC)`);
  lines.push('');
  if (events.length === 0) {
    lines.push(`No regime transitions on ${report.timeframes.join('/')} closed candles across ${report.scanned}/${report.universeSize} assets.`);
  } else {
    events.slice(0, 8).forEach(event => {
      const when = new Date(event.candleCloseTime).toISOString().slice(0, 10);
      lines.push(`${event.symbol} (${event.timeframe}): ${event.previousTier} -> ${event.tier}, score ${event.previousScore} -> ${event.score}, candle close ${when}`);
    });
    if (events.length > 8) lines.push(`+${events.length - 8} more on the tape`);
  }
  lines.push('');
  lines.push(`Universe: ${report.universeSize} assets | Scanned: ${report.scanned} | Errors: ${report.errors} | Method ${event_method(events, report)}`);
  lines.push('Full ledger with 1d/7d/30d outcomes: https://scanner.relayhub.no/tape');
  lines.push(REGIME_TAPE_DISCLOSURE);
  return lines.join('\n');
};

const event_method = (events: RegimeTapeEvent[], report: RegimeTapeScanReport): string =>
  (events[0]?.methodVersion || report.methodVersion) + ' ' + (events[0]?.tapeVersion || report.tapeVersion);

interface ScanOutcome {
  events: RegimeTapeEvent[];
  coverage: RegimeTapeCoverageItem[];
}

/**
 * Captures every Money Line tier transition on tracked closed candles into a
 * durable, append-only Firestore ledger, and maintains 1d/7d/30d forward
 * outcomes for events already on the tape.
 */
export class RegimeTapeService {
  private static instance?: RegimeTapeService;
  private running?: Promise<RegimeTapeScanReport>;
  private readonly instanceId = randomUUID();

  constructor(
    private readonly marketData: MarketDataService,
    private readonly moneyLine: MoneyLineEngine,
    private readonly telegram: TelegramBotHandler
  ) {}

  public static getInstance(marketData: MarketDataService, moneyLine: MoneyLineEngine, telegram: TelegramBotHandler): RegimeTapeService {
    if (!RegimeTapeService.instance) RegimeTapeService.instance = new RegimeTapeService(marketData, moneyLine, telegram);
    return RegimeTapeService.instance;
  }

  public run(now = Date.now()): Promise<RegimeTapeScanReport> {
    if (this.running) return this.running;
    this.running = this.execute(now).finally(() => { this.running = undefined; });
    return this.running;
  }

  private async claimLock(now: number): Promise<boolean> {
    try {
      const ref = firestore().doc('operations/regime-tape-lock');
      return await firestore().runTransaction(async transaction => {
        const snapshot = await transaction.get(ref);
        const stored = snapshot.data() as { ownerId?: string; expiresAt?: number } | undefined;
        if (stored?.expiresAt && stored.expiresAt > now && stored.ownerId !== this.instanceId) return false;
        transaction.set(ref, { ownerId: this.instanceId, claimedAt: now, expiresAt: now + LOCK_TTL_MS });
        return true;
      });
    } catch (error) {
      // Local/test environments may not have Firestore credentials. The
      // process-level promise still prevents duplicate work there.
      console.warn('Regime tape lock unavailable:', error instanceof Error ? error.message : error);
      return true;
    }
  }

  private async releaseLock() {
    try {
      const ref = firestore().doc('operations/regime-tape-lock');
      await firestore().runTransaction(async transaction => {
        const snapshot = await transaction.get(ref);
        if (snapshot.data()?.ownerId === this.instanceId) transaction.delete(ref);
      });
    } catch { /* expiry remains the recovery path */ }
  }

  private buildUniverse(): Promise<AssetInfo[]> {
    return this.marketData.getFlipUniverseCryptoAssets().then(liveCrypto => {
      const universe = [...liveCrypto, ...getScannerAssets('stocks'), ...getScannerAssets('metals')].filter(
        asset => (asset.marketClass === 'crypto' || asset.marketClass === 'stocks' || asset.marketClass === 'metals')
          && !STABLE_SYMBOLS.has(asset.symbol.toUpperCase())
      );
      const seen = new Set<string>();
      return universe.filter(asset => {
        const key = `${asset.marketClass}:${asset.symbol.toUpperCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    });
  }

  /** Pure-ish: detect a tier transition between the last two closed-candle signals. */
  public detectTransition(asset: AssetInfo, timeframe: Timeframe, candles: Candle[], now: number): RegimeTapeEvent | null {
    const series = this.moneyLine.calculateSeries(asset.symbol, timeframe, candles);
    if (series.length < 2) return null;
    const current = series[series.length - 1];
    const previous = series[series.length - 2];
    if (current.tier === previous.tier) return null;
    if (current.isTransition !== true) return null;
    return {
      id: buildRegimeTapeEventId(asset.marketClass as AssetMarketClass, asset.symbol, timeframe, current.candleTimestamp),
      symbol: asset.symbol.toUpperCase(),
      name: asset.name,
      marketClass: asset.marketClass as AssetMarketClass,
      timeframe,
      previousTier: previous.tier,
      tier: current.tier,
      score: current.score,
      previousScore: previous.score,
      transitionPrice: current.transitionPrice ?? current.rawIndicators.ema20,
      candleCloseTime: current.candleTimestamp,
      detectedAt: now,
      source: regimeTapeSource(asset.marketClass as AssetMarketClass),
      methodVersion: MONEY_LINE_VERSION,
      tapeVersion: REGIME_TAPE_VERSION,
      contributions: current.contributions
    };
  }

  private async scanAssetTimeframe(asset: AssetInfo, timeframe: Timeframe, now: number): Promise<{ event: RegimeTapeEvent | null; coverage: RegimeTapeCoverageItem }> {
    const base = { symbol: asset.symbol.toUpperCase(), name: asset.name, marketClass: asset.marketClass as AssetMarketClass, rank: Number.isFinite(asset.rank) ? asset.rank : undefined, timeframe, scannedAt: now };
    try {
      const candles = (await this.marketData.getCandles(asset.symbol, timeframe, SCAN_CANDLES[timeframe], asset.marketClass))
        .filter(candle => candle.isClosed !== false);
      if (candles.length < 30) {
        return { event: null, coverage: { ...base, status: 'INSUFFICIENT_DATA', error: `only ${candles.length} closed candles` } };
      }
      const latest = candles[candles.length - 1];
      if (now - latest.timestamp > 3 * DAY_MS && timeframe === '1d') {
        return { event: null, coverage: { ...base, status: 'STALE_DATA', error: 'latest closed candle older than 3 days' } };
      }
      return { event: this.detectTransition(asset, timeframe, candles, now), coverage: { ...base, status: 'SCANNED' } };
    } catch (error) {
      return { event: null, coverage: { ...base, status: 'ERROR', error: error instanceof Error ? error.message : String(error) } };
    }
  }

  /** Append-only write: an existing event id is never overwritten. */
  private async persistEvent(event: RegimeTapeEvent): Promise<boolean> {
    const ref = firestore().doc(`regime_tape_events/${event.id}`);
    try {
      return await firestore().runTransaction(async transaction => {
        const snapshot = await transaction.get(ref);
        if (snapshot.exists) return false;
        transaction.set(ref, event);
        return true;
      });
    } catch (error) {
      console.warn('Regime tape event persist failed:', error instanceof Error ? error.message : error);
      throw error;
    }
  }

  private async updateOutcomes(now: number): Promise<number> {
    let updated = 0;
    try {
      const snapshot = await firestore().collection('regime_tape_events').orderBy('candleCloseTime', 'desc').limit(300).get();
      for (const doc of snapshot.docs) {
        if (updated >= MAX_OUTCOME_UPDATES_PER_SCAN) break;
        const event = doc.data() as RegimeTapeEvent;
        const due = outcomesDue(event, now);
        if (due.length === 0) continue;
        try {
          const quote = await this.marketData.getPriceQuote(event.symbol, event.marketClass);
          if (!Number.isFinite(quote.price) || quote.price <= 0 || !event.transitionPrice) continue;
          const patch: Record<string, unknown> = {};
          due.forEach(key => {
            patch[`outcomes.${key}`] = {
              price: quote.price,
              returnPct: Number((((quote.price - event.transitionPrice) / event.transitionPrice) * 100).toFixed(2)),
              measuredAt: now
            };
          });
          await doc.ref.update(patch);
          updated += 1;
        } catch (error) {
          console.warn(`Regime tape outcome update failed for ${event.symbol}:`, error instanceof Error ? error.message : error);
        }
      }
    } catch (error) {
      console.warn('Regime tape outcome sweep unavailable:', error instanceof Error ? error.message : error);
    }
    return updated;
  }

  private async execute(now: number): Promise<RegimeTapeScanReport> {
    const reportId = `tape-scan:${new Date(now).toISOString().slice(0, 10)}`;
    const report: RegimeTapeScanReport = {
      id: reportId,
      startedAt: now,
      status: 'running',
      universeSize: 0,
      scanned: 0,
      errors: 0,
      newEvents: 0,
      outcomesUpdated: 0,
      timeframes: [...REGIME_TAPE_TIMEFRAMES],
      source: 'CoinGecko market-cap universe + Binance/Hyperliquid/Yahoo public candles',
      methodVersion: MONEY_LINE_VERSION,
      tapeVersion: REGIME_TAPE_VERSION,
      coverage: []
    };
    const locked = await this.claimLock(now);
    if (!locked) {
      const latest = await this.getLatestScan();
      if (latest) return latest;
      throw new Error('Regime tape scan already running on another instance.');
    }
    await this.persistScan(report);
    const newEvents: RegimeTapeEvent[] = [];

    try {
      const universe = await this.buildUniverse();
      report.universeSize = universe.length;
      const tasks: Array<() => Promise<{ event: RegimeTapeEvent | null; coverage: RegimeTapeCoverageItem }>> = [];
      universe.forEach(asset => REGIME_TAPE_TIMEFRAMES.forEach(timeframe => {
        tasks.push(() => this.scanAssetTimeframe(asset, timeframe, now));
      }));

      for (let index = 0; index < tasks.length; index += CONCURRENCY) {
        const settled = await Promise.all(tasks.slice(index, index + CONCURRENCY).map(task => task()));
        for (const result of settled) {
          report.coverage.push(result.coverage);
          if (result.coverage.status === 'ERROR') report.errors += 1;
          else report.scanned += 1;
          if (result.event) {
            try {
              if (await this.persistEvent(result.event)) {
                newEvents.push(result.event);
                report.newEvents += 1;
              }
            } catch { report.errors += 1; }
          }
        }
        await this.persistScan(report);
      }

      report.outcomesUpdated = await this.updateOutcomes(now);
      report.status = report.errors > 0 ? 'partial' : 'complete';
      report.completedAt = Date.now();
      await this.persistScan(report);
      await this.deliverDigest(newEvents, report);
      return report;
    } catch (error) {
      report.status = 'failed';
      report.error = error instanceof Error ? error.message : String(error);
      report.completedAt = Date.now();
      await this.persistScan(report);
      return report;
    } finally {
      await this.releaseLock();
    }
  }

  private async persistScan(report: RegimeTapeScanReport): Promise<void> {
    try {
      await firestore().doc(`regime_tape_scans/${report.id}`).set(JSON.parse(JSON.stringify(report)));
      await firestore().doc('operations/regime-tape').set({ latestScanId: report.id, updatedAt: Date.now() }, { merge: true });
    } catch (error) {
      console.warn('Regime tape scan persist failed:', error instanceof Error ? error.message : error);
    }
  }

  public async getLatestScan(): Promise<RegimeTapeScanReport | null> {
    try {
      const pointer = await firestore().doc('operations/regime-tape').get();
      const latestId = pointer.data()?.latestScanId as string | undefined;
      if (!latestId) return null;
      const doc = await firestore().doc(`regime_tape_scans/${latestId}`).get();
      return doc.exists ? (doc.data() as RegimeTapeScanReport) : null;
    } catch (error) {
      console.warn('Regime tape latest scan restore failed:', error instanceof Error ? error.message : error);
      return null;
    }
  }

  public async getEvents(limit = 100, symbol?: string, timeframe?: Timeframe): Promise<RegimeTapeEvent[]> {
    try {
      let query: FirebaseFirestore.Query = firestore().collection('regime_tape_events').orderBy('candleCloseTime', 'desc');
      if (symbol) query = query.where('symbol', '==', symbol.toUpperCase());
      if (timeframe) query = query.where('timeframe', '==', timeframe);
      const snapshot = await query.limit(Math.min(Math.max(limit, 1), 500)).get();
      return snapshot.docs.map(doc => doc.data() as RegimeTapeEvent);
    } catch (error) {
      console.warn('Regime tape events read failed:', error instanceof Error ? error.message : error);
      return [];
    }
  }

  public async getWaitlistCount(): Promise<number> {
    try {
      const snapshot = await firestore().collection('regime_tape_waitlist').count().get();
      return snapshot.data().count;
    } catch { return 0; }
  }

  public async addWaitlistEntry(email: string, source?: string, pricePointEur?: number, userAgent?: string): Promise<{ added: boolean; total: number }> {
    const normalized = email.trim().toLowerCase();
    if (!isValidWaitlistEmail(normalized)) throw new Error('Invalid email address.');
    const id = Buffer.from(normalized).toString('base64url');
    const ref = firestore().doc(`regime_tape_waitlist/${id}`);
    const entry: RegimeTapeWaitlistEntry = {
      email: normalized,
      source: source?.slice(0, 120),
      pricePointEur: pricePointEur === 19 || pricePointEur === 39 ? pricePointEur : undefined,
      createdAt: Date.now(),
      userAgent: userAgent?.slice(0, 200)
    };
    let added = false;
    await firestore().runTransaction(async transaction => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) {
        transaction.set(ref, JSON.parse(JSON.stringify(entry)));
        added = true;
      }
    });
    return { added, total: await this.getWaitlistCount() };
  }

  /** Owner-only Telegram digest through the existing verified bot delivery. */
  private async deliverDigest(events: RegimeTapeEvent[], report: RegimeTapeScanReport): Promise<void> {
    if (process.env.REGIME_TAPE_TELEGRAM_DIGEST === '0') return;
    if (!this.telegram.getDefaultChatId()) return;
    if (events.length === 0) return;
    try {
      const lines = [`*Money Line Regime Tape* - ${new Date(report.startedAt).toISOString().slice(0, 10)}`, ''];
      events.slice(0, 12).forEach(event => {
        lines.push(`• ${event.symbol} (${event.timeframe}): ${event.previousTier} → ${event.tier} | score ${event.previousScore} → ${event.score}`);
      });
      if (events.length > 12) lines.push(`… și încă ${events.length - 12} pe tape.`);
      lines.push('');
      lines.push(`Coverage: ${report.scanned}/${report.universeSize}, erori ${report.errors}. Ledger: https://scanner.relayhub.no/tape`);
      lines.push(`_${REGIME_TAPE_DISCLOSURE}_`);
      await this.telegram.sendMarkdown(lines.join('\n'));
    } catch (error) {
      console.warn('Regime tape telegram digest failed:', error instanceof Error ? error.message : error);
    }
  }
}
