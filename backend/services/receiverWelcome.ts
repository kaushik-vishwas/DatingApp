import AdminSettings from '../models/AdminSettings';

export const DEFAULT_RECEIVER_WELCOME_TITLE = 'Welcome to Selecto';

export type ReceiverWelcomePayload = {
  enabled: boolean;
  title: string;
  body: string;
};

export function normalizeReceiverWelcome(
  raw?: { enabled?: boolean; title?: string; body?: string } | null
): ReceiverWelcomePayload {
  const title = String(raw?.title ?? DEFAULT_RECEIVER_WELCOME_TITLE).trim() || DEFAULT_RECEIVER_WELCOME_TITLE;
  const body = String(raw?.body ?? '').trim();
  return {
    enabled: raw?.enabled !== false,
    title: title.slice(0, 120),
    body: body.slice(0, 3000),
  };
}

export async function getReceiverWelcomeSettings(): Promise<ReceiverWelcomePayload> {
  const settings = await AdminSettings.findOne({}).select('receiverWelcome').lean<{
    receiverWelcome?: { enabled?: boolean; title?: string; body?: string };
  } | null>();
  return normalizeReceiverWelcome(settings?.receiverWelcome);
}
