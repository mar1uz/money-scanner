# Scanner și Money Line

Money Line este indicatorul de trend: determinist, fără repictare, calculat doar pe lumânări închise. Scanerul îl rulează pe tot universul și ține flipurile confirmate și candidații „aproape de flip”.

## Încarcă

| Ce | Fișier |
| --- | --- |
| Motorul și indicatorii | `packages/money-line/src/engine.ts`, `packages/money-line/src/indicators/` |
| Norul și SMA 50/200 | `packages/money-line/src/cloud-supertrend.ts` |
| Starea, scanarea universului, flipurile | `apps/api/src/services/app-state.ts` |
| Rutele scanerului și `/assets/:symbol` | `apps/api/src/routes/scanner-routes.ts` |
| Cache-ul de rezultate | `apps/api/src/services/scanner-snapshots.ts` |
| Prețuri și lumânări | `context/date-piata/CONTEXT.md` |

## Hotărâri

- Scorul este o compoziție ponderată din EMA 20/50/200 (aliniere și pantă), ROC 9/21, MACD 12/26/9, RSI 14, RVOL (MA 20) și ATR 14.
- Vârsta flipului vine din timestampul lumânării închise pe care s-a schimbat tierul (`transitionTime`), nu din momentul scanării.
- Universul de flipuri are 150 de monede, în ordinea market cap-ului CoinGecko, cu sursă reală de lumânări (Binance USDT spot sau Hyperliquid). Stablecoinurile sunt excluse. Nu se completează din catalogul static. Dacă primele 250 nu dau 150 scanabile, se ia pagina 2.
- Scanările automate rulează doar pe 1D și 1W (`AUTOMATED_FLIP_TIMEFRAMES`). 4H și 8H rămân doar manuale: butoanele Rapid și Complet din Alerte și comenzile Telegram.
- Flipurile confirmate se păstrează oricât de vechi ar fi. Limita este 5000 (`CONFIRMED_FLIPS_CAP`). Se salvează pe segmente de 80, fiecare cu id-ul lui. O monedă care iese din universul de 150 își pierde flipurile la următoarea scanare programată.
- Cache warmer-ul rulează la 3 minute. Cotațiile au TTL 180 s, iar snapshot-ul scanerului se refolosește 165 s. Clientul web reîncarcă la 5 minute.
- Distanța față de high: `lastClosedHigh` vine din ultima lumânare închisă a timeframe-ului. Fără high valid, câmpul lipsește și cardul arată „—”.
- `GET /api/alerts/dashboard` nu mai cere un preț live pentru fiecare flip. Cardul arată prețul salvat la ultima scanare.
- La deschiderea paginii nu pornește nicio scanare. Rămân warmup-ul de dimineață și Rescan-ul manual.
- Optimizările de viteză (ticker-ul bulk Binance, SMA cu sumă rulantă, `calculateSignalsAt`, norul memorat) trebuie să dea exact aceleași valori. Testele de echivalență din `packages/money-line` și `packages/market-data/src/adapters/binance-bulk-ticker.test.ts` păzesc asta.
