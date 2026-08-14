import {
  TelegramCommandPayload,
  MoneyLineSignal,
  MarketOverviewSummary,
  XTrendTopic,
  NewsItem
} from '@money-scanner/shared';

export interface TelegramBotOptions {
  botToken?: string;
  webhookSecret?: string;
  dashboardBaseUrl?: string;
}

export class TelegramBotHandler {
  private botToken?: string;
  private webhookSecret?: string;
  private dashboardBaseUrl: string;

  constructor(options: TelegramBotOptions = {}) {
    this.botToken = options.botToken || process.env.TELEGRAM_BOT_TOKEN;
    this.webhookSecret = options.webhookSecret || process.env.TELEGRAM_WEBHOOK_SECRET || 'money-scanner-secret';
    this.dashboardBaseUrl = options.dashboardBaseUrl || 'https://scanner.relayhub.no';
  }

  /**
   * Validates incoming Telegram Webhook secret token header.
   */
  public validateWebhookSecret(incomingToken?: string): boolean {
    if (!this.webhookSecret) return true;
    return incomingToken === this.webhookSecret;
  }

  /**
   * Parses raw incoming Telegram update into a command payload.
   */
  public parseUpdate(body: any): TelegramCommandPayload | null {
    const msg = body?.message || body?.edited_message;
    if (!msg || !msg.text) return null;

    const text = msg.text.trim();
    if (!text.startsWith('/')) return null;

    const parts = text.split(/\s+/);
    const commandRaw = parts[0].replace('/', '').toLowerCase().split('@')[0];
    const args = parts.slice(1);

    const validCommands: TelegramCommandPayload['command'][] = [
      'start', 'scan', 'status', 'trending', 'news', 'watch', 'unwatch', 'alerts', 'brief', 'help'
    ];

    if (!validCommands.includes(commandRaw as any)) {
      return null;
    }

    return {
      command: commandRaw as TelegramCommandPayload['command'],
      args,
      chatId: msg.chat.id,
      userId: msg.from.id,
      username: msg.from.username,
      messageId: msg.message_id
    };
  }

