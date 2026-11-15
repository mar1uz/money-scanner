# CONTEXT.md — unde mergi

Răspunde la „unde caut”, nu ține conținutul domeniilor. Detaliile stau în `CONTEXT.md` din folderul domeniului.

## Produs

Money Scanner (`package.json`: `money-scanner-monorepo`) este un monorepo npm workspaces. `packages/*` sunt bibliotecile (money-line, market-data, shared, notifications, ai-analysis, social-analysis). `apps/api` este serverul Express, `apps/web` este aplicația React/Vite servită de el. `apps/worker` nu intră în imaginea de producție: `Dockerfile` pornește doar `apps/api/dist/index.js`.

Aplicația web cere login Google (Firebase). `/tape` și câteva rute `/api` sunt publice.

## Rutare

| Dacă întrebarea este despre | Deschide |
| --- | --- |
| un scor Money Line, un flip, „aproape de flip”, universul scanat | `context/scanner/CONTEXT.md` |
| un mesaj Telegram, o alertă, scanarea de dimineață | `context/alerte/CONTEXT.md` |
| un preț greșit, un grafic gol, căutarea, pe ce bursă stă o monedă | `context/date-piata/CONTEXT.md` |
| un text din AI Briefing, Intelligence, 4x200, Top Alpha | `context/ai/CONTEXT.md` |
| Crypto Radar sau `/scan radar` | `context/radar/CONTEXT.md` |
| pagina publică `/tape` sau ledgerul de tranziții | `context/tape/CONTEXT.md` |
| un backtest, o strategie, un forward test, raportul JEV | `context/cercetare/CONTEXT.md` |
| cine are acces, roluri, CSRF | `context/acces/CONTEXT.md` |
| o etichetă, un ecran, o temă, o traducere | `apps/web/CONTEXT.md` |
| unde rulează serviciul, cum se face deploy, joburile Scheduler | `_config/deploy.md` |

## Ce nu încarci

- `HANDOFF.md` este jurnalul cronologic (peste 4700 de rânduri). Hotărârile curente stau în `CONTEXT.md` din domeniu. Directiva de la începutul lui (doar date reale) este în `_config/conventions.md`.
- `docs/icm-template/` explică metoda de organizare. Nu descrie produsul.
- `docs/audits/` și `docs/backtests/` sunt rapoarte datate, nu contractul curent.
- `.agents/` conține briefinguri de la sesiuni vechi de agenți. Nu intră în git și nu e harta.
