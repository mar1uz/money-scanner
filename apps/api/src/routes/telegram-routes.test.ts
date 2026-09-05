import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseTelegramScanArgs, FLIP_SCAN_PRESETS } from './telegram-routes.js';

describe('Telegram live scan command options', () => {
  it('uses crypto 1H for the short /scan form', () => {
    assert.deepEqual(parseTelegramScanArgs([]), {
      mode: 'signals',
      timeframe: '1h',
      marketClass: 'crypto',
      direction: 'ALL'
    });
  });

  it('accepts timeframe, market and confirmed-flip forms in any useful order', () => {
    assert.deepEqual(parseTelegramScanArgs(['1d', 'crypto']), {
      mode: 'signals',
      timeframe: '1d',
      marketClass: 'crypto',
      direction: 'ALL'
    });
    assert.deepEqual(parseTelegramScanArgs(['flips', 'weekly']), {
      mode: 'flips',
      timeframe: '1w',
      marketClass: 'ALL',
      direction: 'ALL'
    });
    assert.deepEqual(parseTelegramScanArgs(['metals', '4h', 'flip']), {
      mode: 'flips',
      timeframe: '4h',
      marketClass: 'metals',
      direction: 'ALL'
    });
  });

  it('accepts bullish/bearish direction filters for flips', () => {
    assert.deepEqual(parseTelegramScanArgs(['flips', '1w', 'crypto', 'bullish']), {
      mode: 'flips',
      timeframe: '1w',
      marketClass: 'crypto',
      direction: 'BULLISH'
    });
    assert.deepEqual(parseTelegramScanArgs(['flips', '1w', 'stocks', 'bear']), {
      mode: 'flips',
      timeframe: '1w',
      marketClass: 'stocks',
      direction: 'BEARISH'
    });
    assert.deepEqual(parseTelegramScanArgs(['bull', 'flips', '1w']), {
      mode: 'flips',
      timeframe: '1w',
      marketClass: 'ALL',
      direction: 'BULLISH'
    });
  });

  it('rejects unknown, duplicate or misplaced options', () => {
    assert.equal(parseTelegramScanArgs(['2h']), undefined);
    assert.equal(parseTelegramScanArgs(['4h', '1d']), undefined);
    assert.equal(parseTelegramScanArgs(['crypto', 'stocks']), undefined);
    assert.equal(parseTelegramScanArgs(['flips', 'bullish', 'bearish']), undefined);
    assert.equal(parseTelegramScanArgs(['4h', 'bullish']), undefined);
  });

  it('maps every flips preset to 1w market + direction', () => {
    assert.deepEqual(FLIP_SCAN_PRESETS['flips'], { marketClass: 'ALL', direction: 'ALL' });
    assert.deepEqual(FLIP_SCAN_PRESETS['flips_crypto'], { marketClass: 'crypto', direction: 'ALL' });
    assert.deepEqual(FLIP_SCAN_PRESETS['flips_stocks'], { marketClass: 'stocks', direction: 'ALL' });
    assert.deepEqual(FLIP_SCAN_PRESETS['flips_bull'], { marketClass: 'ALL', direction: 'BULLISH' });
    assert.deepEqual(FLIP_SCAN_PRESETS['flips_bear'], { marketClass: 'ALL', direction: 'BEARISH' });
    assert.deepEqual(FLIP_SCAN_PRESETS['flips_crypto_bull'], { marketClass: 'crypto', direction: 'BULLISH' });
    assert.deepEqual(FLIP_SCAN_PRESETS['flips_crypto_bear'], { marketClass: 'crypto', direction: 'BEARISH' });
    assert.deepEqual(FLIP_SCAN_PRESETS['flips_stocks_bull'], { marketClass: 'stocks', direction: 'BULLISH' });
    assert.deepEqual(FLIP_SCAN_PRESETS['flips_stocks_bear'], { marketClass: 'stocks', direction: 'BEARISH' });
  });
});
