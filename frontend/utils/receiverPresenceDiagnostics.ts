import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';

import { getIncomingCallAndroidNativeModule } from '../modules/incoming-call-android';

const STORAGE_KEY = '@selectro/receiver_presence_diagnostics_v1';
const MAX_ENTRIES = 500;

export type PresenceDiagnosticEntry = {
  id: string;
  at: string;
  atMs: number;
  level: 'info' | 'warn' | 'error';
  event: string;
  details: Record<string, unknown>;
  appState: string;
  platform: string;
  deviceBrand: string | null;
  deviceModel: string | null;
  androidApi: string | null;
};

export type PresenceLogAnalysis = {
  entryCount: number;
  issueCount: number;
  lastEvent: string | null;
  lastEventAt: string | null;
  lastJsAliveAt: string | null;
  lastSessionStartedAt: string | null;
  silentGapBeforeLastSessionMs: number | null;
  silentGapBeforeLastSessionSec: number | null;
  lastHeartbeatAt: string | null;
  nativeFcmPresentCount: number;
  nativeKeepAliveDestroyedCount: number;
  socketDisconnectCount: number;
  likelyJsKilled: boolean;
  hints: string[];
};

type Listener = () => void;

let seq = 0;
const entries: PresenceDiagnosticEntry[] = [];
const listeners = new Set<Listener>();
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let ingestedNativeIds = new Set<string>();

function notify(): void {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // ignore
    }
  });
}

function schedulePersist(): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void flushPersist();
  }, 250);
}

async function flushPersist(): Promise<void> {
  try {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        savedAt: new Date().toISOString(),
        entries: entries.slice(-MAX_ENTRIES),
      })
    );
  } catch {
    // ignore
  }
}

export async function hydratePresenceDiagnostics(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { entries?: PresenceDiagnosticEntry[] };
    if (!Array.isArray(parsed.entries)) return;
    for (const e of parsed.entries) {
      if (!entries.some((x) => x.id === e.id)) entries.push(e);
    }
    if (entries.length > MAX_ENTRIES) {
      entries.splice(0, entries.length - MAX_ENTRIES);
    }
    notify();
  } catch {
    // ignore
  }
}

export function subscribePresenceDiagnostics(listener: Listener): () => void {
  void hydratePresenceDiagnostics();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function shouldFlushNow(event: string, level: PresenceDiagnosticEntry['level']): boolean {
  if (level !== 'info') return true;
  return (
    event.startsWith('app_state') ||
    event.startsWith('native_') ||
    event.startsWith('incoming_') ||
    event === 'receiver_js_session_started' ||
    event === 'keep_alive_started' ||
    event === 'keep_alive_stopped' ||
    event === 'call_invite_ack' ||
    event === 'call_invite_unanswered'
  );
}

export function logPresenceDiagnostic(
  event: string,
  details: Record<string, unknown> = {},
  level: 'info' | 'warn' | 'error' = 'info'
): void {
  const entry: PresenceDiagnosticEntry = {
    id: `${Date.now()}-${++seq}`,
    at: new Date().toISOString(),
    atMs: Date.now(),
    level,
    event,
    details,
    appState: AppState.currentState,
    platform: Platform.OS,
    deviceBrand: Device.brand ?? null,
    deviceModel: Device.modelName ?? null,
    androidApi:
      Platform.OS === 'android'
        ? String(typeof Platform.Version === 'number' ? Platform.Version : Platform.Version)
        : null,
  };
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) {
    entries.splice(0, entries.length - MAX_ENTRIES);
  }
  if (__DEV__) {
    console.log(`[PresenceDiag:${level}] ${event}`, details);
  }
  notify();
  if (shouldFlushNow(event, level)) {
    void flushPersist();
  } else {
    schedulePersist();
  }
}

export function logPresenceFailure(
  event: string,
  reason: string,
  details: Record<string, unknown> = {}
): void {
  logPresenceDiagnostic(event, { reason, ...details }, 'error');
}

export function logPresenceWarn(
  event: string,
  reason: string,
  details: Record<string, unknown> = {}
): void {
  logPresenceDiagnostic(event, { reason, ...details }, 'warn');
}

