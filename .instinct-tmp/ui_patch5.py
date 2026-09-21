import io

def patch(path, repls):
    src = io.open(path, encoding='utf-8').read()
    for i, (old, new) in enumerate(repls):
        n = src.count(old)
        assert n == 1, f"{path} repl#{i}: found {n} matches (need exactly 1):\n{old[:120]}"
        src = src.replace(old, new)
    io.open(path, 'w', encoding='utf-8').write(src)
    print(f"patched {path}: {len(repls)}")

# 1. alert-dispatcher: honest label for forced test sends
patch('packages/notifications/src/alert-dispatcher.ts', [
("""    const isBull = signal.score >= 20;
    const isBear = signal.score <= -20;
    const direction = isBull""",
"""    // Forced test sends (the asset-page bell) have no real transition: say
    // so instead of printing an identical-tier "flip".
    const isForcedStatus = force && !signal.isTransition;
    const isBull = signal.score >= 20;
    const isBear = signal.score <= -20;
    const direction = isForcedStatus
      ? { emoji: 'ℹ️', heading: 'TEST ALERTĂ — STARE CURENTĂ', action: '• FĂRĂ TRANZIȚIE / DOAR TEST', tone: 'Test' }
      : isBull"""),
("""    const transitionText = signal.previousTier
      ? `${signal.previousTier} → ${signal.tier}`
      : signal.tier;""",
"""    const transitionText = isForcedStatus
      ? `fără tranziție — ${signal.tier} (stare la ultima lumânare închisă)`
      : signal.previousTier
        ? `${signal.previousTier} → ${signal.tier}`
        : signal.tier;"""),
])

# 2. /alerts/test: use the requested timeframe
patch('apps/api/src/routes/telegram-routes.ts', [
("""  const symbol = (req.body.symbol || 'BTC').toUpperCase();
  const candles = await appState.marketData.getCandles(symbol, '1h', 150);
  const quote = await appState.marketData.getPriceQuote(symbol);
  const signal = appState.moneyLine.calculateLatest(symbol, '1h', candles);""",
"""  const symbol = (req.body.symbol || 'BTC').toUpperCase();
  const requestedTf = String(req.body.timeframe || '1h');
  const timeframe = (['1h', '4h', '8h', '1d', '1w', '1m'] as const).includes(requestedTf as any)
    ? requestedTf as '1h' | '4h' | '8h' | '1d' | '1w' | '1m'
    : '1h';
  const candles = await appState.marketData.getCandles(symbol, timeframe, 150);
  const quote = await appState.marketData.getPriceQuote(symbol);
  const signal = appState.moneyLine.calculateLatest(symbol, timeframe, candles);"""),
])

# 3. web api: pass timeframe
patch('apps/web/src/services/api.ts', [
("""    body: JSON.stringify({ symbol })""",
"""    body: JSON.stringify({ symbol, ...(timeframe ? { timeframe } : {}) })"""),
("""export async function triggerTestAlert(symbol: string): Promise<any> {""",
"""export async function triggerTestAlert(symbol: string, timeframe?: string): Promise<any> {"""),
])

# 4+5. bells pass the viewed timeframe
patch('apps/web/src/components/AssetDeepDiveView.tsx', [
("""      await triggerTestAlert(symbol);""",
"""      await triggerTestAlert(symbol, timeframe);"""),
])
patch('apps/web/src/components/AssetDetailModal.tsx', [
("""      await triggerTestAlert(symbol);""",
"""      await triggerTestAlert(symbol, activeTf);"""),
])

