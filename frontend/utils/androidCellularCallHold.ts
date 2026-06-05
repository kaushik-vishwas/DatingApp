import { PermissionsAndroid, Platform } from 'react-native';
import { EventEmitter, type EventSubscription } from 'expo-modules-core';

type IncomingCallAndroidNative = {
  startCellularCallHoldWatch(): boolean;
  stopCellularCallHoldWatch(): void;
  applyFullScreenIntentAsync(identifier: string): Promise<boolean>;
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

async function ensurePhoneStatePermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    const granted = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE
    );
    if (granted) return true;
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE,
      {
        title: 'Phone call detection',
        message:
          'Allow phone state access so your contact sees "On hold" when you take a mobile call.',
        buttonPositive: 'Allow',
        buttonNegative: 'Not now',
      }
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

/** Start native cellular-call watcher (ref-counted). */
export async function startAndroidCellularCallHoldWatch(): Promise<void> {
  const mod = getNativeModule();
  if (!mod) return;
  watchRefCount += 1;
  if (watchRefCount > 1) return;
  await ensurePhoneStatePermission();
  try {
    mod.startCellularCallHoldWatch();
  } catch {
    watchRefCount = Math.max(0, watchRefCount - 1);
  }
}

/** Stop native cellular-call watcher when no subscribers remain. */
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

export function subscribeAndroidCellularCallHold(
  handler: (active: boolean) => void
): () => void {
  const ev = getEmitter();
  if (!ev) {
    return () => {};
  }
  const sub: EventSubscription = ev.addListener(
    'onCellularCallStateChanged',
    (payload: { active?: boolean }) => {
      handler(Boolean(payload?.active));
    }
  );
  return () => sub.remove();
}
