import AdminSettings from '../models/AdminSettings';

export const DEFAULT_CALLER_NOTIFICATION_TITLE = 'Announcement';

export type CallerNotificationPayload = {
  enabled: boolean;
  title: string;
  body: string;
};

export function normalizeCallerNotification(
  raw?: { enabled?: boolean; title?: string; body?: string } | null
): CallerNotificationPayload {
  const title =
    String(raw?.title ?? DEFAULT_CALLER_NOTIFICATION_TITLE).trim() ||
    DEFAULT_CALLER_NOTIFICATION_TITLE;
  const body = String(raw?.body ?? '').trim();
  return {
    enabled: raw?.enabled !== false,
    title: title.slice(0, 120),
    body: body.slice(0, 3000),
  };
}

export async function getCallerNotificationSettings(): Promise<CallerNotificationPayload> {
  const settings = await AdminSettings.findOne({}).select('callerNotification').lean<{
    callerNotification?: { enabled?: boolean; title?: string; body?: string };
  } | null>();
  return normalizeCallerNotification(settings?.callerNotification);
}
