import { Platform } from 'react-native';
import { EventEmitter, type EventSubscription } from 'expo-modules-core';

type IncomingCallAndroidNative = {
  startCellularCallHoldWatch(): boolean;
  stopCellularCallHoldWatch(): void;
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

/** Audio-mode watcher only — no READ_PHONE_STATE permission. */
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

export function subscribeAndroidCellularCallHold(
  handler: (active: boolean, audioMode?: number) => void
): () => void {
  const ev = getEmitter();
  if (!ev) {
    return () => {};
  }
  const sub: EventSubscription = ev.addListener(
    'onCellularCallStateChanged',
    (payload: { active?: boolean; audioMode?: number }) => {
      handler(Boolean(payload?.active), payload?.audioMode);
    }
  );
  return () => sub.remove();
}
