# Audit tehnic: sănătate + vindecare pini, cost de rezoluție și observabilitate (chart-market resolver)

**Data:** 2026-09-26 · **Task:** valul 4 / Task B (V3 structural, partea de resolver)
**Baseline:** `fa1104a` · **Audit anterior:** `docs/audits/2026-09-25-chart-market-resolver-audit.md`
**Status:** implementat + testat local. **Fără commit, fără push, fără deploy.**

---

## 1. Rezumat executiv

Auditul din 2026-09-25 a lăsat trei probleme deschise în resolver:

1. **Pinii nu expiră niciodată.** `chart-market-resolutions` se scria `create()`-only, `RESOLUTION_TTL_MS` era cod mort în producție, `resolvedAt` se scria dar nu se folosea. Dacă un venue delista simbolul pinat, `getCandlesBefore` arunca `Older pages must use the pinned source` → **500 permanent, fără vindecare**.
2. **Prima rezoluție costa 40–53 cereri upstream / 9–14 s** (BTC 46, HYPE 53, SUI 52 în audit).
3. **Zero observabilitate:** `safe()` înghițea orice eroare de probă (un 429 CoinGecko devenea `null` silențios), iar registrul de pini nu putea fi inspectat din producție.

Toate trei sunt închise:

| Problemă | Soluție livrată | Dovadă |
|---|---|---|
| Pini imorți (delisting) | ciclu de sănătate + vindecare (`replace` tranzacțional) cu câmpuri de audit | 9 teste noi + harness de contract pe store (7/7) |
| Cost prima rezoluție | scurtcircuit în rezoluție: pruning după identitate, partajare de request-uri per rezoluție, oprirea probelor de preț la candidat decisiv | **BTC 48→38, HYPE 53→45, SUI 55→45** cereri (aceleași venue-uri alese) |
| Observabilitate | registru module-scoped + `GET /api/chart-market-diagnostics` (read-only, public ca `/api/health`) + tile în `SystemStatusView` | smoke e2e pe rută (200, JSON, fără secrete) |

Inventarul real de pini (citire read-only a colecției) arată **86 de documente, 0 cu câmpuri de audit**, toate scrise `create()`-only — exact constatarea C1 din audit. Din acest val, fiecare pin primește `audit` la prima verificare de listare.

---

## 2. Ce s-a livrat

| Fișier | Stare | Rol |
|---|---|---|
| `packages/market-data/src/chart-market-diagnostics.ts` | NOU | registru de diagnostic module-scoped (per rezoluție) + sumar sănătate pini |
| `packages/market-data/src/chart-market-diagnostics.test.ts` | NOU | 7 teste pentru registru |
| `packages/market-data/src/chart-market-resolution-cost.test.ts` | NOU | 6 teste pentru pruning / request sharing / oprirea probelor |
| `packages/market-data/src/chart-market-resolver-pin-health.test.ts` | NOU | 9 teste pentru sănătate + vindecare (store stub) |
| `packages/market-data/src/chart-market-resolver.ts` | RESCRIS | ciclu de sănătate pini, audit, scurtcircuite, apeluri instrumentate |
| `packages/market-data/src/chart-market-probes.ts` | RESCRIS | partajare de request-uri per rezoluție, `isCandidateStillListed`, instrumentare |
| `packages/market-data/src/chart-market-resolver.test.ts`, `chart-market-probes.test.ts` | ADAPTATE | fixture de coalescing + 2 teste noi (listing-check, ticker partajat) |
| `packages/market-data/src/index.ts` | MODIFICAT | exportă noul modul de diagnostic |
| `apps/api/src/services/app-state.ts` | MODIFICAT | store Firestore extins (`replace`/`mergeAudit`/`list`) + `listChartMarketPins()`; **doar partea de pin store** |
| `apps/api/src/routes/chart-market-diagnostics-routes.ts` | NOU | ruta read-only `GET /api/chart-market-diagnostics` |
| `apps/api/src/server.ts` | MODIFICAT | import + allowlist (fără auth, ca `/api/health`) + montare |
| `apps/web/src/components/SystemStatusView.tsx` | MODIFICAT | tile „Chart-Market Resolver” (fetch public, fără schimbări de auth) |
| `docs/audits/2026-09-26-resolver-health-observability.md` | NOU | acest document |

Nu s-au atins: `scanner-routes.ts`, `market-service.ts`, adapters (zona celuilalt agent), `HANDOFF.md`, auditurile existente.

---

