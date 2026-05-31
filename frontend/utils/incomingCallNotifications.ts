import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { AppState, Platform } from 'react-native';

export type IncomingCallNotificationPayload = {
  callId: string;
  fromType: 'u' | 'r';
  fromId: string;
  peerName: string;
  peerImage?: string | null;
};

const INCOMING_CALL_CHANNEL_ID = 'incoming_calls';
let setupDone = false;
let lastNotifiedCallId: string | null = null;
let notificationsModulePromise: Promise<typeof import('expo-notifications') | null> | null =
  null;

/** Expo Go on Android (SDK 53+) crashes if expo-notifications is loaded (remote push removed). */
function canUseLocalNotifications(): boolean {
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

function parseIncomingFromData(
  data: Record<string, unknown> | undefined
): IncomingCallNotificationPayload | null {
  if (!data || data.type !== 'call_incoming') return null;
  const callId = typeof data.callId === 'string' ? data.callId.trim() : '';
  const fromId = typeof data.fromId === 'string' ? data.fromId.trim() : '';
  if (!callId || !fromId) return null;
  const fromType: 'u' | 'r' = data.fromType === 'r' ? 'r' : 'u';
  const peerName =
    typeof data.peerName === 'string' && data.peerName.trim()
      ? data.peerName.trim()
      : 'Caller';
  const peerImage =
    typeof data.peerImage === 'string'
      ? data.peerImage
      : data.peerImage === null
        ? null
        : undefined;
  return { callId, fromType, fromId, peerName, peerImage };
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
      bypassDnd: false,
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

/** Shows a high-priority local notification (Android background / minimized app). */
export async function showIncomingCallNotification(
  incoming: IncomingCallNotificationPayload
): Promise<void> {
  if (!canUseLocalNotifications()) return;
  if (lastNotifiedCallId === incoming.callId) return;
  lastNotifiedCallId = incoming.callId;

  try {
    const Notifications = await loadNotificationsModule();
    if (!Notifications) {
      lastNotifiedCallId = null;
      return;
    }

    await ensureIncomingCallNotificationSetup();
    if (!(await ensureNotificationPermission())) return;

    await Notifications.scheduleNotificationAsync({
      identifier: `incoming-${incoming.callId}`,
      content: {
        title: 'Incoming call',
        body: `${incoming.peerName} is calling you`,
        data: {
          type: 'call_incoming',
          callId: incoming.callId,
          fromId: incoming.fromId,
          fromType: incoming.fromType,
          peerName: incoming.peerName,
          peerImage: incoming.peerImage ?? null,
        },
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.MAX,
        ...(Platform.OS === 'android' ? { channelId: INCOMING_CALL_CHANNEL_ID } : {}),
      },
      trigger: null,
    });
  } catch {
    lastNotifiedCallId = null;
  }
}

export function clearIncomingCallNotificationDedupe(callId?: string): void {
  if (!callId || lastNotifiedCallId === callId) {
    lastNotifiedCallId = null;
  }
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

export function bindIncomingCallNotificationHandlers(
  onOpenIncoming: (incoming: IncomingCallNotificationPayload) => void
): () => void {
  if (!canUseLocalNotifications()) {
    return () => {};
  }

  let disposed = false;
  let responseSub: { remove: () => void } | null = null;

  void (async () => {
    const Notifications = await loadNotificationsModule();
    if (!Notifications || disposed) return;

    const openFromResponse = (
      response: import('expo-notifications').NotificationResponse | null
    ): void => {
      if (!response) return;
      const incoming = parseIncomingFromData(
        response.notification.request.content.data as Record<string, unknown>
      );
      if (incoming) onOpenIncoming(incoming);
    };

    responseSub = Notifications.addNotificationResponseReceivedListener(openFromResponse);
    void Notifications.getLastNotificationResponseAsync().then(openFromResponse);
  })();

  return () => {
    disposed = true;
    responseSub?.remove();
    responseSub = null;
  };
}
