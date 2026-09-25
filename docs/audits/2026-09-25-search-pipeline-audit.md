# Audit pipeline de căutare (Symbol Search) — Money Scanner

**Data:** 2026-09-25
**Tip:** audit read-only (fără modificări de cod, fără commit, fără deploy)
**Scope:** `GET /api/search` + modalul UI de căutare + handoff-ul către pagina activului
**Severitate folosită:** Blocant / Critic / Major / Minor / Info
**Regula de aur #1 (100% date reale):** a fost folosită ca grilă principală de evaluare.

Fișiere analizate: `apps/api/src/routes/scanner-routes.ts` (813 linii), `packages/shared/src/search/symbol-search.ts` (265), `apps/web/src/components/UniversalSearchModal.tsx` (567), `apps/web/src/App.tsx`, `apps/web/src/components/AssetDeepDiveView.tsx`, `apps/web/src/services/api.ts`, `apps/api/src/services/symbol-search.test.ts`, `apps/api/src/server.ts`, `packages/market-data/src/market-service.ts`, `packages/market-data/src/chart-market-probes.ts`.
Artefacte de audit (temp, nu în cod): `tmp/audit-search/` (harness.ts, census.ts, cost.ts, direct-branch.ts, negative-cache.ts, coverage.mjs, array-query-repro.mjs). Zero fișiere de cod sau documente existente au fost atinse.

---

## 1) Rezumat executiv

Pipeline-ul de căutare este bine construit pe partea de clasare (motor determinist, identitate pe rezultat, coliziuni de ticker tratate explicit, fail-closed la identitate în deep-dive), dar are **două defecte de disponibilitate care se manifestă exact în scenariul normal de folosire — tastarea** și o **pierdere de identitate la click**. Concret: (a) ruta de search apelează CoinGecko **fără cheia de API** pe care restul aplicației o folosește, iar cota anonimă măsurată live este de **~5 cereri/minut/IP** — se epuizează în 4-6 litere tastate și, în acel moment, sursa care aduce `coinGeckoId` (identitatea) dispare tăcut; (b) o singură eroare/timeout Binance pe cache rece **scrie un cache gol cu TTL de 15 minute**, eliminând toate cele 865 perechi spot + 527 perpetue din căutare pentru un sfert de oră; (c) rândul afișat păstrează perechea/bursa/quote-ul, dar click-ul trimite mai departe doar `symbol` + `coinGeckoId`, deci toate rândurile care împart un ticker duc în aceeași pagină; (d) `staleAsOf` există în răspuns dar nu ajunge niciodată în UI, iar rândurile cu date last-good primează în continuare cu badge verde „verificat". Clasarea are erori sistematice pe quote (perechile `/BTC` sunt egal clasate cu `/USDT` și câștigă tie-break-ul alfabetic) și produce 369 rânduri redundante (865 rânduri pentru 496 active: BTC apare de 6 ori, CAKE de 5, CVX de 4). Testele existente (9, toate trec) acoperă doar funcția pură de clasare; ruta `/search`, fallback-urile, cache-ul negativ, ramura „direct" și maparea de aliasuri nu sunt testate deloc.

---

## 2) Fluxul real, pas cu pas

### 2.1 Client (modalul de căutare)

| Pas | Ce se întâmplă | Referință |
|---|---|---|
| 1 | Utilizatorul deschide modalul (Cmd/Ctrl+K sau buton); inputul se focusează și se selectează după 50 ms | `UniversalSearchModal.tsx:86-93` |
| 2 | La fiecare tastă: `onChange` → `setQuery`; **fără** limită minimă de caractere, **fără** normalizare | `UniversalSearchModal.tsx:237-245` |
| 3 | Clasare **locală** instant pe catalogul static (281 active) prin același motor partajat; se îmbogățește cu preț/tier din rândurile scannerului deja încărcate | `UniversalSearchModal.tsx:41, 97-113` |
| 4 | Căutare **remote**: debounce 180 ms, apoi `GET /api/search?q=<query>` cu `AbortController` (abort la următoarea tastă) | `UniversalSearchModal.tsx:116-141` |
| 5 | Rezultatele remote se unesc cu cele locale într-un `Map` cheiat pe `resultId` (local-ul se suprascrie cu remote-ul, dar păstrează prețul lipsă) | `UniversalSearchModal.tsx:145-180` |
| 6 | Filtrare pe taburi (ALL / stocks / crypto / metals / forex+macro), sortare după `matchScore`, apoi `isExact`, apoi `rank`, limită 60 | `UniversalSearchModal.tsx:162-179` |
| 7 | Afișare rând: badge simbol (`displaySymbol`), exchange, `instrumentType`, badge „verificat" dacă `verified !== false` (altfel „direct"), categorie, nume, preț/24h/YTD, tier Money Line | `UniversalSearchModal.tsx:377-441` |
| 8 | Click/Enter → `handleSelect(asset)` → `saveRecentSearch` + `onSelectAsset(asset)` + închidere modal | `UniversalSearchModal.tsx:201-216` |

### 2.2 Handoff către pagina activului (punctul în care se pierde identitatea)

9. `onSelectAsset` primește obiectul complet, dar apelează `openAsset(asset.symbol, marketClass, undefined, asset.coinGeckoId)` → **`displaySymbol`, `providerSymbol`, `exchange`, `quoteCurrency`, `instrumentType`, `resultId` sunt aruncate** (`App.tsx:549-555`).
10. `openAsset` normalizează (`^[$#]`, trim, uppercase), scrie în URL `asset`, `timeframe`, `marketClass`, `coinGeckoId`, `coinPaprikaId` și setează starea; **nu** există parametru de pereche/bursă (`App.tsx:238-259`).
11. Modalul se închide; `AssetDeepDiveView` cere `GET /api/assets/:symbol?timeframe&marketClass&coinGeckoId&coinPaprikaId` (`apps/web/src/services/api.ts:97-111`).

