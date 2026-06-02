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
export const INCOMING_CALL_DEEP_LINK_PREFIX = 'nestham://incoming-call/';

let setupDone = false;
let infrastructureReady = false;
const notifiedCallIds = new Set<string>();
const handledNotificationResponseKeys = new Set<string>();
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

function parseIncomingFromData(
  data: Record<string, unknown> | undefined
): IncomingCallNotificationPayload | null {
  if (!data || data.type !== 'call_incoming') return null;
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
  return parseIncomingFromData(data) ?? parseIncomingFromUrlField(data);
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

function dispatchIncomingOpen(incoming: IncomingCallNotificationPayload): void {
  const merged: IncomingCallNotificationPayload = {
    callId: incoming.callId.trim(),
    fromType: incoming.fromType,
    fromId: incoming.fromId.trim(),
    peerName: incoming.peerName.trim() || 'Caller',
    peerImage: incoming.peerImage ?? null,
  };
  if (!merged.callId) return;
  if (openHandler) {
    openHandler(merged);
    return;
  }
  queuePendingOpen(merged);
}

async function processNotificationResponse(
  Notifications: typeof import('expo-notifications'),
  response: import('expo-notifications').NotificationResponse | null
): Promise<void> {
  if (!response) return;
  const notificationId =
    typeof response.notification?.request?.identifier === 'string'
      ? response.notification.request.identifier
      : '';
  const actionId = response.actionIdentifier;
  const defaultAction =
    Notifications.DEFAULT_ACTION_IDENTIFIER ?? 'expo.modules.notifications.actions.DEFAULT';
  if (actionId && actionId !== defaultAction) return;

  const incoming = parseIncomingFromNotificationContent(
    response.notification.request.content as { data?: Record<string, unknown> }
  );
  if (!incoming) return;
  const responseKey = `${notificationId}:${incoming.callId}:${actionId ?? defaultAction}`;
  if (handledNotificationResponseKeys.has(responseKey)) {
    return;
  }
  handledNotificationResponseKeys.add(responseKey);
  await dismissIncomingCallNotification(incoming.callId);
  dispatchIncomingOpen(incoming);
  // Avoid replaying the same "last response" on future app-active transitions.
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

function buildNotificationData(incoming: IncomingCallNotificationPayload): Record<string, unknown> {
  return {
    type: 'call_incoming',
    callId: incoming.callId,
    fromId: incoming.fromId,
    fromType: incoming.fromType,
    peerName: incoming.peerName,
    peerImage: incoming.peerImage ?? null,
    url: incomingCallDeepLink(incoming),
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
      identifier: `incoming-${callId}`,
      content: {
        title: 'Incoming call',
        body: `${incoming.peerName} is calling you`,
        data: buildNotificationData(incoming),
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.MAX,
        ...(Platform.OS === 'android'
          ? {
              channelId: INCOMING_CALL_CHANNEL_ID,
              sticky: true,
              autoDismiss: false,
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
    await Notifications.dismissNotificationAsync(`incoming-${id}`);
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
      const incoming = parseIncomingFromNotificationContent(
        notification.request.content as { data?: Record<string, unknown> }
      );
      if (!incoming || !isAppInBackground()) return;
      void showIncomingCallNotification(incoming);
    });

    const onAppState = (state: AppStateStatus): void => {
      if (state === 'active') {
        void checkLastNotificationResponse();
        setTimeout(() => void checkLastNotificationResponse(), 400);
        setTimeout(() => void checkLastNotificationResponse(), 1200);
        // Some Android builds deliver tap intent URL without response callback (drawer-tap path).
        void Linking.getInitialURL().then((url) => {
          if (!url) return;
          const fromUrl = parseIncomingCallDeepLink(url);
          if (!fromUrl) return;
          void dismissIncomingCallNotification(fromUrl.callId);
          dispatchIncomingOpen(fromUrl);
        });
        flushPendingOpens();
      }
    };
    appStateSub = AppState.addEventListener('change', onAppState);

    const onUrl = (event: { url: string }): void => {
      const fromUrl = parseIncomingCallDeepLink(event.url);
      if (!fromUrl) return;
      void dismissIncomingCallNotification(fromUrl.callId);
      dispatchIncomingOpen(fromUrl);
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
  flushPendingOpens();
  void checkLastNotificationResponse();

  return () => {
    openHandler = null;
  };
}
