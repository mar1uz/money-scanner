import test from 'node:test';
import assert from 'node:assert/strict';
import { radarTokenChartUrl } from './radar-token.js';

test('chart links retain chain and exact contract identity, including Solana case', () => {
  const address = '0x1111111111111111111111111111111111111111';
  assert.equal(radarTokenChartUrl({ chain: 'base', address }), `https://dexscreener.com/base/${address}`);
  assert.equal(radarTokenChartUrl({ chain: 'robinhood', address }), `https://dexscreener.com/robinhood/${address}`);
  const mint = '5UUH9RTDiSpq6HKS6bp4NdU9PNJpXRXuiw6ShBTBhgH2';
  assert.equal(radarTokenChartUrl({ chain: 'solana', address: mint }), `https://dexscreener.com/solana/${mint}`);
});

test('unexpected address characters cannot change the destination origin or URL query', () => {
  const url = new URL(radarTokenChartUrl({ chain: 'base', address: 'x/evil?q="<&' }));
  assert.equal(url.origin, 'https://dexscreener.com');
  assert.equal(url.search, '');
  assert.equal(decodeURIComponent(url.pathname.split('/')[2]), 'x/evil?q="<&');
});
