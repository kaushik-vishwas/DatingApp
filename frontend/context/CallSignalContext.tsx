import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, type AppStateStatus } from 'react-native';
import { callDiag } from '../utils/callDiagnostics';
import { CommonActions } from '@react-navigation/native';
import { io, type Socket } from 'socket.io-client';
import RandomCallMatchingOverlay from '../components/caller/RandomCallMatchingOverlay';
import { useAuth } from './AuthContext';
import { callApi, getErrorMessage, getJwt, getResolvedApiBaseUrl, profileApi } from '../services/api';
import { MAX_RANDOM_CALL_RETRIES, isRetryableRandomInviteError } from '../utils/randomCallMatch';
import { startRandomMatchingTone } from '../utils/callSounds';
import type { VoiceBootstrapResponse } from '../types/api';
import type { VoiceCallScreenParams } from '../navigation/voiceCallParams';
import { navigationRef } from '../navigation/navigationRef';
import {
  ensureIncomingRingtoneLoaded,
  startIncomingRingtone,
  stopIncomingRingtonePlayback,
  stopOutboundRingtonePlayback,
} from '../utils/callSounds';
import {
  bindIncomingCallNotificationHandlers,
  canNavigateToIncomingCall,
  clearIncomingCallNotificationDedupe,
  isAppInBackground,
  markIncomingCallHandled,
  registerReceiverExpoPushToken,
  setIncomingCallNavigationGuard,
  showIncomingCallNotification,
} from '../utils/incomingCallNotifications';
import { registerIncomingCallBootstrapPrefetch } from '../utils/incomingCallBootstrapPrefetch';
import { clearVoiceCallStreamWarmup, warmVoiceCallStreamClient } from '../utils/voiceCallStreamWarmup';

let outgoingNavigateGeneration = 0;

function bumpOutgoingNavigateGeneration(): void {
  outgoingNavigateGeneration += 1;
}

function scheduleNavigateWhenReady(tryNavigate: () => boolean, navGeneration: number): void {
  if (navGeneration !== outgoingNavigateGeneration) return;
  if (tryNavigate()) return;
  let frames = 0;
  const maxFrames = 24;
  const tick = (): void => {
    if (navGeneration !== outgoingNavigateGeneration) return;
    if (tryNavigate()) return;
    frames += 1;
    if (frames < maxFrames) requestAnimationFrame(tick);
    else if (navGeneration === outgoingNavigateGeneration) void tryNavigate();
  };
  requestAnimationFrame(tick);
}

/** Incoming-call navigation after notification tap — Samsung can need several seconds. */
function scheduleIncomingNavigateWhenReady(tryNavigate: () => boolean): void {
  if (tryNavigate()) return;
  let attempts = 0;
  const maxAttempts = 100;
  const id = setInterval(() => {
    attempts += 1;
    if (tryNavigate() || attempts >= maxAttempts) {
      clearInterval(id);
    }
  }, 100);
}

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

type CallHoldPayload = {
  callId: string;
  onHold: boolean;
  fromType: 'u' | 'r';
  fromId: string;
};

type CallMutePayload = {
  callId: string;
  muted: boolean;
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
  resolve: (outcome: InviteOutcome) => void;
  timeout: ReturnType<typeof setTimeout>;
};

type InviteOutcome =
  | { accepted: true; reason: 'accepted' }
  | { accepted: false; reason: 'rejected' | 'ended' | 'timeout' };

export type IncomingCallRequest = {
  callId: string;
  fromType: 'u' | 'r';
  fromId: string;
  peerName: string;
  peerImage?: string | null;
};

export type StartCallInviteOptions = {
  receiverRatePerMinuteHint?: number;
  receiverEarningRatePerMinuteHint?: number;
  /** After no-answer / decline / hang-up before connect, open random matching (manual calls only). */
  redirectToRandomOnMissed?: boolean;
};

type CallSignalContextValue = {
  registerPeer: (peerId: string, peerName: string, peerImage?: string | null) => void;
  startCallInvite: (
    peerId: string,
    peerName: string,
    peerImage?: string | null,
    options?: StartCallInviteOptions
  ) => Promise<void>;
  startRandomCallEngagement: () => Promise<void>;
  cancelRandomCallEngagement: () => void;
  randomCallMatchingVisible: boolean;
  cancelOutgoingCallInvite: () => void;
  setIncomingCallHandler: (handler: ((req: IncomingCallRequest) => void) | null) => void;
  /** Receiver availability VoiceCall: clear incoming UI when caller cancels or call ends. */
  setIncomingCallDismissHandler: (handler: ((callId: string) => void) | null) => void;
  /** VoiceCall screen: tear down active Stream session when the peer ends the call. */
  setRemoteCallEndedHandler: (handler: ((callId: string) => void) | null) => void;
  /** VoiceCall screen: re-check server session after signaling socket reconnect (background OEMs). */
  setActiveCallRecoveryHandler: (handler: (() => void) | null) => void;
  /** VoiceCall screen: apply shared server talkStartedAt instantly when both parties connect. */
  setTalkStartedHandler: (
    handler: ((callId: string, talkStartedAt: string) => void) | null
  ) => void;
  /** Notify peer instantly via the shared call-signaling socket (always-on while signed in). */
  emitCallEnd: (callId: string) => void;
  /** Tell peer this party is on hold (e.g. external phone call). */
  emitCallHold: (callId: string, onHold: boolean) => void;
  /** Tell peer this party muted/unmuted their microphone. */
  emitCallMute: (callId: string, muted: boolean) => void;
  /** VoiceCall screen: show when the remote party enters/leaves hold. */
  setPeerCallHoldHandler: (handler: ((callId: string, onHold: boolean) => void) | null) => void;
  /** VoiceCall screen: show when the remote party mutes/unmutes. */
  setPeerCallMuteHandler: (handler: ((callId: string, muted: boolean) => void) | null) => void;
  acceptIncomingCall: (req: IncomingCallRequest) => Promise<void>;
  rejectIncomingCall: (req: IncomingCallRequest) => void;
  setQueueMode: (active: boolean) => Promise<void>;
  stopIncomingRingtone: () => Promise<void>;
  startIncomingRingtone: () => Promise<void>;
  /** Accept invite and return Stream bootstrap without leaving the current VoiceCall screen. */
  acceptIncomingCallStayOnScreen: (req: IncomingCallRequest) => Promise<VoiceBootstrapResponse>;
};

