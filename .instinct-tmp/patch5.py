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

take_block = """
            {intelligence.aiTake && (
              <div className="mt-4 rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4 max-w-5xl">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-cyan-300" />
                  <span className="text-xs font-mono text-cyan-300 uppercase tracking-wider">AI Gateway · {intelligence.aiTake.model}</span>
                </div>
                <h3 className="text-base font-bold text-slate-50">{intelligence.aiTake.headline}</h3>
                {intelligence.aiTake.paragraphs.map((paragraph, index) => (
                  <p key={index} className="mt-2 text-sm text-slate-300 leading-relaxed">{paragraph}</p>
                ))}
                {intelligence.aiTake.bullets && (
                  <ul className="mt-2 list-disc pl-5 text-sm text-slate-300 space-y-1">
                    {intelligence.aiTake.bullets.map((bullet, index) => <li key={index}>{bullet}</li>)}
                  </ul>
                )}
              </div>
            )}
"""

patch('apps/web/src/components/AIBriefingView.tsx', [
    ("""              <p className="mt-3 text-sm text-slate-300 leading-relaxed max-w-5xl">{intelligence.executiveSummary}</p>
            </div>""",
     """              <p className="mt-3 text-sm text-slate-300 leading-relaxed max-w-5xl">{intelligence.executiveSummary}</p>
            </div>""" + take_block, 1),
])

patch('apps/web/src/components/IntelligenceView.tsx', [
    ("""        ) : (
          <>
            <p className={`intelligence-summary ${showFullText ? 'is-expanded' : ''}`}>""",
     """        ) : (
          <>
            {brief.aiTake && (
              <div className="intelligence-ai-take">
                <div className="intelligence-ai-take-label">AI Gateway · {brief.aiTake.model}</div>
                <strong>{brief.aiTake.headline}</strong>
                {brief.aiTake.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
                {brief.aiTake.bullets && <ul>{brief.aiTake.bullets.map((bullet, index) => <li key={index}>{bullet}</li>)}</ul>}
              </div>
            )}
            <p className={`intelligence-summary ${showFullText ? 'is-expanded' : ''}`}>""", 1),
])

patch('apps/web/src/index.css', [
    (".intelligence-brief { padding: clamp(1.1rem, 3vw, 2rem); border: 1px solid rgba(200, 241, 105, 0.22); border-radius: 1rem; background: var(--t-brief-gradient); }",
     """.intelligence-brief { padding: clamp(1.1rem, 3vw, 2rem); border: 1px solid rgba(200, 241, 105, 0.22); border-radius: 1rem; background: var(--t-brief-gradient); }
.intelligence-ai-take { margin-bottom: 1rem; padding: 0.9rem 1rem; border: 1px solid rgba(103, 232, 249, 0.3); border-radius: 0.75rem; background: rgba(103, 232, 249, 0.06); }
.intelligence-ai-take-label { font-size: 0.65rem; font-family: ui-monospace, monospace; text-transform: uppercase; letter-spacing: 0.08em; color: #67e8f9; margin-bottom: 0.35rem; }
.intelligence-ai-take p { margin: 0.4rem 0 0; font-size: 0.85rem; line-height: 1.5; color: var(--t-text-secondary, #cbd5e1); }
.intelligence-ai-take ul { margin: 0.4rem 0 0; padding-left: 1.1rem; font-size: 0.85rem; color: var(--t-text-secondary, #cbd5e1); }""", 1),
])
