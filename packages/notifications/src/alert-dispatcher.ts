import {
  DispatchedAlert,
  AlertType,
  MoneyLineSignal,
  Timeframe
} from '@money-scanner/shared';

export interface AlertDispatchOptions {
  dashboardBaseUrl?: string;
  cooldownMs?: number;
}

export class AlertDispatcher {
  private sentAlertKeys: Set<string> = new Set();
  private lastAlertTimeBySymbol: Map<string, number> = new Map();
  private dashboardBaseUrl: string;
  private defaultCooldownMs: number;

  constructor(options: AlertDispatchOptions = {}) {
    this.dashboardBaseUrl = options.dashboardBaseUrl || 'https://scanner.relayhub.no';
    this.defaultCooldownMs = options.cooldownMs || 30 * 60 * 1000; // 30 mins
  }

  /**
   * Processes a Money Line signal and generates a formatted alert if criteria are met.
   */
  public evaluateSignal(
    signal: MoneyLineSignal,
    currentPrice: number,
    force = false
  ): DispatchedAlert | null {
    // Only alert on transitions or when forced
    if (!signal.isTransition && !force) {
      return null;
    }

    const idempotencyKey = `${signal.symbol}_${signal.timeframe}_${signal.tier}_${signal.candleTimestamp}`;
    if (this.sentAlertKeys.has(idempotencyKey)) {
      return null; // Duplicate prevented
    }

    // Cooldown check per symbol
    const lastTime = this.lastAlertTimeBySymbol.get(signal.symbol) || 0;
    const now = Date.now();
    if (!force && (now - lastTime < this.defaultCooldownMs)) {
      return null; // In cooldown
    }

    const isBull = signal.score >= 20;
    const isBear = signal.score <= -20;
    const direction = isBull
      ? { emoji: '🟢', heading: 'BULLISH FLIP CONFIRMAT', action: '▲ BUY / LONG', tone: 'Bullish' }
      : isBear
        ? { emoji: '🔴', heading: 'BEARISH FLIP CONFIRMAT', action: '▼ SELL / RISK OFF', tone: 'Bearish' }
        : { emoji: '⚪', heading: 'MONEYLINE SCHIMBARE NEUTRĂ', action: '• WATCH / WAIT', tone: 'Neutral' };
    const transitionText = signal.previousTier
      ? `${signal.previousTier} → ${signal.tier}`
      : signal.tier;

    const title = `${direction.emoji} ${direction.heading}: $${signal.symbol} (${signal.timeframe.toUpperCase()})`;
    const message = [
      `${direction.emoji} *${direction.heading}*`,
      `*${direction.action}*`,
      `\n*$${signal.symbol}*  •  *${signal.timeframe.toUpperCase()}*`,
      `*Preț confirmare:* $${currentPrice.toLocaleString()}`,
      `*Tranziție:* ${transitionText}`,
      `*Money Line Score:* ${signal.score > 0 ? '+' : ''}${signal.score}/100`,
      `*RVOL:* ${signal.rawIndicators.rvol}x | *RSI:* ${signal.rawIndicators.rsi14}`,
      `*EMA:* ${signal.rawIndicators.ema20Slope > 0 ? 'panta bullish ↗' : 'panta bearish ↘'}`,
      `\n🔗 [Open Deep-Dive Analysis](${this.dashboardBaseUrl}/assets/${signal.symbol})`
    ].join('\n');

    const alert: DispatchedAlert = {
      id: `alert_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      idempotencyKey,
      symbol: signal.symbol,
      type: 'MoneyLineTransition',
      title,
      message,
      timeframe: signal.timeframe,
      price: currentPrice,
      tier: signal.tier,
      previousTier: signal.previousTier,
      reason: `Money Line score reached ${signal.score} (${signal.tier}) on closed ${signal.timeframe} candle`,
      confidence: 0.9,
      timestamp: now,
      dashboardLink: `${this.dashboardBaseUrl}/assets/${signal.symbol}`,
      isDelivered: true
    };

    this.sentAlertKeys.add(idempotencyKey);
    this.lastAlertTimeBySymbol.set(signal.symbol, now);

    return alert;
  }

  public clearCooldown(symbol: string) {
    this.lastAlertTimeBySymbol.delete(symbol);
  }
}
