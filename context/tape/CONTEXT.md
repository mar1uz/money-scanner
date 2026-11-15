# Regime Tape

Ledgerul public, doar cu adăugare, al fiecărei tranziții Money Line pe lumânări închise, cu rezultatele la 1, 7 și 30 de zile. Ține și semnalele care au pierdut. Este dovada publică a produsului.

## Încarcă

| Ce | Fișier |
| --- | --- |
| Tipurile și versiunea | `packages/shared/src/types/regime-tape.ts` |
| Scanarea, salvarea, rezultatele | `apps/api/src/services/regime-tape-service.ts` |
| Rutele | `apps/api/src/routes/tape-routes.ts` |
| Pagina publică | `apps/api/src/services/regime-tape-page.ts`, `apps/api/src/services/tape-briefing.ts` |
| Jobul Scheduler | `scripts/configure-regime-tape-scheduler.mjs` |

## Hotărâri

- Scanarea rulează la 07:30 Europe/Oslo, pe 1D și 1W, pe tot universul (crypto, acțiuni, metale, fără stablecoinuri). Rezultatele scadente se actualizează cel mult 60 pe rulare.
- În Firestore, id-ul documentului dintr-un eveniment este cheia de idempotență (`tape:<clasă>:<simbol>:<tf>:<închiderea lumânării>`). Scrierea e create-only, într-o tranzacție. Rularea are un lock de 20 de minute.
- `/tape` și `/api/tape/{events,summary,x-preview,waitlist,proof}` sunt publice, înaintea middleware-ului de sesiune. `/api/tape/scan` cere tokenul de scheduler.
- Pagina pornește în engleză și arată dovezi: ledgerul, acoperirea scanării, briefingul zilnic și Top 5 subevaluate.
- Previzualizarea pentru X se postează doar manual. Nimic nu postează singur.
- Tonul: afirmații puternice, susținute de date („Money Line a trecut în Bullish la închiderea zilnică”), niciodată „prețul va crește”. Metoda, sursele, orele UTC și avertismentul de risc stau pe pagină, discret.
- Backtesturile din `docs/backtests/` nu sunt istoricul public. Istoricul public este doar tape-ul.
