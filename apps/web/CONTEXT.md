# Interfață

Aplicația React/Vite din browser. Româna este limba sursă, iar engleza se aplică din meniu.

## Încarcă

| Ecran | Fișier |
| --- | --- |
| Shell, taburi, polling | `apps/web/src/App.tsx`, `Header.tsx`, `Sidebar.tsx` |
| Scanner | `components/ScannerTable.tsx` |
| Pagina de asset și graficul | `components/AssetDeepDiveView.tsx`, `InteractiveChart.tsx`, `CoinPageChart.tsx` |
| Alerte | `components/AlertsCenterView.tsx` |
| AI Briefing, Top Alpha, Business Quality | `context/ai/CONTEXT.md` |
| Heat map, Bubble, valoarea de piață | `components/CryptoHeatMapView.tsx`, `CryptoBubbleView.tsx`, `utils/market-value.ts` |
| Traduceri | `src/i18n.tsx`, `i18n-ui-dictionary*.ts`, `i18n-content-dictionary.ts` |
| Teme | `src/theme.css`, `src/index.css`, `components/ThemeSwitcher.tsx`, `docs/theme/README.md` |
| Apelurile spre API | `src/services/api.ts` |

## Hotărâri

- Fiecare text e complet în limba aleasă. Un text nou în română are perechea engleză în dicționar. `i18n-coverage.test.ts` pică la un text nou netradus, iar `i18n-leak-baseline.json` poate doar să scadă.
- Numele și simbolurile de asset stau în `translate="no"` sau `data-i18n-skip`, ca traducătorul să nu le strice („Ray” nu devine „Rază”).
- `/tape` pornește în engleză. Restul aplicației pornește în română, dacă utilizatorul n-a ales engleza.
- Tabul greu, pagina de asset și căutarea se încarcă la cerere (`React.lazy`, `DeferredPage`). Un chunk lipsă după deploy arată „Reload app”.
- Datele se reîmprospătează la 5 minute (`App.tsx`). La deschiderea unei pagini nu pornește nicio scanare.
- Tema de bază este Signal Graphite. Selectorul mai are L1–L5 (deschise) și cinci teme semnate: Ember Terminal, Arctic Paper, Burgundy Spectrum, Redline Monochrome Quant, Terra Quant. Un text nou nu coboară sub 12 px.
- Pe pagina de asset, timeframe-ul stă pe un singur rând. CoinGecko, DefiLlama, Ask AI, TradingView și copierea ID-ului stau în meniul cu trei puncte, care împinge graficul în jos, nu îl acoperă. Butonul „TradingView extern” de lângă badge-ul de trend rămâne.
- Un timeout sau o eroare la încărcare arată „—” și un mesaj clar, nu 0/0.
- Fără gradient pe bara de progres și în AI Briefing.
