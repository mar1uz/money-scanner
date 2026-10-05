import { createHash, randomUUID } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';

// Sending to Telegram and writing Firestore cannot be one transaction. A pending
// claim is deliberately never auto-retried: a timeout may have delivered it.
export class TelegramDeliveryGuard {
  constructor(private readonly db: Firestore) {}
  async acquireScan(now = Date.now()): Promise<string | undefined> {
    const owner = randomUUID();
    const ref = this.db.doc('operations/telegram-flip-scan-lock');
    return this.db.runTransaction(async tx => {
      const snapshot = await tx.get(ref);
      if (Number(snapshot.data()?.expiresAt || 0) > now) return undefined;
      tx.set(ref, { owner, expiresAt: now + 30 * 60_000, acquiredAt: now });
      return owner;
    });
  }
  async releaseScan(owner: string): Promise<void> {
    const ref = this.db.doc('operations/telegram-flip-scan-lock');
    await this.db.runTransaction(async tx => {
      const snapshot = await tx.get(ref);
      if (snapshot.data()?.owner === owner) tx.set(ref, { owner, expiresAt: 0 });
    });
  }
  async claim(chatId: string, keys: string[], legacyDelivered: Set<string> = new Set()): Promise<{owner: string; keys: string[]}> {
    const owner = randomUUID();
    const claimed: string[] = [];
    const unique = [...new Set(keys)];
    // Keep transactions bounded below Firestore's write limit.
    for (let i = 0; i < unique.length; i += 200) {
      const part = unique.slice(i, i + 200);
      const accepted = await this.db.runTransaction(async tx => {
        const refs = part.map(key => this.deliveryRef(chatId, key));
        const snapshots = await Promise.all(refs.map(ref => tx.get(ref)));
        const result: string[] = [];
        snapshots.forEach((snapshot, index) => {
          if (snapshot.exists) return;
          const key = part[index];
          const migrated = legacyDelivered.has(key);
          tx.set(refs[index], { chatId, key, owner, status: migrated ? 'sent-legacy' : 'pending', claimedAt: Date.now() });
          if (!migrated) result.push(key);
        });
        return result;
      });
      claimed.push(...accepted);
    }
    return { owner, keys: claimed };
  }
  async suppress(chatId: string, keys: string[], reason: 'historical' | 'invalid'): Promise<void> {
    for (let i = 0; i < keys.length; i += 200) {
      const refs = [...new Set(keys.slice(i, i + 200))].map(key => ({ key, ref: this.deliveryRef(chatId, key) }));
      await this.db.runTransaction(async tx => {
        const snapshots = await Promise.all(refs.map(({ ref }) => tx.get(ref)));
        snapshots.forEach((snapshot, index) => {
          if (!snapshot.exists) tx.set(refs[index].ref, { chatId, key: refs[index].key,
            status: `suppressed-${reason}`, suppressedAt: Date.now() });
        });
      });
    }
  }
  async finish(chatId: string, keys: string[], owner: string, delivered: boolean): Promise<void> {
    for (let i = 0; i < keys.length; i += 200) {
      const batch = this.db.batch();
      for (const key of keys.slice(i, i + 200)) batch.update(this.deliveryRef(chatId, key), {
        owner, status: delivered ? 'sent' : 'uncertain', completedAt: Date.now()
      });
      await batch.commit();
    }
  }
  private deliveryRef(chatId: string, key: string) {
    const id = createHash('sha256').update(`${chatId}:${key}`).digest('hex');
    return this.db.doc(`operations/telegram-flip-deliveries/items/${id}`);
  }
}
