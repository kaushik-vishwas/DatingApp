import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { AppState, Linking, Platform, type AppStateStatus } from 'react-native';
import {
  clearPendingIncomingCallTap,
  clearShownIncomingCallNotification,
  persistPendingIncomingCallTap,
  persistShownIncomingCallNotification,
  readPendingIncomingCallTap,
  readShownIncomingCallNotification,
} from './pendingIncomingCallTapStorage';
import {
  captureIncomingCallNotifDebugSnapshot,
  isIncomingCallNotifDebugBuild,
  logIncomingCallNotif,
} from './incomingCallNotificationDebug';
import { prefetchIncomingCallBootstrapFromNotification } from './incomingCallBootstrapPrefetch';
import { ensureIncomingRingtonePlaying } from './callSounds';
import { applyIncomingCallFullScreenIntent } from './incomingCallAndroidFullScreen';
import { ensureIncomingCallNativeTapDebugListener } from './incomingCallAndroidTapDebug';

export type IncomingCallNotificationPayload = {
  callId: string;
  fromType: 'u' | 'r';
  fromId: string;
  peerName: string;
  peerImage?: string | null;
};

const INCOMING_CALL_CHANNEL_ID = 'incoming_calls';
/** Android `res/raw` basename (no extension). */
const INCOMING_CALL_NOTIFICATION_SOUND_ANDROID = 'receiver_ringtone';
/** Bundled via expo-notifications plugin (iOS). */
const INCOMING_CALL_NOTIFICATION_SOUND_IOS = 'receiver_ringtone.mp3';
/** expo-notifications: `categoryIdentifier` (iOS + Android action category). */
const INCOMING_CALL_CATEGORY_ID = 'call';
const INCOMING_CALL_NOTIFICATION_ID_PREFIX = 'incoming-';
export const INCOMING_CALL_DEEP_LINK_PREFIX = 'nestham://incoming-call/';

let setupDone = false;
let infrastructureReady = false;
const notifiedCallIds = new Set<string>();
/** Burst debounce so notification + linking + consumePending do not triple-navigate. */
const lastHandledTapAtByCallId = new Map<string, number>();
const TAP_DEDUPE_MS = 5000;
const CLEAR_LAST_RESPONSE_DELAY_MS = 5000;
/** After accept/reject, block all notification/linking routes to IncomingCall for this id. */
const handledIncomingCallIds = new Set<string>();
let incomingCallNavigationGuard: ((callId: string) => boolean) | null = null;
let openHandler: ((incoming: IncomingCallNotificationPayload) => void) | null = null;
const pendingOpens = new Map<string, IncomingCallNotificationPayload>();

export function setIncomingCallNavigationGuard(
  guard: ((callId: string) => boolean) | null
): void {
  incomingCallNavigationGuard = guard;
}

export function canNavigateToIncomingCall(callId: string): boolean {
  const id = callId.trim();
  if (!id) return false;
  if (handledIncomingCallIds.has(id)) return false;
  if (incomingCallNavigationGuard && !incomingCallNavigationGuard(id)) return false;
  return true;
}

/** Call as soon as the user accepts/rejects — stops repeat IncomingCall screens. */
export async function markIncomingCallHandled(callId: string): Promise<void> {
  const id = callId.trim();
  if (!id) return;
  handledIncomingCallIds.add(id);
  pendingOpens.delete(id);
  logIncomingCallNotif('nav.handled', { callId: id });
  await clearPendingIncomingCallTap();
  await clearShownIncomingCallNotification();
  const Notifications = await loadNotificationsModule();
  if (Notifications && typeof Notifications.clearLastNotificationResponseAsync === 'function') {
    void Notifications.clearLastNotificationResponseAsync().catch(() => {});
  }
  void dismissIncomingCallNotification(id);
}

export function releaseIncomingCallNavigation(callId: string): void {
  handledIncomingCallIds.delete(callId.trim());
}

async function ensureNativeIncomingCallChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('incoming-call-android').default as {
      ensureIncomingCallChannelAsync?: () => Promise<{ ensured?: boolean }>;
    };
    if (typeof mod.ensureIncomingCallChannelAsync === 'function') {
      await mod.ensureIncomingCallChannelAsync();
    }
  } catch {
    // Native module may be unavailable before rebuild.
  }
}

