import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  Alert,
  AppState,
  BackHandler,
  Platform,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { io, type Socket } from 'socket.io-client';
import type { CallerStackParamList } from '../../navigation/CallerStackParamList';
import type { ReceiverStackParamList } from '../../navigation/ReceiverStackParamList';
import {
  isReceiverAvailabilitySession,
  type VoiceCallScreenParams,
} from '../../navigation/voiceCallParams';
import type { IncomingCallRequest } from '../../context/CallSignalContext';
import type { VoiceBootstrapResponse } from '../../types/api';
import { resolveFixedRatePerMinuteAt, type FixedPerMinuteWindow } from '../../utils/fixedPerMinuteEarning';
import { useCallSignals } from '../../context/CallSignalContext';
import { useCallerMessageEligibilityOptional } from '../../context/CallerMessageEligibilityContext';
import { useAuth } from '../../context/AuthContext';
import { callApi, getErrorMessage, getJwt, getResolvedApiBaseUrl, profileApi } from '../../services/api';
import { startOutboundRingtoneLoop } from '../../utils/callSounds';
import { profileImageUrlForStreamOrNetwork, resolveProfileImageSource } from '../../utils/avatarSource';
import { AvatarSoundWaveRings } from '../../components/call/AvatarVoiceWaves';
import type { StreamMicControl } from '../../components/call/StreamCallAvatarExtras';
import {
  getVoiceSessionStartPromise,
} from '../../utils/voiceCallSessionStart';

type StreamSdkModule = {
  StreamVideo: React.ComponentType<{ client: unknown; children: React.ReactNode }>;
  StreamCall: React.ComponentType<{ call: unknown; children: React.ReactNode }>;
  CallContent: React.ComponentType<{ onHangupCallHandler: () => void }>;
  StreamVideoClient: {
    getOrCreateInstance: (args: {
      apiKey: string;
      user: { id: string; name: string; image?: string };
      token: string;
    }) => {
      call: (type: string, id: string) => {
        join: (args: { create: boolean }) => Promise<void>;
        leave: () => Promise<void>;
      };
      disconnectUser: () => Promise<void>;
    };
  };
};

let cachedStreamSdkModule: StreamSdkModule | null = null;

function loadStreamSdkModule(): StreamSdkModule | null {
  if (Constants.appOwnership === 'expo') return null;
  if (cachedStreamSdkModule) return cachedStreamSdkModule;
  try {
    cachedStreamSdkModule = require('@stream-io/video-react-native-sdk') as StreamSdkModule;
    return cachedStreamSdkModule;
  } catch {
    return null;
  }
}

type StreamCallAvatarExtrasModule = {
  StreamParticipantVoiceWaves: React.ComponentType<{
    side: 'local' | 'remote';
    microphoneMuted?: boolean;
    onHold?: boolean;
  }>;
  StreamParticipantMutedIndicator: React.ComponentType<{
    peerOnHold?: boolean;
    peerMuted?: boolean;
    talkActive?: boolean;
  }>;
  StreamTalkTimingBridge: React.ComponentType<{ onBothConnected: () => void }>;
  StreamRemotePeerLeftBridge: React.ComponentType<{ onRemotePeerLeft: () => void }>;
  StreamMicControlBridge: React.ComponentType<{
    controlRef: React.MutableRefObject<StreamMicControl | null>;
    onMutedChange: (muted: boolean) => void;
    onUserMuteToggled?: (muted: boolean) => void;
    userChosenMuteRef: React.MutableRefObject<boolean>;
  }>;
  StreamSystemHoldBridge: React.ComponentType<{
    userChosenMuteRef: React.MutableRefObject<boolean>;
    appInBackground: boolean;
    onSystemHoldChange: (onHold: boolean) => void;
  }>;
};

function loadStreamCallAvatarExtras(): StreamCallAvatarExtrasModule | null {
  if (Constants.appOwnership === 'expo') return null;
  try {
    return require('../../components/call/StreamCallAvatarExtras') as StreamCallAvatarExtrasModule;
  } catch {
    return null;
  }
}

type Props =
  | NativeStackScreenProps<CallerStackParamList, 'VoiceCall'>
  | NativeStackScreenProps<ReceiverStackParamList, 'VoiceCall'>;

async function applyVoiceCallAudioMode(speaker: boolean): Promise<void> {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
    staysActiveInBackground: true,
    interruptionModeIOS: InterruptionModeIOS.DoNotMix,
    interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
    shouldDuckAndroid: false,
    playThroughEarpieceAndroid: !speaker,
  });
}

async function resetVoiceCallAudioMode(): Promise<void> {
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
      interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
  } catch {
    // ignore
  }
}

function getOutgoingCallerPhase(params: VoiceCallScreenParams): 'ringing' | 'joining' | undefined {
  if ('outgoingCallerPhase' in params && params.outgoingCallerPhase) {
    return params.outgoingCallerPhase;
  }
  return undefined;
}

function getVoiceBootstrap(params: VoiceCallScreenParams): VoiceBootstrapResponse | null {
  if ('apiKey' in params && typeof params.apiKey === 'string' && params.apiKey.length > 0) {
    return params as VoiceBootstrapResponse;
  }
  return null;
}

function getReceiverChargeRatePerMinute(params: VoiceCallScreenParams): number {
  if ('receiverRatePerMinute' in params && typeof params.receiverRatePerMinute === 'number') {
    return Math.max(0, params.receiverRatePerMinute);
  }
  if ('receiverRatePerMinuteHint' in params && typeof params.receiverRatePerMinuteHint === 'number') {
    return Math.max(0, params.receiverRatePerMinuteHint);
  }
  return 0;
}

function getFixedWindowsFromParams(params: VoiceCallScreenParams): FixedPerMinuteWindow[] {
  const boot = getVoiceBootstrap(params);
  return boot?.fixedPerMinuteWindows ?? [];
}

function getReceiverEarningModelFromParams(params: VoiceCallScreenParams): 'score_based' | 'fixed_per_minute' {
  const boot = getVoiceBootstrap(params);
  return boot?.receiverEarningModel === 'fixed_per_minute' ? 'fixed_per_minute' : 'score_based';
}

type ReceiverEarningMeta = {
  model: 'score_based' | 'fixed_per_minute';
  windows: FixedPerMinuteWindow[];
  earningRatePerMinute?: number;
};

function getReceiverEarnRatePerMinute(
  params: VoiceCallScreenParams,
  at: Date = new Date(),
  override?: ReceiverEarningMeta | null
): number {
  const model = override?.model ?? getReceiverEarningModelFromParams(params);
  const windows = override?.windows ?? getFixedWindowsFromParams(params);
  if (model === 'fixed_per_minute' && windows.length > 0) {
    return resolveFixedRatePerMinuteAt(at, windows);
  }
  if (
    model === 'score_based' &&
    typeof override?.earningRatePerMinute === 'number' &&
    Number.isFinite(override.earningRatePerMinute)
  ) {
    return Math.max(0, override.earningRatePerMinute);
  }
  if (
    'receiverEarningRatePerMinute' in params &&
    typeof params.receiverEarningRatePerMinute === 'number' &&
    Number.isFinite(params.receiverEarningRatePerMinute)
  ) {
    return Math.max(0, params.receiverEarningRatePerMinute);
  }
  if (
    'receiverEarningRatePerMinuteHint' in params &&
    typeof params.receiverEarningRatePerMinuteHint === 'number' &&
    Number.isFinite(params.receiverEarningRatePerMinuteHint)
  ) {
    return Math.max(0, params.receiverEarningRatePerMinuteHint);
  }
  return 0;
}

