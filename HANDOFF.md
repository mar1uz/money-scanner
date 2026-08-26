# Money Scanner — Project Handoff

> [!IMPORTANT]
> ### 🛡️ MANDATORY GOLDEN DIRECTIVE #1: 100% REAL & VERIFIED DATA ONLY (ZERO INVENTED NUMBERS)
> **NO APPROXIMATIONS, FICTIONAL DATA, PLACEHOLDERS, HARDCODED TABLES, OR ARTIFICIAL OFFSETS ARE PERMITTED ANYWHERE IN THIS CODEBASE.**
> Every single metric, percentage, timestamp, score, and indicator across the entire platform MUST be computed strictly and exclusively from 100% real historical and live market feeds:
> - **De Când este Flip (Flip Age / `lastSignalChangeTime`)**: MUST be derived directly from the exact closed candle timestamp (`transitionTime`) where the Money Line trend flipped between Bullish, Bearish, or Neutral. No artificial timestamps or placeholders permitted.
> - **Preț & Var. 24h (Price & 24h Delta)**: 100% live price and 24h percent delta from Binance Public API (`/ticker/24hr`) and Yahoo Finance v8 (`/v8/finance/chart`).
> - **YTD % (Year-To-Date Return)**: MUST be calculated dynamically from the exact Jan 1st 00:00 UTC opening candle price (`startTime = Date.UTC(currentYear, 0, 1)`) vs current price: `((currentPrice - jan1OpenPrice) / jan1OpenPrice) * 100`. Zero static lookup tables allowed.
> - **ML 1D % & ML 1W % (MoneyLine ROI)**: Calculated strictly from the transition candle price to the latest closed candle price across 1D and 1W timeframes.
> - **Money Line Score & Tier**: Deterministic, non-repainting weighted composite calculated across real technical indicators: EMA Alignment (20/50/200), EMA Slope, ROC (9/21), MACD (12/26/9), RSI (14), RVOL (20 MA), and ATR (14).
> - **Crypto Fear & Greed Index**: MUST be fetched directly from Alternative.me official public API (`https://api.alternative.me/fng/?limit=1`).
> - **USA Macro & Economic Status**: Real official U.S. Treasury National Debt ($36.2T+), BLS Consumer Price Index (CPI/PCE), Federal Reserve Funds Rate, and Treasury Yield Curve.
> - **News & Social Intelligence**: 100% verified news from Bloomberg, Reuters, CoinDesk, Decrypt, and authentic posts from verified analysts.

## 1. Project purpose

Money Scanner is a separate crypto-market intelligence application. It will scan liquid crypto assets, calculate an original deterministic trend indicator called **Money Line**, explain current market conditions with an AI analyst, monitor crypto topics trending on X, and provide Telegram commands and alerts.

The first release is an analysis and decision-support product. It must not place real trades automatically. Paper trading and approval-based execution can be evaluated only after the scanner, data quality, security, and backtesting are proven.

## 2. Isolation from RelayHub

Money Scanner may use the same Google Cloud project and region as RelayHub, but it must remain technically independent.

- Separate source repository or fully separate top-level project.
- Separate Cloud Run services and deployment pipeline.
- Separate service account and IAM permissions.
- Separate secrets and configuration.
- Separate database namespaces or databases.
- Separate authentication sessions and cookies.
- Separate monitoring and alerting.
- Deploying Money Scanner must never redeploy RelayHub.

Recommended production address:

```text
https://scanner.relayhub.no
```

During development, use the independent Cloud Run URL:

```text
https://market-scanner-360-384051756749.europe-west3.run.app
```

For the custom domain, route `scanner.relayhub.no` through the existing Google Cloud external Application Load Balancer to the new Cloud Run backend. The host rule must be independent of the rule serving `relayhub.no`.

## 3. Main product capabilities

### Market dashboard

- Current crypto market regime.
- BTC and ETH summary.
- Total market capitalization and market breadth.
- Strongest bullish and bearish transitions.
- Unusual volume and volatility.
- Most important current news.
- Trending topics from X.
- Latest AI market briefing.

### Money Scanner

- Scan an initial universe of the 50 most liquid assets.
- Support 1-hour, 4-hour, 1-day, and later 1-week timeframes.
- Sort and filter by trend score, volume, volatility, market capitalization, freshness of signal, X activity, and watchlist.
- Open an asset detail page with chart, signal history, news, social trends, risks, and AI explanation.

### AI market analyst

- Explain the current crypto market using fresh structured data.
- Explain why an asset is moving.
- Summarize what changed during the last hour or day.
- Compare assets.
- Explain Money Line changes.
- Present bullish factors, bearish factors, uncertainty, and data freshness.
- Link to the evidence used for conclusions.

### X trend intelligence

- Detect rising crypto topics, cashtags, narratives, security incidents, regulatory events, and influential discussions.
- Rank trends using unique authors, engagement velocity, credibility, duplication, and spam probability—not raw post count alone.
- Preserve source links and timestamps.

### Telegram

- On-demand market status and scanner results.
- Watchlist management.
- Money Line alerts.
- Unusual-volume and volatility alerts.
- Important news and X trend alerts.
- Morning and evening briefings.

## 4. Proposed technical architecture

```text
Market APIs ----\
News/RSS --------> Ingestion workers ---> Normalized data ---> Money Line engine
X API -----------/                           |                    |
                                             |                    v
                                             +------------> AI analyst
                                                                  |
                                                   +--------------+-------------+
                                                   |                            |
                                             Web dashboard                Telegram bot
```

Recommended Google Cloud resources:

```text
crypto-scanner-web       Cloud Run web application and API
crypto-scanner-worker    Background ingestion and event processing
market-scan-job          Scheduled Cloud Run Job
x-trend-job              Scheduled Cloud Run Job
news-ingestion-job       Scheduled Cloud Run Job
daily-brief-job          Scheduled Cloud Run Job
crypto-scanner-sa        Dedicated service account
```

Recommended storage responsibilities:

- Firestore: users, roles, watchlists, current signals, current snapshots, alerts, Telegram subscriptions, and application settings.
- BigQuery: historical candles, backtests, long-term social/news analytics, and aggregated statistics.
- Cloud Storage: raw archived provider payloads and generated reports when required.
- Secret Manager: API keys, bot tokens, OAuth secrets, webhook secrets, and future exchange credentials.

## 5. Suggested project structure

```text
money-scanner/
├── apps/
│   ├── web/
│   ├── api/
│   └── worker/
├── packages/
│   ├── market-data/
│   ├── money-line/
│   ├── ai-analysis/
│   ├── social-analysis/
│   ├── notifications/
│   └── shared/
├── tests/
├── infra/
├── docs/
├── Dockerfile
├── cloudbuild.yaml
└── HANDOFF.md
```

## 6. Implementation plan

### Phase 0 — Define scope and acceptance criteria

1. Confirm the first 50 supported assets and quote currency.
2. Confirm the initial timeframes: 1H, 4H, and 1D.
3. Define what “current” means for market, X, news, and AI data.
4. Define which features are analysis-only and explicitly exclude real trading from MVP.
5. Define measurable acceptance criteria for data freshness, alert delivery, indicator parity, and dashboard response time.

Deliverable: a short product specification and prioritized backlog.

### Phase 1 — Cloud foundation

1. Create the independent Git repository.
2. Create development, staging, and production configurations.
3. Create dedicated Cloud Run services and service account.
4. Add least-privilege IAM permissions.
5. Create Crypto Scanner secrets in Secret Manager.
6. Configure Cloud Logging, error reporting, uptime checks, and budget alerts.
7. Deploy a health-check-only build to the Cloud Run development URL.
8. Configure `scanner.relayhub.no` only after the service is stable.

Acceptance criteria: Money Scanner can be deployed and rolled back without touching RelayHub.

### Phase 2 — Authentication and application shell

1. Implement private Microsoft login with an administrator allowlist for development.
2. Add Administrator, Analyst, and Viewer roles.
3. Use a separate session cookie scope from RelayHub.
4. Build the responsive navigation and empty pages for Dashboard, Scanner, Asset, X Trends, News, AI Analyst, Watchlist, Alerts, Telegram, Backtesting, and Settings.

Acceptance criteria: unauthorized users cannot access data or APIs, and the mobile/desktop shells are usable.

### Phase 3 — Market-data ingestion

1. Select a primary provider for price, candle, and trade data.
2. Add a secondary provider for selected validation checks.
3. Implement real-time or near-real-time market ingestion.
4. Normalize symbols, timestamps, prices, candles, volume, and source metadata.
5. Add retry logic, provider rate-limit handling, timeout protection, and stale-data detection.
6. Store current snapshots separately from historical data.
7. Display provider status and the last successful update.

Every normalized record must include a source and timestamp. The UI must identify stale data instead of silently displaying it as current.

### Phase 4 — Original Money Line engine

The Money Line must be an original, auditable indicator. Do not copy or claim to reproduce Bullmania’s private formula.

Initial deterministic inputs:

- EMA 20, EMA 50, and EMA 200 alignment.
- EMA slope.
- Rate of Change.
- MACD histogram.
- RSI regime.
- Relative volume.
- ATR and volatility regime.
- Multi-timeframe confirmation.

Output range:

```text
+60 to +100  Strong bullish
+20 to +59   Bullish
-19 to +19   Neutral
-59 to -20   Bearish
-100 to -60  Strong bearish
```

Implementation requirements:

1. Calculate signals only from closed candles.
2. Do not repaint historical signals.
3. Store the score, state, contributing factors, timeframe, source candle, and calculation version.
4. Create unit tests for every indicator.
5. Create parity tests between backend calculations and chart output.
6. Version the formula so historical results remain reproducible.

### Phase 5 — Scanner and asset detail UI

Scanner columns:

```text
Asset | Price | 24h change | Money Line | Trend | Last change |
Volume | Volatility | X trend | AI confidence
```

Filters:

- Strong bullish, bullish, neutral, bearish, or strong bearish.
- Recently changed.
- Timeframe.
- Market capitalization.
- Volume and volatility.
- X trend strength.
- Watchlist only.

The asset page should show an interactive chart, Money Line overlay, signal history, major price zones, relevant news, X topics, AI explanation, risks, and alert controls.

### Phase 6 — X integration

MVP approach:

1. Use X Recent Search every 5–10 minutes.
2. Maintain a curated rule set for asset names, cashtags, narratives, regulations, exploits, ETFs, token unlocks, and exchange events.
3. Normalize posts and preserve IDs, timestamps, authors, engagement, language, and source links.
4. Deduplicate reposts and copied text.
5. Detect spam, promotional bursts, and suspicious concentration.
6. Cluster posts into topics.
7. Calculate velocity and sentiment over multiple time windows.
8. Display evidence for every trend.

Later, evaluate X Filtered Stream for lower-latency monitoring if the API plan and operating cost justify it.

