import { Router } from 'express';
import { AuthenticatedRequest, validateCsrfToken } from '../middleware/auth.js';
import { validateScheduledRequestToken } from '../services/scheduler-auth.js';
import { RadarStore } from '../services/radar/store.js';
import { runRadar } from '../services/radar/service.js';
export const radarRouter = Router();
radarRouter.get('/radar', async (req, res) => { try {
    const store = new RadarStore();
    const [latest, collection, history] = await Promise.all([store.latest('report'), store.latest('collection'), store.history()]);
    res.set('Cache-Control', 'no-store');
    res.json({ latest, collection, history, delivery: latest ? await store.delivery(latest.id) : null, telegramConfigured: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) });
}
catch {
    res.status(503).json({ error: 'Radar storage unavailable' });
} });
radarRouter.get('/radar/reports/:id', async (req, res) => { if (!/^\d{13}$/.test(req.params.id))
    return res.status(400).json({ error: 'Invalid report id' }); try {
    const report = await new RadarStore().report(req.params.id);
    return report ? res.json(report) : res.status(404).json({ error: 'Report not found' });
}
catch {
    return res.status(503).json({ error: 'Radar storage unavailable' });
} });
radarRouter.post('/radar/scan', async (req: AuthenticatedRequest, res) => { if (!validateCsrfToken(req))
    return res.status(403).json({ error: 'Invalid CSRF token' }); if (req.user?.role !== 'Administrator')
    return res.status(403).json({ error: 'Administrator required' }); try {
    return res.json(await runRadar(false));
}
catch (e) {
    return res.status(503).json({ error: (e as Error).message });
} });
radarRouter.post('/radar/scheduled', async (req, res) => { if (!validateScheduledRequestToken(req.get('x-daily-scan-token')))
    return res.status(401).json({ error: 'Invalid scheduler token' }); try {
    return res.json(await runRadar(req.body?.publish === true));
}
catch (e) {
    return res.status(503).json({ error: (e as Error).message });
} });
