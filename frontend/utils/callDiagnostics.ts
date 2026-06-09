import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import {
  getHoldRemoteLeftDebounceMs,
  getNormalRemoteLeftDebounceMs,
} from './samsungCallCompat';
import {
  clearPersistedCallDiagnostics,
  loadPersistedCallDiagnosticsBundle,
  persistCallDiagnosticsBundle,
  type PersistedCallDiagnosticsBundle,
} from './callDiagnosticsPersistence';

/** Max in-memory log entries (ring buffer). */
const MAX_ENTRIES = 800;

/** Preserve this window before call termination (also persisted). */
const FINAL_WINDOW_MS = 60_000;

/** After hold ends, keep guarding Stream remote-left for WebRTC recovery. */
const HOLD_TAIL_GRACE_MS = 12_000;

const PERSIST_DEBOUNCE_MS = 400;
const PERSIST_INTERVAL_MS = 2_000;

/** While hold is active, use a longer remote-participant absence debounce. */
export const HOLD_REMOTE_LEFT_DEBOUNCE_MS = getHoldRemoteLeftDebounceMs();
export const NORMAL_REMOTE_LEFT_DEBOUNCE_MS = getNormalRemoteLeftDebounceMs();

export type CallEndCategory =
  | 'manual_hangup'
  | 'remote_hangup'
  | 'stream_participant_lost'
  | 'stream_state_change'
  | 'session_sync'
  | 'gsm_interruption'
  | 'timeout'
  | 'cleanup'
  | 'recovery_failure'
  | 'unknown';

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
  | 'gsm_recovery_start'
  | 'gsm_recovery_end'
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
  | 'call_end_suppression_released'
  | 'call_end_reason'
  | 'state_change'
  | 'hangup_click'
  | 'hangup_blocked'
  | 'hangup_disconnect_start'
  | 'hangup_disconnect_complete'
  | 'remote_participant_count_changed'
  | 'state_mismatch'
  | 'call_outcome_summary'
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
  gsmInterruptPending: boolean;
  talkActive: boolean;
  ready: boolean;
  ending: boolean;
  appInBackground: boolean;
  streamCallingState: string | null;
  remoteParticipantCount: number | null;
  holdGraceActive: boolean;
  holdGraceUntilMs: number | null;
};

export type StateMismatchEvent = {
  at: string;
  atMs: number;
  kind: string;
  description: string;
  details: Record<string, unknown>;
};

export type CallOutcomeSummary = {
  callId: string | null;
  role: string | null;
  endedAt: string;
  endCategory: CallEndCategory;
  endSource: string;
  initiatedEndBy: 'local' | 'remote' | 'system' | 'unknown';
  receivedEndBy: 'local' | 'remote' | 'none' | 'unknown';
  lastStreamState: string | null;
  lastParticipantCount: number | null;
  lastSystemCallHold: boolean;
  lastPeerCallHold: boolean;
  lastGsmInterruptPending: boolean;
  lastSuccessfulAction: string | null;
  lastFailedAction: string | null;
  whyCallEnded: string;
  stateMismatches: StateMismatchEvent[];
  firstMismatchCause: string | null;
};

type Listener = () => void;

type SuppressionRecord = {
  key: string;
  sourceEvent: string;
  reason: string;
  startedAtMs: number;
};

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

let lastCallId: string | null = null;
let lastCallEndedAt: string | null = null;
let lastCallEndReason: string | null = null;
let lastCallSnapshotFrozen: CallDiagnosticsSnapshot | null = null;
let lastOutcomeSummary: CallOutcomeSummary | null = null;
let finalWindowEntries: CallDiagnosticEntry[] = [];

let holdGraceUntilMs = 0;
let lastSystemHold = false;
let lastPeerHold = false;
let gsmInterruptPending = false;

let lastSuccessfulAction: string | null = null;
let lastFailedAction: string | null = null;
const stateMismatches: StateMismatchEvent[] = [];

