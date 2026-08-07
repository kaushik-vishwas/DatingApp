import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { getIncomingCallAndroidNativeModule } from '../modules/incoming-call-android';

const PROMPTED_KEY = '@selecto/battery_unrestricted_prompted_v1';

/**
 * Once per install: ask Android to exempt Selecto from battery restrictions so
 * incoming-call FCM is not delayed when the receiver app is minimized.
 * Safe no-op on iOS / if already unrestricted / if native module missing.
 */
export async function ensureReceiverBatteryUnrestrictedOnce(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    const already = await AsyncStorage.getItem(PROMPTED_KEY);
    if (already === '1') return;

    const mod = getIncomingCallAndroidNativeModule();
    if (!mod) {
      await AsyncStorage.setItem(PROMPTED_KEY, '1');
      return;
    }

    if (typeof mod.isIgnoringBatteryOptimizations === 'function' && mod.isIgnoringBatteryOptimizations()) {
      await AsyncStorage.setItem(PROMPTED_KEY, '1');
      return;
    }

    await mod.requestIgnoreBatteryOptimizationsAsync();
    await AsyncStorage.setItem(PROMPTED_KEY, '1');
  } catch {
    try {
      await AsyncStorage.setItem(PROMPTED_KEY, '1');
    } catch {
      // ignore
    }
  }
}