## 3. Sănătatea și vindecarea pinilor

### 3.1 Stări de sănătate (`ChartMarketPinAudit`)

```ts
export interface ChartMarketPinAudit {
  lastCheckedAt?: number;      // ultima verificare față de lista live a venue-ului
  health?: 'healthy' | 'unverified' | 'dead';
  reason?: string;             // 'resolved', 'pair-listed', 'repinned-after-delisting', ...
  failedChecks?: number;       // verificări consecutive eșuate de la ultimul rezultat sănătos
  repinnedAt?: number;         // când un pin mort a fost înlocuit printr-o rezoluție proaspătă
  previousCandleSource?: AssetMarketDataSource | null;
}
```

Convenția e nouă (0 potriviri în cod la momentul implementării); documentele vechi rămân valide, `audit` fiind opțional.

### 3.2 Când se verifică un pin

Un pin servit din store este verificat **doar** dacă (`shouldCheckPin`):

- `lastCheckedAt` lipsă și `resolvedAt` mai vechi decât `pinMaxAgeMs` (implicit **7 zile**) — acoperă documentele legacy fără audit;
- pinul e `healthy`/`unverified` și `lastCheckedAt` mai vechi decât pragul (7 zile);
- pinul e `unverified` cu `failedChecks > 0` și au trecut mai mult de `pinRecheckMs` (implicit **1 h**) — backoff, ca un venit indisponibil să nu fie lovit la fiecare request;
- pinul e `dead` (ex.: verificarea a eșuat, dar rezoluția nouă nu a putut fi persistată) → reverificare la următorul request.

Verificarea = `isCandidateStillListed(pin.candle ?? pin.tv)`: o singură citire a listei live a venue-ului (listele de venue sunt cache-uite 15 min în adapters). Rezultate:

- `listing-check-unavailable`: sursa pinului nu e în enum-ul de venue-uri suportate (ex. pinul `xt_spot` existent în producție) → rămâne `unverified`, **nu** se vindecă orbește;
- `pair-listed` → `healthy`, audit scris cu `mergeAudit` (**doar** câmpul `audit`, restul documentului neatins);
- perechea lipsă din listă → `dead` → **re-rezolvare completă** și suprascriere.

### 3.3 Vindecarea (fluxul `dead`)

1. Re-rezoluție completă (aceeași funcție ca la pin miss) → rezoluție proaspătă;
2. audit: `health: 'healthy'`, `reason: 'repinned-after-delisting'`, `repinnedAt`, `previousCandleSource`;
3. scriere prin `replace(key, value, { resolvedAt })` — **tranzacție** care verifică că `resolvedAt` din document e încă cel validat de resolver; altfel scrie-ul e refuzat și se servește câștigătorul scris de cealaltă instanță (fără clobber pe vindecări concurente);
4. dacă rezoluția nouă eșuează sau `replace` nu există în store → pinul vechi **este totuși servit** (fără regresie), auditul rămâne `dead`/`unverified` și se reîncearcă mai târziu;
5. rezultatul întors e rezoluția nouă — `getCandlesBefore` nu mai primește `symbol`/sursă inexistentă → 500-ul permanent dispare la primul request după delistare.

Fluxul de mai sus nu schimbă alegerile pentru pinii vii: 20 de teste existente de rezoluție rămân verzi, iar `resolve()` întoarce exact rezoluția pinată când e sănătoasă.

### 3.4 Store-ul Firestore (`app-state.ts`)

`createChartMarketPinStore(db)` (exportat pentru testare) extinde contractul `ChartMarketPinStore`:

| Metodă | Semantică |
|---|---|
| `get` | citește documentul ca atare; documentele legacy fără `audit` rămân valide |
| `set` | **create-only** (neschimbat): cursa cross-instance are exact un câștigător |
| `replace` | tranzacție: scrie doar dacă `resolvedAt` stocat = `expected.resolvedAt`, altfel întoarce documentul existent |
| `mergeAudit` | `set({ audit }, { merge: true })` — nu atinge `candidates`, `resolvedAt` sau alte câmpuri |
| `list` | enumerare read-only pentru ruta de diagnostic |

Compatibilitate înapoi: documentele fără câmpuri de audit se citesc neschimbate; primul update scrie doar `audit`. Toate cele 86 de documente existente intră astfel în ciclul de sănătate fără migrare.

---

## 4. Reducerea costului primei rezoluții

### 4.1 Mecanisme

