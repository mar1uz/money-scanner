# Acces

Loginul se face cu Google, prin Firebase Auth. Serverul ține o sesiune într-un cookie.

## Încarcă

| Ce | Fișier |
| --- | --- |
| Middleware-ul, rolurile, CSRF | `apps/api/src/middleware/auth.ts` |
| Login și logout | `apps/api/src/routes/auth-routes.ts`, `apps/web/src/components/AuthGate.tsx`, `apps/web/src/services/firebase-auth.ts` |
| Rutele publice, înaintea sesiunii | `apps/api/src/server.ts` |
| Tokenul de scheduler | `apps/api/src/services/scheduler-auth.ts` |

## Hotărâri

- Intră doar adresele din `ALLOWED_EMAILS`. Cele din `ADMIN_EMAILS` sunt Administrator, restul Viewer. Ambele liste stau în `cloudbuild.yaml`. O adresă nouă cere modificarea listei și un deploy.
- O cerere care schimbă ceva (scanare manuală, alertă) cere și `X-CSRF-Token`, verificat față de cookie-ul `money_scanner_csrf`.
- `verifySessionCookie(cookie, true)` rămâne cu verificarea de revocare la fiecare cerere. Marius a refuzat optimizarea ei (2026-10-07).
- Rutele programate primesc headerul `x-daily-scan-token`, comparat în timp constant.
- `/api/health` și `/api/chart-market-diagnostics` sunt publice și nu conțin secrete.
