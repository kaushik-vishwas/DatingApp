import { Platform } from 'react-native';
import { logIncomingCallNotif } from './incomingCallNotificationDebug';

type IncomingCallAndroidNative = {
  applyFullScreenIntentAsync(identifier: string): Promise<boolean>;
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
const FULL_SCREEN_RETRY_MS = [0, 120, 280];

/**
 * Re-posts the tray notification so title/body and expanded panel use the same tap intent
 * as the Open action (Samsung M31); keeps existing action buttons.
 */
export async function applyIncomingCallFullScreenIntent(identifier: string): Promise<void> {
  const mod = getIncomingCallAndroidModule();
  if (!mod) return;

  for (const delayMs of FULL_SCREEN_RETRY_MS) {
    if (delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
    try {
      const applied = await mod.applyFullScreenIntentAsync(identifier);
      if (applied) {
        logIncomingCallNotif('show.fullscreen', { identifier });
        return;
      }
    } catch (e) {
      logIncomingCallNotif('show.fullscreen_error', {
        identifier,
        message: e instanceof Error ? e.message : String(e),
      });
      return;
    }
  }
}
