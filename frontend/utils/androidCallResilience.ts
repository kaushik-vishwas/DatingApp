import { Platform } from 'react-native';

type IncomingCallAndroidResilience = {
  startCallWebSocketForegroundService?(callLabel: string): boolean;
  stopCallWebSocketForegroundService?(): void;
  requestIgnoreBatteryOptimizationsAsync?(): Promise<{
    requested?: boolean;
    alreadyIgnored?: boolean;
    unavailable?: boolean;
  }>;
};

let nativeModule: IncomingCallAndroidResilience | null | undefined;

function getNativeModule(): IncomingCallAndroidResilience | null {
  if (Platform.OS !== 'android') return null;
  if (nativeModule !== undefined) return nativeModule;
  try {
    nativeModule = require('incoming-call-android').default as IncomingCallAndroidResilience;
  } catch {
    nativeModule = null;
  }
  return nativeModule;
}

/** Start call foreground service (Android only). No optional permission prompts. */
export async function activateAndroidCallResilience(callLabel: string): Promise<void> {
  if (Platform.OS !== 'android') return;
  const mod = getNativeModule();
  if (!mod) return;

  const label = callLabel.trim() || 'active_call';
  try {
    mod.startCallWebSocketForegroundService?.(label);
  } catch {
    // ignore
  }
}

/** Stop Android call network foreground service. */
export function deactivateAndroidCallResilience(): void {
  if (Platform.OS !== 'android') return;
  const mod = getNativeModule();
  if (!mod) return;
  try {
    mod.stopCallWebSocketForegroundService?.();
  } catch {
    // ignore
  }
}
