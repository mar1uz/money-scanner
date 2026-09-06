import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import type { RadarSnapshot, RadarBaseline, RadarPost, RadarReportSummary } from '@money-scanner/shared';
const clean = (x: unknown) => JSON.parse(JSON.stringify(x));
export function radarDb() { const app = getApps()[0] || initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0610749770' }); return getFirestore(app, 'money-scanner-360'); }
const key = (id: string) => encodeURIComponent(id);
export class RadarStore {
    constructor(private db = radarDb()) { }
    async latest(kind: 'collection' | 'report'): Promise<RadarSnapshot | null> { return (await this.db.doc(`radar-state/${kind}`).get()).data()?.snapshot || null; }
    async report(id: string): Promise<RadarSnapshot | null> { return (await this.db.doc(`radar-reports/${id}`).get()).data() as RadarSnapshot || null; }
    async history(): Promise<RadarReportSummary[]> { const q = await this.db.collection('radar-reports').orderBy('generatedAt', 'desc').limit(30).get(); return q.docs.map(d => ({ id: d.id, generatedAt: d.data().generatedAt, count: d.data().rows?.length || 0 })); }
    async baselines(ids: string[]): Promise<RadarBaseline[]> { if (!ids.length)
        return []; const docs = await this.db.getAll(...ids.map(id => this.db.doc(`radar-tokens/${key(id)}`))); return docs.filter(d => d.exists).map(d => d.data() as RadarBaseline); }
    async posts(): Promise<RadarPost[]> { const docs = await this.db.collection('radar-social-window').get(); return docs.docs.flatMap(d => d.data().posts || []); }
    async acquire(): Promise<string | null> { const token = randomUUID(); return this.db.runTransaction(async (tx) => { const ref = this.db.doc('radar-state/lease'), d = (await tx.get(ref)).data(); if (d?.expiresAt > Date.now())
        return null; tx.set(ref, { token, expiresAt: Date.now() + 8 * 60000 }); return token; }); }
    async release(token: string) { await this.db.runTransaction(async (tx) => { const ref = this.db.doc('radar-state/lease'); if ((await tx.get(ref)).data()?.token === token)
        tx.delete(ref); }); }
    async saveCollection(snapshot: RadarSnapshot, posts: RadarPost[], token: string) {
        const chunks = Array.from({ length: 15 }, (_, i) => posts.slice(i * 100, (i + 1) * 100));
        await this.db.runTransaction(async (tx) => {
            const lock = (await tx.get(this.db.doc('radar-state/lease'))).data();
            if (lock?.token !== token || lock.expiresAt < Date.now())
                throw new Error('Scan lease expired');
            tx.set(this.db.doc('radar-state/collection'), { snapshot: clean(snapshot) });
            // Fixed chunk count replaces the previous rolling window; no unbounded raw post storage.
            chunks.forEach((p, i) => tx.set(this.db.doc(`radar-social-window/${i}`), { posts: clean(p) }));
        });
    }
    async saveReport(snapshot: RadarSnapshot, token: string): Promise<RadarSnapshot> {
        return this.db.runTransaction(async (tx) => {
            const lock = (await tx.get(this.db.doc('radar-state/lease'))).data();
            if (lock?.token !== token || lock.expiresAt < Date.now())
                throw new Error('Report lease expired');
            const ref = this.db.doc(`radar-reports/${snapshot.id}`), existing = await tx.get(ref);
            if (existing.exists)
                return existing.data() as RadarSnapshot;
            const normalized = clean(snapshot) as RadarSnapshot;
            for (const row of normalized.rows) {
                if (row.firstPrice === null) {
                    row.firstPrice = row.price;
                    row.firstReportedAt = normalized.generatedAt;
                    row.changeFirst = 0;
                    tx.set(this.db.doc(`radar-tokens/${key(row.id)}`), { id: row.id, firstPrice: row.price, firstReportedAt: normalized.generatedAt });
                }
            }
            tx.create(ref, normalized);
            tx.set(this.db.doc('radar-state/report'), { snapshot: normalized });
            return normalized;
        });
    }
    async claimDelivery(reportId: string): Promise<boolean> { return this.db.runTransaction(async (tx) => { const ref = this.db.doc(`radar-delivery/${reportId}`), d = await tx.get(ref); if (d.exists)
        return false; tx.create(ref, { status: 'sending', startedAt: Date.now() }); return true; }); }
    async delivery(reportId: string) { return (await this.db.doc(`radar-delivery/${reportId}`).get()).data() || null; }
    async deliveryResult(reportId: string, status: string, detail: string) { await this.db.doc(`radar-delivery/${reportId}`).set({ status, detail, updatedAt: Date.now() }, { merge: true }); }
}
