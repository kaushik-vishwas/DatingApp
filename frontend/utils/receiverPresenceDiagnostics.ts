import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';

const STORAGE_KEY = '@selectro/receiver_presence_diagnostics_v1';
const MAX_ENTRIES = 400;

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

type Listener = () => void;

let seq = 0;
const entries: PresenceDiagnosticEntry[] = [];
const listeners = new Set<Listener>();
let persistTimer: ReturnType<typeof setTimeout> | null = null;

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
  }, 500);
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
  schedulePersist();
}

export function logPresenceFailure(
  event: string,
  reason: string,
  details: Record<string, unknown> = {}
): void {
  logPresenceDiagnostic(event, { reason, ...details }, 'error');
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

export function formatPresenceDiagnosticsForExport(): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      appVersion: Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? 'unknown',
      issueCount: getPresenceIssueCount(),
      lastFailure: getLastPresenceFailure(),
      entries,
    },
    null,
    2
  );
}

export async function clearPresenceDiagnostics(): Promise<void> {
  entries.length = 0;
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  notify();
}
