import sys
path = 'insight/run-insight.sh'
with open(path) as f:
    s = f.read()
edits = [
    ('        siglab-crypto|siglab-crypto-*) modes+=("siglab-crypto") ;;',
     '        siglab-crypto|siglab-crypto-*) modes+=("siglab-crypto") ;;\n        aicontent|aicontent-*) modes+=("aicontent") ;;', 1),
    ('      elif [ "$mode" = "reclaim" ]; then',
     '''      elif [ "$mode" = "aicontent" ]; then
        # AI content for the Briefing/Intelligence pages via the AI Gateway.
        # Publishes through the token-protected /api/ai/publish-content endpoint.
        node scripts/ai-content-writer.mjs >> "$DIR/ai-content.log" 2>&1
        log "aicontent exit=$?"
      elif [ "$mode" = "reclaim" ]; then''', 1),
    ('            run_pipeline "scheduled-or-requested" --scan tmp/scans/nearflip-latest.json --ath || rc=$?',
     '''            run_pipeline "scheduled-or-requested" --scan tmp/scans/nearflip-latest.json --ath || rc=$?
            # Refresh the AI Briefing/Intelligence page content after the daily run.
            node scripts/ai-content-writer.mjs >> "$DIR/ai-content.log" 2>&1 && log "aicontent ok" || log "WARN aicontent failed"''', 1),
]
for old, new, count in edits:
    if old not in s:
        print(f'ANCHOR MISSING: {old[:80]!r}')
        sys.exit(1)
    s = s.replace(old, new, count)
with open(path, 'w') as f:
    f.write(s)
print('patched run-insight.sh')
