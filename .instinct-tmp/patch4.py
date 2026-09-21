import sys

def patch(path, edits):
    with open(path) as f:
        s = f.read()
    for old, new, count in edits:
        if old not in s:
            print(f'ANCHOR MISSING in {path}: {old[:90]!r}')
            sys.exit(1)
        s = s.replace(old, new, count)
    with open(path, 'w') as f:
        f.write(s)
    print(f'patched {path}')

patch('packages/shared/src/types/ai.ts', [
    ("export interface IntelligenceBriefPayload extends NewsSynthesisPayload {",
     """/** AI take written by the local Mac executor through the AI Gateway (JEV grant). */
export interface AIContentTake {
  headline: string;
  paragraphs: string[];
  bullets?: string[];
  model: string;
  generatedAt: number;
  source: 'ai-gateway';
}

export interface IntelligenceBriefPayload extends NewsSynthesisPayload {""", 1),
    ("  latestSourceAt: number | null;\n  filters: IntelligenceBriefFilters;\n}",
     "  latestSourceAt: number | null;\n  filters: IntelligenceBriefFilters;\n  aiTake?: AIContentTake;\n}", 1),
    ("  confidenceScore: number; // 0.0 to 1.0\n  evidenceCitations: EvidenceLink[];\n  generatedAt: number;\n  dataFreshness: string;\n}",
     "  confidenceScore: number; // 0.0 to 1.0\n  evidenceCitations: EvidenceLink[];\n  generatedAt: number;\n  dataFreshness: string;\n  aiTake?: AIContentTake;\n}", 1),
    ("  assetChanges?: Record<string, number>;\n}",
     "  assetChanges?: Record<string, number>;\n  aiTake?: AIContentTake;\n}", 1),
])

patch('apps/api/src/routes/ai-routes.ts', [
    ("import {\n  getScannerAssets,",
     "import {\n  AIContentTake,\n  getScannerAssets,", 1),
    ("const intelligencePersistentKey = (cacheKey: string) => `market-intelligence-${cacheKey.replace(':', '-')}`;",
     """const intelligencePersistentKey = (cacheKey: string) => `market-intelligence-${cacheKey.replace(':', '-')}`;

const AI_CONTENT_KEYS = new Set(['briefing', 'intelligence-brief', 'market-intelligence']);
const AI_CONTENT_MAX_AGE_MS = 36 * 60 * 60_000;

/** AI take written by the local Mac executor via the AI Gateway; fresh for 36h. */
const readAiContentTake = async (key: string): Promise<AIContentTake | undefined> => {
  const entry = await readPersistentAICache<AIContentTake>(`ai-content-${key}`);
  if (!entry || Date.now() - entry.updatedAt > AI_CONTENT_MAX_AGE_MS) return undefined;
  return entry.payload;
};

const validTake = (value: any): value is AIContentTake => Boolean(value)
  && typeof value.headline === 'string' && value.headline.length > 0 && value.headline.length <= 300
  && Array.isArray(value.paragraphs) && value.paragraphs.length >= 1 && value.paragraphs.length <= 6
  && value.paragraphs.every((p: any) => typeof p === 'string' && p.length > 0 && p.length <= 2000)
  && (value.bullets === undefined || (Array.isArray(value.bullets) && value.bullets.length <= 8 && value.bullets.every((b: any) => typeof b === 'string' && b.length <= 300)))
  && typeof value.model === 'string' && value.model.length <= 120
  && Number.isFinite(value.generatedAt);""", 1),
    ("    intelligenceBriefCache.set(cacheKey, { payload, updatedAt: Date.now() });\n    return payload;",
     "    const take = await readAiContentTake('intelligence-brief');\n    if (take) payload.aiTake = take;\n    intelligenceBriefCache.set(cacheKey, { payload, updatedAt: Date.now() });\n    return payload;", 1),
    ("    const briefing = await appState.ai.generateMarketBriefing(overview, signalsObj, trends, news);\n    res.json(briefing);",
     "    const briefing = await appState.ai.generateMarketBriefing(overview, signalsObj, trends, news);\n    const take = await readAiContentTake('briefing');\n    if (take) briefing.aiTake = take;\n    res.json(briefing);", 1),
    ("    const enriched = await attachLiveNarrativeChanges(payload, scope);\n    res.set('Cache-Control', 'private, max-age=30');\n    res.json(enriched);",
     "    const enriched = await attachLiveNarrativeChanges(payload, scope);\n    const take = await readAiContentTake('market-intelligence');\n    if (take) enriched.aiTake = take;\n    res.set('Cache-Control', 'private, max-age=30');\n    res.json(enriched);", 1),
    ("aiRouter.post('/ai/daily-warmup', async (req, res) => {",
     """// Local AI-content publisher (Mac executor -> Vercel AI Gateway). Token-protected.
aiRouter.post('/ai/publish-content', async (req, res) => {
  if (!validateScheduledRequestToken(req.get('x-daily-scan-token'))) {
    return res.status(401).json({ error: 'Invalid daily scan token.' });
  }
  const key = String(req.body?.key || '');
  const take = req.body?.take;
  if (!AI_CONTENT_KEYS.has(key) || !validTake(take)) {
    return res.status(400).json({ error: 'Invalid AI content payload.' });
  }
  await writePersistentAICache(`ai-content-${key}`, { payload: { ...take, source: 'ai-gateway' as const }, updatedAt: Date.now() });
  res.set('Cache-Control', 'no-store');
  return res.json({ status: 'published', key });
});

aiRouter.post('/ai/daily-warmup', async (req, res) => {""", 1),
])

patch('apps/api/src/server.ts', [
    ("      || req.path === '/ai/daily-warmup'",
     "      || req.path === '/ai/daily-warmup'\n      || req.path === '/ai/publish-content'", 1),
])