export function getPresenceDiagnosticEntries(): PresenceDiagnosticEntry[] {
  return [...entries];
}

export function getPresenceIssueCount(): number {
  return entries.filter((e) => e.level === 'error' || e.level === 'warn').length;
}

export function hasPresenceDiagnostics(): boolean {
  return entries.length > 0;
}

export function getLastPresenceFailure(): PresenceDiagnosticEntry | null {
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    if (entries[i].level === 'error') return entries[i];
  }
  return null;
}

function isJsAliveEvent(event: string): boolean {
  return (
    event === 'background_presence_attempt' ||
    event === 'background_heartbeat_started' ||
    event === 'http_background_grace_armed' ||
    event === 'socket_background_grace_armed' ||
    event === 'app_state_changed' ||
    event === 'receiver_js_session_started' ||
    event === 'call_socket_connected' ||
    event === 'call_socket_disconnected' ||
    event === 'foreground_presence_synced'
  );
}

export function analyzePresenceLog(): PresenceLogAnalysis {
  const last = entries[entries.length - 1] ?? null;
  const sessionStarts = entries.filter((e) => e.event === 'receiver_js_session_started');
  const lastSession = sessionStarts[sessionStarts.length - 1] ?? null;
  const beforeSession = lastSession
    ? [...entries]
        .reverse()
        .find((e) => e.atMs < lastSession.atMs && isJsAliveEvent(e.event) && e.id !== lastSession.id)
    : null;
  const gapMs =
    lastSession && beforeSession ? Math.max(0, lastSession.atMs - beforeSession.atMs) : null;
  const lastHeartbeat =
    [...entries].reverse().find((e) => e.event === 'background_presence_attempt') ?? null;
  const lastJs =
    [...entries].reverse().find((e) => isJsAliveEvent(e.event) && !e.event.startsWith('native_')) ??
    null;
  const nativeFcmPresentCount = entries.filter(
    (e) => e.event === 'native_fcm_incoming' || e.event === 'native_fcm_present_failed'
  ).length;
  const nativeKeepAliveDestroyedCount = entries.filter(
    (e) => e.event === 'native_keep_alive_destroyed' && e.details.intentional !== true
  ).length;
  const socketDisconnectCount = entries.filter((e) => e.event === 'call_socket_disconnected').length;

  const likelyJsKilled = Boolean(gapMs != null && gapMs > 90_000);
  const hints: string[] = [];
  if (likelyJsKilled && gapMs != null) {
    hints.push(
      `JS was silent for ${Math.round(gapMs / 1000)}s before the next session start — the process was likely killed or frozen.`
    );
  }
  if (nativeKeepAliveDestroyedCount > 0) {
    hints.push(
      'Native “You are online for calls” service was destroyed. OEM may have stopped the foreground service.'
    );
  }
  if (likelyJsKilled && nativeFcmPresentCount === 0) {
    hints.push(
      'No native FCM present breadcrumb in this log. If a call was placed during the gap, the push may not have reached the device (missing FCM token / FCM v1 not configured / OEM blocked).'
    );
  }
  if (nativeFcmPresentCount > 0 && likelyJsKilled) {
    hints.push(
      'Native FCM did present while JS was dead. If the user still heard nothing, full-screen intent, notification permission, or OEM heads-up is the next place to look.'
    );
  }
  const lastPush = [...entries].reverse().find((e) => e.event === 'push_token_refresh');
  if (lastPush && lastPush.level === 'warn') {
    const expoErr = typeof lastPush.details.expoError === 'string' ? lastPush.details.expoError : '';
    const fcmErr = typeof lastPush.details.fcmError === 'string' ? lastPush.details.fcmError : '';
    const extra = [expoErr && `Expo: ${expoErr}`, fcmErr && `FCM: ${fcmErr}`].filter(Boolean).join(' · ');
    hints.push(
      extra
        ? `Last push-token refresh did not get Expo or FCM tokens (${extra}). Incoming calls still ring via the Go Online keep-alive poll.`
        : 'Last push-token refresh did not get Expo or FCM tokens. Incoming calls still ring via the Go Online keep-alive poll.'
    );
  }
  if (entries.some((e) => e.event === 'native_keepalive_incoming')) {
    hints.push('Native keep-alive presented an incoming-call notification (poll path).');
  }
  if (entries.some((e) => e.event === 'keep_alive_start_unavailable' || e.event === 'keep_alive_start_failed')) {
    hints.push('Keep-alive foreground service did not start. Rebuild the Android app with the native module.');
  }

  return {
    entryCount: entries.length,
    issueCount: getPresenceIssueCount(),
    lastEvent: last?.event ?? null,
    lastEventAt: last?.at ?? null,
    lastJsAliveAt: lastJs?.at ?? null,
    lastSessionStartedAt: lastSession?.at ?? null,
    silentGapBeforeLastSessionMs: gapMs,
    silentGapBeforeLastSessionSec: gapMs != null ? Math.round(gapMs / 1000) : null,
    lastHeartbeatAt: lastHeartbeat?.at ?? null,
    nativeFcmPresentCount,
    nativeKeepAliveDestroyedCount,
    socketDisconnectCount,
    likelyJsKilled,
    hints,
  };
}