  /**
   * Handles commands and produces formatted Markdown responses.
   */
  public handleCommand(
    payload: TelegramCommandPayload,
    context: {
      overview?: MarketOverviewSummary;
      topSignals?: MoneyLineSignal[];
      trends?: XTrendTopic[];
      news?: NewsItem[];
    }
  ): { text: string; parse_mode: 'Markdown'; reply_markup?: any } {
    const { command, args } = payload;

    switch (command) {
      case 'start':
      case 'help':
        return {
          text: [
            `⚡ *MONEY SCANNER BOT* ⚡`,
            `Your real-time crypto market intelligence companion.\n`,
            `*Available Commands:*`,
            `• \`/scan\` — View strongest bullish & bearish Money Line signals`,
            `• \`/status <symbol>\` — Deep status on a specific asset (e.g. \`/status BTC\`)`,
            `• \`/trending\` — View top rising crypto topics & cashtags on X`,
            `• \`/news <symbol>\` — Recent breaking news and catalyst analysis`,
            `• \`/brief\` — Latest AI market regime executive briefing`,
            `• \`/watch <symbol>\` — Add asset to your private watchlist`,
            `• \`/alerts\` — View and configure active alert triggers\n`,
            `🌐 [Open Money Scanner Dashboard](${this.dashboardBaseUrl})`
          ].join('\n'),
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '📊 Open Scanner', url: `${this.dashboardBaseUrl}` },
                { text: '🔥 X Trends', url: `${this.dashboardBaseUrl}/trends` }
              ]
            ]
          }
        };

      case 'scan': {
        const signals = context.topSignals || [];
        const bulls = signals.filter(s => s.score >= 20).slice(0, 5);
        const bears = signals.filter(s => s.score <= -20).slice(0, 5);

        const bullLines = bulls.map(b => `🟢 *$${b.symbol}* (${b.tier}) — Score: *+${b.score}* | RVOL: ${b.rawIndicators.rvol}x`).join('\n') || 'None';
        const bearLines = bears.map(b => `🔴 *$${b.symbol}* (${b.tier}) — Score: *${b.score}* | RVOL: ${b.rawIndicators.rvol}x`).join('\n') || 'None';

        return {
          text: [
            `📡 *MONEY SCANNER TOP SIGNALS* (1H Timeframe)\n`,
            `*🟢 STRONGEST BULLISH:*`,
            bullLines,
            `\n*🔴 STRONGEST BEARISH:*`,
            bearLines,
            `\n🔗 [Open Full Scanner Table](${this.dashboardBaseUrl})`
          ].join('\n'),
          parse_mode: 'Markdown'
        };
      }

      case 'status': {
        const symbol = (args[0] || 'BTC').toUpperCase();
        const signal = context.topSignals?.find(s => s.symbol === symbol);

        if (!signal) {
          return {
            text: `⚠️ Asset *$${symbol}* not found in active Top 50 universe. Try \`/status BTC\` or \`/status SOL\`.`,
            parse_mode: 'Markdown'
          };
        }

        const isBull = signal.score >= 20;
        const emoji = isBull ? '🟢' : (signal.score <= -20 ? '🔴' : '⚪');

        return {
          text: [
            `${emoji} *ASSET STATUS: $${symbol}* (${signal.timeframe.toUpperCase()})`,
            `*Tier:* ${signal.tier}`,
            `*Money Line Score:* ${signal.score > 0 ? '+' : ''}${signal.score}/100`,
            `*EMA 20/50/200 Alignment:* ${signal.contributions.emaAlignmentScore > 0 ? 'Bullish' : 'Bearish'}`,
            `*MACD Histogram:* ${signal.rawIndicators.macd.histogram}`,
            `*RSI (14):* ${signal.rawIndicators.rsi14} (${signal.rawIndicators.rsiRegime})`,
            `*Relative Volume (RVOL):* ${signal.rawIndicators.rvol}x`,
            `*ATR Volatility:* ${signal.rawIndicators.atrPercent}%`,
            `\n🔗 [View Interactive Chart & AI Thesis](${this.dashboardBaseUrl}/assets/${symbol})`
          ].join('\n'),
          parse_mode: 'Markdown'
        };
      }

      case 'trending': {
        const trends = (context.trends || []).slice(0, 5);
        const lines = trends.map((t, idx) => 
          `${idx + 1}. *${t.cashtag}* — ${t.topic}\n   Velocity: *${t.velocityScore}* | Category: _${t.category}_`
        ).join('\n\n') || 'No active trend spikes detected.';

        return {
          text: [
            `🔥 *X (TWITTER) CRYPTO TREND INTELLIGENCE*\n`,
            lines,
            `\n🔗 [View Full Narrative Breakdown](${this.dashboardBaseUrl}/trends)`
          ].join('\n'),
          parse_mode: 'Markdown'
        };
      }

      case 'brief': {
        const overview = context.overview;
        return {
          text: [
            `🧠 *AI MARKET ANALYST BRIEFING*\n`,
            `*Current Regime:* ${overview?.regime || 'Bullish Trend'}`,
            `*Market Breadth:* ${overview?.marketBreadth.bullishPercent || 65}% advancing`,
            `*BTC Dominance:* ${overview?.btcDominance || 57}%`,
            `*Summary:* Crypto markets are displaying steady institutional accumulation. Layer 1 and decentralized AI assets lead relative strength. Maintain stops below EMA 50 support zones.`,
            `\n🔗 [Read Full Executive Report](${this.dashboardBaseUrl}/ai)`
          ].join('\n'),
          parse_mode: 'Markdown'
        };
      }

      default:
        return {
          text: `Command \`/${command}\` received. Use \`/help\` to view all commands.`,
          parse_mode: 'Markdown'
        };
    }
  }
}
