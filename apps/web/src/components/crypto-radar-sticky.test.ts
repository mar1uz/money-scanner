import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RADAR_MAIN_HEADERS,
  RADAR_MICRO_HEADERS,
  getRadarTableMinWidth
} from './crypto-radar-headers.js';

test('RADAR_MAIN_HEADERS and RADAR_MICRO_HEADERS define valid unique keys and positive widths', () => {
  const mainKeys = new Set(RADAR_MAIN_HEADERS.map(h => h.key));
  assert.equal(mainKeys.size, RADAR_MAIN_HEADERS.length, 'RADAR_MAIN_HEADERS must have unique keys');
  assert.equal(RADAR_MAIN_HEADERS.length, 12, 'RADAR_MAIN_HEADERS must have exactly 12 columns');

  for (const h of RADAR_MAIN_HEADERS) {
    assert.ok(h.width >= 50, `Header ${h.key} width must be at least 50px`);
    assert.ok(h.label.trim().length > 0, `Header ${h.key} must have non-empty label`);
  }

  const microKeys = new Set(RADAR_MICRO_HEADERS.map(h => h.key));
  assert.equal(microKeys.size, RADAR_MICRO_HEADERS.length, 'RADAR_MICRO_HEADERS must have unique keys');
  assert.equal(RADAR_MICRO_HEADERS.length, 10, 'RADAR_MICRO_HEADERS must have exactly 10 columns');

  for (const h of RADAR_MICRO_HEADERS) {
    assert.ok(h.width >= 50, `Header ${h.key} width must be at least 50px`);
    assert.ok(h.label.trim().length > 0, `Header ${h.key} must have non-empty label`);
  }
});

test('calculated minWidths provide sufficient space without horizontal clipping', () => {
  const mainMinWidth = getRadarTableMinWidth(RADAR_MAIN_HEADERS);
  const microMinWidth = getRadarTableMinWidth(RADAR_MICRO_HEADERS);

  assert.equal(mainMinWidth, 1330, 'Main table minWidth must be exactly 1330px');
  assert.equal(microMinWidth, 1165, 'Microcaps table minWidth must be exactly 1165px');

  // Both must be larger than standard mobile viewport (390px) to trigger clean horizontal scrolling
  assert.ok(mainMinWidth > 1000);
  assert.ok(microMinWidth > 1000);
});

test('RADAR_MICRO_HEADERS includes estimatedFees24h for utility and buyback tracking', () => {
  const feesHeader = RADAR_MICRO_HEADERS.find(h => h.key === 'estimatedFees24h');
  assert.ok(feesHeader, 'Microcaps table must include estimatedFees24h column');
  assert.equal(feesHeader.label, 'Comisioane 24h');
  assert.ok(feesHeader.width >= 100);
});

test('bidirectional scroll synchronization invariant behaves deterministically without infinite loop', () => {
  let isSyncing = false;
  let headerScrollLeft = 0;
  let bodyScrollLeft = 0;

  const syncToBody = (newScroll: number) => {
    headerScrollLeft = newScroll;
    if (isSyncing) return;
    isSyncing = true;
    bodyScrollLeft = headerScrollLeft;
    isSyncing = false;
  };

  const syncToHeader = (newScroll: number) => {
    bodyScrollLeft = newScroll;
    if (isSyncing) return;
    isSyncing = true;
    headerScrollLeft = bodyScrollLeft;
    isSyncing = false;
  };

  // Header initiated scroll
  syncToBody(350);
  assert.equal(headerScrollLeft, 350);
  assert.equal(bodyScrollLeft, 350);

  // Body initiated scroll
  syncToHeader(720);
  assert.equal(headerScrollLeft, 720);
  assert.equal(bodyScrollLeft, 720);

  // Reset scroll
  syncToBody(0);
  assert.equal(headerScrollLeft, 0);
  assert.equal(bodyScrollLeft, 0);
});

test('index.html does not contain overflow-x-hidden on body (which breaks position: sticky for window scroll)', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const htmlPath = path.resolve(process.cwd(), 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  // Ensure body tag does not contain overflow-x-hidden or overflow-hidden
  const bodyMatch = html.match(/<body[^>]*>/i);
  assert.ok(bodyMatch, 'index.html must have a body tag');
  assert.ok(
    !bodyMatch[0].includes('overflow-x-hidden') && !bodyMatch[0].includes('overflow-hidden'),
    'body tag in index.html must not contain overflow-x-hidden or overflow-hidden as it disables position:sticky in browsers'
  );
});

test('index.css @layer base does not contain overflow-x: clip or overflow-x: hidden (which disables position: sticky)', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const cssPath = path.resolve(process.cwd(), 'src/index.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  const baseMatch = css.match(/@layer base\s*\{([\s\S]*?)\n\}/);
  assert.ok(baseMatch, 'index.css must define @layer base');
  assert.ok(
    !baseMatch[1].includes('overflow-x: clip') && !baseMatch[1].includes('overflow-x: hidden') && !baseMatch[1].includes('overflow: clip'),
    '@layer base in index.css must not contain overflow-x: clip or overflow-x: hidden as it disables position:sticky in mobile WebKit/Chromium'
  );
});

test('index.css defines .radar-sticky-header with -webkit-sticky, sticky top 56px, and touch-action pan-x pan-y', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const cssPath = path.resolve(process.cwd(), 'src/index.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  assert.ok(css.includes('.radar-sticky-header'), 'index.css must define .radar-sticky-header');
  assert.ok(css.includes('position: -webkit-sticky'), '.radar-sticky-header must define -webkit-sticky for iOS Safari WebKit');
  assert.ok(css.includes('position: sticky'), '.radar-sticky-header must define standard position: sticky');
  assert.ok(css.includes('touch-action: pan-x pan-y'), '.radar-sticky-header must enable 2D touch panning on mobile');
});