const activeSuppressions = new Map<string, SuppressionRecord>();
let gsmRecoveryStartedAtMs: number | null = null;

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let persistInterval: ReturnType<typeof setInterval> | null = null;
let hydrated = false;

const liveSnapshot: CallDiagnosticsSnapshot = {
  callId: null,
  userRole: null,
  systemCallHold: false,
  peerCallHold: false,
  gsmInterruptPending: false,
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

function currentHoldContext(): Record<string, unknown> {
  return {
    systemCallHold: liveSnapshot.systemCallHold,
    peerCallHold: liveSnapshot.peerCallHold,
    gsmInterruptPending,
    holdGuardActive: isCallHoldGuardActive(),
    streamCallingState: liveSnapshot.streamCallingState,
    remoteParticipantCount: liveSnapshot.remoteParticipantCount,
    ending: liveSnapshot.ending,
    talkActive: liveSnapshot.talkActive,
  };
}

export function categorizeEndSource(source: string): CallEndCategory {
  const s = source.toLowerCase();
  if (s === 'user_hangup' || s.includes('manual')) return 'manual_hangup';
  if (s.startsWith('socket_') || s.includes('remote_hangup')) return 'remote_hangup';
  if (s.includes('stream_remote') || s === 'stream_remote_empty') return 'stream_participant_lost';
  if (s.includes('stream_local') || s === 'stream_local_left') return 'stream_state_change';
  if (s.includes('session_sync')) return 'session_sync';
  if (s.includes('gsm') || s.includes('deferred_during_gsm')) return 'gsm_interruption';
  if (s.includes('timeout') || s.includes('balance') || s.includes('stuck')) return 'timeout';
  if (s.includes('cleanup') || s.includes('background')) return 'cleanup';
  if (s.includes('recovery')) return 'recovery_failure';
  return 'unknown';
}

function resolveInitiatedEndBy(source: string, role: string | null): CallOutcomeSummary['initiatedEndBy'] {
  if (source === 'user_hangup') return 'local';
  if (source.startsWith('socket_')) return 'remote';
  if (source.startsWith('stream_') || source.includes('session_sync')) return 'system';
  return 'unknown';
}

function buildOutcomeSummary(endSource: string): CallOutcomeSummary {
  const snap = getCallDiagnosticsSnapshot();
  const category = categorizeEndSource(endSource);
  const role = activeUserRole ?? snap.userRole;
  const initiated = resolveInitiatedEndBy(endSource, role);
  const received: CallOutcomeSummary['receivedEndBy'] =
    endSource === 'user_hangup' ? 'remote' : initiated === 'remote' ? 'local' : 'unknown';

  let why = `Call ended via ${endSource} (${category})`;
  if (stateMismatches.length > 0) {
    why += `. First state mismatch: ${stateMismatches[0].kind} — ${stateMismatches[0].description}`;
  }

  return {
    callId: activeCallId ?? snap.callId,
    role,
    endedAt: new Date().toISOString(),
    endCategory: category,
    endSource,
    initiatedEndBy: initiated,
    receivedEndBy: received,
    lastStreamState: snap.streamCallingState,
    lastParticipantCount: snap.remoteParticipantCount,
    lastSystemCallHold: snap.systemCallHold,
    lastPeerCallHold: snap.peerCallHold,
    lastGsmInterruptPending: snap.gsmInterruptPending,
    lastSuccessfulAction,
    lastFailedAction,
    whyCallEnded: why,
    stateMismatches: [...stateMismatches],
    firstMismatchCause: stateMismatches[0]?.kind ?? null,
  };
}

function captureFinalWindow(): void {
  const endMs = Date.now();
  const startMs = endMs - FINAL_WINDOW_MS;
  const callId = activeCallId ?? lastCallId;
  finalWindowEntries = entries.filter(
    (e) =>
      e.timestampMs >= startMs &&
      (!callId || e.callId === callId || e.callId === null)
  );
}

function schedulePersist(): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void flushPersist();
  }, PERSIST_DEBOUNCE_MS);
}

