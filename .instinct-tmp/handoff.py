import pathlib
p = pathlib.Path('HANDOFF.md')
s = p.read_text()
anchor = '## Step 90 — Scor setup diferențiat pentru flipuri (2026-09-21, 08:35 CEST)'
assert anchor in s
block = '''## Step 91 — /tape pornește mereu în engleză + validare forward pentru scor (2026-09-21, 11:45 CEST)
- /tape (pagina publică pentru audiența X engleză): `resolveInitialLanguage()` în `apps/web/src/i18n.tsx` forțează engleza la pornire pe `/tape` indiferent de preferința salvată; restul aplicației păstrează preferința (implicit română). Teste în `apps/web/src/i18n.test.ts`. Revizie: market-scanner-360-00219-ptx (commit 9a48c29).
- Validare forward a scorului redesenat (doar paper/logging): `scripts/forward-test-score-bands.mjs` + core pur. Protocol predeclarat: benzi <45/45-55/55-65/65-75/75+ pe `priorityScore`, intrare la `confirmationPrice` cu 0.075% fee + 0.05% slippage per parte, ieșiri fixe +7d/+14d/+30d din citirile zilnice ale scanerului, doar flipuri confirmate ≥2026-09-21 (fără leakage), log append-only `tmp/paper-trades/score-bands-forward.jsonl`. Review fix: 60 intrări sau 2026-12-21. 9/9 teste; commit 4a6664d. Rulare zilnică după scanarea de 08:00 (București) prin wake-ul agentului. Atenție la semantica `confirmDate`: se măsoară de la momentul confirmării (închiderea lumânării), nu de la deschiderea ei — la săptămânal altfel ieșirile +7d se închideau instant.

## Step 92 — Conținut AI pe limba UI + secțiunea Capital Rotation (2026-09-21, 12:00 CEST)
- Problemă: blocurile „AI take" erau generate doar în română, deci UI-ul în engleză arăta conținut AI românesc. Fix la nivel de pipeline: endpoint-ul `POST /api/ai/publish-content` acceptă acum `language` ('ro'|'en') și `source` ('ai-gateway'|'instinct-agent') și stochează per limbă (`ai-content-<key>-<lang>`; cheia veche rămâne fallback RO). Atașarea citește copia pe limba cererii pe `/ai/market-intelligence`, `/intelligence/brief` și `/ai/briefing` (care acum acceptă `?language=`).
- `scripts/ai-content-writer.mjs` generează fiecare take în ro + en (2×3 generări) și publică ambele. UI etichetează sursa („AI Gateway" vs „Instinct").
- Secțiune nouă „Capital Rotation" pe AI Briefing (card amber, titlu RO „Rotație de Capital"): conținut cross-market despre rotații mari spre metale/stocks/crypto și narațiuni (cipuri, robotică, AI), scris de agentul de conținut Instinct. Cheie nouă `capital-rotation`, atașată pe market-intelligence + briefing. Publicare agent: fișiere JSON în `tmp/ai-content-outbox/` + `scripts/instinct-content-publisher.mjs` (tokenul rămâne pe Mac, citit din jobul Cloud Scheduler, neprintat).
- Bonus în aceeași tură: completate lipsurile din harta RO→EN pentru chrome-ul vizibil pe /tape (sidebar, search, filtre piețe). Commit 7232f70.

'''
s = s.replace(anchor, block + anchor, 1)
p.write_text(s)
print('handoff updated')
