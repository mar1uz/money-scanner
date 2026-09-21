import pathlib, json

# 1. compression middleware
p = pathlib.Path('apps/api/src/server.ts')
s = p.read_text()
s = s.replace("import cors from 'cors';", "import cors from 'cors';\nimport compression from 'compression';", 1)
old = "  app.use(express.json());"
assert old in s
s = s.replace(old, old + "\n  // gzip the SPA bundle and JSON API responses (the 1.1 MB bundle and the\n  // scanner payloads were previously transferred uncompressed).\n  app.use(compression());", 1)
p.write_text(s)
print('server.ts patched')

# 2. overview SWR + parallel externals
p = pathlib.Path('packages/market-data/src/market-service.ts')
s = p.read_text()
old = """  public async getMarketOverview(): Promise<MarketOverviewSummary> {
    const startedAt = Date.now();"""
assert old in s
new = """  private marketOverviewCache: { value: MarketOverviewSummary; computedAt: number } | null = null;
  private marketOverviewRefresh: Promise<MarketOverviewSummary> | null = null;

  public async getMarketOverview(): Promise<MarketOverviewSummary> {
    // Stale-while-revalidate: serve the cached overview immediately and
    // refresh it in the background at most every 5 minutes. Previously every
    // request recomputed everything and serialized two external calls,
    // costing ~7s on a cold cache.
    const cached = this.marketOverviewCache;
    if (cached && Date.now() - cached.computedAt < MARKET_OVERVIEW_TTL_MS) {
      return cached.value;
    }
    if (!this.marketOverviewRefresh) {
      this.marketOverviewRefresh = this.computeMarketOverview()
        .then(value => {
          this.marketOverviewCache = { value, computedAt: Date.now() };
          return value;
        })
        .finally(() => { this.marketOverviewRefresh = null; });
    }
    return cached ? cached.value : this.marketOverviewRefresh;
  }

  private async computeMarketOverview(): Promise<MarketOverviewSummary> {
    const startedAt = Date.now();"""
s = s.replace(old, new, 1)

old_ext = """    let btcDominance = 0;
    let totalMarketCap = 0;
    let total24hVolume = 0;
    let globalDataAvailable = false;
    try {
      const globalRes = await fetch('https://api.coingecko.com/api/v3/global', {
        headers: this.coinGeckoHeaders(),
        signal: AbortSignal.timeout(8_000)
      });
      if (!globalRes.ok) throw new Error(`CoinGecko HTTP ${globalRes.status}`);
      const data = (await globalRes.json() as any)?.data;
      if (data) {
        btcDominance = Number(data.market_cap_percentage?.btc || 0);
        totalMarketCap = Number(data.total_market_cap?.usd || 0);
        total24hVolume = Number(data.total_volume?.usd || 0);
        globalDataAvailable = totalMarketCap > 0;
      }
    } catch {}

    let fearAndGreed: MarketOverviewSummary['fearAndGreed'];
    try {
      const fngRes = await fetch('https://api.alternative.me/fng/?limit=1', {
        signal: AbortSignal.timeout(6_000)
      });
      const item = fngRes.ok ? (await fngRes.json() as any)?.data?.[0] : null;
      if (item?.value && item?.timestamp) {
        fearAndGreed = {
          value: Number(item.value),
          classification: item.value_classification,
          source: 'Alternative.me',
          sourceUrl: 'https://alternative.me/crypto/fear-and-greed-index/',
          timestamp: Number(item.timestamp) * 1000
        };
      }
    } catch {}"""
assert old_ext in s
new_ext = """    let btcDominance = 0;
    let totalMarketCap = 0;
    let total24hVolume = 0;
    let globalDataAvailable = false;
    let fearAndGreed: MarketOverviewSummary['fearAndGreed'];
    // The two external calls are independent - run them in parallel instead
    // of serializing up to 14s of timeouts on every cold request.
    const [globalJson, fngJson] = await Promise.all([
      fetch('https://api.coingecko.com/api/v3/global', {
        headers: this.coinGeckoHeaders(),
        signal: AbortSignal.timeout(8_000)
      }).then(res => (res.ok ? res.json() : null)).catch(() => null),
      fetch('https://api.alternative.me/fng/?limit=1', {
        signal: AbortSignal.timeout(6_000)
      }).then(res => (res.ok ? res.json() : null)).catch(() => null)
    ]);
    const data = (globalJson as any)?.data;
    if (data) {
      btcDominance = Number(data.market_cap_percentage?.btc || 0);
      totalMarketCap = Number(data.total_market_cap?.usd || 0);
      total24hVolume = Number(data.total_volume?.usd || 0);
      globalDataAvailable = totalMarketCap > 0;
    }
    const fngItem = (fngJson as any)?.data?.[0];
    if (fngItem?.value && fngItem?.timestamp) {
      fearAndGreed = {
        value: Number(fngItem.value),
        classification: fngItem.value_classification,
        source: 'Alternative.me',
        sourceUrl: 'https://alternative.me/crypto/fear-and-greed-index/',
        timestamp: Number(fngItem.timestamp) * 1000
      };
    }"""
s = s.replace(old_ext, new_ext, 1)

# module-level TTL const, before the class declaration
anchor = 'public async getMarketOverview'
idx = s.index('private marketOverviewCache')
s = s[:idx] + 'const MARKET_OVERVIEW_TTL_MS = 5 * 60_000;\n\n' + s[idx:]
p.write_text(s)
print('market-service.ts patched')

# 3. deps
pj = pathlib.Path('apps/api/package.json')
d = json.loads(pj.read_text())
d['dependencies']['compression'] = '^1.7.4'
d['devDependencies']['@types/compression'] = '^1.7.5'
pj.write_text(json.dumps(d, indent=2) + '\n')
print('package.json patched')
