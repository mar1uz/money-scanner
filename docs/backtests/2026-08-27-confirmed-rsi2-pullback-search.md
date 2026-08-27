# Confirmed RSI(2) trend-pullback search

Research date: 27 August 2026.

## Question

Can a rare, confirmed pullback inside a mature Weekly/Daily uptrend achieve a materially higher win rate than the production Donchian breakout while retaining positive profit factor and expectancy?

## Strategy basis

- Larry Connors' RSI(2) concept: seek short-term oversold pullbacks above SMA200 rather than chasing breakouts.
- StockCharts' confirmation refinement: after RSI(2) falls below 5 or 10, wait for RSI(2) to cross back above 50 or for a bullish reversal close.
- Fidelity's trend guidance: rising moving averages may act as support, but confirmation is needed because averages lag.
- Production risk overlay: Weekly MoneyLine Fast and Slow bullish, rising Weekly SMA40, mature/rising Daily SMA50/SMA200, Daily Fast bullish, positive 252-session momentum and ATR percentile at or below 70.

The original Connors form does not require a stop. That was rejected as unsuitable. Every tested setup used a 2–3 ATR catastrophe stop and rejected initial stops above 8%.

## Protocol

- 63 stocks/ETFs for candidate calibration (60%) and validation (20%).
- The remaining 20% was reserved for a candidate passing the fixed selection gate.
- Two additional symbol universes contained 48 and 40 valid stocks.
- Next-open execution, maximum one-ATR gap, 0.5% portfolio risk, no leverage.
- 0.075% fee and 0.05% slippage per side.
- Stop receives priority over a target when intraday ordering is unknown.
- Fourteen fixed candidates varied RSI(2) threshold, confirmation, SMA5/SMA10 mean-reversion exit, 1R/1.5R target and 2/3 ATR stop.
- Required selection: calibration PF at least 1.15 and positive expectancy; validation win rate at least five percentage points above D55, PF at least 1.20, expectancy above +0.05R and at least 60 trades.

## Results

No candidate passed the selection gate, so the final holdouts were not opened for a cherry-picked candidate.

Examples of the apparent high-win-rate trap:

| Candidate | Calibration | Validation |
|---|---|---|
| RSI5 → cross 50, exit above SMA10, 3 ATR stop | 56.7% WR, PF 0.59, −0.08R | 65.3% WR, PF 1.97, +0.10R |
| RSI5 + bullish reversal, exit above SMA10, 2 ATR stop | 59.3% WR, PF 0.87, −0.03R | 65.4% WR, PF 1.80, +0.10R |
| RSI5 → cross 50, target 1.5R, 2 ATR stop | 45.5% WR, PF 0.85, −0.08R | 55.9% WR, PF 1.67, +0.25R |
| RSI5 + reversal, target 1.5R, 2 ATR stop | 48.6% WR, PF 1.00, 0.00R | 55.8% WR, PF 1.88, +0.30R |

The validation period made several variants look excellent, but the same fixed rules lost money in the longer calibration period. A higher win rate did not compensate for the loss distribution and friction.

## Decision

- Do not replace or relax the production D55 strategy.
- Do not enable RSI(2) trade alerts or Telegram execution-style notifications.
- If more visible opportunities are desired, use an explicitly informational pre-signal radar and collect forward paper results. Do not label those observations as confirmed trades.
- A genuinely new candidate now requires fresh forward data; further optimization on these same histories would increase false-discovery risk.

Reproducible script: `scripts/research-confirmed-rsi2-pullback.mjs`.

## Sources

- StockCharts ChartSchool, *RSI(2)*: https://chartschool.stockcharts.com/table-of-contents/trading-strategies-and-models/trading-strategies/rsi-2
- StockCharts ChartSchool, *ConnorsRSI*: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/connorsrsi
- Fidelity, *Exponential Moving Average*: https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/ema
- Da, Liu and Schaumburg, *Short-Term Return Reversal: The Long and the Short of It*: https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2022061
