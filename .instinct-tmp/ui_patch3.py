import io

def patch(path, repls):
    src = io.open(path, encoding='utf-8').read()
    for i, (old, new) in enumerate(repls):
        n = src.count(old)
        assert n == 1, f"{path} repl#{i}: found {n} matches (need exactly 1):\n{old[:120]}"
        src = src.replace(old, new)
    io.open(path, 'w', encoding='utf-8').write(src)
    print(f"patched {path}: {len(repls)} replacements")

# ---------- ai-routes.ts: allow per-asset guide keys ----------
patch('apps/api/src/routes/ai-routes.ts', [
("""const AI_CONTENT_KEYS = new Set(['briefing', 'intelligence-brief', 'market-intelligence', 'capital-rotation']);""",
"""const AI_CONTENT_KEYS = new Set(['briefing', 'intelligence-brief', 'market-intelligence', 'capital-rotation']);
// Per-asset Instinct investment guides: investment-guide-<SYMBOL>.
const AI_CONTENT_KEY_PATTERN = /^investment-guide-[A-Z0-9][A-Z0-9.-]{0,19}$/;
const isAllowedContentKey = (key: string) => AI_CONTENT_KEYS.has(key) || AI_CONTENT_KEY_PATTERN.test(key);"""),
("""  if (!AI_CONTENT_KEYS.has(key) || !validTake(take)) {""",
"""  if (!isAllowedContentKey(key) || !validTake(take)) {"""),
])

# ---------- scanner-routes.ts: serve the guide with the asset detail ----------
patch('apps/api/src/routes/scanner-routes.ts', [
("""import { aggregatedCryptoDetail, cryptoMarketProfiles } from '../services/crypto-market-profile.js';""",
"""import { aggregatedCryptoDetail, cryptoMarketProfiles } from '../services/crypto-market-profile.js';
import { readPersistentAICache } from '../services/ai-cache-store.js';
import type { AIContentTake } from '@money-scanner/shared';"""),
("""    let aiExplanation = null;
    if (activeSignal) {
      aiExplanation = await appState.ai.generateAssetExplanation(symbol, quote.price, activeSignal, trendingTopics, news);
    }

    res.json({""",
"""    let aiExplanation = null;
    if (activeSignal) {
      aiExplanation = await appState.ai.generateAssetExplanation(symbol, quote.price, activeSignal, trendingTopics, news);
    }

    // Instinct-authored per-asset investment guide (outbox contract, 36h
    // freshness). Undefined until the generation agent publishes one.
    const GUIDE_MAX_AGE_MS = 36 * 60 * 60_000;
    const readGuideTake = async (guideLanguage: 'ro' | 'en') => {
      const entry = await readPersistentAICache<AIContentTake>(`ai-content-investment-guide-${symbol}-${guideLanguage}`);
      return entry && Date.now() - entry.updatedAt <= GUIDE_MAX_AGE_MS ? entry.payload : undefined;
    };
    const [guideRo, guideEn] = await Promise.all([readGuideTake('ro'), readGuideTake('en')]);
    const investmentGuide = guideRo || guideEn
      ? { ...(guideRo ? { ro: guideRo } : {}), ...(guideEn ? { en: guideEn } : {}) }
      : undefined;

    res.json({"""),
("""      aiExplanation,
      lastUpdated: Date.now()
    });""",
"""      aiExplanation,
      investmentGuide,
      lastUpdated: Date.now()
    });"""),
])

# ---------- web types.ts ----------
patch('apps/web/src/types.ts', [
("""  aiExplanation: any;
  lastUpdated: number;""",
"""  aiExplanation: any;
  investmentGuide?: { ro?: AIContentTake; en?: AIContentTake };
  lastUpdated: number;"""),
("""import type { Candle } from '@money-scanner/shared';""",
"""import type { AIContentTake, Candle } from '@money-scanner/shared';"""),
])

# ---------- AssetDeepDiveView.tsx: render the Instinct guide ----------
patch('apps/web/src/components/AssetDeepDiveView.tsx', [
("""import { InteractiveChart } from './InteractiveChart.js';""",
"""import { InteractiveChart } from './InteractiveChart.js';
import { useLanguage } from '../i18n.js';"""),
("""  const [chartTab, setChartTab] = useState<'chart' | 'tv_embed' | 'pinescript'>('chart');""",
"""  const [chartTab, setChartTab] = useState<'chart' | 'tv_embed' | 'pinescript'>('chart');
  const { language } = useLanguage();"""),
("""  const rawRank = resolveRankInput(data?.info?.rank, catalogAsset?.rank, infoClass);""",
"""  const rawRank = resolveRankInput(data?.info?.rank, catalogAsset?.rank, infoClass);
  // Instinct-authored guide take (outbox contract), language-matched with
  // fallback to the other language.
  const guideTake = language === 'en'
    ? (data?.investmentGuide?.en || data?.investmentGuide?.ro)
    : (data?.investmentGuide?.ro || data?.investmentGuide?.en);"""),
("""                      {/* Recommended Action Card */}""",
"""                      {guideTake && (
                        <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.08] space-y-2">
                          <p className="text-[10px] font-mono text-slate-500">
                            {guideTake.source === 'instinct-agent' ? 'Instinct' : 'AI Gateway'} · {guideTake.model} · {new Date(guideTake.generatedAt).toLocaleDateString(language === 'ro' ? 'ro-RO' : 'en-GB')}
                          </p>
                          <h4 className="text-sm font-bold text-slate-50 font-sans">{guideTake.headline}</h4>
                          {guideTake.paragraphs.map((paragraph, index) => (
                            <p key={index} className="text-xs text-slate-300 leading-relaxed font-sans">{paragraph}</p>
                          ))}
                          {guideTake.bullets && guideTake.bullets.length > 0 && (
                            <ul className="list-disc pl-4 space-y-1 text-xs text-slate-300 font-sans">
                              {guideTake.bullets.map((bullet, index) => <li key={index}>{bullet}</li>)}
                            </ul>
                          )}
                        </div>
                      )}

                      {/* Recommended Action Card */}"""),
])

# ---------- instinct-content-publisher.mjs: allow per-asset guide keys ----------
patch('scripts/instinct-content-publisher.mjs', [
("""const KEYS = new Set(['capital-rotation', 'briefing', 'intelligence-brief', 'market-intelligence']);""",
"""const KEYS = new Set(['capital-rotation', 'briefing', 'intelligence-brief', 'market-intelligence']);
// Per-asset Instinct investment guides: investment-guide-<SYMBOL>.
const KEY_PATTERN = /^investment-guide-[A-Z0-9][A-Z0-9.-]{0,19}$/;"""),
("""    if (!KEYS.has(doc.key) || (doc.language !== 'en' && doc.language !== 'ro') || !validTake(doc.take)) {""",
"""    if ((!KEYS.has(doc.key) && !KEY_PATTERN.test(doc.key)) || (doc.language !== 'en' && doc.language !== 'ro') || !validTake(doc.take)) {"""),
])

print("ALL PATCHES APPLIED")
