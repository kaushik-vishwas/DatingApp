import type { LinkingOptions } from '@react-navigation/native';
import * as ExpoLinking from 'expo-linking';
import { Platform } from 'react-native';
import type { RootStackParamList } from './RootStackParamList';
import {
  INCOMING_CALL_DEEP_LINK_PREFIX,
  incomingCallDeepLink,
  parseIncomingCallDeepLink,
  parseIncomingFromNotificationRequest,
} from '../utils/incomingCallNotifications';

const APP_PREFIXES = [
  ExpoLinking.createURL('/'),
  'nestham://',
  'com.kaushikvishwas.frontend://',
];

function urlFromNotificationResponse(
  response: import('expo-notifications').NotificationResponse | null
): string | null {
  if (!response) return null;
  const incoming = parseIncomingFromNotificationRequest(response.notification.request);
  if (incoming) return incomingCallDeepLink(incoming);
  const data = response.notification.request.content.data as Record<string, unknown> | undefined;
  const url = typeof data?.url === 'string' ? data.url.trim() : '';
  if (url.startsWith(INCOMING_CALL_DEEP_LINK_PREFIX)) return url;
  return null;
}

/** React Navigation linking — includes notification tap → deep link (Android cold start). */
export const appLinking: LinkingOptions<RootStackParamList> = {
  prefixes: APP_PREFIXES,
  config: {
    screens: {
      Home: {
        screens: {
          IncomingCall: {
            path: 'incoming-call/:callId',
            parse: {
              callId: (value: string) => decodeURIComponent(value),
              fromId: (value: string) => String(value ?? '').trim(),
              fromType: (value: string) => (value === 'r' ? 'r' : 'u'),
              peerName: (value: string) => String(value ?? '').trim() || 'Caller',
              peerImage: (value: string) => (value ? String(value) : null),
            },
          },
          VoiceCall: 'voice-call',
        },
      },
    },
  },
  async getInitialURL() {
    const initialUrl = await ExpoLinking.getInitialURL();
    if (initialUrl && parseIncomingCallDeepLink(initialUrl)) {
      return initialUrl;
    }

    if (Platform.OS === 'web') return initialUrl;

    try {
      const Notifications = await import('expo-notifications');
      const last = await Notifications.getLastNotificationResponseAsync();
      const fromNotif = urlFromNotificationResponse(last);
      if (fromNotif) return fromNotif;
    } catch {
      // ignore
    }

    return initialUrl;
  },
  subscribe(listener) {
    const urlSub = ExpoLinking.addEventListener('url', (event) => {
      if (event.url) listener(event.url);
    });

    let notifSub: { remove: () => void } | null = null;
    void import('expo-notifications')
      .then((Notifications) => {
        notifSub = Notifications.addNotificationResponseReceivedListener((response) => {
          const url = urlFromNotificationResponse(response);
          if (url) listener(url);
        });
      })
      .catch(() => {});

    return () => {
      urlSub.remove();
      notifSub?.remove();
    };
  },
};
