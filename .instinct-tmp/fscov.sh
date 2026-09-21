#!/bin/bash
TOKEN=$(gcloud auth print-access-token 2>/dev/null)
B=https://firestore.googleapis.com/v1/projects/gen-lang-client-0610749770/databases/money-scanner-360/documents
MAIN=$(curl -sS -H "Authorization: Bearer $TOKEN" $B/operations/daily-regime-scan)
RUN=$(echo "$MAIN" | python3 -c "import json,sys; print(json.load(sys.stdin)['fields']['activeRunId']['stringValue'])")
echo "activeRun: $RUN"
curl -sS -H "Authorization: Bearer $TOKEN" "$B/operations/daily-regime-scan/runs/$RUN/segments?pageSize=50" | python3 -c "
import json, sys
d = json.load(sys.stdin)
for doc in d.get('documents', []):
    f = doc['fields']
    kind = f.get('kind', {}).get('stringValue')
    if kind != 'coverage':
        continue
    grp = f.get('group', {}).get('stringValue', '')
    items = f.get('items', {}).get('arrayValue', {}).get('values', [])
    errs = 0; conf = 0; cand = 0
    for it in items:
        fv = it.get('mapValue', {}).get('fields', {})
        st = fv.get('status', {}).get('stringValue', '')
        if st == 'ERROR': errs += 1
        elif st == 'CONFIRMED': conf += 1
        elif st == 'CANDIDATE': cand += 1
    print(grp, 'items', len(items), '| errors', errs, '| confirmed', conf, '| candidates', cand)
    for it in items[:3]:
        fv = it.get('mapValue', {}).get('fields', {})
        err = fv.get('error', {}).get('stringValue')
        if err: print('   sample error:', fv.get('symbol',{}).get('stringValue'), err[:100])
"
