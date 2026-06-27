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
  ScrollView,
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
import { ensureIncomingRingtonePlaying, startOutboundRingtoneLoop } from '../../utils/callSounds';
import {
  applyVoiceCallOutputRoute,
  isBluetoothVoiceOutputAvailable,
  releaseVoiceCallOutputRoute,
} from '../../utils/voiceCallAudioRoute';
import { profileImageUrlForStreamOrNetwork, resolveProfileImageSource } from '../../utils/avatarSource';
import { AvatarSoundWaveRings } from '../../components/call/AvatarVoiceWaves';
import { useCallScreenCaptureProtection } from '../../utils/callScreenCaptureProtection';
import { AndroidCellularHoldMonitor } from '../../components/call/AndroidCellularHoldMonitor';
import InCallTalktimeRechargeModal from '../../components/call/InCallTalktimeRechargeModal';
import type { StreamMicControl } from '../../components/call/StreamCallAvatarExtras';
import {
  clearVoiceSessionStartInflight,
  getVoiceSessionStartPromise,
} from '../../utils/voiceCallSessionStart';
import {
  callDiag,
  categorizeEndSource,
  ensureCallDiagnosticsAppStateHook,
  isCallHoldGuardActive,
  logEndingRefChange,
  setGsmInterruptPending,
  updateCallDiagnosticsLiveState,
  setCallDiagnosticsContext,
  registerTalkActiveReader,
} from '../../utils/callDiagnostics';
import {
  getSamsungCallCompatProfile,
  isSamsungOneUi6OrNewer,
  SAMSUNG_GSM_TEARDOWN_TIMEOUT_MS,
  STUCK_CALL_END_RESET_MS,
} from '../../utils/samsungCallCompat';
import {
  ANDROID_STREAM_DISCONNECTION_TIMEOUT_SEC,
  getCallSocketIoOptions,
} from '../../utils/androidCallNetwork';
import {
  activateAndroidCallResilience,
  deactivateAndroidCallResilience,
} from '../../utils/androidCallResilience';
import {
  registerCallKeepaliveSocket,
  setCallKeepaliveActive,
  registerCallHoldKeepaliveReader,
  teardownCallKeepalive,
} from '../../utils/callActiveKeepalive';
import {
  attachSocketIoProbe,
  attachStreamCallProbe,
  detachSocketIoProbe,
  detachStreamCallProbe,
  startGsmDisconnectProbe,
  stopGsmDisconnectProbe,
} from '../../utils/gsmDisconnectProbe';
import {
  instrumentedEmitCallEnd,
  instrumentedSessionEnd,
  instrumentedSessionSync,
} from '../../utils/callEndInstrumentation';
import { captureCallTrace } from '../../utils/callDiagnosticsTrace';

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
  StreamRemotePeerLeftBridge: React.ComponentType<{
    onRemotePeerLeft: (reason: 'local_left' | 'remote_empty') => void;
    onLocalGsmSuspect?: () => void;
    onPeerGsmSuspect?: () => void;
  }>;
  StreamMicControlBridge: React.ComponentType<{
    controlRef: React.MutableRefObject<StreamMicControl | null>;
    onMutedChange: (muted: boolean) => void;
    onUserMuteToggled?: (muted: boolean) => void;
    userChosenMuteRef: React.MutableRefObject<boolean>;
    forceMicOff?: boolean;
  }>;
  StreamHoldAudioBridge: React.ComponentType<{
    peerOnHold?: boolean;
    systemOnHold?: boolean;
  }>;
  StreamLocalHoldMicBridge: React.ComponentType<{
    systemOnHold?: boolean;
    peerOnHold?: boolean;
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

type PostCallDetails = {
  durationSec: number;
  costInr: number;
  walletInr: number;
};

/** Must match backend `VOICE_CALL_ISSUE_TAGS`. */
const POST_CALL_ISSUE_TAGS = [
  'Background noise',
  'Not Talking',
  'Asked me to end Call',
  'Wrong Gender',
  'Call Disconnected',
] as const;

function formatCallDurationShort(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m <= 0) return `${rem}s`;
  return `${m}m ${String(rem).padStart(2, '0')}s`;
}

async function applyVoiceCallAudioMode(speaker: boolean, bluetooth = false): Promise<void> {
  await applyVoiceCallOutputRoute(
    bluetooth ? 'bluetooth' : speaker ? 'speaker' : 'earpiece'
  );
}

