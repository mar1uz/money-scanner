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
  StrategyAlertSnapshot,
  TelegramFlipAlertPreferences,
  TelegramFlipAlertSubscription,
  TelegramFlipTimeframe,
  TRADING_360_ASSETS
} from '@money-scanner/shared';
import { MarketDataService } from '@money-scanner/market-data';
import type { ChartMarketPinAudit, ChartMarketResolution } from '@money-scanner/market-data';
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
import {
  AlertDispatcher,
  TelegramBotHandler,
  buildMoneyLineAssetUrl,
  telegramAssetLink
} from '@money-scanner/notifications';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import { evaluateDailyStrategyAlerts, StrategyAlertEvaluation } from './strategy-alert-service.js';
import { PriceAlertService } from './price-alert-service.js';
import { ScannerSnapshots } from './scanner-snapshots.js';
import { DailySmaReclaimRunner } from './daily-sma-reclaim-runner.js';
import { MaCrossAlertRunner } from './ma-cross-alert-runner.js';
import { StructureScannerRunner, StructureScanTimeframe } from './structure-scanner-runner.js';
import { calculateFlipPriorityScore } from './flip-priority-score.js';
import { RegimeTapeService } from './regime-tape-service.js';
import { DailySmaReclaimReport } from '@money-scanner/shared';

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
  lastRetestTriggeredCandle?: number;
  lastWasBullish?: boolean;
  lastPlan?: BullishTradePlan;
  lastError?: string;
}

export interface DailyRegimeScanStatus {
  enabled: true;
  schedule: '0 8 * * *';
  timezone: 'Europe/Bucharest';
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
  coverage?: FlipScanCoverageSummary;
}

export type FlipScanCoverageStatus = 'CONFIRMED' | 'CANDIDATE' | 'NO_SETUP' | 'INSUFFICIENT_DATA' | 'ERROR';

export interface FlipScanCoverageItem {
  symbol: string;
  name?: string;
  marketClass: AssetMarketClass;
  rank?: number;
  status: FlipScanCoverageStatus;
  weeklyCandidate: boolean;
  weeklyConfirmed: boolean;
  candidateCount: number;
  confirmedCount: number;
  scannedAt: number;
  error?: string;
}

export interface FlipScanCoverageSummary {
  totalAssets: number;
  scannedAssets: number;
  outcomes: Record<FlipScanCoverageStatus, number>;
  byMarket: Record<AssetMarketClass, number>;
}

export type ManualAlertScanScope = 'quick' | 'full' | 'flips' | 'strategies';

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

export interface TelegramMoneyLineScanResult {
  mode: 'signals' | 'flips';
  timeframe: Timeframe;
  marketClass: ScannerMarketClass;
  scannedAssets: number;
  totalAssets: number;
  errors: number;
  completedAt: number;
  signals: Array<{
    signal: MoneyLineSignal;
    price: number;
    marketClass: AssetMarketClass;
    name?: string;
  }>;
  flips: FlipCandidate[];
}

export type FlipCandidateDirection = 'BULLISH' | 'BEARISH';
export type FlipCandidateStatus = 'CONFIRMED' | 'AWAITING_CLOSE' | 'VERY_CLOSE' | 'APPROACHING';

