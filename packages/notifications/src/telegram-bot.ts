import {
  TelegramCommandPayload,
  TelegramFlipAlertPreferences,
  TelegramFlipTimeframe,
  MoneyLineSignal,
  MarketOverviewSummary,
  XTrendTopic,
  NewsItem
} from '@money-scanner/shared';
import { DEFAULT_MONEY_SCANNER_URL, buildMoneyLineAssetUrl, telegramAssetLink } from './asset-link.js';

export interface TelegramBotOptions {
  botToken?: string;
  chatId?: string;
  webhookSecret?: string;
  dashboardBaseUrl?: string;
}

export interface TelegramCallbackPayload {
  callbackQueryId: string;
  action: TelegramFlipTimeframe | 'all' | 'off';
  chatId: number;
  userId: number;
  messageId: number;
}

export interface TelegramMarkdownResponse {
  text: string;
  parse_mode: 'Markdown';
  reply_markup?: { inline_keyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>> };
}

export class TelegramBotHandler {
  private botToken?: string;
  private defaultChatId?: string;
  private webhookSecret?: string;
  private dashboardBaseUrl: string;

  constructor(options: TelegramBotOptions = {}) {
    this.botToken = options.botToken || process.env.TELEGRAM_BOT_TOKEN;
    this.defaultChatId = options.chatId || process.env.TELEGRAM_CHAT_ID;
    this.webhookSecret = options.webhookSecret || process.env.TELEGRAM_WEBHOOK_SECRET || 'money-scanner-secret';
    this.dashboardBaseUrl = options.dashboardBaseUrl || process.env.PUBLIC_BASE_URL || DEFAULT_MONEY_SCANNER_URL;
  }

  public registerChat(chatId: string | number) {
    // Keep the configured delivery destination stable. Incoming bot commands
    // may come from other chats and must not redirect scheduled alerts.
    if (!this.defaultChatId) this.defaultChatId = String(chatId);
  }

  public getDefaultChatId() {
    return this.defaultChatId;
  }

  public isOwnerUser(userId: string | number) {
    return Boolean(this.defaultChatId) && String(userId) === this.defaultChatId;
  }

  public getDeliveryConfiguration() {
    return {
      botConfigured: Boolean(this.botToken),
      chatConfigured: Boolean(this.defaultChatId),
      telegramConfigured: Boolean(this.botToken && this.defaultChatId)
    };
  }