export default function VoiceCallScreen({ navigation, route }: Props): React.JSX.Element {
  const MIN_RATING_SECONDS = 60;
  const insets = useSafeAreaInsets();
  const { user, refreshUser } = useAuth();
  const messageEligibility = useCallerMessageEligibilityOptional();
  const {
    cancelOutgoingCallInvite,
    setIncomingCallHandler,
    setIncomingCallDismissHandler,
    setRemoteCallEndedHandler,
    setActiveCallRecoveryHandler,
    setPeerCallHoldHandler,
    setPeerCallMuteHandler,
    emitCallEnd: emitCallEndSignal,
    emitCallHold: emitCallHoldSignal,
    emitCallMute: emitCallMuteSignal,
    setQueueMode,
    rejectIncomingCall,
    acceptIncomingCallStayOnScreen,
    stopIncomingRingtone,
    startIncomingRingtone,
  } = useCallSignals();
  const cancelOutgoingRef = useRef(cancelOutgoingCallInvite);
  cancelOutgoingRef.current = cancelOutgoingCallInvite;

  const callParams = route.params as VoiceCallScreenParams;
  const receiverAvailabilitySession =
    user?.role === 'receiver' && isReceiverAvailabilitySession(callParams);
  const outgoingCallerPhase = getOutgoingCallerPhase(callParams);
  const streamBootstrap = getVoiceBootstrap(callParams);
  const [receiverSessionPhase, setReceiverSessionPhase] = useState<'waiting' | 'incoming' | null>(
    receiverAvailabilitySession ? 'waiting' : null
  );
  const [incomingReq, setIncomingReq] = useState<IncomingCallRequest | null>(null);
  const incomingReqRef = useRef<IncomingCallRequest | null>(null);
  const [incomingResponding, setIncomingResponding] = useState(false);
  const [sdk, setSdk] = useState<StreamSdkModule | null>(() => loadStreamSdkModule());
  const [client, setClient] = useState<{
    call: (type: string, id: string) => {
      join: (args: { create: boolean }) => Promise<void>;
      leave: () => Promise<void>;
    };
    disconnectUser: () => Promise<void>;
  } | null>(null);
  const [call, setCall] = useState<{
    join: (args: { create: boolean }) => Promise<void>;
    leave: () => Promise<void>;
  } | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [talkActive, setTalkActive] = useState(false);
  const [systemCallHold, setSystemCallHold] = useState(false);
  const [peerCallHold, setPeerCallHold] = useState(false);
  const [peerCallMuted, setPeerCallMuted] = useState(false);
  const [appInBackground, setAppInBackground] = useState(AppState.currentState !== 'active');
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  /** Only set when the user taps Mute/Unmute — not when Stream briefly reports mute during connect. */
  const userChosenMuteRef = useRef(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [liveSettledAmountInr, setLiveSettledAmountInr] = useState(0);
  /** Caller wallet from server (both roles) — stays in sync as the call is billed. */
  const [sessionCallerWalletInr, setSessionCallerWalletInr] = useState<number | null>(null);
  const [sessionCallRatePerMinute, setSessionCallRatePerMinute] = useState<number | null>(null);
  const [ratingOpen, setRatingOpen] = useState(false);
  const [selectedRating, setSelectedRating] = useState(0);
  const [submittingRating, setSubmittingRating] = useState(false);
  const autoEndByBalanceRef = useRef(false);
  const activeCallRef = useRef<{
    leave: () => Promise<void>;
  } | null>(null);
  const streamMicControlRef = useRef<StreamMicControl | null>(null);
  const activeClientRef = useRef<{
    disconnectUser: () => Promise<void>;
  } | null>(null);
  const signalSocketRef = useRef<Socket | null>(null);
  const readyRef = useRef(false);
  const endingRef = useRef(false);
  const endedSessionRef = useRef(false);
  const endedSessionResultRef = useRef<{ canRate: boolean; durationSec: number } | null>(null);
  const endSessionPromiseRef = useRef<Promise<{ canRate: boolean; durationSec: number } | null> | null>(null);
  const elapsedSecRef = useRef(0);
  const talkActiveRef = useRef(false);
  /** Server `talkStartedAt` — single source of truth so both sides show the same elapsed time. */
  const talkAnchorMsRef = useRef<number | null>(null);
  const syncTalkBurstInFlightRef = useRef(false);
  const callIdRef = useRef(getVoiceBootstrap(callParams)?.callId ?? '');
  useEffect(() => {
    const id = getVoiceBootstrap(callParams)?.callId;
    if (id) callIdRef.current = id;
  }, [callParams]);
  const streamJoinAttemptRef = useRef(0);
  const displayNameRef = useRef(user?.name ?? 'User');
  const displayImageRef = useRef(user?.profileImage);
  useEffect(() => {
    displayNameRef.current = user?.name ?? 'User';
    displayImageRef.current = user?.profileImage;
  }, [user?.name, user?.profileImage]);
  const [earningMeta, setEarningMeta] = useState<ReceiverEarningMeta | null>(null);

  const refreshReceiverEarningMeta = useCallback(async (): Promise<void> => {
    if (user?.role !== 'receiver') return;
    try {
      const { data } = await profileApi.receiverCallInsights('all');
      const model = data.receiverEarningModel === 'fixed_per_minute' ? 'fixed_per_minute' : 'score_based';
      setEarningMeta({
        model,
        windows: data.fixedPerMinuteWindows ?? [],
        earningRatePerMinute:
          typeof data.earningRatePerMinute === 'number' && Number.isFinite(data.earningRatePerMinute)
            ? data.earningRatePerMinute
            : undefined,
      });
    } catch {
      // Keep bootstrap / route params until insights load.
    }
  }, [user?.role]);

  useFocusEffect(
    useCallback(() => {
      void refreshReceiverEarningMeta();
    }, [refreshReceiverEarningMeta])
  );

  const effectiveEarningModel = earningMeta?.model ?? getReceiverEarningModelFromParams(callParams);

  const rawEarnRate = useMemo(
    () => getReceiverEarnRatePerMinute(callParams, new Date(), earningMeta),
    [callParams, earningMeta, elapsedSec]
  );
  const liveRatePerMinute =
    typeof rawEarnRate === 'number' && Number.isFinite(rawEarnRate) ? Math.max(0, rawEarnRate) : 0;
  const liveEarning = Math.round(((elapsedSec / 60) * liveRatePerMinute) * 100) / 100;
  /** Server prorates fixed windows on sync; take the higher of estimate vs settled. */
  const shownLiveEarning = Math.max(liveEarning, liveSettledAmountInr);
  const showLiveEarning = user?.role === 'receiver';
  const liveEarningSub =
    effectiveEarningModel === 'fixed_per_minute'
      ? `₹${liveRatePerMinute.toLocaleString('en-IN')}/min · IST window · synced every few sec`
      : `₹${liveRatePerMinute.toLocaleString('en-IN')}/min · score tier · synced every few sec`;
  const callerWalletInr =
    user?.role === 'caller' && typeof user.walletBalance === 'number' && Number.isFinite(user.walletBalance)
      ? Math.max(0, user.walletBalance)
      : 0;
  const callChargeRatePerMinute =
    sessionCallRatePerMinute !== null
      ? sessionCallRatePerMinute
      : getReceiverChargeRatePerMinute(callParams);
  const walletForRemainingTalkSec =
    sessionCallerWalletInr !== null
      ? sessionCallerWalletInr
      : user?.role === 'caller'
        ? callerWalletInr
        : 0;
  const initialRemainingTalkSec =
    callChargeRatePerMinute > 0
      ? Math.floor((walletForRemainingTalkSec / callChargeRatePerMinute) * 60)
      : 0;
  const remainingTalkSec = Math.max(0, initialRemainingTalkSec - elapsedSec);
  const hasRemainingTalkWallet =
    sessionCallerWalletInr !== null || (user?.role === 'caller' && callerWalletInr > 0);
  const showRemainingTalkCountdown =
    callChargeRatePerMinute > 0 &&
    hasRemainingTalkWallet &&
    (ready || talkActive || Boolean(streamBootstrap));
  const remainingTalkCountdownTitle =
    user?.role === 'receiver' ? "Caller's remaining talk time" : 'Remaining Talk Time';

  const callerCanRateByDuration = user?.role === 'caller' && elapsedSec >= MIN_RATING_SECONDS;

  /** Kept in refs so the signaling socket effect does not re-run when duration crosses the rating threshold (that was disconnecting the socket at the 1‑min mark). */
  const callerCanRateByDurationRef = useRef(callerCanRateByDuration);
  const userRoleRef = useRef(user?.role);
  const appStateRef = useRef(AppState.currentState);
  const appInBackgroundRef = useRef(AppState.currentState !== 'active');
  const holdForcedMicOffRef = useRef(false);
  const peerHoldPausedMicRef = useRef(false);
  const peerCallHoldRef = useRef(false);
  const receiverAvailabilitySessionRef = useRef(receiverAvailabilitySession);
  const userAvailableRef = useRef(Boolean(user?.isAvailable));
  useEffect(() => {
    elapsedSecRef.current = elapsedSec;
  }, [elapsedSec]);

  useEffect(() => {
    talkActiveRef.current = talkActive;
  }, [talkActive]);

  useEffect(() => {
    callerCanRateByDurationRef.current = callerCanRateByDuration;
    userRoleRef.current = user?.role;
    receiverAvailabilitySessionRef.current = receiverAvailabilitySession;
    userAvailableRef.current = Boolean(user?.isAvailable);
  }, [callerCanRateByDuration, user?.role, receiverAvailabilitySession, user?.isAvailable]);

  const applyPeerHoldFromRemote = useCallback((onHold: boolean) => {
    peerCallHoldRef.current = onHold;
    setPeerCallHold(onHold);
    if (onHold) {
      peerHoldPausedMicRef.current = true;
      void streamMicControlRef.current?.setEnabled(false).catch(() => {});
      return;
    }
    if (peerHoldPausedMicRef.current) {
      peerHoldPausedMicRef.current = false;
      if (!systemCallHoldRef.current && !userChosenMuteRef.current) {
        void streamMicControlRef.current?.setEnabled(true).catch(() => {});
      }
    }
  }, []);
  const applyPeerHoldFromRemoteRef = useRef(applyPeerHoldFromRemote);
  applyPeerHoldFromRemoteRef.current = applyPeerHoldFromRemote;

  const applyPeerMuteFromRemote = useCallback((muted: boolean) => {
    setPeerCallMuted(muted);
  }, []);
  const applyPeerMuteFromRemoteRef = useRef(applyPeerMuteFromRemote);
  applyPeerMuteFromRemoteRef.current = applyPeerMuteFromRemote;

  const emitPeerCallMute = useCallback(
    (muted: boolean) => {
      const callId = callIdRef.current.trim();
      if (!callId || endingRef.current) return;
      emitCallMuteSignal(callId, muted);
      const voiceSocket = signalSocketRef.current;
      if (voiceSocket?.connected) {
        try {
          voiceSocket.emit('call:mute', { callId, muted });
        } catch {
          // CallSignal socket is primary; this is a low-latency duplicate on the call screen.
        }
      }
    },
    [emitCallMuteSignal]
  );

  const emitPeerCallHold = useCallback(
    (onHold: boolean) => {
      const callId = callIdRef.current.trim();
      if (!callId || endingRef.current) return;
      emitCallHoldSignal(callId, onHold);
      const voiceSocket = signalSocketRef.current;
      if (voiceSocket?.connected) {
        try {
          voiceSocket.emit('call:hold', { callId, onHold });
        } catch {
          // CallSignal socket is primary; this is a low-latency duplicate on the call screen.
        }
      }
    },
    [emitCallHoldSignal]
  );

  const systemCallHoldRef = useRef(false);
  const applySystemCallHoldRef = useRef<(onHold: boolean) => void>(() => {});

  const applySystemCallHold = useCallback(
    (onHold: boolean) => {
      if (systemCallHoldRef.current === onHold) return;
      systemCallHoldRef.current = onHold;
      setSystemCallHold(onHold);
      emitPeerCallHold(onHold);
    },
    [emitPeerCallHold]
  );
  applySystemCallHoldRef.current = applySystemCallHold;

  useEffect(() => {
    systemCallHoldRef.current = systemCallHold;
  }, [systemCallHold]);

  useEffect(() => {
    if (!receiverAvailabilitySession || !user?.isAvailable) return;
    const affirmQueue = (): void => {
      void setQueueMode(true).catch(() => {});
    };
    affirmQueue();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' || state === 'background' || state === 'inactive') {
        affirmQueue();
      }
    });
    return () => sub.remove();
  }, [receiverAvailabilitySession, user?.isAvailable, setQueueMode]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      appStateRef.current = nextState;
      const interrupted = nextState !== 'active';
      appInBackgroundRef.current = interrupted;
      setAppInBackground(interrupted);
      // Hold is only for external phone calls (mic stolen) — not generic background.
      if (!interrupted && !endingRef.current && readyRef.current) {
        void applyVoiceCallAudioMode(speakerOn).catch(() => {
          // Best-effort audio route restore after interruption.
        });
      }
    });
    return () => sub.remove();
  }, [speakerOn]);

  useEffect(() => {
    readyRef.current = ready;
  }, [ready]);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    return () => {
      if (user?.role === 'caller') {
        void messageEligibility?.refresh();
      }
    };
  }, [messageEligibility, user?.role]);

  const applySessionBillingFromServer = (payload: {
    callerWalletBalanceInr?: number;
    callRatePerMinute?: number;
  }): void => {
    if (
      typeof payload.callerWalletBalanceInr === 'number' &&
      Number.isFinite(payload.callerWalletBalanceInr)
    ) {
      setSessionCallerWalletInr(Math.max(0, payload.callerWalletBalanceInr));
    }
    if (typeof payload.callRatePerMinute === 'number' && Number.isFinite(payload.callRatePerMinute)) {
      setSessionCallRatePerMinute(Math.max(0, payload.callRatePerMinute));
    }
  };

  const updateElapsedFromAnchor = useCallback((): void => {
    const anchorMs = talkAnchorMsRef.current;
    if (anchorMs == null || !Number.isFinite(anchorMs)) return;
    const next = Math.max(0, Math.floor((Date.now() - anchorMs) / 1000));
    setElapsedSec(next);
    elapsedSecRef.current = next;
  }, []);

  const applyTalkTimingFromServer = (payload: {
    talkStartedAt?: string | null;
    talkActive?: boolean;
    durationSec?: number;
  }): boolean => {
    const startedAtRaw =
      typeof payload.talkStartedAt === 'string' ? payload.talkStartedAt.trim() : '';
    if (!startedAtRaw) {
      return false;
    }
    const anchorMs = new Date(startedAtRaw).getTime();
    if (!Number.isFinite(anchorMs)) {
      return false;
    }
    talkAnchorMsRef.current = anchorMs;
    talkActiveRef.current = true;
    setTalkActive(true);
    updateElapsedFromAnchor();
    return true;
  };

  const formatHms = (totalSec: number): string => {
    const safe = Math.max(0, Math.floor(totalSec));
    const hh = String(Math.floor(safe / 3600)).padStart(2, '0');
    const mm = String(Math.floor((safe % 3600) / 60)).padStart(2, '0');
    const ss = String(safe % 60).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  };

  const remainingTalkCountdownEl = showRemainingTalkCountdown ? (
    user?.role === 'receiver' ? (
      <Text style={styles.remainingTalkCompact}>
        {remainingTalkCountdownTitle} · {formatHms(remainingTalkSec)}
      </Text>
    ) : (
      <View style={styles.countdownCard}>
        <Text style={styles.countdownTitle}>{remainingTalkCountdownTitle}</Text>
        <Text style={styles.countdownValue}>{formatHms(remainingTalkSec)}</Text>
      </View>
    )
  ) : null;

  const ensureSessionEnded = async (): Promise<{ canRate: boolean; durationSec: number } | null> => {
    if (endedSessionRef.current) return endedSessionResultRef.current;
    if (endSessionPromiseRef.current) return endSessionPromiseRef.current;
    endSessionPromiseRef.current = (async () => {
      try {
        const { data } = await callApi.sessionEnd(callIdRef.current);
        const durationSec =
          typeof data.durationSec === 'number' && Number.isFinite(data.durationSec)
            ? Math.max(0, data.durationSec)
            : 0;
        const result = { canRate: Boolean(data.canRate), durationSec };
        endedSessionRef.current = true;
        endedSessionResultRef.current = result;
        setLiveSettledAmountInr(
          typeof data.receiverEarnedInr === 'number' && Number.isFinite(data.receiverEarnedInr)
            ? Math.max(0, data.receiverEarnedInr)
            : 0
        );
        return result;
      } catch {
        // Allow future retries if a transient failure happens now.
        return null;
      } finally {
        endSessionPromiseRef.current = null;
      }
    })();
    return endSessionPromiseRef.current;
  };

  const showRatingPrompt = () => {
    setSelectedRating(0);
    setRatingOpen(true);
  };

  const showRatingPromptRef = useRef(showRatingPrompt);
  showRatingPromptRef.current = showRatingPrompt;

  const callerMeetsRatingThreshold = (serverDurationSec?: number): boolean => {
    const duration = Math.max(elapsedSecRef.current, serverDurationSec ?? 0);
    return duration >= MIN_RATING_SECONDS;
  };

  const shouldShowCallerRating = async (): Promise<boolean> => {
    if (callerCanRateByDurationRef.current) return true;
    const end = await ensureSessionEnded();
    return callerMeetsRatingThreshold(end?.durationSec);
  };

  const finishCallerCallEnd = async (): Promise<void> => {
    await leaveMedia();
    if (await shouldShowCallerRating()) {
      showRatingPrompt();
      return;
    }
    exitCallScreen();
  };
  const finishCallerCallEndRef = useRef(finishCallerCallEnd);
  finishCallerCallEndRef.current = finishCallerCallEnd;

  const matchesActiveCallId = useCallback(
    (endedCallId: string): boolean => {
      const normalized = endedCallId.trim();
      if (!normalized) return false;
      if (normalized === callIdRef.current.trim()) return true;
      const routeCallId = getVoiceBootstrap(callParams)?.callId?.trim();
      return Boolean(routeCallId && routeCallId === normalized);
    },
    [callParams],
  );
  const matchesActiveCallIdRef = useRef(matchesActiveCallId);
  matchesActiveCallIdRef.current = matchesActiveCallId;

  const teardownFromRemotePeerEnd = useCallback(async (): Promise<void> => {
    if (endingRef.current) return;
    endingRef.current = true;
    talkActiveRef.current = false;
    setTalkActive(false);
    void leaveMediaRef.current();
    void ensureSessionEndedRef.current();
    if (receiverAvailabilitySessionRef.current && userAvailableRef.current) {
      resetReceiverToWaitingRef.current();
      return;
    }
    exitCallScreenRef.current();
  }, []);
  const teardownFromRemotePeerEndRef = useRef(teardownFromRemotePeerEnd);
  teardownFromRemotePeerEndRef.current = teardownFromRemotePeerEnd;

  const emitCallEnd = (): void => {
    const callId = callIdRef.current.trim();
    if (!callId) return;
    emitCallEndSignal(callId);
    const voiceSocket = signalSocketRef.current;
    if (voiceSocket?.connected) {
      try {
        voiceSocket.emit('call:end', { callId });
      } catch {
        // CallSignal socket is primary; duplicate improves delivery on flaky networks.
      }
    }
  };

  const handlePeerCallEnded = useCallback((endedCallId: string): void => {
    if (!matchesActiveCallIdRef.current(endedCallId)) return;
    const role = userRoleRef.current;
    if (role === 'caller') {
      if (endingRef.current) return;
      endingRef.current = true;
      talkActiveRef.current = false;
      setTalkActive(false);
      void finishCallerCallEndRef.current();
      return;
    }
    if (role === 'receiver') {
      void teardownFromRemotePeerEndRef.current();
    }
  }, []);
  const handlePeerCallEndedRef = useRef(handlePeerCallEnded);
  handlePeerCallEndedRef.current = handlePeerCallEnded;
  const syncTalkTimingOnceRef = useRef<() => Promise<boolean>>(async () => false);
  const checkPeerEndedViaServer = useCallback(async (): Promise<void> => {
    const callId = callIdRef.current.trim();
    if (!callId || endingRef.current) return;
    try {
      const { data } = await callApi.sessionSync(callId, { light: true });
      if (data?.ok && data.status === 'completed') {
        handlePeerCallEndedRef.current(callId);
        return;
      }
    } catch {
      // Fall through to full sync.
    }
    void syncTalkTimingOnceRef.current();
  }, []);
  const checkPeerEndedViaServerRef = useRef(checkPeerEndedViaServer);
  checkPeerEndedViaServerRef.current = checkPeerEndedViaServer;

  const resetReceiverToWaiting = () => {
    endingRef.current = false;
    endedSessionRef.current = false;
    endedSessionResultRef.current = null;
    callIdRef.current = '';
    setReady(false);
    setClient(null);
    setCall(null);
    setTalkActive(false);
    talkActiveRef.current = false;
    talkAnchorMsRef.current = null;
    setElapsedSec(0);
    elapsedSecRef.current = 0;
    setIncomingReq(null);
    setReceiverSessionPhase('waiting');
    (navigation as { replace: (name: 'VoiceCall', params: VoiceCallScreenParams) => void }).replace(
      'VoiceCall',
      { receiverAvailabilitySession: true },
    );
  };
  const resetReceiverToWaitingRef = useRef(resetReceiverToWaiting);
  resetReceiverToWaitingRef.current = resetReceiverToWaiting;

  const allowLeaveCallScreenRef = useRef(false);

  useEffect(() => {
    const onHardwareBack = (): boolean => true;

    const navSub = navigation.addListener('beforeRemove', (e) => {
      if (allowLeaveCallScreenRef.current) return;
      const action = e.data.action;
      if (action.type === 'REPLACE') {
        const target =
          'payload' in action &&
          action.payload &&
          typeof action.payload === 'object' &&
          'name' in action.payload
            ? String((action.payload as { name?: string }).name ?? '')
            : '';
        if (target === 'VoiceCall') return;
      }
      e.preventDefault();
    });
    const backHandlerSub = BackHandler.addEventListener('hardwareBackPress', onHardwareBack);

    return () => {
      backHandlerSub.remove();
      navSub();
    };
  }, [navigation]);

  const exitCallScreen = () => {
    allowLeaveCallScreenRef.current = true;
    try {
      if (navigation.canGoBack()) {
        navigation.goBack();
        return;
      }
    } catch {
      // ignore
    }
    if (user?.role === 'caller') {
      (navigation as any).navigate('CallerMainTabs', { screen: 'CallerHome' });
      return;
    }
    (navigation as any).navigate('ReceiverMainTabs', { screen: 'ReceiverHome' });
  };

  const stopQueueAndExit = () => {
    void setQueueMode(false).catch(() => {
      // ignore signaling failures
    });
    exitCallScreen();
  };

  const leaveCallOnly = async (): Promise<void> => {
    try {
      if (activeCallRef.current) await activeCallRef.current.leave();
    } catch {
      // Ignore leave failures.
    }
    activeCallRef.current = null;
  };

  const leaveMedia = async () => {
    await leaveCallOnly();
    try {
      if (activeClientRef.current) await activeClientRef.current.disconnectUser();
    } catch {
      // Ignore disconnect failures.
    }
    activeClientRef.current = null;
    setClient(null);
    setCall(null);
    setReady(false);
    setTalkActive(false);
  };

  const ensureSessionEndedRef = useRef(ensureSessionEnded);
  const leaveMediaRef = useRef(leaveMedia);
  const stopQueueAndExitRef = useRef(stopQueueAndExit);
  const exitCallScreenRef = useRef(exitCallScreen);
  useEffect(() => {
    ensureSessionEndedRef.current = ensureSessionEnded;
    leaveMediaRef.current = leaveMedia;
    stopQueueAndExitRef.current = stopQueueAndExit;
    exitCallScreenRef.current = exitCallScreen;
  });

  const runBackgroundCallCleanup = () => {
    void (async () => {
      await leaveMediaRef.current();
      void ensureSessionEndedRef.current();
    })();
  };
  const runBackgroundCallCleanupRef = useRef(runBackgroundCallCleanup);
  runBackgroundCallCleanupRef.current = runBackgroundCallCleanup;

  useEffect(() => {
    if (!receiverAvailabilitySession) return;
    void applyVoiceCallAudioMode(true).catch(() => { });
    return () => {
      void resetVoiceCallAudioMode();
    };
  }, [receiverAvailabilitySession]);

  useEffect(() => {
    incomingReqRef.current = incomingReq;
  }, [incomingReq]);

  const dismissIncomingOnSession = useCallback((callId: string) => {
    if (incomingReqRef.current?.callId !== callId) return;
    void stopIncomingRingtone();
    setIncomingReq(null);
    setReceiverSessionPhase('waiting');
    setIncomingResponding(false);
  }, [stopIncomingRingtone]);
  const dismissIncomingOnSessionRef = useRef(dismissIncomingOnSession);
  dismissIncomingOnSessionRef.current = dismissIncomingOnSession;

  useEffect(() => {
    if (user?.role !== 'caller' && user?.role !== 'receiver') {
      setRemoteCallEndedHandler(null);
      setActiveCallRecoveryHandler(null);
      return;
    }
    setRemoteCallEndedHandler((endedCallId) => {
      handlePeerCallEndedRef.current(endedCallId);
    });
    setActiveCallRecoveryHandler(() => {
      void checkPeerEndedViaServerRef.current();
    });
    return () => {
      setRemoteCallEndedHandler(null);
      setActiveCallRecoveryHandler(null);
    };
  }, [user?.role, setRemoteCallEndedHandler, setActiveCallRecoveryHandler]);

  useEffect(() => {
    if (user?.role !== 'caller' && user?.role !== 'receiver') {
      setPeerCallHoldHandler(null);
      return;
    }
    setPeerCallHoldHandler((holdCallId, onHold) => {
      if (!matchesActiveCallId(holdCallId)) return;
      applyPeerHoldFromRemote(onHold);
    });
    return () => {
      setPeerCallHoldHandler(null);
      setPeerCallHold(false);
    };
  }, [user?.role, matchesActiveCallId, setPeerCallHoldHandler, applyPeerHoldFromRemote]);

  useEffect(() => {
    if (user?.role !== 'caller' && user?.role !== 'receiver') {
      setPeerCallMuteHandler(null);
      return;
    }
    setPeerCallMuteHandler((muteCallId, muted) => {
      if (!matchesActiveCallId(muteCallId)) return;
      applyPeerMuteFromRemote(muted);
    });
    return () => {
      setPeerCallMuteHandler(null);
      setPeerCallMuted(false);
    };
  }, [user?.role, matchesActiveCallId, setPeerCallMuteHandler, applyPeerMuteFromRemote]);

  useEffect(() => {
    if (!receiverAvailabilitySession) return;
    setIncomingCallDismissHandler(dismissIncomingOnSession);
    setIncomingCallHandler((incoming) => {
      setIncomingReq(incoming);
      incomingReqRef.current = incoming;
      setReceiverSessionPhase('incoming');
      void (async () => {
        try {
          await startIncomingRingtone();
        } catch {
          // UI still works if ring fails
        }
      })();
      void callApi.bootstrap(incoming.fromId, incoming.callId).catch(() => { });
    });
    return () => {
      setIncomingCallHandler(null);
      setIncomingCallDismissHandler(null);
      void stopIncomingRingtone();
    };
  }, [
    receiverAvailabilitySession,
    dismissIncomingOnSession,
    setIncomingCallHandler,
    setIncomingCallDismissHandler,
    startIncomingRingtone,
    stopIncomingRingtone,
  ]);

  useEffect(() => {
    if (!receiverAvailabilitySession || receiverSessionPhase !== 'incoming' || !incomingReq) return;
    const timeout = setTimeout(() => {
      if (!incomingResponding) {
        rejectIncomingCall(incomingReq);
        setIncomingReq(null);
        setReceiverSessionPhase('waiting');
        void stopIncomingRingtone();
      }
    }, 35_000);
    return () => clearTimeout(timeout);
  }, [
    receiverAvailabilitySession,
    receiverSessionPhase,
    incomingReq,
    incomingResponding,
    rejectIncomingCall,
    stopIncomingRingtone,
  ]);

  const onAcceptIncomingOnSession = () => {
    if (!incomingReq || incomingResponding) return;
    setIncomingResponding(true);
    void (async () => {
      try {
        const boot = await acceptIncomingCallStayOnScreen(incomingReq);
        setIncomingReq(null);
        setReceiverSessionPhase(null);
        (navigation as { setParams: (p: VoiceCallScreenParams) => void }).setParams({
          ...boot,
          peerName: incomingReq.peerName,
          peerImage: incomingReq.peerImage ?? null,
          receiverAvailabilitySession: true,
        });
      } catch (e) {
        Alert.alert('Call failed', getErrorMessage(e));
        setReceiverSessionPhase('waiting');
        setIncomingReq(null);
      } finally {
        setIncomingResponding(false);
      }
    })();
  };

  const onRejectIncomingOnSession = () => {
    if (!incomingReq || incomingResponding) return;
    setIncomingResponding(true);
    void (async () => {
      try {
        await stopIncomingRingtone();
        rejectIncomingCall(incomingReq);
      } finally {
        setIncomingReq(null);
        setReceiverSessionPhase('waiting');
        setIncomingResponding(false);
      }
    })();
  };

  useEffect(() => {
    const id = streamBootstrap?.callId;
    if (id) callIdRef.current = id;
    userChosenMuteRef.current = false;
    setMuted(false);
    setPeerCallMuted(false);
  }, [streamBootstrap?.callId]);

  useEffect(() => {
    if (Constants.appOwnership === 'expo') return;
    const boot = getVoiceBootstrap(route.params as VoiceCallScreenParams);
    const phase = getOutgoingCallerPhase(route.params as VoiceCallScreenParams);
    if (!boot && phase !== 'ringing' && !receiverAvailabilitySession) return;
    const streamSdk = loadStreamSdkModule();
    if (streamSdk) {
      setSdk((prev) => prev ?? streamSdk);
    }
  }, [route.params, receiverAvailabilitySession]);

  const ensureSessionStartedOnScreen = useCallback(
    async (callId: string, peerAccountId: string): Promise<void> => {
      try {
        const data = await getVoiceSessionStartPromise(callId, peerAccountId);
        applyTalkTimingFromServer(data);
        applySessionBillingFromServer(data);
      } catch {
        // sync / Stream bridge will retry.
      }
    },
    []
  );

  useEffect(() => {
    if (Constants.appOwnership === 'expo') return;
    const phase = getOutgoingCallerPhase(route.params as VoiceCallScreenParams);
    const boot = getVoiceBootstrap(route.params as VoiceCallScreenParams);
    if (phase !== 'ringing' || !boot) return;

    const streamSdk = loadStreamSdkModule();
    if (!streamSdk) return;
    setSdk((prev) => prev ?? streamSdk);

    void (async () => {
      try {
        const perm = await Audio.getPermissionsAsync();
        if (perm.status !== 'granted') return;
        await applyVoiceCallAudioMode(true);
        streamSdk.StreamVideoClient.getOrCreateInstance({
          apiKey: boot.apiKey,
          user: {
            id: boot.streamUserId,
            name: displayNameRef.current,
            image: profileImageUrlForStreamOrNetwork(displayImageRef.current),
          },
          token: boot.token,
        });
      } catch {
        // Warm-up is best-effort.
      }
    })();
  }, [route.params, outgoingCallerPhase]);

  useEffect(() => {
    if (user?.role !== 'caller' || outgoingCallerPhase !== 'ringing') return;
    let stopFn: (() => Promise<void>) | undefined;
    void (async () => {
      try {
        stopFn = await startOutboundRingtoneLoop();
      } catch {
        // ignore ring load failures
      }
    })();
    return () => {
      void stopFn?.();
    };
  }, [user?.role, outgoingCallerPhase]);

  const outgoingPhaseCleanupRef = useRef(outgoingCallerPhase);
  outgoingPhaseCleanupRef.current = outgoingCallerPhase;
  useEffect(() => {
    return () => {
      if (userRoleRef.current === 'caller' && outgoingPhaseCleanupRef.current === 'ringing') {
        cancelOutgoingRef.current();
      }
    };
  }, []);

  useEffect(() => {
    if (Constants.appOwnership === 'expo') {
      return;
    }

    const phaseNow = getOutgoingCallerPhase(route.params as VoiceCallScreenParams);
    const boot = getVoiceBootstrap(route.params as VoiceCallScreenParams);
    if (phaseNow === 'ringing' || !boot) {
      return;
    }

    const attemptId = ++streamJoinAttemptRef.current;
    let cancelled = false;

    void (async () => {
      if (Constants.appOwnership === 'expo') {
        Alert.alert(
          'Development build required',
          'Voice calling uses native WebRTC modules and will not work in Expo Go. Build and run a development build first.',
          [{ text: 'OK', onPress: () => exitCallScreenRef.current() }]
        );
        return;
      }
      try {
        const streamSdk = loadStreamSdkModule();
        if (!streamSdk) {
          throw new Error('Voice SDK is not available in this build');
        }
        setSdk((prev) => prev ?? streamSdk);

        const existingMic = await Audio.getPermissionsAsync();
        let micGranted = existingMic.status === 'granted';
        if (!micGranted) {
          const mic = await Audio.requestPermissionsAsync();
          micGranted = mic.status === 'granted';
        }
        if (!micGranted) {
          throw new Error('Microphone permission is required for voice calls');
        }
        await applyVoiceCallAudioMode(true);

        const nextClient = streamSdk.StreamVideoClient.getOrCreateInstance({
          apiKey: boot.apiKey,
          user: {
            id: boot.streamUserId,
            name: displayNameRef.current,
            image: profileImageUrlForStreamOrNetwork(displayImageRef.current),
          },
          token: boot.token,
        });
        if (cancelled || attemptId !== streamJoinAttemptRef.current) {
          return;
        }
        activeClientRef.current = nextClient;

        const nextCall = nextClient.call(boot.callType, boot.callId);
        activeCallRef.current = nextCall;

        await Promise.all([
          nextCall.join({ create: true }),
          getVoiceSessionStartPromise(boot.callId, boot.peerAccountId).then((data) => {
            applyTalkTimingFromServer(data);
            applySessionBillingFromServer(data);
          }),
        ]);
        if (cancelled || attemptId !== streamJoinAttemptRef.current) {
          return;
        }

        setClient(nextClient);
        setCall(nextCall);
        setReady(true);
        setError(null);
        void syncTalkTimingUntilBothJoined();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to join call';
        if (cancelled || attemptId !== streamJoinAttemptRef.current) {
          return;
        }
        setError(msg);
        Alert.alert('Voice call error', msg, [{ text: 'OK', onPress: () => exitCallScreenRef.current() }]);
      }
    })();

    return () => {
      cancelled = true;
      const closedAttempt = attemptId;
      void (async () => {
        void resetVoiceCallAudioMode();
        if (closedAttempt !== streamJoinAttemptRef.current) {
          // Effect re-ran (e.g. ringing → joining). Leave call only — keep Stream user connected.
          await leaveCallOnly();
          return;
        }
        await leaveMedia();
      })();
    };
  }, [
    navigation,
    outgoingCallerPhase,
    streamBootstrap?.apiKey,
    streamBootstrap?.callId,
    streamBootstrap?.callType,
    streamBootstrap?.token,
    streamBootstrap?.streamUserId,
    ensureSessionStartedOnScreen,
  ]);

  useEffect(() => {
    let cancelled = false;
    const base = getResolvedApiBaseUrl();
    void (async () => {
      const token = await getJwt();
      if (!token || cancelled) return;
      const socket = io(base, {
        auth: { token },
        // polling+websocket: Oppo/Vivo/Samsung often kill pure WebSocket in background.
        transports: ['polling', 'websocket'],
        timeout: 20000,
        reconnection: true,
        reconnectionAttempts: 50,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10000,
      });
      signalSocketRef.current = socket;
      const onVoiceSocketConnect = (): void => {
        const callId = callIdRef.current.trim();
        if (!callId) return;
        try {
          socket.emit('call:hold', { callId, onHold: systemCallHoldRef.current });
          socket.emit('call:mute', { callId, muted: userChosenMuteRef.current });
        } catch {
          // ignore
        }
        if (!endingRef.current) {
          void checkPeerEndedViaServerRef.current();
        }
      };
      socket.on('connect', onVoiceSocketConnect);
      socket.on('call:hold', (payload: { callId?: string; onHold?: boolean; fromType?: 'u' | 'r' }) => {
        const myType = userRoleRef.current === 'caller' ? 'u' : 'r';
        if (payload?.fromType === myType) return;
        const id = typeof payload?.callId === 'string' ? payload.callId.trim() : '';
        if (!id || id !== callIdRef.current.trim()) return;
        applyPeerHoldFromRemoteRef.current(Boolean(payload.onHold));
      });
      socket.on('call:mute', (payload: { callId?: string; muted?: boolean; fromType?: 'u' | 'r' }) => {
        const myType = userRoleRef.current === 'caller' ? 'u' : 'r';
        if (payload?.fromType === myType) return;
        const id = typeof payload?.callId === 'string' ? payload.callId.trim() : '';
        if (!id || id !== callIdRef.current.trim()) return;
        applyPeerMuteFromRemoteRef.current(Boolean(payload.muted));
      });
      socket.on('call:ended', (payload: { callId?: string; fromType?: 'u' | 'r' }) => {
        const myType = userRoleRef.current === 'caller' ? 'u' : 'r';
        if (payload?.fromType === myType) return;
        const id = typeof payload?.callId === 'string' ? payload.callId.trim() : '';
        if (!id) return;
        handlePeerCallEndedRef.current(id);
      });
      // Duplicate socket for hold/mute/end — CallSignalContext is primary; this improves delivery on flaky devices.
    })();

    return () => {
      cancelled = true;
      const s = signalSocketRef.current;
      if (s) {
        s.removeAllListeners();
        s.disconnect();
      }
      signalSocketRef.current = null;
    };
    // Intentionally static: do not depend on callerCanRateByDuration (flips at 60s) or the socket will reconnect and drop the call.
  }, []);

  const syncTalkTimingOnce = useCallback(async (): Promise<boolean> => {
    if (!callIdRef.current || endingRef.current) return false;
    const light = !talkActiveRef.current;
    try {
      const { data } = await callApi.sessionSync(callIdRef.current, { light });
      if (!data?.ok) return false;
      if (data.status === 'completed' && !endingRef.current) {
        handlePeerCallEndedRef.current(callIdRef.current);
        return false;
      }
      const started = applyTalkTimingFromServer(data);
      if (!light) {
        applySessionBillingFromServer(data);
        if (
          typeof data.receiverEarnedInr === 'number' &&
          Number.isFinite(data.receiverEarnedInr) &&
          data.receiverEarnedInr >= 0
        ) {
          setLiveSettledAmountInr((prev) =>
            data.receiverEarnedInr > prev ? data.receiverEarnedInr : prev
          );
        }
        if (user?.role === 'receiver') {
          void refreshReceiverEarningMeta();
        }
      }
      return started;
    } catch {
      // Best-effort live settlement sync.
      return false;
    }
  }, [refreshReceiverEarningMeta, user?.role]);
  syncTalkTimingOnceRef.current = syncTalkTimingOnce;

  const syncTalkTimingUntilBothJoined = useCallback(async (): Promise<void> => {
    if (talkActiveRef.current || syncTalkBurstInFlightRef.current) return;
    syncTalkBurstInFlightRef.current = true;
    try {
      const boot = getVoiceBootstrap(callParams);
      if (boot) {
        void getVoiceSessionStartPromise(boot.callId, boot.peerAccountId)
          .then((data) => {
            applyTalkTimingFromServer(data);
            applySessionBillingFromServer(data);
          })
          .catch(() => {});
      }
      const maxAttempts = 50;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        if (endingRef.current || talkActiveRef.current) return;
        const started = await syncTalkTimingOnce();
        if (started) return;
        if (attempt < maxAttempts - 1) {
          const delayMs = attempt < 15 ? 0 : attempt < 30 ? 20 : 40;
          if (delayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          }
        }
      }
    } finally {
      syncTalkBurstInFlightRef.current = false;
    }
  }, [callParams, syncTalkTimingOnce]);

  const beginTalkTimingLocal = useCallback((): void => {
    void syncTalkTimingUntilBothJoined();
  }, [syncTalkTimingUntilBothJoined]);

  const beginTalkTimingLocalRef = useRef(beginTalkTimingLocal);
  beginTalkTimingLocalRef.current = beginTalkTimingLocal;

  useEffect(() => {
    if (!ready || !talkActive) return;
    updateElapsedFromAnchor();
    const timer = setInterval(updateElapsedFromAnchor, 1000);
    return () => clearInterval(timer);
  }, [ready, talkActive, updateElapsedFromAnchor]);

  useEffect(() => {
    if (!ready || endingRef.current || talkActiveRef.current) return;
    void syncTalkTimingUntilBothJoined();
  }, [ready, syncTalkTimingUntilBothJoined]);

  useEffect(() => {
    if (!ready || endingRef.current) return;
    const pollMs = appInBackground ? (talkActive ? 1000 : 2000) : talkActive ? 3000 : 80;
    const poll = setInterval(() => {
      if (endingRef.current) return;
      void syncTalkTimingOnce();
    }, pollMs);
    return () => clearInterval(poll);
  }, [ready, talkActive, appInBackground, syncTalkTimingOnce]);

  useEffect(() => {
    if (!ready) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && state !== 'background' && state !== 'inactive') return;
      if (!callIdRef.current || endingRef.current) return;
      void checkPeerEndedViaServerRef.current();
    });
    return () => sub.remove();
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    if (user?.role !== 'caller') return;
    if (!showRemainingTalkCountdown) return;
    if (remainingTalkSec > 0) return;
    if (endingRef.current || autoEndByBalanceRef.current) return;
    autoEndByBalanceRef.current = true;
    void (async () => {
      Alert.alert('Call ended', 'Your talk time is over.');
      await hangup();
    })();
  }, [remainingTalkSec, ready, showRemainingTalkCountdown, user?.role]);

  const hangup = async () => {
    if (receiverAvailabilitySession && receiverSessionPhase === 'waiting') {
      allowLeaveCallScreenRef.current = true;
      exitCallScreen();
      return;
    }
    if (receiverAvailabilitySession && receiverSessionPhase === 'incoming') {
      onRejectIncomingOnSession();
      return;
    }

    const outboundPhase = getOutgoingCallerPhase(route.params as VoiceCallScreenParams);
    if (user?.role === 'caller' && outboundPhase === 'ringing') {
      if (endingRef.current) return;
      endingRef.current = true;
      cancelOutgoingCallInvite();
      exitCallScreen();
      return;
    }
    if (endingRef.current) return;
    endingRef.current = true;
    talkActiveRef.current = false;
    setTalkActive(false);

    emitCallEnd();

    if (user?.role === 'caller') {
      await finishCallerCallEnd();
      return;
    }

    await leaveMedia();
    void ensureSessionEnded();

    if (receiverAvailabilitySession && Boolean(user?.isAvailable)) {
      resetReceiverToWaiting();
      return;
    }

    exitCallScreen();
  };

  const toggleSpeaker = async () => {
    const next = !speakerOn;
    try {
      await applyVoiceCallAudioMode(next);
      setSpeakerOn(next);
    } catch (e) {
      Alert.alert('Speaker', getErrorMessage(e));
    }
  };

  const setStreamMicEnabled = useCallback(async (enabled: boolean): Promise<void> => {
    const control = streamMicControlRef.current;
    if (!control) {
      throw new Error('Call audio is not ready yet');
    }
    await control.setEnabled(enabled);
  }, []);

  useEffect(() => {
    if (!systemCallHold) {
      if (holdForcedMicOffRef.current) {
        holdForcedMicOffRef.current = false;
        if (!userChosenMuteRef.current) {
          void setStreamMicEnabled(true).catch(() => {
            // ignore restore errors
          });
        }
      }
      return;
    }
    if (!holdForcedMicOffRef.current) {
      holdForcedMicOffRef.current = true;
      if (!userChosenMuteRef.current) {
        void setStreamMicEnabled(false).catch(() => {
          // ignore
        });
      }
    }
  }, [systemCallHold, setStreamMicEnabled]);

  const toggleMute = async () => {
    if (!streamMicControlRef.current) {
      Alert.alert('Mute', 'Call audio is still connecting. Try again in a moment.');
      return;
    }
    if (systemCallHoldRef.current && !mutedRef.current) return;
    try {
      await streamMicControlRef.current.toggle();
    } catch (e) {
      Alert.alert('Mute failed', getErrorMessage(e));
    }
  };

  const handleStreamSystemHold = useCallback(
    (onHold: boolean) => {
      if (endingRef.current) return;
      if (onHold) {
        applySystemCallHold(true);
        return;
      }
      if (!peerCallHoldRef.current) {
        applySystemCallHold(false);
      }
    },
    [applySystemCallHold]
  );

  const showStreamChrome = ready && Boolean(client) && Boolean(call) && Boolean(sdk);
  const streamAvatarExtras = useMemo(
    () => (showStreamChrome ? loadStreamCallAvatarExtras() : null),
    [showStreamChrome]
  );

  const showCallShell =
    !error &&
    !showStreamChrome &&
    (receiverAvailabilitySession ||
      outgoingCallerPhase === 'ringing' ||
      outgoingCallerPhase === 'joining' ||
      Boolean(streamBootstrap));

  const shellPeerName =
    receiverSessionPhase === 'incoming' && incomingReq
      ? incomingReq.peerName
      : ('peerName' in callParams ? callParams.peerName : undefined) || 'Contact';
  const shellPeerImage =
    receiverSessionPhase === 'incoming' && incomingReq
      ? incomingReq.peerImage
      : 'peerImage' in callParams
        ? callParams.peerImage
        : null;
  const shellPeerEmpty = receiverAvailabilitySession && receiverSessionPhase === 'waiting';
  const peerDisplayName =
    ('peerName' in callParams ? callParams.peerName : undefined) || 'Contact';
  const shellStatusLabel = receiverAvailabilitySession
    ? systemCallHold
      ? 'On hold · phone call in progress'
      : peerCallHold
        ? `${peerDisplayName} is on hold`
      : receiverSessionPhase === 'incoming'
      ? 'Incoming call'
      : streamBootstrap
        ? 'Connecting…'
        : 'You are online'
    : systemCallHold
      ? 'On hold · phone call in progress'
      : peerCallHold
        ? `${peerDisplayName} is on hold`
      : outgoingCallerPhase === 'ringing'
      ? 'Calling…'
      : 'Connecting';
  const shellHangupLabel =
    receiverAvailabilitySession && receiverSessionPhase === 'incoming'
      ? 'Decline'
      : user?.role === 'caller' && outgoingCallerPhase === 'ringing'
        ? 'Cancel'
        : 'Disconnect';
  const shellShowControls = receiverAvailabilitySession || user?.role === 'receiver';
  const shellShowIncomingActions =
    receiverAvailabilitySession && receiverSessionPhase === 'incoming' && Boolean(incomingReq);

  const renderCallShell = (): React.JSX.Element => {
    const peerSrc =
      !shellPeerEmpty && shellPeerImage ? resolveProfileImageSource(shellPeerImage) : null;
    const peerInitial = (shellPeerName || 'U').trim().charAt(0).toUpperCase();
    const showPeerPulse =
      !peerCallHold &&
      receiverAvailabilitySession &&
      (receiverSessionPhase === 'incoming' || Boolean(streamBootstrap));

    return (
      <View style={styles.container}>
        <LinearGradient
          colors={['#0a0014', '#1e0b3d', '#4c1d95', '#6d28d9', '#7c3aed']}
          locations={[0, 0.22, 0.48, 0.72, 1]}
          start={{ x: 0.08, y: 0 }}
          end={{ x: 0.92, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={[styles.overlay, { paddingTop: Math.max(insets.top + 16, 36) }]}>
          <View style={styles.statusPill}>
            <Text style={styles.statusText}>{shellStatusLabel}</Text>
          </View>
          <View style={styles.avatarRow}>
            <View style={styles.avatarCol}>
              <View style={styles.avatarRingHost}>
                {showPeerPulse ? <AvatarSoundWaveRings active /> : null}
                <View style={styles.avatarWrap}>
                  {peerSrc ? (
                    <Image source={peerSrc} style={styles.avatar} />
                  ) : shellPeerEmpty ? (
                    <View style={[styles.avatar, styles.avatarPlaceholder, styles.avatarEmptyPeer]} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarPlaceholder]}>
                      <Text style={styles.avatarInitial}>{peerInitial}</Text>
                    </View>
                  )}
                </View>
              </View>
              <Text style={styles.avatarCaption} numberOfLines={1}>
                {shellPeerEmpty ? 'Waiting…' : peerCallHold ? 'On hold' : shellPeerName}
              </Text>
            </View>
            <View style={styles.avatarCol}>
              <View style={styles.avatarRingHost}>
                <View style={styles.avatarWrap}>
                  {(() => {
                    const selfSrc = user?.profileImage
                      ? resolveProfileImageSource(user.profileImage)
                      : null;
                    return selfSrc ? (
                      <Image source={selfSrc} style={styles.avatar} />
                    ) : (
                      <View style={[styles.avatar, styles.avatarPlaceholder]}>
                        <Text style={styles.avatarInitial}>
                          {(user?.name || 'Y').trim().charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    );
                  })()}
                </View>
              </View>
              <Text style={styles.avatarCaption}>
                {systemCallHold ? 'On hold' : 'You'}
              </Text>
            </View>
          </View>
          <Text style={[
            styles.peerName,
            receiverAvailabilitySession && receiverSessionPhase === 'waiting' && styles.peerNameCentered
          ]}>
            {receiverAvailabilitySession && receiverSessionPhase === 'waiting'
              ? 'Waiting for callers…'
              : shellPeerName}
          </Text>
          {receiverAvailabilitySession && streamBootstrap && !talkActive ? (
            <Text style={styles.waitingHint}>Someone will join soon..s</Text>
          ) : null}
          {remainingTalkCountdownEl}
          {shellShowIncomingActions && incomingReq ? (
            <View style={styles.incomingActions}>
              <TouchableOpacity
                style={[styles.incomingActionBtn, styles.incomingRejectBtn]}
                onPress={() => onRejectIncomingOnSession()}
                disabled={incomingResponding}
                activeOpacity={0.88}
              >
                <Ionicons name="close" size={28} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.incomingActionBtn, styles.incomingAcceptBtn]}
                onPress={() => onAcceptIncomingOnSession()}
                disabled={incomingResponding}
                activeOpacity={0.88}
              >
                <Ionicons name="checkmark" size={28} color="#fff" />
              </TouchableOpacity>
            </View>
          ) : null}
          {shellShowControls ? (
            <View style={styles.controls}>
              <TouchableOpacity
                style={[styles.roundBtn, muted && styles.roundBtnActive]}
                onPress={() => void toggleMute()}
                activeOpacity={0.85}
              >
                <Ionicons name={muted ? 'mic-off' : 'mic'} size={26} color="#faf5ff" />
                <Text style={styles.roundText}>{muted ? 'Unmute' : 'Mute'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.roundBtn, speakerOn && styles.roundBtnActive]}
                onPress={() => void toggleSpeaker()}
                activeOpacity={0.85}
              >
                <Ionicons
                  name={speakerOn ? 'volume-high' : 'phone-portrait-outline'}
                  size={26}
                  color="#faf5ff"
                />
                <Text style={styles.roundText}>{speakerOn ? 'Speaker' : 'Earpiece'}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {!shellShowIncomingActions ? (
            <TouchableOpacity
              style={styles.hangup}
              onPress={() => void hangup()}
              disabled={incomingResponding}
              activeOpacity={0.88}
            >
              <LinearGradient
                colors={['#9d174d', '#be185d', '#db2777']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.hangupGrad}
              >
                <Text style={styles.hangupText}>{shellHangupLabel}</Text>
              </LinearGradient>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  };

  const ratingModal = (
    <Modal visible={ratingOpen} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.ratingCard}>
          <Text style={styles.ratingTitle}>Rate this call</Text>
          <Text style={styles.ratingSubtitle}>How was the call quality?</Text>
          <View style={styles.starRow}>
            {[1, 2, 3, 4, 5].map((n) => (
              <TouchableOpacity
                key={n}
                activeOpacity={0.75}
                onPress={() => setSelectedRating(n)}
                style={styles.starHit}
                accessibilityRole="button"
                accessibilityLabel={`Rate ${n} out of 5`}
              >
                <Ionicons
                  name={n <= selectedRating ? 'star' : 'star-outline'}
                  size={38}
                  color={n <= selectedRating ? '#fbbf24' : '#c4b5fd'}
                />
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            style={[styles.ratingSubmitOuter, selectedRating === 0 && styles.ratingSubmitBtnOff]}
            disabled={selectedRating === 0 || submittingRating}
            activeOpacity={0.88}
            onPress={() => {
              void (async () => {
                if (!selectedRating) return;
                setSubmittingRating(true);
                try {
                  await callApi.sessionRate(callIdRef.current, selectedRating);
                } catch {
                  // Keep exit behavior even if rating submit fails.
                } finally {
                  setSubmittingRating(false);
                  setRatingOpen(false);
                  stopQueueAndExit();
                }
              })();
            }}
          >
            <LinearGradient
              colors={['#6d28d9', '#7c3aed', '#a78bfa']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.ratingSubmitGrad}
            >
              <Text style={styles.ratingSubmitText}>{submittingRating ? 'Submitting...' : 'Submit'}</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.ratingSkipBtn}
            disabled={submittingRating}
            onPress={() => {
              setRatingOpen(false);
              stopQueueAndExit();
            }}
          >
            <Text style={styles.ratingSkipText}>Skip</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  let screenBody: React.JSX.Element;

  if (error && !showStreamChrome) {
    screenBody = (
      <View style={styles.center}>
        <LinearGradient
          colors={['#0a0014', '#1e0b3d', '#4c1d95', '#6d28d9']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <Text style={styles.loadingText}>{error}</Text>
        <TouchableOpacity
          style={styles.preJoinBackBtn}
          onPress={() => exitCallScreenRef.current()}
          activeOpacity={0.88}
        >
          <Text style={styles.preJoinBackBtnText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  } else if (showCallShell) {
    screenBody = renderCallShell();
  } else if (!(ready && client && call && sdk)) {
    screenBody = <View style={{ flex: 1, backgroundColor: '#0a0014' }} />;
  } else {
    screenBody = (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0a0014', '#1e0b3d', '#4c1d95', '#6d28d9', '#7c3aed']}
        locations={[0, 0.22, 0.48, 0.72, 1]}
        start={{ x: 0.08, y: 0 }}
        end={{ x: 0.92, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <sdk.StreamVideo client={client}>
        <sdk.StreamCall call={call}>
          {streamAvatarExtras ? (
            <streamAvatarExtras.StreamMicControlBridge
              controlRef={streamMicControlRef}
              onMutedChange={setMuted}
              onUserMuteToggled={emitPeerCallMute}
              userChosenMuteRef={userChosenMuteRef}
            />
          ) : null}
          {streamAvatarExtras ? (
            <streamAvatarExtras.StreamTalkTimingBridge
              onBothConnected={() => {
                const boot = getVoiceBootstrap(callParams);
                if (boot) {
                  void ensureSessionStartedOnScreen(boot.callId, boot.peerAccountId);
                }
                beginTalkTimingLocalRef.current();
              }}
            />
          ) : null}
          {streamAvatarExtras ? (
            <streamAvatarExtras.StreamRemotePeerLeftBridge
              onRemotePeerLeft={() => {
                const callId = callIdRef.current.trim();
                if (!callId || endingRef.current) return;
                handlePeerCallEndedRef.current(callId);
              }}
            />
          ) : null}
          {streamAvatarExtras ? (
            <streamAvatarExtras.StreamSystemHoldBridge
              userChosenMuteRef={userChosenMuteRef}
              appInBackground={appInBackground}
              onSystemHoldChange={handleStreamSystemHold}
            />
          ) : null}
          <View style={[styles.overlay, { paddingTop: Math.max(insets.top + 16, 36) }]}>
            <View style={styles.statusPill}>
              <Text style={styles.statusText}>
                {systemCallHold
                  ? 'On hold · phone call in progress'
                  : peerCallHold
                    ? `${peerDisplayName} is on hold`
                    : talkActive
                      ? 'Call Active'
                      : 'Connecting…'}
              </Text>
            </View>
            <View style={styles.avatarRow}>
              <View style={styles.avatarCol}>
                <View style={styles.avatarRingHost}>
                  {streamAvatarExtras ? (
                    <streamAvatarExtras.StreamParticipantVoiceWaves
                      side="remote"
                      onHold={peerCallHold}
                    />
                  ) : null}
                  <View style={styles.avatarWrap}>
                    {(() => {
                      const peerSrc = route.params.peerImage
                        ? resolveProfileImageSource(route.params.peerImage)
                        : null;
                      return peerSrc ? (
                        <Image source={peerSrc} style={styles.avatar} />
                      ) : (
                        <View style={[styles.avatar, styles.avatarPlaceholder]}>
                          <Text style={styles.avatarInitial}>
                            {(route.params.peerName || 'U').trim().charAt(0).toUpperCase()}
                          </Text>
                        </View>
                      );
                    })()}
                    {streamAvatarExtras ? (
                      <streamAvatarExtras.StreamParticipantMutedIndicator
                        peerOnHold={peerCallHold}
                        peerMuted={peerCallMuted}
                        talkActive={talkActive}
                      />
                    ) : null}
                  </View>
                </View>
                <Text style={styles.avatarCaption} numberOfLines={1}>
                  {peerCallHold ? 'On hold' : route.params.peerName || 'Contact'}
                </Text>
              </View>
              <View style={styles.avatarCol}>
                <View style={styles.avatarRingHost}>
                  {streamAvatarExtras ? (
                    <streamAvatarExtras.StreamParticipantVoiceWaves
                      side="local"
                      microphoneMuted={muted || systemCallHold}
                      onHold={systemCallHold}
                    />
                  ) : null}
                  <View style={styles.avatarWrap}>
                    {(() => {
                      const selfSrc = user?.profileImage
                        ? resolveProfileImageSource(user.profileImage)
                        : null;
                      return selfSrc ? (
                        <Image source={selfSrc} style={styles.avatar} />
                      ) : (
                        <View style={[styles.avatar, styles.avatarPlaceholder]}>
                          <Text style={styles.avatarInitial}>
                            {(user?.name || 'Y').trim().charAt(0).toUpperCase()}
                          </Text>
                        </View>
                      );
                    })()}
                  </View>
                </View>
                <Text style={styles.avatarCaption}>{systemCallHold ? 'On hold' : 'You'}</Text>
              </View>
            </View>
            <Text style={styles.peerName}>
              {'peerName' in route.params ? route.params.peerName : 'Contact'}
            </Text>
            {talkActive ? (
              <>
                <Text style={styles.durationLabel}>Talk time</Text>
                <Text style={styles.durationValue}>
                  {`${String(Math.floor(elapsedSec / 60)).padStart(2, '0')}:${String(elapsedSec % 60).padStart(2, '0')}`}
                </Text>
              </>
            ) : user?.role === 'caller' ? (
              <>
                <Text style={styles.durationLabel}>Talk time</Text>
                <Text style={styles.durationValue}>Connecting…</Text>
              </>
            ) : receiverAvailabilitySession ? (
              <Text style={styles.waitingHint}>Talk time starts when you are both connected.</Text>
            ) : (
              <>
                <Text style={styles.durationLabel}>Talk time</Text>
                <Text style={styles.durationValue}>Connecting…</Text>
              </>
            )}
            {remainingTalkCountdownEl}
            {showLiveEarning ? (
              <LinearGradient
                colors={['#5b21b6', '#7c3aed', '#a78bfa']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.earningCard}
              >
                <Text style={styles.earningTitle}>Live Earning</Text>
                <Text style={styles.earningValue}>₹{shownLiveEarning.toLocaleString('en-IN')}</Text>
                <Text style={styles.earningSub}>{liveEarningSub}</Text>
              </LinearGradient>
            ) : null}
            <View style={styles.controls}>
              <TouchableOpacity
                style={[styles.roundBtn, muted && styles.roundBtnActive]}
                onPress={() => void toggleMute()}
                activeOpacity={0.85}
              >
                <Ionicons name={muted ? 'mic-off' : 'mic'} size={26} color="#faf5ff" />
                <Text style={styles.roundText}>{muted ? 'Unmute' : 'Mute'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.roundBtn, speakerOn && styles.roundBtnActive]}
                onPress={() => void toggleSpeaker()}
                activeOpacity={0.85}
              >
                <Ionicons
                  name={speakerOn ? 'volume-high' : 'phone-portrait-outline'}
                  size={26}
                  color="#faf5ff"
                />
                <Text style={styles.roundText}>{speakerOn ? 'Speaker' : 'Earpiece'}</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.hangup} onPress={() => void hangup()} activeOpacity={0.88}>
              <LinearGradient
                colors={['#9d174d', '#be185d', '#db2777']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.hangupGrad}
              >
                <Text style={styles.hangupText}>
                  {receiverAvailabilitySession && receiverSessionPhase === 'incoming'
                    ? 'Decline'
                    : user?.role === 'caller' && outgoingCallerPhase === 'ringing'
                      ? 'Cancel'
                      : 'Disconnect'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </sdk.StreamCall>
      </sdk.StreamVideo>
    </View>
    );
  }

  return (
    <>
      {screenBody}
      {ratingModal}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0014' },
  overlay: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 20,
    backgroundColor: 'rgba(10, 0, 20, 0.35)',
  },
  statusPill: {
    backgroundColor: 'rgba(124, 58, 237, 0.95)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 7,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(233, 213, 255, 0.45)',
  },
  statusText: { color: '#faf5ff', fontSize: 12, fontWeight: '800' },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 22,
    marginTop: 6,
  },
  avatarCol: {
    alignItems: 'center',
    maxWidth: 150,
  },
  avatarRingHost: {
    width: 124,
    height: 124,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarCaption: {
    marginTop: 8,
    color: '#ede9fe',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  avatarWrap: {
    width: 102,
    height: 102,
    borderRadius: 51,
    padding: 5,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(196, 181, 253, 0.55)',
  },
  avatar: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: '#1e1b4b',
    borderWidth: 2,
    borderColor: 'rgba(250,245,255,0.35)',
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#e9d5ff',
    fontSize: 30,
    fontWeight: '900',
  },
  peerName: { marginTop: 14, color: '#faf5ff', fontSize: 28, fontWeight: '900' },
  durationLabel: { marginTop: 20, color: '#c4b5fd', fontSize: 13, fontWeight: '700' },
  durationValue: { marginTop: 4, color: '#f5f3ff', fontSize: 46, fontWeight: '900' },
  earningCard: {
    marginTop: 14,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 28,
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(233, 213, 255, 0.35)',
  },
  earningTitle: { color: '#faf5ff', fontSize: 12, fontWeight: '700' },
  earningValue: { color: '#fff', fontSize: 34, fontWeight: '900' },
  earningSub: { color: 'rgba(245,243,255,0.85)', fontSize: 10, marginTop: 2, fontWeight: '700' },
  controls: { flexDirection: 'row', gap: 18, marginTop: 44 },
  roundBtn: {
    width: 78,
    minHeight: 78,
    borderRadius: 39,
    backgroundColor: 'rgba(91, 33, 182, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(196, 181, 253, 0.35)',
  },
  roundBtnActive: {
    backgroundColor: 'rgba(124, 58, 237, 0.85)',
    borderColor: 'rgba(233, 213, 255, 0.65)',
  },
  roundText: { color: '#faf5ff', fontSize: 10, fontWeight: '800', marginTop: 4 },
  hangup: {
    marginTop: 26,
    borderRadius: 14,
    minWidth: 200,
    overflow: 'hidden',
    alignSelf: 'center',
  },
  hangupGrad: {
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 24,
  },
  hangupText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  avatarEmptyPeer: { backgroundColor: 'rgba(255,255,255,0.12)' },
  waitingHint: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
    marginBottom: 8,
    textAlign: 'center',
  },
  incomingActions: {
    flexDirection: 'row',
    gap: 22,
    marginTop: 8,
    marginBottom: 12,
  },
  incomingActionBtn: {
    width: 74,
    height: 74,
    borderRadius: 37,
    alignItems: 'center',
    justifyContent: 'center',
  },
  incomingRejectBtn: { backgroundColor: '#ff3048' },
  incomingAcceptBtn: { backgroundColor: '#2ad07f' },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0a0014',
    paddingHorizontal: 20,
    gap: 12,
  },
  loadingText: { color: '#e9d5ff', fontSize: 15, textAlign: 'center', fontWeight: '600' },
  preJoinBackBtn: {
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 12,
    backgroundColor: 'rgba(124, 58, 237, 0.45)',
    borderWidth: 1,
    borderColor: 'rgba(196, 181, 253, 0.5)',
  },
  preJoinBackBtnText: { color: '#faf5ff', fontSize: 15, fontWeight: '700' },
  countdownCard: {
    marginTop: 12,
    backgroundColor: 'rgba(30, 27, 75, 0.88)',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.35)',
  },
  countdownTitle: { color: '#c4b5fd', fontSize: 11, fontWeight: '700' },
  countdownValue: { color: '#faf5ff', fontSize: 28, fontWeight: '900', marginTop: 2 },
  remainingTalkCompact: {
    marginTop: 4,
    marginBottom: 0,
    color: '#c4b5fd',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    opacity: 0.92,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(46, 16, 101, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  peerNameCentered: {
    textAlign: 'center',
    width: '100%',
  },
  ratingCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 18,
    backgroundColor: '#faf5ff',
    padding: 22,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd6fe',
  },
  ratingTitle: { fontSize: 20, fontWeight: '900', color: '#3b0764' },
  ratingSubtitle: { marginTop: 6, fontSize: 13, color: '#6d28d9', fontWeight: '600' },
  starRow: { marginTop: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  starHit: {
    paddingVertical: 6,
    paddingHorizontal: 4,
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratingSubmitOuter: {
    marginTop: 20,
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
  },
  ratingSubmitGrad: {
    alignItems: 'center',
    paddingVertical: 14,
  },
  ratingSubmitBtnOff: { opacity: 0.45 },
  ratingSubmitText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  ratingSkipBtn: { marginTop: 10, paddingVertical: 8, paddingHorizontal: 12 },
  ratingSkipText: { color: '#6d28d9', fontSize: 14, fontWeight: '700' },
});