const CallSignalContext = createContext<CallSignalContextValue | null>(null);

function getFallbackPeerName(fromType: 'u' | 'r'): string {
  return fromType === 'r' ? 'Receiver' : 'Caller';
}

const CALL_SIGNAL_CONNECT_WAIT_MS = 12_000;
const CALL_SIGNAL_NOT_CONNECTED_MSG =
  'Call signaling is not connected. Check your network and try again.';

/** Wait for the shared call socket (connect can lag behind REST after login / refresh). */
async function ensureCallSocketReady(
  socketRef: React.MutableRefObject<Socket | null>
): Promise<Socket> {
  const kickConnect = (): void => {
    const socket = socketRef.current;
    if (socket && !socket.connected) {
      try {
        socket.connect();
      } catch {
        // wait loop retries
      }
    }
  };
  kickConnect();

  const deadline = Date.now() + CALL_SIGNAL_CONNECT_WAIT_MS;
  let delayMs = 40;
  while (Date.now() < deadline) {
    const socket = socketRef.current;
    if (socket?.connected) return socket;
    kickConnect();
    await new Promise<void>((resolve) => {
      setTimeout(resolve, delayMs);
    });
    delayMs = Math.min(120, delayMs + 20);
  }
  throw new Error(CALL_SIGNAL_NOT_CONNECTED_MSG);
}

/** Outbound ringing UI must not sit under active VoiceCall (back would return to "Calling…"). */
function callerShouldResetStackForVoiceCall(params: VoiceCallScreenParams): boolean {
  // Outbound ringing → joining stays on one VoiceCall screen (avoids Stream client teardown mid-call).
  if ('outgoingCallerPhase' in params && params.outgoingCallerPhase) {
    return false;
  }
  return Boolean(
    'apiKey' in params && typeof params.apiKey === 'string' && String(params.apiKey).trim().length > 0
  );
}