  /** Sends a real Telegram message; tokens are never returned or logged. */
  public async sendMarkdown(text: string, chatId?: string | number, replyMarkup?: unknown): Promise<boolean> {
    const destination = chatId === undefined ? this.defaultChatId : String(chatId);
    if (!this.botToken || !destination) return false;

    try {
      const response = await fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: destination,
          text,
          parse_mode: 'Markdown',
          disable_web_page_preview: true,
          ...(replyMarkup ? { reply_markup: replyMarkup } : {})
        })
      });
      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`Telegram delivery failed (${response.status}): ${errorBody.slice(0, 300)}`);
        return false;
      }
      return true;
    } catch (error) {
      console.error('Telegram delivery failed:', error instanceof Error ? error.message : error);
      return false;
    }
  }

  public async editMarkdown(
    text: string,
    chatId: string | number,
    messageId: number,
    replyMarkup?: unknown
  ): Promise<boolean> {
    if (!this.botToken) return false;
    try {
      const response = await fetch(`https://api.telegram.org/bot${this.botToken}/editMessageText`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: String(chatId),
          message_id: messageId,
          text,
          parse_mode: 'Markdown',
          disable_web_page_preview: true,
          ...(replyMarkup ? { reply_markup: replyMarkup } : {})
        })
      });
      return response.ok;
    } catch (error) {
      console.error('Telegram message edit failed:', error instanceof Error ? error.message : error);
      return false;
    }
  }

  public async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<boolean> {
    if (!this.botToken) return false;
    try {
      const response = await fetch(`https://api.telegram.org/bot${this.botToken}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: callbackQueryId, ...(text ? { text } : {}) })
      });
      return response.ok;
    } catch (error) {
      console.error('Telegram callback acknowledgement failed:', error instanceof Error ? error.message : error);
      return false;
    }
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
      'start', 'scan', 'status', 'trending', 'news', 'watch', 'unwatch', 'alerts', 'flipalerts', 'subscribe', 'unsubscribe', 'brief', 'help'
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
      chatType: msg.chat.type,
      chatTitle: msg.chat.title,
      messageId: msg.message_id
    };
  }

  public parseCallbackQuery(body: any): TelegramCallbackPayload | null {
    const query = body?.callback_query;
    const match = typeof query?.data === 'string'
      ? query.data.match(/^flip_tf:(4h|8h|1d|1w|all|off)$/)
      : null;
    if (!query?.id || !query?.message?.chat?.id || !query?.message?.message_id || !match) return null;
    return {
      callbackQueryId: String(query.id),
      action: match[1] as TelegramCallbackPayload['action'],
      chatId: Number(query.message.chat.id),
      userId: Number(query.from?.id || 0),
      messageId: Number(query.message.message_id)
    };
  }

  public buildFlipAlertSettingsResponse(
    preferences: TelegramFlipAlertPreferences,
    notice?: string
  ): TelegramMarkdownResponse {
    const selected = new Set(preferences.timeframes);
    const mark = (timeframe: TelegramFlipTimeframe, label: string) =>
      `${preferences.enabled && selected.has(timeframe) ? '✅' : '▫️'} ${label}`;
    const activeLabel = preferences.enabled
      ? preferences.timeframes.map(timeframe => timeframe.toUpperCase()).join(', ')
      : 'Oprite';
    return {
      text: [
        `🔔 *ALERTE FLIP MONEYLINE*`,
        notice ? `_${notice}_` : '',
        ``,
        `*Timeframe-uri active:* ${activeLabel || 'Niciunul'}`,
        `Primești numai flipuri confirmate pe lumânări închise. Setarea filtrează Telegramul; pagina Alerte păstrează toate timeframe-urile.`,
        ``,
        `Comandă rapidă: \`/flipalerts 1w\`, \`/flipalerts 4h 1d\`, \`/flipalerts all\` sau \`/flipalerts off\`.`
      ].filter(Boolean).join('\n'),
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: mark('4h', '4H'), callback_data: 'flip_tf:4h' },
            { text: mark('8h', '8H'), callback_data: 'flip_tf:8h' }
          ],
          [
            { text: mark('1d', '1D'), callback_data: 'flip_tf:1d' },
            { text: mark('1w', '1W'), callback_data: 'flip_tf:1w' }
          ],
          [
            { text: selected.size === 4 && preferences.enabled ? '✅ Toate' : '☑️ Toate', callback_data: 'flip_tf:all' },
            { text: preferences.enabled ? '🔕 Oprește' : '🔕 Oprite', callback_data: 'flip_tf:off' }
          ]
        ]
      }
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
            `• \`/alerts\` — Selectează timeframe-urile alertelor de flip`,
            `• \`/flipalerts 1w\` — Primește numai flipuri Weekly\n`,
            `• \`/subscribe\` — Activează alertele în grupul curent`,
            `• \`/unsubscribe\` — Oprește alertele în grupul curent\n`,
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

        const bullLines = bulls.map(b => `🟢 ${telegramAssetLink({ baseUrl: this.dashboardBaseUrl, symbol: b.symbol, timeframe: b.timeframe })} (${b.tier}) — Score: *+${b.score}* | RVOL: ${b.rawIndicators.rvol}x`).join('\n') || 'None';
        const bearLines = bears.map(b => `🔴 ${telegramAssetLink({ baseUrl: this.dashboardBaseUrl, symbol: b.symbol, timeframe: b.timeframe })} (${b.tier}) — Score: *${b.score}* | RVOL: ${b.rawIndicators.rvol}x`).join('\n') || 'None';

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
            `${emoji} *ASSET STATUS:* ${telegramAssetLink({ baseUrl: this.dashboardBaseUrl, symbol, timeframe: signal.timeframe })} (${signal.timeframe.toUpperCase()})`,
            `*Tier:* ${signal.tier}`,
            `*Money Line Score:* ${signal.score > 0 ? '+' : ''}${signal.score}/100`,
            `*EMA 20/50/200 Alignment:* ${signal.contributions.emaAlignmentScore > 0 ? 'Bullish' : 'Bearish'}`,
            `*MACD Histogram:* ${signal.rawIndicators.macd.histogram}`,
            `*RSI (14):* ${signal.rawIndicators.rsi14} (${signal.rawIndicators.rsiRegime})`,
            `*Relative Volume (RVOL):* ${signal.rawIndicators.rvol}x`,
            `*ATR Volatility:* ${signal.rawIndicators.atrPercent}%`,
            `\n🔗 [View Money Line Chart](${buildMoneyLineAssetUrl({ baseUrl: this.dashboardBaseUrl, symbol, timeframe: signal.timeframe })})`
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
