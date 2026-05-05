import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { Alert } from 'react-native';
import { io, type Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { callApi, getJwt, getResolvedApiBaseUrl } from '../services/api';
import type { VoiceBootstrapResponse } from '../types/api';
import { navigationRef } from '../navigation/navigationRef';

type CallIncomingPayload = {
  callId: string;
  fromType: 'u' | 'r';
  fromId: string;
  fromName?: string;
  fromImage?: string | null;
};

type CallResponsePayload = {
  callId: string;
  accepted: boolean;
  fromType: 'u' | 'r';
  fromId: string;
};

type CallEndedPayload = {
  callId: string;
  fromType: 'u' | 'r';
  fromId: string;
};

type CallInviteAck = { ok?: boolean; error?: string };
type CallQueueAck = { ok?: boolean; error?: string; active?: boolean };

type PendingOutgoingCall = {
  callId: string;
  peerId: string;
  peerName: string;
  peerImage?: string | null;
  bootstrap: VoiceBootstrapResponse;
};

type InviteOutcomeWaiter = {
  resolve: (accepted: boolean) => void;
  timeout: ReturnType<typeof setTimeout>;
};

export type IncomingCallRequest = {
  callId: string;
  fromType: 'u' | 'r';
  fromId: string;
  peerName: string;
  peerImage?: string | null;
};

type CallSignalContextValue = {
  registerPeer: (peerId: string, peerName: string, peerImage?: string | null) => void;
  startCallInvite: (peerId: string, peerName: string, peerImage?: string | null) => Promise<void>;
  setIncomingCallHandler: (handler: ((req: IncomingCallRequest) => void) | null) => void;
  acceptIncomingCall: (req: IncomingCallRequest) => Promise<void>;
  rejectIncomingCall: (req: IncomingCallRequest) => void;
  setQueueMode: (active: boolean) => Promise<void>;
};

const CallSignalContext = createContext<CallSignalContextValue | null>(null);

function getFallbackPeerName(fromType: 'u' | 'r'): string {
  return fromType === 'r' ? 'Receiver' : 'Caller';
}

export const CallSignalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isSignedIn, user } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const peerProfileRef = useRef<Map<string, { name: string; image?: string | null }>>(new Map());
  const pendingOutgoingByCallIdRef = useRef<Map<string, PendingOutgoingCall>>(new Map());
  const pendingInviteOutcomeRef = useRef<Map<string, InviteOutcomeWaiter>>(new Map());
  const seenIncomingCallIdsRef = useRef<Map<string, number>>(new Map());
  const rejectedIncomingCallIdsRef = useRef<Set<string>>(new Set());
  const userRoleRef = useRef(user?.role ?? null);
  const incomingCallHandlerRef = useRef<((req: IncomingCallRequest) => void) | null>(null);
  const queueModeRef = useRef<boolean>(false);

  useEffect(() => {
    userRoleRef.current = user?.role ?? null;
  }, [user?.role]);

  const openVoiceCall = useCallback(
    (bootstrap: VoiceBootstrapResponse, peerName: string, peerImage?: string | null) => {
      const navigate = () => {
        const nav = navigationRef.current;
        if (!nav || !nav.isReady()) return false;
        if (userRoleRef.current === 'caller') {
          nav.navigate('CallerApp', {
            screen: 'VoiceCall',
            params: { ...bootstrap, peerName, peerImage: peerImage ?? null },
          });
          return true;
        }
        if (userRoleRef.current === 'receiver') {
          nav.navigate('Home', {
            screen: 'VoiceCall',
            params: { ...bootstrap, peerName, peerImage: peerImage ?? null },
          });
          return true;
        }
        return false;
      };

      if (navigate()) return;
      setTimeout(() => {
        void navigate();
      }, 500);
    },
    []
  );

  const registerPeer = useCallback((peerId: string, peerName: string, peerImage?: string | null) => {
    const id = peerId.trim();
    const name = peerName.trim();
    if (!id || !name) return;
    peerProfileRef.current.set(id, { name, image: peerImage ?? null });
  }, []);

  const clearPendingInvites = useCallback((emitEnd: boolean) => {
    const socket = socketRef.current;
    if (emitEnd && socket?.connected) {
      for (const callId of pendingOutgoingByCallIdRef.current.keys()) {
        socket.emit('call:end', { callId });
      }
    }
    pendingOutgoingByCallIdRef.current.clear();
    for (const waiter of pendingInviteOutcomeRef.current.values()) {
      clearTimeout(waiter.timeout);
      waiter.resolve(false);
    }
    pendingInviteOutcomeRef.current.clear();
  }, []);

  const startCallInvite = useCallback(
    async (peerId: string, peerName: string, peerImage?: string | null): Promise<void> => {
      const id = peerId.trim();
      const name = peerName.trim();
      if (!id || !name) {
        throw new Error('Missing peer information for call invite.');
      }
      registerPeer(id, name, peerImage);

      const socket = socketRef.current;
      if (!socket?.connected) {
        throw new Error('Call signaling is not connected. Check your network and try again.');
      }

      const { data } = await callApi.bootstrap(id);
      pendingOutgoingByCallIdRef.current.set(data.callId, {
        callId: data.callId,
        peerId: id,
        peerName: name,
        peerImage: peerImage ?? null,
        bootstrap: data,
      });

      const ack = await new Promise<CallInviteAck>((resolve) => {
        socket.emit('call:invite', { callId: data.callId, targetId: id }, (res: CallInviteAck) => {
          resolve(res ?? {});
        });
      });

      if (ack.ok === false) {
        pendingOutgoingByCallIdRef.current.delete(data.callId);
        throw new Error(ack.error || 'Could not ring this user.');
      }
      const accepted = await new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => {
          pendingInviteOutcomeRef.current.delete(data.callId);
          resolve(false);
        }, 35_000);
        pendingInviteOutcomeRef.current.set(data.callId, { resolve, timeout });
      });
      if (!accepted) {
        pendingOutgoingByCallIdRef.current.delete(data.callId);
        if (socket.connected) {
          socket.emit('call:end', { callId: data.callId });
        }
        throw new Error('Receiver is not available right now.');
      }
    },
    [registerPeer]
  );

  const rejectIncomingCall = useCallback((req: IncomingCallRequest) => {
    // Block only this exact call attempt after receiver rejects.
    rejectedIncomingCallIdsRef.current.add(req.callId);
    socketRef.current?.emit('call:response', { callId: req.callId, accepted: false });
  }, []);

  const acceptIncomingCall = useCallback(
    async (req: IncomingCallRequest): Promise<void> => {
      const socket = socketRef.current;
      if (!socket?.connected) {
        throw new Error('Call signaling is not connected.');
      }
      const { data } = await callApi.bootstrap(req.fromId, req.callId);
      socket.emit('call:response', { callId: req.callId, accepted: true });
      openVoiceCall(data, req.peerName, req.peerImage ?? null);
    },
    [openVoiceCall]
  );

  const setIncomingCallHandler = useCallback((handler: ((req: IncomingCallRequest) => void) | null) => {
    incomingCallHandlerRef.current = handler;
  }, []);

  const setQueueMode = useCallback(async (active: boolean): Promise<void> => {
    queueModeRef.current = active;
    if (!active) {
      clearPendingInvites(true);
    }
    const socket = socketRef.current;
    if (!socket?.connected) {
      return;
    }
    const ack = await new Promise<CallQueueAck>((resolve) => {
      socket.emit('call:queue:set', { active }, (res: CallQueueAck) => {
        resolve(res ?? {});
      });
    });
    if (ack.ok === false) {
      throw new Error(ack.error || 'Unable to update queue mode.');
    }
  }, [clearPendingInvites]);

  useEffect(() => {
    if (!isSignedIn || !user) {
      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      pendingOutgoingByCallIdRef.current.clear();
      return;
    }

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
      socket.on('connect', () => {
        socket.emit('call:queue:set', { active: queueModeRef.current }, () => {});
      });

      socket.on('call:incoming', (payload: CallIncomingPayload) => {
        if (payload.fromType === (userRoleRef.current === 'caller' ? 'u' : 'r')) return;
        if (rejectedIncomingCallIdsRef.current.has(payload.callId)) {
          socket.emit('call:response', { callId: payload.callId, accepted: false });
          return;
        }
        const now = Date.now();
        const seenAt = seenIncomingCallIdsRef.current.get(payload.callId);
        // Prevent duplicate incoming prompts for the same call invite.
        if (typeof seenAt === 'number' && now - seenAt < 45_000) {
          return;
        }
        seenIncomingCallIdsRef.current.set(payload.callId, now);
        // Keep map bounded.
        for (const [id, ts] of seenIncomingCallIdsRef.current) {
          if (now - ts > 60_000) seenIncomingCallIdsRef.current.delete(id);
        }
        const peerName =
          (typeof payload.fromName === 'string' && payload.fromName.trim()) ||
          peerProfileRef.current.get(payload.fromId)?.name ||
          getFallbackPeerName(payload.fromType);
        const peerImage =
          payload.fromImage ?? peerProfileRef.current.get(payload.fromId)?.image ?? null;
        const incoming: IncomingCallRequest = {
          callId: payload.callId,
          fromType: payload.fromType,
          fromId: payload.fromId,
          peerName,
          peerImage,
        };

        if (incomingCallHandlerRef.current) {
          incomingCallHandlerRef.current(incoming);
          return;
        }

        Alert.alert(`${peerName} is calling`, 'Accept this voice call request?', [
          {
            text: 'Reject',
            style: 'destructive',
            onPress: () => {
              rejectIncomingCall(incoming);
            },
          },
          {
            text: 'Accept',
            onPress: () => {
              void (async () => {
                try {
                  await acceptIncomingCall(incoming);
                } catch (e: unknown) {
                  const msg = e instanceof Error ? e.message : 'Unable to join call.';
                  Alert.alert('Call failed', msg);
                }
              })();
            },
          },
        ]);
      });

      socket.on('call:response', (payload: CallResponsePayload) => {
        if (payload.fromType === (userRoleRef.current === 'caller' ? 'u' : 'r')) return;
        if (payload.accepted) {
          seenIncomingCallIdsRef.current.delete(payload.callId);
          rejectedIncomingCallIdsRef.current.delete(payload.callId);
        }
        const pending = pendingOutgoingByCallIdRef.current.get(payload.callId);
        pendingOutgoingByCallIdRef.current.delete(payload.callId);
        const waiter = pendingInviteOutcomeRef.current.get(payload.callId);
        if (waiter) {
          clearTimeout(waiter.timeout);
          pendingInviteOutcomeRef.current.delete(payload.callId);
          waiter.resolve(payload.accepted);
        }

        if (!payload.accepted) {
          if (!waiter) {
            Alert.alert('Call unavailable', 'Receiver is not available right now.');
          }
          return;
        }

        if (pending) {
          openVoiceCall(pending.bootstrap, pending.peerName, pending.peerImage);
          return;
        }

        void (async () => {
          try {
            const { data } = await callApi.bootstrap(payload.fromId, payload.callId);
            const fallback = peerProfileRef.current.get(payload.fromId);
            const peerName = fallback?.name ?? 'User';
            openVoiceCall(data, peerName, fallback?.image ?? null);
          } catch {
            Alert.alert('Call accepted', 'The user accepted, but joining failed. Please try again.');
          }
        })();
      });

      socket.on('call:ended', (payload: CallEndedPayload) => {
        if (payload.fromType === (userRoleRef.current === 'caller' ? 'u' : 'r')) return;
        seenIncomingCallIdsRef.current.delete(payload.callId);
        rejectedIncomingCallIdsRef.current.delete(payload.callId);
        pendingOutgoingByCallIdRef.current.delete(payload.callId);
        const waiter = pendingInviteOutcomeRef.current.get(payload.callId);
        if (waiter) {
          clearTimeout(waiter.timeout);
          pendingInviteOutcomeRef.current.delete(payload.callId);
          waiter.resolve(false);
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
      clearPendingInvites(false);
      socketRef.current = null;
    };
  }, [clearPendingInvites, isSignedIn, openVoiceCall, user]);

  const value = useMemo<CallSignalContextValue>(
    () => ({
      registerPeer,
      startCallInvite,
      setIncomingCallHandler,
      acceptIncomingCall,
      rejectIncomingCall,
      setQueueMode,
    }),
    [
      registerPeer,
      startCallInvite,
      setIncomingCallHandler,
      acceptIncomingCall,
      rejectIncomingCall,
      setQueueMode,
    ]
  );

  return <CallSignalContext.Provider value={value}>{children}</CallSignalContext.Provider>;
};

export const useCallSignals = (): CallSignalContextValue => {
  const ctx = useContext(CallSignalContext);
  if (!ctx) {
    throw new Error('useCallSignals must be used within CallSignalProvider');
  }
  return ctx;
};

