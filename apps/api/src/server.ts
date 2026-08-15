import express from 'express';
import cors from 'cors';
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

export function createServer() {
  const app = express();

  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Telegram-Bot-Api-Secret-Token', 'X-User-Role', 'X-User-Email']
  }));

  app.use(express.json());

  // Mount API routers under /api
  app.use('/api', marketRouter);
  app.use('/api', scannerRouter);
  app.use('/api', socialNewsRouter);
  app.use('/api', aiRouter);
  app.use('/api', telegramRouter);
  app.use('/api', backtestRouter);
  app.use('/api', authRouter);
  app.use('/api', macroRouter);

  // Serve static web app bundle if built
  const possibleWebDistPaths = [
    path.resolve(process.cwd(), 'apps/web/dist'),
    path.resolve(process.cwd(), 'dist/apps/web/dist'),
    path.resolve(process.cwd(), '../web/dist')
  ];

  let webDistPath = possibleWebDistPaths.find(p => fs.existsSync(p));

  if (webDistPath) {
    app.use(express.static(webDistPath));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) {
        return next();
      }
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
