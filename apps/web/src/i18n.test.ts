import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveInitialLanguage } from './i18n.js';

test('/tape always starts in English, even with a stored Romanian preference', () => {
  assert.equal(resolveInitialLanguage('/tape', 'ro'), 'en');
  assert.equal(resolveInitialLanguage('/tape', 'en'), 'en');
  assert.equal(resolveInitialLanguage('/tape', null), 'en');
  assert.equal(resolveInitialLanguage('/tape/', 'ro'), 'en');
});

test('other routes keep the stored preference with Romanian default', () => {
  assert.equal(resolveInitialLanguage('/', 'en'), 'en');
  assert.equal(resolveInitialLanguage('/', 'ro'), 'ro');
  assert.equal(resolveInitialLanguage('/', null), 'ro');
  assert.equal(resolveInitialLanguage('/intelligence', 'ro'), 'ro');
});
