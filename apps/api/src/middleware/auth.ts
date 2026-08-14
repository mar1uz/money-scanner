import { Request, Response, NextFunction } from 'express';
import { UserProfile, UserRole } from '@money-scanner/shared';

export interface AuthenticatedRequest extends Request {
  user?: UserProfile;
}

export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  // Check authorization header or session cookie
  const authHeader = req.headers.authorization;
  const roleHeader = (req.headers['x-user-role'] as UserRole) || 'Administrator';
  const emailHeader = (req.headers['x-user-email'] as string) || 'admin@relayhub.no';

  // Default dev user profile
  req.user = {
    id: 'user_dev_01',
    email: emailHeader,
    name: 'Marius PJ (Admin)',
    role: roleHeader,
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
    watchlist: ['BTC', 'ETH', 'SOL', 'SUI', 'FET'],
    telegramConnected: true,
    telegramChatId: '@marius_alerts',
    createdAt: Date.now() - 30 * 86400 * 1000,
    lastLoginAt: Date.now()
  };

  next();
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
