import { AppState, Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import type { Socket } from 'socket.io-client';
import { callDiag } from './callDiagnostics';
import {
  ANDROID_CONNECTION_TIMEOUT_HANGING_MS,
  ANDROID_CONNECTION_TIMEOUT_RECONNECTING_MS,
  ANDROID_KEEPALIVE_INTERVAL_MS,
  ANDROID_STREAM_DISCONNECTION_TIMEOUT_SEC,
  getCallSocketIoOptions,
  isAndroidPlatform,
} from './androidCallNetwork';

export type GsmTimelineKey =
  | 'T0_gsm_arrived'
  | 'T1_audio_focus_lost'
  | 'T2_last_ping_sent'
  | 'T3_last_pong_received'
  | 'T4_timeout_would_fire'
  | 'T5_disconnect'
  | 'T6_gsm_ended';

export type DisconnectCause =
  | 'TIMEOUT'
  | 'NETWORK_CHANGE'
  | 'SDK_INTERNAL'
  | 'REMOTE_END'
  | 'UNKNOWN';

export type GsmDisconnectForensicBundle = {
  version: 2;
  generatedAt: string;
  generatedAtMs: number;
  callId: string | null;
  disconnectSource: string | null;
  disconnectCause: DisconnectCause | null;
  disconnectCauseDetail: string | null;
  hypothesis: string;
  timeline: Record<GsmTimelineKey, number | null> & {
    idleBeforeTimeoutMs: number | null;
    disconnectMinusLastPongMs: number | null;
  };
  socketIoConfig: {
    pingTimeoutMs: number;
    pingIntervalMs: number;
    reconnectionDelayMaxMs: number;
    connectionTimeoutHangingMs: number;
    connectionTimeoutReconnectingMs: number;
  };
  streamSdkConfig: {
    disconnectionTimeoutSec: number | null;
    coordinatorPingIntervalMs: number | null;
    coordinatorConnectionCheckTimeoutMs: number | null;
    coordinatorIsHealthy: boolean | null;
    sfuPingIntervalMs: number | null;
    sfuUnhealthyTimeoutMs: number | null;
    sfuLastMessageAgeMs: number | null;
  };
  lastTransport: {
    lastPingSentAtMs: number | null;
    lastPongReceivedAtMs: number | null;
    lastSocketIoPingAtMs: number | null;
    lastSocketIoPongAtMs: number | null;
    lastAppKeepaliveAtMs: number | null;
    lastAppKeepaliveAckAtMs: number | null;
    lastStreamCoordinatorEventAtMs: number | null;
    lastStreamSfuMessageAtMs: number | null;
  };
  network: {
    typeBeforeGsm: string | null;
    lastType: string | null;
    changes: Array<{
      atMs: number;
      from: string | null;
      to: string;
      callbackDelayMs: number | null;
    }>;
    reconnectDuringGsmHold: boolean;
  };
  streamStateSamples: Array<{
    atMs: number;
    callingState: string | null;
    coordinatorWsReadyState: number | null;
    sfuWsReadyState: number | null;
    coordinatorHealthy: boolean | null;
    reconnectAttempts: number | null;
    remoteParticipantCount: number | null;
    systemCallHold: boolean;
    peerCallHold: boolean;
    gsmInterruptPending: boolean;
    appState: string;
  }>;
  pingPongLog: Array<Record<string, unknown>>;
  telephonyLog: Array<Record<string, unknown>>;
  rootCauseProbes: {
    A_backgroundHeartbeatSuspended: ProbeVerdict;
    B_tcpKeepaliveBlocked: ProbeVerdict;
    C_audioFocusMisinterpretedAsDisconnect: ProbeVerdict;
    D_shorterReconnectTimeoutOnDevice: ProbeVerdict;
    E_implicitLeftWithoutExplicitSignal: ProbeVerdict;
  };
  analystNotes: string[];
};

type ProbeVerdict = {
  likely: boolean;
  confidence: 'low' | 'medium' | 'high';
  evidence: string;
  details: Record<string, unknown>;
};

type SocketProbeState = {
  channel: string;
  socket: Socket;
  cleanup: () => void;
};

let activeCallId: string | null = null;
let probeRunning = false;
let streamPollTimer: ReturnType<typeof setInterval> | null = null;
let netInfoUnsub: (() => void) | null = null;
let telephonyUnsub: (() => void) | null = null;
let streamCallRef: unknown = null;
let streamClientRef: unknown = null;

const timeline: Record<GsmTimelineKey, number | null> = {
  T0_gsm_arrived: null,
  T1_audio_focus_lost: null,
  T2_last_ping_sent: null,
  T3_last_pong_received: null,
  T4_timeout_would_fire: null,
  T5_disconnect: null,
  T6_gsm_ended: null,
};

let networkTypeBeforeGsm: string | null = null;
let lastNetworkType: string | null = null;
const networkChanges: GsmDisconnectForensicBundle['network']['changes'] = [];
let socketReconnectDuringGsm = false;

const pingPongLog: Array<Record<string, unknown>> = [];
const telephonyLog: Array<Record<string, unknown>> = [];
const streamStateSamples: GsmDisconnectForensicBundle['streamStateSamples'] = [];

let lastPingSentAtMs: number | null = null;
let lastPongReceivedAtMs: number | null = null;
let lastSocketIoPingAtMs: number | null = null;
let lastSocketIoPongAtMs: number | null = null;
let lastAppKeepaliveAtMs: number | null = null;
let lastAppKeepaliveAckAtMs: number | null = null;
let lastStreamCoordinatorEventAtMs: number | null = null;
let lastStreamSfuMessageAtMs: number | null = null;

let scheduledTimeoutFireAtMs: number | null = null;
let timeoutResets = 0;

let cachedForensicBundle: GsmDisconnectForensicBundle | null = null;
let lastExportPath: string | null = null;

const socketProbes = new Map<string, SocketProbeState>();

const MAX_PING_PONG_LOG = 400;
const MAX_TELEPHONY_LOG = 200;
const MAX_STREAM_SAMPLES = 120;

function nowMs(): number {
  return Date.now();
}

function pushPingPong(entry: Record<string, unknown>): void {
  pingPongLog.push({ atMs: nowMs(), ...entry });
  if (pingPongLog.length > MAX_PING_PONG_LOG) {
    pingPongLog.splice(0, pingPongLog.length - MAX_PING_PONG_LOG);
  }
  callDiag.info('probe_transport', entry);
}

function pushTelephony(entry: Record<string, unknown>): void {
  telephonyLog.push({ atMs: nowMs(), ...entry });
  if (telephonyLog.length > MAX_TELEPHONY_LOG) {
    telephonyLog.splice(0, telephonyLog.length - MAX_TELEPHONY_LOG);
  }
  callDiag.info('probe_telephony', entry);
}

function scheduleTimeoutFire(fromMs: number, timeoutMs: number, source: string): void {
  scheduledTimeoutFireAtMs = fromMs + timeoutMs;
  pushPingPong({
    kind: 'timeout_scheduled',
    source,
    fromMs,
    timeoutMs,
    wouldFireAtMs: scheduledTimeoutFireAtMs,
  });
  callDiag.info('probe_timeout_scheduled', {
    source,
    timeoutMs,
    wouldFireAtMs: scheduledTimeoutFireAtMs,
  });
}

function resetTimeoutTimer(source: string): void {
  timeoutResets += 1;
  const opts = getCallSocketIoOptions();
  const timeoutMs = opts.pingTimeout ?? ANDROID_CONNECTION_TIMEOUT_HANGING_MS;
  const base = lastPongReceivedAtMs ?? lastSocketIoPongAtMs ?? nowMs();
  scheduleTimeoutFire(base, timeoutMs, `reset:${source}`);
  callDiag.info('probe_timeout_reset', { source, resetCount: timeoutResets, baseMs: base });
}

export function markGsmTimeline(key: GsmTimelineKey, atMs = nowMs()): void {
  if (timeline[key] !== null) return;
  timeline[key] = atMs;
  callDiag.info('probe_timeline', { key, atMs });
  if (key === 'T0_gsm_arrived' && !networkTypeBeforeGsm) {
    networkTypeBeforeGsm = lastNetworkType;
  }
}

export function recordAppKeepaliveSent(): void {
  lastAppKeepaliveAtMs = nowMs();
  markGsmTimeline('T2_last_ping_sent', lastAppKeepaliveAtMs);
  pushPingPong({ kind: 'app_keepalive_sent', channel: 'app' });
}

export function recordAppKeepaliveAck(): void {
  lastAppKeepaliveAckAtMs = nowMs();
  markGsmTimeline('T3_last_pong_received', lastAppKeepaliveAckAtMs);
  resetTimeoutTimer('app_keepalive_ack');
  pushPingPong({ kind: 'app_keepalive_ack', channel: 'app' });
}

function readStreamInternals(call: unknown, client: unknown): GsmDisconnectForensicBundle['streamSdkConfig'] & {
  callingState: string | null;
  coordinatorWsReadyState: number | null;
  sfuWsReadyState: number | null;
  reconnectAttempts: number | null;
} {
  const c = call as Record<string, unknown> | null;
  const cl = client as Record<string, unknown> | null;
  const sfu = c?.sfuClient as Record<string, unknown> | undefined;
  const streamClient = (c?.streamClient ?? cl?.streamClient) as Record<string, unknown> | undefined;
  const wsConn = streamClient?.wsConnection as Record<string, unknown> | undefined;
  const signalWs = sfu?.signalWs as { readyState?: number } | undefined;
  const coordWs = wsConn?.ws as { readyState?: number } | undefined;
  const state = c?.state as { callingState?: string } | undefined;
  const lastMsg = sfu?.lastMessageTimestamp as Date | undefined;

  return {
    callingState: state?.callingState ?? null,
    coordinatorWsReadyState: coordWs?.readyState ?? null,
    sfuWsReadyState: signalWs?.readyState ?? null,
    reconnectAttempts: (c?.reconnectAttempts as number | undefined) ?? null,
    disconnectionTimeoutSec:
      (c?.disconnectionTimeoutSeconds as number | undefined) ??
      ANDROID_STREAM_DISCONNECTION_TIMEOUT_SEC,
    coordinatorPingIntervalMs: (wsConn?.pingInterval as number | undefined) ?? null,
    coordinatorConnectionCheckTimeoutMs:
      (wsConn?.connectionCheckTimeout as number | undefined) ?? null,
    coordinatorIsHealthy: (wsConn?.isHealthy as boolean | undefined) ?? null,
    sfuPingIntervalMs: (sfu?.pingIntervalInMs as number | undefined) ?? 5000,
    sfuUnhealthyTimeoutMs: (sfu?.unhealthyTimeoutInMs as number | undefined) ?? 15000,
    sfuLastMessageAgeMs:
      lastMsg instanceof Date ? Math.max(0, nowMs() - lastMsg.getTime()) : null,
  };
}

function sampleStreamState(): void {
  if (!probeRunning) return;
  const snap = callDiag.snapshot();
  const internals = readStreamInternals(streamCallRef, streamClientRef);
  if (internals.sfuLastMessageAgeMs != null && internals.sfuLastMessageAgeMs < 6000) {
    lastStreamSfuMessageAtMs = nowMs();
  }
  streamStateSamples.push({
    atMs: nowMs(),
    callingState: internals.callingState,
    coordinatorWsReadyState: internals.coordinatorWsReadyState,
    sfuWsReadyState: internals.sfuWsReadyState,
    coordinatorHealthy: internals.coordinatorIsHealthy,
    reconnectAttempts: internals.reconnectAttempts,
    remoteParticipantCount: snap.remoteParticipantCount,
    systemCallHold: snap.systemCallHold,
    peerCallHold: snap.peerCallHold,
    gsmInterruptPending: snap.gsmInterruptPending,
    appState: AppState.currentState,
  });
  if (streamStateSamples.length > MAX_STREAM_SAMPLES) {
    streamStateSamples.splice(0, streamStateSamples.length - MAX_STREAM_SAMPLES);
  }
  callDiag.info('probe_stream_sample', {
    callingState: internals.callingState,
    coordinatorWsReadyState: internals.coordinatorWsReadyState,
    sfuWsReadyState: internals.sfuWsReadyState,
    reconnectAttempts: internals.reconnectAttempts,
  });

  if (internals.callingState === 'reconnecting') {
    callDiag.reconnectionAttempt({
      source: 'stream_probe',
      callingState: internals.callingState,
      duringGsmHold: snap.systemCallHold || snap.peerCallHold || snap.gsmInterruptPending,
    });
  }
}

function attachSocketEngine(socket: Socket, channel: string): () => void {
  const manager = socket.io as {
    engine?: {
      on: (ev: string, fn: (...args: unknown[]) => void) => void;
      off?: (ev: string, fn: (...args: unknown[]) => void) => void;
      transport?: { ws?: { readyState?: number }; name?: string };
    };
    opts?: Record<string, unknown>;
  };

  const engine = manager.engine;
  if (!engine) return () => {};

  const opts = getCallSocketIoOptions();
  const pingTimeout = (manager.opts?.pingTimeout as number | undefined) ?? opts.pingTimeout ?? 20000;
  const pingInterval = (manager.opts?.pingInterval as number | undefined) ?? opts.pingInterval ?? 25000;

  callDiag.info('probe_socket_config', {
    channel,
    connection_timeout_hanging_ms: pingTimeout,
    connection_timeout_reconnecting_ms:
      (manager.opts?.reconnectionDelayMax as number | undefined) ??
      opts.reconnectionDelayMax ??
      ANDROID_CONNECTION_TIMEOUT_RECONNECTING_MS,
    pingIntervalMs: pingInterval,
    transport: engine.transport?.name ?? 'unknown',
  });

  const onPing = (): void => {
    const at = nowMs();
    lastSocketIoPingAtMs = at;
    markGsmTimeline('T2_last_ping_sent', at);
    pushPingPong({ kind: 'socketio_ping_received', direction: 'inbound', channel });
    scheduleTimeoutFire(at, pingTimeout, `socketio_ping:${channel}`);
  };

  const onPong = (latency: unknown): void => {
    const at = nowMs();
    lastSocketIoPongAtMs = at;
    lastPongReceivedAtMs = at;
    markGsmTimeline('T3_last_pong_received', at);
    resetTimeoutTimer(`socketio_pong:${channel}`);
    pushPingPong({
      kind: 'socketio_pong_sent',
      direction: 'outbound',
      channel,
      latencyMs: typeof latency === 'number' ? latency : null,
    });
  };

  const onClose = (reason: unknown): void => {
    const idleMs =
      lastPongReceivedAtMs != null ? nowMs() - lastPongReceivedAtMs : null;
    pushPingPong({
      kind: 'engine_close',
      channel,
      reason: String(reason),
      idleSinceLastPongMs: idleMs,
    });
    callDiag.connectionLost({
      channel,
      reason: String(reason),
      idleSinceLastPongMs: idleMs,
      wsReadyState: engine.transport?.ws?.readyState ?? null,
    });
  };

  const onDisconnect = (reason: unknown): void => {
    pushPingPong({ kind: 'engine_disconnect', channel, reason: String(reason) });
  };

  engine.on('ping', onPing);
  engine.on('pong', onPong);
  engine.on('close', onClose);
  engine.on('disconnect', onDisconnect);

  socket.on('connect', () => {
    callDiag.connectionRestored({ channel, probe: true });
    resetTimeoutTimer(`socket_connect:${channel}`);
  });
  socket.on('disconnect', (reason) => {
    const snap = callDiag.snapshot();
    if (snap.systemCallHold || snap.peerCallHold || snap.gsmInterruptPending) {
      socketReconnectDuringGsm = true;
    }
    pushPingPong({ kind: 'socket_disconnect', channel, reason });
  });
  socket.io.on('reconnect_attempt', (attempt: unknown) => {
    callDiag.reconnectionAttempt({ channel, attempt });
  });
  socket.io.on('reconnect', () => {
    callDiag.connectionRestored({ channel, reconnect: true });
  });

  return () => {
    engine.off?.('ping', onPing);
    engine.off?.('pong', onPong);
    engine.off?.('close', onClose);
    engine.off?.('disconnect', onDisconnect);
  };
}

export function attachSocketIoProbe(socket: Socket, channel: string): void {
  if (!isAndroidPlatform()) return;
  detachSocketIoProbe(channel);
  const cleanup = attachSocketEngine(socket, channel);
  socketProbes.set(channel, { channel, socket, cleanup });
}

export function detachSocketIoProbe(channel: string): void {
  const existing = socketProbes.get(channel);
  if (!existing) return;
  existing.cleanup();
  socketProbes.delete(channel);
}

export function attachStreamCallProbe(call: unknown, client: unknown): void {
  if (!isAndroidPlatform()) return;
  streamCallRef = call;
  streamClientRef = client;
  const internals = readStreamInternals(call, client);
  callDiag.info('probe_stream_sdk_config', {
    connection_timeout_hanging_ms: internals.coordinatorConnectionCheckTimeoutMs,
    coordinator_ping_interval_ms: internals.coordinatorPingIntervalMs,
    sfu_ping_interval_ms: internals.sfuPingIntervalMs,
    sfu_unhealthy_timeout_ms: internals.sfuUnhealthyTimeoutMs,
    disconnection_timeout_sec: internals.disconnectionTimeoutSec,
  });
}

export function detachStreamCallProbe(): void {
  streamCallRef = null;
  streamClientRef = null;
}

function initNetworkProbe(): void {
  if (!isAndroidPlatform()) return;
  try {
    const NetInfo = require('@react-native-community/netinfo').default as {
      fetch: () => Promise<{ type?: string; isConnected?: boolean | null }>;
      addEventListener: (
        fn: (state: { type?: string; isConnected?: boolean | null }) => void
      ) => () => void;
    };
    void NetInfo.fetch().then((state) => {
      lastNetworkType = state.type ?? null;
      if (!networkTypeBeforeGsm) networkTypeBeforeGsm = lastNetworkType;
    });
    const eventSeenAt = nowMs();
    netInfoUnsub = NetInfo.addEventListener((state) => {
      const callbackAt = nowMs();
      const nextType = state.type ?? 'unknown';
      const prev = lastNetworkType;
      if (prev !== nextType) {
        networkChanges.push({
          atMs: callbackAt,
          from: prev,
          to: nextType,
          callbackDelayMs: null,
        });
        callDiag.info('probe_network_change', {
          from: prev,
          to: nextType,
          isConnected: state.isConnected,
        });
      }
      lastNetworkType = nextType;
      void eventSeenAt;
    });
  } catch {
    callDiag.info('probe_network_unavailable', { reason: 'netinfo_missing' });
  }
}

function initTelephonyProbe(): void {
  if (!isAndroidPlatform()) return;
  try {
    const {
      getIncomingCallNativeEventEmitter,
      getIncomingCallNativeModule,
    } = require('./incomingCallNativeBridge') as typeof import('./incomingCallNativeBridge');
    const mod = getIncomingCallNativeModule();
    const emitter = getIncomingCallNativeEventEmitter();
    if (!mod || !emitter || typeof mod.startTelephonyDiagnosticsWatch !== 'function') {
      callDiag.info('probe_telephony_unavailable', { reason: 'native_module' });
      return;
    }
    const started = mod.startTelephonyDiagnosticsWatch();
    callDiag.info('probe_telephony_started', { started });
    const sub = emitter.addListener('onTelephonyDiagnostic', (payload: Record<string, unknown>) => {
      const eventAtMs =
        typeof payload.eventAtMs === 'number' ? payload.eventAtMs : nowMs();
      const receivedAtMs = nowMs();
      const callbackDelayMs = receivedAtMs - eventAtMs;
      const entry = {
        kind: payload.kind ?? 'unknown',
        eventAtMs,
        receivedAtMs,
        callbackDelayMs,
        audioMode: payload.audioMode,
        audioModeLabel: payload.audioModeLabel,
        callState: payload.callState,
        callStateLabel: payload.callStateLabel,
        appThinksGsmActive: payload.appThinksGsmActive,
        source: payload.source,
      };
      pushTelephony(entry);
      if (payload.kind === 'audio_mode_change' && payload.audioModeLabel === 'MODE_IN_CALL') {
        markGsmTimeline('T1_audio_focus_lost');
      }
      if (payload.kind === 'call_state_ringing' || payload.kind === 'call_state_offhook') {
        markGsmTimeline('T0_gsm_arrived', eventAtMs);
      }
      if (payload.kind === 'call_state_idle' && timeline.T0_gsm_arrived) {
        markGsmTimeline('T6_gsm_ended', eventAtMs);
      }
    });
    telephonyUnsub = () => {
      sub.remove();
      mod.stopTelephonyDiagnosticsWatch?.();
    };
  } catch {
    callDiag.info('probe_telephony_unavailable', { reason: 'native_module' });
  }
}

function buildRootCauseProbes(
  disconnectSource: string,
  idleBeforeTimeoutMs: number | null
): GsmDisconnectForensicBundle['rootCauseProbes'] {
  const snap = callDiag.snapshot();
  const internals = readStreamInternals(streamCallRef, streamClientRef);
  const gsmActive = Boolean(timeline.T0_gsm_arrived && !timeline.T6_gsm_ended);
  const pingGapMs =
    lastPongReceivedAtMs != null ? nowMs() - lastPongReceivedAtMs : null;

  const A: ProbeVerdict = {
    likely:
      gsmActive &&
      pingGapMs != null &&
      pingGapMs > (internals.sfuPingIntervalMs ?? 5000) * 2 &&
      AppState.currentState !== 'active',
    confidence: 'medium',
    evidence:
      'Heartbeat gap exceeds 2× SFU ping interval while GSM hold active and app not foreground',
    details: { pingGapMs, gsmActive, appState: AppState.currentState },
  };

  const B: ProbeVerdict = {
    likely:
      disconnectSource.includes('timeout') ||
      (idleBeforeTimeoutMs != null &&
        idleBeforeTimeoutMs >= (getCallSocketIoOptions().pingTimeout ?? 10000) - 500),
    confidence: idleBeforeTimeoutMs != null && idleBeforeTimeoutMs < 15000 ? 'high' : 'medium',
    evidence:
      'Disconnect idle window matches Socket.IO pingTimeout (~10s on strict OEM builds before our 60s override)',
    details: { idleBeforeTimeoutMs, configuredPingTimeout: getCallSocketIoOptions().pingTimeout },
  };

  const C: ProbeVerdict = {
    likely:
      timeline.T1_audio_focus_lost != null &&
      timeline.T5_disconnect != null &&
      timeline.T5_disconnect - timeline.T1_audio_focus_lost < 15_000 &&
      networkChanges.length === 0,
    confidence: 'medium',
    evidence: 'Disconnect within 15s of audio focus loss without network type change',
    details: {
      audioToDisconnectMs:
        timeline.T1_audio_focus_lost && timeline.T5_disconnect
          ? timeline.T5_disconnect - timeline.T1_audio_focus_lost
          : null,
    },
  };

  const D: ProbeVerdict = {
    likely:
      (internals.disconnectionTimeoutSec ?? 0) > 0 &&
      (internals.disconnectionTimeoutSec ?? 0) < 30 &&
      internals.callingState === 'reconnecting',
    confidence: 'medium',
    evidence: 'Stream reconnecting with sub-30s disconnectionTimeout configured',
    details: {
      disconnectionTimeoutSec: internals.disconnectionTimeoutSec,
      callingState: internals.callingState,
    },
  };

  const E: ProbeVerdict = {
    likely:
      internals.callingState === 'left' &&
      !disconnectSource.includes('user_hangup') &&
      !disconnectSource.startsWith('socket_'),
    confidence: 'high',
    evidence:
      'Stream callingState reached LEFT while signaling still showed JOINED (matches prior logs)',
    details: {
      callingState: internals.callingState,
      disconnectSource,
      streamStateAtDisconnect: snap.streamCallingState,
    },
  };

  return {
    A_backgroundHeartbeatSuspended: A,
    B_tcpKeepaliveBlocked: B,
    C_audioFocusMisinterpretedAsDisconnect: C,
    D_shorterReconnectTimeoutOnDevice: D,
    E_implicitLeftWithoutExplicitSignal: E,
  };
}

function resolveDisconnectCause(
  disconnectSource: string,
  idleBeforeTimeoutMs: number | null
): { cause: DisconnectCause; detail: string } {
  const s = disconnectSource.toLowerCase();
  if (s.includes('timeout') || (idleBeforeTimeoutMs != null && idleBeforeTimeoutMs >= 9000)) {
    return {
      cause: 'TIMEOUT',
      detail: `DISCONNECT_CAUSE: TIMEOUT idle=${idleBeforeTimeoutMs ?? 'unknown'}ms`,
    };
  }
  if (networkChanges.length > 0 && timeline.T5_disconnect != null) {
    const lastNet = networkChanges[networkChanges.length - 1];
    if (timeline.T5_disconnect - lastNet.atMs < 3000) {
      return {
        cause: 'NETWORK_CHANGE',
        detail: `DISCONNECT_CAUSE: NETWORK_CHANGE ${lastNet.from ?? '?'} -> ${lastNet.to}`,
      };
    }
  }
  if (s.startsWith('socket_') || s.includes('remote')) {
    return { cause: 'REMOTE_END', detail: `DISCONNECT_CAUSE: REMOTE_END source=${disconnectSource}` };
  }
  if (s.includes('stream_') || s.includes('session_sync') || s.includes('reconnect')) {
    return { cause: 'SDK_INTERNAL', detail: `DISCONNECT_CAUSE: SDK_INTERNAL source=${disconnectSource}` };
  }
  return { cause: 'UNKNOWN', detail: `DISCONNECT_CAUSE: UNKNOWN source=${disconnectSource}` };
}

function buildHypothesis(probes: GsmDisconnectForensicBundle['rootCauseProbes']): string {
  const ranked = Object.entries(probes)
    .filter(([, v]) => v.likely)
    .sort((a, b) => {
      const score = (v: ProbeVerdict) => (v.confidence === 'high' ? 3 : v.confidence === 'medium' ? 2 : 1);
      return score(b[1]) - score(a[1]);
    });
  if (ranked.length === 0) {
    return 'No dominant probe fired; collect another reproduction with this forensic bundle.';
  }
  const [key, verdict] = ranked[0];
  return `Most likely: ${key} — ${verdict.evidence}`;
}

export function buildGsmDisconnectForensicBundle(
  disconnectSource: string
): GsmDisconnectForensicBundle {
  const opts = getCallSocketIoOptions();
  const internals = readStreamInternals(streamCallRef, streamClientRef);
  const idleBeforeTimeoutMs =
    timeline.T4_timeout_would_fire != null && timeline.T3_last_pong_received != null
      ? timeline.T4_timeout_would_fire - timeline.T3_last_pong_received
      : scheduledTimeoutFireAtMs != null && lastPongReceivedAtMs != null
        ? scheduledTimeoutFireAtMs - lastPongReceivedAtMs
        : null;
  const disconnectMinusLastPongMs =
    timeline.T5_disconnect != null && lastPongReceivedAtMs != null
      ? timeline.T5_disconnect - lastPongReceivedAtMs
      : null;

  const { cause, detail } = resolveDisconnectCause(disconnectSource, idleBeforeTimeoutMs);
  const rootCauseProbes = buildRootCauseProbes(disconnectSource, idleBeforeTimeoutMs);

  const bundle: GsmDisconnectForensicBundle = {
    version: 2,
    generatedAt: new Date().toISOString(),
    generatedAtMs: nowMs(),
    callId: activeCallId,
    disconnectSource,
    disconnectCause: cause,
    disconnectCauseDetail: detail,
    hypothesis: buildHypothesis(rootCauseProbes),
    timeline: {
      ...timeline,
      idleBeforeTimeoutMs,
      disconnectMinusLastPongMs,
    },
    socketIoConfig: {
      pingTimeoutMs: (opts.pingTimeout as number | undefined) ?? ANDROID_CONNECTION_TIMEOUT_HANGING_MS,
      pingIntervalMs: (opts.pingInterval as number | undefined) ?? ANDROID_KEEPALIVE_INTERVAL_MS,
      reconnectionDelayMaxMs:
        (opts.reconnectionDelayMax as number | undefined) ??
        ANDROID_CONNECTION_TIMEOUT_RECONNECTING_MS,
      connectionTimeoutHangingMs: ANDROID_CONNECTION_TIMEOUT_HANGING_MS,
      connectionTimeoutReconnectingMs: ANDROID_CONNECTION_TIMEOUT_RECONNECTING_MS,
    },
    streamSdkConfig: {
      disconnectionTimeoutSec: internals.disconnectionTimeoutSec,
      coordinatorPingIntervalMs: internals.coordinatorPingIntervalMs,
      coordinatorConnectionCheckTimeoutMs: internals.coordinatorConnectionCheckTimeoutMs,
      coordinatorIsHealthy: internals.coordinatorIsHealthy,
      sfuPingIntervalMs: internals.sfuPingIntervalMs,
      sfuUnhealthyTimeoutMs: internals.sfuUnhealthyTimeoutMs,
      sfuLastMessageAgeMs: internals.sfuLastMessageAgeMs,
    },
    lastTransport: {
      lastPingSentAtMs,
      lastPongReceivedAtMs,
      lastSocketIoPingAtMs,
      lastSocketIoPongAtMs,
      lastAppKeepaliveAtMs,
      lastAppKeepaliveAckAtMs,
      lastStreamCoordinatorEventAtMs,
      lastStreamSfuMessageAtMs,
    },
    network: {
      typeBeforeGsm: networkTypeBeforeGsm,
      lastType: lastNetworkType,
      changes: [...networkChanges],
      reconnectDuringGsmHold: socketReconnectDuringGsm,
    },
    streamStateSamples: [...streamStateSamples],
    pingPongLog: [...pingPongLog],
    telephonyLog: [...telephonyLog],
    rootCauseProbes,
    analystNotes: [
      'Stream SFU uses 5s ping / 15s unhealthy timeout — separate from Socket.IO 60s config.',
      'Coordinator WS uses 25s ping + 35s health check (connectionCheckTimeout) in SDK defaults.',
      'Prior logs: receiver socket_call_ended while streamCallingState=joined suggests signaling path ended before Stream teardown.',
      'remote_count_zero_while_talk_active on caller often follows peer signaling drop, not local GSM.',
      cause === 'TIMEOUT'
        ? 'If idle ~10s at disconnect, OEM WebSocket policy may still apply below Socket.IO layer.'
        : 'Timeout pattern not dominant in this capture — check REMOTE_END vs SDK_INTERNAL probes.',
    ],
  };

  cachedForensicBundle = bundle;
  callDiag.info('disconnect_forensics', {
    disconnectCause: cause,
    detail,
    hypothesis: bundle.hypothesis,
    idleBeforeTimeoutMs,
    disconnectMinusLastPongMs,
  });
  return bundle;
}

export async function exportGsmDisconnectForensics(
  disconnectSource: string
): Promise<string | null> {
  if (!isAndroidPlatform()) return null;
  const bundle = buildGsmDisconnectForensicBundle(disconnectSource);
  try {
    const baseDir =
      (FileSystem as { documentDirectory?: string | null }).documentDirectory ??
      (FileSystem as { cacheDirectory?: string | null }).cacheDirectory;
    if (!baseDir) return null;
    const fileName = `gsm-disconnect-forensics-${bundle.callId ?? 'unknown'}-${bundle.generatedAtMs}.json`;
    const path = `${baseDir}${fileName}`;
    await FileSystem.writeAsStringAsync(path, JSON.stringify(bundle, null, 2));
    lastExportPath = path;
    callDiag.info('disconnect_forensics_exported', { path, fileName });
    return path;
  } catch (e) {
    callDiag.error('disconnect_forensics_export_failed', {
      message: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

export function getGsmDisconnectForensicBundle(): GsmDisconnectForensicBundle | null {
  return cachedForensicBundle;
}

export function getLastForensicExportPath(): string | null {
  return lastExportPath;
}

export function hydrateGsmForensicsFromPersisted(
  bundle: Record<string, unknown> | null | undefined,
  exportPath?: string | null
): void {
  if (!bundle || typeof bundle !== 'object') return;
  cachedForensicBundle = bundle as unknown as GsmDisconnectForensicBundle;
  if (exportPath) lastExportPath = exportPath;
}

export function startGsmDisconnectProbe(callId: string): void {
  if (!isAndroidPlatform()) return;
  stopGsmDisconnectProbe();
  activeCallId = callId.trim() || null;
  probeRunning = true;
  Object.keys(timeline).forEach((k) => {
    timeline[k as GsmTimelineKey] = null;
  });
  networkTypeBeforeGsm = lastNetworkType;
  networkChanges.length = 0;
  pingPongLog.length = 0;
  telephonyLog.length = 0;
  streamStateSamples.length = 0;
  socketReconnectDuringGsm = false;
  timeoutResets = 0;
  cachedForensicBundle = null;
  lastExportPath = null;

  initNetworkProbe();
  initTelephonyProbe();
  streamPollTimer = setInterval(sampleStreamState, 1000);
  sampleStreamState();
  callDiag.info('probe_session_started', { callId: activeCallId });
}

export function stopGsmDisconnectProbe(): void {
  probeRunning = false;
  if (streamPollTimer) {
    clearInterval(streamPollTimer);
    streamPollTimer = null;
  }
  netInfoUnsub?.();
  netInfoUnsub = null;
  telephonyUnsub?.();
  telephonyUnsub = null;
  for (const ch of [...socketProbes.keys()]) {
    detachSocketIoProbe(ch);
  }
  detachStreamCallProbe();
}

export async function finalizeGsmDisconnectProbe(disconnectSource: string): Promise<void> {
  if (!isAndroidPlatform()) return;
  markGsmTimeline('T5_disconnect');
  if (scheduledTimeoutFireAtMs != null) {
    markGsmTimeline('T4_timeout_would_fire', scheduledTimeoutFireAtMs);
  }
  buildGsmDisconnectForensicBundle(disconnectSource);
  await exportGsmDisconnectForensics(disconnectSource);
  stopGsmDisconnectProbe();
}
