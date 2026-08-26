# Cercetare multi-strategie — recomandare pentru setupuri Daily cu risc limitat

Data rulării: 26 august 2026  
Ultima lumânare disponibilă: 25 august 2026

## Verdict

Strategia recomandată este **Weekly Trend + Donchian 55/20**, exclusiv pentru acțiuni și ETF-uri lichide. Strategia a rămas pozitivă atât în calibrare, cât și în ultimele 30% din istoric păstrate separat. Nu se recomandă pentru crypto, unde validarea a fost negativă.

## Metodă

- 30 active: 20 acțiuni/ETF-uri și 10 criptomonede.
- Date Daily ajustate pentru split/dividende din Yahoo Finance și date spot USDT din Binance.
- Minimum 300 lumânări de încălzire pentru fiecare activ.
- Primii 70% din fiecare istoric au fost utilizați pentru compararea strategiilor.
- Ultimii 30% au rămas nedeschiși până la alegerea candidatului Donchian.
- Risc de portofoliu: 0,5% pe tranzacție, fără leverage.
- Comision 0,075% și slippage 0,05% pe fiecare sens.
- Stopul are prioritate dacă ordinea intraday a stopului și a unei alte ieșiri nu poate fi cunoscută.
- Setupurile cu stop peste 4% la stocks sau 6% la crypto sunt respinse.

## Strategii comparate în calibrare

| Strategie | Trades | Win rate | Profit factor | Expectancy | Stop median |
|---|---:|---:|---:|---:|---:|
| SMA20 Pullback Reversal | 120 | 40,8% | 1,30 | +0,16R | 2,88% |
| SMA50 Reclaim | 13 | 23,1% | 1,01 | 0,00R | 3,29% |
| NR7 Breakout | 236 | 35,6% | 0,94 | -0,04R | 2,62% |
| 52W High + 3-Day Pullback | 171 | 43,3% | 1,34 | +0,21R | 2,90% |
| **Donchian 55/20** | **141** | **43,3%** | **1,80** | **+0,45R** | **3,22%** |

Donchian 55/20 a fost ales înainte de deschiderea holdout-ului deoarece a avut cea mai bună combinație de profit factor, expectancy, număr de tranzacții și distribuție între active.

## Rezultatul Donchian pentru stocks/ETF-uri

| Metrică | Calibrare 70% | Holdout 30% |
|---|---:|---:|
| Active | 20 | 20 |
| Active cu tranzacții | 17 | 14 |
| Active profitabile | 12 | 10 |
| Tranzacții | 140 | 61 |
| Win rate | 42,86% | 40,98% |
| Profit factor | 1,79 | 1,55 |
| Expectancy | +0,45R | +0,31R |
| Stop median | 3,22% | 3,03% |
| Randament mediu per activ la risc 0,5% | +1,59% | +0,47% |
| Max drawdown mediu per activ | 1,32% | 0,66% |

Aceste randamente reprezintă simulări independente per activ și nu randamentul unui portofoliu care gestionează simultan toate pozițiile.

## Crypto — respins

În holdout, crypto a produs numai cinci tranzacții: win rate 20%, profit factor 0,03, expectancy -0,77R și stop median 5,25%. Strategia nu trebuie activată pe crypto pe baza acestor rezultate.

## Reguli recomandate

### Regim Weekly

- MoneyLine Fast și Slow Weekly sunt bullish.
- Închiderea Weekly este peste SMA40 Weekly.
- SMA40 Weekly este mai sus decât cu opt săptămâni înainte.

### Filtru Daily

- Close > SMA200.
- SMA50 > SMA200.
- SMA50 și SMA200 sunt mai sus decât cu 20 de lumânări Daily înainte.
- Randamentul ultimelor 252 de sesiuni este pozitiv.
- ATR14% nu se află în cele mai volatile 30% valori din ultimul an.
- MoneyLine Fast Daily este bullish.

### Trigger și execuție

- O lumânare Daily închisă termină peste cel mai mare high al precedentelor 55 de sesiuni.
- Intrarea LONG se face la următorul open Daily.
- Setupul se anulează dacă deschiderea este cu mai mult de 1 ATR peste închiderea semnalului.

### Stop și mărimea poziției

- Stop structural: sub cel mai mic low al ultimelor două lumânări minus 0,1 ATR.
- Stop de volatilitate: entry - 2 ATR.
- Se folosește nivelul mai larg dintre cele două pentru a evita un stop aflat în zgomotul normal.
- Setupul se respinge dacă distanța stopului depășește 4%.
- Cantitatea poziției se calculează astfel încât pierderea la stop să fie maximum 0,5% din portofoliu.

### Ieșire

- După fiecare închidere Daily, stopul urcă la maximul dintre stopul existent și cel mai mic low al ultimelor 20 de sesiuni.
- Noul trailing stop devine activ în sesiunea următoare; nu este aplicat retroactiv.
- Dacă regimul Weekly nu mai este bullish, ieșirea se execută la următorul open.
- Strategia nu are take-profit fix. `2R` poate fi afișat ca milestone informativ, dar închiderea automată la 2R ar fi o strategie diferită și nu este susținută de acest backtest.

## Verificări de robustețe pe holdout stocks

- Costuri dublate: 61 trades, PF 1,39, expectancy +0,23R.
- Donchian 40/20: 62 trades, PF 1,50, expectancy +0,29R.
- Donchian 55/20: 61 trades, PF 1,55, expectancy +0,31R.
- Donchian 80/20: 57 trades, PF 1,78, expectancy +0,41R.
- Fără cea mai bună tranzacție: PF aproximativ 1,31 și expectancy +0,18R.
- Fără cele mai bune două tranzacții: PF aproximativ 1,10 și expectancy +0,06R.

Testele 40 și 80 zile sunt verificări de sensibilitate făcute după validare; nu justifică schimbarea retrospectivă a parametrului ales de 55 zile.

## Limite

- Universul folosește companii mari disponibile în prezent și poate conține survivorship bias.
- Nu este inclus un calendar point-in-time pentru earnings; gapurile la rezultate pot depăși stopul.
- Nu este simulat un singur portofoliu cu poziții simultane și limită agregată de risc.
- Backtestul nu demonstrează rezultate viitoare. Pentru producție este recomandată rularea inițială în mod paper-alert și colectarea semnalelor forward.

## Surse de cercetare

- AQR, *Time Series Momentum*: https://www.aqr.com/Insights/Research/Journal-Article/Time-Series-Momentum
- AQR, *A Century of Evidence on Trend-Following Investing*: https://www.aqr.com/Insights/Research/Journal-Article/A-Century-of-Evidence-on-Trend-Following-Investing
- NBER, *Volatility Managed Portfolios*: https://www.nber.org/papers/w22208
- MIT, *Stop-loss Strategies with Serial Correlation, Regime Switching, and Transaction Costs*: https://alo.mit.edu/topic/risk-management-and-systemic-risk/
- George & Hwang, *The 52-Week High and Momentum Investing*: https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1104491

Script reproductibil: `scripts/research-strategy-candidates.mjs`.
