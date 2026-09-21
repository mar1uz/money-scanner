import sys

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
    ("import { MaCrossAlertRunner } from './ma-cross-alert-runner.js';",
     "import { MaCrossAlertRunner } from './ma-cross-alert-runner.js';\nimport { StructureScannerRunner } from './structure-scanner-runner.js';", 1),
    ("  public maCrossAlerts = new MaCrossAlertRunner(this.marketData, this.telegramBot);",
     "  public maCrossAlerts = new MaCrossAlertRunner(this.marketData, this.telegramBot);\n  public structureScanner = new StructureScannerRunner(this.marketData);", 1),
    ("  public runMaCrossAlertScan(now = Date.now()) {\n    return this.maCrossAlerts.run(now);\n  }",
     "  public runMaCrossAlertScan(now = Date.now()) {\n    return this.maCrossAlerts.run(now);\n  }\n\n  public runStructureScannerScan(now = Date.now()) {\n    return this.structureScanner.run(now);\n  }", 1),
    ("  private lastMaCrossScanDateOslo?: string;",
     "  private lastMaCrossScanDateOslo?: string;\n  private lastStructureScanKey?: string;", 1),
    ("          this.runMaCrossAlertScan().catch(error => console.error('Automated 08:00 Europe/Oslo MA cross scan failed:', error));\n        }",
     """          this.runMaCrossAlertScan().catch(error => console.error('Automated 08:00 Europe/Oslo MA cross scan failed:', error));
        }

        // Paper structure scanner on 4H/8H/1D candle closes (every 4h UTC boundary)
        const utcNow = new Date();
        const structureKey = utcNow.toISOString().slice(0, 13);
        if (utcNow.getUTCHours() % 4 === 0 && utcNow.getUTCMinutes() <= 5 && this.lastStructureScanKey !== structureKey) {
          this.lastStructureScanKey = structureKey;
          this.runStructureScannerScan().catch(error => console.error('Structure scanner scan failed:', error));
        }""", 1),
])

patch('apps/api/src/server.ts', [
    ("      || req.path === '/alerts/ma-cross/scheduled'",
     "      || req.path === '/alerts/ma-cross/scheduled'\n      || req.path === '/alerts/structure-scanner/scheduled'", 1),
])

patch('apps/api/src/routes/telegram-routes.ts', [
    ("""// Dedicated Cloud Scheduler target for the 2x2 MA cross/retest daily pass.""",
     """// Paper-only structure scanner pass (4H/8H/1D closes). Logs to Firestore, never sends Telegram.
telegramRouter.post('/alerts/structure-scanner/scheduled', async (req, res) => {
  if (!validateScheduledRequestToken(req.get('x-daily-scan-token'))) {
    return res.status(401).json({ error: 'Invalid daily scan token.' });
  }
  const report = await AppState.getInstance().runStructureScannerScan();
  res.set('Cache-Control', 'no-store');
  return res.json(report);
});

// Dedicated Cloud Scheduler target for the 2x2 MA cross/retest daily pass.""", 1),
])
