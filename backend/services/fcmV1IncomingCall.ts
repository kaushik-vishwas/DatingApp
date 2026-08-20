/**
 * Firebase Cloud Messaging HTTP v1 — data-only incoming call push.
 *
 * Use when sending directly to FCM (bypassing Expo push). Requires:
 * - FCM_PROJECT_ID
 * - FCM_CLIENT_EMAIL + FCM_PRIVATE_KEY (service account), OR
 * - GOOGLE_APPLICATION_CREDENTIALS path to service account JSON
 *
 * Do not put title/body in `notification` or in `data.title` / `data.message`
 * (Expo/Android may auto-present those before your app runs).
 */

type IncomingCallFcmPayload = {
  deviceToken: string;
  callId: string;
  fromId: string;
  fromName: string;
  fromImage: string | null;
};

function buildIncomingCallData(payload: IncomingCallFcmPayload): Record<string, string> {
  const peerImage = payload.fromImage?.trim() ?? '';
  const url =
    `nestham://incoming-call/${encodeURIComponent(payload.callId)}` +
    `?fromId=${encodeURIComponent(payload.fromId)}` +
    `&fromType=u` +
    `&peerName=${encodeURIComponent(payload.fromName)}` +
    (peerImage ? `&peerImage=${encodeURIComponent(peerImage)}` : '');

  return {
    type: 'call_incoming',
    callId: payload.callId,
    fromId: payload.fromId,
    fromType: 'u',
    peerName: payload.fromName,
    peerImage,
    url,
  };
}

/** Data-only FCM v1 message body (no `notification` block). */
export function buildFcmV1IncomingCallMessage(payload: IncomingCallFcmPayload): {
  message: {
    token: string;
    data: Record<string, string>;
    android: { priority: 'HIGH'; ttl: string };
    apns: {
      headers: { 'apns-priority': string; 'apns-push-type': string };
      payload: { aps: { 'content-available': number } };
    };
  };
} {
  return {
    message: {
      token: payload.deviceToken.trim(),
      data: buildIncomingCallData(payload),
      android: { priority: 'HIGH', ttl: '55s' },
      apns: {
        headers: {
          'apns-priority': '10',
          'apns-push-type': 'background',
        },
        payload: {
          aps: { 'content-available': 1 },
        },
      },
    },
  };
}

async function getGoogleAccessToken(): Promise<string | null> {
  const clientEmail = process.env.FCM_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FCM_PRIVATE_KEY?.replace(/\\n/g, '\n').trim();
  if (!clientEmail || !privateKey) {
    console.error('fcm v1: set FCM_CLIENT_EMAIL and FCM_PRIVATE_KEY');
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const claim = Buffer.from(
    JSON.stringify({
      iss: clientEmail,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })
  ).toString('base64url');

  const crypto = await import('crypto');
  const signInput = `${header}.${claim}`;
  const signature = crypto
    .createSign('RSA-SHA256')
    .update(signInput)
    .sign(privateKey, 'base64url');

  const jwt = `${signInput}.${signature}`;
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!tokenRes.ok) {
    console.error('fcm v1 oauth failed:', tokenRes.status, await tokenRes.text());
    return null;
  }
  const json = (await tokenRes.json()) as { access_token?: string };
  return json.access_token?.trim() ?? null;
}

export type FcmV1SendResult = {
  ok: boolean;
  status?: number;
  error?: string;
};

/** Send data-only incoming call via FCM HTTP v1. Requires FCM_PROJECT_ID + service account. */
export async function sendFcmV1IncomingCallPush(
  payload: IncomingCallFcmPayload
): Promise<FcmV1SendResult> {
  const projectId = process.env.FCM_PROJECT_ID?.trim();
  const token = payload.deviceToken.trim();
  if (!projectId || !token) {
    return { ok: false, error: 'missing_project_or_token' };
  }

  const accessToken = await getGoogleAccessToken();
  if (!accessToken) {
    return { ok: false, error: 'oauth_failed' };
  }

  const body = buildFcmV1IncomingCallMessage(payload);
  try {
    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );
    if (!res.ok) {
      const text = await res.text();
      console.error('fcm v1 send failed:', res.status, text);
      return { ok: false, status: res.status, error: text.slice(0, 400) };
    }
    return { ok: true, status: res.status };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('fcm v1 send error:', msg);
    return { ok: false, error: msg };
  }
}