### 2.3 Server: `GET /api/search` (`scanner-routes.ts:256-315`)

12. Auth: ruta NU e în allow-list-ul public → trece prin `authMiddleware` (sesiune Firebase) (`server.ts:42-62`). Verificat live: `401 {"error":"Authentication required","code":"AUTH_REQUIRED"}`.
13. `q` se ia cu `(req.query.q as string || '').trim()`; dacă e gol → `[]`. Fără limită de lungime, fără whitelist de caractere (`:258-259`).
14. Cache de răspuns în memorie, cheie `q.toLowerCase()`, TTL 30 s, max 200 intrări, eviction FIFO (`:36, 260-262, 308-309`).
15. Se construiește lista de candidați: `TRADING_360_ASSETS` (sincron) + 4 surse în paralel (`:264-271`):
    - `binanceSearchCandidates()` — exchangeInfo spot (3713 intrări, 1368 TRADING, 865 perechi acceptate: USDT 496, USDC 258, BTC 38, FDUSD 32, EUR 29, ETH 12) + futures (907 simboluri → 527 perpetue USDT); cache 15 min/instanță (`:81-142`);
    - `dynamicSearchCandidates()` — Top 150 CoinGecko (doar active cu listare Binance spot sau Hyperliquid) + protocoalele DefiLlama din scanarea cache-uită; cache 5 min + deduplicare in-flight (`:224-254`; filtrul de listare în `market-service.ts:396-398`);
    - `yahooSearchCandidates(q)` — `query1.finance.yahoo.com/v1/finance/search`, timeout 3.5 s (`:144-198`);
    - `coinGeckoSearchCandidates(q)` — `api.coingecko.com/api/v3/search`, timeout 3.5 s, fallback `coinGeckoLastGood` cheiat pe query (`:200-222`).
16. Toți candidații trec prin `withIdentityAliases` (mapare `pons → Robinhood/Pons Robinhood`) (`:44-47, 271`).
17. `rankSymbolSearchCandidates(q, candidates, 60)` (`packages/shared/src/search/symbol-search.ts:147-264`): parsare query (`exchange:`, `.P`/PERP, quote), deduplicare pe identitate (pentru crypto spot cu `coinGeckoId`: `crypto:coin:<id>`, altfel `marketClass:exchange:instrumentType:providerSymbol:coinGeckoId`), scoring (exact/prefix/contains/typo + corecții quote/perp/stale/rank), sortare, `slice(0, 60)`.
18. Dacă nu există niciun rezultat: fallback „direct" — un singur candidat `verified:false`, doar dacă textul trece `/^[A-Z0-9.^=-]{1,24}$/` (`:276-294`).
19. Îmbogățire cu `price/change24h/changeYtd/moneyLineScore/tier`: prețul vine din `result.price` (snapshot de univers, nu din sursa de căutare) și scorul/tierul din `appState.cachedSignals.get("<symbol>_1w")` — **cheiat pe simbol și timeframe 1w**, deci identic pentru toate rândurile care împart simbolul (`:296-307`).
20. Răspuns + `Cache-Control: private, max-age=15` (doar pe ramura miss) (`:308-311`).

### 2.4 Server: handoff-ul în deep-dive (`GET /api/assets/:symbol`, `:487-813`)

21. Verificarea de identitate rulează **doar** dacă `isCryptoSpot && (coinGeckoId || coinPaprikaId)` (`:503, 535`) — deci dacă rândul de search nu a avut `coinGeckoId`, verificarea este sărită complet.
22. Când rulează: `cryptoMarketProfiles.resolve` + `matchesCatalog` (id exact) sau `matchesLiveExchangeAsset` (nume normalizat vs Top 150) + `resolveChartMarket` ca alternativă; dacă nimic nu confirmă → `503 'Verified exchange candles unavailable for the selected coin.'` (`:535-556`).
23. Altfel: căutare în catalog după ticker (crypto → Top 80 după ticker, stocks → căutare Yahoo exactă), apoi stub „<SYMBOL> Crypto"/„(TradingView Asset)", rezolvare `coinGeckoId` prin `resolveCandidates` (acceptă un candidat unic sau unul cu nume confirmat pe bursă), rang live din Top 150 (`:559-677`).
24. Apoi 6 cereri de lumânări în paralel + știri + AI + on-chain + business quality (`:704-806`). 503-ul are și o a doua sursă, din excepții (`:807-810`).

---

## 3) Constatări

### 3.1 Disponibilitate, rate-limit și rezistență la outage

**F1 — CRITIC — Search-ul apelează CoinGecko fără cheia de API, pe cotă anonimă de ~5 cereri/minut/IP.**
Dovadă: `coinGeckoSearchCandidates` cheamă `fetchJson(url, 3_500)` fără headers (`scanner-routes.ts:200-204`), în timp ce restul aplicației trimite `x-cg-demo-api-key`: `market-service.ts:60-65`, `chart-market-probes.ts:216`, `dex-market-data.ts:154`, `onchain-metrics.ts:42`, `crypto-market-profile.ts:55-56`, `crypto-four-criteria-scanner.ts:713,742`. Măsurat live (IP rezidențial, fără cheie): 5 cereri distincte OK, a 6-a → `429` cu body `Throttled`, fără `Retry-After`; în rafală toate cele 8 → `429`.
Impact: fiecare tastă distinctă consumă 1 apel CoinGecko (cache-ul de 30 s și `coinGeckoLastGood` ajută doar pentru query-uri repetate identic). Un cuvânt de 7 litere ≈ 4-7 apeluri → cota moare la jumătatea cuvântului. `fetchJson` întoarce `undefined`, `coinGeckoSearchCandidates` cade pe `coinGeckoLastGood` (gol pentru un query nou) → sursa care aduce `coinGeckoId` (identitatea folosită de deep-dive la verificare) dispare **tăcut**: nici un câmp de eroare, nici un badge, nici o scădere vizibilă de calitate. Toți utilizatorii unei instanțe Cloud Run împart aceeași cotă (IP de egress). Dacă `COINGECKO_API_KEY` e setat în producție: **neverificat** (nu am acces la env-ul deployat); cert este că, indiferent de configurație, ruta de search nu îl folosește.

