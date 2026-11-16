# Deploy și unde rulează

Verificat live la 2026-11-15, cu `gcloud`. Dacă producția se mută, se actualizează fișierul ăsta. `HANDOFF.md` rămâne povestea, nu instrucțiunea de deploy.

## Unde sunt utilizatorii

- Proiect Google Cloud `gen-lang-client-0610749770`, regiunea `europe-west3`.
- Serviciul Cloud Run `market-scanner-360`, public (`--allow-unauthenticated`; aplicația își face singură loginul). 1 vCPU, 1 GiB, timeout 900 s, minim 0 instanțe.
- Adrese: `https://scanner.relayhub.no` (Load Balancer extern, NEG serverless spre Cloud Run) și `https://market-scanner-360-384051756749.europe-west3.run.app`.
- Imaginea: `europe-west3-docker.pkg.dev/gen-lang-client-0610749770/cloud-run-source-deploy/crypto-scanner-web:<sha scurt>`. Tagul este commitul, deci revizia activă spune ce cod rulează.
- La 2026-11-16 rula `crypto-scanner-web:fe1e093` (revizia `market-scanner-360-00298-fpf`, 100% din trafic). Revizia anterioară: `market-scanner-360-00297-dk4` (`2bc8680`).

Verificare rapidă:

```bash
gcloud run services describe market-scanner-360 --region europe-west3 \
  --format="value(spec.template.spec.containers[0].image,status.latestReadyRevisionName)"
git rev-parse --short HEAD
```

## Separat de RelayHub

Același proiect Google Cloud ca RelayHub, dar tehnic independent. Un deploy Money Scanner nu atinge serviciile RelayHub (`cloud-callcenter-saas`, `relayhub-hybrid-email-test`) și nici jobul Scheduler `mbn-keeper-tick`, care e al RelayHub. Repository-ul Artifact Registry `cloud-run-source-deploy` este comun, de aceea nu are politică de ștergere automată.

## Publicare, doar când se cere

- Nu există trigger Cloud Build. Un `git push` nu publică nimic.
- Se publică dintr-un `git worktree` curat al commitului, ca munca necommitată să nu plece în producție:

```bash
git worktree add ../ms-deploy-<sha> <sha>
cd ../ms-deploy-<sha>
gcloud builds submit --config cloudbuild.yaml --substitutions=COMMIT_SHA=<sha scurt> .
```

- Fără `COMMIT_SHA`, tagul imaginii e gol și build-ul pică cu „invalid image name”.
- `cloudbuild.yaml` folosește `--update-env-vars` și `--update-secrets`. Restul variabilelor și legăturile Secret Manager setate pe serviciu rămân. Nu schimba în `--set-env-vars`.
- `.gcloudignore` scoate din build `tmp/`, `docs/`, `insight/`, `*.md` și `.env*`. Fișierele de context nu ajung în imagine.
- După deploy: `/api/health` 200 pe ambele adrese, revizia nouă la 100%, fără erori în loguri. Ecranele cu login nu se pot verifica din automatizare.
- Revenire: `gcloud run services update-traffic market-scanner-360 --region europe-west3 --to-revisions=<revizia veche>=100`.

## Date

- Firestore, baza numită `money-scanner-360` (`europe-west3`, cu protecție la ștergere).
- Secret Manager: `money-scanner-daily-scan-token` (devine `DAILY_SCAN_TOKEN`) și `telegram-webhook-secret`.
- Gemini e oprit: `MODEL_NARRATIVE` lipsește din mediu, deci `GEMINI_API_KEY` nu e folosit pentru texte.

## Joburi Cloud Scheduler

Toate trimit headerul `x-daily-scan-token`. Se configurează cu scripturile `scripts/configure-*-scheduler.mjs`, care fac doar dry-run fără `--apply`.

| Job | Program | Țintă |
| --- | --- | --- |
| `money-scanner-cache-warmer` | `*/3 * * * *` UTC | `/api/scanner/warm` |
| `money-scanner-daily-ai-warmup` | 07:00 Europe/Oslo | `/api/ai/daily-warmup` |
| `money-scanner-regime-tape-scan` | 07:30 Europe/Oslo | `/api/tape/scan` |
| `money-scanner-daily-regime-scan` | 08:00 Europe/Bucharest | `/api/alerts/daily-regime-scan` |
| `money-scanner-daily-sma-reclaim` | 08:00 Europe/Oslo | `/api/alerts/daily-sma-reclaim/scheduled` |
| `money-scanner-radar-collect` | `*/30 * * * *` UTC | `/api/radar/scheduled` |
| `money-scanner-radar-report` | 00:05 și 12:05 UTC | `/api/radar/scheduled` |

## Pe Mac

LaunchAgent-ul `no.moneyscanner.jev-insight` rulează zilnic la 07:45 `insight/run-insight.sh`. Detaliile sunt în `context/cercetare/CONTEXT.md`.
