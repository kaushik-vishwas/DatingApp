import { AppState } from 'react-native';
import { getIncomingCallAndroidNativeModule } from '../modules/incoming-call-android';
import { getIncomingCallNativeEventEmitter } from './incomingCallNativeBridge';

export const PRESENCE_FORCED_OFFLINE_EVENT = 'selectoPresenceForcedOffline';

/** Shows a saved keep-alive failure once, including one left while JS was frozen. */
export function subscribeOnlinePresenceFailure(onFailed: (message: string) => void): () => void {
  const consume = (): void => {
    const message = getIncomingCallAndroidNativeModule()?.consumeOnlinePresenceFailure?.()?.trim() ?? '';
    if (!message) return;
    onFailed(message);
  };
  const sub = getIncomingCallNativeEventEmitter()?.addListener('onOnlinePresenceFailed', () => {
    consume();
  });
  const appSub = AppState.addEventListener('change', (state) => {
    if (state === 'active') consume();
  });
  consume();
  return () => {
    sub?.remove();
    appSub.remove();
  };
}
