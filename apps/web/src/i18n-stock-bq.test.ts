import test from 'node:test';
import assert from 'node:assert/strict';
import { translateText } from './i18n.js';

// The stock Business Quality payload arrives in Romanian from the API.
// With English selected, criterion values, explanations and theses must
// render fully in English (bug: "Venituri: +8.0% | EPS: +12.0%" on /?tab=top-alpha).
const RO = /[ăâîșțşţ]|(^|[^\p{L}])(și|sau|pentru|este|dar|cu|Venituri|Randament|Marjă)(?=$|[^\p{L}])/iu;

const samples: Array<[string, string]> = [
  ['Venituri: +8.0% | EPS: +12.0%', 'Revenue: +8.0% | EPS: +12.0%'],
  ['Venituri: -4.5% | EPS: -2.0%', 'Revenue: -4.5% | EPS: -2.0%'],
  ['FCF: $6.45B | Randament: 3.2%', 'FCF: $6.45B | Yield: 3.2%'],
  ['Marjă Netă: +20.0% | Op: +45.1%', 'Net Margin: +20.0% | Op: +45.1%'],
  ['Bilanț solid (Debt/Equity 0.60, Rata Curentă 1.20, poziție Net Cash); risc minim de faliment/diluare.', 'Solid balance sheet (Debt/Equity 0.60, Current Ratio 1.20, net cash position); minimal bankruptcy/dilution risk.'],
  ['Bilanț solid (Debt/Equity 0.60, Rata Curentă 1.20); risc minim de faliment/diluare.', 'Solid balance sheet (Debt/Equity 0.60, Current Ratio 1.20); minimal bankruptcy/dilution risk.'],
  ['$MCD are un profil fundamental echilibrat cu profitabilitate stabilă și risc moderat.', '$MCD has a balanced fundamental profile with stable profitability and moderate risk.']
];

test('stock business quality values translate to English exactly', () => {
  for (const [ro, en] of samples) assert.equal(translateText(ro, 'en'), en);
});

test('stock business quality payload leaves no Romanian in English mode and is untouched in Romanian', async () => {
  const { STOCK_BQ_PAIRS } = await import('./i18n.js');
  for (const [ro] of STOCK_BQ_PAIRS) {
    const probe = ro.replace(/\{\}/g, '+7.0%');
    const en = translateText(probe, 'en');
    assert.ok(!RO.test(en), `leak: ${probe} -> ${en}`);
    assert.equal(translateText(probe, 'ro'), probe);
  }
});