export interface FlipCandidate {
  id: string;
  symbol: string;
  name?: string;
  marketClass: AssetMarketClass;
  marketCapRank?: number;
  timeframe: Extract<Timeframe, '4h' | '8h' | '1d' | '1w'>;
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
  confirmationPrice?: number;
  confirmedAt?: number;
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

interface FlipAssetScanResult {
  upcoming: FlipCandidate[];
  confirmedHistory: FlipCandidate[];
  newlyConfirmed: FlipCandidate[];
  coverage?: Pick<FlipScanCoverageItem, 'status' | 'weeklyCandidate' | 'weeklyConfirmed' | 'candidateCount' | 'confirmedCount' | 'error'>;
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

const TELEGRAM_FLIP_TIMEFRAMES: TelegramFlipTimeframe[] = ['4h', '8h', '1d', '1w'];
// Automated (scheduled) flip scans cover Daily and Weekly only. 4H/8H stay
// available on demand: Alerts manual scans and the Telegram bot commands use
// the full set. Marius, 2026-09-24: sub-1D scanning runs only when he starts it.
const CONFIRMED_FLIPS_CAP = 5_000;
export const AUTOMATED_FLIP_TIMEFRAMES: TelegramFlipTimeframe[] = ['1d', '1w'];
const FLIP_TIMEFRAME_DURATION_MS: Record<TelegramFlipTimeframe, number> = {
  '4h': 4 * 60 * 60 * 1_000,
  '8h': 8 * 60 * 60 * 1_000,
  '1d': 24 * 60 * 60 * 1_000,
  '1w': 7 * 24 * 60 * 60 * 1_000
};

const flipPriceMovePercent = (confirmationPrice: number, currentPrice: number) =>
  confirmationPrice > 0 ? ((currentPrice - confirmationPrice) / confirmationPrice) * 100 : 0;

const formatFlipMove = (confirmationPrice: number, currentPrice: number) => {
  const move = flipPriceMovePercent(confirmationPrice, currentPrice);
  return `${move >= 0 ? '+' : ''}${move.toFixed(2)}%`;
};

const formatFlipAge = (confirmedAt: number, now = Date.now()) => {
  const elapsedMs = Math.max(0, now - confirmedAt);
  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 60) return minutes <= 1 ? 'acum 1 minut' : `acum ${minutes} minute`;
  const hours = Math.floor(elapsedMs / 3_600_000);
  if (hours < 24) return hours === 1 ? 'acum 1 oră' : `acum ${hours} ore`;
  const days = Math.floor(elapsedMs / 86_400_000);
  return days === 1 ? 'acum 1 zi' : `acum ${days} zile`;
};

const formatFlipDate = (confirmedAt: number) => new Intl.DateTimeFormat('ro-RO', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Europe/Oslo'
}).format(new Date(confirmedAt));

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
  public dailySmaReclaim = new DailySmaReclaimRunner(this.marketData, this.telegramBot);
  public maCrossAlerts = new MaCrossAlertRunner(this.marketData, this.telegramBot);
  public structureScanner = new StructureScannerRunner(this.marketData);
  public priceAlerts = new PriceAlertService(this.marketData, this.telegramBot);
  public regimeTape = RegimeTapeService.getInstance(this.marketData, this.moneyLine, this.telegramBot);

  public cachedSignals: Map<string, MoneyLineSignal> = new Map(); // key: `${symbol}_${timeframe}`
  private readonly scannerSnapshots = new ScannerSnapshots();
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
  private confirmedFlips: FlipCandidate[] = [];
  private flipScanCoverage: FlipScanCoverageItem[] = [];
  private strategySetups: StrategyAlertSnapshot[] = [];
  private telegramFlipPreferences = new Map<string, TelegramFlipAlertPreferences>();
  private telegramFlipSubscriptions = new Map<string, TelegramFlipAlertSubscription>();
  private telegramScanCache = new Map<string, { expiresAt: number; result: TelegramMoneyLineScanResult }>();
  private telegramScanPromises = new Map<string, Promise<TelegramMoneyLineScanResult>>();
  private dailyRegimeScanStatus: DailyRegimeScanStatus = {
    enabled: true,
    schedule: '0 8 * * *',
    timezone: 'Europe/Bucharest',
    scannedAssets: 0,
    matches: 0,
    errors: 0,
    running: false
  };

  constructor() {
    // Resolution is pinned by exact CoinGecko coin ID in the existing Firestore database.
    // The store is backward compatible with pre-existing documents that carry
    // no audit fields: they are read as-is, and the first health check adds the
    // audit map with `merge: true` without touching the resolution payload.
    this.marketData.setChartMarketStore(this.chartMarketPinStore);
  }

  /**
   * Firestore pin store. `set` stays create-only so a cross-instance race can
   * still resolve to exactly one winner; `replace` overwrites only when the
   * document still has the `resolvedAt` the resolver validated (a healed pin
   * never clobbers another instance's concurrent heal).
   */
  private readonly chartMarketPinStore = createChartMarketPinStore(this.chartMarketFirestore());

  /**
   * Pin inventory for the ops diagnostics route. Never throws: an unavailable
   * Firestore is reported as `supported: false` instead of failing the request.
   */
  public async listChartMarketPins(): Promise<{
    supported: boolean;
    count: number;
    pins: Array<{
      key: string;
      symbol: string | null;
      coinGeckoId: string | null;
      resolvedAt: number | null;
      audit: ChartMarketPinAudit | null;
      candleSource: string | null;
      tvSymbol: string | null;
    }>;
  }> {
    try {
      const entries = await this.chartMarketPinStore.list();
      return {
        supported: true,
        count: entries.length,
        pins: entries.map(({ key, resolution }) => ({
          key,
          symbol: resolution?.symbol ?? null,
          coinGeckoId: resolution?.coinGeckoId ?? null,
          resolvedAt: typeof resolution?.resolvedAt === 'number' ? resolution.resolvedAt : null,
          audit: resolution?.audit ?? null,
          candleSource: resolution?.candle?.source ?? null,
          tvSymbol: resolution?.tv?.tvSymbol ?? null
        }))
      };
    } catch {
      return { supported: false, count: 0, pins: [] };
    }
  }

  private chartMarketFirestore() {
    const app = getApps()[0] || initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0610749770'
    });
    return getFirestore(app, 'money-scanner-360');
  }

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

  private telegramFlipPreferencesDocument(chatId: string) {
    const app = getApps()[0] || initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0610749770'
    });
    return getFirestore(app, 'money-scanner-360').collection('telegram-flip-alert-preferences').doc(chatId);
  }

  private telegramFlipSubscriptionsCollection() {
    const app = getApps()[0] || initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0610749770'
    });
    return getFirestore(app, 'money-scanner-360').collection('telegram-flip-alert-subscriptions');
  }

  public async setTelegramFlipAlertSubscription(input: {
    chatId: string | number;
    chatType?: string;
    title?: string;
    enabled: boolean;
    addedByUserId: string | number;
  }): Promise<TelegramFlipAlertSubscription> {
    const chatId = String(input.chatId);
    const subscription: TelegramFlipAlertSubscription = {
      chatId,
      chatType: input.chatType || 'group',
      ...(input.title ? { title: input.title.slice(0, 120) } : {}),
      enabled: input.enabled,
      addedByUserId: String(input.addedByUserId),
      updatedAt: Date.now()
    };
    await this.telegramFlipSubscriptionsCollection().doc(chatId).set(subscription);
    this.telegramFlipSubscriptions.set(chatId, subscription);
    return { ...subscription };
  }

  public async getTelegramFlipAlertDestinations(): Promise<TelegramFlipAlertSubscription[]> {
    const destinations = new Map<string, TelegramFlipAlertSubscription>();
    const defaultChatId = this.telegramBot.getDefaultChatId();
    if (defaultChatId) {
      destinations.set(defaultChatId, {
        chatId: defaultChatId,
        chatType: 'private',
        title: 'Private alerts',
        enabled: true,
        addedByUserId: defaultChatId,
        updatedAt: 0
      });
    }

    try {
      const snapshot = await this.telegramFlipSubscriptionsCollection().where('enabled', '==', true).get();
      snapshot.docs.forEach(document => {
        const stored = document.data() as Partial<TelegramFlipAlertSubscription>;
        const chatId = String(stored.chatId || document.id);
        if (!chatId) return;
        const subscription: TelegramFlipAlertSubscription = {
          chatId,
          chatType: String(stored.chatType || 'group'),
          ...(stored.title ? { title: String(stored.title) } : {}),
          enabled: true,
          addedByUserId: String(stored.addedByUserId || ''),
          updatedAt: Number(stored.updatedAt) || 0
        };
        destinations.set(chatId, subscription);
        this.telegramFlipSubscriptions.set(chatId, subscription);
      });
    } catch (error) {
      console.warn('Telegram subscriptions restore failed:', error instanceof Error ? error.message : error);
      this.telegramFlipSubscriptions.forEach(subscription => {
        if (subscription.enabled) destinations.set(subscription.chatId, { ...subscription });
      });
    }

    return Array.from(destinations.values());
  }

  public async getTelegramFlipAlertPreferences(
    chatId: string | number,
    forceRefresh = false
  ): Promise<TelegramFlipAlertPreferences> {
    const normalizedChatId = String(chatId);
    const cached = this.telegramFlipPreferences.get(normalizedChatId);
    if (cached && !forceRefresh) return { ...cached, timeframes: [...cached.timeframes] };

    try {
      const snapshot = await this.telegramFlipPreferencesDocument(normalizedChatId).get();
      if (snapshot.exists) {
        const stored = snapshot.data() as Partial<TelegramFlipAlertPreferences>;
        const timeframes = TELEGRAM_FLIP_TIMEFRAMES.filter(timeframe => stored.timeframes?.includes(timeframe));
        const preferences: TelegramFlipAlertPreferences = {
          chatId: normalizedChatId,
          enabled: stored.enabled !== false && timeframes.length > 0,
          timeframes: timeframes.length ? timeframes : ['1w'],
          updatedAt: Number(stored.updatedAt) || Date.now()
        };
        this.telegramFlipPreferences.set(normalizedChatId, preferences);
        return { ...preferences, timeframes: [...preferences.timeframes] };
      }
    } catch (error) {
      console.warn('Telegram flip preferences restore failed:', error instanceof Error ? error.message : error);
      if (cached) return { ...cached, timeframes: [...cached.timeframes] };
    }

    const defaults: TelegramFlipAlertPreferences = {
      chatId: normalizedChatId,
      enabled: true,
      timeframes: ['1w'],
      updatedAt: Date.now()
    };
    this.telegramFlipPreferences.set(normalizedChatId, defaults);
    return { ...defaults, timeframes: [...defaults.timeframes] };
  }

  public async setTelegramFlipAlertPreferences(
    chatId: string | number,
    enabled: boolean,
    requestedTimeframes: TelegramFlipTimeframe[]
  ): Promise<TelegramFlipAlertPreferences> {
    const normalizedChatId = String(chatId);
    const timeframes = TELEGRAM_FLIP_TIMEFRAMES.filter(timeframe => requestedTimeframes.includes(timeframe));
    const preferences: TelegramFlipAlertPreferences = {
      chatId: normalizedChatId,
      enabled: enabled && timeframes.length > 0,
      timeframes: timeframes.length ? timeframes : [...TELEGRAM_FLIP_TIMEFRAMES],
      updatedAt: Date.now()
    };
    await this.telegramFlipPreferencesDocument(normalizedChatId).set(preferences);
    this.telegramFlipPreferences.set(normalizedChatId, preferences);
    return { ...preferences, timeframes: [...preferences.timeframes] };
  }

  public async toggleTelegramFlipAlertPreference(
    chatId: string | number,
    action: TelegramFlipTimeframe | 'all' | 'off'
  ): Promise<TelegramFlipAlertPreferences> {
    const current = await this.getTelegramFlipAlertPreferences(chatId, true);
    if (action === 'all') {
      return this.setTelegramFlipAlertPreferences(chatId, true, TELEGRAM_FLIP_TIMEFRAMES);
    }
    if (action === 'off') {
      return this.setTelegramFlipAlertPreferences(chatId, false, current.timeframes);
    }

    const selected = new Set(current.timeframes);
    if (!current.enabled || selected.size === TELEGRAM_FLIP_TIMEFRAMES.length) {
      return this.setTelegramFlipAlertPreferences(chatId, true, [action]);
    }
    if (selected.has(action)) selected.delete(action);
    else selected.add(action);
    return this.setTelegramFlipAlertPreferences(chatId, selected.size > 0, Array.from(selected));
  }

  public scanTelegramMoneyLine(
    mode: 'signals' | 'flips',
    timeframe: Timeframe,
    marketClass: ScannerMarketClass
  ): Promise<TelegramMoneyLineScanResult> {
    if (mode === 'flips' && !TELEGRAM_FLIP_TIMEFRAMES.includes(timeframe as TelegramFlipTimeframe)) {
      return Promise.reject(new Error('Scanarea de flipuri acceptă numai 4H, 8H, 1D sau 1W.'));
    }
    const key = `${mode}:${timeframe}:${marketClass}`;
    const cached = this.telegramScanCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.result);
    const running = this.telegramScanPromises.get(key);
    if (running) return running;

    const promise = this.executeTelegramMoneyLineScan(mode, timeframe, marketClass)
      .then(result => {
        this.telegramScanCache.set(key, { expiresAt: Date.now() + 60_000, result });
        return result;
      })
      .finally(() => this.telegramScanPromises.delete(key));
    this.telegramScanPromises.set(key, promise);
    return promise;
  }

  private async executeTelegramMoneyLineScan(
    mode: 'signals' | 'flips',
    timeframe: Timeframe,
    marketClass: ScannerMarketClass
  ): Promise<TelegramMoneyLineScanResult> {
    // Flip scans run on 150 CoinGecko market-cap coins with live candles,
    // not the narrative-balanced overview subset, so mid-caps outside Top 50
    // / narrative top-10 (e.g. CAKE #90) are not structurally excluded.
    const liveCrypto = marketClass === 'crypto' || marketClass === 'ALL'
      ? await this.marketData.getFlipUniverseCryptoAssets()
      : [];
    const catalogAssets = marketClass === 'ALL'
      ? [...getScannerAssets('stocks'), ...getScannerAssets('metals')]
      : marketClass === 'stocks' || marketClass === 'metals'
        ? getScannerAssets(marketClass)
        : [];
    const uniqueAssets = new Map<string, (typeof liveCrypto)[number]>();
    [...liveCrypto, ...catalogAssets].forEach(asset => {
      if (asset.marketClass === 'crypto' || asset.marketClass === 'stocks' || asset.marketClass === 'metals') {
        uniqueAssets.set(`${asset.marketClass}:${asset.symbol}`, asset);
      }
    });
    const assets = Array.from(uniqueAssets.values());
    const quoteByAsset = new Map<string, number>();
    await Promise.all((['crypto', 'stocks', 'metals'] as AssetMarketClass[]).map(async assetClass => {
      const classAssets = assets.filter(asset => asset.marketClass === assetClass);
      if (!classAssets.length) return;
      const quotes = await this.marketData.getQuotesForAssets(classAssets);
      quotes.forEach(quote => quoteByAsset.set(`${assetClass}:${quote.symbol}`, quote.price));
    }));

    const signals: TelegramMoneyLineScanResult['signals'] = [];
    const flips: FlipCandidate[] = [];
    let errors = 0;
    let scannedAssets = 0;
    const concurrency = 6;
    for (let index = 0; index < assets.length; index += concurrency) {
      const settled = await Promise.allSettled(assets.slice(index, index + concurrency).map(async asset => {
        const assetClass = asset.marketClass as AssetMarketClass;
        const candleLimit = timeframe === '1w' ? 300 : 360;
        const targetCandles = await this.marketData.getCandles(asset.symbol, timeframe, candleLimit, assetClass);
        const closedTarget = targetCandles
          .filter(candle => candle.isClosed !== false)
          .sort((left, right) => left.timestamp - right.timestamp);
        const minCandles = timeframe === '1w' ? 15 : 30;
        if (closedTarget.length < minCandles) throw new Error(`Insufficient ${timeframe} candles for ${asset.symbol}`);
        const signal = this.moneyLine.calculateLatest(asset.symbol, timeframe, closedTarget);
        if (!signal) throw new Error(`No Money Line signal for ${asset.symbol}`);
        this.cachedSignals.set(`${asset.symbol}_${timeframe}`, signal);
        const price = quoteByAsset.get(`${assetClass}:${asset.symbol}`) || closedTarget[closedTarget.length - 1].close;

        if (mode === 'signals') {
          return { signal, price, marketClass: assetClass, name: asset.name };
        }

        const weeklyCandles = timeframe === '1w'
          ? closedTarget
          : (await this.marketData.getCandles(asset.symbol, '1w', 300, assetClass))
            .filter(candle => candle.isClosed !== false)
            .sort((left, right) => left.timestamp - right.timestamp);
        const weeklySignal = this.moneyLine.calculateLatest(asset.symbol, '1w', weeklyCandles);
        if (!weeklySignal) throw new Error(`No Weekly context for ${asset.symbol}`);
        const candidate = this.findMostRecentConfirmedFlip(
          asset.symbol,
          assetClass,
          timeframe as TelegramFlipTimeframe,
          closedTarget,
          price,
          weeklySignal.tier,
          weeklySignal.score
        );
        return candidate;
      }));

      settled.forEach(result => {
        if (result.status === 'rejected') {
          errors += 1;
          return;
        }
        scannedAssets += 1;
        if (!result.value) return;
        if ('signal' in result.value) signals.push(result.value);
        else if (result.value.status === 'CONFIRMED') flips.push(result.value);
      });
    }

    signals.sort((left, right) => Math.abs(right.signal.score) - Math.abs(left.signal.score));
    flips.sort((left, right) =>
      (right.confirmedAt || right.candleTimestamp) - (left.confirmedAt || left.candleTimestamp)
      || right.priorityScore - left.priorityScore
    );
    return {
      mode,
      timeframe,
      marketClass,
      scannedAssets,
      totalAssets: assets.length,
      errors,
      completedAt: Date.now(),
      signals,
      flips
    };
  }

  public listBullishCloudAlerts(userId: string) {
    return Array.from(this.bullishCloudAlerts.values()).filter(rule => rule.userId === userId && rule.isEnabled);
  }

  public async getPublicTapeProof(approvedSymbols: Set<string>, minimumReturnPct = 20, maximumItems = 6) {
    await this.restoreDailyRegimeState();
    const approved = this.confirmedFlips.filter(candidate =>
      approvedSymbols.has(candidate.symbol.toUpperCase())
      && candidate.status === 'CONFIRMED'
      && candidate.direction === 'BULLISH'
      && Number.isFinite(candidate.confirmationPrice)
      && Number(candidate.confirmationPrice) > 0
      && Number.isFinite(candidate.confirmedAt)
    );
    const assets = Array.from(new Map(approved.map(candidate => [
      `${candidate.marketClass}:${candidate.symbol}`,
      { symbol: candidate.symbol, marketClass: candidate.marketClass }
    ])).values());
    const currentPriceByAsset = new Map<string, number>();
    const concurrency = 4;
    for (let index = 0; index < assets.length; index += concurrency) {
      const batch = assets.slice(index, index + concurrency);
      const settled = await Promise.allSettled(
        batch.map(asset => this.marketData.getPriceQuote(asset.symbol, asset.marketClass))
      );
      settled.forEach((result, batchIndex) => {
        if (result.status !== 'fulfilled' || !Number.isFinite(result.value.price) || result.value.price <= 0) return;
        const asset = batch[batchIndex];
        currentPriceByAsset.set(`${asset.marketClass}:${asset.symbol}`, result.value.price);
      });
    }
    const strongestBySymbol = new Map<string, {
      asset: string; name?: string; timeframe: FlipCandidate['timeframe'];
      flipDate: string; flipClose: number; window: 'CURRENT'; returnPct: number;
    }>();
    approved.forEach(candidate => {
      const currentPrice = currentPriceByAsset.get(`${candidate.marketClass}:${candidate.symbol}`);
      if (!currentPrice) return;
      const flipClose = Number(candidate.confirmationPrice);
      const returnPct = flipPriceMovePercent(flipClose, currentPrice);
      if (!Number.isFinite(returnPct) || returnPct < minimumReturnPct) return;
      const evidence = { asset: candidate.symbol, name: candidate.name, timeframe: candidate.timeframe,
        flipDate: new Date(Number(candidate.confirmedAt)).toISOString(), flipClose,
        window: 'CURRENT' as const, returnPct: Number(returnPct.toFixed(2)) };
      const prior = strongestBySymbol.get(candidate.symbol.toUpperCase());
      if (!prior || evidence.returnPct > prior.returnPct) strongestBySymbol.set(candidate.symbol.toUpperCase(), evidence);
    });
    return Array.from(strongestBySymbol.values()).sort((a, b) => b.returnPct - a.returnPct).slice(0, maximumItems);
  }

  public async getAlertsDashboard(userId: string) {
    await this.restoreDailyRegimeState();
    const dailySmaReclaim = await this.getDailySmaReclaimReport();
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

    const confirmedAssets = Array.from(new Map(
      this.confirmedFlips.map(candidate => [
        `${candidate.marketClass}:${candidate.symbol}`,
        { symbol: candidate.symbol, marketClass: candidate.marketClass }
      ])
    ).values());
    const currentPriceByAsset = new Map<string, number>();
    for (let index = 0; index < confirmedAssets.length; index += concurrency) {
      const batch = confirmedAssets.slice(index, index + concurrency);
      const settled = await Promise.allSettled(
        batch.map(asset => this.marketData.getPriceQuote(asset.symbol, asset.marketClass))
      );
      settled.forEach((result, batchIndex) => {
        if (result.status !== 'fulfilled' || !Number.isFinite(result.value.price) || result.value.price <= 0) return;
        const asset = batch[batchIndex];
        currentPriceByAsset.set(`${asset.marketClass}:${asset.symbol}`, result.value.price);
      });
    }
    this.confirmedFlips.forEach(candidate => {
      const price = currentPriceByAsset.get(`${candidate.marketClass}:${candidate.symbol}`);
      if (price) candidate.currentPrice = price;
    });

    return {
      activeAlerts,
      history,
      dailyRegimeScan: { ...this.dailyRegimeScanStatus },
      dailySmaReclaim,
      manualScan: this.getManualAlertScanStatus(userId),
      flipCandidates: this.flipCandidates.map(candidate => ({ ...candidate })),
      confirmedFlips: this.confirmedFlips.map(candidate => ({ ...candidate })),
      scanCoverage: this.flipScanCoverage.map(item => ({ ...item })),
      strategySetups: this.strategySetups.map(setup => ({ ...setup })),
      updatedAt: Date.now(),
      ...this.telegramBot.getDeliveryConfiguration()
    };
  }

  public getDailyRegimeScanStatus() {
    return { ...this.dailyRegimeScanStatus };
  }

  public runDailySmaReclaimScan(now = Date.now()): Promise<DailySmaReclaimReport> {
    return this.dailySmaReclaim.run(now);
  }

  public runMaCrossAlertScan(now = Date.now()) {
    return this.maCrossAlerts.run(now);
  }

  public runStructureScannerScan(now = Date.now(), timeframes?: StructureScanTimeframe[]) {
    return this.structureScanner.run(now, timeframes);
  }

  public getDailySmaReclaimReport(): Promise<DailySmaReclaimReport | null> {
    return this.dailySmaReclaim.getLatest();
  }

  public async clearAlerts(userId: string, target: 'active' | 'history' | 'all') {
    await this.restoreDailyRegimeState(true);
    let removedActive = 0;
    let removedHistory = 0;
    if (target === 'active' || target === 'all') {
      for (const [id, rule] of this.bullishCloudAlerts.entries()) {
        if (rule.userId !== userId) continue;
        this.bullishCloudAlerts.delete(id);
        removedActive += 1;
      }
    }
    if (target === 'history' || target === 'all') {
      removedHistory = this.confirmedFlips.length;
      this.confirmedFlips = [];
      this.alertHistory = this.alertHistory.filter(alert =>
        alert.ruleId !== 'global:flip-scan'
        && !alert.ruleId?.startsWith(`${userId}:`)
      );
      await this.persistDailyRegimeState();
    }
    return { removedActive, removedHistory };
  }

  public getManualAlertScanStatus(userId: string): ManualAlertScanStatus {
    const status = this.manualAlertScanStatuses.get(userId);
    if (status?.running && (status.scope === 'full' || status.scope === 'flips')) {
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
    const cooldownDuration = (scope === 'full' || scope === 'flips' || scope === 'strategies') ? 5 * 60_000 : 60_000;
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

    const promise = (
      scope === 'strategies'
        ? this.executeStrategiesScan(userId)
        : scope === 'flips' || scope === 'full'
          ? this.executeManualFullScan(userId, scope)
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

  private async executeManualFullScan(userId: string, scope: 'full' | 'flips' = 'full'): Promise<ManualAlertScanStatus> {
    try {
      const result = await this.runDailyRegimeScan();
      return this.updateManualAlertScanStatus(userId, {
        scope,
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
        scope,
        running: false,
        lastCompletedAt: Date.now(),
        lastError: error instanceof Error ? error.message : 'Scanarea completă a eșuat.'
      });
    }
  }

  public async runStrategyScan(userId?: string): Promise<ManualAlertScanStatus> {
    return this.executeStrategiesScan(userId);
  }

  private async executeStrategiesScan(userId?: string): Promise<ManualAlertScanStatus> {
    await this.restoreDailyRegimeState(true);
    const startedAt = Date.now();
    if (userId) {
      this.updateManualAlertScanStatus(userId, {
        scope: 'strategies',
        running: true,
        scannedAssets: 0,
        totalAssets: 0,
        matches: 0,
        errors: 0,
        lastStartedAt: startedAt
      });
    }

    try {
      // Only the backtested stocks/ETF Donchian model is production-approved.
      // Experimental crypto, metals, Macro, Sniper and SHORT models remain in
      // Backtest Lab and cannot generate automatic trade alerts.
      const universe = getScannerAssets('stocks').filter(asset => asset.marketClass === 'stocks');
      if (userId) {
        this.updateManualAlertScanStatus(userId, {
          totalAssets: universe.length
        });
      }

      const benchmarks = await this.getDailyStrategyBenchmarks();
      const currentSnapshots: StrategyAlertSnapshot[] = [];
      const events: StrategyAlertSnapshot[] = [];
      let errors = 0;
      const concurrency = 4;

      for (let index = 0; index < universe.length; index += concurrency) {
        const batch = universe.slice(index, index + concurrency);
        const settled = await Promise.allSettled(batch.map(asset =>
          this.scanStrategyAsset(asset.symbol, asset.marketClass as AssetMarketClass, benchmarks)
        ));

        settled.forEach(result => {
          if (result.status === 'fulfilled') {
            if (result.value.snapshots?.length) {
              currentSnapshots.push(...result.value.snapshots);
            } else if (result.value.current) {
              currentSnapshots.push(result.value.current);
            }
            if (result.value.events.length) events.push(...result.value.events);
          } else {
            errors += 1;
            console.warn('Strategy asset scan failed:', result.reason instanceof Error ? result.reason.message : result.reason);
          }
        });
        if (userId) {
          this.updateManualAlertScanStatus(userId, {
            scannedAssets: Math.min(universe.length, index + batch.length),
            totalAssets: universe.length,
            matches: currentSnapshots.length,
            errors
          });
        }
      }

      const uniqueSetups = new Map<string, StrategyAlertSnapshot>();
      currentSnapshots.forEach(setup => {
        const key = `${setup.strategy}:${setup.symbol}:${setup.timeframe}`;
        if (!uniqueSetups.has(key)) uniqueSetups.set(key, setup);
      });

      this.strategySetups = Array.from(uniqueSetups.values())
        .sort((left, right) => {
          const stageRank = { CONFIRMED: 0, ARMED: 1, WATCH: 2 } as const;
          if (left.stage !== right.stage) return stageRank[left.stage] - stageRank[right.stage];
          if ((left.distanceToBreakoutAtr ?? 0) !== (right.distanceToBreakoutAtr ?? 0)) {
            return (left.distanceToBreakoutAtr ?? 0) - (right.distanceToBreakoutAtr ?? 0);
          }
          return (left.riskPercent ?? 0) - (right.riskPercent ?? 0);
        })
        .slice(0, 50);

      await this.publishStrategyEvents(events, 'scheduled/full scan');
      await this.persistDailyRegimeState();

      const status: ManualAlertScanStatus = {
        scope: 'strategies',
        running: false,
        scannedAssets: universe.length,
        totalAssets: universe.length,
        matches: currentSnapshots.length,
        errors,
        lastCompletedAt: Date.now(),
        lastStartedAt: startedAt,
        lastError: undefined
      };
      if (userId) this.updateManualAlertScanStatus(userId, status);
      return status;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Scanarea de strategii a eșuat.';
      const status: ManualAlertScanStatus = {
        scope: 'strategies',
        running: false,
        scannedAssets: 0,
        totalAssets: 0,
        matches: 0,
        errors: 1,
        lastCompletedAt: Date.now(),
        lastStartedAt: startedAt,
        lastError: errMsg
      };
      if (userId) this.updateManualAlertScanStatus(userId, status);
      return status;
    }
  }

  private async scanStrategyAsset(
    symbol: string,
    marketClass: AssetMarketClass,
    benchmarks: Record<'crypto' | 'stocks', Candle[]>
  ): Promise<StrategyAlertEvaluation> {
    const [dailyRaw, weekly, candles4h] = await Promise.all([
      this.marketData.getCandles(symbol, '1d', 340, marketClass),
      this.marketData.getCandles(symbol, '1w', 260, marketClass),
      this.marketData.getCandles(symbol, '4h', 320, marketClass).catch(() => [])
    ]);
    const currentUtcDay = new Date();
    currentUtcDay.setUTCHours(0, 0, 0, 0);
    const daily = dailyRaw.map(candle =>
      candle.isClosed === false && candle.timestamp < currentUtcDay.getTime()
        ? { ...candle, isClosed: true }
        : candle
    );
    const benchmark = marketClass === 'crypto' ? benchmarks.crypto : benchmarks.stocks;
    return evaluateDailyStrategyAlerts(symbol, marketClass, daily, benchmark, weekly, candles4h);
  }

  private async executeManualQuickScan(
    userId: string,
    watchlist: ManualAlertScanAssetInput[]
  ): Promise<ManualAlertScanStatus> {
    try {
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
      const candidates: FlipCandidate[] = [];
      const confirmedHistory: FlipCandidate[] = [];
      const newlyConfirmed: FlipCandidate[] = [];
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
          await Promise.allSettled(matchingRules.map(rule => this.evaluateBullishCloudAlert(rule)));
          return this.scanFlipAsset(asset.symbol, asset.marketClass);
        }));

        settled.forEach(result => {
          if (result.status === 'fulfilled') {
            candidates.push(...result.value.upcoming);
            confirmedHistory.push(...result.value.confirmedHistory);
            newlyConfirmed.push(...result.value.newlyConfirmed);
          } else {
            errors += 1;
            console.warn('Quick manual alert scan failed:', result.reason instanceof Error ? result.reason.message : result.reason);
          }
        });
        this.updateManualAlertScanStatus(userId, {
          scannedAssets: Math.min(assets.length, index + batch.length),
          matches: newlyConfirmed.length,
          errors
        });
      }

      await this.publishConfirmedFlipEvents([...newlyConfirmed, ...confirmedHistory.filter(c => c.timeframe === '1w')], 'manual quick scan');
      this.mergeConfirmedFlips(confirmedHistory);
      this.flipCandidates = this.rankUpcomingCandidates([...candidates, ...this.flipCandidates]);
      await this.persistDailyRegimeState();
      return this.updateManualAlertScanStatus(userId, {
        scope: 'quick',
        running: false,
        scannedAssets: assets.length,
        totalAssets: assets.length,
        matches: newlyConfirmed.length,
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
  public runDailyRegimeScan(options: { timeframes?: TelegramFlipTimeframe[] } = {}): Promise<DailyRegimeScanStatus> {
    if (this.dailyRegimeScanPromise) return this.dailyRegimeScanPromise;

    this.dailyRegimeScanPromise = this.executeDailyRegimeScan(options.timeframes || TELEGRAM_FLIP_TIMEFRAMES).finally(() => {
      this.dailyRegimeScanPromise = undefined;
    });
    return this.dailyRegimeScanPromise;
  }

  private async executeDailyRegimeScan(timeframes: TelegramFlipTimeframe[] = TELEGRAM_FLIP_TIMEFRAMES): Promise<DailyRegimeScanStatus> {
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
      // 150 CoinGecko market-cap coins for flip detection (see executeTelegramMoneyLineScan):
      // mid-caps like CAKE must reach confirmed-history, dashboard and Telegram.
      const [liveCrypto, stocks, metals] = await Promise.all([
        this.marketData.getFlipUniverseCryptoAssets(),
        Promise.resolve(getScannerAssets('stocks')),
        Promise.resolve(getScannerAssets('metals'))
      ]);
      const universe = [...liveCrypto, ...stocks, ...metals].filter(
        asset => asset.marketClass === 'crypto' || asset.marketClass === 'stocks' || asset.marketClass === 'metals'
      );
      this.dailyRegimeScanStatus.totalAssets = universe.length;
      const candidates: FlipCandidate[] = [];
      const confirmedHistory: FlipCandidate[] = [];
      const newlyConfirmed: FlipCandidate[] = [];
      const coverage: FlipScanCoverageItem[] = [];
      let errors = 0;
      const concurrency = 4;

      for (let index = 0; index < universe.length; index += concurrency) {
        const batch = universe.slice(index, index + concurrency);
        const settled = await Promise.allSettled(batch.map(asset =>
          this.scanFlipAsset(asset.symbol, asset.marketClass as AssetMarketClass, timeframes)
        ));

        settled.forEach((result, batchIndex) => {
          const asset = batch[batchIndex];
          if (result.status === 'fulfilled') {
            const attachMarketCapRank = (items: FlipCandidate[]) => items.map(item => ({
              ...item,
              marketCapRank: asset.marketClass === 'crypto' && Number.isFinite(asset.rank) ? asset.rank : undefined
            }));
            candidates.push(...attachMarketCapRank(result.value.upcoming));
            confirmedHistory.push(...attachMarketCapRank(result.value.confirmedHistory));
            newlyConfirmed.push(...attachMarketCapRank(result.value.newlyConfirmed));
            const source = result.value.coverage;
            if (source) {
              coverage.push({ symbol: asset.symbol, name: asset.name, marketClass: asset.marketClass as AssetMarketClass, rank: asset.rank, scannedAt: Date.now(), ...source });
            }
          } else {
            errors += 1;
            // Promise.allSettled does not retain the asset on the rejection, so
            // the batch index is used below to keep failed assets visible.
            console.warn('Flip-only asset scan failed:', result.reason instanceof Error ? result.reason.message : result.reason);
          }
        });
        settled.forEach((result, batchIndex) => {
          if (result.status === 'rejected') {
            const asset = batch[batchIndex];
            coverage.push({ symbol: asset.symbol, name: asset.name, marketClass: asset.marketClass as AssetMarketClass, rank: asset.rank, status: 'ERROR', weeklyCandidate: false, weeklyConfirmed: false, candidateCount: 0, confirmedCount: 0, scannedAt: Date.now(), error: result.reason instanceof Error ? result.reason.message : String(result.reason) });
          }
        });
        this.dailyRegimeScanStatus.scannedAssets += settled.filter(result => result.status === 'fulfilled').length;
      }

      this.flipCandidates = this.rankUpcomingCandidates(candidates);
      this.flipScanCoverage = coverage.sort((left, right) => (left.rank || 9999) - (right.rank || 9999) || left.symbol.localeCompare(right.symbol));
      const outcomes = { CONFIRMED: 0, CANDIDATE: 0, NO_SETUP: 0, INSUFFICIENT_DATA: 0, ERROR: 0 } as Record<FlipScanCoverageStatus, number>;
      const byMarket = { crypto: 0, stocks: 0, metals: 0 } as Record<AssetMarketClass, number>;
      this.flipScanCoverage.forEach(item => { outcomes[item.status] += 1; byMarket[item.marketClass] += 1; });
      await this.publishConfirmedFlipEvents([...newlyConfirmed, ...confirmedHistory.filter(c => c.timeframe === '1w')], 'scheduled/full scan');
      this.mergeConfirmedFlips(confirmedHistory);

      this.dailyRegimeScanStatus = {
        ...this.dailyRegimeScanStatus,
        lastCompletedAt: Date.now(),
        matches: newlyConfirmed.length,
        strategyMatches: 0,
        strategyArmed: 0,
        errors,
        running: false,
        coverage: { totalAssets: universe.length, scannedAssets: this.flipScanCoverage.filter(item => item.status !== 'ERROR').length, outcomes, byMarket }
      };
      const activeKeys = new Set(universe.map(asset => `${asset.marketClass}:${asset.symbol}`));
      this.confirmedFlips = this.confirmedFlips.filter(candidate => activeKeys.has(`${candidate.marketClass}:${candidate.symbol}`));
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
      const assetUrl = buildMoneyLineAssetUrl({
        baseUrl: dashboardBaseUrl,
        symbol: event.symbol,
        timeframe: event.timeframe,
        marketClass: event.marketClass
      });
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
        `\n${telegramAssetLink({ baseUrl: dashboardBaseUrl, symbol: event.symbol, timeframe: event.timeframe, marketClass: event.marketClass })} • ${event.marketClass.toUpperCase()} • ${formatAlertPrice(event.signalPrice)}`,
        ...contextLines,
        `*ATR(14):* ${formatAlertPrice(event.atr14)}${event.sma5 ? ` | *SMA5:* ${formatAlertPrice(event.sma5)}` : ''}`,
        '',
        ...actionLines,
        `\n_Semnal determinist pe lumânare închisă. Nivelurile trebuie recalculate la execuția reală și nu garantează profitul._`,
        source === 'manual quick scan' ? `_Sursă: scanare manuală rapidă._` : `_Sursă: scanare automată/completă._`,
        `\n📈 [Deschide graficul Money Line](${assetUrl})`
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
        dashboardLink: assetUrl,
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
          `▼ ${telegramAssetLink({ baseUrl: dashboardBaseUrl, symbol: match.symbol, timeframe: '1d', marketClass: match.marketClass })} · ${formatAlertPrice(match.price)} · SMA50 ${formatAlertPrice(match.sma50)} · ML1W ${match.weeklyTier} (${match.weeklyScore > 0 ? '+' : ''}${match.weeklyScore}) · ML1D ${match.dailyTier} (${match.dailyScore})`
        ));
        lines.push('');
      }
      if (reversal.length) {
        lines.push(`🟢 *REVERSAL LONG — 1W bearish, 1D flip bullish peste SMA 50*`);
        reversal.forEach(match => lines.push(
          `▲ ${telegramAssetLink({ baseUrl: dashboardBaseUrl, symbol: match.symbol, timeframe: '1d', marketClass: match.marketClass })} · ${formatAlertPrice(match.price)} · SMA50 ${formatAlertPrice(match.sma50)} · ML1W ${match.weeklyTier} (${match.weeklyScore}) · ML1D ${match.dailyTier} (+${match.dailyScore})`
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
        dashboardLink: buildMoneyLineAssetUrl({
          baseUrl: dashboardBaseUrl,
          symbol: match.symbol,
          timeframe: '1d',
          marketClass: match.marketClass
        }),
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
      const scanIsRunning = this.dailyRegimeScanStatus.running;
      const snapshot = await this.dailyRegimeDocument().get();
      this.dailyRegimeStateLoadedAt = Date.now();
      if (!snapshot.exists) return;
      const stored = snapshot.data() as {
        status?: DailyRegimeScanStatus;
        alerts?: DispatchedAlert[];
      flipCandidates?: FlipCandidate[];
      confirmedFlips?: FlipCandidate[];
      scanCoverage?: FlipScanCoverageItem[];
      strategySetups?: StrategyAlertSnapshot[];
      schemaVersion?: number;
      activeRunId?: string;
    } | undefined;

      if (stored?.schemaVersion === 2 && stored.activeRunId) {
        const run = await this.dailyRegimeDocument().collection('runs').doc(stored.activeRunId).get();
        const segmentIds = (run.data()?.segmentIds as string[] | undefined) || [];
        const segments = await Promise.all(segmentIds.map(id =>
          this.dailyRegimeDocument().collection('runs').doc(stored.activeRunId!).collection('segments').doc(id).get()
        ));
        const values = new Map<string, unknown[]>();
        segments.forEach(segment => {
          const data = segment.data();
          // Key by segment id: a group with more than 80 items is split into
          // several segments (confirmed-crypto-1w-001, -002, ...). Keying by
          // kind+group alone let the last chunk overwrite the others, so large
          // groups were silently truncated on restore (fixed 2026-09-24).
          if (data?.kind && Array.isArray(data.items)) values.set(`${data.kind}:${data.group || ''}:${segment.id}`, data.items);
        });
        const collect = (kind: string) => Array.from(values.entries())
          .filter(([key]) => key.startsWith(`${kind}:`))
          .flatMap(([, items]) => items);
        if (stored.status && !scanIsRunning) this.dailyRegimeScanStatus = {
          ...stored.status,
          enabled: true,
          schedule: '0 8 * * *',
          timezone: 'Europe/Bucharest',
          running: false
        };
        this.flipCandidates = collect('candidates') as FlipCandidate[];
        this.confirmedFlips = collect('confirmed') as FlipCandidate[];
        this.flipScanCoverage = collect('coverage') as FlipScanCoverageItem[];
        this.strategySetups = collect('strategies') as StrategyAlertSnapshot[];
        const persistedAlerts = collect('alerts') as DispatchedAlert[];
        if (persistedAlerts.length) {
          const individual = this.alertHistory.filter(alert => alert.type !== 'MultiTimeframeReversal' && alert.type !== 'StrategySetup');
          this.alertHistory = [...persistedAlerts, ...individual].sort((left, right) => right.timestamp - left.timestamp).slice(0, 250);
        }
        return;
      }
      // Dashboard polling must not replace live progress with a persisted
      // partial status from an earlier write while a scan is still running.
      if (stored?.status && !scanIsRunning) this.dailyRegimeScanStatus = {
        ...stored.status,
        enabled: true,
        schedule: '0 8 * * *',
        timezone: 'Europe/Bucharest',
        running: false
      };
      if (Array.isArray(stored?.flipCandidates)) this.flipCandidates = stored.flipCandidates.slice(0, 400);
      if (Array.isArray(stored?.confirmedFlips)) this.confirmedFlips = stored.confirmedFlips.slice(0, CONFIRMED_FLIPS_CAP);
      if (Array.isArray(stored?.scanCoverage)) this.flipScanCoverage = stored.scanCoverage.slice(0, 500);
      if (Array.isArray(stored?.strategySetups)) this.strategySetups = stored.strategySetups.slice(0, 100);
      if (Array.isArray(stored?.alerts)) {
        const individual = this.alertHistory.filter(alert =>
          alert.type !== 'MultiTimeframeReversal' && alert.type !== 'StrategySetup'
        );
        const migratedAlerts = stored.alerts.filter(alert =>
          alert.ruleId === 'global:flip-scan' || alert.ruleId === 'global:daily-strategy-scan'
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
        .filter(alert => alert.ruleId === 'global:flip-scan' || alert.ruleId === 'global:daily-strategy-scan')
        .slice(0, 200);
      // JSON normalization strips optional undefined values rejected by
      // Firestore while preserving the exact dashboard payload shape.
      const main = this.dailyRegimeDocument();
      const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const run = main.collection('runs').doc(runId);
      const safeStatus = JSON.parse(JSON.stringify(this.dailyRegimeScanStatus)) as DailyRegimeScanStatus;
      const segmentIds: string[] = [];
      const groups = new Map<string, { kind: string; group: string; items: unknown[] }>();
      const add = (kind: string, group: string, items: unknown[]) => {
        const normalized = JSON.parse(JSON.stringify(items));
        for (let index = 0; index < normalized.length; index += 80) {
          const chunk = normalized.slice(index, index + 80);
          const id = `${kind}-${group || 'all'}-${String(Math.floor(index / 80) + 1).padStart(3, '0')}`;
          segmentIds.push(id);
          groups.set(id, { kind, group, items: chunk });
        }
      };
      const grouped = (items: Array<{ marketClass?: string; timeframe?: string }>) => {
        const map = new Map<string, unknown[]>();
        items.forEach(item => {
          const key = `${item.marketClass || 'all'}-${item.timeframe || 'all'}`;
          map.set(key, [...(map.get(key) || []), item]);
        });
        return map;
      };
      grouped(this.flipCandidates).forEach((items, key) => add('candidates', key, items));
      grouped(this.confirmedFlips).forEach((items, key) => add('confirmed', key, items));
      grouped(this.flipScanCoverage).forEach((items, key) => add('coverage', key, items));
      add('alerts', 'all', alerts);
      add('strategies', 'all', this.strategySetups);
      const db = main.firestore;
      let batch = db.batch();
      let writes = 0;
      for (const [id, segment] of groups) {
        batch.set(run.collection('segments').doc(id), { ...segment, updatedAt: Date.now() });
        writes += 1;
        if (writes === 450) { await batch.commit(); batch = db.batch(); writes = 0; }
      }
      batch.set(run, {
        schemaVersion: 2,
        status: safeStatus,
        segmentIds,
        counts: {
          candidates: this.flipCandidates.length,
          confirmed: this.confirmedFlips.length,
          coverage: this.flipScanCoverage.length,
          alerts: alerts.length,
          strategies: this.strategySetups.length
        },
        updatedAt: Date.now()
      });
      await batch.commit();
      await main.set({
        schemaVersion: 2,
        activeRunId: runId,
        status: safeStatus,
        summary: this.dailyRegimeScanStatus.coverage,
        updatedAt: Date.now()
      });
      const oldRuns = await main.collection('runs').listDocuments();
      const keep = new Set(oldRuns.map(ref => ref.id).sort().slice(-3));
      keep.add(runId);
      for (const oldRun of oldRuns) {
        if (keep.has(oldRun.id)) continue;
        const oldSegments = await oldRun.collection('segments').listDocuments();
        let deleteBatch = db.batch();
        let deleteCount = 0;
        for (const segment of oldSegments) {
          deleteBatch.delete(segment); deleteCount += 1;
          if (deleteCount === 450) { await deleteBatch.commit(); deleteBatch = db.batch(); deleteCount = 0; }
        }
        deleteBatch.delete(oldRun);
        await deleteBatch.commit();
      }
      this.dailyRegimeStateLoadedAt = Date.now();
    } catch (error) {
      console.warn('Daily regime state persistence failed:', error instanceof Error ? error.message : error);
    }
  }

  private calculateFlipCandidate(
    symbol: string,
    marketClass: AssetMarketClass,
    timeframe: Extract<Timeframe, '4h' | '8h' | '1d' | '1w'>,
    candles: Awaited<ReturnType<MarketDataService['getCandles']>>,
    currentPrice: number,
    weeklyTier: MoneyLineTier,
    weeklyScore: number
  ): FlipCandidate | undefined {
    const closedCandles = candles
      .filter(candle => candle.isClosed !== false)
      .sort((left, right) => left.timestamp - right.timestamp);
    const minCandles = timeframe === '1w' ? 15 : 30;
    if (closedCandles.length < minCandles || !Number.isFinite(currentPrice) || currentPrice <= 0) return undefined;

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
    // Setup score: component model that differentiates confirmed flips as well as
    // candidates on the same 0-100 scale (replaces the saturating 92+boosts formula).
    const priorityScore = calculateFlipPriorityScore({
      direction,
      currentPrice,
      triggerPrice,
      atr,
      moneyLineScore: signal.score,
      weeklyTier,
      rvol: signal.rawIndicators.rvol,
      sma50,
      sma200
    }).total;
    const confirmedAt = confirmed
      ? Math.min(Date.now(), closedCandles[lastIndex].timestamp + FLIP_TIMEFRAME_DURATION_MS[timeframe])
      : undefined;
    const assetInfo = TRADING_360_ASSETS.find(a =>
      a.symbol.toUpperCase() === symbol.toUpperCase()
      && (!a.marketClass || a.marketClass === marketClass)
    ) || TRADING_360_ASSETS.find(a => a.symbol.toUpperCase() === symbol.toUpperCase());
    const name = assetInfo?.name;

    return {
      id: `${marketClass}:${symbol}:${timeframe}:${direction}`,
      symbol,
      name,
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
      confirmationPrice: confirmed ? Number(closedCandles[lastIndex].close.toFixed(8)) : undefined,
      confirmedAt,
      scannedAt: Date.now()
    };
  }

  private findMostRecentConfirmedFlip(
    symbol: string,
    marketClass: AssetMarketClass,
    timeframe: TelegramFlipTimeframe,
    candles: Awaited<ReturnType<MarketDataService['getCandles']>>,
    currentPrice: number,
    weeklyTier: MoneyLineTier,
    weeklyScore: number
  ): FlipCandidate | undefined {
    const closedCandles = candles
      .filter(candle => candle.isClosed !== false)
      .sort((left, right) => left.timestamp - right.timestamp);
    const minCandles = timeframe === '1w' ? 15 : 30;
    if (closedCandles.length < minCandles) return undefined;

    const cloud = calculateMoneyLineCloud(closedCandles, timeframe);
    let flipIndex = -1;
    for (let index = closedCandles.length - 1; index >= minCandles - 1; index -= 1) {
      if (cloud.buySignals[index] || cloud.sellSignals[index]) {
        flipIndex = index;
        break;
      }
    }
    if (flipIndex < 0) return undefined;

    const confirmationCandle = closedCandles[flipIndex];
    const candidate = this.calculateFlipCandidate(
      symbol,
      marketClass,
      timeframe,
      closedCandles.slice(0, flipIndex + 1),
      confirmationCandle.close,
      weeklyTier,
      weeklyScore
    );
    if (!candidate || candidate.status !== 'CONFIRMED') return undefined;

    const confirmedAt = Math.min(Date.now(), confirmationCandle.timestamp + FLIP_TIMEFRAME_DURATION_MS[timeframe]);
    return {
      ...candidate,
      currentPrice: Number(currentPrice.toFixed(8)),
      confirmationPrice: Number(confirmationCandle.close.toFixed(8)),
      confirmedAt
    };
  }

  private async scanFlipAsset(
    symbol: string,
    marketClass: AssetMarketClass,
    timeframes: TelegramFlipTimeframe[] = TELEGRAM_FLIP_TIMEFRAMES
  ): Promise<FlipAssetScanResult> {
    const include = new Set(timeframes);
    const [quote, dailyRaw, weekly, candles4h, candles8h] = await Promise.all([
      this.marketData.getPriceQuote(symbol, marketClass).catch(() => undefined),
      this.marketData.getCandles(symbol, '1d', 320, marketClass),
      this.marketData.getCandles(symbol, '1w', 260, marketClass),
      include.has('4h') ? this.marketData.getCandles(symbol, '4h', 320, marketClass).catch(() => []) : Promise.resolve([]),
      include.has('8h') ? this.marketData.getCandles(symbol, '8h', 320, marketClass).catch(() => []) : Promise.resolve([])
    ]);
    const currentUtcDay = new Date();
    currentUtcDay.setUTCHours(0, 0, 0, 0);
    const daily = dailyRaw.map(candle =>
      candle.isClosed === false && candle.timestamp < currentUtcDay.getTime()
        ? { ...candle, isClosed: true }
        : candle
    );
    const dailyClosed = daily.filter(candle => candle.isClosed !== false).sort((left, right) => left.timestamp - right.timestamp);
    const weeklyClosed = weekly.filter(candle => candle.isClosed !== false).sort((left, right) => left.timestamp - right.timestamp);
    const weeklySignal = this.moneyLine.calculateLatest(symbol, '1w', weeklyClosed);
    const price = quote?.price || dailyClosed[dailyClosed.length - 1]?.close || 0;
    if (!weeklySignal || !price) return {
      upcoming: [], confirmedHistory: [], newlyConfirmed: [],
      coverage: { status: 'INSUFFICIENT_DATA', weeklyCandidate: false, weeklyConfirmed: false, candidateCount: 0, confirmedCount: 0 }
    };

    const timeframeCandles = ([
      ['4h', candles4h],
      ['8h', candles8h],
      ['1d', dailyClosed],
      ['1w', weeklyClosed]
    ] as const).filter(([timeframe]) => include.has(timeframe));
    const latestCandidates = timeframeCandles.map(([timeframe, timeframeSeries]) =>
      this.calculateFlipCandidate(symbol, marketClass, timeframe, timeframeSeries, price, weeklySignal.tier, weeklySignal.score)
    ).filter((candidate): candidate is FlipCandidate => Boolean(candidate));
    const confirmedHistory = timeframeCandles.map(([timeframe, timeframeSeries]) =>
      this.findMostRecentConfirmedFlip(symbol, marketClass, timeframe, timeframeSeries, price, weeklySignal.tier, weeklySignal.score)
    ).filter((candidate): candidate is FlipCandidate => Boolean(candidate));

    const weeklyCandidate = latestCandidates.some(candidate => candidate.timeframe === '1w' && candidate.status !== 'CONFIRMED');
    const weeklyConfirmed = confirmedHistory.some(candidate => candidate.timeframe === '1w' && candidate.status === 'CONFIRMED');
    return {
      upcoming: latestCandidates.filter(candidate => candidate.status !== 'CONFIRMED'),
      confirmedHistory,
      // Newly confirmed flips on the latest closed candle are Telegram events.
      // Exception for 1W: the latest recorded 1W flip per asset is also
      // delivered (new or older, as shown on site). Other timeframes' history
      // stays dashboard-only. Call sites append confirmedHistory 1W entries;
      // the alertHistory filter in publishConfirmedFlipEvents keeps delivery
      // one-time (backfill once, then new only).
      newlyConfirmed: latestCandidates.filter(candidate => candidate.status === 'CONFIRMED'),
      coverage: {
        status: weeklyConfirmed ? 'CONFIRMED' : weeklyCandidate ? 'CANDIDATE' : 'NO_SETUP',
        weeklyCandidate,
        weeklyConfirmed,
        candidateCount: latestCandidates.filter(candidate => candidate.status !== 'CONFIRMED').length,
        confirmedCount: confirmedHistory.length
      }
    };
  }

  private rankUpcomingCandidates(candidates: FlipCandidate[]): FlipCandidate[] {
    const bestByAssetTimeframe = new Map<string, FlipCandidate>();
    const ranked = candidates
      .filter(candidate => candidate.status !== 'CONFIRMED')
      .sort((left, right) => right.priorityScore - left.priorityScore || left.distanceAtr - right.distanceAtr);
    ranked.forEach(candidate => {
      const key = `${candidate.marketClass}:${candidate.symbol}:${candidate.timeframe}`;
      if (!bestByAssetTimeframe.has(key)) bestByAssetTimeframe.set(key, candidate);
    });

    // Retain up to 100 candidates per timeframe. The UI shows a focused
    // Top 20 by default, while timeframe filters and symbol search can reveal
    // a specific setup such as ETH 1W without letting 4H candidates hide it.
    const timeframes: FlipCandidate['timeframe'][] = ['4h', '8h', '1d', '1w'];
    return timeframes
      .flatMap(timeframe => Array.from(bestByAssetTimeframe.values())
        .filter(candidate => candidate.timeframe === timeframe)
        .slice(0, 100))
      .sort((left, right) => right.priorityScore - left.priorityScore || left.distanceAtr - right.distanceAtr);
  }

  private mergeConfirmedFlips(candidates: FlipCandidate[]) {
    const keyOf = (candidate: FlipCandidate) =>
      `${candidate.marketClass}:${candidate.symbol}:${candidate.timeframe}`;
    const freshness = (candidate: FlipCandidate) => candidate.confirmedAt || candidate.candleTimestamp;
    const unique = new Map<string, FlipCandidate>();
    // Restored history first, freshly computed entries second: a fresh scan
    // wins for the same asset/timeframe when it describes the same or a newer
    // flip. The previous priorityScore tie-break pinned stale scores from an
    // older formula version (e.g. legacy flat 100/100) above the current
    // rescore of the same flip.
    for (const candidate of this.confirmedFlips) unique.set(keyOf(candidate), candidate);
    for (const candidate of candidates) {
      const existing = unique.get(keyOf(candidate));
      if (!existing
        || freshness(candidate) > freshness(existing)
        || candidate.candleTimestamp === existing.candleTimestamp) {
        unique.set(keyOf(candidate), candidate);
      }
    }
    // The dashboard represents the current Money Line regime: retain only
    // the most recent confirmed transition for each asset/timeframe.
    // Cap sits well above the natural maximum (one entry per asset/timeframe,
    // ~280 assets x 4 timeframes ~ 1,100) so old flips, typically Weekly ones,
    // are never dropped for age. Was 1,000 until 2026-09-24.
    this.confirmedFlips = Array.from(unique.values())
      .sort((left, right) => freshness(right) - freshness(left)
        || right.priorityScore - left.priorityScore)
      .slice(0, CONFIRMED_FLIPS_CAP);
  }

  private async publishConfirmedFlipEvents(
    candidates: FlipCandidate[],
    source: 'scheduled/full scan' | 'manual quick scan'
  ) {
    // Dedupe identical flips arriving from two sources so no duplicate lines
    // are emitted within one publish batch.
    const deduped = Array.from(
      new Map(
        candidates.map(candidate => [
          `flip:${candidate.marketClass}:${candidate.symbol}:${candidate.timeframe}:${candidate.direction}:${candidate.candleTimestamp}`,
          candidate
        ])
      ).values()
    );
    const fresh = deduped.filter(candidate => {
      const key = `flip:${candidate.marketClass}:${candidate.symbol}:${candidate.timeframe}:${candidate.direction}:${candidate.candleTimestamp}`;
      return !this.alertHistory.some(alert => alert.idempotencyKey === key);
    });
    if (!fresh.length) return 0;
    const ranked = fresh.slice().sort((left, right) => right.priorityScore - left.priorityScore);
    const dashboardBaseUrl = process.env.PUBLIC_BASE_URL || 'https://market-scanner-360-384051756749.europe-west3.run.app';
    const candidateKey = (candidate: FlipCandidate) =>
      `${candidate.marketClass}:${candidate.symbol}:${candidate.timeframe}:${candidate.direction}:${candidate.candleTimestamp}`;
    const selectedKeys = new Set<string>();
    const deliveredKeys = new Set<string>();
    const candidateMessages = new Map<string, string>();
    const destinations = await this.getTelegramFlipAlertDestinations();

    await Promise.all(destinations.map(async destination => {
      const preferences = await this.getTelegramFlipAlertPreferences(destination.chatId, true);
      const selected = preferences.enabled
        ? ranked.filter(candidate => preferences.timeframes.includes(candidate.timeframe))
        : [];
      if (!selected.length) return;

      const lines = [
        `🔔 *${selected.length} FLIP${selected.length === 1 ? '' : 'URI'} MONEYLINE CONFIRMAT${selected.length === 1 ? '' : 'E'}*`,
        `_Numai lumânări închise · ordonate după scorul setupului_`,
        ''
      ];
      selected.slice(0, 10).forEach(candidate => {
        const confirmationPrice = candidate.confirmationPrice || candidate.currentPrice;
        const confirmedAt = candidate.confirmedAt
          || Math.min(Date.now(), candidate.candleTimestamp + FLIP_TIMEFRAME_DURATION_MS[candidate.timeframe]);
        const assetLabel = candidate.name && candidate.name.toUpperCase() !== candidate.symbol.toUpperCase()
          ? ` (${candidate.name})`
          : '';
        lines.push(
          `${candidate.direction === 'BULLISH' ? '🟢 ▲' : '🔴 ▼'} ${telegramAssetLink({ baseUrl: dashboardBaseUrl, symbol: candidate.symbol, timeframe: candidate.timeframe, marketClass: candidate.marketClass })}${assetLabel} ${candidate.timeframe.toUpperCase()} · ${candidate.priorityScore.toFixed(0)}/100 · ${candidate.marketClass.toUpperCase()}`,
          `*Închidere flip:* ${formatAlertPrice(confirmationPrice)} → *Preț acum:* ${formatAlertPrice(candidate.currentPrice)} (*${formatFlipMove(confirmationPrice, candidate.currentPrice)}*)`,
          `*Confirmat:* ${formatFlipAge(confirmedAt)} · ${formatFlipDate(confirmedAt)}`,
          `ML1W ${candidate.weeklyTier} (${candidate.weeklyScore > 0 ? '+' : ''}${candidate.weeklyScore}) · RVOL ${candidate.rvol.toFixed(2)}x · SMA50 ${candidate.sma50Aligned ? 'aliniat' : 'neconfirmat'} · SMA200 ${candidate.sma200Aligned ? 'aliniat' : 'neconfirmat'}`
        );
      });
      if (selected.length > 10) lines.push(`…și încă ${selected.length - 10} flipuri în pagina Alerte.`);
      lines.push(
        '',
        `_Scorul este un clasament tehnic, nu o probabilitate de profit._`,
        source === 'manual quick scan' ? `_Sursă: scanare rapidă flip-only._` : `_Sursă: scanare completă flip-only._`,
        `🔗 [Deschide Top Alerte](${dashboardBaseUrl})`
      );
      const message = lines.join('\n');
      selected.forEach(candidate => {
        const key = candidateKey(candidate);
        selectedKeys.add(key);
        if (!candidateMessages.has(key)) candidateMessages.set(key, message);
      });
      const delivered = await this.telegramBot.sendMarkdown(message, destination.chatId);
      if (delivered) selected.forEach(candidate => deliveredKeys.add(candidateKey(candidate)));
    }));

    ranked.forEach(candidate => {
      const idempotencyKey = `flip:${candidate.marketClass}:${candidate.symbol}:${candidate.timeframe}:${candidate.direction}:${candidate.candleTimestamp}`;
      const key = candidateKey(candidate);
      const telegramSelected = selectedKeys.has(key);
      this.alertHistory.unshift({
        id: `flip_${candidate.candleTimestamp}_${candidate.symbol}_${candidate.timeframe}_${candidate.direction}`,
        idempotencyKey,
        ruleId: 'global:flip-scan',
        symbol: candidate.symbol,
        type: 'MoneyLineTransition',
        title: `${candidate.direction === 'BULLISH' ? 'Bull' : 'Bear'} flip ${candidate.timeframe.toUpperCase()} confirmat — ${candidate.symbol}`,
        message: telegramSelected
          ? candidateMessages.get(key) || `Flip ${candidate.direction.toLowerCase()} ${candidate.timeframe.toUpperCase()} confirmat.`
          : `Flip ${candidate.direction.toLowerCase()} ${candidate.timeframe.toUpperCase()} confirmat. Telegram filtrat conform preferințelor; evenimentul rămâne disponibil în pagina Alerte.`,
        timeframe: candidate.timeframe,
        price: candidate.currentPrice,
        confirmationPrice: candidate.confirmationPrice || candidate.currentPrice,
        currentPrice: candidate.currentPrice,
        priceChangePercent: flipPriceMovePercent(candidate.confirmationPrice || candidate.currentPrice, candidate.currentPrice),
        confirmedAt: candidate.confirmedAt
          || Math.min(Date.now(), candidate.candleTimestamp + FLIP_TIMEFRAME_DURATION_MS[candidate.timeframe]),
        tier: candidate.moneyLineTier,
        reason: `Flip ${candidate.direction.toLowerCase()} confirmat pe lumânare închisă; scor tehnic ${candidate.priorityScore.toFixed(0)}/100.`,
        confidence: candidate.priorityScore / 100,
        timestamp: candidate.scannedAt,
        dashboardLink: buildMoneyLineAssetUrl({
          baseUrl: dashboardBaseUrl,
          symbol: candidate.symbol,
          timeframe: candidate.timeframe,
          marketClass: candidate.marketClass
        }),
        isDelivered: deliveredKeys.has(key)
      });
    });
    if (this.alertHistory.length > 250) this.alertHistory.splice(250);
    return fresh.length;
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
    const isNewRule = !existing;
    this.bullishCloudAlerts.set(id, rule);
    // Opening the Alerts view restores persisted browser rules via this endpoint.
    // That must never emit a Telegram message for a historic flip (e.g. UNI).
    // Initialize state silently; the periodic monitor will send only genuine new transitions.
    if (isNewRule) {
      try {
        const candles = await this.marketData.getCandles(
          rule.symbol,
          rule.timeframe,
          rule.timeframe === '1w' ? 300 : 500,
          rule.marketClass
        );
        const closedCandles = candles
          .filter(candle => candle.isClosed !== false)
          .sort((left, right) => left.timestamp - right.timestamp);
        if (closedCandles.length >= 2) {
          const cloud = calculateMoneyLineCloud(closedCandles, rule.timeframe);
          const lastIndex = closedCandles.length - 1;
          const isBullish = cloud.dirFast[lastIndex] < 0 && cloud.dirSlow[lastIndex] < 0;
          const candleTimestamp = closedCandles[lastIndex].timestamp;
          rule.lastWasBullish = isBullish;
          rule.lastEvaluatedCandle = candleTimestamp;
          rule.lastError = undefined;
          if (isBullish) {
            rule.lastTriggeredCandle = candleTimestamp;
            const signal = this.moneyLine.calculateLatest(rule.symbol, rule.timeframe, closedCandles);
            if (signal) {
              try {
                const profile = getTradePlanProfile(rule.timeframe);
                const confirmationEntries = await Promise.all(profile.confirmationTimeframes.map(async timeframe => {
                  try {
                    const confirmationCandles = await this.marketData.getCandles(rule.symbol, timeframe, timeframe === '1m' ? 260 : 300, rule.marketClass);
                    const confirmationSignal = this.moneyLine.calculateLatest(rule.symbol, timeframe, confirmationCandles);
                    return [timeframe, confirmationSignal] as const;
                  } catch {
                    return [timeframe, null] as const;
                  }
                }));
                const confirmationSignals: Partial<Record<Timeframe, MoneyLineSignal>> = {};
                confirmationEntries.forEach(([timeframe, confirmationSignal]) => {
                  if (confirmationSignal) confirmationSignals[timeframe] = confirmationSignal;
                });
                rule.lastPlan = calculateBullishTradePlan({
                  timeframe: rule.timeframe,
                  candles: closedCandles,
                  cloud,
                  signal,
                  currentPrice: (await this.marketData.getPriceQuote(rule.symbol, rule.marketClass).catch(() => undefined))?.price || closedCandles[lastIndex].close,
                  confirmationSignals
                });
              } catch {}
            }
          } else {
            rule.lastRetestTriggeredCandle = undefined;
          }
        }
      } catch {}
      return rule;
    }
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

      if (!isBullish) {
        rule.lastWasBullish = false;
        rule.lastRetestTriggeredCandle = undefined;
        rule.lastEvaluatedCandle = candleTimestamp;
        rule.lastError = undefined;
        return;
      }

      const isInitialFlip = isBullish && (
        rule.lastWasBullish !== true || rule.lastTriggeredCandle === undefined
      );

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

      const lastCandle = closedCandles[lastIndex];
      const inRetestZone = (lastCandle.low <= plan.entryHigh && lastCandle.close >= plan.stopLoss)
        || (price <= plan.entryHigh && price >= plan.stopLoss);
      const isRetestAlert = !isInitialFlip
        && rule.lastWasBullish === true
        && inRetestZone
        && plan.action !== 'AVOID'
        && rule.lastRetestTriggeredCandle !== candleTimestamp
        && candleTimestamp > (rule.lastTriggeredCandle || 0);

      const shouldNotify = isInitialFlip || isRetestAlert;

      rule.lastWasBullish = isBullish;
      rule.lastEvaluatedCandle = candleTimestamp;
      rule.lastError = undefined;
      if (!shouldNotify) return;

      if (isRetestAlert) {
        rule.lastRetestTriggeredCandle = candleTimestamp;
      } else {
        rule.lastTriggeredCandle = candleTimestamp;
      }

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
      const assetUrl = buildMoneyLineAssetUrl({
        baseUrl: dashboardBaseUrl,
        symbol: rule.symbol,
        timeframe: rule.timeframe,
        marketClass: rule.marketClass
      });

      const messageHeader = isRetestAlert
        ? [
            `🎯 *RETEST CONFIRMAT ÎN ZONA DE INTRARE*`,
            `*▲ PLAN TEHNIC LONG (RETEST) — ${rule.timeframe.toUpperCase()}*`
          ]
        : [
            `🟢 *BULLISH FLIP CONFIRMAT*`,
            `*▲ PLAN TEHNIC LONG — ${rule.timeframe.toUpperCase()}*`
          ];

      const actionText = isRetestAlert
        ? '🟢 SETUP VALID — intrare optimă activată la retest'
        : tradePlanActionLabel(plan.action);

      const priceLabel = isRetestAlert ? 'Preț la retest:' : 'Preț acum:';

      const message = [
        ...messageHeader,
        `\n${telegramAssetLink({ baseUrl: dashboardBaseUrl, symbol: rule.symbol, timeframe: rule.timeframe, marketClass: rule.marketClass })}  •  *${rule.timeframe.toUpperCase()}*`,
        `*Acțiune:* ${actionText}`,
        `*Calitate setup:* ${plan.confidence}/100${isRetestAlert ? ' ⭐' : ''}`,
        `\n*Închidere flip:* ${formatAlertPrice(closedCandles[lastIndex].close)}`,
        `*${priceLabel}* ${formatAlertPrice(plan.currentPrice)} (*${formatFlipMove(closedCandles[lastIndex].close, plan.currentPrice)} față de flip*)`,
        isRetestAlert
          ? `*Zonă suport testată:* ${formatAlertPrice(plan.entryLow)} – ${formatAlertPrice(plan.entryHigh)}`
          : `*Confirmat:* ${formatFlipAge(Math.min(Date.now(), candleTimestamp + (FLIP_TIMEFRAME_DURATION_MS[rule.timeframe as TelegramFlipTimeframe] || 0)))}`,
        `*Intrare optimă:* ${formatAlertPrice(plan.suggestedEntry)}`,
        `*Zonă intrare:* ${formatAlertPrice(plan.entryLow)} – ${formatAlertPrice(plan.entryHigh)}`,
        `*Alternativ breakout:* peste ${formatAlertPrice(plan.breakoutTrigger)}`,
        `*STOP LOSS tehnic:* ${formatAlertPrice(plan.stopLoss)}`,
        `*Ținta 1 (1.5R — De-risk):* ${formatAlertPrice(plan.target1)} (*${formatFlipMove(plan.suggestedEntry, plan.target1)}*)`,
        `*Ținta 2 (${plan.targetRiskReward.toFixed(1)}R — Swing):* ${formatAlertPrice(plan.target2)} (*${formatFlipMove(plan.suggestedEntry, plan.target2)}*)`,
        ...(plan.target3 ? [`*Ținta 3 (${plan.target3RiskReward ? `${plan.target3RiskReward.toFixed(1)}R` : 'Macro'} — Runner / +50%+):* ${formatAlertPrice(plan.target3)} (*${formatFlipMove(plan.suggestedEntry, plan.target3)}*)`] : []),
        `*Risc entry → SL:* ${plan.riskPercent.toFixed(2)}% | *R:R swing:* 1:${plan.targetRiskReward.toFixed(1)}`,
        `\n*Context superior:* ${contextText}`,
        `*ML ${rule.timeframe.toUpperCase()}:* ${plan.tier} (${plan.score > 0 ? '+' : ''}${plan.score}) | *RVOL:* ${plan.rvol.toFixed(2)}x | *RSI:* ${plan.rsi.toFixed(1)}`,
        `*Nor:* Fast ${formatAlertPrice(plan.fastLine)} | Slow ${formatAlertPrice(plan.slowLine)}`,
        `*Spațiu:* ${resistanceText}`,
        `*Observații:* ${isRetestAlert ? 'Suportul norului Money Line a fost testat cu succes; risc minimizat și R:R optim.' : (plan.reasons.slice(0, 4).join('; ') || 'confirmare tehnică completă')}`,
        `\n_Analiză deterministă pe lumânări închise. Nivelurile sunt orientative și nu garantează execuția sau profitul._`,
        `\n📈 [Deschide graficul Money Line](${assetUrl})`
      ].join('\n');
      const isWeeklyFlip = isInitialFlip && rule.timeframe === '1w';
      const shouldSendTelegram = isWeeklyFlip || isRetestAlert;

      let delivered = false;
      if (shouldSendTelegram) {
        delivered = await this.telegramBot.sendMarkdown(message);
        if (!delivered) {
          rule.lastError = this.telegramBot.getDeliveryConfiguration().telegramConfigured
            ? 'Telegram a respins mesajul; verifică botul și chatul.'
            : 'Telegram nu este configurat: lipsesc TELEGRAM_BOT_TOKEN sau TELEGRAM_CHAT_ID.';
          return;
        }
      }

      const alert: DispatchedAlert = {
        id: `${isRetestAlert ? 'cloud_retest' : 'cloud_bull'}_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        idempotencyKey: `${rule.id}:${isRetestAlert ? 'retest' : 'flip'}:${candleTimestamp}`,
        ruleId: rule.id,
        symbol: rule.symbol,
        type: 'MoneyLineTransition',
        title: isRetestAlert
          ? `MoneyLine retest confirmat: ${rule.symbol} ${rule.timeframe.toUpperCase()}`
          : `MoneyLine bullish confirmat: ${rule.symbol} ${rule.timeframe.toUpperCase()}`,
        message,
        timeframe: rule.timeframe,
        price,
        tier: 'Bullish',
        reason: isRetestAlert
          ? `Retest în zona de suport cu plan ${plan.action}, confluence ${plan.confidence}/100.`
          : `Fast și Slow bullish pe lumânare închisă; plan ${plan.action}, confluence ${plan.confidence}/100.`,
        confidence: plan.confidence / 100,
        timestamp: Date.now(),
        dashboardLink: assetUrl,
        isDelivered: shouldSendTelegram ? delivered : false,
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
          target3: plan.target3,
          targetRiskReward: plan.targetRiskReward,
          target3RiskReward: plan.target3RiskReward,
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

  private lastScheduledScanDateBucharest?: string;
  private lastMaCrossScanDateOslo?: string;
  private lastStructureScanKey?: string;

  public startBullishAlertMonitor(intervalMs = 60_000) {
    if (this.bullishAlertTimer) return;
    this.bullishAlertTimer = setInterval(() => {
      this.checkAllBullishCloudAlerts().catch(error => console.error('Bullish alert monitor failed:', error));

      // Automated daily 08:00 AM Europe/Bucharest scan across all assets
      try {
        const bucharestTime = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Europe/Bucharest',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        }).format(new Date());
        const [datePart, timePart] = bucharestTime.split(', ');
        const [hour, minute] = (timePart || '').split(':').map(Number);
        if (hour === 8 && minute <= 5 && this.lastScheduledScanDateBucharest !== datePart && !this.dailyRegimeScanStatus.running) {
          this.lastScheduledScanDateBucharest = datePart;
          this.runDailyRegimeScan({ timeframes: AUTOMATED_FLIP_TIMEFRAMES }).catch(error => console.error('Automated 08:00 AM scan failed:', error));
        }

        // Automated daily 08:00 Europe/Oslo 2x2 MA cross/retest alert pass
        const osloTime = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Europe/Oslo',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        }).format(new Date());
        const [osloDate, osloTimePart] = osloTime.split(', ');
        const [osloHour, osloMinute] = (osloTimePart || '').split(':').map(Number);
        if (osloHour === 8 && osloMinute <= 5 && this.lastMaCrossScanDateOslo !== osloDate) {
          this.lastMaCrossScanDateOslo = osloDate;
          this.runMaCrossAlertScan().catch(error => console.error('Automated 08:00 Europe/Oslo MA cross scan failed:', error));
        }

        // Paper structure scanner, automated on the Daily close only (00:00 UTC).
        // 4H/8H automation stopped 2026-09-24 at Marius's request.
        const utcNow = new Date();
        const structureKey = utcNow.toISOString().slice(0, 13);
        if (utcNow.getUTCHours() === 0 && utcNow.getUTCMinutes() <= 5 && this.lastStructureScanKey !== structureKey) {
          this.lastStructureScanKey = structureKey;
          this.runStructureScannerScan(utcNow.getTime(), ['1d']).catch(error => console.error('Structure scanner scan failed:', error));
        }
      } catch (err) {
        console.warn('Scheduled daily scan check error:', err);
      }
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
    return this.scannerSnapshots.refresh(
      JSON.stringify([timeframe, marketClass, narrative || null]),
      () => this.computeScannerRows(timeframe, marketClass, narrative)
    );
  }

  public async getScannerRows(
    timeframe: Timeframe = '1w',
    marketClass: ScannerMarketClass = 'ALL',
    narrative?: MarketNarrativeId
  ): Promise<AssetScannerRow[]> {
    return this.scannerSnapshots.read(
      JSON.stringify([timeframe, marketClass, narrative || null]),
      () => this.computeScannerRows(timeframe, marketClass, narrative)
    );
  }

  private async computeScannerRows(
    timeframe: Timeframe,
    marketClass: ScannerMarketClass,
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
    const rows = await this.getScannerRows(timeframe, marketClass);

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

/**
 * Firestore-backed store for `chart-market-resolutions` (exported so the store
 * contract can be exercised without a live database).
 *
 * - `get`        reads a document as-is; legacy documents without an `audit`
 *                map stay valid and are never rewritten on read.
 * - `set`        stays create-only: the cross-instance resolution race still
 *                has exactly one winner, and a concurrent heal can never be
 *                silently overwritten by a stale resolution.
 * - `replace`    is the heal path. It runs in a transaction and only writes
 *                when the stored `resolvedAt` still matches what the resolver
 *                validated; otherwise it returns the winner so the caller can
 *                serve that instead.
 * - `mergeAudit` writes ONLY the audit map (`merge: true`), so the candidate
 *                list, `resolvedAt` and every legacy field are preserved.
 * - `list`       powers GET /api/chart-market-diagnostics.
 */
export function createChartMarketPinStore(db: Firestore) {
  const collection = db.collection('chart-market-resolutions');
  const document = (key: string) => collection.doc(key);
  return {
    get: async (key: string): Promise<ChartMarketResolution | null> => {
      const snapshot = await document(key).get();
      return snapshot.exists ? snapshot.data() as ChartMarketResolution : null;
    },
    set: async (key: string, value: ChartMarketResolution): Promise<void> => {
      await document(key).create(value);
    },
    replace: async (
      key: string, value: ChartMarketResolution, expected: { resolvedAt: number }
    ): Promise<ChartMarketResolution | null> => {
      const reference = document(key);
      let stored: ChartMarketResolution = value;
      await db.runTransaction(async transaction => {
        const snapshot = await transaction.get(reference);
        const current = snapshot.exists ? snapshot.data() as ChartMarketResolution : null;
        if (current && current.resolvedAt !== expected.resolvedAt) {
          // Another instance healed this pin first: keep its document.
          stored = current;
          return;
        }
        transaction.set(reference, value);
      });
      return stored;
    },
    mergeAudit: async (key: string, audit: ChartMarketPinAudit): Promise<void> => {
      await document(key).set({ audit }, { merge: true });
    },
    /** Read-only enumeration used by GET /api/chart-market-diagnostics. */
    list: async (): Promise<Array<{ key: string; resolution: ChartMarketResolution }>> => {
      const snapshot = await collection.get();
      return snapshot.docs.map(item => ({ key: item.id, resolution: item.data() as ChartMarketResolution }));
    }
  };
}
