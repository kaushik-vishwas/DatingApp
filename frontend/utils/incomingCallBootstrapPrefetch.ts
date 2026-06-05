import type { VoiceBootstrapResponse } from '../types/api';
import type { IncomingCallNotificationPayload } from './incomingCallNotifications';

type PrefetchFn = (incoming: IncomingCallNotificationPayload) => void;

let prefetchFn: PrefetchFn | null = null;

/** Registered by CallSignalProvider — starts bootstrap while the phone is still ringing. */
export function registerIncomingCallBootstrapPrefetch(fn: PrefetchFn | null): void {
  prefetchFn = fn;
}

export function prefetchIncomingCallBootstrapFromNotification(
  incoming: IncomingCallNotificationPayload
): void {
  prefetchFn?.(incoming);
}

export type IncomingBootstrapResolver = {
  promise: Promise<VoiceBootstrapResponse>;
  clearCaches: () => void;
};