function startPersistInterval(): void {
  if (persistInterval) return;
  persistInterval = setInterval(() => {
    void flushPersist();
  }, PERSIST_INTERVAL_MS);
}

function stopPersistInterval(): void {
  if (persistInterval) {
    clearInterval(persistInterval);
    persistInterval = null;
  }
}

async function flushPersist(force = false): Promise<void> {
  if (!activeCallId && !lastCallId && entries.length === 0) return;
  const callId = lastCallId ?? activeCallId;
  const callEntries = callId ? entries.filter((e) => e.callId === callId || e.callId === null) : [...entries];
  if (callEntries.length === 0 && !force) return;

  const bundle: PersistedCallDiagnosticsBundle = {
    version: 1,
    savedAt: new Date().toISOString(),
    savedAtMs: Date.now(),
    lastCallId: callId,
    lastCallEndedAt,
    lastCallEndReason,
    outcomeSummary: (lastOutcomeSummary ?? null) as unknown as Record<string, unknown> | null,
    snapshot: (lastCallSnapshotFrozen ?? getCallDiagnosticsSnapshot()) as unknown as Record<
      string,
      unknown
    > | null,
    deviceSummary: getCallDiagnosticsDeviceSummary(),
    entries: callEntries as unknown as Array<Record<string, unknown>>,
    finalWindowEntries: (
      finalWindowEntries.length > 0
        ? finalWindowEntries
        : callEntries.filter((e) => e.timestampMs >= Date.now() - FINAL_WINDOW_MS)
    ) as unknown as Array<Record<string, unknown>>,
  };
  await persistCallDiagnosticsBundle(bundle);
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
    details: {
      ...currentHoldContext(),
      ...details,
    },
  };
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) {
    entries.splice(0, entries.length - MAX_ENTRIES);
  }
  if (__DEV__) {
    console.log(`[CallDiag] ${eventType}`, entry.details);
  }
  notify();
  schedulePersist();
}

function logStateChange(
  field: string,
  previous: unknown,
  next: unknown,
  reason: string,
  extra?: Record<string, unknown>
): void {
  if (Object.is(previous, next)) return;
  push('state_change', {
    field,
    previous,
    next,
    reason,
    ...extra,
  });
}

export async function hydrateCallDiagnosticsFromStorage(): Promise<void> {
  if (hydrated) return;
  hydrated = true;
  const bundle = await loadPersistedCallDiagnosticsBundle();
  if (!bundle) return;

  if (entries.length === 0 && bundle.entries.length > 0) {
    for (const raw of bundle.entries) {
      const e = raw as unknown as CallDiagnosticEntry;
      if (!entries.some((x) => x.id === e.id)) {
        entries.push(e);
      }
    }
    if (entries.length > MAX_ENTRIES) {
      entries.splice(0, entries.length - MAX_ENTRIES);
    }
  }

  if (!lastCallId && bundle.lastCallId) {
    lastCallId = bundle.lastCallId;
    lastCallEndedAt = bundle.lastCallEndedAt;
    lastCallEndReason = bundle.lastCallEndReason;
    lastCallSnapshotFrozen = bundle.snapshot as unknown as CallDiagnosticsSnapshot | null;
    lastOutcomeSummary = bundle.outcomeSummary as unknown as CallOutcomeSummary | null;
    finalWindowEntries = (bundle.finalWindowEntries ?? []) as unknown as CallDiagnosticEntry[];
    const mismatches = (bundle.outcomeSummary as unknown as CallOutcomeSummary | null)
      ?.stateMismatches;
    if (mismatches?.length) {
      stateMismatches.push(...mismatches);
    }
    notify();
  }
}

