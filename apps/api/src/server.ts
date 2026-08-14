import express from 'express';
import cors from 'cors';
import { marketRouter } from './routes/market-routes.js';
import { scannerRouter } from './routes/scanner-routes.js';
import { socialNewsRouter } from './routes/social-news-routes.js';
import { aiRouter } from './routes/ai-routes.js';
import { telegramRouter } from './routes/telegram-routes.js';
import { backtestRouter } from './routes/backtest-routes.js';
import { authRouter } from './routes/auth-routes.js';

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

  // Global error handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Unhandled API Error:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  });

  return app;
}
