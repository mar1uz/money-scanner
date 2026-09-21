import io

def patch(path, repls):
    src = io.open(path, encoding='utf-8').read()
    for i, (old, new) in enumerate(repls):
        n = src.count(old)
        assert n == 1, f"{path} repl#{i}: found {n} matches (need exactly 1):\n{old[:120]}"
        src = src.replace(old, new)
    io.open(path, 'w', encoding='utf-8').write(src)
    print(f"patched {path}: {len(repls)} replacements")

# ---------- crypto-market-profile.ts: candidate resolver ----------
patch('apps/api/src/services/crypto-market-profile.ts', [
("""  async prices(profile: CryptoMarketProfile): Promise<number[][]> {""",
"""  /** Exact-ticker candidates, best market-cap rank first, for disambiguating
   * shared tickers (CVX: Convex Finance vs a tokenized Chevron stock). */
  async resolveCandidates(symbol: string, limit = 3): Promise<CryptoMarketProfile[]> {
    symbol = symbol.toUpperCase();
    const result = await this.json(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(symbol)}`);
    const exact = (result.coins || [])
      .filter((coin: any) => String(coin.symbol).toUpperCase() === symbol)
      .sort((a: any, b: any) => (a.market_cap_rank || 999999) - (b.market_cap_rank || 999999))
      .slice(0, limit);
    const profiles: CryptoMarketProfile[] = [];
    for (const coin of exact) {
      try {
        profiles.push(await this.resolve(symbol, { coinGeckoId: coin.id }));
      } catch { /* skip unverifiable candidates */ }
    }
    return profiles;
  }

  async prices(profile: CryptoMarketProfile): Promise<number[][]> {"""),
])

# ---------- scanner-routes.ts: verify candidates before accepting ----------
patch('apps/api/src/routes/scanner-routes.ts', [
("""    if (resolvedMarketClass === 'crypto' && !symbol.includes('.') && !symbol.startsWith('TOTAL') && !assetInfo.coinGeckoId) {
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
    }""",
"""    if (resolvedMarketClass === 'crypto' && !symbol.includes('.') && !symbol.startsWith('TOTAL') && !assetInfo.coinGeckoId) {
      try {
        // Shared tickers return several exact matches (CVX: Convex Finance
        // vs a tokenized Chevron stock). A single candidate is accepted
        // directly; with several, only a candidate whose provider name
        // matches a live exchange asset wins, so the link never silently
        // switches assets.
        const candidates = await cryptoMarketProfiles.resolveCandidates(symbol);
        let verified = candidates.length === 1 ? candidates[0] : undefined;
        if (!verified) {
          for (const candidate of candidates) {
            if (await matchesLiveExchangeAsset(symbol, candidate.name)) {
              verified = candidate;
              break;
            }
          }
        }
        if (verified) {
          assetInfo = {
            ...assetInfo,
            coinGeckoId: verified.id,
            ...(verified.marketCap ? { marketCap: verified.marketCap } : {}),
            rank: verified.rank && verified.rank > 0 && verified.rank < 999 ? verified.rank : assetInfo.rank
          };
        }
      } catch {
        // Unresolvable or unverifiable: keep the stub, UI uses the search link.
      }
    }"""),
])

print("ALL PATCHES APPLIED")
