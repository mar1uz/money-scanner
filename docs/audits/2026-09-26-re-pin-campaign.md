# Campanie re-pin chart-market — dry-run de producție

**Data:** 26 septembrie 2026 (rulare: 25 sep, 23:48–23:58 UTC; pinii citiți la 23:48 UTC)
**Scop:** unealta de re-pin pentru pinii de rezoluție chart-market din Firestore + dry-run real pe pinii de producție, ca să se vadă exact ce se schimbă înainte de a scrie ceva.
**Unelte:** `apps/api/scripts/re-pin-chart-markets.ts` (NOU) + `apps/api/scripts/re-pin-chart-markets.test.ts` (NOU, 25 teste `npx tsx --test`, toate trecute) + `tmp/re-pin/` (artefacte).
**Nu s-a făcut:** nicio scriere în Firestore (`--apply` NU a fost rulat), niciun commit, push sau deploy; niciun fișier din `packages/**`, `apps/api/src/**`, `apps/web/**` nu a fost atins.

---

## 1. Rezumat executiv

| Indicator | Valoare |
|---|---|
| pinuri citite (read-only, `money-scanner-360`/`chart-market-resolutions`) | **89** |
| neschimbate | **67** |
| **SCHIMBATE** | **21** |
| — din care sursă de lumânări schimbată | 20 |
| — din care simbol TradingView schimbat | 41 (20 candle + 21 tv) |
| — din care `listingStart` corectat | 9 candle / 10 tv |
| sărite (sursă pe care build-ul curent nu o poate produce) | **1** (`GP:graphite-protocol`) |
| eșuate la recalculare | **0** |
| pinuri cu `listingStart` suspect fabricat (Kraken ~720z / Coinbase trunchiat) | **2** (`SKY:sky`, `KITE:kite-2`) |
| pinuri cu volum 24h completat de fix (informativ, nu schimbă piața) | **32** |
| cereri upstream (totale) | 2 835 — 0 × 429, 0 × 5xx, 0 retry-uri |

Trei concluzii care contează operațional:

