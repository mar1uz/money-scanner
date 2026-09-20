import { randomUUID } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import type { AssetMarketClass } from '@money-scanner/shared';
import type { MarketDataService } from '@money-scanner/market-data';
import { telegramAssetLink, type TelegramBotHandler } from '@money-scanner/notifications';

export type PriceAlertDirection = 'above' | 'below';

export interface PriceAlertRule {
  id: string;
  userId: string;
  symbol: string;
  marketClass: AssetMarketClass;
  targetPrice: number;
  direction: PriceAlertDirection;
  isEnabled: boolean;
  createdAt: number;
  lastPrice?: number;
  triggeredAt?: number;
  lastError?: string;
}

/** Pure hit condition: price reached the target from the watched side. */
export const priceAlertTargetHit = (direction: PriceAlertDirection, price: number, targetPrice: number) =>
  direction === 'above' ? price >= targetPrice : price <= targetPrice;

const formatAlertPrice = (value: number) =>
  value >= 1
    ? value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
    : Number(value.toPrecision(4)).toString();

const MAX_RULES_PER_USER = 50;

/**
 * User-defined price alerts: the user sets a target price on any chart and
 * gets a Telegram message when the resolved market pair reaches it. Prices
 * are polled through MarketDataService.getPriceQuote, which routes crypto
 * through the chart-market resolver (Binance preferred, longest history).
 * Rules persist in the `price-alerts` Firestore collection (db
 * `money-scanner-360`) so they survive Cloud Run restarts; persistence is
 * best-effort and never blocks alert evaluation.
 */
export class PriceAlertService {
  private rules = new Map<string, PriceAlertRule>();
  private timer?: NodeJS.Timeout;
  private checking = false;
  private loaded = false;

  constructor(
    private readonly marketData: Pick<MarketDataService, 'getPriceQuote'>,
    private readonly telegramBot: Pick<TelegramBotHandler, 'sendMarkdown' | 'getDeliveryConfiguration'>,
    private readonly firestore?: Firestore
  ) {}

