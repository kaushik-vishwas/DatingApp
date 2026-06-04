import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import {
  parseIncomingFromData,
  showIncomingCallNotification,
  type IncomingCallNotificationPayload,
} from '../utils/incomingCallNotifications';
import { logIncomingCallNotif } from '../utils/incomingCallNotificationDebug';

export const INCOMING_CALL_BACKGROUND_NOTIFICATION_TASK =
  'INCOMING-CALL-BACKGROUND-NOTIFICATION-TASK';

function parseIncomingFromBackgroundTaskData(
  data: Notifications.NotificationTaskPayload
): IncomingCallNotificationPayload | null {
  if ('actionIdentifier' in data) return null;

  const wrapped = data as {
    notification?: Record<string, unknown> | null;
    data?: Record<string, unknown>;
  };

  if (Platform.OS === 'android' && wrapped.notification) {
    const remoteMessage = wrapped.notification.remoteMessage as
      | { data?: Record<string, string> }
      | undefined;
    if (remoteMessage?.data) {
      const record: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(remoteMessage.data)) {
        record[k] = v;
      }
      const parsed = parseIncomingFromData(record);
      if (parsed) return parsed;
    }
  }

  const dataString =
    typeof wrapped.data?.dataString === 'string' ? wrapped.data.dataString.trim() : '';
  if (dataString) {
    try {
      const json = JSON.parse(dataString) as Record<string, unknown>;
      const parsed = parseIncomingFromData(json);
      if (parsed) return parsed;
    } catch {
      // ignore
    }
  }

  if (wrapped.data && typeof wrapped.data === 'object') {
    return parseIncomingFromData(wrapped.data as Record<string, unknown>);
  }

  return null;
}

TaskManager.defineTask<Notifications.NotificationTaskPayload>(
  INCOMING_CALL_BACKGROUND_NOTIFICATION_TASK,
  async ({ data, error }) => {
    if (error) {
      logIncomingCallNotif('bg_task.error', { message: String(error) });
      return;
    }
    if (!data) return;

    const incoming = parseIncomingFromBackgroundTaskData(data);
    if (!incoming) {
      logIncomingCallNotif('bg_task.skip', { reason: 'not_incoming_call' });
      return;
    }

    logIncomingCallNotif('bg_task.incoming', { callId: incoming.callId });
    await showIncomingCallNotification(incoming);
  }
);

let registerPromise: Promise<void> | null = null;

/** Register headless handler for killed/background data-only FCM (call once at startup). */
export function registerIncomingCallBackgroundNotificationTask(): void {
  if (registerPromise) return;
  registerPromise = (async () => {
    try {
      const already = await TaskManager.isTaskRegisteredAsync(
        INCOMING_CALL_BACKGROUND_NOTIFICATION_TASK
      );
      if (!already) {
        await Notifications.registerTaskAsync(INCOMING_CALL_BACKGROUND_NOTIFICATION_TASK);
        logIncomingCallNotif('bg_task.registered', {});
      }
    } catch (e) {
      logIncomingCallNotif('bg_task.register_fail', {
        message: e instanceof Error ? e.message : String(e),
      });
    }
  })();
}
