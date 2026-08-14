import { TOP_50_CRYPTO_ASSETS, Timeframe } from '@money-scanner/shared';
import { MarketDataService } from '@money-scanner/market-data';
import { MoneyLineEngine } from '@money-scanner/money-line';
import { AlertDispatcher } from '@money-scanner/notifications';

export class ScannerWorker {
  private marketData = new MarketDataService();
  private moneyLine = new MoneyLineEngine();
  private alertDispatcher = new AlertDispatcher();
  private isRunning = false;
  private intervalTimer: NodeJS.Timeout | null = null;

  public async runScanCycle(timeframe: Timeframe = '1h') {
    console.log(`[Worker] Starting Money Line scan cycle for ${TOP_50_CRYPTO_ASSETS.length} assets (${timeframe})...`);
    const start = Date.now();
    let transitionsFound = 0;

    for (const asset of TOP_50_CRYPTO_ASSETS) {
      try {
        const candles = await this.marketData.getCandles(asset.symbol, timeframe, 150);
        const quote = await this.marketData.getPriceQuote(asset.symbol);
        const signal = this.moneyLine.calculateLatest(asset.symbol, timeframe, candles);

        if (signal) {
          const alert = this.alertDispatcher.evaluateSignal(signal, quote.price);
          if (alert) {
            transitionsFound++;
            console.log(`🚨 [Worker Alert] ${alert.title} — ${alert.reason}`);
          }
        }
      } catch (err: any) {
        console.error(`[Worker] Error scanning ${asset.symbol}:`, err.message);
      }
    }

    const duration = Date.now() - start;
    console.log(`[Worker] Scan cycle completed in ${duration}ms. Signal transitions detected: ${transitionsFound}`);
  }

  public start(intervalSeconds = 60) {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log(`⚡ Scanner Worker started with interval ${intervalSeconds}s`);

    // Run initial scan immediately
    this.runScanCycle('1h').catch(console.error);

    this.intervalTimer = setInterval(() => {
      this.runScanCycle('1h').catch(console.error);
    }, intervalSeconds * 1000);
  }

  public stop() {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    this.isRunning = false;
    console.log(`🛑 Scanner Worker stopped`);
  }
}
