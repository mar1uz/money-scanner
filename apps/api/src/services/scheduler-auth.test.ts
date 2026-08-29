import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { validateScheduledRequestToken } from './scheduler-auth.js';

const originalToken = process.env.DAILY_SCAN_TOKEN;

afterEach(() => {
  if (originalToken === undefined) delete process.env.DAILY_SCAN_TOKEN;
  else process.env.DAILY_SCAN_TOKEN = originalToken;
});

describe('Scheduled request authentication', () => {
  it('accepts only the configured exact token', () => {
    process.env.DAILY_SCAN_TOKEN = 'morning-warmup-secret';
    assert.equal(validateScheduledRequestToken('morning-warmup-secret'), true);
    assert.equal(validateScheduledRequestToken('morning-warmup-secreu'), false);
  });

  it('rejects requests when either token is missing', () => {
    delete process.env.DAILY_SCAN_TOKEN;
    assert.equal(validateScheduledRequestToken('anything'), false);
    process.env.DAILY_SCAN_TOKEN = 'configured';
    assert.equal(validateScheduledRequestToken(undefined), false);
  });
});
