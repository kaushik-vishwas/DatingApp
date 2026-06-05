/**
 * Incoming-call notification tap tracing (console).
 * Console: __DEV__ or EXPO_PUBLIC_INCOMING_CALL_NOTIF_LOG=1
 *
 * File log + share UI: EXPO_PUBLIC_INCOMING_CALL_NOTIF_DEBUG=1 only (debug APK).
 * See frontend/docs/NOTIFICATION_DEBUG_APK.md
 */
const CONSOLE_ENABLED =
  __DEV__ || process.env.EXPO_PUBLIC_INCOMING_CALL_NOTIF_LOG === '1';

export const INCOMING_CALL_NOTIF_DEBUG_ENV = 'EXPO_PUBLIC_INCOMING_CALL_NOTIF_DEBUG';

export function isIncomingCallNotifDebugBuild(): boolean {
  return process.env[INCOMING_CALL_NOTIF_DEBUG_ENV] === '1';
}

export type IncomingCallNotifLogStep =
  | 'handler.decision'
  | 'show.start'
  | 'show.scheduled'
  | 'show.error'
  | 'show.fullscreen'
  | 'show.fullscreen_skip'
  | 'show.fullscreen_error'
  | 'show.tap_enhance'
  | 'native.tap_enhance_applied'
  | 'native.tap_enhance_failed'
  | 'native.tap_relayed'
  | 'native.tap_listener_ready'
  | 'native.tap_listener_error'
  | 'collapse.scan'
  | 'collapse.dismiss'
  | 'collapse.error'
  | 'received.background'
  | 'response.listener'
  | 'response.check_last'
  | 'response.stale'
  | 'response.parse_fail'
  | 'response.parse_ok'
  | 'response.action_skip'
  | 'response.raw'
  | 'tap.open_start'
  | 'tap.dedupe_skip'
  | 'nav.blocked'
  | 'nav.handled'
  | 'tap.dispatch_handler'
  | 'tap.dispatch_queue'
  | 'consume.pending'
  | 'consume.flush'
  | 'linking.url'
  | 'linking.initial'
  | 'app_state.active'
  | 'app_state.change'
  | 'snapshot'
  | 'bg_task.error'
  | 'bg_task.skip'
  | 'bg_task.incoming'
  | 'bg_task.registered'
  | 'bg_task.register_fail'
  | 'debug.boot'
  | 'debug.cleared'
  | 'share.requested';

export function logIncomingCallNotif(
  step: IncomingCallNotifLogStep,
  detail?: Record<string, unknown>
): void {
  if (CONSOLE_ENABLED) {
    const payload = detail ? ` ${JSON.stringify(detail)}` : '';
    console.log(`[IncomingCallNotif] ${step}${payload}`);
  }
  if (isIncomingCallNotifDebugBuild()) {
    void import('./incomingCallNotificationFileDebug').then((m) =>
      m.appendIncomingCallNotifFileLog(step, detail)
    );
  }
}

/** Debug APK only — rich tray/response snapshot (no-op in production). */
export async function captureIncomingCallNotifDebugSnapshot(
  label: string,
  extra?: Record<string, unknown>
): Promise<void> {
  if (!isIncomingCallNotifDebugBuild()) return;
  const m = await import('./incomingCallNotificationFileDebug');
  await m.captureIncomingCallNotifSnapshot(label, extra);
}
