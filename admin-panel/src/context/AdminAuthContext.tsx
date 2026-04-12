import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api } from '../api/client';

export type AdminInfo = {
  _id: string;
  email: string;
  name: string;
  role: string;
};

type AdminAuthContextValue = {
  admin: AdminInfo | null;
  token: string | null;
  bootstrapping: boolean;
  signIn: (token: string, admin: AdminInfo) => void;
  signOut: () => void;
};

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('adminToken'));
  const [admin, setAdmin] = useState<AdminInfo | null>(() => {
    const raw = localStorage.getItem('adminUser');
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AdminInfo;
    } catch {
      return null;
    }
  });
  const [bootstrapping, setBootstrapping] = useState<boolean>(!!token);

  useEffect(() => {
    if (!token) {
      setBootstrapping(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get<{ admin: AdminInfo }>('/admin/auth/me');
        if (!cancelled) {
          setAdmin(data.admin);
          localStorage.setItem('adminUser', JSON.stringify(data.admin));
        }
      } catch {
        if (!cancelled) {
          localStorage.removeItem('adminToken');
          localStorage.removeItem('adminUser');
          setToken(null);
          setAdmin(null);
        }
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const signIn = useCallback((newToken: string, newAdmin: AdminInfo) => {
    localStorage.setItem('adminToken', newToken);
    localStorage.setItem('adminUser', JSON.stringify(newAdmin));
    setToken(newToken);
    setAdmin(newAdmin);
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUser');
    setToken(null);
    setAdmin(null);
  }, []);

  const value = useMemo(
    () => ({ admin, token, bootstrapping, signIn, signOut }),
    [admin, token, bootstrapping, signIn, signOut]
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth(): AdminAuthContextValue {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) {
    throw new Error('useAdminAuth must be used within AdminAuthProvider');
  }
  return ctx;
}
