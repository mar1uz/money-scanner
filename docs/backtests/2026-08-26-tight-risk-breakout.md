# Backtest — Weekly Trend + Daily Breakout–Retest cu risc limitat

Data rulării: 26 august 2026  
Ultima lumânare disponibilă: 25 august 2026

## Verdict

Strategia reduce foarte mult distanța stopului, dar **nu trece criteriul minim de robustețe** în forma testată. Varianta principală a produs profit factor 0,71 și expectancy -0,21R pe întregul eșantion. Nu trebuie activată în scanner ca alertă executabilă fără o reproiectare și un nou test out-of-sample.

## Date și univers

- Date Daily reale, ajustate pentru split/dividende la acțiuni, din Yahoo Finance.
- Date Daily spot USDT reale pentru crypto, din Binance Public API.
- 30 active: BTC, ETH, SOL, BNB, XRP, ADA, DOGE, LINK, AVAX, LTC, SPY, QQQ, AAPL, MSFT, NVDA, META, DELL, AMZN, GOOGL, TSLA, AMD, AVGO, JPM, V, MA, COST, WMT, LLY, XOM și NFLX.
- Indicatorii au minimum 300 de lumânări de încălzire înainte de prima tranzacție eligibilă.
- Istoricul acțiunilor începe pentru evaluare în noiembrie 2017; istoricul crypto diferă în funcție de data listării.

## Reguli testate

- MoneyLine Weekly Fast și Slow bullish.
- Închiderea Weekly peste SMA40 Weekly, cu SMA40 ascendentă pe opt săptămâni.
- Daily: close > SMA50 > SMA200, ambele medii ascendente, MoneyLine Fast și Slow bullish.
- Prețul la maximum 10% de maximul ultimelor 252 de zile.
- Contracție: ATR5 <= 80% din ATR20, ATR% în cele mai mici 40% valori din ultimul an și bază de 10 zile de maximum 5% pentru stocks / 8% pentru crypto.
- Breakout Daily peste maximul ultimelor 20 de zile, cu volum cel puțin egal cu media pe 20 zile.
- Retest bullish în următoarele maximum 10 lumânări; intrare la următorul open.
- Stop structural sub minimul retestului și minimum 1,25 ATR; setup respins peste 4% la stocks sau 6% la crypto.
- Target integral la 2R; time stop după cinci lumânări fără minimum +0,5R; invalidare la pierderea trendului.
- Risc de portofoliu 0,5% pe tranzacție, fără leverage.
- Cost pe fiecare sens: comision 0,075% și slippage 0,05%.
- Dacă stopul și ținta apar în aceeași lumânare Daily, simularea consideră conservator că stopul a fost primul.

## Rezultate principale — stop minimum 1,25 ATR

| Metrică | Eșantion complet | Ultimele 30% din istoric |
|---|---:|---:|
| Active testate | 30 | 30 |
| Breakouturi eligibile | 28 | 5 |
| Retesturi confirmate / tranzacții | 19 | 3 |
| Win rate | 36,8% | 66,7% |
| Profit factor | 0,71 | 3,13 |
| Expectancy | -0,21R | +0,85R |
| Stop median | 1,51% | 1,42% |
| Active profitabile | 3 | 2 |

Rezultatul pozitiv din ultimele 30% nu este suficient pentru validare: conține numai trei tranzacții, toate concentrate în SPY și MSFT.

## Verificare de sensibilitate — stop minimum 2 ATR

| Metrică | Eșantion complet | Ultimele 30% din istoric |
|---|---:|---:|
| Tranzacții | 19 | 3 |
| Win rate | 36,8% | 66,7% |
| Profit factor | 0,68 | 2,76 |
| Expectancy | -0,21R | +0,81R |
| Stop median | 1,93% | 1,82% |

Lărgirea stopului la 2 ATR nu repară rezultatul pe istoricul complet.

## Observații

- Versiunea inițială mai strictă — ATR5 <= 70% din ATR20, percentila ATR 30 și volum 1,5x la stocks / 1,3x la crypto — a produs zero tranzacții pe primul univers de 12 active. A fost respinsă ca impracticabilă, nu declarată performantă.
- Strategia practică a avut 19 tranzacții, dintre care zece au lovit stopul. Stopul mic rezolvă dimensiunea pierderii pe tranzacție, dar produce prea multe invalidări pentru ca expectancy să rămână pozitivă.
- Semnalele sunt concentrate în câteva active și perioade; rezultatele nu demonstrează robustețe cross-asset.
- Universul de companii mari actuale poate introduce survivorship bias. O validare de producție ar necesita un univers istoric point-in-time, evenimente earnings și mai multe tranzacții out-of-sample.

## Concluzie de produs

Nu se recomandă înlocuirea strategiei existente sau emiterea alertelor Telegram pe baza acestei variante. Următoarea iterație trebuie să schimbe logica intrării, nu doar multiplicatorul stopului. Candidatul rezonabil pentru următorul test este un pullback Daily controlat spre SMA20/SMA50 într-un trend Weekly confirmat, urmat de o lumânare de reversare și stop structural de maximum 4%, deoarece breakout–retestul testat aici a intrat prea des înaintea unei invalidări.

Script reproductibil: `scripts/backtest-tight-risk-breakout.mjs`.
