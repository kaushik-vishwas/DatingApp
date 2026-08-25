"use strict";
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
exports.sendReceiverIncomingCallWake = sendReceiverIncomingCallWake;
exports.sendReceiverIncomingCallPush = sendReceiverIncomingCallPush;
exports.sendOnlinePresencePush = sendOnlinePresencePush;
/** Prefer high-priority FCM v1; fall back to Expo if FCM is missing or fails. */
async function sendReceiverIncomingCallWake(payload) {
    const fcmToken = payload.fcmDeviceToken?.trim() ?? '';
    let fcmOk = false;
    let fcmError;
    let fcmStatus;
    if (fcmToken) {
        const { sendFcmV1IncomingCallPush } = await Promise.resolve().then(() => __importStar(require('./fcmV1IncomingCall')));
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
    }
    else {
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
async function sendReceiverIncomingCallPush(payload) {
    const token = payload.expoPushToken.trim();
    if (!token.startsWith('ExponentPushToken'))
        return;
    const headers = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
    };
    const accessToken = process.env.EXPO_ACCESS_TOKEN?.trim();
    if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
    }
    const peerImage = payload.fromImage?.trim() ?? '';
    const url = `nestham://incoming-call/${encodeURIComponent(payload.callId)}` +
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
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('expo push send error:', msg);
    }
}
const ONLINE_PRESENCE_CHANNEL_ID = 'online_presence';
/** Visible tray notification for caller/receiver "is online" alerts (foreground + background). */
async function sendOnlinePresencePush(payload) {
    const token = payload.expoPushToken.trim();
    if (!token.startsWith('ExponentPushToken'))
        return;
    const headers = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
    };
    const accessToken = process.env.EXPO_ACCESS_TOKEN?.trim();
    if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
    }
    const imageUrl = payload.imageUrl?.trim() ?? '';
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
    if (/^https:\/\//i.test(imageUrl)) {
        body.richContent = { image: imageUrl };
    }
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
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('online presence push send error:', msg);
    }
}
