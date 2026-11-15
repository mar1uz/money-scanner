# Crypto Radar

Cercetare multichain pe monede mici și noi: piață, social și siguranța portofelelor. Datele se adună programat și se văd în tabul Crypto Radar.

## Încarcă

| Ce | Fișier |
| --- | --- |
| Serviciul și scorurile | `apps/api/src/services/radar/` (`service.ts`, `scoring.ts`, `market.ts`, `social.ts`, `security.ts`, `store.ts`) |
| Rutele și ținta Scheduler | `apps/api/src/routes/radar-routes.ts` |
| Digestul `/scan radar` | `apps/api/src/services/radar-digest-service.ts`, `packages/notifications/src/radar-digest.ts` |
| Ecranul | `apps/web/src/components/CryptoRadarView.tsx`, `crypto-radar-*.ts` |
| Proiectarea inițială | `docs/crypto-radar/IMPLEMENTATION.md`, `docs/crypto-radar/FOMO.md` |

## Hotărâri

- Colectarea rulează la 30 de minute, raportul la 00:05 și 12:05 UTC. Ambele trec prin `/api/radar/scheduled`.
- Siguranța folosește doar surse gratuite: RugCheck pentru Solana și GoPlus în batch pentru EVM.
- Digestul `/scan radar` e determinist, fără AI. Fiecare sursă are propriul try/catch, ca o sursă căzută să nu oprească digestul.
- Tabelul are header lipit sus și scroll în ambele direcții, pe desktop și pe telefon.
