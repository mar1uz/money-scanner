# AGENTS.md — harta Money Scanner

Citește acest fișier la început. Nu căuta prin tot repo-ul. Încarcă doar rândul din tabel care se potrivește cu sarcina, apoi fișierul lui `CONTEXT.md`.

## Ce este

Money Scanner (Market Scanner 360) este o aplicație de analiză de piață: crypto, acțiuni și metale. Nu face tranzacții reale. Interfața are româna ca limbă sursă și engleza ca traducere. `/tape` pornește în engleză.

- **Money Line** spune *când* se schimbă trendul: un indicator determinist, calculat doar pe lumânări închise (`packages/money-line`).
- **AI Briefing** spune *unde* se concentrează atenția și capitalul: texte scrise de Instinct, publicate prin API.
- **4x200** spune *care* proiecte au calitate economică: un screen de business quality pe top 200 crypto, plus 6 criterii pentru acțiuni.
- Un singur serviciu Cloud Run (`market-scanner-360`) servește API-ul (`apps/api`) și aplicația web construită (`apps/web`). Datele persistente stau în Firestore (`money-scanner-360`).
- Alertele pleacă pe Telegram (@Crypto_mac_alert_bot). Scanările programate vin din Cloud Scheduler.

Hotărârile care încă sunt valabile stau în `CONTEXT.md` din domeniul sarcinii, la „Hotărâri”. `HANDOFF.md` este jurnalul. Se deschide ca să înțelegi un pas vechi. O secțiune veche de acolo nu anulează hotărârea din domeniul ei.

## Unde mergi

| Sarcină | Încarcă întâi | Cod |
| --- | --- | --- |
| Money Line, scanner, flipuri, universul scanat | `context/scanner/CONTEXT.md` | `packages/money-line/`, `apps/api/src/services/app-state.ts`, `apps/api/src/routes/scanner-routes.ts` |
| Alerte, Telegram, scanările zilnice | `context/alerte/CONTEXT.md` | `apps/api/src/routes/telegram-routes.ts`, `packages/notifications/`, `apps/api/src/services/*-alert-*` |
| Prețuri, lumânări, căutare, venue-uri, pins | `context/date-piata/CONTEXT.md` | `packages/market-data/`, `packages/shared/src/search/` |
| AI Briefing, Instinct, 4x200, Top Alpha | `context/ai/CONTEXT.md` | `apps/api/src/routes/ai-routes.ts`, `apps/api/src/services/narrative-guard.ts`, `packages/ai-analysis/` |
| Crypto Radar | `context/radar/CONTEXT.md` | `apps/api/src/services/radar/`, `apps/api/src/routes/radar-routes.ts` |
| Regime Tape (`/tape`, public) | `context/tape/CONTEXT.md` | `apps/api/src/services/regime-tape-*.ts`, `apps/api/src/routes/tape-routes.ts` |
| Backtest, cercetare, forward test, JEV insight | `context/cercetare/CONTEXT.md` | `scripts/`, `insight/`, `docs/backtests/` |
| Login, roluri, sesiune | `context/acces/CONTEXT.md` | `apps/api/src/middleware/auth.ts`, `apps/api/src/routes/auth-routes.ts` |
| Texte, layout, teme, traduceri | `apps/web/CONTEXT.md` | `apps/web/src/` |
| Deploy, unde rulează, joburi programate | `_config/deploy.md` | `cloudbuild.yaml`, `Dockerfile` |
| Convenții și reguli de lucru | `_config/conventions.md` | — |
| Metoda folosită pentru harta asta | `docs/icm-template/README.md` | — |

## Cum se ține harta

- Ciornele și fișierele intermediare merg în `tmp/`. Nu le lăsa în rădăcină. `tmp/`, `scratch/`, `.agents/` și `.instinct-tmp/` nu intră în git.
- O informație are un singur loc. Restul fișierelor trimit acolo.
- Harta nu se actualizează singură. Dacă adaugi un domeniu, muți un flux sau schimbi o hotărâre, actualizează tabelul de aici și `CONTEXT.md` din domeniul acela.
- Rapoartele din `docs/audits/` și `docs/backtests/` sunt istorie. Se citesc doar când sarcina e chiar despre ele.
