import { Router } from 'express';
import { REGIME_TAPE_DISCLOSURE, REGIME_TAPE_VERSION, Timeframe } from '@money-scanner/shared';
import { AppState } from '../services/app-state.js';
import { validateScheduledRequestToken } from '../services/scheduler-auth.js';
import { buildXPreview } from '../services/regime-tape-service.js';
import { REGIME_TAPE_PAGE_HTML } from '../services/regime-tape-page.js';
import { readAiContentTake } from './ai-routes.js';
import { readPersistentAICache } from '../services/ai-cache-store.js';

// Minimal structural view of the cached Business Quality report. The public
// tape reads only these fields and never exposes internal ranking scores.
interface TapeBqReport {
  generatedAt?: number;
  assets?: Array<{
    id: string;
    metrics: {
      fees30d?: number;
      revenue30d?: number;
      holdersRevenue30d?: number;
      feeRunRateChange?: number;
      tvlChange7d?: number;
    };
  }>;
  undervalued?: Array<{ assetId: string; symbol: string; name: string; priceChange7d?: number; valuationRatio?: number; valuationBasis?: string }>;
}

interface TapeBriefingSection {
  key: string;
  title: string;
  headline: string | null;
  paragraphs: string[];
  bullets: string[];
}

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
  // The day's AI briefing for the public tape (EN copy): a 3-line summary
  // plus the full daily briefing mirrored from the app's AI Briefing page
  // (without the "Sources used" block, which the takes never carry).
  // Public-surface rule (Marius, 2026-09-22): price/percent/context lines
  // only - never internal score numbers or score jargon; they mean nothing
  // to outside readers. Plain market language ("momentum") is fine.
  const SCORE_WORDS = /\bjev\b|\bcombined\b|\bcomposite\b|\bscores?\b/i;
  const SCORE_LIST = /[A-Z]{2,6}\s+\d{1,3}\.\d(?![\d%])/;
  const AT_SCORE = /\bat\s+\d{1,3}\.\d(?![\d%])/i;
  const isContextLine = (line: string): boolean =>
    Boolean(line) && !SCORE_WORDS.test(line) && !SCORE_LIST.test(line) && !AT_SCORE.test(line);
  let briefing: { generatedAt: number; highlights: string[] } | null = null;
  let briefingFull: { generatedAt: number; sections: TapeBriefingSection[] } | null = null;
  try {
    const BRIEFING_KEYS: Array<[string, string]> = [
      ['briefing', 'Daily Briefing'],
      ['capital-rotation', 'Capital Rotation'],
      ['market-intelligence', 'Market Intelligence'],
      ['intelligence-brief', 'Intelligence Brief']
    ];
    const candidates: string[] = [];
    const sections: TapeBriefingSection[] = [];
    let generatedAt = 0;
    for (const [key, title] of BRIEFING_KEYS) {
      const take = await readAiContentTake(key, 'en');
      if (!take) continue;
      generatedAt = Math.max(generatedAt, take.generatedAt);
      if (take.headline) candidates.push(take.headline);
      for (const bullet of take.bullets ?? []) candidates.push(bullet);
      const headline = take.headline && isContextLine(take.headline) ? take.headline : null;
      const paragraphs = (take.paragraphs ?? []).filter(isContextLine);
      const bullets = (take.bullets ?? []).filter(isContextLine);
      if (headline || paragraphs.length || bullets.length) sections.push({ key, title, headline, paragraphs, bullets });
    }
    const seen = new Set<string>();
    const highlights = candidates.filter(isContextLine).filter(line => {
      const k = line.trim().toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).slice(0, 3);
    if (highlights.length) briefing = { generatedAt, highlights };
    if (sections.length) briefingFull = { generatedAt, sections };
  } catch { /* briefing is optional on the public tape */ }
  // Top 5 undervalued from the Business Quality screen - public and free for
  // now (Marius, 2026-09-22). Real protocol inputs only; the internal quality
  // and valuation scores never leave the product. Serves the latest cached
  // daily scan; a public route must never trigger a rescan.
  let businessQuality: { generatedAt: number; entries: Array<{
    symbol: string; name: string; fees30d: number; revenue30d: number;
    holderValue30d: number; growthRunRatePct: number | null; priceChange7d: number | null;
    valuationRatio: number | null; valuationBasis: string | null;
  }> } | null = null;
  try {
    const cached = await readPersistentAICache<TapeBqReport>('crypto-four-criteria-top-200');
    if (cached?.payload) {
      const byId = new Map((cached.payload.assets ?? []).map(asset => [asset.id, asset]));
      const entries = (cached.payload.undervalued ?? []).slice(0, 5).map(entry => {
        const asset = byId.get(entry.assetId);
        const growthCandidates = [asset?.metrics.tvlChange7d, asset?.metrics.feeRunRateChange]
          .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
        return {
          symbol: entry.symbol,
          name: entry.name,
          fees30d: asset?.metrics.fees30d ?? 0,
          revenue30d: asset?.metrics.revenue30d ?? 0,
          holderValue30d: asset?.metrics.holdersRevenue30d ?? 0,
          growthRunRatePct: growthCandidates.length ? Math.max(...growthCandidates) : null,
          priceChange7d: typeof entry.priceChange7d === 'number' && Number.isFinite(entry.priceChange7d) ? entry.priceChange7d : null,
          valuationRatio: typeof entry.valuationRatio === 'number' && Number.isFinite(entry.valuationRatio) ? entry.valuationRatio : null,
          valuationBasis: entry.valuationBasis ?? null
        };
      });
      if (entries.length) businessQuality = { generatedAt: cached.payload.generatedAt ?? cached.updatedAt, entries };
    }
  } catch { /* business quality is optional on the public tape */ }
  res.set('Cache-Control', 'public, max-age=300');
  return res.json({ disclosure: REGIME_TAPE_DISCLOSURE, tapeVersion: REGIME_TAPE_VERSION,
    selection: { minimumReturnPct: 20, maximumItems: 6, curated: true }, updatedAt: new Date().toISOString(),
    evidence: evidenceWithRegime, briefing, briefingFull, businessQuality });
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


