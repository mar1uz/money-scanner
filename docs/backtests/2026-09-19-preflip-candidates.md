# Pre-flip candidate research (round 4)

Date: 2026-09-19
Status: research complete, watchlist prototype live (UNVALIDATED)
Scripts: `scripts/research-preflip-candidates.mjs`, `scripts/preflip-core.mjs`, `scripts/preflip-watchlist.mjs`
Tests: `scripts/preflip-core.test.mjs` (6 pass)

## Question

Can a Money Line **candidate** state (price approaching the daily cloud slow-line
flip trigger from below, trend still bearish) be used *before* the flip confirms:

1. Stage 1 - P(cloud buy flip confirms within 14 days)?
2. Stage 2 - P(+20% before -10% within 21 days **given** confirmation)?

Compared against simple candidate baselines and the confirmed RVOL>=2 rule.

## Method

- Universe: 25 Binance spot symbols, daily closed candles; BTC weekly supertrend
  (10, 3.5) as regime filter; funding history; DefiLlama chain TVL for 14 mapped L1s.
- Candidate episode = episode start where slow dir bearish, price 0..1 ATR below the
  slow line. 752 episodes, 2019-01-30 .. 2026-08-20.
- Features (23) at candidate day only, strict cutoff (verified by a no-lookahead test).
- Chronological 60/20/20 split by candidate date (train 2019-01..2024-08,
  val ..2025-09, test ..2026-08).
- Logistic regression per stage (same recipe as rounds 1-3).
- Trade sim on confirmed candidates: next-open entry, 1.25 ATR stop, Money Line
  exit, 0.075% fee + 0.05% slippage per side.

## Results

### Stage 1 - P(confirm within 14d)

| split | n | base confirm rate |
|---|---|---|
| train | 451 | 64.3% |
| val | 150 | 68.7% |
| test | 151 | 48.3% |

Top-20% model-ranked: **86.7% val** (vs 68.7% base), **63.3% test** (vs 48.3% base).
Simple baselines: VERY_CLOSE (<=0.25 ATR) 81.8/84.6/**44.4**% (test n=9) - collapses
out of regime; RVOL>=2 72.3/70.6/50%; compressed 67.6/73.3/56.7%.
Strongest weights: smaGolden+, ddFromHigh90-, distSma50-, ret30+.

### Stage 2 - P(+20% before -10% | confirmed)

| split | n | base profit rate |
|---|---|---|
| train | 290 | 31.0% |
| val | 103 | 36.9% |
| test | 73 | 13.7% |

Top-20% model-ranked: 30.0% val (vs 36.9% base - no lift), 14.3% test (vs 13.7% -
no lift). RVOL>=2 at candidate: 41.7/58.3/37.5% - directionally positive but tiny n.

### Trade sim (entry after confirmation, costs in)

| split | all-confirmed | top-P1 | RVOL>=2 at flip |
|---|---|---|---|
| val | +0.244R, PF 1.47, DD 18R (n=103) | +0.063R, PF 1.10 (n=20) | +0.272R, PF 1.56, DD 7R (n=37) |
| test | **-0.454R, PF 0.42, DD 37.9R** (n=73) | -0.158R, PF 0.75 (n=14) | **-0.435R, PF 0.42** (n=28) |

Note: the round-2 RVOL>=2 result does **not** replicate under this event definition
(cloud slow-line confirmation + this exit management) in the recent regime - the
test window is a sustained bear regime where everything long loses.

## Verdict

- Stage 1 ranking has real, regime-sensitive lift (+15pp over base in test). Useful
  for **prioritizing which candidates to watch**, not for early entry.
- Stage 2 does not discriminate. No evidence to size or enter pre-flip.
- Entry discipline stands: only after a confirmed daily cloud buy flip, and the
  RVOL>=2 confirmation filter remains the best-supported overlay in normal regimes
  but is not regime-proof.
- The daily watchlist (top 5 by P1, with P2 shown for context) is therefore shipped
  as an UNVALIDATED PROTOTYPE - observational only, forward-freeze only.

## Data notes

- TVL coverage 37% of events (14 mapped L1 chains; majors like BTC/XRP/DOGE have
  no chain TVL by design).
- Open-interest history endpoint returned HTTP 400 for all symbols - not usable.
- Token unlock history and brand/mindshare not accessible without paid/credentialed
  sources - features not built. JEV/LLM judge stage not built (would need AI Gateway
  spend; explanation-only role preserved in design).

## Forward protocol

User-grounded examples: Marius's app screenshots (2026-09-18 1W scan: 33/264
candidates incl. AI #144, STRK #146, MON #148, SYRUP #157, XPL #160; 2026-09-19
MONUSDT daily: price ~0.02538, BUY FLIP trigger ~0.0291, base recovery,
unconfirmed; STRK daily: flip already confirmed with expansion). These are frozen
as `trackedExamples` in the watchlist log (threshold distance, zone state) so
candidate->confirm discrimination (MON-type vs STRK-type) is scored forward,
without hindsight. Screenshot contents are candidate-state observations, never
profitability evidence. MON has no Binance spot market; the watchlist falls back
to Bybit spot for such symbols.

`scripts/preflip-watchlist.mjs` freezes the full current candidate universe with
probabilities to `tmp/paper-trades/preflip-watchlist.jsonl` (append-only) and prints
the top 5 with evidence, risks and the exact confirmation trigger (price + %/ATR
distance). Forward-only from 2026-09-19; no retroactive edits.

## Round 4b - setup quality / risk-reward refinement (Marius, 2026-09-19)

Hypothesis: candidates near SMA50/base allow tight logical stops (below flip
threshold/SMA/base/higher-low), improving expectancy and drawdown vs a generic
1.25 ATR stop.

Method: `tradeQuality()` anchors the stop 0.25 ATR below the nearest defensible
level under entry (flip line, SMA50, 30d base low, 10d higher low), resistance =
nearest 90d swing high >=2% above entry; everything uses data <= confirm day.
466 confirmed candidate events, chronological 60/20/20.

| split | ATR 1.25 stop | logical anchor stop | stop <=8% | near SMA50 (<=5%) |
|---|---|---|---|---|
| train (279) | +0.145R PF 1.25 | +0.233R PF 1.50 | +0.231R | +0.122R |
| val (93) | +0.075R PF 1.13 | **-0.091R PF 0.82** | -0.376R | -0.598R |
| test (94) | -0.277R PF 0.61 | -0.413R PF 0.36 | -0.480R | -0.442R |

Verdict: NOT validated. The logical anchor stop beats the ATR stop only in train
and degrades out-of-sample; tighter stops (<=8%) and near-SMA50 entries are
worse out-of-sample - tight stops get harvested by noise in this strategy's
exit management. Planned RR >= 1.5 was almost never available (2/1/1 events)
because grounded resistance is usually close. Keep the ATR stop for research
sims; the watchlist still DISPLAYS the hypothetical plan (trigger, stop basis,
stop distance, resistance, RR) as decision support, and ranks on
`compositeScore = P1 x quality(RR, extension)` - transparent but unvalidated,
same forward-test protocol as the rest.

MON forward-freeze: 2026-09-19 close 0.02468, trigger 0.029065 (+17.77% /
2.16 ATR - outside the 1 ATR candidate zone, tracked as an early example).
STRK/AI/SYRUP/XPL already confirmed (above their lines). The jsonl log freezes
both states daily for the candidate->confirm discrimination check.
