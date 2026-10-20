import axios from 'axios';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { appAlert } from '../components/ui/AppDialog';
import { io, type Socket } from 'socket.io-client';
import { getForcedAppKind } from '../config/appKind';
import { navigationRef } from '../navigation/navigationRef';
import type { RootStackParamList } from '../navigation/RootStackParamList';
import {
  authApi,
  clearLocalAuth,
  getJwt,
  getResolvedApiBaseUrl,
  profileApi,
  registerSessionSupersededHandler,
} from '../services/api';
import { getAppVersionCode } from '../utils/appVersion';
import { reconcilePendingWalletCheckout } from '../utils/pendingWalletCheckout';
import { teardownCallSession } from '../utils/callSessionTeardown';
import { markAuthWelcomeSeen } from '../services/authWelcomeStorage';
import type { UserProfile } from '../types/user';
import { setSentryUser } from '../utils/sentry';

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
  signOut: (opts?: { skipServerCleanup?: boolean }) => Promise<void>;
  refreshUser: () => Promise<void>;
  /** True once after a fresh login (not session restore). Home offer popup uses this. */
  consumeCallerHomeOfferLoginShow: () => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function resetNavigationToLogin(): void {
  const preferred: keyof RootStackParamList =
    getForcedAppKind() === 'caller'
      ? 'UserLogin'
      : getForcedAppKind() === 'receiver'
        ? 'ReceiverLogin'
        : 'MobileLogin';
  const run = (): void => {
    try {
      if (!navigationRef.isReady()) return;
      const names = navigationRef.getRootState()?.routeNames ?? [];
      if (!names.includes(preferred)) return;
      navigationRef.reset({ index: 0, routes: [{ name: preferred }] });
    } catch {
      // The login route mounts with the signed-out tree after the token is cleared.
    }
  };
  run();
  setTimeout(run, 50);
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [loadingUser, setLoadingUser] = useState(false);
  const callerHomeOfferLoginShowRef = useRef(false);
  const signOutRef = useRef<(opts?: { skipServerCleanup?: boolean }) => Promise<void>>(async () => {
    await clearLocalAuth();
    setToken(null);
    setUser(null);
  });

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
        await signOutRef.current({ skipServerCleanup: true });
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

  useEffect(() => {
    if (user?._id && user.role) {
      setSentryUser({ id: user._id, role: user.role });
      return;
    }
    setSentryUser(null);
  }, [user?._id, user?.role]);

  useEffect(() => {
    if (!user || user.role !== 'caller') return;
    let cancelled = false;
    void reconcilePendingWalletCheckout().then(async (result) => {
      if (cancelled || result.status !== 'credited') return;
      await refreshUser();
    });
    return () => {
      cancelled = true;
    };
  }, [user?._id, user?.role, refreshUser]);

  const applyServerUser = useCallback((profile: UserProfile) => {
    setUser(profile);
  }, []);

  const signIn = useCallback((jwt: string, initialUser?: UserProfile | null) => {
    void teardownCallSession();
    callerHomeOfferLoginShowRef.current = true;
    if (initialUser) setUser(initialUser);
    setToken(jwt);
    void markAuthWelcomeSeen();
  }, []);

  const signOut = useCallback(async (opts?: { skipServerCleanup?: boolean }) => {
    const role = user?.role;
    // Forced sign-outs (session moved to another device / expired) must not turn off the new session.
    if (role === 'receiver' && opts?.skipServerCleanup !== true) {
      // Must run while the JWT is still stored; capped so a bad network never blocks logout.
      await Promise.race([
        Promise.allSettled([
          profileApi.updateReceiverProfile({ isAvailable: false }),
          profileApi.clearReceiverPushTokens(),
        ]),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
    }
    setToken(null);
    setUser(null);
    callerHomeOfferLoginShowRef.current = false;
    setSentryUser(null);
    await clearLocalAuth();
    void teardownCallSession();
    resetNavigationToLogin();
  }, [user?.role]);
  signOutRef.current = signOut;

  const consumeCallerHomeOfferLoginShow = useCallback((): boolean => {
    if (!callerHomeOfferLoginShowRef.current) return false;
    callerHomeOfferLoginShowRef.current = false;
    return true;
  }, []);

  useEffect(() => {
    registerSessionSupersededHandler((reason) => {
      void (async () => {
        await signOut({ skipServerCleanup: true });
        if (reason === 'superseded') {
          appAlert('Signed out', 'This account was signed in on another device.');
        }
      })();
    });
    return () => registerSessionSupersededHandler(null);
  }, [signOut]);

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
        query: { appVersion: getAppVersionCode() },
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
              await signOut({ skipServerCleanup: true });
              appAlert('Signed out', 'This account was signed in on another device.');
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
      consumeCallerHomeOfferLoginShow,
    }),
    [token, user, bootstrapping, loadingUser, signIn, applyServerUser, signOut, refreshUser, consumeCallerHomeOfferLoginShow]
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
