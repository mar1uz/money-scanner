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
> 
> ### 🚀 MANDATORY OPERATIONAL DIRECTIVE #2: ALWAYS PROVIDE APPLICATION LINK ON EVERY DEPLOY
> **AFTER EVERY DEPLOYMENT (Cloud Run / Production), THE ASSISTANT MUST ALWAYS INCLUDE THE DIRECT ACCESSIBLE APPLICATION LINKS IN THE FINAL USER RESPONSE:**
> - Primary Cloud Run URL: `https://market-scanner-360-384051756749.europe-west3.run.app`
> - Production Domain: `https://scanner.relayhub.no`
> - Plus the exact Cloud Run revision name and health status verification.

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
| **Step 85** | `packages/shared`, `packages/market-data`, `apps/api`, `apps/web` | **Deterministic Chart Market Resolver & TradingView Symbol Repair** (Added a resolver that checks which major exchanges list each crypto asset (Binance spot/futures, Bybit, OKX, Coinbase, Kraken, Hyperliquid) and deterministically picks the pair with the longest listing history, breaking 7-day ties by 24h quote volume, with Binance spot preferred via short-circuit and a 12h resolution cache. New Bybit and OKX spot adapters provide candles with UTC-aligned 4H-to-8H aggregation. MoneyLine Cloud candles and price quotes route through the resolver with automatic legacy fallback, and a new `GET /assets/:symbol/chart-market` endpoint feeds the TradingView embed, fixing "This symbol doesn't exist" (e.g. GRASS now resolves to `BYBIT:GRASSUSDT`, listed since 2024-10-28) and short-history chart selection. The extern tab degrades to a friendly Romanian empty state when no major-exchange pair exists, and the TradingView open-external action moved into the tab row beside Pine Script at matching size.) | **Completed** | `dd3d16e`, `f5de2f4` |
| **Step 86** | `apps/web` | **Alerts-to-Asset Back Navigation Repair** (Fixed back navigation from an asset page opened via the Alerts center: the Header alerts entry now routes through the same history-pushing tab change as the sidebar, so `tab=alerts` is recorded in browser history and pressing back from the asset returns to the Alerts page instead of Home.) | **Completed** | `77ed183` |
| **Step 87** | `apps/api`, `apps/web` | **Telegram Price Alerts** (Added one-shot price alerts on any asset chart: the user sets a target price and direction (>=/<=) next to the MoneyLine plan alert, the backend polls the resolved exchange pair every 60 seconds through the chart market resolver, and a Romanian Telegram message fires once when the target is reached. Rules persist in the Firestore `price-alerts` collection (db `money-scanner-360`) to survive Cloud Run restarts, with per-user scoping, a 50-alert cap, deduplication, and REST routes `GET/POST/DELETE /api/alerts/price`. Delivery reuses the existing Telegram bot token/chat configuration.) | **Completed** | `f745b46` |

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

## 25. Conservative Connors LONG confirmation

Implemented on 26 August 2026. Deployment evidence is appended below after production verification.

The live Connors alert and Backtest Lab now use the same conservative two-stage rule:

```text
ARMED / NO ENTRY:
- closed Daily price remains above SMA200
- RSI(2) crosses below 5

CONFIRMED LONG:
- an armed setup exists
- RSI(2) crosses back above 50 on a closed Daily candle
- Daily price is still above SMA200
- execution reference is the following Daily open

INVALIDATION:
- Daily closes at or below SMA200 before RSI(2) confirmation
```

Telegram and Alerts Center distinguish the amber `LONG ARMAT — NU INTRA ÎNCĂ` stage from the green executable `LONG CONFIRMAT` stage. Armed LONG cards show the RSI(2) > 50 requirement and SMA200 invalidation. Stored active confirmations created by the previous aggressive RSI(2) < 5 rule are filtered during restore; historical alert records remain immutable.

Backtest Lab plots the <5 arm level, >50 confirmation level, armed markers and confirmed entry markers. It retains next-open execution, 3 ATR catastrophe stop, SMA5 exit, costs, slippage and chronological 30% holdout.

Verification before deployment:

```text
npm run build: PASS
npm test: PASS
API integration suite: 11/11 PASS
focused API/service suites: 22/22 PASS
GD current state under the new evaluator: ARMED, RSI(2) 1.16, no executable LONG confirmation
legacy GD active confirmation after state restore: removed
```

GD historical comparison under the conservative rule: 18 trades, 66.7% win rate, PF 1.81, +4.87% return and 4.68% max drawdown; final-30% holdout produced eight trades, 62.5% win rate, PF 1.50 and +1.47%. The earlier aggressive GD variant had more return but a lower win rate and larger drawdown.

The seven-asset conservative basket was not universally improved: only BTC and ETH were profitable in the full sample; aggregate expectancy was approximately flat and mean return negative. This limitation is intentionally retained in Backtest Lab. Conservative here means later price confirmation and reduced early-entry risk, not guaranteed or universally superior profitability.

Production deployment on 26 August 2026:

```text
Git implementation commit: 4a9557a
Cloud Build: 5c7f4284-e0ab-46f5-9583-230cacd263af
Cloud Build status: SUCCESS
Cloud Run revision: market-scanner-360-00097-jjl
Container digest: sha256:a53add7e13f28f8e3807fdd9dfa88e36e082697e9380c68f26000e06675ef739
Traffic: 100%
Canonical URL: https://market-scanner-360-384051756749.europe-west3.run.app
Health verification: HTTP 200
Root bundle: index-CwIF4L2I.js
Bundle verification: RSI(2) > 50 waiting text, conservative confirmation copy, arm and confirmation chart labels present
Unauthenticated Alerts dashboard: HTTP 401 (expected)
```

## 26. Research-only stocks strategy retained for future paper alerts

Researched on 26 August 2026 and intentionally **not deployed**. The retained candidate is:

```text
WEEKLY_TREND_DONCHIAN_55_20_LONG
Scope: liquid US stocks and ETFs only
Regime: MoneyLine Weekly Fast+Slow bullish; Weekly close > rising SMA40
Daily filter: close > SMA200; SMA50 > SMA200; both rising; positive 252-session momentum
Volatility filter: ATR14% outside the highest-volatility 30% of its one-year history
Trigger: closed Daily candle above the previous 55-session high
Execution: following Daily open; skip gaps larger than 1 ATR
Initial stop: wider of two-bar structural stop minus 0.1 ATR and 2 ATR below entry
Risk gate: reject stop distance > 4%; risk no more than 0.5% of portfolio
Exit: rising 20-session Donchian low or Weekly regime invalidation
```

Chronological research result for stocks/ETFs:

```text
Calibration 70%: 140 trades, 42.86% win rate, PF 1.79, +0.45R expectancy, 3.22% median stop
Holdout 30%: 61 trades, 40.98% win rate, PF 1.55, +0.31R expectancy, 3.03% median stop
Double-cost holdout: PF 1.39, +0.23R expectancy
```

Crypto failed the holdout (five trades, PF 0.03, -0.77R expectancy), so this strategy must not be presented as cross-asset or enabled for crypto. Full methodology and limitations are in `docs/backtests/2026-08-26-strategy-candidate-research.md`; reproducible research code is in `scripts/research-strategy-candidates.mjs`. If implemented later, begin with paper alerts and forward validation rather than executable trade claims.

## 27. Preliminary cross-asset strategy research

Researched on 26 August 2026 and not deployed. The best cross-asset candidate is `12M_MOMENTUM_DONCHIAN_55_20_LONG`: positive 252-session momentum, ATR14% outside the highest-volatility 20% of its own one-year history, Daily close above the prior 55-session high, next-open entry, 2 ATR initial stop, 20-session Donchian trailing exit, 0.5% portfolio risk and a preferred universal 6% maximum stop gate.

The frozen 60/20/20 protocol remained positive in the final 20% for all three classes, but with important limitations:

```text
Stocks: 96 trades, PF 1.33, +0.21R expectancy, 4.44% median stop
Crypto: 6 trades, PF 2.43, +0.80R expectancy, 5.25% median stop
Metals: 12 trades, PF 11.05, +4.21R expectancy, 3.51% median stop
```

The crypto result is sparse and the metals result is dominated by large gold/silver trends. A separate cross-sectional holdout of 23 previously unused crypto assets generated only 17 eligible trades under the 6% risk gate (PF 3.28, +1.06R), dominated by TRX. Reducing the stop to 1 ATR increased coverage but failed in the most recent 20% (PF 0.77, -0.21R). Therefore this candidate may scan every asset, but it must reject most high-volatility crypto setups rather than force coverage. It is approved only for further paper-alert/forward research, not production trading claims. Full evidence: `docs/backtests/2026-08-26-cross-asset-strategy-research.md`.

## 28. Asymmetric 3R strategy research

Researched on 26 August 2026 and not deployed. The retained candidate is `ASYMMETRIC_DONCHIAN_55_3R_LONG`: Daily 252-session positive momentum, close above SMA200, rising SMA50, ATR14% outside the highest-volatility 20% of its trailing year, close above the prior 55-session high, next-open entry, wider of a two-candle structural stop and 2 ATR, hard rejection above 10% stop distance, fixed 3R take-profit, 0.5% portfolio risk, and SMA50/90-session fallback exits.

Frozen 60/20/20 result across 33 stocks/ETFs, crypto and metal proxies:

```text
Calibration: 373 trades, 41.6% WR, PF 1.68, +0.39R, 4.16% median stop
Validation: 171 trades, 51.5% WR, PF 2.49, +0.68R, 4.30% median stop
Final: 145 trades, 37.2% WR, PF 1.49, +0.30R, 4.51% median stop
Final doubled costs: 144 trades, PF 1.40, +0.26R
```

Final stocks were only PF 1.17/+0.11R (PF 1.10/+0.07R at doubled costs); crypto had only 10 trades and metals only 18. Treat this as a paper-alert candidate, not a proven universal or live-execution strategy. Full methodology is in `docs/backtests/2026-08-26-asymmetric-strategy-research.md`; reproducible code is in `scripts/research-asymmetric-strategies.mjs`.

## 29. Rejected mechanical SHORT mirror on 86 assets

Researched on 26 August 2026 and not deployed. `WEEKLY_TREND_DONCHIAN_55_20_SHORT` mirrored the retained LONG candidate: bearish Weekly Fast+Slow MoneyLine, close below falling Weekly SMA40, bearish Daily SMA50/SMA200 stack and slopes, negative 252-session momentum, controlled ATR percentile, Daily close below the prior 55-session low, next-open SHORT, wider of a two-candle structural stop and 2 ATR, 0.25% equity risk, and a 20-session Donchian-high trailing exit.

The test covered 86 valid assets (63 stocks/ETFs, 20 crypto and three metal proxies) with a chronological 70/30 split, fees and slippage but an optimistic zero borrow/funding cost:

```text
4% stop gate in-sample: 23 trades, 21.7% WR, PF 0.91, -0.07R
4% stop gate holdout: 5 trades, 20.0% WR, PF 0.66, -0.29R
6% holdout: 9 trades, PF 0.41, -0.45R
8% holdout: 15 trades, PF 0.49, -0.33R
10% holdout: 21 trades, PF 0.36, -0.42R
```

The mechanical SHORT mirror is rejected: widening the stop increases coverage but worsens the edge, and real borrow/dividend/funding costs would make results weaker. Do not add it to live alerts. Research report: `docs/backtests/2026-08-26-weekly-donchian-short-86-assets.md`; reproducible script: `scripts/backtest-weekly-donchian-short-50plus.mjs`.

## 30. Extended search for a profitable SHORT strategy

Researched on 26 August 2026 and not deployed. The saved LONG candidate remains `WEEKLY_TREND_DONCHIAN_55_20_LONG`. No SHORT candidate passed every calibration, validation and untouched final check, so no new live SHORT alert is approved.

The most promising paper-only pattern is `RELATIVE_WEAKNESS_BEAR_FLAG_2_5R_SHORT`: Fast+Slow SPY bear state, bearish Weekly/Daily asset regime, 63-session underperformance versus SPY of at least 5%, compact six-session bear flag, breakdown trigger, next-open short, structural/2 ATR stop rejected above 10%, 2.5R target and 0.25% portfolio risk. It produced PF 2.61/+0.34R in calibration, PF 2.35/+0.46R in validation and PF 2.52/+0.38R on 39 previously unused stocks (PF 2.21/+0.33R under doubled friction and 6% borrow). However, the locked temporal final had only three stock trades and failed at PF 0.14/-0.32R. Retain only for paper observation; do not call it robustly profitable.

A separate weakest-decile cross-sectional momentum model also failed: 140 calibration trades at PF 1.42/+0.21R, then 16 validation trades at PF 0.29/-0.42R. A deep-bear variant was PF 1.68/+0.35R historically but PF 0.04/-0.81R during 2020–2026. Full evidence: `docs/backtests/2026-08-26-profitable-short-strategy-search.md`. Reproduction scripts: `scripts/research-profitable-short-strategies.mjs` and `scripts/research-cross-sectional-short.mjs`.

## 31. Research archive deployment

Deployed on 27 August 2026 from Git commit `d0977c0` through Cloud Build `cf2159b1-f853-4963-9858-3c8500b885f1`.

```text
Cloud Run service: market-scanner-360
Cloud Run revision: market-scanner-360-00098-xwf
Traffic: 100%
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app
Root: HTTP 200
Health: HTTP 200, status ok
Secret bindings preserved: DAILY_SCAN_TOKEN, GEMINI_API_KEY, TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID
```

This revision packages the saved research reports and reproducible backtest scripts but does not activate either research candidate in the live UI, scanner, or Telegram alerts. `WEEKLY_TREND_DONCHIAN_55_20_LONG` remains a stocks/ETF paper candidate, and no SHORT strategy has passed the locked final validation required for live activation.

## 32. Weekly Trend + Donchian 55/20 LONG production replacement

Implemented on 27 August 2026. The validated stocks/ETF-only LONG candidate replaces Connors RSI(2) across the active strategy scanner, Telegram notifications, Alerts dashboard and Backtest Lab. The former `connors_rsi2` API path now returns HTTP 410 and persisted Connors cards/history are removed during state restoration.

Production identifier: `WEEKLY_DONCHIAN_55_LONG` / `weekly_donchian_long`.

```text
Universe: stocks and ETFs only
Weekly regime: MoneyLine Fast + Slow bullish; close > rising SMA40
Daily trend: close > SMA200; SMA50 > SMA200; both rising over 20 sessions
Momentum: close > close 252 sessions ago
Volatility: current ATR14% percentile <= 70 over the prior 252 sessions
Armed: all filters valid and price no more than 1 ATR below Donchian 55
Confirmed: fresh closed Daily breakout above the prior 55-session high
Execution gate: following Daily open, gap <= 1 ATR
Initial stop: wider of two-candle structure minus 0.1 ATR and 2 ATR
Risk gate: reject initial stop distance > 4%; backtest risks 0.5% of equity
Exit: trailing Donchian low 20 or Weekly regime invalidation
```

The Alerts page shows Donchian 55, Weekly SMA40, volatility percentile, 12-month momentum, entry reference, stop and risk-reference targets. Telegram sends distinct near-breakout and confirmed-breakout messages and warns that the open/gap/risk levels must be recalculated at execution. Backtest Lab defaults to SPY and exposes ten liquid US stocks/ETFs for comparison, with Donchian 55/20 plotted on the price chart.

Verification before deployment:

```text
npm test: 50 passed, 0 failed
API integration: 12 passed, 0 failed
npm run build: passed
```

Deployment evidence:

```text
Git commit: 4c5f3c6
Cloud Build: c1a00248-ff2b-4d54-afdd-488c7e15aa51 (SUCCESS)
Cloud Run revision: market-scanner-360-00100-f69
Traffic: 100%
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app
Root: HTTP 200
Health: HTTP 200, status ok
Production bundle: index-BRmvk08t.js
Bundle verification: Donchian labels present; Connors RSI(2) label absent
Cloud Scheduler: money-scanner-daily-regime-scan ENABLED at 12:00 Europe/Oslo
```

## 33. Alerts Center Top Flips-only filter

Implemented on 27 August 2026. Added `TOP FLIPURI` to the existing strategy filter bar in Alerts Center. Selecting it switches the page content to a dedicated Top 10 flip view with the existing `TOATE / BULLISH / BEARISH` subfilters. Strategy setup cards, individually tracked alerts and alert history are hidden in this focused mode; the summary and manual/full scan controls remain available so the ranking can be refreshed. Returning to any strategy filter restores the existing page sections unchanged.

Pre-deployment verification: `npm run build` passed; `npm test` passed 50/50.

Deployment evidence:

```text
Git commit: cd87fe6
Cloud Build: 3682f9cd-72ff-4b22-b891-8bc886dcba50 (SUCCESS)
Cloud Run revision: market-scanner-360-00101-gjc
Traffic: 100%
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app
Root: HTTP 200
Health: HTTP 200
Production bundle: index-DO5HH98-.js
Bundle verification: TOP FLIPURI and the focused flip-view label are present
```

## 34. Flip-only full scanner and focused Top Trading Alerts

Implemented on 27 August 2026. Alerts Center no longer runs automated LONG/SHORT strategy evaluation. Full and quick alert scans now evaluate MoneyLine flips only; the strategy implementations and their backtests remain available in Backtest Lab.

The full scan evaluates every supported Top 50 crypto, stock/ETF and metal on closed 4H, 8H and 1D candles with ML 1W, SMA 50/200 and RVOL context. `Top 10 aproape de flip` excludes already-confirmed events and keeps one best timeframe per asset. `Top 10 alerte de trading confirmate` keeps only recent events (4H up to 12 hours, 8H up to 24 hours, 1D up to 72 hours), prioritizes the lower 4H timeframe and shows a technical setup score rather than an unvalidated win probability.

Confirmed flips are persisted separately with candle-level idempotency and delivered to Telegram in one ranked message. The page exposes CSRF-protected controls to delete all individually tracked alerts or clear the confirmed-flip history; clearing tracked alerts also removes their browser recovery keys.

Automatic scheduling changes from daily noon to five minutes after every UTC 4H boundary:

```text
Cron: 5 */4 * * *
Timezone: UTC
Expected runs: 00:05, 04:05, 08:05, 12:05, 16:05, 20:05 UTC
```

Pre-deployment verification:

```text
npm run build: passed
npm test: 51 passed, 0 failed
API integration: 13 passed, 0 failed
Production bundle: index-Bh2LUpcH.js
```

Deployment evidence:

```text
Git commit: 98390e0
Cloud Build: 1d8da785-6acf-4c1c-bbf4-1c4c76d34382 (SUCCESS)
Cloud Run revision: market-scanner-360-00102-qnw
Traffic: 100%
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app
Root: HTTP 200
Health: HTTP 200, status ok
Production bundle: index-Bh2LUpcH.js
Bundle verification: Flip-Only, Top 10 near/confirmed and delete-history labels present
Cloud Scheduler: ENABLED, cron 5 */4 * * *, UTC, next scheduled run 16:05 UTC
Production full scan: HTTP 200 in 6.62s; 177/177 assets; 0 errors; 4 confirmed flips; 0 strategy matches
```

## 35. Dual Independent Scanners: Trading Strategies (Donchian 55/20 LONG) & Top 10 MoneyLine Flips

Implemented on 27 August 2026. The backend and Alerts Center UI now provide two completely separate, independent full-universe scan engines covering all 177 assets (Top 50 crypto, stocks/ETFs, and metals):

1. **Cross-Asset Donchian 55/20 LONG Strategy Engine (`apps/api/src/services/strategy-alert-service.ts`)**:
   - Extended `WEEKLY_DONCHIAN_55_LONG` across all asset classes (`stocks`, `crypto`, `metals`).
   - Dynamic maximum initial risk gating: $\le 4\%$ for stocks/ETFs, $\le 8\%$ for crypto, $\le 6\%$ for metals.
   - Evaluates:
     - Weekly Trend: Fast & Slow lines bullish (`dirFast < 0 && dirSlow < 0`), Weekly Close above rising 40-week SMA.
     - Broad Daily Trend: Close > SMA200, SMA50 > SMA200, both rising over 20 bars.
     - 12-Month Momentum: Positive 252-day return.
     - Volatility Gate: ATR rank $\le 70\%$ (or $\le 75\%$ for crypto).
     - Trigger: Daily close above 55-day High (`CONFIRMED`) or within 1 ATR below (`ARMED`).
     - Exit: Trailing 20-day Donchian Low with initial stop at $\min(\text{structural}, 2 \times \text{ATR})$.

2. **Backend Dual Execution Architecture (`apps/api/src/services/app-state.ts`)**:
   - `executeStrategiesScan(userId?)`: Scans all 177 assets for Daily/Weekly trading strategy setups (`WEEKLY_DONCHIAN_55_LONG`, `MONEYLINE_MACRO_LONG`, `MONEYLINE_4H_SNIPER_LONG`, `BEAR_RALLY_FADE_SHORT`), updates `strategySetups`, and dispatches Telegram notifications.
   - `executeDailyRegimeScan()`: Scans all 177 assets across 4H, 8H, and 1D for MoneyLine proximity and flips, populating `flipCandidates` and `confirmedFlips`.
   - `POST /api/alerts/manual-scan`: Accepts `scope: 'strategies' | 'flips' | 'quick' | 'full'`.
   - Firestore persistence in `operations/daily-regime-scan` preserves `strategySetups` and `confirmedFlips` independently.

3. **Alerts Center User Interface (`apps/web/src/components/AlertsCenterView.tsx`)**:
   - Distinct Action Buttons in Header:
     - ⚡ **Scanare Strategii (Donchian 55)**: Triggers strategy evaluation.
     - ⚡ **Scanare Top 10 Flips**: Triggers multi-timeframe flip evaluation.
     - ⚡ **Rapid (Watchlist)**: Scans tracked watchlist and active alerts.
   - Filter Tabs: `TOATE`, `STRATEGII DE TRADING`, `TOP 10 FLIPURI`, `ALERTE URMĂRITE`.
   - Rich `StrategySetupCard`: Visualizes signal price, Donchian High 55, Trailing Low 20, Stop Loss, Target 1 (1.5R), Target 2 (3.0R), ATR percentile, and direct link to chart.

Pre-deployment verification:
```text
npm run build: passed
npm test: 51 passed, 0 failed
Production bundle: index-mcJSfdrr.js
```

Deployment evidence:
```text
Git commit: aafa39c
Cloud Build: a7273ffe-ef47-4fab-ad37-682294624e90 (SUCCESS)
Cloud Run revision: market-scanner-360-00103-wrx
Traffic: 100%
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app
Health: HTTP 200, status ok
```

## 36. Production Fix: Strategy Setup Risk Calculation, Non-Blocking Stops & Multi-Setup Capture

Implemented and deployed on 27 August 2026. Fixed zero-setup scan results across all asset classes:

1. **Root Cause Analysis & Strategy Fixes (`apps/api/src/services/strategy-alert-service.ts`)**:
   - **Donchian 55/20 Long Risk Gating**: Replaced `Math.min(structural, volatility)` with `Math.max(structural, closes - 2.5 * ATR)` and aligned realistic risk ceilings ($\le 15\%$ for crypto, $\le 10\%$ for metals, $\le 8\%$ for stocks). Previously, taking the minimum forced stop distance to $\ge 2 \times \text{ATR}$, which strictly exceeded the old $4\% / 8\%$ gate on real market data and rejected 100% of assets.
   - **MoneyLine Macro & 4H Sniper Stop Support**: Replaced blind `lineSlow` referencing with direction-aware cloud support (`lineSlow` when slow bullish, `lineFast` when fast bullish, or ATR structural buffer). Previously, when slow line was resistance (above price), `closes - lineSlow` produced negative risk and caused immediate rejection.
   - **History Length Flexibility**: Allowed evaluation for assets with $\ge 50$ daily bars using SMA50 and MoneyLine Cloud series instead of hard-rejecting assets with $< 200$ bars.
   - **Multi-Setup Collection**: Updated `evaluateDailyStrategyAlerts` to return `snapshots: StrategyAlertSnapshot[]`, ensuring assets qualifying for multiple valid strategies retain all setups instead of overwriting.

2. **Scanner State & Persistence Updates (`apps/api/src/services/app-state.ts`)**:
   - `executeStrategiesScan`: Collects all matching snapshots across the universe, deduplicates by `${strategy}:${symbol}:${timeframe}`, and prioritizes `CONFIRMED` setups followed by risk-adjusted scoring.
   - `persistDailyRegimeState`: Included `global:daily-strategy-scan` in the persistent alert history saved to Firestore.

Pre-deployment verification:
```text
npm run build: passed
npm test: 52 passed, 0 failed
Production bundle: index-mcJSfdrr.js
```

Deployment evidence:
```text
Git commit: d7c5f14
Cloud Build: 23c4f53e-4756-4a01-a51d-eb0b22feaa5c (SUCCESS)
Cloud Run revision: market-scanner-360-00104-8m6
Traffic: 100%
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app
Health: HTTP 200, status ok
```

## 37. Strategy Alert Safety Audit & Weekly MoneyLine Flip Discovery

Audited, corrected and deployed on 27 August 2026 after reviewing sections 26–36 and the live Alerts Center.

### Safety decision

- Reverted the production trade-alert scanner to the only retained holdout candidate: **Weekly Trend + Donchian 55/20 LONG for stocks/ETFs only**.
- Automatic strategy alerts now require Fast **and** Slow Weekly MoneyLine bullish, price above a rising Weekly SMA40, mature Daily SMA50/SMA200 alignment and slopes, positive 252-session momentum, ATR percentile at or below 70, and a fresh/near Donchian 55 breakout.
- The initial stop again matches the validated backtest: the wider of the two-candle structural stop and 2 ATR. A setup is rejected if this implies more than **4%** price risk; the stop is never tightened merely to pass the gate.
- Execution remains conditional on the next Daily open, a gap no larger than 1 ATR and risk still at or below 4%.
- Crypto/metals Donchian, MoneyLine Macro, 4H Sniper and Bear Rally Fade SHORT remain research/backtest models only. They cannot populate production setup cards or send Telegram trade alerts.
- A production rescan cleared 50 stale experimental cards and returned one conservative ARMED candidate (VEA, 2.11% estimated stop); no entry was claimed.

### ETH / Weekly flip correction

