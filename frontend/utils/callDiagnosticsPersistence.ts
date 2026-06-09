import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@selectro/call_diagnostics_last_call_v1';

/** Persisted shape — mirrors callDiagnostics types without circular imports. */
export type PersistedCallDiagnosticsBundle = {
  version: 1;
  savedAt: string;
  savedAtMs: number;
  lastCallId: string | null;
  lastCallEndedAt: string | null;
  lastCallEndReason: string | null;
  outcomeSummary: Record<string, unknown> | null;
  snapshot: Record<string, unknown> | null;
  deviceSummary: Record<string, string>;
  entries: Array<Record<string, unknown>>;
  finalWindowEntries: Array<Record<string, unknown>>;
};

export async function persistCallDiagnosticsBundle(
  bundle: PersistedCallDiagnosticsBundle
): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(bundle));
  } catch {
    // Best-effort — in-memory logs still available this session.
  }
}

export async function loadPersistedCallDiagnosticsBundle(): Promise<PersistedCallDiagnosticsBundle | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedCallDiagnosticsBundle;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.entries)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function clearPersistedCallDiagnostics(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
