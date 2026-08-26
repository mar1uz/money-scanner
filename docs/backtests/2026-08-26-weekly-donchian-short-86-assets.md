# Weekly Trend + Donchian 55/20 SHORT — 86-asset backtest

Research date: 26 August 2026. This strategy is not deployed and is rejected as a production candidate in its tested form.

## Question

Does the best stocks/ETF LONG candidate remain profitable when mirrored mechanically for bearish regimes?

## Prespecified SHORT rules

1. Weekly MoneyLine Fast and Slow must both be bearish.
2. Weekly close must be below a falling SMA40.
3. Daily close must be below SMA200; SMA50 below SMA200; both averages falling.
4. Daily 252-session momentum must be negative.
5. ATR14% must not be in the highest-volatility 30% of the asset's trailing year.
6. Trigger after a completed Daily close below the prior 55-session low and with bearish Daily Fast MoneyLine.
7. Enter SHORT at the next Daily open; reject downward gaps larger than 1 ATR.
8. Initial stop is the higher/wider of the two-candle structural high plus 0.1 ATR and 2 ATR above entry.
9. Prespecified initial stop gate: reject above 4%. Risk 0.25% of current equity per accepted trade, with no leverage.
10. Trail the position using the 20-session Donchian high. Exit at the next open when the Weekly bearish regime is invalidated.

## Universe and method

- 86 valid assets: 63 liquid US stocks/ETFs, 20 major crypto assets and three metal futures proxies.
- All 86 requested assets returned at least 600 closed Daily candles; no data-fetch failures.
- Yahoo Finance adjusted Daily OHLC was used for stocks/metals and Binance spot Daily OHLC for crypto.
- Each asset's eligible history was split chronologically: first 70% in-sample and last 30% locked holdout.
- Entry/exit includes 0.075% fee and 0.05% adverse slippage per side.
- Same-candle processing is conservative: the existing stop is checked before the trailing stop is updated.
- Base result assumes zero borrow/funding cost. Therefore the result is optimistic for actual equity shorts and cannot be improved by adding real borrow costs.

## Result with the prespecified 4% stop gate

| Segment | Assets | Active assets | Signals | Rejected | Trades | Win rate | Profit factor | Expectancy | Median stop |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| In-sample 70% | 86 | 15 | 223 | 200 | 23 | 21.7% | 0.91 | -0.07R | 3.58% |
| Holdout 30% | 86 | 3 | 110 | 105 | 5 | 20.0% | 0.66 | -0.29R | 3.52% |

The five holdout trades occurred in stocks: one losing PFE trade (-1.05R), one winning SBUX trade (+2.79R), and three losing PG trades averaging -1.07R. Crypto generated 78 holdout signals, all rejected by the 4% stop gate. Metals generated no holdout signal.

## Stop-gate sensitivity

All other rules were kept identical. These variants are diagnostics, not alternative holdout-selected candidates.

| Maximum stop | In-sample trades | In-sample PF | In-sample expectancy | Holdout trades | Holdout PF | Holdout expectancy |
|---:|---:|---:|---:|---:|---:|---:|
| 4% | 23 | 0.91 | -0.07R | 5 | 0.66 | -0.29R |
| 6% | 49 | 0.44 | -0.47R | 9 | 0.41 | -0.45R |
| 8% | 61 | 0.40 | -0.51R | 15 | 0.49 | -0.33R |
| 10% | 82 | 0.37 | -0.52R | 21 | 0.36 | -0.42R |

Widening the stop increases coverage but makes profitability worse. The failure is therefore not explained solely by the 4% filter.

## Interpretation

- The mechanical bearish mirror is not profitable: PF is below 1 and expectancy is negative both before and after the split.
- Bearish trends in individual equities often reverse sharply. One in-sample NKE gap produced -3.15R despite a planned stop below 4%, illustrating that a stop cap does not cap realized overnight gap risk.
- A breakdown occurs after volatility and price displacement have often expanded. The 2 ATR stop therefore conflicts with a strict 4% price-risk gate, particularly in crypto.
- The 2024–2026 stock holdout contains few persistent broad bearish regimes. That explains low frequency but does not rescue the rule: the earlier sample, which includes major selloffs, is also negative.
- Direct equity shorts additionally incur borrow availability, interest, dividend reimbursement, recall and potentially unlimited loss risk; none of these costs were charged in the optimistic base test.
- A viable bearish model should not be obtained by mirroring the LONG rule. Future research should test index/sector regime confirmation, a fast rebound filter, entries on failed rallies rather than late breakdowns, and defined-risk instruments or inverse ETFs.

## External context

- SEC Regulation SHO overview and short-sale risks: https://www.sec.gov/investor/pubs/regsho.htm
- Moskowitz, Ooi and Pedersen note that time-series momentum can profit during persistent declines but loses around sharp crisis reversals: https://doi.org/10.1016/j.jfineco.2011.11.003
- *Momentum Turning Points* distinguishes Bear from Rebound states using fast and slow momentum agreement: https://www.sciencedirect.com/science/article/pii/S0304405X23001034

## Reproduction

```bash
node scripts/backtest-weekly-donchian-short-50plus.mjs
MAX_STOP_PERCENT=6 node scripts/backtest-weekly-donchian-short-50plus.mjs
MAX_STOP_PERCENT=8 node scripts/backtest-weekly-donchian-short-50plus.mjs
MAX_STOP_PERCENT=10 node scripts/backtest-weekly-donchian-short-50plus.mjs
```

