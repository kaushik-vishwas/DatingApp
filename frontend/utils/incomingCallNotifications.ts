import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { AppState, Linking, Platform, type AppStateStatus } from 'react-native';

export type IncomingCallNotificationPayload = {
  callId: string;
  fromType: 'u' | 'r';
  fromId: string;
  peerName: string;
  peerImage?: string | null;
};

const INCOMING_CALL_CHANNEL_ID = 'incoming_calls';
const INCOMING_CALL_NOTIFICATION_ID_PREFIX = 'incoming-';
export const INCOMING_CALL_DEEP_LINK_PREFIX = 'nestham://incoming-call/';

let setupDone = false;
let infrastructureReady = false;
const notifiedCallIds = new Set<string>();
/** Short debounce so listener + app-active + Linking do not triple-navigate. */
const lastHandledTapAtByCallId = new Map<string, number>();
const TAP_DEDUPE_MS = 2000;
let openHandler: ((incoming: IncomingCallNotificationPayload) => void) | null = null;
const pendingOpens = new Map<string, IncomingCallNotificationPayload>();

let notificationsModulePromise: Promise<typeof import('expo-notifications') | null> | null =
  null;

let disposeInfrastructure: (() => void) | null = null;

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

function parseIncomingFromData(
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

function parseIncomingFromNotificationRequest(request: {
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
  pendingOpens.set(incoming.callId, incoming);
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
  const now = Date.now();
  const last = lastHandledTapAtByCallId.get(callId) ?? 0;
  if (now - last < TAP_DEDUPE_MS) return true;
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
  if (shouldSkipDuplicateTap(merged.callId)) return;
  if (openHandler) {
    openHandler(merged);
    return;
  }
  queuePendingOpen(merged);
}

function openIncomingFromNotificationTap(incoming: IncomingCallNotificationPayload): void {
  void dismissIncomingCallNotification(incoming.callId);
  if (!openHandler && Platform.OS === 'android') {
    void Linking.openURL(incomingCallDeepLink(incoming)).catch(() => {});
  }
  dispatchIncomingOpen(incoming);
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
  if (actionId && actionId !== defaultAction) return;

  if (!isNotificationResponseFresh(response)) {
    if (typeof Notifications.clearLastNotificationResponseAsync === 'function') {
      void Notifications.clearLastNotificationResponseAsync().catch(() => {});
    }
    return;
  }

  const incoming = parseIncomingFromNotificationRequest(response.notification.request);
  if (!incoming) return;

  openIncomingFromNotificationTap(incoming);

  if (typeof Notifications.clearLastNotificationResponseAsync === 'function') {
    void Notifications.clearLastNotificationResponseAsync().catch(() => {});
  }
}

async function checkLastNotificationResponse(): Promise<void> {
  const Notifications = await loadNotificationsModule();
  if (!Notifications) return;
  const last = await Notifications.getLastNotificationResponseAsync();
  await processNotificationResponse(Notifications, last);
}

/** Call after navigation + call-signal handlers are ready (receiver signed in). */
export function consumePendingNotificationTap(): void {
  flushPendingOpens();
  void checkLastNotificationResponse();
  setTimeout(() => void checkLastNotificationResponse(), 250);
  setTimeout(() => void checkLastNotificationResponse(), 900);
}

export async function ensureIncomingCallNotificationSetup(): Promise<void> {
  if (!canUseLocalNotifications() || setupDone) return;

  const Notifications = await loadNotificationsModule();
  if (!Notifications) return;

  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const isIncomingCall = notification.request.content.data?.type === 'call_incoming';
      const appActive = AppState.currentState === 'active';
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
    await Notifications.setNotificationChannelAsync(INCOMING_CALL_CHANNEL_ID, {
      name: 'Incoming calls',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 280, 200, 280],
      lightColor: '#7c3aed',
      sound: 'default',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: true,
    });
  }

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

    await Notifications.scheduleNotificationAsync({
      identifier: `${INCOMING_CALL_NOTIFICATION_ID_PREFIX}${callId}`,
      content: {
        title: 'Incoming call',
        body: `${incoming.peerName} is calling you`,
        data: buildNotificationData(incoming),
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.MAX,
        ...(Platform.OS === 'android'
          ? {
              channelId: INCOMING_CALL_CHANNEL_ID,
              // Sticky notifications are harder to open from the drawer on some OEMs (Samsung).
              sticky: false,
              autoDismiss: true,
            }
          : {}),
      },
      trigger: null,
    });
    notifiedCallIds.add(callId);
  } catch {
    notifiedCallIds.delete(callId);
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
  } catch {
    // ignore
  }
}

export function clearIncomingCallNotificationDedupe(callId?: string): void {
  const id = callId?.trim();
  if (!id) {
    notifiedCallIds.clear();
    return;
  }
  notifiedCallIds.delete(id);
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
      void showIncomingCallNotification(incoming);
    });

    const onAppState = (state: AppStateStatus): void => {
      if (state === 'active') {
        void checkLastNotificationResponse();
        setTimeout(() => void checkLastNotificationResponse(), 400);
        setTimeout(() => void checkLastNotificationResponse(), 1200);
        flushPendingOpens();
      }
    };
    appStateSub = AppState.addEventListener('change', onAppState);

    const onUrl = (event: { url: string }): void => {
      const fromUrl = parseIncomingCallDeepLink(event.url);
      if (!fromUrl) return;
      openIncomingFromNotificationTap(fromUrl);
    };
    linkingSub = Linking.addEventListener('url', onUrl);
    void Linking.getInitialURL().then((url) => {
      if (url) onUrl({ url });
    });

    void checkLastNotificationResponse();
    setTimeout(() => void checkLastNotificationResponse(), 500);
  })();

  infrastructureReady = true;
  const cleanup = (): void => {
    disposed = true;
    infrastructureReady = false;
    responseSub?.remove();
    receivedSub?.remove();
    appStateSub?.remove();
    linkingSub?.remove();
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