let notificationsModulePromise: Promise<typeof import('expo-notifications') | null> | null =
  null;

let disposeInfrastructure: (() => void) | null = null;
/** Debug: time of last notification response listener (expanded vs compact tap diagnosis). */
let lastNotificationResponseListenerAtMs = 0;

/** Expo Go on Android (SDK 53+) crashes if expo-notifications is loaded (remote push removed). */
export function canUseLocalNotifications(): boolean {
  if (!Device.isDevice) return false;
  if (Constants.appOwnership === 'expo' && Platform.OS === 'android') return false;
  return true;
}

function canUseExpoPushToken(): boolean {
  if (!Device.isDevice) return false;
  if (Constants.appOwnership === 'expo') return false;
  return true;
}

async function loadNotificationsModule(): Promise<typeof import('expo-notifications') | null> {
  if (!canUseLocalNotifications() && !canUseExpoPushToken()) return null;
  if (!notificationsModulePromise) {
    notificationsModulePromise = import('expo-notifications').catch(() => null);
  }
  return notificationsModulePromise;
}

export function isAppInBackground(): boolean {
  return AppState.currentState !== 'active';
}

export function incomingCallDeepLink(incoming: IncomingCallNotificationPayload): string {
  const callId = incoming.callId.trim();
  const qs = new URLSearchParams({
    fromId: incoming.fromId.trim(),
    fromType: incoming.fromType,
    peerName: incoming.peerName.trim() || 'Caller',
  });
  if (incoming.peerImage) qs.set('peerImage', incoming.peerImage);
  return `${INCOMING_CALL_DEEP_LINK_PREFIX}${encodeURIComponent(callId)}?${qs.toString()}`;
}

export function parseIncomingCallDeepLink(url: string): IncomingCallNotificationPayload | null {
  const raw = url.trim();
  if (!raw.startsWith(INCOMING_CALL_DEEP_LINK_PREFIX)) return null;
  const rest = raw.slice(INCOMING_CALL_DEEP_LINK_PREFIX.length);
  const qIndex = rest.indexOf('?');
  const idPart = qIndex >= 0 ? rest.slice(0, qIndex) : rest;
  const callId = decodeURIComponent(idPart).trim();
  if (!callId) return null;
  const params =
    qIndex >= 0 ? new URLSearchParams(rest.slice(qIndex + 1)) : new URLSearchParams();
  const fromId = params.get('fromId')?.trim() ?? '';
  const fromType: 'u' | 'r' = params.get('fromType') === 'r' ? 'r' : 'u';
  const peerName = params.get('peerName')?.trim() || 'Caller';
  const peerImage = params.get('peerImage');
  return {
    callId,
    fromType,
    fromId,
    peerName,
    peerImage: peerImage ?? null,
  };
}

function parseCallIdFromNotificationIdentifier(identifier: string | undefined): string | null {
  const id = identifier?.trim() ?? '';
  if (!id.startsWith(INCOMING_CALL_NOTIFICATION_ID_PREFIX)) return null;
  const callId = id.slice(INCOMING_CALL_NOTIFICATION_ID_PREFIX.length).trim();
  return callId || null;
}