1. **Pruning după identitatea CoinGecko** — se probează doar venue-urile pe care CoinGecko Markets le atribuie coin-ului (`binance_futures`, Hyperliquid, Kraken etc. nu mai sunt întrebate pentru un coin care nu e listat acolo).
2. **Partajare de request-uri per rezoluție** (`share`): aceeași listă de venue / ticker 24h nu se mai cere de două ori în aceeași rezoluție (volum tie-break + verificare de preț folosesc un singur `ticker/24hr`).
3. **Fără kline „start-of-year”** — intervalul de la începutul anului (folosit doar pentru un euristic de vârstă) a fost eliminat; vârsta vine din `listingStart`, calculată o singură dată.
4. **Oprirea probelor de preț la candidat decisiv**: verificarea de preț rulează în ordinea preferinței; candidații cu preț cunoscut din volum sunt deja acoperiți, iar după ce candidatul minim are preț acceptat și `tvSymbol`, restul probelor de preț se opresc. Reject → fallback pe ceilalți candidați.

### 4.2 Măsurători before/after (harness local, `tmp/audit-resolver/measure-full.ts`)

Before = arbore pristine `git archive HEAD` (`tmp/resolver-wave4/before-tree`), after = arborele de lucru. Același harness, aceleași ținte, rulări în procese separate; „cereri” = doar în interiorul `resolve()` (numărate de wrapper-ul de `fetch`).

| Simbol | Before (cereri / durată) | After (cereri / durată) | Δ cereri | Venue ales before → after |
|---|---|---|---|---|
| BTC | 48 / 15.97 s | 38 / 13.62 s | **−10 (−21%)** | `binance_spot` → `binance_spot` ✓ |
| HYPE | 53 / 11.90 s | 45 / 9.09–9.75 s | **−8 (−15%)** | `mexc_spot` → `mexc_spot` ✓ |
| SUI | 55 / 11.50 s | 45 / 12.36 s | **−10 (−18%)** | `binance_spot` → `binance_spot` ✓ |

Cross-check cu auditul din 2026-09-25 (aceleași ținte, alt moment): BTC 46 / HYPE 53 / SUI 52 — măsurătorile „before” de aici (48/53/55) sunt în aceeași bandă.

Defalcare pe host (BTC): `fapi.binance.com` 2→0, `api.hyperliquid.xyz` 2→0, `api.kraken.com` 1→0, binance spot 5→3 (start-of-year + ticker duplicat), mexc 16→15, bybit 12→11, okx 2→1. SUI: fapi 2→0, HL 3→0, binance 5→3, bybit 19→18, okx 3→2, mexc 17→16.

### 4.3 Calea recurentă (pin hit) — măsurată

`tmp/resolver-wave4/pin-hit-cost.ts`: cu un pin valid + audit proaspăt în store, a doua rezoluție face **0 probe upstream** (store read + audit la intrare) și întoarce exact aceeași rezoluție. Costul de 45–48 de cereri se plătește o singură dată per coin (pin miss) sau la vindecare/delistare.

### 4.4 Observații de măsurare

- Endpoint-ul CoinGecko anonim e limitat (8 cereri paralele → 429): o rulare pe 3 simboluri poate da 429 pe al treilea simbol (măsurat: BTC throttled într-o rulare, SUI throttled în alta). Sub noul registru, aceste cazuri sunt **vizibile** (`failuresBySource`, `lastFailure.status=429`) în loc să fie `null` tăcut.
- Al doilea eșantion SUI „cold” (proces separat, fără cache-urile de liste gate/bitget/kucoin din rezoluțiile anterioare) = 51 cereri față de 55 (before, cache cald) — varianța de ±3 cereri e cache-ul de 15 min al listelor de venue, nu regresie.

---

## 5. Observabilitate

### 5.1 Registru (`chart-market-diagnostics.ts`)

Scope per rezoluție (`beginResolutionScope` / `runInResolutionScope` / `currentResolutionScope`), agregare în `finalizeResolution`, plus contoare pe probe:

- per rezoluție: `coinId`, `symbol`, `durationMs`, `probeCalls`, `probeCallsBySource`, `chosenCandle`, `chosenTv`, `failures[]`, `outcome` (`resolved` / `pin-hit` / `healed` / `unresolved`), `pinState` (`miss`/`hit`/`stale`/`dead`);
- global: `resolutions`, `pinHits`, `heals`, `failuresTotal`, `failuresBySource`, `observationsBySource`, `lastFailure`, `recentResolutions` (inel de 50), sumar de sănătate pini (`pinHealth.byHealth`, `checked`, `withAudit`);
- `safe()` nu mai înghite nimic: fiecare probă eșuată trece prin `recordProbeFailure` (sursă, probă, mesaj, status HTTP parsat, timp) și apare în `failures[]` al rezoluției + contoarele globale. Rezolvarea în sine rămâne tolerantă la erori (o probă picată nu blochează rezoluția), dar nu mai e silențioasă.

