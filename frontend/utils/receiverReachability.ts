import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking, Platform } from 'react-native';
import * as Device from 'expo-device';
import { getIncomingCallAndroidNativeModule } from '../modules/incoming-call-android';
import { profileApi } from '../services/api';
import {
  ensureIncomingCallNotificationPermission,
  registerReceiverPushTokens,
} from './incomingCallNotifications';
import { requestReceiverBatteryUnrestricted } from './receiverBatteryOptimization';
import { getPresenceDiagnosticEntries, logPresenceDiagnostic } from './receiverPresenceDiagnostics';

/** OEM autostart cannot be detected — the receiver confirms it once on this phone. */
const AUTOSTART_ACK_KEY = 'selecto_receiver_autostart_ack_v1';

export type ReachabilityCheckId =
  | 'notifications'
  | 'battery'
  | 'fullScreenIntent'
  | 'pushToken'
  | 'autostart';

export type ReachabilityStatus = {
  notifications: boolean;
  batteryUnrestricted: boolean;
  fullScreenIntent: boolean;
  pushToken: boolean;
  autostartPending: boolean;
  oemHint: string | null;
};

function androidSdk(): number {
  if (Platform.OS !== 'android') return 0;
  return typeof Platform.Version === 'number' ? Platform.Version : Number(Platform.Version) || 0;
}

export function oemBackgroundHint(): string | null {
  if (Platform.OS !== 'android') return null;
  const brand = `${Device.brand ?? ''} ${Device.manufacturer ?? ''}`.toLowerCase();
  if (brand.includes('samsung')) {
    return 'Samsung: Settings → Battery → Background usage limits — turn off “Put unused apps to sleep” for Selecto, and allow background activity.';
  }
  if (brand.includes('xiaomi') || brand.includes('redmi') || brand.includes('poco') || brand.includes('hyperos')) {
    return 'Xiaomi: enable Autostart for Selecto, set Battery saver to No restrictions, and lock the app in Recents.';
  }
  if (brand.includes('oppo') || brand.includes('realme') || brand.includes('oneplus') || brand.includes('coloros')) {
    return 'OPPO / Realme / OnePlus: allow Autostart, set battery to Unrestricted, and lock Selecto in Recents.';
  }
  if (brand.includes('vivo') || brand.includes('iqoo') || brand.includes('funtouch')) {
    return 'Vivo: enable Autostart, High background power consumption, and lock Selecto in Recents.';
  }
  return 'Allow Selecto to run in the background and disable battery restrictions so calls can ring after the phone sits idle.';
}

/** True when this device has a known OEM Autostart screen we can deep-link to (Xiaomi/OPPO/Vivo…). */
export function hasOemAutostartSettings(): boolean {
  if (Platform.OS !== 'android') return false;
  try {
    return Boolean(getIncomingCallAndroidNativeModule()?.hasOemAutostartSettings?.());
  } catch {
    return false;
  }
}

/**
 * Opens the OEM Autostart manager; falls back to the app's system settings page.
 * Returns true only when the Autostart screen itself opened (the text hint still applies otherwise).
 */
export async function openOemAutostartSettings(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    const result = getIncomingCallAndroidNativeModule()?.openOemAutostartSettings?.();
    if (result?.opened) return true;
  } catch {
    // fall through to app settings
  }
  try {
    await Linking.openSettings();
  } catch {
    // ignore — text hint remains visible
  }
  return false;
}

