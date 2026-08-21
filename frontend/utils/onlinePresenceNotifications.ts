import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { canUseLocalNotifications } from './incomingCallNotifications';

export const ONLINE_PRESENCE_CHANNEL_ID = 'online_presence';
export const RECEIVER_ONLINE_PUSH_TYPE = 'receiver_online';
export const CALLER_ONLINE_PUSH_TYPE = 'caller_online';

const PENDING_CALL_KEY = '@selecto/pending_receiver_online_call_v1';
const TAP_DEDUPE_MS = 5000;

export type ReceiverOnlineCallTarget = {
  receiverId: string;
  receiverName: string;
  receiverImage: string | null;
};

type OnlinePresenceCallHandler = (target: ReceiverOnlineCallTarget) => void;

let callHandler: OnlinePresenceCallHandler | null = null;
let lastHandledReceiverIdAt = new Map<string, number>();
let infrastructureReady = false;
let disposeInfrastructure: (() => void) | null = null;

export function isOnlinePresenceNotificationType(type: unknown): boolean {
  return type === RECEIVER_ONLINE_PUSH_TYPE || type === CALLER_ONLINE_PUSH_TYPE;
}

export function parseReceiverOnlineCallTarget(
  data: Record<string, unknown> | undefined
): ReceiverOnlineCallTarget | null {
  if (!data || data.type !== RECEIVER_ONLINE_PUSH_TYPE) return null;
  const receiverId = typeof data.receiverId === 'string' ? data.receiverId.trim() : '';
  const receiverName =
    typeof data.receiverName === 'string' && data.receiverName.trim()
      ? data.receiverName.trim()
      : 'Receiver';
  if (!receiverId) return null;
  const receiverImage =
    typeof data.receiverImage === 'string' && data.receiverImage.trim()
      ? data.receiverImage.trim()
      : null;
  return { receiverId, receiverName, receiverImage };
}

async function persistPendingReceiverOnlineCall(target: ReceiverOnlineCallTarget): Promise<void> {
  try {
    await AsyncStorage.setItem(PENDING_CALL_KEY, JSON.stringify(target));
  } catch {
    // ignore
  }
}

async function readPendingReceiverOnlineCall(): Promise<ReceiverOnlineCallTarget | null> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_CALL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    return parseReceiverOnlineCallTarget({
      type: RECEIVER_ONLINE_PUSH_TYPE,
      ...(parsed as Record<string, unknown>),
    });
  } catch {
    return null;
  }
}

async function clearPendingReceiverOnlineCall(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PENDING_CALL_KEY);
  } catch {
    // ignore
  }
}

function shouldSkipDuplicateCallTap(receiverId: string): boolean {
  const now = Date.now();
  const last = lastHandledReceiverIdAt.get(receiverId) ?? 0;
  if (now - last < TAP_DEDUPE_MS) return true;
  lastHandledReceiverIdAt.set(receiverId, now);
  return false;
}

function openReceiverOnlineCall(target: ReceiverOnlineCallTarget): void {
  if (shouldSkipDuplicateCallTap(target.receiverId)) return;
  if (callHandler) {
    callHandler(target);
    void clearPendingReceiverOnlineCall();
    return;
  }
  void persistPendingReceiverOnlineCall(target);
}

async function consumePendingReceiverOnlineCall(): Promise<void> {
  if (!callHandler) return;
  const pending = await readPendingReceiverOnlineCall();
  if (!pending) return;
  if (shouldSkipDuplicateCallTap(pending.receiverId)) {
    await clearPendingReceiverOnlineCall();
    return;
  }
  callHandler(pending);
  await clearPendingReceiverOnlineCall();
}

async function handleNotificationResponse(
  response: import('expo-notifications').NotificationResponse | null
): Promise<void> {
  if (!response) return;
  const data = response.notification.request.content.data as Record<string, unknown> | undefined;
  if (data?.type === CALLER_ONLINE_PUSH_TYPE) {
    // Receiver tap: opening the app is enough.
    return;
  }
  const target = parseReceiverOnlineCallTarget(data);
  if (!target) return;
  openReceiverOnlineCall(target);
}

/** Register the caller-side tap handler that starts a call. */
export function bindOnlinePresenceCallHandler(handler: OnlinePresenceCallHandler | null): () => void {
  callHandler = handler;
  if (handler) {
    void consumePendingReceiverOnlineCall();
    void checkLastOnlinePresenceResponse();
  }
  return () => {
    if (callHandler === handler) callHandler = null;
  };
}

async function checkLastOnlinePresenceResponse(): Promise<void> {
  if (Platform.OS === 'web' || !canUseLocalNotifications()) return;
  try {
    const Notifications = await import('expo-notifications');
    const last =
      typeof Notifications.getLastNotificationResponse === 'function'
        ? Notifications.getLastNotificationResponse()
        : await Notifications.getLastNotificationResponseAsync();
    await handleNotificationResponse(last);
  } catch {
    // ignore
  }
}

export function ensureOnlinePresenceNotificationInfrastructure(): () => void {
  if (!canUseLocalNotifications()) return () => {};
  if (infrastructureReady && disposeInfrastructure) return disposeInfrastructure;

  let disposed = false;
  let responseSub: { remove: () => void } | null = null;

  void (async () => {
    try {
      const Notifications = await import('expo-notifications');
      if (disposed) return;
      responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
        void handleNotificationResponse(response);
      });
      await checkLastOnlinePresenceResponse();
    } catch {
      // ignore
    }
  })();

  infrastructureReady = true;
  disposeInfrastructure = () => {
    disposed = true;
    responseSub?.remove();
    responseSub = null;
    infrastructureReady = false;
    disposeInfrastructure = null;
  };
  return disposeInfrastructure;
}
