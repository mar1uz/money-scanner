# Search for a robust profitable SHORT strategy — 26 August 2026

## Decision

The retained LONG strategy remains `WEEKLY_TREND_DONCHIAN_55_20_LONG`. No tested SHORT strategy met the minimum requirement of positive expectancy across calibration, validation and an untouched final test. No new SHORT strategy is approved for live alerts.

## Data and realism

- Development universe: 86 assets — 63 stocks/ETFs, 20 crypto assets and three metal proxies.
- Additional cross-sectional holdout: 39 valid, previously unused US stocks (one Yahoo symbol failure).
- Cross-sectional momentum experiment: 102 valid US stocks/ETFs.
- Maximum available adjusted Daily Yahoo history for equities; up to 3,000 Binance Daily candles for crypto.
- Next-open execution, 0.075% fee and 0.05% slippage per side, 3% annual borrow/funding assumption and 0.25% portfolio risk per accepted trade.
- Main chronological protocol: 60% calibration, 20% validation and locked 20% final.

## Family 1 — failed rallies and bear flags

Five initial ideas were tested: production RSI(2) Bear Rally Fade, SMA20 failed rally, SMA50 failed rally, three-day rally reversal and bear-flag breakdown. Signals required an asset bearish trend and SPY/BTC bearish confirmation. Fixed-target versions used 2.5R or 3R.

The plain SMA20 candidate looked stable before the final test:

| Segment | Stocks trades | Profit factor | Expectancy |
|---|---:|---:|---:|
| Calibration | 147 | 1.45 | +0.14R |
| Validation | 37 | 1.48 | +0.20R |
| Final | 19 | 0.27 | -0.24R |

It is rejected because the locked final segment failed materially.

## Family 2 — relative weakness + failed rally/bear flag

Relative weakness required the asset's 63-session return to underperform SPY by at least five percentage points. The best variant was `RELATIVE_WEAKNESS_BEAR_FLAG_2_5R_SHORT`:

- SPY slow and fast momentum negative and below SMA200.
- Asset Weekly Fast/Slow MoneyLine bearish, below falling Weekly SMA40.
- Asset Daily close below falling SMA50/SMA200 and negative 252-session momentum.
- Asset underperformed SPY by at least 5% over 63 sessions.
- A compact six-session rally/flag contains at least three up days.
- Trigger: bearish Daily close below the flag low.
- Next-open SHORT; wider of seven-session structural stop and 2 ATR; reject planned stop above 10%.
- Fixed target 2.5R; risk 0.25% of portfolio.

Results:

| Test | Stocks trades | Win rate | Profit factor | Expectancy |
|---|---:|---:|---:|---:|
| Calibration | 13 | 46.2% | 2.61 | +0.34R |
| Validation | 8 | 50.0% | 2.35 | +0.46R |
| Fresh 39-stock holdout | 22 | 50.0% | 2.52 | +0.38R |
| Fresh holdout, doubled friction + 6% borrow | 22 | 45.5% | 2.21 | +0.33R |
| Locked temporal final | 3 | 33.3% | 0.14 | -0.32R |

This is the most promising SHORT research pattern, but the 43 total trades across the first three positive aggregate tests are still sparse and the temporal final failed. It may be retained for paper observation only, never represented as proven profitable.

## Family 3 — cross-sectional weakest-decile momentum

When SPY's 21-session and 252-session momentum were both negative and SPY was below SMA200, the model ranked 102 stocks/ETFs monthly and shorted the weakest decile by six-month return. Positions used an 8% maximum stop, 2R target, 0.25% risk, costs and borrow.

| Segment | Trades | Profit factor | Expectancy |
|---|---:|---:|---:|
| Calibration 1994–2013 | 140 | 1.42 | +0.21R |
| Validation 2013–Feb 2020 | 16 | 0.29 | -0.42R |

Adding a requirement that SPY be at least 20% below its trailing-year high improved old bear markets but failed recently:

| Segment | Trades | Profit factor | Expectancy |
|---|---:|---:|---:|
| Calibration | 73 | 1.68 | +0.35R |
| Final 2020–2026 | 23 | 0.04 | -0.81R |

Both cross-sectional variants are rejected.

## Interpretation

- Short performance is regime-dependent and highly concentrated in a few persistent bear episodes.
- Slow bearish momentum alone enters too late; fast/slow confirmation helps identify rebounds but does not eliminate gap and squeeze losses.
- Current-constituent equity universes introduce survivorship bias, while actual shorts also face variable locate, borrow, dividend and recall costs.
- The tested evidence supports using bearish scans primarily as `RISK OFF / HEDGE` alerts. A future executable SHORT study should use index futures, inverse ETFs or defined-risk put spreads with their own historical price/option data, rather than assuming individual-stock short symmetry.

## Sources

- Goulding et al., *Momentum Turning Points*: https://doi.org/10.1016/j.jfineco.2023.05.007
- Moskowitz, Ooi and Pedersen, *Time Series Momentum*: https://doi.org/10.1016/j.jfineco.2011.11.003
- SEC, Regulation SHO and short-sale risks: https://www.sec.gov/investor/pubs/regsho.htm

## Reproduction

```bash
PHASE=calibration node scripts/research-profitable-short-strategies.mjs
PHASE=validation node scripts/research-profitable-short-strategies.mjs
PHASE=final CANDIDATE=relative_weak_bear_flag_2_5r node scripts/research-profitable-short-strategies.mjs
PHASE=fresh CANDIDATE=relative_weak_bear_flag_2_5r node scripts/research-profitable-short-strategies.mjs
PHASE=calibration node scripts/research-cross-sectional-short.mjs
PHASE=validation node scripts/research-cross-sectional-short.mjs
```