export async function isAutostartAcknowledged(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(AUTOSTART_ACK_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function acknowledgeAutostart(): Promise<void> {
  try {
    await AsyncStorage.setItem(AUTOSTART_ACK_KEY, '1');
  } catch {
    // Row reappears next check; harmless.
  }
}

/** Read-only: never shows the OS permission dialog. */
async function hasNotificationPermission(): Promise<boolean> {
  try {
    const Notifications = await import('expo-notifications');
    const current = await Notifications.getPermissionsAsync();
    return current.status === 'granted';
  } catch {
    return true;
  }
}

const PUSH_REFRESH_EVENT = 'push_token_refresh';
const PUSH_REFRESH_FAILED_EVENT = 'push_token_refresh_failed';

/** Outcome of the latest push-token refresh logged by the app (null = none logged yet). */
function lastPushRegistrationOk(): boolean | null {
  const entries = getPresenceDiagnosticEntries();
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const e = entries[i];
    if (e.event === PUSH_REFRESH_FAILED_EVENT) return false;
    if (e.event === PUSH_REFRESH_EVENT) {
      return Boolean(e.details?.expoOk) || Boolean(e.details?.fcmOk);
    }
  }
  return null;
}

/**
 * Read-only: never shows a permission dialog and never registers push tokens.
 * `pushToken` reflects the last logged registration (unknown counts as OK).
 */
export async function getReceiverReachabilityStatus(): Promise<ReachabilityStatus> {
  const notifications = await hasNotificationPermission();
  const pushToken = lastPushRegistrationOk() !== false;
  if (Platform.OS !== 'android') {
    return {
      notifications,
      batteryUnrestricted: true,
      fullScreenIntent: true,
      pushToken,
      autostartPending: false,
      oemHint: null,
    };
  }

  const mod = getIncomingCallAndroidNativeModule();
  let batteryUnrestricted = true;
  let fullScreenIntent = true;
  try {
    batteryUnrestricted = Boolean(mod?.isIgnoringBatteryOptimizations?.());
    if (androidSdk() >= 34 && typeof mod?.canUseFullScreenIntent === 'function') {
      fullScreenIntent = Boolean(mod.canUseFullScreenIntent());
    }
  } catch {
    // Native module unavailable — skip these rows rather than nag.
  }
  const autostartPending = hasOemAutostartSettings() && !(await isAutostartAcknowledged());

  return {
    notifications,
    batteryUnrestricted,
    fullScreenIntent,
    pushToken,
    autostartPending,
    oemHint: autostartPending ? oemBackgroundHint() : null,
  };
}

export function missingReachabilityChecks(status: ReachabilityStatus): ReachabilityCheckId[] {
  const missing: ReachabilityCheckId[] = [];
  if (!status.notifications) missing.push('notifications');
  if (Platform.OS === 'android' && !status.batteryUnrestricted) missing.push('battery');
  if (Platform.OS === 'android' && androidSdk() >= 34 && !status.fullScreenIntent) {
    missing.push('fullScreenIntent');
  }
  // Push registration needs notification permission; fixing that row fixes this one too.
  if (!status.pushToken && status.notifications) missing.push('pushToken');
  if (status.autostartPending) missing.push('autostart');
  return missing;
}

export async function promptReachabilityFix(id: ReachabilityCheckId): Promise<void> {
  const mod = getIncomingCallAndroidNativeModule();
  if (id === 'notifications') {
    // Android stops showing the dialog after repeated denials — fall back to app settings.
    const granted = await ensureIncomingCallNotificationPermission();
    if (!granted && Platform.OS === 'android') {
      try {
        await Linking.openSettings();
      } catch {
        // ignore
      }
    }
    return;
  }
  if (id === 'autostart') {
    await openOemAutostartSettings();
    return;
  }
  if (id === 'battery') {
    await requestReceiverBatteryUnrestricted();
    return;
  }
  if (id === 'fullScreenIntent') {
    if (typeof mod?.openFullScreenIntentSettingsAsync === 'function') {
      await mod.openFullScreenIntentSettingsAsync();
    } else {
      try {
        await Linking.openSettings();
      } catch {
        // ignore
      }
    }
    return;
  }
  if (id === 'pushToken') {
    try {
      const result = await registerReceiverPushTokens(async (payload) => {
        await profileApi.updateReceiverPushTokens(payload);
      });
      logPresenceDiagnostic(
        PUSH_REFRESH_EVENT,
        { expoOk: result.expoOk, fcmOk: result.fcmOk, source: 'reachability_fix' },
        result.expoOk || result.fcmOk ? 'info' : 'warn'
      );
    } catch (e) {
      logPresenceDiagnostic(
        PUSH_REFRESH_FAILED_EVENT,
        { reason: e instanceof Error ? e.message : String(e), source: 'reachability_fix' },
        'error'
      );
    }
  }
}
