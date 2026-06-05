import { Platform } from 'react-native';
import { isIncomingCallNotifFileDebugEnabled } from './incomingCallNotificationFileDebug';
import { logIncomingCallNotif } from './incomingCallNotificationDebug';
import type { IncomingCallTapEnhanceResult } from './incomingCallAndroidTapDebug';

type IncomingCallAndroidNative = {
  applyFullScreenIntentAsync(
    identifier: string,
    debugEnabled: boolean
  ): Promise<IncomingCallTapEnhanceResult>;
};

let nativeModule: IncomingCallAndroidNative | null | undefined;

function getIncomingCallAndroidModule(): IncomingCallAndroidNative | null {
  if (Platform.OS !== 'android') return null;
  if (nativeModule !== undefined) return nativeModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    nativeModule = require('incoming-call-android').default as IncomingCallAndroidNative;
  } catch {
    nativeModule = null;
  }
  return nativeModule;
}

/** Non-blocking retries — must not delay accept/join on Samsung. */
const FULL_SCREEN_RETRY_MS = [0, 120, 280, 500];

/**
 * Re-posts the tray notification with invisible full-area overlays so title/body/expanded
 * panel share the same tap intent as Open (Samsung M31); keeps the Open action button.
 */
export async function applyIncomingCallFullScreenIntent(identifier: string): Promise<void> {
  const mod = getIncomingCallAndroidModule();
  if (!mod) return;

  const debugEnabled = isIncomingCallNotifFileDebugEnabled();

  for (let i = 0; i < FULL_SCREEN_RETRY_MS.length; i += 1) {
    const delayMs = FULL_SCREEN_RETRY_MS[i];
    if (delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
    try {
      const result = await mod.applyFullScreenIntentAsync(identifier, debugEnabled);
      logIncomingCallNotif('show.tap_enhance', {
        identifier,
        attempt: i + 1,
        ...result,
      });
      if (result.applied) {
        logIncomingCallNotif('show.fullscreen', { identifier, ...result });
        return;
      }
      if (result.failureReason === 'notification_not_active' && i < FULL_SCREEN_RETRY_MS.length - 1) {
        continue;
      }
      logIncomingCallNotif('show.fullscreen_skip', {
        identifier,
        failureReason: result.failureReason ?? 'unknown',
      });
      return;
    } catch (e) {
      logIncomingCallNotif('show.fullscreen_error', {
        identifier,
        message: e instanceof Error ? e.message : String(e),
      });
      return;
    }
  }
}