function parseJsonRecord(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function parseIncomingFromData(
  data: Record<string, unknown> | undefined
): IncomingCallNotificationPayload | null {
  if (!data) return null;
  if (data.type !== 'call_incoming') {
    const payloadRaw = typeof data.payload === 'string' ? data.payload : '';
    if (payloadRaw) {
      const parsed = parseJsonRecord(payloadRaw);
      if (parsed) return parseIncomingFromData(parsed);
    }
    return null;
  }
  const callId = typeof data.callId === 'string' ? data.callId.trim() : '';
  const fromId = typeof data.fromId === 'string' ? data.fromId.trim() : '';
  if (!callId) return null;
  const fromType: 'u' | 'r' = data.fromType === 'r' ? 'r' : 'u';
  const peerName =
    typeof data.peerName === 'string' && data.peerName.trim()
      ? data.peerName.trim()
      : typeof data.fromName === 'string' && data.fromName.trim()
        ? data.fromName.trim()
        : 'Caller';
  const peerImage =
    typeof data.peerImage === 'string'
      ? data.peerImage
      : typeof data.fromImage === 'string'
        ? data.fromImage
        : data.peerImage === null || data.fromImage === null
          ? null
          : undefined;
  return { callId, fromType, fromId, peerName, peerImage };
}

function parseIncomingFromUrlField(
  data: Record<string, unknown> | undefined
): IncomingCallNotificationPayload | null {
  const url = typeof data?.url === 'string' ? data.url.trim() : '';
  if (!url) return null;
  const fromLink = parseIncomingCallDeepLink(url);
  if (!fromLink) return null;
  const fromData = parseIncomingFromData(data);
  if (fromData) {
    return {
      ...fromData,
      callId: fromData.callId || fromLink.callId,
    };
  }
  return fromLink;
}

function parseIncomingFromNotificationContent(
  content: { data?: Record<string, unknown> } | undefined
): IncomingCallNotificationPayload | null {
  const data = content?.data as Record<string, unknown> | undefined;
  const fromData = parseIncomingFromData(data) ?? parseIncomingFromUrlField(data);
  if (fromData) return fromData;

  const dataString =
    typeof data?.dataString === 'string'
      ? data.dataString
      : typeof (content as { dataString?: string } | undefined)?.dataString === 'string'
        ? (content as { dataString?: string }).dataString
        : '';
  if (dataString) {
    const parsed = parseJsonRecord(dataString);
    if (parsed) {
      return parseIncomingFromData(parsed) ?? parseIncomingFromUrlField(parsed);
    }
  }
  return null;
}

export function parseIncomingFromNotificationRequest(request: {
  identifier?: string;
  content?: { data?: Record<string, unknown> };
}): IncomingCallNotificationPayload | null {
  const fromContent = parseIncomingFromNotificationContent(request.content);
  if (fromContent) return fromContent;

  const callId = parseCallIdFromNotificationIdentifier(request.identifier);
  if (!callId) return null;

  const data = request.content?.data as Record<string, unknown> | undefined;
  const fromType: 'u' | 'r' = data?.fromType === 'r' ? 'r' : 'u';
  const fromId = typeof data?.fromId === 'string' ? data.fromId.trim() : '';
  const peerName =
    typeof data?.peerName === 'string' && data.peerName.trim()
      ? data.peerName.trim()
      : 'Caller';
  const peerImage =
    typeof data?.peerImage === 'string'
      ? data.peerImage
      : data?.peerImage === null
        ? null
        : undefined;
  return { callId, fromType, fromId, peerName, peerImage };
}

function queuePendingOpen(incoming: IncomingCallNotificationPayload): void {
  if (!canNavigateToIncomingCall(incoming.callId)) return;
  pendingOpens.set(incoming.callId, incoming);
  void persistPendingIncomingCallTap(incoming);
}

function flushPendingOpens(): void {
  if (!openHandler || pendingOpens.size === 0) return;
  const items = [...pendingOpens.values()];
  pendingOpens.clear();
  for (const incoming of items) {
    openHandler(incoming);
  }
}

function shouldSkipDuplicateTap(callId: string): boolean {
  if (!canNavigateToIncomingCall(callId)) {
    logIncomingCallNotif('nav.blocked', { callId, reason: 'handled_or_guard' });
    return true;
  }
  const now = Date.now();
  const last = lastHandledTapAtByCallId.get(callId) ?? 0;
  if (now - last < TAP_DEDUPE_MS) {
    logIncomingCallNotif('tap.dedupe_skip', { callId });
    return true;
  }
  lastHandledTapAtByCallId.set(callId, now);
  return false;
}

function dispatchIncomingOpen(incoming: IncomingCallNotificationPayload): void {
  const merged: IncomingCallNotificationPayload = {
    callId: incoming.callId.trim(),
    fromType: incoming.fromType,
    fromId: incoming.fromId.trim(),
    peerName: incoming.peerName.trim() || 'Caller',
    peerImage: incoming.peerImage ?? null,
  };
  if (!merged.callId) return;
  if (shouldSkipDuplicateTap(merged.callId)) {
    return;
  }
  if (openHandler) {
    logIncomingCallNotif('tap.dispatch_handler', { callId: merged.callId });
    openHandler(merged);
    return;
  }
  logIncomingCallNotif('tap.dispatch_queue', { callId: merged.callId });
  queuePendingOpen(merged);
}

async function openIncomingFromNotificationTap(
  incoming: IncomingCallNotificationPayload
): Promise<void> {
  if (!canNavigateToIncomingCall(incoming.callId)) {
    logIncomingCallNotif('nav.blocked', { callId: incoming.callId, reason: 'tap_pipeline' });
    return;
  }
  logIncomingCallNotif('tap.open_start', {
    callId: incoming.callId,
    identifier: `${INCOMING_CALL_NOTIFICATION_ID_PREFIX}${incoming.callId}`,
  });
  void captureIncomingCallNotifDebugSnapshot('tap_open_start', {
    callId: incoming.callId,
    fromId: incoming.fromId,
  });
  // Start in-app ring before dismissing tray sound; navigate after dismiss for seamless handoff.
  try {
    await ensureIncomingRingtonePlaying();
  } catch {
    // UI still works if ring fails.
  }
  void dismissIncomingCallNotification(incoming.callId);
  dispatchIncomingOpen(incoming);
  void persistPendingIncomingCallTap(incoming);

  // Direct handler navigation is reliable on Android; Linking.openURL can race with
  // NotificationForwarderActivity on Samsung and drop the deep link.
  if (Platform.OS === 'ios') {
    const deepLink = incomingCallDeepLink(incoming);
    try {
      await Linking.openURL(deepLink);
    } catch {
      // Linking may fail if the activity is already foreground.
    }
  }
}

const MAX_NOTIFICATION_TAP_AGE_MS = 5 * 60 * 1000;

function isNotificationResponseFresh(
  response: import('expo-notifications').NotificationResponse
): boolean {
  const date = response.notification?.date;
  if (date == null) return true;
  const ms = date instanceof Date ? date.getTime() : Number(date);
  if (!Number.isFinite(ms)) return true;
  return Date.now() - ms < MAX_NOTIFICATION_TAP_AGE_MS;
}

async function processNotificationResponse(
  Notifications: typeof import('expo-notifications'),
  response: import('expo-notifications').NotificationResponse | null
): Promise<void> {
  if (!response) return;
  const actionId = response.actionIdentifier;
  const defaultAction =
    Notifications.DEFAULT_ACTION_IDENTIFIER ?? 'expo.modules.notifications.actions.DEFAULT';
  if (actionId && actionId !== defaultAction) {
    logIncomingCallNotif('response.action_skip', { actionId });
    return;
  }

  lastNotificationResponseListenerAtMs = Date.now();
  const identifier = response.notification.request.identifier ?? '';

  if (isIncomingCallNotifDebugBuild()) {
    const fileDbg = await import('./incomingCallNotificationFileDebug');
    logIncomingCallNotif('response.raw', {
      response: fileDbg.sanitizeNotificationResponse(response),
    });
  }
  logIncomingCallNotif('response.listener', {
    identifier,
    actionId: actionId ?? defaultAction,
    tapPath: 'notification_response_listener',
  });
  await captureIncomingCallNotifDebugSnapshot('response_listener_start', {
    identifier,
    actionId: actionId ?? defaultAction,
  });

  if (!isNotificationResponseFresh(response)) {
    logIncomingCallNotif('response.stale', { identifier });
    if (typeof Notifications.clearLastNotificationResponseAsync === 'function') {
      void Notifications.clearLastNotificationResponseAsync().catch(() => {});
    }
    return;
  }

  const incoming = parseIncomingFromNotificationRequest(response.notification.request);
  if (!incoming) {
    logIncomingCallNotif('response.parse_fail', {
      identifier,
      dataKeys: Object.keys(
        (response.notification.request.content?.data as Record<string, unknown>) ?? {}
      ),
    });
    const callId = parseCallIdFromNotificationIdentifier(identifier);
    if (callId) {
      const shown = await readShownIncomingCallNotification();
      if (shown?.callId === callId) {
        logIncomingCallNotif('response.parse_ok', { callId, source: 'shown_storage' });
        await openIncomingFromNotificationTap(shown);
        scheduleClearLastNotificationResponse(Notifications);
      }
    }
    return;
  }

  logIncomingCallNotif('response.parse_ok', {
    callId: incoming.callId,
    identifier,
    isLocalTag: identifier.startsWith(INCOMING_CALL_NOTIFICATION_ID_PREFIX),
  });
  await openIncomingFromNotificationTap(incoming);
  scheduleClearLastNotificationResponse(Notifications);
  await captureIncomingCallNotifDebugSnapshot('response_listener_done', {
    callId: incoming.callId,
    identifier,
  });
}

function scheduleClearLastNotificationResponse(
  Notifications: typeof import('expo-notifications')
): void {
  if (typeof Notifications.clearLastNotificationResponseAsync !== 'function') return;
  setTimeout(() => {
    void Notifications.clearLastNotificationResponseAsync?.().catch(() => {});
  }, CLEAR_LAST_RESPONSE_DELAY_MS);
}

async function resumeIncomingFromTrayIfNeeded(msSinceResponse: number | null): Promise<void> {
  if (msSinceResponse != null && msSinceResponse < 2000) return;

  const shown = await readShownIncomingCallNotification();
  if (!shown || !canNavigateToIncomingCall(shown.callId)) return;

  const Notifications = await loadNotificationsModule();
  if (!Notifications?.getPresentedNotificationsAsync) {
    await openIncomingFromNotificationTap(shown);
    return;
  }

  try {
    const presented = await Notifications.getPresentedNotificationsAsync();
    const targetId = `${INCOMING_CALL_NOTIFICATION_ID_PREFIX}${shown.callId}`;
    const stillRinging = presented.some((n) => (n.request.identifier ?? '') === targetId);
    if (!stillRinging) return;

    logIncomingCallNotif('tap.open_start', {
      callId: shown.callId,
      tapPath: 'app_active_tray_fallback',
    });
    await openIncomingFromNotificationTap(shown);
  } catch {
    // ignore
  }
}

async function checkLastNotificationResponse(): Promise<void> {
  const Notifications = await loadNotificationsModule();
  if (!Notifications) return;
  logIncomingCallNotif('response.check_last');
  await captureIncomingCallNotifDebugSnapshot('check_last_before', {});
  const last =
    typeof Notifications.getLastNotificationResponse === 'function'
      ? Notifications.getLastNotificationResponse()
      : await Notifications.getLastNotificationResponseAsync();
  await processNotificationResponse(Notifications, last);
  await captureIncomingCallNotifDebugSnapshot('check_last_after', {
    hadLast: last != null,
  });
}

/**
 * Keep a single incoming-call row in the shade (tag `incoming-{callId}`).
 * Duplicate rows (e.g. FCM alert + local) share one PendingIntent slot on Android 12+
 * and expanded-panel taps can open the app without notification-response extras.
 */
async function collapseIncomingCallTrayToSingle(
  incoming: IncomingCallNotificationPayload
): Promise<void> {
  const Notifications = await loadNotificationsModule();
  if (!Notifications?.getPresentedNotificationsAsync) return;

  const targetIdentifier = `${INCOMING_CALL_NOTIFICATION_ID_PREFIX}${incoming.callId}`;
  try {
    const presented = await Notifications.getPresentedNotificationsAsync();
    logIncomingCallNotif('collapse.scan', {
      callId: incoming.callId,
      targetIdentifier,
      presentedCount: presented.length,
      presentedIds: presented.map((n) => n.request.identifier ?? ''),
    });

    for (const notification of presented) {
      const parsed = parseIncomingFromNotificationRequest(notification.request);
      if (!parsed || parsed.callId !== incoming.callId) continue;

      const identifier = notification.request.identifier ?? '';
      if (identifier === targetIdentifier) continue;

      logIncomingCallNotif('collapse.dismiss', {
        dismissIdentifier: identifier,
        keepIdentifier: targetIdentifier,
      });
      await Notifications.dismissNotificationAsync(identifier);
    }
  } catch (e) {
    logIncomingCallNotif('collapse.error', { message: e instanceof Error ? e.message : String(e) });
  }
}

/** Call after navigation + call-signal handlers are ready (receiver signed in). */
export function consumePendingNotificationTap(): void {
  void (async () => {
    const persisted = await readPendingIncomingCallTap();
    if (persisted && canNavigateToIncomingCall(persisted.callId)) {
      logIncomingCallNotif('consume.pending', { callId: persisted.callId });
      if (openHandler) {
        openHandler(persisted);
        await clearPendingIncomingCallTap();
      } else {
        queuePendingOpen(persisted);
      }
    } else if (persisted) {
      await clearPendingIncomingCallTap();
    }
    flushPendingOpens();
    logIncomingCallNotif('consume.flush');
    void checkLastNotificationResponse();
  })();
}

export async function ensureIncomingCallNotificationSetup(): Promise<void> {
  if (!canUseLocalNotifications() || setupDone) return;

  const Notifications = await loadNotificationsModule();
  if (!Notifications) return;

  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const isIncomingCall = notification.request.content.data?.type === 'call_incoming';
      const appActive = AppState.currentState === 'active';
      const identifier = notification.request.identifier ?? '';

      // Remote FCM duplicate while background: suppress a second tray row.
      // Local incoming-{callId} notifications must still play channel ringtone.
      if (isIncomingCall && !appActive) {
        const isLocalIncoming = identifier.startsWith(INCOMING_CALL_NOTIFICATION_ID_PREFIX);
        logIncomingCallNotif('handler.decision', {
          identifier,
          suppressTray: !isLocalIncoming,
          allowSound: isLocalIncoming,
          appActive,
        });
        if (!isLocalIncoming) {
          return {
            shouldShowAlert: false,
            shouldPlaySound: false,
            shouldSetBadge: false,
            shouldShowBanner: false,
            shouldShowList: false,
          };
        }
        return {
          shouldShowAlert: false,
          shouldPlaySound: true,
          shouldSetBadge: false,
          shouldShowBanner: false,
          shouldShowList: false,
        };
      }

      logIncomingCallNotif('handler.decision', {
        identifier,
        isIncomingCall,
        appActive,
        suppressTray: false,
      });
      return {
        shouldShowAlert: !appActive || !isIncomingCall,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      };
    },
  });

  if (Platform.OS === 'android') {
    // Recreate so ringtone asset updates apply on existing installs (channel sound is immutable).
    try {
      await Notifications.deleteNotificationChannelAsync(INCOMING_CALL_CHANNEL_ID);
    } catch {
      // ignore
    }
    await Notifications.setNotificationChannelAsync(INCOMING_CALL_CHANNEL_ID, {
      name: 'Incoming calls',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 280, 200, 280],
      lightColor: '#7c3aed',
      sound: INCOMING_CALL_NOTIFICATION_SOUND_ANDROID,
      enableLights: true,
      enableVibrate: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: true,
      audioAttributes: {
        usage: Notifications.AndroidAudioUsage.NOTIFICATION_RINGTONE,
        contentType: Notifications.AndroidAudioContentType.SONIFICATION,
        flags: {
          enforceAudibility: true,
          requestHardwareAudioVideoSynchronization: false,
        },
      },
    });
  }

  const defaultAction =
    Notifications.DEFAULT_ACTION_IDENTIFIER ?? 'expo.modules.notifications.actions.DEFAULT';
  await Notifications.setNotificationCategoryAsync(
    INCOMING_CALL_CATEGORY_ID,
    [
      {
        identifier: defaultAction,
        buttonTitle: 'Open',
        options: { opensAppToForeground: true },
      },
    ],
    { allowInCarPlay: true, showTitle: true, showSubtitle: true }
  );

  setupDone = true;
}

