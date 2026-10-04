import { it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
it('both More menus protect trigger and menu but dismiss outside pointers and Escape', () => {
  const sidebar = read('./Sidebar.tsx'); const asset = read('./AssetDeepDiveView.tsx');
  assert.match(sidebar, /useOutsideDismiss\(moreOpen/); assert.match(asset, /useOutsideDismiss\(linksOpen/);
  const hook = read('../hooks/useOutsideDismiss.ts');
  assert.match(hook, /addEventListener\('pointerdown', pointer, true\)/);
  assert.match(hook, /event\.key === 'Escape'/); assert.match(hook, /composedPath/);
  assert.match(hook, /removeEventListener\('pointerdown', pointer, true\)/);
});
it('Pine remains accessible in the asset More menu, TradingView replaces its chart-row action', () => {
  const asset = read('./AssetDeepDiveView.tsx'); const chart = read('./InteractiveChart.tsx');
  assert.match(asset, /setChartTab\('pinescript'\); setLinksOpen\(false\)/);
  assert.match(asset, /Pine Script v6 Code/);
  assert.doesNotMatch(chart, /onClick=\{\(\) => setActiveTab\('pinescript'\)\}/);
  assert.match(chart, /href=\{tradingViewUrl\(symbol, marketClass\)\}/);
  assert.match(chart, /<span>TradingView<\/span>/);
});
