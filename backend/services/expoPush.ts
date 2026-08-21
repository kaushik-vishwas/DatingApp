type IncomingCallPushPayload = {
  expoPushToken: string;
  callId: string;
  fromId: string;
  fromName: string;
  fromImage: string | null;
};

export type IncomingCallWakePayload = {
  expoPushToken?: string | null;
  fcmDeviceToken?: string | null;
  callId: string;
  fromId: string;
  fromName: string;
  fromImage: string | null;
};

/** Prefer high-priority FCM v1; fall back to Expo if FCM is missing or fails. */
export async function sendReceiverIncomingCallWake(
  payload: IncomingCallWakePayload
): Promise<{
  fcmAttempted: boolean;
  fcmOk: boolean;
  fcmError?: string;
  fcmStatus?: number;
  expoAttempted: boolean;
  expoOk: boolean;
  skippedReason?: string;
}> {
  const fcmToken = payload.fcmDeviceToken?.trim() ?? '';
  let fcmOk = false;
  let fcmError: string | undefined;
  let fcmStatus: number | undefined;
  if (fcmToken) {
    const { sendFcmV1IncomingCallPush } = await import('./fcmV1IncomingCall');
    const result = await sendFcmV1IncomingCallPush({
      deviceToken: fcmToken,
      callId: payload.callId,
      fromId: payload.fromId,
      fromName: payload.fromName,
      fromImage: payload.fromImage,
    });
    fcmOk = result.ok;
    fcmError = result.error;
    fcmStatus = result.status;
    console.info('incoming call fcm v1:', {
      callId: payload.callId,
      ok: result.ok,
      status: result.status ?? null,
      error: result.error ?? null,
    });
  } else {
    console.info('incoming call fcm v1 skipped: no device token', { callId: payload.callId });
  }

  if (fcmOk) {
    return { fcmAttempted: Boolean(fcmToken), fcmOk: true, expoAttempted: false, expoOk: false };
  }

  const expoToken = payload.expoPushToken?.trim() ?? '';
  if (!expoToken) {
    console.error('incoming call push skipped: no fcm or expo token', { callId: payload.callId });
    return {
      fcmAttempted: Boolean(fcmToken),
      fcmOk: false,
      fcmError,
      fcmStatus,
      expoAttempted: false,
      expoOk: false,
      skippedReason: fcmToken ? 'fcm_failed_no_expo_token' : 'no_fcm_or_expo_token',
    };
  }
  await sendReceiverIncomingCallPush({
    expoPushToken: expoToken,
    callId: payload.callId,
    fromId: payload.fromId,
    fromName: payload.fromName,
    fromImage: payload.fromImage,
  });
  return {
    fcmAttempted: Boolean(fcmToken),
    fcmOk: false,
    fcmError,
    fcmStatus,
    expoAttempted: true,
    expoOk: true,
  };
}

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
    channelId: 'incoming_calls_ring_v2',
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
