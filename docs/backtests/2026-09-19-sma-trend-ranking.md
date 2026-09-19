# Round 3: SMA50/200-gated bullish flips and top-5 ranking (Marius's strategy)

Research date: 19 September 2026. Local research / paper only. No orders, no credentials.

## Verdict

The strategy as specified does **not** beat the validated RVOL>=2 baseline:

1. **The SMA gate adds no lift.** Flips with close > SMA50 AND > SMA200 pump at 35.7% / 25.3% / 19.8% (train/val/test, +20%/21d label) vs 33.8% / 29.7% / 18.7% ungated. Statistically indistinguishable.
2. **Neither SMA50>SMA200 nor SMA slopes add consistent lift.** Golden-cross flips: 36.2% / 24.1% / 20.3% - same as base. SMA50-rising shows lift only in the test split (24.0% vs 3.0% falling, but n=33 falling) and none in train/val. SMA200-falling flips pump MORE in val (52.6%, n=19) and test (29.9% vs 12.6%) - a recovery-rally artifact that did not exist in train; not tradeable.
3. **The ranking model does not discriminate.** Test calibration collapses (159 of 162 events land in the 0.2-0.4 predicted bucket; observed 19.5% vs base 19.8%). Top-5-per-day is nearly vacuous: qualifying flip-days rarely have more than 5 events, so the top-5 cohort IS the whole set (154/162).
4. **Out of sample everything in the gate loses money.** Test expectancy: all gated -0.19R, model top-5 -0.15R, RVOL>=2 within gate -0.14R (n=10). The RVOL>=2 edge does not replicate inside the gate, but samples are too small (n=10-12) to say it died - the validated round-2 result stands on the UNGATED set (n=59 test).

**Bottom line: keep the forward paper-trading track on the ungated RVOL>=2 rule (paper-trade-rvol2.mjs). The SMA-gated ranking runs as a labeled research prototype only.**

## What was built

- `scripts/research-sma-trend-ranking.mjs` - the evaluation above (chronological 60/20/20, costs 0.075% fee + 0.05% slippage per side, entry next open, resolution rules identical to the validated backtest).
- `scripts/daily-trend-ranking.mjs` - daily research prototype: ranks current qualifying setups (flip <= 3 days old, close > SMA50 & SMA200) by calibrated probability (logistic on 808 matured events, Platt on the chronological tail), outputs top 5 with evidence, risks, hypothetical entry, invalidation (close below SMA50 or bear ML flip) and 1.25xATR stop. Writes `tmp/paper-trades/latest-ranking.json`. Every output line and the JSON carry the UNVALIDATED status.

First live output (19 Sep 2026, closed candles to Sep 18): 15 qualifying setups; top 5 = OP (p=53%), AVAX (42%, also RVOL 2.22x - in the validated zone), ARB (35%), BTC (35%), LTC (34%).

## Candidate features: what exists and what does not

| Feature | Status |
|---|---|
| RVOL, volume acceleration, trend/momentum, SMA distances/slopes, ATR%, liquidity (median daily quote volume) | Computed from Binance spot klines |
| Funding rate (24h, 90d percentile) | Binance USD-M public endpoint, full history |
| Open interest | BLOCKED: `/futures/data/openInterestHist` returns HTTP 400 for every symbol from his network (history-depth restriction) |
| On-chain activity, fees/TVL/revenue | Not wired: no project data source; DefiLlama public API exists but symbol-to-protocol mapping is unresolved |
| Narrative heat / X velocity | Needs X API credentials (packages/social-analysis runtime keys) - out of scope |
| JEV | Honestly an LLM router, not a predictor. Usable later as an explanation/narrative stage over the ranked output (route a per-setup prompt through jev-router's cheap/mid tier); requires the AI Gateway top-up decision. Not built. |

## Reproduce

```bash
cd "Money Scanner"
node scripts/research-sma-trend-ranking.mjs   # evaluation
node scripts/daily-trend-ranking.mjs          # today's ranked prototype output
```