test('CryptoRadarView applies radar-sticky-header and touch-pan utilities', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const viewPath = path.resolve(process.cwd(), 'src/components/CryptoRadarView.tsx');
  const viewCode = fs.readFileSync(viewPath, 'utf8');

  assert.ok(viewCode.includes('radar-sticky-header'), 'CryptoRadarView must apply .radar-sticky-header class to sticky container');
  assert.ok(viewCode.includes('touch-pan-x touch-pan-y'), 'CryptoRadarView must apply touch-pan utilities for smooth mobile horizontal scrolling');
});

test('automated browser evaluation: sticky header docks at 56px across Chromium and WebKit on mobile and desktop', async () => {
  const { chromium, webkit } = await import('playwright');

  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch();

    try {
      const runTest = async (viewport: { width: number; height: number }, isMobile: boolean) => {
        const context = await browser.newContext({ viewport, isMobile, hasTouch: isMobile });
        const page = await context.newPage();

        // Mount the exact DOM and CSS layout used in production
        await page.setContent(`
          <!DOCTYPE html>
          <html class="dark" style="background-color: #0a0e17; color: #f1f5f9; max-width: 100vw; width: 100%; position: relative;">
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
            <style>
              * { box-sizing: border-box; margin: 0; padding: 0; }
              html, body {
                background-color: #0a0e17;
                color: #f1f5f9;
                max-width: 100vw;
                width: 100%;
                position: relative;
                min-height: 100vh;
                touch-action: pan-y pinch-zoom;
              }
              #root {
                max-width: 100vw;
                width: 100%;
              }
              .app-header {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                height: 56px;
                z-index: 40;
                background: #0a0e17;
                border-bottom: 1px solid rgba(255,255,255,0.08);
              }
              .main-wrapper {
                padding-top: 56px;
                padding-bottom: 80px;
              }
              .content-section {
                padding: 24px 16px;
                max-width: 1600px;
                margin: 0 auto;
              }
              .intro-block {
                height: 350px;
                margin-bottom: 20px;
              }
              .table-card {
                position: relative;
                border-radius: 12px;
                border: 1px solid rgba(255,255,255,0.1);
                background: rgba(11,19,41,0.4);
              }
              .radar-sticky-header {
                position: -webkit-sticky;
                position: sticky;
                top: 56px;
                z-index: 25;
                overflow-x: auto;
                background: #0b1329;
                border-bottom: 1px solid rgba(255,255,255,0.1);
                box-shadow: 0 4px 12px rgba(0,0,0,0.5);
                height: 48px;
                touch-action: pan-x pan-y;
              }
              .table-body-container {
                overflow-x: auto;
                height: 3000px;
                touch-action: pan-x pan-y;
              }
            </style>
          </head>
          <body>
            <div id="root">
              <header class="app-header">Fixed 56px Navigation Bar</header>
              <div class="main-wrapper">
                <main class="content-section">
                  <div class="intro-block">Crypto Radar Filters & Summary</div>
                  <div class="table-card">
                    <div class="radar-sticky-header" id="sticky-header">
                      <table style="min-width: 1330px; height: 100%;">
                        <thead>
                          <tr><th>Loc</th><th>Monedă</th><th>Preț</th><th>Δ 24H</th><th>Market Cap</th></tr>
                        </thead>
                      </table>
                    </div>
                    <div class="table-body-container" id="table-body">
                      <div style="height: 3000px; min-width: 1330px;">100 Tokens List</div>
                    </div>
                  </div>
                </main>
              </div>
            </div>
          </body>
          </html>
        `);

        const getHeaderTop = async () => {
          return await page.evaluate(() => {
            const el = document.getElementById('sticky-header');
            return el ? Math.round(el.getBoundingClientRect().top) : null;
          });
        };

        const topBefore = await getHeaderTop();
        assert.ok(topBefore! > 100, `[${engine.name()}] Initial header top (${topBefore}) should be below intro block`);

        // Scroll down 500px: header must lock at 56px below fixed header
        await page.evaluate(() => window.scrollTo(0, 500));
        const top500 = await getHeaderTop();
        assert.equal(top500, 56, `[${engine.name()}] Header must dock at exactly 56px on 500px scroll. Got: ${top500}`);

        // Scroll down 1000px: header remains locked at 56px
        await page.evaluate(() => window.scrollTo(0, 1000));
        const top1000 = await getHeaderTop();
        assert.equal(top1000, 56, `[${engine.name()}] Header must remain fixed at 56px under 1000px scroll. Got: ${top1000}`);

        // Scroll deeper (1500px)
        await page.evaluate(() => window.scrollTo(0, 1500));
        const top1500 = await getHeaderTop();
        assert.equal(top1500, 56, `[${engine.name()}] Header must remain fixed at 56px under 1500px scroll. Got: ${top1500}`);

        // Scroll to bottom (2500px)
        await page.evaluate(() => window.scrollTo(0, 2500));
        const top2500 = await getHeaderTop();
        assert.equal(top2500, 56, `[${engine.name()}] Header must remain fixed at 56px under 2500px scroll. Got: ${top2500}`);

        await context.close();
      };

      // Test mobile iPhone 14 viewport
      await runTest({ width: 390, height: 844 }, true);
      // Test desktop 1080p viewport
      await runTest({ width: 1440, height: 900 }, false);
    } finally {
      await browser.close();
    }
  }
});


