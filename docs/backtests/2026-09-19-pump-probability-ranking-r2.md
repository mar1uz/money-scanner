# Pump-probability round 2: RVOL >= 2 rule holds out of sample

Research date: 19 September 2026. Local research / paper-trading only. No orders, no exchange connections, no credentials.

## Verdict

One rule shows **robust out-of-sample lift**: bullish daily Money Line flips with **RVOL >= 2** (volume at least 2x the 20-day average).

- Test window (2025-08 .. 2026-08, chronological holdout): pump rate **39.0% vs 18.7% base** (+20%/21d label, n=59), trade expectancy **+0.30R**, profit factor **1.65**, max drawdown **13.2R** on the R-equity curve.
- The lift is present in all three chronological splits (train 36.8% vs 33.8%, validation 45.5% vs 29.7%, test 39.0% vs 18.7%) and for all three label variants (+12%/10d, +15%/14d, +20%/21d).
- This is still a research result, not a trading system: 59 test trades, selection bias caveat below, no forward paper-trading yet.

## What did NOT work

- Fresh flip (no flip in prior 90d): strong on train (41-49% pump) but nearly no events in validation/test (n=1 and n=6) - cannot validate.
- RVOL>=2 & close>EMA200: kills the edge (test -0.80R, n=4).
- RVOL>=2 & funding below median: funding filter destroys expectancy (test -0.05R). Funding data only exists from 2022, which also biases the split.
- Full logistic model (24 features incl. funding/OI): test precision@1 26.2% vs 22.9% base - marginal at k=1, none at k=3/5. Regime-conditional models (separate BTC-bull / BTC-bear fits) do not beat the pooled base rate either.
- Funding rate features show no single-factor lift (negative funding 28.2% vs 30.6% base on +15%/14d).

## Data notes

- Funding rate: Binance USD-M public endpoint, full history per symbol (3.7k-6.3k fundings). Used for funding24h and 90-day percentile features.
- Open interest history: `/futures/data/openInterestHist` returned HTTP 400 for every symbol (likely a history-depth restriction on that endpoint). OI features were dropped, not imputed.
- X narrative velocity: `packages/social-analysis` needs X API credentials at runtime - out of scope (no new credentials).

## Rule table (label +20%/21d; pump% / expectancyR / PF; costs: 0.075% fee + 0.05% slippage per side, entry next open)

| Rule | Train (n) | Val (n) | Test (n) | Test maxDD |
|---|---|---|---|---|
| R1 rvol>=2 | 36.8% / +0.21R / 1.40 (136) | 45.5% / +0.70R / 2.73 (44) | **39.0% / +0.30R / 1.65 (59)** | 13.2R |
| R2 fresh | 41.0% / +0.45R / 2.12 (39) | 0% / -1R / 0 (1) | 33.3% / -0.46R / 0.27 (6) | 2.8R |
| R3 rvol>=2 & fresh | 28.6% (7) | no events | n=1 | - |
| R4 rvol>=2 & >EMA200 | 32.8% / +0.07R (58) | 25.0% / +0.13R (12) | 25.0% / -0.80R (4) | 3.2R |
| R6 rvol>=2 & fund<=med | 34.3% / +0.22R (99) | 38.7% / +0.50R (31) | 30.6% / -0.05R / 0.91 (36) | 13.4R |

Base rates: train 33.8%, val 29.7%, test 18.7%.

## Selection-bias caveat (honest)

R1 was spotted in round 1's pooled single-factor table, which included test-window data. Round 2 confirms the lift holds **within each chronological split independently**, which mitigates but does not eliminate the post-hoc selection problem. A clean confirmation requires forward paper-trading on new flips.

## Proposed next step (research only)

Forward paper-trading log: each new daily bullish Money Line flip with RVOL >= 2 gets recorded with entry (next open), 1.25xATR stop, +2R half-exit plan, and tracked to resolution. 30-50 forward events would confirm or kill the edge with zero capital at risk.

## Reproduce

```bash
cd "Money Scanner"
node scripts/research-pump-probability-r2.mjs
```
