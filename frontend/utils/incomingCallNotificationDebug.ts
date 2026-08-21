/**
 * Incoming-call notification tap tracing (console only in __DEV__).
 * Console: __DEV__ or EXPO_PUBLIC_INCOMING_CALL_NOTIF_LOG=1
 */
import { logPresenceDiagnostic, logPresenceFailure } from './receiverPresenceDiagnostics';

const CONSOLE_ENABLED =
  __DEV__ || process.env.EXPO_PUBLIC_INCOMING_CALL_NOTIF_LOG === '1';

export function isIncomingCallNotifDebugBuild(): boolean {
  return false;
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

const PRESENCE_BRIDGE_STEPS = new Set<IncomingCallNotifLogStep>([
  'received.background',
  'show.error',
  'show.fullscreen_skip',
  'show.fullscreen_error',
  'bg_task.error',
  'bg_task.incoming',
  'bg_task.register_fail',
  'tap.open_start',
  'nav.blocked',
  'show.scheduled',
]);

const PRESENCE_ERROR_STEPS = new Set<IncomingCallNotifLogStep>([
  'show.error',
  'show.fullscreen_error',
  'bg_task.error',
  'bg_task.register_fail',
  'nav.blocked',
]);

export function logIncomingCallNotif(
  step: IncomingCallNotifLogStep,
  detail?: Record<string, unknown>
): void {
  if (CONSOLE_ENABLED) {
    const payload = detail ? ` ${JSON.stringify(detail)}` : '';
    console.log(`[IncomingCallNotif] ${step}${payload}`);
  }
  if (PRESENCE_BRIDGE_STEPS.has(step)) {
    const event = `incoming_${step.replace(/\./g, '_')}`;
    if (PRESENCE_ERROR_STEPS.has(step)) {
      logPresenceFailure(event, typeof detail?.reason === 'string' ? detail.reason : step, detail ?? {});
    } else {
      logPresenceDiagnostic(event, detail ?? {});
    }
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
