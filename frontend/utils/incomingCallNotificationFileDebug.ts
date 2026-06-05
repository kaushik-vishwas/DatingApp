import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { AppState, Platform } from 'react-native';

/**
 * Samsung / notification tap field diagnostics.
 * Enabled only when this env is set at build time (debug APK script).
 * Does not run in normal production builds.
 */
export function isIncomingCallNotifFileDebugEnabled(): boolean {
  return process.env.EXPO_PUBLIC_INCOMING_CALL_NOTIF_DEBUG === '1';
}

const LOG_FILE_NAME = 'incoming-call-notification-debug.log';
const MAX_FILE_BYTES = 512 * 1024;

let logUri: string | null = null;
let writeChain: Promise<void> = Promise.resolve();
let bootLogged = false;
let currentShowSessionId: string | null = null;

export function getIncomingCallNotifShowSessionId(): string | null {
  return currentShowSessionId;
}

export function startIncomingCallNotifShowSession(callId: string): string {
  const session = `${callId}-${Date.now()}`;
  currentShowSessionId = session;
  return session;
}

function getLogFileUri(): string {
  if (!logUri) {
    const base = FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? '';
    logUri = `${base}${LOG_FILE_NAME}`;
  }
  return logUri;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, (_key, v) => {
      if (typeof v === 'function') return undefined;
      if (v instanceof Date) return v.toISOString();
      return v;
    });
  } catch (e) {
    return JSON.stringify({
      serializeError: e instanceof Error ? e.message : String(e),
    });
  }
}

async function trimLogIfNeeded(uri: string): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists || info.size == null || info.size <= MAX_FILE_BYTES) return;
    const content = await FileSystem.readAsStringAsync(uri);
    const keep = content.slice(-Math.floor(MAX_FILE_BYTES * 0.75));
    const firstLine = keep.indexOf('\n');
    const trimmed = firstLine >= 0 ? keep.slice(firstLine + 1) : keep;
    await FileSystem.writeAsStringAsync(
      uri,
      `--- log trimmed ${new Date().toISOString()} ---\n${trimmed}`
    );
  } catch {
    // best-effort
  }
}

export async function appendIncomingCallNotifFileLog(
  step: string,
  detail?: Record<string, unknown>
): Promise<void> {
  if (!isIncomingCallNotifFileDebugEnabled()) return;

  const line = {
    ts: new Date().toISOString(),
    step,
    appState: AppState.currentState,
    showSessionId: currentShowSessionId,
    ...(detail ?? {}),
  };

  const uri = getLogFileUri();
  writeChain = writeChain.then(async () => {
    const header = bootLogged ? '' : buildBootHeader();
    bootLogged = true;
    const chunk = `${header}${safeJson(line)}\n`;
    const info = await FileSystem.getInfoAsync(uri);
    const existing = info.exists ? await FileSystem.readAsStringAsync(uri) : '';
    await FileSystem.writeAsStringAsync(uri, existing + chunk, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    await trimLogIfNeeded(uri);
  });

  await writeChain;
}

function buildBootHeader(): string {
  const device = {
    brand: Device.brand,
    manufacturer: Device.manufacturer,
    modelName: Device.modelName,
    deviceName: Device.deviceName,
    osName: Device.osName,
    osVersion: Device.osVersion,
    platformApiLevel: Device.platformApiLevel,
    isDevice: Device.isDevice,
  };
  const app = {
    applicationId: Application.applicationId,
    nativeApplicationVersion: Application.nativeApplicationVersion,
    nativeBuildVersion: Application.nativeBuildVersion,
  };
  const header = {
    ts: new Date().toISOString(),
    step: 'debug.boot',
    message: 'Incoming call notification debug log started',
    platform: Platform.OS,
    debugBuild: true,
    device,
    app,
    constants: {
      appOwnership: Constants.appOwnership,
      executionEnvironment: Constants.executionEnvironment,
    },
    diagnosisHint:
      'Compare compact (heads-up) vs expanded (shade) tap: look for response.listener + response.parse_ok vs app_state.active with snapshot.last_response=null and linking.url without call data.',
  };
  return `${safeJson(header)}\n`;
}

export function sanitizeNotificationResponse(
  response: import('expo-notifications').NotificationResponse | null | undefined
): Record<string, unknown> | null {
  if (!response) return null;
  const req = response.notification?.request;
  const content = req?.content;
  const data = (content?.data ?? {}) as Record<string, unknown>;
  const date = response.notification?.date;
  return {
    actionIdentifier: response.actionIdentifier,
    userText: response.userText ?? null,
    notificationDate:
      date instanceof Date ? date.toISOString() : date != null ? String(date) : null,
    identifier: req?.identifier ?? null,
    title: content?.title ?? null,
    body: content?.body ?? null,
    subtitle: content?.subtitle ?? null,
    categoryIdentifier: content?.categoryIdentifier ?? null,
    dataKeys: Object.keys(data),
    data: redactDataForLog(data),
    parsedCallId:
      typeof data.callId === 'string'
        ? data.callId
        : typeof data.url === 'string'
          ? data.url
          : null,
  };
}

export function redactDataForLog(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (k === 'peerImage' || k === 'fromImage') {
      out[k] = v ? '[present]' : v;
      continue;
    }
    out[k] = v;
  }
  return out;
}

