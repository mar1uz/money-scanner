import re, pathlib
p = pathlib.Path('apps/web/src/i18n.tsx')
src = p.read_text()

helper = '''
/** Initial UI language. /tape is the public proof page for the English X
 * audience: it always starts in English regardless of any stored preference.
 * Everywhere else the stored preference applies (default Romanian). */
export const resolveInitialLanguage = (pathname: string, storedPreference: string | null): Language => {
  if (pathname === '/tape' || pathname.startsWith('/tape/')) return 'en';
  return storedPreference === 'en' ? 'en' : 'ro';
};

'''
anchor = 'const LanguageContext = createContext'
assert anchor in src
src = src.replace(anchor, helper + anchor, 1)

old = """    try {
      return localStorage.getItem('money_scanner_language') === 'en' ? 'en' : 'ro';
    } catch {"""
new = """    try {
      return resolveInitialLanguage(window.location.pathname, localStorage.getItem('money_scanner_language'));
    } catch {"""
assert old in src
src = src.replace(old, new, 1)
p.write_text(src)

test = '''import test from 'node:test';
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
'''
pathlib.Path('apps/web/src/i18n.test.ts').write_text(test)
print('patched')
