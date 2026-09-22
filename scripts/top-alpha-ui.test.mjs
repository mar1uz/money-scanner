import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { chromium, webkit } from 'playwright';

// Exercise the real React components, CSS and viewport hook through Vite.
test('Top Alpha cards and mobile dock remain usable through viewport changes', { timeout: 120_000 }, async () => {
  const criterion = { status: 'pass', label: 'Test', value: 'Test', explanation: 'Test fixture' };
  const asset = { id: 'test', coinGeckoId: 'test', symbol: 'TEST', name: 'Test coin', marketCapRank: 1,
    marketCap: 36_500_000, fullyDilutedValuation: 73_000_000, score: 100, passedCriteria: 4,
    criteria: { growth: criterion, networkEffect: criterion, sustainableRevenue: criterion, holderValue: criterion },
    metrics: { fees30d: 1_000_000, revenue30d: 300_000, holdersRevenue30d: 30_000, feeRunRateChange: 12, revenueRunRateChange: 10, chainCount: 1 } };
  const scan = { assets: Array.from({ length: 8 }, (_, i) => ({ ...asset, id: `test-${i}` })), undervalued: [], generatedAt: 1_790_100_000_000 };
  const originalCwd = process.cwd();
  const webRoot = resolve('apps/web');
  process.chdir(webRoot);
  const server = await createServer({ root: webRoot, configFile: resolve(webRoot, 'vite.config.ts'), server: { host: '127.0.0.1', port: 5179 } });
  const html = await server.transformIndexHtml('/__alpha-test', `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head><body><div id="root"></div><script type="module">
      import React from '/node_modules/.vite/deps/react.js';
      import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
      import '/src/index.css';
      import '/src/theme.css';
      import { Sidebar } from '/src/components/Sidebar.tsx';
      import { TopAlphaView } from '/src/components/TopAlphaView.tsx';
      import { LanguageProvider } from '/src/i18n.tsx';
      import { AssetNavigationProvider } from '/src/components/AssetNavigation.tsx';
      window.openedAssets = [];
      ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(LanguageProvider, {},
        React.createElement(AssetNavigationProvider, {onOpenAsset: a => window.openedAssets.push(a)},
          React.createElement('div', {className: 'app-shell'},
            React.createElement(Sidebar, {activeTab: 'top_alpha', watchlistCount: 16, onTabChange: () => {}, onOpenSearchModal: () => {}}),
            React.createElement('main', {className: 'workspace-main'}, React.createElement(TopAlphaView))))));
    </script></body></html>`);
  await server.listen();
  const address = server.httpServer.address();
  try {
    for (const engine of [chromium, webkit]) {
      const browser = await engine.launch();
      try {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
        await context.addInitScript(() => {
          localStorage.setItem('money_scanner_language', 'ro');
          const mock = new EventTarget();
          Object.assign(mock, { height: 844, offsetTop: 0, scale: 1 });
          Object.defineProperty(window, 'visualViewport', { get: () => mock });
          window.testViewport = mock;
        });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/__alpha-test', route => route.fulfill({ contentType: 'text/html', body: html }));
        await page.route('**/api/ai/crypto-four-criteria*', route => route.fulfill({ json: scan }));
        await page.goto(`http://127.0.0.1:${address.port}/__alpha-test`);
        await page.getByText('Randament holderi', { exact: true }).first().waitFor({ timeout: 10_000 }).catch(async error => { console.log({ errors, body: await page.locator('body').innerText() }); throw error; });
        assert.equal(await page.getByText('1.00%', { exact: true }).count(), 8);
        assert.equal(await page.getByText('0.50%', { exact: true }).count(), 8);
        assert.equal(await page.getByText('10.0x', { exact: true }).count(), 8);
        await page.evaluate(() => window.scrollTo(0, 1000));
        const assertDockVisible = async () => {
          const result = await page.evaluate(() => {
            const dock = document.querySelector('.mobile-dock').getBoundingClientRect();
            const visibleBottom = window.testViewport.height + window.testViewport.offsetTop;
            return { top: dock.top, bottom: dock.bottom, visibleBottom, overflow: document.documentElement.scrollWidth - window.innerWidth };
          });
          assert.ok(result.top >= 0 && result.bottom <= result.visibleBottom - 10, JSON.stringify(result));
          assert.ok(result.overflow <= 1, `horizontal overflow: ${result.overflow}`);
        };
        await assertDockVisible();
        for (const height of [700, 520, 844]) {
          await page.evaluate(height => { window.testViewport.height = height; window.testViewport.dispatchEvent(new Event('resize')); }, height);
          await page.waitForFunction(() => document.documentElement.style.getPropertyValue('--mobile-visible-height') === `${window.testViewport.height}px`);
          await assertDockVisible();
        }
        await page.getByText('Mai mult', { exact: true }).click();
        const menu = page.getByRole('menu');
        await menu.waitFor();
        await page.evaluate(() => { window.testViewport.height = 320; window.testViewport.dispatchEvent(new Event('resize')); });
        await page.waitForFunction(() => document.documentElement.style.getPropertyValue('--mobile-visible-height') === '320px');
        const menuRect = await menu.boundingBox();
        assert.ok(menuRect.y >= 0 && menuRect.y + menuRect.height <= 320);
        await menu.getByRole('menuitem').last().scrollIntoViewIfNeeded();
        await page.getByText('Mai mult', { exact: true }).click();
        await page.setViewportSize({ width: 320, height: 640 });
        await page.evaluate(() => { window.testViewport.height = 640; window.testViewport.dispatchEvent(new Event('resize')); });
        await page.waitForFunction(() => document.documentElement.style.getPropertyValue('--mobile-visible-height') === '640px');
        await assertDockVisible();
        // Shrinking the actual layout viewport must not add a second chrome inset.
        assert.equal(await page.evaluate(() => document.documentElement.style.getPropertyValue('--mobile-viewport-inset')), '0px');
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.screenshot({ path: `/tmp/top-alpha-${engine.name()}-mobile.png` });
        await page.setViewportSize({ width: 1280, height: 900 });
        assert.equal(await page.locator('.mobile-dock').isVisible(), false);
        assert.deepEqual(errors, []);
        await context.close();
      } finally { await browser.close(); }
    }
  } finally { await server.close(); process.chdir(originalCwd); }
});
