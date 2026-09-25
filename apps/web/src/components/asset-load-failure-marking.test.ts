import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildAssetLoadFailureCopy, classifyAssetLoadFailure } from './AssetLoadFailureNotice.js';
import { UnverifiedCandlesBadge } from './UnverifiedCandlesBadge.js';

// V2-E2: the asset page must state the real cause of a failure. HTTP 503 from
// /api/assets/:symbol is the identity gate refusing the coin (fail-closed) and
// must never read as a temporary outage; network/server failures keep their own
// wording. The price-only aggregated page must say why Money Line is missing.

describe('asset page failure semantics (V2-E2)', () => {
  it('classifies HTTP 503 as the identity refusal, not as an outage', () => {
    assert.deepEqual(
      classifyAssetLoadFailure(new Error('HTTP 503: Failed to fetch asset detail for PONS')),
      { kind: 'no-verified-market', status: 503 }
    );
  });

  it('keeps network, server and rejected-request failures distinct', () => {
    assert.equal(classifyAssetLoadFailure(new TypeError('Failed to fetch')).kind, 'network');
    assert.equal(classifyAssetLoadFailure(new Error('HTTP 500: Failed to fetch asset detail for PONS')).kind, 'server-error');
    assert.equal(classifyAssetLoadFailure(new Error('HTTP 502: Failed to fetch asset detail for PONS')).kind, 'server-error');
    assert.equal(classifyAssetLoadFailure(new Error('HTTP 401: Authentication required')).kind, 'request-rejected');
    assert.equal(classifyAssetLoadFailure(undefined).kind, 'network');
  });

  it('503 copy names the unverified market and explicitly denies an outage (RO)', () => {
    const copy = buildAssetLoadFailureCopy(
      { kind: 'no-verified-market', status: 503 },
      { language: 'ro', symbol: 'ZZZZQQ', isCrypto: true }
    );
    assert.equal(copy.tone, 'refusal');
    assert.equal(copy.pill, 'Verificare de identitate respinsă');
    assert.match(copy.title, /fără piață verificată pentru lumânări reale/);
    assert.match(copy.body, /Nu am putut confirma identitatea monedei/);
    assert.match(copy.body, /Nu este o pană temporară de rețea/);
    assert.doesNotMatch(copy.body, /momentan|indisponibile temporar|încearcă din nou/);
  });

  it('503 copy carries the same meaning in English', () => {
    const copy = buildAssetLoadFailureCopy(
      { kind: 'no-verified-market', status: 503 },
      { language: 'en', symbol: 'ZZZZQQ', isCrypto: true }
    );
    assert.match(copy.pill ?? '', /Identity check refused/);
    assert.match(copy.title, /no verified market for real candles/);
    assert.match(copy.body, /could not confirm this coin's identity/);
    assert.match(copy.body, /not a temporary network outage/);
  });

  it('non-crypto targets never receive the crypto-specific refusal wording', () => {
    const copy = buildAssetLoadFailureCopy(
      { kind: 'no-verified-market', status: 503 },
      { language: 'ro', symbol: 'BRK.B', isCrypto: false }
    );
    assert.equal(copy.tone, 'refusal');
    assert.match(copy.title, /fără date de piață verificate/);
    assert.match(copy.body, /Nu este o pană temporară de rețea/);
  });

  it('network failures blame the connection, not the coin', () => {
    const ro = buildAssetLoadFailureCopy({ kind: 'network' }, { language: 'ro', symbol: 'BTC', isCrypto: true });
    const en = buildAssetLoadFailureCopy({ kind: 'network' }, { language: 'en', symbol: 'BTC', isCrypto: true });
    assert.equal(ro.tone, 'incident');
    assert.match(ro.title, /conexiune întreruptă/);
    assert.match(ro.body, /fără răspuns sau timeout/);
    assert.match(en.title, /connection interrupted/);
    assert.match(en.body, /check your connection and try again/i);
    assert.equal(buildAssetLoadFailureCopy(null, { language: 'ro', symbol: 'BTC', isCrypto: true }).tone, 'incident');
  });

  it('server errors carry the HTTP status and stay separate from the refusal', () => {
    const copy = buildAssetLoadFailureCopy({ kind: 'server-error', status: 500 }, { language: 'ro', symbol: 'BTC', isCrypto: true });
    assert.match(copy.title, /eroare internă de server \(HTTP 500\)/);
    assert.match(copy.body, /eroare internă/);
    assert.doesNotMatch(copy.body, /pană temporară de rețea/);
    const rejected = buildAssetLoadFailureCopy({ kind: 'request-rejected', status: 401 }, { language: 'en', symbol: 'BTC', isCrypto: true });
    assert.match(rejected.title, /request rejected \(HTTP 401\)/);
  });

  it('marks the price-only aggregated page in both languages', () => {
    const ro = renderToStaticMarkup(React.createElement(UnverifiedCandlesBadge, { language: 'ro' }));
    const en = renderToStaticMarkup(React.createElement(UnverifiedCandlesBadge, { language: 'en' }));
    assert.match(ro, /Indexat · fără lumânări verificate/);
    assert.match(ro, /fără lumânări verificate de bursă/);
    assert.match(ro, /Nu este o pană de date/);
    assert.doesNotMatch(ro, /Indexed/);
    assert.match(en, /Indexed · no verified candles/);
    assert.match(en, /no exchange-verified candles/);
    assert.match(en, /not a data outage/);
    assert.doesNotMatch(en, /Indexat/);
  });
});
