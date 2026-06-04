/**
 * Incoming-call notification tap tracing.
 * Enable in release builds: EXPO_PUBLIC_INCOMING_CALL_NOTIF_LOG=1
 */
const ENABLED =
  __DEV__ || process.env.EXPO_PUBLIC_INCOMING_CALL_NOTIF_LOG === '1';

export type IncomingCallNotifLogStep =
  | 'handler.decision'
  | 'show.start'
  | 'show.scheduled'
  | 'show.error'
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
  | 'tap.open_start'
  | 'tap.dedupe_skip'
  | 'nav.blocked'
  | 'nav.handled'
  | 'tap.dispatch_handler'
  | 'tap.dispatch_queue'
  | 'consume.pending'
  | 'consume.flush'
  | 'linking.url'
  | 'app_state.active'
  | 'bg_task.error'
  | 'bg_task.skip'
  | 'bg_task.incoming'
  | 'bg_task.registered'
  | 'bg_task.register_fail';

export function logIncomingCallNotif(
  step: IncomingCallNotifLogStep,
  detail?: Record<string, unknown>
): void {
  if (!ENABLED) return;
  const payload = detail ? ` ${JSON.stringify(detail)}` : '';
  console.log(`[IncomingCallNotif] ${step}${payload}`);
}