**F2 — CRITIC — Un singur eșec Binance pe cache rece scrie un cache GOL valabil 15 minute.**
Dovadă: `loadBinanceMarkets` (`scanner-routes.ts:81-93`): la `payload === undefined` (timeout 3.5 s, 429, DNS) `rows = payload?.symbols || current?.rows || []` → `[]`, apoi `cache = { rows: [], expiresAt: now + 15min }` este scris necondiționat; următorul apel returnează imediat `[]`. Repro fidel (transcriere identică a fluxului, host mort): `cold call -> rows=0 (67ms)`, `cache written by the FAILED fetch: rows=0, ttl=900s`, `second call within the window -> rows=0 took=0ms (no retry)`. Același tipar pentru futures.
Impact: pierderea totală, tăcută, a sursei Binance (865 spot + 527 perpetue = 1392 candidați, ~77% din volumul de candidați) pentru până la 15 minute, per instanță, după o singură eroare tranzitorie. Pagină de search „funcțională" care întoarce doar catalog + Top 150 + Yahoo, fără nici un semnal de degradare.

**F3 — MAJOR — Nu există deduplicare in-flight și nici anulare server-side; fiecare tastă = 2 apeluri externe.**
Dovadă: cache-ul de răspuns e verificat doar la intrare și scris la final (`:260-262, 308-309`) — nu există `Map<query, Promise>` (deși tiparul există în același fișier: `universeInFlight`, `:39, 227-228, 252`); ruta nu tratează `req.on('close')`/`res.on('close')`, deci `AbortController`-ul clientului (`UniversalSearchModal.tsx:124-140`) nu oprește munca serverului, doar ignoră răspunsul. Două cereri identice concurente (doi utilizatori) ajung amândouă la Yahoo + CoinGecko.
Impact: costul upstream e proporțional cu tastarea, nu cu numărul de utilizatori; cota F1 se consumă și mai repede. Consumă și CPU/egress degeaba.

**F4 — MINOR — Cache-Control inconsistent.** `res.set('Cache-Control', 'private, max-age=15')` se aplică doar pe ramura miss (`:310`); răspunsul servit din cache-ul de 30 s (`:262`) iese fără header, deci browserul nu poate refolosi răspunsul.

### 3.2 Acuratețea clasării (false pozitive/negative, coliziuni, aliasuri)

Metodă: harness read-only care reconstruiește setul de candidați din payload-uri reale (exchangeInfo spot/futures descărcate, Top-250 CoinGecko real, 234 perpetue Hyperliquid) și rulează exact `rankSymbolSearchCandidates` din `@money-scanner/shared`.

**F5 — MAJOR — Rânduri duplicate pentru același activ (369 rânduri redundante; BTC apare de 6 ori).**
Cauză: cheia de identitate diferă între surse — catalogul crypto are **un singur** `coinGeckoId` (census: 281 active, crypto 109, stocks 128, metals 44; `coinGeckoId` doar `HYPE=hyperliquid`), deci rândul de catalog NU se unește cu rândul de univers (`crypto:coin:bitcoin`) și nici cu perechile Binance (`crypto:BINANCE:spot:BTCUSDT:`).
Dovezi (harness, date reale):
- `q=BTC` → 53 rezultate, `rows sharing one ticker: BTCx6` (catalog BTC, univers BTC, BTCEUR, BTCFDUSD, BTCUSDC, BTCUSDT + BTC.D; cu Yahoo live se adaugă alte rânduri `$BTC`);
- `q=CAKE` → 5 rânduri `CAKE`; `q=CVX` → 4; `q=UNI` → 4; `q=HYPE` → 3; `q=XAUT` → 3; `q=LIT` → `LTCx2` (nume diferit, ok).
- coverage.mjs: 1368 perechi TRADING, 497 active de bază, 865 perechi acceptate → 1,74 rânduri/activ; 262 active emit >1 rând (max 6).
Impact: listă zgomotoasă, impresia falsă de instrumente distincte, iar toate rândurile care împart simbolul deschid aceeași pagină (§F6). Pe ecranul de search utilizatorul vede 6 rânduri „$BTC", toate cu același preț și același tier Money Line (îmbogățirea e cheiată pe `symbol_1w`, `:296-307`).

**F6 — MAJOR — Identitatea aleasă se pierde la click.**
Dovadă: `handleSelect` trimite obiectul complet (`UniversalSearchModal.tsx:212-216`), dar `onSelectAsset` păstrează doar `symbol` + `coinGeckoId` (`App.tsx:549-555`); URL-ul nu are parametri de pereche/bursă/quote (`:253-257`). Consecințe: (a) rândul `BTCUSDT` (spot, BINANCE, quote USDT) și `BTCEUR` deschid același activ; (b) rândul `CAKEBTC` promite perechea BTC și deschide activul generic; (c) dacă utilizatorul alege rândul `coinGecko`/`universe` **cu** `coinGeckoId`, deep-dive-ul intră pe verificarea de identitate și poate răspunde `503`; dacă alege rândul Binance/Yahoo **fără** `coinGeckoId`, **întreaga verificare de identitate este sărită** (`scanner-routes.ts:535`) și rezolvarea se face pe ticker (catalog → Top 80 după ticker, `:559-606`) — exact scenariul de coliziune de ticker pe care Step 58/59 îl închisese în UI. Rezultatul depinde de rândul ales, deși rândurile arată identic „verificat". Textul hint din modal („BINANCE:ETHUSDT — pereche spot pe bursă exactă", `:529-537`) promite o identitate pe care handoff-ul nu o transmite.

