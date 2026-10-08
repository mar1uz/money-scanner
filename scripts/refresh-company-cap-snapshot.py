#!/usr/bin/env python3
"""Refresh the checked company-cap snapshot. Run from repo root; review then build/deploy.
No auth workaround, no retries on403/429. A failed refresh invalidates the snapshot.
"""
import json,re,urllib.request,datetime,time
from pathlib import Path
p=Path('apps/web/src/data/company-cap-snapshot.json');old=json.loads(p.read_text());new={**old,'companies':{},'fetchedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'error':None}
for asset in old['universe']:
 symbol=asset['symbol'];url=old['companies'].get(symbol,{}).get('url')
 if not url:new['error']='Missing verified URL: '+symbol;break
 try:
  r=urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'}),timeout=15)
  html=r.read().decode();text=re.sub(r'\s+',' ',re.sub('<[^>]*>',' ',html));m=re.search(r'Market cap:\s*\$([\d.,]+)\s*(Trillion|Billion|Million)\s*USD',text)
  if not m:raise ValueError('No USD market cap on source page')
  value=float(m[1].replace(',',''))*{'Trillion':1e12,'Billion':1e9,'Million':1e6}[m[2]]
  day=re.search(r'On (\w+ \d+\w*, \d{4})',text);month=re.search(r'As of (\w+ \d{4})',text)
  new['companies'][symbol]={'value':value,'url':url,'dataAsOf':day[1] if day else month[1] if month else None}
  print(symbol,value,flush=True);time.sleep(1)
 except Exception as e:new['error']=symbol+': '+str(e);print(new['error'],flush=True);break
p.write_text(json.dumps(new,indent=2)+'\n')
print('Coverage',len(new['companies']),'/',len(new['universe']))
if new['error']:raise SystemExit(1)
