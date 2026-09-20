# JEV Insight - host-side daily runner

The insight pipeline (`scripts/jev-insight.mjs`) needs `AI_GATEWAY_API_KEY`,
which lives in `jev-router/.env.local`. Marius's standing rule and the
connector sandbox both forbid the bridge from reading `.env` files, so the
LLM leg runs here, in the trusted host context, via a user LaunchAgent.

## What runs

One fixed pipeline, nothing else:

```
source jev-router/.env.local   (key enters the process env only)
deterministic refresh          (scan-1w-parity.ts -> nearflip-ui-top20.mjs -> four-criteria-local.ts)
node scripts/jev-insight.mjs --scan tmp/scans/nearflip-latest.json --ath
                               (near-flip UI Top-20 cohort -> deterministic 1D/1W packet
                                + ATH layer + 4x200 composite -> jev routing -> validated top-10 report)
```

Every scheduled (07:45) or on-demand `run-*`/`nearflip-*` run produces the full
near-flip report: exact current 4x200 composite and supplemental layers with
visible weights, validated top-10, source/missing-data flags, and no
probability fields. `reclaim-*` requests keep the reclaim cohort mode.
If a refresh step fails, the run falls back to the last good scan files and
audits a WARN line.

- No arbitrary shell: request files in `insight/requests/` are pure triggers;
  their names and contents are never read, eval'd, or passed as arguments.
- The key is never printed, logged, copied, or written to any output.
- Outputs only: `tmp/insights/jev-insight-<date>.{json,md}`,
  `tmp/insights/jev-insight-decisions.jsonl`, `insight/audit.log`,
  `insight/last-run.json`, `insight/last-run.log`.

## Install (one double-click)

```
~/antigravity/Money Scanner/insight/install-insight-agent.command
```

After that:
- daily run at 07:45 local (after the deterministic morning scan),
- on-demand: any file dropped into `insight/requests/` triggers a run
  (the bridge does this with a plain file write - no shell needed),
- check status: `insight/run-insight.sh --status`.

## Uninstall

```
launchctl bootout "gui/$(id -u)/no.moneyscanner.jev-insight"
rm ~/Library/LaunchAgents/no.moneyscanner.jev-insight.plist
```
