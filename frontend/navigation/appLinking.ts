import type { LinkingOptions } from '@react-navigation/native';
import { Linking, Platform } from 'react-native';
import type { RootStackParamList } from './RootStackParamList';
import {
  INCOMING_CALL_DEEP_LINK_PREFIX,
  incomingCallDeepLink,
  parseIncomingCallDeepLink,
  parseIncomingFromNotificationRequest,
} from '../utils/incomingCallNotifications';
import { readPendingIncomingCallTap } from '../utils/pendingIncomingCallTapStorage';

const APP_PREFIXES = ['nestham://', 'com.kaushikvishwas.frontend://'];

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

/** Samsung cold start: native last-response may arrive after the first JS tick. */
const INITIAL_URL_NOTIFICATION_DELAYS_MS = [0, 100, 250, 500, 800, 1200, 1800, 2500, 3500];

function readLastNotificationTapUrl(
  Notifications: typeof import('expo-notifications')
): string | null {
  const last =
    typeof Notifications.getLastNotificationResponse === 'function'
      ? Notifications.getLastNotificationResponse()
      : null;
  return urlFromNotificationResponse(last);
}

async function readInitialNotificationTapUrl(): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  const persisted = await readPendingIncomingCallTap();
  if (persisted) return incomingCallDeepLink(persisted);

  try {
    const Notifications = await import('expo-notifications');
    let previousDelayMs = 0;
    let consecutiveNullResponses = 0;

    for (const delayMs of INITIAL_URL_NOTIFICATION_DELAYS_MS) {
      const waitMs = delayMs - previousDelayMs;
      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
      previousDelayMs = delayMs;

      const fromNotif = readLastNotificationTapUrl(Notifications);
      if (fromNotif) return fromNotif;

      const last =
        typeof Notifications.getLastNotificationResponse === 'function'
          ? Notifications.getLastNotificationResponse()
          : await Notifications.getLastNotificationResponseAsync();

      if (!last) {
        consecutiveNullResponses += 1;
        // Normal app launch — stop polling once we have several empty reads after ~800ms.
        if (delayMs >= 800 && consecutiveNullResponses >= 3) {
          return null;
        }
      } else {
        consecutiveNullResponses = 0;
      }
    }
  } catch {
    // ignore
  }
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
    const initialUrl = await Linking.getInitialURL();
    if (initialUrl && parseIncomingCallDeepLink(initialUrl)) {
      return initialUrl;
    }

    const fromNotif = await readInitialNotificationTapUrl();
    if (fromNotif) return fromNotif;

    return initialUrl;
  },
  subscribe(listener) {
    const urlSub = Linking.addEventListener('url', (event) => {
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
