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

  const body = {
    to: token,
    sound: 'default',
    title: 'Incoming call',
    body: `${payload.fromName} is calling you`,
    priority: 'high',
    channelId: 'incoming_calls',
    data: {
      type: 'call_incoming',
      callId: payload.callId,
      fromId: payload.fromId,
      fromType: 'u',
      peerName: payload.fromName,
      peerImage: payload.fromImage,
      url: `nestham://incoming-call/${encodeURIComponent(payload.callId)}?fromId=${encodeURIComponent(payload.fromId)}&fromType=u&peerName=${encodeURIComponent(payload.fromName)}${payload.fromImage ? `&peerImage=${encodeURIComponent(payload.fromImage)}` : ''}`,
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
