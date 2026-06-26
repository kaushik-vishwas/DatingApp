import { PermissionsAndroid, Platform } from 'react-native';
import { EventEmitter, type EventSubscription } from 'expo-modules-core';

type IncomingCallAndroidNative = {
  startCellularCallHoldWatch(): boolean;
  stopCellularCallHoldWatch(): void;
  refreshCellularCallHoldTelephony?(): boolean;
};

let nativeModule: IncomingCallAndroidNative | null | undefined;
let emitter: EventEmitter | null = null;
let watchRefCount = 0;

function getNativeModule(): IncomingCallAndroidNative | null {
  if (Platform.OS !== 'android') return null;
  if (nativeModule !== undefined) return nativeModule;
  try {
    nativeModule = require('incoming-call-android').default as IncomingCallAndroidNative;
  } catch {
    nativeModule = null;
  }
  return nativeModule;
}

function getEmitter(): EventEmitter | null {
  const mod = getNativeModule();
  if (!mod) return null;
  if (!emitter) {
    emitter = new EventEmitter(mod as unknown as Record<string, unknown>);
  }
  return emitter;
}

/** Request READ_PHONE_STATE so telephony OFFHOOK detection works during in-app calls. */
export async function ensureAndroidReadPhoneStatePermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const permission = PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE;
  try {
    const alreadyGranted = await PermissionsAndroid.check(permission);
    if (alreadyGranted) return true;
    const result = await PermissionsAndroid.request(permission, {
      title: 'Phone permission',
      message:
        'Allow phone state access so your in-app call can pause when you answer a cellular call.',
      buttonPositive: 'Allow',
      buttonNegative: 'Not now',
    });
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

/** Re-bind telephony listener after runtime permission is granted. */
export function refreshAndroidCellularCallHoldWatch(): void {
  const mod = getNativeModule();
  if (!mod?.refreshCellularCallHoldTelephony) return;
  try {
    mod.refreshCellularCallHoldTelephony();
  } catch {
    // ignore
  }
}

/** Audio-mode + telephony watcher when READ_PHONE_STATE is granted at runtime. */
export function startAndroidCellularCallHoldWatch(): void {
  const mod = getNativeModule();
  if (!mod) return;
  watchRefCount += 1;
  if (watchRefCount > 1) return;
  try {
    mod.startCellularCallHoldWatch();
  } catch {
    watchRefCount = Math.max(0, watchRefCount - 1);
  }
}

export function stopAndroidCellularCallHoldWatch(): void {
  const mod = getNativeModule();
  if (!mod) return;
  watchRefCount = Math.max(0, watchRefCount - 1);
  if (watchRefCount > 0) return;
  try {
    mod.stopCellularCallHoldWatch();
  } catch {
    // ignore
  }
}

export type CellularCallHoldEvent = {
  active: boolean;
  audioMode?: number;
  source?: string;
};

export function subscribeAndroidCellularCallHold(
  handler: (event: CellularCallHoldEvent) => void
): () => void {
  const ev = getEmitter();
  if (!ev) {
    return () => {};
  }
  const sub: EventSubscription = ev.addListener(
    'onCellularCallStateChanged',
    (payload: { active?: boolean; audioMode?: number; source?: string }) => {
      handler({
        active: Boolean(payload?.active),
        audioMode: payload?.audioMode,
        source: typeof payload?.source === 'string' ? payload.source : undefined,
      });
    }
  );
  return () => sub.remove();
}