async function ensureNotificationPermission(): Promise<boolean> {
  const Notifications = await loadNotificationsModule();
  if (!Notifications) return false;

  const current = await Notifications.getPermissionsAsync();
  if (current.status === 'granted') return true;
  const requested = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: false,
      allowSound: true,
    },
  });
  return requested.status === 'granted';
}

function buildIncomingCallNotificationContent(
  Notifications: typeof import('expo-notifications'),
  incoming: IncomingCallNotificationPayload
): import('expo-notifications').NotificationContentInput {
  const base = {
    title: 'Incoming call',
    body: `${incoming.peerName} is calling you`,
    data: buildNotificationData(incoming),
    sound:
      Platform.OS === 'ios'
        ? INCOMING_CALL_NOTIFICATION_SOUND_IOS
        : INCOMING_CALL_NOTIFICATION_SOUND_ANDROID,
    categoryIdentifier: INCOMING_CALL_CATEGORY_ID,
    interruptionLevel: 'critical' as const,
    priority: Notifications.AndroidNotificationPriority.MAX,
    ...(Platform.OS === 'ios'
      ? {
          threadIdentifier: `incoming-${incoming.callId}`,
        }
      : {
          channelId: INCOMING_CALL_CHANNEL_ID,
          sticky: false,
          autoDismiss: true,
          color: '#7c3aed',
          vibrate: [0, 280, 200, 280],
        }),
  };
  return base;
}

