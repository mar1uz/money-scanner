import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fetchAssetDetail, parseAssetPairIdentityFromSearch } from './api.js';

// V2-G: the exact venue pair of the clicked search row travels with the
// deep-link URL and the asset-detail request. Nothing may be sent when no
// identity exists, so every legacy deep link keeps its exact request shape.

const withFetchCapture = async (run: (urls: string[]) => Promise<void>) => {
  const realFetch = globalThis.fetch;
  const urls: string[] = [];
  (globalThis as any).fetch = async (input: any) => {
    urls.push(String(input));
    return new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    await run(urls);
  } finally {
    (globalThis as any).fetch = realFetch;
  }
};

describe('asset pair identity plumbing (V2-G)', () => {
  it('parses the four pair parameters and requires both providerSymbol and exchange', () => {
    assert.equal(parseAssetPairIdentityFromSearch(''), undefined);
    assert.equal(parseAssetPairIdentityFromSearch('?timeframe=1w'), undefined);
    assert.equal(parseAssetPairIdentityFromSearch('?providerSymbol=BTCEUR'), undefined, 'no half-sent identities');
    assert.equal(parseAssetPairIdentityFromSearch('?exchange=BINANCE'), undefined);
    assert.deepEqual(
      parseAssetPairIdentityFromSearch('?providerSymbol=BTCEUR&exchange=BINANCE&instrumentType=spot&quoteCurrency=EUR'),
      { providerSymbol: 'BTCEUR', exchange: 'BINANCE', instrumentType: 'spot', quoteCurrency: 'EUR' }
    );
    // Normalisation matches openAsset/readMoneyLineDeepLink.
    assert.deepEqual(
      parseAssetPairIdentityFromSearch('?providerSymbol=btceur&exchange=Binance&instrumentType=SPOT&quoteCurrency=eur'),
      { providerSymbol: 'BTCEUR', exchange: 'Binance', instrumentType: 'spot', quoteCurrency: 'EUR' }
    );
  });

  it('only returns the identity for the asset the URL is open on', () => {
    const search = '?asset=CAKE&providerSymbol=CAKEBTC&exchange=BINANCE&instrumentType=spot&quoteCurrency=BTC';
    assert.deepEqual(parseAssetPairIdentityFromSearch(search, 'CAKE'), {
      providerSymbol: 'CAKEBTC', exchange: 'BINANCE', instrumentType: 'spot', quoteCurrency: 'BTC'
    });
    assert.deepEqual(parseAssetPairIdentityFromSearch(search, '$cake'), {
      providerSymbol: 'CAKEBTC', exchange: 'BINANCE', instrumentType: 'spot', quoteCurrency: 'BTC'
    });
    assert.equal(parseAssetPairIdentityFromSearch(search, 'BTC'), undefined, 'another asset must not inherit the pair');
    assert.deepEqual(
      parseAssetPairIdentityFromSearch('?providerSymbol=CAKEBTC&exchange=BINANCE'),
      { providerSymbol: 'CAKEBTC', exchange: 'BINANCE' },
      'without an asset scope the pair fields alone decide (App reads the deep link before the asset is set)'
    );
  });

  it('drops malformed identities instead of forwarding them', () => {
    assert.equal(parseAssetPairIdentityFromSearch('?providerSymbol=EURUSD%3DX&exchange=CCY'), undefined);
    assert.equal(parseAssetPairIdentityFromSearch('?providerSymbol=BTCEUR&exchange=' + 'B'.repeat(40)), undefined);
    assert.deepEqual(
      parseAssetPairIdentityFromSearch('?providerSymbol=BTCEUR&exchange=BINANCE&instrumentType=%3Cscript%3E'),
      { providerSymbol: 'BTCEUR', exchange: 'BINANCE' }
    );
  });

  it('keeps the legacy request shape byte for byte without an identity', async () => {
    await withFetchCapture(async urls => {
      await fetchAssetDetail('BTC', '1w', 'crypto', 'bitcoin');
      assert.deepEqual(urls, ['/api/assets/BTC?timeframe=1w&marketClass=crypto&coinGeckoId=bitcoin']);
    });
  });

  it('sends the optional pair parameters only when they exist', async () => {
    await withFetchCapture(async urls => {
      await fetchAssetDetail('CAKE', '1w', 'crypto', undefined, undefined, {
        providerSymbol: 'CAKEBTC', exchange: 'BINANCE', instrumentType: 'spot', quoteCurrency: 'BTC'
      });
      assert.deepEqual(urls, ['/api/assets/CAKE?timeframe=1w&marketClass=crypto&providerSymbol=CAKEBTC&exchange=BINANCE&instrumentType=spot&quoteCurrency=BTC']);

      await fetchAssetDetail('CAKE', '1w', 'crypto', undefined, undefined, { providerSymbol: 'CAKEUSDT', exchange: 'BINANCE' });
      assert.deepEqual(urls[1], '/api/assets/CAKE?timeframe=1w&marketClass=crypto&providerSymbol=CAKEUSDT&exchange=BINANCE');
    });
  });

  it('inherits the identity of the URL the deep-dive was opened with, and only for that asset', async () => {
    (globalThis as any).window = {
      location: { search: '?asset=CAKE&providerSymbol=CAKEBTC&exchange=BINANCE&instrumentType=spot&quoteCurrency=BTC' }
    };
    try {
      await withFetchCapture(async urls => {
        await fetchAssetDetail('CAKE', '1w', 'crypto');
        assert.deepEqual(urls[0], '/api/assets/CAKE?timeframe=1w&marketClass=crypto&providerSymbol=CAKEBTC&exchange=BINANCE&instrumentType=spot&quoteCurrency=BTC');
        await fetchAssetDetail('BTC', '1w', 'crypto');
        assert.deepEqual(urls[1], '/api/assets/BTC?timeframe=1w&marketClass=crypto', 'a different asset must not inherit the pair');
      });
    } finally {
      delete (globalThis as any).window;
    }
  });
});
