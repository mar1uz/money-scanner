import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Firestore } from 'firebase-admin/firestore';
import { PriceAlertService, priceAlertTargetHit, type PriceAlertRule } from './price-alert-service.js';

const fakeFirestore = () => ({
  collection: () => ({
    doc: () => ({ set: async () => {}, delete: async () => {} }),
    get: async () => ({ forEach: () => {} })
  })
}) as unknown as Firestore;

const makeService = (price: number, sent: string[] = []) => {
  const marketData = {
    getPriceQuote: async () => ({
      symbol: 'GRASS', price, change24h: 0, high24h: price, low24h: price,
      volume24h: 1, timestamp: 1, source: 'bybit_spot', isStale: false
    })
  };
  const telegramBot = {
    sendMarkdown: async (text: string) => { sent.push(text); return true; },
    getDeliveryConfiguration: () => ({ botConfigured: true, chatConfigured: true, telegramConfigured: true })
  };
  return new PriceAlertService(marketData as never, telegramBot as never, fakeFirestore());
};

const baseInput = { userId: 'u1', symbol: 'GRASS', marketClass: 'crypto' as const, direction: 'above' as const };

describe('priceAlertTargetHit', () => {
  it('hits above only at or over the target', () => {
    assert.equal(priceAlertTargetHit('above', 100, 100), true);
    assert.equal(priceAlertTargetHit('above', 101, 100), true);
    assert.equal(priceAlertTargetHit('above', 99.9, 100), false);
  });
  it('hits below only at or under the target', () => {
    assert.equal(priceAlertTargetHit('below', 100, 100), true);
    assert.equal(priceAlertTargetHit('below', 99, 100), true);
    assert.equal(priceAlertTargetHit('below', 100.1, 100), false);
  });
});

describe('PriceAlertService', () => {
  it('creates, lists and deletes rules scoped to the user', async () => {
    const service = makeService(50);
    const rule = await service.createRule({ ...baseInput, targetPrice: 100 });
    assert.equal(rule.symbol, 'GRASS');
    assert.equal(service.listRules('u1', 'GRASS').length, 1);
    assert.equal(service.listRules('u2', 'GRASS').length, 0);
    assert.equal(await service.deleteRule('u2', rule.id), false);
    assert.equal(await service.deleteRule('u1', rule.id), true);
    assert.equal(service.listRules('u1').length, 0);
  });

  it('deduplicates an identical enabled rule', async () => {
    const service = makeService(50);
    const first = await service.createRule({ ...baseInput, targetPrice: 100 });
    const second = await service.createRule({ ...baseInput, targetPrice: 100 });
    assert.equal(first.id, second.id);
  });

  it('fires a Telegram message once when the target is reached and retires the rule', async () => {
    const sent: string[] = [];
    const service = makeService(150, sent);
    await service.createRule({ ...baseInput, targetPrice: 100 });
    await service.checkAllPriceAlerts();
    assert.equal(sent.length, 1);
    assert.match(sent[0], /ALERTĂ PREȚ ATINSĂ/);
    assert.match(sent[0], /GRASS/);
    assert.match(sent[0], /BYBIT SPOT/);
    await service.checkAllPriceAlerts();
    assert.equal(sent.length, 1);
  });

  it('does not fire while the price stays on the other side of the target', async () => {
    const sent: string[] = [];
    const service = makeService(90, sent);
    await service.createRule({ ...baseInput, targetPrice: 100 });
    await service.checkAllPriceAlerts();
    assert.equal(sent.length, 0);
    const rule = service.listRules('u1')[0] as PriceAlertRule;
    assert.equal(rule.isEnabled, true);
    assert.equal(rule.lastPrice, 90);
  });

  it('fires a below-direction alert when price drops to the target', async () => {
    const sent: string[] = [];
    const service = makeService(80, sent);
    await service.createRule({ ...baseInput, targetPrice: 100, direction: 'below' });
    await service.checkAllPriceAlerts();
    assert.equal(sent.length, 1);
  });

  it('records lastError instead of throwing when the quote lookup fails', async () => {
    const marketData = { getPriceQuote: async () => { throw new Error('provider down'); } };
    const telegramBot = {
      sendMarkdown: async () => true,
      getDeliveryConfiguration: () => ({ botConfigured: true, chatConfigured: true, telegramConfigured: true })
    };
    const service = new PriceAlertService(marketData as never, telegramBot as never, fakeFirestore());
    await service.createRule({ ...baseInput, targetPrice: 100 });
    await service.checkAllPriceAlerts();
    assert.equal(service.listRules('u1')[0]?.lastError, 'provider down');
  });
});