export function subscribeCallDiagnostics(listener: Listener): () => void {
  void hydrateCallDiagnosticsFromStorage();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getCallDiagnosticEntries(): CallDiagnosticEntry[] {
  return [...entries];
}

function resolveLastCallId(): string | null {
  return lastCallId ?? activeCallId;
}

export function getLastCallDiagnosticEntries(): CallDiagnosticEntry[] {
  const id = resolveLastCallId();
  if (!id) {
    return finalWindowEntries.length > 0 ? [...finalWindowEntries] : [];
  }
  const fromMemory = entries.filter((e) => e.callId === id);
  if (fromMemory.length > 0) return fromMemory;
  return [...finalWindowEntries];
}

export type LastCallDiagnosticsSummary = {
  callId: string | null;
  endedAt: string | null;
  endReason: string | null;
  endCategory: CallEndCategory | null;
  entryCount: number;
  issueCount: number;
  snapshot: CallDiagnosticsSnapshot | null;
  outcomeSummary: CallOutcomeSummary | null;
  persistedAt: string | null;
  finalWindowCount: number;
};

export function getLastCallDiagnosticsSummary(): LastCallDiagnosticsSummary {
  const lastEntries = getLastCallDiagnosticEntries();
  const issueCount = lastEntries.filter(
    (e) =>
      e.eventType === 'error' ||
      e.eventType === 'call_end_suppressed' ||
      e.eventType === 'state_mismatch'
  ).length;
  const id = resolveLastCallId();
  const snapshot =
    id && lastCallId === id && lastCallSnapshotFrozen
      ? lastCallSnapshotFrozen
      : id
        ? getCallDiagnosticsSnapshot()
        : null;
  return {
    callId: id,
    endedAt: lastCallId === id ? lastCallEndedAt : null,
    endReason: lastCallId === id ? lastCallEndReason : null,
    endCategory: lastOutcomeSummary?.endCategory ?? (lastCallEndReason ? categorizeEndSource(lastCallEndReason) : null),
    entryCount: lastEntries.length,
    issueCount,
    snapshot,
    outcomeSummary: lastOutcomeSummary,
    persistedAt: null,
    finalWindowCount: finalWindowEntries.length,
  };
}

export function getCallOutcomeSummary(): CallOutcomeSummary | null {
  return lastOutcomeSummary;
}

export function getLastCallIssueCount(): number {
  return getLastCallDiagnosticsSummary().issueCount;
}

export function hasLastCallDiagnostics(): boolean {
  return getLastCallDiagnosticEntries().length > 0 || lastOutcomeSummary !== null;
}

function archiveLastCall(reason: string): void {
  const id = activeCallId;
  if (!id) return;
  captureFinalWindow();
  lastOutcomeSummary = buildOutcomeSummary(reason);
  lastCallId = id;
  lastCallEndedAt = new Date().toISOString();
  lastCallEndReason = reason;
  lastCallSnapshotFrozen = getCallDiagnosticsSnapshot();
  push('call_outcome_summary', { summary: lastOutcomeSummary });
  stopPersistInterval();
  void flushPersist(true);
  notify();
}

export function getCallDiagnosticsSnapshot(): CallDiagnosticsSnapshot {
  const now = Date.now();
  return {
    ...liveSnapshot,
    gsmInterruptPending,
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
  patch: Partial<Omit<CallDiagnosticsSnapshot, 'holdGraceActive' | 'holdGraceUntilMs' | 'gsmInterruptPending'>>
): void {
  if (typeof patch.systemCallHold === 'boolean') {
    logStateChange('systemCallHold', liveSnapshot.systemCallHold, patch.systemCallHold, 'live_state_patch');
    lastSystemHold = patch.systemCallHold;
    touchHoldGrace(patch.systemCallHold);
  }
  if (typeof patch.peerCallHold === 'boolean') {
    logStateChange('peerCallHold', liveSnapshot.peerCallHold, patch.peerCallHold, 'live_state_patch');
    lastPeerHold = patch.peerCallHold;
    touchHoldGrace(patch.peerCallHold);
  }
  if (typeof patch.ending === 'boolean') {
    logStateChange('endingRef', liveSnapshot.ending, patch.ending, 'live_state_patch');
  }
  if (typeof patch.streamCallingState === 'string' || patch.streamCallingState === null) {
    if (patch.streamCallingState !== liveSnapshot.streamCallingState) {
      logStateChange(
        'streamCallingState',
        liveSnapshot.streamCallingState,
        patch.streamCallingState ?? null,
        'live_state_patch'
      );
    }
  }
  if (typeof patch.remoteParticipantCount === 'number' || patch.remoteParticipantCount === null) {
    if (patch.remoteParticipantCount !== liveSnapshot.remoteParticipantCount) {
      remoteParticipantCountChanged(
        liveSnapshot.remoteParticipantCount,
        patch.remoteParticipantCount ?? null,
        'live_state_patch'
      );
    }
  }
  Object.assign(liveSnapshot, patch);
}

function touchHoldGrace(holdOn: boolean): void {
  const now = Date.now();
  if (holdOn) {
    holdGraceUntilMs = now + 5 * 60_000;
    return;
  }
  holdGraceUntilMs = Math.max(holdGraceUntilMs, now + HOLD_TAIL_GRACE_MS);
}

export function setGsmInterruptPending(pending: boolean, reason = 'setGsmInterruptPending'): void {
  if (gsmInterruptPending === pending) return;
  logStateChange('gsmInterruptPending', gsmInterruptPending, pending, reason);
  gsmInterruptPending = pending;
  liveSnapshot.gsmInterruptPending = pending;
  if (pending) {
    touchHoldGrace(true);
  }
  notify();
  schedulePersist();
}

export function logEndingRefChange(
  next: boolean,
  reason: string,
  details?: Record<string, unknown>
): void {
  logStateChange('endingRef', liveSnapshot.ending, next, reason, details);
  liveSnapshot.ending = next;
}

export function remoteParticipantCountChanged(
  previous: number | null,
  next: number | null,
  source: string
): void {
  if (previous === next) return;
  push('remote_participant_count_changed', {
    previous,
    next,
    source,
    timestamp: new Date().toISOString(),
    systemCallHold: liveSnapshot.systemCallHold,
    peerCallHold: liveSnapshot.peerCallHold,
    gsmInterruptPending,
    gsmState: gsmInterruptPending ? 'active' : 'idle',
  });
  liveSnapshot.remoteParticipantCount = next;

  if (
    next === 0 &&
    previous !== null &&
    previous > 0 &&
    liveSnapshot.talkActive &&
    !liveSnapshot.systemCallHold &&
    !liveSnapshot.peerCallHold &&
    !gsmInterruptPending
  ) {
    recordStateMismatch('remote_count_zero_while_talk_active', 'Remote participants dropped to 0 while talk was active and no hold was reported', {
      previous,
      next,
      source,
    });
  }
}

export function recordStateMismatch(
  kind: string,
  description: string,
  details?: Record<string, unknown>
): void {
  const evt: StateMismatchEvent = {
    at: new Date().toISOString(),
    atMs: Date.now(),
    kind,
    description,
    details: { ...currentHoldContext(), ...details },
  };
  if (!stateMismatches.some((m) => m.kind === kind && Date.now() - m.atMs < 3_000)) {
    stateMismatches.push(evt);
  }
  push('state_mismatch', { kind, description, ...details });
  schedulePersist();
}

export function recordSuccessfulAction(action: string, details?: Record<string, unknown>): void {
  lastSuccessfulAction = action;
  push('info', { message: `success:${action}`, action, ...details });
}

export function recordFailedAction(action: string, details?: Record<string, unknown>): void {
  lastFailedAction = action;
  push('error', { message: `failed:${action}`, action, ...details });
}

/** True when external phone hold may cause transient Stream participant gaps. */
export function isCallHoldGuardActive(): boolean {
  const now = Date.now();
  return (
    lastSystemHold ||
    lastPeerHold ||
    liveSnapshot.systemCallHold ||
    liveSnapshot.peerCallHold ||
    gsmInterruptPending ||
    now < holdGraceUntilMs
  );
}

export function clearCallDiagnostics(): void {
  entries.length = 0;
  lastCallId = null;
  lastCallEndedAt = null;
  lastCallEndReason = null;
  lastCallSnapshotFrozen = null;
  lastOutcomeSummary = null;
  finalWindowEntries = [];
  stateMismatches.length = 0;
  activeSuppressions.clear();
  lastSuccessfulAction = null;
  lastFailedAction = null;
  gsmRecoveryStartedAtMs = null;
  stopPersistInterval();
  void clearPersistedCallDiagnostics();
  notify();
}

export function formatCallDiagnosticsForExport(): string {
  const lastSummary = getLastCallDiagnosticsSummary();
  const lastEntries = getLastCallDiagnosticEntries();
  const header = {
    exportedAt: new Date().toISOString(),
    device: getCallDiagnosticsDeviceSummary(),
    lastCall: lastSummary,
    outcomeSummary: lastOutcomeSummary,
    liveSnapshot: getCallDiagnosticsSnapshot(),
    entryCount: lastEntries.length,
    finalWindowCount: finalWindowEntries.length,
    totalBufferedEntries: entries.length,
  };
  return JSON.stringify(
    {
      header,
      outcomeSummary: lastOutcomeSummary,
      finalWindowEntries,
      entries: lastEntries,
    },
    null,
    2
  );
}

function trackSuppression(sourceEvent: string, reason: string, details?: Record<string, unknown>): void {
  const key = `${sourceEvent}:${reason}`;
  if (!activeSuppressions.has(key)) {
    activeSuppressions.set(key, {
      key,
      sourceEvent,
      reason,
      startedAtMs: Date.now(),
    });
  }
  const record = activeSuppressions.get(key)!;
  push('call_end_suppressed', {
    reason,
    sourceEvent,
    suppressionKey: key,
    suppressionAgeMs: Date.now() - record.startedAtMs,
    ...details,
  });
}

function releaseSuppression(sourceEvent: string, reason: string): void {
  const key = `${sourceEvent}:${reason}`;
  const record = activeSuppressions.get(key);
  if (!record) return;
  const durationMs = Date.now() - record.startedAtMs;
  activeSuppressions.delete(key);
  push('call_end_suppression_released', {
    reason,
    sourceEvent,
    suppressionKey: key,
    suppressionDurationMs: durationMs,
  });
}

export const callDiag = {
  setContext: setCallDiagnosticsContext,
  updateLive: updateCallDiagnosticsLiveState,
  snapshot: getCallDiagnosticsSnapshot,

  callCreated: (callId: string, details?: Record<string, unknown>) => {
    startPersistInterval();
    push('call_created', { callId, ...details });
  },
  callRinging: (details?: Record<string, unknown>) => push('call_ringing', details ?? {}),
  callAccepted: (details?: Record<string, unknown>) => {
    recordSuccessfulAction('call_accepted', details);
    push('call_accepted', details ?? {});
  },
  callConnected: (details?: Record<string, unknown>) => {
    recordSuccessfulAction('call_connected', details);
    push('call_connected', details ?? {});
  },

  holdStarted: (source: 'local_system' | 'remote_socket', details?: Record<string, unknown>) =>
    push('call_hold_started', { source, ...details }),
  holdEnded: (source: 'local_system' | 'remote_socket', details?: Record<string, unknown>) =>
    push('call_hold_ended', { source, ...details }),

  gsmDetected: (details?: Record<string, unknown>) => push('gsm_detected', details ?? {}),
  gsmAnswered: (details?: Record<string, unknown>) => push('gsm_answered', details ?? {}),
  gsmEnded: (details?: Record<string, unknown>) => push('gsm_ended', details ?? {}),

  gsmRecoveryStart: (details?: Record<string, unknown>) => {
    gsmRecoveryStartedAtMs = Date.now();
    push('gsm_recovery_start', { startedAtMs: gsmRecoveryStartedAtMs, ...details });
  },
  gsmRecoveryEnd: (
    success: boolean,
    details?: Record<string, unknown>
  ) => {
    const startedAt = gsmRecoveryStartedAtMs;
    const durationMs = startedAt != null ? Date.now() - startedAt : null;
    gsmRecoveryStartedAtMs = null;
    if (success) {
      recordSuccessfulAction('gsm_recovery', details);
    } else {
      recordFailedAction('gsm_recovery', details);
    }
    push('gsm_recovery_end', {
      success,
      durationMs,
      finalCallState: getCallDiagnosticsSnapshot(),
      ...details,
    });
    void flushPersist(true);
  },

  appBackgrounded: (state: string) => push('app_backgrounded', { appState: state }),
  appForegrounded: (state: string) => push('app_foregrounded', { appState: state }),

  audioInterruption: (details: Record<string, unknown>) =>
    push('audio_interruption', details),

  streamStateChange: (callingState: string, details?: Record<string, unknown>) => {
    const prev = liveSnapshot.streamCallingState;
    updateCallDiagnosticsLiveState({ streamCallingState: callingState });
    push('stream_state_change', { callingState, previous: prev, ...details });
  },

  participantJoined: (details?: Record<string, unknown>) =>
    push('participant_joined', details ?? {}),
  participantLeft: (details?: Record<string, unknown>) =>
    push('participant_left', details ?? {}),

  connectionLost: (details?: Record<string, unknown>) =>
    push('connection_lost', details ?? {}),
  connectionRestored: (details?: Record<string, unknown>) => {
    recordSuccessfulAction('connection_restored', details);
    push('connection_restored', details ?? {});
  },
  reconnectionAttempt: (details?: Record<string, unknown>) =>
    push('reconnection_attempt', details ?? {}),

  callEnded: (source: string, details?: Record<string, unknown>, opts?: { finalize?: boolean }) => {
    const category = categorizeEndSource(source);
    push('call_ended', {
      source,
      endCategory: category,
      ...details,
    });
    if (opts?.finalize !== false) {
      archiveLastCall(source);
    }
  },
  finalizeCallOutcome: (source: string, details?: Record<string, unknown>) => {
    push('info', { message: 'finalize_call_outcome', source, ...details });
    archiveLastCall(source);
  },
  callEndSuppressed: (sourceEvent: string, details?: Record<string, unknown>) => {
    const reason = typeof details?.reason === 'string' ? details.reason : sourceEvent;
    trackSuppression(sourceEvent, reason, details);
    if (details?.deferredDuringGsm || details?.peerOnHold) {
      recordStateMismatch(
        'call_end_suppressed',
        `Call end from ${sourceEvent} suppressed (${reason}) while local state still considers call active`,
        details
      );
    }
  },
  callEndSuppressionReleased: (sourceEvent: string, reason: string) =>
    releaseSuppression(sourceEvent, reason),

  callEndReason: (reason: string, details?: Record<string, unknown>) =>
    push('call_end_reason', { reason, endCategory: categorizeEndSource(reason), ...details }),

  hangupClick: (details?: Record<string, unknown>) => push('hangup_click', details ?? {}),
  hangupBlocked: (reason: string, details?: Record<string, unknown>) =>
    push('hangup_blocked', { reason, blocked: true, ...details }),
  hangupDisconnectStart: (details?: Record<string, unknown>) =>
    push('hangup_disconnect_start', details ?? {}),
  hangupDisconnectComplete: (details?: Record<string, unknown>) => {
    recordSuccessfulAction('hangup_disconnect', details);
    push('hangup_disconnect_complete', details ?? {});
    void flushPersist(true);
  },

  remoteParticipantCountChanged,

  stateMismatch: recordStateMismatch,
  success: recordSuccessfulAction,
  failure: recordFailedAction,

  error: (message: string, details?: Record<string, unknown>) => {
    recordFailedAction(message, details);
    push('error', { message, ...details });
  },
  info: (message: string, details?: Record<string, unknown>) =>
    push('info', { message, ...details }),
};

let appStateHookInstalled = false;

export function ensureCallDiagnosticsAppStateHook(): void {
  if (appStateHookInstalled) return;
  appStateHookInstalled = true;
  void hydrateCallDiagnosticsFromStorage();
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      callDiag.appForegrounded(state);
    } else {
      callDiag.appBackgrounded(state);
    }
  });
}
