# Money Scanner — Project Handoff

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

---

This document is the implementation baseline. Update it whenever architecture, APIs, scope, security rules, or deployment decisions change.


---


