import re, sys

def patch(path, edits):
    with open(path) as f:
        s = f.read()
    for old, new, count in edits:
        if old not in s:
            print(f'ANCHOR MISSING in {path}: {old[:80]!r}')
            sys.exit(1)
        s = s.replace(old, new, count)
    with open(path, 'w') as f:
        f.write(s)
    print(f'patched {path}')

patch('apps/api/src/services/app-state.ts', [
    ("import { DailySmaReclaimRunner } from './daily-sma-reclaim-runner.js';",
     "import { DailySmaReclaimRunner } from './daily-sma-reclaim-runner.js';\nimport { MaCrossAlertRunner } from './ma-cross-alert-runner.js';", 1),
    ("  public dailySmaReclaim = new DailySmaReclaimRunner(this.marketData, this.telegramBot);",
     "  public dailySmaReclaim = new DailySmaReclaimRunner(this.marketData, this.telegramBot);\n  public maCrossAlerts = new MaCrossAlertRunner(this.marketData, this.telegramBot);", 1),
    ("  public runDailySmaReclaimScan(now = Date.now()): Promise<DailySmaReclaimReport> {\n    return this.dailySmaReclaim.run(now);\n  }",
     "  public runDailySmaReclaimScan(now = Date.now()): Promise<DailySmaReclaimReport> {\n    return this.dailySmaReclaim.run(now);\n  }\n\n  public runMaCrossAlertScan(now = Date.now()) {\n    return this.maCrossAlerts.run(now);\n  }", 1),
])
