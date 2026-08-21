import { Linking, Platform } from 'react-native';
import * as Device from 'expo-device';
import { getIncomingCallAndroidNativeModule } from '../modules/incoming-call-android';
import { profileApi } from '../services/api';
import {
  ensureIncomingCallNotificationPermission,
  registerReceiverPushTokens,
} from './incomingCallNotifications';
import { requestReceiverBatteryUnrestricted } from './receiverBatteryOptimization';

export type ReachabilityCheckId =
  | 'notifications'
  | 'battery'
  | 'fullScreenIntent'
  | 'pushToken';

export type ReachabilityStatus = {
  notifications: boolean;
  batteryUnrestricted: boolean;
  fullScreenIntent: boolean;
  pushToken: boolean;
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

export async function getReceiverReachabilityStatus(): Promise<ReachabilityStatus> {
  if (Platform.OS !== 'android') {
    const push = await registerReceiverPushTokens(async (payload) => {
      await profileApi.updateReceiverPushTokens(payload);
    });
    const notifications = await ensureIncomingCallNotificationPermission();
    return {
      notifications,
      batteryUnrestricted: true,
      fullScreenIntent: true,
      pushToken: push.expoOk || push.fcmOk,
      oemHint: null,
    };
  }

  const mod = getIncomingCallAndroidNativeModule();
  const notifications = await ensureIncomingCallNotificationPermission();
  const batteryUnrestricted = Boolean(mod?.isIgnoringBatteryOptimizations?.());
  const fullScreenIntent =
    androidSdk() < 34
      ? true
      : typeof mod?.canUseFullScreenIntent === 'function'
        ? Boolean(mod.canUseFullScreenIntent())
        : true;
  const push = await registerReceiverPushTokens(async (payload) => {
    await profileApi.updateReceiverPushTokens(payload);
  });

  return {
    notifications,
    batteryUnrestricted,
    fullScreenIntent,
    pushToken: push.expoOk || push.fcmOk,
    oemHint: oemBackgroundHint(),
  };
}

export function missingReachabilityChecks(status: ReachabilityStatus): ReachabilityCheckId[] {
  const missing: ReachabilityCheckId[] = [];
  if (!status.notifications) missing.push('notifications');
  if (Platform.OS === 'android' && !status.batteryUnrestricted) missing.push('battery');
  if (Platform.OS === 'android' && androidSdk() >= 34 && !status.fullScreenIntent) {
    missing.push('fullScreenIntent');
  }
  if (!status.pushToken) missing.push('pushToken');
  return missing;
}

export async function promptReachabilityFix(id: ReachabilityCheckId): Promise<void> {
  const mod = getIncomingCallAndroidNativeModule();
  if (id === 'notifications') {
    await ensureIncomingCallNotificationPermission();
    if (Platform.OS === 'android') {
      try {
        await Linking.openSettings();
      } catch {
        // ignore
      }
    }
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
    await registerReceiverPushTokens(async (payload) => {
      await profileApi.updateReceiverPushTokens(payload);
    });
  }
}
