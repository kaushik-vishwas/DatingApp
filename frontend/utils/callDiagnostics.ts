import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';

/** Max in-memory log entries (ring buffer). */
const MAX_ENTRIES = 600;

/** After hold ends, keep guarding Stream remote-left for WebRTC recovery. */
const HOLD_TAIL_GRACE_MS = 12_000;

/** While hold is active, use a longer remote-participant absence debounce. */
export const HOLD_REMOTE_LEFT_DEBOUNCE_MS = 30_000;
export const NORMAL_REMOTE_LEFT_DEBOUNCE_MS = 500;

export type CallDiagnosticEventType =
  | 'call_created'
  | 'call_ringing'
  | 'call_accepted'
  | 'call_connected'
  | 'call_hold_started'
  | 'call_hold_ended'
  | 'gsm_detected'
  | 'gsm_answered'
  | 'gsm_ended'
  | 'app_backgrounded'
  | 'app_foregrounded'
  | 'audio_interruption'
  | 'stream_state_change'
  | 'participant_joined'
  | 'participant_left'
  | 'connection_lost'
  | 'connection_restored'
  | 'reconnection_attempt'
  | 'call_ended'
  | 'call_end_suppressed'
  | 'call_end_reason'
  | 'error'
  | 'info';

export type CallDiagnosticEntry = {
  id: string;
  timestamp: string;
  timestampMs: number;
  eventType: CallDiagnosticEventType;
  callId: string | null;
  userRole: string | null;
  deviceBrand: string | null;
  deviceModel: string | null;
  androidVersion: string | null;
  details: Record<string, unknown>;
};

export type CallDiagnosticsSnapshot = {
  callId: string | null;
  userRole: string | null;
  systemCallHold: boolean;
  peerCallHold: boolean;
  talkActive: boolean;
  ready: boolean;
  ending: boolean;
  appInBackground: boolean;
  streamCallingState: string | null;
  remoteParticipantCount: number | null;
  holdGraceActive: boolean;
  holdGraceUntilMs: number | null;
};

type Listener = () => void;

let seq = 0;
const entries: CallDiagnosticEntry[] = [];
const listeners = new Set<Listener>();

let cachedDevice:
  | {
      brand: string | null;
      model: string | null;
      androidVersion: string | null;
    }
  | null = null;

let activeCallId: string | null = null;
let activeUserRole: string | null = null;

let holdGraceUntilMs = 0;
let lastSystemHold = false;
let lastPeerHold = false;

const liveSnapshot: CallDiagnosticsSnapshot = {
  callId: null,
  userRole: null,
  systemCallHold: false,
  peerCallHold: false,
  talkActive: false,
  ready: false,
  ending: false,
  appInBackground: false,
  streamCallingState: null,
  remoteParticipantCount: null,
  holdGraceActive: false,
  holdGraceUntilMs: null,
};

function deviceInfo(): {
  brand: string | null;
  model: string | null;
  androidVersion: string | null;
} {
  if (cachedDevice) return cachedDevice;
  cachedDevice = {
    brand: Device.brand ?? null,
    model: Device.modelName ?? null,
    androidVersion:
      Platform.OS === 'android' && typeof Platform.Version === 'number'
        ? String(Platform.Version)
        : Platform.OS === 'android'
          ? String(Platform.Version)
          : null,
  };
  return cachedDevice;
}

function notify(): void {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // ignore listener errors
    }
  });
}

function push(
  eventType: CallDiagnosticEventType,
  details: Record<string, unknown> = {},
  opts?: { callId?: string | null; userRole?: string | null }
): void {
  const info = deviceInfo();
  const entry: CallDiagnosticEntry = {
    id: `${Date.now()}-${++seq}`,
    timestamp: new Date().toISOString(),
    timestampMs: Date.now(),
    eventType,
    callId: opts?.callId ?? activeCallId,
    userRole: opts?.userRole ?? activeUserRole,
    deviceBrand: info.brand,
    deviceModel: info.model,
    androidVersion: info.androidVersion,
    details,
  };
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) {
    entries.splice(0, entries.length - MAX_ENTRIES);
  }
  if (__DEV__) {
    console.log(`[CallDiag] ${eventType}`, details);
  }
  notify();
}

