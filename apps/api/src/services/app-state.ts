import {
  getScannerAssets,
  NARRATIVE_DEFINITIONS,
  NarrativeSummary,
  MarketNarrativeId,
  Timeframe,
  AssetScannerRow,
  Candle,
  MoneyLineSignal,
  MoneyLineTier,
  DispatchedAlert,
  ScannerMarketClass,
  AssetMarketClass,
  StrategyAlertSnapshot
} from '@money-scanner/shared';
import { MarketDataService } from '@money-scanner/market-data';
import {
  BullishTradePlan,
  MoneyLineEngine,
  calculateBullishTradePlan,
  calculateMTFConfluence,
  calculateMoneyLineCloud,
  getMoneyLineCloudParameters,
  getTradePlanProfile
} from '@money-scanner/money-line';
import { XSocialIntelligenceService, NewsIntelligenceService } from '@money-scanner/social-analysis';
import { AIMarketAnalystService } from '@money-scanner/ai-analysis';
import { AlertDispatcher, TelegramBotHandler } from '@money-scanner/notifications';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { evaluateDailyStrategyAlerts, StrategyAlertEvaluation } from './strategy-alert-service.js';

export interface BullishCloudAlertRule {
  id: string;
  userId: string;
  symbol: string;
  timeframe: Timeframe;
  marketClass: AssetMarketClass;
  isEnabled: boolean;
  createdAt: number;
  lastEvaluatedCandle?: number;
  lastTriggeredCandle?: number;
  lastWasBullish?: boolean;
  lastPlan?: BullishTradePlan;
  lastError?: string;
}

export interface DailyRegimeScanStatus {
  enabled: true;
  schedule: '0 12 * * *';
  timezone: 'Europe/Oslo';
  lastStartedAt?: number;
  lastCompletedAt?: number;
  scannedAssets: number;
  totalAssets?: number;
  matches: number;
  strategyMatches?: number;
  strategyArmed?: number;
  errors: number;
  running: boolean;
  lastError?: string;
}

export type ManualAlertScanScope = 'quick' | 'full';

export interface ManualAlertScanStatus {
  scope: ManualAlertScanScope;
  running: boolean;
  scannedAssets: number;
  totalAssets: number;
  matches: number;
  errors: number;
  lastStartedAt?: number;
  lastCompletedAt?: number;
  nextAllowedAt?: number;
  lastError?: string;
}

export interface ManualAlertScanAssetInput {
  symbol: string;
  marketClass?: AssetMarketClass;
}

export type FlipCandidateDirection = 'BULLISH' | 'BEARISH';
export type FlipCandidateStatus = 'CONFIRMED' | 'AWAITING_CLOSE' | 'VERY_CLOSE' | 'APPROACHING';

export interface FlipCandidate {
  id: string;
  symbol: string;
  marketClass: AssetMarketClass;
  timeframe: Extract<Timeframe, '4h' | '8h' | '1d'>;
  direction: FlipCandidateDirection;
  status: FlipCandidateStatus;
  currentPrice: number;
  triggerPrice: number;
  distancePercent: number;
  distanceAtr: number;
  priorityScore: number;
  atr: number;
  rvol: number;
  moneyLineTier: MoneyLineTier;
  moneyLineScore: number;
  weeklyTier: MoneyLineTier;
  weeklyScore: number;
  sma50: number;
  sma200: number;
  weeklyAligned: boolean;
  sma50Aligned: boolean;
  sma200Aligned: boolean;
  candleTimestamp: number;
  scannedAt: number;
}

interface PreliminaryFlipAsset {
  symbol: string;
  marketClass: AssetMarketClass;
  dailyCandles: Awaited<ReturnType<MarketDataService['getCandles']>>;
  weeklyTier: MoneyLineTier;
  weeklyScore: number;
  candidate: FlipCandidate;
}

interface DailyRegimeMatch {
  symbol: string;
  marketClass: AssetMarketClass;
  scenario: 'WEEKLY_BULL_DAILY_BEAR' | 'WEEKLY_BEAR_DAILY_BULL';
  weeklyTier: MoneyLineTier;
  weeklyScore: number;
  dailyTier: MoneyLineTier;
  previousDailyTier: MoneyLineTier;
  dailyScore: number;
  dailyCandleTimestamp: number;
  price: number;
  sma50: number;
  distanceToSma50Percent: number;
}

const formatAlertPrice = (value: number) => `$${value.toLocaleString('en-US', {
  minimumFractionDigits: value < 1 ? 4 : 2,
  maximumFractionDigits: value < 1 ? 8 : 4
})}`;

const tradePlanActionLabel = (action: BullishTradePlan['action']) => {
  if (action === 'READY') return '🟢 SETUP VALID — intrare numai în zona indicată';
  if (action === 'WAIT_RETEST') return '🟡 AȘTEAPTĂ RETEST — nu urmări prețul';
  return '🔴 EVITĂ ACUM — filtrele nu confirmă un R:R bun';
};

export class AppState {
  public marketData = new MarketDataService();
  public moneyLine = new MoneyLineEngine();
  public social = new XSocialIntelligenceService();
  public news = new NewsIntelligenceService();
  public ai = new AIMarketAnalystService();
  public alertDispatcher = new AlertDispatcher();
  public telegramBot = new TelegramBotHandler();

  public cachedSignals: Map<string, MoneyLineSignal> = new Map(); // key: `${symbol}_${timeframe}`
  public alertHistory: DispatchedAlert[] = [];
  private bullishCloudAlerts = new Map<string, BullishCloudAlertRule>();
  private evaluatingAlertIds = new Set<string>();
  private bullishAlertTimer?: NodeJS.Timeout;
  private dailyRegimeScanPromise?: Promise<DailyRegimeScanStatus>;
  private dailyRegimeStateLoadedAt = 0;
  private manualAlertScanPromises = new Map<string, Promise<ManualAlertScanStatus>>();
  private manualAlertScanStatuses = new Map<string, ManualAlertScanStatus>();
  private manualAlertScanNextAllowed = new Map<string, number>();
  private flipCandidates: FlipCandidate[] = [];
  private strategySetups: StrategyAlertSnapshot[] = [];
  private dailyRegimeScanStatus: DailyRegimeScanStatus = {
    enabled: true,
    schedule: '0 12 * * *',
    timezone: 'Europe/Oslo',
    scannedAssets: 0,
    matches: 0,
    errors: 0,
    running: false
  };

  private static instance: AppState;

  public static getInstance(): AppState {
    if (!AppState.instance) {
      AppState.instance = new AppState();
    }
    return AppState.instance;
  }

  private bullishAlertId(userId: string, symbol: string, timeframe: Timeframe) {
    return `${userId}:${symbol.toUpperCase()}:${timeframe}`;
  }

  public getBullishCloudAlert(userId: string, symbol: string, timeframe: Timeframe) {
    return this.bullishCloudAlerts.get(this.bullishAlertId(userId, symbol, timeframe));
  }

  public listBullishCloudAlerts(userId: string) {
    return Array.from(this.bullishCloudAlerts.values()).filter(rule => rule.userId === userId && rule.isEnabled);
  }

  public async getAlertsDashboard(userId: string) {
    await this.restoreDailyRegimeState();
    const rules = this.listBullishCloudAlerts(userId);
    const activeAlerts = [];
    const concurrency = 4;
    for (let index = 0; index < rules.length; index += concurrency) {
      const settled = await Promise.allSettled(
        rules.slice(index, index + concurrency).map(rule => this.getBullishAlertProgress(rule))
      );
      activeAlerts.push(...settled.flatMap(result => result.status === 'fulfilled' ? [result.value] : []));
    }

    const history = this.alertHistory.filter(alert =>
      alert.ruleId?.startsWith(`${userId}:`)
      || alert.type === 'MultiTimeframeReversal'
      || alert.type === 'StrategySetup'
    );
    return {
      activeAlerts,
      history,
      dailyRegimeScan: { ...this.dailyRegimeScanStatus },
      manualScan: this.getManualAlertScanStatus(userId),
      flipCandidates: this.flipCandidates.map(candidate => ({ ...candidate })),
      strategySetups: this.strategySetups.map(setup => ({ ...setup })),
      updatedAt: Date.now(),
      ...this.telegramBot.getDeliveryConfiguration()
    };
  }

  public getDailyRegimeScanStatus() {
    return { ...this.dailyRegimeScanStatus };
  }

  public getManualAlertScanStatus(userId: string): ManualAlertScanStatus {
    const status = this.manualAlertScanStatuses.get(userId);
    if (status?.running && status.scope === 'full') {
      return {
        ...status,
        scannedAssets: this.dailyRegimeScanStatus.scannedAssets,
        totalAssets: this.dailyRegimeScanStatus.totalAssets || status.totalAssets,
        matches: this.dailyRegimeScanStatus.matches,
        errors: this.dailyRegimeScanStatus.errors
      };
    }
    return { ...(status || {
      scope: 'quick',
      running: false,
      scannedAssets: 0,
      totalAssets: 0,
      matches: 0,
      errors: 0
    }) };
  }

  public getManualAlertScanCooldown(userId: string, scope: ManualAlertScanScope) {
    return Math.max(0, (this.manualAlertScanNextAllowed.get(`${userId}:${scope}`) || 0) - Date.now());
  }

  public runManualAlertScan(
    userId: string,
    scope: ManualAlertScanScope,
    watchlist: ManualAlertScanAssetInput[] = []
  ): Promise<ManualAlertScanStatus> {
    const existing = this.manualAlertScanPromises.get(userId);
    if (existing) return existing;

    const cooldownMs = this.getManualAlertScanCooldown(userId, scope);
    if (cooldownMs > 0) {
      const retryAfterSeconds = Math.max(1, Math.ceil(cooldownMs / 1000));
      return Promise.reject(Object.assign(
        new Error(`Scanarea poate fi pornită din nou în ${retryAfterSeconds} secunde.`),
        { code: 'SCAN_COOLDOWN', retryAfterSeconds }
      ));
    }

    const startedAt = Date.now();
    const cooldownDuration = scope === 'full' ? 10 * 60_000 : 60_000;
    this.manualAlertScanNextAllowed.set(`${userId}:${scope}`, startedAt + cooldownDuration);
    this.manualAlertScanStatuses.set(userId, {
      scope,
      running: true,
      scannedAssets: 0,
      totalAssets: 0,
      matches: 0,
      errors: 0,
      lastStartedAt: startedAt,
      nextAllowedAt: startedAt + cooldownDuration
    });

    const promise = (scope === 'full'
      ? this.executeManualFullScan(userId)
      : this.executeManualQuickScan(userId, watchlist)
    ).finally(() => {
      this.manualAlertScanPromises.delete(userId);
    });
    this.manualAlertScanPromises.set(userId, promise);
    return promise;
  }

