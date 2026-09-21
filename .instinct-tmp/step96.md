
## Step 96 — Mobile UI fixes, CoinGecko direct links, MCap class fix, per-asset Instinct guides (2026-09-21)

Revision market-scanner-360-00227-hmv (commits 99e5d89, 57ab5cc, ffeb8d4 + disambiguation fix).

1. **Mobile asset-page bar**: chart nav pill now wraps inside the card (`flex-wrap max-w-full`) - it no longer extends wider than the content below on phones.
2. **Button swap (mobile only)**: CoinGecko moved into the chart nav bar; TradingView extern moved to the flip/bias row. Desktop layout unchanged. `InteractiveChart` gained optional controlled-tab props (`activeTab`/`onActiveTabChange`) and `coinGeckoUrl`; uncontrolled use (AssetDetailModal) unchanged.
3. **Main-page loading**: clear loading panel (spinner + RO/EN text) while initial market data loads (App.tsx, market tab).
4. **CoinGecko direct links**: `/assets/:symbol` resolves the exact CoinGecko coin for crypto assets missing a catalog `coinGeckoId`. Shared tickers (CVX = Convex Finance vs tokenized Chevron) are disambiguated: candidates ranked, accepted only when the provider name matches a live exchange asset (`cryptoMarketProfiles.resolveCandidates`). Fallback stays the search link. Verified live: CVX→convex-finance, BTC→bitcoin, JASMY→jasmycoin; stocks untouched.
5. **MCap bug**: frontend catalog lookup now matches market class - crypto CVX no longer shows Chevron's $285B stock market cap (shows live $190M).
6. **Per-asset Instinct guides**: `publish-content` accepts `investment-guide-<SYMBOL>` keys (EN+RO); asset detail serves fresh (36h) takes as `investmentGuide.{ro,en}`; the deep-dive "Ghid de Investiție & Verdict AI" section shows the Instinct take with attribution above the template guide. Publisher script accepts the key pattern. Cadence design: pre-generated daily by the content agent for fresh-flip (24h) + top ~15 assets (on-demand impossible - generation credentials live on the Mac, not Cloud Run). Seeded CVX EN+RO as pipeline proof.

Alert diagnosis (no fix applied): the asset-page bell button calls POST /api/alerts/test which hardcodes 1h and forces `evaluateSignal(force=true)` - forced sends print `previousTier → tier` (identical when no flip) under the fixed "FLIP CONFIRMAT" heading. Engine flip detection itself is correct (`isTransition = prevTier !== currentTier`). Labeling fix would be in packages/notifications/src/alert-dispatcher.ts.
