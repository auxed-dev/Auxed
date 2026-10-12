import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, post } from './api';
import { clearApiCache } from './useApi';
import type { Role, SessionUser, ThemeName } from '../types';

interface SessionValue {
  user: SessionUser | null;
  ready: boolean;
  refresh: () => Promise<SessionUser | null>;
  setUser: (u: SessionUser | null) => void;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionValue>({
  user: null,
  ready: false,
  refresh: async () => null,
  setUser: () => undefined,
  logout: async () => undefined,
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const { user } = await api<{ user: SessionUser | null }>('/api/auth/me');
      setUser(user);
      return user;
    } catch {
      return null;
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await post('/api/auth/logout');
    } finally {
      clearApiCache();
      setUser(null);
    }
  }, []);

  const value = useMemo(() => ({ user, ready, refresh, setUser, logout }), [user, ready, refresh, logout]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);

export function themeFor(role: Role | null | undefined): ThemeName {
  if (role === 'PERFORMER') return 'green';
  if (role === 'OWNER' || role === 'ADMIN') return 'purple';
  return 'blue';
}

export function homeFor(role: Role | null | undefined): string {
  if (role === 'PERFORMER') return '/artist';
  if (role === 'OWNER' || role === 'ADMIN') return '/owner';
  return '/home';
}

export const ROLE_PARAM: Record<string, Exclude<Role, 'ADMIN'>> = {
  USER: 'USER',
  PERFORMER: 'PERFORMER',
  OWNER: 'OWNER',
  auxee: 'USER',
  artist: 'PERFORMER',
  owner: 'OWNER',
};

export function roleTheme(roleParam: unknown): ThemeName {
  return themeFor(ROLE_PARAM[String(roleParam ?? '')] ?? 'USER');
}