### 5.2 Ruta `GET /api/chart-market-diagnostics`

`apps/api/src/routes/chart-market-diagnostics-routes.ts` — read-only, fără auth (allowlist în `server.ts`, aceeași postură ca `/api/health`). Payload (smoke e2e, port efemer, registru populat cu o rezoluție throttled):

```json
{
  "service": "market-scanner-360-api",
  "route": "chart-market-diagnostics",
  "timestamp": 1790376636359,
  "resolver": {
    "resolutions": 1, "pinHits": 0, "heals": 0, "failuresTotal": 1,
    "failuresBySource": { "binance_spot": 1 },
    "lastFailure": { "source": "binance_spot", "probe": "isOnBinanceSpot", "message": "HTTP 429", "status": 429, "at": 1790376636039 },
    "recentResolutions": [{ "outcome": "unresolved", "probeCalls": 2, "failures": ["..."] }],
    "pinHealth": { "byHealth": {}, "checked": 0, "withAudit": 0 }
  },
  "pins": {
    "supported": true, "count": 86, "byHealth": { "unobserved": 86 },
    "oldestCheckAt": 1790323029471, "entries": [ { "key": "...", "symbol": "...", "audit": null, "candleSource": "mexc_spot" } ]
  }
}
```

Fără secrete și fără date de utilizator: simboluri, ID-uri CoinGecko, hostname-uri upstream, nume de probe, statusuri HTTP, timestamp-uri de audit. `pins.supported=false` (nu 500) dacă Firestore nu e disponibil; pinii ne-sănătoși sunt primi în listă (`dead` → `unverified` → `unobserved` → `healthy`).

### 5.3 Tile UI (`SystemStatusView`)

Tile mic „Chart-Market Resolver” cu `Resolutions / pin hits / heals`, `Upstream failures` (+ ultima probă picată) și `Pins` (total, dead, unverified). Fetch public, fără modificări de auth; se reîncarcă o dată cu butonul de refresh existent.

---

## 6. Teste și verificări

| Verificare | Rezultat |
|---|---|
| `npx tsc --noEmit` — `packages/market-data` | **curat** |
| `npx tsc --noEmit` — `apps/api` | **curat** |
| `npx tsc --noEmit` — `apps/web` + `vite build` | **curat** / build ✓ 2.56 s |
| `npx tsx --test src/*.test.ts src/adapters/*.test.ts` (market-data) | **79/79 pass** (48 la HEAD; 24 adăugate de acest val, 7 de testul celuilalt agent, toate verzi) |
| Teste noi: diagnostic 7, cost 6, sănătate pini 9, probes +2 | toate verzi |
| Smoke rută (`tmp/resolver-wave4/smoke-diagnostics-route.ts`) | 200, JSON complet, 0 chei suspecte |
| Contract store Firestore (`tmp/resolver-wave4/pin-store-contract.ts`, fake Firestore) | **7/7** (legacy read, merge doar `audit`, guard tranzacțional stale, scriere câștigătoare, replace-pe-document-lipsă, `set` create-only, `list`) |
| Cost pin hit (`tmp/resolver-wave4/pin-hit-cost.ts`) | pin miss 10 probe / pin hit **0 probe**, aceeași rezoluție |
| `apps/api` suită existentă | 240/241 — eșecul „Stock Business Quality & Profitability Scanner” **pre-existent** (reprodus identic pe arbore pristine `HEAD`, 5/6) |

---

## 7. Inventar de pini în producție (citire read-only, 2026-09-26)

`tmp/resolver-wave4/pin-inventory.ts` (doar citire, fără scrieri):

- **86 documente** (89 la o a doua citire ~30 min mai târziu — colecția crește continuu, toate create `create()`-only de build-ul încă nedeplyat), toate cu `candle` + `tv`, **0 cu `audit`** → confirmă C1 (create-only, fără sănătate);
- surse candle: `mexc_spot` 34, `binance_spot` 27, `bybit_spot` 18, `okx_spot` 6, **`xt_spot` 1** (sursă inexistentă în build-ul curent);
- TradingView: MEXC 32, BINANCE 27, BYBIT 17, XTCOM 1, OKX 6, COINBASE 1, KRAKEN 2;
- toate `resolvedAt` în ultimele ~24 h (07:57–22:41, 2026-09-25), 0 pini cu `listingStart` necunoscut, 0 pini non-candle-capable.