function parseNativeLine(raw: string): PresenceDiagnosticEntry | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const event = typeof parsed.event === 'string' ? parsed.event : '';
    if (!event) return null;
    const atMs = typeof parsed.atMs === 'number' ? parsed.atMs : Date.now();
    const at = typeof parsed.at === 'string' ? parsed.at : new Date(atMs).toISOString();
    const id = `native-${atMs}-${event}-${String(parsed.callId ?? parsed.source ?? '')}`;
    const details: Record<string, unknown> = { ...parsed };
    delete details.event;
    delete details.at;
    delete details.atMs;
    const failed =
      event.includes('fail') ||
      parsed.presented === false ||
      (event.includes('destroyed') && parsed.intentional !== true);
    return {
      id,
      at,
      atMs,
      level: failed ? 'error' : event.includes('skip') || event.includes('denied') ? 'warn' : 'info',
      event,
      details,
      appState: 'unknown',
      platform: Platform.OS,
      deviceBrand: Device.brand ?? null,
      deviceModel: Device.modelName ?? null,
      androidApi:
        Platform.OS === 'android'
          ? String(typeof Platform.Version === 'number' ? Platform.Version : Platform.Version)
          : null,
    };
  } catch {
    return null;
  }
}

/** Pull native JSONL written while JS was dead, then clear the file. */
export async function ingestNativePresenceWakeLog(): Promise<number> {
  if (Platform.OS !== 'android') return 0;
  try {
    const mod = getIncomingCallAndroidNativeModule();
    const raw = typeof mod?.readNativePresenceWakeLog === 'function' ? mod.readNativePresenceWakeLog() : '';
    if (!raw.trim()) return 0;
    let added = 0;
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const entry = parseNativeLine(trimmed);
      if (!entry) continue;
      if (ingestedNativeIds.has(entry.id) || entries.some((e) => e.id === entry.id)) continue;
      ingestedNativeIds.add(entry.id);
      entries.push(entry);
      added += 1;
    }
    if (entries.length > MAX_ENTRIES) {
      entries.splice(0, entries.length - MAX_ENTRIES);
    }
    if (added > 0) {
      entries.sort((a, b) => a.atMs - b.atMs);
      notify();
      await flushPersist();
    }
    if (typeof mod?.clearNativePresenceWakeLog === 'function') {
      mod.clearNativePresenceWakeLog();
    }
    return added;
  } catch {
    return 0;
  }
}

export function formatPresenceDiagnosticsForExport(): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      appVersion: Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? 'unknown',
      issueCount: getPresenceIssueCount(),
      lastFailure: getLastPresenceFailure(),
      analysis: analyzePresenceLog(),
      entries,
    },
    null,
    2
  );
}

export async function clearPresenceDiagnostics(): Promise<void> {
  entries.length = 0;
  ingestedNativeIds = new Set();
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  try {
    getIncomingCallAndroidNativeModule()?.clearNativePresenceWakeLog?.();
  } catch {
    // ignore
  }
  notify();
}
