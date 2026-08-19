type IncomingCallPushPayload = {
  expoPushToken: string;
  callId: string;
  fromId: string;
  fromName: string;
  fromImage: string | null;
};

/** Sends a high-priority Expo push so receivers get incoming calls when the app is backgrounded. */
export async function sendReceiverIncomingCallPush(
  payload: IncomingCallPushPayload
): Promise<void> {
  const token = payload.expoPushToken.trim();
  if (!token.startsWith('ExponentPushToken')) return;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  const accessToken = process.env.EXPO_ACCESS_TOKEN?.trim();
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const peerImage = payload.fromImage?.trim() ?? '';
  const url =
    `nestham://incoming-call/${encodeURIComponent(payload.callId)}` +
    `?fromId=${encodeURIComponent(payload.fromId)}` +
    `&fromType=u` +
    `&peerName=${encodeURIComponent(payload.fromName)}` +
    (peerImage ? `&peerImage=${encodeURIComponent(peerImage)}` : '');

  // Data-only push: no top-level title/body/sound (those become an FCM "notification"
  // payload and Android SystemUI shows a tray row before JS/native handlers run).
  const body = {
    to: token,
    priority: 'high',
    /** Keep deliverable through OEM doze briefly; invite window is ~45s. */
    ttl: 55,
    expiration: Math.floor(Date.now() / 1000) + 55,
    channelId: 'incoming_calls',
    _contentAvailable: true,
    data: {
      type: 'call_incoming',
      callId: payload.callId,
      fromId: payload.fromId,
      fromType: 'u',
      peerName: payload.fromName,
      peerImage,
      url,
    },
  };

  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error('expo push send failed:', res.status, text);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('expo push send error:', msg);
  }
}

const ONLINE_PRESENCE_CHANNEL_ID = 'online_presence';

export type OnlinePresencePushPayload = {
  expoPushToken: string;
  title: string;
  body: string;
  data: Record<string, string>;
};

/** Visible tray notification for caller/receiver "is online" alerts (foreground + background). */
export async function sendOnlinePresencePush(payload: OnlinePresencePushPayload): Promise<void> {
  const token = payload.expoPushToken.trim();
  if (!token.startsWith('ExponentPushToken')) return;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  const accessToken = process.env.EXPO_ACCESS_TOKEN?.trim();
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const body = {
    to: token,
    title: payload.title,
    body: payload.body,
    sound: 'default',
    priority: 'high',
    ttl: 3600,
    channelId: ONLINE_PRESENCE_CHANNEL_ID,
    data: payload.data,
  };

  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error('online presence push send failed:', res.status, text);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('online presence push send error:', msg);
  }
}
