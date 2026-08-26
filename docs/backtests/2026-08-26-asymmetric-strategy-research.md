# Asymmetric cross-asset strategy research — 26 August 2026

## Outcome

The retained research candidate is `ASYMMETRIC_DONCHIAN_55_3R_LONG`. It is a Daily, long-only trend breakout with a hard 10% initial-stop gate and a fixed 3R take-profit. It is **not approved for live execution**; the final stock result is positive but modest, while crypto and metals have small samples.

## Exact rules

1. Require positive 252-session momentum, close above SMA200, and SMA50 above its value 20 sessions earlier.
2. Reject ATR14% readings in the highest-volatility 20% of the asset's own trailing year.
3. Trigger after a completed Daily candle closes above the previous 55-session high.
4. Enter at the next Daily open, including 0.05% adverse slippage; skip a gap greater than 1 ATR.
5. Place the initial stop at the lower of:
   - the lowest low of the signal and previous candle minus 0.1 ATR; or
   - 2 ATR below entry.
6. Reject the setup if entry-to-stop distance exceeds 10%. Risk 0.5% of current portfolio equity on an accepted trade.
7. Place take-profit at exactly 3 times the initial price risk (3R).
8. If neither stop nor target is hit, exit at the following open after a Daily close below SMA50 or after 90 sessions.
9. If stop and target are both touched in the same Daily candle, count the stop first.

The 3R target has a theoretical 25% break-even win rate before costs. That arithmetic does not make the strategy profitable by itself; entry quality, gaps, early trend exits and costs still matter.

## Method

- Universe: 20 liquid US stocks/ETFs, 10 major crypto assets, and gold, silver and copper futures proxies.
- Data: unadjusted provider daily OHLC from Yahoo Finance for stocks/metals and Binance daily OHLC for crypto, as exposed by the existing research helpers.
- Chronological protocol: first 60% calibration, next 20% validation, final 20% locked test, split independently after each asset's 300-session warm-up.
- Costs: 0.075% fee plus 0.05% adverse slippage per side.
- Position sizing: 0.5% portfolio risk per trade, no leverage.
- Five entry families were compared only in calibration and validation. The final segment was opened only for the chosen Donchian-55 rule.

## Results

### Frozen protocol, all asset classes

| Segment | Trades | Win rate | Profit factor | Expectancy | Median stop |
|---|---:|---:|---:|---:|---:|
| Calibration 60% | 373 | 41.6% | 1.68 | +0.39R | 4.16% |
| Validation 20% | 171 | 51.5% | 2.49 | +0.68R | 4.30% |
| Final locked 20% | 145 | 37.2% | 1.49 | +0.30R | 4.51% |

### Final locked 20%, by class

| Class | Active / tested assets | Trades | Win rate | Profit factor | Expectancy | Median stop |
|---|---:|---:|---:|---:|---:|---:|
| Stocks/ETFs | 20 / 20 | 117 | 32.5% | 1.17 | +0.11R | 4.62% |
| Crypto | 5 / 10 | 10 | 50.0% | 2.33 | +0.60R | 8.17% |
| Metals | 3 / 3 | 18 | 61.1% | 4.94 | +1.36R | 3.66% |

Sixteen of 28 active assets were profitable in the final segment. The combined result is helped materially by metals; it must not be presented as proof of equal performance in every market.

### Double-cost stress test on the locked final segment

Fees and slippage were doubled to 0.15% and 0.10% per side:

| Scope | Trades | Profit factor | Expectancy |
|---|---:|---:|---:|
| All | 144 | 1.40 | +0.26R |
| Stocks/ETFs | 116 | 1.10 | +0.07R |
| Crypto | 10 | 2.23 | +0.57R |
| Metals | 18 | 4.66 | +1.31R |

## Interpretation and limitations

- The candidate satisfies the requested asymmetry: no accepted initial stop is above 10%, the median is 4.51%, and full take-profit is 3R.
- It is rarer and more selective than a pullback scanner. High-volatility crypto signals are frequently rejected, which is intentional.
- The final stock edge is thin and becomes very thin under doubled costs. Paper alerts and forward observation are required before any production trading claim.
- Crypto has only 10 final trades; metals have only 18 and are influenced by recent strong trends. Neither estimate is statistically precise.
- The study has survivorship/selection bias, continuous-futures proxy issues, provider-data limitations, and no taxes, exchange outages, liquidity impact or overnight stop guarantees.
- A 10% stop cap limits planned risk, not realized gap risk. A market can open beyond the stop.
- This is a composite designed for this application. Academic evidence supports time-series momentum/trend following broadly, not this exact 55-day/3R package.

## Research basis

- Moskowitz, Ooi and Pedersen, *Time Series Momentum*, Journal of Financial Economics (2012): https://doi.org/10.1016/j.jfineco.2011.11.003
- Hurst, Ooi and Pedersen, *A Century of Evidence on Trend-Following Investing*: https://www.aqr.com/Insights/Research/Journal-Article/A-Century-of-Evidence-on-Trend-Following-Investing
- Lo and Remorov, *Stop-Loss Strategies with Serial Correlation, Regime Switching, and Transaction Costs*: https://alo.mit.edu/topic/risk-management-and-systemic-risk/

## Reproduction

```bash
PHASE=calibration node scripts/research-asymmetric-strategies.mjs
PHASE=validation node scripts/research-asymmetric-strategies.mjs
PHASE=final CANDIDATE=donchian55_3r node scripts/research-asymmetric-strategies.mjs
PHASE=final CANDIDATE=donchian55_3r FEE_PER_SIDE_PERCENT=0.15 SLIPPAGE_PER_SIDE_PERCENT=0.10 node scripts/research-asymmetric-strategies.mjs
```

