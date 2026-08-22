import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import {
  AuthenticatedRequest,
  authMiddleware,
  CSRF_COOKIE_NAME,
  getFirebaseAuth,
  isAllowedEmail,
  SESSION_COOKIE_NAME,
  SESSION_DURATION_MS,
  updateUserWatchlist,
  userProfileFromToken,
  validateCsrfToken
} from '../middleware/auth.js';

export const authRouter = Router();

const isProduction = () => process.env.NODE_ENV === 'production';

const sessionCookieOptions = {
  httpOnly: true,
  secure: isProduction(),
  sameSite: 'lax' as const,
  path: '/',
  maxAge: SESSION_DURATION_MS
};

const csrfCookieOptions = {
  httpOnly: false,
  secure: isProduction(),
  sameSite: 'strict' as const,
  path: '/',
  maxAge: 10 * 60 * 1000
};

authRouter.get('/auth/csrf', (req, res) => {
  const csrfToken = randomBytes(32).toString('base64url');
  res.set('Cache-Control', 'no-store');
  res.cookie(CSRF_COOKIE_NAME, csrfToken, csrfCookieOptions);
  res.json({ csrfToken });
});

authRouter.post('/auth/session', async (req, res) => {
  if (!validateCsrfToken(req)) {
    return res.status(403).json({ error: 'Invalid CSRF token.', code: 'CSRF_INVALID' });
  }

  const idToken = typeof req.body?.idToken === 'string' ? req.body.idToken : '';
  if (!idToken) return res.status(400).json({ error: 'Missing Google ID token.' });

  try {
    const auth = getFirebaseAuth();
    const token = await auth.verifyIdToken(idToken, true);
    if (!token.email_verified || !isAllowedEmail(token.email)) {
      return res.status(403).json({ error: 'This Google account is not allowed to access Money Scanner.', code: 'ACCESS_DENIED' });
    }

    const sessionCookie = await auth.createSessionCookie(idToken, { expiresIn: SESSION_DURATION_MS });
    res.set('Cache-Control', 'no-store');
    res.cookie(SESSION_COOKIE_NAME, sessionCookie, sessionCookieOptions);
    return res.status(201).json({ user: userProfileFromToken(token), sessionExpiresInSeconds: SESSION_DURATION_MS / 1000 });
  } catch (error) {
    console.warn('Firebase session creation failed:', error instanceof Error ? error.message : error);
    return res.status(401).json({ error: 'Google sign-in could not be verified.', code: 'TOKEN_INVALID' });
  }
});

authRouter.post('/auth/logout', async (req, res) => {
  if (!validateCsrfToken(req)) {
    return res.status(403).json({ error: 'Invalid CSRF token.', code: 'CSRF_INVALID' });
  }

  res.clearCookie(SESSION_COOKIE_NAME, { httpOnly: true, secure: isProduction(), sameSite: 'lax', path: '/' });
  res.clearCookie(CSRF_COOKIE_NAME, { httpOnly: false, secure: isProduction(), sameSite: 'strict', path: '/' });
  res.status(204).end();
});

authRouter.get('/auth/me', authMiddleware, (req: AuthenticatedRequest, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({
    user: req.user,
    sessionExpiresInSeconds: SESSION_DURATION_MS / 1000,
    timestamp: Date.now()
  });
});

authRouter.post('/auth/watchlist', authMiddleware, (req: AuthenticatedRequest, res) => {
  const { symbol, action } = req.body;
  if (!req.user || !symbol) return res.status(400).json({ error: 'Missing symbol' });

  const sym = String(symbol).toUpperCase();
  const watchlist = action === 'remove'
    ? req.user.watchlist.filter(item => item !== sym)
    : req.user.watchlist.includes(sym)
      ? req.user.watchlist
      : [...req.user.watchlist, sym];

  updateUserWatchlist(req.user.id, watchlist);
  res.json({ watchlist, updated: true });
});
