# Date de piață

Prețurile, lumânările și identitatea unui asset (pe ce bursă și pe ce pereche) vin din `packages/market-data`. Căutarea universală combină catalogul, Binance, CoinGecko și Yahoo.

## Încarcă

| Ce | Fișier |
| --- | --- |
| Serviciul comun, cache-uri, cotații | `packages/market-data/src/market-service.ts` |
| Adaptoarele de bursă | `packages/market-data/src/adapters/` |
| Alegerea bursei pentru grafic (resolver și pins) | `packages/market-data/src/chart-market-resolver.ts`, `chart-market-probes.ts` |
| Diagnoza resolverului | `packages/market-data/src/chart-market-diagnostics.ts`, `GET /api/chart-market-diagnostics` |
| Căutarea | `packages/shared/src/search/symbol-search.ts`, ruta `/search` din `apps/api/src/routes/scanner-routes.ts` |
| Monedele doar pe DEX | `apps/api/src/services/dex-market-data.ts` |
| Widgetul de valoare de piață | `docs/market-value-sources.md`, `apps/web/src/utils/market-value.ts` |
| Auditurile din septembrie | `docs/audits/` doar dacă sarcina e chiar despre ele |

## Hotărâri

- Prețul și variația pe 24h vin din Binance (`/ticker/24hr`) sau din Yahoo Finance v8. YTD se calculează din deschiderea de la 1 ianuarie, 00:00 UTC.
- Ticker-ul bulk Binance se folosește doar pentru assetul cu `chartMarket` gol sau `binance_spot`. O pereche care lipsește din bulk trece la endpointul pe simbol. Un refresh eșuat păstrează ultimul snapshot bun.
- Volumul OKX (`volCcy24h`) nu se mai înmulțește cu prețul. Probele Kraken și Coinbase întorc `null` când răspunsul e o fereastră mobilă, nu o dată de listare inventată.
- O pereche venită din căutare (`providerSymbol`, `exchange`, `instrumentType`, `quoteCurrency`) se confirmă pe lista live a bursei. Una neconfirmată primește 503, nu assetul altcuiva cu același ticker. O monedă doar pe DEX primește pagina agregată (`aggregated-price-only`).
- Pinii resolverului (`chart-market-resolutions` în Firestore): `set` este create-only, `replace` e tranzacțional. Un pin se reverifică după 7 zile. Unul mort se re-rezolvă, unul neverificabil rămâne.
- Căutarea trimite cheia CoinGecko. Lista Binance se scrie în cache doar la succes. Rândurile vechi au badge-ul „Date vechi • HH:MM”. Ordinea pe quote: `USDT > USDC > FDUSD > USD > BTC > ETH > EUR`. Un asset apare o singură dată per instrument.
- Contractele Solana se compară cu majuscule exacte, cele EVM fără. STONK (`stonk-3`) are rutare MEXC spot pe contractul exact.
- Metalele nu au market cap live. Cardurile arată „MC —”.
- Widgetul de valoare de piață folosește snapshoturi datate (CompaniesMarketCap, World Gold Council). Un snapshot expirat dă „indisponibil”, nu o cifră veche fără dată.
