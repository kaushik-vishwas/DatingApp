import { Platform } from 'react-native';

import { getIncomingCallAndroidNativeModule } from '../modules/incoming-call-android';

/**
 * Ask Android to exempt Selecto from battery restrictions so incoming-call FCM
 * is not delayed when the receiver app is minimized. Call on every Go Online.
 */
export async function requestReceiverBatteryUnrestricted(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    const mod = getIncomingCallAndroidNativeModule();
    if (!mod) return false;
    if (typeof mod.isIgnoringBatteryOptimizations === 'function' && mod.isIgnoringBatteryOptimizations()) {
      return true;
    }
    await mod.requestIgnoreBatteryOptimizationsAsync();
    return Boolean(mod.isIgnoringBatteryOptimizations?.());
  } catch {
    return false;
  }
}

/** @deprecated Use requestReceiverBatteryUnrestricted — the once-per-install skip hid denials. */
export async function ensureReceiverBatteryUnrestrictedOnce(): Promise<void> {
  await requestReceiverBatteryUnrestricted();
}
