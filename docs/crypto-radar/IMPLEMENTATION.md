# Crypto Radar — modular implementation (2026-09-06)

## Accepted requirements
- Integrate into hosted Money Scanner, with incremental verified deployments.
- Required chains: Solana, Base (8453), Robinhood Chain (4663).
- Only provider-reported circulating market cap >= USD 500,000; never substitute FDV. Unknown capitalization is excluded.
- Discover new and existing active tokens. Rank by transparent market and social evidence; no promise of predictive edge.
- Preserve token identity as chain + contract (Solana case-sensitive), report history, initial reported price, subsequent price changes and rank movements. Keep dropped assets in history.
- Free public data sources only. No paid X API, paid LLM calls or new purchases. Hosting/storage have their normal existing cloud costs.
- Collect periodically; publish report every 12 hours. No dependence on browser uptime or in-process timers.

## Modules and acceptance gates
1. Types, pure identity/filter/scoring and history comparison. Tests: capitalization boundary, no FDV fallback, case-sensitive Solana, chain collisions, missing data, stable ranking, exits.
2. Market discovery adapters: GeckoTerminal trending/new pools for each required chain; DEX Screener enrichment and tracked-token refresh. Explicit source status and bounded requests. Sampled discovery, never claimed exhaustive.
3. Social registry: Telegram public channel previews, Bluesky search, Mastodon hashtags, CoinGecko search interest, RSS editorial context; optional operator-provided Farcaster Snapchain endpoint. Preserve provenance; absent engagement remains null. Deduplicate messages; strict token linking. Fomo/Reddit/Discord unavailable without confirmed access are not silently enabled.
4. Firestore storage, distributed scan lease, immutable report slots, first-report baseline, source health and notification delivery state. No successful report if persistence fails.
5. Authenticated Crypto Radar dashboard + owner-only scan trigger + scheduler-token endpoint. HTTP errors visible. Existing scanners unchanged.
6. Build/tests → first checkpoint deployment → authenticated/live cloud smoke checks → independent 30-minute collection and 12-hour report schedules → second checkpoint if production evidence requires changes.

## Cost controls
No LLM in normal scan/ranking/report pipeline. Bounded batches, one pool per token (avoid double counting), top candidate enrichment, shared collection snapshots, individual token documents, source timeouts and API pacing. More sources only when they add accessible evidence; configured-but-unavailable sources remain visible.

## Operational cautions
Current production daily technical scan is 08:00 Europe/Bucharest, not every 12 hours. Preserve it. New Radar schedules are independent in UTC (fixed 12-hour intervals through DST).
No reliable public Farcaster endpoint or Fomo feed API has been confirmed. Do not invent access. No credentials in source, logs or handoff.
