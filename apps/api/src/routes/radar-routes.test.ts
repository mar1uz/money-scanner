import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { radarRouter } from './radar-routes.js';
async function withServer(run: (url: string) => Promise<void>) { const app = express(); app.use(express.json()); app.use('/api', radarRouter); const server = app.listen(0); await new Promise<void>(resolve => server.once('listening', resolve)); try {
    await run(`http://127.0.0.1:${(server.address() as any).port}`);
}
finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
} }
test('scheduled scan rejects missing/invalid secret without executing collectors', async () => { await withServer(async (url) => { for (const headers of [{}, { 'x-daily-scan-token': 'incorrect' }]) {
    const r = await fetch(url + '/api/radar/scheduled', { method: 'POST', headers: headers as any });
    assert.equal(r.status, 401);
} }); });
test('manual scan rejects missing CSRF before executing collectors', async () => { await withServer(async (url) => { const r = await fetch(url + '/api/radar/scan', { method: 'POST' }); assert.equal(r.status, 403); assert.match((await r.json() as any).error, /CSRF/); }); });
test('history rejects invalid document identifiers', async () => { await withServer(async (url) => { const r = await fetch(url + '/api/radar/reports/not-a-slot'); assert.equal(r.status, 400); }); });