**F7 — MAJOR — Quote-ul primar nu e preferat: perechile `/BTC` sunt egal clasate cu `/USDT` și câștigă tie-break-ul.**
Dovadă: bonusul de quote se aplică doar dacă query-ul conține un quote (`query.quote &&`, `symbol-search.ts:234-236`); pentru `q=CAKE` toate cele patru perechi spot au `matchScore=1320`, iar sortarea finală ajunge la `left.name.localeCompare(right.name)` (`:258-263`) → ordinea afișată este `CAKE / BTC`, `CAKE / USDC`, `CAKE / USDT` (harness: `CAKEBTC` înaintea `CAKEUSDT`). Similar pentru `XAUT` (BTC/USDC înaintea USDT).
Impact: utilizatorul unui produs cotat în USD este împins către perechea BTC. Invers, pentru `q=btcusdt`, rândul de catalog (generic, fără pereche, `instrumentType` gol) urcă la 1570 și devine primul rezultat, **peste** rândul real `BTCUSDT` spot (1500) — utilizatorul care a tastat perechea exactă primește primul rândul generic.

**F8 — MINOR — Clasare pe ranguri de catalog învechite.** Bonusul de rang folosește `candidate.rank` din catalog (hardcodat; ex. BTC `rank: 128`, `packages/shared/src/constants/assets.ts:1899-1909`), în timp ce deep-dive-ul suprascrie rangul din Top 150 live (`scanner-routes.ts:631-642`). Efect limitat (≤50 puncte, doar tie-break), dar înseamnă că ordinea din search nu folosește rangul live pe care aplicația îl are deja în cache.

