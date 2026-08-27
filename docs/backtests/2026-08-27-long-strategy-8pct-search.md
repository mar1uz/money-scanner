# Search for a more profitable LONG strategy with an 8% maximum stop

Research date: 27 August 2026.

## Verdict

No candidate passed the deployment gate. Keep the production **Weekly Trend + Donchian 55/20 LONG** rules and their current 4% stop gate. An 8% maximum was permitted by the research protocol, but widening the accepted stop is not itself evidence of a better strategy.

## Research basis

The fixed candidate families were derived from:

- George and Hwang, *The 52-Week High and Momentum Investing*;
- Moskowitz, Ooi and Pedersen, *Time Series Momentum*;
- Moreira and Muir, *Volatility-Managed Portfolios*;
- long-horizon Donchian trend following, tested with slower entry and exit windows.

All candidates retained the mature Weekly/Daily trend and volatility filters used by production. The research changed only the Donchian entry/exit horizons, ATR stop multiple, 52-week-high/momentum requirements and maximum accepted initial stop.

## Shared assumptions

- Adjusted Yahoo Finance Daily candles.
- Next-open entry, maximum one-ATR gap.
- 0.5% portfolio risk per accepted trade, no leverage.
- 0.075% fee and 0.05% slippage per side; stress tests doubled both.
- Weekly MoneyLine Fast and Slow bullish, price above rising Weekly SMA40.
- Daily SMA50/SMA200 mature and rising, positive 252-session momentum, Daily Fast MoneyLine bullish.
- ATR14 percentile no higher than 70.
- Same-bar policy favors the stop before the end-of-day trailing update.

## Round 1 — entry, momentum and stop variants

Nine candidates were selected on 63 development stocks/ETFs using 60% calibration and 20% validation. The last 20% remained chronological final data. A separate set of 48 scanner symbols not used in candidate selection was also tested.

The frozen winner was **D80 entry / D20 exit / 2 ATR stop / maximum 8%**.

| Test | Existing D55, max 4% | D80, max 8% |
|---|---:|---:|
| Validation PF / expectancy | 2.09 / +0.62R | 2.26 / +0.67R |
| Chronological final PF / expectancy | 1.31 / +0.19R | 1.40 / +0.22R |
| Final with doubled costs | 1.17 / +0.11R | 1.26 / +0.16R |
| New-symbol holdout, full history | **1.12 / +0.08R** | 1.07 / +0.05R |
| New-symbol recent 30% | 1.13 / +0.07R | **1.17 / +0.11R** |
| New-symbol recent 30%, doubled costs | 0.96 / −0.02R | 1.05 / +0.03R |

D80 improved the recent segment but failed to beat the existing rule over the full new-symbol holdout. The improvement was too small and inconsistent for deployment.

## Round 2 — slower exits

Ten pre-defined combinations used D55–D120 entries, D40–D60 exits, 2–2.5 ATR stops and the 8% maximum. Selection again used only the 63-stock development calibration/validation. A second, separate 40-stock holdout was fetched after selection; `MMC` failed at the provider and was excluded.

The frozen winner was **D100 entry / D50 exit / 2.5 ATR stop / maximum 8%**.

| Test | Existing D55/20, max 4% | D100/50, max 8% |
|---|---:|---:|
| Validation PF / expectancy | 2.09 / +0.62R | 3.12 / +1.14R |
| Chronological final PF / expectancy | 1.27 / +0.17R | 1.67 / +0.43R |
| Second new-symbol holdout, full history | 0.89 / −0.07R | 1.05 / +0.03R |
| Second new-symbol recent 30% | 0.74 / −0.19R | 0.79 / −0.14R |
| Recent 30%, doubled costs | 0.66 / −0.25R | 0.72 / −0.20R |

Although the slow-exit candidate dominated the internal sample and marginally improved the full cross-sectional holdout, it remained loss-making in the decisive recent holdout. Deploying it would be parameter overfitting.

## Deployment decision

No Cloud Run deployment was performed. Production remains on the previously deployed D55/20 model. The research code and results are retained for reproducibility and future forward testing:

- `scripts/research-long-strategy-8pct.mjs`
- `scripts/research-long-strategy-8pct-round2.mjs`
- shared simulator helpers in `scripts/research-donchian-frequency.mjs`

## Limitations

- Present-day universes create survivorship bias.
- Yahoo history does not model point-in-time index membership or earnings slippage.
- Independent per-asset simulations are not a combined portfolio with overlapping exposure limits.
- Repeated strategy searches increase false-discovery risk; future candidates need fresh forward paper data rather than another reuse of these holdouts.
- Hypothetical backtests do not predict future performance.
