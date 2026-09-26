/**
 * Read-only chart-market diagnostics (resolver health + pin health).
 *
 * Operational purpose: answer the questions the 2026-09-25 resolver audit
 * could not answer from production — how many resolutions ran, where they
 * spent upstream requests, which sources failed (and with which HTTP status),
 * and what state the Firestore pins are in (including dead/unaudited ones).
 *
 * Auth posture: same as `/api/health` (public, allow-listed in `server.ts`).
 * Payload contains no credentials and no user data: symbols, CoinGecko IDs,
 * upstream hostnames, probe names, HTTP statuses and pin audit timestamps.
 */
import { Router } from 'express';
import { getChartMarketDiagnosticsSnapshot } from '@money-scanner/market-data';
import { AppState } from '../services/app-state.js';

export const chartMarketDiagnosticsRouter = Router();

/** Unhealthy pins first: dead, then unverified/unobserved, then healthy. */
const HEALTH_ORDER: Record<string, number> = { dead: 0, unverified: 1, unobserved: 2, healthy: 3 };
const MAX_PIN_ENTRIES = 200;

chartMarketDiagnosticsRouter.get('/chart-market-diagnostics', async (_req, res) => {
  const resolver = getChartMarketDiagnosticsSnapshot();
  const inventory = await AppState.getInstance().listChartMarketPins();
  const byHealth: Record<string, number> = {};
  let oldestCheckAt: number | null = null;
  for (const pin of inventory.pins) {
    const health = pin.audit?.health ?? 'unobserved';
    byHealth[health] = (byHealth[health] ?? 0) + 1;
    const checkedAt = pin.audit?.lastCheckedAt ?? pin.resolvedAt;
    if (typeof checkedAt === 'number' && (oldestCheckAt === null || checkedAt < oldestCheckAt)) oldestCheckAt = checkedAt;
  }
  const entries = [...inventory.pins]
    .sort((a, b) => (HEALTH_ORDER[a.audit?.health ?? 'unobserved'] ?? 9) - (HEALTH_ORDER[b.audit?.health ?? 'unobserved'] ?? 9))
    .slice(0, MAX_PIN_ENTRIES);
  res.json({
    service: 'market-scanner-360-api',
    route: 'chart-market-diagnostics',
    timestamp: Date.now(),
    resolver,
    pins: {
      supported: inventory.supported,
      count: inventory.count,
      byHealth,
      oldestCheckAt,
      entries,
      note: 'health/reason/lastCheckedAt are written by the resolver pin-health cycle; legacy documents report health "unobserved" until their first check'
    }
  });
});
