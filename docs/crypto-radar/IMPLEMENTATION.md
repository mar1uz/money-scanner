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

## Checkpoint 1 live evidence
- Commit cde1734; build 7f1d468f-2b7d-49b5-8437-092fded42ff4 SUCCESS; revision market-scanner-360-00163-pls (100% traffic).
- Cloud scan HTTP 200 persisted 48 eligible tokens: Solana 15, Base 16, Robinhood 17. Health HTTP 200; anonymous radar read and unsigned scheduler POST both HTTP 401.
- Actual source limits: Robinhood new-pools endpoint returned 429; trending + DEX enrichment worked. Bluesky search 403, Farcaster no configured endpoint; several Telegram groups lack public message archives. All shown honestly in source health.
- UI verified in authenticated Chrome: Crypto Radar page, three chain cards, collection/report selector, manual scan controls, and source statuses. Data reload and final report verification continue in checkpoint 2.

## Next modules after this working foundation
- Increase discovery breadth fairly by chain using persisted pagination cursors and call budgets; compare against token universe coverage rather than equating trending pages with full-chain indexing.
- Add holder history / wallet cohort flows using verified per-chain indexers or RPC data; do not infer wallet networks from aggregate buy/sell counts.
- Add an accessible Farcaster Snapchain source (operator endpoint required), and richer Telegram community access where permitted. Fomo needs an official access agreement/API; no undocumented feed assumption.
- Store source-specific completeness and account-age/engagement history; separate organic growth from broadcast campaigns. Current authors/channels and heuristic scores are not a validated edge.
- Forward evaluation: preserve all first-report cohorts and measure subsequent returns, drawdowns and false positives, including dropped/unavailable tokens. Only after sufficient history discuss predictive value.

These extensions must not reset v1 first-report prices or overwrite historical reports. Use a new methodology version when scoring changes after first publication. Deployment of each module requires focused tests, a recorded cloud revision and live smoke evidence.

## Checkpoint 2 operational status
- Commit `28c1427`, Cloud Build `17bca130-98f9-4737-babd-f02ef6ce5ddc` SUCCESS, revision `market-scanner-360-00164-ln4`, 100% traffic.
- Build passed, 201 monorepo tests passed; final focused Radar suite 23/23 passed.
- First report `1788652800000`: 48 eligible tokens, all three chains; first prices persisted and Telegram delivery confirmed. Retrying returned an identical report and did not change delivery timestamps.
- Collection every 30 minutes; publication 00:05 / 12:05 UTC. Both independent Cloud Scheduler jobs enabled; existing daily jobs preserved.
- Report currently contains top 10 in Telegram and the complete ranking in the authenticated dashboard. A publication may reuse a collection younger than 25 minutes; quote observation dates remain visible. Initial report bootstrapped at 04:55 UTC, next regular slot at 12:05 UTC.
- Source health, report table, chain filter and original evidence details verified in authenticated production Chrome. Detailed operations, recovery and next module acceptance criteria: HANDOFF.md section 82.