export async function captureIncomingCallNotifSnapshot(
  label: string,
  extra?: Record<string, unknown>
): Promise<void> {
  if (!isIncomingCallNotifFileDebugEnabled()) return;

  const Notifications = await import('expo-notifications').catch(() => null);
  let presented: Record<string, unknown>[] = [];
  let lastResponse: Record<string, unknown> | null = null;
  let permissions: Record<string, unknown> | null = null;

  if (Notifications) {
    try {
      if (Notifications.getPresentedNotificationsAsync) {
        const list = await Notifications.getPresentedNotificationsAsync();
        presented = list.map((n) => {
          const id = n.request.identifier ?? '';
          const data = (n.request.content?.data ?? {}) as Record<string, unknown>;
          return {
            identifier: id,
            title: n.request.content?.title ?? null,
            body: n.request.content?.body ?? null,
            dataKeys: Object.keys(data),
            type: data.type ?? null,
            callId: data.callId ?? null,
            hasUrl: typeof data.url === 'string' && data.url.length > 0,
          };
        });
      }
      const last =
        typeof Notifications.getLastNotificationResponse === 'function'
          ? Notifications.getLastNotificationResponse()
          : await Notifications.getLastNotificationResponseAsync?.();
      lastResponse = sanitizeNotificationResponse(last ?? null);
      const perm = await Notifications.getPermissionsAsync();
      permissions = { status: perm.status, android: perm.android ?? null, ios: perm.ios ?? null };
    } catch (e) {
      presented = [{ error: e instanceof Error ? e.message : String(e) }];
    }
  }

  const { readPendingIncomingCallTap, readShownIncomingCallNotification } = await import(
    './pendingIncomingCallTapStorage'
  );
  const pendingTap = await readPendingIncomingCallTap();
  const shown = await readShownIncomingCallNotification();

  const { Linking } = await import('react-native');
  let initialUrl: string | null = null;
  try {
    initialUrl = await Linking.getInitialURL();
  } catch {
    initialUrl = null;
  }

  await appendIncomingCallNotifFileLog('snapshot', {
    label,
    presentedCount: presented.length,
    presented,
    lastResponse,
    permissions,
    pendingTap: pendingTap
      ? { callId: pendingTap.callId, fromId: pendingTap.fromId, peerName: pendingTap.peerName }
      : null,
    shownStorage: shown ? { callId: shown.callId } : null,
    initialUrl,
    ...extra,
  });
}

export async function shareIncomingCallNotifDebugLog(): Promise<{
  ok: boolean;
  message: string;
}> {
  if (!isIncomingCallNotifFileDebugEnabled()) {
    return { ok: false, message: 'This is not a notification debug build.' };
  }
  const uri = getLogFileUri();
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) {
    await appendIncomingCallNotifFileLog('share.requested', { note: 'empty_log_created' });
  }
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    return {
      ok: false,
      message: 'Sharing is not available on this device. Log path: ' + uri,
    };
  }
  await appendIncomingCallNotifFileLog('share.requested', { uri });
  await Sharing.shareAsync(uri, {
    mimeType: 'text/plain',
    dialogTitle: 'Send Nestham notification debug log',
    UTI: 'public.plain-text',
  });
  return { ok: true, message: 'Choose Gmail, WhatsApp, or Drive to send the file to support.' };
}

export async function clearIncomingCallNotifDebugLog(): Promise<void> {
  const uri = getLogFileUri();
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // ignore
  }
  bootLogged = false;
  currentShowSessionId = null;
  await appendIncomingCallNotifFileLog('debug.cleared', {});
}

export function getIncomingCallNotifDebugLogPath(): string {
  return getLogFileUri();
}
