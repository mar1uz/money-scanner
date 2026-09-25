# Audit tehnic: chart-market resolver (Money Scanner)

**Data:** 25 septembrie 2026
**Scop:** `packages/market-data/src/chart-market-resolver.ts` + `chart-market-probes.ts` și consumatorii lor (market-service, rutele API, pinii Firestore, alertele de preț).
**Metodă:** audit static (citire cod, `file:linie`) + măsurători live read-only (API-uri publice Binance/Bybit/OKX/MEXC/Kraken/Coinbase/CoinGecko/TradingView) + rularea resolverului real cu deps reale prin două harness-uri temporare (`tmp/audit-resolver/measure-full.ts`, `tmp/audit-resolver/fault-injection.ts`). Testele existente au fost rulate (`33/33` trec în `packages/market-data`, `16/16` pe resolver).
**Nu am putut verifica:** comportamentul instanței de producție (`/api/assets/BTC/chart-market` răspunde `401 AUTH_REQUIRED`, `/api/health` e public dar nu expune nimic despre rezoluții), conținutul colecției Firestore `chart-market-resolutions`, dacă `COINGECKO_API_KEY` este setat în Cloud Run (`.env.example` nu conține cheia → cache-ul și identitatea rulează implicit pe tier-ul anonim CoinGecko). Nu am modificat niciun fișier de cod și nu am scris în Firestore.

---

## 1. Rezumat executiv

Resolverul funcționează și alege, în măsurătorile mele, piețe reale pentru toate cele 6 simboluri testate (BTC, GRASS, HYPE, PONS, SUI, BP) — dar o face cu un cost de 40–53 de request-uri upstream pentru prima rezoluție per monedă, cu date de listing parțial inventate și cu zero observabilitate. Trei defecte de fond ies în evidență:

1. **Pinii nu expiră niciodată.** `resolveOne` întoarce pinul din Firestore înainte de orice verificare de TTL (`chart-market-resolver.ts:151-158`), `resolvedAt` e scris și returnat dar nefolosit pentru invalidare, iar store-ul e `create()`-only (`app-state.ts:307`) — deci o rezoluție greșită/degradată (inclusiv un `listingStart` fabricat) rămâne permanentă, iar o delistare ulterioară produce 500 permanent pe `/candles` (`market-service.ts:253-255`), fără nicio cale de recuperare din cod.
2. **Eșec tranzitoriu CoinGecko = eșec silențios.** `safe()` înghite toate erorile (`:127-133`), deci un `429` produce `null` fără niciun log; `market-service` transformă acel `null` în eroarea înșelătoare „No identity-verified candle market" (500 pe `/candles`, 503 pe deep-dive) sau în rânduri lipsă în tabele (fluxurile bulk folosesc `Promise.allSettled`). Măsurat azi: 3 din 8 cereri paralele către CoinGecko au primit `429` în 0.48s, iar fiecare activă nerezolvată consumă 2 cereri CoinGecko.
3. **Date de listing inventate pentru Kraken și Coinbase.** `krakenFirstDailyTs` (`:87-96`) cere `since=0`, pe care Kraken îl ignoră și întoarce ultimele 721 de lumânări → „listing" fals ≈ azi−720 zile pentru orice pair cu istoric mai mare (măsurat: XBTUSD/ETHUSD/XDGUSD/SOLUSD/ADAUSD, toate cu `first = 2024-10-05`; SUI raportat `2024-10-05` vs real `2023-05-03`). `coinbaseFirstDailyTs` (`:58-67`) are aceeași clasă de defect (măsurat: BTC-USD întoarce 350 rânduri care încep `2025-10-11`), iar comentariul din cod afirmă exact contrariul comportamentului real. Aceste date false intră în ranking, în filtrul de coverage și în răspunsul public `/chart-market` (`scanner-routes.ts:477`).

Adițional, volumul OKX e înmulțit cu prețul de două ori (`okx.ts:143` → `volCcy24h` este deja volum în quote), ceea ce face tie-break-ul de volum să favorizeze sistematic OKX (măsurat: SUI → `OKX:SUIUSDT`, deși `binance_spot` e primul în `PREFERENCE`), în timp ce `binance_spot` nu primește niciodată volum 24h (`:365-396` nu are caz pentru el). Ipoteza H6 (prefixul Gate) este **infirmată**: TradingView folosește `GATE:`, nu `GATEIO:`.

---

## 2. Cum funcționează resolverul azi, pas cu pas

