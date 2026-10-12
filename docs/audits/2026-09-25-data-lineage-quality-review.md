# Verificare de calitate: sursele cardurilor de piață

**Data:** 25 septembrie 2026  
**Domeniu:** surse API, transformări, fallback-uri și prospețimea informațiilor din cardurile Crypto, Stocks și Metals/Commodities.  
**Metodă:** audit static al rutelor, adaptoarelor, calculatoarelor și componentelor UI; evaluare locală deterministă a ramurii stock fără date Yahoo. Nu am declanșat scanări programate și nu am reconciliat fiecare instrument cu un feed live în această verificare.

## Constatări cu impact ridicat

### 1. Cardurile Stock Business Quality pot primi metrici sintetice și preț de rezervă

Scannerul combină Yahoo Finance cu o bază statică internă; lipsurile sunt completate apoi cu valori de sector și multipli impliciți. Exemplu: marje/growth/ROE/FCF sunt înlocuite cu proxy-uri, iar P/E, EV/EBITDA, P/FCF, FCF yield, dividend yield și buyback yield au valori standard. Dacă Yahoo nu returnează câmpurile, ele pot participa la scoruri ca și cum ar fi date măsurate. Prețul fallback este 100 USD.

În evaluarea locală pură a fallback-ului: 83/83 acțiuni au primit prețul de 100 USD, iar 61/83 au avut P/E 28x și FCF yield 3% din valorile implicite. Asta descrie ramura fără Yahoo, nu confirmă că snapshotul live actual folosește aceste valori.

Lista de surse afișează Yahoo și SEC EDGAR, dar fluxul observat citește Yahoo `quoteSummary`; nu am găsit un fetch SEC care să susțină atribuirea SEC la nivel de companie sau câmp. Baza statică nu atașează sursă, perioadă de raportare ori dată per câmp. Mai mult, testul existent cere cel puțin 4 surse, în timp ce evaluatorul întoarce 2.

Referințe: `apps/api/src/services/stock-business-quality-scanner.ts` (baza de date și fallback-urile, liniile 50–54, 814–821, 981–1024; lista de surse, 1379–1383), `apps/api/src/services/stock-business-quality-scanner.test.ts` (13).

### 2. Market cap pentru Stocks și Metals/Commodities nu este actualizat din quote-ul curent

În scanner, acțiunile folosesc capitalizări din catalogul intern, iar metalele și mărfurile ajung la `asset.marketCap` din același catalog; codul nu cere market cap Yahoo pentru tabel. Valorile date pentru XAU/XAG/OIL/COPPER sunt estimări catalogate (de exemplu 16,8T pentru XAU și 2,5T pentru OIL), fără dată sau formulă expusă. În heatmap, market cap controlează ordinea și mărimea tile-urilor, deci un preț live nu face și dimensiunea tile-ului live.

În plus, grupa Metals/Commodities include instrumente spot/futures, ETF-uri și acțiuni miniere/energetice. XAU și XAG sunt denumite spot, dar mapate la futures Yahoo `GC=F` și `SI=F`; OIL și COPPER sunt `CL=F` și `HG=F`. Aceste cotații sunt reale, dar nu sunt același instrument cu prețul spot afișat în denumire.

Referințe: `apps/api/src/services/app-state.ts` (2631–2638, 2717–2724), `packages/shared/src/constants/assets.ts` (1675–1720), `packages/market-data/src/adapters/public-stock.ts` (22–26).

### 3. Randamentul YTD al crypto este de fapt randament pe un an; intervalul 1M are și fallback-uri greșite

Endpoint-ul Crypto Bubbles pune câmpul CoinGecko `price_change_percentage_1y`/CoinPaprika `percent_change_1y` în proprietatea `changeYtd`. Heatmap-ul îl afișează ca `YTD`. Este randament pe ultimele 12 luni, nu de la începutul anului calendaristic.

În heatmap, când sursa crypto de rezervă este scannerul, iar pentru Stocks și Metals, butonul `1M` selectează rânduri `1w`, apoi preferă `changeYtd` pentru culoarea variației. Astfel `1M` poate afișa randamentul de la începutul anului în loc de randament lunar. Crypto pe sursa primară CoinGecko folosește 30d pentru culoarea 1M; comportamentul se schimbă odată cu fallback-ul.

Referințe: `apps/api/src/routes/market-routes.ts` (30–56, 71–83), `apps/web/src/components/CryptoHeatMapView.tsx` (160–200, 203–229, 643–655).

### 4. Unele valori macro sunt calculate sau afișate cu etichete înșelătoare

- `m2GrowthYoY` compară observația M2 curentă cu observația lunară precedentă, dar UI îl afișează ca procentul M2 fără să spună MoM; contractul îl numește YoY. Pentru YoY trebuie folosită observația de acum 12 luni.
- Când o serie FRED lipsește, funcțiile de calcul îi substituie valoarea `0`. API-ul enumeră seriile indisponibile, dar cardurile pot totuși afișa zero și îl pot folosi în regimul de piață.
- Cardul numește intervalul Fed, dar îl deduce din DFF ca `[DFF − 0,25; DFF]`; DFF este rata efectivă, nu sursa intervalului-țintă oficial.
- Butonul „Actualizează Indicatorii” face aceeași cerere GET; API-ul păstrează rezultatul 6 ore și răspunsul HTTP încă 5 minute, fără parametru de refresh manual.
- Data FOMC este hardcodată până în martie 2027. Pentru 25 septembrie 2026, următoarea dată afișată (27–28 octombrie) corespunde calendarului Fed; după datele codate, valoarea de rezervă rămâne „în așteptare”.

