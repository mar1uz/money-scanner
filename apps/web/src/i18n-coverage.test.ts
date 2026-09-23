import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { translateText } from './i18n.js';

// Guard against cross-language leaks: every user-visible Romanian literal in
// the web app must translate to English through the dictionaries. Literals
// already inside a language conditional (language === 'en' ? ... : ...) are
// exempt. i18n-leak-baseline.json lists the leaks known when this guard was
// added; it may only shrink. Regenerate with I18N_WRITE_BASELINE=1 after
// adding dictionary pairs.

const here = path.dirname(fileURLToPath(import.meta.url));
const RO = /[ăâîșțşţĂÂÎȘȚ]|(^|[^\p{L}])(și|sau|pentru|este|sunt|după|fără|toate|niciun|nicio|acum|deschide|caută|rulează|scanare)(?=$|[^\p{L}])/iu;
const LANG_COND = /\b(language|lang|isEn|isRo|isEnglish|locale)\b/;

function files(dir: string): string[] {
  return fs.readdirSync(dir).flatMap(name => {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) return files(full);
    if (!/\.(tsx|ts)$/.test(name) || /\.test\./.test(name) || /^i18n/.test(name)) return [];
    return [full];
  });
}

function insideLanguageConditional(node: ts.Node): boolean {
  for (let a: ts.Node | undefined = node.parent; a; a = a.parent) {
    if (ts.isConditionalExpression(a) && LANG_COND.test(a.condition.getText())) return true;
    if (ts.isBinaryExpression(a) && LANG_COND.test(a.left.getText())) return true;
    if (ts.isPropertyAssignment(a) && /^['"]?(ro|en)['"]?$/.test(a.name.getText())) return true;
    if (ts.isCallExpression(a) && /console\.|new Error|throw/.test(a.expression.getText())) return true;
  }
  return false;
}

function collectLeaks(): string[] {
  const leaks = new Set<string>();
  for (const file of files(here)) {
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (node: ts.Node) => {
      let text: string | null = null;
      if (ts.isJsxText(node)) text = node.getText().replace(/\s+/g, ' ').trim();
      else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) text = node.text;
      else if (ts.isTemplateExpression(node)) text = node.head.text + node.templateSpans.map(span => '{}' + span.literal.text).join('');
      if (text && RO.test(text) && !insideLanguageConditional(node) && !ts.isImportDeclaration(node.parent)) {
        const probe = text.replace(/\{\}/g, '7').replace(/&amp;/g, '&');
        if (RO.test(translateText(probe, 'en'))) leaks.add(`${path.relative(here, file)} :: ${text.trim()}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return [...leaks].sort();
}

test('no new untranslated Romanian UI literals (baseline may only shrink)', () => {
  const baselinePath = path.join(here, 'i18n-leak-baseline.json');
  const leaks = collectLeaks();
  if (process.env.I18N_WRITE_BASELINE) fs.writeFileSync(baselinePath, JSON.stringify(leaks, null, 1) + '\n');
  const baseline = new Set<string>(JSON.parse(fs.readFileSync(baselinePath, 'utf8')));
  const added = leaks.filter(leak => !baseline.has(leak));
  assert.deepEqual(added, [], `New untranslated strings - add pairs to i18n-ui-dictionary.ts:\n${added.join('\n')}`);
});

test('phrases never match inside words (asset names stay intact)', () => {
  assert.equal(translateText('Raydium', 'ro'), 'Raydium');
  assert.equal(translateText('Gains Network', 'ro'), 'Gains Network');
  assert.equal(translateText('Watchlist', 'ro').includes('urmăritlist'), false);
  assert.equal(translateText('Creșterea veniturilor din servicii', 'en').startsWith('Gaina'), false);
});

test('navigation and templates translate both ways', () => {
  assert.equal(translateText('Mai mult', 'en'), 'More');
  assert.equal(translateText('More', 'ro'), 'Mai mult');
  assert.equal(translateText(' Locul #57 în clasamentul după Market Cap ', 'en'), ' Rank #57 by Market Cap ');
  assert.equal(translateText('Filtrează: Candidat', 'en'), 'Filter: Candidate');
});
