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
    ("  private lastScheduledScanDateBucharest?: string;",
     "  private lastScheduledScanDateBucharest?: string;\n  private lastMaCrossScanDateOslo?: string;", 1),
    ("          this.runDailyRegimeScan().catch(error => console.error('Automated 08:00 AM scan failed:', error));\n        }",
     """          this.runDailyRegimeScan().catch(error => console.error('Automated 08:00 AM scan failed:', error));
        }

        // Automated daily 08:00 Europe/Oslo 2x2 MA cross/retest alert pass
        const osloTime = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Europe/Oslo',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        }).format(new Date());
        const [osloDate, osloTimePart] = osloTime.split(', ');
        const [osloHour, osloMinute] = (osloTimePart || '').split(':').map(Number);
        if (osloHour === 8 && osloMinute <= 5 && this.lastMaCrossScanDateOslo !== osloDate) {
          this.lastMaCrossScanDateOslo = osloDate;
          this.runMaCrossAlertScan().catch(error => console.error('Automated 08:00 Europe/Oslo MA cross scan failed:', error));
        }""", 1),
])

patch('apps/api/src/server.ts', [
    ("      || req.path === '/alerts/daily-sma-reclaim/scheduled'",
     "      || req.path === '/alerts/daily-sma-reclaim/scheduled'\n      || req.path === '/alerts/ma-cross/scheduled'", 1),
])

patch('apps/api/src/routes/telegram-routes.ts', [
    ("""telegramRouter.post('/alerts/daily-sma-reclaim/scheduled', async (req, res) => {
  if (!validateScheduledRequestToken(req.get('x-daily-scan-token'))) {
    return res.status(401).json({ error: 'Invalid daily scan token.' });
  }
  const report = await AppState.getInstance().runDailySmaReclaimScan();
  res.set('Cache-Control', 'no-store');
  return res.json(report);
});""",
     """telegramRouter.post('/alerts/daily-sma-reclaim/scheduled', async (req, res) => {
  if (!validateScheduledRequestToken(req.get('x-daily-scan-token'))) {
    return res.status(401).json({ error: 'Invalid daily scan token.' });
  }
  const report = await AppState.getInstance().runDailySmaReclaimScan();
  res.set('Cache-Control', 'no-store');
  return res.json(report);
});

// Dedicated Cloud Scheduler target for the 2x2 MA cross/retest daily pass.
telegramRouter.post('/alerts/ma-cross/scheduled', async (req, res) => {
  if (!validateScheduledRequestToken(req.get('x-daily-scan-token'))) {
    return res.status(401).json({ error: 'Invalid daily scan token.' });
  }
  const report = await AppState.getInstance().runMaCrossAlertScan();
  res.set('Cache-Control', 'no-store');
  return res.json(report);
});""", 1),
])