### Phase 7 — News intelligence

1. Integrate reputable APIs or RSS sources.
2. Normalize title, URL, publication time, source, mentioned assets, and category.
3. Remove duplicate and syndicated stories.
4. Categorize regulation, institutional activity, security, exchanges, protocol updates, token supply, and macroeconomics.
5. Assign source credibility.
6. Connect events to market movements without claiming unsupported causation.

### Phase 8 — AI market analyst

The AI receives structured data rather than unrestricted raw internet text:

```json
{
  "market": {},
  "moneyLine": {},
  "xTrends": [],
  "news": [],
  "historicalContext": {},
  "dataTimestamp": ""
}
```

The response should be structured:

```json
{
  "marketRegime": "Bullish but volatile",
  "summary": "",
  "keyDrivers": [],
  "bullishFactors": [],
  "bearishFactors": [],
  "risks": [],
  "assetsToWatch": [],
  "confidence": 0.0,
  "dataFreshness": ""
}
```

Rules:

- Separate facts from interpretation.
- Include source links and timestamps.
- State when evidence is insufficient or conflicting.
- Never promise returns.
- Never let social posts issue tool commands.
- Never allow a natural-language AI response to place a trade directly.

### Phase 9 — Telegram integration

Create a Telegram bot with commands:

```text
/start
/scan
/status BTC
/trending
/news BTC
/watch BTC
/unwatch BTC
/alerts
/brief
/help
```

Configure an HTTPS webhook and validate Telegram’s secret-token header. Add inline buttons for dashboard links, watchlist actions, muting alerts, and changing thresholds.

Alerts should include asset, signal, timeframe, price, reason, confidence, timestamp, and dashboard link.

Prevent repeated messages through cooldown periods, signal-state tracking, idempotency keys, and maximum alert frequency.

### Phase 10 — Backtesting

1. Import at least two to four years of historical candles where available.
2. Test bullish, bearish, sideways, and high-volatility regimes.
3. Include fees and realistic slippage.
4. Prevent look-ahead bias.
5. Separate optimization and validation periods.
6. Compare with buy-and-hold and simple moving-average baselines.
7. Measure win rate, profit factor, maximum drawdown, risk-adjusted return, holding period, and false positives.

The UI must label results as historical simulations, not predictions.

### Phase 11 — Paper trading

Only after the scanner passes validation:

1. Add a virtual portfolio.
2. Record simulated entries and exits.
3. Add position sizing and maximum portfolio risk.
4. Calculate realized and unrealized results.
5. Record the deterministic signal and AI context associated with each decision.
6. Add a global kill switch.

Real exchange execution is outside the initial scope. If added later, begin with explicit human approval for every order and credentials without withdrawal permission.

## 7. Security requirements

- Never request or store seed phrases.
- Never use withdrawal-enabled exchange credentials.
- Keep read-only and trading credentials separate.
- Use Secret Manager and least-privilege service accounts.
- Validate webhook signatures or secret tokens.
- Add request rate limits and strict payload schemas.
- Protect against replay using timestamps and idempotency keys.
- Sanitize external text before passing it to the AI.
- Treat X posts, news, and Telegram messages as untrusted input.
- Maintain an immutable audit event trail for settings, alerts, analysis runs, and future paper trades.
- Implement provider circuit breakers and stale-data warnings.
- Add an emergency switch that stops alerts and future execution features.

## 8. Testing strategy

- Unit tests for indicators, scoring, normalization, and alert conditions.
- Contract tests for external provider adapters.
- Recorded fixtures so tests do not depend on live APIs.
- Integration tests for ingestion-to-signal flow.
- UI tests for scanner filters and asset details.
- Telegram webhook and command tests with test fixtures.
- AI evaluation set for hallucination, missing citations, contradictory data, and stale data.
- Backtest reproducibility tests.
- Load tests for peak dashboard and ingestion traffic.
- Security tests for authorization, webhook forgery, prompt injection, rate limiting, and secret exposure.

## 9. Observability

Monitor:

- Provider availability and latency.
- Last successful update per source.
- Stale asset count.
- Worker and job failures.
- Money Line calculation failures.
- X/news ingestion volume and duplication rate.
- AI latency, errors, cost, and missing evidence.
- Telegram delivery failures.
- Alert duplication.
- Cloud Run errors, latency, instances, and costs.

Provide an internal status page showing every source and its freshness.

## 10. Recommended MVP

The first production-capable version should contain:

- Top 50 liquid crypto assets.
- 1H, 4H, and 1D timeframes.
- Original Money Line v1.
- Responsive scanner and asset detail pages.
- Watchlists.
- X Recent Search every 10 minutes.
- News ingestion every 10 minutes.
- AI analysis on demand and an hourly briefing.
- Telegram commands and alerts.
- Private Microsoft login.
- No real trading.

Rough implementation estimate: four to six weeks for the functional MVP, followed by two to three weeks for intelligence features and two to three weeks for backtesting, security, and operational validation. Estimates depend on API access and final UI scope.

## 11. Definition of done for the first release

- The application is reachable at an independent address.
- RelayHub deployment and data are unaffected.
- Authorized users can scan and filter the selected crypto universe.
- Money Line calculations are deterministic, versioned, tested, and non-repainting.
- Every market view shows data source and freshness.
- X and news trends include supporting links.
- AI explanations distinguish facts, interpretation, risks, and confidence.
- Telegram commands and alerts work without duplicates.
- No production secret exists in source control.
- Monitoring detects stale data and failed jobs.
- Backtests are reproducible and clearly labeled as simulations.
- Real trading is disabled.

## 12. Decisions still required before implementation

1. Final product and domain name.
2. Primary market-data provider and acceptable monthly API budget.
3. X API access tier and budget.
4. Exact initial asset universe.
5. AI model/provider and maximum monthly AI budget.
6. Whether Microsoft login or another private authentication method is preferred.
7. Exact Money Line weighting after the first backtest iteration.
8. Telegram alert defaults and quiet hours.
9. Design direction and branding.
10. Whether paper trading belongs in the MVP or the following phase.

## 13. Immediate next actions

1. Approve the project name and URL.
2. Create the independent Git repository.
3. Define MVP acceptance criteria.
4. Select market-data and X API plans.
5. Scaffold the application and automated tests.
6. Deploy only a private development shell.
7. Implement market normalization before Money Line or AI work.
8. Build and validate Money Line with recorded market fixtures.
9. Add the scanner UI.
10. Add X, news, AI, and Telegram in that order.

---

## 14. Implementation Progress Log

