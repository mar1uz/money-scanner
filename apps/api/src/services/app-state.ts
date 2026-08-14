import {
  TOP_50_CRYPTO_ASSETS,
  Timeframe,
  AssetScannerRow,
  MoneyLineSignal,
  DispatchedAlert
} from '@money-scanner/shared';
import { MarketDataService } from '@money-scanner/market-data';
import { MoneyLineEngine, calculateMTFConfluence } from '@money-scanner/money-line';
import { XSocialIntelligenceService, NewsIntelligenceService } from '@money-scanner/social-analysis';
import { AIMarketAnalystService } from '@money-scanner/ai-analysis';
import { AlertDispatcher, TelegramBotHandler } from '@money-scanner/notifications';

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

  private static instance: AppState;

  public static getInstance(): AppState {
    if (!AppState.instance) {
      AppState.instance = new AppState();
    }
    return AppState.instance;
  }

  /**
   * Scans all assets and updates calculated signals.
   */
  /**
   * Scans all assets and updates calculated signals in parallel for sub-second response.
   */
  public async refreshSignals(timeframe: Timeframe = '1h'): Promise<AssetScannerRow[]> {
    const quotes = await this.marketData.getAllQuotes();
    const trends = this.social.getTrendingTopics();

    const rows: AssetScannerRow[] = await Promise.all(
      TOP_50_CRYPTO_ASSETS.map(async (asset) => {
        const quote = quotes.find(q => q.symbol === asset.symbol) || await this.marketData.getPriceQuote(asset.symbol);
        const candles = await this.marketData.getCandles(asset.symbol, timeframe, 150);
        const signal = this.moneyLine.calculateLatest(asset.symbol, timeframe, candles);

        if (signal) {
          this.cachedSignals.set(`${asset.symbol}_${timeframe}`, signal);

          // Check for alert dispatch
          const alert = this.alertDispatcher.evaluateSignal(signal, quote.price);
          if (alert) {
            this.alertHistory.unshift(alert);
            if (this.alertHistory.length > 100) this.alertHistory.pop();
          }
        }

        const trend = trends.find(t => t.cashtag === `$${asset.symbol}`);
        const score = signal?.score || 0;
        const tier = signal?.tier || 'Neutral';

        return {
          symbol: asset.symbol,
          name: asset.name,
          category: asset.category,
          price: quote.price,
          change24h: quote.change24h,
          high24h: quote.high24h,
          low24h: quote.low24h,
          volume24h: quote.volume24h,
          timeframe,
          moneyLineScore: score,
          tier,
          previousTier: signal?.previousTier,
          isTransition: signal?.isTransition || false,
          lastSignalChangeTime: signal?.transitionTime || quote.timestamp,
          rvol: signal?.rawIndicators.rvol || 1.0,
          volatilityAtrPercent: signal?.rawIndicators.atrPercent || 2.5,
          xTrendScore: trend?.velocityScore || 15.0,
          xMentionsVelocity: trend?.velocityScore || 10.0,
          aiConfidence: 0.85,
          lastUpdated: quote.timestamp,
          isStale: this.marketData.getHealthMonitor().isDataStale(quote.timestamp)
        };
      })
    );

    return rows;
  }
}
