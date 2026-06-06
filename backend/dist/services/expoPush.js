"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendReceiverIncomingCallPush = sendReceiverIncomingCallPush;
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
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('expo push send error:', msg);
    }
}
