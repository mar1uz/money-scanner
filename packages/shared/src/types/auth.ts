export type UserRole = 'Administrator' | 'Analyst' | 'Viewer';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatarUrl?: string;
  watchlist: string[];
  telegramConnected: boolean;
  telegramChatId?: string;
  createdAt: number;
  lastLoginAt: number;
}

export interface SessionTokenPayload {
  userId: string;
  email: string;
  role: UserRole;
  iat: number;
  exp: number;
}
