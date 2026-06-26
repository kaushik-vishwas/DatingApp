import { PermissionsAndroid, Platform } from 'react-native';
import type { EventSubscription } from 'expo-modules-core';
import { callDiag } from './callDiagnostics';
import {
  getIncomingCallNativeEventEmitter,
  getIncomingCallNativeModule,
  isIncomingCallNativeAvailable,
} from './incomingCallNativeBridge';

let watchRefCount = 0;
let cellularHoldSub: EventSubscription | null = null;
const cellularHoldHandlers = new Set<(event: CellularCallHoldEvent) => void>();

export type CellularCallHoldEvent = {
  active: boolean;
  audioMode?: number;
  source?: string;
};

function dispatchCellularHold(event: CellularCallHoldEvent): void {
  for (const handler of cellularHoldHandlers) {
    try {
      handler(event);
    } catch {
      // ignore handler errors
    }
  }
}

function ensureCellularHoldListener(): void {
  if (cellularHoldSub) return;
  const emitter = getIncomingCallNativeEventEmitter();
  if (!emitter) {
    callDiag.info('cellular_hold_native_unavailable', {
      nativeAvailable: isIncomingCallNativeAvailable(),
    });
    return;
  }
  cellularHoldSub = emitter.addListener(
    'onCellularCallStateChanged',
    (payload: { active?: boolean; audioMode?: number; source?: string }) => {
      const event: CellularCallHoldEvent = {
        active: Boolean(payload?.active),
        audioMode: payload?.audioMode,
        source: typeof payload?.source === 'string' ? payload.source : undefined,
      };
      callDiag.info('cellular_hold_native_event', event);
      dispatchCellularHold(event);
    }
  );
  callDiag.info('cellular_hold_listener_attached', {});
}

function releaseCellularHoldListenerIfIdle(): void {
  if (cellularHoldHandlers.size > 0 || watchRefCount > 0) return;
  cellularHoldSub?.remove();
  cellularHoldSub = null;
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
  const mod = getIncomingCallNativeModule();
  if (!mod?.refreshCellularCallHoldTelephony) return;
  try {
    const ok = mod.refreshCellularCallHoldTelephony();
    callDiag.info('cellular_hold_telephony_refreshed', { ok });
  } catch (e) {
    callDiag.error('cellular_hold_telephony_refresh_failed', {
      message: e instanceof Error ? e.message : String(e),
    });
  }
}

export function startAndroidCellularCallHoldWatch(): void {
  const mod = getIncomingCallNativeModule();
  if (!mod) {
    callDiag.info('cellular_hold_start_skipped', { reason: 'native_module_missing' });
    return;
  }
  ensureCellularHoldListener();
  watchRefCount += 1;
  if (watchRefCount > 1) return;
  try {
    const started = mod.startCellularCallHoldWatch();
    callDiag.info('cellular_hold_native_watch_started', { started });
    if (typeof mod.startTelephonyDiagnosticsWatch === 'function') {
      mod.startTelephonyDiagnosticsWatch();
    }
  } catch (e) {
    watchRefCount = Math.max(0, watchRefCount - 1);
    callDiag.error('cellular_hold_native_watch_failed', {
      message: e instanceof Error ? e.message : String(e),
    });
  }
}

export function stopAndroidCellularCallHoldWatch(): void {
  const mod = getIncomingCallNativeModule();
  if (!mod) return;
  watchRefCount = Math.max(0, watchRefCount - 1);
  if (watchRefCount > 0) return;
  try {
    mod.stopCellularCallHoldWatch();
    mod.stopTelephonyDiagnosticsWatch?.();
  } catch {
    // ignore
  }
  releaseCellularHoldListenerIfIdle();
}

export function subscribeAndroidCellularCallHold(
  handler: (event: CellularCallHoldEvent) => void
): () => void {
  if (Platform.OS !== 'android') {
    return () => {};
  }
  ensureCellularHoldListener();
  cellularHoldHandlers.add(handler);
  return () => {
    cellularHoldHandlers.delete(handler);
    releaseCellularHoldListenerIfIdle();
  };
}

/** Backup path: telephony diagnostics OFFHOOK/RINGING while in a voice call. */
export function subscribeAndroidTelephonyHoldSignals(
  handler: (active: boolean, source: string) => void
): () => void {
  const emitter = getIncomingCallNativeEventEmitter();
  if (!emitter) {
    return () => {};
  }
  const sub = emitter.addListener(
    'onTelephonyDiagnostic',
    (payload: { kind?: string; callStateLabel?: string }) => {
      const kind = typeof payload?.kind === 'string' ? payload.kind : '';
      if (kind === 'call_state_offhook' || kind === 'call_state_ringing') {
        handler(true, `telephony_${kind}`);
        return;
      }
      if (kind === 'call_state_idle') {
        handler(false, 'telephony_idle');
      }
    }
  );
  return () => sub.remove();
}