1. **Fix-urile din fa1104a sunt inerte pentru pinii existenți, iar pinii sunt proaspeți.** Toți cei 89 de pini au `resolvedAt` între 2026-09-25 07:57 și 22:57 UTC — deci au fost scriși *azi*, dar de revizia activă `market-scanner-360-00281-5xt` = commit **e8d8f2d**, care este *părintele* lui fa1104a (verificat: `e8d8f2d` e strămoș al lui `fa1104a`; main e „LOCAL, not deployed"). De aceea pinii poartă exact defectele pe care fa1104a le repara: `listingStart` fabricat Kraken/Coinbase, OKX favorizat de volumul dublu înmulțit, `binance_spot` fără volum 24h.
2. **21 de pinuri se schimbă la re-pin**, iar schimbarea dominantă (16 din 20 de schimbări de sursă de lumânări) este mutarea pe `binance_spot` — consecința directă a fix-ului de volum (binance_spot capătă acum volum 24h, OKX nu mai e umflat) care decide tie-break-urile de listare. 3 pinuri trec pe `okx_spot`, 2 au doar corecția de simbol TV (Kraken/Coinbase → spot cu lumânări).
3. **Un singur pin e exclus implicit din scriere:** `GP:graphite-protocol` are sursa `xt_spot` (XT.COM), care există doar pe ramura `instinct-alert-gp-batch` (3f48d58 / 2417fad), nu în main@fa1104a și nici în revizia deployată e8d8f2d. Un re-pin cu codul din main ar înlocui piața XT (pinul a fost scris azi 18:24 UTC, deci de cod XT — cel mai probabil o rulare locală/pe ramură cu ADC; nu pot stabili cine l-a scris). Uneltele îl raportează și îl sar; includerea lui cere coordonare cu ramura XT (`--include-unsupported`).

---

## 2. Metodă

1. **Citire read-only** din Firestore: proiect `gen-lang-client-0610749770`, baza `money-scanner-360`, colecția `chart-market-resolutions` — exact calea din `apps/api/src/services/app-state.ts` (`chartMarketDocument`). Credențiale: ADC local (`gcloud auth application-default`); în cod se referă doar numele variabilelor: `FIREBASE_PROJECT_ID` / `GOOGLE_CLOUD_PROJECT` (proiect), `GOOGLE_APPLICATION_CREDENTIALS` (alternativă), `COINGECKO_API_KEY` (opțional, ridică limita CoinGecko).
2. **Recalculare cu codul corectat**: `MarketDataService` din `@money-scanner/market-data` (aceleași adaptoare + sonde ca API-ul), instanțiat **fără** store de pinuri, ca rezoluția să fie recalculată, nu citită din pin. Scriptul verifică înainte de rulare că build-ul folosit conține fix-urile fa1104a (`KRAKEN_OHLC_WINDOW`, `COINBASE_TRUNCATED_CANDLE_COUNT`, `binanceSpotQuoteVolume24h` în `packages/market-data/dist/chart-market-probes.js`); altfel se oprește (fail-closed).
3. **Rate limiting + retry-uri**: un „guvernor” care împachetează `globalThis.fetch` — concurență per host, pauze minime (CoinGecko 2,2 s cu cheie, 5,5 s fără; Kraken 1,2 s), încetinire adaptivă la 429 (gap ×1,6, plafon 4×+2 s), backoff exponențial, `Retry-After` respectat, timeout-uri proaspete pe retry. Tunabile prin **nume** de variabile: `RE_PIN_HOST_CONCURRENCY`, `RE_PIN_MIN_GAP_MS`, `RE_PIN_COINGECKO_GAP_MS`, `RE_PIN_REQUEST_TIMEOUT_MS`, `RE_PIN_RETRY_TIMEOUT_MS`, `RE_PIN_MAX_ATTEMPTS`, `RE_PIN_RETRY_PAUSE_MS`.
4. **Cheia CoinGecko** nu există local (`.env.example` e singurul referent) și nu e în Secret Manager; este env var simplu pe serviciul Cloud Run `market-scanner-360`. Runnerul `tmp/re-pin/run-with-key.sh` o citește din configul serviciului și o exportă în env, **fără s-o afișeze nicăieri** — verificat: 0 apariții ale valorii în artefacte, log sau docs.
5. **Artefacte**: `tmp/re-pin/dry-run-2026-09-25T23-58-40-440Z.md` (raportul tabelar complet), `…json` (248 KB, diff-ul per pin, inclusiv candidați și statistici upstream), `tmp/re-pin/dry-run-console.log` (log-ul rulării), `tmp/re-pin/pins-readonly-2026-09-25-22-30-04.json` (snapshot brut, 85 de pinuri la 22:30).

### Ce a fost nevoie ca rularea să fie validă (și ce am găsit pe pielea mea)

- Fără cheie, CoinGecko anonim raspunde cu hang/429: prima rulare a eșuat **87 din 89** de pinuri la identitate. Cheia de producție (demo, ~30 req/min) a schimbat complet tabloul: 2 835 cereri, **0 throttles, 0 retry-uri**.
- Am găsit și corectat în unealtă un bug real de guvernor: semnalul de timeout proaspăt era creat **înainte** de așteptarea din coada per-host, deci așteptarea consuma deadline-ul apelantului și fiecare probă „expira" fără ca remote-ul să fie vinovat. Acum deadline-ul se creează după intrarea în lane.
- `--apply` cere și `--yes` (verificat înainte de orice muncă), iar scrierile sunt planificate doar pentru pinuri `CHANGED` cu `candle.identityVerified === true`.

---

## 3. Pinurile care se schimbă (21)

Compact (detalii complete, per câmp, în artefactul `.md`/`.json`); vârsta `listingStart` în zile:

| coin | candle vechi → nou | tv vechi → nou | cauza principală |
|---|---|---|---|
| ALGO:algorand | mexc_spot 2655z → **binance_spot 2653z** | idem | tie-break de volum (binance_spot capătă volum) |
| APE:apecoin | bybit_spot 1654z → **binance_spot** | idem | tie-break de volum |
| ARB:arbitrum | bybit_spot 1283z → **binance_spot** | idem | tie-break de volum |
| DOT:polkadot | mexc_spot 2226z → **binance_spot 2230z** | idem | tie-break + listing real cu 4z mai vechi |
| ENA:ethena | mexc_spot → **binance_spot** | idem | tie-break de volum |
| FIL:filecoin | mexc_spot → **binance_spot** | idem | tie-break de volum |
| ICP:internet-computer | okx_spot 1965z → **binance_spot 1964z** | idem | OKX nu mai e umflat de `volCcy24h`×preț |
| KITE:kite-2 | mexc_spot → **binance_spot** | **coinbase → binance_spot** (listingStart 327z suspect fabricat → real) | volum + fix Coinbase trunchiat |
| MET:meteora | bybit_spot 338z → **okx_spot 337z** | idem | tie-break de volum (spot înainte de futures, apoi volum) |
| MINA:mina-protocol | mexc_spot 1943z → **okx_spot 1944z** | idem | tie-break de volum |
| NEAR:near | mexc_spot → **binance_spot** | idem | tie-break de volum |
| OP:optimism | bybit_spot 1579z → **binance_spot 1578z** | idem | tie-break + listing real cu 1z mai vechi |
| PENGU:pudgy-penguins | bybit_spot → **binance_spot** | idem | tie-break de volum |
| PYTH:pyth-network | mexc_spot 1041z → **okx_spot 1040z** | idem | tie-break de volum |
| SKY:sky | bybit_spot (neschimbat) | **kraken 721z (fabricat) → bybit_spot 387z** | fix Kraken ≥720 rânduri → „necunoscut" nu mai câștigă rankingul |
| STRK:starknet | bybit_spot → **binance_spot** | idem | tie-break de volum |
| SUI:sui | okx_spot 1242z → **binance_spot 1242z** | idem | OKX nu mai e umflat |
| TRUMP:official-trump | okx_spot → **binance_spot** | idem | OKX nu mai e umflat |
| UNI:uniswap | mexc_spot → **binance_spot** | idem | tie-break de volum |
| WLD:worldcoin-wld | bybit_spot → **binance_spot** | idem | tie-break de volum |
| ZK:zksync | bybit_spot → **binance_spot** | idem | tie-break de volum |

Două observații pentru operator:

- **Toate schimbările sunt între venue-uri spot reale, verificate prin identitate CoinGecko** (`identityVerified: true`), iar `candle` rămâne capabil de lumânări; nu există nicio schimbare care să elimine lumânările sau să scadă acoperirea istorică sub filtrul de coverage al resolverului.
- **2 pinuri aveau exact defectul fa1104a**: `SKY:sky` — `KRAKEN:SKYUSD` cu `listingStart = 2024-10-05` (= exact fereastra de 721 zile a Kraken, adică „azi−720z") și `KITE:kite-2` — `COINBASE:KITEUSD` cu `listingStart = 2025-11-03` (fereastră trunchiată Coinbase). După re-pin: bybit_spot 387z, respectiv binance_spot, ambele reale. Nu există niciun caz de `listingStart` care devine `null` la o sursă cu sondă deterministă (0 avertismente de acest tip în artefact).

### Volum 24h completat de fix (informativ, 32 de pinuri)

Pinuri neschimbate ca piață, dar al căror pin are `volume24hQuote: null` acolo unde build-ul corectat îl umple (semnătura „pin scris înainte de fix-ul de volum"): BTC (1,51 mld), ETH (632 mil), XRP (538 mil), ZEC (313 mil), DOGE (104 mil), BNB (102 mil), LINK (82 mil), XPL (61 mil), ADA (57 mil)… lista completă în artefact. Re-pinul le împrospătează și aceste câmpuri, fără să schimbe piața aleasă — de aceea nu sunt numărate ca „schimbate".

---

## 4. Pinurile neschimbate (67)

`AAVE:aave`, `ADA:cardano`, `ASTER:aster-2`, `AVAX:avalanche-2`, `AWE:stp-network`, `AXS:axie-infinity`, `BCH:bitcoin-cash`, `BFUSD:bfusd`, `BNB:binancecoin`, `BONK:bonk`, `BP:backpack`, `BTC:bitcoin`, `CAKE:pancakeswap-token`, `CC:canton-network`, `CHZ:chiliz`, `DOGE:dogecoin`, `DOLO:dolomite`, `ETC:ethereum-classic`, `ETH:ethereum`, `FET:fetch-ai`, `FLOKI:floki`, `GRAM:the-open-network`, `HBAR:hedera-hashgraph`, `HYPE:hyperliquid`, `IMX:immutable-x`, `JST:just`, `JUP:jupiter-exchange-solana`, `KAS:kaspa`, `LDO:lido-dao`, `LINK:chainlink`, `LIT:lighter`, `LTC:litecoin`, `MANA:decentraland`, `MNT:mantle`, `MORPHO:morpho`, `MPLX:metaplex`, `ONDO:ondo-finance`, `PAXG:pax-gold`, `PEPE:pepe`, `PLUME:plume`, `POL:polygon-ecosystem-token`, `PONS:pons`, `PUMP:pump-fun`, `QNT:quant-network`, `RAY:raydium`, `RENDER:render-token`, `RSR:reserve-rights-token`, `SAND:the-sandbox`, `SHIB:shiba-inu`, `SOL:solana`, `STABLE:stable-2`, `STX:blockstack`, `SYRUP:syrup`, `TAO:bittensor`, `TRX:tron`, `U:united-stables`, `VIRTUAL:virtual-protocol`, `VVV:venice-token`, `WIF:dogwifcoin`, `WLFI:world-liberty-financial`, `XAUT:tether-gold`, `XLM:stellar`, `XMR:monero`, `XPL:plasma`, `XRP:ripple`, `ZEC:zcash`, `ZRO:layerzero`.

Notă de corectitudine: `SYRUP:syrup` păstrează `KRAKEN:SYRUPUSD` cu `listingStart` de 682 zile — recalcularea confirmă valoarea (istoricul Kraken e mai scurt decât fereastra de 720 de rânduri, deci sonda fixată întoarce data reală, nu „necunoscut"). Nu e un caz de dată fabricată; de aceea nu apare la capitolul de mai sus.

---

## 5. Pin exclus implicit: `GP:graphite-protocol`

- Pinul are `candle` **și** `tv` pe `source: "xt_spot"`, `exchange: "XT.COM"`, `providerSymbol: "gp_usdt"`, `tvSymbol: "XTCOM:GPUSDT"`, `listingStart 2025-07-13`, scris 2026-09-25 18:24 UTC.
- `xt_spot` **nu există** în main@fa1104a, nici în commitul reviziei deployate (e8d8f2d) — `git grep` pe ambele arbori nu găsește sursa; ea există doar pe ramura `instinct-alert-gp-batch` (`packages/market-data/src/adapters/xt.ts`, resolver/probes modificate, commit 3f48d58/2417fad).
- Uneltele îl tratează ca `SKIPPED_UNSUPPORTED_SOURCE` și **nu îl propun la scriere**: un re-pin cu codul din main ar înlocui piața XT cu alta (ex. MEXC/KuCoin), ceea ce ar contrazice munca de identitate din ramura GP. Includerea lui cere decizie explicită: `--include-unsupported` (sau re-pin după ce ramura XT intră în main).

---

## 6. Plan de aplicare (documentat, NEexecutat)

Precondiții: revizia care include fa1104a (sau cel puțin build-ul de pachete cu fix-urile) e cea care va servi pinii; tabelul de mai sus verificat; fereastră fără trafic intens (scrierea nu întrerupe aplicația — pinii se citesc la rece per instanță).

```bash
# 1) dry-run reproductibil (read-only), cu cheia injectată din configul Cloud Run, fără a o afișa:
cd "/Users/marius/antigravity/Money Scanner"
zsh tmp/re-pin/run-with-key.sh                 # scrie artefact nou în tmp/re-pin/

# 2) aplicare (SCRIS în chart-market-resolutions) — doar după verificarea tabelului:
zsh tmp/re-pin/run-with-key.sh --apply --yes
#    variante: --only=BTC,ETH  --exclude=SKY  --pins-in-flight=3  --passes=1
```

Ce face calea de scriere (implementată în script, nerulată acum):

1. Scrie un backup complet al pinurilor citite în `tmp/re-pin/apply-backup-<timestamp>.json` **înainte** de prima scriere.
2. Pentru fiecare pin `CHANGED` (și doar pentru el) face `collection.doc("SIMBOL:coinGeckoId").set(rezolvareNouă, { merge: true })` — **aceeași formă de document** pe care o citește aplicația (`symbol`, `coinGeckoId`, `candle`, `tv`, `candidates`, `resolvedAt`), cu `merge` ca să nu șteargă eventuale câmpuri de audit/health adăugate de alte scrieri.
3. **Verificare prin read-back** după fiecare scriere (sursă candle + tvSymbol + `resolvedAt` trebuie să corespundă); eșecurile sunt raportate per cheie, nu ascunse.
4. Scrieri secvențiale cu pauză de 400 ms; la final raport `scrise / verificate / eșuate` + calea backupului.
5. **Rollback**: `apply-backup-*.json` conține documentele vechi complete; reintroducerea lor = același `set(..., { merge: true })` per cheie (manual sau cu un script de o linie din backup).

Așteptări la aplicare: ~12 minute pentru toate cele 89 de pinuri cu cheia CoinGecko injectată (măsurat: 10 min pentru dry-run-ul complet, 2 835 de cereri, 0 throttles); 21 de documente scrise, 68 neatinse (67 neschimbate + 1 sărit).

Caveats operaționale:

- Campania e un **snapshot**: pinurile noi create între dry-run și aplicare nu apar în tabel. Măsurat în timpul lucrului: colecția avea 85 de documente la 22:30 UTC, 89 la 23:48 (citite de campanie), iar la 00:05 UTC deja 90. Rulați dry-run-ul din nou imediat înainte de `--apply`; scriptul recalculează tot și e idempotent.
- Instanțele Cloud Run țin pinii în memorie per proces (`pinned`); pinii noi se citesc la următoarea instanță rece sau la restart. Un rollout după aplicare face tranziția instantanee, dar nu e obligatoriu.
- `GP:graphite-protocol` rămâne exclus implicit — de decis explicit dacă intră în val (vezi §5).

---

## 7. Riscuri / observații

- **Cea mai mare parte a schimbărilor e „cosmetică, dar vizibilă"**: 16 pinuri mută sursa de lumânări pe Binance spot. Datele rămân reale și verificate; riscul e operațional (un venue nou servind lumânările aplicației) și e exact ce ar fi produs resolverul corectat pentru un pin nou. Dacă se dorește păstrarea surselor actuale pentru anumite monede, folosiți `--exclude=SYM,SYM`.
- **Schimbările nu ating nimic ireversibil**: docul vechi rămâne în backup, iar pinul e doar un cache de rezoluție — nu conține date de utilizator.
- **Dependența de CoinGecko rămâne** pivotul identității: fără cheie, campania nu e utilizabilă (măsurat 87/89 eșecuri). Cheia e env var pe Cloud Run, nu secret — merită mutată în Secret Manager (`gcloud secrets`) pentru rotație/audit.
- **Nev verificat**: cine/cum a scris pinul XT pentru GP (revizia deployată nu poate produce `xt_spot`); comportamentul instanței de producție după aplicare (nu pot citi logurile Cloud Run de aici); dacă TradingView servește toate simbolurile noi `BINANCE:*USDT` (sunt simboluri standard).

---

## 8. Dovadă / fișiere

| Fișier | Rol |
|---|---|
| `apps/api/scripts/re-pin-chart-markets.ts` | unealta (dry-run implicit; `--apply --yes` scrie; guvernor de rate limiting; verificare de build; diff + sumar + artefacte) |
| `apps/api/scripts/re-pin-chart-markets.test.ts` | 25 de teste pe diff/format/planificare/flag-uri/anti-scriere-accidentală (`npx tsx --test`; `tsc --noEmit` curat) |
| `tmp/re-pin/dry-run-2026-09-25T23-58-40-440Z.md` | raportul tabelar complet al rulării reale |
| `tmp/re-pin/dry-run-2026-09-25T23-58-40-440Z.json` | diff per pin (valori vechi/noi, schimbări per câmp, statistici upstream, lista pinurilor neschimbate) |
| `tmp/re-pin/dry-run-console.log` | log-ul rulării (sumar, tabel, `EXIT=0`) |
| `tmp/re-pin/pins-readonly-2026-09-25-22-30-04.json` | snapshot brut al colecției (85 de pinuri la 22:30 UTC) |
| `tmp/re-pin/run-with-key.sh` | runner care injectează `COINGECKO_API_KEY` din configul Cloud Run fără să o afișeze |
| `tmp/re-pin/analyze-run.py`, `diagnose-upstream.mjs`, `dump-pins.mjs`, `probe-firestore.mjs` | unelte de analiză/diagnostic folosite în investigație |

Comanda exactă pentru aplicare ulterioară:

```bash
zsh tmp/re-pin/run-with-key.sh --apply --yes
```
