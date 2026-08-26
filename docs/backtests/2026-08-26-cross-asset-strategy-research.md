# Cercetare strategie cross-asset — 12M Momentum + Donchian 55/20

Data rulării: 26 august 2026  
Stare: candidat pentru paper alerts, neimplementat și nedeployat

## Obiectiv

Identificarea unei singure reguli care poate scana stocks/ETF-uri, crypto și metale fără parametri optimizați individual. „Cross-asset” înseamnă că toate activele sunt evaluate prin aceleași reguli; nu înseamnă că strategia trebuie să forțeze o tranzacție pe fiecare activ.

## Protocol

- Univers de selecție: 20 stocks/ETF-uri, 10 crypto și aur, argint, cupru.
- 60% calibrare, 20% validare pentru alegerea candidatului, 20% holdout final.
- Cinci candidați: TSMOM 12 luni lunar, momentum compozit 1/3/12 luni, Donchian 55/20, Donchian 100/50 și EMA20/100.
- Direcție LONG/cash pentru a evita riscul nelimitat și costurile necomparabile ale short-ului între spot, acțiuni și futures.
- Risc 0,5% din portofoliu per poziție, fără leverage.
- Cost per sens: 0,075% comision și 0,05% slippage.
- Semnal exclusiv pe lumânare Daily închisă și intrare la următorul open.

## Strategia selectată

```text
12M_MOMENTUM_DONCHIAN_55_20_LONG

Filtre:
- randament 252 sesiuni > 0
- ATR14% nu se află în cele mai volatile 20% valori ale ultimului an

Trigger:
- Daily close > cel mai mare high al precedentelor 55 sesiuni

Execuție:
- următorul Daily open
- anulare dacă gapul depășește 1 ATR

Risc:
- stop inițial la 2 ATR
- risc financiar maxim 0,5% prin position sizing
- varianta sigură respinge stopurile procentuale peste 6%

Ieșire:
- trailing stop la cel mai mic low al ultimelor 20 sesiuni
- noul stop devine activ din sesiunea următoare
```

## Rezultate cu regulile înghețate

### Calibrare 60%

| Clasă | Trades | Profit factor | Expectancy |
|---|---:|---:|---:|
| Stocks | 246 | 2,31 | +0,68R |
| Crypto | 10 | 11,26 | +5,55R |
| Metale | 26 | 2,23 | +0,80R |
| Total | 282 | 2,62 | +0,86R |

Rezultatul crypto din calibrare are prea puține observații și nu este interpretat singur.

### Validare intermediară 20%

| Clasă | Trades | Profit factor | Expectancy |
|---|---:|---:|---:|
| Stocks | 100 | 3,70 | +1,20R |
| Crypto | 11 | 8,72 | +2,22R |
| Metale | 14 | 1,30 | +0,21R |
| Total | 125 | 3,56 | +1,18R |

Donchian 55/20 a fost ales înaintea ultimului holdout deoarece a rămas pozitiv în fiecare clasă și a avut mai multe observații decât varianta 100/50.

### Holdout final 20% — plafon exploratoriu 8%

| Clasă | Trades | Win rate | Profit factor | Expectancy | Stop median |
|---|---:|---:|---:|---:|---:|
| Stocks | 96 | 36,5% | 1,33 | +0,21R | 4,44% |
| Crypto | 6 | 33,3% | 2,43 | +0,80R | 5,25% |
| Metale | 12 | 50,0% | 11,05 | +4,21R | 3,51% |
| Total | 114 | 37,7% | 2,09 | +0,66R | — |

Metalele sunt amplificate de trendurile foarte mari din aur și argint; crypto are numai șase tranzacții. Cifrele agregate nu trebuie citite fără aceste distribuții.

### Sensibilitate post-validare — plafon universal 6%

| Clasă | Trades | Profit factor | Expectancy | Stop median |
|---|---:|---:|---:|---:|
| Stocks | 83 | 1,32 | +0,19R | 4,17% |
| Crypto | 6 | 2,01 | +0,60R | 5,25% |
| Metale | 12 | 11,05 | +4,21R | 3,51% |
| Total | 101 | 2,20 | +0,70R | — |

Plafonul de 6% este o verificare făcută după deschiderea holdout-ului și nu constituie un nou test independent.

## Holdout transversal crypto

Strategia înghețată a fost aplicată și pe 24 crypto mari care nu au participat la alegerea candidatului. ONDO a fost exclus pentru istoric insuficient; au rămas 23.

Cu stop de 2 ATR și plafon 6%:

- întreg istoricul după warm-up: doar TRX și JST eligibile, 17 trades, PF 3,28, +1,06R, stop median 4,82%;
- ultimele 20%: 7 trades, PF 3,25, +0,67R, stop median 3,89%;
- rezultatul pozitiv este dominat de TRX; JST a fost negativ.

Un stop de 1 ATR a activat 16 dintre cele 23 crypto și 128 trades, dar ultimele 20% au eșuat: PF 0,77 și -0,21R. Un stop mai strâns nu a făcut strategia mai sigură; a crescut numărul de whipsaw-uri.

## Verdict

Aceasta este cea mai bună regulă cross-asset găsită în această rundă și merită paper alerts. Poate scana toate clasele prin aceeași logică, dar trebuie să refuze majoritatea setupurilor crypto atunci când volatilitatea nu permite un stop sub 6%. Nu este validată ca strategie profitabilă pe fiecare ticker și nu trebuie prezentată astfel.

Înainte de alertare live sunt necesare:

1. minimum 50 semnale forward cross-asset;
2. calendar earnings pentru acțiuni;
3. simulare de portofoliu cu poziții simultane și limită de risc agregat;
4. univers point-in-time pentru reducerea survivorship bias;
5. separarea clară în UI între `CANDIDATE`, `CONFIRMED` și `REJECTED — STOP > 6%`.

## Surse

- Moskowitz, Ooi, Pedersen, *Time Series Momentum*: https://doi.org/10.1016/j.jfineco.2011.11.003
- AQR, *A Century of Evidence on Trend-Following Investing*: https://www.aqr.com/Insights/Research/Journal-Article/A-Century-of-Evidence-on-Trend-Following-Investing
- NBER, *Volatility Managed Portfolios*: https://www.nber.org/papers/w22208
- Asness, Moskowitz, Pedersen, *Value and Momentum Everywhere*: https://w4.stern.nyu.edu/facdir/lpederse/papers/ValMomEverywhere.pdf
- MIT, *Stop-loss Strategies with Serial Correlation, Regime Switching, and Transaction Costs*: https://alo.mit.edu/topic/risk-management-and-systemic-risk/

Scripturi reproductibile:

- `scripts/research-cross-asset-strategies.mjs`
- `scripts/validate-donchian-extra-crypto.mjs`
