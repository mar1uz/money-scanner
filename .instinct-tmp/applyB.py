import pathlib

def edit(path, pairs):
    p = pathlib.Path(path)
    s = p.read_text()
    for old, new in pairs:
        assert old in s, f"ANCHOR MISSING in {path}: {old[:80]!r}"
        s = s.replace(old, new, 1)
    p.write_text(s)
    print('patched', path)

# 1. shared types
edit('packages/shared/src/types/ai.ts', [
    ("  source: 'ai-gateway';",
     "  source: 'ai-gateway' | 'instinct-agent';"),
    ("""  confidenceScore: number; // 0.0 to 1.0
  evidenceCitations: EvidenceLink[];
  generatedAt: number;
  dataFreshness: string;
  aiTake?: AIContentTake;
}""",
     """  confidenceScore: number; // 0.0 to 1.0
  evidenceCitations: EvidenceLink[];
  generatedAt: number;
  dataFreshness: string;
  aiTake?: AIContentTake;
  /** Cross-market capital rotation analysis (Instinct content agent). */
  capitalRotation?: AIContentTake;
}"""),
    ("""  assetChanges?: Record<string, number>;
  aiTake?: AIContentTake;
}""",
     """  assetChanges?: Record<string, number>;
  aiTake?: AIContentTake;
  /** Cross-market capital rotation analysis (Instinct content agent). */
  capitalRotation?: AIContentTake;
}"""),
])

# 2. API routes
edit('apps/api/src/routes/ai-routes.ts', [
    ("const AI_CONTENT_KEYS = new Set(['briefing', 'intelligence-brief', 'market-intelligence']);",
     "const AI_CONTENT_KEYS = new Set(['briefing', 'intelligence-brief', 'market-intelligence', 'capital-rotation']);"),
    ("""/** AI take written by the local Mac executor via the AI Gateway; fresh for 36h. */
const readAiContentTake = async (key: string): Promise<AIContentTake | undefined> => {
  const entry = await readPersistentAICache<AIContentTake>(`ai-content-${key}`);
  if (!entry || Date.now() - entry.updatedAt > AI_CONTENT_MAX_AGE_MS) return undefined;
  return entry.payload;
};""",
     """/** AI take written by the local Mac executor via the AI Gateway or by the
 * Instinct content agent; fresh for 36h. The per-language copy is preferred;
 * the legacy language-agnostic key remains as the (Romanian) fallback. */
const readAiContentTake = async (key: string, language?: 'ro' | 'en'): Promise<AIContentTake | undefined> => {
  if (language) {
    const localized = await readPersistentAICache<AIContentTake>(`ai-content-${key}-${language}`);
    if (localized && Date.now() - localized.updatedAt <= AI_CONTENT_MAX_AGE_MS) return localized.payload;
  }
  const entry = await readPersistentAICache<AIContentTake>(`ai-content-${key}`);
  if (!entry || Date.now() - entry.updatedAt > AI_CONTENT_MAX_AGE_MS) return undefined;
  return entry.payload;
};"""),
    ("    const take = await readAiContentTake('intelligence-brief');",
     "    const take = await readAiContentTake('intelligence-brief', language);"),
    ("""    const briefing = await appState.ai.generateMarketBriefing(overview, signalsObj, trends, news);
    const take = await readAiContentTake('briefing');
    if (take) briefing.aiTake = take;""",
     """    const language: 'ro' | 'en' = req.query.language === 'en' ? 'en' : 'ro';
    const briefing = await appState.ai.generateMarketBriefing(overview, signalsObj, trends, news);
    const take = await readAiContentTake('briefing', language);
    if (take) briefing.aiTake = take;
    const rotation = await readAiContentTake('capital-rotation', language);
    if (rotation) briefing.capitalRotation = rotation;"""),
    ("""    const take = await readAiContentTake('market-intelligence');
    if (take) enriched.aiTake = take;""",
     """    const take = await readAiContentTake('market-intelligence', language);
    if (take) enriched.aiTake = take;
    const rotation = await readAiContentTake('capital-rotation', language);
    if (rotation) enriched.capitalRotation = rotation;"""),
    ("""  const key = String(req.body?.key || '');
  const take = req.body?.take;
  if (!AI_CONTENT_KEYS.has(key) || !validTake(take)) {
    return res.status(400).json({ error: 'Invalid AI content payload.' });
  }
  await writePersistentAICache(`ai-content-${key}`, { payload: { ...take, source: 'ai-gateway' as const }, updatedAt: Date.now() });
  res.set('Cache-Control', 'no-store');
  return res.json({ status: 'published', key });""",
     """  const key = String(req.body?.key || '');
  const take = req.body?.take;
  if (!AI_CONTENT_KEYS.has(key) || !validTake(take)) {
    return res.status(400).json({ error: 'Invalid AI content payload.' });
  }
  const language = req.body?.language === 'en' || req.body?.language === 'ro' ? req.body.language : null;
  const source = req.body?.source === 'instinct-agent' ? 'instinct-agent' as const : 'ai-gateway' as const;
  const cacheKey = language ? `ai-content-${key}-${language}` : `ai-content-${key}`;
  await writePersistentAICache(cacheKey, { payload: { ...take, source }, updatedAt: Date.now() });
  res.set('Cache-Control', 'no-store');
  return res.json({ status: 'published', key, language });"""),
])

