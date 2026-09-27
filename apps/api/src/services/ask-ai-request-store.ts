import { randomUUID } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

/** User-originated requests only; this queue does not itself generate or send analysis. */
export interface AskAiRequest {
  id: string;
  ownerId: string;
  symbol: string;
  marketClass: 'crypto' | 'stocks' | 'metals';
  coinGeckoId?: string;
  requestedAt: number;
  status: 'queued';
  source: 'money-scanner-web';
}

const db = () => {
  const app = getApps()[0] || initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0610749770' });
  return getFirestore(app, 'money-scanner-360');
};

export async function queueAskAiRequest(ownerId: string, symbol: string, marketClass: AskAiRequest['marketClass'], coinGeckoId?: string): Promise<{ id: string; queued: true; duplicate: boolean }> {
  const store = db();
  const key = `${ownerId}:${marketClass}:${symbol}`;
  const guard = store.collection('ask-ai-request-guards').doc(key);
  const now = Date.now();
  const id = randomUUID();
  return store.runTransaction(async tx => {
    const last = await tx.get(guard);
    const previous = last.data() as { id?: string; requestedAt?: number } | undefined;
    if (previous?.id && previous.requestedAt && now - previous.requestedAt < 60_000) {
      return { id: previous.id, queued: true, duplicate: true };
    }
    const request: AskAiRequest = {
      id, ownerId, symbol, marketClass, requestedAt: now, status: 'queued', source: 'money-scanner-web',
      ...(coinGeckoId ? { coinGeckoId } : {})
    };
    tx.create(store.collection('ask-ai-requests').doc(id), request);
    tx.set(guard, { id, requestedAt: now });
    return { id, queued: true, duplicate: false };
  });
}

/** Public signal only: do not return request IDs, symbols, timestamps or owner data. */
export async function hasPendingAskAiRequests(): Promise<boolean> {
  const snapshot = await db().collection('ask-ai-requests').where('status', '==', 'queued').limit(1).get();
  return !snapshot.empty;
}
