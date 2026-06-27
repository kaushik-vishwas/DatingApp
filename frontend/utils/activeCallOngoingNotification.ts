import { AppState, Platform } from 'react-native';
import { useEffect } from 'react';

const ACTIVE_CALL_NOTIFICATION_ID = 'active-voice-call-ongoing';
const ACTIVE_CALL_CHANNEL_ID = 'active_voice_call';

let channelReady = false;
let showing = false;

async function loadNotificationsModule(): Promise<typeof import('expo-notifications') | null> {
  try {
    return await import('expo-notifications');
  } catch {
    return null;
  }
}

async function ensureChannel(
  Notifications: typeof import('expo-notifications')
): Promise<void> {
  if (channelReady || Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ACTIVE_CALL_CHANNEL_ID, {
    name: 'Ongoing calls',
    importance: Notifications.AndroidImportance.LOW,
    sound: null,
    vibrationPattern: [],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
  channelReady = true;
}

/** Show or hide the sticky ongoing-call tray notification (Android, background only). */
export async function syncActiveCallOngoingNotification(
  shouldShow: boolean,
  peerName: string
): Promise<void> {
  if (Platform.OS !== 'android') return;

  const Notifications = await loadNotificationsModule();
  if (!Notifications) return;

  if (!shouldShow) {
    if (!showing) return;
    showing = false;
    try {
      await Notifications.dismissNotificationAsync(ACTIVE_CALL_NOTIFICATION_ID);
    } catch {
      // ignore
    }
    return;
  }

  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return;

  await ensureChannel(Notifications);
  const label = peerName.trim() || 'Contact';
  showing = true;
  await Notifications.scheduleNotificationAsync({
    identifier: ACTIVE_CALL_NOTIFICATION_ID,
    content: {
      title: 'Call in progress',
      body: `On call with ${label} · Tap to return`,
      data: { type: 'active_voice_call' },
      sound: false,
      categoryIdentifier: 'call',
      ...(Platform.OS === 'android'
        ? {
            channelId: ACTIVE_CALL_CHANNEL_ID,
            sticky: true,
            autoDismiss: false,
            priority: Notifications.AndroidNotificationPriority.LOW,
            color: '#7c3aed',
          }
        : {}),
    },
    trigger: null,
  });
}

/** Ongoing status-bar notification while an active call runs with the app in background. */
export function useActiveCallOngoingNotification(active: boolean, peerName: string): void {
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const update = (): void => {
      const inBackground = AppState.currentState !== 'active';
      void syncActiveCallOngoingNotification(active && inBackground, peerName);
    };

    update();
    const sub = AppState.addEventListener('change', update);
    return () => {
      sub.remove();
      void syncActiveCallOngoingNotification(false, peerName);
    };
  }, [active, peerName]);
}