- Root cause: the global flip scanner evaluated only 4H, 8H and 1D, even though the MoneyLine chart displayed the 1W flip threshold.
- Added 1W to candidate calculation, confirmation history and closed-candle age handling.
- Retained candidates per timeframe and added 4H/8H/1D/1W filters plus symbol search, so lower-timeframe Top 10 entries cannot hide a specific Weekly setup.
- Live verification after a 177-asset scan: searching `ETH` shows **ETH 1W · BULL FLIP · Se apropie**, price **$2,523.49**, Slow BUY threshold **$2,664.3348**, distance **0.53 ATR / 5.58%**. It correctly does not appear under confirmed flips because price has not crossed the threshold and the Weekly candle has not closed.
- Fixed dashboard polling so restoring persisted state cannot make live progress exceed the universe total.

### Verification and deployment

```text
npm run build: passed
npm test: 48 passed, 0 failed
API regression tests: 19 passed, 0 failed
Live strategy scan: 83/83 stocks/ETFs, 1 ARMED, 0 errors
Live flip scan: all 177 assets completed, 1W candidates included
Live ETH search: ETH 1W candidate visible at the same $2,664.3348 threshold as the chart
Git commits: 6065767, 8243ab5, 6998a76
Final Cloud Build: 1d092307-d1ae-43b9-acdc-0dbf2aa229b3 (SUCCESS)
Cloud Run revision: market-scanner-360-00107-cvq
Traffic: 100%
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app
Health: HTTP 200, status ok
Production bundle: index-I217crRg.js
```

## 38. Confirmed Flip Alert Filters

Implemented and deployed on 27 August 2026.

- Added an independent filter set to **Top 10 alerte de trading confirmate**, matching the controls used by **Top 10 aproape de flip**:
  - direction: All / Bullish / Bearish;
  - timeframe: All / 4H / 8H / 1D / 1W;
  - symbol search.
- Confirmed results remain limited to the ten best recent closed-candle flips inside the selected filters.
- Candidate and confirmed filters use separate state, so changing one list cannot silently change the other.
- Empty results now explicitly state that no recent confirmed flip matches the selected filters; history is never deleted by filtering.

```text
npm run build: passed
npm test: 48 passed, 0 failed
Live UI: both filter groups present; confirmed 1W selection left candidate 1W unselected; confirmed symbol search accepted XRP
Git commit: 1271248
Cloud Build: 59934de6-c13c-4b6d-b384-85121ba7216d (SUCCESS)
Cloud Run revision: market-scanner-360-00108-b6h
Traffic: 100%
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app
Health: HTTP 200, status ok
Production bundle: index-DH9I-3_j.js
```

## 39. Donchian Strategy Frequency Audit & Two-ATR Preparation Radar

Implemented locally on 27 August 2026; **not deployed in this task**.

- Root cause of the small live result count: production displays only assets that pass every Weekly/Daily/volatility/risk filter and are already above, or at most one ATR below, Donchian 55. A current snapshot is not the historical trade count.
- Added reproducible research script `scripts/research-donchian-frequency.mjs` and tested D20/D30/D40/D55/D80 entry windows over 63 stocks/ETFs with a 60/20/20 chronological split.
- Final D55: 101 trades, 32.7% win rate, PF 1.27, expectancy +0.17R and 3.15% median stop. With doubled costs: PF 1.15 and +0.10R.
- D20 added only 12 final trades and weakened the result to PF 1.24 / +0.15R; doubled costs reduced it to PF 1.10 / +0.07R. The production entry remains D55.
- Expanded only the informational radar to two ATR:
  - `WATCH` between one and two ATR, no Telegram event and no entry claim;
  - `ARMED` at or below one ATR;
  - `CONFIRMED` only after a fresh closed Daily breakout.
- Strategy cards now show the ATR distance and explicitly label WATCH as `DE URMĂRIT`.

Verification:

```text
Research universe: 63/63 assets fetched successfully
npm run build:packages: passed
API build: passed
Web build: passed
API tests: 20 passed, 0 failed
Research report: docs/backtests/2026-08-27-donchian-frequency-audit.md
Deployment: not performed (not requested)
```

## 40. Eight-Percent Stop LONG Strategy Search — No Deployment

Completed on 27 August 2026. The user authorized an initial stop up to 8% and requested deployment only if a more profitable strategy was found.

- Tested 19 fixed candidates based on 52-week-high momentum, 12-month trend/momentum, volatility control, Donchian entries D55–D120, exits D20–D60 and 2–2.5 ATR stops.
- Selection used 63 development stocks/ETFs with chronological calibration/validation. Two separate cross-sectional sets supplied 48 and 40 valid new symbols.
- Round-one winner D80/20 max 8% improved the internal final PF from 1.31 to 1.40, but lost to the D55 baseline over the full 48-symbol holdout (PF 1.07 vs 1.12).
- Round-two winner D100/50, 2.5 ATR, max 8% improved the internal final PF from 1.27 to 1.67. It reached only PF 1.05 over the second full holdout and failed the decisive recent 30%: PF 0.79, expectancy −0.14R; doubled costs PF 0.72, expectancy −0.20R.
- Conclusion: no candidate was robustly more profitable. Production strategy code and its 4% gate were not changed; no Cloud Run deployment was performed.
- Full report: `docs/backtests/2026-08-27-long-strategy-8pct-search.md`.
- Reproducible scripts: `scripts/research-long-strategy-8pct.mjs`, `scripts/research-long-strategy-8pct-round2.mjs`.

## 41. Confirmed RSI(2) Pullback Search — Higher Win Rate Rejected

Completed locally on 27 August 2026; no production code or deployment changed.

- Tested 14 confirmed RSI(2) pullback candidates over 63 development stocks/ETFs, with two additional 48/40-symbol universes reserved for candidates passing selection.
- All candidates retained the strict Weekly/Daily MoneyLine trend, SMA50/SMA200, momentum and ATR-percentile filters. Stops were 2–3 ATR and capped at 8%.
- Several validation results showed 55–65% win rates and PF 1.67–1.97, but the identical fixed rules had calibration PF 0.59–1.00 and non-positive expectancy.
- No candidate passed the predeclared calibration + validation gate. Final holdouts were not opened for a selected candidate, preventing retrospective cherry-picking.
- Conclusion: the higher win rate was not a stable profitable edge. Do not enable RSI(2) production alerts and do not relax D55.
- Report: `docs/backtests/2026-08-27-confirmed-rsi2-pullback-search.md`.
- Script: `scripts/research-confirmed-rsi2-pullback.mjs`.

## 42. Two-ATR Donchian Preparation Radar Deployment

Deployed on 27 August 2026 after explicit user approval.

- Published the informational Donchian preparation radar implemented in commit `0987dfc`:
  - `WATCH / DE URMĂRIT` between one and two ATR below Donchian 55;
  - `ARMED / ARMAT` at or below one ATR;
  - `CONFIRMED` only after a fresh closed Daily breakout.
- WATCH never creates a Telegram event and never claims an executable entry.
- Production execution remains the stocks/ETF-only Weekly Trend + Donchian 55/20 LONG strategy with the validated 4% maximum stop. The rejected 8% and RSI(2) research candidates remain scripts/documentation only.

Verification and deployment evidence:

```text
Source commit/image tag: 6d2a73c
Local build: passed
Local tests: 49 passed, 0 failed
Cloud Build: fed2edd6-8e2e-482f-a8ec-652d50f545a7 (SUCCESS)
Cloud Run revision: market-scanner-360-00109-nqp
Traffic: 100%
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app
Health: HTTP 200, status ok
Production bundle: index-DFZwLsho.js
```

## 43. Compact MoneyLine Flip Price Deployment

Deployed on 28 August 2026.

- Removed the opaque `BUY FLIP` / `SELL FLIP` badge that covered candles on narrow mobile charts.
- The flip threshold now shows only its compact price, without a rectangle, in reserved empty space after the latest candle.
- Removed the duplicate flip badge from the lateral price scale; the dashed threshold line remains visible.
- Increased the future-space offset responsively so the compact value stays clear of current price action on mobile and desktop.

Verification and deployment evidence:

```text
Source commit/image tag: 5830442
Local build: passed
Local tests: 49 passed, 0 failed
Cloud Build: 4a6fc60a-8c71-4dd1-8c49-7e2bafd824ee (SUCCESS)
Cloud Run revision: market-scanner-360-00110-j78
Traffic: 100%
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app
Health: HTTP 200, status ok
Production bundle: index-DYeAqNiq.js
```

## 44. Grounded Multi-Market AI Intelligence Deployment

Implemented and deployed on 29 August 2026.

- Replaced the static crypto-only AI Analyst opening brief with a scope-aware Market Intelligence dashboard:
  - Crypto;
  - Stocks;
  - Metals (energy/oil is explicitly excluded from this scope).
- Each report contains:
  - macro regime and directional macro drivers;
  - HOT / BULLISH / EMERGING / NEUTRAL / COOLING / BEARISH narratives;
  - narrative score, relevant assets, catalysts and risks;
  - Alpha Discovery Radar for launches, founders/platform relationships and early catalysts;
  - Risk Radar and clickable source cards.
- Gemini 3.5 Flash-Lite receives a live application snapshot plus recent source material. Google Search grounding is attempted first.
- The configured Google Search grounding quota currently returns HTTP 429. The production-safe second path therefore runs Gemini over free verified RSS/news/social feeds and labels the UI `Gemini + surse verificate`; it never pretends Google Search was used.
- Added targeted free discovery RSS queries for crypto launches (including PONS/Robinhood Chain), stock catalysts and metals supply/demand narratives.
- Server-side integrity guards:
  - model-proposed tickers must be supported by the source bundle;
  - a founder/company connection is `Verified` only when the same evidence connects both entities;
  - feed-grounded verification requires at least two independent publishers;
  - unsupported claims are downgraded to `Emerging` or `Unverified`.
- Live Gemini test identified PONS correctly as `PONS` and conservatively labeled it `Emerging`.
- Scope/language reports are cached for 20 minutes; manual refresh has a two-minute floor to limit Gemini cost and duplicate requests share one in-flight promise.
- The AI chat below the dashboard now inherits the selected scope and report sources, preventing Stocks/Metals questions from receiving the old crypto-only macro answer.

Verification and deployment evidence:

```text
Source commit/image tag: 25ae6f7
Local build: passed
Local tests: 51 passed, 0 failed
Live Gemini tests: Crypto, Stocks and Metals returned structured ai-sources reports
Mobile visual QA: passed, no browser console errors
Cloud Build: 22a6298e-ce7b-4a60-939b-4e3db5448a91 (SUCCESS)
Cloud Run revision: market-scanner-360-00111-k5g
Traffic: 100%
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app
Health: HTTP 200, status ok
Production bundle: index-DTfx3SXv.js
```

## 45. Crypto Top-200 Four-Criteria Fundamental Scanner

Implemented and deployed on 29 August 2026 from the YouTube interview segment at 30:03–30:35.

- Added a `4 criterii · Top 200` button visible only in the Crypto scope of AI Analyst.
- The scanner evaluates the four protocol-business criteria discussed in the clip:
  1. growth in usage/activity;
  2. network effect;
  3. real, recurring and sustainable revenue;
  4. value returned to token holders through buyback/burn, distributions or revenue-funded staking.
- Market-cap universe:
  - CoinGecko top 200 is the primary source;
  - CoinPaprika is an independent automatic fallback when the no-key CoinGecko endpoint returns 429.
- Fundamental evidence comes from DefiLlama protocols, TVL, fees, revenue and holders revenue.
- The free datasets do not provide standardized active-user counts across all 200 coins. The UI therefore labels the network-effect assessment as a conservative fees/TVL/multi-chain proxy and keeps missing observations as `Date insuficiente`; Gemini is not allowed to invent the missing values.
- Results include:
  - total scanned and covered assets;
  - 4/4 matches;
  - assets passing the first three criteria while value accrual is not yet confirmed;
  - Top score / 4-of-4 / first-three filters and search across the full top 200;
  - per-criterion evidence, methodology, source links and disclaimer.
- Scan results are cached for 30 minutes, manual refresh has a two-minute floor and concurrent requests share one in-flight scan.
- Romanian and English display text is supported.

Verification and deployment evidence:

```text
Source commit/image tag: b6f8ac7
Local build: passed
Local tests: 53 passed, 0 failed (API suite: 22 passed)
Live data check: 200 scanned; ~120 with observable fundamentals at test time
Local browser interaction: passed, including provider-rate-limit fallback
Cloud Build: 4d21c524-8f72-4e42-a001-758e9fa71310 (SUCCESS)
Cloud Run revision: market-scanner-360-00112-bpf
Traffic: 100%
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app
Health: HTTP 200, status ok
Production bundle: index-Cd9lUI2B.js
```

## 46. Unified Asset-to-MoneyLine Navigation and CoinGecko Links

Implemented and deployed on 29 August 2026.

- Added one reusable asset navigation layer for the authenticated application. Explicit asset names and ticker labels now open the matching Money Line deep-dive instead of behaving differently from page to page.
- Connected the remaining asset surfaces, including:
  - AI Analyst narrative tickers, discovery results, prose ticker mentions and Top-200 four-criteria result cards;
  - News Feed ticker badges and explicit asset mentions inside headlines/summaries;
  - Backtest Lab selected asset and comparison results;
  - USA Macro index/crypto references;
  - Crypto Bubble and Crypto Heat Map cards.
- Existing scanner rows, alert cards, narrative category assets, global search and watchlist flows continue to open Money Line and now share the same destination behavior.
- Crypto selections carry the CoinGecko asset ID whenever the source provides it.
- Added a `CoinGecko` external-link button to the Money Line header on desktop and its compact mobile status row:
  - exact `/en/coins/<id>` page when the CoinGecko ID is known;
  - CoinGecko asset search as a safe fallback for obscure/fallback-provider symbols.
- The generic system test-alert label no longer embeds a misleading BTC ticker that would conflict with the global asset-link behavior.

Verification and deployment evidence:

```text
Source commit/image tag: aca1982
Local build: passed
Local tests: 53 passed, 0 failed
Local browser QA: Top-200 PUMP card opened Money Line; CoinGecko button resolved exactly to /en/coins/pump-fun
Cloud Build: d4f70285-ac0a-4168-a8ff-51e3f39f27d3 (SUCCESS)
Cloud Run revision: market-scanner-360-00113-m9l
Traffic: 100%
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app
Health: HTTP 200, status ok
Production bundle: index-cq6KN4zT.js
```

## 47. Daily 07:00 AI Intelligence and Crypto Criteria Warm-Up

Implemented and deployed on 29 August 2026.

- Added the secured `POST /api/ai/daily-warmup` operational endpoint for Cloud Scheduler.
- Added Cloud Scheduler job `money-scanner-daily-ai-warmup`:
  - cron: `0 7 * * *`;
  - timezone: `Europe/Oslo` (automatic DST handling);
  - request deadline: 900 seconds;
  - authenticated with the existing Secret Manager-backed `DAILY_SCAN_TOKEN` header.
- Every morning the job pre-generates and caches:
  - Market Intelligence Crypto in Romanian and English;
  - Market Intelligence Stocks in Romanian and English;
  - Market Intelligence Metals in Romanian and English;
  - Crypto Business Quality / four-criteria Top-200 scan.
- Reports are generated sequentially to avoid bursting the Gemini quota and free market/news-provider rate limits.
- Replaced the former 20/30-minute, instance-local-only lifetime with a 26-hour morning snapshot policy.
- Every result is persisted to the `money-scanner-360` Firestore database. A cold Cloud Run instance restores the morning result before generating anything, so opening AI Analyst later in the day does not wait for Gemini or the Top-200 scan.
- Manual refresh remains available and can replace the morning snapshot after the existing two-minute refresh floor.
- The scheduled endpoint is excluded from browser session auth only after constant-time validation of the dedicated secret token.

Verification and deployment evidence:

```text
Source commit/image tag: 5fc100c
Local build: passed
Local tests: 55 passed, 0 failed
Cloud Build: cab651dd-8e8a-42e4-a585-decda09ef09c (SUCCESS)
Cloud Run revision: market-scanner-360-00114-vnw
Traffic: 100%
Cloud Scheduler: money-scanner-daily-ai-warmup ENABLED, 0 7 * * *, Europe/Oslo
Manual scheduler execution: SUCCESS (empty Scheduler status object)
Warm-up duration: 166,678 ms
Warm-up result: 6/6 market reports ready; crypto criteria ready; 200 assets scanned
Firestore verification: all 7 persistent AI cache documents exist
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app
Health: HTTP 200, status ok
```

## 48. Crypto Business Quality · 4 Criteria — Per-Asset Card in AI Tab

Implemented and deployed on 29 August 2026.

### What was added

A new `CryptoBusinessQualityCard` component renders inside the **Analiză AI** tab of every crypto asset's Money Line deep-dive view (`AssetDeepDiveView`). It shows the asset's evaluation against the four fundamental crypto criteria from the existing Top-200 scan:

1. **Creștere** (Growth) — TVL / fee run-rate change.
2. **Efect de rețea** (Network Effect) — fees, TVL, multi-chain presence.
3. **Venit sustenabil** (Sustainable Revenue) — protocol revenue consistency.
4. **Valoare către holderi** (Holder Value) — burns, distributions, fee sharing.

### Architecture decisions

- **Reuses the existing cached scan**: The component calls `fetchCryptoFourCriteriaScan(false)` which hits `/api/ai/crypto-four-criteria` with the 26-hour in-memory + Firestore persistent cache (pre-warmed daily at 07:00). No new scan is triggered.
- **Safe asset lookup** (`findAssetInScan`):
  1. CoinGecko ID match (highest priority, zero ambiguity).
  2. Symbol match only if exactly one asset in the scan shares that symbol (no duplicate ticker association).
  3. Returns `null` otherwise — never guesses.
- **Non-blocking**: The component manages its own loading/error state. A network failure shows a small inline error message without blocking the rest of the AI tab.
- **Non-crypto assets**: The component returns `null` (hidden) when `marketClass` is not `'crypto'`.
- **Expand/collapse**: Compact header with score, pass count, and 4 colored criteria pills always visible. Click to expand for detailed explanations, measured values, methodology, sources with external links, and last-verified timestamp.
- **Mobile-first**: 2-column grid on mobile, 4-column on desktop; touch-friendly tap targets.

### Files changed

- `[NEW] apps/web/src/components/CryptoBusinessQualityCard.tsx` — standalone React component with `findAssetInScan` exported for testing.
- `[NEW] apps/web/src/components/crypto-business-quality-lookup.test.ts` — 9 unit tests for the lookup logic.
- `[MODIFY] apps/web/src/components/AssetDeepDiveView.tsx` — import and render the card as section 5 in the AI tab.
- `[MODIFY] apps/web/src/i18n.tsx` — 18 new RO→EN translation pairs.
- `[MODIFY] apps/web/package.json` — added `"test"` script for web workspace tests.

### Tests (9 new, 64+ total)

| Test | Description |
|------|------------|
| CoinGecko ID exact match | Finds asset by `coinGeckoId` priority |
| Unambiguous symbol | Falls back to symbol when unique |
| Duplicate/ambiguous symbol | Returns `null` for shared tickers |
| 4/4 confirmed asset | Validates score, passedCriteria, classification |
| Asset not in scan | Returns `null` for unknown assets |
| Null/undefined scan | Returns `null` (simulates network error) |
| Empty assets array | Returns `null` gracefully |
| ID priority over ambiguous symbol | CoinGecko ID wins even with duplicate symbols |
| $ prefix and mixed case | Handles `$sol` → `SOL` normalization |

### Design: status colors

| Status | Color | Label RO | Label EN |
|--------|-------|----------|----------|
| `pass` | 🟢 Emerald | Confirmat | Confirmed |
| `watch` | 🟡 Amber | De urmărit | Watch |
| `fail` | 🔴 Rose | Respins | Failed |
| `unknown` | ⬜ Slate | Date insuficiente | Insufficient Data |

Verification and deployment evidence:

```text
Source commit/image tag: d924f75
Local build: passed
Local tests: 64 passed, 0 failed (including 9 new web lookup tests)
Cloud Build: 06fa98ea-eb76-463d-8e12-75c080a4798f (SUCCESS)
Cloud Run revision: market-scanner-360-00115-pxc
Traffic: 100%
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app
Health: HTTP 200, status ok
```

## 49. Stocks Heat Map View & Scope Toggle

Implemented and deployed on 29 August 2026.

### What was added

1. **Crypto & Stocks Scope Toggle in Heat Map**:
   - Added interactive pills in the Heat Map header (`Crypto` / `Stocks`) to switch universes dynamically.
   - Preserves timeframe controls (`1D`, `1W`, `1M`) and live reload capabilities across both scopes.

2. **Stocks Universe Data Mapping**:
   - In `stocks` mode, fetches verified stock assets via `fetchScanner(timeframe, undefined, undefined, false, undefined, 'stocks')`.
   - Filters by positive market cap, sorts descending by market cap, and takes the Top 50 equities.
   - Computes weighted treemap geometry (`splitTreemap`) weighted by market capitalization ($T, $B, $M).
   - Maps timeframe performance (1D 24h change, 1W closed-candle change, 1M / YTD performance).

3. **Unified Navigation**:
   - Clicking any stock tile in the treemap opens Money Line Deep Dive with `marketClass: 'stocks'`, ensuring proper data source routing and indicator views.

4. **Bilingual Support (RO / EN)**:
   - Added translations for `Top 50 Stocks după Market Cap` / `Top 50 Stocks by Market Cap`, live builder states, and refresh actions.

## 50. Stock Business Quality · 6 Criteria & Profitability Scanner with AI Recommendations Filter

Implemented and deployed on 29 August 2026.

### What was added

1. **Stock Business Quality & Profitability Engine (`packages/shared`, `apps/api`)**:
   - Adapted the fundamental business quality paradigm for equities with 6 core pillars / criteria:
     1. **Profitabilitate & Marje (Profitability & Margins)**: Operating Margin $\ge 15\%$ and Net Margin $\ge 10\%$.
     2. **Eficiența Capitalului & Randament (Capital Efficiency - ROE & ROIC/ROA)**: $\text{ROE} \ge 15\%$ or $\text{ROA} \ge 8\%$.
     3. **Creștere Sustenabilă & Scalabilitate (Revenue & Earnings Growth)**: Revenue Growth $\ge +8\%$ YoY with expanding EPS.
     4. **Sănătate Financiară & Solvabilitate (Financial Health & Solvency)**: $\text{Debt/Equity} \le 1.2$ or Net Cash with $\text{Current Ratio} \ge 1.1$.
     5. **Free Cash Flow & Valoare pentru Acționari (FCF & Shareholder Value)**: Positive FCF ($> \$500\text{M}$ or $> 10\%$ margin) with buybacks / dividends.
     6. **Evaluare & Moat (Valuation & PEG / Moat)**: $\text{PEG Ratio} \le 2.0$ or Forward $\text{P/E} \le 25$.
   - **Deterministic AI Score (0–100)**: Evaluates composite criteria weights plus quality bonuses ($\text{Net Margin} > 25\%$, $\text{ROE} > 25\%$, $\text{FCF} > \$10\text{B}$, Net Cash).
   - **AI Verdict & Recommendations**:
     - `top-pick` (🟢 **Top AI Recomandat** / Score $\ge 80$, $\ge 5/6$ criteria pass, high margins & positive FCF).
     - `all-passed` (🌟 **Toate Criteriile Confirmate / 6/6**).
     - `high-profitability` (💰 **Marje Mari & ROE**).
     - `growth-fcf` (🚀 **Creștere & Cash Flow**).
     - `dividend-value` (🛡️ **Valoare & Dividende**).
   - Rich qualitative AI thesis generated for every stock explaining business quality, cash generation, and balance sheet safety.

2. **26-Hour Cache & Daily Scheduler Warm-up (`apps/api`)**:
   - Endpoint `/api/ai/stock-business-quality` with 26-hour in-memory cache and persistent Firestore storage (`stock-business-quality-top`).
   - Integrated into the daily 07:00 Oslo warm-up job (`/api/ai/daily-warmup`) alongside Crypto criteria and Market Intelligence reports.

3. **Stock Quality & Profitability Dashboard in AI Briefing (`AIBriefingView.tsx`)**:
   - Under `scope === 'stocks'`, added header action toggle **Calitate & Profitabilitate · Top Stocks**.
   - Summary stat cards: Scanate, Top Recomandate AI, Marje & ROE Ridicat, Creștere & FCF.
   - Interactive Filter buttons:
     - 🟢 **Top Recomandate AI**
     - 🌟 **Toate (6/6)**
     - 💰 **Marje Mari & ROE**
     - 🚀 **Creștere & FCF**
     - 🛡️ **Valoare & Dividende**
   - Real-time search by symbol or company name.
   - Rich stock cards displaying AI score badge, pass count, AI thesis callout, 6 criteria pills, and 8 key financial indicators (Net Margin %, Op Margin %, ROE %, Rev Growth YoY %, Free Cash Flow, Debt/Equity, Forward P/E, PEG).
   - Clicking any stock card navigates directly to the Asset Deep Dive view.

4. **Per-Stock Deep Dive Card (`StockBusinessQualityCard.tsx`, `AssetDeepDiveView.tsx`)**:
   - Renders inside the **Analiză AI** tab of `AssetDeepDiveView` when `marketClass === 'stocks'`.
   - Displays AI Score, AI Recommendation verdict badge, 6 colored status pills, collapsible detailed breakdown with explanations, key financial indicator tiles, AI thesis, and verified SEC EDGAR / Yahoo Finance source links.
   - Exported `findStockInScan` helper with 8 unit tests.

5. **Tests & Translations (`i18n.tsx`)**:
   - Added 25+ RO $\leftrightarrow$ EN translation pairs for all indicators, criteria, statuses, and filters.
   - 30 backend unit tests + 17 web unit tests passed (72 total across the monorepo).

Verification and deployment evidence:

```text
Source commit/image tag: e4f30c6
Local build: passed (packages/*, apps/api, apps/worker, apps/web)
Local tests: 72 passed, 0 failed (including 6 new API tests and 8 new web lookup tests)
Cloud Build: b4c90680-3bf0-4d22-9d09-71a80f4afccf (SUCCESS)
Cloud Run revision: market-scanner-360-00117-jcs
Traffic: 100%
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app
Health: HTTP 200, status ok
```

## 51. Top 50 Market Cap Ranking List & YTD Return Under Heat Map

Implemented and deployed on 29 August 2026.

### What was added

1. **Top 50 Ranking List Under Heat Map Squares (`CryptoHeatMapView.tsx`)**:
   - Added a responsive, mobile-first detailed list/table directly beneath the treemap squares for both **Crypto** and **Stocks**.
   - Displays all Top 50 assets ranked by market capitalization.

