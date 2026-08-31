import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseTelegramScanArgs } from './telegram-routes.js';

describe('Telegram live scan command options', () => {
  it('uses crypto 1H for the short /scan form', () => {
    assert.deepEqual(parseTelegramScanArgs([]), {
      mode: 'signals',
      timeframe: '1h',
      marketClass: 'crypto'
    });
  });

  it('accepts timeframe, market and confirmed-flip forms in any useful order', () => {
    assert.deepEqual(parseTelegramScanArgs(['1d', 'crypto']), {
      mode: 'signals',
      timeframe: '1d',
      marketClass: 'crypto'
    });
    assert.deepEqual(parseTelegramScanArgs(['flips', 'weekly']), {
      mode: 'flips',
      timeframe: '1w',
      marketClass: 'ALL'
    });
    assert.deepEqual(parseTelegramScanArgs(['metals', '4h', 'flip']), {
      mode: 'flips',
      timeframe: '4h',
      marketClass: 'metals'
    });
  });

  it('rejects unknown or duplicate options', () => {
    assert.equal(parseTelegramScanArgs(['2h']), undefined);
    assert.equal(parseTelegramScanArgs(['4h', '1d']), undefined);
    assert.equal(parseTelegramScanArgs(['crypto', 'stocks']), undefined);
  });
});