Referințe: `apps/api/src/routes/macro-routes.ts` (25–42, 55–58, 78–105, 109–117), `apps/web/src/components/USAStatusView.tsx` (164–183, 323–325). [Calendar FOMC oficial](https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm).

## Alte observații importante

- Cotațiile obișnuite sunt legate de surse reale: Binance/Bybit/OKX/Hyperliquid pentru crypto, Yahoo Finance pentru acțiuni și instrumentele mapate la Yahoo; Bubble crypto folosește CoinGecko, cu CoinPaprika ca rezervă. CoinGecko oferă market cap crypto actualizat, cu fallback la catalog pentru simbolurile fără rezultat.
- Cache-ul quote este 60 secunde. Lumânările sunt cache-uite între 1 minut și 6 ore după timeframe; la eroarea furnizorului codul întoarce lumânările vechi fără timestamp/flag de stale. Rândul scannerului returnează sursa și starea quote-ului, dar tabelul nu le afișează. Prin urmare un MoneyLine bazat pe candles vechi poate arăta normal.
- Alerts reține snapshotul la revenirea pe pagină; prețurile se reîncarcă prin butonul manual sau cât timp rulează o scanare. Până atunci, cardurile pot reflecta ultimul snapshot, nu o cotație proaspăt cerută la intrarea pe pagină.
- Crypto Top Alpha/Business Quality folosește market data CoinGecko, rezervă CoinPaprika, și TVL/fees/revenue/holders revenue DefiLlama. Raportul poate avea până la 26 de ore; refresh-ul manual are o limită de 2 minute. Criteriile Growth și Sustainable Revenue trec când există date comparabile/complete, nu neapărat când creșterea sau venitul sunt pozitive; metodologia explică acest lucru, dar scorul trebuie citit ca model/proxy, nu ca dovadă de valoare justă.
- Crypto Radar ia preț, market cap, volum și lichiditate din GeckoTerminal/DEX Screener și folosește verificări RugCheck/GoPlus când există date. „Comisioane estimate” sunt calculate fix ca 0,3% din volumul 24h, nu preluate ca venit real; etichetele buyback/revshare/utilitate sunt potriviri de cuvinte din nume/descriere. Scorul combină activitate, boosturi, social și penalizări de securitate, deci este euristic.
- Macro folosește FRED și U.S. Treasury și atașează datele observațiilor; pagina Intelligence afișează sursa, autorul și momentul publicării. Acestea au o proveniență mai bună decât leaderboard-urile fundamentale.
- News, narrative și ghidurile AI sunt rezumate/calificări text, nu câmpuri brute de preț. Pentru market intelligence, API-ul folosește știri/social și schimbări live de quote; unele texte Instinct persistă până la 36 ore.

## Acoperirea paginilor

| Pagina / suprafață | Ce alimentează cardurile | Încredere / caveat principal |
| --- | --- | --- |
| Scanner, Watchlist, Alerts, Narrative detail | Quotes + candles + MoneyLine; cap din catalog pentru stocks/metals | Quotes au sursă în API, dar sursa/stale nu sunt vizibile în tabel; candle fallback poate fi vechi; Alerts reține snapshotul |
| Crypto Bubbles | CoinGecko → CoinPaprika → scanner | 24h este direct; contractul `changeYtd` reprezintă 1y |
| Heat Map (crypto/stocks/metals) | Bubbles pentru crypto; scanner pentru stocks/metals | Market cap vechi la stocks/metals; fallback 1M poate deveni YTD |
| Top Alpha / Business Quality / AI Briefing | Crypto: CoinGecko/CoinPaprika + DefiLlama; stock: Yahoo + baza statică/proxy-uri | Metrici pe crypto sunt proxy-uri și snapshot până la 26h; datele stock au risc de valori de rezervă și proveniență insuficientă |
| Crypto Radar | GeckoTerminal, DEX Screener, RugCheck/GoPlus și social | Comisioane și tag-uri utilitare sunt estimate/deduse |
| Asset detail | Quote/candles din aceleași adaptoare; CoinGecko/DefiLlama pentru metrici on-chain crypto; știri/social | Data staleness e vizibilă pe pagina agregată CoinGecko/Paprika, mai puțin pe pagina bazată pe exchange |
| USA Status | FRED CSV + Treasury Debt to the Penny | Surse oficiale, dar M2 YoY, valori lipsă și „refresh” au problemele de mai sus |
| Intelligence | Știri și postări sociale cu surse/linkuri și date | Rezumatul AI/extractiv trebuie separat de măsurătorile brute |
| Backtest | Istoric candles de la furnizorii acelorași clase | Rezultatul este simulare pe date istorice, nu un feed live sau rezultat realizat |

## Ce aș corecta prima dată

1. Nu mai trimite în calcule fundamentale proxy-uri numerice ca și cum ar fi raportări. Păstrează `unknown` și scorurile parțiale; pentru fiecare câmp atașează sursă, perioadă, dată și indicator `live / curated / estimated`.
2. Actualizează market cap-ul equity/ETF din quote summary; pentru metale spot și futures separă tipul instrumentului și scoate „market cap” static din tile sizing sau etichetează-l explicit ca estimare catalogată.
3. Corectează `changeYtd` CoinGecko/CoinPaprika și calculul heatmap-ului 1M ca să folosească un randament de 30 de zile.
4. Pentru macro, calculează M2 YoY folosind `yearAgoValue`, propagă lipsa ca `null`, afișează sursa/dată de observație lângă câmp și adaugă bypass autentic pentru refresh.
5. Expune în UI proveniența și vechimea datelor și marchează candles fallback stale; separă clar „estimări” de volume și heuristici în Radar.