export const CallSignalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isSignedIn, user } = useAuth();
  const [randomCallMatchingVisible, setRandomCallMatchingVisible] = useState(false);
  const randomMatchAbortRef = useRef<AbortController | null>(null);
  const randomMatchStopSoundRef = useRef<(() => Promise<void>) | null>(null);
  const randomMatchRunningRef = useRef(false);
  const scheduleRandomAfterMissedManualCallRef = useRef<() => void>(() => {});
  const socketRef = useRef<Socket | null>(null);
  const peerProfileRef = useRef<Map<string, { name: string; image?: string | null }>>(new Map());
  const pendingOutgoingByCallIdRef = useRef<Map<string, PendingOutgoingCall>>(new Map());
  const pendingInviteOutcomeRef = useRef<Map<string, InviteOutcomeWaiter>>(new Map());
  const seenIncomingCallIdsRef = useRef<Map<string, number>>(new Map());
  const rejectedIncomingCallIdsRef = useRef<Set<string>>(new Set());
  const acceptedIncomingCallIdsRef = useRef<Set<string>>(new Set());
  const activeIncomingCallUiCallIdRef = useRef<string | null>(null);
  /** Active ring; used when the tray tap only resumes the task without notification-response extras. */
  const pendingIncomingCallRequestRef = useRef<IncomingCallRequest | null>(null);
  const incomingBootstrapByCallIdRef = useRef<Map<string, VoiceBootstrapResponse>>(new Map());
  const incomingBootstrapPromiseByCallIdRef = useRef<Map<string, Promise<VoiceBootstrapResponse>>>(new Map());
  const userRoleRef = useRef(user?.role ?? null);
  const outgoingInviteAbortRef = useRef<AbortController | null>(null);
  const incomingCallHandlerRef = useRef<((req: IncomingCallRequest) => void) | null>(null);
  const incomingCallDismissHandlerRef = useRef<((callId: string) => void) | null>(null);
  const remoteCallEndedHandlerRef = useRef<((callId: string) => void) | null>(null);
  const activeCallRecoveryHandlerRef = useRef<(() => void) | null>(null);
  const talkStartedHandlerRef = useRef<((callId: string, talkStartedAt: string) => void) | null>(
    null
  );
  const peerCallHoldHandlerRef = useRef<((callId: string, onHold: boolean) => void) | null>(null);
  const peerCallMuteHandlerRef = useRef<((callId: string, muted: boolean) => void) | null>(null);
  /** Re-emit on socket reconnect (Samsung cellular call can drop WebSocket briefly). */
  const pendingCallHoldEmitRef = useRef<{ callId: string; onHold: boolean } | null>(null);
  const pendingCallMuteEmitRef = useRef<{ callId: string; muted: boolean } | null>(null);
  const pendingCallEndEmitRef = useRef<string | null>(null);
  const queueModeRef = useRef<boolean>(false);
  const userAvailableRef = useRef<boolean>(Boolean(user?.isAvailable));
  /** Receiver accepted — never re-apply `outgoingCallerPhase: 'ringing'` (race with delayed navigate). */
  const callerInviteAcceptedCallIdsRef = useRef<Set<string>>(new Set());
  /** Bootstrap session kept until call ends (survives pending map cleanup on accept). */
  const outgoingSessionByCallIdRef = useRef<Map<string, PendingOutgoingCall>>(new Map());

  const onIncomingBootstrapReady = useCallback(
    (boot: VoiceBootstrapResponse) => {
      const name =
        user?.name?.trim() ||
        (user?.role === 'receiver' ? 'Receiver' : 'Caller');
      const image =
        typeof user?.profileImage === 'string' ? user.profileImage : null;
      void warmVoiceCallStreamClient(boot, name, image);
    },
    [user?.name, user?.profileImage, user?.role]
  );

  const ensureIncomingBootstrapPromise = useCallback(
    (req: IncomingCallRequest): Promise<VoiceBootstrapResponse> => {
      const cached = incomingBootstrapByCallIdRef.current.get(req.callId) ?? null;
      if (cached) {
        return Promise.resolve(cached);
      }
      const inFlight = incomingBootstrapPromiseByCallIdRef.current.get(req.callId);
      if (inFlight) {
        return inFlight;
      }
      const promise = callApi.bootstrap(req.fromId, req.callId).then(({ data }) => {
        if (activeIncomingCallUiCallIdRef.current === req.callId) {
          incomingBootstrapByCallIdRef.current.set(req.callId, data);
        }
        onIncomingBootstrapReady(data);
        return data;
      });
      incomingBootstrapPromiseByCallIdRef.current.set(req.callId, promise);
      void promise.catch(() => {
        incomingBootstrapByCallIdRef.current.delete(req.callId);
        incomingBootstrapPromiseByCallIdRef.current.delete(req.callId);
      });
      return promise;
    },
    [onIncomingBootstrapReady]
  );

  const prefetchIncomingBootstrapFromPayload = useCallback(
    (incoming: IncomingCallRequest) => {
      if (
        incomingBootstrapByCallIdRef.current.has(incoming.callId) ||
        incomingBootstrapPromiseByCallIdRef.current.has(incoming.callId)
      ) {
        return;
      }
      void ensureIncomingBootstrapPromise(incoming);
    },
    [ensureIncomingBootstrapPromise]
  );

  useEffect(() => {
    registerIncomingCallBootstrapPrefetch(prefetchIncomingBootstrapFromPayload);
    return () => registerIncomingCallBootstrapPrefetch(null);
  }, [prefetchIncomingBootstrapFromPayload]);

  useEffect(() => {
    userRoleRef.current = user?.role ?? null;
  }, [user?.role]);

  useEffect(() => {
    if (user?.role === 'receiver') {
      const available = Boolean(user.isAvailable);
      queueModeRef.current = available;
      userAvailableRef.current = available;
    }
  }, [user?.role, user?.isAvailable]);

  const dismissCallerVoiceCallScreen = useCallback((): void => {
    const nav = navigationRef.current;
    if (!nav?.isReady()) return;
    try {
      if (nav.canGoBack()) {
        nav.goBack();
        return;
      }
    } catch {
      // ignore
    }
    if (userRoleRef.current === 'caller') {
      nav.navigate('CallerApp', {
        screen: 'CallerMainTabs',
        params: { screen: 'CallerHome' },
      });
    } else if (userRoleRef.current === 'receiver') {
      nav.navigate('Home', { screen: 'ReceiverMainTabs', params: { screen: 'ReceiverHome' } });
    }
  }, []);

  const navigateToVoiceCallParams = useCallback((params: VoiceCallScreenParams): boolean => {
    const nav = navigationRef.current;
    if (!nav || !nav.isReady()) return false;
    if (userRoleRef.current === 'caller') {
      if (callerShouldResetStackForVoiceCall(params)) {
        nav.dispatch(
          CommonActions.reset({
            index: 0,
            routes: [
              {
                name: 'CallerApp',
                state: {
                  routes: [
                    {
                      name: 'CallerMainTabs',
                      state: { routes: [{ name: 'CallerHome' }], index: 0 },
                    },
                    { name: 'VoiceCall', params },
                  ],
                  index: 1,
                },
              },
            ],
          })
        );
        return true;
      }
      nav.navigate('CallerApp', {
        screen: 'VoiceCall',
        params,
      });
      return true;
    }
    if (userRoleRef.current === 'receiver') {
      nav.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [
            {
              name: 'Home',
              state: {
                routes: [
                  { name: 'ReceiverMainTabs', state: { routes: [{ name: 'ReceiverHome' }], index: 0 } },
                  { name: 'VoiceCall', params },
                ],
                index: 1,
              },
            },
          ],
        })
      );
      return true;
    }
    return false;
  }, []);

  const openIncomingCall = useCallback((incoming: IncomingCallRequest) => {
    if (!canNavigateToIncomingCall(incoming.callId)) return;
    const navigate = () => {
      const nav = navigationRef.current;
      if (!nav || !nav.isReady()) return false;
      nav.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [
            {
              name: 'Home',
              state: {
                routes: [
                  { name: 'ReceiverMainTabs', state: { routes: [{ name: 'ReceiverHome' }], index: 0 } },
                  {
                    name: 'IncomingCall',
                    params: {
                      callId: incoming.callId,
                      fromType: incoming.fromType,
                      fromId: incoming.fromId,
                      peerName: incoming.peerName,
                      peerImage: incoming.peerImage ?? null,
                    },
                  },
                ],
                index: 1,
              },
            },
          ],
        })
      );
      return true;
    };
    if (navigate()) return;
    scheduleIncomingNavigateWhenReady(navigate);
  }, []);

  const openVoiceCall = useCallback(
    (
      bootstrap: VoiceBootstrapResponse,
      peerName: string,
      peerImage?: string | null,
      opts?: { outgoingCallerPhase?: 'joining' }
    ) => {
      if (opts?.outgoingCallerPhase === 'joining') {
        callerInviteAcceptedCallIdsRef.current.add(bootstrap.callId);
      }
      const params: VoiceCallScreenParams = {
        ...bootstrap,
        peerName,
        peerImage: peerImage ?? null,
        ...(opts?.outgoingCallerPhase ? { outgoingCallerPhase: opts.outgoingCallerPhase } : {}),
      };
      const navGen = outgoingNavigateGeneration;
      const navigate = () => navigateToVoiceCallParams(params);
      if (navigate()) return;
      scheduleNavigateWhenReady(navigate, navGen);
    },
    [navigateToVoiceCallParams]
  );

  const openCallerJoiningVoiceCall = useCallback(
    (session: PendingOutgoingCall) => {
      openVoiceCall(session.bootstrap, session.peerName, session.peerImage, {
        outgoingCallerPhase: 'joining',
      });
    },
    [openVoiceCall]
  );

  const navigateCallerOutboundRinging = useCallback(
    (callId: string, ringingParams: VoiceCallScreenParams) => {
      if (callerInviteAcceptedCallIdsRef.current.has(callId)) {
        const session = outgoingSessionByCallIdRef.current.get(callId);
        if (session) {
          openCallerJoiningVoiceCall(session);
        }
        return true;
      }
      return navigateToVoiceCallParams(ringingParams);
    },
    [navigateToVoiceCallParams, openCallerJoiningVoiceCall]
  );

  const openVoiceCallRinging = useCallback(
    (p: {
      peerAccountId: string;
      peerName: string;
      peerImage?: string | null;
      receiverRatePerMinuteHint?: number;
      receiverEarningRatePerMinuteHint?: number;
    }) => {
      const params: VoiceCallScreenParams = {
        outgoingCallerPhase: 'ringing',
        peerAccountId: p.peerAccountId.trim(),
        peerName: p.peerName.trim(),
        peerImage: p.peerImage ?? null,
        receiverRatePerMinuteHint: p.receiverRatePerMinuteHint,
        receiverEarningRatePerMinuteHint: p.receiverEarningRatePerMinuteHint,
      };
      const navigate = () => {
        const nav = navigationRef.current;
        if (!nav || !nav.isReady()) return false;
        if (userRoleRef.current !== 'caller') return false;
        nav.navigate('CallerApp', { screen: 'VoiceCall', params });
        return true;
      };
      const navGen = outgoingNavigateGeneration;
      if (navigate()) return;
      scheduleNavigateWhenReady(navigate, navGen);
    },
    []
  );

  const clearOutgoingCallSession = useCallback((callId: string) => {
    callerInviteAcceptedCallIdsRef.current.delete(callId);
    outgoingSessionByCallIdRef.current.delete(callId);
    pendingOutgoingByCallIdRef.current.delete(callId);
  }, []);

  const cancelOutgoingCallInvite = useCallback(() => {
    outgoingInviteAbortRef.current?.abort();
    outgoingInviteAbortRef.current = null;
    bumpOutgoingNavigateGeneration();
    void stopOutboundRingtonePlayback();

    const socket = socketRef.current;
    const callIds = new Set([
      ...pendingOutgoingByCallIdRef.current.keys(),
      ...outgoingSessionByCallIdRef.current.keys(),
    ]);
    for (const callId of callIds) {
      if (socket?.connected) {
        socket.emit('call:end', { callId });
      }
      clearOutgoingCallSession(callId);
    }
    for (const [, waiter] of pendingInviteOutcomeRef.current) {
      clearTimeout(waiter.timeout);
      waiter.resolve({ accepted: false, reason: 'ended' });
    }
    pendingInviteOutcomeRef.current.clear();
  }, [clearOutgoingCallSession]);

  const registerPeer = useCallback((peerId: string, peerName: string, peerImage?: string | null) => {
    const id = peerId.trim();
    const name = peerName.trim();
    if (!id || !name) return;
    peerProfileRef.current.set(id, { name, image: peerImage ?? null });
  }, [clearOutgoingCallSession]);

  const clearPendingInvites = useCallback((emitEnd: boolean) => {
    const socket = socketRef.current;
    if (emitEnd && socket?.connected) {
      for (const callId of pendingOutgoingByCallIdRef.current.keys()) {
        socket.emit('call:end', { callId });
      }
    }
    callerInviteAcceptedCallIdsRef.current.clear();
    outgoingSessionByCallIdRef.current.clear();
    pendingOutgoingByCallIdRef.current.clear();
    for (const waiter of pendingInviteOutcomeRef.current.values()) {
      clearTimeout(waiter.timeout);
      waiter.resolve({ accepted: false, reason: 'ended' });
    }
    pendingInviteOutcomeRef.current.clear();
  }, []);

  const startCallInvite = useCallback(
    async (
      peerId: string,
      peerName: string,
      peerImage?: string | null,
      options?: StartCallInviteOptions
    ): Promise<void> => {
      const id = peerId.trim();
      const name = peerName.trim();
      if (!id || !name) {
        throw new Error('Missing peer information for call invite.');
      }
      registerPeer(id, name, peerImage);

      const abort = new AbortController();
      outgoingInviteAbortRef.current = abort;
      const navGen = outgoingNavigateGeneration;

      openVoiceCallRinging({
        peerAccountId: id,
        peerName: name,
        peerImage: peerImage ?? null,
        receiverRatePerMinuteHint: options?.receiverRatePerMinuteHint,
        receiverEarningRatePerMinuteHint: options?.receiverEarningRatePerMinuteHint,
      });

      try {
        const [{ data }, socket] = await Promise.all([
          callApi.bootstrap(id),
          ensureCallSocketReady(socketRef),
        ]);
        if (abort.signal.aborted) {
          return;
        }
        const session: PendingOutgoingCall = {
          callId: data.callId,
          peerId: id,
          peerName: name,
          peerImage: peerImage ?? null,
          bootstrap: data,
        };
        outgoingSessionByCallIdRef.current.set(data.callId, session);
        pendingOutgoingByCallIdRef.current.set(data.callId, session);
        const callerName = user?.name?.trim() || 'Caller';
        const callerImage =
          typeof user?.profileImage === 'string' ? user.profileImage : null;
        void warmVoiceCallStreamClient(data, callerName, callerImage);

        const ringingParams: VoiceCallScreenParams = {
          ...data,
          peerName: name,
          peerImage: peerImage ?? null,
          outgoingCallerPhase: 'ringing',
        };
        const mergeNavigate = () => navigateCallerOutboundRinging(data.callId, ringingParams);
        if (!mergeNavigate()) {
          scheduleNavigateWhenReady(mergeNavigate, navGen);
        }

        const ack = await new Promise<CallInviteAck>((resolve) => {
          socket.emit('call:invite', { callId: data.callId, targetId: id }, (res: CallInviteAck) => {
            resolve(res ?? {});
          });
        });

        if (abort.signal.aborted) {
          return;
        }

        if (ack.ok === false) {
          clearOutgoingCallSession(data.callId);
          throw new Error(ack.error || 'Could not ring this user.');
        }
        const outcome = await new Promise<InviteOutcome>((resolve) => {
          const timeout = setTimeout(() => {
            pendingInviteOutcomeRef.current.delete(data.callId);
            resolve({ accepted: false, reason: 'timeout' });
          }, 30_000);
          pendingInviteOutcomeRef.current.set(data.callId, { resolve, timeout });
        });
        if (!outcome.accepted) {
          clearOutgoingCallSession(data.callId);
          if (socket.connected) {
            socket.emit('call:end', { callId: data.callId });
          }
          if (options?.redirectToRandomOnMissed && !abort.signal.aborted) {
            dismissCallerVoiceCallScreen();
            scheduleRandomAfterMissedManualCallRef.current();
            return;
          }
          if (abort.signal.aborted) {
            return;
          }
          if (outcome.reason === 'rejected') {
            throw new Error('Call was declined by receiver.');
          }
          throw new Error('Receiver is not available right now.');
        }
        const joinedSession = outgoingSessionByCallIdRef.current.get(data.callId);
        if (joinedSession) {
          openCallerJoiningVoiceCall(joinedSession);
        }
      } catch (e) {
        if (abort.signal.aborted) {
          return;
        }
        dismissCallerVoiceCallScreen();
        throw e;
      } finally {
        if (outgoingInviteAbortRef.current === abort) {
          outgoingInviteAbortRef.current = null;
        }
      }
    },
    [
      clearOutgoingCallSession,
      dismissCallerVoiceCallScreen,
      navigateCallerOutboundRinging,
      openCallerJoiningVoiceCall,
      openVoiceCallRinging,
      registerPeer,
      user?.name,
      user?.profileImage,
    ]
  );

  const startRandomCallEngagement = useCallback(async (): Promise<void> => {
    if (userRoleRef.current !== 'caller') return;
    if (randomMatchRunningRef.current) return;

    const wallet =
      typeof user?.walletBalance === 'number' && Number.isFinite(user.walletBalance)
        ? Math.max(0, user.walletBalance)
        : 0;

    const abort = new AbortController();
    randomMatchAbortRef.current = abort;
    randomMatchRunningRef.current = true;
    setRandomCallMatchingVisible(true);

    let stopMatchSound: (() => Promise<void>) | undefined;
    try {
      stopMatchSound = await startRandomMatchingTone();
      randomMatchStopSoundRef.current = stopMatchSound;
      let lastErr: unknown = null;
      for (let attempt = 0; attempt < MAX_RANDOM_CALL_RETRIES; attempt += 1) {
        if (abort.signal.aborted) return;
        try {
          const { data } = await callApi.randomReceiver();
          if (abort.signal.aborted) return;
          const rate =
            typeof data.audioCallRate === 'number' && Number.isFinite(data.audioCallRate)
              ? data.audioCallRate
              : null;
          if (rate != null && wallet < rate) {
            setRandomCallMatchingVisible(false);
            const nav = navigationRef.current;
            if (nav?.isReady()) {
              nav.navigate('CallerApp', { screen: 'Wallet' });
            }
            return;
          }
          await stopMatchSound?.();
          stopMatchSound = undefined;
          setRandomCallMatchingVisible(false);
          await startCallInvite(data.receiverId, data.name, data.profileImage ?? null, {
            receiverRatePerMinuteHint:
              rate != null && Number.isFinite(rate) ? rate : undefined,
            redirectToRandomOnMissed: true,
          });
          return;
        } catch (e: unknown) {
          lastErr = e;
          const msg = getErrorMessage(e);
          if (!isRetryableRandomInviteError(msg) || attempt === MAX_RANDOM_CALL_RETRIES - 1) {
            throw e;
          }
        }
      }
      throw lastErr ?? new Error('No available receiver found right now. Please try again shortly.');
    } catch (e: unknown) {
      if (!abort.signal.aborted) {
        Alert.alert('Random call', getErrorMessage(e));
      }
    } finally {
      await stopMatchSound?.();
      randomMatchStopSoundRef.current = null;
      if (randomMatchAbortRef.current === abort) {
        randomMatchAbortRef.current = null;
      }
      // Aborted for handoff to the next random match — leave overlay/state to the new engagement.
      if (!abort.signal.aborted) {
        randomMatchRunningRef.current = false;
        setRandomCallMatchingVisible(false);
      }
    }
  }, [startCallInvite, user?.walletBalance]);

  const cancelRandomCallEngagement = useCallback(() => {
    randomMatchAbortRef.current?.abort();
    randomMatchAbortRef.current = null;
    randomMatchRunningRef.current = false;
    void randomMatchStopSoundRef.current?.();
    randomMatchStopSoundRef.current = null;
    setRandomCallMatchingVisible(false);
    void stopOutboundRingtonePlayback();
  }, []);

  useEffect(() => {
    scheduleRandomAfterMissedManualCallRef.current = () => {
      randomMatchAbortRef.current?.abort();
      randomMatchAbortRef.current = null;
      randomMatchRunningRef.current = false;
      void startRandomCallEngagement();
    };
  }, [startRandomCallEngagement]);

  const rejectIncomingCall = useCallback((req: IncomingCallRequest) => {
    void markIncomingCallHandled(req.callId);
    void stopIncomingRingtonePlayback();
    clearIncomingCallNotificationDedupe(req.callId);
    rejectedIncomingCallIdsRef.current.add(req.callId);
    if (activeIncomingCallUiCallIdRef.current === req.callId) {
      activeIncomingCallUiCallIdRef.current = null;
      pendingIncomingCallRequestRef.current = null;
    }
    incomingBootstrapByCallIdRef.current.delete(req.callId);
    incomingBootstrapPromiseByCallIdRef.current.delete(req.callId);
    socketRef.current?.emit('call:response', { callId: req.callId, accepted: false });
  }, []);

  const acceptIncomingCallStayOnScreen = useCallback(
    async (req: IncomingCallRequest): Promise<VoiceBootstrapResponse> => {
      void markIncomingCallHandled(req.callId);
      acceptedIncomingCallIdsRef.current.add(req.callId);
      clearIncomingCallNotificationDedupe(req.callId);
      if (activeIncomingCallUiCallIdRef.current === req.callId) {
        activeIncomingCallUiCallIdRef.current = null;
        pendingIncomingCallRequestRef.current = null;
      }
      void stopIncomingRingtonePlayback();

      const bootstrapPromise = ensureIncomingBootstrapPromise(req);
      let socket: Socket;
      let bootstrapped: VoiceBootstrapResponse;
      try {
        [socket, bootstrapped] = await Promise.all([
          ensureCallSocketReady(socketRef),
          bootstrapPromise,
        ]);
      } catch (e) {
        const s = socketRef.current;
        if (s?.connected) {
          s.emit('call:end', { callId: req.callId });
        }
        throw e;
      }
      socket.emit('call:response', { callId: req.callId, accepted: true });

      incomingBootstrapByCallIdRef.current.delete(req.callId);
      incomingBootstrapPromiseByCallIdRef.current.delete(req.callId);
      return bootstrapped;
    },
    [ensureIncomingBootstrapPromise]
  );

  const acceptIncomingCall = useCallback(
    async (req: IncomingCallRequest): Promise<void> => {
      void markIncomingCallHandled(req.callId);
      acceptedIncomingCallIdsRef.current.add(req.callId);
      if (activeIncomingCallUiCallIdRef.current === req.callId) {
        activeIncomingCallUiCallIdRef.current = null;
        pendingIncomingCallRequestRef.current = null;
      }
      void stopIncomingRingtonePlayback();

      const bootstrapPromise = ensureIncomingBootstrapPromise(req);
      let socket: Socket;
      let bootstrapped: VoiceBootstrapResponse;
      try {
        [socket, bootstrapped] = await Promise.all([
          ensureCallSocketReady(socketRef),
          bootstrapPromise,
        ]);
      } catch (e) {
        const s = socketRef.current;
        if (s?.connected) {
          s.emit('call:end', { callId: req.callId });
        }
        throw e;
      }
      socket.emit('call:response', { callId: req.callId, accepted: true });

      incomingBootstrapByCallIdRef.current.delete(req.callId);
      incomingBootstrapPromiseByCallIdRef.current.delete(req.callId);
      openVoiceCall(bootstrapped, req.peerName, req.peerImage ?? null);
    },
    [ensureIncomingBootstrapPromise, openVoiceCall]
  );

  const stopIncomingRingtone = useCallback(() => stopIncomingRingtonePlayback(), []);
  const startIncomingRingtoneCtx = useCallback(async () => {
    await startIncomingRingtone();
  }, []);

  const setIncomingCallHandler = useCallback((handler: ((req: IncomingCallRequest) => void) | null) => {
    incomingCallHandlerRef.current = handler;
  }, []);

  const setIncomingCallDismissHandler = useCallback((handler: ((callId: string) => void) | null) => {
    incomingCallDismissHandlerRef.current = handler;
  }, []);

  const setRemoteCallEndedHandler = useCallback((handler: ((callId: string) => void) | null) => {
    remoteCallEndedHandlerRef.current = handler;
  }, []);

  const setActiveCallRecoveryHandler = useCallback((handler: (() => void) | null) => {
    activeCallRecoveryHandlerRef.current = handler;
  }, []);

  const setTalkStartedHandler = useCallback(
    (handler: ((callId: string, talkStartedAt: string) => void) | null) => {
      talkStartedHandlerRef.current = handler;
    },
    []
  );

  const setPeerCallHoldHandler = useCallback(
    (handler: ((callId: string, onHold: boolean) => void) | null) => {
      peerCallHoldHandlerRef.current = handler;
    },
    []
  );

  const setPeerCallMuteHandler = useCallback(
    (handler: ((callId: string, muted: boolean) => void) | null) => {
      peerCallMuteHandlerRef.current = handler;
    },
    []
  );

  const emitCallHold = useCallback((callId: string, onHold: boolean) => {
    const normalized = callId.trim();
    if (!normalized) return;
    if (onHold) {
      pendingCallHoldEmitRef.current = { callId: normalized, onHold: true };
    } else {
      pendingCallHoldEmitRef.current = { callId: normalized, onHold: false };
    }
    const emitOn = (socket: Socket): void => {
      try {
        socket.emit('call:hold', { callId: normalized, onHold });
      } catch {
        // ignore signaling failures
      }
    };
    const socket = socketRef.current;
    if (socket?.connected) {
      emitOn(socket);
      return;
    }
    void ensureCallSocketReady(socketRef)
      .then(emitOn)
      .catch(() => {});
  }, []);

  const emitCallMute = useCallback((callId: string, muted: boolean) => {
    const normalized = callId.trim();
    if (!normalized) return;
    pendingCallMuteEmitRef.current = { callId: normalized, muted };
    const emitOn = (socket: Socket): void => {
      try {
        socket.emit('call:mute', { callId: normalized, muted });
      } catch {
        // ignore signaling failures
      }
    };
    const socket = socketRef.current;
    if (socket?.connected) {
      emitOn(socket);
      return;
    }
    void ensureCallSocketReady(socketRef)
      .then(emitOn)
      .catch(() => {});
  }, []);

  const emitCallEnd = useCallback((callId: string) => {
    const normalized = callId.trim();
    if (!normalized) return;
    pendingCallEndEmitRef.current = normalized;
    if (pendingCallHoldEmitRef.current?.callId === normalized) {
      pendingCallHoldEmitRef.current = null;
    }
    if (pendingCallMuteEmitRef.current?.callId === normalized) {
      pendingCallMuteEmitRef.current = null;
    }
    const emitOn = (socket: Socket): void => {
      try {
        socket.emit('call:end', { callId: normalized }, (ack?: { ok?: boolean }) => {
          if (ack?.ok !== false && pendingCallEndEmitRef.current === normalized) {
            pendingCallEndEmitRef.current = null;
          }
        });
      } catch {
        // ignore signaling failures
      }
    };
    const socket = socketRef.current;
    if (socket?.connected) {
      emitOn(socket);
      return;
    }
    void ensureCallSocketReady(socketRef)
      .then(emitOn)
      .catch(() => {
        // REST session/end still notifies peer when local hangup completes.
      });
  }, []);

  const clearReceiverIncomingCallUi = useCallback((callId: string) => {
    void stopIncomingRingtonePlayback();
    if (activeIncomingCallUiCallIdRef.current === callId) {
      activeIncomingCallUiCallIdRef.current = null;
      pendingIncomingCallRequestRef.current = null;
    }
    incomingBootstrapByCallIdRef.current.delete(callId);
    incomingBootstrapPromiseByCallIdRef.current.delete(callId);
    seenIncomingCallIdsRef.current.delete(callId);
    incomingCallDismissHandlerRef.current?.(callId);
  }, []);

  const openCallerJoiningVoiceCallRef = useRef(openCallerJoiningVoiceCall);
  const openIncomingCallRef = useRef(openIncomingCall);
  const acceptIncomingCallRef = useRef(acceptIncomingCall);
  const rejectIncomingCallRef = useRef(rejectIncomingCall);
  const clearOutgoingCallSessionRef = useRef(clearOutgoingCallSession);
  useEffect(() => {
    openCallerJoiningVoiceCallRef.current = openCallerJoiningVoiceCall;
    openIncomingCallRef.current = openIncomingCall;
    acceptIncomingCallRef.current = acceptIncomingCall;
    rejectIncomingCallRef.current = rejectIncomingCall;
    clearOutgoingCallSessionRef.current = clearOutgoingCallSession;
  });

  const signedInAccountId = user?._id ?? null;

  useEffect(() => {
    if (!isSignedIn) return;
    const keepCallSocketAlive = (): void => {
      const socket = socketRef.current;
      if (socket && !socket.connected) socket.connect();
    };
    keepCallSocketAlive();
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active' || state === 'background' || state === 'inactive') {
        keepCallSocketAlive();
      }
    });
    return () => sub.remove();
  }, [isSignedIn, signedInAccountId]);

  useEffect(() => {
    if (!isSignedIn || user?.role !== 'receiver') return;
    const keepCallSocketAlive = (): void => {
      const socket = socketRef.current;
      if (socket && !socket.connected) socket.connect();
    };
    const refreshPushToken = (): void => {
      void registerReceiverExpoPushToken((token) => profileApi.updateReceiverExpoPushToken(token));
    };
    keepCallSocketAlive();
    refreshPushToken();
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active' || state === 'background' || state === 'inactive') {
        keepCallSocketAlive();
        if (userRoleRef.current === 'receiver' && userAvailableRef.current) {
          if (state === 'background' || state === 'inactive') {
            void profileApi.receiverBackgroundPresence().catch(() => {});
          }
          if (queueModeRef.current) {
            const socket = socketRef.current;
            if (socket?.connected) {
              try {
                socket.emit('call:queue:set', { active: true }, () => {});
              } catch {
                // best-effort
              }
            }
          }
        }
      }
      if (state === 'active') {
        if (userRoleRef.current === 'receiver' && userAvailableRef.current) {
          void profileApi.receiverForegroundPresence().catch(() => {});
        }
        refreshPushToken();
        const pending = pendingIncomingCallRequestRef.current;
        if (
          pending &&
          canNavigateToIncomingCall(pending.callId) &&
          activeIncomingCallUiCallIdRef.current === pending.callId &&
          !acceptedIncomingCallIdsRef.current.has(pending.callId) &&
          !rejectedIncomingCallIdsRef.current.has(pending.callId) &&
          !incomingCallHandlerRef.current
        ) {
          openIncomingCallRef.current(pending);
        }
      }
    });
    return () => sub.remove();
  }, [isSignedIn, signedInAccountId, user?.role]);

  useEffect(() => {
    if (!isSignedIn || user?.role !== 'receiver') return;
    setIncomingCallNavigationGuard(
      (callId) =>
        !acceptedIncomingCallIdsRef.current.has(callId) &&
        !rejectedIncomingCallIdsRef.current.has(callId)
    );
    const unbind = bindIncomingCallNotificationHandlers((incoming) => {
      if (!canNavigateToIncomingCall(incoming.callId)) return;
      const req: IncomingCallRequest = {
        callId: incoming.callId,
        fromType: incoming.fromType,
        fromId: incoming.fromId,
        peerName: incoming.peerName,
        peerImage: incoming.peerImage,
      };
      if (incomingCallHandlerRef.current) {
        activeIncomingCallUiCallIdRef.current = req.callId;
        incomingCallHandlerRef.current(req);
        return;
      }
      activeIncomingCallUiCallIdRef.current = req.callId;
      openIncomingCallRef.current(req);
    });
    return () => {
      setIncomingCallNavigationGuard(null);
      unbind();
    };
  }, [isSignedIn, user?.role]);

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
        reconnection: true,
        reconnectionAttempts: 50,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10000,
      });
      socketRef.current = socket;
      socket.on('connect_error', (err: Error) => {
        if (__DEV__) {
          console.warn('[CallSignal] socket connect_error:', err.message);
        }
      });
      socket.on('connect', () => {
        callDiag.connectionRestored({ socket: 'main_call_signal' });
        activeCallRecoveryHandlerRef.current?.();
        socket.emit('call:queue:set', { active: queueModeRef.current }, () => {});
        const pendingHold = pendingCallHoldEmitRef.current;
        if (pendingHold) {
          socket.emit('call:hold', {
            callId: pendingHold.callId,
            onHold: pendingHold.onHold,
          });
        }
        const pendingMute = pendingCallMuteEmitRef.current;
        if (pendingMute) {
          socket.emit('call:mute', {
            callId: pendingMute.callId,
            muted: pendingMute.muted,
          });
        }
        const pendingEnd = pendingCallEndEmitRef.current;
        if (pendingEnd) {
          socket.emit('call:end', { callId: pendingEnd }, (ack?: { ok?: boolean }) => {
            if (ack?.ok !== false && pendingCallEndEmitRef.current === pendingEnd) {
              pendingCallEndEmitRef.current = null;
            }
          });
        }
        if (userRoleRef.current === 'receiver') {
          void ensureIncomingRingtoneLoaded();
        }
      });

      socket.on('call:incoming', (payload: CallIncomingPayload) => {
        if (payload.fromType === (userRoleRef.current === 'caller' ? 'u' : 'r')) return;
        if (acceptedIncomingCallIdsRef.current.has(payload.callId)) {
          return;
        }
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
          activeIncomingCallUiCallIdRef.current = incoming.callId;
          incomingCallHandlerRef.current(incoming);
          return;
        }

        if (userRoleRef.current === 'receiver') {
          activeIncomingCallUiCallIdRef.current = incoming.callId;
          pendingIncomingCallRequestRef.current = incoming;

          if (isAppInBackground()) {
            void showIncomingCallNotification(incoming);
          } else {
            clearIncomingCallNotificationDedupe(incoming.callId);
          }

          void (async () => {
            await stopIncomingRingtonePlayback();
            try {
              await startIncomingRingtone();
            } catch {
              // Keep UI even if ring fails.
            }
          })();

          void ensureIncomingBootstrapPromise(incoming);

          openIncomingCallRef.current(incoming);
          return;
        }

        Alert.alert(`${peerName} is calling`, 'Accept this voice call request?', [
          {
            text: 'Reject',
            style: 'destructive',
            onPress: () => {
              rejectIncomingCallRef.current(incoming);
            },
          },
          {
            text: 'Accept',
            onPress: () => {
              void (async () => {
                try {
                  await acceptIncomingCallRef.current(incoming);
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
        if (payload.accepted && userRoleRef.current === 'caller') {
          seenIncomingCallIdsRef.current.delete(payload.callId);
          rejectedIncomingCallIdsRef.current.delete(payload.callId);
        }
        const pending =
          pendingOutgoingByCallIdRef.current.get(payload.callId) ??
          outgoingSessionByCallIdRef.current.get(payload.callId);
        const waiter = pendingInviteOutcomeRef.current.get(payload.callId);
        if (waiter) {
          clearTimeout(waiter.timeout);
          pendingInviteOutcomeRef.current.delete(payload.callId);
          waiter.resolve(
            payload.accepted
              ? { accepted: true, reason: 'accepted' }
              : { accepted: false, reason: 'rejected' }
          );
        }

        if (!payload.accepted) {
          clearOutgoingCallSessionRef.current(payload.callId);
          if (!waiter) {
            Alert.alert('Call unavailable', 'Receiver is not available right now.');
          }
          return;
        }

        callerInviteAcceptedCallIdsRef.current.add(payload.callId);
        pendingOutgoingByCallIdRef.current.delete(payload.callId);

        if (pending) {
          openCallerJoiningVoiceCallRef.current(pending);
          return;
        }

        void (async () => {
          try {
            const { data } = await callApi.bootstrap(payload.fromId, payload.callId);
            const fallback = peerProfileRef.current.get(payload.fromId);
            const peerName = fallback?.name ?? 'User';
            const session: PendingOutgoingCall = {
              callId: payload.callId,
              peerId: payload.fromId,
              peerName,
              peerImage: fallback?.image ?? null,
              bootstrap: data,
            };
            outgoingSessionByCallIdRef.current.set(payload.callId, session);
            openCallerJoiningVoiceCallRef.current(session);
          } catch {
            Alert.alert('Call accepted', 'The user accepted, but joining failed. Please try again.');
          }
        })();
      });

      socket.on('call:talk_started', (payload: { callId?: string; talkStartedAt?: string }) => {
        const callId = typeof payload?.callId === 'string' ? payload.callId.trim() : '';
        const talkStartedAt =
          typeof payload?.talkStartedAt === 'string' ? payload.talkStartedAt.trim() : '';
        if (!callId || !talkStartedAt) return;
        talkStartedHandlerRef.current?.(callId, talkStartedAt);
      });

      socket.on('call:hold', (payload: CallHoldPayload) => {
        if (payload.fromType === (userRoleRef.current === 'caller' ? 'u' : 'r')) return;
        callDiag.info('main_socket_hold', {
          callId: payload.callId,
          onHold: payload.onHold,
          fromType: payload.fromType,
        });
        peerCallHoldHandlerRef.current?.(payload.callId, Boolean(payload.onHold));
      });

      socket.on('call:mute', (payload: CallMutePayload) => {
        if (payload.fromType === (userRoleRef.current === 'caller' ? 'u' : 'r')) return;
        peerCallMuteHandlerRef.current?.(payload.callId, Boolean(payload.muted));
      });

      socket.on('call:ended', (payload: CallEndedPayload) => {
        if (payload.fromType === (userRoleRef.current === 'caller' ? 'u' : 'r')) return;
        callDiag.info('main_socket_call_ended', {
          callId: payload.callId,
          fromType: payload.fromType,
        });
        clearIncomingCallNotificationDedupe(payload.callId);
        peerCallHoldHandlerRef.current?.(payload.callId, false);
        peerCallMuteHandlerRef.current?.(payload.callId, false);
        seenIncomingCallIdsRef.current.delete(payload.callId);
        rejectedIncomingCallIdsRef.current.delete(payload.callId);
        acceptedIncomingCallIdsRef.current.delete(payload.callId);
        clearOutgoingCallSessionRef.current(payload.callId);

        if (userRoleRef.current === 'receiver') {
          const onVoiceCallScreen = Boolean(remoteCallEndedHandlerRef.current);
          const onIntegratedVoiceCall =
            Boolean(incomingCallDismissHandlerRef.current) ||
            Boolean(incomingCallHandlerRef.current);
          const legacyIncomingScreen =
            !onIntegratedVoiceCall &&
            !onVoiceCallScreen &&
            activeIncomingCallUiCallIdRef.current === payload.callId;
          if (onIntegratedVoiceCall || legacyIncomingScreen) {
            clearReceiverIncomingCallUi(payload.callId);
          }
          if (legacyIncomingScreen) {
            const goHome = (): boolean => {
              const n = navigationRef.current;
              if (!n?.isReady()) return false;
              n.navigate('Home', { screen: 'ReceiverMainTabs', params: { screen: 'ReceiverHome' } });
              return true;
            };
            if (!goHome()) scheduleNavigateWhenReady(goHome, outgoingNavigateGeneration);
          }
        }

        remoteCallEndedHandlerRef.current?.(payload.callId);

        const waiter = pendingInviteOutcomeRef.current.get(payload.callId);
        if (waiter) {
          clearTimeout(waiter.timeout);
          pendingInviteOutcomeRef.current.delete(payload.callId);
          waiter.resolve({ accepted: false, reason: 'ended' });
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
  }, [clearPendingInvites, isSignedIn, signedInAccountId]);

  const value = useMemo<CallSignalContextValue>(
    () => ({
      registerPeer,
      startCallInvite,
      startRandomCallEngagement,
      cancelRandomCallEngagement,
      randomCallMatchingVisible,
      cancelOutgoingCallInvite,
      setIncomingCallHandler,
      setIncomingCallDismissHandler,
      setRemoteCallEndedHandler,
      setActiveCallRecoveryHandler,
      setTalkStartedHandler,
      setPeerCallHoldHandler,
      setPeerCallMuteHandler,
      emitCallEnd,
      emitCallHold,
      emitCallMute,
      acceptIncomingCall,
      rejectIncomingCall,
      setQueueMode,
      stopIncomingRingtone,
      startIncomingRingtone: startIncomingRingtoneCtx,
      acceptIncomingCallStayOnScreen,
    }),
    [
      registerPeer,
      startCallInvite,
      startRandomCallEngagement,
      cancelRandomCallEngagement,
      randomCallMatchingVisible,
      cancelOutgoingCallInvite,
      setIncomingCallHandler,
      setIncomingCallDismissHandler,
      setRemoteCallEndedHandler,
      setActiveCallRecoveryHandler,
      setTalkStartedHandler,
      setPeerCallHoldHandler,
      setPeerCallMuteHandler,
      emitCallEnd,
      emitCallHold,
      emitCallMute,
      acceptIncomingCall,
      rejectIncomingCall,
      setQueueMode,
      stopIncomingRingtone,
      startIncomingRingtoneCtx,
      acceptIncomingCallStayOnScreen,
      clearReceiverIncomingCallUi,
    ]
  );

  return (
    <CallSignalContext.Provider value={value}>
      {children}
      <RandomCallMatchingOverlay
        visible={randomCallMatchingVisible}
        onCancel={cancelRandomCallEngagement}
        userName={user?.name}
        userProfileImage={user?.profileImage}
      />
    </CallSignalContext.Provider>
  );
};

export const useCallSignals = (): CallSignalContextValue => {
  const ctx = useContext(CallSignalContext);
  if (!ctx) {
    throw new Error('useCallSignals must be used within CallSignalProvider');
  }
  return ctx;
};

