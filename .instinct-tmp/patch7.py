path = 'insight/run-insight.sh'
with open(path) as f:
    s = f.read()
s = s.replace('        node scripts/ai-content-writer.mjs >> "$DIR/ai-content.log" 2>&1\n        log "aicontent exit=$?"',
              '        (cd "$REPO" && node scripts/ai-content-writer.mjs) >> "$DIR/ai-content.log" 2>&1\n        log "aicontent exit=$?"', 1)
s = s.replace('            node scripts/ai-content-writer.mjs >> "$DIR/ai-content.log" 2>&1 && log "aicontent ok" || log "WARN aicontent failed"',
              '            (node scripts/ai-content-writer.mjs) >> "$DIR/ai-content.log" 2>&1 && log "aicontent ok" || log "WARN aicontent failed"', 1)
with open(path, 'w') as f:
    f.write(s)
print('fixed')
