import { EventEmitter, type EventSubscription } from 'expo-modules-core';
import { Platform } from 'react-native';
import {
  isIncomingCallNotifDebugBuild,
  logIncomingCallNotif,
} from './incomingCallNotificationDebug';

export type IncomingCallTapEnhanceResult = {
  applied?: boolean;
  failureReason?: string | null;
  notificationTag?: string;
  notificationId?: number;
  overlayCollapsedBound?: boolean;
  overlayExpandedBound?: boolean;
  titleCollapsedBound?: boolean;
  bodyCollapsedBound?: boolean;
  titleExpandedBound?: boolean;
  bodyExpandedBound?: boolean;
  rootCollapsedBound?: boolean;
  rootExpandedBound?: boolean;
  contentIntentWrapped?: boolean;
  openButtonPreserved?: boolean;
  openButtonWrapped?: boolean;
  usedDecoratedStyle?: boolean;
};

export type IncomingCallNativeTapRelayPayload = {
  tapSource?: string;
  notificationTag?: string;
  forwarded?: boolean;
  forwardError?: string | null;
};

let nativeTapSub: EventSubscription | null = null;

/** Debug APK: stream native overlay/Open tap relays into the shared log file. */
export function ensureIncomingCallNativeTapDebugListener(): () => void {
  if (Platform.OS !== 'android' || !isIncomingCallNotifDebugBuild()) {
    return () => {};
  }
  if (nativeTapSub) {
    return () => {};
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('incoming-call-android').default as Record<string, unknown>;
    const emitter = new EventEmitter(mod);
    nativeTapSub = emitter.addListener(
      'onNotificationTapRelayed',
      (payload: IncomingCallNativeTapRelayPayload) => {
        logIncomingCallNotif('native.tap_relayed', {
          tapSource: payload?.tapSource ?? null,
          notificationTag: payload?.notificationTag ?? null,
          forwarded: payload?.forwarded ?? null,
          forwardError: payload?.forwardError ?? null,
        });
      }
    );
    logIncomingCallNotif('native.tap_listener_ready', {});
  } catch (e) {
    logIncomingCallNotif('native.tap_listener_error', {
      message: e instanceof Error ? e.message : String(e),
    });
  }

  return () => {
    nativeTapSub?.remove();
    nativeTapSub = null;
  };
}
