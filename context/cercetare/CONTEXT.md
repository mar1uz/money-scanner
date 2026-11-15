# Cercetare, backtest și JEV insight

Strategiile se cercetează local, cu scripturi. Rezultatele sunt rapoarte, nu semnale de producție. Doar ce primește aprobare explicită ajunge în alerte.

## Încarcă

| Ce | Fișier |
| --- | --- |
| Backtest Lab din aplicație | `apps/api/src/services/backtest-service.ts`, `apps/web/src/components/BacktestView.tsx` |
| Scripturile de cercetare | `scripts/research-*.mjs`, `scripts/backtest-*.mjs` |
| Forward test și paper trading | `scripts/forward-test-*.mjs`, `scripts/paper-trade-*.mjs` |
| Near-flip, preflip, 4 axe, ATH | `scripts/nearflip-ui-top20.mjs`, `scripts/preflip-*.mjs`, `scripts/four-*.mjs`, `scripts/ath-context*.mjs` |
| Raportul JEV de pe Mac | `insight/README.md`, `insight/run-insight.sh`, `scripts/jev-insight*.mjs` |
| Rapoartele datate | `docs/backtests/` |

## Hotărâri

- Tot ce e aici rămâne pe hârtie. Nu există tranzacții reale și nici conexiune de execuție la o bursă.
- Forward testul top 5: intrarea este la prima deschidere zilnică UTC strict după `selection.recordedAt` și se scrie doar când lumânarea aceea s-a închis. Rândurile vechi nu se rescriu. Costurile sunt 0,125% pe fiecare parte, inclusiv pe benchmarkul BTC. Rezultatul vechi de 100% / +21,52% este retras.
- Pachetul near-flip local este doar 1D și 1W. `--all-timeframes` adaugă manual 4H și 8H.
- `insight/run-insight.sh` rulează prin LaunchAgent-ul `no.moneyscanner.jev-insight` la 07:45. Cheia `AI_GATEWAY_API_KEY` se încarcă din `../jev-router/.env.local` doar în procesul acela. Nu se citește, nu se tipărește și nu se copiază.
- Fișierele din `insight/requests/` sunt doar declanșatoare. Numele și conținutul lor nu se citesc și nu se execută.
- Ieșirile merg în `tmp/` (`tmp/scans/`, `tmp/insights/`), care nu intră în git.
