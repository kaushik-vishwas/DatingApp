import axios from 'axios';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Alert } from 'react-native';
import { io, type Socket } from 'socket.io-client';
import { authApi, clearJwt, getJwt, getResolvedApiBaseUrl, profileApi } from '../services/api';
import { markAuthWelcomeSeen } from '../services/authWelcomeStorage';
import type { UserProfile } from '../types/user';

type AuthContextValue = {
  token: string | null;
  user: UserProfile | null;
  bootstrapping: boolean;
  loadingUser: boolean;
  isSignedIn: boolean;
  /** Optional `initialUser` avoids a stale `/auth/me` flash right after login or profile submit. */
  signIn: (jwt: string, initialUser?: UserProfile | null) => void;
  /** Merge server user into session without clearing on transient `/auth/me` errors. */
  applyServerUser: (profile: UserProfile) => void;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [loadingUser, setLoadingUser] = useState(false);

  const refreshUser = useCallback(async (): Promise<void> => {
    const t = await getJwt();
    if (!t) {
      setUser(null);
      return;
    }
    setLoadingUser(true);
    try {
      const { data } = await authApi.me();
      setUser(data.user);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        setUser(null);
        await clearJwt();
        setToken(null);
      }
      // Non-401: keep existing user so a network blip does not revert onboarding or gate state.
    } finally {
      setLoadingUser(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const stored = await getJwt();
        if (!cancelled && stored) {
          setToken(stored);
        }
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!token) {
      setUser(null);
      return;
    }
    void refreshUser();
  }, [token, refreshUser]);

  const applyServerUser = useCallback((profile: UserProfile) => {
    setUser(profile);
  }, []);

  const signIn = useCallback((jwt: string, initialUser?: UserProfile | null) => {
    if (initialUser) setUser(initialUser);
    setToken(jwt);
    void markAuthWelcomeSeen();
  }, []);

  const signOut = useCallback(async () => {
    const role = user?.role;
    if (role === 'receiver') {
      try {
        await profileApi.updateReceiverProfile({ isAvailable: false });
      } catch {
        // Best-effort: clear local session even if offline request fails.
      }
    }
    await clearJwt();
    setToken(null);
    setUser(null);
  }, [user?.role]);

  /** Single-device login: server emits when this account signs in elsewhere; older JWT `sv` is lower. */
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    let socket: Socket | null = null;
    const base = getResolvedApiBaseUrl();
    void (async () => {
      const authTok = await getJwt();
      if (!authTok || cancelled) return;
      socket = io(base, {
        auth: { token: authTok },
        transports: ['polling', 'websocket'],
        timeout: 20000,
      });
      socket.on('auth:session_superseded', (payload: { currentSessionVersion?: number }) => {
        const nextVer = payload?.currentSessionVersion;
        if (typeof nextVer !== 'number' || !Number.isFinite(nextVer)) return;
        try {
          const part = token.split('.')[1];
          if (!part) return;
          const decoded = JSON.parse(atob(part)) as { sv?: number };
          const sv = typeof decoded.sv === 'number' ? decoded.sv : 0;
          if (sv < nextVer) {
            void (async () => {
              await signOut();
              Alert.alert('Signed out', 'This account was signed in on another device.');
            })();
          }
        } catch {
          // ignore malformed token
        }
      });
      socket.on('approved', () => {
        void refreshUser();
      });
      socket.on('rejected', (payload: { reason?: unknown }) => {
        const reason = typeof payload?.reason === 'string' ? payload.reason : null;
        setUser((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            accountStatus: 'rejected',
            rejectionReason: reason ?? prev.rejectionReason ?? null,
          };
        });
        void refreshUser();
      });
    })();
    return () => {
      cancelled = true;
      if (socket) {
        socket.removeAllListeners();
        socket.disconnect();
      }
    };
  }, [token, signOut, refreshUser]);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      user,
      bootstrapping,
      loadingUser,
      isSignedIn: Boolean(token),
      signIn,
      applyServerUser,
      signOut,
      refreshUser,
    }),
    [token, user, bootstrapping, loadingUser, signIn, applyServerUser, signOut, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
};