2. **Metrics & Visual Breakdown**:
   - **# Rank**: Position badge (`#1`, `#2`...).
   - **Asset Info**: Logo/avatar, ticker cashtag (`$BTC`, `$NVDA`), full asset name.
   - **Live Price**: Formatted currency with proper dynamic decimal precision.
   - **Timeframe Change %**: Interval delta (`1D`, `1W`, `1M`) with green/red directional indicators.
   - **YTD % Return**: Clear, color-coded badge (`+XX.X% YTD` in emerald, `-XX.X% YTD` in rose) for instant performance assessment.
   - **Market Cap**: Formatted total market capitalization ($T, $B, $M).
   - **Direct Navigation**: Clicking any asset or table row immediately routes to the asset's Money Line Deep Dive view (`onSelectAsset`).

3. **Mobile-First Optimization**:
   - On small screens (`< md`), renders touch-friendly cards with high-contrast typography, clear market cap and YTD badges, and full-card tap navigation.
   - On desktop (`md+`), renders a full cyber-dark tabular view with sortable columns (Rank, Price, Change %, YTD %, Market Cap) and a real-time search filter.

4. **API Integration (`apps/api/src/routes/market-routes.ts`, `apps/web/src/services/api.ts`)**:
   - Updated `/api/crypto/bubbles` to include `1y` percentage return in the CoinGecko query and map `changeYtd` to `CryptoBubbleAsset`.
   - Mapped `changeYtd` from the verified scanner records for stocks.

5. **Translations (`i18n.tsx`)**:
   - Added bilingual support for header titles, subtitle descriptions, search placeholders, and empty states.

Verification and deployment evidence:

```text
Source commit/image tag: 7dc186d
Local build: passed (packages/*, apps/api, apps/worker, apps/web)
Local tests: 78 passed, 0 failed
Cloud Build: 2901bce8-4528-489e-a05e-28aa88a7f8c5 (SUCCESS)
Cloud Run revision: market-scanner-360-00118-h2x
Traffic: 100%
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app
Health: HTTP 200, status ok
```

## 52. Crypto Heat Map Multi-Tier Fallback & Rate-Limit Resilience

Implemented and deployed on 29 August 2026.

### Problem Identified & Root Cause

When users loaded or refreshed the Crypto Heat Map, CoinGecko's unauthenticated public API occasionally returned HTTP 429 (Rate Limit Exceeded) due to Cloud Run's shared outbound IP addresses. Because `/api/crypto/bubbles` lacked an upstream fallback, the backend returned HTTP 502, leaving the frontend showing an error banner and retaining previous tab data.

### Resolution & Multi-Tier Resilience Architecture

1. **Backend Multi-Tier Fallback (`apps/api/src/routes/market-routes.ts`)**:
   - **Tier 1 (Primary)**: CoinGecko API with extended 3-minute caching (`180_000ms`).
   - **Tier 2 (Automatic Fallback on 429/Error)**: CoinPaprika API (`https://api.coinpaprika.com/v1/tickers?quotes=USD&limit=100`), mapping prices, market caps, intervals (24h, 7d, 30d, 1y).
   - **Tier 3 (Offline / Absolute Fallback)**: Binance-backed verified scanner signals from internal `AppState` (`refreshSignals('1w', 'crypto')`).
   - If any refresh attempt fails, existing cached data is preserved and served to prevent downtime.

2. **Frontend Resilient Client Fallback (`apps/web/src/components/CryptoHeatMapView.tsx`)**:
   - In `loadCoins`, if `fetchCryptoBubbles` encounters any network or parsing error, it catches it and immediately fetches crypto assets from `fetchScanner(..., 'crypto')`.
   - Clears transient error states and guarantees that switching between Crypto and Stocks always renders the correct asset universe.

Verification and deployment evidence:

```text
Source commit/image tag: 7dc186d
Local build: passed (packages/*, apps/api, apps/worker, apps/web)
Local tests: 78 passed, 0 failed
Cloud Build: f1e5308a-7e22-46a0-8c05-5a1554398216 (SUCCESS)
Cloud Run revision: market-scanner-360-00119-lth
Traffic: 100%
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app
Health: HTTP 200, status ok
```

## 53. TradingView-Style Universal Symbol Search

Implemented and deployed on 30 August 2026.

### What changed

1. **One deterministic search/ranking engine (`packages/shared/src/search/symbol-search.ts`)**:
   - Exact ticker, exchange-qualified symbol, pair, exact name and exact alias matches are ranked before prefixes, contains matches and one-character typo recovery.
   - Parses TradingView-style input such as `$NVDA`, `NASDAQ:ASML`, `BTC/USDT`, `BINANCE:BTCUSDT` and `LITUSDT.P`.
   - Search identity includes asset class, exchange, instrument type, provider symbol and CoinGecko ID. Equal text tickers are no longer collapsed into the wrong instrument.

2. **Verified provider aggregation (`GET /api/search`)**:
   - Merges the internal catalog with Binance spot, Binance perpetuals, Yahoo Finance and CoinGecko.
   - Removed the expensive weekly scanner refresh previously triggered by every search keystroke.
   - Added short provider/response caches and abortable frontend requests.
   - An unknown ticker is no longer silently invented as a stock; any direct fallback is visibly marked unverified.

3. **TradingView-like search modal (`UniversalSearchModal.tsx`)**:
   - Shows explicit exchange, instrument type and verified/direct status.
   - Preserves crypto/stock/metals/forex variants and applies strict category filters.
   - Recent tickers reopen ranked results instead of immediately guessing an asset class.
   - Responsive behavior verified at a 390 × 844 mobile viewport.

4. **Correct end-to-end routing for ambiguous tickers**:
   - The selected `marketClass` and CoinGecko identity are passed to Money Line.
   - Asset detail resolution now respects the requested class before reading the catalog.
   - Verified example: `CAKE · NASDAQ · equity` opens The Cheesecake Factory with stock candles; `CAKE · crypto` opens PancakeSwap. `LITUSDT.P` remains distinct from the `LIT` lithium ETF.

Verification and deployment evidence:

```text
Source commit/image tag: 57c2160
Local build: passed (packages/*, apps/api, apps/worker, apps/web)
API tests: 36 passed, 0 failed (6 symbol-search cases)
Live provider checks: CAKE, LITUSDT.P, BINANCE:BTCUSDT, NVDQ and PONS
Browser QA: desktop + 390x844 mobile, ambiguous stock navigation verified
Cloud Build: 6b4ff5c0-fa95-4e4b-bf97-dad4f9b4b988 (SUCCESS)
Cloud Run revision: market-scanner-360-00120-q4f
Traffic: 100%
Public bundle: assets/index-BQ-yt1JO.js
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app
Health: HTTP 200, status ok
```

## 54. Verified Recent Listings / SPCX Asset Detail Fix

Implemented and deployed on 30 August 2026.

### Root cause

`SPCX` was correctly discovered as a verified Nasdaq equity, but it is a recent listing and has fewer than ten monthly candles. Asset detail loaded all six timeframes in one `Promise.all`; rejection of the short 1M history invalidated the entire response. The frontend then rendered an empty/stale detail state with `undefined` values.

### Resolution

1. Yahoo stock history accepts two or more valid OHLCV bars for a newly listed instrument. Indicators that require longer history remain naturally unavailable until enough bars exist.
2. Candle failures are isolated per timeframe. One unavailable interval no longer invalidates the verified asset, quote or other charts.
3. Asset detail clears stale data and presents a retryable provider-error state instead of rendering `undefined` values if a full request genuinely fails.
4. `InteractiveChart` now uses the selected `marketClass`; dynamic stocks such as SPCX show `USD`, not `USDT`.

Verification and deployment evidence:

```text
Source commit/image tag: 50c47e7
Local build: passed
Market-data tests: 8 passed, 0 failed (new recent-listing regression test included)
API tests: 36 passed, 0 failed
SPCX local detail: HTTP 200, Nasdaq stock, Yahoo quote $141.50, 13 weekly candles
Mobile browser QA: $SPCX / USD present, zero "undefined" values
Cloud Build: e2826664-0030-4610-a71b-87397c339423 (SUCCESS)
Cloud Run revision: market-scanner-360-00121-p7r
Traffic: 100%
Public bundle: assets/index-BBXWdpIw.js
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app
Health: HTTP 200, status ok
```

## 55. Mobile Header Overlap Fixes

Implemented and deployed on 30 August 2026.

### What changed

1. The global mobile header now renders search as a dedicated fixed-width button. The desktop search input is hidden below the `sm` breakpoint, so its absolute icon/input layers can no longer cover the `1H` timeframe.
2. Mobile timeframe buttons share the available width and retain compact spacing while refresh, live state, alerts and language controls remain accessible.
3. The asset detail sticky header now uses separate responsive rows for asset identity/price, timeframe controls/actions and the mobile bias status. Price/change text no longer collides with the timeframe or action controls.
4. Action controls use compact mobile padding and the timeframe row shrinks safely at narrow widths.

Verification and deployment evidence:

```text
Source commit/image tag: e04fa7c
Local web build: passed
Browser QA: 390x844 mobile viewport; search button and 1H have non-overlapping bounds
Asset header QA: identity row y=92–124, timeframe row y=134–163, bias row y=171–197
Cloud Build: f8304102-e34c-4470-9809-cc78ca71c915 (SUCCESS)
Cloud Run revision: market-scanner-360-00122-x6t
Traffic: 100%
Public bundle: assets/index-BI4yyW7i.js
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app
Health: HTTP 200, status ok
```

## 56. Telegram Alert Deep-Linking & SPA Asset Routing

Implemented and deployed on 30 August 2026.

### What changed

1. **Telegram Alert & Command Deep-Links (`packages/notifications/src/asset-link.ts`)**:
   - Added `buildMoneyLineAssetUrl` and `telegramAssetLink` helper utilities in `@money-scanner/notifications`.
   - Formats URLs with `?asset=<SYMBOL>&timeframe=<TF>&marketClass=<CLASS>`.
   - Telegram notifications for bullish/bearish flips, status queries, and trending alerts now embed clickable Markdown links directly on the `$TICKER` text and in the footer action button (`[Open Money Line Chart]`).

2. **Client-Side Deep Link Query Parameter Parsing (`apps/web/src/App.tsx`)**:
   - On initial mount, `readMoneyLineDeepLink()` inspects `window.location.search`.
   - Validates symbol (`^[A-Z0-9][A-Z0-9._:-]{0,30}$`), timeframe (`1h`, `4h`, `8h`, `1d`, `1w`, `1m`), and marketClass (`crypto`, `stocks`, `metals`).
   - Automatically opens the exact asset's Money Line Deep Dive view on the requested timeframe and data source without requiring manual search or clicking.

3. **Crypto Heat Map Top 50 & Resilience (`apps/web/src/components/CryptoHeatMapView.tsx`, `apps/api/src/routes/market-routes.ts`)**:
   - Integrated Top 50 Market Cap ranking table under the treemap with live price, timeframe delta %, and YTD % return.
   - Built multi-tier fallback (CoinGecko $\to$ CoinPaprika $\to$ Binance-backed AppState) ensuring zero rate-limit downtime on Cloud Run.

Verification and deployment evidence:

```text
Source commit/image tag: 574fdc3
Local build: passed (packages/*, apps/api, apps/worker, apps/web)
Local tests: 78 passed, 0 failed (100% test pass rate)
Cloud Build: 45c7b5eb-7e8d-4455-9447-24d76ca2c3c1 (SUCCESS)
Cloud Run revision: market-scanner-360-00123-4g5
Traffic: 100%
Public bundle: assets/index-B81CrRSl.js
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app
Health: HTTP 200, status ok
```

## 57. Default AI Analysis Tab, Reordered Tab Bar & Asset Profile Knowledge Card

Implemented and deployed on 31 August 2026.

### What changed

1. **Default Active Tab & Reordered Tab Navigation (`apps/web/src/components/AssetDeepDiveView.tsx`)**:
   - Switched the default active information tab under the Money Line chart from `'mtf'` to `'ai'` (`activeInfoTab = 'ai'`).
   - Reordered tab buttons in the UI:
     1. **Analiză AI** (`ai`) — First & Default
     2. **Multi-Timeframe** (`mtf`)
     3. **Știri & Social** (`social`)

2. **Asset Profile & Overview Knowledge Engine (`packages/shared/src/constants/asset-profiles.ts`)**:
   - Built an authoritative database covering major crypto protocols (BTC, ETH, SOL, BNB, XRP, SUI, LINK, AAVE, FET, RENDER, etc.), mega-cap equities (NVDA, AAPL, MSFT, TSLA, etc.), and commodities/metals (Gold XAU, Silver XAG, Copper XCU).
   - Implemented `getAssetProfile(symbol, marketClass, category, name)` with dynamic synthesis fallback for any new/unrecognized asset.
   - Provides structured fields in both Romanian and English:
     - `headline`: Prominent one-line value proposition.
     - `whatItDoes`: Concise, informative summary of the project/company mission and technology.
     - `coreUtility`: How the token is used, product offerings, or main revenue streams.
     - `origin`: Year of launch, creators/founders, and historical milestone.
     - `ecosystem`: Blockchain / consensus model or exchange listing.
     - `keyPoints`: 3 bullet points with key strengths / competitive moats.

3. **Asset Profile UI Card (`apps/web/src/components/AssetProfileOverviewCard.tsx`)**:
   - Rendered at the very top of the **Analiză AI** tab.
   - Clean, modern layout matching the platform's cyber-terminal design language with bilingual translation integration (`useLanguage`).
   - Ensures any user clicking an asset from Weekly Flips, Scanner, Search, Heat Map, or Watchlist immediately understands what the asset is and what it does.

4. **Unit Tests & Regression Protection (`packages/shared/src/constants/asset-profiles.test.ts`)**:
   - Added 6 new unit tests verifying curated crypto/stock/metal lookups, cashtag cleaning, and dynamic fallback synthesis.
   - Total test suite: 84 passed, 0 failed.

Verification and deployment evidence:

```text
Source commit/image tag: 53cae5e
Local build: passed (packages/*, apps/api, apps/worker, apps/web)
Local tests: 84 passed, 0 failed (100% test pass rate)
Cloud Build: 74e60573-4899-41b7-b029-9355b058a37d (SUCCESS)
Cloud Run revision: market-scanner-360-00131-7sb
Traffic: 100%
Public bundle: assets/index-DrLtoZrE.js
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app
Health: HTTP 200, status ok
```

## 58. Automated Retest Alerts & Support Zone Confirmation Engine

Implemented and deployed on 31 August 2026.

### What changed

1. **Retest Alert Evaluation & State Management (`apps/api/src/services/app-state.ts`)**:
   - Upgraded `BullishCloudAlertRule` to track `lastRetestTriggeredCandle?: number`.
   - In `evaluateBullishCloudAlert`, added discrete detection for support pullbacks after an initial Bullish Flip:
     - Detects when `rule.lastWasBullish === true` and price tests the support zone (`lastCandle.low <= plan.entryHigh && lastCandle.close >= plan.stopLoss` or `price <= plan.entryHigh && price >= plan.stopLoss`).
     - Verifies `plan.action !== 'AVOID'` and prevents duplicates on the same closed candle (`lastRetestTriggeredCandle !== candleTimestamp`).
   - Automatically resets state (`lastWasBullish = false`, `lastRetestTriggeredCandle = undefined`) if the trend breaks below the Slow cloud line.

2. **Dedicated Retest Telegram Alert Format (`apps/api/src/services/app-state.ts`)**:
   - Formats dedicated Telegram notification with:
     - `🎯 RETEST CONFIRMAT ÎN ZONA DE INTRARE`
     - `*▲ PLAN TEHNIC LONG (RETEST) — <TIMEFRAME>*`
     - `Acțiune: 🟢 SETUP VALID — intrare optimă activată la retest`
     - `Calitate setup: <score>/100 ⭐`
     - Initial flip close vs Retest price delta %.
     - Exact support bounds tested (`entryLow` – `entryHigh`), suggested entry, Stop Loss, TP1 (1.5R), TP2 (3.0R), and risk %.

3. **Unit Tests & Regression Suite (`apps/api/src/services/daily-regime-scan.test.ts`)**:
   - Added unit test simulating an initial Bullish Flip followed by a subsequent candle pulling back to `entryLow`/`suggestedEntry`, confirming that both the initial flip and the subsequent retest alert are dispatched sequentially without duplication.
   - Total test suite: 85 passed, 0 failed.

Verification and deployment evidence:

```text
Source commit/image tag: 53cae5e
Local build: passed (packages/*, apps/api, apps/worker, apps/web)
Local tests: 85 passed, 0 failed (100% test pass rate)
Cloud Build: f737aa7c-b910-478e-990d-27b8cb0e1072 (SUCCESS)
Cloud Run revision: market-scanner-360-00132-t97
Traffic: 100%
Public bundle: assets/index-DrLtoZrE.js
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app
Health: HTTP 200, status ok
```

## 59. Progressive Take-Profit Architecture & TP3 (Macro Expansion / Runner Target)

Implemented and deployed on 31 August 2026.

### What changed

1. **Trade Plan Engine TP3 Calibration (`packages/money-line/src/trade-plan.ts`)**:
   - Added `target3?: number` and `target3RiskReward?: number` to `BullishTradePlan` and `AlertTradePlanSnapshot`.
   - Formulated timeframe-specific macro expansion targets:
     - `1w`: $\max(\text{entry} + \text{risk} \times 5.5\text{R}, \text{entry} \times 1.50)$ ensuring minimum $+50\%$ macro runner target for crypto weekly flips.
     - `1d`: $\text{entry} + \text{risk} \times 4.5\text{R}$.
     - `4h` / `8h`: $\text{entry} + \text{risk} \times 3.5\text{R}$.
     - `1h` / `1m`: $\text{entry} + \text{risk} \times 2.5\text{R}$.

2. **Telegram Alert Template & Snapshot Engine (`apps/api/src/services/app-state.ts`)**:
   - Updated both `BULLISH FLIP CONFIRMAT` and `RETEST CONFIRMAT ÎN ZONA DE INTRARE` Telegram alert messages to render the full 3-tier progressive take-profit roadmap:
     - `Ținta 1 (1.5R — De-risk): $X.XX (+Y.YY%)`
     - `Ținta 2 (3.0R — Swing): $X.XX (+Y.YY%)`
     - `Ținta 3 (5.5R / Macro — Runner / +50%+): $X.XX (+Y.YY%)`
   - Stored `target3` and `target3RiskReward` in `DispatchedAlert.tradePlan` snapshots.

3. **Unit Tests & Regression Suite (`packages/money-line/src/trade-plan.test.ts`)**:
   - Updated test suite to verify `target3 > target2 > target1 > suggestedEntry`.
   - Total test suite: 85 passed, 0 failed.

Verification and deployment evidence:

```text
Source commit/image tag: 53cae5e
Local build: passed (packages/*, apps/api, apps/worker, apps/web)
Local tests: 85 passed, 0 failed (100% test pass rate)
Cloud Build: 5dce8ac0-a992-41d7-be24-c6e1a2c55b59 (SUCCESS)
Cloud Run revision: market-scanner-360-00133-rzp
Traffic: 100%
Public bundle: assets/index-DrLtoZrE.js
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app
Health: HTTP 200, status ok
```

## 60. Confirmation Price vs Current Price & Move Tracking on Web & Telegram

Implemented and deployed on 31 August 2026.

### What changed

1. **Web Confirmed Flip Cards (`apps/web/src/components/AlertsCenterView.tsx`)**:
   - In `ConfirmedFlipCard` (under *Top 10 alerte de trading confirmate*), upgraded the layout to explicitly render both:
     - `Închidere flip`: exact close price of the candle that triggered the flip (`confirmationPrice`).
     - `Preț actual`: live market price (`candidate.currentPrice`).
     - `Față de flip`: exact delta percentage with green/red badge (`moveFromFlipLabel`).
   - Added a header tag indicating `+X.XX% de la flip` for rapid visual appraisal.
   - Expanded the responsive metrics grid to 6 columns: `[Închidere flip, Preț actual, Față de flip, Scor setup, ML 1W, RVOL]`.

2. **Telegram Alerts & Scans**:
   - Confirmed both individual transition alerts and periodic/scan broadcast messages prominently feature `Închidere flip: $X.XX → Preț acum: $Y.YY (+Z.ZZ% față de flip)` and `Distanță față de flip`.

3. **Unit Tests & Monorepo Build**:
   - Built and tested all workspace packages and apps (85 tests passing, 0 failing).

Verification and deployment evidence:

```text
Source commit/image tag: 53cae5e
Local build: passed (packages/*, apps/api, apps/worker, apps/web)
Local tests: 85 passed, 0 failed (100% test pass rate)
Cloud Build: 802a3b67-ce4b-4ed6-b3ea-51d470a2ce70 (SUCCESS)
Cloud Run revision: market-scanner-360-00136-zk2
Traffic: 100%
Public bundle: assets/index-D5e8lqF-.js
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app
Health: HTTP 200, status ok
```

## 61. Daily 08:00 AM Scan & Exclusive 1W Flip / Retest Telegram Notifications

Implemented and deployed on 31 August 2026.

### What changed

1. **Daily Scheduled Flip Scan at 08:00 AM Europe/Bucharest (`apps/api/src/services/app-state.ts`, Cloud Scheduler)**:
   - Updated Cloud Scheduler job `money-scanner-daily-regime-scan` in `europe-west3` to run daily at `0 8 * * *` with `--time-zone="Europe/Bucharest"`.
   - Updated `DailyRegimeScanStatus` in `app-state.ts` to reflect `schedule: '0 8 * * *'` and `timezone: 'Europe/Bucharest'`.
   - Added in-process daily 08:00 AM Europe/Bucharest trigger fallback in `startBullishAlertMonitor` to execute `runDailyRegimeScan()` automatically across all assets (Crypto Top 50, Stocks, Metals).

2. **Exclusive Telegram Notification Filter (`apps/api/src/services/app-state.ts`)**:
   - In `getTelegramFlipAlertPreferences`: updated default subscription timeframes to `['1w']` (Weekly only).
   - In `evaluateBullishCloudAlert`: enforced `shouldSendTelegram = (isInitialFlip && rule.timeframe === '1w') || isRetestAlert`. All other lower-timeframe initial transitions remain recorded in the web dashboard without triggering Telegram notifications.
   - In `publishConfirmedFlipEvents`: daily broadcast defaults to delivering confirmed `1W` flips exclusively.

3. **Unit Tests & Regression Suite (`apps/api/src/services/daily-regime-scan.test.ts`)**:
   - Verified that 1W flips and Retest alerts are delivered sequentially while lower timeframe initial noise is suppressed.
   - Total test suite: 85 passed, 0 failed.

Verification and deployment evidence:

```text
Source commit/image tag: 53cae5e
Local build: passed (packages/*, apps/api, apps/worker, apps/web)
Local tests: 85 passed, 0 failed (100% test pass rate)
Cloud Build: f36ed013-0ebe-49bf-89b6-35fc63e2e17b (SUCCESS)
Cloud Run revision: market-scanner-360-00137-25z
Traffic: 100%
Public bundle: assets/index-D5e8lqF-.js
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app
Health: HTTP 200, status ok
```

## 62. Collapsible Sections (Alerts & Alpha Narratives) & Reordered Alerts Center

Implemented and deployed on 01 September 2026.

### What changed

1. **Reordered Alerts Center (`apps/web/src/components/AlertsCenterView.tsx`)**:
   - Reordered sections so that **Top 10 alerte de trading confirmate** is displayed as the first/top section in the Alerts page.
   - Updated summary cards, filter tabs (`CONFIRMED`, `STRATEGIES`, `FLIPS`, `WATCHED`), and layout sequence:
     1. `Top 10 alerte de trading confirmate` (Top position)
     2. `Strategii de Trading (Weekly Trend + Donchian 55/20 LONG)`
     3. `Top 10 aproape de flip`
     4. `Tracked Alerts (Alerte urmărite)`

2. **Collapsible Section Controls (`apps/web/src/components/AlertsCenterView.tsx`)**:
   - Added collapsible chevron arrow toggle buttons to all 4 sections in the Alerts Command Center.
   - Smooth `-rotate-90` animation on collapse with live counter badges for active items.
   - Designed for mobile convenience to easily minimize/expand sections on small screens.

3. **Collapsible Alpha Narratives & Sectors (`apps/web/src/components/NarrativeBar.tsx`)**:
   - Added interactive chevron arrow toggle button to the **Alpha Narratives & Sectors** section header on the main Market 360 page.
   - Allows collapsing and expanding the grid of narrative/sector cards on mobile and desktop.

4. **Unit Tests & Regression Suite**:
   - All 85 automated tests pass cleanly across all packages and apps.

Verification and deployment evidence:

```text
Source commit/image tag: 53cae5e
Local build: passed (packages/*, apps/api, apps/worker, apps/web)
Local tests: 85 passed, 0 failed (100% test pass rate)
Cloud Build: dfce4a38-90f3-4f94-8a70-734cd4b7f6b3 (SUCCESS)
Cloud Run revision: market-scanner-360-00138-4sh
Traffic: 100%
Public bundle: assets/index-Bsh43Wls.js
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app
Health: HTTP 200, status ok
```

## 63. Repositioning AI Analyst Next to Market 360° Navigation

Implemented and deployed on 01 September 2026.

### What changed

