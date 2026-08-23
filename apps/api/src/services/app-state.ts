import {
  getScannerAssets,
  NARRATIVE_DEFINITIONS,
  NarrativeSummary,
  MarketNarrativeId,
  Timeframe,
  AssetScannerRow,
  MoneyLineSignal,
  DispatchedAlert,
  ScannerMarketClass,
  AssetMarketClass
} from '@money-scanner/shared';
import { MarketDataService } from '@money-scanner/market-data';
import { MoneyLineEngine, calculateMTFConfluence, calculateMoneyLineCloud } from '@money-scanner/money-line';
import { XSocialIntelligenceService, NewsIntelligenceService } from '@money-scanner/social-analysis';
import { AIMarketAnalystService } from '@money-scanner/ai-analysis';
import { AlertDispatcher, TelegramBotHandler } from '@money-scanner/notifications';

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
  lastError?: string;
}

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
      const slowLine = cloud.lineSlow[lastIndex];
      const dashboardBaseUrl = process.env.PUBLIC_BASE_URL || 'https://market-scanner-360-384051756749.europe-west3.run.app';
      const message = [
        `🟢 *BULLISH FLIP CONFIRMAT*`,
        `*▲ BUY / LONG*`,
        `\n*$${rule.symbol}*  •  *${rule.timeframe.toUpperCase()}*`,
        `*Preț confirmare:* $${price.toLocaleString('en-US', { maximumFractionDigits: price < 1 ? 8 : 4 })}`,
        `*Margine Nor (Slow):* $${slowLine.toLocaleString('en-US', { maximumFractionDigits: slowLine < 1 ? 8 : 4 })}`,
        `*Confirmare:* Fast + Slow sunt bullish pe ultima lumânare închisă.`,
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
        reason: 'Fast și Slow Supertrend sunt bullish pe o lumânare închisă.',
        confidence: 1,
        timestamp: Date.now(),
        dashboardLink: dashboardBaseUrl,
        isDelivered: true
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
    marketClass: ScannerMarketClass = 'ALL'
  ): Promise<AssetScannerRow[]> {
    const assets = marketClass === 'crypto'
      ? await this.marketData.getTopCryptoAssets(50)
      : getScannerAssets(marketClass);
    const quotes = marketClass === 'crypto'
      ? await this.marketData.getQuotesForAssets(assets)
      : await this.marketData.getAllQuotes(marketClass);
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

        // Compute 1D and 1W MoneyLine signals for multi-timeframe ROI columns
        let signal1d = timeframe === '1d' ? signal : this.cachedSignals.get(`${asset.symbol}_1d`);
        let signal1w = timeframe === '1w' ? signal : this.cachedSignals.get(`${asset.symbol}_1w`);

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
    });
  }
}
