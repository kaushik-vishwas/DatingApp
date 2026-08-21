import { Platform } from 'react-native';
import { getIncomingCallAndroidNativeModule } from '../modules/incoming-call-android';
import { getJwt, getResolvedApiBaseUrl } from '../services/api';
import { logPresenceDiagnostic, logPresenceFailure } from './receiverPresenceDiagnostics';

let keepAliveRunning = false;
let keepAliveUnavailableLogged = false;

export function startReceiverOnlineKeepAlive(): void {
  if (Platform.OS !== 'android') {
    return;
  }
  void (async () => {
    try {
      const token = ((await getJwt()) ?? '').trim();
      const apiBase = getResolvedApiBaseUrl().replace(/\/+$/, '');
      if (!token) {
        logPresenceFailure('keep_alive_missing_auth', 'jwt_empty');
      }
      const ok =
        getIncomingCallAndroidNativeModule()?.startOnlinePresenceKeepAlive?.(apiBase, token) ??
        false;
      if (ok) {
        if (!keepAliveRunning) {
          logPresenceDiagnostic('keep_alive_started', { pollPendingInvites: Boolean(token) });
        }
        keepAliveRunning = true;
      } else {
        keepAliveRunning = false;
        if (!keepAliveUnavailableLogged) {
          keepAliveUnavailableLogged = true;
          logPresenceDiagnostic('keep_alive_start_unavailable', { nativeModule: false }, 'warn');
        }
      }
    } catch (e) {
      keepAliveRunning = false;
      logPresenceFailure(
        'keep_alive_start_failed',
        e instanceof Error ? e.message : String(e)
      );
    }
  })();
}

export function stopReceiverOnlineKeepAlive(): void {
  if (Platform.OS !== 'android') return;
  try {
    const ok = getIncomingCallAndroidNativeModule()?.stopOnlinePresenceKeepAlive?.() ?? false;
    if (keepAliveRunning || ok) {
      logPresenceDiagnostic(ok ? 'keep_alive_stopped' : 'keep_alive_stop_unavailable', {
        nativeModule: ok,
      });
    }
    keepAliveRunning = false;
  } catch (e) {
    keepAliveRunning = false;
    logPresenceFailure(
      'keep_alive_stop_failed',
      e instanceof Error ? e.message : String(e)
    );
  }
}
