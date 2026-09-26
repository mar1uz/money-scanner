# PONS `/assets/:symbol` 500 + rutarea pe perechea exactă (2026-09-26)

Audit al valului 4, zona API/market-data. Nu s-a făcut commit, push sau deploy.
HEAD de referință la începutul lucrului: `fa1104a` (local, nedeployat).

## 1. Ce era rupt

Trei teste pre-existente din `apps/api/src/services/crypto-market-profile.test.ts`
picau cu `Unexpected HTTP 500` aruncat din catch-ul rutei `/assets/:symbol`:

| test | simptom |
| --- | --- |
| 8 — PONS fără lumânări Binance | 500 (TypeError) |
| 9 — BTC din Bubbles păstrează lumânările de bursă | 500 (TypeError) |
| 10 — POPCAT: paritate scanner din lista live | 500 (TypeError) |

Trei cauze reale în codul de producție, nu în teste:

1. **Apeluri necondiționate către o suprafață AppState mai săracă.**
   `appState.marketData.resolveChartMarket(...).catch(() => null)` (fostă linia ~760)
   și `getTopCryptoAssets(150).catch(() => [])` (fostă linia ~754) evaluau
   apelul înainte de `.catch`: dacă metoda lipsea, `TypeError` sărea sincron și
   ajungea în catch-ul rutei → 500. Un AppState degradat (sau un test care
   injectează doar suprafața de care are nevoie) nu trebuie să dărâme pagina.
2. **Catalogul fără ID exact nu mai putea autentifica un deep link cu ID exact.**
   Din `b2c2f06`, `matchesCatalog` compara strict `catalog.coinGeckoId === coinGeckoId`;
   pentru BTC (intrare de catalog fără `coinGeckoId`) rezultatul era `false`,
   deci se intra pe verificările live (care la rândul lor chemau
   `getTopCryptoAssets`) — de aici (9). Înainte de `b2c2f06` legătura se făcea
   pe numele providerului, care este singura identitate pe care o poartă o
   intrare de catalog fără ID.