# 3. web api client
edit('apps/web/src/services/api.ts', [
    ("""export async function fetchAIBriefing(): Promise<AIAnalysisPayload> {
  const res = await fetch(`${API_BASE}/ai/briefing`);""",
     """export async function fetchAIBriefing(language: 'ro' | 'en' = 'ro'): Promise<AIAnalysisPayload> {
  const res = await fetch(`${API_BASE}/ai/briefing?language=${language}`);"""),
])

# 4. AIBriefingView
edit('apps/web/src/components/AIBriefingView.tsx', [
    ('<span className="text-xs font-mono text-cyan-300 uppercase tracking-wider">AI Gateway · {intelligence.aiTake.model}</span>',
     '<span className="text-xs font-mono text-cyan-300 uppercase tracking-wider">{intelligence.aiTake.source === \'instinct-agent\' ? \'Instinct\' : \'AI Gateway\'} · {intelligence.aiTake.model}</span>'),
    ("""              </div>
            )}

          </div>
        </section>""",
     """              </div>
            )}
            {intelligence.capitalRotation && (
              <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 max-w-5xl">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span className="text-xs font-mono text-amber-300 uppercase tracking-wider">
                    {language === 'ro' ? 'Rotație de Capital' : 'Capital Rotation'} · {intelligence.capitalRotation.source === 'instinct-agent' ? 'Instinct' : 'AI Gateway'} · {intelligence.capitalRotation.model}
                  </span>
                </div>
                <h3 className="text-base font-bold text-slate-50">{intelligence.capitalRotation.headline}</h3>
                {intelligence.capitalRotation.paragraphs.map((paragraph, index) => (
                  <p key={index} className="mt-2 text-sm text-slate-300 leading-relaxed">{paragraph}</p>
                ))}
                {intelligence.capitalRotation.bullets && (
                  <ul className="mt-2 list-disc pl-5 text-sm text-slate-300 space-y-1">
                    {intelligence.capitalRotation.bullets.map((bullet, index) => <li key={index}>{bullet}</li>)}
                  </ul>
                )}
              </div>
            )}

          </div>
        </section>"""),
])

# 5. IntelligenceView label
edit('apps/web/src/components/IntelligenceView.tsx', [
    ('<div className="intelligence-ai-take-label">AI Gateway · {brief.aiTake.model}</div>',
     '<div className="intelligence-ai-take-label">{brief.aiTake.source === \'instinct-agent\' ? \'Instinct\' : \'AI Gateway\'} · {brief.aiTake.model}</div>'),
])

print('ALL PATCHED')