Pinul `xt_spot` este exact cazul de „verificare indisponibilă”: rămâne `unverified`, nu se vindecă orbește, iar ruta de diagnostic îl arată.

---

## 8. Limite cunoscute și follow-up

1. **`getCandlesBefore` rămâne în afara scopului** (market-service.ts, alt agent): 500-ul `Older pages must use the pinned source` nu mai poate apărea *permanent* (pinul se vindecă), dar mesajul/UX-ul rutei de candele nu s-a schimbat.
2. **Verificarea de sănătate rulează pe calea request-ului** (o citire de listă, cache 15 min): cost mic, dar sub vârf poate adăuga o latență la primul request după prag. Alternativa (job programat) e un follow-up natural.
3. **Pinii cu surse necunoscute** (`xt_spot`) rămân `unverified` — corect, dar necesită o decizie de produs (re-pin sau păstrare).
4. **Pragurile sunt implicite 7 zile / 1 h**, injectabile prin `new ChartMarketResolver(deps, { pinMaxAgeMs, pinRecheckMs })`; nu sunt încă expuse în configurație.
5. **Fără test pe emulator Firestore** (emulatorul nu e instalat local, iar scrierile în producție sunt interzise): semantica store-ului e verificată cu un fake Firestore structural + revizuire de tipuri; un test pe emulator rămâne de făcut în CI.
6. **Ruta de diagnostic e publică** (ca `/api/health`): expune doar date operaționale publice; dacă se dorește restrângere, se mută în spatele `authMiddleware` (o linie).

---

## 9. Anexă — artefacte și reproducere

Artefacte (nu se comit): `tmp/resolver-wave4/`

| Artefact | Ce face |
|---|---|
| `before-tree/` | arbore pristine `git archive HEAD` pentru măsurători before |
| `after-run.log`, `after-run2.log`, `after-sui.log`, `before-tree/before-run.log` | măsurători brute before/after (BTC/HYPE/SUI) |
| `smoke-diagnostics-route.ts` | smoke e2e pe ruta nouă (express real, registru populat) |
| `pin-store-contract.ts` | contract store Firestore cu fake in-memory (7 verificări) |
| `pin-hit-cost.ts` | costul căii recurente (pin hit) |
| `pin-inventory.ts` | inventar read-only al pinilor din Firestore |

Reproducere măsurători:

```bash
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
# after (arborele de lucru)
cd tmp/audit-resolver
AUDIT_GAP_MS=40000 AUDIT_TARGETS='[{"symbol":"BTC","coinId":"bitcoin"},{"symbol":"HYPE","coinId":"hyperliquid"},{"symbol":"SUI","coinId":"sui"}]' npx tsx measure-full.ts
# before (arbore pristine)
cd ../resolver-wave4/before-tree/tmp/audit-resolver
AUDIT_GAP_MS=40000 AUDIT_TARGETS='[...aceleași...]' npx tsx measure-full.ts
```

Teste:

```bash
cd packages/market-data && npx tsx --test src/*.test.ts src/adapters/*.test.ts
cd apps/api && npx tsx --test src/**/*.test.ts
```

---

## 10. Verificare încrucișată (pentru un recenzent independent)

1. `git diff fa1104a -- packages/market-data/src/chart-market-resolver.ts`: verifică că `resolve()` întoarce pinul neatins când e sănătos și că `shouldCheckPin` respectă cele patru condiții (secțiunea 3.2).
2. `apps/api/src/services/app-state.ts`: `createChartMarketPinStore` — `replace` scrie doar sub tranzacție cu guard pe `resolvedAt`; `mergeAudit` trimite exact `{ audit }` cu `merge: true`.
3. Rulați `tmp/resolver-wave4/pin-store-contract.ts` și `smoke-diagnostics-route.ts` — trebuie să treacă fără scrieri în Firestore.
4. Confruntați tabelul din secțiunea 4.2 cu logurile din `tmp/resolver-wave4/` (aceleași comenzi, reproductibile).
5. Verificați că niciun pin existent nu-și schimbă sursa în urma acestui val: testele de rezoluție (20) + `chart-market-resolution-cost.test.ts` (6) acoperă alegerile de venue.