async function resetVoiceCallAudioMode(): Promise<void> {
  releaseVoiceCallOutputRoute();
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
    setTalkStartedHandler,
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
  const [bluetoothOn, setBluetoothOn] = useState(false);
  const [bluetoothAvailable, setBluetoothAvailable] = useState(false);
  const [liveSettledAmountInr, setLiveSettledAmountInr] = useState(0);
  /** Caller wallet from server (both roles) — stays in sync as the call is billed. */
  const [sessionCallerWalletInr, setSessionCallerWalletInr] = useState<number | null>(null);
  const [talktimeRechargeOpen, setTalktimeRechargeOpen] = useState(false);
  const [sessionCallRatePerMinute, setSessionCallRatePerMinute] = useState<number | null>(null);
  const [ratingOpen, setRatingOpen] = useState(false);
  const [selectedRating, setSelectedRating] = useState(0);
  const [submittingRating, setSubmittingRating] = useState(false);
  const [postCallOpen, setPostCallOpen] = useState(false);
  const [postCallDetails, setPostCallDetails] = useState<PostCallDetails | null>(null);
  const [selectedIssueTags, setSelectedIssueTags] = useState<Set<string>>(() => new Set());
  const [submittingIssue, setSubmittingIssue] = useState(false);
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
  const endingStartedAtRef = useRef(0);
  const setEnding = useCallback((next: boolean, reason: string, details?: Record<string, unknown>) => {
    endingRef.current = next;
    logEndingRefChange(next, reason, details);
  }, []);
  const deferredEndDuringGsmRef = useRef<{ endedCallId: string; source: string } | null>(null);
  const speakerOnRef = useRef(true);
  const bluetoothOnRef = useRef(false);
  const endedSessionRef = useRef(false);
  const endedSessionResultRef = useRef<{ canRate: boolean; durationSec: number } | null>(null);
  const endSessionPromiseRef = useRef<Promise<{ canRate: boolean; durationSec: number } | null> | null>(null);
  const elapsedSecRef = useRef(0);
  const talkActiveRef = useRef(false);
  /** Server `talkStartedAt` — single source of truth so both sides show the same elapsed time. */
  const talkAnchorMsRef = useRef<number | null>(null);
  /** Talk-time budget (sec) snapshotted at connect — avoids wallet sync jitter on the countdown. */
  const remainingTalkBudgetSecRef = useRef<number | null>(null);
  const sessionCallerWalletInrRef = useRef<number | null>(null);
  const sessionCallRatePerMinuteRef = useRef<number | null>(null);
  const callerWalletInrRef = useRef(0);
  const syncTalkBurstInFlightRef = useRef(false);
  const callIdRef = useRef(getVoiceBootstrap(callParams)?.callId ?? '');
  useEffect(() => {
    const id = getVoiceBootstrap(callParams)?.callId;
    if (id) callIdRef.current = id;
  }, [callParams]);

  useEffect(() => {
    ensureCallDiagnosticsAppStateHook();
    if (Platform.OS === 'android') {
      callDiag.info('samsung_call_compat', getSamsungCallCompatProfile());
    }
    const bootId = getVoiceBootstrap(callParams)?.callId ?? callIdRef.current;
    setCallDiagnosticsContext(bootId || null, user?.role ?? null);
    if (bootId) {
      callDiag.callCreated(bootId, { phase: outgoingCallerPhase ?? 'active' });
    }
    if (Platform.OS === 'android') {
      void Promise.all([
        import('../../utils/incomingCallNativeBridge'),
        import('../../utils/androidCellularCallHold'),
      ]).then(([bridge, cellular]) => {
        callDiag.info('cellular_hold_native_probe', {
          nativeAvailable: bridge.isIncomingCallNativeAvailable(),
        });
        void cellular.ensureAndroidReadPhoneStatePermission().then((granted) => {
          callDiag.info('cellular_hold_permission_on_mount', { granted });
          if (granted) {
            cellular.refreshAndroidCellularCallHoldWatch();
          }
        });
      });
    }
    if (outgoingCallerPhase === 'ringing') {
      callDiag.callRinging({ role: user?.role });
    }
  }, [callParams, outgoingCallerPhase, user?.role]);

  useEffect(() => {
    updateCallDiagnosticsLiveState({
      systemCallHold,
      peerCallHold,
      talkActive,
      ready,
      ending: endingRef.current,
      appInBackground,
    });
  }, [systemCallHold, peerCallHold, talkActive, ready, appInBackground]);

  useEffect(() => {
    if (Platform.OS !== 'android' || !ready) {
      registerCallHoldKeepaliveReader(null);
      registerTalkActiveReader(null);
      setCallKeepaliveActive('', false);
      stopGsmDisconnectProbe();
      return;
    }
    registerCallHoldKeepaliveReader(() => systemCallHoldRef.current);
    registerTalkActiveReader(() => talkActiveRef.current);
    const callId = callIdRef.current.trim();
    if (callId) {
      startGsmDisconnectProbe(callId);
    }
    setCallKeepaliveActive(callId, callId.length > 0);
    return () => {
      registerCallHoldKeepaliveReader(null);
      registerTalkActiveReader(null);
      setCallKeepaliveActive('', false);
      stopGsmDisconnectProbe();
    };
  }, [ready]);

  useEffect(() => {
    if (Platform.OS !== 'android' || !ready) return;
    const callId = callIdRef.current.trim();
    if (!callId) return;
    void activateAndroidCallResilience(callId);
    return () => {
      deactivateAndroidCallResilience();
    };
  }, [ready]);
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

  const [callScreenFocused, setCallScreenFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setCallScreenFocused(true);
      return () => setCallScreenFocused(false);
    }, [])
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
  const liveTalkElapsedSec =
    talkActive && talkAnchorMsRef.current != null
      ? Math.max(0, Math.floor((Date.now() - talkAnchorMsRef.current) / 1000))
      : elapsedSec;
  const remainingTalkBudgetSec = remainingTalkBudgetSecRef.current ?? initialRemainingTalkSec;
  const remainingTalkSec = Math.max(0, remainingTalkBudgetSec - liveTalkElapsedSec);
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
  const lastPeerHoldClearAtRef = useRef(0);
  const recoverAfterPeerHoldClearRef = useRef<() => Promise<void>>(async () => {});
  const gsmHoldMutedPeerRef = useRef(false);
  const receiverAvailabilitySessionRef = useRef(receiverAvailabilitySession);
  const userAvailableRef = useRef(Boolean(user?.isAvailable));
  useEffect(() => {
    elapsedSecRef.current = elapsedSec;
  }, [elapsedSec]);

  useEffect(() => {
    sessionCallerWalletInrRef.current = sessionCallerWalletInr;
  }, [sessionCallerWalletInr]);

  useEffect(() => {
    sessionCallRatePerMinuteRef.current = sessionCallRatePerMinute;
  }, [sessionCallRatePerMinute]);

  useEffect(() => {
    callerWalletInrRef.current = callerWalletInr;
  }, [callerWalletInr]);

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
    updateCallDiagnosticsLiveState({ peerCallHold: onHold });
    if (onHold) {
      setGsmInterruptPending(true, 'peer_hold_remote');
      callDiag.holdStarted('remote_socket');
      return;
    }
    lastPeerHoldClearAtRef.current = Date.now();
    setPeerCallMuted(false);
    callDiag.holdEnded('remote_socket');
    if (!systemCallHoldRef.current) {
      setGsmInterruptPending(false, 'peer_hold_cleared');
    }
    void recoverAfterPeerHoldClearRef.current();
  }, []);

  const applyPeerMuteFromRemote = useCallback((muted: boolean) => {
    // During peer hold, accept mute-on for audio silencing only — UI still shows hold badge.
    if (peerCallHoldRef.current && !muted) return;
    setPeerCallMuted(muted);
  }, []);
  const applyPeerHoldFromRemoteRef = useRef(applyPeerHoldFromRemote);
  applyPeerHoldFromRemoteRef.current = applyPeerHoldFromRemote;

  const applyPeerMuteFromRemoteRef = useRef(applyPeerMuteFromRemote);
  applyPeerMuteFromRemoteRef.current = applyPeerMuteFromRemote;

  const emitPeerCallMute = useCallback(
    (muted: boolean) => {
      const callId = callIdRef.current.trim();
      if (!callId) return;
      if (
        endingRef.current &&
        muted &&
        !systemCallHoldRef.current &&
        !isCallHoldGuardActive()
      ) {
        return;
      }
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
      if (!callId) {
        callDiag.info('emit_peer_hold_skipped', { reason: 'no_call_id', onHold });
        return;
      }
      if (
        endingRef.current &&
        onHold &&
        !systemCallHoldRef.current &&
        !isCallHoldGuardActive()
      ) {
        callDiag.info('emit_peer_hold_skipped', { reason: 'ending_ref', onHold, callId });
        return;
      }
      callDiag.info('emit_peer_hold', { onHold, callId });
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
      callDiag.info('apply_system_call_hold', {
        onHold,
        previous: systemCallHoldRef.current,
        ending: endingRef.current,
        talkActive: talkActiveRef.current,
      });
      if (onHold && systemCallHoldRef.current === onHold) {
        setGsmInterruptPending(true, 'system_hold_reannounce');
        emitPeerCallHold(true);
        if (!userChosenMuteRef.current) {
          holdForcedMicOffRef.current = true;
          gsmHoldMutedPeerRef.current = true;
          void streamMicControlRef.current?.setEnabled(false).catch(() => {});
          emitPeerCallMute(true);
        }
        return;
      }
      if (systemCallHoldRef.current === onHold) return;
      systemCallHoldRef.current = onHold;
      setSystemCallHold(onHold);
      setGsmInterruptPending(onHold);
      updateCallDiagnosticsLiveState({ systemCallHold: onHold });
      emitPeerCallHold(onHold);
      if (onHold) {
        if (!userChosenMuteRef.current) {
          holdForcedMicOffRef.current = true;
          gsmHoldMutedPeerRef.current = true;
          void streamMicControlRef.current?.setEnabled(false).catch(() => {});
          emitPeerCallMute(true);
        }
      } else if (gsmHoldMutedPeerRef.current) {
        gsmHoldMutedPeerRef.current = false;
        if (!userChosenMuteRef.current) {
          emitPeerCallMute(false);
        }
      }
      callDiag.info(onHold ? 'system_hold_applied' : 'system_hold_cleared', {
        samsung: isSamsungOneUi6OrNewer(),
      });
    },
    [emitPeerCallHold, emitPeerCallMute]
  );
  applySystemCallHoldRef.current = applySystemCallHold;

  useEffect(() => {
    if (!talkActive || Platform.OS !== 'android') return;
    void (async () => {
      const { ensureAndroidReadPhoneStatePermission, refreshAndroidCellularCallHoldWatch } =
        await import('../../utils/androidCellularCallHold');
      const granted = await ensureAndroidReadPhoneStatePermission();
      callDiag.info('talk_active_phone_permission', { granted });
      if (granted) {
        refreshAndroidCellularCallHoldWatch();
      }
    })();
  }, [talkActive]);

  useEffect(() => {
    systemCallHoldRef.current = systemCallHold;
  }, [systemCallHold]);

  // Re-broadcast hold + mute while on a cellular call so the peer catches missed socket events.
  useEffect(() => {
    if (!systemCallHold) return;
    const announceHold = (): void => {
      if (!systemCallHoldRef.current) return;
      if (endingRef.current && !isCallHoldGuardActive()) return;
      emitPeerCallHold(true);
      if (gsmHoldMutedPeerRef.current) {
        emitPeerCallMute(true);
      }
    };
    announceHold();
    const intervalId = setInterval(announceHold, 4000);
    return () => clearInterval(intervalId);
  }, [systemCallHold, emitPeerCallHold, emitPeerCallMute]);

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
      if (interrupted) {
        callDiag.audioInterruption({ appState: nextState, ready: readyRef.current });
      } else if (!endingRef.current && readyRef.current) {
        void applyVoiceCallAudioMode(speakerOn, bluetoothOn).catch((e) => {
          callDiag.error('audio_mode_restore_failed', {
            message: e instanceof Error ? e.message : String(e),
          });
        });
      }
    });
    return () => sub.remove();
  }, [speakerOn, bluetoothOn]);

  useEffect(() => {
    readyRef.current = ready;
  }, [ready]);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    speakerOnRef.current = speakerOn;
  }, [speakerOn]);

  useEffect(() => {
    bluetoothOnRef.current = bluetoothOn;
  }, [bluetoothOn]);

  useEffect(() => {
    if (!ready) return;
    void isBluetoothVoiceOutputAvailable().then(setBluetoothAvailable);
  }, [ready]);

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
    if (talkActiveRef.current) return;
    if (
      typeof payload.callerWalletBalanceInr === 'number' &&
      Number.isFinite(payload.callerWalletBalanceInr)
    ) {
      const nextWallet = Math.max(0, payload.callerWalletBalanceInr);
      setSessionCallerWalletInr(nextWallet);
      sessionCallerWalletInrRef.current = nextWallet;
    }
    if (typeof payload.callRatePerMinute === 'number' && Number.isFinite(payload.callRatePerMinute)) {
      const nextRate = Math.max(0, payload.callRatePerMinute);
      setSessionCallRatePerMinute(nextRate);
      sessionCallRatePerMinuteRef.current = nextRate;
    }
    snapRemainingTalkBudgetRef.current();
  };

  const snapRemainingTalkBudgetRef = useRef<() => void>(() => {});
  snapRemainingTalkBudgetRef.current = () => {
    const wallet =
      sessionCallerWalletInrRef.current ??
      (userRoleRef.current === 'caller' ? callerWalletInrRef.current : 0);
    const rate =
      sessionCallRatePerMinuteRef.current ?? getReceiverChargeRatePerMinute(callParams);
    if (rate > 0 && wallet >= 0) {
      remainingTalkBudgetSecRef.current = Math.floor((wallet / rate) * 60);
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
    const wasTalkActive = talkActiveRef.current;
    talkAnchorMsRef.current = anchorMs;
    talkActiveRef.current = true;
    setTalkActive(true);
    if (!wasTalkActive) {
      snapRemainingTalkBudgetRef.current();
    }
    updateElapsedFromAnchor();
    return true;
  };
  const applyTalkTimingFromServerRef = useRef(applyTalkTimingFromServer);
  applyTalkTimingFromServerRef.current = applyTalkTimingFromServer;

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

  const addTalktimeButtonEl =
    user?.role === 'caller' && talkActive && ready ? (
      <TouchableOpacity
        style={styles.addTalktimeBtn}
        onPress={() => setTalktimeRechargeOpen(true)}
        activeOpacity={0.88}
      >
        <Ionicons name="wallet-outline" size={16} color="#faf5ff" />
        <Text style={styles.addTalktimeBtnText}>Add talktime</Text>
      </TouchableOpacity>
    ) : null;

  const ensureSessionEnded = async (): Promise<{ canRate: boolean; durationSec: number } | null> => {
    if (endedSessionRef.current) return endedSessionResultRef.current;
    if (endSessionPromiseRef.current) return endSessionPromiseRef.current;
    endSessionPromiseRef.current = (async () => {
      try {
        const { data } = await instrumentedSessionEnd(callIdRef.current, 'ensure_session_ended');
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
        const costInr =
          typeof data.settledAmountInr === 'number' && Number.isFinite(data.settledAmountInr)
            ? Math.max(0, data.settledAmountInr)
            : 0;
        const walletFromApi =
          typeof data.callerWalletBalanceInr === 'number' && Number.isFinite(data.callerWalletBalanceInr)
            ? Math.max(0, data.callerWalletBalanceInr)
            : null;
        setPostCallDetails({
          durationSec,
          costInr,
          walletInr:
            walletFromApi ??
            sessionCallerWalletInrRef.current ??
            (userRoleRef.current === 'caller' ? callerWalletInrRef.current : 0),
        });
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

  const openPostCallSummary = () => {
    setSelectedIssueTags(new Set());
    setPostCallOpen(true);
  };

  const proceedAfterCallerRating = () => {
    setRatingOpen(false);
    if (userRoleRef.current !== 'caller') {
      stopQueueAndExit();
      return;
    }
    openPostCallSummary();
  };

  const closePostCallAndExit = () => {
    setPostCallOpen(false);
    stopQueueAndExit();
  };

  const toggleIssueTag = (tag: string) => {
    setSelectedIssueTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  const callerMeetsRatingThreshold = (serverDurationSec?: number): boolean => {
    const duration = Math.max(elapsedSecRef.current, serverDurationSec ?? 0);
    return duration >= MIN_RATING_SECONDS;
  };

  const shouldShowCallerRating = async (): Promise<boolean> => {
    if (callerCanRateByDurationRef.current) return true;
    const end = await ensureSessionEnded();
    return callerMeetsRatingThreshold(end?.durationSec);
  };

  const leaveMediaWithTimeout = async (timeoutMs: number): Promise<void> => {
    await Promise.race([
      leaveMedia(),
      new Promise<void>((resolve) => {
        setTimeout(resolve, timeoutMs);
      }),
    ]);
  };

  const finishCallerCallEnd = async (): Promise<void> => {
    const startedAt = Date.now();
    const timeoutMs =
      systemCallHoldRef.current || isSamsungOneUi6OrNewer()
        ? SAMSUNG_GSM_TEARDOWN_TIMEOUT_MS
        : 8_000;
    await leaveMediaWithTimeout(timeoutMs);
    const durationMs = Date.now() - startedAt;
    if (durationMs >= timeoutMs - 100) {
      callDiag.failure('leave_media_timeout', { timeoutMs, durationMs });
    }
    await ensureSessionEnded();
    if (await shouldShowCallerRating()) {
      callDiag.hangupDisconnectComplete({
        path: 'caller_rating_prompt',
        durationMs,
        endCategory: 'manual_hangup',
      });
      callDiag.finalizeCallOutcome('user_hangup', { path: 'caller_rating_prompt', durationMs });
      showRatingPrompt();
      return;
    }
    callDiag.hangupDisconnectComplete({
      path: 'caller_exit',
      durationMs,
      endCategory: 'manual_hangup',
    });
    callDiag.finalizeCallOutcome('user_hangup', { path: 'caller_exit', durationMs });
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
    setEnding(true, 'teardown_from_remote_peer_end', { role: userRoleRef.current });
    endingStartedAtRef.current = Date.now();
    talkActiveRef.current = false;
    setTalkActive(false);
    void leaveMediaRef.current();
    void ensureSessionEndedRef.current();
    if (receiverAvailabilitySessionRef.current && userAvailableRef.current) {
      resetReceiverToWaitingRef.current();
      return;
    }
    exitCallScreenRef.current();
  }, [setEnding]);
  const teardownFromRemotePeerEndRef = useRef(teardownFromRemotePeerEnd);
  teardownFromRemotePeerEndRef.current = teardownFromRemotePeerEnd;

  const emitCallEnd = (reason = 'voice_screen_emit_call_end'): void => {
    const callId = callIdRef.current.trim();
    if (!callId) return;
    emitCallEndSignal(callId);
    const voiceSocket = signalSocketRef.current;
    if (voiceSocket?.connected) {
      instrumentedEmitCallEnd(voiceSocket, callId, reason, 'voice_duplicate_socket');
    }
  };

  const shouldDeferEndDuringGsm = useCallback((source: string): boolean => {
    if (source === 'user_hangup') return false;
    // Socket + server sync are authoritative when the peer hung up.
    if (source.startsWith('socket_') || source === 'session_sync_completed') return false;
    if (systemCallHoldRef.current && source.startsWith('stream_')) return true;
    if (peerCallHoldRef.current && source.startsWith('stream_')) return true;
    if (isCallHoldGuardActive() && source.startsWith('stream_')) return true;
    return false;
  }, []);

  const handlePeerCallEnded = useCallback((endedCallId: string, source = 'unknown'): void => {
    if (!matchesActiveCallIdRef.current(endedCallId)) return;
    callDiag.stateMachineDump('handle_peer_call_ended_enter', {
      source,
      endedCallId,
      endCategory: categorizeEndSource(source),
      trace: captureCallTrace(2),
    });
    if (shouldDeferEndDuringGsm(source)) {
      deferredEndDuringGsmRef.current = { endedCallId, source };
      callDiag.callEndSuppressed(source, {
        reason: 'deferred_during_gsm',
        deferredDuringGsm: true,
        systemCallHold: systemCallHoldRef.current,
        peerCallHold: peerCallHoldRef.current,
        endCategory: categorizeEndSource(source),
      });
      callDiag.stateMismatch(
        'remote_ended_during_local_gsm',
        'Remote/signal reported call end while this device was on GSM hold — end deferred',
        { source, endedCallId, systemCallHold: systemCallHoldRef.current }
      );
      return;
    }
    const suppressStreamEndWhilePeerOnHold =
      peerCallHoldRef.current && source.startsWith('stream_');
    if (suppressStreamEndWhilePeerOnHold) {
      callDiag.callEndSuppressed(source, {
        reason: 'peer_on_hold',
        peerOnHold: true,
        endCategory: categorizeEndSource(source),
      });
      return;
    }
    if (peerCallHoldRef.current) {
      peerCallHoldRef.current = false;
      setPeerCallHold(false);
      peerHoldPausedMicRef.current = false;
    }
    if (systemCallHoldRef.current) {
      systemCallHoldRef.current = false;
      setSystemCallHold(false);
      setGsmInterruptPending(false, 'peer_ended');
      emitPeerCallHold(false);
    }
    const role = userRoleRef.current;
    if (role === 'caller' && !endingRef.current) {
      setEnding(true, 'handle_peer_call_ended_caller', { source, endedCallId });
      endingStartedAtRef.current = Date.now();
    }
    callDiag.callEnded(source, {
      endedCallId,
      role: userRoleRef.current,
      endCategory: categorizeEndSource(source),
    });
    if (role === 'caller') {
      talkActiveRef.current = false;
      setTalkActive(false);
      void finishCallerCallEndRef.current();
      return;
    }
    if (role === 'receiver') {
      void teardownFromRemotePeerEndRef.current();
    }
  }, [emitPeerCallHold, shouldDeferEndDuringGsm]);
  const handlePeerCallEndedRef = useRef(handlePeerCallEnded);
  handlePeerCallEndedRef.current = handlePeerCallEnded;
  const syncTalkTimingOnceRef = useRef<() => Promise<boolean>>(async () => false);
  const checkPeerEndedViaServer = useCallback(async (): Promise<void> => {
    const callId = callIdRef.current.trim();
    if (!callId || endingRef.current) return;
    const sync = await instrumentedSessionSync(callId, 'check_peer_ended_via_server', {
      light: true,
    });
    if (sync.completed) {
      handlePeerCallEndedRef.current(callId, 'session_sync_completed');
      return;
    }
    void syncTalkTimingOnceRef.current();
  }, []);
  const checkPeerEndedViaServerRef = useRef(checkPeerEndedViaServer);
  checkPeerEndedViaServerRef.current = checkPeerEndedViaServer;

  const resetReceiverToWaiting = () => {
    setEnding(false, 'reset_receiver_to_waiting');
    endedSessionRef.current = false;
    endedSessionResultRef.current = null;
    callIdRef.current = '';
    setReady(false);
    setClient(null);
    setCall(null);
    setTalkActive(false);
    talkActiveRef.current = false;
    talkAnchorMsRef.current = null;
    remainingTalkBudgetSecRef.current = null;
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
      callDiag.info('remote_call_ended_handler_main_socket', {
        endedCallId,
        note: 'Originated from CallSignalContext call:ended — see socket_receive on this device',
      });
      handlePeerCallEndedRef.current(endedCallId, 'socket_call_ended_main');
    });
    setActiveCallRecoveryHandler(() => {
      void checkPeerEndedViaServerRef.current();
    });
    setTalkStartedHandler((callId, talkStartedAt) => {
      if (!matchesActiveCallIdRef.current(callId)) return;
      callDiag.info('socket_talk_started', { callId, talkStartedAt });
      applyTalkTimingFromServerRef.current({ talkStartedAt });
    });
    return () => {
      setRemoteCallEndedHandler(null);
      setActiveCallRecoveryHandler(null);
      setTalkStartedHandler(null);
    };
  }, [user?.role, setRemoteCallEndedHandler, setActiveCallRecoveryHandler, setTalkStartedHandler]);

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
      void ensureIncomingRingtonePlaying();
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
        callDiag.callAccepted({ callId: incomingReq.callId });
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
        // Warm-up is best-effort; voice audio mode waits until join after accept.
      }
    })();
  }, [route.params, outgoingCallerPhase]);

  const ringingBootstrapCallId =
    outgoingCallerPhase === 'ringing'
      ? getVoiceBootstrap(route.params as VoiceCallScreenParams)?.callId?.trim() ?? ''
      : '';

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
  }, [user?.role, outgoingCallerPhase, ringingBootstrapCallId]);

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

        const nextCall = nextClient.call(boot.callType, boot.callId) as ReturnType<
          typeof nextClient.call
        > & { setDisconnectionTimeout?: (timeoutSeconds: number) => void };
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

        if (
          Platform.OS === 'android' &&
          typeof nextCall.setDisconnectionTimeout === 'function'
        ) {
          nextCall.setDisconnectionTimeout(ANDROID_STREAM_DISCONNECTION_TIMEOUT_SEC);
        }

        attachStreamCallProbe(nextCall, nextClient);

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
        ...getCallSocketIoOptions(),
      });
      signalSocketRef.current = socket;
      registerCallKeepaliveSocket('voice_duplicate', socket);
      attachSocketIoProbe(socket, 'voice_duplicate');
      const onVoiceSocketConnect = (): void => {
        callDiag.connectionRestored({ socket: 'voice_duplicate' });
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
      socket.on('disconnect', () => {
        callDiag.connectionLost({ socket: 'voice_duplicate' });
      });
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
      socket.on('call:ended', (payload: { callId?: string; fromType?: 'u' | 'r'; fromId?: string }) => {
        const myType = userRoleRef.current === 'caller' ? 'u' : 'r';
        if (payload?.fromType === myType) return;
        const id = typeof payload?.callId === 'string' ? payload.callId.trim() : '';
        if (!id) return;
        callDiag.socketReceive(
          'call:ended',
          {
            callId: id,
            fromType: payload?.fromType,
            fromId: payload?.fromId,
          },
          'voice_duplicate_socket'
        );
        callDiag.info('voice_socket_call_ended', {
          callId: id,
          fromType: payload?.fromType,
          fromId: payload?.fromId,
        });
        handlePeerCallEndedRef.current(id, 'socket_call_ended');
      });
      // Duplicate socket for hold/mute/end — CallSignalContext is primary; this improves delivery on flaky devices.
    })();

    return () => {
      cancelled = true;
      registerCallKeepaliveSocket('voice_duplicate', null);
      detachSocketIoProbe('voice_duplicate');
      detachStreamCallProbe();
      teardownCallKeepalive();
      deactivateAndroidCallResilience();
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
    const light = talkActiveRef.current;
    try {
      const sync = await instrumentedSessionSync(
        callIdRef.current,
        light ? 'sync_talk_timing_once_light' : 'sync_talk_timing_once_full',
        { light }
      );
      const data = sync.data;
      if (!data?.ok) return false;
      if (sync.completed && !endingRef.current) {
        handlePeerCallEndedRef.current(callIdRef.current, 'session_sync_completed');
        return false;
      }
      const started = applyTalkTimingFromServer(data);
      if (!talkActiveRef.current) {
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

  const handleInCallRechargeSuccess = useCallback(
    (newWalletBalanceInr: number) => {
      const nextWallet = Math.max(0, newWalletBalanceInr);
      setSessionCallerWalletInr(nextWallet);
      sessionCallerWalletInrRef.current = nextWallet;
      const rate =
        sessionCallRatePerMinuteRef.current ?? getReceiverChargeRatePerMinute(callParams);
      if (rate > 0) {
        const anchorMs = talkAnchorMsRef.current;
        const elapsed =
          anchorMs != null && Number.isFinite(anchorMs)
            ? Math.max(0, Math.floor((Date.now() - anchorMs) / 1000))
            : elapsedSecRef.current;
        remainingTalkBudgetSecRef.current = Math.floor((nextWallet / rate) * 60) + elapsed;
      }
      void refreshUser();
      void syncTalkTimingOnceRef.current();
    },
    [callParams, refreshUser]
  );

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

  const kickTalkTimerSync = useCallback(async (): Promise<void> => {
    if (endingRef.current || talkActiveRef.current) return;
    const boot = getVoiceBootstrap(callParams);
    if (!boot) return;
    clearVoiceSessionStartInflight(boot.callId);
    try {
      const [startData, syncRes] = await Promise.all([
        getVoiceSessionStartPromise(boot.callId, boot.peerAccountId),
        instrumentedSessionSync(boot.callId, 'kick_talk_timer_sync_initial', { light: true }),
      ]);
      applyTalkTimingFromServer(startData);
      if (!talkActiveRef.current && syncRes.data) {
        applyTalkTimingFromServer(syncRes.data);
      }
      applySessionBillingFromServer(startData);
      if (syncRes.data) {
        applySessionBillingFromServer(syncRes.data);
      }
      if (syncRes.completed && !endingRef.current) {
        handlePeerCallEndedRef.current(boot.callId, 'session_sync_completed');
        return;
      }
      if (talkActiveRef.current) return;
    } catch {
      // Burst sync below.
    }
    for (let attempt = 0; attempt < 15 && !talkActiveRef.current && !endingRef.current; attempt += 1) {
      try {
        const sync = await instrumentedSessionSync(boot.callId, 'kick_talk_timer_sync_burst', {
          light: true,
        });
        if (sync.completed && !endingRef.current) {
          handlePeerCallEndedRef.current(boot.callId, 'session_sync_completed');
          return;
        }
        if (sync.data && applyTalkTimingFromServer(sync.data)) {
          applySessionBillingFromServer(sync.data);
          return;
        }
      } catch {
        // retry
      }
      if (attempt < 14) {
        await new Promise((resolve) => setTimeout(resolve, attempt < 4 ? 0 : 30));
      }
    }
  }, [callParams]);
  const kickTalkTimerSyncRef = useRef(kickTalkTimerSync);
  kickTalkTimerSyncRef.current = kickTalkTimerSync;

  useEffect(() => {
    if (!ready || !talkActive) return;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const scheduleNextTick = (): void => {
      if (cancelled) return;
      updateElapsedFromAnchor();
      const anchorMs = talkAnchorMsRef.current;
      const delayMs =
        anchorMs != null && Number.isFinite(anchorMs)
          ? Math.max(25, 1000 - ((Date.now() - anchorMs) % 1000))
          : 1000;
      timeoutId = setTimeout(scheduleNextTick, delayMs);
    };

    updateElapsedFromAnchor();
    scheduleNextTick();

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, [ready, talkActive, updateElapsedFromAnchor]);

  useEffect(() => {
    if (!ready || endingRef.current || talkActiveRef.current) return;
    void syncTalkTimingUntilBothJoined();
  }, [ready, syncTalkTimingUntilBothJoined]);

  useEffect(() => {
    if (!ready || endingRef.current) return;
    const pollMs = appInBackground ? (talkActive ? 1000 : 2000) : talkActive ? 3000 : 50;
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

  const recoverAfterGsmHold = useCallback(async (): Promise<void> => {
    setGsmInterruptPending(false, 'gsm_recovery');
    const pendingEnd = deferredEndDuringGsmRef.current;
    deferredEndDuringGsmRef.current = null;
    callDiag.gsmRecoveryStart({
      samsung: isSamsungOneUi6OrNewer(),
      role: userRoleRef.current,
      pendingEndSource: pendingEnd?.source ?? null,
    });
    let recoveryOk = true;
    try {
      await applyVoiceCallAudioMode(speakerOnRef.current, bluetoothOnRef.current);
      callDiag.success('gsm_audio_mode_restored');
    } catch (e) {
      recoveryOk = false;
      callDiag.error('gsm_audio_restore_failed', {
        message: e instanceof Error ? e.message : String(e),
      });
    }
    if (!userChosenMuteRef.current && !peerCallHoldRef.current && !systemCallHoldRef.current) {
      try {
        await streamMicControlRef.current?.setEnabled(true);
        callDiag.success('gsm_mic_restored');
      } catch (e) {
        recoveryOk = false;
        callDiag.error('gsm_mic_restore_failed', {
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }
    const callId = callIdRef.current.trim();
    if (!callId) {
      callDiag.gsmRecoveryEnd(recoveryOk, { reason: 'no_call_id' });
      return;
    }
    try {
      const sync = await instrumentedSessionSync(callId, 'recover_after_gsm_hold', { light: true });
      if (sync.completed && !endingRef.current) {
        const source = pendingEnd?.source ?? 'session_sync_completed';
        const endedId = pendingEnd?.endedCallId ?? callId;
        callDiag.gsmRecoveryEnd(false, {
          sessionCompleted: true,
          pendingSource: source,
        });
        handlePeerCallEndedRef.current(endedId, source);
        return;
      }
      callDiag.gsmRecoveryEnd(recoveryOk, { sessionStatus: sync.data?.status ?? 'unknown' });
    } catch (e) {
      recoveryOk = false;
      callDiag.gsmRecoveryEnd(false, {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }, []);

  const recoverAfterPeerHoldClear = useCallback(async (): Promise<void> => {
    callDiag.info('peer_hold_recovery_start', { role: userRoleRef.current });
    try {
      await applyVoiceCallAudioMode(speakerOnRef.current, bluetoothOnRef.current);
      callDiag.success('peer_hold_audio_mode_restored');
    } catch (e) {
      callDiag.error('peer_hold_audio_restore_failed', {
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }, []);
  recoverAfterPeerHoldClearRef.current = recoverAfterPeerHoldClear;

  const clearCallHoldStateForTeardown = useCallback(() => {
    if (systemCallHoldRef.current) {
      systemCallHoldRef.current = false;
      setSystemCallHold(false);
      emitPeerCallHold(false);
    }
    if (gsmHoldMutedPeerRef.current) {
      gsmHoldMutedPeerRef.current = false;
      if (!userChosenMuteRef.current) {
        emitPeerCallMute(false);
      }
    }
    if (peerCallHoldRef.current) {
      peerCallHoldRef.current = false;
      setPeerCallHold(false);
      peerHoldPausedMicRef.current = false;
      lastPeerHoldClearAtRef.current = Date.now();
    }
    setGsmInterruptPending(false, 'teardown');
  }, [emitPeerCallHold, emitPeerCallMute]);

  const hangup = async () => {
    const hangupStartedAt = Date.now();
    callDiag.hangupClick({
      role: user?.role,
      receiverSessionPhase,
      outgoingCallerPhase,
      endingRef: endingRef.current,
      systemCallHold: systemCallHoldRef.current,
      peerCallHold: peerCallHoldRef.current,
      talkActive: talkActiveRef.current,
    });

    if (receiverAvailabilitySession && receiverSessionPhase === 'waiting') {
      allowLeaveCallScreenRef.current = true;
      callDiag.hangupDisconnectStart({ path: 'receiver_waiting_exit' });
      exitCallScreen();
      callDiag.hangupDisconnectComplete({
        path: 'receiver_waiting_exit',
        durationMs: Date.now() - hangupStartedAt,
      });
      return;
    }
    if (receiverAvailabilitySession && receiverSessionPhase === 'incoming') {
      callDiag.hangupDisconnectStart({ path: 'receiver_decline_incoming' });
      onRejectIncomingOnSession();
      callDiag.hangupDisconnectComplete({
        path: 'receiver_decline_incoming',
        durationMs: Date.now() - hangupStartedAt,
      });
      return;
    }

    const outboundPhase = getOutgoingCallerPhase(route.params as VoiceCallScreenParams);
    if (user?.role === 'caller' && outboundPhase === 'ringing') {
      if (endingRef.current) {
        callDiag.hangupBlocked('ending_in_progress_ringing_cancel', {
          stuckMs: Date.now() - endingStartedAtRef.current,
        });
        return;
      }
      setEnding(true, 'hangup_cancel_outbound_ringing');
      endingStartedAtRef.current = Date.now();
      callDiag.hangupDisconnectStart({ path: 'caller_cancel_ringing' });
      cancelOutgoingCallInvite();
      exitCallScreen();
      callDiag.hangupDisconnectComplete({
        path: 'caller_cancel_ringing',
        durationMs: Date.now() - hangupStartedAt,
        endCategory: 'manual_hangup',
      });
      return;
    }

    if (endingRef.current) {
      const stuckMs = Date.now() - endingStartedAtRef.current;
      const allowForceReset =
        systemCallHoldRef.current || stuckMs >= STUCK_CALL_END_RESET_MS;
      if (!allowForceReset) {
        callDiag.hangupBlocked('ending_in_progress', {
          stuckMs,
          systemCallHold: systemCallHoldRef.current,
        });
        return;
      }
      setEnding(false, 'force_hangup_reset', { stuckMs, gsmHold: systemCallHoldRef.current });
      deferredEndDuringGsmRef.current = null;
      callDiag.info('force_hangup_reset', {
        stuckMs,
        gsmHold: systemCallHoldRef.current,
      });
    }

    setEnding(true, 'hangup_user_disconnect');
    endingStartedAtRef.current = Date.now();
    talkActiveRef.current = false;
    setTalkActive(false);
    deferredEndDuringGsmRef.current = null;
    clearCallHoldStateForTeardown();

    callDiag.hangupDisconnectStart({
      path: user?.role === 'caller' ? 'caller_hangup' : 'receiver_hangup',
      role: user?.role,
    });
    callDiag.callEnded(
      'user_hangup',
      {
        role: user?.role,
        endCategory: 'manual_hangup',
        initiatedBy: 'local',
      },
      { finalize: false }
    );
    emitCallEnd('user_hangup_manual');

    if (user?.role === 'caller') {
      await finishCallerCallEnd();
      return;
    }

    const disconnectStartedAt = Date.now();
    await leaveMediaWithTimeout(
      systemCallHoldRef.current ? SAMSUNG_GSM_TEARDOWN_TIMEOUT_MS : 8_000
    );
    await ensureSessionEnded();

    if (receiverAvailabilitySession && Boolean(user?.isAvailable)) {
      const resetMs = Date.now() - disconnectStartedAt;
      callDiag.hangupDisconnectComplete({
        path: 'receiver_reset_to_waiting',
        durationMs: resetMs,
        endCategory: 'manual_hangup',
      });
      callDiag.finalizeCallOutcome('user_hangup', {
        path: 'receiver_reset_to_waiting',
        durationMs: resetMs,
      });
      resetReceiverToWaiting();
      return;
    }

    const receiverExitMs = Date.now() - disconnectStartedAt;
    callDiag.hangupDisconnectComplete({
      path: 'receiver_exit',
      durationMs: receiverExitMs,
      endCategory: 'manual_hangup',
    });
    callDiag.finalizeCallOutcome('user_hangup', { path: 'receiver_exit', durationMs: receiverExitMs });
    exitCallScreen();
  };

  const toggleSpeaker = async () => {
    const next = !speakerOn;
    try {
      await applyVoiceCallAudioMode(next, false);
      setBluetoothOn(false);
      setSpeakerOn(next);
    } catch (e) {
      Alert.alert('Speaker', getErrorMessage(e));
    }
  };

  const toggleBluetooth = async () => {
    if (bluetoothOn) {
      try {
        await applyVoiceCallAudioMode(speakerOn, false);
        setBluetoothOn(false);
        void isBluetoothVoiceOutputAvailable().then(setBluetoothAvailable);
      } catch (e) {
        Alert.alert('Bluetooth', getErrorMessage(e));
      }
      return;
    }
    try {
      await applyVoiceCallAudioMode(speakerOn, true);
      setBluetoothOn(true);
      setBluetoothAvailable(true);
    } catch (e) {
      void isBluetoothVoiceOutputAvailable().then(setBluetoothAvailable);
      Alert.alert('Bluetooth', getErrorMessage(e));
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
      if (onHold && endingRef.current) {
        setEnding(false, 'gsm_native_hold_recover');
      }
      if (onHold) {
        applySystemCallHold(true);
        return;
      }
      if (endingRef.current) {
        if (systemCallHoldRef.current) {
          systemCallHoldRef.current = false;
          setSystemCallHold(false);
          setGsmInterruptPending(false, 'teardown');
        }
        return;
      }
      applySystemCallHold(false);
      void recoverAfterGsmHold();
    },
    [applySystemCallHold, recoverAfterGsmHold, setEnding]
  );

  const showStreamChrome = ready && Boolean(client) && Boolean(call) && Boolean(sdk);
  useCallScreenCaptureProtection(callScreenFocused && talkActive && showStreamChrome);
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
      ? 'Your call is on hold'
      : peerCallHold
        ? `${peerDisplayName} is on hold`
      : receiverSessionPhase === 'incoming'
      ? 'Incoming call'
      : streamBootstrap
        ? 'Connecting…'
        : 'You are online'
    : systemCallHold
      ? 'Your call is on hold'
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

  const handlePeerGsmSuspect = useCallback(() => {
    if (endingRef.current || peerCallHoldRef.current) return;
    if (!isCallHoldGuardActive()) return;
    if (Date.now() - lastPeerHoldClearAtRef.current < 2000) return;
    applyPeerHoldFromRemote(true);
    callDiag.info('peer_gsm_suspect_hold_applied', { immediate: true });
  }, [applyPeerHoldFromRemote]);
  const handlePeerGsmSuspectRef = useRef(handlePeerGsmSuspect);
  handlePeerGsmSuspectRef.current = handlePeerGsmSuspect;

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
                  {peerCallHold ? (
                    <View style={styles.shellHoldBadge} pointerEvents="none">
                      <Text style={styles.shellHoldBadgeText}>On hold</Text>
                    </View>
                  ) : null}
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
                  {systemCallHold ? (
                    <View style={styles.shellHoldBadge} pointerEvents="none">
                      <Text style={styles.shellHoldBadgeText}>On hold</Text>
                    </View>
                  ) : null}
                </View>
              </View>
              <Text style={styles.avatarCaption}>
                {systemCallHold ? 'Your call is on hold' : 'You'}
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
          {addTalktimeButtonEl}
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
                <Ionicons name={muted ? 'mic-off' : 'mic'} size={32} color="#faf5ff" />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.roundBtn, speakerOn && !bluetoothOn && styles.roundBtnActive]}
                onPress={() => void toggleSpeaker()}
                activeOpacity={0.85}
              >
                <Ionicons
                  name={speakerOn ? 'volume-high' : 'phone-portrait-outline'}
                  size={32}
                  color="#faf5ff"
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.roundBtn,
                  bluetoothOn && styles.roundBtnActive,
                  !bluetoothAvailable && styles.roundBtnDisabled,
                ]}
                onPress={() => void toggleBluetooth()}
                activeOpacity={0.85}
              >
                <Ionicons name="bluetooth" size={32} color="#faf5ff" />
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
                  proceedAfterCallerRating();
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
              proceedAfterCallerRating();
            }}
          >
            <Text style={styles.ratingSkipText}>Skip</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  const postCallPeerSrc =
    shellPeerImage && !shellPeerEmpty ? resolveProfileImageSource(shellPeerImage) : null;
  const postCallPeerInitial = (shellPeerName || 'U').trim().charAt(0).toUpperCase();
  const summaryDurationSec = postCallDetails?.durationSec ?? elapsedSec;
  const summaryCostInr = postCallDetails?.costInr ?? 0;
  const summaryWalletInr =
    postCallDetails?.walletInr ?? sessionCallerWalletInr ?? callerWalletInr;

  const postCallModal =
    user?.role === 'caller' ? (
      <Modal visible={postCallOpen} animationType="fade" transparent>
        <View style={styles.postModalRoot}>
          <ScrollView
            style={styles.postScroll}
            contentContainerStyle={{
              paddingHorizontal: 22,
              paddingTop: insets.top + 18,
              paddingBottom: insets.bottom + 28,
            }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.postHeroAvatar}>
              {postCallPeerSrc ? (
                <Image source={postCallPeerSrc} style={styles.postHeroAvatarImg} />
              ) : (
                <View style={[styles.postHeroAvatarImg, styles.postHeroAvatarPh]}>
                  <Text style={styles.postHeroAvatarInitial}>{postCallPeerInitial}</Text>
                </View>
              )}
            </View>
            <Text style={styles.postPeerTitle}>{shellPeerName || 'Receiver'}</Text>

            <View style={styles.postDetailBox}>
              <View style={styles.postDetailRow}>
                <Text style={styles.postDetailLabel}>Total Duration</Text>
                <Text style={styles.postDetailValue}>{formatCallDurationShort(summaryDurationSec)}</Text>
              </View>
              <View style={styles.postDetailRow}>
                <Text style={styles.postDetailLabel}>Total Cost</Text>
                <Text style={styles.postDetailValue}>₹{summaryCostInr.toLocaleString('en-IN')}</Text>
              </View>
              <View style={[styles.postDetailRow, styles.postDetailRowLast]}>
                <Text style={styles.postDetailLabel}>Remaining Balance</Text>
                <Text style={[styles.postDetailValue, styles.postDetailValueAccent]}>
                  ₹{summaryWalletInr.toLocaleString('en-IN')}
                </Text>
              </View>
            </View>

            <Text style={styles.postReportHeading}>
              Faced any Issue? <Text style={styles.postReportHere}>Report Here</Text>
            </Text>
            <View style={styles.postChipWrap}>
              {POST_CALL_ISSUE_TAGS.map((tag) => {
                const on = selectedIssueTags.has(tag);
                return (
                  <TouchableOpacity
                    key={tag}
                    onPress={() => toggleIssueTag(tag)}
                    activeOpacity={0.85}
                    style={[styles.postChip, on && styles.postChipOn]}
                  >
                    <Text style={[styles.postChipTxt, on && styles.postChipTxtOn]}>{tag}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity
              activeOpacity={0.9}
              disabled={selectedIssueTags.size === 0 || submittingIssue}
              onPress={() => {
                void (async () => {
                  if (selectedIssueTags.size === 0) return;
                  setSubmittingIssue(true);
                  try {
                    await callApi.sessionReport(callIdRef.current, [...selectedIssueTags]);
                    setSelectedIssueTags(new Set());
                    Alert.alert('Submitted', 'Thank you. Our team will review your report.');
                  } catch (e) {
                    Alert.alert('Report', getErrorMessage(e));
                  } finally {
                    setSubmittingIssue(false);
                  }
                })();
              }}
              style={[
                styles.postIssueBtn,
                (selectedIssueTags.size === 0 || submittingIssue) && styles.postBtnDisabled,
              ]}
            >
              <Text style={styles.postIssueBtnTxt}>
                {submittingIssue ? 'Submitting...' : 'Submit Issue'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.postSkipBtn}
              disabled={submittingIssue}
              onPress={closePostCallAndExit}
            >
              <Text style={styles.postSkipTxt}>Skip, go to home</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    ) : null;

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
              forceMicOff={systemCallHold}
            />
          ) : null}
          {streamAvatarExtras ? (
            <streamAvatarExtras.StreamTalkTimingBridge
              onBothConnected={() => {
                void kickTalkTimerSyncRef.current();
              }}
            />
          ) : null}
          {streamAvatarExtras ? (
            <streamAvatarExtras.StreamRemotePeerLeftBridge
              onLocalGsmSuspect={() => {
                if (endingRef.current) return;
                applySystemCallHoldRef.current(true);
              }}
              onPeerGsmSuspect={() => {
                handlePeerGsmSuspectRef.current();
              }}
              onRemotePeerLeft={(reason) => {
                const callId = callIdRef.current.trim();
                if (!callId || endingRef.current) return;
                handlePeerCallEndedRef.current(callId, `stream_${reason}`);
              }}
            />
          ) : null}
          {streamAvatarExtras ? (
            <streamAvatarExtras.StreamLocalHoldMicBridge
              systemOnHold={systemCallHold}
              userChosenMuteRef={userChosenMuteRef}
            />
          ) : null}
          {streamAvatarExtras ? (
            <streamAvatarExtras.StreamHoldAudioBridge
              peerOnHold={peerCallHold}
              systemOnHold={systemCallHold}
            />
          ) : null}
          <View style={[styles.overlay, { paddingTop: Math.max(insets.top + 16, 36) }]}>
            <View style={styles.statusPill}>
              <Text style={styles.statusText}>
                {systemCallHold
                  ? 'Your call is on hold'
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
                    {peerCallHold ? (
                      <View style={styles.shellHoldBadge} pointerEvents="none">
                        <Text style={styles.shellHoldBadgeText}>On hold</Text>
                      </View>
                    ) : streamAvatarExtras ? (
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
                    {systemCallHold ? (
                      <View style={styles.shellHoldBadge} pointerEvents="none">
                        <Text style={styles.shellHoldBadgeText}>On hold</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                <Text style={styles.avatarCaption}>{systemCallHold ? 'Your call is on hold' : 'You'}</Text>
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
            {addTalktimeButtonEl}
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
                <Ionicons name={muted ? 'mic-off' : 'mic'} size={32} color="#faf5ff" />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.roundBtn, speakerOn && !bluetoothOn && styles.roundBtnActive]}
                onPress={() => void toggleSpeaker()}
                activeOpacity={0.85}
              >
                <Ionicons
                  name={speakerOn ? 'volume-high' : 'phone-portrait-outline'}
                  size={32}
                  color="#faf5ff"
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.roundBtn,
                  bluetoothOn && styles.roundBtnActive,
                  !bluetoothAvailable && styles.roundBtnDisabled,
                ]}
                onPress={() => void toggleBluetooth()}
                activeOpacity={0.85}
              >
                <Ionicons name="bluetooth" size={32} color="#faf5ff" />
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

  const cellularHoldMonitorEnabled = Boolean(
    (getVoiceBootstrap(callParams)?.callId ?? callIdRef.current).trim()
  );

  return (
    <>
      <AndroidCellularHoldMonitor
        enabled={cellularHoldMonitorEnabled}
        onSystemHoldChange={handleStreamSystemHold}
      />
      {screenBody}
      {ratingModal}
      {postCallModal}
      <InCallTalktimeRechargeModal
        visible={talktimeRechargeOpen}
        onClose={() => setTalktimeRechargeOpen(false)}
        onRechargeSuccess={handleInCallRechargeSuccess}
      />
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
  shellHoldBadge: {
    position: 'absolute',
    bottom: 2,
    alignSelf: 'center',
    backgroundColor: 'rgba(127, 29, 29, 0.92)',
    borderColor: 'rgba(254, 202, 202, 0.45)',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  shellHoldBadgeText: { color: '#fef2f2', fontSize: 10, fontWeight: '800' },
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
  controls: { flexDirection: 'row', gap: 12, marginTop: 44, justifyContent: 'center' },
  roundBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(91, 33, 182, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(196, 181, 253, 0.35)',
  },
  roundBtnActive: {
    backgroundColor: 'rgba(124, 58, 237, 0.85)',
    borderColor: 'rgba(233, 213, 255, 0.65)',
  },
  roundBtnDisabled: {
    opacity: 0.45,
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
  addTalktimeBtn: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(196, 181, 253, 0.55)',
    backgroundColor: 'rgba(124, 58, 237, 0.35)',
  },
  addTalktimeBtnText: { color: '#faf5ff', fontSize: 13, fontWeight: '800' },
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
  postModalRoot: { flex: 1, backgroundColor: '#fff' },
  postScroll: { flex: 1, backgroundColor: '#fff' },
  postHeroAvatar: {
    alignSelf: 'center',
    width: 88,
    height: 88,
    borderRadius: 44,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  postHeroAvatarImg: { width: '100%', height: '100%' },
  postHeroAvatarPh: { alignItems: 'center', justifyContent: 'center' },
  postHeroAvatarInitial: { fontSize: 32, fontWeight: '900', color: '#6b7280' },
  postPeerTitle: {
    marginTop: 14,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
  },
  postDetailBox: {
    marginTop: 22,
    backgroundColor: '#f3f4f6',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  postDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  postDetailRowLast: { borderBottomWidth: 0 },
  postDetailLabel: { fontSize: 14, fontWeight: '600', color: '#4b5563' },
  postDetailValue: { fontSize: 15, fontWeight: '800', color: '#111827' },
  postDetailValueAccent: { color: '#7b2cff' },
  postReportHeading: {
    marginTop: 28,
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
  },
  postReportHere: { color: '#ef4444', fontWeight: '800' },
  postChipWrap: {
    marginTop: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
  },
  postChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  postChipOn: {
    borderColor: '#7b2cff',
    backgroundColor: 'rgba(123,44,255,0.08)',
  },
  postChipTxt: { fontSize: 13, fontWeight: '600', color: '#4b5563' },
  postChipTxtOn: { color: '#5b21b6' },
  postIssueBtn: {
    marginTop: 18,
    backgroundColor: '#ef4444',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  postIssueBtnTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
  postBtnDisabled: { opacity: 0.45 },
  postSkipBtn: { marginTop: 20, alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 12 },
  postSkipTxt: { color: '#6b7280', fontSize: 14, fontWeight: '700' },
});
