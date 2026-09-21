import io

def patch(path, repls):
    src = io.open(path, encoding='utf-8').read()
    for i, (old, new) in enumerate(repls):
        n = src.count(old)
        assert n == 1, f"{path} repl#{i}: found {n} matches (need exactly 1):\n{old[:120]}"
        src = src.replace(old, new)
    io.open(path, 'w', encoding='utf-8').write(src)
    print(f"patched {path}: {len(repls)} replacements")

patch('apps/api/src/routes/scanner-routes.ts', [
("""    let quote;
    try {
      quote = await appState.marketData.getPriceQuote(symbol, resolvedMarketClass);""",
"""    // Crypto assets outside the hand-curated catalog and beyond the live
    // top-N windows carry no CoinGecko ID (e.g. CVX resolved as a "CVX
    // Crypto" stub), so the frontend fell back to a search URL that finds
    // nothing. Resolve the exact coin here once: the detail then carries a
    // direct CoinGecko link, the live market cap and the true rank. Missing
    // or ambiguous symbols keep the old search fallback.
    if (resolvedMarketClass === 'crypto' && !symbol.includes('.') && !symbol.startsWith('TOTAL') && !assetInfo.coinGeckoId) {
      try {
        const profile = await cryptoMarketProfiles.resolve(symbol, {});
        assetInfo = {
          ...assetInfo,
          coinGeckoId: profile.id,
          ...(profile.marketCap ? { marketCap: profile.marketCap } : {}),
          rank: profile.rank && profile.rank > 0 && profile.rank < 999 ? profile.rank : assetInfo.rank
        };
      } catch {
        // Unresolvable or ambiguous: keep the stub, UI uses the search link.
      }
    }
    let quote;
    try {
      quote = await appState.marketData.getPriceQuote(symbol, resolvedMarketClass);"""),
])

patch('apps/web/src/components/AssetDeepDiveView.tsx', [
("""  const catalogAsset = TRADING_360_ASSETS.find(a => a.symbol.toUpperCase() === symbol.toUpperCase());
  const effectiveMarketCap = data?.info?.marketCap || catalogAsset?.marketCap || (data?.quote as any)?.marketCap || 0;
  const infoClass = marketClass || data?.info?.marketClass;""",
"""  const infoClass = marketClass || data?.info?.marketClass;
  // Match the catalog by market class too: crypto CVX (Convex) must not
  // pick up Chevron's stock market cap through the shared ticker.
  const catalogAsset = TRADING_360_ASSETS.find(a => a.symbol.toUpperCase() === symbol.toUpperCase() && (!infoClass || a.marketClass === infoClass));
  const effectiveMarketCap = data?.info?.marketCap || catalogAsset?.marketCap || (data?.quote as any)?.marketCap || 0;"""),
])

print("ALL PATCHES APPLIED")
