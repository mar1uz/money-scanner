# Pump-probability ranking layer over bullish Money Line flips

Research date: 19 September 2026. Local research / paper-trading only. No orders were placed and no exchange or credential access was used.

## Verdict

No deployment gate passed. A daily bullish Money Line flip is **not**, by itself, a profitable pump entry in the recent regime, and the first-pass probability layer showed **no reliable out-of-sample lift** over the base rate. Do not take trades from this ranking yet. The pipeline is in place for the next iteration; see "Next iterations".

## What "jev" is (source truth)

`jev-router` is an LLM model router (TypeSafe `jev` evaluator via eve): it scores request complexity and routes to a cheap/mid/frontier model. It is not a market predictor. The sensible interpretation of "use jev to analyze pump probability" is an optional jev-routed LLM scoring/narrative stage on top of this deterministic layer. That stage was **not built**: it needs the AI Gateway paid credits (top-up decision still open) and adds nothing until the statistical layer shows edge. `jev-router` was left untouched.

## Pipeline (scripts/research-pump-probability.mjs)

- Universe: 25 major crypto assets (same list as backtest-25-crypto-assets), Binance daily klines, up to 3000 candles, last in-progress candle dropped.
- Signal: production `MoneyLineEngine` (`packages/money-line/dist`), closed candles only, non-repainting. Event = tier transition into Bullish or Strong Bullish.
- Features at flip (only data <= flip): score, tier, score delta, RSI14, RVOL, ATR%, EMA alignment / MACD / RSI / RVOL contributions, distance to EMA20/EMA200, 30d return, drawdown from 90d high, asset weekly supertrend regime, BTC weekly supertrend regime, flip freshness (flips in last 90d).
- Label: entry at next open. Pump = +20% MFE before -10% MAE within 21 days (first barrier wins; same-day both = fail).
- Model: L2 logistic regression on standardized features. Chronological pooled split 60/20/20. Platt recalibration on validation. Ranking threshold frozen on validation trade expectancy, applied once to test.
- Trade sim: entry next open; stop 1.25xATR14; TP1 +2R (50% off, stop to break-even); runner exits at bear flip, +3.5R cap, or 42-day timeout. Costs 0.075% fee + 0.05% slippage per side.

## Results

2405 flip events, 2019-01 .. 2026-08. Overall pump base rate **29.9%**.

| Split | Window | Events | Pump base rate |
|---|---|---:|---:|
| Train | 2019-01 .. 2024-07 | 1443 | 33.7% |
| Validation | 2024-07 .. 2025-08 | 481 | 29.7% |
| Test | 2025-08 .. 2026-08 | 481 | **18.7%** |

Trade simulation (R multiples, costs included):

| Cohort | Trades | Win rate | Expectancy | PF | Total R | Max DD |
|---|---:|---:|---:|---:|---:|---:|
| Validation, all flips | 481 | 31.4% | +0.08R | 1.14 | +38.3R | 91R |
| **Test, all flips** | 481 | 24.5% | **-0.20R** | 0.65 | -94.2R | 136.6R |

Ranking quality on test: precision@1 = 17.4%, precision@3 = 18.0%, precision@5 = 17.8% vs 18.7% base rate - **no lift**. Validation probabilities compressed into a narrow band (predictions 0.2-0.4), so the frozen threshold selected everything.

Single-factor pump rates (all 2405 events) - the honest signal candidates:

| Factor | n | Pump rate |
|---|---:|---:|
| RVOL >= 2 | 239 | **38.5%** |
| Fresh flip (none in prior 90d) | 46 | **39.1%** |
| Strong Bullish flip | 183 | 32.2% |
| Close > EMA200 | 986 | 30.4% |
| RVOL < 1 | 1124 | 27.5% |
| Asset weekly supertrend bull | 1052 | 28.6% |

Regime: in the test window, flips during BTC-weekly-bull pumped 12.9% (n=139) vs 21.1% during BTC-weekly-bear (n=342) - regime conditioning from 2019-2024 does not transfer to 2025-2026.

## Interpretation

- The recent regime is hostile: base rate fell from ~30% to 18.7%, and the naive flip-following strategy bleeds -0.20R per trade out of sample.
- The two factors with visible lift (high RVOL, fresh first flip after a quiet period) are consistent with accumulation-breakout behavior, but both have small counts and were not validated as a combined rule. They are candidates for the next round, not tradeable rules.
- Logistic regression on these linear features does not beat the base rate out of sample; regime shift swamps the model.

## Next iterations (not done)

1. Label variants: smaller barrier (+12%/+15%), shorter horizons (7-10d), time-to-pump weighting.
2. RVOL x freshness interaction rule, validated strictly out of sample with doubled-cost stress.
3. Per-asset or volatility-regime-conditional models; gradient boosting if a nonlinear edge appears.
4. Add non-price features: funding/open interest (not in klines), X velocity/credibility from `packages/social-analysis`.
5. Optional jev-routed LLM narrative score on top-ranked candidates, after the AI Gateway top-up decision.

## Reproduce

```bash
cd "Money Scanner"
node scripts/research-pump-probability.mjs
```

Runtime ~60s (26 Binance histories). Deterministic apart from the candle snapshot date.
