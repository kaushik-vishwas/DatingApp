"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildFcmV1IncomingCallMessage = buildFcmV1IncomingCallMessage;
exports.sendFcmV1IncomingCallPush = sendFcmV1IncomingCallPush;
function buildIncomingCallData(payload) {
    const peerImage = payload.fromImage?.trim() ?? '';
    const url = `nestham://incoming-call/${encodeURIComponent(payload.callId)}` +
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
function buildFcmV1IncomingCallMessage(payload) {
    return {
        message: {
            token: payload.deviceToken.trim(),
            data: buildIncomingCallData(payload),
            android: { priority: 'HIGH' },
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
async function getGoogleAccessToken() {
    const clientEmail = process.env.FCM_CLIENT_EMAIL?.trim();
    const privateKey = process.env.FCM_PRIVATE_KEY?.replace(/\\n/g, '\n').trim();
    if (!clientEmail || !privateKey) {
        console.error('fcm v1: set FCM_CLIENT_EMAIL and FCM_PRIVATE_KEY');
        return null;
    }
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const claim = Buffer.from(JSON.stringify({
        iss: clientEmail,
        scope: 'https://www.googleapis.com/auth/firebase.messaging',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
    })).toString('base64url');
    const crypto = await Promise.resolve().then(() => __importStar(require('crypto')));
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
    const json = (await tokenRes.json());
    return json.access_token?.trim() ?? null;
}
/** Send data-only incoming call via FCM HTTP v1 (optional; app uses Expo push by default). */
async function sendFcmV1IncomingCallPush(payload) {
    const projectId = process.env.FCM_PROJECT_ID?.trim();
    const token = payload.deviceToken.trim();
    if (!projectId || !token)
        return;
    const accessToken = await getGoogleAccessToken();
    if (!accessToken)
        return;
    const body = buildFcmV1IncomingCallMessage(payload);
    try {
        const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            console.error('fcm v1 send failed:', res.status, await res.text());
        }
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('fcm v1 send error:', msg);
    }
}
