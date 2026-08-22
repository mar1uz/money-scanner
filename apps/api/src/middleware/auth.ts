import { Request, Response, NextFunction } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { DecodedIdToken, getAuth } from 'firebase-admin/auth';
import { UserProfile, UserRole } from '@money-scanner/shared';

export const SESSION_COOKIE_NAME = process.env.NODE_ENV === 'production'
  ? '__Host-money_scanner_session'
  : 'money_scanner_session';
export const CSRF_COOKIE_NAME = 'money_scanner_csrf';
export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export interface AuthenticatedRequest extends Request {
  user?: UserProfile;
  firebaseToken?: DecodedIdToken;
}

interface StoredProfile {
  watchlist: string[];
  createdAt: number;
}

const profiles = new Map<string, StoredProfile>();

const getProjectId = () => process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;

export const getFirebaseAuth = () => {
  const projectId = getProjectId();
  if (!projectId) {
    throw new Error('Firebase Authentication is not configured: FIREBASE_PROJECT_ID is required.');
  }

  if (!getApps().length) initializeApp({ projectId });
  return getAuth();
};

const listFromEnvironment = (name: string) => new Set(
  (process.env[name] || '')
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean)
);

const isTestBypassEnabled = () =>
  process.env.NODE_ENV === 'test' && process.env.AUTH_TEST_BYPASS === 'true';

export const isAllowedEmail = (email?: string | null) => {
  if (!email) return false;
  return listFromEnvironment('ALLOWED_EMAILS').has(email.toLowerCase());
};

const getRole = (email: string, token: DecodedIdToken): UserRole => {
  const customRole = token.role;
  if (customRole === 'Administrator' || customRole === 'Analyst' || customRole === 'Viewer') {
    return customRole;
  }
  return listFromEnvironment('ADMIN_EMAILS').has(email.toLowerCase()) ? 'Administrator' : 'Viewer';
};

export const userProfileFromToken = (token: DecodedIdToken): UserProfile => {
  const email = token.email?.toLowerCase();
  if (!email) throw new Error('The authenticated account has no email address.');

  const existing = profiles.get(token.uid) || {
    watchlist: ['BTC', 'ETH', 'SOL', 'SUI', 'FET'],
    createdAt: Date.now()
  };
  profiles.set(token.uid, existing);

  return {
    id: token.uid,
    email,
    name: token.name || email.split('@')[0],
    role: getRole(email, token),
    avatarUrl: token.picture,
    watchlist: [...existing.watchlist],
    telegramConnected: false,
    createdAt: existing.createdAt,
    lastLoginAt: Date.now()
  };
};

export const updateUserWatchlist = (userId: string, watchlist: string[]) => {
  const current = profiles.get(userId) || { watchlist: [], createdAt: Date.now() };
  current.watchlist = [...watchlist];
  profiles.set(userId, current);
};

const parseCookies = (cookieHeader?: string) => Object.fromEntries(
  (cookieHeader || '')
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const separator = part.indexOf('=');
      return separator === -1
        ? [part, '']
        : [part.slice(0, separator), decodeURIComponent(part.slice(separator + 1))];
    })
);

export const readCookie = (req: Request, name: string) => parseCookies(req.headers.cookie)[name];

export const hashCsrfToken = (value: string) => createHash('sha256').update(value).digest('hex');

export const validateCsrfToken = (req: Request) => {
  const cookieToken = readCookie(req, CSRF_COOKIE_NAME);
  const headerToken = req.get('x-csrf-token');
  if (!cookieToken || !headerToken) return false;

  const expected = Buffer.from(hashCsrfToken(cookieToken));
  const received = Buffer.from(hashCsrfToken(headerToken));
  return expected.length === received.length && timingSafeEqual(expected, received);
};

const testUser: UserProfile = {
  id: 'test-user',
  email: 'test@example.com',
  name: 'Test User',
  role: 'Administrator',
  watchlist: ['BTC', 'ETH', 'SOL', 'SUI', 'FET'],
  telegramConnected: false,
  createdAt: 0,
  lastLoginAt: 0
};

export async function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (isTestBypassEnabled()) {
    req.user = testUser;
    return next();
  }

  const sessionCookie = readCookie(req, SESSION_COOKIE_NAME);
  if (!sessionCookie) {
    return res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
  }

  try {
    const token = await getFirebaseAuth().verifySessionCookie(sessionCookie, true);
    if (!token.email_verified || !isAllowedEmail(token.email)) {
      return res.status(403).json({ error: 'This Google account is not allowed to access Money Scanner.', code: 'ACCESS_DENIED' });
    }

    req.firebaseToken = token;
    req.user = userProfileFromToken(token);
    return next();
  } catch (error) {
    console.warn('Rejected invalid or expired session:', error instanceof Error ? error.message : error);
    res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    return res.status(401).json({ error: 'Your session expired. Please sign in again.', code: 'SESSION_EXPIRED' });
  }
}

export function requireRole(allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `This action requires one of the following roles: ${allowedRoles.join(', ')}`
      });
    }
    next();
  };
}
