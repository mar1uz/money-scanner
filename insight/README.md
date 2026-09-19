# JEV Insight - host-side daily runner

The insight pipeline (`scripts/jev-insight.mjs`) needs `AI_GATEWAY_API_KEY`,
which lives in `jev-router/.env.local`. Marius's standing rule and the
connector sandbox both forbid the bridge from reading `.env` files, so the
LLM leg runs here, in the trusted host context, via a user LaunchAgent.

## What runs

One fixed pipeline, nothing else:

```
source jev-router/.env.local   (key enters the process env only)
node scripts/jev-insight.mjs   (deterministic 1D/1W packet -> jev routing -> validated top-10 report)
```

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
