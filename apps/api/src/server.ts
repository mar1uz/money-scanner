import express from 'express';
import { radarRouter } from './routes/radar-routes.js';
import cors from 'cors';
import compression from 'compression';
import path from 'node:path';
import fs from 'node:fs';
import { marketRouter } from './routes/market-routes.js';
import { scannerRouter } from './routes/scanner-routes.js';
import { socialNewsRouter } from './routes/social-news-routes.js';
import { aiRouter } from './routes/ai-routes.js';
import { telegramRouter } from './routes/telegram-routes.js';
import { backtestRouter } from './routes/backtest-routes.js';
import { authRouter } from './routes/auth-routes.js';
import { macroRouter } from './routes/macro-routes.js';
import { tapeRouter, tapePageHandler } from './routes/tape-routes.js';
import { chartMarketDiagnosticsRouter } from './routes/chart-market-diagnostics-routes.js';
import { authMiddleware } from './middleware/auth.js';

export function createServer() {
  const app = express();

  app.use(cors({
    // The dashboard and API are served from the same Cloud Run origin. Do not
    // expose authenticated cookies to arbitrary browser origins.
    origin: false,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'X-Telegram-Bot-Api-Secret-Token', 'X-Daily-Scan-Token']
  }));

  app.use(express.json());
  // gzip the SPA bundle and JSON API responses (the 1.1 MB bundle and the
  // scanner payloads were previously transferred uncompressed).
  app.use(compression());

  // Session bootstrap routes are deliberately public. They validate Google
  // credentials themselves before issuing an HttpOnly session cookie.
  app.use('/api', authRouter);

  // Everything with market, social, AI, alert, or account data requires a
  // verified Firebase session. Health and the Telegram webhook have their own
  // safe verification mechanisms and must remain reachable for operations.
  app.use('/api', (req, res, next) => {
    if (
      req.path === '/radar/scheduled'
      || req.path === '/health'
      || req.path === '/chart-market-diagnostics'
      || req.path === '/telegram/webhook'
      || req.path === '/alerts/daily-regime-scan'
      || req.path === '/alerts/daily-regime-scan/no-send'
      || req.path === '/alerts/daily-sma-reclaim/scheduled'
      || req.path === '/alerts/ma-cross/scheduled'
      || req.path === '/alerts/structure-scanner/scheduled'
      || req.path === '/ai/ask-queue/status'
      || req.path === '/ai/daily-warmup'
      || req.path === '/ai/publish-content'
      || req.path === '/scanner/warm'
      || req.path === '/tape/scan'
      || req.path === '/tape/proof'
      || req.path === '/tape/waitlist'
      || req.path.startsWith('/auth/')
    ) {
      return next();
    }
    return authMiddleware(req, res, next);
  });

  // Mount protected API routers under /api
  app.use('/api', radarRouter);
  app.use('/api', marketRouter);
  app.use('/api', scannerRouter);
  app.use('/api', socialNewsRouter);
  app.use('/api', aiRouter);
  app.use('/api', telegramRouter);
  app.use('/api', backtestRouter);
  app.use('/api', macroRouter);
  app.use('/api', tapeRouter);
  app.use('/api', chartMarketDiagnosticsRouter);

  // Public Regime Tape page (no session)
  app.get('/tape', tapePageHandler as any);

  // Serve static web app bundle if built
  const possibleWebDistPaths = [
    path.resolve(process.cwd(), 'apps/web/dist'),
    path.resolve(process.cwd(), 'dist/apps/web/dist'),
    path.resolve(process.cwd(), '../web/dist')
  ];

  let webDistPath = possibleWebDistPaths.find(p => fs.existsSync(p));

  if (webDistPath) {
    app.use(express.static(webDistPath, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('index.html')) {
          // The HTML entrypoint must always revalidate so users immediately
          // receive the newest hashed JS/CSS bundle after a deployment.
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      }
    }));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) {
        return next();
      }
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.sendFile(path.join(webDistPath!, 'index.html'));
    });
  }

  // Global error handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Unhandled API Error:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  });

  return app;
}