**F9 — MINOR — Fallback-ul „direct" mutilează simboluri valide.**
Dovadă (repro cu codul real din `:276-294`, `direct-branch.ts`):
`^GSPC` → `GSPC`; `EURUSD=X` → `EURUSDX`; `BRK.B` → `BRKB`; `BTC-USDT` → `BTCUSDT` (ok); `XAU/USD` → **nici un rezultat** (regexul `^[A-Z0-9.^=-]{1,24}$` respinge `/`); `AAPL!` → nici un rezultat.
Cauza: `parsed.compact` trece prin `compactSymbol` care șterge `^ . = -` (`symbol-search.ts:58-61`), apoi simbolul e folosit ca atare.
Impact: pe ramura de ultimă instanță (`verified:false`, „direct") se deschide un simbol care nu există la provider (GSPC/BRKB/EURUSDX) → pagină goală sau, mai rău, alt instrument. Perechile tastate cu `/` pentru un ticker necunoscut nu produc nici măcar fallback-ul.

**F10 — INFO — Aliasurile de identitate sunt corecte, dar netestate.** Maparea `searchIdentityAliases: { pons: ['Robinhood','Robinhood Chain','Pons Robinhood'] }` (`:44`) e fundamentată: CoinGecko confirmă live `id=pons`, `asset_platforms={"robinhood":"0x39dbed3a..."}`, `categories=["Launchpad","Robinhood Ecosystem","Pons Launchpad"]`. Harness: `q=pons robinhood` → `crypto:coin:pons` (1260, `alias-exact`) și `q=robinhood` → PONS + `HOOD` (stock) — funcționează. Observație de fidelitate: testul existent folosește `coinGeckoId: 'pons-robinhood'` (`symbol-search.test.ts:91`), id care **nu** este cel servit de provider (`pons`), deci nu validează maparea reală (care oricum trăiește în rută, nu în shared).

**F11 — INFO — False pozitive găsite sunt acceptabile.** `q=bitcoin` → `Bitcoin` (BTC) primul (1490), `BCH` (995) pe baza prefixului de nume, plus un nume bancar (BCH = Bitcoin Cash). `q=NVDQ` → `NVDA` cu `typo` (500), iar `q=NV` nu produce typo (testul confirmă, `symbol-search.test.ts:81-86`). `q=ZCAP`/`ZZZZQQ`/`US500` → 0 rezultate → fallback direct. `q=LIT` → primul rezultat este ETF-ul de metale `LIT` (1410, exact), apoi `LITUSDT.P` (1110, alias) — comportament corect pentru un ticker exact de ETF, dar utilizatorul care caută tokenul LIT nu-l găsește deloc (nu mai există listare spot Binance; nu este în Top 150/Hyperliquid) → vezi lipsurile de acoperire.

### 3.3 Date vechi / stigmatizare (`staleAsOf`)

**F12 — MINOR — `staleAsOf` nu ajunge niciodată în UI; rândurile last-good poartă badge „verificat".**
Dovadă: câmpul e produs doar în două locuri (`scanner-routes.ts:207` pentru `coinGeckoLastGood`, `:251` pentru `universeLastGood`) și e menționat în tip ca „Last-good provider snapshot, not a fresh quote or verification" (`symbol-search.ts:22`); în `apps/web/src` nu apare nicăieri (grep `staleAsOf` → 0 rezultate; cuvântul „stale" apare doar în comentarii și în `AlertsCenterView`, nu în modal). Penalizarea de clasare este de 15 puncte (`symbol-search.ts:242`), practic invizibilă la scoruri de 900-1400.
Impact: în caz de outage, utilizatorul primește un snapshot vechi (până la 5 min pentru univers, nedeterminat pentru `coinGeckoLastGood`, care nu are TTL) cu același aspect (badge verde „verificat", `:394-402`) ca datele proaspete. Contravine regulii de aur #1 — datele vechi trebuie marcate, nu camuflate. În plus, rândurile care provin din `coinGeckoLastGood` nu au `price` (câmpul nu e populat de acea sursă) → rândul apare fără preț (`price > 0` la `:416`), ceea ce poate arăta ca „lipsă de date" fără explicație.

**F13 — MINOR — Badge-ul „verificat" supra-promite pentru candidații fără identitate de bursă.**
Un candidat CoinGecko primește `verified: true` (`:216`) pentru că există în indexul providerului, nu pentru că are piață de tranzacționare verificată. La click, exact acest rând poate produce `503 'Verified exchange candles unavailable for the selected coin.'` (`:554`), iar UI-ul afișează „Instrumentul a fost găsit, dar datele de piață nu au putut fi încărcate momentan." (`AssetDeepDiveView.tsx:163`) — adică o eroare de tip outage pentru o refuzare deliberată de politică (fail-closed). Utilizatorul nu are cum să distingă cauza.

### 3.4 Latență și cost

**F14 — INFO — Cost per tastă și cost per instanță (măsurat).**
- Per keystroke (după 180 ms de pauză): 1 cerere `/api/search` → 2 apeluri externe (Yahoo + CoinGecko) garantat; la fiecare 15 min și 2 apeluri uriașe Binance (exchangeInfo spot 17,646,386 B raw / 320,105 B gzip, măsurat 0,54 s; futures 1,127,625 B raw / 50,908 B gzip, 0,82 s); la fiecare 5 min dinamicul (Top 150 + scanare DefiLlama, cache-uită).
- `JSON.parse` pe exchangeInfo spot = **83 ms de CPU blocant** pe acest Mac (măsurat), plus decomprimare; pe un vCPU de Cloud Run, mai mult. Se plătește la fiecare fereastră de 15 min per instanță.
- Clasarea: 1673-1817 candidați → **3,8-7,5 ms/apel** (măsurat, medie din 3), array de candidați ≈ 489 KB în memorie, răspuns 2,4 KB pentru 60 rânduri. CPU-ul nu este problema; rețeaua este.
- Latența percepută: `Promise.all` așteaptă cea mai lentă sursă → 0,2-0,5 s tipic; orice provider care atinge timeout-ul de 3,5 s (`:71-79`) ține răspunsul ~3,5 s, apoi (pentru Binance) declanșează F2.
**F15 — INFO — Cache-ul de răspuns este per instanță.** `searchResponseCache` (30 s, 200 intrări) și `coinGeckoLastGood` (200 intrări) sunt `Map`-uri în proces (`:36-37`); pe Cloud Run cu N instanțe, fiecare instanță are propriul cache și propriul consum de cotă. Fără deduplicare cross-user, 30 s este scurt pentru un quota de 5/min (F1).

### 3.5 Acoperire (ce nu poate fi găsit)

**F16 — MAJOR — Acoperirea crypto depinde de o sursă care moare primul minut de tastare.**
Lanțul de acoperire: catalog crypto (109 active, 1 singur `coinGeckoId`) + univers (Top 150 cu listare Binance spot sau Hyperliquid, `market-service.ts:396-398`) + Binance spot/futures (865 + 527) + Yahoo (crypto CCC, fără `coinGeckoId`) + CoinGecko (sursa de identitate). Se suprapun: F1 taie sursa de identitate la ~5 cereri/minut, F2 taie întreaga sursă Binance 15 minute după un eșec tranzitoriu. Când ambele se întâmplă, căutarea rămâne cu un catalog aproape fără `coinGeckoId` — iar deep-dive-ul fără `coinGeckoId` sare peste verificarea de identitate (F6). Verificat live că sursele în sine sunt corecte: cele 497 active de bază listate TRADING pe Binance spot sunt toate acoperibile prin quote-urile permise (un singur caz exclus, `USDT` însuși, care e stablecoin); 234 perpetue pe Hyperliquid, `PONS` prezent; Yahoo răspunde 200 pentru crypto.
**F17 — MINOR — Active fără listare Binance/Hyperliquid sunt dependente de catalog sau de Yahoo.** Un activ cotat doar pe Coinbase/Kraken/OKX nu are nicio sursă de identitate în search: apare doar dacă e în catalog (109 crypto) sau prin Yahoo (fără `coinGeckoId`), iar la click ajunge pe pagina „price-only". Comportamentul e parțial intenționat (scope Binance/Hyperliquid), dar nu e comunicat în UI: rândul nu spune „fără lumânări verificate".

### 3.6 Securitate / validare input

**F18 — INFO — Ruta este protejată de sesiune (verificat live), dar nu are limitare de rată proprie.**
`/api/search` → `401 AUTH_REQUIRED` fără sesiune (curl live). Nu există niciun `express-rate-limit`/throttle în API (grep pe `apps/api/src` și `packages/*/src` → 0 middleware de rate-limit). Nu e abuzabil anonim, dar N utilizatori autentificați × tastare consumă aceeași cotă CoinGecko (F1) fără nicio frână server-side.
**F19 — MINOR — `?q` repetat produce 500 și scurgere de mesaj intern.** `(req.query.q as string || '').trim()` (`:258`) crapă pe array: repro cu Express 4.22.2 instalat în repo → `GET /api/search?q=a&q=b` ⇒ `500 {"error":"Search failed","details":"(req.query.q || \"\").trim is not a function"}`; identic pentru `?q[]=a`. Clientul actual nu trimite niciodată array, deci impactul e de igienă (500 în loc de 400 + mesaj intern returnat către client).
**F20 — INFO — Fără limită de lungime a query-ului.** Doar `trim()` (`:258-259`); un `q` de câteva mii de caractere este acceptat (limita de header de ~16 KB a Node e singura frână), folosit ca cheie de cache și trimis către Yahoo/CoinGecko (prin `encodeURIComponent`, deci fără injecție de URL). Cache-urile sunt mărginite (200 intrări), deci nu există risc de creștere nelimitată de memorie. Nu am găsit nicio cale prin care textul utilizatorului să ajungă neencodat într-un URL de provider în pipeline-ul de search (simbolul „direct" este filtrat la `[A-Z0-9]` prin `compactSymbol`) — `neverificat` pentru rutele din afara search-ului (`chart-market-probes.ts:170,207` interpolează `base` neencodat în URL-uri Binance/MEXC; nu am urmărit dacă `base` poate conține input de utilizator pe ruta de deep-dive).
**F21 — INFO — XSS/UI: fără risc identificat.** Numele/tickerul sunt randate ca text React (`UniversalSearchModal.tsx:383-410`), fără `dangerouslySetInnerHTML`.

### 3.7 Calitatea testelor existente

**F22 — MAJOR — Doar 9 teste, toate pe funcția pură de clasare; ruta și fallback-urile sunt neacoperite.**
Dovadă: `node_modules/.bin/tsx --test apps/api/src/services/symbol-search.test.ts` → **9/9 pass, 220 ms**. Teste existente: exactitate ticker, pereche qualificată de bursă, coliziune crypto/stocks (CAKE), preferință de quote (`BTC/USDT`), spot vs perp, typo, multi-word/alias de nume, identitate Bitcoin vs ticker lookalike, merge pe CoinGecko id. Lipsesc complet: test pe ruta `/search` (nu există niciun test care să monteze ruta; `crypto-market-profile.test.ts:110` montează doar `/assets/:symbol`), test pe fallback-urile `coinGeckoLastGood`/`universeLastGood` și semantica `staleAsOf`, test pe cache-ul negativ `loadBinanceMarkets` (F2), test pe ramura „direct" (F9), test pe `searchIdentityAliases` (F10), test pe cache-ul de 30 s / deduplicare, test pe validarea de input (F19) și — pe partea de web — **niciun test** pentru `UniversalSearchModal` (logică de merge, deduplicare, sortare, suprascrierea prețurilor), deși aici trăiește comportamentul vizibil.
**F23 — MINOR — Rularea testelor poate rula artefacte vechi.** `apps/api/package.json`: `"test": "node --test dist/**/*.test.js || tsx --test src/**/*.test.ts"` → dacă `dist/` există (există), se rulează JS-ul compilat, nu sursa. Un test adăugat azi în `src` nu rulează până la un build, iar unul șters din `src` poate rula în continuare din `dist`.

---

## 4) Ce am verificat live

Toate comenzile sunt read-only, fără autentificare. (`neverificat` = nu am putut verifica.)

| # | Comandă (prescurtat) | Rezultat |
|---|---|---|
| 1 | `curl -s -w "http=%{http_code} time=%{time_total}" "https://api.coingecko.com/api/v3/search?query=pons"` | `http=200 time=0.36s size=6558`; primul rând `{"id":"pons","name":"Pons","symbol":"PONS","market_cap_rank":123}` → **id-ul real este `pons`**, deci cheia mapării de aliasuri e corectă |
| 2 | `curl "https://api.coingecko.com/api/v3/coins/pons?localization=false&tickers=false&market_data=false..."` | `http=200`; `platforms {"robinhood":"0x39dbed3a2bd333467115de45665cc57f813c4571"}`; `categories ["Launchpad","Robinhood Ecosystem","Pons Launchpad"]` → **grounding-ul aliasului „Pons Robinhood" confirmat** |
| 3 | `for q in a bi bit bitc eth sol aur; do curl ".../search?query=$q"; done` | `a 200 (1.05s)`, `bi 200`, `bit 200`, **`bitc 429`**, `eth 200`, `sol 200`, **`aur 429`** → cota anonimă se epuizează în ~5 cereri/minut |
| 4 | `for q in a1..a6 (2s între cereri) curl .../search?query=$q` | `a1..a5 200`, **`a6 429`** → limita reală ≈ 5 cereri/minut/IP |
| 5 | `for i in 1..8; curl .../search?query=burst$i` | **8/8 → 429**, body `Throttled`, fără header `Retry-After` |
| 6 | `curl -H 'User-Agent: Mozilla/5.0 (compatible; MarketScanner360/1.0)' "https://query1.finance.yahoo.com/v1/finance/search?q=NVDA&quotesCount=20&newsCount=0"` | `http=200 time=0.29s size=2286`; `NVIDIA Corporation, NMS, EQUITY` |
| 7 | `for i in 1..15; curl ".../v1/finance/search?q=qq$i..."` | **15/15 → 200** (Yahoo nu a limitat în acest test) |
| 8 | `curl ".../v1/finance/search?q=BTC..."` | `BTC-USD\|CRYPTOCURRENCY\|CCC\|Bitcoin USD`, `BTC-EUR\|CRYPTOCURRENCY\|CCC`, plus ETF-uri (`BTCI`, `GBTC`, `BTC`) → sursa Yahoo adaugă rânduri crypto fără `coinGeckoId` |
| 9 | `curl --compressed -o audit_bspot.json "https://api.binance.com/api/v3/exchangeInfo"` | `http=200 time=0.54s`; gzip 320.105 B, raw 17.646.386 B, 3713 intrări, 1368 TRADING |
| 10 | `curl --compressed -o audit_bfut.json "https://fapi.binance.com/fapi/v1/exchangeInfo"` | `http=200 time=0.82s`; gzip 50.908 B, raw 1.127.625 B, 907 simboluri → 527 perpetue USDT |
| 11 | `curl -X POST -d '{"type":"meta"}' https://api.hyperliquid.xyz/info` | `http=200`; 234 perpetue; `PONS` prezent |
| 12 | `curl "https://scanner.relayhub.no/api/health"` | `http=200 {"status":"ok","service":"market-scanner-360-api","uptimeSeconds":32002}` |
| 13 | `curl "https://scanner.relayhub.no/api/search?q=bitcoin"` | `http=401 {"error":"Authentication required","code":"AUTH_REQUIRED"}` → **endpoint-ul nu poate fi testat end-to-end fără sesiune Firebase** |
| 14 | `tsx tmp/audit-search/harness.ts BTC bitcoin LIT CAKE PONS spacex gold aur argint NVDA NVDQ "BINANCE:LITUSDT.P" CVX UNI XAU btcusdt "btc/usdt" ZZZZQQ US500` | 1673→1817 candidați/query; `BTCx6`, `CAKEx5` (CAKEBTC înaintea CAKEUSDT, ambele 1320), `CVXx4`, `UNIx4`, LIT(ETF metals)=1410 > LITUSDT.P=1110, `spacex`→SPACEX(stocks), `gold`/`aur`→XAU, `argint`→XAG, `NVDQ`→NVDA(typo), `ZZZZQQ`/`US500`→0 rezultate |
| 15 | `tsx tmp/audit-search/cost.ts` | clasare 3,76-7,54 ms/apel pentru 1673 candidați; răspuns 60 rânduri = 2399 B; array candidați = 488.841 B |
| 16 | `node tmp/audit-search/coverage.mjs` | 1368 perechi TRADING, 497 active, 496 acoperite, 1 neatins (`USDT`), 865 perechi acceptate (1,74 rânduri/activ), 262 active cu >1 rând |
| 17 | `tsx tmp/audit-search/negative-cache.ts` (transcriere fidelă a `loadBinanceMarkets`, host mort) | `cold call -> rows=0 (67ms)`; `cache written by the FAILED fetch: rows=0, ttl=900s`; `second call -> rows=0 took=0ms (no retry)` |
| 18 | `tsx tmp/audit-search/direct-branch.ts` | `^GSPC→GSPC`, `EURUSD=X→EURUSDX`, `BRK.B→BRKB`, `XAU/USD→(no direct result)`, `AAPL!→(no direct result)`, `ZZZZQQ→ZZZZQQ` (verified=false) |
| 19 | `node tmp/audit-search/array-query-repro.mjs` (Express 4.22.2 din repo) | `?q=bitcoin → 200`; `?q=a&q=b → 500 "(req.query.q \|\| \"\").trim is not a function"`; `?q[]=a → 500` |
| 20 | `tsx --test apps/api/src/services/symbol-search.test.ts` | **9 pass / 0 fail, 220 ms** |
| 21 | `grep -rn "COINGECKO_API_KEY" packages apps` | 7 locuri folosesc cheia; **`scanner-routes.ts` nu** |
| 22 | `grep -rn "staleAsOf" apps packages` | doar 2 ocurențe, ambele în API (`scanner-routes.ts:207,251`); zero în `apps/web` |

**Neverificat (necesită sesiune/mediu de producție):** răspunsul real al `/api/search` pe producție (401 fără sesiune); latența end-to-end percepută de utilizator; dacă `COINGECKO_API_KEY` este setat în producție; câte instanțe Cloud Run rulează (determină amplificarea cache-urilor per-instance); dacă sursa DefiLlama (`getCryptoCriteriaReport`) contribuie efectiv cu rânduri în univers în producție; rata reală de `503` la click pe rânduri CoinGecko; dacă browserul utilizează efectiv `Cache-Control: private, max-age=15`.

---

## 5) Plan de îmbunătățire propus

### P0 — Quick wins (≤1 zi, risc mic, impact imediat)

| # | Acțiune | Efort | Risc |
|---|---|---|---|
| A1 | Trimite `x-cg-demo-api-key` (dacă env-ul există) în `coinGeckoSearchCandidates`; centralizează un `fetchJson` cu headerele CoinGecko ca să nu mai existe call-site-uri „uitate" | 0,5-1 h | Scăzut. Dacă nu există cheie în prod, doar nu schimbă nimic — deci verifică mai întâi env-ul |
| A2 | Nu scrie cache Binance pe eșec: scrie cache doar când `payload?.symbols?.length`, altfel păstrează rândurile vechi și retry la următorul apel (ideal: backoff 30 s) | 0,5-1 h | Scăzut; elimină F2 complet |
| A3 | Limită minimă server-side (`q.trim().length >= 2`) și nu chema Yahoo/CoinGecko pentru `compact.length < 3` (răspunde din catalog + univers + Binance, care sunt deja în cache) | 0,5-1 h | Scăzut; taie ~50% din apelurile de provider pe prima jumătate a cuvântului |
| A4 | Deduplicare in-flight pe `cacheKey` (`Map<key, Promise>`, exact tiparul `universeInFlight`) | 1 h | Scăzut |
| A5 | Guard `?q` array → `400 Bad Request` fără `details` | 0,5 h | Scăzut; elimină F19 |
| A6 | `Cache-Control` pe ambele ramuri (inclusiv cache hit) | 0,25 h | Scăzut |
| A7 | Preferință de quote primar (USDT > USDC > FDUSD > … ) în tie-break când query-ul nu are quote; și nu lăsa rândul generic de catalog să bată perechea exactă tastată | 1-2 h + teste | Mediu — atinge ordinea rezultatelor, are nevoie de teste de regresie |

### P1 — Structurale mici (2-4 zile)

| # | Acțiune | Efort | Risc |
|---|---|---|---|
| B1 | Stigmatizează datele vechi în UI: badge „snapshot HH:MM" / „last-good" când `staleAsOf` există, plus praguri (ex. roșu peste 15 min); aliniat cu regula #1 | 3-4 h (API deja trimite câmpul) | Scăzut |
| B2 | Deduplicare la nivel de răspuns: grupează rândurile care împart `symbol` + `marketClass` și păstrează identitatea cea mai puternică, păstrând coliziunile reale (CVX stocks vs crypto) — reduce BTCx6 la 2-3 rânduri distincte | 4-6 h + teste | Mediu (risc de a ascunde o coliziune legitimă) |
| B3 | Identitate completă la click: transmite `providerSymbol`/`exchange`/`quoteCurrency`/`instrumentType` prin `openAsset` → parametri URL → `/api/assets/:symbol`, astfel încât rândul ales să fie și instrumentul deschis; `neverificat` de celălalt consumator (`AssetLink`/heatmap) — necesită extinderea semnăturii și a URL-ului | 1,5-2 zile | Mediu-ridicat (atinge deep-link-urile existente, `history.pushState`, restaurarea din URL) |
| B4 | Închide gap-ul de identitate când `coinGeckoId` lipsește: nu sări peste verificare, ci tratează explicit „fără identitate confirmată" (fie 503 cu mesaj corect, fie pagină price-only marcată), în loc de rezolvare pe ticker | 4-6 h | Mediu; schimbă comportamentul existent pentru rândurile Binance/Yahoo |
| B5 | Badge-ul „verificat" să reflecte ce s-a verificat și să existe un badge distinct „indexat (fără lumânări verificate)" pentru rândurile CoinGecko-only; mesajul de eroare din deep-dive să spună cauza reală, nu „datele nu s-au putut încărca" | 3-4 h | Scăzut |
| B6 | Repară simbolurile „direct": construiește simbolul din `parsed.text` păstrând `^ . = -`, nu din `compact`; acceptă și perechi `BASE/QUOTE` fără listare | 1-2 h + teste | Scăzut |
| B7 | Teste noi: rută `/search` cu fetch-uri injectate (mock), acoperind throttling CoinGecko, cache negativ Binance, ramura „direct", deduplicare in-flight, `staleAsOf`, maparea de aliasuri; un test de componentă pentru `UniversalSearchModal` (merge local/remote, sortare, dedup) | 1-1,5 zile | Scăzut; obligatoriu înainte de B2/B3 |

### P2 — Structurale mari (opționale, 3-5 zile)

| # | Acțiune | Efort | Risc |
|---|---|---|---|
| C1 | Elimină apelul per-tastă la CoinGecko: folosește snapshot-ul de Top 250 deja cache-uit 5 min (`getTopCryptoAssets`) pentru identitate și rezervă `/search` pentru coada lungă (ex. doar când query-ul are ≥4 caractere și e „stabilizat" 400 ms). Cota externă devine constantă (1/5 min), nu dependentă de viteza de tastare | 1-2 zile | Mediu; verifică echivalența rezultatelor (id-uri, rank) |
| C2 | Snapshot unificat de tip „search index" rebuilt la 5 min (catalog + univers + Binance diffs) + index de prefixe în memorie, interogat per tastă; providerii live doar pentru coadă lungă | 3-5 zile | Ridicat (rescrie sursele de candidați), dar rezolvă simultan F1, F3, F14, F16 |
| C3 | Observabilitate: contoare per sursă (apeluri, 429/5xx, stale hits, latență p95) expuse pe pagina de status; astăzi degradarea F1/F2 este invizibilă inclusiv pentru operator | 1-2 zile | Scăzut |

### Ordine recomandată
A1 → A2 → A3 → A4 → B7 (teste care fixează comportamentul) → A7 → B1 → B6 → B5 → B2 → B3/B4 → C1 → C3 → C2.

---

## 6) Verificare încrucișată

Afirmații pe care un recenzent ar trebui să le verifice independent:

1. **„Clasarea preferă perechea `/BTC` în fața `/USDT`"** — rulați `rankSymbolSearchCandidates('CAKE', <candidați binance spot CAKEBTC/CAKEUSDC/CAKEUSDT>)` (sau `tsx tmp/audit-search/harness.ts CAKE`) și confirmați că `CAKEBTC` și `CAKEUSDT` au același `matchScore` și că ordinea finală este decisă de `name.localeCompare` (`symbol-search.ts:234-236, 258-263`).
2. **„Un eșec Binance pe cache rece scrie cache gol pe 15 minute"** — citiți `scanner-routes.ts:81-93` sau rulați `tsx tmp/audit-search/negative-cache.ts`: pe eșec, `rows` devine `[]` și `expiresAt = now + 15 min` se scrie necondiționat.
3. **„Ruta de search nu folosește cheia CoinGecko, restul aplicației o folosește"** — `grep -rn "COINGECKO_API_KEY" packages apps`: 7 call-site-uri cu cheie, zero în `scanner-routes.ts`; apoi `curl` secvențial pe `api.coingecko.com/api/v3/search` fără cheie pentru a reproduce 429 după ~5 cereri/minut (body `Throttled`).
4. **„Click-ul pierde identitatea rândului"** — comparați `UniversalSearchModal.tsx:212-216` (se trimite obiectul complet) cu `App.tsx:549-555` (se păstrează doar `symbol` + `coinGeckoId`) și cu `scanner-routes.ts:503, 535` (verificarea de identitate rulează doar dacă există `coinGeckoId`/`coinPaprikaId`).
5. **„`staleAsOf` nu este niciodată afișat"** — `grep -rn "staleAsOf" apps packages`: doar `scanner-routes.ts:207, 251`; în `apps/web/src` apare doar ca atare în comentarii/tipuri, iar modalul randează badge „verificat" pe `verified !== false` (`UniversalSearchModal.tsx:394-402`).