  private updateManualAlertScanStatus(userId: string, patch: Partial<ManualAlertScanStatus>) {
    const current = this.getManualAlertScanStatus(userId);
    const next = { ...current, ...patch };
    this.manualAlertScanStatuses.set(userId, next);
    return next;
  }

  private async executeManualFullScan(userId: string): Promise<ManualAlertScanStatus> {
    try {
      const result = await this.runDailyRegimeScan();
      return this.updateManualAlertScanStatus(userId, {
        scope: 'full',
        running: false,
        scannedAssets: result.scannedAssets,
        totalAssets: result.totalAssets || result.scannedAssets,
        matches: result.matches,
        errors: result.errors,
        lastCompletedAt: Date.now(),
        lastError: result.lastError
      });
    } catch (error) {
      return this.updateManualAlertScanStatus(userId, {
        scope: 'full',
        running: false,
        lastCompletedAt: Date.now(),
        lastError: error instanceof Error ? error.message : 'Scanarea completă a eșuat.'
      });
    }
  }

  private async executeManualQuickScan(
    userId: string,
    watchlist: ManualAlertScanAssetInput[]
  ): Promise<ManualAlertScanStatus> {
    try {
      // A manual scan may be the first request handled by a fresh Cloud Run
      // instance. Restore persisted history before checking idempotency keys.
      await this.restoreDailyRegimeState(true);
      const activeRules = this.listBullishCloudAlerts(userId);
      const universe = new Map<string, { symbol: string; marketClass: AssetMarketClass }>();
      const addAsset = (symbol: string, marketClass: AssetMarketClass) => {
        const normalizedSymbol = symbol.replace(/^[$#]/, '').trim().toUpperCase();
        if (!/^[A-Z0-9._-]{1,30}$/.test(normalizedSymbol)) return;
        universe.set(`${marketClass}:${normalizedSymbol}`, { symbol: normalizedSymbol, marketClass });
      };

      activeRules.forEach(rule => addAsset(rule.symbol, rule.marketClass));
      const catalog = getScannerAssets('ALL');
      const normalizedWatchlist = watchlist.slice(0, 50).map(item => ({
        symbol: String(item.symbol || '').replace(/^[$#]/, '').trim().toUpperCase(),
        marketClass: item.marketClass
      })).filter(item => /^[A-Z0-9._-]{1,30}$/.test(item.symbol));
      const unresolvedSymbols: string[] = [];

      normalizedWatchlist.forEach(item => {
        const catalogAsset = item.marketClass
          ? catalog.find(asset => asset.symbol === item.symbol && asset.marketClass === item.marketClass)
          : catalog.find(asset => asset.symbol === item.symbol);
        const marketClass = item.marketClass || catalogAsset?.marketClass;
        if (marketClass === 'crypto' || marketClass === 'stocks' || marketClass === 'metals') {
          addAsset(item.symbol, marketClass);
        } else {
          unresolvedSymbols.push(item.symbol);
        }
      });

      if (unresolvedSymbols.length) {
        const liveCrypto = await this.marketData.getTopCryptoAssets(100);
        unresolvedSymbols.forEach(symbol => {
          if (liveCrypto.some(asset => asset.symbol.toUpperCase() === symbol)) addAsset(symbol, 'crypto');
        });
      }

      const assets = Array.from(universe.values());
      let errors = normalizedWatchlist.filter(item =>
        !assets.some(asset => asset.symbol === item.symbol && (!item.marketClass || asset.marketClass === item.marketClass))
      ).length;
      const matches: DailyRegimeMatch[] = [];
      const strategyEvaluations: StrategyAlertEvaluation[] = [];
      const strategyEvents: StrategyAlertSnapshot[] = [];
      const strategyBenchmarks = await this.getDailyStrategyBenchmarks();
      this.updateManualAlertScanStatus(userId, {
        scope: 'quick',
        running: true,
        scannedAssets: 0,
        totalAssets: assets.length,
        matches: 0,
        errors
      });

      const concurrency = 4;
      for (let index = 0; index < assets.length; index += concurrency) {
        const batch = assets.slice(index, index + concurrency);
        const settled = await Promise.allSettled(batch.map(async asset => {
          const matchingRules = activeRules.filter(rule =>
            rule.symbol === asset.symbol && rule.marketClass === asset.marketClass
          );
          const [dailyRaw, weeklyRaw] = await Promise.all([
            this.marketData.getCandles(asset.symbol, '1d', 320, asset.marketClass),
            this.marketData.getCandles(asset.symbol, '1w', 260, asset.marketClass)
          ]);
          await Promise.allSettled(matchingRules.map(rule => this.evaluateBullishCloudAlert(rule)));

          const currentUtcDay = new Date();
          currentUtcDay.setUTCHours(0, 0, 0, 0);
          const dailyCandles = dailyRaw.map(candle =>
            candle.isClosed === false && candle.timestamp < currentUtcDay.getTime()
              ? { ...candle, isClosed: true }
              : candle
          );
          const candles4hRaw = asset.marketClass === 'crypto'
            ? await this.marketData.getCandles(asset.symbol, '4h', 100, asset.marketClass).catch(() => [])
            : [];
          const benchmarkCandles = strategyBenchmarks[asset.marketClass === 'crypto' ? 'crypto' : 'stocks'] || [];
          const strategy = evaluateDailyStrategyAlerts(
            asset.symbol,
            asset.marketClass,
            dailyCandles,
            benchmarkCandles,
            weeklyRaw,
            candles4hRaw
          );
          return {
            regime: this.evaluateDailyRegimeAsset(
              asset.symbol,
              asset.marketClass,
              dailyCandles,
              weeklyRaw
            ),
            strategy
          };
        }));

        settled.forEach(result => {
          if (result.status === 'fulfilled') {
            if (result.value.regime) matches.push(result.value.regime);
            strategyEvaluations.push(result.value.strategy);
            strategyEvents.push(...result.value.strategy.events);
          } else {
            errors += 1;
            console.warn('Quick manual alert scan failed:', result.reason instanceof Error ? result.reason.message : result.reason);
          }
        });
        this.updateManualAlertScanStatus(userId, {
          scannedAssets: Math.min(assets.length, index + batch.length),
          matches: matches.length + strategyEvaluations.filter(result => result.current).length,
          errors
        });
      }

      await this.publishDailyRegimeMatches(matches, 'manual quick scan');
      await this.publishStrategyEvents(strategyEvents, 'manual quick scan');
      this.mergeStrategySetups(
        assets.map(asset => `${asset.marketClass}:${asset.symbol}`),
        strategyEvaluations.flatMap(result => result.current ? [result.current] : [])
      );
      await this.persistDailyRegimeState();
      return this.updateManualAlertScanStatus(userId, {
        scope: 'quick',
        running: false,
        scannedAssets: assets.length,
        totalAssets: assets.length,
        matches: matches.length + strategyEvaluations.filter(result => result.current).length,
        errors,
        lastCompletedAt: Date.now(),
        lastError: undefined
      });
    } catch (error) {
      return this.updateManualAlertScanStatus(userId, {
        scope: 'quick',
        running: false,
        lastCompletedAt: Date.now(),
        lastError: error instanceof Error ? error.message : 'Scanarea rapidă a eșuat.'
      });
    }
  }

  /**
   * Daily, closed-candle scan for counter-trend MoneyLine regime changes.
   * The live Top 50 crypto universe is combined with every stock and metal
   * shown in Market 360. Weekly context must already be directional, while
   * the latest Daily candle must cross into the opposite tier and confirm on
   * the correct side of SMA 50.
   */
  public runDailyRegimeScan(): Promise<DailyRegimeScanStatus> {
    if (this.dailyRegimeScanPromise) return this.dailyRegimeScanPromise;

    this.dailyRegimeScanPromise = this.executeDailyRegimeScan().finally(() => {
      this.dailyRegimeScanPromise = undefined;
    });
    return this.dailyRegimeScanPromise;
  }

  private async executeDailyRegimeScan(): Promise<DailyRegimeScanStatus> {
    // Restore the last persisted results first so scheduler retries or cold
    // starts cannot duplicate a signal for the same closed Daily candle.
    await this.restoreDailyRegimeState(true);
    this.dailyRegimeScanStatus = {
      ...this.dailyRegimeScanStatus,
      lastStartedAt: Date.now(),
      running: true,
      scannedAssets: 0,
      matches: 0,
      strategyMatches: 0,
      strategyArmed: 0,
      errors: 0,
      lastError: undefined
    };

    try {
      const [liveCrypto, stocks, metals] = await Promise.all([
        this.marketData.getTopCryptoAssets(50),
        Promise.resolve(getScannerAssets('stocks')),
        Promise.resolve(getScannerAssets('metals'))
      ]);
      const universe = [...liveCrypto, ...stocks, ...metals].filter(
        asset => asset.marketClass === 'crypto' || asset.marketClass === 'stocks' || asset.marketClass === 'metals'
      );
      const strategyBenchmarks = await this.getDailyStrategyBenchmarks();
      this.dailyRegimeScanStatus.totalAssets = universe.length;
      const matches: DailyRegimeMatch[] = [];
      const strategyEvaluations: StrategyAlertEvaluation[] = [];
      const strategyEvents: StrategyAlertSnapshot[] = [];
      const preliminaryFlipAssets: PreliminaryFlipAsset[] = [];
      let errors = 0;
      const concurrency = 6;

      for (let index = 0; index < universe.length; index += concurrency) {
        const batch = universe.slice(index, index + concurrency);
        const settled = await Promise.allSettled(batch.map(async asset => {
          const marketClass = asset.marketClass as AssetMarketClass;
          const [dailyRaw, weeklyRaw] = await Promise.all([
            this.marketData.getCandles(asset.symbol, '1d', 320, marketClass),
            this.marketData.getCandles(asset.symbol, '1w', 260, marketClass)
          ]);
          const currentUtcDay = new Date();
          currentUtcDay.setUTCHours(0, 0, 0, 0);
          // Yahoo marks its newest row as open even when it is yesterday's
          // completed session. A row from before the current UTC day is safe.
          const dailyCandles = dailyRaw.map(candle =>
            candle.isClosed === false && candle.timestamp < currentUtcDay.getTime()
              ? { ...candle, isClosed: true }
              : candle
          );
          const weeklySignal = this.moneyLine.calculateLatest(asset.symbol, '1w', weeklyRaw);
          const dailyClosed = dailyCandles
            .filter(candle => candle.isClosed !== false)
            .sort((left, right) => left.timestamp - right.timestamp);
          const preliminaryCandidate = weeklySignal
            ? this.calculateFlipCandidate(
              asset.symbol,
              marketClass,
              '1d',
              dailyClosed,
              dailyClosed[dailyClosed.length - 1]?.close || 0,
              weeklySignal.tier,
              weeklySignal.score
            )
            : undefined;
          const candles4hRaw = marketClass === 'crypto'
            ? await this.marketData.getCandles(asset.symbol, '4h', 100, marketClass).catch(() => [])
            : [];
          const benchmarkCandles = strategyBenchmarks[marketClass === 'crypto' ? 'crypto' : 'stocks'] || [];
          return {
            match: this.evaluateDailyRegimeAsset(asset.symbol, marketClass, dailyCandles, weeklyRaw),
            strategy: evaluateDailyStrategyAlerts(
              asset.symbol,
              marketClass,
              dailyCandles,
              benchmarkCandles,
              weeklyRaw,
              candles4hRaw
            ),
            preliminary: preliminaryCandidate && weeklySignal
              ? {
                symbol: asset.symbol,
                marketClass,
                dailyCandles: dailyClosed,
                weeklyTier: weeklySignal.tier,
                weeklyScore: weeklySignal.score,
                candidate: preliminaryCandidate
              }
              : undefined
          };
        }));

        settled.forEach(result => {
          if (result.status === 'fulfilled') {
            if (result.value.match) matches.push(result.value.match);
            strategyEvaluations.push(result.value.strategy);
            strategyEvents.push(...result.value.strategy.events);
            if (result.value.preliminary) preliminaryFlipAssets.push(result.value.preliminary);
          } else {
            errors += 1;
            console.warn('Daily regime asset scan failed:', result.reason instanceof Error ? result.reason.message : result.reason);
          }
        });
        this.dailyRegimeScanStatus.scannedAssets += settled.filter(result => result.status === 'fulfilled').length;
      }

      this.flipCandidates = await this.enrichAndRankFlipCandidates(preliminaryFlipAssets);
      this.strategySetups = strategyEvaluations.flatMap(result => result.current ? [result.current] : []);

      await this.publishDailyRegimeMatches(matches, 'scheduled/full scan');
      await this.publishStrategyEvents(strategyEvents, 'scheduled/full scan');

      this.dailyRegimeScanStatus = {
        ...this.dailyRegimeScanStatus,
        lastCompletedAt: Date.now(),
        matches: matches.length + this.strategySetups.length,
        strategyMatches: this.strategySetups.filter(setup => setup.stage === 'CONFIRMED').length,
        strategyArmed: this.strategySetups.filter(setup => setup.stage === 'ARMED').length,
        errors,
        running: false
      };
      await this.persistDailyRegimeState();
    } catch (error) {
      this.dailyRegimeScanStatus = {
        ...this.dailyRegimeScanStatus,
        lastCompletedAt: Date.now(),
        running: false,
        lastError: error instanceof Error ? error.message : 'Scanarea zilnică a eșuat.'
      };
      console.error('Daily MoneyLine regime scan failed:', this.dailyRegimeScanStatus.lastError);
      await this.persistDailyRegimeState();
    }

    return { ...this.dailyRegimeScanStatus };
  }

  private async getDailyStrategyBenchmarks(): Promise<Record<'crypto' | 'stocks', Candle[]>> {
    const [btcRaw, spyRaw] = await Promise.all([
      this.marketData.getCandles('BTC', '1d', 340, 'crypto'),
      this.marketData.getCandles('SPY', '1d', 340, 'stocks')
    ]);
    const currentUtcDay = new Date();
    currentUtcDay.setUTCHours(0, 0, 0, 0);
    const normalize = (candles: Candle[]) => candles.map(candle =>
      candle.isClosed === false && candle.timestamp < currentUtcDay.getTime()
        ? { ...candle, isClosed: true }
        : candle
    );
    return { crypto: normalize(btcRaw), stocks: normalize(spyRaw) };
  }

  private mergeStrategySetups(evaluatedAssetKeys: string[], current: StrategyAlertSnapshot[]) {
    const evaluated = new Set(evaluatedAssetKeys);
    const retained = this.strategySetups.filter(setup => !evaluated.has(`${setup.marketClass}:${setup.symbol}`));
    this.strategySetups = [...current, ...retained]
      .sort((left, right) => right.candleTimestamp - left.candleTimestamp)
      .slice(0, 100);
  }

  private async publishStrategyEvents(
    events: StrategyAlertSnapshot[],
    source: 'scheduled/full scan' | 'manual quick scan'
  ) {
    const dashboardBaseUrl = process.env.PUBLIC_BASE_URL || 'https://market-scanner-360-384051756749.europe-west3.run.app';
    const freshEvents = events.filter(event => {
      const idempotencyKey = `strategy:${event.strategy}:${event.stage}:${event.symbol}:${event.candleTimestamp}`;
      return !this.alertHistory.some(alert => alert.idempotencyKey === idempotencyKey);
    });

    for (const event of freshEvents) {
      const isLong = event.side === 'LONG';
      const isArmed = event.stage === 'ARMED';
      const isLongArmed = isLong && isArmed;
      const isShortArmed = !isLong && isArmed;
      const isDonchian = event.strategy === 'WEEKLY_DONCHIAN_55_LONG';
      const strategyName = isDonchian
        ? 'Weekly Trend + Donchian 55/20 LONG'
        : event.strategy === 'BEAR_RALLY_FADE_SHORT'
        ? 'Bear Rally Fade'
        : event.strategy === 'MONEYLINE_MACRO_LONG'
        ? 'MoneyLine Macro Trend Breakout'
        : 'MoneyLine 4H Sniper Confluence';

      const headline = isDonchian && isArmed
        ? `🟡 *DONCHIAN 55 LONG APROAPE — NU INTRA ÎNCĂ*`
        : isDonchian
        ? `🟢 *DONCHIAN 55 LONG CONFIRMAT*`
        : event.strategy === 'MONEYLINE_MACRO_LONG'
        ? `🚀 *MONEYLINE MACRO BULL FLIP CONFIRMAT*`
        : event.strategy === 'MONEYLINE_4H_SNIPER_LONG'
        ? `⚡ *MONEYLINE 4H SNIPER FLIP CONFIRMAT*`
        : isLongArmed
        ? `🟡 *SETUP LONG ARMAT — NU INTRA ÎNCĂ*`
        : isShortArmed
        ? `⚠️ *SHORT REBOUND ARMAT — NU INTRA ÎNCĂ*`
        : isLong
        ? `🟢 *SETUP LONG CONFIRMAT*`
        : `🔴 *BEAR RALLY SHORT CONFIRMAT*`;

      const actionLines = isDonchian && isArmed
        ? [
            `*Acțiune:* așteaptă o închidere Daily peste Donchian 55 la ${formatAlertPrice(event.donchianHigh55 || 0)}.`,
            `*Filtru de execuție:* la următorul open, acceptă numai gap ≤ 1 ATR și risc final ≤ ${event.maxRiskPercent || 4}%.`
          ]
        : isLongArmed
        ? [
            `*Acțiune:* așteaptă confirmarea regulilor strategiei pe o lumânare închisă.`,
            `*Invalidare:* setup-ul se anulează dacă regimul de trend este pierdut.`
          ]
        : isShortArmed
        ? [
            `*Acțiune:* așteaptă RSI(2) să treacă sub 50 în maximum ${event.confirmationWindowRemaining ?? 3} închideri Daily.`,
            `*Invalidare:* expiră după trei lumânări sau dacă regimul bearish este pierdut.`
          ]
        : [
            `*Execuție:* la următorul open; ${formatAlertPrice(event.entryReference)} este referința închiderii-semnal.`,
            `*STOP LOSS de referință:* ${formatAlertPrice(event.stopLoss)} (${event.riskPercent.toFixed(2)}%)`,
            `*Ținta orientativă 1 (1.5R):* ${formatAlertPrice(event.target1)}`,
            `*Ținta orientativă 2 (3.0R):* ${formatAlertPrice(event.target2)}`,
            `*Ieșire principală:* ${event.exitRule}`
          ];

      let contextLines: string[] = [];
      if (isDonchian) {
        contextLines = [
          `*Regim Weekly:* MoneyLine Fast + Slow bullish`,
          `*SMA40 Weekly:* ${formatAlertPrice(event.weeklySma40 || 0)} > ${formatAlertPrice(event.weeklySma40EightWeeksAgo || 0)} (acum 8 săpt.)`,
          `*Trend Daily:* close > SMA200 și SMA50 > SMA200; ambele medii cresc`,
          `*Donchian 55:* ${formatAlertPrice(event.donchianHigh55 || 0)}${isArmed ? ` · distanță ${event.distanceToBreakoutPercent?.toFixed(2) || '0.00'}%` : ' · breakout închis'}`,
          `*Momentum 12 luni:* +${event.momentum252Percent?.toFixed(2) || '0.00'}% | *Percentilă ATR:* ${event.atrPercentile?.toFixed(1) || '0.0'}%`
        ];
      } else if (event.strategy === 'MONEYLINE_MACRO_LONG') {
        contextLines = [
          `*Regim:* Weekly MoneyLine Bullish + Daily Bull Flip`,
          `*Trend:* close ${formatAlertPrice(event.signalPrice)} > SMA200 ${formatAlertPrice(event.sma200 || 0)}`,
          `*SMA 50:* ${formatAlertPrice(event.sma50 || 0)} (în creștere)`
        ];
      } else if (event.strategy === 'MONEYLINE_4H_SNIPER_LONG') {
        contextLines = [
          `*Timeframe:* 4H (Intrare Sniper pe lumânare închisă)`,
          `*Regim:* Daily MoneyLine Bullish`,
          `*Trend 4H:* Bull Flip confirmat`
        ];
      } else if (isLong) {
        contextLines = [
          `*Trend:* close ${formatAlertPrice(event.signalPrice)} > SMA200 ${formatAlertPrice(event.sma200 || 0)}`,
          isArmed
            ? `*Armare:* RSI(2) ${event.rsi2?.toFixed(2) || '0'} < 5`
            : `*Confirmare:* RSI(2) ${event.previousRsi2?.toFixed(2) || '0'} → ${event.rsi2?.toFixed(2) || '0'} (>50)`
        ];
      } else {
        contextLines = [
          `*RSI(2):* ${event.previousRsi2?.toFixed(2) || '0'} → ${event.rsi2?.toFixed(2) || '0'}${isArmed ? ' (>95)' : ' (confirmare sub 50)'}`,
          `*Asset bearish:* close < SMA200, SMA50 < SMA200 și SMA200 în scădere`,
          `*Benchmark ${event.benchmarkSymbol}:* ${event.benchmarkBearish ? 'bearish confirmat' : 'neconfirmat'} · close ${formatAlertPrice(event.benchmarkClose || 0)}`
        ];
      }

      const message = [
        headline,
        `*${strategyName} · ${event.timeframe.toUpperCase()}*`,
        `\n*$${event.symbol}* • ${event.marketClass.toUpperCase()} • ${formatAlertPrice(event.signalPrice)}`,
        ...contextLines,
        `*ATR(14):* ${formatAlertPrice(event.atr14)}${event.sma5 ? ` | *SMA5:* ${formatAlertPrice(event.sma5)}` : ''}`,
        '',
        ...actionLines,
        `\n_Semnal determinist pe lumânare închisă. Nivelurile trebuie recalculate la execuția reală și nu garantează profitul._`,
        source === 'manual quick scan' ? `_Sursă: scanare manuală rapidă._` : `_Sursă: scanare automată/completă._`,
        `\n🔗 [Deschide pagina Alerte](${dashboardBaseUrl})`
      ].join('\n');
      const delivered = await this.telegramBot.sendMarkdown(message);

      let reason = '';
      if (isDonchian) {
        reason = isArmed
          ? 'Candidat LONG Donchian: toate filtrele Weekly/Daily sunt valide, iar prețul este la maximum 1 ATR sub breakout; încă nu există intrare.'
          : 'LONG Donchian confirmat: close Daily peste maximul precedentelor 55 sesiuni, în regim Weekly bullish și cu risc estimat maximum 4%.';
      } else if (event.strategy === 'MONEYLINE_MACRO_LONG') {
        reason = 'MoneyLine Macro Breakout: Bull Flip pe Daily confirmat de Weekly Bullish și preț peste SMA 200.';
      } else if (event.strategy === 'MONEYLINE_4H_SNIPER_LONG') {
        reason = 'MoneyLine 4H Sniper: Bull Flip pe 4H apărut într-un regim Daily/Weekly Bullish.';
      } else if (isArmed) {
        reason = isLong
          ? 'Pullback LONG armat: prețul este peste SMA200 și RSI(2) a coborât sub 5; intrarea așteaptă confirmarea peste 50.'
          : 'Rebound bearish armat: RSI(2) a trecut peste 95 în regim bearish confirmat; intrarea așteaptă revenirea sub 50.';
      } else {
        reason = isLong
          ? 'Setup LONG confirmat pe lumânare închisă și filtrele strategiei active.'
          : 'Bear Rally Fade SHORT confirmat: după RSI(2) peste 95, RSI(2) a revenit sub 50 în fereastra de trei lumânări.';
      }

      this.alertHistory.unshift({
        id: `strategy_${Date.now()}_${event.symbol}_${Math.floor(Math.random() * 1000)}`,
        idempotencyKey: `strategy:${event.strategy}:${event.stage}:${event.symbol}:${event.candleTimestamp}`,
        ruleId: 'global:daily-strategy-scan',
        symbol: event.symbol,
        type: 'StrategySetup',
        title: `${strategyName}: ${event.stage === 'ARMED' ? 'armat' : `${event.side} confirmat`} — ${event.symbol}`,
        message,
        timeframe: event.timeframe,
        price: event.signalPrice,
        reason,
        confidence: isDonchian ? (isArmed ? 0.58 : 0.74) : isArmed ? 0.5 : isLong ? 0.68 : 0.67,
        timestamp: Date.now(),
        dashboardLink: dashboardBaseUrl,
        isDelivered: delivered,
        strategySetup: event
      });
    }
    if (this.alertHistory.length > 250) this.alertHistory.splice(250);
    return freshEvents.length;
  }

  private async publishDailyRegimeMatches(
    matches: DailyRegimeMatch[],
    source: 'scheduled/full scan' | 'manual quick scan'
  ) {
    const freshMatches = matches.filter(match => {
      const idempotencyKey = `daily-regime:${match.scenario}:${match.symbol}:${match.dailyCandleTimestamp}`;
      return !this.alertHistory.some(alert => alert.idempotencyKey === idempotencyKey);
    });
    const dashboardBaseUrl = process.env.PUBLIC_BASE_URL || 'https://market-scanner-360-384051756749.europe-west3.run.app';
    let delivered = false;

    if (freshMatches.length) {
      const riskOff = freshMatches.filter(match => match.scenario === 'WEEKLY_BULL_DAILY_BEAR');
      const reversal = freshMatches.filter(match => match.scenario === 'WEEKLY_BEAR_DAILY_BULL');
      const lines = [
        source === 'manual quick scan'
          ? `⚡ *SCANARE RAPIDĂ WATCHLIST / ALERTE*`
          : `🚨 *SCANARE GENERALĂ ML 1W / ML 1D / SMA 50*`,
        `*${freshMatches.length} setup${freshMatches.length === 1 ? '' : '-uri'} nou${freshMatches.length === 1 ? '' : 'e'} confirmat${freshMatches.length === 1 ? '' : 'e'} pe lumânări închise*`,
        ''
      ];
      if (riskOff.length) {
        lines.push(`🔴 *RISK-OFF — 1W bullish, 1D flip bearish sub SMA 50*`);
        riskOff.forEach(match => lines.push(
          `▼ *$${match.symbol}* · ${formatAlertPrice(match.price)} · SMA50 ${formatAlertPrice(match.sma50)} · ML1W ${match.weeklyTier} (${match.weeklyScore > 0 ? '+' : ''}${match.weeklyScore}) · ML1D ${match.dailyTier} (${match.dailyScore})`
        ));
        lines.push('');
      }
      if (reversal.length) {
        lines.push(`🟢 *REVERSAL LONG — 1W bearish, 1D flip bullish peste SMA 50*`);
        reversal.forEach(match => lines.push(
          `▲ *$${match.symbol}* · ${formatAlertPrice(match.price)} · SMA50 ${formatAlertPrice(match.sma50)} · ML1W ${match.weeklyTier} (${match.weeklyScore}) · ML1D ${match.dailyTier} (+${match.dailyScore})`
        ));
        lines.push('');
      }
      lines.push(
        source === 'manual quick scan'
          ? `_Scanare inițiată manual. Semnalele folosesc numai lumânări închise și nu se trimit din nou pentru aceeași lumânare._`
          : `_Scanarea rulează automat o dată pe zi, la 12:00 Europe/Oslo. Semnalele sunt tehnice, nu recomandări financiare._`,
        `🔗 [Deschide pagina Alerte](${dashboardBaseUrl})`
      );
      delivered = await this.telegramBot.sendMarkdown(lines.join('\n'));
    }

    freshMatches.forEach(match => {
      const isRiskOff = match.scenario === 'WEEKLY_BULL_DAILY_BEAR';
      const reason = isRiskOff
        ? 'ML 1W este bullish, ML 1D a devenit bearish și închiderea zilnică este sub SMA 50.'
        : 'ML 1W este bearish, ML 1D a devenit bullish și închiderea zilnică este peste SMA 50.';
      this.alertHistory.unshift({
        id: `daily_regime_${Date.now()}_${match.symbol}_${Math.floor(Math.random() * 1000)}`,
        idempotencyKey: `daily-regime:${match.scenario}:${match.symbol}:${match.dailyCandleTimestamp}`,
        ruleId: 'global:daily-regime-scan',
        symbol: match.symbol,
        type: 'MultiTimeframeReversal',
        title: isRiskOff ? 'Risk-off Daily în context Weekly bullish' : 'Reversal bullish Daily în context Weekly bearish',
        message: reason,
        timeframe: '1d',
        price: match.price,
        tier: match.dailyTier,
        previousTier: match.previousDailyTier,
        reason,
        confidence: Math.min(1, Math.abs(match.dailyScore - match.weeklyScore) / 100),
        timestamp: Date.now(),
        dashboardLink: dashboardBaseUrl,
        isDelivered: delivered,
        regimeScan: {
          scenario: match.scenario,
          marketClass: match.marketClass,
          weeklyTier: match.weeklyTier,
          weeklyScore: match.weeklyScore,
          dailyTier: match.dailyTier,
          previousDailyTier: match.previousDailyTier,
          dailyScore: match.dailyScore,
          dailyCandleTimestamp: match.dailyCandleTimestamp,
          sma50: match.sma50,
          distanceToSma50Percent: match.distanceToSma50Percent
        }
      });
    });
    if (this.alertHistory.length > 250) this.alertHistory.splice(250);
    return freshMatches.length;
  }

  private dailyRegimeDocument() {
    const app = getApps()[0] || initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0610749770'
    });
    return getFirestore(app, 'money-scanner-360').doc('operations/daily-regime-scan');
  }

  private async restoreDailyRegimeState(force = false) {
    if (!force && Date.now() - this.dailyRegimeStateLoadedAt < 30_000) return;
    try {
      const snapshot = await this.dailyRegimeDocument().get();
      this.dailyRegimeStateLoadedAt = Date.now();
      if (!snapshot.exists) return;
      const stored = snapshot.data() as {
        status?: DailyRegimeScanStatus;
        alerts?: DispatchedAlert[];
        flipCandidates?: FlipCandidate[];
        strategySetups?: StrategyAlertSnapshot[];
      } | undefined;
      if (stored?.status) this.dailyRegimeScanStatus = { ...stored.status, running: false };
      if (Array.isArray(stored?.flipCandidates)) this.flipCandidates = stored.flipCandidates.slice(0, 10);
      if (Array.isArray(stored?.strategySetups)) {
        this.strategySetups = stored.strategySetups
          // Connors was retired in favor of the validated stocks/ETF-only
          // Weekly Trend + Donchian 55/20 LONG strategy.
          .filter(setup => String(setup.strategy) !== 'CONNORS_RSI2_LONG')
          .slice(0, 100);
      }
      if (Array.isArray(stored?.alerts)) {
        const individual = this.alertHistory.filter(alert =>
          alert.type !== 'MultiTimeframeReversal' && alert.type !== 'StrategySetup'
        );
        const migratedAlerts = stored.alerts.filter(alert =>
          String(alert.strategySetup?.strategy || '') !== 'CONNORS_RSI2_LONG'
        );
        this.alertHistory = [...migratedAlerts, ...individual]
          .sort((left, right) => right.timestamp - left.timestamp)
          .slice(0, 250);
      }
    } catch (error) {
      // The scan and Telegram delivery still work in memory if persistence is
      // temporarily unavailable. Surface the problem in logs without taking
      // the user's alerts page down.
      console.warn('Daily regime state restore failed:', error instanceof Error ? error.message : error);
    }
  }

  private async persistDailyRegimeState() {
    try {
      const alerts = this.alertHistory
        .filter(alert => alert.type === 'MultiTimeframeReversal' || alert.type === 'StrategySetup')
        .slice(0, 200);
      // JSON normalization strips optional undefined values rejected by
      // Firestore while preserving the exact dashboard payload shape.
      const payload = JSON.parse(JSON.stringify({
        status: this.dailyRegimeScanStatus,
        alerts,
        flipCandidates: this.flipCandidates,
        strategySetups: this.strategySetups,
        updatedAt: Date.now()
      }));
      await this.dailyRegimeDocument().set(payload, { merge: true });
      this.dailyRegimeStateLoadedAt = Date.now();
    } catch (error) {
      console.warn('Daily regime state persistence failed:', error instanceof Error ? error.message : error);
    }
  }

  private calculateFlipCandidate(
    symbol: string,
    marketClass: AssetMarketClass,
    timeframe: Extract<Timeframe, '4h' | '8h' | '1d'>,
    candles: Awaited<ReturnType<MarketDataService['getCandles']>>,
    currentPrice: number,
    weeklyTier: MoneyLineTier,
    weeklyScore: number
  ): FlipCandidate | undefined {
    const closedCandles = candles
      .filter(candle => candle.isClosed !== false)
      .sort((left, right) => left.timestamp - right.timestamp);
    if (closedCandles.length < 50 || !Number.isFinite(currentPrice) || currentPrice <= 0) return undefined;

    const cloud = calculateMoneyLineCloud(closedCandles, timeframe);
    const signal = this.moneyLine.calculateLatest(symbol, timeframe, closedCandles);
    if (!signal) return undefined;
    const lastIndex = closedCandles.length - 1;
    const latestBullFlip = cloud.buySignals[lastIndex] === true;
    const latestBearFlip = cloud.sellSignals[lastIndex] === true;
    const slowBullish = cloud.dirSlow[lastIndex] < 0;
    const direction: FlipCandidateDirection = latestBullFlip
      ? 'BULLISH'
      : latestBearFlip
        ? 'BEARISH'
        : slowBullish ? 'BEARISH' : 'BULLISH';
    const confirmed = latestBullFlip || latestBearFlip;
    const rawTrigger = confirmed && lastIndex > 0
      ? cloud.lineSlow[lastIndex - 1]
      : cloud.lineSlow[lastIndex];
    const triggerPrice = Number.isFinite(rawTrigger) && rawTrigger > 0 ? rawTrigger : currentPrice;
    const crossedLive = direction === 'BULLISH'
      ? currentPrice >= triggerPrice
      : currentPrice <= triggerPrice;
    const atr = signal.rawIndicators.atr14 > 0
      ? signal.rawIndicators.atr14
      : Math.max(closedCandles[lastIndex].high - closedCandles[lastIndex].low, currentPrice * 0.001);
    const distance = confirmed || crossedLive ? 0 : Math.abs(triggerPrice - currentPrice);
    const distanceAtr = atr > 0 ? distance / atr : Number.POSITIVE_INFINITY;
    const distancePercent = currentPrice > 0 ? (distance / currentPrice) * 100 : 0;
    const status: FlipCandidateStatus = confirmed
      ? 'CONFIRMED'
      : crossedLive
        ? 'AWAITING_CLOSE'
        : distanceAtr <= 0.25
          ? 'VERY_CLOSE'
          : 'APPROACHING';
    const sma50 = cloud.sma50[lastIndex];
    const sma200 = cloud.sma200[lastIndex];
    const weeklyBullish = weeklyTier === 'Bullish' || weeklyTier === 'Strong Bullish';
    const weeklyBearish = weeklyTier === 'Bearish' || weeklyTier === 'Strong Bearish';
    const weeklyAligned = direction === 'BULLISH' ? weeklyBullish : weeklyBearish;
    const sma50Aligned = direction === 'BULLISH' ? currentPrice >= sma50 : currentPrice <= sma50;
    const sma200Aligned = direction === 'BULLISH' ? currentPrice >= sma200 : currentPrice <= sma200;
    const statusBoost = confirmed ? 22 : crossedLive ? 16 : distanceAtr <= 0.25 ? 8 : 0;
    const alignmentBoost = (weeklyAligned ? 6 : 0) + (sma50Aligned ? 3 : 0) + (sma200Aligned ? 2 : 0);
    const volumeBoost = Math.min(4, Math.max(0, signal.rawIndicators.rvol - 0.8) * 3);
    const timeframeBoost = timeframe === '1d' ? 3 : timeframe === '8h' ? 2 : 1;
    const priorityScore = Math.max(0, Math.min(100,
      92 - Math.min(distanceAtr, 4) * 18 + statusBoost + alignmentBoost + volumeBoost + timeframeBoost
    ));

    return {
      id: `${marketClass}:${symbol}:${timeframe}:${direction}`,
      symbol,
      marketClass,
      timeframe,
      direction,
      status,
      currentPrice: Number(currentPrice.toFixed(8)),
      triggerPrice: Number(triggerPrice.toFixed(8)),
      distancePercent: Number(distancePercent.toFixed(3)),
      distanceAtr: Number((Number.isFinite(distanceAtr) ? distanceAtr : 99).toFixed(3)),
      priorityScore: Number(priorityScore.toFixed(1)),
      atr: Number(atr.toFixed(8)),
      rvol: signal.rawIndicators.rvol,
      moneyLineTier: signal.tier,
      moneyLineScore: signal.score,
      weeklyTier,
      weeklyScore,
      sma50: Number(sma50.toFixed(8)),
      sma200: Number(sma200.toFixed(8)),
      weeklyAligned,
      sma50Aligned,
      sma200Aligned,
      candleTimestamp: closedCandles[lastIndex].timestamp,
      scannedAt: Date.now()
    };
  }

  private async enrichAndRankFlipCandidates(preliminaryAssets: PreliminaryFlipAsset[]): Promise<FlipCandidate[]> {
    // Stage 1 already used the Daily/Weekly data fetched for every asset. Only
    // the strongest 30 preliminary candidates receive additional 4H/8H calls.
    const shortlist = preliminaryAssets
      .slice()
      .sort((left, right) => right.candidate.priorityScore - left.candidate.priorityScore
        || left.candidate.distanceAtr - right.candidate.distanceAtr)
      .slice(0, 30);
    const enriched: FlipCandidate[] = [];
    const concurrency = 6;

    for (let index = 0; index < shortlist.length; index += concurrency) {
      const batch = shortlist.slice(index, index + concurrency);
      const settled = await Promise.allSettled(batch.map(async asset => {
        const [quote, candles4h, candles8h] = await Promise.all([
          this.marketData.getPriceQuote(asset.symbol, asset.marketClass),
          this.marketData.getCandles(asset.symbol, '4h', 320, asset.marketClass),
          this.marketData.getCandles(asset.symbol, '8h', 320, asset.marketClass)
        ]);
        const price = quote.price || asset.candidate.currentPrice;
        return [
          this.calculateFlipCandidate(asset.symbol, asset.marketClass, '1d', asset.dailyCandles, price, asset.weeklyTier, asset.weeklyScore),
          this.calculateFlipCandidate(asset.symbol, asset.marketClass, '8h', candles8h, price, asset.weeklyTier, asset.weeklyScore),
          this.calculateFlipCandidate(asset.symbol, asset.marketClass, '4h', candles4h, price, asset.weeklyTier, asset.weeklyScore)
        ].filter((candidate): candidate is FlipCandidate => Boolean(candidate));
      }));

      settled.forEach(result => {
        if (result.status === 'fulfilled') enriched.push(...result.value);
        else console.warn('Flip candidate enrichment failed:', result.reason instanceof Error ? result.reason.message : result.reason);
      });
    }

    // One row per asset keeps the list genuinely diverse. The best timeframe
    // for each symbol wins; confirmed/awaiting-close candidates naturally rank first.
    const bestByAsset = new Map<string, FlipCandidate>();
    enriched
      .sort((left, right) => right.priorityScore - left.priorityScore || left.distanceAtr - right.distanceAtr)
      .forEach(candidate => {
        const key = `${candidate.marketClass}:${candidate.symbol}`;
        if (!bestByAsset.has(key)) bestByAsset.set(key, candidate);
      });
    return Array.from(bestByAsset.values()).slice(0, 10);
  }

  private evaluateDailyRegimeAsset(
    symbol: string,
    marketClass: AssetMarketClass,
    dailyCandles: Awaited<ReturnType<MarketDataService['getCandles']>>,
    weeklyCandles: Awaited<ReturnType<MarketDataService['getCandles']>>
  ): DailyRegimeMatch | undefined {
    const dailySeries = this.moneyLine.calculateSeries(symbol, '1d', dailyCandles);
    const weeklySignal = this.moneyLine.calculateLatest(symbol, '1w', weeklyCandles);
    if (dailySeries.length < 50 || !weeklySignal) return undefined;

    const dailySignal = dailySeries[dailySeries.length - 1];
    const previousDailyTier = dailySignal.previousTier;
    if (!previousDailyTier) return undefined;
    const dailyClosed = dailyCandles
      .filter(candle => candle.isClosed !== false)
      .sort((left, right) => left.timestamp - right.timestamp);
    const latestCandle = dailyClosed[dailyClosed.length - 1];
    if (!latestCandle || latestCandle.timestamp !== dailySignal.candleTimestamp) return undefined;

    // Prevent weekend/holiday re-alerting for an old stock candle. Friday is
    // still evaluated on Saturday noon because Friday's US session closes
    // after the Friday 12:00 Oslo scan.
    const maxCandleAgeMs = 42 * 60 * 60 * 1000;
    if (Date.now() - latestCandle.timestamp > maxCandleAgeMs) return undefined;

    const cloud = calculateMoneyLineCloud(dailyClosed, '1d');
    const sma50 = cloud.sma50[cloud.sma50.length - 1];
    if (!Number.isFinite(sma50) || sma50 <= 0) return undefined;

    const bullish = (tier: MoneyLineTier) => tier === 'Bullish' || tier === 'Strong Bullish';
    const bearish = (tier: MoneyLineTier) => tier === 'Bearish' || tier === 'Strong Bearish';
    const becameBearish = bearish(dailySignal.tier) && !bearish(previousDailyTier);
    const becameBullish = bullish(dailySignal.tier) && !bullish(previousDailyTier);
    const scenario = bullish(weeklySignal.tier) && becameBearish && latestCandle.close < sma50
      ? 'WEEKLY_BULL_DAILY_BEAR'
      : bearish(weeklySignal.tier) && becameBullish && latestCandle.close > sma50
        ? 'WEEKLY_BEAR_DAILY_BULL'
        : undefined;
    if (!scenario) return undefined;

    return {
      symbol,
      marketClass,
      scenario,
      weeklyTier: weeklySignal.tier,
      weeklyScore: weeklySignal.score,
      dailyTier: dailySignal.tier,
      previousDailyTier,
      dailyScore: dailySignal.score,
      dailyCandleTimestamp: dailySignal.candleTimestamp,
      price: latestCandle.close,
      sma50,
      distanceToSma50Percent: Number((((latestCandle.close - sma50) / sma50) * 100).toFixed(2))
    };
  }

  private async getBullishAlertProgress(rule: BullishCloudAlertRule) {
    try {
      const [candles, quote] = await Promise.all([
        this.marketData.getCandles(
          rule.symbol,
          rule.timeframe,
          rule.timeframe === '1w' || rule.timeframe === '1m' ? 300 : 500,
          rule.marketClass
        ),
        this.marketData.getPriceQuote(rule.symbol, rule.marketClass)
      ]);
      const closedCandles = candles
        .filter(candle => candle.isClosed !== false)
        .sort((left, right) => left.timestamp - right.timestamp);
      if (!closedCandles.length) throw new Error('Nu există lumânări închise.');

      const cloud = calculateMoneyLineCloud(closedCandles, rule.timeframe);
      const signal = this.moneyLine.calculateLatest(rule.symbol, rule.timeframe, closedCandles);
      const lastIndex = closedCandles.length - 1;
      const fastBullish = cloud.dirFast[lastIndex] < 0;
      const slowBullish = cloud.dirSlow[lastIndex] < 0;
      const isBullish = fastBullish && slowBullish;
      const currentPrice = quote.price || closedCandles[lastIndex].close;
      const triggerPrice = cloud.lineSlow[lastIndex] || currentPrice;
      const atr = signal?.rawIndicators.atr14 || Math.max(
        closedCandles[lastIndex].high - closedCandles[lastIndex].low,
        currentPrice * 0.001
      );
      const slowFactor = getMoneyLineCloudParameters(rule.timeframe).slowFactor;
      const distanceToTrigger = isBullish ? 0 : Math.max(0, triggerPrice - currentPrice);
      const distancePercent = currentPrice > 0 ? (distanceToTrigger / currentPrice) * 100 : 0;
      const distanceAtr = atr > 0 ? distanceToTrigger / atr : 0;
      const progressPercent = isBullish
        ? 100
        : Math.round(Math.max(0, Math.min(99, (1 - distanceAtr / Math.max(1, slowFactor)) * 100)));
      const status = isBullish
        ? 'CONFIRMED'
        : currentPrice >= triggerPrice
          ? 'AWAITING_CLOSE'
          : distanceAtr <= 0.25
            ? 'VERY_CLOSE'
            : distanceAtr <= 1
              ? 'CLOSE'
              : 'WAITING';

      rule.lastEvaluatedCandle = closedCandles[lastIndex].timestamp;
      rule.lastError = undefined;
      return {
        id: rule.id,
        symbol: rule.symbol,
        timeframe: rule.timeframe,
        marketClass: rule.marketClass,
        createdAt: rule.createdAt,
        lastEvaluatedCandle: rule.lastEvaluatedCandle,
        lastTriggeredCandle: rule.lastTriggeredCandle,
        currentPrice,
        triggerPrice,
        distancePercent,
        distanceAtr,
        progressPercent,
        status,
        fastBullish,
        slowBullish,
        moneyLineScore: signal?.score,
        moneyLineTier: signal?.tier,
        lastPlan: rule.lastPlan,
        lastError: rule.lastError
      };
    } catch (error) {
      rule.lastError = error instanceof Error ? error.message : 'Progresul alertei nu poate fi calculat.';
      return {
        id: rule.id,
        symbol: rule.symbol,
        timeframe: rule.timeframe,
        marketClass: rule.marketClass,
        createdAt: rule.createdAt,
        lastEvaluatedCandle: rule.lastEvaluatedCandle,
        lastTriggeredCandle: rule.lastTriggeredCandle,
        currentPrice: 0,
        triggerPrice: 0,
        distancePercent: 0,
        distanceAtr: 0,
        progressPercent: 0,
        status: 'ERROR',
        fastBullish: false,
        slowBullish: false,
        moneyLineScore: undefined,
        moneyLineTier: undefined,
        lastPlan: rule.lastPlan,
        lastError: rule.lastError
      };
    }
  }

  public async setBullishCloudAlert(
    userId: string,
    symbol: string,
    timeframe: Timeframe,
    marketClass: AssetMarketClass,
    enabled: boolean
  ) {
    const normalizedSymbol = symbol.replace(/^[$#]/, '').trim().toUpperCase();
    const id = this.bullishAlertId(userId, normalizedSymbol, timeframe);
    if (!enabled) {
      this.bullishCloudAlerts.delete(id);
      return undefined;
    }

    const existing = this.bullishCloudAlerts.get(id);
    const rule: BullishCloudAlertRule = existing || {
      id,
      userId,
      symbol: normalizedSymbol,
      timeframe,
      marketClass,
      isEnabled: true,
      createdAt: Date.now()
    };
    rule.marketClass = marketClass;
    rule.isEnabled = true;
    this.bullishCloudAlerts.set(id, rule);
    await this.evaluateBullishCloudAlert(rule);
    return rule;
  }

  private async evaluateBullishCloudAlert(
    rule: BullishCloudAlertRule,
    supplied?: { candles: Awaited<ReturnType<MarketDataService['getCandles']>>; price: number }
  ) {
    if (!rule.isEnabled || this.evaluatingAlertIds.has(rule.id)) return;
    this.evaluatingAlertIds.add(rule.id);

    try {
      const candles = supplied?.candles || await this.marketData.getCandles(
        rule.symbol,
        rule.timeframe,
        rule.timeframe === '1w' ? 300 : 500,
        rule.marketClass
      );
      const closedCandles = candles
        .filter(candle => candle.isClosed !== false)
        .sort((left, right) => left.timestamp - right.timestamp);
      if (closedCandles.length < 2) {
        rule.lastError = 'Nu există suficiente lumânări închise pentru confirmare.';
        return;
      }

      const cloud = calculateMoneyLineCloud(closedCandles, rule.timeframe);
      const lastIndex = closedCandles.length - 1;
      const isBullish = cloud.dirFast[lastIndex] < 0 && cloud.dirSlow[lastIndex] < 0;
      const candleTimestamp = closedCandles[lastIndex].timestamp;
      const shouldNotify = isBullish && (
        rule.lastWasBullish !== true || rule.lastTriggeredCandle === undefined
      );

      rule.lastWasBullish = isBullish;
      rule.lastEvaluatedCandle = candleTimestamp;
      rule.lastError = undefined;
      if (!shouldNotify) return;

      const price = supplied?.price || (await this.marketData.getPriceQuote(rule.symbol, rule.marketClass)).price;
      const signal = this.moneyLine.calculateLatest(rule.symbol, rule.timeframe, closedCandles);
      if (!signal) {
        rule.lastError = 'Semnalul MoneyLine nu a putut fi calculat pentru planul de tranzacție.';
        return;
      }

      const profile = getTradePlanProfile(rule.timeframe);
      const confirmationEntries = await Promise.all(profile.confirmationTimeframes.map(async timeframe => {
        try {
          const confirmationCandles = await this.marketData.getCandles(
            rule.symbol,
            timeframe,
            timeframe === '1m' ? 260 : 300,
            rule.marketClass
          );
          const confirmationSignal = this.moneyLine.calculateLatest(rule.symbol, timeframe, confirmationCandles);
          return [timeframe, confirmationSignal] as const;
        } catch (error) {
          console.warn(`Alert confirmation ${timeframe} unavailable for ${rule.symbol}:`, error instanceof Error ? error.message : error);
          return [timeframe, null] as const;
        }
      }));
      const confirmationSignals: Partial<Record<Timeframe, MoneyLineSignal>> = {};
      confirmationEntries.forEach(([timeframe, confirmationSignal]) => {
        if (confirmationSignal) confirmationSignals[timeframe] = confirmationSignal;
      });

      const plan = calculateBullishTradePlan({
        timeframe: rule.timeframe,
        candles: closedCandles,
        cloud,
        signal,
        currentPrice: price || closedCandles[lastIndex].close,
        confirmationSignals
      });
      rule.lastPlan = plan;

      const contextText = profile.confirmationTimeframes.length
        ? profile.confirmationTimeframes.map(timeframe => {
            const confirmation = confirmationSignals[timeframe];
            return confirmation
              ? `${timeframe.toUpperCase()} ${confirmation.tier} (${confirmation.score > 0 ? '+' : ''}${confirmation.score})`
              : `${timeframe.toUpperCase()} indisponibil`;
          }).join(' | ')
        : 'fără timeframe superior disponibil';
      const resistanceText = plan.resistanceRiskReward === undefined
        ? 'fără rezistență apropiată detectată'
        : `R:R până la rezistență ${plan.resistanceRiskReward.toFixed(2)}`;
      const dashboardBaseUrl = process.env.PUBLIC_BASE_URL || 'https://market-scanner-360-384051756749.europe-west3.run.app';
      const message = [
        `🟢 *BULLISH FLIP CONFIRMAT*`,
        `*▲ PLAN TEHNIC LONG — ${rule.timeframe.toUpperCase()}*`,
        `\n*$${rule.symbol}*  •  *${rule.timeframe.toUpperCase()}*`,
        `*Acțiune:* ${tradePlanActionLabel(plan.action)}`,
        `*Calitate setup:* ${plan.confidence}/100`,
        `\n*Preț acum:* ${formatAlertPrice(plan.currentPrice)}`,
        `*Intrare optimă:* ${formatAlertPrice(plan.suggestedEntry)}`,
        `*Zonă intrare:* ${formatAlertPrice(plan.entryLow)} – ${formatAlertPrice(plan.entryHigh)}`,
        `*Alternativ breakout:* peste ${formatAlertPrice(plan.breakoutTrigger)}`,
        `*STOP LOSS tehnic:* ${formatAlertPrice(plan.stopLoss)}`,
        `*Ținta 1 (1.5R):* ${formatAlertPrice(plan.target1)}`,
        `*Ținta 2 (${plan.targetRiskReward.toFixed(1)}R):* ${formatAlertPrice(plan.target2)}`,
        `*Risc entry → SL:* ${plan.riskPercent.toFixed(2)}% | *R:R plan:* 1:${plan.targetRiskReward.toFixed(1)}`,
        `\n*Context superior:* ${contextText}`,
        `*ML ${rule.timeframe.toUpperCase()}:* ${plan.tier} (${plan.score > 0 ? '+' : ''}${plan.score}) | *RVOL:* ${plan.rvol.toFixed(2)}x | *RSI:* ${plan.rsi.toFixed(1)}`,
        `*Nor:* Fast ${formatAlertPrice(plan.fastLine)} | Slow ${formatAlertPrice(plan.slowLine)}`,
        `*Spațiu:* ${resistanceText}`,
        `*Observații:* ${plan.reasons.slice(0, 4).join('; ') || 'confirmare tehnică completă'}`,
        `\n_Analiză deterministă pe lumânări închise. Nivelurile sunt orientative și nu garantează execuția sau profitul._`,
        `\n🔗 [Deschide Money Scanner](${dashboardBaseUrl})`
      ].join('\n');
      const delivered = await this.telegramBot.sendMarkdown(message);
      if (!delivered) {
        rule.lastError = this.telegramBot.getDeliveryConfiguration().telegramConfigured
          ? 'Telegram a respins mesajul; verifică botul și chatul.'
          : 'Telegram nu este configurat: lipsesc TELEGRAM_BOT_TOKEN sau TELEGRAM_CHAT_ID.';
        return;
      }

      rule.lastTriggeredCandle = candleTimestamp;
      const alert: DispatchedAlert = {
        id: `cloud_bull_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        idempotencyKey: `${rule.id}:${candleTimestamp}`,
        ruleId: rule.id,
        symbol: rule.symbol,
        type: 'MoneyLineTransition',
        title: `MoneyLine bullish confirmat: ${rule.symbol} ${rule.timeframe.toUpperCase()}`,
        message,
        timeframe: rule.timeframe,
        price,
        tier: 'Bullish',
        reason: `Fast și Slow bullish pe lumânare închisă; plan ${plan.action}, confluence ${plan.confidence}/100.`,
        confidence: plan.confidence / 100,
        timestamp: Date.now(),
        dashboardLink: dashboardBaseUrl,
        isDelivered: true,
        tradePlan: {
          action: plan.action,
          confidence: plan.confidence,
          entryLow: plan.entryLow,
          entryHigh: plan.entryHigh,
          suggestedEntry: plan.suggestedEntry,
          breakoutTrigger: plan.breakoutTrigger,
          stopLoss: plan.stopLoss,
          target1: plan.target1,
          target2: plan.target2,
          targetRiskReward: plan.targetRiskReward,
          riskPercent: plan.riskPercent,
          fastLine: plan.fastLine,
          slowLine: plan.slowLine,
          atr: plan.atr,
          rvol: plan.rvol,
          rsi: plan.rsi,
          score: plan.score
        }
      };
      this.alertHistory.unshift(alert);
      if (this.alertHistory.length > 100) this.alertHistory.pop();
    } catch (error) {
      rule.lastError = error instanceof Error ? error.message : 'Verificarea alertei a eșuat.';
      console.error(`Bullish alert check failed for ${rule.symbol} ${rule.timeframe}:`, rule.lastError);
    } finally {
      this.evaluatingAlertIds.delete(rule.id);
    }
  }

  private async evaluateBullishSubscriptionsForCandles(
    symbol: string,
    timeframe: Timeframe,
    candles: Awaited<ReturnType<MarketDataService['getCandles']>>,
    price: number
  ) {
    const matchingRules = Array.from(this.bullishCloudAlerts.values()).filter(rule =>
      rule.isEnabled && rule.symbol === symbol.toUpperCase() && rule.timeframe === timeframe
    );
    await Promise.allSettled(matchingRules.map(rule => this.evaluateBullishCloudAlert(rule, { candles, price })));
  }

  public async checkAllBullishCloudAlerts() {
    const rules = Array.from(this.bullishCloudAlerts.values()).filter(rule => rule.isEnabled);
    const concurrency = 3;
    for (let index = 0; index < rules.length; index += concurrency) {
      await Promise.allSettled(rules.slice(index, index + concurrency).map(rule => this.evaluateBullishCloudAlert(rule)));
    }
  }

  public startBullishAlertMonitor(intervalMs = 60_000) {
    if (this.bullishAlertTimer) return;
    this.bullishAlertTimer = setInterval(() => {
      this.checkAllBullishCloudAlerts().catch(error => console.error('Bullish alert monitor failed:', error));
    }, intervalMs);
    this.bullishAlertTimer.unref();
  }

  /**
   * Scans the selected live universe. Provider calls are intentionally limited
   * so Yahoo Finance and Binance are not rate-limited by a large all-market scan.
   */
  public async refreshSignals(
    timeframe: Timeframe = '1h',
    marketClass: ScannerMarketClass = 'ALL',
    narrative?: MarketNarrativeId
  ): Promise<AssetScannerRow[]> {
    const marketAssets = marketClass === 'crypto'
      ? await this.marketData.getNarrativeBalancedCryptoAssets()
      : getScannerAssets(marketClass);
    const assets = narrative
      ? marketAssets.filter(asset => asset.narratives?.[0] === narrative)
      : marketAssets;
    const quotes = await this.marketData.getQuotesForAssets(assets);
    const quoteBySymbol = new Map(quotes.map(quote => [quote.symbol, quote]));
    // Stock market caps are maintained in the curated Top 50 stock catalog.
    // Use them for both the Stocks tab and the mixed 360° view; previously an
    // empty map was deliberately returned for stocks, leaving every value as
    // "-" despite all 50 assets having a known market cap.
    const staticStockMarketCaps = new Map(
      assets
        .filter(asset => asset.marketClass === 'stocks' && typeof asset.marketCap === 'number' && asset.marketCap > 0)
        .map(asset => [asset.symbol, asset.marketCap!] as const)
    );
    const marketCaps = marketClass === 'stocks' || marketClass === 'metals'
      ? staticStockMarketCaps
      : await this.marketData.getCryptoMarketCaps();

    const buildRow = async (asset: ReturnType<typeof getScannerAssets>[number]) => {
        const quote = quoteBySymbol.get(asset.symbol);
        if (!quote) throw new Error(`No verified quote available for ${asset.symbol}`);
        const candleLimit = timeframe === '1w' ? 300 : (timeframe === '1d' ? 500 : (timeframe === '1m' ? 150 : 500));
        const candles = await this.marketData.getCandles(asset.symbol, timeframe, candleLimit, asset.marketClass);
        const signal = this.moneyLine.calculateLatest(asset.symbol, timeframe, candles);

        if (!signal) throw new Error(`Insufficient verified candles for ${asset.symbol}`);
        this.cachedSignals.set(`${asset.symbol}_${timeframe}`, signal);
        await this.evaluateBullishSubscriptionsForCandles(asset.symbol, timeframe, candles, quote.price);

        const alert = this.alertDispatcher.evaluateSignal(signal, quote.price);
        if (alert) {
          this.alertHistory.unshift(alert);
          if (this.alertHistory.length > 100) this.alertHistory.pop();
        }

        // Compute 1H, 4H, 8H, 1D and 1W MoneyLine signals for multi-timeframe ROI & flip columns
        let signal1h = timeframe === '1h' ? signal : this.cachedSignals.get(`${asset.symbol}_1h`);
        let signal4h = timeframe === '4h' ? signal : this.cachedSignals.get(`${asset.symbol}_4h`);
        let signal8h = timeframe === '8h' ? signal : this.cachedSignals.get(`${asset.symbol}_8h`);
        let signal1d = timeframe === '1d' ? signal : this.cachedSignals.get(`${asset.symbol}_1d`);
        let signal1w = timeframe === '1w' ? signal : this.cachedSignals.get(`${asset.symbol}_1w`);

        if (!signal1h) {
          const candles1h = timeframe === '1h' ? candles : await this.marketData.getCandles(asset.symbol, '1h', 500, asset.marketClass);
          signal1h = this.moneyLine.calculateLatest(asset.symbol, '1h', candles1h) || undefined;
          if (signal1h) this.cachedSignals.set(`${asset.symbol}_1h`, signal1h);
        }

        if (!signal4h) {
          const candles4h = timeframe === '4h' ? candles : await this.marketData.getCandles(asset.symbol, '4h', 500, asset.marketClass);
          signal4h = this.moneyLine.calculateLatest(asset.symbol, '4h', candles4h) || undefined;
          if (signal4h) this.cachedSignals.set(`${asset.symbol}_4h`, signal4h);
        }

        if (!signal8h) {
          const candles8h = timeframe === '8h' ? candles : await this.marketData.getCandles(asset.symbol, '8h', 400, asset.marketClass);
          signal8h = this.moneyLine.calculateLatest(asset.symbol, '8h', candles8h) || undefined;
          if (signal8h) this.cachedSignals.set(`${asset.symbol}_8h`, signal8h);
        }

        if (!signal1d) {
          const candles1d = timeframe === '1d' ? candles : await this.marketData.getCandles(asset.symbol, '1d', 500, asset.marketClass);
          signal1d = this.moneyLine.calculateLatest(asset.symbol, '1d', candles1d) || undefined;
          if (signal1d) this.cachedSignals.set(`${asset.symbol}_1d`, signal1d);
        }

        if (!signal1w) {
          const candles1w = timeframe === '1w' ? candles : await this.marketData.getCandles(asset.symbol, '1w', 300, asset.marketClass);
          signal1w = this.moneyLine.calculateLatest(asset.symbol, '1w', candles1w) || undefined;
          if (signal1w) this.cachedSignals.set(`${asset.symbol}_1w`, signal1w);
        }

        const moneyLine1hPercent = signal1h?.roiPercent;
        const moneyLine4hPercent = signal4h?.roiPercent;
        const moneyLine8hPercent = signal8h?.roiPercent;
        const moneyLine1dPercent = signal1d?.roiPercent;
        const moneyLine1wPercent = signal1w?.roiPercent;
        const activeRoiPercent = signal.roiPercent;
        const score = signal.score;
        const tier = signal.tier;
        const rvol = signal.rawIndicators.rvol;
        const atrPct = signal.rawIndicators.atrPercent;
        const closedCandles = candles.filter(candle => candle.isClosed).sort((a, b) => a.timestamp - b.timestamp);
        const latestClosed = closedCandles[closedCandles.length - 1];
        const previousClosed = closedCandles[closedCandles.length - 2];
        const timeframeChangePercent = latestClosed && previousClosed && previousClosed.close > 0
          ? Number((((latestClosed.close - previousClosed.close) / previousClosed.close) * 100).toFixed(2))
          : undefined;

        return {
          symbol: asset.symbol,
          name: asset.name,
          category: asset.category,
          marketClass: asset.marketClass,
          narratives: asset.narratives,
          price: quote.price,
          change24h: quote.change24h,
          timeframeChangePercent,
          changeYtd: quote.changeYtd,
          marketCap: marketCaps.get(asset.symbol) ?? asset.marketCap,
          high24h: quote.high24h,
          low24h: quote.low24h,
          volume24h: quote.volume24h,
          timeframe,
          moneyLineScore: score,
          tier,
          previousTier: signal?.previousTier,
          isTransition: signal?.isTransition || false,
          lastSignalChangeTime: signal.transitionTime,
          roiPercent: activeRoiPercent,
          moneyLine1hPercent,
          moneyLine1hScore: signal1h?.score,
          moneyLine1hTier: signal1h?.tier,
          moneyLine1hFlipTime: signal1h?.transitionTime,
          moneyLine1hIsTransition: signal1h?.isTransition || false,
          moneyLine4hPercent,
          moneyLine4hScore: signal4h?.score,
          moneyLine4hTier: signal4h?.tier,
          moneyLine4hFlipTime: signal4h?.transitionTime,
          moneyLine4hIsTransition: signal4h?.isTransition || false,
          moneyLine8hPercent,
          moneyLine8hScore: signal8h?.score,
          moneyLine8hTier: signal8h?.tier,
          moneyLine8hFlipTime: signal8h?.transitionTime,
          moneyLine8hIsTransition: signal8h?.isTransition || false,
          moneyLine1dPercent,
          moneyLine1dScore: signal1d?.score,
          moneyLine1dTier: signal1d?.tier,
          moneyLine1dFlipTime: signal1d?.transitionTime,
          moneyLine1dIsTransition: signal1d?.isTransition || false,
          moneyLine1wPercent,
          moneyLine1wScore: signal1w?.score,
          moneyLine1wTier: signal1w?.tier,
          moneyLine1wFlipTime: signal1w?.transitionTime,
          moneyLine1wIsTransition: signal1w?.isTransition || false,
          rvol,
          volatilityAtrPercent: atrPct,
          dataSource: quote.source,
          lastUpdated: quote.timestamp,
          isStale: this.marketData.getHealthMonitor().isDataStale(quote.timestamp)
        };
    };

    const rows: AssetScannerRow[] = [];
    const concurrency = 4;
    for (let index = 0; index < assets.length; index += concurrency) {
      const settledRows = await Promise.allSettled(assets.slice(index, index + concurrency).map(buildRow));
      rows.push(...settledRows.flatMap(result => result.status === 'fulfilled' ? [result.value] : []));
    }
    return rows;
  }

  /**
   * Computes comprehensive narrative summaries including % change, market cap and top movers.
   */
  public async getNarrativeSummaries(
    timeframe: Timeframe = '1w',
    marketClass: ScannerMarketClass = 'ALL'
  ): Promise<NarrativeSummary[]> {
    const rows = await this.refreshSignals(timeframe, marketClass);

    return NARRATIVE_DEFINITIONS.map(def => {
      const matchingRows = rows.filter(r => r.narratives?.includes(def.id));
      const count = matchingRows.length;

      if (count === 0) {
        return {
          id: def.id,
          name: def.name,
          shortName: def.shortName,
          tagline: def.tagline,
          icon: def.icon,
          category: def.category,
          assetCount: 0,
          performanceTimeframe: timeframe,
          avgChangePercent: 0,
          weightedChangePercent: 0,
          avgChange24h: 0,
          weightedChange24h: 0,
          bullishPercent: 50,
          totalMarketCap: 0,
          topGainer: { symbol: '-', name: '-', change24h: 0, price: 0 },
          topLoser: { symbol: '-', name: '-', change24h: 0, price: 0 },
          symbols: []
        };
      }

      const totalCap = matchingRows.reduce((sum, r) => sum + (r.marketCap || 0), 0);
      const timeframeRows = matchingRows.filter(r => typeof r.timeframeChangePercent === 'number');
      const timeframeCount = timeframeRows.length;
      const avgChangePercent = timeframeCount
        ? Number((timeframeRows.reduce((sum, r) => sum + (r.timeframeChangePercent || 0), 0) / timeframeCount).toFixed(2))
        : 0;
      const sumChange = matchingRows.reduce((sum, r) => sum + r.change24h, 0);
      const avgChange24h = Number((sumChange / count).toFixed(2));

      let weightedSum = 0;
      let timeframeWeightedSum = 0;
      let timeframeWeightTotal = 0;
      for (const r of matchingRows) {
        const weight = totalCap > 0 ? (r.marketCap || 0) / totalCap : 1 / count;
        weightedSum += r.change24h * weight;
        if (typeof r.timeframeChangePercent === 'number') {
          timeframeWeightedSum += r.timeframeChangePercent * weight;
          timeframeWeightTotal += weight;
        }
      }
      const weightedChange24h = Number(weightedSum.toFixed(2));
      const weightedChangePercent = timeframeWeightTotal > 0
        ? Number((timeframeWeightedSum / timeframeWeightTotal).toFixed(2))
        : 0;

      const bullishCount = matchingRows.filter(r => r.tier.includes('Bullish') || r.moneyLineScore > 0).length;
      const bullishPercent = Number(((bullishCount / count) * 100).toFixed(1));

      const sortedByChange = [...matchingRows].sort((a, b) => b.change24h - a.change24h);
      const topGainerRow = sortedByChange[0];
      const topLoserRow = sortedByChange[sortedByChange.length - 1];

      return {
        id: def.id,
        name: def.name,
        shortName: def.shortName,
        tagline: def.tagline,
        icon: def.icon,
        category: def.category,
        assetCount: count,
        performanceTimeframe: timeframe,
        avgChangePercent,
        weightedChangePercent,
        avgChange24h,
        weightedChange24h,
        bullishPercent,
        totalMarketCap: totalCap,
        topGainer: {
          symbol: topGainerRow.symbol,
          name: topGainerRow.name,
          change24h: topGainerRow.change24h,
          price: topGainerRow.price
        },
        topLoser: {
          symbol: topLoserRow.symbol,
          name: topLoserRow.name,
          change24h: topLoserRow.change24h,
          price: topLoserRow.price
        },
        symbols: matchingRows.map(r => r.symbol)
      };
    }).filter(summary => summary.assetCount > 0);
  }
}