# 6. i18n: compound flip-age patterns (and singular zi/oră forms)
patch('apps/web/src/i18n.tsx', [
("""      .replace(/Afișate (\\d+) din (\\d+) active/g, 'Showing $1 of $2 assets')""",
"""      .replace(/Afișate (\\d+) din (\\d+) active/g, 'Showing $1 of $2 assets')
      .replace(/acum (\\d+) zil?e? și (\\d+) or[ăe]/g, '$1 days and $2 hours ago')
      .replace(/acum (\\d+) or[ăe] și (\\d+) minute?/g, '$1 hours and $2 minutes ago')"""),
("""      .replace(/acum (\\d+) ore?/g, '$1 hours ago')""",
"""      .replace(/acum (\\d+) or[ăe]/g, '$1 hours ago')"""),
("""      .replace(/acum (\\d+) zile?/g, '$1 days ago')""",
"""      .replace(/acum (\\d+) zil?e?/g, '$1 days ago')"""),
])

# 7. ai-routes: asset-profile keys too
patch('apps/api/src/routes/ai-routes.ts', [
("""const AI_CONTENT_KEY_PATTERN = /^investment-guide-[A-Z0-9][A-Z0-9.-]{0,19}$/;""",
"""const AI_CONTENT_KEY_PATTERN = /^(?:investment-guide|asset-profile)-[A-Z0-9][A-Z0-9.-]{0,19}$/;"""),
])

# 8. scanner-routes: serve assetProfile takes + onchain metrics
patch('apps/api/src/routes/scanner-routes.ts', [
("""import { readPersistentAICache } from '../services/ai-cache-store.js';""",
"""import { readPersistentAICache } from '../services/ai-cache-store.js';
import { onchainMetrics } from '../services/onchain-metrics.js';"""),
("""    const [guideRo, guideEn] = await Promise.all([readGuideTake('ro'), readGuideTake('en')]);
    const investmentGuide = guideRo || guideEn
      ? { ...(guideRo ? { ro: guideRo } : {}), ...(guideEn ? { en: guideEn } : {}) }
      : undefined;""",
"""    const readProfileTake = async (profileLanguage: 'ro' | 'en') => {
      const entry = await readPersistentAICache<AIContentTake>(`ai-content-asset-profile-${symbol}-${profileLanguage}`);
      return entry && Date.now() - entry.updatedAt <= GUIDE_MAX_AGE_MS ? entry.payload : undefined;
    };
    const [guideRo, guideEn, profileTakeRo, profileTakeEn] = await Promise.all([
      readGuideTake('ro'), readGuideTake('en'), readProfileTake('ro'), readProfileTake('en')
    ]);
    const investmentGuide = guideRo || guideEn
      ? { ...(guideRo ? { ro: guideRo } : {}), ...(guideEn ? { en: guideEn } : {}) }
      : undefined;
    const assetProfile = profileTakeRo || profileTakeEn
      ? { ...(profileTakeRo ? { ro: profileTakeRo } : {}), ...(profileTakeEn ? { en: profileTakeEn } : {}) }
      : undefined;

    // Decision-relevant on-chain metrics (CoinGecko supply/ATH data plus
    // DefiLlama TVL/fees where the protocol is listed). Crypto only.
    const onchain = resolvedMarketClass === 'crypto' && assetInfo.coinGeckoId
      ? await onchainMetrics.forAsset(symbol, assetInfo.coinGeckoId).catch(() => undefined)
      : undefined;"""),
("""      aiExplanation,
      investmentGuide,
      lastUpdated: Date.now()""",
"""      aiExplanation,
      investmentGuide,
      assetProfile,
      onchain,
      lastUpdated: Date.now()"""),
])

# 9. web types
patch('apps/web/src/types.ts', [
("""  investmentGuide?: { ro?: AIContentTake; en?: AIContentTake };""",
"""  investmentGuide?: { ro?: AIContentTake; en?: AIContentTake };
  assetProfile?: { ro?: AIContentTake; en?: AIContentTake };
  onchain?: {
    source?: string;
    supplyCirculating?: number; supplyTotal?: number; supplyMax?: number; pctUnlocked?: number;
    athPrice?: number; athDistancePct?: number; atlPrice?: number; atlDistancePct?: number;
    volumeMcapPct?: number; tvlUsd?: number; tvlToMcapPct?: number; fees24hUsd?: number;
  };"""),
])