export function subscribeCallDiagnostics(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getCallDiagnosticEntries(): CallDiagnosticEntry[] {
  return [...entries];
}

export function getCallDiagnosticsSnapshot(): CallDiagnosticsSnapshot {
  const now = Date.now();
  return {
    ...liveSnapshot,
    holdGraceActive: now < holdGraceUntilMs,
    holdGraceUntilMs: holdGraceUntilMs > now ? holdGraceUntilMs : null,
  };
}

export function getCallDiagnosticsDeviceSummary(): Record<string, string> {
  const info = deviceInfo();
  return {
    brand: info.brand ?? 'unknown',
    model: info.model ?? 'unknown',
    os: Platform.OS,
    androidVersion: info.androidVersion ?? 'n/a',
    appVersion: Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? 'unknown',
    nativeBuild: Constants.nativeBuildVersion ?? 'unknown',
  };
}

export function setCallDiagnosticsContext(callId: string | null, userRole: string | null): void {
  activeCallId = callId?.trim() || null;
  activeUserRole = userRole;
  liveSnapshot.callId = activeCallId;
  liveSnapshot.userRole = activeUserRole;
}

export function updateCallDiagnosticsLiveState(
  patch: Partial<Omit<CallDiagnosticsSnapshot, 'holdGraceActive' | 'holdGraceUntilMs'>>
): void {
  Object.assign(liveSnapshot, patch);
  if (typeof patch.systemCallHold === 'boolean') {
    lastSystemHold = patch.systemCallHold;
    touchHoldGrace(patch.systemCallHold);
  }
  if (typeof patch.peerCallHold === 'boolean') {
    lastPeerHold = patch.peerCallHold;
    touchHoldGrace(patch.peerCallHold);
  }
}

function touchHoldGrace(holdOn: boolean): void {
  const now = Date.now();
  if (holdOn) {
    holdGraceUntilMs = now + 5 * 60_000;
    return;
  }
  holdGraceUntilMs = Math.max(holdGraceUntilMs, now + HOLD_TAIL_GRACE_MS);
}

/** True when external phone hold may cause transient Stream participant gaps. */
export function isCallHoldGuardActive(): boolean {
  const now = Date.now();
  return (
    lastSystemHold ||
    lastPeerHold ||
    now < holdGraceUntilMs
  );
}

export function clearCallDiagnostics(): void {
  entries.length = 0;
  notify();
}

export function formatCallDiagnosticsForExport(): string {
  const header = {
    exportedAt: new Date().toISOString(),
    device: getCallDiagnosticsDeviceSummary(),
    snapshot: getCallDiagnosticsSnapshot(),
    entryCount: entries.length,
  };
  return JSON.stringify({ header, entries }, null, 2);
}

export const callDiag = {
  setContext: setCallDiagnosticsContext,
  updateLive: updateCallDiagnosticsLiveState,
  snapshot: getCallDiagnosticsSnapshot,

  callCreated: (callId: string, details?: Record<string, unknown>) =>
    push('call_created', { callId, ...details }),
  callRinging: (details?: Record<string, unknown>) => push('call_ringing', details ?? {}),
  callAccepted: (details?: Record<string, unknown>) => push('call_accepted', details ?? {}),
  callConnected: (details?: Record<string, unknown>) => push('call_connected', details ?? {}),

  holdStarted: (source: 'local_system' | 'remote_socket', details?: Record<string, unknown>) =>
    push('call_hold_started', { source, ...details }),
  holdEnded: (source: 'local_system' | 'remote_socket', details?: Record<string, unknown>) =>
    push('call_hold_ended', { source, ...details }),

  gsmDetected: (details?: Record<string, unknown>) => push('gsm_detected', details ?? {}),
  gsmAnswered: (details?: Record<string, unknown>) => push('gsm_answered', details ?? {}),
  gsmEnded: (details?: Record<string, unknown>) => push('gsm_ended', details ?? {}),

  appBackgrounded: (state: string) => push('app_backgrounded', { appState: state }),
  appForegrounded: (state: string) => push('app_foregrounded', { appState: state }),

  audioInterruption: (details: Record<string, unknown>) =>
    push('audio_interruption', details),

  streamStateChange: (callingState: string, details?: Record<string, unknown>) => {
    updateCallDiagnosticsLiveState({ streamCallingState: callingState });
    push('stream_state_change', { callingState, ...details });
  },

  participantJoined: (details?: Record<string, unknown>) =>
    push('participant_joined', details ?? {}),
  participantLeft: (details?: Record<string, unknown>) =>
    push('participant_left', details ?? {}),

  connectionLost: (details?: Record<string, unknown>) =>
    push('connection_lost', details ?? {}),
  connectionRestored: (details?: Record<string, unknown>) =>
    push('connection_restored', details ?? {}),
  reconnectionAttempt: (details?: Record<string, unknown>) =>
    push('reconnection_attempt', details ?? {}),

  callEnded: (reason: string, details?: Record<string, unknown>) =>
    push('call_ended', { reason, ...details }),
  callEndSuppressed: (reason: string, details?: Record<string, unknown>) =>
    push('call_end_suppressed', { reason, ...details }),
  callEndReason: (reason: string, details?: Record<string, unknown>) =>
    push('call_end_reason', { reason, ...details }),

  error: (message: string, details?: Record<string, unknown>) =>
    push('error', { message, ...details }),
  info: (message: string, details?: Record<string, unknown>) =>
    push('info', { message, ...details }),
};

let appStateHookInstalled = false;

export function ensureCallDiagnosticsAppStateHook(): void {
  if (appStateHookInstalled) return;
  appStateHookInstalled = true;
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      callDiag.appForegrounded(state);
    } else {
      callDiag.appBackgrounded(state);
    }
  });
}
