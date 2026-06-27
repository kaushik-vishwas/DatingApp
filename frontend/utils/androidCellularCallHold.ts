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

/** True when READ_PHONE_STATE is already granted (never shows a runtime prompt). */
export async function hasAndroidReadPhoneStatePermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const permission = PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE;
  try {
    return await PermissionsAndroid.check(permission);
  } catch {
    return false;
  }
}

/**
 * Returns whether telephony OFFHOOK detection can run.
 * Does not request runtime permission — avoids interrupting an active call UI.
 */
export async function ensureAndroidReadPhoneStatePermission(): Promise<boolean> {
  return hasAndroidReadPhoneStatePermission();
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

/** Hold only after cellular call is answered (OFFHOOK), not while ringing. */
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
      if (kind === 'call_state_offhook') {
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
