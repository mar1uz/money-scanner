# Fomo access investigation and token chart links

Verified 2026-09-06 for the user's request to extract community interest from Fomo and open scanned tokens directly in Fomo or DEX Screener.

## Findings

- Correct product: https://fomo.family . `fomo.com`, `usefomo.com`, and FomoLink API documentation refer to other products; they are not crypto-community data sources for this integration.
- The official [Fomo web announcement](https://fomo.family/blog/announcing-fomo-web) describes trader feeds, leaderboards, token theses and holder context. These could contribute community evidence if an authorized data interface becomes available. The presence of a web UI does not establish a public data API.
- No publicly documented Fomo crypto developer API or anonymous social feed was confirmed during this investigation. A direct unauthenticated HTTP request to the homepage returned 403. In the normal browser, the public landing page loaded, but a focused test of `https://fomo.family/tokens/solana/5UUH9RTDiSpq6HKS6bp4NdU9PNJpXRXuiw6ShBTBhgH2` redirected to `https://fomo.family/`; it did not display TROLL or its chart. This does not prove the route cannot work with an authenticated Fomo account.
- The official [terms](https://fomo.family/terms), section 16, restrict automated extraction of user content, transaction data and prices; section 28 permits ordinary links subject to its conditions. No production Fomo scraper, session-cookie replay, account creation or transaction was added. No authenticated Fomo session or token-page mobile handoff was verified.
- Public third-party projects suggesting internal endpoints or token routes are not treated as official API contracts. No such code was installed or executed, and no authenticated feed was accessed.

## Implemented fallback

All Radar token-name links use `https://dexscreener.com/{chain}/{contract}` through the shared `radarTokenChartUrl` helper. Chain and exact contract are used, never a ticker search. This works with current collections, every historical report and dropped-token rows without changing stored snapshots. DEX Screener chooses its token/pool view; the original pool used by Radar remains separately linked in Details, so its current quote can differ from the saved report.

Direct routes verified against DEX Screener's rendered token pages:
- [Solana / TROLL](https://dexscreener.com/solana/5UUH9RTDiSpq6HKS6bp4NdU9PNJpXRXuiw6ShBTBhgH2)
- [Base / The Stonks Exchange](https://dexscreener.com/base/0x5ab000ff9b9ffe0349ce5ffa5fd86f217c3680f5)
- [Robinhood / MUSHROOM](https://dexscreener.com/robinhood/0xab093def657f15df31b33922a95e047add645b29)

The name opens a new tab; the separate Details button expands scan evidence. New Telegram reports use HTML name links with token text escaped. Already-sent Telegram messages are not rewritten or resent. No purchase is executed by any Radar link.

## Future Fomo adapter gate

Before adding a Fomo social collector, obtain a documented/authorized interface, its authentication model and rate limits; confirm which public fields may be stored. Preserve contract + chain, source timestamps and original evidence URLs. Distinguish trader counts, platform activity, broadcast theses and verified unique users rather than calling all of them organic interest.

Before making Fomo the chart destination, validate an actual Fomo-generated share URL with the user's logged-in session for each supported chain, including behavior after login and on mobile. Do not assume that Robinhood Tokens in Fomo documentation means every token on Robinhood Chain is supported. Retain DEX Screener as a visible fallback.