3. **Fail-closed prea larg (regresia din `afddc93`).** Ramura
   `if (!matchesLive && !verifiedMarket?.candle) { if (coinGeckoId) 503 ... }`
   refuza cu 503 ORICE monedă cu ID exact fără piață de bursă verificată — inclusiv
   monedele DEX-only (PONS), care nu au nicio piață de bursă de arătat. Testul 8
   cere pagina agregată onestă, iar badge-ul web (`UnverifiedCandlesBadge`,
   „Indexat · fără lumânări verificate") există exact pentru acest caz.

## 2. Verdictul de identitate, reconstruit (scanner-routes.ts)

Gate-ul are acum trei ieșiri explicite, toate documentate în cod:

- **identitate legată** → ruta de bursă (lumânări + Money Line);
- **există venue candidat dar identitatea nu se leagă de el** → `503`
  (fail-closed păstrat);
- **niciun venue verificabil** → pagina agregată onestă,
  `dataAvailability: 'aggregated-price-only'`.

Regulile de legare:

- **Catalog**: o intrare care are propriul ID exact trebuie să-l confirme (HYPE);
  o intrare fără ID este legată de numele providerului rezolvat (BTC).
- **Lista live de bursă** (`getTopCryptoAssets`, doar monede cu venue de
  lumânări): rândul poartă propriul `coinGeckoId` (din CoinGecko), deci
  - ID egal ⇒ identitate stabilită, chiar și când `resolve` a luat 429;
  - ID diferit ⇒ refuz;
  - rând fără ID ⇒ leagă numele providerului (contractul testului 10).
- **Chart resolver** (`resolveChartMarket`), doar când catalogul și lista live
  nu au decis: `candle` ⇒ identitate; rezoluție fără candle ⇒ `503`; `null`
  (nicio piață verificată / suport indisponibil) ⇒ pagina agregată. O eroare de
  tip „Chart market pin" este re-aruncată, deci rămâne 503 prin catch-ul rutei.
- **Fără ID exact** (deep link legacy): comportament neschimbat, byte pentru byte.

Toate citirile de suprafață (`getTopCryptoAssets`, `resolveChartMarket`) sunt
acum leneșe și tolerate: lipsa metodei sau o eroare de provider degradează
verdictul, nu pagina.

### Quote-ul: fallback agregat vs. refuz de identitate

`catch`-ul din jurul `getPriceQuote` verifica înainte `assetInfo.coinGeckoId`
(introdus de `afddc93`); acest lucru transforma în 500 și un eșec de venue
oarecare (`Binance Invalid symbol`) pentru monede al căror ID a fost doar
*descoperit* de rută (PONS: `resolveCandidates` îl atașa în timpul cererii →
testul 8, iterația 2). Acum:

- mesajele de fail-closed de identitate (`No identity-verified candle market`,
  `Chart market pin`) sunt re-aruncate → 503 explicit;
- orice alt eșec pe crypto spot păstrează fallback-ul agregat dinainte de
  `afddc93` (payload marcat `aggregated-price-only`, deci badge-ul web apare —
  nu este o degradare silențioasă).

## 3. F23 — scriptul `test` din `apps/api/package.json`

Înainte:

```
node --test dist/**/*.test.js || tsx --test src/**/*.test.ts
```

Rula întâi suita **veche din `dist`** (compilată, deseori în urmă cu multe
commit-uri) și doar dacă aceasta eșua ajungea la surse — cu rezultate care nu
descriau codul curent. Acum:

```
tsx --test src/**/*.test.ts
```

Rulează exclusiv suitele din surse (`src/routes`, `src/services`), fără `dist`.
`src/index.test.ts` (suită de integrare care cere upstream-uri live și
Firebase) rămâne în afara scriptului, exact ca înainte: sub `sh`, `**` se
extinde la `src/*/*.test.ts`. Dovezi în raport.

## 4. Rutarea pe perechea exactă (F6/B3/B4) — plumbing aditiv

Perechea confirmată de gate este acum transmisă mai departe:

- **`packages/market-data/src/adapters/binance.ts`**: `fetchPairCandles(pair, …)`
  și `fetchPairCandlesBefore(pair, …)` folosesc perechea calificată verbatim
  (`BTCEUR`, `CAKEBTC`, `BTCUSDT`). `fetchCandles`/`fetchCandlesBefore` rămân
  API-ul de bază (`${symbol}USDT`).
  - **Bug real reparat pe drum:** ramura `binance_spot` din `market-service`
    chema `fetchCandles(chartMarket.providerSymbol)` iar resolverul livrează
    `providerSymbol` deja calificat (`GRASSUSDT`) → se cerea `GRASSUSDTUSDT`
    (400 de la Binance → grafic gol). Acum ambele ramuri folosesc
    `fetchPairCandles*`, perechea calificată o singură dată.
- **`packages/market-data/src/market-service.ts`**: parametru opțional nou
  `venuePair?: VenuePairRouting` pe `getCandles` și `getCandlesBefore` (ultimul
  argument, deci apelanții existenți nu se schimbă). Reguli:
  - doar perechi Binance spot sunt acceptate (același set pe care îl verifică
    gate-ul); orice altceva (alt venue, alt instrument, simbol care nu poate fi
    perechea acelui base) este ignorat → comportament legacy identic;
  - cheia de cache include perechea (`…_pair_BTCEUR`), deci `BTCUSDT` și
    `BTCEUR` nu se pot servi una din cealaltă;
  - o pereche confirmată **este** piața verificată: resolverul nu mai este
    consultat și fail-closed-ul lui nu poate veta o piață confirmată de venue;
  - fără pereche ⇒ comportament identic cu înainte (inclusiv fail-closed-ul
    HYPE, testat în continuare în `index.test.ts`).
- **`apps/api/src/routes/scanner-routes.ts`**: `routedVenuePair` se construiește
  din verdictul `confirmed` și se transmite la `getCandles` (toate cele 6
  timeframe-uri) și la `/assets/:symbol/candles` → `getCandlesBefore` (paginile
  vechi ale graficului citesc aceeași piață; o pereche neconfirmabilă este
  refuzată cu 503 și acolo, nu se rezolvă ticker-ul în spate).

### Unitățile de preț — decizia explicită

**Lumânările sunt rutate, quote-ul rămâne canonic (USDT).** Motivația: o serie
BTCEUR este cotată în EUR, CAKEBTC în BTC; dacă am ruta și quote-ul, jumătate
din UI (care etichetează prețul capului de pagină ca USDT/$) ar afișa o valoare
EUR etichetată USDT — exact ce regulamentul interzice. Rămânând quote-ul pe
perechea canonică, nimic din payload nu poartă o valoare neetichetată corect,
iar consumatorul primește marcajul onest al seriei de lumânări:

```json
"candlePair": { "providerSymbol": "BTCEUR", "exchange": "BINANCE",
                "instrumentType": "spot", "quoteCurrency": "EUR" }
```

Câmpul este prezent **doar** pentru perechi cotate în altceva decât USDT (o
pereche USDT păstrează payload-ul byte pentru byte, contractul testului
„verification only: the payload is unchanged"). Money Line calculat pe seria în
EUR este invariant la scală — semnalele nu depind de unitatea de cotare.

## 5. Teste

Noi:

- `apps/api/src/routes/scanner-routes-identity-verdicts.test.ts` (8) — toate
  cele trei verdicte + cele patru căi de dovadă (catalog cu/fără ID, listă live
  cu/fără ID, chart resolver) + fallback-ul legacy + fail-closed-ul market-data.
- `apps/api/src/routes/scanner-routes-pair-routing.test.ts` (4) — perechea
  confirmată ajunge în `getCandles`/`getCandlesBefore`, quote canonic, marcajul
  `candlePair`, refuzul 503 pe paginare.
- `packages/market-data/src/market-service-venue-pair.test.ts` (7) — pereche
  verbatim, canonic fără pereche, separarea cache-ului, perechi inacceptabile
  ignorate, fail-closed ocolit doar de o pereche confirmată, pereche calificată
  o singură dată pentru `binance_spot`.

Suplimentar, un test nou din zona mea a prins o **eroare de ordine în patch-ul
propriu** (ramura rezolvării prin chart resolver era anulată de `if (!matchesLive)`
de la finalul blocului), reparată înainte de raport.

Neschimbate și verzi: `crypto-market-profile.test.ts` 13/13 (inclusiv testele 8,
9, 10 țintă), `scanner-routes-asset-pair.test.ts` 6/6 (fail-closed-ul pe perechi
nu se degradează), `scanner-routes-search.test.ts` 7/7 (numărul de teste din
fișier la data lucrului), `scanner-routes-search-cold.test.ts` 1/1,
`services/symbol-search.test.ts` 9/9.

Dovezi rulate (exact):

| comandă | rezultat |
| --- | --- |
| `npx tsx --test src/services/crypto-market-profile.test.ts` (apps/api) | 13/13 pass, 0 fail |
| `npx tsx --test src/routes/scanner-routes-asset-pair.test.ts` | 6/6 pass |
| `npx tsx --test src/routes/scanner-routes-search.test.ts` | 7/7 pass |
| `npx tsx --test src/routes/scanner-routes-search-cold.test.ts` | 1/1 pass |
| `npx tsx --test src/services/symbol-search.test.ts` | 9/9 pass |
| `npx tsx --test src/routes/scanner-routes-identity-verdicts.test.ts` | 8/8 pass |
| `npx tsx --test src/routes/scanner-routes-pair-routing.test.ts` | 4/4 pass |
| `npx tsx --test src/*.test.ts src/*/*.test.ts` (packages/market-data) | 79/79 pass, 9 suite-uri |
| `npx tsc --noEmit -p apps/api/tsconfig.json` | curat |
| `npx tsc --noEmit -p packages/market-data/tsconfig.json` | curat |
| `npm test` (apps/api) după F23 | 241 teste / 240 pass / 1 fail, 0 referințe la `dist` |

Singurul eșec al `npm test` este `stock-business-quality-scanner.test.ts` →
`scans stock catalog assets and computes 6 fundamental criteria` cu
`Expected at least 4 verified sources`: test de rețea live (Yahoo Finance) care
cade pe rate-limit în acest mediu. Este în afara zonei acestui val (nu atinge
rutele de scanner sau market-data) și nu are legătură cu modificările de aici.
`src/index.test.ts` (integrare, upstream-uri live + Firebase) rămâne exclus din
script, exact ca înainte.

## 6. Limite cunoscute

- O monedă de bursă (ex. mid-cap pe Binance) aflată **în afara** ferestrei live
  (`getTopCryptoAssets`), fără intrare de catalog și cu CoinGecko indisponibil
  pentru verificare, dar fără parametri de pereche în URL, primește pagina
  agregată (onestă, cu badge) în loc de 503, pentru că nu există nicio dovadă
  de venue disponibilă la momentul respectiv. Când click-ul poartă perechea
  (F6/B4), refuzul 503 se aplică corect. Cazul se închide complet când
  `chart-market-probes` va distinge eroarea de provider de un răspuns negativ
  verificat (recomandarea R4 din auditul resolverului, în lucru separat).
- Rutarea pe pereche acoperă Binance spot (singurul venue pe care gate-ul îl
  poate verifica live). Alte venue-uri rămân pe comportamentul legacy.
