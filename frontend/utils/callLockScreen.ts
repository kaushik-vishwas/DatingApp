import { AppState, Platform } from 'react-native';
import { getIncomingCallAndroidNativeModule } from '../modules/incoming-call-android';
import { getRootNavigation } from '../navigation/navigationRef';
import { getReceiverActiveCallRoute } from '../navigation/receiverCallNavigation';

/** Let navigation settle after resume (notification tap → IncomingCall) before re-checking. */
const RESUME_RECHECK_MS = 1500;

let receiverRole = false;
let appStateBound = false;

/** The receiver's signed-in Home tree is rendered (its nested navigator state exists). */
function isReceiverHomeTreeShowing(): boolean {
  try {
    const state = getRootNavigation()?.getState();
    return Boolean(state?.routes?.some((r) => r.name === 'Home' && r.state != null));
  } catch {
    return false;
  }
}

function apply(): void {
  if (Platform.OS !== 'android') return;
  const onCallScreen = receiverRole && getReceiverActiveCallRoute() !== null;
  // Cold start from an incoming-call notification: until the Home tree is showing there is no
  // call route yet — turning the flag off here hides the call behind the keyguard (taps lost).
  if (!onCallScreen && receiverRole && !isReceiverHomeTreeShowing()) return;
  try {
    getIncomingCallAndroidNativeModule()?.setShowOverLockScreen?.(onCallScreen);
  } catch {
    // Native module unavailable before rebuild.
  }
}

/**
 * Show over the lock screen only while the receiver's IncomingCall / VoiceCall screen is up.
 * Native code turns this on when an incoming-call notification opens the app; this turns it
 * off everywhere else so the app is never usable from the lock screen.
 */
export function syncCallLockScreen(isReceiver: boolean): void {
  receiverRole = isReceiver;
  if (!appStateBound && Platform.OS === 'android') {
    appStateBound = true;
    AppState.addEventListener('change', (state) => {
      if (state === 'active') setTimeout(apply, RESUME_RECHECK_MS);
    });
  }
  apply();
}