/** Android delivers notification `data` reliably only when values are strings. */
function buildNotificationData(incoming: IncomingCallNotificationPayload): Record<string, string> {
  const url = incomingCallDeepLink(incoming);
  return {
    type: 'call_incoming',
    callId: incoming.callId,
    fromId: incoming.fromId,
    fromType: incoming.fromType,
    peerName: incoming.peerName,
    peerImage: incoming.peerImage ?? '',
    url,
    payload: JSON.stringify({
      type: 'call_incoming',
      callId: incoming.callId,
      fromId: incoming.fromId,
      fromType: incoming.fromType,
      peerName: incoming.peerName,
      peerImage: incoming.peerImage ?? null,
      url,
    }),
  };
}

/** Shows a high-priority local notification (Android background / minimized app). */
export async function showIncomingCallNotification(
  incoming: IncomingCallNotificationPayload
): Promise<void> {
  if (!canUseLocalNotifications()) return;
  const callId = incoming.callId.trim();
  if (!callId || notifiedCallIds.has(callId)) return;

  try {
    const Notifications = await loadNotificationsModule();
    if (!Notifications) return;

    await ensureIncomingCallNotificationSetup();
    if (!(await ensureNotificationPermission())) return;

    if (Platform.OS === 'android') {
      await ensureNativeIncomingCallChannel();
    }

    let showSessionId = callId;
    if (isIncomingCallNotifDebugBuild()) {
      const fileDbg = await import('./incomingCallNotificationFileDebug');
      showSessionId = fileDbg.startIncomingCallNotifShowSession(callId);
    }
    logIncomingCallNotif('show.start', { callId, showSessionId });
    prefetchIncomingCallBootstrapFromNotification(incoming);
    await collapseIncomingCallTrayToSingle(incoming);

    const identifier = `${INCOMING_CALL_NOTIFICATION_ID_PREFIX}${callId}`;
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: buildIncomingCallNotificationContent(Notifications, incoming),
      trigger: null,
    });
    if (Platform.OS === 'android') {
      // Let the first tray post alert (ringtone) before tap-overlay re-post.
      await new Promise((resolve) => setTimeout(resolve, 400));
      void applyIncomingCallFullScreenIntent(identifier);
    }
    await captureIncomingCallNotifDebugSnapshot('after_show_scheduled', {
      callId,
      identifier,
      showSessionId,
    });
    void persistShownIncomingCallNotification(incoming);
    notifiedCallIds.add(callId);
    logIncomingCallNotif('show.scheduled', {
      callId,
      identifier: `${INCOMING_CALL_NOTIFICATION_ID_PREFIX}${callId}`,
    });
    await collapseIncomingCallTrayToSingle(incoming);
  } catch (e) {
    notifiedCallIds.delete(callId);
    logIncomingCallNotif('show.error', {
      callId,
      message: e instanceof Error ? e.message : String(e),
    });
  }
}

