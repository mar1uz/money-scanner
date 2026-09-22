import { Router } from 'express';
import { REGIME_TAPE_DISCLOSURE, REGIME_TAPE_VERSION, Timeframe } from '@money-scanner/shared';
import { AppState } from '../services/app-state.js';
import { validateScheduledRequestToken } from '../services/scheduler-auth.js';
import { buildXPreview } from '../services/regime-tape-service.js';
import { REGIME_TAPE_PAGE_HTML } from '../services/regime-tape-page.js';
import { readAiContentTake } from './ai-routes.js';

export const tapeRouter = Router();

const VALID_TIMEFRAMES = new Set(['1d', '1w']);

// Cloud Scheduler target. Same constant-time token check as the other
// scheduled scans; deliberately outside browser session auth.
tapeRouter.post('/tape/scan', async (req, res) => {
  if (!validateScheduledRequestToken(req.get('x-daily-scan-token'))) {
    return res.status(401).json({ error: 'Invalid daily scan token.' });
  }
  const report = await AppState.getInstance().regimeTape.run();
  res.set('Cache-Control', 'no-store');
  return res.json(report);
});

// Public proof is bounded and delayed. It exposes selected after-the-fact
// evidence, never the exhaustive event tape or live regime data.
tapeRouter.get('/tape/proof', async (_req, res) => {
  const approvedSymbols = new Set((process.env.PUBLIC_TAPE_PROOF_SYMBOLS || '').split(',').map(value => value.trim().toUpperCase()).filter(Boolean));
  const appState = AppState.getInstance();
  const evidence = approvedSymbols.size
    ? await appState.getPublicTapeProof(approvedSymbols, 20, 6)
    : [];
  // Current regime per proof asset: latest taped tier for the symbol (the
  // tape tracks 1d/1w regimes; proof flips are 4h/8h, so match by symbol).
  // Events arrive newest-first. Bounded to published proof assets.
  let regimeByAsset = new Map<string, string>();
  try {
    const events = await appState.regimeTape.getEvents(500);
    for (const event of events) {
      const key = event.symbol.toUpperCase();
      if (!regimeByAsset.has(key)) regimeByAsset.set(key, event.tier);
    }
  } catch { /* regime is optional on the public proof */ }
  const evidenceWithRegime = evidence.map(item => ({
    ...item,
    currentRegime: regimeByAsset.get(item.asset.toUpperCase()) ?? null
  }));
  // The day's AI briefing highlights for the public tape (EN copy, max 3).
  let briefing: { generatedAt: number; highlights: string[] } | null = null;
  try {
    const take = await readAiContentTake('briefing', 'en');
    if (take) {
      const highlights = [take.headline, ...(take.bullets ?? []).slice(0, 2)].filter(Boolean).slice(0, 3);
      if (highlights.length) briefing = { generatedAt: take.generatedAt, highlights };
    }
  } catch { /* briefing is optional on the public tape */ }
  res.set('Cache-Control', 'public, max-age=300');
  return res.json({ disclosure: REGIME_TAPE_DISCLOSURE, tapeVersion: REGIME_TAPE_VERSION,
    selection: { minimumReturnPct: 20, maximumItems: 6, curated: true }, updatedAt: new Date().toISOString(),
    evidence: evidenceWithRegime, briefing });
});

// Authenticated product endpoints. Global middleware protects these paths.
tapeRouter.get('/tape/events', async (req, res) => {
  const limit = Math.min(Math.max(parseInt(String(req.query.limit || '100'), 10) || 100, 1), 500);
  const symbol = typeof req.query.symbol === 'string' && /^[A-Za-z0-9._-]{1,30}$/.test(req.query.symbol) ? req.query.symbol : undefined;
  const timeframe = typeof req.query.timeframe === 'string' && VALID_TIMEFRAMES.has(req.query.timeframe) ? (req.query.timeframe as Timeframe) : undefined;
  const events = await AppState.getInstance().regimeTape.getEvents(limit, symbol, timeframe);
  res.set('Cache-Control', 'private, no-store');
  return res.json({ disclosure: REGIME_TAPE_DISCLOSURE, tapeVersion: REGIME_TAPE_VERSION, count: events.length, events });
});

tapeRouter.get('/tape/summary', async (_req, res) => {
  const appState = AppState.getInstance();
  const [latestScan, waitlistTotal] = await Promise.all([appState.regimeTape.getLatestScan(), appState.regimeTape.getWaitlistCount()]);
  res.set('Cache-Control', 'private, no-store');
  return res.json({ disclosure: REGIME_TAPE_DISCLOSURE, tapeVersion: REGIME_TAPE_VERSION, latestScan, waitlistTotal });
});

tapeRouter.get('/tape/x-preview', async (_req, res) => {
  const appState = AppState.getInstance();
  const latestScan = await appState.regimeTape.getLatestScan();
  if (!latestScan) return res.json({ text: null, reason: 'No scan recorded yet.' });
  const dayStart = new Date(latestScan.startedAt); dayStart.setUTCHours(0, 0, 0, 0);
  const events = (await appState.regimeTape.getEvents(200)).filter(event => event.candleCloseTime >= dayStart.getTime() - 2 * 86_400_000);
  res.set('Cache-Control', 'private, no-store');
  return res.json({ text: buildXPreview(events, latestScan), scanId: latestScan.id });
});

tapeRouter.post('/tape/waitlist', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email : '';
  const source = typeof req.body?.source === 'string' ? req.body.source : undefined;
  const pricePointEur = typeof req.body?.pricePointEur === 'number' ? req.body.pricePointEur : undefined;
  try {
    const result = await AppState.getInstance().regimeTape.addWaitlistEntry(email, source, pricePointEur, req.get('user-agent'));
    res.set('Cache-Control', 'no-store');
    return res.status(result.added ? 201 : 200).json(result);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid waitlist entry.' });
  }
});

export const tapePageHandler = (_req: unknown, res: { set: (k: string, v: string) => void; type: (t: string) => { send: (b: string) => void } }) => {
  res.set('Cache-Control', 'no-store');
  res.type('html').send(REGIME_TAPE_PAGE_HTML);
};


