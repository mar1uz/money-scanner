# AI Briefing, 4x200 și Top Alpha

Textele de analiză sunt scrise de Instinct și publicate prin API. Modelul (Gemini) nu scrie text afișat. Scorurile 4x200, Business Quality și Top Alpha sunt calculate din date.

## Încarcă

| Ce | Fișier |
| --- | --- |
| Rutele AI, publicarea textelor, warmup-ul de la 07:00 | `apps/api/src/routes/ai-routes.ts` |
| Filtrul de texte | `apps/api/src/services/narrative-guard.ts` |
| Publicatorul de pe Mac | `scripts/instinct-content-publisher.mjs` |
| Analiza deterministă pe asset | `packages/ai-analysis/src/` |
| 4x200 crypto | `apps/api/src/services/crypto-four-criteria-*.ts` |
| Business Quality acțiuni | `apps/api/src/services/stock-business-quality-scanner.ts` |
| Ecranele | `apps/web/src/components/AIBriefingView.tsx`, `TopAlphaView.tsx`, `BusinessQualityView.tsx`, `IntelligenceView.tsx` |

## Hotărâri

- Cadrul produsului: Money Line = *când*, AI Briefing = *unde*, 4x200 = *care*. Orice suprafață publică ține de unul dintre ele.
- Textele zilnice (`ai-content-{briefing,market-intelligence,intelligence-brief,capital-rotation}-{en,ro}`) și cele pe asset (`investment-guide`, `asset-profile`, `business-quality`) vin doar de la Instinct: `POST /api/ai/publish-content` cu `source: instinct-agent`. Altă sursă primește 403.
- `narrative-guard.ts` respinge cu 422 un market cap agregat sub $100B sau peste $1000T și o decizie de dobândă a unei bănci centrale fără dată în aceeași propoziție. Cititorii servesc doar texte care trec filtrul.
- Fără briefing proaspăt de la Instinct, pagina spune asta. Nu revine la textul modelului.
- `MODEL_NARRATIVE` e oprit. Cardurile de narativă rămân doar cele deterministe (mișcări calculate din cotații).
- Chatul „Ask the AI analyst” este scos complet (`POST /api/ai/ask` dă 404). Butoanele Ask AI de pe carduri doar pun o cerere în Firestore.
- `scripts/ai-content-writer.mjs` este retras (iese cu codul 3).
- La 4x200, criteriul de rețea cere fees pe 30 de zile de cel puțin $100K și TVL de cel puțin $10M.
- O valoare de evaluare sau ETF care lipsește se arată N/A, nu se calculează din altceva.
- Fiecare card arată market cap-ul în subtitlu: „Nume · MC $X”, sau „MC —” fără o valoare verificată. Top Alpha crypto își păstrează tile-ul mare de market cap.
