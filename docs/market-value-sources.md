# Market value widget sources

Crypto: current app overview from CoinGecko global feed, not a tracked-token sum.
Companies: USD checked snapshot from CompaniesMarketCap, 73stock companies and13mining/materials companies. ETFs excluded, including QQQ. Source page URLs and original as-of strings retained per symbol. Ranking rows have no individual dates, so the initial import is labeled checked2026-10-08, not live/as-ofOct7 for all constituents. Snapshot expires7days after checking.
Gold: $29trillion above-ground stock at end-Q2 2026, WorldGoldCouncil, published2026-08-18. https://www.gold.org/goldhub/data/how-much-gold . Quarterly valuation, not today's price. Disabled after2027-01-01 unless source updated.
All: scoped approximate composite, not world market total. Global crypto+physical gold+tracked stock and mining/materials company equity. Excludes ETF assets, silver/oil/copper estimates. PAXG not separately added to crypto. Economic exposures may overlap (e.g. tokenized gold claims and physical gold); this is not an investable or additive GDP measure.

Refresh: python3 scripts/refresh-company-cap-snapshot.py, then review coverage/dates, test/build and deploy through normal reviewed workflow. Public source pages only, no retries on403/429. A failed refresh writes incomplete coverage, causing unavailable totals rather than fabricated or silently stale constants. No periodic production refresh or recurring deploy has been enabled. Current UI source snapshot is independent of old row/catalog marketCap constants.
