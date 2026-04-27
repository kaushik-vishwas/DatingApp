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

type PendingOutgoingCall = {
  callId: string;
  peerId: string;
  peerName: string;
  bootstrap: VoiceBootstrapResponse;
};

type CallSignalContextValue = {
  registerPeer: (peerId: string, peerName: string) => void;
  startCallInvite: (peerId: string, peerName: string) => Promise<void>;
};

const CallSignalContext = createContext<CallSignalContextValue | null>(null);

function getFallbackPeerName(fromType: 'u' | 'r'): string {
  return fromType === 'r' ? 'Receiver' : 'Caller';
}

export const CallSignalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isSignedIn, user } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const peerNamesRef = useRef<Map<string, string>>(new Map());
  const pendingOutgoingByCallIdRef = useRef<Map<string, PendingOutgoingCall>>(new Map());
  const userRoleRef = useRef(user?.role ?? null);

  useEffect(() => {
    userRoleRef.current = user?.role ?? null;
  }, [user?.role]);

  const openVoiceCall = useCallback(
    (bootstrap: VoiceBootstrapResponse, peerName: string) => {
      const navigate = () => {
        const nav = navigationRef.current;
        if (!nav || !nav.isReady()) return false;
        if (userRoleRef.current === 'caller') {
          nav.navigate('CallerApp', {
            screen: 'VoiceCall',
            params: { ...bootstrap, peerName },
          });
          return true;
        }
        if (userRoleRef.current === 'receiver') {
          nav.navigate('Home', {
            screen: 'VoiceCall',
            params: { ...bootstrap, peerName },
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

  const registerPeer = useCallback((peerId: string, peerName: string) => {
    const id = peerId.trim();
    const name = peerName.trim();
    if (!id || !name) return;
    peerNamesRef.current.set(id, name);
  }, []);

  const startCallInvite = useCallback(
    async (peerId: string, peerName: string): Promise<void> => {
      const id = peerId.trim();
      const name = peerName.trim();
      if (!id || !name) {
        throw new Error('Missing peer information for call invite.');
      }
      registerPeer(id, name);

      const socket = socketRef.current;
      if (!socket?.connected) {
        throw new Error('Call signaling is not connected. Check your network and try again.');
      }

      const { data } = await callApi.bootstrap(id);
      pendingOutgoingByCallIdRef.current.set(data.callId, {
        callId: data.callId,
        peerId: id,
        peerName: name,
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

      Alert.alert('Calling…', `Ringing ${name}`);
    },
    [registerPeer]
  );

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

      socket.on('call:incoming', (payload: CallIncomingPayload) => {
        if (payload.fromType === (userRoleRef.current === 'caller' ? 'u' : 'r')) return;
        const peerName =
          peerNamesRef.current.get(payload.fromId) ?? getFallbackPeerName(payload.fromType);

        Alert.alert(`${peerName} is calling`, 'Accept this voice call request?', [
          {
            text: 'Reject',
            style: 'destructive',
            onPress: () => {
              socket.emit('call:response', { callId: payload.callId, accepted: false });
            },
          },
          {
            text: 'Accept',
            onPress: () => {
              void (async () => {
                try {
                  const { data } = await callApi.bootstrap(payload.fromId);
                  socket.emit('call:response', { callId: payload.callId, accepted: true });
                  openVoiceCall(data, peerName);
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
        const pending = pendingOutgoingByCallIdRef.current.get(payload.callId);
        pendingOutgoingByCallIdRef.current.delete(payload.callId);

        if (!payload.accepted) {
          const name = pending?.peerName ?? peerNamesRef.current.get(payload.fromId) ?? 'User';
          Alert.alert('Call declined', `${name} declined your call.`);
          return;
        }

        if (pending) {
          openVoiceCall(pending.bootstrap, pending.peerName);
          return;
        }

        void (async () => {
          try {
            const { data } = await callApi.bootstrap(payload.fromId);
            const peerName = peerNamesRef.current.get(payload.fromId) ?? 'User';
            openVoiceCall(data, peerName);
          } catch {
            Alert.alert('Call accepted', 'The user accepted, but joining failed. Please try again.');
          }
        })();
      });

      socket.on('call:ended', (payload: CallEndedPayload) => {
        if (payload.fromType === (userRoleRef.current === 'caller' ? 'u' : 'r')) return;
        pendingOutgoingByCallIdRef.current.delete(payload.callId);
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
    };
  }, [isSignedIn, openVoiceCall, user]);

  const value = useMemo<CallSignalContextValue>(
    () => ({
      registerPeer,
      startCallInvite,
    }),
    [registerPeer, startCallInvite]
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

