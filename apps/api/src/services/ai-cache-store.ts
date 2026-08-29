import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export interface PersistentAICacheEntry<T> {
  payload: T;
  updatedAt: number;
}

const aiCacheDocument = (key: string) => {
  const app = getApps()[0] || initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0610749770'
  });
  return getFirestore(app, 'money-scanner-360').doc(`operations/ai-cache-${key}`);
};

export async function readPersistentAICache<T>(key: string): Promise<PersistentAICacheEntry<T> | undefined> {
  try {
    const snapshot = await aiCacheDocument(key).get();
    if (!snapshot.exists) return undefined;
    const data = snapshot.data() as PersistentAICacheEntry<T> | undefined;
    if (!data || !Number.isFinite(data.updatedAt) || data.payload === undefined) return undefined;
    return data;
  } catch (error) {
    console.warn(`AI cache restore failed for ${key}:`, error instanceof Error ? error.message : error);
    return undefined;
  }
}

export async function writePersistentAICache<T>(key: string, entry: PersistentAICacheEntry<T>): Promise<void> {
  try {
    // Firestore rejects undefined values. JSON normalization also guarantees
    // the persisted response has the same shape returned by the API.
    const normalized = JSON.parse(JSON.stringify(entry));
    await aiCacheDocument(key).set(normalized);
  } catch (error) {
    // A temporary Firestore issue must not take the live AI route down; the
    // in-memory cache remains available on the current Cloud Run instance.
    console.warn(`AI cache persistence failed for ${key}:`, error instanceof Error ? error.message : error);
  }
}
