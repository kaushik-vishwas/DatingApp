import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Application from 'expo-application';

import { getIncomingCallAndroidNativeModule } from '../modules/incoming-call-android';
import { profileApi } from '../services/api';
import { oemBackgroundHint } from './receiverReachability';
import {
  analyzePresenceLog,
  getLastPresenceFailure,
  getPresenceDiagnosticEntries,
  getPresenceIssueCount,
  ingestNativePresenceWakeLog,
  type PresenceDiagnosticEntry,
} from './receiverPresenceDiagnostics';
import {
  ensureIncomingCallNotificationPermission,
  registerReceiverPushTokens,
  type ReceiverPushRegistrationResult,
} from './incomingCallNotifications';

function androidSdk(): number {
  if (Platform.OS !== 'android') return 0;
  return typeof Platform.Version === 'number' ? Platform.Version : Number(Platform.Version) || 0;
}

function buildFcmWhyNotWorking(opts: {
  push: ReceiverPushRegistrationResult | null;
  pushError?: string;
  nativeSnap: Record<string, unknown> | null;
  missing: string[];
  analysisHints: string[];
}): string[] {
  const lines: string[] = [];
  const push = opts.push;

  if (opts.pushError) {
    lines.push(`Push check failed: ${opts.pushError}`);
  }

  if (push) {
    if (push.fcmOk) {
      lines.push(`FCM device token: OK (len ${push.fcmLen ?? 0})`);
    } else {
      lines.push(`FCM device token: FAIL — ${push.fcmError ?? 'no token'}`);
      if ((push.fcmError ?? '').toUpperCase().includes('SERVICE_NOT_AVAILABLE')) {
        lines.push(
          'SERVICE_NOT_AVAILABLE = Google Play Services could not reach FCM (network / Play Services / Xiaomi battery). App Firebase wiring is OK — fix device services, then reopen Selecto.'
        );
      } else {
        lines.push(
          'Without an FCM token, Firebase cannot wake this device when the app is killed. Keep-alive poll may still ring while Go Online stays running.'
        );
      }
    }
    if (push.expoOk) {
      lines.push(`Expo push token: OK (len ${push.expoLen ?? 0})`);
    } else {
      lines.push(`Expo push token: FAIL — ${push.expoError ?? 'no token'}`);
    }
    if (push.permission === false) {
      lines.push('Notification permission: DENIED — enable notifications for Selecto.');
    }
    if (push.projectIdPresent === false) {
      lines.push('EAS projectId missing — Expo push registration cannot complete.');
    }
  } else if (!opts.pushError) {
    lines.push('Push registration result unavailable.');
  }

  const native = opts.nativeSnap;
  if (native && native.ok === true) {
    if (native.notificationsEnabled === false) {
      lines.push('Android notifications disabled for this app.');
    }
    if (native.batteryUnrestricted === false) {
      lines.push('Battery optimization not unrestricted — OEM may kill keep-alive / delay FCM.');
    }
    if (native.canUseFullScreenIntent === false) {
      lines.push('Full-screen intent not allowed — incoming call may not pop over lock screen.');
    }
    if (native.keepAliveRunning === true) {
      lines.push('Keep-alive foreground service: running');
    } else {
      lines.push('Keep-alive foreground service: not running (Go Online may be off, or OEM stopped it)');
    }
  } else if (Platform.OS === 'android') {
    lines.push(
      'Native presence module snapshot unavailable — rebuild the Android APK with incoming-call module.'
    );
  }

  for (const id of opts.missing) {
    if (id === 'notifications') lines.push('Missing: notification permission');
    if (id === 'battery') lines.push('Missing: battery unrestricted');
    if (id === 'fullScreenIntent') lines.push('Missing: full-screen intent');
    if (id === 'pushToken') lines.push('Missing: Expo or FCM push token on server');
  }

  for (const hint of opts.analysisHints) {
    if (!lines.includes(hint)) lines.push(hint);
  }

  if (lines.length === 0) {
    lines.push(
      'No FCM blockers detected from this snapshot. If calls still miss, check backend FCM_PROJECT_ID / service account and that the receiver is Go Online.'
    );
  }

  return lines;
}

