# Donchian LONG frequency audit — 63 stocks/ETFs

Research date: 27 August 2026. This audit tests whether shortening the Daily Donchian entry window can safely increase the number of production strategy results.

## Decision

Keep the validated **Weekly Trend + Donchian 55/20 LONG** execution rules unchanged. Shorter entry windows generated only a small increase in accepted trades and weakened the final, cost-stressed result. To make the scanner more useful without changing the tested entry, expand only the pre-signal radar from one ATR to two ATR:

- `WATCH`: price is between one and two ATR below Donchian 55; informational only;
- `ARMED`: price is no more than one ATR below Donchian 55;
- `CONFIRMED`: a closed Daily candle made a fresh close above Donchian 55.

`WATCH` never creates a Telegram event or claims an executable entry.

## Protocol

- 63 currently supported liquid US stocks and ETFs; no data-fetch failures.
- Yahoo Finance adjusted Daily candles, up to ten years.
- Chronological split per asset: 60% calibration, 20% validation, 20% final segment.
- Entry windows compared: 20, 30, 40, 55 and 80 sessions.
- Every other rule stayed identical: bullish Fast and Slow Weekly MoneyLine, close above rising Weekly SMA40, mature/rising Daily SMA50 and SMA200, positive 252-session momentum, Daily Fast MoneyLine bullish and ATR14 percentile at or below 70.
- Entry at the next Daily open; reject gaps above one ATR.
- Wider of the two-candle structural stop and two ATR; reject stops above 4%.
- Risk budget 0.5% per trade, no leverage.
- Exit with Donchian low 20 or Weekly trend invalidation.
- Friction per side: 0.075% fee plus 0.05% slippage. The stress test doubles both.
- Stop is evaluated before the end-of-day trailing-stop update.

## Results

### Validation segment

| Entry | Trades | Win rate | Profit factor | Expectancy | Median stop |
|---|---:|---:|---:|---:|---:|
| D20 | 165 | 40.0% | 2.01 | +0.58R | 3.24% |
| D30 | 155 | 40.0% | 1.99 | +0.57R | 3.07% |
| D40 | 151 | 41.1% | 2.04 | +0.60R | 3.10% |
| **D55** | **148** | **41.2%** | **2.09** | **+0.62R** | **3.07%** |
| D80 | 143 | 42.0% | 2.21 | +0.67R | 3.10% |

### Final chronological segment

| Entry | Trades | Win rate | Profit factor | Expectancy | Median stop |
|---|---:|---:|---:|---:|---:|
| D20 | 113 | 31.9% | 1.24 | +0.15R | 3.21% |
| D30 | 105 | 31.4% | 1.24 | +0.15R | 3.15% |
| D40 | 102 | 32.4% | 1.26 | +0.16R | 3.17% |
| **D55** | **101** | **32.7%** | **1.27** | **+0.17R** | **3.15%** |
| D80 | 97 | 34.0% | 1.37 | +0.22R | 3.15% |

### Final segment with doubled costs

| Entry | Trades | Profit factor | Expectancy |
|---|---:|---:|---:|
| D20 | 114 | 1.10 | +0.07R |
| D30 | 105 | 1.12 | +0.08R |
| D40 | 102 | 1.14 | +0.09R |
| **D55** | **101** | **1.15** | **+0.10R** |
| D80 | 97 | 1.24 | +0.15R |

The shorter D20 rule added only 12 final trades versus D55, while lowering profit factor and expectancy. D80 was stronger but even rarer; it does not solve the product problem. These results do not justify replacing the frozen D55 entry.

## Current radar diagnostic

On the research universe at the time of the run, D55 had no newly confirmed breakout, two candidates within one ATR and five within two ATR. This explains why a live snapshot can legitimately contain only one or two cards even though the historical strategy produced many trades.

## Limitations

- The universe contains present-day constituents and therefore has survivorship bias.
- A per-asset simulation is not a combined portfolio simulation with overlapping-position constraints.
- The parameter comparison itself creates selection risk; the final segment must not be repeatedly reused for further tuning.
- Backtests are hypothetical and do not predict future returns. Forward paper-alert results remain necessary before risking capital.

Reproducible script: `scripts/research-donchian-frequency.mjs`.
