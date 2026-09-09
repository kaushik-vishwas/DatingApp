/**
 * Visible Expo tray notifications for one-off broadcasts (app update, etc.).
 * Does NOT use FCM and does NOT touch incoming-call wake paths.
 */
const APP_UPDATES_CHANNEL_ID = 'online_presence';

export type BroadcastPushPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
};

function expoHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  const accessToken = process.env.EXPO_ACCESS_TOKEN?.trim();
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  return headers;
}

function normalizeExpoTokens(tokens: string[]): string[] {
  const unique = new Set<string>();
  for (const raw of tokens) {
    const t = String(raw ?? '').trim();
    if (t.startsWith('ExponentPushToken')) unique.add(t);
  }
  return [...unique];
}

/**
 * Send the same visible notification to many Expo tokens (batched, max 100 / request).
 * Returns counts only — never throws on individual ticket failures.
 */
export async function sendExpoBroadcastPush(
  tokens: string[],
  payload: BroadcastPushPayload
): Promise<{ tokenCount: number; sent: number; failedChunks: number }> {
  const list = normalizeExpoTokens(tokens);
  if (list.length === 0) {
    return { tokenCount: 0, sent: 0, failedChunks: 0 };
  }

  const title = String(payload.title ?? '').trim() || 'Selecto';
  const body = String(payload.body ?? '').trim() || 'Please update the app from Play Store.';
  const data = {
    type: 'app_update',
    ...(payload.data ?? {}),
  };

  let sent = 0;
  let failedChunks = 0;
  const chunkSize = 100;

  for (let i = 0; i < list.length; i += chunkSize) {
    const chunk = list.slice(i, i + chunkSize);
    const messages = chunk.map((to) => ({
      to,
      title,
      body,
      sound: 'default',
      priority: 'high' as const,
      ttl: 86400,
      channelId: APP_UPDATES_CHANNEL_ID,
      data,
    }));

    try {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: expoHeaders(),
        body: JSON.stringify(messages),
      });
      if (!res.ok) {
        const text = await res.text();
        console.error('expo broadcast chunk failed:', res.status, text);
        failedChunks += 1;
        continue;
      }
      sent += chunk.length;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('expo broadcast chunk error:', msg);
      failedChunks += 1;
    }
  }

  return { tokenCount: list.length, sent, failedChunks };
}