export async function collectPresenceEnvironmentSnapshot(): Promise<Record<string, unknown>> {
  const mod = getIncomingCallAndroidNativeModule();
  const nativeSnap =
    typeof mod?.getPresenceDebugSnapshot === 'function'
      ? (mod.getPresenceDebugSnapshot() as Record<string, unknown>)
      : null;

  let push: ReceiverPushRegistrationResult | null = null;
  let pushError: string | undefined;
  try {
    push = await registerReceiverPushTokens(async (payload) => {
      await profileApi.updateReceiverPushTokens(payload);
    });
  } catch (e) {
    pushError = e instanceof Error ? e.message : String(e);
  }

  const notifications =
    Platform.OS === 'android' && nativeSnap && typeof nativeSnap.notificationsEnabled === 'boolean'
      ? Boolean(nativeSnap.notificationsEnabled)
      : await ensureIncomingCallNotificationPermission();

  const batteryUnrestricted =
    Platform.OS !== 'android'
      ? true
      : nativeSnap && typeof nativeSnap.batteryUnrestricted === 'boolean'
        ? Boolean(nativeSnap.batteryUnrestricted)
        : Boolean(mod?.isIgnoringBatteryOptimizations?.());

  const fullScreenIntent =
    Platform.OS !== 'android' || androidSdk() < 34
      ? true
      : nativeSnap && typeof nativeSnap.canUseFullScreenIntent === 'boolean'
        ? Boolean(nativeSnap.canUseFullScreenIntent)
        : typeof mod?.canUseFullScreenIntent === 'function'
          ? Boolean(mod.canUseFullScreenIntent())
          : true;

  const pushTokenOk = Boolean(push?.expoOk || push?.fcmOk);
  const missing: string[] = [];
  if (!notifications) missing.push('notifications');
  if (Platform.OS === 'android' && !batteryUnrestricted) missing.push('battery');
  if (Platform.OS === 'android' && androidSdk() >= 34 && !fullScreenIntent) {
    missing.push('fullScreenIntent');
  }
  if (!pushTokenOk) missing.push('pushToken');

  const analysis = analyzePresenceLog();
  const fcmWhyNotWorking = buildFcmWhyNotWorking({
    push,
    pushError,
    nativeSnap,
    missing,
    analysisHints: analysis.hints,
  });

  return {
    capturedAt: new Date().toISOString(),
    app: {
      version: Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? 'unknown',
      nativeBuild: Application.nativeBuildVersion ?? null,
      runtimeVersion: Constants.expoConfig?.runtimeVersion ?? null,
      executionEnvironment: Constants.executionEnvironment ?? null,
      appOwnership: Constants.appOwnership ?? null,
    },
    device: {
      brand: Device.brand ?? null,
      manufacturer: Device.manufacturer ?? null,
      modelName: Device.modelName ?? null,
      modelId: Device.modelId ?? null,
      osName: Device.osName ?? null,
      osVersion: Device.osVersion ?? null,
      osBuildId: Device.osBuildId ?? null,
      platformApi: androidSdk() || null,
      isDevice: Device.isDevice,
    },
    oemHint: oemBackgroundHint(),
    nativeModulePresent: Boolean(mod),
    nativeSnapshot: nativeSnap,
    reachability: {
      notifications,
      batteryUnrestricted,
      fullScreenIntent,
      pushToken: pushTokenOk,
      oemHint: oemBackgroundHint(),
      missing,
    },
    pushRegistration: push,
    pushError: pushError ?? null,
    fcmWhyNotWorking,
    analysis,
  };
}

export async function buildPresenceDiagnosticsExport(): Promise<string> {
  await ingestNativePresenceWakeLog();
  const snapshot = await collectPresenceEnvironmentSnapshot();
  const entries: PresenceDiagnosticEntry[] = getPresenceDiagnosticEntries();
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      issueCount: getPresenceIssueCount(),
      lastFailure: getLastPresenceFailure(),
      environment: snapshot,
      entries,
    },
    null,
    2
  );
}
