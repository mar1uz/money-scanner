import { Router } from 'express';
import { AuthenticatedRequest, authMiddleware } from '../middleware/auth.js';

export const authRouter = Router();

authRouter.get('/auth/me', authMiddleware, (req: AuthenticatedRequest, res) => {
  res.json({
    user: req.user,
    sessionExpiresInSeconds: 86400,
    timestamp: Date.now()
  });
});

authRouter.post('/auth/watchlist', authMiddleware, (req: AuthenticatedRequest, res) => {
  const { symbol, action } = req.body;
  if (!req.user || !symbol) {
    return res.status(400).json({ error: 'Missing symbol' });
  }

  const sym = symbol.toUpperCase();
  if (action === 'add' && !req.user.watchlist.includes(sym)) {
    req.user.watchlist.push(sym);
  } else if (action === 'remove') {
    req.user.watchlist = req.user.watchlist.filter(s => s !== sym);
  }

  res.json({
    watchlist: req.user.watchlist,
    updated: true
  });
});