1. **Intrare.** `resolve(rawSymbol, coinId)` (`chart-market-resolver.ts:136-145`): normalizează simbolul, respinge `:`/`.`/non-alfanumeric, deduplică apelurile concurente pe cheia `SIMBOL:coinId` prin `inFlight`.
2. **Poartă de identitate.** `resolveOne` (`:147-150`) refuză orice rezoluție fără `coinId` valid (`/^[a-z0-9-]{2,100}$/`) sau fără deps `verifiedIdentity` → `null`.
3. **Pin.** `pinned` (memorie) sau `store.get()` (Firestore, cheia `SIMBOL:coinId`) (`:151-158`). Pinul e acceptat dacă simbolul/id-ul coincid și toți candidații `candle`/`tv` sunt `identityVerified`; altfel `throw 'Chart market pin identity mismatch'`. **Nu există verificare de vechime.**
4. **Cache de proces** (`:159-160`): TTL 12h pentru rezoluții pozitive, 1h pentru negative (`:79-80`, `:178`) — irelevant când există pin.
5. **Identitate exactă** (`:183-184` + `chart-market-probes.ts:211-240`): 2 cereri CoinGecko — `/coins/{id}` (genesis + preț global) și `/coins/{id}/tickers?order=volume_desc&page=1`. `markets` = mulțimea de venue-uri mapate (`names`, `:224-226`) pentru rândurile cu `base == SIMBOL`, `target ∈ {USD,USDT,USDC}`, fără `is_anomaly`/`is_stale`. Rezultatul pozitiv e cache-uit 6h în `identityCache` (`:238`), cel negativ **nu**.
6. **Detecție venue-uri** (`:186-332`): `isOnBinanceSpot` (prima, secvențial), apoi în paralel Binance Futures, Bybit, OKX, Hyperliquid, Coinbase, Kraken, MEXC, Gate, Bitget, KuCoin (`:200-211`). Nu există short-circuit: chiar dacă Binance spot e detectat, toate celelalte sonde pornesc.
7. **Listing start** (`:337-361`): pentru fiecare candidat fără `listingStart`, o sondă dedicată — Binance `klines startTime=0&limit=1`; Bybit căutare binară pe fereastră de 120 zile (`bybit.ts:65-94`); Coinbase `candles?start=2015-01-01` (`probes.ts:58-67`); Kraken `OHLC since=0` (`:87-96`); MEXC căutare binară pe ferestre de 90 zile (`mexc.ts:60-78`); Hyperliquid `candleSnapshot` de la genesis (`hyperliquid.ts:141-152`).
8. **Volum 24h** (`:365-397`): se ia `earliest` din listing-urile cunoscute; se cere volum doar pentru candidații fără listing sau aflați în fereastra de tie (7 zile, `:78`). Cazurile acoperite: binance_futures, bybit, okx, coinbase, kraken, mexc, hyperliquid. **`binance_spot` lipsește.**
9. **Verificare de identitate** (`:399-403`): `identityVerified = markets.has(source)`; `binance_futures` e tratat ca sursă separată, dar mapa de identitate nu poate conține niciodată `binance_futures` → orice candidat futures e eliminat la acest pas.
10. **Preț de control** (`:404-408`): pentru fiecare candidat verificat se cere ultimul preț de la venue (`probes.ts:241-249`) și se elimină cei cu `|lastPrice/referencePrice − 1| > 5%`.
11. **Ranking** (`:100-125`): filtru de coverage (`:105-112`) → sortare după `listingStart` (tie pe 7 zile: spot înainte de futures/HL, apoi volum, apoi `PREFERENCE` `:63-75`).
12. **Rezultat** (`:409-413`): `candle` = primul candidat `candleCapable`, `tv` = primul cu `tvSymbol`; `resolvedAt = Date.now()`. Scriere în store (`:162-177`): `create()`; dacă scrierea eșuează se citește câștigătorul cursei și se adoptă, altfel `throw 'Chart market pin write failed'`.
13. **Consumatori:** `market-service.resolveCryptoChartMarket` (`:115-122`) întoarce `candle` sau `null`; dacă assetul are `coinGeckoId` și rezoluția e `null`, aruncă (`:161-164`, `:219-222`, `:277-280`). `getCandles`/`getCandlesBefore`/`getPriceQuote` rutează apoi pe adapterul sursei alese, iar `getCandlesBefore` **re-aruncă** dacă sursa pinată eșuează (`:253-255`). Rutele: `/assets/:symbol/chart-market` (`scanner-routes.ts:458-485`), poarta de identitate din `/assets/:symbol` (`:535-556`), alertele de preț (`price-alert-service.ts:169`).

---

## 3. Constatări

### Blocant

**C1 — Pinii nu expiră niciodată; nu există re-verificare, re-pin sau sănătate a rezoluției (H5).**
*Dovadă:* `chart-market-resolver.ts:151-158` (pin returnat înainte de orice TTL), `:413` (`resolvedAt` scris), `:162-177` (write-path doar `set`), `app-state.ts:307` (`create()` — imutabil din aplicație), `:315` (colecția `chart-market-resolutions`, baza `money-scanner-360`). `resolvedAt` apare **doar** în răspunsul API (`scanner-routes.ts:480`) și lipsește chiar din tipul clientului (`apps/web/src/services/api.ts:613-622`) → nimeni nu îl citește. `RESOLUTION_TTL_MS` (12h) devine cod mort în producție, pentru că pinul câștigă mereu în fața cache-ului.
*Impact:* o rezoluție aleasă o dată (inclusiv cu `listingStart` fabricat sau greșit, ex. `KRAKEN:…` cu dată azi−720 zile) rămâne pentru totdeauna pe acel activ; dacă venue-ul se delistează sau își schimbă simbolul, `getCandlesBefore` re-aruncă (`market-service.ts:253-255`) → 500 permanent pe graficul istoric, iar `getCandles` cade pe cache-ul de lumânări sau 500. Nu există niciun endpoint/unealtă în aplicație care să șteargă sau să reînnoiască un pin.
*Fix sugerat:* TTL pe pin (citirea `resolvedAt` + re-rezoluție controlată), plus un job de sănătate care validează candidații pinuiți (ticker viu, listing încă prezent) și marchează/dezactivează pinii morți; `create` → `create-if-absent` + `update` explicit pentru re-pin validat.

### Critic