export async function dismissIncomingCallNotification(callId?: string): Promise<void> {
  const id = callId?.trim();
  if (id) notifiedCallIds.delete(id);
  if (!canUseLocalNotifications()) return;
  try {
    const Notifications = await loadNotificationsModule();
    if (!Notifications || !id) return;
    await Notifications.dismissNotificationAsync(`${INCOMING_CALL_NOTIFICATION_ID_PREFIX}${id}`);
    void clearShownIncomingCallNotification();
  } catch {
    // ignore
  }
}

export function clearIncomingCallNotificationDedupe(callId?: string): void {
  const id = callId?.trim();
  if (!id) {
    notifiedCallIds.clear();
    handledIncomingCallIds.clear();
    return;
  }
  notifiedCallIds.delete(id);
  releaseIncomingCallNavigation(id);
  void dismissIncomingCallNotification(id);
}

export async function registerReceiverExpoPushToken(
  saveToken: (expoPushToken: string) => Promise<void>
): Promise<void> {
  if (!canUseExpoPushToken()) return;

  try {
    const Notifications = await loadNotificationsModule();
    if (!Notifications) return;

    await ensureIncomingCallNotificationSetup();
    if (!(await ensureNotificationPermission())) return;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
    if (!projectId) return;

    const push = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = push.data?.trim();
    if (!token) return;
    await saveToken(token);
  } catch {
    // Push registration is best-effort (e.g. missing FCM on some builds).
  }
}