  private collection() {
    if (this.firestore) return this.firestore.collection('price-alerts');
    const app = getApps()[0] || initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0610749770'
    });
    return getFirestore(app, 'money-scanner-360').collection('price-alerts');
  }

  private async persist(rule: PriceAlertRule) {
    try {
      await this.collection().doc(rule.id).set({ ...rule });
    } catch (error) {
      console.warn('Price alert persist failed:', error instanceof Error ? error.message : error);
    }
  }

  private async persistDelete(id: string) {
    try {
      await this.collection().doc(id).delete();
    } catch (error) {
      console.warn('Price alert delete persist failed:', error instanceof Error ? error.message : error);
    }
  }

  /** Loads still-enabled persisted rules once per process. */
  public async loadPersistedRules() {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const snapshot = await this.collection().get();
      snapshot.forEach(doc => {
        const rule = doc.data() as PriceAlertRule | undefined;
        if (rule && rule.id && rule.userId && rule.symbol && rule.isEnabled && !rule.triggeredAt) {
          this.rules.set(rule.id, rule);
        }
      });
    } catch (error) {
      console.warn('Price alert restore failed:', error instanceof Error ? error.message : error);
    }
  }

  public listRules(userId: string, symbol?: string, marketClass?: AssetMarketClass) {
    const normalizedSymbol = symbol?.toUpperCase();
    return Array.from(this.rules.values())
      .filter(rule => rule.userId === userId)
      .filter(rule => !normalizedSymbol || rule.symbol === normalizedSymbol)
      .filter(rule => !marketClass || rule.marketClass === marketClass)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  public async createRule(input: {
    userId: string;
    symbol: string;
    marketClass: AssetMarketClass;
    targetPrice: number;
    direction: PriceAlertDirection;
  }): Promise<PriceAlertRule> {
    await this.loadPersistedRules();
    const symbol = input.symbol.replace(/^[$#]/, '').trim().toUpperCase();
    const existing = Array.from(this.rules.values()).find(rule =>
      rule.userId === input.userId &&
      rule.symbol === symbol &&
      rule.marketClass === input.marketClass &&
      rule.direction === input.direction &&
      rule.targetPrice === input.targetPrice &&
      rule.isEnabled
    );
    if (existing) return existing;
    const userRules = this.listRules(input.userId).filter(rule => rule.isEnabled);
    if (userRules.length >= MAX_RULES_PER_USER) {
      throw new Error(`Limita de ${MAX_RULES_PER_USER} alerte de preț atinsă. Șterge o alertă mai veche.`);
    }
    const rule: PriceAlertRule = {
      id: randomUUID(),
      userId: input.userId,
      symbol,
      marketClass: input.marketClass,
      targetPrice: input.targetPrice,
      direction: input.direction,
      isEnabled: true,
      createdAt: Date.now()
    };
    this.rules.set(rule.id, rule);
    await this.persist(rule);
    return rule;
  }

  public async deleteRule(userId: string, id: string): Promise<boolean> {
    await this.loadPersistedRules();
    const rule = this.rules.get(id);
    if (!rule || rule.userId !== userId) return false;
    this.rules.delete(id);
    await this.persistDelete(id);
    return true;
  }

  public async checkAllPriceAlerts() {
    if (this.checking) return;
    this.checking = true;
    try {
      await this.loadPersistedRules();
      const enabled = Array.from(this.rules.values()).filter(rule => rule.isEnabled);
      const concurrency = 3;
      for (let index = 0; index < enabled.length; index += concurrency) {
        await Promise.allSettled(enabled.slice(index, index + concurrency).map(rule => this.evaluateRule(rule)));
      }
    } finally {
      this.checking = false;
    }
  }

  private async evaluateRule(rule: PriceAlertRule) {
    try {
      const quote = await this.marketData.getPriceQuote(rule.symbol, rule.marketClass);
      const price = quote.price;
      if (!Number.isFinite(price) || price <= 0) return;
      rule.lastPrice = price;
      if (!priceAlertTargetHit(rule.direction, price, rule.targetPrice)) return;

      const sourceLabel = quote.source ? quote.source.replace(/_/g, ' ').toUpperCase() : '';
      const message = [
        '🎯 *ALERTĂ PREȚ ATINSĂ*',
        `${telegramAssetLink({ symbol: rule.symbol, marketClass: rule.marketClass })} · ${rule.marketClass.toUpperCase()}`,
        `Țintă: ${rule.direction === 'above' ? '≥' : '≤'} ${formatAlertPrice(rule.targetPrice)}`,
        `Preț acum: *${formatAlertPrice(price)}*${sourceLabel ? ` (${sourceLabel})` : ''}`
      ].join('\n');

      const delivered = await this.telegramBot.sendMarkdown(message);
      // One-shot: an alert fires once, then retires with the exact trigger state.
      rule.isEnabled = false;
      rule.triggeredAt = Date.now();
      if (delivered) delete rule.lastError;
      else rule.lastError = this.telegramBot.getDeliveryConfiguration().telegramConfigured
        ? 'Trimiterea pe Telegram a eșuat.'
        : 'Telegram nu este configurat: lipsesc TELEGRAM_BOT_TOKEN sau TELEGRAM_CHAT_ID.';
      await this.persist(rule);
      if (delivered) this.rules.delete(rule.id);
    } catch (error) {
      rule.lastError = error instanceof Error ? error.message : 'Verificarea alertei de preț a eșuat.';
      console.error(`Price alert check failed for ${rule.symbol} ${rule.direction} ${rule.targetPrice}:`, rule.lastError);
    }
  }

  public startMonitor(intervalMs = 60_000) {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.checkAllPriceAlerts().catch(error => console.error('Price alert monitor failed:', error));
    }, intervalMs);
    this.timer.unref();
  }
}
