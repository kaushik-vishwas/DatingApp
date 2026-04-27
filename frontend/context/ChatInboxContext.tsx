import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { chatApi, getJwt, getResolvedApiBaseUrl } from '../services/api';

type ChatInboxEvent = {
  peerId: string;
  lastText: string;
  lastAt: string;
  fromType: 'u' | 'r';
};

type ChatTypingEvent = {
  peerId: string;
  fromType: 'u' | 'r';
  fromId: string;
  typing: boolean;
};

type ChatInboxContextValue = {
  totalUnread: number;
  getUnreadCount: (peerId: string) => number;
  getTyping: (peerId: string) => boolean;
  markPeerReadLocal: (peerId: string) => void;
  refreshUnreadFromServer: () => Promise<void>;
  setActivePeer: (peerId: string | null) => void;
};

const ChatInboxContext = createContext<ChatInboxContextValue | null>(null);

function oppositeSenderType(role: 'caller' | 'receiver' | null): 'u' | 'r' | null {
  if (role === 'caller') return 'r';
  if (role === 'receiver') return 'u';
  return null;
}

export const ChatInboxProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isSignedIn, user } = useAuth();
  const [unreadByPeer, setUnreadByPeer] = useState<Record<string, number>>({});
  const [typingByPeer, setTypingByPeer] = useState<Record<string, boolean>>({});
  const socketRef = useRef<Socket | null>(null);
  const activePeerRef = useRef<string | null>(null);
  const typingTimersRef = useRef<Record<string, ReturnType<typeof setTimeout> | undefined>>({});
  const roleRef = useRef<'caller' | 'receiver' | null>(user?.role ?? null);

  useEffect(() => {
    roleRef.current = user?.role ?? null;
  }, [user?.role]);

  const refreshUnreadFromServer = useCallback(async (): Promise<void> => {
    if (!isSignedIn) {
      setUnreadByPeer({});
      return;
    }
    try {
      const { data } = await chatApi.conversations();
      const next: Record<string, number> = {};
      for (const row of data.conversations) {
        next[row.peerId] = Math.max(0, Number(row.unreadCount ?? 0));
      }
      setUnreadByPeer(next);
    } catch {
      // Keep existing badge state on transient failures.
    }
  }, [isSignedIn]);

  const markPeerReadLocal = useCallback((peerId: string) => {
    setUnreadByPeer((prev) => {
      if (!prev[peerId]) return prev;
      return { ...prev, [peerId]: 0 };
    });
    setTypingByPeer((prev) => (prev[peerId] ? { ...prev, [peerId]: false } : prev));
  }, []);

  const setActivePeer = useCallback((peerId: string | null) => {
    activePeerRef.current = peerId;
  }, []);

  useEffect(() => {
    if (!isSignedIn || !user) {
      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setUnreadByPeer({});
      setTypingByPeer({});
      return;
    }

    void refreshUnreadFromServer();

    let cancelled = false;
    const base = getResolvedApiBaseUrl();
    void (async () => {
      const token = await getJwt();
      if (!token || cancelled) return;

      const socket = io(base, {
        auth: { token },
        transports: ['polling', 'websocket'],
        timeout: 20000,
        reconnectionAttempts: 6,
        reconnectionDelay: 1000,
      });
      socketRef.current = socket;

      socket.on('chat:inbox', (event: ChatInboxEvent) => {
        const expectedIncomingType = oppositeSenderType(roleRef.current);
        if (!expectedIncomingType || event.fromType !== expectedIncomingType) return;
        const peerId = String(event.peerId || '').trim();
        if (!peerId) return;
        if (activePeerRef.current === peerId) return;
        setUnreadByPeer((prev) => ({ ...prev, [peerId]: (prev[peerId] ?? 0) + 1 }));
      });

      socket.on('chat:typing', (event: ChatTypingEvent) => {
        const expectedIncomingType = oppositeSenderType(roleRef.current);
        if (!expectedIncomingType || event.fromType !== expectedIncomingType) return;
        const peerId = String(event.peerId || '').trim();
        if (!peerId) return;
        const isTyping = Boolean(event.typing);
        setTypingByPeer((prev) => ({ ...prev, [peerId]: isTyping }));

        const timers = typingTimersRef.current;
        if (timers[peerId]) clearTimeout(timers[peerId]);
        if (isTyping) {
          timers[peerId] = setTimeout(() => {
            setTypingByPeer((prev) => ({ ...prev, [peerId]: false }));
          }, 2500);
        }
      });
    })();

    return () => {
      cancelled = true;
      const s = socketRef.current;
      if (s) {
        s.removeAllListeners();
        s.disconnect();
      }
      socketRef.current = null;
      for (const t of Object.values(typingTimersRef.current)) {
        if (t) clearTimeout(t);
      }
      typingTimersRef.current = {};
    };
  }, [isSignedIn, refreshUnreadFromServer, user]);

  const totalUnread = useMemo(
    () => Object.values(unreadByPeer).reduce((sum, count) => sum + Math.max(0, count), 0),
    [unreadByPeer]
  );

  const value = useMemo<ChatInboxContextValue>(
    () => ({
      totalUnread,
      getUnreadCount: (peerId: string) => unreadByPeer[peerId] ?? 0,
      getTyping: (peerId: string) => Boolean(typingByPeer[peerId]),
      markPeerReadLocal,
      refreshUnreadFromServer,
      setActivePeer,
    }),
    [markPeerReadLocal, refreshUnreadFromServer, totalUnread, typingByPeer, unreadByPeer, setActivePeer]
  );

  return <ChatInboxContext.Provider value={value}>{children}</ChatInboxContext.Provider>;
};

export const useChatInbox = (): ChatInboxContextValue => {
  const ctx = useContext(ChatInboxContext);
  if (!ctx) throw new Error('useChatInbox must be used within ChatInboxProvider');
  return ctx;
};