/** Register listeners once; safe to call from App root. */
export function ensureIncomingCallNotificationInfrastructure(): () => void {
  if (!canUseLocalNotifications()) {
    return () => {};
  }
  if (infrastructureReady && disposeInfrastructure) {
    return disposeInfrastructure;
  }

  let disposed = false;
  let responseSub: { remove: () => void } | null = null;
  let receivedSub: { remove: () => void } | null = null;
  let appStateSub: { remove: () => void } | null = null;
  let linkingSub: { remove: () => void } | null = null;
  const removeNativeTapDebug = ensureIncomingCallNativeTapDebugListener();

  void (async () => {
    const Notifications = await loadNotificationsModule();
    if (!Notifications || disposed) return;

    await ensureIncomingCallNotificationSetup();

    responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      void processNotificationResponse(Notifications, response);
    });

    receivedSub = Notifications.addNotificationReceivedListener((notification) => {
      const incoming = parseIncomingFromNotificationRequest(notification.request);
      if (!incoming || !isAppInBackground()) return;
      logIncomingCallNotif('received.background', {
        identifier: notification.request.identifier ?? '',
        callId: incoming.callId,
      });
      void showIncomingCallNotification(incoming);
    });

    const onAppState = (state: AppStateStatus): void => {
      logIncomingCallNotif('app_state.change', { state });
      if (state === 'active') {
        const msSinceResponse =
          lastNotificationResponseListenerAtMs > 0
            ? Date.now() - lastNotificationResponseListenerAtMs
            : null;
        logIncomingCallNotif('app_state.active', {
          msSinceResponseListener: msSinceResponse,
          likelyExpandedShadeOnlyOpen:
            msSinceResponse == null || msSinceResponse > 1500,
        });
        void captureIncomingCallNotifDebugSnapshot('app_became_active', {
          msSinceResponseListener: msSinceResponse,
          note:
            'If compact tap works but expanded fails: compact often has msSinceResponseListener small; expanded may show large ms or null lastResponse in snapshot.',
        });
        lastHandledTapAtByCallId.clear();
        void checkLastNotificationResponse();
        flushPendingOpens();
        void resumeIncomingFromTrayIfNeeded(msSinceResponse);
      }
    };
    appStateSub = AppState.addEventListener('change', onAppState);

    const onUrl = (event: { url: string }): void => {
      logIncomingCallNotif('linking.url', { url: event.url });
      const fromUrl = parseIncomingCallDeepLink(event.url);
      if (!fromUrl) return;
      void openIncomingFromNotificationTap(fromUrl);
    };
    linkingSub = Linking.addEventListener('url', onUrl);
    void Linking.getInitialURL().then((url) => {
      if (url) {
        logIncomingCallNotif('linking.initial', { url });
        onUrl({ url });
      }
    });

    void captureIncomingCallNotifDebugSnapshot('infrastructure_ready', {});
    void checkLastNotificationResponse();
  })();

  infrastructureReady = true;
  const cleanup = (): void => {
    disposed = true;
    infrastructureReady = false;
    responseSub?.remove();
    receivedSub?.remove();
    appStateSub?.remove();
    linkingSub?.remove();
    removeNativeTapDebug();
    responseSub = null;
    receivedSub = null;
    appStateSub = null;
    linkingSub = null;
    disposeInfrastructure = null;
  };
  disposeInfrastructure = cleanup;
  return cleanup;
}

export function bindIncomingCallNotificationHandlers(
  onOpenIncoming: (incoming: IncomingCallNotificationPayload) => void
): () => void {
  if (!canUseLocalNotifications()) {
    return () => {};
  }

  ensureIncomingCallNotificationInfrastructure();
  openHandler = onOpenIncoming;
  consumePendingNotificationTap();

  return () => {
    openHandler = null;
  };
}