**C2 — CoinGecko `429` (sau orice eroare de identitate) devine `null` silențios, cu efect vizibil în produs (H8, observabilitate).**
*Dovadă:* `chart-market-resolver.ts:127-133` (`safe()` fără log/metrică) -> `:183-184` -> `null`; `market-service.ts:163`, `:221`, `:279` („No identity-verified candle market for requested coin" pentru orice asset cu `coinGeckoId`); `market-service.ts:318-322` (`Promise.allSettled` → rânduri pierdute fără urmă). Experiment controlat (fault injectat 429 doar pe `api.coingecko.com`): `AUDIT_FAULT=coingecko-429 npx tsx fault-injection.ts` → `call #1 -> result=null … consoleLinesFromResolver=0` (zero linii de log) și `call #2 -> upstreamCalls=0` (cache negativ 1h). Măsurat real, fără injecție: 8 cereri paralele `GET /ping` → `3 × 429` în 0.48 s; două rulări curl consecutive pe `/coins/{id}/tickers` au primit `429` azi. `identityCache` memorează doar rezultatele pozitive (`probes.ts:238`), deci sub throttling fiecare reîncercare a unui asset nerezolvat consumă din nou 2 cereri CoinGecko.
*Impact:* o indisponibilitate tranzitorie a CoinGecko (sau lipsa cheii API) nu se distinge de „moneda nu există pe nicio bursă verificată": graficul dă 500/503, rândurile din scanner dispar tăcut, iar starea se poate repeta până la 1h (cache negativ) pentru fiecare instanță Cloud Run. Zero log/metrică → nu se vede în `/api/health` (nimic despre resolver acolo) și nu se poate diagnostica din produs.
*Fix sugerat:* diferențiază `null` (identitate absentă) de `error` (upstream indisponibil); log structurat + contor pe categorii de eșec; backoff/negative-cache cu jitter; cheie CoinGecko (demo/pro) sau limitare a concurenței pe 2 cereri/asset.

**C3 — `krakenFirstDailyTs` produce un listing fals (≈ azi−720 zile) și îl propagă în API (H2).**
*Dovadă cod:* `probes.ts:87-96` (`since=0`), folosit de resolver la `:349-351`.
*Dovadă măsurat:* `curl "https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=1440&since=0"` → **721 rânduri, primul `1728086400` = 2024-10-05**; identic pentru `ETHUSD`, `XDGUSD`, `SOLUSD`, `ADAUSD` (toate `first = 2024-10-05`). În rularea resolverului, SUI a primit `krakenFirstDailyTs = 2024-10-05` deși listing-ul real Kraken este 2023-05. Pentru GRASS valoarea a fost corectă (`2025-01-27`) doar pentru că istoricul e mai scurt de 720 de zile (fereastra acoperă tot istoricul) — deci bug-ul e mascat pe monede noi și sistematic pe monede vechi.
*Impact:* (a) `listingStart` fals expus public în `/assets/:symbol/chart-market` (`scanner-routes.ts:477`) — încalcă regula „zero date inventate"; (b) ranking-ul pe `listingStart` (`:114-124`) poate alege `KRAKEN:…` ca simbol TV în fața unei burse cu istoric real mai lung; (c) filtrul de coverage (`:105-112`) tratează data falsă ca pe un fapt (măsurat pentru SUI: Kraken „58%" a trecut filtrul, Coinbase „28%" a fost eliminat — ambele procente calculate pe date fabricate).
*Fix sugerat:* determina listing-ul Kraken din `AssetPairs` (`listTime` nu există, dar se poate pagina `OHLC` cu `since` crescător, sau folosi `Trades`/`Spread`) sau, mai simplu, propaga `null` când răspunsul atinge limita de 720 rânduri („necunoscut" e corect; o dată inventată nu e).

**C4 — `coinbaseFirstDailyTs` are aceeași clasă de defect, iar comentariul din cod afirmă contrariul (extensie a H2).**
*Dovadă cod:* `probes.ts:58-67`, inclusiv comentariul „Coinbase returns at most 300 buckets per request starting at `start`".
*Dovadă măsurat:* `curl "https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=86400&start=2015-01-01T00:00:00Z"` → **350 rânduri, min `1760140800` = 2025-10-11, max = azi** (deci `start` este ignorat în acest mod de apel); cu `start` + `end` explicit (2015-01-01 → 2015-06-01) răspunsul a fost **0 rânduri**. În rularea live, atât BTC cât și SUI au primit `coinbaseFirstDailyTs = 2025-10-11` (aceeași dată falsă ⇒ „azi − 349 zile").
*Impact:* identic cu C3 (date false în API, ranking și coverage). Măsurat: Coinbase a fost eliminat de filtrul de coverage la BTC (5.4%) și SUI (28%) pe baza unei date complet false.
*Fix sugerat:* fie folosiți fereastra reală disponibilă și validați că `min(ts)` nu e „lipit" de limita de 350, fie întoarceți `null` pentru istoric mai vechi decât fereastra; corectați comentariul.

**C5 — Volumul 24h OKX este înmulțit cu prețul de două ori, iar numărul fals decide tie-break-ul.**
*Dovadă cod:* `okx.ts:143` (`volume24h: Number(row.volCcy24h || 0) * price`), folosit de resolver prin `probes.ts:178` (`okxQuoteVolume24h`).
*Dovadă măsurat:* `curl "https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT"` → `vol24h=5392.21735676` (BTC), `volCcy24h=454012851.8` (deja în quote), `last=83993.6`. Codul raportează `volCcy24h × price = 38 134 173 868 677` USD (38 trilioane), adică ~84 000× peste valoarea reală; comparația cu Bybit (`turnover24h=438 307 665`) confirmă că `volCcy24h` este deja volum în quote.
*Impact:* în tie-break-ul de volum (`chart-market-resolver.ts:122`) OKX câștigă sistematic, indiferent de lichiditatea reală. Măsurat: pentru SUI (OKX/Bybit/MEXC/Binance listate toate pe 2023-05-03, în fereastra de 7 zile) sursa aleasă a fost `okx_spot` — iar pentru monede cu preț mare (BTC/ETH) numărul este absurd de mare (38T) și, dacă ar ajunge în răspunsul de quote (adapterul OKX e folosit și de `getPriceQuote`, `market-service.ts:295-296`), `volume24h` afișat ar fi fals.
*Fix sugerat:* `volCcy24h` fără înmulțire (sau `vol24h × price`), plus un test unitar pe ticker-ul OKX.

**C6 — `binance_spot` nu are volum 24h: `PREFERENCE[0]` pierde orice tie (extensie nouă).**
*Dovadă cod:* `chart-market-resolver.ts:194` (`volume24hQuote: null`) și `:367-396` (switch fără caz `binance_spot`).
*Dovadă măsurat:* SUI — `binance_spot`, `bybit_spot`, `okx_spot`, `mexc_spot` toate cu listing `2023-05-03` (dovadă brută: `binanceSpotFirstDailyTs=1683072000000`, `bybitFirstDailyTs=1683072000000`, `okxSpotInstrument.listTime=1683114000000`, `mexcFirstDailyTs=1683072000000`) → tie pe dată → `binance_spot` afișat cu `vol24hQuote = –`, iar câștigătorul a fost `okx_spot` (`79468218`); `PREFERENCE` (`:63-75`) nu a putut conta niciodată.
*Impact:* schimbare tăcută a sursei de lumânări pentru active majore (SUI: Binance → OKX, deci și altă serie pentru Money Line decât cea folosită de fluxurile interne — vezi C10), plus nerespectarea unei preferințe declarate explicit în cod.
*Fix sugerat:* adăugați `binance_spot` în bucla de volum (`probes.binanceSpotQuoteVolume24h` din `ticker/24hr.quoteVolume`).

### Major

**C7 — Filtrul de coverage din `rank()` elimină candidați reali pe bază de prag autoreferențial (H7).**
*Dovadă cod:* `chart-market-resolver.ts:100-125` — `startLimit = knownStart ?? oldest` (`:104`), `coverage = (now − listingStart)/(now − startLimit)` (`:109`), păstrare dacă `coverage >= .5 || bestCoverage <= .5` (`:111`), plus refugiul `eligible = withCoverage.length ? withCoverage : verified` (`:113`).
*Dovadă măsurat (eliminări reale):* HYPE → `binance_spot` (listing 2026-09-24, coverage 0.3%) eliminat; PONS → `bybit_spot` (5.2%) și `okx_spot` (14.0%) eliminate; BTC → `bybit_spot` (29.5%), `okx_spot` (31.9%), `coinbase` (5.4%) eliminate; SUI → `coinbase` (28.2%) eliminat. Pentru BTC, `bestCoverage = 51.4%`: dacă procentul ar fi ≤ 50%, ramura `bestCoverage <= .5` ar readmite **toți** candidații — adică același set de venue-uri produce alt rezultat în funcție de raportul global genesis/listing, care se modifică în timp fără nicio schimbare de cod sau de piață.
*Impact:* sursa de lumânări și simbolul TV pot fi „decise" de un prag care nu e nici documentat, nici testat; pe active cu genesis vechi (BTC) filtrul e la 1.4 puncte procentuale de a-și schimba complet comportamentul. Testele ating filtrul o singură dată, indirect (`chart-market-resolver.test.ts:80-89`), iar calea `knownStart` nu e acoperită de niciun test (niciun test nu setează `knownStart`).
*Fix sugerat:* înlocuiți regula cu una explicită și testabilă: „candidatul trebuie să aibă cel puțin N zile de istoric (N configurabil, ex. 30) sau să fie cel mai vechi disponibil"; testați pragul, ramura `bestCoverage` și calea `knownStart`.

**C8 — Identitatea se bazează doar pe pagina 1 (100 de rânduri) din tickers (H3).**
*Dovadă cod:* `probes.ts:220-221` (`page=1`), fără paginare.
*Dovadă măsurat:* `bitcoin` → pagina 1 = 100 rânduri, pagina 2 = 100 rânduri (venue-uri mapate prezente: pagina 1 = toate 9; pagina 2 = 7 dintre ele); `ethereum` → 100 + 100 rânduri; `kaspa` → 55 rânduri, pagina 2 goală. Deci plafonul de 100 rânduri este real, dar în cele trei eșantioane obținute toate venue-urile mapate au apărut deja pe pagina 1 — **nu am reușit să reproduc o instanță concretă în universul aplicației** (CoinGecko m-a limitat la 429 după 4 cereri, vezi C2).
*Impact:* risc confirmat structural: un venue valid care nu e în top-100 după volum este invizibil; dacă acel venue era singura sursă `candleCapable`, rezoluția devine `null` → 500/503 pe căile care poartă `coinGeckoId`. Nu pot afirma că se întâmplă azi.
*Fix sugerat:* `markets` ar trebui construit din pagini suplimentare (sau din `exchange_ids` țintite pe cele ~10 venue-uri mapate) și validat cu un test de contract pe shape-ul CoinGecko.

**C9 — `'hyperliquid-spot'` lipsește din mapa `names`, iar `candleCapable: true` pentru HL contrazice testul care interzice legarea spot→perp (H1).**
*Dovadă cod:* `probes.ts:224-226` (mapa nu conține `hyperliquid-spot`), `chart-market-resolver.ts:321-332` (candidat HL cu `candleCapable: true`, `tvSymbol: null`), testul `chart-market-resolver.test.ts:91-94` („does not bind a Hyperliquid spot ticker to the perp candle adapter").
*Dovadă măsurat:* `curl "https://api.coingecko.com/api/v3/coins/hyperliquid/tickers?order=volume_desc&depth=false&page=1"` → identificatorul `hyperliquid-spot` apare de **3 ori** (HYPE/USDC 69.5M USD volum, HYPE/USDT0, HYPE/USDE), fiind cel mai lichid venue pentru HYPE. În rularea live, HYPE a fost rezolvat pe `mexc_spot` (listing 2025-03-24), deși HL avea istoric mai vechi (`hyperliquidFirstDailyTs = 2024-12-05`) și volum mai mare.
*Impact:* (a) ramura „HL candle" este cod mort — HYPE și orice monedă a cărei singură piață mapată e HL nu pot primi niciodată un `candle` verificat; (b) DAR activarea ei fără modificarea lui `candleCapable` ar lega identitatea **spot** la candle-urile **perp** ale adaptorului HL (`hyperliquid.ts:95-108` folosește `candleSnapshot`, care pe HL este piața perp), adică exact lucrul pe care testul îl interzice. Defectul de mapare maschează azi o inconsecvență de design.
*Fix sugerat:* decideți explicit: fie `hyperliquid-spot` → candidat doar-TV (`candleCapable: false`), fie un adaptor HL spot real; până atunci, documentați că HL e exclus intenționat.

**C10 — Rezoluția se aplică doar pe căile care primesc `coinGeckoId`: aproape niciun activ crypto din catalog nu are id.**
*Dovadă cod:* `market-service.ts:128` (`const id = coinGeckoId || catalog?.coinGeckoId`), `:138` (resolverul e apelat doar dacă `isExplicitCryptoSpot`), `apps/api/src/services/app-state.ts:300-316` + catalog `packages/shared/src/constants/assets.ts`.
*Dovadă măsurat:* în catalog există ~70 de apariții ale `marketClass: 'crypto'` (68 după parserul pe blocuri, 70 după grep) și **o singură linie `coinGeckoId:`** în tot fișierul — `HYPE` (linia 1937). Lipsesc, între altele: BTC, ETH, SOL, SUI, DOGE, XRP, BNB.
*Impact:* același simbol poate avea două serii de lumânări în același produs: pe căile web care transmit id-ul (deep-link din bule/heatmap/briefing, `apps/web/src/App.tsx:184-256`) resolverul alege piața lui (ex. SUI → OKX), în timp ce scanările interne (Money Line, `app-state.ts:538`, `:2643`), alertele de preț (`price-alert-service.ts:169`) și `/assets/:symbol` fără query param folosesc ruta legacy (Binance spot/Hyperliquid). Graficul, semnalul Money Line și prețul alertei pot veni din piețe diferite pentru același activ.
*Fix sugerat:* populeze `coinGeckoId` în catalog pentru activele majore (sau refolosiți id-ul din universul CoinGecko la construirea catalogului) și decideți o singură sursă de adevăr per activ.

**C11 — Trei surse paralele de adevăr pentru simbolul TradingView.**
*Dovadă cod:* server = `chart-market-resolver.ts:190-319`; client = `apps/web/src/components/InteractiveChart.tsx:184-222` (mapă statică: orice crypto → `BINANCE:${SYM}USDT`, iar HYPE → `BINANCE:HYPEUSDT.P` hardcodat la `:196`); `getTradingViewSymbol` e ignorat doar când `/chart-market` răspunde `resolved` (`:306-321`).
*Impact:* pentru HYPE, produsul afișează azi trei piețe diferite: `BINANCE:HYPEUSDT.P` (harta statică din client), `MEXC:HYPEUSDT` (resolverul server, măsurat) și Hyperliquid perp (catalog + ruta legacy când nu se trimite id). Inconsecvența e vizibilă pentru utilizator (același grafic, altă bursă) și duce la divergențe de preț/istoric între suprafețe.
*Fix sugerat:* eliminați mapa statică pentru crypto și serviți exclusiv rezoluția server (cu fallback marcat explicit).

**C12 — Prima rezoluție per monedă costă 40–53 de request-uri și 9–14 s; nu există short-circuit pe Binance spot (H4).**
*Dovadă măsurat (rulare `measure-full.ts`, prima rezoluție, deps reale):* BTC 46 request-uri / 14.4 s; GRASS 50 / 9.2 s; HYPE 53 / 12.7 s; SUI 52 / 11.9 s; PONS 40 / 10.1 s; BP 9 / 5.0 s. Defalcare BTC: CoinGecko 2, Binance spot 4, Coinbase 2, Kraken 1, MEXC 16, Bybit 12, Binance Futures 2, OKX 2, Hyperliquid 2, KuCoin 1, Bitget 1, Gate 1. Sondele de listing sunt cele scumpe: Bybit 12–28 cereri (căutare binară `bybit.ts:65-94`), MEXC 3–17 (`mexc.ts:60-78`). `candidateLastPrice` pentru Binance mai declanșează o cerere suplimentară (`binance.ts:294` → `getStartOfYearPrice`, `:233-261`).
*Impact:* la un univers crypto de ~150 de active („flip universe" = 150, `market-service.ts:349-351`), o pornire rece poate însemna ~6 000–8 000 de cereri upstream și minute de latență — exact scenariul care declară throttling-ul CoinGecko din C2. Deși pinii amortizează ulterior costul (1 citire Firestore), nu există nici un mecanism de încălzire, buget sau limitare de concurență.
*Fix sugerat:* short-circuit după `binance_spot` + primele două preferințe; cotați volumele/listing-urile prin endpoint-uri „bulk" (un `exchangeInfo`/`tickers` per bursă per scan, nu per simbol); cache persistent pentru listing starts (nu doar în proces).

**C13 — Zero observabilitate pe rezoluții.**
*Dovadă cod:* niciun `console`/logger în `chart-market-resolver.ts` sau `chart-market-probes.ts`; `safe()` (`:127-133`) nu loghează; `/api/health` (public, testat: `{"status":"ok",…}`) nu expune nimic despre resolver; `MarketHealthMonitor` nu este apelat de resolver (adaptoarele își înregistrează succesul doar pentru candle/quote, nu pentru sonde).
*Impact:* nu se poate răspunde la întrebări operaționale de bază (câte rezoluții, ce surse, câte eșecuri, câți pini morți) — inclusiv C1 și C2 devin invizibile până când un utilizator raportează graficul lipsă.
*Fix sugerat:* contoare (rezoluții/no-source/pin hit/pin miss/upstream errors pe host), log la fiecare eșec de identitate cu motivul (status HTTP), expunere în `/api/health`.

**C20 — Candidatul `binance_futures` nu poate fi niciodată verificat: a doua ramură de cod mort (extindere a H1, descoperită în timpul măsurătorilor).**
*Dovadă cod:* `chart-market-resolver.ts:400-402` setează `identityVerified = markets.has('binance_futures')`, dar mapa `names` (`probes.ts:224-226`) conține doar identificatori de spot, iar `binance_futures` nu poate intra niciodată în mulțime. Se adaugă ramuri dependente de el, toate inaccesibile: tie-break-ul „spot înainte de perp" (`:119-121`), volumul de futures (`:373-375`), simbolul TV `.P` (`:218`).
*Dovadă măsurat:* în cele patru payload-uri CoinGecko salvate (BTC pag. 1 = 100 rânduri / 59 venue-uri, GRASS 70 rânduri, HYPE 86 rânduri) **nu apare niciun identifier de derivate** (nici `binance_futures`, nici `okx_swap`, nici altul) — pagina 1 e exclusiv spot. În plus, identificatorul CoinGecko `binance_futures` există ca exchange (verificat: `GET /api/v3/exchanges/binance_futures` → 200 „Binance (Futures)"), deci nu e o problemă de denumire, ci de acoperire.
*Impact:* pentru fiecare monedă cu perp Binance (BTC, ETH, SUI etc.) resolverul cheltuie 1–2 cereri `fapi.binance.com` (listing + volum) care sunt aruncate la pasul de verificare a identității; mai important, intenția de a folosi piața perp (PREFERENCE, `.P`) este inoperantă — la fel ca ramura Hyperliquid. `PREFERENCE` (`:63-75`) conține azi 2 din 11 intrări (`binance_futures`, `hyperliquid`) care nu pot câștiga niciodată.
*Fix sugerat:* fie mapați explicit identifierii de derivate (`binance_futures` → candidat doar pentru piețele perp, cu alt tip de identitate), fie eliminați ramurile perp din resolver și lăsați-le exclusiv pe ruta legacy (documentat).

### Minor

**C14 — Kraken este invizibil pentru BTC (și pentru orice simbol cu altname XBT/XDG).**
*Dovadă cod:* `probes.ts:75-84` (cheia din `byBase` = prefixul lui `altname`). *Dovadă măsurat:* `AssetPairs` → `XXBTZUSD` cu `altname: XBTUSD` (deci cheia `XBT`, nu `BTC`); în rularea live `isOnKraken('BTC')=false` și `krakenFirstDailyTs=null`. Suplimentar, rândurile CoinGecko pentru Kraken/BTC au `base: XBT` (măsurat), deci sunt eliminate și de filtrul de identitate (`probes.ts:229`) → `kraken` nu apare niciodată în `markets` pentru BTC.
*Impact:* un venue real (și prefixul TV `KRAKEN:BTCUSD`, verificat `200`) nu poate fi propus pentru BTC; dacă un activ are Kraken ca unică piață mapată, rezoluția devine `null`. Pentru DOGE, partea Kraken e aceeași (`XDGUSD`), partea CoinGecko e probabil identică (neprobată).
*Fix sugerat:* mapă de aliasuri (XBT→BTC, XDG→DOGE) aplicată atât la `byBase`, cât și la comparația `base` din identitate.

**C15 — Probele (`chart-market-probes.ts`, 254 linii) nu au niciun test; testele resolverului nu acoperă căile critice.**
*Dovadă:* `grep -rn "buildChartMarketResolverDeps\|chart-market-probes" --include=*.test.ts apps packages` → 0 rezultate. Teste existente: 16 în `chart-market-resolver.test.ts` (15 pe resolver + 1 pe `aggregate4hTo8h`) — nu 12 cum se estima — toate cu `deps` stub (fără shape-uri upstream reale). Niciun test nu setează `knownStart`; filtrul de coverage e atins indirect o singură dată (`:80-89`); nimic nu acoperă `krakenFirstDailyTs`, `coinbaseFirstDailyTs`, `okxQuoteVolume24h`, `binance_spot` lipsă din volum. Suita completă: 33/33 trec.
*Impact:* cele patru defecte de date (C3, C4, C5, C6) ar fi fost prinse de orice test care validează shape-ul răspunsului upstream (ex. „Kraken nu poate returna 721 de rânduri pentru un pair din 2015").
*Fix sugerat:* teste de contract pe fiecare sondă, cu răspunsuri reale salvate (fixtures), inclusiv cazurile-limită măsurate în acest raport.

**C16 — `getCandlesBefore` nu are fallback când sursa pinată eșuează.**
*Dovadă:* `market-service.ts:253-255` (`if (chartMarket) throw error;`). *Impact:* combinat cu C1, o delistare sau un `providerSymbol` greșit produce 500 permanent pe istoricul graficului, chiar dacă alte surse au date. Comportamentul e intenționat („older pages must use the pinned source"), dar trebuie cuplat cu o strategie de re-pin (C1).

**C17 — Alertele de preț nu trec prin resolver.**
*Dovadă:* `price-alert-service.ts:169` (`getPriceQuote(rule.symbol, rule.marketClass)` — fără `coinGeckoId`), `:152-165` (polling la 60 s, concurență 3). *Impact:* prețul care declanșează alerta poate veni din ruta legacy (Binance spot/Hyperliquid) în timp ce graficul afișează piața rezolvată (C10) — alerta se poate declanșa la un preț care nu apare pe grafic.

### Info

**C18 — Prefixul TradingView pentru Gate este corect (H6 infirmat).** Măsurat: `scanner.tradingview.com/symbol?symbol=GATE:BTCUSDT` → `200 {"close":83949.1}`; `GATEIO:BTCUSDT` → `404 symbol_not_exists`; `symbol_search` returnează `prefix: "GATE"`, `source_id: "GATE"`. Verificate și: `BINANCE:`, `BYBIT:`, `OKX:`, `MEXC:`, `BITGET:`, `KUCOIN:`, `KRAKEN:BTCUSD` (+`KRAKEN:XBTUSD` = 404, deci maparea XBT→BTC din cod e corectă pentru TV), `COINBASE:BTCUSD`, `BINANCE:BTCUSDT.P`. `HYPERLIQUID:BTCUSD/BTCUSDT/BTC` → 404 (HL nu există pe TradingView), deci `tvSymbol: null` pentru candidatul HL este corect.

**C19 — Serviciul din producție răspunde, dar nu am putut verifica rezoluțiile.** `GET https://scanner.relayhub.no/api/health` → `200 {"status":"ok","service":"market-scanner-360-api","uptimeSeconds":32605}`; `GET /api/assets/BTC/chart-market?marketClass=crypto&coinGeckoId=bitcoin` → `401 {"code":"AUTH_REQUIRED"}`. Deci starea reală a pinilor din `chart-market-resolutions` rămâne neverificată.

**C21 — Mapa de identitate acoperă 9 din cele ~59 de venue-uri prezente pe pagina 1.** *Dovadă măsurat:* BTC pagina 1 = 100 rânduri pentru 59 de venue-uri distincte, din care doar 9 sunt mapate (binance 5 rânduri, okex 3, bybit_spot 2, kraken 2, mxc/gdax/gate/kucoin/bitget 1 fiecare = 15 din 100 de rânduri). Venue-uri reale de volum (upbit, crypto_com, deribit_spot, bitstamp, bitfinex, bullish_com) nu au adapter, deci nu pot fi folosite chiar dacă sunt verificate de CoinGecko. *Impact:* identitatea e riguroasă, dar „acoperirea" ei reală e de 9 venue-uri; pentru un activ listat pe venue-uri nemapate, rezoluția poate fi `null` (fără nicio informație despre cât de lichid e activul pe ele). *Fix sugerat:* extindeți gradual mapa/adapterele și raportați explicit „fără sursă verificată" în UI doar după ce lista de venue-uri a fost mărită.

---

## 4. Ipotezele H1–H8

| # | Ipoteză | Status | Dovadă |
|---|---|---|---|
| **H1** | `names` nu conține `'hyperliquid-spot'`; CoinGecko emite acest identifier → HL nu poate fi `identityVerified`, ramura `candleCapable:true`+`tvSymbol:null` e cod mort | **Confirmat** | `probes.ts:224-226` vs `curl /coins/hyperliquid/tickers` → `hyperliquid-spot` ×3 (69.5M USD, cel mai lichid venue al HYPE); live: HYPE → `mexc_spot` (2025-03-24) deși `hyperliquidFirstDailyTs = 2024-12-05`; testul `:91-94` arată că legarea spot→perp e interzisă intenționat. Extindere: și ramura `binance_futures` e cod mort (C20) |
| **H2** | `krakenFirstDailyTs` cu `since=0` → Kraken întoarce ultimele ~720 lumânări → listing fals ≈ azi−720 zile | **Confirmat** | 721 rânduri de la `2024-10-05` pentru XBTUSD/ETHUSD/XDGUSD/SOLUSD/ADAUSD; SUI raportat `2024-10-05` vs real `2023-05`; GRASS corect (`2025-01-27`) doar pentru că istoricul < 720 zile. Aceeași clasă de defect la Coinbase (C4) |
| **H3** | Identitatea doar pe pagina 1 (100 rânduri) → venue-uri valide pot lipsi | **Parțial** | Plafonul e real și măsurat (BTC/ETH: 100 rânduri/pagină, pagina 2 plină; KASPA: 55/0; BTC: 59 de venue-uri în 100 de rânduri, 15 rânduri pentru cele 9 mapate). Dar în eșantioanele obținute toate venue-urile mapate erau pe pagina 1 → **nu am reprodus o instanță concretă** în universul aplicației |
| **H4** | Nu există short-circuit pe Binance spot; toate venue-urile sondate + listing + volum + preț pentru toți candidații verificați | **Confirmat** | `chart-market-resolver.ts:186` (Binance spot) urmat necondiționat de `:200-211` (celelalte 9 sonde); măsurat 40–53 de request-uri/rezoluție; `candidateLastPrice` se cheamă pentru fiecare candidat verificat (`:404-406`) |
| **H5** | Pinii Firestore nu expiră; `resolvedAt` scris dar nefolosit; nu există re-verificare/re-pin | **Confirmat** | `:151-158` (pin înaintea oricărui TTL), `:413` (scriere), `scanner-routes.ts:480` (singura citire = payload API, iar clientul nici nu are câmpul — `api.ts:613-622`), `app-state.ts:307` (`create()` = imutabil) |
| **H6** | Prefixul Gate ar trebui să fie `GATEIO:` | **Infirmat** | `GATE:BTCUSDT` → 200; `GATEIO:BTCUSDT` → 404; `symbol_search` → `prefix/source_id = GATE`. Toate celelalte prefixe din cod verificate corecte |
| **H7** | Filtrul de coverage e netestat și greu de citit | **Parțial** | E atins indirect de un test (`:80-89`), dar pragul `.5`, ramura `bestCoverage <= .5` și calea `knownStart` nu sunt testate (niciun test nu setează `knownStart`). Live, măsurat: elimină candidați reali la 5 din 6 simboluri (HYPE/Binance 0.3%, PONS/Bybit 5.2% + OKX 14.0%, BTC/Bybit 29.5% + OKX 31.9% + Coinbase 5.4%, SUI/Coinbase 28.2%) |
| **H8** | Pragul ±5% poate respinge unicul venue lichid; `safe()` înghite toate erorile fără log | **Parțial** (partea de observabilitate: **Confirmat**) | `safe()` fără log/metrică (`:127-133`); fault injectat 429 → `null` cu **0 linii** de output (fault-injection.ts); măsurat 3/8 cereri paralele CoinGecko → 429. Pragul ±5% e testat doar pentru cazul de nepotrivire (`:194-198`); **nu am reușit** să reproduc un caz live în care un venue legitim să fie respins de ±5% → sub-ipoteza rămâne **Neverificată** |

---

## 5. Măsurători live

**Harness principal** (resolver real, deps reale, request-uri instrumentate; log complet: `tmp/audit-resolver/live-run-2026-09-25.log`):

```bash
cd "/Users/marius/antigravity/Money Scanner/tmp/audit-resolver"
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
AUDIT_GAP_MS=28000 AUDIT_TARGETS='[
 {"symbol":"BTC","coinId":"bitcoin"},{"symbol":"GRASS","coinId":"grass"},
 {"symbol":"HYPE","coinId":"hyperliquid"},{"symbol":"PONS","coinId":"pons"},
 {"symbol":"SUI","coinId":"sui"},{"symbol":"BP","coinId":"backpack"}]' \
  npx tsx measure-full.ts > live-run-2026-09-25.log 2>&1
```

| Simbol | request-uri (prima rezoluție) | durată | sursă candle aleasă | tvSymbol | observații |
|---|---|---|---|---|---|
| BTC | **46** | 14.4 s | `binance_spot` (listing 2017-08-17) | `BINANCE:BTCUSDT` | Kraken absent (`isOnKraken=false`, base CG `XBT`); coinbase eliminat de coverage (5.4%) |
| GRASS | **50** | 9.2 s | `bybit_spot` (2024-10-28) | `BYBIT:GRASSUSDT` | OKX eliminat (22.1%); volume Bybit 5.85M vs MEXC 0.36M |
| HYPE | **53** | 12.7 s | `mexc_spot` (2025-03-24) | `MEXC:HYPEUSDT` | `binance_spot` eliminat de coverage (0.3%, listing 2026-09-24); HL (2024-12-05, cel mai lichid) invizibil |
| PONS | **40** | 10.1 s | `mexc_spot` (2026-07-15) | `MEXC:PONSUSDT` | Bybit/OKX eliminate de coverage (5.2%/14.0%) |
| SUI | **52** | 11.9 s | `okx_spot` (2023-05-03) | `OKX:SUIUSDT` | 4 venue-uri în tie pe listare; `binance_spot` fără volum; Kraken „58%" pe dată falsă |
| BP | **9** | 5.0 s | `mexc_spot` (2026-03-23) | `MEXC:BPUSDT` | singurul venue verificat (`markets=[mexc_spot]`) |

**Fault injection + cache** (fără trafic real către CoinGecko):

```bash
AUDIT_FAULT=coingecko-429 npx tsx fault-injection.ts
# call #1 -> result=null upstreamCalls=2 consoleLinesFromResolver=0
# call #2 -> result=null upstreamCalls=0   (cache negativ 1h)
```

**Sonde upstream (curl read-only):**

```bash
# H2 — Kraken ignoră since=0 (721 rânduri, fereastră mobilă)
curl -s "https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=1440&since=0"        # first=1728086400 (2024-10-05), rows=721
curl -s "https://api.kraken.com/0/public/OHLC?pair=ETHUSD&interval=1440&since=0"        # identic: 2024-10-05
curl -s "https://api.kraken.com/0/public/AssetPairs"                                    # XXBTZUSD altname=XBTUSD, XDGUSD → chei „XBT"/„XDG"
# C4 — Coinbase ignoră `start` fără `end` (350 rânduri, fereastră mobilă)
curl -s "https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=86400&start=2015-01-01T00:00:00Z"  # min=1760140800 (2025-10-11)
# C5 — volumul OKX este deja în quote
curl -s "https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT"                      # volCcy24h=454012851.8 ≈ Bybit turnover24h=438307665
# H1 — CoinGecko emite 'hyperliquid-spot'
curl -s "https://api.coingecko.com/api/v3/coins/hyperliquid/tickers?order=volume_desc&depth=false&page=1"
# H6 — prefixul TradingView
curl -s -H "User-Agent: Mozilla/5.0" "https://scanner.tradingview.com/symbol?symbol=GATE%3ABTCUSDT&fields=close"      # 200
curl -s -H "User-Agent: Mozilla/5.0" "https://scanner.tradingview.com/symbol?symbol=GATEIO%3ABTCUSDT&fields=close"    # 404
# C2 — limita tier-ului anonim (8 cereri paralele)
# → [(0,200),(1,200),(2,200),(3,429),(4,429),(5,200),(6,429),(7,200)] în 0.48 s
```

**Teste rulate:** `npx tsx --test src/chart-market-resolver.test.ts` → 16/16 pass; `npx tsx --test src/*.test.ts src/adapters/*.test.ts` → 33/33 pass.

---

## 6. Plan de îmbunătățire prioritizat

### Quick wins (1–4 h fiecare, risc mic)

1. **Corectați `okxQuoteVolume24h`** (`okx.ts:143`: scoateți înmulțirea cu prețul) + test pe ticker real. *Risc de regresie:* schimbă tie-break-ul → unele simboluri pot reveni de pe OKX pe Binance/Bybit (sursă de lumânări diferită pentru un activ deja pinat → vezi riscul R2).
2. **Adăugați volumul pentru `binance_spot`** (caz nou în `chart-market-resolver.ts:367-396`) — readuce `PREFERENCE[0]` în joc la tie-uri.
3. **Corectați/invalidați listing-ul Kraken și Coinbase** (`probes.ts:58-67`, `:87-96`): dacă răspunsul atinge limita fereastrei mobile (721 / 350), returnați `null` în loc de o dată falsă. *Risc:* candidații Kraken/Coinbase ies din ranking/coverage → simbolul TV se poate schimba pe acele active (comportament așteptat, dar vizibil în API).
4. **Log + contor minim în resolver** (`safe()` și `computeResolution`): host, status, simbol, motivul `null`. Cost: ~30 linii; deblochează diagnosticul pentru C1/C2.
5. **Normalizați maparea prefixelor/aliasurilor** (XBT/XDG) în `krakenUsdPairs` și în filtrul de identitate.
6. **Compatibilitate conservată:** nu atingeți pinii existenți în această etapă (vezi R1).

### Structural (1–3 zile fiecare)

7. **Ciclu de viață al pinilor (rezolvă C1):** TTL pe pin (ex. 7–14 zile, cu `resolvedAt` citit), re-verificare în fundal care validează: ticker încă viu, `providerSymbol` încă listat, rezoluția ar mai fi aceeași; scriere cu `update` explicit + audit log; endpoint intern de „unpin" pentru operator. *Risc:* re-pin poate schimba sursa de lumânări (deci Money Line-ul recalculat) pentru un activ — recomand migrare etapizată, cu raport „ce se schimbă" înainte de aplicare (dry-run).
8. **Identitate rezistentă la erori (rezolvă C2):** separați `error` de `null`; cache negativ scurt (30–60 s) doar pe `429`, cu jitter; limitare de concurență globală pe CoinGecko (2–4) + cheie API dacă e disponibilă; aliniat cu cache-ul pozitiv.
9. **Filtrul de coverage (rezolvă C7):** înlocuiți cu o regulă explicită (istoric minim absolut / „cel mai vechi disponibil") + teste pe prag, pe `knownStart` și pe ramura de refugiu; documentați în cod de ce.
10. **Reducerea costului de rezoluție (C12):** short-circuit după Binance spot; listing starts din cache persistent (Firestore/Redis) partajat între instanțe; sonde bulk per bursă; limite de concurență și buget pe rezoluție.
11. **Un singur izvor de adevăr pentru simbolul TV (C11)** și pentru sursa de lumânări (C10): completați `coinGeckoId` în catalog (sau generați catalogul din universul CoinGecko) astfel încât scanările interne, alertele și graficul să folosească aceeași rezoluție.
12. **Teste de contract pentru `chart-market-probes.ts`** (C15) cu fixtures reale, inclusiv cazurile-limită documentate aici (Kraken 721, Coinbase 350, OKX `volCcy24h`, CoinGecko page 1 lipsă `hyperliquid-spot`).
13. **Observabilitate în `/api/health` (C13):** număr de pini, rezoluții pe sursă, vârsta celui mai vechi pin, erori upstream pe host.

**Riscuri de regresie de reținut**
- **R1 — pinii existenți:** orice schimbare a ranking-ului (quick wins 1–3) NU se va aplica activelor deja pinite; fără un pas de migrare, corecturile rămân invizibile pentru universul curent și apar doar la active noi. Bugetați o „campanie de re-pin" controlată.
- **R2 — schimbarea sursei de lumânări:** fiecare modificare de tie-break/volum/listing mută sursa pentru unele active → istoric diferit pe grafic și **semnal Money Line diferit** pe același activ. Necesită comparație înainte/după (fixture + raport) pentru activele afectate.
- **R3 — Directiva #1 („100% date reale, zero inventat"):** C3 și C4 sunt încălcări directe (date de listing fabricate expuse în API); C5 produce un volum nerealist. Am căutat un document numit „Directiva #1" în repo (`grep -rn "Directiva" docs insight *.md HANDOFF.md`) — nu există sub acest nume; am tratat regula ca pe regula de aur enunțată în context.
- **R4 — fail-closed pe identitate:** dacă relaxați `throw`-ul din `market-service.ts:161-164` pentru a acoperi 429-urile, reveniți la riscul de „same-ticker legacy series" pe care testele actuale îl blochează intenționat (`index.test.ts:210-219`) — deci separarea error/null (pct. 8) trebuie făcută înainte, nu în locul, mecanismului de refuz.

---

## 7. Verificare încrucișată (pentru un recenzent independent)

1. **Pinii nu expiră și nu pot fi rescriși din aplicație:** verificați în Firestore (baza `money-scanner-360`, colecția `chart-market-resolutions`) câte documente există, ce `resolvedAt` au, dacă vreun document a fost vreodată actualizat (ar trebui să nu existe niciun update — scrierea e `create()`, `app-state.ts:307`) și dacă vreun candidate pinat mai există pe bursă.
2. **Kraken/Coinbase fabrică date de listing:** rulați cele două curl-uri din secțiunea 5 și verificați că primul rând este „lipit" de azi−720, respectiv azi−350 zile (nu de listing-ul real).
3. **Volumul OKX dublu-numărat:** comparați `volCcy24h` (BTC-USDT) cu `turnover24h` de la Bybit — sunt de același ordin de mărime, deci `volCcy24h` este deja quote; codul îl înmulțește iar cu prețul.
4. **CoinGecko emite `hyperliquid-spot` și lipsește din `names`:** rulați curl-ul pe `/coins/{id}/tickers` pentru `hyperliquid` și comparați cu mapa din `chart-market-probes.ts:224-226`.
5. **Costul real al rezoluției:** rulați `measure-full.ts` (comanda din secțiunea 5) pe 2–3 simboluri și verificați numărul de cereri (așteptat 40–53 pentru active majore) și durata (9–14 s). Notă: harness-ul meu numără doar cererile din `resolve()` la liniile `requests=`; totalul de la finalul fiecărei secțiuni include și dump-ul de dovezi.
6. **Prefixul TradingView Gate (H6):** verificați independent `scanner.tradingview.com/symbol?symbol=GATE:BTCUSDT` (200) vs `GATEIO:BTCUSDT` (404).

---

### Anexă — artefacte

- `tmp/audit-resolver/measure-full.ts` — harness de măsurare (contoare de request-uri, tabel de candidați, reproducerea filtrului de coverage).
- `tmp/audit-resolver/live-run-2026-09-25.log` — log complet al rulării pe 6 simboluri.
- `tmp/audit-resolver/fault-injection.ts` + `fault-cg429.log` — dovada eșecului silențios.
- `tmp/audit-resolver/measure-resolver.ts` — prima variantă a harness-ului (fără dump de dovezi).
- `tmp/audit-resolver/cg_*.json`, `kraken_*.json`, `cb_btc.json`, `hl_top.json` — răspunsurile brute salvate pentru dovezile din secțiunea 5.