# 10. AssetDeepDiveView: profile take + onchain card
patch('apps/web/src/components/AssetDeepDiveView.tsx', [
("""import { useLanguage } from '../i18n.js';""",
"""import { useLanguage } from '../i18n.js';
import { OnchainDataCard } from './OnchainDataCard.js';"""),
("""  const guideTake = language === 'en'
    ? (data?.investmentGuide?.en || data?.investmentGuide?.ro)
    : (data?.investmentGuide?.ro || data?.investmentGuide?.en);""",
"""  const guideTake = language === 'en'
    ? (data?.investmentGuide?.en || data?.investmentGuide?.ro)
    : (data?.investmentGuide?.ro || data?.investmentGuide?.en);
  const profileTake = language === 'en'
    ? (data?.assetProfile?.en || data?.assetProfile?.ro)
    : (data?.assetProfile?.ro || data?.assetProfile?.en);"""),
("""                <AssetProfileOverviewCard
                  symbol={symbol}
                  name={data?.info?.name || explanation?.assetName}
                  category={data?.info?.category || explanation?.sectorOrNarrative}
                  marketClass={resolvedMarketClass}
                  coinGeckoId={resolvedCoinGeckoId}
                />""",
"""                <AssetProfileOverviewCard
                  symbol={symbol}
                  name={data?.info?.name || explanation?.assetName}
                  category={data?.info?.category || explanation?.sectorOrNarrative}
                  marketClass={resolvedMarketClass}
                  coinGeckoId={resolvedCoinGeckoId}
                  instinctTake={profileTake}
                />

                <OnchainDataCard data={data?.onchain} />"""),
])

# 11. AssetProfileOverviewCard: render the take
patch('apps/web/src/components/AssetProfileOverviewCard.tsx', [
("""import { getAssetProfile } from '@money-scanner/shared';""",
"""import { getAssetProfile } from '@money-scanner/shared';
import type { AIContentTake } from '@money-scanner/shared';"""),
("""  coinGeckoId?: string;
}""",
"""  coinGeckoId?: string;
  /** Instinct-authored profile take (outbox contract), shown above the
      template profile when published. */
  instinctTake?: AIContentTake;
}"""),
("""  marketClass,
  coinGeckoId
}) => {""",
"""  marketClass,
  coinGeckoId,
  instinctTake
}) => {"""),
("""      {/* ── Headline Summary ── */}""",
"""      {instinctTake && (
        <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.08] space-y-2">
          <p className="text-[10px] font-mono text-slate-500">
            {instinctTake.source === 'instinct-agent' ? 'Instinct' : 'AI Gateway'} · {instinctTake.model} · {new Date(instinctTake.generatedAt).toLocaleDateString(isRo ? 'ro-RO' : 'en-GB')}
          </p>
          <h4 className="text-sm font-bold text-slate-50 font-sans">{instinctTake.headline}</h4>
          {instinctTake.paragraphs.map((paragraph, index) => (
            <p key={index} className="text-xs text-slate-300 leading-relaxed font-sans">{paragraph}</p>
          ))}
          {instinctTake.bullets && instinctTake.bullets.length > 0 && (
            <ul className="list-disc pl-4 space-y-1 text-xs text-slate-300 font-sans">
              {instinctTake.bullets.map((bullet, index) => <li key={index}>{bullet}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* ── Headline Summary ── */}"""),
])

# 12. publisher: asset-profile keys
patch('scripts/instinct-content-publisher.mjs', [
("""const KEY_PATTERN = /^investment-guide-[A-Z0-9][A-Z0-9.-]{0,19}$/;""",
"""const KEY_PATTERN = /^(?:investment-guide|asset-profile)-[A-Z0-9][A-Z0-9.-]{0,19}$/;"""),
])

print("ALL PATCHES APPLIED")