| Step | Component | Description | Status | Git Commit |
|---|---|---|---|---|
| **Step 1** | `packages/shared`, Core Monorepo | Monorepo setup (npm workspaces), `.gitignore`, TypeScript configuration, domain interfaces (Market, Indicators, X, News, AI, Telegram, Backtest, Auth) and Top 50 Assets universe. | **Completed** | `fc6ee6a` |
| **Step 2** | `packages/money-line` | Deterministic Money Line v1.0.0 math engine (EMA, MACD, RSI, RVOL, ATR, composite scoring) and unit tests. | **Completed** | `bf1f753` |
| **Step 3** | `packages/market-data` | Market data ingestion, provider normalization, candle aggregation and health monitoring. | **Completed** | `1928cc0` |
| **Step 4** | `packages/social-analysis` | Social intelligence (X trends clustering, spam filter) & news feed aggregator. | **Completed** | `e660a44` |
| **Step 5** | `packages/ai-analysis`, `packages/notifications` | Gemini AI structured analyst & Telegram bot/alert dispatcher. | **Completed** | `5d4c4b2` |
| **Step 6** | `apps/api`, `apps/worker` | REST API, RBAC auth, background scanning worker. | **Completed** | `270b6d9` |
| **Step 7** | `apps/web` | Cyber-intelligence web application (Dashboard, Scanner, Asset Deep-Dive, Backtesting). | **Completed** | `8248684` |
| **Step 8** | `infra/`, Docker, Cloud Run | Docker containerization, Cloud Run deploy configs (`cloudbuild.yaml`, `Dockerfile`) & E2E verification. | **Completed** | `8635dca` |
| **Step 9** | `packages/money-line`, `apps/web` | Proprietary **MoneyLine Overlay Force v1** (Adaptive Dual Supertrend Cloud + BUY/SELL triangle signal markers) in native TradingView Lightweight Charts engine. | **Completed** | `869af19` |
| **Step 10** | `packages/social-analysis`, `apps/web` | Watchlist Quick-Add `(+)` in Search, 100% Real verified Crypto Twitter/X alpha links, live RSS crypto news feeds (CoinDesk, Cointelegraph, Decrypt), and interactive **Ask AI Market Analyst** Chat Studio. | **Completed** | `d4cca25` |
| **Step 11** | `apps/web`, `apps/api`, `packages/market-data` | Dedicated **Full-Page Asset Deep-Dive View** (replacing modal popup), **8H Timeframe** support across indicator engine & charts, and deep historical Binance candle ingestion up to **1500 bars from genesis**. | **Completed** | `cfd2478` |
| **Step 12** | `apps/web`, `packages/social-analysis`, `packages/money-line` | **Timeframe Bias & Flip Timer Rubric** (Bullish/Bearish Force %, exact elapsed time since flip), **6-Timeframe MTF Matrix** (`1H`, `4H`, `8H`, `1D`, `1W`, `1M`), **5-Min Auto-Refresh** + Manual Update button, and **Top Crypto Twitter/X Feeds** with direct tweet links (`@lookonchain`, `@WuBlockchain`, `@whale_alert`, `@tier10k`, etc.). | **Completed** | `f6c91a0` |
| **Step 13** | `apps/web`, `packages/shared`, `packages/market-data` | **Technical Analysis Drawing Suite** (Trendlines, Fibonacci Retracement with Golden Pocket, Horizontal Support/Resistance Rays, % Measurement Ruler), **Dedicated Flip Age Column** in Live Money Scanner Signals Table, and **Trading 360° Universe** (US Stocks, Indices & Precious Metals/Commodities: `NVDA`, `TSLA`, `AAPL`, `MSFT`, `MSTR`, `COIN`, `SPY`, `QQQ`, `XAU`, `XAG`, `PAXG`, `OIL`, `COPPER`). | **Completed** | `9a81e0f` |
| **Step 14** | `apps/web`, `packages/shared`, `apps/api` | **Generic & Fuzzy Alias Search** (e.g. `spacex`, `elon musk`, `gold`, `aur`, `argint`, `petrol`, `google`, `facebook`, `ai chips`), **Global Mega-Cap & Space Tech Ingestion** (`SPACEX`, `GOOGL`, `AMZN`, `META`, `PLTR`, `AMD`), and **Main Dashboard 1W & 1M Timeframes** (`1H`, `4H`, `8H`, `1D`, `1W`, `1M`). | **Completed** | `4b7c12d` |
| **Step 15** | `apps/web`, `packages/market-data`, `infra/` | **Rebranding to Market Scanner 360** (Cloud Run service `market-scanner-360`), **Interactive Sortable Columns** (Preț, Variație, Scor Money Line, Flip Age, RVOL, Volatilitate), **Drag-and-Drop Watchlist Reordering** (Click & Hold `GripVertical`), and **Public Stock & Commodity Market Adapter** for Stocks & Metals (`NVDA`, `TSLA`, `AAPL`, `XAU`, `XAG`, `OIL`, etc.). | **Completed** | `e1f8b4a` |
| **Step 16** | `apps/web` | **Official TradingView Advanced Charting Integration** (Native TradingView platform engine with 100% official drawing tools on left toolbar: Trendlines, Fibonacci Retracement, Pitchfork, Gann, Geometric Shapes, Measure Ruler, Annotations, Native Indicators & Multi-Timeframe controls). | **Completed** | `8b3a1d9` |
| **Step 17** | `apps/web`, `apps/api`, `packages/shared` | **Market Cap Valuation Suite & Default Ordering** (Dedicated Market Cap column, formatted abbreviations `$1.34T`, `$82B`, default descending ranking), **Dynamic AI Verdict & X Social Alpha Badges** (`Strong Buy 92%`, `Buy`, `Neutral`, `Risk-Off`, `Viral 🔥`, `High ⚡`), and **Pre-loaded MoneyLine Supertrend Indicator** directly inside official TradingView chart with 1-click Pine Script copy. | **Completed** | `7f41c9a` |
| **Step 18** | `apps/web` | **Primary Chart MoneyLine Cloud & Drawing Suite Integration** (Native real-time rendering of Fast/Slow Supertrend Cloud lines, Dual Cloud Fill ribbon, BUY/SELL signal markers, full left Drawing Toolbar with Trendlines, Fibonacci Retracement, Horizontal Rays, % Ruler, and Timeframe synchronization). | **Completed** | `6c10b7f` |
| **Step 19** | `apps/web`, `packages/social-analysis`, `apps/api` | **Fear & Greed Index Suite & Dynamic Multi-Market Macro Engine** (Fear & Greed gauge replacing Volatility with sentiment tiers, multi-market selector for `Trading 360° (All)`, `Crypto 🪙`, `Stocks SUA 📈`, `Metale & Gold 🥇` dynamically updating Regime, Breadth, Liquidity, and Sentiment, plus asset-specific X posts and AI-curated news deep dive). | **Completed** | `4e19a3b` |
| **Step 20** | `apps/web`, `apps/api`, `packages/shared`, `packages/market-data` | **USA Economic Status Suite & 100% Real Official Alternative.me API Integration** (Direct live Alternative.me public API for exact real Crypto Fear & Greed index, comprehensive USA Macro Dashboard with $36.2T National Debt ticker, 1M-30Y Treasury Yield Curve, CPI/PCE Inflation, FOMC Rate Cut Odds, Wall Street Indices, Michigan Consumer Sentiment, and Gemini AI Future Guidance with What-If Scenario Simulator). | **Completed** | `91e2b7a` |
| **Step 21** | `apps/web`, `packages/shared` | **SMA 200 Macro Baseline Integration** (Integrated 200 Simple Moving Average line `#fbbf24` on MoneyLine chart, status bar with Bull/Bear position, legend item, and Pine Script v6 plot). | **Completed** | `3f59497` |
| **Step 22** | `apps/web`, `apps/api`, `packages/shared` | **Universal TradingView Search & Macro Dominance Suite** (Support for ANY TradingView asset via direct search and Enter lookup, including `BTC.D`, `ETH.D`, `USDT.D`, `TOTAL`, `TOTAL2`, `TOTAL3`, `DXY`, `VIX`, `US10Y`, `US02Y`, `EURUSD`, `GBPUSD`, `USDJPY`, `BRENT`, `NATGAS`, etc., with smart TradingView namespace mapping and dynamic API asset resolution). | **Completed** | `2991010` |
| **Step 23** | `apps/web` | **Universal Single Timeframe, Global Type-to-Search, Mobile Viewport Lock & Clean Chart Canvas** (Global keyboard type-to-search listener focusing search from anywhere, unified single timeframe driving Deep-Dive and charts synchronously, always-visible mobile search bar, locked mobile horizontal width preventing sideways scrolling, and removed obstructing series title overlays from chart canvas). | **Completed** | `aa16a81` |
| **Step 24** | `apps/web` | **Integrated TradingView Technical Analysis Toolbar on MoneyLine Chart** (Embedded complete TradingView-style left floating tool palette directly on MoneyLine chart: Cursor, Trendline, Extended Ray, Horizontal S/R, Vertical Line, Fibonacci Retracement 0.618 Golden Pocket, Parallel Channel, Rectangle Order Block, Long/Short Risk:Reward Position boxes, Measurement Ruler, Undo, and Clear All with live vector preview). | **Completed** | `6ef035a` |
| **Step 25** | `apps/web` | **Official TradingView Platform Pro Suite & Real-Time Telemetry** (Direct embedded TradingView platform with `ro` locale, pre-configured 200 SMA study, live pop-up analysis modal, real-time MoneyLine Cloud & SMA 200 telemetry badges directly in the top status bar, and 1-click Pine Script indicator exporter). | **Completed** | `720e36e` |
| **Step 26** | `apps/web` | **MoneyLine Primary Chart with Embedded TradingView Toolbar & Universal Symbol Resolution** (Set MoneyLine Force v1 as default primary chart with full left drawing toolbar, comprehensive TradingView symbol resolver for all Macro Indices, Dominance tickers, Commodities, Forex & US Equities, and resolved direct TradingView external tab launch). | **Completed** | `522bba5` |
| **Step 27** | `apps/web` | **AI Approximate Semantic Search & Full Keyboard Navigation Suite** (Integrated AI concept approximation and Levenshtein fuzzy matching across Romanian & English lore, founders, tech, and ticker typos, highlighting #1 `✨ AI TOP MATCH`, with full Arrow Up/Down keyboard selection and Enter lookup). | **Completed** | `a4eea45` |
| **Step 28** | `apps/web`, `apps/api`, `packages/shared`, `packages/money-line` | **Multi-Timeframe ROI Integration & Universal 1W Default Timeframe** (Calculated exact % ROI per timeframe and signal run in Money Line Engine, rendered prominent % ROI badges across all 6 timeframes in MTF Confluence Matrix and modal, and transitioned all charts and default scanner timeframes to 1W). | **Completed** | `5bea66e` |
| **Step 29** | `apps/web`, `packages/social-analysis`, `packages/shared` | **AI Market Intelligence Aggregator & Complete X Trends Redesign** (Redesigned X Trends with multi-sector financial classification across Macro/Fed, US Equities/AI, Metals/Energy & Crypto, Romanian AI contextual TL;DR synthesis, exact 1-click source links to posts on X, interactive asset deep-dive badges, and breaking news live radar). | **Completed** | `40f3b93` |
| **Step 30** | `apps/web` | **Complete UI/UX Redesign & Modern Sidebar Architecture** (Complete visual decluttering: collapsible left sidebar navigation on desktop, iOS-style bottom tab bar on mobile, ultra-minimal central search header with streamlined timeframe pills, unified Market Intelligence workspace consolidating dashboard and scanner, card-base elevation system with subtle borders, and enhanced spacious typography). | **Completed** | `7b96fe9` |
| **Step 31** | `apps/web` | **Asset Deep Dive 3-Zone Architecture Redesign** (Complete decluttering of asset detail view: sticky compact header with interactive bias pill and hover flip timer tooltip, full-bleed chart viewport, and organized 3-tab navigation for Multi-Timeframe Matrix, AI Thesis with inline S/R widget, and unified News & X Social alpha feed). | **Completed** | `b605453` |
| **Step 32** | `apps/web`, `apps/api`, `packages/shared`, `packages/market-data` | **Financial Narratives & Sector Alpha System** (Comprehensive catalog with 160+ top market-cap assets categorized into 8 core narratives: AI & GenAI, Semiconductors, Consumer Staples, Cloud & SaaS, Energy & Commodities, Space & Defense, Crypto Layer 1, DeFi & Fintech with 30+ assets each; real-time % performance tracking, live NarrativeBar with interactive filter chips, and full-featured NarrativeDetailModal with 1-click chart drilldown). | **Completed** | `3d783ed` |
| **Step 33** | `apps/web`, `apps/api`, `packages/shared`, `packages/market-data` | **Universal YTD (Year-To-Date) Percentage Return Integration** (Integrated `changeYtd` across all market data adapters, API scanner rows, dedicated sortable `YTD %` column in `ScannerTable`, sticky header `YTD: +XX%` badge in `AssetDeepDiveView`, and dual 24h & YTD performance metric in `NarrativeDetailModal`). | **Completed** | `1f7c745` |
| **Step 34** | `apps/web`, `apps/api`, `packages/market-data` | **Mobile Central Spotlight Search & Universal TradingView Ticker Search Engine** (Created `UniversalSearchModal.tsx` for mobile and desktop with instant 0ms AI semantic lookup and live global multi-asset autocomplete via Yahoo Finance/Binance resolver `/api/search?q=...`, central mobile header search trigger and mobile bottom nav button, full keyboard navigation, category filtering tabs, guaranteed direct TradingView drilldown for any ticker like ASML, BABA, NVDA, and seamless deep-dive fallback). | **Completed** | `4687bf6` |
| **Step 35** | `apps/web` | **Mobile TA Redesign, Ruler as 2nd Tool & Spotlight Screen Isolation Overlay** (Fixed search z-index bleeding with full dark opaque backdrop overlay covering underlying elements; repositioned % measurement ruler to be the 2nd tool in desktop and mobile toolbars; added touch event handlers `onTouchStart`, `onTouchMove`, `onTouchEnd` on chart SVG with multi-tap measurement for mobile touchscreens, live percentage rubberband preview, and dedicated mobile quick-action TA bar). | **Completed** | `648f5ad` |
| **Step 36** | `apps/web` | **Measurement Ruler Duration in Days & Multi-Metric Measurement Suite** (Integrated exact time calculation in days/hours and candle bar count in `getRulerStats`; upgraded SVG ruler info cards to show two rows: Row 1 `% Return & Price Delta`, Row 2 `⏱️ Duration in Days & Bars`; enhanced real-time rubberband preview and added live mobile measurement HUD with duration in days and 1-tap delete). | **Completed** | `218b312` |
| **Step 37** | `apps/web`, `packages/ai-analysis`, `packages/shared` | **Asset-Specific Economic Forward, Financial Reports & Strategic Investment Guidance** (Eliminated all generic crypto/BTC template leakage from stocks, commodities, and forex; added asset-class aware deep intelligence in `resolveAssetIntelligence` covering Forward Economic Outlook, Recent Financial & Earnings Reports with official metrics/margins, Actionable Investment Guidance with clear Verdicts `Strong Buy` / `Accumulate` / `Hold`, detailed Why Invest drivers, and 100% asset-specific real-world risk factors). | **Completed** | `c15522b` |
| **Step 38** | `apps/web` | **Sticky Scroll-Persistent Search Bar & Timeframe Header Suite** (Replaced viewport-breaking `overflow-x: hidden` with `overflow-x: clip` in root styles so `position: sticky` pins effortlessly on mobile and desktop; enhanced Header to `sticky top-0 z-40 bg-[#0a0e17]/95 backdrop-blur-2xl shadow-2xl` with zero screen bleed; tuned `.asset-header-sticky` to `top: 53px` with dedicated depth shadow for multi-level scroll persistence). | **Completed** | `052d831` |
| **Step 39** | `apps/web` | **Vertical Watchlist Reordering & Horizontal Pill Bar Removal** (Removed the horizontal Watchlist Activ chip bar; enabled direct vertical drag-and-drop on table rows and added 1-click vertical `ChevronUp` / `ChevronDown` reorder buttons directly into the Symbol cell for intuitive up/down rearrangement stored in persistent state and localStorage). | **Completed** | `af02af1` |
| **Step 40** | `apps/web`, `apps/api`, `packages/shared` | **Multi-Timeframe 1D & 1W MoneyLine Percentage Columns & Cloud Run Deployment** (Added dedicated interactive and sortable `ML 1D %` and `ML 1W %` columns on the central Scanner 360 table, displaying exact percentage growth/decline since Money Line transition with formatted indicator tier badges, and integrated parallel 1D & 1W signal calculation into the backend ingestion engine). | **Completed** | `ffe81ae` |
| **Step 41** | `packages/market-data` | **100% Real Dynamic Year-To-Date (YTD) Engine** (Replaced obsolete static mapping tables with live dynamic Jan 1st open price queries from Binance klines API and Yahoo Finance `range=ytd`, accurately resolving $FET YTD to -38.5% and fixing real-time YTD metrics across all 160+ assets). | **Completed** | `3b326d7` |
| **Step 42** | `apps/api`, `packages/money-line`, `infra` | **100% Real Flip Age & Zero-Invented-Data Directive Enforcement** (Deep historical candle scanning with 500-candle Lookback ensuring exact closed candle `transitionTime` calculations for 'De Când este Flip', codified Mandatory Golden Directive #1 in project core documentation, full test verification, and Cloud Run production deployment). | **Completed** | `bdca808` |
| **Step 43** | `apps/web`, `apps/api`, `packages/shared` | **Enhanced Flip Age with Real ROI % Subtitle & Unified ML 1D Dual-Row Column** (Added real Bullish/Bearish % return since flip directly under time in 'De Când este Flip', upgraded ML 1D to show 1D flip age + % ROI return underneath with tier badge, and removed obsolete ML 1W column from central Scanner 360 table). | **Completed** | `3c24ff6` |
| **Step 44** | `apps/web`, `apps/api`, `packages/shared` | **Side-by-Side ML 1D & ML 1W Multi-Timeframe Flip Columns** (Renamed Weekly Flip column to ML 1W and repositioned ML 1D immediately in front of ML 1W side-by-side, displaying dual-row layout with exact flip elapsed age, real ROI % return since flip, and color-coded indicator tier badges). | **Completed** | `49b821b` |
| **Step 45** | `apps/web` | **Bullmania AI Chat Interface Redesign** (Complete rewrite of AI Analyst page from dashboard layout to conversational chat interface inspired by Bullmania AI: left sidebar with persistent chat history in localStorage, animated thinking indicators (Thought → Searched posts → Composed response), rich markdown rendering in AI responses with tables/headers/bold, clickable embedded X post cards linking directly to exact tweet source URLs, auto-loaded executive market briefing as first AI message, sticky bottom input bar, and mobile-responsive design). | **Completed** | `dc7545a` |
| **Step 46** | `packages/social-analysis`, `apps/web` | **100% Real Live X Intelligence Links & Tweet Source Verification** (Enforced Golden Directive #1 across X Intelligence by eliminating broken synthetic status IDs and routing every post, card click, and author link directly to real live search streams on X filtered by author and cashtag (`https://x.com/search?q=from%3A...&f=live`), ensuring zero 404s, direct tweet source access, and non-invented live news feeds). | **Completed** | `a240326` |
| **Step 47** | `apps/api`, `apps/web`, `packages/market-data`, `packages/social-analysis` | **Live-Only Data Integrity & Crypto Bubble Heatmap** (Removed synthetic market, news, social, confidence, YTD and flip-time fallbacks; scanner now renders only assets with verified live quote/candle data and marks unavailable intelligence as such. Added Top 100 Crypto Bubble heatmap from live CoinGecko market-cap and 1D/1W/1M performance feeds, with 60-second API caching.) | **Completed** | `f734052` |
| **Step 48** | `apps/api`, `apps/web`, `packages/shared`, `packages/market-data` | **Restored Stocks & Metals Live Universes** (Restored the Top 50 curated US-stock universe and added a 12-instrument Metals & Commodities universe. Scanner API now fetches the requested market class, uses short quote/candle caching and bounded provider concurrency, and keeps crypto-only market overview calculations isolated.) | **Completed** | `f8f2e54` |
| **Step 49** | `apps/web` | **MoneyLine Flip Price Labels & Collision-Free Crypto Bubbles** (Added the exact closed-candle asset price to every BUY/SELL flip label, anchored directly to the slow MoneyLine curve without horizontal price lines or lateral-scale labels. Replaced pseudo-random bubble coordinates with a responsive packed layout verified at 100 bubbles with zero intersections.) | **Completed** | `8322b55` |
| **Step 50** | `apps/web` | **Live MoneyLine Flip Threshold on Every Timeframe** (Replaced historical flip-price labels with one uncluttered live threshold anchored to the latest slow MoneyLine point. It now states the exact closed-candle condition as `> price · BUY FLIP` or `< price · SELL FLIP`, recalculates for 1H/4H/8H/1D/1W/1M, preserves precision for low-priced assets, and adds right-edge chart space without lateral-scale labels.) | **Completed** | `edc7c97` |
| **Step 51** | `apps/web` | **Scanner ML Columns Prioritized After Price** (Moved ML 1D and ML 1W immediately after the Price column in both the sortable header and every data row, ahead of 24h and YTD performance, with browser verification of exact header/cell alignment.) | **Completed** | `d5c81a9` |
| **Step 52** | `apps/web`, `apps/api` | **Persistent RO/EN Interface & Cache-Safe Delivery** (Added a global language selector beside Alert with persistent Romanian/English choice across the complete interface, renamed narrative performance to `Medie 24h` / `24h Average`, localized the AI briefing date and prompts, and configured non-cacheable SPA HTML with immutable hashed assets so new deployments appear immediately.) | **Completed** | `162efef` |
| **Step 53** | `apps/web` | **Official TradingView + MoneyLine Integration & Flip Threshold Line** (Made the official TradingView chart the default asset view with its native left drawing-tools panel, automatically loaded native Supertrend plus SMA 200, synchronized the widget locale with RO/EN, exposed the exact MoneyLine BUY/SELL threshold beside the official chart, and replaced the circular flip marker in MoneyLine Cloud with a horizontal in-chart line and value label.) | **Completed** | `f340f26` |
| **Step 54** | `apps/web`, `apps/api`, `packages/ai-analysis`, `packages/social-analysis`, `packages/shared` | **Grounded News & Social Synthesis** (Added a News Feed synthesis whose claims link to exact verified RSS/social sources, optional Gemini generation with strict server-side source-ID validation, deterministic zero-key fallback, free Bluesky public search ingestion, public `t.me/s` channel preview ingestion with exact message permalinks, and allowlisted Telegram webhook ingestion for owned channels. Deployed as Cloud Run revision `market-scanner-360-00048-7b2`.) | **Completed & Deployed** | `5d64258` |
| **Step 55** | `apps/web`, `apps/api`, `packages/market-data`, `packages/shared` | **Timeframe-Aware Narratives, Dynamic Crypto Top 50 & Native Heat Map** (Narrative performance now follows the latest closed candle for the globally selected 1H/4H/8H/1D/1W/1M timeframe. The Crypto scanner dynamically selects the first 50 market-cap-ranked coins with complete Binance USDT MoneyLine history. Crypto Bubble now places all 100 coins in a seeded random, collision-free layout. Added a native CoinMarketCap-style Top 50 treemap powered by live CoinGecko data with 1D/1W/1M controls. Deployed as Cloud Run revision `market-scanner-360-00049-g8x`.) | **Completed & Deployed** | `0f021b5` |
| **Step 56** | `apps/web` | **Responsive Heat Map Typography** (Every Top 50 tile now renders the asset name, timeframe return, and market cap. Font sizes scale continuously with tile prominence from a readable minimum to 36px for dominant assets, while a small visual-area floor prevents low-cap tiles from clipping their labels. Deployed as Cloud Run revision `market-scanner-360-00051-hhp`.) | **Completed & Deployed** | `6d5940f`, `f0632cf` |
| **Step 57** | `apps/web`, `apps/api` | **Firebase Google Login & API Session Security** (Added an RO/EN Google Login gate, mobile redirect flow, logout control, Firebase ID-token verification, an allowlist restricted to the owner account, seven-day `HttpOnly`/`Secure` server session cookies, CSRF protection, and a global API gate. Health and the secret-verified Telegram webhook remain operational without a browser session. Deployed as Cloud Run revision `market-scanner-360-00052-l4c`.) | **Completed & Deployed** | `4013c1c` |
| **Step 58** | `apps/api`, `apps/web`, `packages/shared`, `packages/market-data` | **Distinct Perpetual Asset Identity & Binance Futures Search** (Added an exchange/instrument-aware asset identity so symbols that overlap across markets stay separate. `LIT` remains the AMEX lithium ETF, while `LITUSDT.P` opens the Lighter USDT perpetual with live Binance Futures candles, quotes, YTD and MoneyLine analysis. Universal Search now labels exchange and instrument type, includes the full curated catalog, and discovers matching Binance USDT-M perpetuals dynamically; any `PAIRUSDT.P` is routed to Futures without changing the Spot Top 50.) Deployed as Cloud Run revision `market-scanner-360-00057-jh8`. | **Completed & Deployed** | `7502dd4` |
| **Step 59** | `apps/api`, `apps/web` | **Crypto Ticker Collision Protection** (Preserved the provider-verified crypto class for dynamic Top 50 assets in deep dives, routed verified crypto tickers to their Binance USDT TradingView pair before stock fallback, and made the Crypto filters accept only `marketClass: crypto`. This fixes `CAKE`, which now opens PancakeSwap / USDT instead of Cheesecake Factory stock.) Deployed as Cloud Run revision `market-scanner-360-00058-w2t`. | **Completed & Deployed** | `3213c9e` |
| **Step 60** | `apps/api` | **Stock Market Cap Visibility** (Restored the known Market Cap values for every curated Top 50 stock in both the Stocks and Trading 360° scanner responses. The backend no longer replaces stock values with an empty map, so the Market Cap column can be displayed and sorted.) Deployed as Cloud Run revision `market-scanner-360-00059-2wj`. | **Completed & Deployed** | `9645dde` |
| **Step 61** | `apps/api`, `apps/web` | **Strict Crypto-Only Contract** (The Crypto scanner endpoint now hard-rejects every non-crypto row, the client validates the same rule before rendering, and scanner/bubble selections pass their verified class to the chart. This prevents any stock ticker collision from displaying a stock chart inside crypto.) Deployed as Cloud Run revision `market-scanner-360-00060-tbt`. | **Completed & Deployed** | `471d819` |
| **Step 62** | `apps/api`, `apps/web`, `packages/market-data` | **MoneyLine Provider-Class Routing** (Propagated the verified market class from scanner selection through the asset-detail API into quote and candle ingestion. Crypto now forces Binance USDT data for MoneyLine, SMA 200 and flips; cache keys are isolated by market class so an equity with the same ticker cannot contaminate crypto. Added a regression test proving `CAKE + crypto` requests `CAKEUSDT` instead of Yahoo.) Deployed as Cloud Run revision `market-scanner-360-00061-rpf`. | **Completed & Deployed** | `f6c10ca` |
| **Step 63** | `apps/api`, `apps/web`, `packages/money-line`, `packages/notifications` | **Per-Asset MoneyLine Bullish Telegram Alerts** (Added an Alert toggle directly between Cloud Base and Cloud Edge, scoped to the selected asset and timeframe. The backend monitors only closed candles, confirms bullish state when both Fast and Slow Supertrend are bullish, prevents repeat delivery until a new bearish-to-bullish cycle, and delivers the asset, timeframe, confirmation price and Slow cloud edge through Telegram. Browser storage safely re-arms selected rules after a Cloud Run restart. `telegram-bot-token` and `telegram_id` are now injected from Secret Manager and Telegram delivery was verified.) Deployed as Cloud Run revision `market-scanner-360-00064-zn6`. | **Completed & Deployed** | `f63a3e9` |
| **Step 64** | `apps/api`, `apps/web`, `packages/ai-analysis` | **Gemini Grounded News Synthesis** (Connected `Gemini_API` from Secret Manager as the server-only `GEMINI_API_KEY`; verified the configured Gemini model accepts requests. News Feed now renders each grounded AI statement with individual inline, clickable source labels that open the exact verified article, X/Bluesky post, Telegram post, or Mastodon post. The model can cite only source IDs provided by the server and every response is validated before source URLs are attached.) Deployed as Cloud Run revision `market-scanner-360-00065-tjz`. | **Completed & Deployed** | `f465e58` |
| **Step 65** | `apps/api`, `packages/notifications` | **Instantly Recognizable MoneyLine Flip Alerts** (Reworked alert messages so the first two lines explicitly show `🟢 BULLISH FLIP CONFIRMAT / ▲ BUY / LONG` or `🔴 BEARISH FLIP CONFIRMAT / ▼ SELL / RISK OFF`, followed by asset and timeframe. A formatted bullish Telegram delivery test was accepted after deployment.) Deployed as Cloud Run revision `market-scanner-360-00066-n7x`. | **Completed & Deployed** | `ed92b4d` |
| **Step 66** | `apps/api`, `apps/web`, `packages/social-analysis` | **Bounded News Feed Refreshes** (Fixed News Feed and grounded AI synthesis requests that could reach Cloud Run's 300-second timeout when an RSS, Telegram, or Bluesky source stalled. Source refreshes now share a 12-second hard deadline; API routes fall back to already cached verified sources after 15 seconds; the browser also has request deadlines and an explicit retry state instead of an infinite loading message.) Deployed as Cloud Run revision `market-scanner-360-00067-j2w`. | **Completed & Deployed** | `119a228` |
| **Step 67** | `apps/web` | **Reliable Mobile Google Login Redirect** (Replaced Firebase's non-persistent mobile redirect state with tab-scoped session persistence, so the Google result survives the navigation back to the app and can be exchanged for the secure server session cookie. Added redirect-intent recovery and a clear retry message for incomplete mobile redirects.) Deployed as Cloud Run revision `market-scanner-360-00068-bv5`. | **Completed & Deployed** | `d526fdd` |
| **Step 68** | `apps/web` | **Mobile Google Popup Authentication** (Replaced the Firebase redirect flow with the user-initiated Google popup flow on every device. This avoids the cross-site Firebase storage that mobile Chrome blocks on non-Firebase Hosting domains, while retaining the same server-verified, short-lived Firebase login state and secure application session cookie.) Deployed as Cloud Run revision `market-scanner-360-00069-6p7`. | **Completed & Deployed** | `f21219d` |
| **Step 69** | `apps/api`, `cloudbuild.yaml` | **Firebase Runtime Configuration Recovery** (Restored `FIREBASE_PROJECT_ID`, the owner email allowlist/admin role, Gemini model, and Telegram/Bluesky source configuration after the deployment command had replaced normal environment variables. Firebase Admin also has a project-specific safe fallback, and future deployments update configuration without removing Secret Manager bindings or existing runtime settings.) Deployed as Cloud Run revision `market-scanner-360-00070-qh7`. | **Completed & Deployed** | `131bda8`, `f03e3b7` |
| **Step 70** | `packages/shared`, `packages/market-data`, `apps/api` | **Complete 50+ Spot Crypto Universe & Resilient Provider Fallback** (Expanded the static curated crypto catalog from 37 to 68 assets by adding high-liquidity Binance Spot assets including DOGE, SHIB, XLM, BCH, PEPE, ETC, ATOM, FIL, ARB, OP, POL, TIA, WIF, BONK, FLOKI, STX, IMX, GALA, SAND, MANA, APE, WLD, S, and KAVA. Configured KAS with explicit Binance Futures datasource routing. Upgraded `getTopCryptoAssets` so live CoinGecko discovery seamlessly supplements missing ranks from the curated Top 50 rather than discarding live batches upon rate limiting. Verified 50 spot crypto assets in the live scanner and `Trading 360°`.) Deployed as Cloud Run revision `market-scanner-360-00071-8wg`. | **Completed & Deployed** | `ffce995` |
| **Step 71** | `apps/web` | **Permanently Visible Horizontally Scrollable Mobile Bottom Navigation** (Relocated the full desktop navigation suite to a fixed, permanently visible mobile bottom navigation bar with smooth horizontal scrolling and hidden scrollbars. Integrated all desktop views—Market 360°, Crypto Bubbles, Crypto Heat Map, USA Macro, X Trends, News Feed, AI Analyst, Backtest Lab, System Status, and Quick Search. Added auto-centering on active tab selection, active pill glow indicators, safe-area-inset bottom padding, and 80px bottom content clearance across all mobile views.) Deployed as Cloud Run revision `market-scanner-360-00072-bnb`. | **Completed & Deployed** | `f34e272` |
| **Step 72** | `packages/social-analysis`, `apps/web`, `packages/ai-analysis` | **Multi-Provider Real-Time News & AI Context Engine** (Integrated 10 live streaming news feeds across crypto, Wall Street tech stocks, Federal Reserve/CPI macro, and global breaking news including CoinDesk, Cointelegraph, Decrypt, Blockworks, The Block, Bitcoin Magazine, Yahoo Finance, and Google News Financial feeds. Added direct API ingestion support for CryptoCompare, CryptoPanic, and Finnhub APIs with auto-categorization across Regulation, Institutional, Macro, Protocol, Security, and General. Upgraded symbol extraction across 50+ instruments with alias mapping and real-time sentiment classification for grounded AI synthesis and interactive analyst queries.) Deployed as Cloud Run revision `market-scanner-360-00073-kt6`. | **Completed & Deployed** | `f3e7264` |
| **Step 73** | `packages/shared`, `packages/market-data`, `apps/api`, `apps/web` | **Strict Multi-Asset Alpha Sector Taxonomy** (Expanded Alpha Narratives & Sectors to 19 definitions spanning indices, AI software, cloud, semiconductors, consumer technology, staples, defense, energy, precious metals, industrial metals, critical minerals, and eight major crypto segments. Every one of the 112 scanner assets receives exactly one primary sector, zero-member cards are hidden for the selected market class, and clicking a sector filters the scanner strictly to its constituents. Added dynamic Top 50 crypto classification and regression coverage for taxonomy validity.) Deployed as Cloud Run revision `market-scanner-360-00074-f7n`. | **Completed & Deployed** | `d62f4ce` |
| **Step 74** | `packages/shared`, `packages/market-data`, `apps/api` | **Market-Cap Balanced Sector Coverage** (Kept the global Top 50 crypto and equity leaders while supplementing every available Alpha sector with its ten largest supported constituents. Expanded Binance Spot coverage across Layer 2, DeFi, AI, meme, infrastructure, RWA and gaming; added broad-market ETFs plus liquid energy, precious-metal, industrial-metal and critical-mineral instruments. Every active category now has at least 10 live-capable assets ordered by market cap or ETF AUM, with strict primary classification and a category-scoped scanner API path.) Deployed as Cloud Run revision `market-scanner-360-00075-c86`. | **Completed & Deployed** | `1f8d6ad` |
| **Step 75** | `packages/social-analysis`, `apps/api`, `apps/web` | **Strict Asset-Specific News & Social Feed** (Removed the client fallback that injected unrelated global social posts into an asset deep dive. Asset pages now accept only posts explicitly tagged with the selected symbol and fetch on-demand news from free Yahoo Finance search and Google News RSS sources, with mandatory symbol/name/alias relevance validation. Added optional Alpha Vantage `NEWS_SENTIMENT` support through `ALPHA_VANTAGE_API_KEY`, short-ticker ambiguity protection, per-asset caching, and a regression test proving generic trading stories cannot appear under CRM.) Deployed as Cloud Run revision `market-scanner-360-00076-bwf`. | **Completed & Deployed** | `61aaef0` |
| **Step 76** | `apps/web` | **MoneyLine Default Chart & Mobile Scrollable Drawing Suite** (Configured the proprietary MoneyLine Cloud chart with Supertrend clouds, SMA 200, buy/sell markers and real-time flip boundaries as the default view whenever any asset is selected from the scanner, watchlist, bubbles, or heatmap. Activated the full technical analysis drawing suite—pointer, % ruler, trendline, ray, horizontal, vertical, Fibonacci, channel, rectangle, long/short positions, undo, and clear—directly on mobile through a responsive, touch-friendly, vertically scrollable left toolbar with safe boundary constraints.) Deployed as Cloud Run revision `market-scanner-360-00077-667`. | **Completed & Deployed** | `e75de4e` |
| **Step 77** | `apps/web` | **Adaptive Time Scale & Mobile Portrait Chart Height Fix** (Resolved canvas viewport height clipping in mobile vertical/portrait mode by binding dynamic container client height (`container.clientHeight`) with responsive resize observers, ensuring the bottom time scale is always fully visible in portrait. Replaced artificial minute-offset time increments with authentic chronological candle timestamps and added custom tick formatting across years, months, days, and intraday hours based on zoom level.) Deployed as Cloud Run revision `market-scanner-360-00078-wxt`. | **Completed & Deployed** | `a1c52ea` |
| **Step 78** | `packages/shared`, `apps/api`, `apps/web` | **ML 4H Multi-Timeframe Flip Column Integration** (Added dedicated 4H MoneyLine signal calculation to the backend scanner engine, computing 4-hour flip states, elapsed flip time, tier status, and ROI percentages for all 112 instruments. Integrated the interactive sortable `ML 4H` column positioned immediately before `ML 1D` in the scanner table, displaying live flip indicators, tier badges, and price movement since the 4H transition.) Deployed as Cloud Run revision `market-scanner-360-00079-pdb`. | **Completed & Deployed** | `9738120` |
| **Step 79** | `apps/web` | **Three-State MoneyLine Sorting & Current Flip Detection** (Upgraded the `ML 4H`, `ML 1D`, and `ML 1W` scanner headers to cycle through ascending, descending, and `NEW FLIP ACUM` modes. The third state filters strictly to assets whose MoneyLine direction changed on the latest closed candle for the selected timeframe, orders those transitions newest-first, preserves bullish/bearish visual differentiation, and provides an explicit no-current-flips state with a quick return to descending sorting.) Deployed as Cloud Run revision `market-scanner-360-00080-gvr`. | **Completed & Deployed** | `2ce27bd` |
| **Step 80** | `apps/web` | **Timeframe-Aware MoneyLine Asset Navigation** (Made each `ML 4H`, `ML 1D`, and `ML 1W` scanner cell open the selected asset directly on the matching MoneyLine chart interval. Asset-row and detail-button navigation also inherit the currently sorted MoneyLine timeframe, including `NEW FLIP ACUM`, so a detected 4H/1D/1W transition opens in its exact analytical context.) Deployed as Cloud Run revision `market-scanner-360-00081-m8z`. | **Completed & Deployed** | `38572e8` |
| **Step 81** | `cloudbuild.yaml` | **Additional Authorized Viewer Account** (Added `smalbergher2@gmail.com` to the production `ALLOWED_EMAILS` allowlist while preserving `marius.perju.juravle@gmail.com` as the sole administrator. Verified the effective Cloud Run environment and healthy API response.) Deployed as Cloud Run revision `market-scanner-360-00082-rvg`. | **Completed & Deployed** | `6d27fd7` |
| **Step 82** | `apps/web` | **Fully Retractable Responsive Sidebar** (Moved the sidebar collapse control to the upper-right corner and upgraded collapse from a narrow 64px rail to a complete off-screen slide, reclaiming the full mobile-landscape viewport for the scanner. Added a compact left-edge reopen tab, synchronized header and main-content offsets, smooth transform transitions, and persisted the chosen state per device. Live responsive verification at 844×390 confirmed the sidebar moves from `0…260px` to `-260…0px`, the main content expands from 579px to 839px, and reopening restores the original layout.) Deployed as Cloud Run revision `market-scanner-360-00085-bfg`. | **Completed & Deployed** | `0f5d3f2` |
| **Step 83** | `packages/market-data`, `apps/api`, `apps/web` | **Infinite MoneyLine Historical Chart Loading** (Added authenticated, provider-routed candle pagination strictly before the oldest loaded timestamp for Binance spot, Binance perpetuals, Yahoo Finance equities, and metals. MoneyLine charts now detect an actual user pan toward the left edge, fetch and deduplicate up to 1,000 older bars per page, recompute overlays over the expanded history, and preserve the visible time range so exploration continues without jumping. Expanded Yahoo intraday history to its maximum two-year window and corrected 4H/8H equity aggregation. Live BTC 1H interaction verified the loading indicator and successful historical-page completion.) Deployed as Cloud Run revision `market-scanner-360-00087-ddc`. | **Completed & Deployed** | `c52d266` |
| **Step 82** | `packages/money-line`, `apps/web` | **Optional SMA 50 (Yellow, Thin) & SMA 200 (White, Thick) Baselines** (Added optional 50 Simple Moving Average (SMA 50) in thin yellow `#fbbf24` (`lineWidth: 1`) alongside the 200 Simple Moving Average (SMA 200) in thick white `#ffffff` (`lineWidth: 3`) on the Money Line chart. Implemented interactive toggle buttons in the header status bar to show/hide SMA 50 and SMA 200 independently, added above/below position indicators, a Golden Cross detection badge, and updated the Pine Script generator.) Deployed as Cloud Run revision `market-scanner-360-00083-8h6`. | **Completed & Deployed** | `88d6319` |
| **Step 83** | `apps/web` | **2D Sticky Table Headers & Persistent Asset Column** (Configured bidirectional freeze-panes on the primary scanner table across mobile and desktop: locked the horizontal table header row (`Asset`, `Preț`, `ML 4H`, `ML 1D`, `ML 1W`, `Var. 24h`, etc.) at the top (`sticky top-0 z-20`) during vertical scrolling, locked the vertical `Asset` column (`$BTC`, `$ETH`, etc.) on the left (`sticky left-0 z-10`) with solid backdrop and drop shadow during horizontal swiping, and locked the top-left corner header cell (`sticky top-0 left-0 z-30`).) Deployed as Cloud Run revision `market-scanner-360-00084-jhp`. | **Completed & Deployed** | `2913756` |
| **Step 84** | `packages/shared`, `packages/money-line`, `apps/api`, `apps/web` | **Multi-Timeframe MoneyLine Expansion (1H & 8H) with Collapsible Accordion Table** (Added full support and calculation for `ML 1H` and `ML 8H` across shared types, backend signal caching in `app-state.ts`, and frontend scanner table. Implemented an interactive accordion toggle button in the table header: defaults to showing only `ML 1W` to keep the layout compact, and expands with a sleek arrow click to reveal the complete multi-timeframe progression: `ML 1H` ➔ `ML 4H` ➔ `ML 8H` ➔ `ML 1D` ➔ `ML 1W`. All timeframes support 3-state sorting, live new-flip detection, and direct timeframe-aware chart navigation.) Deployed as Cloud Run revision `market-scanner-360-00088-p66`. | **Completed & Deployed** | `9e7f9b7` |

---

## 15. Operational & Execution Commands

### Local Development
```bash
# Install dependencies
npm install

# Run all test suites
npm test

# Run API in development mode
npm run dev:api

# Run Web frontend in development mode
npm run dev:web

# Run background scanner worker
npm run dev:worker
```

### Production Build & Verification
```bash
# Compile all workspace packages and apps
npm run build

# Start production API server
npm start
```

### News & Social Intelligence configuration

- Keep `GEMINI_API_KEY` server-side only (Google Secret Manager in production). If absent, the News Feed uses the deterministic source-linked summary.
- `GEMINI_MODEL` defaults to `gemini-3.5-flash-lite`.
- `BLUESKY_SEARCH_QUERIES` is an optional comma-separated list of public Bluesky searches.
- `TELEGRAM_SOURCE_CHANNELS` is a required comma-separated allowlist before public Telegram channel posts are accepted by the webhook.
- Keep `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, and `TELEGRAM_WEBHOOK_SECRET` server-side only. Bullish MoneyLine delivery requires the bot token and destination chat ID; the webhook can also learn the active chat after a verified command reaches the bot.

---

This document is the implementation baseline. Update it whenever architecture, APIs, scope, security rules, or deployment decisions change.


---

## 16. August 2026 alerting deployment

The production Money Scanner revision `market-scanner-360-00091-bxb` added:

- A central **Alert Command Center** opened from the global `Alert` button.
- Active per-asset MoneyLine alerts with ATR-normalized distance to the Slow flip threshold.
- Trigger history with the Entry, Stop Loss, TP1 and TP2 snapshot sent to Telegram.
- A general daily scan across the live Top 50 crypto assets plus every Market 360 stock and metal.
- The two general closed-candle conditions are:
  - Weekly MoneyLine bullish + Daily MoneyLine changes to bearish + Daily close below SMA 50.
  - Weekly MoneyLine bearish + Daily MoneyLine changes to bullish + Daily close above SMA 50.
- Cloud Scheduler job `money-scanner-daily-regime-scan`, schedule `0 12 * * *`, timezone `Europe/Oslo`.
- Secret Manager secret `money-scanner-daily-scan-token`, injected as `DAILY_SCAN_TOKEN`.
- Firestore database `money-scanner-360` in `europe-west3`, with delete protection, for persistent general-alert history and scheduler status.

Production URL:

```text
https://market-scanner-360-384051756749.europe-west3.run.app
```

## 17. RelayHub cost shutdown and restoration handoff

### Shutdown performed on 24 August 2026

RelayHub was not in use and its global external Application Load Balancer was the largest Google Cloud cost source. The load balancer was decommissioned and public invocation was removed from its retained Cloud Run service.

Deleted resources in project `gen-lang-client-0610749770`:

```text
global forwarding rule: relayhub-http-redirect-rule (port 80)
global forwarding rule: relayhub-https-rule (port 443)
global static IPv4: relayhub-ip (previous address 8.232.128.95)
global target HTTP proxy: relayhub-http-redirect-proxy
global target HTTPS proxy: relayhub-https-proxy
Google-managed SSL certificate: relayhub-cert (relayhub.no)
global URL map: relayhub-http-redirect
global URL map: relayhub-url-map
global backend service: relayhub-backend
serverless NEG: relayhub-neg (europe-west3)
```

Retained resource:

```text
Cloud Run service: cloud-callcenter-saas
Region: europe-west3
Direct URL: https://cloud-callcenter-saas-srqcsofnua-ey.a.run.app
Scaling: min instances 0, max instances 20
Resources: 1 vCPU, 512 MiB, concurrency 80, timeout 300 seconds
Public allUsers roles/run.invoker binding: REMOVED
```

The source/deployed container was intentionally retained. The service now scales to zero and rejects unauthenticated public traffic. `relayhub.no` no longer resolves to a functioning Google Cloud frontend. Cloud DNS was not enabled in this project; the external DNS A record must be updated or removed at the domain provider separately.

Post-shutdown verification:

```text
Remaining RelayHub load-balancer resources: 0
Retained Cloud Run service status: READY
Unauthenticated request to the direct Cloud Run URL: HTTP 403
```

The deleted load-balancer objects and released IP cannot be restored in place. They can be recreated with the commands below; the recreated static IP will normally be different. Billing reports can lag behind the resource shutdown, so already-incurred usage can remain visible after the deletion date.

### Fast restoration without the custom domain

To expose the retained service again through its Cloud Run URL:

```bash
gcloud run services add-iam-policy-binding cloud-callcenter-saas \
  --region=europe-west3 \
  --member='allUsers' \
  --role='roles/run.invoker'
```

Then use:

```text
https://cloud-callcenter-saas-srqcsofnua-ey.a.run.app
```

### Full restoration of `relayhub.no`

The old IP was released and must not be assumed to be available. Recreate the stack, obtain the new IP, and change the DNS A record for `relayhub.no` to that new address.

```bash
gcloud run services add-iam-policy-binding cloud-callcenter-saas \
  --region=europe-west3 \
  --member='allUsers' \
  --role='roles/run.invoker'

gcloud compute addresses create relayhub-ip \
  --global \
  --ip-version=IPV4 \
  --network-tier=PREMIUM

gcloud compute network-endpoint-groups create relayhub-neg \
  --region=europe-west3 \
  --network-endpoint-type=serverless \
  --cloud-run-service=cloud-callcenter-saas

gcloud compute backend-services create relayhub-backend \
  --global \
  --load-balancing-scheme=EXTERNAL_MANAGED \
  --protocol=HTTP \
  --timeout=30s

gcloud compute backend-services add-backend relayhub-backend \
  --global \
  --network-endpoint-group=relayhub-neg \
  --network-endpoint-group-region=europe-west3

gcloud compute url-maps create relayhub-url-map \
  --global \
  --default-service=relayhub-backend

gcloud compute ssl-certificates create relayhub-cert \
  --domains=relayhub.no

gcloud compute target-https-proxies create relayhub-https-proxy \
  --url-map=relayhub-url-map \
  --ssl-certificates=relayhub-cert

gcloud compute forwarding-rules create relayhub-https-rule \
  --global \
  --load-balancing-scheme=EXTERNAL_MANAGED \
  --network-tier=PREMIUM \
  --address=relayhub-ip \
  --target-https-proxy=relayhub-https-proxy \
  --ports=443

gcloud compute url-maps import relayhub-http-redirect \
  --global \
  --source=infra/relayhub-http-redirect.yaml

gcloud compute target-http-proxies create relayhub-http-redirect-proxy \
  --url-map=relayhub-http-redirect

gcloud compute forwarding-rules create relayhub-http-redirect-rule \
  --global \
  --load-balancing-scheme=EXTERNAL_MANAGED \
  --network-tier=PREMIUM \
  --address=relayhub-ip \
  --target-http-proxy=relayhub-http-redirect-proxy \
  --ports=80

gcloud compute addresses describe relayhub-ip \
  --global \
  --format='value(address)'
```

After changing DNS, wait for the Google-managed certificate to become `ACTIVE` before treating the restoration as complete.

## 18. Removal of unused Google Cloud applications

### Cleanup performed on 24 August 2026

The following unused Cloud Run applications were permanently removed from project `gen-lang-client-0610749770`:

```text
crypto-scanner-web (europe-west3)
kj-lematte (europe-west2)
kjolematte-backend (europe-west2)
```

The dedicated Artifact Registry package `kjolematte-backend` in `europe-west2/cloud-run-source-deploy` was also deleted. The historical package named `crypto-scanner-web` in `europe-west3` was intentionally retained because the active Market 360 revision is deployed from that package (`crypto-scanner-web:codex-alert-center-20260824-2`). Deleting the package would break future rollback/redeployment of Market 360.

Post-cleanup Cloud Run inventory:

```text
cloud-callcenter-saas (RelayHub, retained, private)
market-scanner-360 (retained, public, HTTP 200 verified)
relayhub-hybrid-email-test (RelayHub component, retained)
```

Other Google Cloud projects were not deleted as part of this cleanup. Project deletion is broader than deleting an application and can remove buckets, snapshots, API keys and IAM configuration. At inventory time, `gen-lang-client-0165084077` (`Typi`) and `responsive-journey-vbc5s` still had billing enabled; the active account did not have resource-inspection permission on `responsive-journey-vbc5s`.

## 19. Manual alert scans

The Alerts Center now exposes two authenticated manual scan modes:

```text
Rapid / Quick:
- combines the current browser watchlist (maximum 50 entries) with the user's active MoneyLine alert rules
- checks the Daily/Weekly regime condition and every configured alert timeframe
- concurrency 4
- cooldown 60 seconds

Complet / Full:
- reuses the scheduled general Top 50 crypto + Market 360 stocks + metals scan
- concurrency 6
- cooldown 10 minutes per user
```

Implementation details:

- UI: `apps/web/src/components/AlertsCenterView.tsx`
- authenticated endpoint: `POST /api/alerts/manual-scan`
- request body: `{ "scope": "quick" | "full", "watchlist": [{ "symbol": "BTC", "marketClass": "crypto" }] }`
- the endpoint requires the normal Firebase session plus an `X-CSRF-Token`
- scan status is included in `GET /api/alerts/dashboard` as `manualScan`
- the client keeps the POST request open while polling dashboard progress every 2.5 seconds
- concurrent scans for the same user reuse/lock the active operation
- existing closed-candle idempotency keys prevent duplicate Telegram regime alerts
- the full Cloud Run and Cloud Scheduler request deadlines remain 900 seconds

The existing `Actualizează` button only reloads dashboard state; it does not start provider scans. The new `Rapid` and `Complet` buttons are the only manual scan triggers.

Production deployment:

```text
Git implementation commit: ff759f4
Cloud Build: 12f1f52a-6720-49e6-adb9-e60974618910
Cloud Run revision: market-scanner-360-00092-vxw
Traffic: 100%
Health verification: HTTP 200
Unauthenticated manual-scan verification: HTTP 401
```

## 20. Top 10 upcoming MoneyLine flips

The Alerts Center now stores and displays a ranked list of ten distinct assets closest to a MoneyLine flip. The list is rebuilt by every full/scheduled scan and persisted in the existing Firestore document `operations/daily-regime-scan`.

Ranking flow:

```text
Stage 1:
- scan all Top 50 crypto + Market 360 stocks + metals on 1D and 1W
- calculate preliminary distance to the Slow flip threshold normalized by ATR
- shortlist the best 30 assets

Stage 2:
- fetch live quote plus 4H and 8H only for the shortlist
- evaluate 4H, 8H and 1D candidates
- score distance/ATR, live threshold crossing, new closed-candle flip,
  ML 1W alignment, SMA 50, SMA 200 and RVOL
- keep the best timeframe for each symbol and publish ten distinct assets
```

Candidate states are `APPROACHING`, `VERY_CLOSE`, `AWAITING_CLOSE` and `CONFIRMED`. The UI has All/Bullish/Bearish filters, opens the exact candidate timeframe, and lets a bullish candidate become an active MoneyLine alert. A bearish candidate opens its chart and threshold; the existing notification engine remains intentionally bullish-only.

The candidate list is returned by `GET /api/alerts/dashboard` as `flipCandidates`. No extra scan starts when the Alerts page is opened; an initial list appears after the next `Complet` scan or the scheduled 12:00 Europe/Oslo scan.

Production deployment:

```text
Git implementation commit: 190369b
Cloud Build: 798256b5-640b-430b-8e67-b459df4e053b
Cloud Run image revision: market-scanner-360-00093-dxn
Cloud Run secret-rotation revision: market-scanner-360-00094-bw9
Traffic: 100%
Health verification: HTTP 200
Unauthenticated dashboard verification: HTTP 401
Initial full scan: HTTP 200, ten populated candidates verified
Cloud Scheduler: token rotated/synchronized; manual execution HTTP 200
Mobile verification: 390x844, ten real cards and no horizontal overflow
```

## 21. Weekly regime + Daily SMA 50 reclaim backtest

Implemented locally on 25 August 2026. This change is committed separately from the last deployed Cloud Run revision and must not be described as deployed until a new deployment is explicitly made.

Strategy rules:

```text
LONG:
- both Weekly MoneyLine cloud directions are bullish
- a closed Daily candle trades below SMA 50 and arms the pullback
- Daily close reclaims SMA 50
- Daily Fast MoneyLine and 8H Slow MoneyLine confirm within five Daily closes
- Daily SMA 50 is rising, close is above SMA 200 and entry is not more than 1 ATR extended

SHORT (optional mode):
- exact inverse of the LONG rules

Execution and risk:
- signals use closed candles only
- orders fill at the next Daily open, including configured slippage
- initial stop uses the wider of the recent five-day structural extreme and SMA 50 +/- 0.25 ATR
- positions with more than 8% initial price risk are rejected
- target is 2.5R
- a confirmed Weekly regime invalidation exits at the next Daily open
- if stop and target are both touched during one Daily candle, the pessimistic stop-first assumption is used
```

UI and API:

- `Backtest Lab` now defaults to this strategy and plots close, SMA 50, SMA 200, entries and exits on the price chart.
- The equity curve is mark-to-market, rather than being updated only when a trade closes.
- Users can switch between long-only and long+short modes.
- `GET /api/backtest/:symbol?strategy=weekly_reclaim` runs one asset.
- `GET /api/backtest-compare` compares BTC, ETH, SOL, SPY, QQQ, NVDA, XAU, XAG and COPPER.

Initial live-data sample, long-only:

| Asset | Trades | Win rate | Expectancy | Return | Max drawdown |
|---|---:|---:|---:|---:|---:|
| BTC | 2 | 50.0% | +0.70R | +0.78% | 12.06% |
| ETH | 1 | 0.0% | -1.08R | -2.83% | 4.39% |
| SOL | 0 | - | - | 0.00% | 0.00% |
| SPY | 1 | 0.0% | -1.47R | -1.22% | 1.22% |
| QQQ | 1 | 0.0% | -1.53R | -4.28% | 4.79% |
| NVDA | 3 | 33.3% | +0.13R | +1.38% | 15.33% |
| XAU | 1 | 0.0% | -1.36R | -0.75% | 0.75% |
| XAG | 0 | - | - | 0.00% | 0.00% |
| COPPER | 1 | 100.0% | +0.87R | +4.21% | 3.65% |

Aggregate: ten trades, 30% win rate, approximately -0.42R mean expectancy per asset and -0.30% mean return per asset. Long+short improved BTC materially but did not make the basket robust.

Important limitation: the common test window is constrained by the available 8H provider history (roughly October 2024 for crypto and June 2025 for stocks/metals). This is an implementation/behavior check, not statistically sufficient strategy validation. Before using it as an automated production alert, compare a Daily-only variant over 5-10 years against the strict Daily+8H variant, then run walk-forward/out-of-sample validation.

## 22. Connors RSI(2) trend-pullback research strategy

Implemented locally on 25 August 2026. This section is not a production deployment record. The last deployed Cloud Run revision remains the one recorded in section 20 until a new deployment is explicitly made.

Research basis:

- StockCharts documents Larry Connors' RSI(2) setup: use SMA200 for the long-term trend, RSI(2) below 5 for a selective pullback entry, and a close above SMA5 for the long exit. It also explicitly warns that the original no-stop approach can produce outsized losses.
- AQR's long-horizon evidence supports trading with, rather than against, persistent trends across many markets. It does not imply that RSI(2) itself is universally profitable.
- A July 2026 SSRN preprint found that RSI(2) mean-reversion did not retain a statistically significant edge after realistic costs and multiple-testing correction on its equity-index sample. The application links this critical result alongside the supporting sources; the local holdout is evidence for continued research, not proof of a durable edge.

Implemented rules:

```text
Recommended mode: LONG_ONLY
Signal: Daily close > SMA200 and RSI(2) < 5
Entry: next Daily open
Exit: first Daily close > SMA5, filled at the next Daily open
Protection: catastrophe stop 3 ATR below entry
Costs: 0.075% commission per side + 0.05% slippage per side
Data: up to 2,000 closed Daily candles, assembled from recent and older provider pages
Validation: final chronological 30% reported separately; earlier data remains indicator warm-up only
```

The symmetric SHORT mode remains available for research but is not recommended by default. It materially degraded ETH, SOL and NVDA during the tested period. The default scope is liquid crypto and liquid US stocks/ETFs; metals are still displayed to expose non-transferability rather than conceal it.

Full-sample LONG_ONLY comparison on 25 August 2026:

| Asset | Trades | Win rate | Profit factor | Return | Max drawdown |
|---|---:|---:|---:|---:|---:|
| BTC | 21 | 76.2% | 2.63 | +38.98% | 11.98% |
| ETH | 20 | 65.0% | 3.26 | +40.43% | 17.65% |
| SOL | 19 | 68.4% | 1.11 | +7.15% | 22.19% |
| SPY | 37 | 70.3% | 1.56 | +11.33% | 10.07% |
| QQQ | 33 | 69.7% | 2.17 | +21.70% | 6.98% |
| NVDA | 27 | 77.8% | 2.24 | +53.10% | 17.93% |
| AAPL | 34 | 61.8% | 1.24 | +9.50% | 13.54% |
| XAU | 28 | 53.6% | 0.63 | -11.38% | 17.85% |
| XAG | 19 | 52.6% | 1.03 | +0.87% | 16.24% |
| COPPER | 24 | 70.8% | 1.35 | +7.50% | 18.37% |

All ten assets: 262 trades, 66.8% weighted win rate, nine profitable assets, median profit factor 1.56. For the intended crypto+stocks scope only: all seven assets were profitable in the full sample, with 191 trades and approximately 69.6% weighted win rate.

Chronological final-30% holdout for the intended crypto+stocks scope: 75 trades, 68.0% weighted win rate, six of seven assets profitable. NVDA was the exception at -2.39% despite a 72.7% win rate, demonstrating why win rate must never be treated as expected profitability. Metals passed only one of three holdouts and therefore remain outside the recommended scope.

Backtest Lab changes:

- strategy selector with Connors RSI(2) as the research default and MoneyLine Reclaim retained;
- price chart with SMA5, SMA200, entry/exit markers and a separate RSI(2) strip;
- full-sample metrics plus the chronological 30% holdout for the selected asset;
- source links and an explicit scope/risk warning;
- ten-asset comparison with no per-asset parameter optimization.

## 23. Production alert engine for the two RSI(2) strategies

Implemented and deployed on 26 August 2026. Production details and verification evidence are recorded at the end of this section.

The existing authenticated Alerts Center, manual scanner, daily Cloud Scheduler endpoint, Telegram bot and Firestore persistence now support two global Daily strategy alerts for crypto and US stocks:

```text
CONNORS_RSI2_LONG
- latest closed Daily candle closes above SMA200
- RSI(2) crosses into the extreme zone below 5
- alert stage: CONFIRMED
- execution reference: following Daily open
- protection: 3 ATR(14) below the signal-close reference
- primary exit: next open after a Daily close above SMA5

BEAR_RALLY_FADE_SHORT
- asset close < SMA200
- asset SMA50 < SMA200
- asset SMA200 is lower than 20 Daily closes ago
- benchmark is also bearish: BTC for crypto, SPY for stocks
- RSI(2) crossing above 95 emits ARMED / DO NOT ENTER
- RSI(2) crossing back below 50 within the next three closed Daily candles emits CONFIRMED SHORT
- protection: 3 ATR(14) above the signal-close reference
- primary exit: next open after a Daily close below SMA5
```

Operational behavior:

- every signal is based only on closed Daily candles;
- the current scheduled/full scan evaluates Top 50 crypto plus Market 360 stocks; metals are deliberately excluded because the research scope did not validate them;
- the quick manual scan evaluates the user's watchlist and active alert assets;
- ARMED and CONFIRMED are separate Telegram messages with unmistakable LONG/SHORT direction;
- confirmed alerts include entry reference, stop, 1.5R and 2.5R reference targets, ATR, RSI(2), SMA5/SMA200 and benchmark context;
- the message explicitly says that the exact fill and levels must be recalculated at the real next open;
- Firestore stores active strategy setups and idempotency-protected history across Cloud Run cold starts;
- the Alerts Center shows active strategy cards and historical ARMED/CONFIRMED snapshots alongside existing MoneyLine alerts;
- repeated scans of the same closed candle cannot resend the same strategy stage.

Implementation files:

- pure evaluator: `apps/api/src/services/strategy-alert-service.ts`
- scanner, Telegram, persistence and dashboard: `apps/api/src/services/app-state.ts`
- API history exposure: `apps/api/src/routes/telegram-routes.ts`
- shared snapshot model: `packages/shared/src/types/alerts.ts`
- UI: `apps/web/src/components/AlertsCenterView.tsx`
- deterministic unit coverage: `apps/api/src/services/strategy-alert-service.test.ts`

Verification on 26 August 2026:

```text
npm run build: PASS
npm test: PASS
strategy unit tests: 4/4 PASS
live read-only smoke check: BTC, ETH, SOL, SPY, QQQ, NVDA and AAPL evaluated successfully
live smoke result: no current setup on those seven assets (expected valid empty state; no Telegram test sent)
mobile UI verification: 390x844, strategy section visible and body/main horizontal overflow = 0px
```

Production deployment on 26 August 2026:

```text
Git implementation commit: 0cfad9e
Cloud Build: 3815ee0f-90a9-4fec-8f3f-ef5953b69fa4
Cloud Build status: SUCCESS
Cloud Run revision: market-scanner-360-00095-9kq
Container digest: sha256:9ad8025b3e976fa467f4030f2af23145f92ba25277a85667cd872149a5c750e8
Traffic: 100%
Canonical URL: https://market-scanner-360-384051756749.europe-west3.run.app
Health verification: HTTP 200
Root application verification: HTTP 200, bundle index-DIEPESkX.js
Production bundle verification: Connors RSI(2), Bear Rally Fade and Strategii Daily automate present
Unauthenticated Alerts dashboard verification: HTTP 401 (expected)
Cloud Scheduler: money-scanner-daily-regime-scan ENABLED at 12:00 Europe/Oslo
Secret bindings preserved: DAILY_SCAN_TOKEN, GEMINI_API_KEY, TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID
```

## 24. Backtest Lab for both production RSI(2) strategies

Implemented on 26 August 2026. This section is completed by the deployment record below after Cloud Run verification.

Backtest Lab now exposes the two live alert strategies as explicit, independent choices:

```text
Strategy 1 — Connors RSI(2) Pullback LONG
- Daily close > SMA200
- RSI(2) < 5
- entry at next Daily open
- exit at next open after close > SMA5
- catastrophe stop 3 ATR below entry

Strategy 2 — Bear Rally Fade SHORT
- asset close < SMA200, SMA50 < SMA200 and SMA200 falling versus 20 closes ago
- benchmark confirmation: BTC for crypto, SPY for US stocks
- RSI(2) cross above 95 arms the setup only
- RSI(2) cross below 50 within three closed Daily candles confirms it
- entry at next Daily open
- exit at next open after close < SMA5
- catastrophe stop 3 ATR above entry
```

Both simulations use up to 2,000 closed Daily candles, next-open execution, 0.075% commission per side, 0.05% slippage per side, mark-to-market equity and a separately reported chronological final-30% holdout. Bear Rally Fade is forced to `SHORT_ONLY`; Connors is forced to `LONG_ONLY` in the UI so Backtest Lab matches the live alert definitions. Metals are excluded from these two strategy scopes. The older Weekly MoneyLine Reclaim remains available as an experimental third option.

UI changes:

- expanded liquid asset selector for individual tests;
- dedicated LONG/SHORT strategy labels and fixed direction badges;
- RSI(2) strip for Bear Rally Fade with separate arm (>95) and confirmation (<50) levels;
- markers for armed and confirmed short signals;
- multi-asset comparison across BTC, ETH, SOL, SPY, QQQ, NVDA and AAPL without per-asset optimization;
- strategy rules, source links, trade log, full-sample statistics, holdout, drawdown and risk disclaimer remain visible.

Verification before deployment:

```text
npm run build: PASS
npm test: PASS
API integration suite: 11/11 PASS
Bear Rally deterministic unit tests: 2/2 PASS
BTC Connors live-data sample: 21 trades, 76.2% win rate, PF 2.63, +38.98%; holdout +2.17%
ETH Bear Rally live-data sample: 5 trades, 60.0% win rate, PF 7.83, +16.01%; holdout +1.04%
QQQ Bear Rally live-data sample: 7 trades, 71.4% win rate, PF 1.62, +2.38%; holdout -1.59%
```

The samples are historical research outputs, not forward-performance claims. The QQQ holdout loss is intentionally retained as evidence that the strategy is not universally profitable.

Production deployment on 26 August 2026:

```text
Git implementation commit: d6d3894
Cloud Build: b274d556-a114-4c39-98c4-5f17cac6a143
Cloud Build status: SUCCESS
Cloud Run revision: market-scanner-360-00096-4dz
Container digest: sha256:235b25de6f4bd2898da17075468fdf07b4455f06c1903636abf0fe1850cce749
Traffic: 100%
Canonical URL: https://market-scanner-360-384051756749.europe-west3.run.app
Health verification: HTTP 200
Root application verification: HTTP 200, bundle index-Citj7w3r.js
Production bundle verification: Strategia 1, Strategia 2, Bear Rally Fade, bear_rally_fade and RSI arm label present
Unauthenticated Bear Rally backtest verification: HTTP 401 (expected)
Production login view: rendered successfully at desktop and 390x844 mobile viewport
```
