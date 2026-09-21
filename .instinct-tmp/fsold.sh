#!/bin/bash
TOKEN=$(gcloud auth print-access-token 2>/dev/null)
B=https://firestore.googleapis.com/v1/projects/gen-lang-client-0610749770/databases/money-scanner-360/documents
curl -sS -H "Authorization: Bearer $TOKEN" "$B/operations/daily-regime-scan/runs/1789970496399-l7o921/segments?pageSize=50" | python3 -c "
import json, sys, datetime
d = json.load(sys.stdin)
fmt = lambda ms: datetime.datetime.utcfromtimestamp(int(ms)/1000).strftime('%Y-%m-%d %H:%M') if ms else None
for doc in d.get('documents', []):
    f = doc['fields']
    if f.get('kind', {}).get('stringValue') != 'confirmed':
        continue
    grp = f.get('group', {}).get('stringValue', '')
    for it in f.get('items', {}).get('arrayValue', {}).get('values', []):
        fv = it.get('mapValue', {}).get('fields', {})
        sym = fv.get('symbol', {}).get('stringValue')
        tf = fv.get('timeframe', {}).get('stringValue')
        if (sym, tf) not in (('AVAX','1w'), ('VET','4h'), ('VET','1w'), ('EGLD','4h')):
            continue
        def g(k):
            v = fv.get(k, {})
            return v.get('stringValue') or v.get('doubleValue') or v.get('integerValue')
        print(grp, sym, tf, 'score', g('priorityScore'), '| confAt', fmt(g('confirmedAt')), '| candleTs', fmt(g('candleTimestamp')), '| scannedAt', fmt(g('scannedAt')))
"