1. **Sidebar and Mobile Navigation Order (`apps/web/src/components/Sidebar.tsx`)**:
   - Reordered `navItems` array so that **AI Analyst** (`BrainCircuit` icon, purple accent) is positioned directly next to **Market Intelligence / Market 360°** (position #2).
   - This takes effect seamlessly across both the desktop sidebar navigation and the horizontally scrollable mobile bottom navigation bar.

2. **Unit Tests & Regression Suite**:
   - All 85 automated tests pass cleanly across all packages and apps.

Verification and deployment evidence:

```text
Source commit/image tag: 53cae5e
Local build: passed (packages/*, apps/api, apps/worker, apps/web)
Local tests: 85 passed, 0 failed (100% test pass rate)
Cloud Build: 3ccc5bae-afce-4f2f-8606-fe63e7ccae2a (SUCCESS)
Cloud Run revision: market-scanner-360-00139-gwd
Traffic: 100%
Public bundle: assets/index-BNQ_5r-u.js
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app
Health: HTTP 200, status ok
```

## 64. Market Heat Map: Repositioning Next to AI Analyst & Multi-Scope Expansion (Top 150 Crypto, Top 100 Stocks, Top 50 Metals)

Implemented and deployed on 01 September 2026.

### What changed

1. **Navigation Repositioning (`apps/web/src/components/Sidebar.tsx`)**:
   - Reordered `navItems` so that **Market Heat Map** (`LayoutGrid` icon, emerald accent) is positioned directly next to **AI Analyst** (position #3 in sidebar and mobile navigation).
   - Order: `Market 360°` -> `AI Analyst` -> `Heat Map` -> `Crypto Bubble` -> `USA Macro` -> `X Trends` -> `News Feed` -> `Backtest` -> `Status`.

2. **Heat Map Scope Expansion (`apps/web/src/components/CryptoHeatMapView.tsx`)**:
   - Expanded `HeatMapScope` from `crypto | stocks` to `crypto | stocks | metals`.
   - **Crypto (Top 150)**: Fetches up to 150 live cryptocurrencies from CoinGecko / CoinPaprika with real-time prices, percentage returns, and market cap weighting.
   - **Stocks (Top 100)**: Fetches and displays Top 100 real stocks sorted by market capitalization.
   - **Metals & Mărfuri (Top 50)**: Fetches all available real precious metals and commodities (up to 50 / 44 active catalog instruments).
   - Updated scope toggle pills with dedicated active colors (Cyan for Crypto, Blue for Stocks, Amber for Metals).
   - Enhanced search filter, sortable column headers, treemap squarify layout, and mobile cards.

3. **Backend Upstream Crypto Bubbles Endpoint (`apps/api/src/routes/market-routes.ts`)**:
   - Upgraded `/crypto/bubbles` to fetch `per_page=150` from CoinGecko and `limit=150` from CoinPaprika with fallback slicing up to 150 assets.

4. **Unit Tests & Regression Suite**:
   - All 85 automated tests pass cleanly across all packages and apps.

Verification and deployment evidence:

```text
Source commit/image tag: 53cae5e
Local build: passed (packages/*, apps/api, apps/worker, apps/web)
Local tests: 85 passed, 0 failed (100% test pass rate)
Cloud Build: 4e89d2c5-ada5-470f-898c-a6d22297ba52 (SUCCESS)
Cloud Run revision: market-scanner-360-00140-xh5
Traffic: 100%
Public bundle: assets/index-CFvVwFsp.js
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app
Health: HTTP 200, status ok
```

## 65. Collapsible Market Intelligence Briefing & Renaming AI Analyst to AI Briefing

Implemented and deployed on 01 September 2026.

### What changed

1. **Renamed "AI Analyst" to "AI Briefing"**:
   - Updated navigation in `apps/web/src/components/Sidebar.tsx` (`label: 'AI Briefing'`, `shortLabel: 'AI Briefing'`).
   - Updated view headers, sidebar branding logo, and chat headers in `apps/web/src/components/AIBriefingView.tsx`.
   - Updated welcome initial conversational prompt to refer to "AI Briefing".
   - Updated meta description in `apps/web/index.html`.

2. **Collapsible Market Intelligence Briefing (`apps/web/src/components/AIBriefingView.tsx`)**:
   - Added interactive chevron arrow toggle button (`ChevronDown` with smooth `-rotate-90` animation when collapsed) directly on the **Market Intelligence Briefing** header.
   - Allows collapsing and expanding the macro intelligence dashboard and criteria scanners so users can easily minimize the report to focus directly on interactive Q&A or criteria screening.

3. **Unit Tests & Regression Suite**:
   - All 85 automated tests pass cleanly across all packages and apps.

Verification and deployment evidence:

```text
Source commit/image tag: 53cae5e
Local build: passed (packages/*, apps/api, apps/worker, apps/web)
Local tests: 85 passed, 0 failed (100% test pass rate)
Cloud Build: c7e54132-9cc5-417a-a8f2-5fe15b149b37 (SUCCESS)
Cloud Run revision: market-scanner-360-00141-9lr
Traffic: 100%
Public bundle: assets/index-C8n_E1T4.js
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app
Health: HTTP 200, status ok
```

## 66. Independent & Separated Collapsible Crypto Business Quality Scanner

Implemented and deployed on 01 September 2026.

### What changed

1. **Separated Crypto Business Quality Scanner (`apps/web/src/components/AIBriefingView.tsx`)**:
   - Decoupled `renderCryptoCriteriaScanner()` and `renderStockCriteriaScanner()` from the Market Intelligence Briefing section.
   - Added dedicated state `isCryptoQualityCollapsed` and `isStockQualityCollapsed`.
   - Added an interactive chevron toggle button (`ChevronDown` with smooth `-rotate-90` animation) to the **Crypto Business Quality · 4 Criterii de Selecție** header and **Stock Business Quality** header.
   - Restructured the view container so each component collapses and expands completely independently of Market Intelligence Briefing.

2. **Unit Tests & Regression Suite**:
   - All 85 automated tests pass cleanly across all packages and apps (100% pass rate).

Verification and deployment evidence:

```text
Source commit/image tag: 53cae5e
Local build: passed (packages/*, apps/api, apps/worker, apps/web)
Local tests: 85 passed, 0 failed (100% test pass rate)
Cloud Build: f5a6fa9d-8459-494f-897c-5814923e8f44 (SUCCESS)
Cloud Run revision: market-scanner-360-00142-nj4
Traffic: 100%
Public bundle: assets/index-DHwYIXXt.js
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app
Health: HTTP 200, status ok
```

## 67. Complete MoneyLine Flip-Regime History

Implemented and deployed on 02 September 2026.

### What changed

1. **Historical regime discovery (`apps/api/src/services/app-state.ts`)**:
   - Every full or quick flip scan now finds the most recent confirmed transition for each asset on 4H, 8H, 1D and 1W, even when it occurred before the latest candle.
   - Upcoming candidates remain separate from historical confirmations, so the expanded dashboard history cannot send retroactive Telegram notifications.
   - Only the latest closed-candle flip remains eligible for a new Telegram event.
   - The stored history retains the latest regime transition for up to 1,000 asset/timeframe combinations.

2. **Accurate flip context and current prices**:
   - `confirmedAt` is the real close time of the candle that confirmed the flip.
   - Cards and Telegram scan results show the flip-close price, current quote, percentage move since the flip and elapsed time.
   - Current quotes are refreshed once per unique asset and shared across its timeframe records.

3. **Complete confirmed-flip UI (`apps/web/src/components/AlertsCenterView.tsx`)**:
   - Removed the 4H/8H/1D/1W age windows and the artificial Top-10 truncation.
   - `Bullish + 1W` and `Bearish + 1W` now expose every available asset whose latest Weekly transition has that direction, ordered newest-first.
   - The card displays both relative age and the exact confirmation date.

Verification and deployment evidence:

```text
Source commits/image tags: 3bfc7d9, 9d8b781
Local build: passed (packages/*, apps/api, apps/worker, apps/web)
Local tests: 85 passed, 0 failed (100% test pass rate)
Cloud Build: 4952f4e5-ae7a-41e8-9ba3-5dbdeac59f64 (SUCCESS)
Cloud Run revision: market-scanner-360-00144-xkr
Traffic: 100%
Public bundle: assets/index-CfUOaVp3.js
Full production scan: 177 assets, 0 errors
Persisted flip regimes: 693 total; 162 Weekly (97 bullish, 65 bearish)
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app
Health: HTTP 200, status ok
```

## 68. Full Asset Names on Confirmed Flips & Alert Cards

Implemented on 03 September 2026.

- Added full company and token names to confirmed MoneyLine flips, upcoming candidates, strategy setups, and active alerts.
- In `apps/api/src/services/app-state.ts`:
  - Enriched `FlipCandidate` with `name?: string` resolved from `TRADING_360_ASSETS`.
  - Telegram flip broadcasts now include both symbol and company/token name (e.g. `$CVX Chevron Corp`).
- In `apps/web/src/components/AlertsCenterView.tsx`:
  - Added `getAssetName(symbol, candidateName?, knownAssets?)` helper backed by `catalogNameBySymbol` and `knownAssets`.
  - All cards (`ConfirmedFlipCard`, `FlipCandidateCard`, `StrategySetupCard`, `ActiveAlertCard`) display the full asset name alongside the ticker.
  - Search filter enables searching by either symbol or full company/token name.
- Unit tests added in `apps/web/src/components/alerts-asset-name.test.ts`.

## 69. Market Cap Value & Market Cap Rank in Asset Header

Implemented and deployed on 03 September 2026.

### What changed

1. **Market Cap Value in Asset Header (`apps/web/src/components/AssetDeepDiveView.tsx`)**:
   - Next to the MoneyLine regime / bias badge (`[• Bullish +68.6]`), exactly in the location indicated by the user, added a badge displaying the asset's real Market Cap (e.g. `MCap: $9.50B` for ESTC, `$3.42T` for AAPL, `$3.15T` for NVDA).
   - On mobile viewports, the badge neatly renders inside the identity row without causing line wraps or horizontal scroll.

2. **Market Cap Rank Number next to Ticker (`apps/web/src/components/AssetDeepDiveView.tsx`, `AssetDetailModal.tsx`)**:
   - In front of / next to the ticker symbol (e.g. `[#114] $ESTC Elastic N.V.`), added a prominent badge indicating the asset's position in a ranking by market cap.
   - For stocks, ranks are computed deterministically from `TRADING_360_ASSETS` sorted by market cap descending (Mega-caps: #1 AAPL, #2 MSFT, #3 NVDA; ESTC: #114).
   - For crypto, ranks reflect CoinGecko / Binance worldwide market cap rank (#1 BTC, #2 ETH, #5 SOL).
   - Supports dynamic rank estimation for unlisted or newly discovered assets when `marketCap` is provided.

3. **Asset Detail Modal Consistency (`apps/web/src/components/AssetDetailModal.tsx`)**:
   - Updated modal header to also present `Rank #{marketCapRank}` and `MCap: {formatMarketCap(effectiveMarketCap)}`.

Verification and deployment evidence:

```text
Source commit/image tag: 4b87bf7
Local build: passed (packages/*, apps/api, apps/worker, apps/web)
Local tests: 93 passed, 0 failed (100% test pass rate)
Cloud Build: ab9956e0-af35-497b-9b69-ad1d88103a53 (SUCCESS)
Cloud Run revision: market-scanner-360-00146-2gh
Traffic: 100%
Public bundle: assets/index-smbWYipl.js
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app
Health: HTTP 200, status ok
```

## 70. Market Class Filtering for Confirmed Money Line Flips

Implemented and deployed on 03 September 2026.

### What changed

1. **Market Class Filter Controls (`apps/web/src/components/AlertsCenterView.tsx`)**:
   - Added market class filter buttons to the Confirmed Money Line Flips control panel:
     - `Toate` (`ALL`): displays both crypto and stock confirmed flips without restriction.
     - `Crypto` (`crypto`): filters strictly to candidates where `candidate.marketClass === 'crypto'`.
     - `Stocks` (`stocks`): filters strictly to candidates where `candidate.marketClass === 'stocks'`.
   - The filter combines seamlessly with direction (`ALL` / `BULLISH` / `BEARISH`), timeframe (`ALL` / `4h` / `8h` / `1d` / `1w`), and search query.

2. **Cyber-Glass UI & Mobile Responsiveness (`apps/web/src/components/AlertsCenterView.tsx`)**:
   - Filter pills positioned directly under the direction filter buttons in the control header.
   - Cyber-glass pill styling with dedicated active tones: Cyan for Crypto (`bg-cyan-500/15 text-cyan-300`), Blue for Stocks (`bg-blue-500/15 text-blue-300`), Violet for Toate (`bg-violet-500/15 text-violet-200`).
   - Mobile-responsive `flex flex-wrap gap-1` layout with `min-w-16 flex-1` ensuring clean 3-way distribution on desktop and fluid wrapping without overflow on small screens.

3. **Isolated Pure Filter Logic (`filterConfirmedFlips`) & Automated Test Suite**:
   - Extracted `filterConfirmedFlips` pure filtering helper with multi-dimensional criteria handling (marketClass, direction, timeframe, text search, deduplication per asset).
   - Added automated unit test suite (`apps/web/src/components/alerts-confirmed-market-class.test.ts`) verifying:
     - Crypto isolation (`marketClass === 'crypto'`)
     - Stocks isolation (`marketClass === 'stocks'`)
     - Unrestricted multi-class viewing (`ALL` / `Toate`)
     - Direction combination (`BULLISH` / `BEARISH` across asset classes)
     - Simultaneous multi-dimensional filtering (`BULLISH` + `1w` + `stocks`)
     - Search text combination across asset classes
     - Per-asset timeframe deduplication
     - Empty inputs and unmatched filter graceful handling
   - Monorepo test suite expanded from 93 to 102 passing tests (100% pass rate).

Verification and deployment evidence:

```text
Source commit/image tag: b7f2098
Local build: passed (packages/*, apps/api, apps/worker, apps/web)
Local tests: 102 passed, 0 failed (100% test pass rate)
Cloud Build: b17787dd-5ed3-4b77-b09b-b24214895d94 (SUCCESS)
Cloud Run revision: market-scanner-360-00147-4fd
Traffic: 100%
Public bundle: assets/index-8gg8krDi.js
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app
Health: HTTP 200, status ok
## 71. Market Class Filtering for Top 10 Aproape de Flip

Implemented and deployed on 03 September 2026.

### What changed

1. **Market Class Filter Controls for Candidate Flips (`apps/web/src/components/AlertsCenterView.tsx`)**:
   - Added market class filter buttons to the „Top 10 aproape de flip” control panel:
     - `Toate` (`ALL`): displays both crypto and stock candidates approaching a flip.
     - `Crypto` (`crypto`): filters strictly to candidates where `candidate.marketClass === 'crypto'`.
     - `Stocks` (`stocks`): filters strictly to candidates where `candidate.marketClass === 'stocks'`.
   - The filter combines seamlessly with direction (`ALL` / `BULLISH` / `BEARISH`), timeframe (`ALL` / `4h` / `8h` / `1d` / `1w`), and search query.

2. **Cyber-Glass UI & Mobile Responsiveness (`apps/web/src/components/AlertsCenterView.tsx`)**:
   - Positioned cleanly between direction and timeframe filter rows.
   - Matches the confirmed flips styling with dedicated active tones: Cyan for Crypto (`bg-cyan-500/15 text-cyan-300`), Blue for Stocks (`bg-blue-500/15 text-blue-300`), Violet for Toate (`bg-violet-500/15 text-violet-200`).
   - Mobile-responsive layout ensuring fluid wrapping on small screens.

3. **Pure Filter Logic (`filterFlipCandidates`) & Automated Unit Tests**:
   - Extracted `filterFlipCandidates` pure filtering helper with full multi-dimensional criteria handling.
   - Added automated unit test suite (`apps/web/src/components/alerts-candidate-market-class.test.ts`) verifying:
     - Crypto isolation (`marketClass === 'crypto'`)
     - Stocks isolation (`marketClass === 'stocks'`)
     - Unrestricted multi-class viewing (`ALL` / `Toate`)
     - Direction combination (`stocks` + `BULLISH`)
     - Timeframe combination (`crypto` + `1w`)
     - Search text combination across asset classes
     - Safety on undefined and empty candidate arrays
   - Monorepo test suite expanded to 110 passing tests (100% pass rate).

Verification and deployment evidence:

```text
Source commit/image tag: a40fdeb
Local build: passed (packages/*, apps/api, apps/worker, apps/web)
Local tests: 110 passed, 0 failed (100% test pass rate)
Cloud Build: 885c576c-a7db-4554-8d81-72a426515465 (SUCCESS)
Cloud Run revision: market-scanner-360-00148-6l9
Traffic: 100%
Public bundle: assets/index-ClxS58Ss.js
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app
Health: HTTP 200, status ok
```



## 72. Crypto Bubble — 24h Gainers and Top 100 Ranking

Implemented and deployed on 03 September 2026.

- Crypto Bubble now requests the 24h timeframe and ranks the available source universe by signed percentage change before selecting the first 100 coins. The existing upstream universe is unchanged (normally 150 major coins by capitalization); its actual count is shown in the table description.
- Bubble area has a readable baseline plus a component proportional to positive daily gain. Losses, zero and missing values retain the baseline size. Market cap does not influence bubble size. Layout expands to fit all 100 without overlap or per-coin shrinking.
- Added the matching top 100 table underneath, descending by 24h change, with rank, coin, percentage, known catalog category, price and market cap. Missing/invalid percentages sort last. Both bubbles and coin buttons open asset analysis.
- Responsive layout, explicit empty state and retained previous rows with an error message when refresh fails.

Verification and deployment evidence:

```text
Source commit/image tag: ffb5631
Local frontend production build: passed
Frontend tests: 48 passed, 0 failed (including 6 new ranking/layout tests)
Playwright component fixture: passed (100 bubbles/rows, descending sort, 24h request,
  asset selection, desktop/mobile overflow, refresh failure and empty response)
Visual checks: desktop bubbles, table, mobile
Cloud Build: 92d37735-6ec3-44e4-8c9f-2069b284b17e (SUCCESS; full monorepo build)
Cloud Run revision: market-scanner-360-00149-xwz
Traffic: 100%
Public bundle: assets/index-ZuFMPzUe.js (HTTP 200; updated UI strings verified)
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app
Health: HTTP 200, status ok
```

## 73. Telegram Scan Results — Full Name + Type Next to Ticker

Implemented and deployed on 04 September 2026.

- Rezultatele scanarilor live Telegram (`/scan` semnale + flipuri) afiseaza acum pe langa ticker si denumirea completa plus tipul assetului, ex: `$NVDA (NVIDIA Corp) · STOCKS`, `$BTC (Bitcoin) · CRYPTO` — pentru identificare usoara.
- Broadcast-ul de flipuri confirmate afisa deja `(Name)` + `MARKETCLASS`; a fost pastrat si aliniat ca format cu scanarile live.
- Numele este propagat din catalog (`TRADING_360_ASSETS`, match pe symbol + marketClass cu fallback pe symbol) in `scanTelegramMoneyLine` (semnale) si `calculateFlipCandidate` (flipuri); tipurile `TelegramLiveScanInput` / `TelegramMoneyLineScanResult` accepta `name?`.
- Daca numele lipseste din catalog, mesajul afiseaza doar ticker + tip, fara paranteze goale.

Verification and deployment evidence:

```text
Source commit/image tag: 4a5a8aa
Local tests: 139 passed, 0 failed (inclusiv asertiile noi: (Ethereum), (NVIDIA Corp), CRYPTO, STOCKS)
Local build: passed (packages/*, apps/api, apps/worker, apps/web; bundle assets/index-CkZ7gog6.js)
Cloud Build: bae13dcf-e9c4-4f03-96aa-ff08758f4e0c (SUCCESS)
Cloud Run revision: market-scanner-360-00153-td9
Traffic: 100%
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app
Health: HTTP 200, status ok
```

## 74. Telegram 1W — Trimite Ultimul Flip Inregistrat (Nou sau Vechi)

Implemented and deployed on 04 September 2026 (via `/boost`: strategie → DeepCoder → verificare proprie).

- Problema: botul trimitea doar flipurile NOU confirmate (flip exact pe ultima lumanare inchisa, o singura data fiecare); flipurile 1W mai vechi ajungeau doar in dashboard.
- Acum ambele cai de broadcast (`manual quick scan` + `scheduled/full scan`) publica `[...newlyConfirmed, ...confirmedHistory.filter(1w)]`: ultimul flip 1W inregistrat per asset, nou sau vechi, ca pe site. Strict 1w — celelalte timeframe-uri raman neschimbate.
- Anti-spam: filtrul `fresh` (idempotency key) garanteaza livrare o-singura-data — backfill o data la primul run, apoi doar noutati; plus dedup intra-batch in `publishConfirmedFlipEvents`.
- Mesajele vechi sunt recognoscibile prin linia existenta `*Confirmat:* acum X zile`.

Verification and deployment evidence:

```text
Source commit/image tag: 3117416
Local tests: 142 passed, 0 failed (49/49 apps/api, inclusiv 3 teste noi: backfill 1w o data, idempotenta, excludere non-1w)
Local build: passed (packages/*, apps/api, apps/worker, apps/web)
Cloud Build: a9d091b3-0385-41c3-8b2d-f5883b8f28eb (SUCCESS)
Cloud Run revision: market-scanner-360-00154-jwj
Traffic: 100%
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app
Health: HTTP 200, status ok
```

## 75. Crypto Bubble — Deep-Dive pentru monede fără Binance (PONS)

Implemented and deployed on 04 September 2026.

- Cauza confirmată: Bubbles obținea PONS de la CoinGecko, dar deep-dive-ul încerca exclusiv perechea `PONSUSDT` la Binance; Binance răspunde `Invalid symbol`.
- Bubbles propagă acum ID-ul și furnizorul exact (CoinGecko/CoinPaprika). API-ul validează ID + ticker + nume înainte de a deschide profilul, evitând coliziunile de ticker.
- Pentru activele fără OHLCV pe exchange, pagina arată cotația, capitalizarea, volumul, high/low 24h și istoricul real de preț disponibil de la agregator. Nu fabrică lumânări, Money Line, flipuri sau recomandări AI.
- Datele lipsă sunt afișate ca indisponibile, iar cache-ul păstrează timestampul furnizorului și marchează explicit datele stale.
- Activele suportate pe exchange (testat BTC) păstrează traseul OHLCV și Money Line existent.

Verification and deployment evidence:

```text
Source commit/image tag: e4f8876
Local tests: 154 passed, 0 failed (12 tests noi API + UI)
Local full monorepo build: passed
Live provider test: PONS quote + 721 price points, 0 synthetic candles, null signal
Cloud Build: f5fa8519-096e-40fb-867c-a0f78499cdc8 (SUCCESS)
Cloud Run revision: market-scanner-360-00155-zmb
Traffic: 100%
Revision conditions: Ready=True, Active=True, ContainerHealthy=True
## 76. DEX OHLCV & Money Line Resolution for Tokens like Akedo ($AKE)

Implemented and deployed on 05 September 2026.

### What changed

1. **On-Chain Token Name Matching in `selectExactMostLiquidPair` (`apps/api/src/services/dex-market-data.ts`)**:
   - Fixed bug where verified DEX pools were discarded because on-chain contract bytecode names were set to the token's ticker (e.g. `name: "AKE"`, `symbol: "AKE"` on PancakeSwap V3 BSC pool `0x4D3bF29Ba30f8Bfe4624e7678709afA195689c5D`), while CoinGecko profile name was `"Akedo"`.
   - `selectExactMostLiquidPair` now validates that `baseToken.name` matches either `profile.name` or `profile.symbol` alongside verified contract address, chain ID, pair address and URL validation. This successfully unlocks PancakeSwap V3's **$2.32M USD liquidity** and **$48M+ 24h volume** pool.

2. **Timeframe-Aware Minimum Candle Threshold (`apps/api/src/services/crypto-market-profile.ts`)**:
   - Replaced hardcoded `>= 210` closed candles threshold with timeframe-dependent gating: `timeframe === '1w' ? 15 : (timeframe === '1d' ? 30 : 210)`.
   - On Weekly (`1w`), tokens with 15+ closed weekly candles (Akedo has 26 closed weekly candles from GeckoTerminal) now calculate a verified Money Line signal (`tier: 'Bullish'`, `score: +25.6`).

3. **Enhanced DEX View UI (`apps/web/src/components/CryptoMarketOnlyView.tsx`)**:
   - Added interactive timeframe pills (`1H`, `4H`, `8H`, `1D`, `1W`) allowing users to inspect different candle intervals for DEX assets.
   - Added Money Line bias badge right next to the price (`[● Money Line: Bullish +25.6]`).
   - Dynamic threshold messaging reflecting the exact minimum candles for the active timeframe.
   - Wired `onTimeframeChange` through `AssetDeepDiveView.tsx`.

4. **Automated Unit Tests**:
   - `apps/api/src/services/dex-market-data.test.ts`: Added test verifying acceptance of on-chain token name matching profile symbol.
   - `apps/api/src/services/crypto-market-profile.test.ts`: Added test verifying 1w Money Line calculation with 15+ closed candles.
   - `apps/web/src/components/crypto-market-only.test.ts`: Updated 1w threshold test and added active Money Line signal badge test.
   - Monorepo test suite passes with 137 passing tests (0 failures).

Verification and deployment evidence:

```text
Source commit/image tag: d4b8d6d
Local tests: 137 passed, 0 failed (100% test pass rate)
Local build: passed (packages/*, apps/api, apps/worker, apps/web)
Cloud Build: 23dcdbea-7cc1-4eba-aaba-212bb6c0e623 (SUCCESS)
Cloud Run revision: market-scanner-360-00157-fql
Traffic: 100%
Revision conditions: Ready=True, Active=True, ContainerHealthy=True
Public bundle: assets/index-CNdYlZwI.js
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app
Cloud Run health: HTTP 200, status ok
```

## 77. Web — Selectia Filtrelor Supravietuieste la Back din Grafic (Keep-Alive Taburi)

Implemented and deployed on 05 September 2026.

- Problema (raport mobil): din Alerte → Confirmed Flips (ex. BULLISH + Crypto + 1W), la deschiderea unui asset si back, selectia se reseta pe default si pagina refetch-uia cu asteptare.
- Cauza: `App.tsx` randa conditional `{selectedAssetSymbol ? <AssetDeepDiveView/> : <tab-uri/>}` — deschiderea graficului demonta tot arborele tab-urilor (inclusiv `AlertsCenterView` cu toate `useState`-urile de filtre).
- Fix (`apps/web/src/App.tsx`, 8+/5-): view-urile de tab raman montate permanent, ascunse cu `hidden` cand e deschis un asset; `display: contents` pastreaza layout-ul identic cand sunt vizibile. La back: aceeasi selectie, acelasi scroll, datele deja incarcate — zero reset, zero asteptare. Refresh-ul auto de 60s continua in fundal.
- Nota: testul `crypto-market-profile.test.ts` „Akedo 1w” pica identic si pe arborele curat (stricat pre-existent din `d4b8d6d`, zona api) — in afara scope-ului, neatins.

Verification and deployment evidence:

```text
Source commit/image tag: c374438
Local tests: 53/53 apps/web passed; build web passed (tsc + vite)
Full monorepo: singurul fail e pre-existentul Akedo 1w (api, prezent si pe arbore curat)
Local build: passed (packages/*, apps/api, apps/worker, apps/web)
Cloud Build: cd30dd45-92e8-4249-ad5f-2094527372b7 (SUCCESS)
Cloud Run revision: market-scanner-360-00158-wfk
Traffic: 100%
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app
Health: HTTP 200, status ok
```

## 78. Crypto Rank Global Live — Fix UNI #145 (era #28 pe CoinGecko)

Implemented and deployed on 05 September 2026.

- Problema: header-ul deep-dive arata UNI #145 in loc de #28.
- Cauza (lant complet): ruta exchange `/assets/:symbol` intoarce `info = catalog TRADING_360_ASSETS`, unde UNI avea `rank: 145` hardcodat si stagnant; frontend-ul accepta orice rank <999 ca global. Bonus: `market-service.getTopCryptoAssets` fabrica rank `assets.length + 1` cand lipsea `market_cap_rank`.
- Fix pe 3 niveluri, pentru toate asseturile crypto:
  1. Backend `scanner-routes.ts`: rank-ul crypto din detail e suprascris cu live CoinGecko `market_cap_rank` (cache 5 min); cand live-ul lipseste devine 999 (necunoscut), niciodata valoarea stagnanta.
  2. `market-service.ts`: fallback `assets.length + 1` → `999` (niciun rank precis fabricat).
  3. Frontend (`AssetDeepDiveView` + `AssetDetailModal`): crypto afiseaza doar rank live backend; fara el badge-ul se ascunde in loc sa arate un numar gresit. Helper nou testabil `resolveRankInput` (catalog fallback doar pentru stocks, care n-au sursa globala live).
- Stocks: neschimbat (fara sursa live globala; catalogul e singura referinta).

Verification and deployment evidence:

```text
Source commit/image tag: 18b7dee
Local tests: 55/55 apps/web passed (inclusiv regresiile UNI #145 + resolveRankInput); 9/9 market-data passed
Local build: passed (packages/*, apps/api, apps/worker, apps/web)
Full monorepo: singurul fail e pre-existentul Akedo 1w (api, prezent si pe arbore curat din d4b8d6d)
Cloud Build: 6fb3970f-9762-4033-a77c-6adc94d8c159 (SUCCESS)
Cloud Run revision: market-scanner-360-00159-qp7
Traffic: 100%
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app
Health: HTTP 200, status ok
```

## 79. Flip Scans — Univers Complet Top150 (CAKE #90 aparea nicaieri)

Implemented and deployed on 05 September 2026.

- Problema: CAKE (1W BULLISH in deep-dive) nu aparea in nicio scanare de flip 1W.
- Cauza: CAKE nu exista in catalogul static, iar scanarile de flip (live `/scan` + programata → dashboard Confirmed + broadcast Telegram) foloseau subsetul narativ-echilibrat (Top50 + top-10/narativa). CAKE (#90, $554M, narativa default Infrastructure) nu intra pe nicio poarta → exclus structural din detectie.
- Fix: metoda noua `getFlipUniverseCryptoAssets()` (pool complet CoinGecko Top150 ∩ Binance spot, cache 5 min), folosita in `executeTelegramMoneyLineScan` + `executeDailyRegimeScan`. Overview/semnale raman pe subsetul echilibrat. Cost: ~+40-60 asseturi crypto/scanare.
- Test nou: asset tip CAKE (in afara Top50) apare in flipuri; fail daca calea narativ-echilibrata e apelata.

Verification and deployment evidence:

```text
Source commit/image tag: 0571f07
Local tests: 74 apps/api (73 pass + pre-existentul Akedo 1w, prezent si pe arbore curat); test nou CAKE verde
Local build: passed (packages/*, apps/api, apps/worker, apps/web)
Cloud Build: f05fc454-ef2a-4ea5-bbc5-25ccf7d2a46a (SUCCESS)
Cloud Run revision: market-scanner-360-00160-fx9
Traffic: 100%
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app
Health: HTTP 200, status ok
```

## 80. Telegram — Filtru Directie /scan + 9 Preseturi flips_* (Autocomplete)

Implemented and deployed on 05 September 2026.

- `/scan flips 1w crypto bullish` (si `bull`/`bear`/`bearish`, orice ordine): filtrare BULLISH/BEARISH/ALL; directia apare in header (`· BULLISH ·`) si in JSON `scan.direction`. In mod `signals` directia e respinsa ca format invalid.
- 9 comenzi preset 1W pentru meniul autocomplete Telegram: `/flips`, `/flips_crypto`, `/flips_stocks`, `/flips_bull`, `/flips_bear`, `/flips_crypto_bull`, `/flips_crypto_bear`, `/flips_stocks_bull`, `/flips_stocks_bear` (acelasi pipeline + owner-check ca `/scan`; filtrare post-cache, cache-ul ramane comun).
- `/help` documenteaza filtrul + preseturile; mesajul de format invalid listeaza exemple noi.
- Actiune manuala ramasa (utilizator, in BotFather): `/setcommands` cu lista de mai jos ca sa apara autocomplete la `/`.

BotFather `/setcommands` (de lipit):
```text
scan - Scanare live semnale/flipuri: /scan 4h, /scan flips 1w crypto bullish
flips - Flipuri 1W confirmate, toate pietele
flips_crypto - Flipuri 1W confirmate, doar crypto
flips_stocks - Flipuri 1W confirmate, doar stocks
flips_bull - Flipuri 1W confirmate, doar bullish
flips_bear - Flipuri 1W confirmate, doar bearish
flips_crypto_bull - Flipuri 1W crypto, doar bullish
flips_crypto_bear - Flipuri 1W crypto, doar bearish
flips_stocks_bull - Flipuri 1W stocks, doar bullish
flips_stocks_bear - Flipuri 1W stocks, doar bearish
status - Status detaliat pe un asset, ex. /status BTC
trending - Top subiecte crypto pe X
news - Stiri recente, ex. /news BTC
brief - Briefing AI de piata
alerts - Seteaza timeframe-urile alertelor de flip
flipalerts - Flipuri doar pe timeframe ales, ex. /flipalerts 1w
watch - Adauga asset la watchlist
subscribe - Activeaza alertele in grupul curent
unsubscribe - Opreste alertele in grupul curent
help - Lista comenzi
```

Verification and deployment evidence:

```text
Source commit/image tag: f1d7d4a
Local tests: 9/9 notifications passed (preseturi + header directie); routes: directie + preseturi verzi
Local build: passed (packages/*, apps/api, apps/worker, apps/web)
Full monorepo: singurul fail e pre-existentul Akedo 1w (api, prezent si pe arbore curat)
Cloud Build: 15243abe-56d0-44ef-a6f8-016e0df962f2 (SUCCESS)
Cloud Run revision: market-scanner-360-00161-j98
Traffic: 100%
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app
Health: HTTP 200, status ok
```

## 81. Telegram — Lista Completa de Flipuri (fara "…si inca N")

Implemented and deployed on 05 September 2026.

- Problema: `/scan flips` arata 10 detaliate + "…si inca 208" — restul invizibile in Telegram.
- Fix: `buildLiveScanFlipOverflow` (notifications) taie restul in chunk-uri compacte one-line (`$SYM (Nume) · TIP · BULL/BEAR · scor · vechime`), impartite dupa buget ~3500 chars (limita Telegram 4096, URL-urile variaza) cu headere `*Continuare 11–55 din 218:*`; ruta trimite fiecare chunk ca mesaj separat, secvential (opreste la primul fail). Broadcast-ul automat ramane la 10/mesaj (anti-spam pe alerte).
- Clarificare din analiza screenshot-ului: cele 218 Telegram (TOATE pietele, ambele directii) vs 11 web (filtrat BULLISH+crypto+1W) — nu era "mai putin", ci sfera mai larga + trunchiere la afisare.

Verification and deployment evidence:

```text
Source commit/image tag: 7fde17d
Local tests: 10/10 notifications passed (chunking: acoperire totala, headere, limita 4096, cazuri ≤10/signals goale)
Local build: passed (packages/*, apps/api, apps/worker, apps/web)
Full monorepo: singurul fail e pre-existentul Akedo 1w (api, prezent si pe arbore curat)
Cloud Build: 9f79343a-1384-4f95-b36b-0e9b000b5630 (SUCCESS)
Cloud Run revision: market-scanner-360-00162-qfn
Traffic: 100%
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app
Health: HTTP 200, status ok
```


## 82. Crypto Radar — modular multichain research (2026-09-06, checkpoint 1)

User requested integration of the earlier Solana bot research requirements into this hosted app, incremental deploys, free social sources, mandatory Solana/Base/Robinhood, and comprehensive handoff for continuation after AI quota resets.

Detailed implementation plan: `docs/crypto-radar/IMPLEMENTATION.md`.

Implemented modules:
- `packages/shared/src/types/radar.ts`: shared contracts.
- `apps/api/src/services/radar/{scoring,market,social,store,service}.ts`: pure ranking, adapters, persistence, scheduler orchestration and Telegram report delivery.
- `apps/api/src/routes/radar-routes.ts`: authenticated reads, administrator+CSRF manual scan, dedicated scheduler-token endpoint.
- `apps/web/src/components/CryptoRadarView.tsx`: chain filters, price/cap/volume/liquidity, first-report baseline, previous-report/rank changes, sources, original evidence links, dropped tokens, historical reports. Deep link `/?tab=crypto_radar`.

Market discovery samples GeckoTerminal trending/new pool first pages, then DEX Screener exact-address batch enrichment and retention of previously followed tokens. Required chains are independently queried. Never sums duplicate pools or substitutes FDV for capitalization. Uses provider-reported `market_cap_usd`/`marketCap`, not an independent circulating supply audit. Strict Solana case-sensitive identities; EVM addresses normalize case, with chain as part of the key.

Social registry: up to 16 public Telegram channels (curated + metadata-linked candidate channels), three Bluesky queries, four Mastodon hashtags, five RSS feeds and CoinGecko search interest. Optional Farcaster Snapchain HTTPS connector is implemented but not enabled without a configured endpoint. Fomo/Reddit/Discord integrations are not claimed. Telegram channel count is distinct from human author count; RSS is editorial and cannot boost community score. No fabricated engagement. Contract/name+chain/cashtag+chain matching with collision checks; ambiguous matches are visible but not scored. Public content is data, never instructions. Copied text and URLs are deduplicated.

Storage: named Firestore database `money-scanner-360`; collections `radar-state`, `radar-social-window`, `radar-tokens`, `radar-reports`, `radar-delivery`. Distributed 8-minute lease and fencing on save; fixed 12h UTC report IDs; first reported prices persist per token; immutable report history. Rolling raw social window is capped at 1,500 items/24h in 15 documents; scoring uses 12h. Top 200 eligible rows retained per snapshot. UI lists latest 30 reports; older reports are not deleted. On complete provider failure, old snapshot remains available. No LLM calls in Radar.

Notification semantics: sends only to existing configured Telegram destination. Report delivery states `sending`, `sent`, `uncertain`; uncertain outcome is not blindly retried, avoiding duplicate reports. No hard exactly-once guarantee for external Telegram delivery. Check delivery status and actual chat before any retry. Existing daily technical scan remains untouched.

Verification before first deploy: complete monorepo build passed; 197 tests passed (19 new Radar tests). Fixed pre-existing Akedo weekly test fixture: it requested AKE but supplied PONS metadata; production crypto identity validation unchanged. Live local adapter test: 94 observed tokens, eligible Solana 14 / Base 16 / Robinhood 17 at that instant; a Gecko new-pools request returned 429 and was surfaced. These are transient test observations, not coverage guarantees. 79 deduplicated recent social/editorial items observed; public Bluesky search returned 403. Channels lacking public archives are now marked unavailable, not observed-zero communities.

Deployment / scheduler activation: pending checkpoint verification below. Do not assume schedules exist until recorded as verified. Existing production jobs are once daily (08:00 Europe/Bucharest technical scan, 07:00 Europe/Oslo AI warmup), not 12-hour Radar jobs.

### Checkpoint 1 deployment verified
- Commit `cde1734`; Cloud Build `7f1d468f-2b7d-49b5-8437-092fded42ff4`: SUCCESS.
- Revision `market-scanner-360-00163-pls`, 100% traffic; `/api/health` 200.
- Anonymous `/api/radar` and unsigned POST `/api/radar/scheduled` both 401.
- Authenticated scheduler-token cloud collection returned 200 and persisted 48 eligible tokens: Solana 15 / Base 16 / Robinhood 17. Browser authenticated page loaded correctly. Raw data is a changing sample, not an exhaustive chain scan.
- Checkpoint 2 adds distributed persistence/delivery tests, rejects generic chain names as token-name evidence, keyboard-accessible token details, social count delta display, and a credential-safe scheduler setup script. API tests now 99, monorepo total 201; final focused Radar suite 23/23 passed.

### Checkpoint 2 — deployed, initial report delivered, schedules enabled

Verified 2026-09-06. This supersedes the pending activation note above.

- Source commit `28c1427`; Cloud Build `17bca130-98f9-4737-babd-f02ef6ce5ddc`: SUCCESS.
- Cloud Run revision `market-scanner-360-00164-ln4`, 100% traffic. Monorepo build and 201 tests passed; final API build and focused 23 Radar tests passed.
- Production: https://market-scanner-360-384051756749.europe-west3.run.app/?tab=crypto_radar . Authenticated Chrome verified chain filtering, report table, first-report prices, expandable original social evidence and delivery status.
- First immutable report `1788652800000` generated 2026-09-06 04:55:30 UTC (06:55:30 Oslo): 48 eligible tokens, Solana 15 / Base 16 / Robinhood 17. Uses the collection from 04:42 UTC; quote observation time is visible in each token's details. Publications reuse a collection younger than 25 minutes.
- Telegram API confirmed delivery (`radar-delivery/1788652800000`: `sent`), also visible in the UI. Telegram includes top 10 plus a link to the full ranking/history. First-price baselines persisted for all 48 tokens.
- Repeated authenticated publish returned the identical report and left the delivery timestamps unchanged. Health 200; anonymous radar read and unsigned scheduler request 401.
- `money-scanner-radar-collect`: ENABLED, `*/30 * * * *`, UTC, POST `{publish:false}`.
- `money-scanner-radar-report`: ENABLED, `5 0,12 * * *`, UTC, POST `{publish:true}`. Normal reports at 00:05 and 12:05 UTC; presently 02:05 and 14:05 Oslo. Initial manual report is an extra bootstrap publication, not the start of a drifting 12-hour timer.
- Both jobs target `/api/radar/scheduled` with the existing protected scheduler token. Independent daily regime scan and AI warmup remain enabled with their previous schedules.
- Manual Cloud Scheduler executions verified in its logs: report finished 04:56:18 UTC HTTP 200; collection finished 04:56:41 UTC HTTP 200. The report execution reused the existing immutable slot.
- Setup/reconcile command: `node scripts/configure-radar-scheduler.mjs --apply`; omit `--apply` for safe dry-run. Script reuses the existing scheduler header in memory and never prints credentials. Do not dump full scheduler/service configuration into logs or docs.
- Sanitized cloud evidence is in `docs/crypto-radar/checkpoint2-evidence.json`; no credentials or raw social content included.

### Continuation / cost-efficient module workflow

Read this section, `docs/crypto-radar/IMPLEMENTATION.md` and only the files of the next module. The normal Radar pipeline consumes zero LLM tokens; cloud hosting/storage/scheduler usage still incurs the account's usual infrastructure costs. Work can stop between checkpoints without stopping scheduled Radar operation.

Priority order for future implementation:
1. Source-specific coverage and growth: track successful collection windows per platform/token, separate missing observations from zero, add account/broadcast quality evidence. Acceptance: a platform outage cannot masquerade as declining community interest; raw mention volume alone is not organic growth.
2. Discovery coverage: persisted fair per-chain pagination and hard request budgets. Acceptance: more old and new candidates without exceeding quotas or losing existing tracked-token refreshes.
3. Wallet/holder cohorts: verify a free per-chain indexer/RPC route before implementing holder concentration and repeat-wallet flows. Current aggregate buys/sells are **not** wallet-network analysis.
4. Optional Farcaster/Telegram community expansion: verify actual accessible endpoints and authorized channels. Fomo has no confirmed connector in this app; Bluesky currently returns 403; do not treat configured adapters as working sources.
5. Forward performance evaluation across all report cohorts, including dropped tokens, before claiming an investment edge.

For a delegated implementation, give one agent one bounded module, its file ownership, acceptance checks, and this handoff section; use a less costly implementation model for mechanical adapter/UI changes, retaining architectural and security review before deployment. Avoid multiple agents exploring the entire repo. No additional agent tasks were created for this checkpoint.

Do not reset `radar-tokens` or edit old `radar-reports` to change scoring. Version methodology for future score changes. Each module: focused tests + required build, deployment, authenticated smoke check, update this handoff with exact revision and limitations.

Operational recovery: inspect only selected scheduler status fields and Radar source health. A source 403/429 is surfaced and isolated. If Telegram delivery is `uncertain` or stuck `sending`, verify the actual chat before any manual retry; do not delete delivery claims blindly. To roll back before Radar existed, first pause both `money-scanner-radar-*` jobs, then route traffic to the chosen verified old revision. Current prior Radar revision is `market-scanner-360-00163-pls`; pre-Radar revision is `market-scanner-360-00162-qfn`. Do not delete Firestore report history during rollback.

## 83. Radar token chart links and Fomo investigation (2026-09-06)

User requested investigation of Fomo as a data source and clickable scanned token names, preferring Fomo charts where verified, otherwise DEX Screener.

- Research and exact source links: `docs/crypto-radar/FOMO.md`. Fomo has relevant social features, but no public developer feed was confirmed. Public browser token-route test redirected to homepage; direct unauthenticated fetch returned 403. Terms restrict automated extraction. No Fomo collector or unverified token links enabled.
- Shared `packages/shared/src/links/radar-token.ts` builds DEX Screener links by chain + exact contract. Case-sensitive Solana addresses retained; URL segments encoded.
- `CryptoRadarView.tsx`: token names now external chart links in current/historical tables and exited-token lists. Separate accessible Details button retains expansion; clicking names does not toggle the row. Original scanned pool stays linked in expanded details alongside DEX Screener token page.
- `service.ts`: future Telegram reports use HTML token-name links, escaping token-supplied text and URL content. Existing immutable report/delivery history and scheduler timing unchanged; old sent Telegram messages are not resent or edited.
- Live external page checks: TROLL/Solana, The Stonks Exchange/Base and MUSHROOM/Robinhood matched exact contracts and chain on DEX Screener.
- Complete monorepo build passed; 204 tests passed, including chain/contract link identity and Telegram HTML escaping.
- Commit `d0fd727`; Cloud Build `fd2a68db-8c10-4993-8193-cc152ba0ac49`: SUCCESS; revision `market-scanner-360-00165-hvh`, 100% traffic.
- Authenticated production UI verified after reload: all 48 saved report rows render token names as links and distinct accessible Details buttons. Clicking TROLL opened a new Chrome tab titled `TROLL ... TROLL / SOL on Solana / PumpSwap - DEX Screener` at the exact contract route. The Money Scanner source tab remained open. Service health HTTP 200.

## 84. Crypto Radar sortable columns and 24h change (2026-09-06)

User requested every table header to sort ascending/descending, a 24-hour asset price-change column, mobile usability matching the supplied screenshot, and deployment.

- `apps/web/src/components/crypto-radar-sort.ts`: immutable deterministic sorting for all 11 visible columns. Missing values remain last in both directions; ties use the immutable report rank. `Monedă / rețea` sorts by localized name then chain; `Scor / social` sorts by the Radar score.
- `CryptoRadarView.tsx`: each `<th>` contains a minimum 44px sort button, direction indicator (`↕`, `↑`, `↓`), keyboard focus styling, contextual Romanian `aria-label`, and standards-based `aria-sort`. Selecting a different column starts ascending; repeated presses toggle direction. Expanding details is closed on sort so evidence cannot appear under a moved row.
- New `Δ 24H` column uses the already persisted/provider-reported `priceChange24h`. Positive/zero values are green, negative red, and unavailable data shows `—`; it does not infer change from Radar report baselines.
- Tests cover every visible sort key in both directions, null placement, deterministic ties and no mutation of stored report rows. Web suite 57/57 and complete monorepo build passed.

Verification and deployment evidence:

```text
Source commit/image tag: 482df40
Local tests: 157 passed, 0 failed (100% test pass rate)
Local build: passed (packages/*, apps/api, apps/worker, apps/web)
Cloud Build: 0f88d4b1-0b13-465a-b9f5-cb0bc30fc11e (SUCCESS)
Cloud Run revision: market-scanner-360-00166-s4g
Traffic: 100%
Revision conditions: Ready=True, Active=True, ContainerHealthy=True
Public bundle: assets/index-S7gvJY8t.js
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app/?tab=crypto_radar
Cloud Run health: HTTP 200, status ok
```

## 85. Zero-cost crypto community promotion discovery & on-chain correlation scoring (2026-09-06)

User requested a zero-cost solution (no paid X API or subscription fees) to discover what the crypto community is actively promoting / what is hot & newly launched, integrating this into the application to correlate with blockchain scanning and award higher scores to projects with both strong on-chain metrics and high community hype (high pump probability).

- **Zero-Cost Discovery 1 — DEX Screener Community Token Boosts**:
  - `https://api.dexscreener.com/token-boosts/top/v1` and `latest/v1`: 100% free public JSON endpoints requiring zero API keys.
  - Returns tokens where the community is spending real capital (SOL/ETH/USD) to boost/promote.
  - Extracted contract address, supported chain (`solana`, `base`, `robinhood`), total boost count (`boostAmount`), description, and official project links (Telegram, X/Twitter).
  - Automatically queries boosted contract addresses against DEX Screener token endpoints so community-promoted tokens get complete verified on-chain metrics (price, liquidity, 24h volume, 1h velocity, transactions).
- **Zero-Cost Discovery 2 — Public Telegram Alpha & Call Channels**:
  - `https://t.me/s/{channel}`: 100% free public web preview scraping without Telegram Bot API costs or phone login.
  - Replaced generic macro news outlets (`cointelegraph,watcherguru`) with 8 dedicated crypto alpha, trending, and call channels: `dexscreener_trending`, `dexscreener_alerts`, `solanatrending`, `solanaalpha`, `solanacalls`, `soltrend`, `solcalls`, `solana_gems`.
  - Automatically detects calls, cashtags (`$TICKER`), and contract mentions, isolating dedicated alert calls (`telegramCalls`).
  - Project-specific Telegram channels dynamically collected from pair metadata and boosts.
- **On-Chain & Social Correlation / Confluence Scoring (`scoring.ts`)**:
  - Market score (on-chain): Liquidity (max 30) + 24h volume (max 30) + Unique buyers participation (max 20) + 1h volume acceleration (max 20).
  - Social score: Multi-platform authors + Telegram channels + DEX Screener community boost score (`Math.log10(1 + boostAmount) * 8.5`) + Alpha channel call bonuses.
  - **Confluence Bonus**: When strong on-chain metrics (marketScore ≥ 35, liquidity ≥ $50k) converge with community hype (socialScore ≥ 15, boostAmount ≥ 10, or telegramCalls ≥ 1), a pump-potential confluence bonus of up to +15 points is awarded.
  - Contextual reason tags added: `🚀 Confluență ridicată (+X pct): volum/lichiditate on-chain corelate cu promovare comunitară activă`, `⚡ Promovat de comunitate: X boosturi DEX Screener`, `📢 Alertat în Y canal(e) Telegram alpha`.
- **UI Enhancements (`CryptoRadarView.tsx`)**:
  - Token score cell displays an amber `⚡ <boosts>` badge when community boosts are active.
  - Details panel displays confluence bonus breakdown, Telegram alpha alerts, and DEX Screener boost count.
- **Verification**:
  - 104 API unit tests passing (including 4 new tests covering `parseDexBoosts`, community boost scoring, Telegram alpha calls, and confluence bonus ranking).
  - 57 Web unit tests passing. Total 161 tests passing across monorepo (100% pass rate).

Verification and deployment evidence:

```text
Source commit/image tag: 240b4f3
Local tests: 161 passed, 0 failed (100% test pass rate)
Local build: passed (packages/*, apps/api, apps/worker, apps/web)
Cloud Build: ec2557e9-ae72-4019-b6b4-40a0dd2ecb20 (SUCCESS)
Cloud Run revision: market-scanner-360-00167-pcd
Traffic: 100%
Revision conditions: Ready=True, Active=True, ContainerHealthy=True
Public bundle: assets/index-BgniUTJ8.js
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app/?tab=crypto_radar
Cloud Run health: HTTP 200, status ok
```

## 86. Zero-cost wallet safety audits, insider/bundled protection & microcap utilities section (2026-09-06)

User requested:
1. Zero-cost wallet safety verification (anti-rug, anti-honeypot, insider/bundled protection) across Solana (RugCheck API) and EVM chains Base & Robinhood Chain (GoPlus Security API).
2. Penalties in scoring for tokens with high holder concentration (>50%), bundled launches or insider clustering, with explicit reason tags in Romanian.
3. A dedicated separate section in the Radar tab for Microcap Utilities in the $200,000 – $500,000 market cap range, focusing on active trading fee generation, buybacks/deflation, and holder value, complete with full token safety verification.
4. Production build, 100% test pass rate, Cloud Run deployment, health check, and adherence to Golden Directives.

- **Part 1 — Zero-Cost Security Verification (`apps/api/src/services/radar/security.ts`)**:
  - **Solana / RugCheck API (`https://api.rugcheck.xyz/v1/tokens/{address}/report`)**:
    - Extracted top 10 holders percentage (`top10HoldersPct`).
    - Evaluated insider clustering and networks via `graphInsidersDetected` node count and `insiderNetworks`.
    - Detected bundled launches (`isBundled`) from risk heuristics and multi-wallet transfer clusters.
    - Parsed RugCheck risk score (`rugScore`), honeypot/freeze authority checks, and transfer fees.
  - **Base & Robinhood / GoPlus Security API (`https://api.gopluslabs.io/api/v1/token_security/{chainId}`)**:
    - Filtered out liquidity pool contracts (using `data.dex` pair registry) and burn addresses to compute pure wallet holder concentration (`wallet vs pool contract distinction`).
    - Checked honeypot mechanics (`is_honeypot`, `cannot_sell_all`), buy taxes, sell taxes, and computed standardized risk scores.
  - **Audit Enrichment**:
    - Automatically audits candidate tokens with concurrency controls and memory caching.
    - Reports transparency statuses: `rugcheck:solana`, `goplus:base`, and `goplus:robinhood`.
  - **Scoring Penalties & Romanian Tags (`scoring.ts`)**:
    - Penalty applied when `top10HoldersPct > 50%` with tag `⚠️ Concentrare ridicată: top 10 holderi dețin X%`.
    - Penalty (-25 pts) for bundled launches / insider networks with tag `🚨 Risc lansare bundled / insideri`.
    - Penalty (-50 pts) for honeypots with tag `🚨 Honeypot detectat: vânzarea este restricționată`.
    - Verified clean tokens receive `🛡️ Verificare portofele: top 10 holderi X%, fără clustere de insideri`.

- **Part 2 — Microcaps Utilitare ($200k – $500k Market Cap) Section**:
  - **Discovery (`market.ts`)**:
    - Added `token-profiles/latest/v1` parser to extract rich project descriptions and socials at zero cost.
    - Discovered utility and fee-generating tokens on Solana, Base, and Robinhood via targeted search and pooled turnover.
    - Implemented `detectUtilitySignals` to categorize bots, tools, buybacks, revshare, and DEX utility.
  - **Microcaps Scoring (`scoring.ts` -> `rankMicrocaps`)**:
    - Dedicated ranking for tokens in $200,000 to $500,000 range.
    - Evaluates 24h trading volume turnover and estimated LP/protocol fees generated (`estimatedFees24h`).
    - Awards utility and buyback bonuses while strictly enforcing wallet safety penalties.
  - **UI Implementation (`CryptoRadarView.tsx` & `crypto-radar-sort.ts`)**:
    - Sleek segmented tab switcher between `🌟 Radar Principal (Cap ≥ $500k)` and `🔬 Microcaps Utilitare ($200k – $500k)`.
    - Microcaps table features dedicated columns: Preț, Δ 24H, Market cap, Volum 24h, Comisioane 24h (`~$X`), Lichiditate, Securitate & Holderi (`🛡️ Top 10: X%`, `🚨 Bundled/Insiders`), Utilitate & Buyback badges (`⚙️ Bot`, `🔥 Buyback`), and Scor.
    - Expanded details reveal two-zone audit: wallet concentration (wallet vs DEX pool), insider networks, bundled status, honeypot/tax checks, estimated 24h fee cashflow, and direct DEX Screener & RugCheck links.
    - Added sorting support for `top10HoldersPct` and `estimatedFees24h`.

- **Part 3 — Verification & Deployment**:
  - 109 API tests and 58 Web tests passing (167 total, 100% pass rate).
  - TypeScript compilation and Vite build succeeded.
  - Cloud Build `23efa1b6-f911-4f46-9fbe-3220bedd2c63` succeeded.
  - Cloud Run revision `market-scanner-360-00168-gsn` serving 100% traffic.
  - Live `/api/health` confirmed `{"status":"ok", ...}` with HTTP 200.

Verification and deployment evidence:

```text
Source commit/image tag: f8c04a1
Local tests: 167 passed, 0 failed (100% test pass rate)
Local build: passed (packages/*, apps/api, apps/worker, apps/web)
Cloud Build: 23efa1b6-f911-4f46-9fbe-3220bedd2c63 (SUCCESS)
Cloud Run revision: market-scanner-360-00168-gsn
Traffic: 100%
Revision conditions: Ready=True, ConfigurationsReady=True, RoutesReady=True
Public bundle: assets/index-Cs4gE2ZX.js, assets/index-CQGpHe1s.css
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app/?tab=crypto_radar
Cloud Run health: HTTP 200, status ok
```

## 87. Adversarial Audit, RugCheck False Positive Elimination & EVM Batch Audit Fixes

Implemented and deployed on 06 September 2026.

### What changed

1. **Elimination of 100% False-Positive `insidersDetected` Flag on Solana (`security.ts`)**:
   - **Root Cause**: The prior attempt checked `body.graphInsidersDetected > 0` and `body.insiderNetworks.length > 0`. Because RugCheck generates transfer network graphs with active node counts for every active token (e.g. BONK has 22,167 nodes, USELESS has 1,053 nodes), 100% of Solana tokens were falsely marked with `insidersDetected = true`, penalized 25 points, tagged with `🚨 Risc lansare bundled / insideri`, and barred from ever receiving positive verification.
   - **Fix**: Replaced naive counter check with rigorous multi-signal evaluation:
     - Direct insider flag on top holders (`h.insider === true`).
     - Explicit insider/cluster risks flagged by RugCheck in `risks` array (`/insider|cluster|coordinated/i`).
     - Coordinated small clusters holding high supply shares (`accounts >= 2 && accounts <= 50 && /bundle|insider|cluster/i.test(n.id)`).
   - Clean tokens (BONK, USELESS, etc.) now correctly resolve `insidersDetected: false` and receive `🛡️ Verificare portofele: top 10 holderi X%, fără clustere de insideri`.

2. **Fix GoPlus EVM Single-Address Endpoint Truncation (`security.ts`)**:
   - **Root Cause**: GoPlus `/api/v1/token_security/{chainId}` endpoint silently ignores all but the first address when passed comma-separated `contract_addresses`. The prior attempt chunked by 25 addresses per query, causing 24 out of 25 addresses (96%) on Base and Robinhood to be dropped and un-audited.
   - **Fix**: Refactored `auditEvmTokens` to query individual addresses concurrently in bounded batches of 6 with 6-second timeout. Audits 100% of candidate addresses reliably without silent truncation.

3. **EVM Wallet vs Pool / Contract Distinction (`security.ts`)**:
   - **Root Cause**: Prior attempt only checked `p.pair` in `data.dex`. Uniswap V4 on Base uses `pool_manager` addresses, and GoPlus explicitly supplies `is_contract: 1` on each holder. Contracts were being treated as personal wallets, falsely reporting DEGEN as having 61.4% top 10 holder concentration.
   - **Fix**: Extracted both `pair` and `pool_manager` from `data.dex`, mapped `is_contract: 1` as smart contracts (pools, staking, vaults, bridges), and filtered out burn/dead tags. DEGEN true top 10 individual wallet concentration correctly computed at 21.83%.

4. **Candidate Prioritization & Microcap Search Expansion (`security.ts`, `market.ts`)**:
   - Prioritized candidate tokens by market activity (`volume24h + liquidity + boostAmount`) descending before slicing audit limits, ensuring the most important tokens are never left un-audited.
   - Added `tool` query and `p.fdv` fallback support in `market.ts` microcap utility discovery.

5. **Truthful UI Representation for Un-audited Tokens (`CryptoRadarView.tsx`)**:
   - Guarded against false reassurance: if a token has not yet been audited (`null`/`undefined`), displays `În curs de colectare` / `—` rather than falsely claiming `🛡️ Curat` or `🛡️ Fără clustere`.

6. **Unit Tests & Full Monorepo Build**:
   - Added tests in `apps/api/src/services/radar.test.ts`:
     - `auditSolanaToken handles transfer graphs without false positive insider penalty and detects actual insider risks`
     - `auditEvmTokens distinguishes pool contracts from individual user wallets`
   - Total test suite: 111 API tests + 58 Web tests = 169 passed, 0 failed (100% test pass rate).

Verification and deployment evidence:

```text
Source commit/image tag: 902b7d0
Local tests: 169 passed, 0 failed (100% test pass rate)
Local build: passed (packages/*, apps/api, apps/worker, apps/web)
Cloud Build: f3205be8-3c64-41d6-9fe9-4969874caaec (SUCCESS)
Cloud Run revision: market-scanner-360-00169-vpw
Traffic: 100%
Revision conditions: Ready=True, ConfigurationsReady=True, RoutesReady=True
Public bundle: assets/index-DdhHIHSo.js, assets/index-CQGpHe1s.css
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app/?tab=crypto_radar
Cloud Run health: HTTP 200, status ok
```

## 88. Mobile Crypto Radar Security & Holder Status Indicator

Implemented, adversarially audited, and deployed on 06 September 2026.

### What changed

1. **Security & Holders Status Indicator on Mobile (`CryptoRadarView.tsx`, `crypto-radar-security.ts`)**:
   - **Problem**: On mobile viewports, users only see the initial columns (`Loc`, `Monedă / rețea`, `Preț`) without horizontal scrolling. To see whether a token was safe, had high holder concentration, or posed insider/honeypot risks, users previously had to scroll horizontally across 10 columns to reach `Securitate / Hold.`.
   - **Solution**: Added a colored status circle (`w-2.5 h-2.5 rounded-full shrink-0 ring-2`) inline right next to each token's name (`Monedă ↗`) in the permanently visible token column on both the primary radar table (`Radar Principal`, Cap ≥ $500k) and the microcaps table (`Microcaps Utilitare`, $200k – $500k).
   - **Color & State Matching**:
     - 🟢 **Emerald/Green (`bg-emerald-400 ring-emerald-400/30`)**: Clean security audit (`top10HoldersPct <= 50%`, no insider clustering, no bundled launch, not a honeypot, low rug score).
     - 🟡 **Amber/Yellow (`bg-amber-400 ring-amber-400/30`)**: High holder concentration warning (`top10HoldersPct > 50%`, no danger flags).
     - 🔴 **Rose/Red (`bg-rose-500 ring-rose-500/30`)**: Security danger flags (honeypot contract, bundled launch, insider networks detected, or rugScore > 500).
     - ⚪ **Slate/Gray (`bg-slate-500 ring-slate-500/30`)**: Audit in progress / un-audited (`top10HoldersPct === null`).
   - **Interactive Mobile Tap Tooltip Card**: Status circle is rendered as a keyboard-accessible `<button type="button">` with `aria-label`, native `title`, and `onClick` with `e.stopPropagation()`. Tapping the circle on mobile toggles an inline security status pill right under the token name (preventing parent row click expansion), complete with a dismiss button `✕`.

2. **Adversarial Bug Fixes in Security Status Evaluation (`crypto-radar-security.ts`, `crypto-radar-security.test.ts`)**:
   - **Bug fixed (NaN / Negative / Infinity / Out-of-bounds bypass)**: Evaluated `row.top10HoldersPct !== null` without finite-number checks, causing `NaN%`, `-5%`, or corrupted data to fall through to `clean` (emerald). Added `isValidPercentage` validating `Number.isFinite(val) && val >= 0 && val <= 100`.
   - **Null / Undefined row safety**: Passing null/undefined row crashed with `Cannot read properties of null`. Fixed with nullish fallback `row ?? {}`.
   - **RugScore Boundary Check**: Verified boundary conditions: `rugScore === 500` remains clean if other metrics are safe; `rugScore > 500` (e.g. 501) triggers danger.
   - **Unit Tests**: Added 5 new edge-case tests in `crypto-radar-security.test.ts` (174 total tests in monorepo).

3. **Verification & Cloud Run Deployment**:
   - Full monorepo test suite passed (111 API tests + 63 Web tests = 174 passed, 0 failed).
   - Local production build completed successfully.
   - Cloud Build deployed to Cloud Run revision `market-scanner-360-00171-ltl`.
   - Verified live endpoint `/api/health` (HTTP 200) and live page at `https://market-scanner-360-384051756749.europe-west3.run.app/?tab=crypto_radar`.

Verification and deployment evidence:

```text
Source commit/image tag: c024f6c
Local tests: 174 passed, 0 failed (100% test pass rate)
Local build: passed (packages/*, apps/api, apps/worker, apps/web)
Cloud Build: f05e2d42-ec1e-44a9-b5e5-61c234671bac (SUCCESS)
Cloud Run revision: market-scanner-360-00171-ltl
Traffic: 100%
Revision conditions: Ready=True, ConfigurationsReady=True, RoutesReady=True
Public bundle: assets/index-BEemp_VZ.js, assets/index-AdlyYXIG.css
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app/?tab=crypto_radar
Cloud Run health: HTTP 200, status ok
```

## 89. Sticky Viewport Table Header with Native Bidirectional 2D Scrolling for Crypto Radar

Implemented, verified, and deployed on 06 September 2026.

### What changed

1. **Sticky Viewport Header Docking & Native Scroll Architecture (`CryptoRadarView.tsx`)**:
   - **Problem**: When users scrolled down the Crypto Radar view on mobile or desktop through 100+ tokens, the table header (`<thead>` / `<th>`) scrolled completely out of view, making it impossible to identify columns (such as Price, 24h %, First Report, Market Cap, Volume, Liquidity, Security, Score). Applying naive CSS `sticky top-0` inside a single table wrapper failed because `overflow-x: auto` establishes a scroll context that prevents sticky elements from adhering to the window viewport.
   - **Solution**: Implemented a dedicated sticky header container with `sticky top-[56px] z-20` docked cleanly right beneath the application's fixed 56px navigation bar.
   - **Opaque Backdrop & Elevation**: Styled with solid `bg-[#0b1329] border-b border-white/10 rounded-t-xl shadow-[0_4px_12px_rgba(0,0,0,0.5)]` so tokens scrolling vertically underneath never show through header text.
   - **Native Bidirectional 2D Scroll Synchronization**:
     - Configured the sticky header as a native horizontal scroll container (`overflow-x-auto no-scrollbar`) paired with the table body (`overflow-x-auto rounded-b-xl custom-scrollbar`).
     - Replaced janky synthetic touch/wheel interceptors and `transform: translateX` with real native momentum scrolling on both the header and body containers.
     - Synchronized horizontal scroll positions bidirectionally with `requestAnimationFrame` recursion guard (`isSyncingRef`), ensuring zero scroll drift and zero button click cancellation on mobile touches.
     - Fixed `useEffect` lifecycle listener binding to track `[snapshot, section]`, preventing dead initial listener attachment when `snapshot` is initially null.
     - Added `<colgroup>` with explicit proportional column widths (`tableMinWidth` 1330px for Radar Principal, 1165px for Microcaps Utilitare) and `table-layout: fixed`, guaranteeing 0.00px column alignment across all viewports.
     - Sighted and assistive accessibility: Provided `aria-label="Crypto Radar - Cap tabel"` on the header table and `aria-label="Crypto Radar - Date tokenuri"` with hidden `<thead className="sr-only">` on the body table for complete screen-reader compatibility.

2. **Canonical Column Definitions Module (`crypto-radar-headers.ts`)**:
   - Extracted `RADAR_MAIN_HEADERS` (12 columns) and `RADAR_MICRO_HEADERS` (10 columns), plus `getRadarTableMinWidth`, creating a single source of truth shared between the component and test suites.

3. **Section Switcher & Reset Handling (`CryptoRadarView.tsx`)**:
   - Created `switchSection` helper that resets horizontal scroll position to 0 on both containers and collapses active tooltips and expanded details rows when switching between `Radar Principal` and `Microcaps Utilitare`.
   - Also integrated scroll reset into report selection (`select`).

4. **Unit Tests & Full Monorepo Build**:
   - Enhanced unit test suite `apps/web/src/components/crypto-radar-sticky.test.ts`:
     - Verifies unique column keys and positive widths across both tables.
     - Verifies minimum width invariants (1330px for main, 1165px for microcaps) ensuring no column truncation on mobile.
     - Verifies microcaps utility columns (including `estimatedFees24h`).
     - Verifies bidirectional scroll synchronization invariant without infinite loops.
   - Monorepo tests: 111 API tests + 67 Web tests = 178 passed, 0 failed (100% pass rate).
   - Full monorepo build succeeded.

5. **Cloud Run Deployment**:
   - Deployed via Cloud Build to Cloud Run revision `market-scanner-360-00173-59n`.
   - Health check: HTTP 200 OK.
   - Live page verified: HTTP 200 OK.

Verification and deployment evidence:

```text
Source commit/image tag: cfe024c
Local tests: 178 passed, 0 failed (100% test pass rate)
Local build: passed (packages/*, apps/api, apps/worker, apps/web)
Cloud Build: 035d01bb-acf8-42ad-ac42-d0152db44fb3 (SUCCESS)
Cloud Run revision: market-scanner-360-00173-59n
Traffic: 100%
Revision conditions: Ready=True, ConfigurationsReady=True, RoutesReady=True
Public bundle: assets/index-BDcKSjxJ.js, assets/index-E9yeZm2n.css
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app/?tab=crypto_radar
Cloud Run health: HTTP 200, status ok
```

## 90. Resolution of Viewport Sticky Table Header Failure on Mobile and Desktop for Crypto Radar

Implemented, adversarially audited, verified with automated Playwright multi-engine browser evaluation on both Chromium and WebKit (mobile & desktop), and deployed on 06 September 2026.

### Root Cause Investigation & Adversarial Audit

1. **User Report & Visual Evidence (`media_1788704442992.png`)**:
   - The user provided a mobile screenshot showing the Crypto Radar table on an Android device: 4 long paragraphs of methodology text occupied the entire screen under the fixed header, pushing the table header down into the lower third of the screen, with only 4 rows visible.
   - When the user attempted to scroll vertically, the table header did not stay fixed on the screen ("capul de tabel din poză nu este Fixat pe ecran cum te am rugat să îl faci").

2. **Underlying CSS & DOM Causes Uncovered During Adversarial Review**:
   - **Initial Offset Exceeding 556px (`y: 673px`)**: In the prior attempt, the vertical DOM mass above the table header totaled 673px. Because `673 - 500 = 173px`, when scrolling down 500px on mobile, the header was still 173px down the screen and had NOT reached the 56px navbar docking position. The prior attempt's test passed only because it used a synthetic mock intro block hardcoded to 350px, masking the live app failure.
   - **`overflow-x: clip` on `#root` and `html, body`**: Applying `overflow-x: clip` to non-scrolling ancestor elements (`#root` has `scrollTop = 0` while `window` scrolls) created an overflow clipping boundary that prevented descendant `position: sticky; top: 56px;` elements from docking against the window viewport.
   - **`-webkit-overflow-scrolling: touch` compositor decoupling**: In mobile WebKit, `-webkit-overflow-scrolling: touch` created an asynchronous compositor layer decoupling sticky coordinate calculations from viewport scroll events.

### What Changed

1. **Eliminated `overflow-x: clip` and `-webkit-overflow-scrolling: touch` (`apps/web/src/index.css`)**:
   - Removed `overflow-x: clip;` from `@layer base { html, body { ... } }` and `#root { ... }`.
   - Removed `-webkit-overflow-scrolling: touch;` from `html, body` and `.radar-sticky-header`.
   - The sticky container now evaluates its docking coordinate directly against the viewport window across all mobile (Android Chrome, iOS Safari) and desktop browsers.

2. **Streamlined Mobile Controls & Compact Header Layout (`CryptoRadarView.tsx`)**:
   - Re-engineered the top title banner into a single clean line with an inline `360° Live` badge, compacting mobile vertical height from 170px down to ~38px.
   - Converted network filter cards to `grid grid-cols-3 gap-2` with compact status dots, keeping all 3 networks visible in a single row.
   - Streamlined section switcher and report controls into a compact row (`pt-0.5`).
   - Compacted summary text and wrapped detailed methodology in an inline collapsible drawer ("Metodologie & acoperire ▾").
   - Reduced `<section>` spacing from `space-y-5` to `space-y-2.5 sm:space-y-4`.
   - Result: Initial table header offset on mobile reduced from 673px to 448px (Chromium) / 441px (WebKit). Because 448px <= 556px, scrolling down 500px now docks the header cleanly at `top: 56px` with `gap: 0` below the fixed app navbar!

3. **Automated Playwright Multi-Engine Verification (`crypto-radar-sticky.test.ts`)**:
   - Added automated static regression test asserting that `@layer base` in `index.css` never contains `overflow-x: clip` or `overflow-x: hidden`.
   - Verified automated Playwright test across both Chromium and WebKit with mobile (iPhone 14, 390x844) and desktop (1440x900) viewports:
     - Header docks precisely with `gap: 0` below the fixed navbar.
     - Stays locked at `top: 56px` (or `top: 51px` in WebKit mobile matching `header.bottom: 51px`) at 500px, 1000px, 1500px, and 2500px scroll depths.
     - Verified bidirectional horizontal scroll synchronization on mobile viewports.
   - Monorepo test suite: 111 API tests + 72 Web tests = 183 passed, 0 failed (100% pass rate).

4. **Production Build & Deployment**:
   - Full monorepo build succeeded (`npm run build`).
   - Deployed via Cloud Build `31d0a9d4-7bb5-4860-a730-7f3dc158e1ac` to Cloud Run revision `market-scanner-360-00177-5k8`.
   - Verified `/api/health` (HTTP 200, status ok) and live URL.
   - Verified live production CSS bundle (`assets/index-CvTjS5VH.css`) has 0 instances of `overflow-x: clip` and retains active `.radar-sticky-header`.
   - Verified live production JS bundle (`assets/index-D1xVwz9H.js`).

Verification and deployment evidence:

```text
Source commit/image tag: 8c0c6dc
Local tests: 183 passed, 0 failed (100% test pass rate)
Local build: passed (packages/*, apps/api, apps/worker, apps/web)
Cloud Build: 31d0a9d4-7bb5-4860-a730-7f3dc158e1ac (SUCCESS)
Cloud Run revision: market-scanner-360-00177-5k8
Traffic: 100%
Revision conditions: Ready=True, ConfigurationsReady=True, RoutesReady=True
Public bundle: assets/index-D1xVwz9H.js, assets/index-CvTjS5VH.css
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app/?tab=crypto_radar
Cloud Run health: HTTP 200, status ok
```

## 91. Deterministic RADAR-SCAN digest (script, no AI) — 2026-09-06

Cerinta userului: acelasi schelet de rezumat ca digestul AI (PORT / MISCARI / MICROCAPS + semafor),
dar generat 100% determinist, fara AI, cu limite declarate (fara X trending, fara confluente).
Folosit via `/scan radar` pe botul Hermes (Telegram).

1. **Implementare in aplicatie** (sursa de adevar pentru format):
   - `packages/notifications/src/radar-digest.ts` — `buildRadarDigest()` pur: snapshot + cotatie PORT
     + harta security + boosts optionale → Markdown Telegram. Fara adrese vizibile (doar in URL-uri),
     MISCARI = |changeFirst| > 10% (max 6, desc), MICROCAPS max 5, boosturi max 3.
   - Helpers: `summarizeRugCheck()` (RugCheck risks → semafor), `summarizeGoPlus()` (token_security → semafor),
     `fmtPrice` / `fmtMoney`. Exportate din `packages/notifications/src/index.ts`.
   - `packages/notifications/src/radar-digest.test.ts` — 3 teste (filtre/limite, zero adrese vizibile,
     security, formatare). Rulare: `node@22 ../../node_modules/.bin/tsx --test src/radar-digest.test.ts`
     (3 pass), `tsc --noEmit` curat. NOTA: node-ul brew de sistem (v25) e stricat (dyld simdjson) —
     pentru comenzi node in repo se foloseste `/opt/homebrew/opt/node@22/bin/`.
   - Keyword map RugCheck include `rugged|rug history` → 🔴 rug (caz real: AICOIN, "Creator history of
     rugged tokens"). Lipsa verificarii = mereu 🟡, niciodata verde din oficiu.
2. **Oglinda Python pentru Hermes**: `~/.hermes/scripts/scan-radar.py` — citeste acelasi Firestore
   (`radar-state/report`), cotatie PORT din DexScreener API, RugCheck per token Solana, GoPlus batch (.io)
   pentru Base, top 3 boosts. Testat live, output validat (fara adrese vizibile).
3. **Skill Hermes `scan`**: `/scan radar` → ruleaza scriptul si returneaza stdout EXACT, fara AI.
   `/scan` simplu → analiza AI ca pana acum.
4. Pas urmator (nefacut): cablarea `buildRadarDigest()` in worker/API (ex endpoint `/radar/digest`)
   si in `TelegramBotHandler.handleCommand` (botul propriu al aplicatiei), ca scriptul Hermes sa consume
   API-ul in loc sa dubleze logica.

## 92. `/scan radar` pe botul aplicatiei (@Crypto_mac_alert_bot) — 2026-09-06

Eroarea userului "Format invalid..." la `/scan radar` venea din `parseTelegramScanArgs` (telegram-routes.ts),
care nu accepta `radar` ca argument. Rezolvare (aceeasi seara):
- `apps/api/src/services/radar-digest-service.ts` (nou) — `fetchRadarDigestText()`: snapshot via RadarStore,
  cotatie PORT (DexScreener), security (RugCheck Solana + GoPlus batch Base), top 3 boosts → `buildRadarDigest()`.
  Fiecare sursa in try/catch propriu; fetch injectabil pentru teste.
- `apps/api/src/services/radar-digest-service.test.ts` (nou) — 2 teste cu fetch stub (digest + snapshot lipsa).
- `telegram-routes.ts` — ramura `/scan radar` (dupa verificarea owner): mesaj ⏳, digest, statusuri
  `radar_digest_complete` / `radar_digest_failed`. Mesajul "Format invalid" mentioneaza acum si `/scan radar`.
- `telegram-bot.ts` help — linie `/scan radar`.
- Verificat: tsc curat (api + notifications), teste 7/7 api (2 noi + 5 rute), 13/13 notifications.
- Deploy: Cloud Build din root (`gcloud builds submit --config cloudbuild.yaml .`), proiect
  gen-lang-client-0610749770 → Cloud Run `market-scanner-360` (europe-west3). Dupa deploy, `/scan radar`
  functioneaza pe @Crypto_mac_alert_bot.
- Deploy executat 2026-09-06 ~22:30: commit `Deterministic RADAR-SCAN digest`, build SUCCESS (4m40s),
  revizia `market-scanner-360-00178-fgl` live 100% trafic, `/api/health` ok. Submitul local necesita
  `--substitutions=COMMIT_SHA=<sha>` (altfel tag gol → eroare invalid image name).

## 93. Flip universe = 150 monede CoinGecko pe market cap (nu Binance ∩ catalog pad)

Problema: „Top 10 aproape de flip” arăta puține crypto-uri pentru că universul nu era Top 150 CoinGecko. `getTopCryptoAssets` lua pagina CoinGecko 150, păstra doar perechi Binance USDT (~87, fără HYPE #11), apoi umplea restul din catalogul static (ETH/BNB/SOL deja din top, plus monede în afara ranking-ului live).

Fix:
- Universul flip = 150 monede **ordonate după CoinGecko market cap** cu sursă reală de lumânări (Binance USDT spot sau Hyperliquid).
- Stablecoins (USDT, USDC, DAI, …) excluse — Money Line pe peg nu are sens și nu există USDTUSDT.
- Fără pad din catalogul static. Dacă în primele 250 CoinGecko nu sunt 150 scanabile, se ia pagina 2.
- HYPE/KAS/XMR etc. intră pe Hyperliquid; `getCandles` folosește mapa de sursă din univers, nu `providerSymbol` de futures din catalog (KAS era `KASUSDT`).
- Test: `packages/market-data` 10/10; `daily-regime-scan` 18/18. Smoke live: 150 asseturi, HYPE inclus, USDT exclus, CAKE inclus.

```text
Cloud Build: ee40edc2-7d31-4426-90ef-6477de84b3f6 (SUCCESS, 4m48s)
Image tag: flipcg150-20260909204204
Cloud Run revision: market-scanner-360-00179-qg4
Traffic: 100%
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app
Health: HTTP 200, status ok
```

După deploy: o scanare Complet / flips din Alerte ca lista să se reconstruiească pe noul univers.

## 94. Top 20 aproape de flip (afișare)

User: tot aceleași puține monede; vrea măcar 20 din cele scanate.
Cauza UI: `filterFlipCandidates` tăia la 10 asseturi unice, independent de universul de 150.
Fix: `UPCOMING_FLIP_DISPLAY_LIMIT = 20`; titlu/butoane Top 20; test 25→20.

```text
Cloud Build: 0d09eaa6-0804-4bd3-94a9-bf2fc9228bb7 (SUCCESS, 4m23s)
Image tag: flip20-20260910101140
Cloud Run revision: market-scanner-360-00180-cr5
Traffic: 100%
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app
Health: HTTP 200, status ok
```

Dacă lista încă e scurtă, apasă Scanare Top 20 Flips — UI-ul nu poate arăta 20 dacă Firestore încă are doar vechile 10.

## 95. Acces Viewer: tiberioursan@gmail.com — 2026-09-12

Adăugat `tiberioursan@gmail.com` în `ALLOWED_EMAILS` (Viewer, nu admin). `ADMIN_EMAILS` rămâne doar `marius.perju.juravle@gmail.com`. Sursă: `cloudbuild.yaml`. Aplicat live prin `--update-env-vars` (fără rebuild de imagine).

```text
Cloud Run revision: market-scanner-360-00182-qpf
Traffic: 100%
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app
Custom URL: https://scanner.relayhub.no
Health: HTTP 200, status ok
```

Tiberiu: Google Sign-In cu acel Gmail pe pagina scannerului.

## 96. Full Project Update & Cloud Run Deployment — 2026-09-14

Deployment executat cu succes în urma actualizărilor de sistem (univers Top 150 CoinGecko, Top 20 flip candidates display, acces viewer, rafinări UI și teste monorepo):

```text
Source commit: b01a3ec
Local tests: 186 passed, 0 failed (100% pass rate)
Local build: passed (packages/*, apps/api, apps/worker, apps/web)
Cloud Build ID: 6245fff8-67c4-4040-a643-6dba0e1ea1f5 (SUCCESS, 5m30s)
Cloud Run revision: market-scanner-360-00187-qgb
Traffic: 100%
Public bundle: assets/index-Cv9IghiR.js, assets/index-DFLRbcPz.css
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app
Custom URL: https://scanner.relayhub.no
Health check (/api/health): HTTP 200 OK (status: "ok", service: "market-scanner-360-api")
```

## 97. Intelligence View & Daily Briefing Suite Deployment — 2026-09-15

Deployment executat cu succes pentru noua suită **Intelligence View & Daily Intelligence Briefing**:
- Adăugat componenta `IntelligenceView.tsx` și rutele AI `/api/ai/intelligence-brief`.
- Adăugat teste automate dedicate `intelligence-brief.test.ts` (116 API + 73 Web = 189 teste trecute cu 100% pass rate).
- Compilare și bundling Vite finalizat fără erori.

```text
Source commit: 7552015
Local tests: 189 passed, 0 failed (100% pass rate)
Local build: passed (packages/*, apps/api, apps/worker, apps/web)
Cloud Build ID: e95389b2-39fc-469d-a97c-ba816af96c19 (SUCCESS, 3m35s)
Cloud Run revision: market-scanner-360-00188-l6d
Traffic: 100%
Public bundle: assets/index-DJEyS78j.js, assets/index-CMeskojC.css
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app
Custom URL: https://scanner.relayhub.no
Health check (/api/health): HTTP 200 OK (status: "ok", service: "market-scanner-360-api")
```








### 2026-09-16 — Tema nouă propusă: „Signal Graphite" (preview, neaprobat încă)
- Analizat UI actual (olive glass #181f13 + #b7df8a, radii 26px, blur peste tot) — decis: propunere de retemă, preview înainte de implementare.
- Direcție „Signal Graphite": grafit neutru (#0B0D10 / #12151A / #171B22), hairlines 1px, radii 12px, fără glass; accent lime semnătură (#C8F169) doar interactiv/brand; culori semantice de date: up #3DDC97, down #FF6B8A, warn #FFC24B, info #6FC7FF; Inter + tabular-nums (JetBrains Mono pentru micro-labels), floor 12px.
- Preview: `tmp/design-preview/theme-signal-graphite.html` (mockup self-contained, zone reale: sidebar, topbar, hero, KPI, Alerte, tabel Semnale). QA numeric: 0 overlaps (inclusiv thead vs row1), 0 truncări, toate fonturile ≥12px, contrast AA pe toate perechile testate (muted #8791A1 pe superficii, chip-uri pe carduri).
- Bug găsit la QA: `position:sticky; top:58px` pe thead într-un wrapper `overflow-x:auto` → Chrome computa overflow-y:auto și împingea header-ul 58px peste primul rând. Fix în mockup: thead static (implementarea reală să folosească page-level sticky corect).
- De implementat DOAR după aprobarea utilizatorului: index.css (token map global), tailwind.config.js (remap cyan/blue/purple/violet → grafite+lime), componente cu clase hardcodate.


### 2026-09-16 — Signal Graphite implementat în aplicație (temă nouă)

Aprobat de utilizator după preview (`tmp/design-preview/theme-signal-graphite.html`). Implementare completă:

- `apps/web/tailwind.config.js` — culori remapate pe Signal Graphite (numele istorice rămân, doar hex-urile se schimbă): cyan→lime #C8F169, blue→info #6FC7FF, purple/violet/fuchsia→violet AI, emerald/green→mint bullish #3DDC97, rose/red→coral bearish #FF6B8A, amber/orange→warn #FFC24B, background→grafit (#0B0D10/#12151A/#171B22/#232A35/#1D222B). Fonturi: Inter + JetBrains Mono (înlocuiește mono→sans).
- `apps/web/src/index.css` — rescris complet: selectorii păstrați, valori noi; fără glass/blur în exces (suprafețe plate + hairlines), radii 12–14px, accent lime doar pe interactiv, secțiunile legacy (cyber-glass, intelligence, mobile dock, AI prose) recolorate. Backup original: /tmp/ms-index-css.original.bak (necomis).
- `apps/web/index.html` — theme-color #0B0D10 + preconnect/load Inter + JetBrains Mono.
- Migrare scriptată hex→hex în 15 componente (tabel explicit): cele mai frecvente: #202b22→#151A21 (43×), #10b981→#3DDC97 (23×), #f43f5e→#FF6B8A (18×), #06b6d4→#C8F169 (18×), #38bdf8→#6FC7FF (16×), plus gradiente navy→grafit și olive→grafit. Scan final: 0 hex-uri în afara paletei noi în sursă și în bundle-ul construit.

**QA (aplicația reală, preview local cu date demo, 1440px + 390px):**
- 0 overlap-uri structurale, 0 truncări (tabel scanner, header, sidebar).
- body bg rgb(11,13,16) ✓, font Inter ✓, mono JetBrains Mono ✓; nicio urmă din paleta veche (singurul hit = badge-ul de preview al serverului local de mock, actualizat și el).
- Build monorepo complet ✓ (pachete + api + worker + web). Bundle web: `index-B3dpyl4W.css`, `index-fH1itNGD.js`.
- Teste monorepo: 242 pass / 0 fail (5+10+9+13+8+8+116+73).

**Deploy producție (2026-09-16):**

```text
Source commit: df2f379
Local tests: 242 passed, 0 failed
Local build: passed (packages/*, apps/api, apps/worker, apps/web)
Cloud Build ID: 5d242fe1-3849-440c-b214-bee11394eabd (SUCCESS, 5m25s)
Cloud Run revision: market-scanner-360-00190-xpm
Traffic: 100%
Public bundle: assets/index-fH1itNGD.js, assets/index-B3dpyl4W.css (lime #c8f169 prezent în bundle; zero hex-uri din paleta veche)
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app
Health check (/api/health): HTTP 200 OK (status: "ok", service: "market-scanner-360-api")
```

**scanner.relayhub.no — indisponibil (cauză externă, NU de la temă/deploy):**
- DNS: `scanner.relayhub.no` → NXDOMAIN la nameserverul autoritativ (`ns01/ns02.one.com`); zona a fost modificată recent (serial 2026091501 → 15.09.2026). Recordul pentru `scanner` nu mai există.
- GCP: nu mai există nici domain mapping-ul (`domain-mappings list` = 0), iar Cloud Run nu permite crearea de domain mappings în `europe-west3` (501 UNIMPLEMENTED). Certificatul LB-ului existent (`relayhub-cert-v2`, creat 15.09) acoperă doar `relayhub.no`; URL map-ul nu are host rule pentru `scanner`.
- Deci ruta completă către `scanner.relayhub.no` lipsește acum. Restaurare posibilă: (a) rută prin LB-ul existent (serverless NEG → market-scanner-360 + backend + host rule + certificat pentru `scanner.relayhub.no`) + record DNS A → 8.232.135.187 la one.com; sau (b) se folosește doar URL-ul run.app. În așteptarea deciziei utilizatorului.

**Restaurare scanner.relayhub.no — partea GCP făcută (2026-09-16):**
- Firebase Auth: adăugat `scanner.relayhub.no` la authorizedDomains (altfel Google Sign-In nu merge pe domeniu).
- LB existent (8.232.135.187): NEG serverless `scanner-neg` (→ market-scanner-360, europe-west3) + backend `scanner-backend` (EXTERNAL_MANAGED) + host rule `scanner.relayhub.no` în `relayhub-url-map` → scanner-backend (relayhub.no neatins).
- Certificat managed `scanner-relayhub-cert` (scanner.relayhub.no) atașat la `relayhub-https-proxy` alături de `relayhub-cert-v2`; status PROVISIONING — se activează după ce DNS-ul indică LB-ul.
- HTTP→HTTPS: redirect global deja existent (relayhub-http-redirect) acoperă și scanner.
- Rămâne (user, one.com): record DNS `A scanner → 8.232.135.187`. După propagare, certificatul devine ACTIVE și `https://scanner.relayhub.no` funcționează.


### 2026-09-16 — Follow-up: fundaluri mai rotunde și moderne

Cerut de utilizator („schimbă fondurile din pagina web cu ceva mai rotund și modern").

- **Fundal**: `body` + `.app-shell::before` — glow-uri radiale rotunde, fixe: lime 9% (dreapta-sus), albastru 7.5% (stânga), violet 6.5% (jos); peste grafitul #0B0D10.
- **Suprafețe**: carduri (`.card-base`/`.card-elevated`/`.market-overview`) la **18px** radius (16px pe mobil la KPI) + sheen subtil sus; nav items 12px; more-menu mobil 18px.
- QA: computed styles verificate (18px, gradiente aplicate), screenshots desktop+mobil, teste web 73/73.

```text
Source commit: f4eb39d
Cloud Build ID: 55c193c6-1a80-4846-91b1-944d029be502 (SUCCESS, 4m24s)
Cloud Run revision: market-scanner-360-00191-25s
Traffic: 100%
Public bundle: assets/index-B06QgySA.js, assets/index-CFXPZzya.css (glow + radius 18px confirmate în CSS-ul servit)
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app
Health check (/api/health): HTTP 200 OK
```

### 2026-09-16 — Ultra Round (Varianta C) + Quicksand + paritate click Asset (Bubble/HeatMap)

Cerute de utilizator după preview-uri aprobate: **Varianta C** (rotunjit maxim, „Ultra Round") + **Varianta 3 de font (Quicksand)**; înainte de deploy, click pe Asset din **Crypto Bubble** și **Heat Map** trebuie să deschidă aceeași pagină informativă cu Money Line ca din **Market Scanner**.

**Temă Ultra Round:**
- `index.css` — blocul „Ultra Round": carduri **30px** desktop / **26px** mobil; `sidebar-nav-item` capsule (999px, fără bara inset de accent); watchlist + mobile-nav capsule; more-menu 26px; glow-urile ambientale păstrate.
- Sweep scriptat (21 fișiere): `rounded-2xl` → `rounded-[30px]` (75×), `rounded-3xl` → `rounded-[32px]` (2×), 0 rămase.
- Bare de progres Alerts: h-1.5/h-2 → h-2.5 (3 locuri).
- **Fonturi**: Quicksand (400–700) înlocuiește Inter (index.html, tailwind.config.js, index.css); cifrele rămân pe JetBrains Mono. QA computed: Quicksand ✓ (body+h1), 30px/26px ✓, nav 999px ✓.

**Paritate click Asset (cauză + fix):**
- Click-urile din Bubble/HeatMap trimit ID-uri exacte de provider → ruta `/assets/:symbol` intra pe ramura de verificare catalog; pentru coinii din afara catalogului static (70 intrări) pagina degrada la agregat (price-only, fără Money Line), în timp ce click-ul din Scanner (doar simbol) folosea ruta exchange (lumânări + Money Line).
- Fix 1 — `scanner-routes.ts`: `matchesLiveExchangeAsset` — nume normalizat verificat în `getTopCryptoAssets(150)`; la potrivire se continuă pe ruta exchange (paritate Scanner), altfel agregat.
- Fix 2 — `CryptoHeatMapView.tsx` + `App.tsx`: id-urile se trimit corect (`coinGeckoId` + `coinPaprikaId`); înainte, `coin.id` (paprika id pentru sursa fallback) era trimis ca coinGeckoId.
- Test nou în `crypto-market-profile.test.ts` (13/13 ✓); suita monorepo **243/0**.
- E2E local (mock): Scanner / Bubble / HeatMap → AssetDeepDiveView identic (back + chart + Money Line, 7 canvasuri).

```text
Source commit: 6f5b050
Local tests: 243 passed, 0 failed
Local build: passed (packages/*, apps/api, apps/worker, apps/web)
Cloud Build ID: 084e73eb-3f5a-4f48-b763-771128d96cdc (SUCCESS)
Cloud Run revision: market-scanner-360-00192-n6z
Traffic: 100%
Public bundle: assets/index-Dv72kFR9.js, assets/index-CkbwBYnm.css (Quicksand + border-radius:30px confirmate în CSS-ul servit)
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app
Health check (/api/health): HTTP 200 OK
```

### 2026-09-16 — Theme engine: dark + 5 teme light cu comutator (Zi/Noapte)

Cerut de utilizator: „temă light pentru zi, dark rămâne pentru seară — dă-mi preview pentru 3 variante", apoi „încă 2 variante mai colorate ca L2" și „implementează-le pe toate într-un buton cu soare + dropdown modern".

**Motor de teme:**
- Tokeni CSS `--t-*` (hex + rgb triplets) pentru 6 teme (`dark`, `l1` Paper, `l2` Ivory, `l3` Liquid, `l4` Mint, `l5` Sorbet) în `apps/web/src/theme.css` — GENERAT de `apps/web/tools/gen-theme.py` (sursa de adevăr; editează scriptul și rulează `python3 apps/web/tools/gen-theme.py`). Comutare: `<html data-theme="dark|l1…l5">`.
- `tailwind.config.js`: scalele de culori referă `rgb(var(--t-…-rgb) / <alpha-value>)` (inclusiv `white` → rol de text: alb pe dark, near-black pe light; `slate` se întoarce pe light). Valorile DARK = exact paleta Signal Graphite anterioară (nimic schimbat vizual pe dark).
- `index.css`: hex-urile paletei → `var(--t-*)`; blocurile Ultra Round folosesc `--t-bg-image`/`--t-sheen`; peste 40 de hex-uri literale din componente (`bg-[#151A21]` etc.) → `var(--t-surface-raised)` sau `rgb(var(--t-…-rgb)/α)`; `InteractiveChart` citește `--t-bg/--t-muted/--t-line` la runtime (inclusiv widget TradingView: theme light/dark + toolbar_bg din token).
- Pitfall rezolvat: pașii foarte deschiși ai scalelor (50/100/200) sunt folosiți ca TEXT pe dark (`text-emerald-50` pe bule, `text-violet-200` pe Alerts etc.) → pe light trebuie valori ÎNCHISE; altfel text ≈ invizibil pe fundaluri palide. La fel `heatColor` (tile-uri) + chip-uri.
- QA: script multi-tab (contrast heuristic pe `main *`, prag 1.8) — 0 probleme pe Market/Bubble/HeatMap/Alerts în L1 și L5; dark neschimbat. Playwright: comutatorul setează `dataset.theme` + `localStorage['ms-theme']` ✓; boot script în `index.html` aplică tema salvată înainte de primul paint.

**Comutator UI:** `apps/web/src/components/ThemeSwitcher.tsx` — buton ☀️/🌙 (pill, glow lime când e light) în header lângă selectorul de limbă; dropdown „modern" (sticlă, 24px radius) cu Dark + L1…L5, swatch-uri circulare, subtitlu RO, bifă pe activ. Închidere la click în afară / Escape.

```text
Source commit: a811421
Tests: 243 passed, 0 failed
Cloud Build ID: 2d4b6042-44ef-4d33-b719-1762df7893be (SUCCESS)
Cloud Run revision: market-scanner-360-00193-zc6
Traffic: 100%
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app
Health check (/api/health): HTTP 200 OK
```

### 2026-09-16 — Top bar rearanjat + teme 100% solide (fără transluciditate)

Cerut de utilizator (screenshot): scos indicatorul LIVE verde (fără funcționalitate), refresh scos de pe mobil, butoanele alarmă/temă/limbă mai mici și egale, bara timeframe mai mare; nicio temă translucidă/transparentă — toate să aibă palete de culori solide distincte (stil Ivory).

- `Header.tsx`: scos `isStale`/bula LIVE; refresh doar desktop; clopoțel/temă/limbă → 3 butoane egale mici (`w-9 h-9 rounded-full`); bara timeframe mai lată (`rounded-full … p-1`); iconița `Bell` (nu `BellRing`).
- `gen-theme.py`: L3 Liquid → **L3 · Sky** (albastru solid, fără sticlă), L5 Sorbet carduri opace, toate headerele solide; fără blur/sheen.
- QA: 20/20 scanări de contrast curate (5 teme × 4 tab-uri); web tests 73/73.

```text
Source commit: 0ed52bf
Cloud Build ID: 90988f93-874b-4f4a-8d92-dfc00bff871b (SUCCESS)
Cloud Run revision: market-scanner-360-00194-5sb
Traffic: 100%
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app
Health check (/api/health): HTTP 200 OK
```

### 2026-09-16 — Bara de tabel: freeze flush (nu floating, fără date deasupra)

Cerut: „bara e floating și se văd date deasupra ei când fac scroll; vreau exact ca tabelul, să nu fie floating, dar să rămână fixă (freeze)".

- **Cauză (măsurată, nu ghicită)**: cutia de scroll a tabelului are clasa `card-base` ca fiu direct al `.scanner-section` → primea `padding: 20px` (desktop) / `10px` (mobil). Într-un scrollport cu padding, rândurile curg **prin banda de padding de deasupra** thead-ului sticky → fâșie de 11px (mobil) / 21px (desktop) cu conținut de rând vizibil „deasupra barei". În plus, `shadow-md` (thead) + `shadow-2xl` (cutie) + `shadow-[4px_0_12px…rgba(0,0,0,0.8)]` (coloana sticky) + `td:first-child { box-shadow:#000 }` dădeau aspectul de „floating".
- **Fix**: clasă `scanner-table-scroll` + regula `.scanner-section > .card-base.scanner-table-scroll { padding: 0 }` (leak 11px → 1px = doar bordura); `thead`/`th` bg → `var(--t-surface)` (culoarea exactă a tabelului, nu tinta `raised`); eliminați toți cei 4 shadow-i. Sticky `top-0` + z-20/30 păstrate (freeze).
- **Verificat**: leakPx=1 (mobil + desktop, măsurat în DOM), vizual L1 + dark (niciun rând deasupra header-ului, flush, solid), web tests 73/73, tsc clean.

```text
Source commit: 9a844b1
Cloud Build ID: 7cae8eb9-c647-48cb-ae91-ff7d226a9f17 (SUCCESS)
Cloud Run revision: market-scanner-360-00195-b5s
Traffic: 100%
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app
Health check (/api/health): HTTP 200 OK
```

### 2026-09-16 — Acoperire: tile-uri = filtre, rânduri = deep-dive Money Line

Cerut: „meniurile să fie interactive — click pe filtre să filtreze proiectele de mai jos; click pe listă să se deschidă panoul cu Money Line".

- `AlertsCenterView.tsx`, secțiunea „Acoperirea ultimei scanări":
  - cele 5 tile-uri (CONFIRMAT / CANDIDAT / FĂRĂ SETUP / DATE INSUFICIENTE / EROARE) sunt acum **butoane toggle** (`coverageStatusFilter`): click = filtrează lista după status, click din nou = reset la toate; tile-ul activ păstrează tonalitatea statusului; iconiță funnel adăugată ca affordance.
  - rândurile din listă sunt **butoane** → `onOpenAsset(item.symbol, item.marketClass, '1w')` → aceeași pagină deep-dive Money Line ca din Scanner (chevron „>" ca affordance; `aria`/title).
  - listă goală sub filtru → mesaj „Niciun activ pentru filtrul selectat" (înainte blocul întreg dispărea, inclusiv căutarea).
- `tmp/design-preview/server.cjs`: mock `/api/alerts/dashboard` cu `scanCoverage` în toate cele 5 statusuri (QA local).
- QA (Playwright, mobil 390px + desktop): 8 rânduri → Candidat=2 (AI, MON) → Confirmat=3 (XTZ, LUNC, DCR) → Eroare=1 (ZRX9) → toggle-off=8; click rând XTZ → deep-dive cu back button, 7 canvasuri, text Money Line; vizual L1 confirmat. Teste monorepo **243/0**, tsc clean.

```text
Source commit: b98e22e
Cloud Build ID: 2762a5ed-6a3e-44d8-9604-1bdb8e14a840 (SUCCESS)
Cloud Run revision: market-scanner-360-00196-5t4
Traffic: 100%
Public bundle: assets/index-DKwhbiRu.js (conține «Niciun activ pentru filtrul selectat», «Deschide analiza Money Line pentru», «Filtrează:» — verificat în JS-ul servit)
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app
Health check (/api/health): HTTP 200 OK
```

### 2026-09-18 — Compactare acoperire/SMA + fără re-scan la revenirea pe Alerte

Cerut: buton de retragere/compactare pe „Acoperirea ultimei scanări” și „Recuperare SMA 50 + 200 · 1D”; la ieșirea din Alerte și revenire să rămână ultima variantă scanată, actualizare doar la refresh manual.

- Acoperirea și SMA au același header cu ChevronDown ca Flipuri/Candidați (`aria-expanded`, titlu Compactează/Extinde). Starea open/closed e persistată în `localStorage` (`ms-alerts-coverage-open`, `ms-alerts-sma-open`).
- Tab-ul Alerte rămâne montat după prima vizită (`alertsVisited` + `hidden` în `App.tsx`). Snapshot-ul dashboard e ținut în cache de modul (`rememberAlertsDashboard`); re-intrarea nu mai apelează `GET /alerts/dashboard` (care re-cotează prețuri live și părea o scanare). Intervalul AUTO REFRESH 60s a fost scos. Refresh doar pe „Actualizează” sau cât timp rulează o scanare manuală.
- Teste web 78/0, tsc clean. Bundle public `assets/index-B4NrCa5i.js` conține stringurile de compactare.

```text
Cloud Build ID: d925ee30-3fb3-4c75-8eca-4c5c10d41c09 (SUCCESS)
COMMIT_SHA: alerts-collapse-20260918
Cloud Run revision: market-scanner-360-00198-l24
Traffic: 100%
Public bundle: assets/index-B4NrCa5i.js
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app
Health check (/api/health): HTTP 200 OK
```

### 2026-09-18 — AI Briefing: fără gradient, suprafețe solide

Cerut: „nu-mi place designul gradient din pagina AI briefing… nu vreau gradient nicăieri în toată pagina”.

- `AIBriefingView`: scoase toate `bg-gradient-*`, textul `bg-clip-text`, orb-ul `blur-3xl` și stop-urile `via-[#12151A]`. Cardurile Briefing / Crypto Quality / Stock Quality folosesc `bg-[var(--t-surface)]`; titlul, bula user și butonul Send sunt pline, fără fade.
- Test: `ai-briefing-no-gradient.test.ts`.

```text
Cloud Build ID: 14e37e8d-ac37-448f-9776-b9c1ad25b395 (SUCCESS)
COMMIT_SHA: ai-briefing-solid-20260918
Cloud Run revision: market-scanner-360-00199-pmp
Traffic: 100%
Public bundle: assets/index-Cxnn01Ac.js
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app
Health check (/api/health): HTTP 200 OK
```

### 2026-09-18 — Crypto Business Quality: căutare DexScreener (ticker/adresă)

Cerut: bara de căutare din „4 Selection Criteria” să găsească orice monedă de pe DexScreener după adresă sau ticker și să evalueze cele 4 criterii.

- `GET /ai/crypto-four-criteria/lookup?q=` — DexScreener tokens (CA) sau search (ticker); scor DefiLlama dacă protocolul e unic, altfel proxy volum/lichiditate DexScreener (fără revenue inventat).
- UI: placeholder „Ticker sau adresă (DexScreener)…”, debounce 450ms, badge DexScreener pe rezultate în afara top 200.

```text
Cloud Build ID: 04ae3c3b-e6bb-49c9-9acb-f8299fe19f8a (SUCCESS)
COMMIT_SHA: dex-criteria-lookup-20260918
Cloud Run revision: market-scanner-360-00200-7lp
Traffic: 100%
Public bundle: assets/index-DFpZwt7g.js
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app
Health check (/api/health): HTTP 200 OK
```

### 2026-09-18 — Teme: carduri solide, contrast pe light și dark

Cerut: Analiză AI pe deep-dive era neagră pe temă light (text invizibil); totul light trebuie light, totul dark trebuie dark, fără transparență/gradient pe carduri, notat în memorie.

- Cardurile AI Analysis / Asset Profile / Quality / Alerts etc. folosesc `bg-[var(--t-surface)]`, nu hex graphite. Inner `bg-black/30` și `*-950` → surface-raised / tint 500/10.
- Teme light: `--t-bg-image: none`, fără sheen/gradient pe `.card-base`. Regulă canonică: `preference/ui-theme-surfaces`.

```text
Cloud Build ID: 06b8ae32-642e-44d1-bb7f-787c99af4534 (SUCCESS)
COMMIT_SHA: theme-solid-contrast-20260918
Cloud Run revision: market-scanner-360-00201-wwk
Traffic: 100%
Public bundle: assets/index-Y5Ziw_Xf.js
Public URL: https://market-scanner-360-384051756749.europe-west3.run.app
Health check (/api/health): HTTP 200 OK
```

### 2026-09-18 — Repo urcat pe GitHub

- Sursă urcată pe GitHub: https://github.com/mar1uz/money-scanner (privat). Remote `origin` = acel URL. `.env` rămâne local (gitignore); pe GitHub e doar `.env.example`.


### 2026-09-18 — Acces: adăugat tinotechads@gmail.com în ALLOWED_EMAILS (Viewer)

Cerut de utilizator: acces la aplicație pentru `tinotechads@gmail.com`.
- `cloudbuild.yaml`: ALLOWED_EMAILS += `tinotechads@gmail.com` (persistă la deploy-urile viitoare); `ADMIN_EMAILS` neschimbat.
- Serviciul live actualizat imediat: `gcloud run services update --update-env-vars '^|^ALLOWED_EMAILS=…'` → revizia **market-scanner-360-00202-bn6**, 100% trafic.
- Verificat: env pe revizie conține emailul; `/api/health` → 200. Mecanism: Firebase Auth (Google) + middleware `isAllowedEmail` (403 pentru emailuri nepermise).
- Rol implicit nou utilizator: **Viewer** (nu Administrator — se adaugă în ADMIN_EMAILS doar la cerere).

### 2026-09-18 (2) — Rol Administrator pentru tinotechads@gmail.com

- `cloudbuild.yaml`: `ADMIN_EMAILS` += `tinotechads@gmail.com`; serviciul live actualizat imediat → revizia **market-scanner-360-00203-tz9**, 100% trafic.
- Verificat: env pe revizie (ADMIN_EMAILS = marius + tinotechads); `/api/health` → 200.

### 2026-09-18 (3) — IAM: acces Google Cloud pentru tinotechads@gmail.com

Blocajul raportat („Google Cloud spune că tinotechads@gmail.com nu are permisiune pe proiect") era real: emailul NU avea nicio legătură IAM (verificat pe toate cele 7 proiecte ale tenancy-ului — 0 bindings). Accesul dat anterior era doar la nivel de APLICAȚIE (ALLOWED_EMAILS/ADMIN_EMAILS pe Cloud Run), nu de proiect GCP.
- Grant: `roles/editor` + `roles/iam.serviceAccountUser` pe `gen-lang-client-0610749770` pentru `user:tinotechads@gmail.com` (editor acoperă Cloud Build submit, Cloud Run deploy, Artifact Registry, Storage; serviceAccountUser acoperă actAs pentru conturile de serviciu folosite la deploy).
- Verificat: ambele bindings prezente în `get-iam-policy`. Propagarea IAM: secunde–minute.

### 2026-09-19 — Instinct local pilot (Hermes connector) pe Mac

Instalat `~/.hermes-connector` (LaunchAgent `local.hermes-connector`) pentru Instinct: MCP pe `127.0.0.1:8765`. Upgrade 2026-09-19: root aprobat = `/Users/marius/antigravity` + `project_terminal` (argv-only, sandbox-exec). Token pairing, Serve, deny-globs, expirare neschimbate. Browser dedicat pe CDP **9323** (nu 9223 — Cloak). Serve tailnet only pe `https://mariuss-macbook-air.tail452b0a.ts.net/` → 127.0.0.1:8765. Stop: `bash ~/.hermes-connector/stop.sh`. Pilot expiră 2026-10-03. Backup: `~/.hermes-connector/backups/pre-terminal-20260919-133354`.

## Step 88 — Deploy + verificare vizuala finala (2026-09-20, 23:03 CEST)
- Build Cloud Build 4a9b9c45 (manual, cu --substitutions=COMMIT_SHA=<short> pentru ca COMMIT_SHA nu exista la submit manual; la trigger builds e setat automat).
- Adaugat .gcloudignore (e00c9ba): .env* si scratch NU mai intra in contextul de build (seatbelt-ul local bloca citirea .env.example si gcloud crasa; plus igiena secretilor).
- Revizie live: market-scanner-360-00214-hmm (europe-west3), scanner.relayhub.no.
- Verificat in browser (sesiune Google tinotechads@gmail.com): tab TradingView extern randeaza BYBIT:GRASSUSDT 1W cu grafic real (nu mai apare 'simbolul nu exista'); link extern -> tradingview.com/chart/?symbol=BYBIT:GRASSUSDT; iconita Deschide Tab TradingView in bara de taburi; control Alerta pret functional (regula GRASS >= 0.35 creata din UI, a fost consumata one-shot = a tras); back-nav alerte -> asset -> back -> ?tab=alerts (fix confirmat).
- Nota: 'Data refresh error: Failed to fetch' observat o singura data in timpul swap-ului de revizie (min-instances=0, cold start) - tranzitoriu, nu regresie.

### 2026-09-21 — Sistem alerte MA 2x2 + Structure Scanner (paper)

**Sistemul de alerte MA 2x2** (`MA_2X2_CROSS_RETEST`, commit 7355794):
- `apps/api/src/services/ma-cross-alert-service.ts`: evaluator pur, non-repainting, pe lumânări închise. Etape: daily stage 1 🔔🟡 (închidere trece peste SMA50 cu SMA50>SMA200), daily stage 2 🔔🟢 (retest SMA50 care ține, aliniere bullish, FĂRĂ cerință de cross recent), weekly stage 1 🚨🟡 (închidere peste SMA50+SMA200 săptămânale), weekly stage 2 🚨🟢 (retestul mediei săptămânale superioare ține; confirmare la închiderea săptămânii).
- `apps/api/src/services/ma-cross-alert-runner.ts`: o singură trecere zilnică la **08:00 Europe/Oslo** (timer în AppState, pattern-ul scanării de regim) + endpoint `POST /api/alerts/ma-cross/scheduled` (token daily-scan). Filtru anti-spam: market cap > $100M, stablecoin-uri excluse, top 150. Cross-urile stage 1 se batchează într-un SINGUR digest (top 5, ordonare JEV: scor MoneyLine, apoi rank). Retesturile rămân individuale, cu bloc setup factual (zonă entry, stop 0.5xATR sub min(low,SMA50), invalidare, mișcare de la flip-ul confirmat, RVOL 20) — fără limbaj de semnal de cumpărare. Fiecare mesaj include regimul BTC (aliniere SMA + scor ML). One-shot per activ pe retest cu re-arm doar după pierderea mediei. Persistență: Firestore `money-scanner-360` (`ma-cross-alert-*`, retenție 90 zile), dedupe pe livrări ca la reclaim runner.
- Regim BTC: `computeBtcRegime` (SMA50/200 1D + scor/tier MoneyLine).

**Structure Scanner** (`STRUCTURE_SCANNER_PAPER`, commit 3e25e6c) — **PAPER/LOGGING-ONLY, tier 🔵, NICIUN mesaj Telegram**:
- `structure-scanner-service.ts`: detector geometric — pivoturi swing (lățime 3), clustere de zone S/R (toleranță max(0.75xATR, 0.4%)), canal de regresie liniară (120 bare, ±2σ), confluență = preț la zonă (<0.5 ATR) + jumătatea potrivită a canalului (|σ|≥0.5).
- `structure-scanner-runner.ts`: rulează pe închiderile de 4H/8H/1D (la fiecare 4h UTC, timer în AppState) + endpoint `POST /api/alerts/structure-scanner/scheduled`. Poartă JEV: regimul zilnic al activului + confluența BTC (eticheta `passesJev` pe fiecare log). Loguri: Firestore `structure-scanner-logs` (dedupe per simbol/timeframe/side/oră), rapoarte `structure-scanner-reports`. Forward-testing înainte de orice alertare live.

Teste: 17 noi (10 MA 2x2 + 7 structure scanner); suita API completă 155/155 verde; `tsc --noEmit` curat.

## Step 89 — Continut AI real pe paginile AI Briefing + Intelligence (2026-09-21, 01:10 CEST)
- Revizie live: market-scanner-360-00216-5pz (build 1e3ef0b4, commit 6ee07b8). Tip partajat AIContentTake + aiTake optional pe payload-uri; POST /api/ai/publish-content (token daily-scan); endpoint-urile ataseaza take-ul daca e proaspat (<36h); AIBriefingView + IntelligenceView randeaza blocul (antet Sparkles 'AI Gateway · model').
- Writer local: scripts/ai-content-writer.mjs — citeste cheia AI Gateway prin process.loadEnvFile din ../jev-router/.env.local (niciodata afisata), input CoinGecko + ultimul JEV Insight, genereaza 2 take-uri (market-intelligence, intelligence-brief) cu inception/mercury-2.5 prin AI SDK (createGateway din node_modules jev-router, ca jev-insight.mjs). Token-ul de publish citit la runtime din Cloud Scheduler (money-scanner-regime-tape-scan), neafisat.
- Declansare: insight/run-insight.sh — mod nou 'aicontent' (allowlist) + writer-ul ruleaza dupa trecerea zilnica de 07:45. Log: insight/ai-content.log; audit: insight/audit.log.
- Capcana: mercury-2.5 intoarce text gol daca maxOutputTokens e prea mic (2000); trebuie 6000 + AbortSignal.timeout(180000), ca in jev-insight.mjs.
- Verificat: ambele documente in Firestore (operations/ai-cache-ai-content-*, db money-scanner-360), continut real in romana (01:07). Suita: api 155/155, web 80/81 (singurul esec = binarul Playwright lipsa pe Mac, pre-existent).

### Step 89b — al treilea take: briefing (2026-09-21, 07:33 CEST)
- /api/ai/briefing cauta cheia 'briefing', dar writer-ul publica doar 'market-intelligence' si 'intelligence-brief' -> blocul nu aparea pe pagina AI Briefing. Adaugat a treia generare in scripts/ai-content-writer.mjs (cheie 'briefing', prompt pentru briefing zilnic). Republicat 07:26: toate cele 3 endpoint-uri atașeaza take-ul. Verificat vizual (sesiune Google): bloc 'AI Gateway · inception/mercury-2.5' randat pe AI Briefing si Intelligence.

## Step 91 — /tape pornește mereu în engleză + validare forward pentru scor (2026-09-21, 11:45 CEST)
- /tape (pagina publică pentru audiența X engleză): `resolveInitialLanguage()` în `apps/web/src/i18n.tsx` forțează engleza la pornire pe `/tape` indiferent de preferința salvată; restul aplicației păstrează preferința (implicit română). Teste în `apps/web/src/i18n.test.ts`. Revizie: market-scanner-360-00219-ptx (commit 9a48c29).
- Validare forward a scorului redesenat (doar paper/logging): `scripts/forward-test-score-bands.mjs` + core pur. Protocol predeclarat: benzi <45/45-55/55-65/65-75/75+ pe `priorityScore`, intrare la `confirmationPrice` cu 0.075% fee + 0.05% slippage per parte, ieșiri fixe +7d/+14d/+30d din citirile zilnice ale scanerului, doar flipuri confirmate ≥2026-09-21 (fără leakage), log append-only `tmp/paper-trades/score-bands-forward.jsonl`. Review fix: 60 intrări sau 2026-12-21. 9/9 teste; commit 4a6664d. Rulare zilnică după scanarea de 08:00 (București) prin wake-ul agentului. Atenție la semantica `confirmDate`: se măsoară de la momentul confirmării (închiderea lumânării), nu de la deschiderea ei — la săptămânal altfel ieșirile +7d se închideau instant.

## Step 92 — Conținut AI pe limba UI + secțiunea Capital Rotation (2026-09-21, 12:00 CEST)
- Problemă: blocurile „AI take" erau generate doar în română, deci UI-ul în engleză arăta conținut AI românesc. Fix la nivel de pipeline: endpoint-ul `POST /api/ai/publish-content` acceptă acum `language` ('ro'|'en') și `source` ('ai-gateway'|'instinct-agent') și stochează per limbă (`ai-content-<key>-<lang>`; cheia veche rămâne fallback RO). Atașarea citește copia pe limba cererii pe `/ai/market-intelligence`, `/intelligence/brief` și `/ai/briefing` (care acum acceptă `?language=`).
- `scripts/ai-content-writer.mjs` generează fiecare take în ro + en (2×3 generări) și publică ambele. UI etichetează sursa („AI Gateway" vs „Instinct").
- Secțiune nouă „Capital Rotation" pe AI Briefing (card amber, titlu RO „Rotație de Capital"): conținut cross-market despre rotații mari spre metale/stocks/crypto și narațiuni (cipuri, robotică, AI), scris de agentul de conținut Instinct. Cheie nouă `capital-rotation`, atașată pe market-intelligence + briefing. Publicare agent: fișiere JSON în `tmp/ai-content-outbox/` + `scripts/instinct-content-publisher.mjs` (tokenul rămâne pe Mac, citit din jobul Cloud Scheduler, neprintat).
- Bonus în aceeași tură: completate lipsurile din harta RO→EN pentru chrome-ul vizibil pe /tape (sidebar, search, filtre piețe). Commit 7232f70, revizie market-scanner-360-00220-pj5; verificat vizual EN+RO pe /tape, AI Briefing, Intelligence.

## Step 90 — Scor setup diferențiat pentru flipuri (2026-09-21, 08:35 CEST)
- Problema: toate flipurile confirmate afișau 100/100. Cauza: formula veche `92 - min(dATR,4)*18 + boosturi` — la flip confirmat distanța se zeroa și statusBoost +22 ducea totul la 114+, tăiat la 100. Formula fusese făcută pentru candidați apropiați, nu pentru confirmate.
- Formula nouă (aprobată de Marius 21.09, 07:47), `apps/api/src/services/flip-priority-score.ts` — aceiași scară 0-100, cinci componente interpretabile: distanță de la trigger în ATR (0-30; 0 ATR = 30, ≥3 ATR = 0, măsurată și pentru confirmate = riscul de „a alerga după preț"), calitatea semnalului ML (0-25, compozitul -100..+100 liniar), aliniere weekly (0-20; Strong = 20, Bullish/Bearish = 14), volum RVOL (0-15; ≥2 = 15, liniar 0.8-2), structură SMA (0-10; preț vs SMA50 +4, vs SMA200 +3, SMA50>SMA200 în direcția flipului +3). Același câmp `priorityScore`, fără schimbare de schemă API/UI.
- Bug descoperit la verificare (commit 75daa20): `mergeConfirmedFlips` departaja egalitățile de `confirmedAt` după scor DESC, deci un 100 vechi din starea restaurată bătea mereu rescoringul proaspăt al aceluiași flip — de aceea 1W și metalele rămâneau la 100 și după deploy. Acum intrarea proaspătă câștigă pentru același flip sau unul mai nou; o intrare restaurată nu e niciodată retrogradată de un flip mai vechi.
- Revizie live: market-scanner-360-00218-4q2 (build 2b4a77d1; formula a intrat în 00217-pdh / build 83994476 / commit ea56fba). Verificat live după rescan manual: crypto-1w 34.1-100 (doar 3 la 100, legitime), metale 19.7-90.9, stocks 33.7-94.3; UI: AVAX 1W 84, XTZ 78, ETHFI 77, PENDLE 69. Teste: 27/27 (6 scor + 3 merge noi), tsc curat.
- Backtest validare (`apps/api/scripts/backtest-flip-score.ts`, 146 flipuri confirmate 1D pe 10 monede mari, ~2.7 ani Binance): Q1 (scor 33-45) ret30 -4.1%, Q3 +5.5% (hit 72%), Q5 medie +14.2% dar mediană -7.5% (vârfurile 90+ sunt climactice); Spearman scor vs ret14 = 0.152, vs ret30 = 0.024. Concluzie: scorul filtrează bine coada de jos și modelează 1-2 săptămâni; extremele mari sunt intrări climactice. Rămâne opțional: taper RVOL >4x (discount climax), dacă Marius vrea.
- Lecție: la verificare după deploy, rescan manual doar după ce traficul e 100% pe revizia nouă; starea restaurată poate păstra scoruri vechi (de aici și bug-ul de merge găsit).


## Step 93 (2026-09-21): Page-load performance batch (commit 73cb7d5, rev 00221-trm + 00222-rjb)
- compression middleware in apps/api: bundle 1,152,246B identity -> 304,368B brotli on the wire (3.8x)
- /api/overview: 5-min stale-while-revalidate cache + single-flight + parallel CoinGecko-global/FNG fetches
  (warm 744ms -> ~150-300ms server-side; always served from cache after first compute)
- Cloud Run min-instances=1 on market-scanner-360 (removes scale-from-zero cold starts; small fixed monthly cost)
- Known remaining: /api/scanner cold-instance recompute 76-121s during instance churn (CoinGecko rate limits);
  candidate batch D: SWR response cache on /api/scanner (trades minute-level freshness for instant loads).


## Step 94 (2026-09-21): CoinGecko Demo API key wired in (rev 00223-2pc)
- Free Demo plan key created on an Instinct-operated CoinGecko account (agent mailbox); account + key
  stored as agent entries in the vault. Key set as COINGECKO_API_KEY env var on Cloud Run (config-only
  revision; code already sent x-cg-demo-api-key when set). Direct API test with key: HTTP 200 in 166ms.
- Measured after: warm scanner 1,137-1,413ms (unchanged), warm overview ~190-350ms (SWR).
- Honest finding: the key did NOT fix the cold path - first load on a fresh instance is still
  60-110s for /api/scanner and ~40s for /api/overview. The dominant cold cost is per-asset
  quote/candle hydration (~219 assets x multiple timeframes) from exchange APIs, not CoinGecko
  rate limits. Candidate fix: a warmer keeping the min-instance caches hot (Cloud Scheduler or
  in-process interval) - responses stay freshly computed, no stale data served.


## Step 95 (2026-09-21): Cache warmer live (commits e20b513 + 25f6c98, rev 00225-lfp)
- GET /api/scanner/warm: token-guarded (x-daily-scan-token, exempt from session auth), single-flight;
  runs refreshSignals(1w, ALL) + getMarketOverview(). Cloud Scheduler job money-scanner-cache-warmer
  (europe-west3, every minute) keeps quote/candle caches perpetually hot on the min instance.
  Header token copied from the working daily-regime-scan job (Secret Manager latest had drifted from
  the running service's token - noted for future token work).
- Warm-run latency alternates ~1.1s / ~11s (1h candle TTL is 60s, so every other run refetches them).
- Measured first-open after: scanner 5.2s then 2.9s (was 60-110s cold), overview 429ms, DCL 1.75s.
- Scheduler job count now 6 (free tier is 3) -> marginal extra cost (~0.10 USD/job/mo beyond free).

## Step 96 — Mobile UI fixes, CoinGecko direct links, MCap class fix, per-asset Instinct guides (2026-09-21)

Revision market-scanner-360-00227-hmv (commits 99e5d89, 57ab5cc, ffeb8d4 + disambiguation fix).

1. **Mobile asset-page bar**: chart nav pill now wraps inside the card (`flex-wrap max-w-full`) - it no longer extends wider than the content below on phones.
2. **Button swap (mobile only)**: CoinGecko moved into the chart nav bar; TradingView extern moved to the flip/bias row. Desktop layout unchanged. `InteractiveChart` gained optional controlled-tab props (`activeTab`/`onActiveTabChange`) and `coinGeckoUrl`; uncontrolled use (AssetDetailModal) unchanged.
3. **Main-page loading**: clear loading panel (spinner + RO/EN text) while initial market data loads (App.tsx, market tab).
4. **CoinGecko direct links**: `/assets/:symbol` resolves the exact CoinGecko coin for crypto assets missing a catalog `coinGeckoId`. Shared tickers (CVX = Convex Finance vs tokenized Chevron) are disambiguated: candidates ranked, accepted only when the provider name matches a live exchange asset (`cryptoMarketProfiles.resolveCandidates`). Fallback stays the search link. Verified live: CVX→convex-finance, BTC→bitcoin, JASMY→jasmycoin; stocks untouched.
5. **MCap bug**: frontend catalog lookup now matches market class - crypto CVX no longer shows Chevron's $285B stock market cap (shows live $190M).
6. **Per-asset Instinct guides**: `publish-content` accepts `investment-guide-<SYMBOL>` keys (EN+RO); asset detail serves fresh (36h) takes as `investmentGuide.{ro,en}`; the deep-dive "Ghid de Investiție & Verdict AI" section shows the Instinct take with attribution above the template guide. Publisher script accepts the key pattern. Cadence design: pre-generated daily by the content agent for fresh-flip (24h) + top ~15 assets (on-demand impossible - generation credentials live on the Mac, not Cloud Run). Seeded CVX EN+RO as pipeline proof.

Alert diagnosis (no fix applied): the asset-page bell button calls POST /api/alerts/test which hardcodes 1h and forces `evaluateSignal(force=true)` - forced sends print `previousTier → tier` (identical when no flip) under the fixed "FLIP CONFIRMAT" heading. Engine flip detection itself is correct (`isTransition = prevTier !== currentTier`). Labeling fix would be in packages/notifications/src/alert-dispatcher.ts.

## Step 97 - Asset Profile Instinct takes + On-Chain Data section + i18n compound ages (Sep 21 16:25)

- asset-profile-<SYM> keys now accepted by /api/ai/publish-content and scripts/instinct-content-publisher.mjs (same outbox contract, 36h freshness, EN+RO) - mirrors investment-guide.
- Asset-detail API serves assetProfile takes + new onchain metrics (apps/api/src/services/onchain-metrics.ts): supply/unlock %, ATH/ATL distance, 24h volume/mcap (CoinGecko /coins/markets, demo-key header, 15-min cache), TVL + TVL/mcap + 24h protocol fees from DefiLlama (protocols list matched by gecko_id, cached 6h; /summary/fees/<slug> total24h). Assets without a DefiLlama protocol entry (e.g. Celestia TVL) omit those fields gracefully; crypto only.
- New OnchainDataCard on the asset AI tab (chips: supply unlocked, ATH/ATL distance, vol/mcap, TVL, fees 24h, RO+EN, source note). AssetProfileOverviewCard renders the Instinct take (attribution + headline + paragraphs + bullets) above the template profile when published.
- i18n: compound flip-age patterns ("acum X zile și Y ore" / "acum X ore și Y minute") translate before the simple patterns; singular zi/oră forms fixed. Root cause was the simple pattern eating the prefix and leaving " și 14 ore" untranslated.
- Seeded asset-profile-TIA EN+RO (Celestia: modular DA, blobspace fees + staking, unlock/competition risks).
- Bell/test-alert behavior intentionally UNTOUCHED (label bug + 1h hardcode remain) per Marius 16:13: he wants neither test change nor standing alert from the bell.
- Live on market-scanner-360-00228-5vh (traffic 100%), verified visually RO+EN on the TIA page.
- Housekeeping: .instinct-tmp/ untracked + gitignored (was swept into 0d688bc by git add -A).

## Step 98 - Business Quality tab (undervalued ranking) + 4-criteria score audit (Sep 21 17:00)

- New top-level tab "Business Quality" (BusinessQualityView.tsx, tab key business_quality, Sidebar CERCETARE group): sorts covered top-200 crypto most-undervalued first. Index = quality percentile - expensiveness percentile. Quality 0-75 = Network Effect + Sustainable Revenue + Holder Value (existing thresholds). Valuation P/R = mcap/(revenue30d x 12), fallback P/F = mcap/(fees30d x 12) for L1s without protocol revenue. Assets without fees/revenue are never ranked (honest unranked count). RO+EN, methodology + heuristic disclaimer in the UI.
- Backend: buildUndervaluedRanking in crypto-four-criteria-scanner.ts; new shared type CryptoUndervaluedEntry; scan payload gains undervalued[] + unrankedCount (fixture updated in crypto-business-quality-lookup.test.ts). Existing 4-criteria section/score UNTOUCHED per Marius.
- Live on market-scanner-360-00229-xvc (commit 9a62559). Verified: 100 ranked / 100 unranked of 200; top PUMP(+82, P/R 3.2x) EDGE(+81) AERO(+80) RAY CAKE; bottom GRX DOT BCH ETC DASH (P/F 96K-1.9M, quality 12). Screenshot verified RO UI. NOTE: the scan route serves a persistent Firestore cache - after deploys that change the payload shape, force ?refresh=1 once.
- SCORE AUDIT (proposal pending, no changes made): (1) unknown scores 0 = fail - 72/200 assets with no DefiLlama data read as "worst businesses"; (2) $100K revenue threshold sits 20x below the $1.97M median of passers - weak discrimination at the top (49 pass); (3) tie-break by absolute revenue30d favors scale, not strength; (4) growth unknown for 44% and TVL change is price-contaminated; (5) L1 double-penalty: chain fees to validators/stakers count as revenue-fail and holderValue is 61% unknown because holdersRevenue doesn't cover staking.

99. 2026-09-21 Business Quality: universe expansion + selection semantics + threshold recalibration + L1 fix (rev 00230-74q; commits 652cd44, 63208e4, 4830882). Pipeline inverted: starts from DefiLlama fees/revenue/holders overviews (all covered protocols), matches to CoinGecko via /protocols gecko_id + markets-by-ids chunks (250/chunk, demo key header, chunk failure = warn+skip). Live verified: 413 universe, 269 ranked, 144 unranked; undervalued top GP(#1096)/ORE(#604)/PUMP(#51). Undervalued entries now FLAT (assetId/symbol/factorStatuses). Payload >950KB skips the persistent Firestore write by design (1MiB doc limit) and serves from the 30-min in-memory cache; cold instances re-scan ~15-80s. Recalibrated thresholds: networkEffect fees30d>=$1M AND (TVL>=$10M OR >=2 chains); sustainableRevenue basis30d>=$1M AND 7d/24h>0 AND continuity>=0.5 (L1s: chain fees count as revenue basis, fixing the validator double-penalty); holderValue holdersRevenue30d>=$100K (buyback/burn qualifies on its own). Section: measured-only listing, revenue-trend tie-break, no 30-cap.
100. 2026-09-21 EDGE dust-pair fix (commit 15c9b34, build 1428144b-5eca). dex-market-data: when the best exact DEX pair has liquidity <$25K while CoinGecko reports vol24h >$100K, pair is flagged pairIsDust; candles fall back to CoinGecko market_chart (candleSource='CoinGecko'), UI hides the misleading 'Piata DEX principala' card and labels the chart as aggregated price; Money Line computed ONLY from GeckoTerminal candles. Local verified: EDGE 1w 14 candles + 1h 288 from CoinGecko; UNI regression unaffected.
