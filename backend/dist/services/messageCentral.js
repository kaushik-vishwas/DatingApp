"use strict";
/**
 * Message Central VerifyNow — SMS OTP.
 * Official methods: GET token, POST send, GET validateOtp
 * (Using GET for token/validate avoids HTTP 405 from their API.)
 *
 * Env:
 *   MESSAGE_CENTRAL_CUSTOMER_ID
 *   MESSAGE_CENTRAL_EMAIL
 *   MESSAGE_CENTRAL_PASSWORD  (plain; server Base64-encodes as `key`)
 *   — or MESSAGE_CENTRAL_KEY (already Base64; optional override)
 *   MESSAGE_CENTRAL_COUNTRY   (default 91)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageCentralError = void 0;
exports.isMessageCentralConfigured = isMessageCentralConfigured;
exports.getMessageCentralAuthToken = getMessageCentralAuthToken;
exports.sendMessageCentralSmsOtp = sendMessageCentralSmsOtp;
exports.validateMessageCentralOtp = validateMessageCentralOtp;
exports.httpStatusForMessageCentral = httpStatusForMessageCentral;
const BASE = 'https://cpaas.messagecentral.com';
const RESPONSE_MESSAGES = {
    200: 'SUCCESS',
    400: 'Bad request',
    409: 'A verification request already exists for this number. Wait and try again.',
    500: 'SMS service error. Please try again.',
    501: 'Invalid Message Central customer ID',
    505: 'Invalid or expired verification. Request a new OTP.',
    506: 'Request already exists. Wait before requesting another OTP.',
    511: 'Invalid country code',
    700: 'Verification failed',
    702: 'Wrong OTP. Please try again.',
    703: 'Already verified. Request a new OTP if needed.',
    705: 'OTP expired. Request a new code.',
    800: 'Maximum OTP attempts reached. Try again later.',
};
class MessageCentralError extends Error {
    constructor(responseCode, message, httpStatus = 400) {
        super(message || RESPONSE_MESSAGES[responseCode] || `SMS error (${responseCode})`);
        this.name = 'MessageCentralError';
        this.responseCode = responseCode;
        this.httpStatus = httpStatus;
    }
}
exports.MessageCentralError = MessageCentralError;
function isMessageCentralConfigured() {
    const customerId = process.env.MESSAGE_CENTRAL_CUSTOMER_ID?.trim();
    const email = process.env.MESSAGE_CENTRAL_EMAIL?.trim();
    const password = process.env.MESSAGE_CENTRAL_PASSWORD?.trim();
    const key = process.env.MESSAGE_CENTRAL_KEY?.trim();
    return Boolean(customerId && email && (password || key));
}
function countryCode() {
    return process.env.MESSAGE_CENTRAL_COUNTRY?.trim() || '91';
}
function authKey() {
    const pre = process.env.MESSAGE_CENTRAL_KEY?.trim();
    if (pre)
        return pre;
    const password = process.env.MESSAGE_CENTRAL_PASSWORD?.trim() || '';
    return Buffer.from(password, 'utf8').toString('base64');
}
let cachedToken = null;
function extractToken(payload) {
    if (!payload || typeof payload !== 'object')
        return null;
    const p = payload;
    if (typeof p.token === 'string' && p.token)
        return p.token;
    if (typeof p.authToken === 'string' && p.authToken)
        return p.authToken;
    const data = p.data;
    if (data && typeof data === 'object') {
        const d = data;
        if (typeof d.token === 'string' && d.token)
            return d.token;
        if (typeof d.authToken === 'string' && d.authToken)
            return d.authToken;
    }
    return null;
}
function extractResponseCode(payload, httpStatus) {
    if (payload && typeof payload === 'object') {
        const p = payload;
        if (typeof p.responseCode === 'number')
            return p.responseCode;
        if (typeof p.responseCode === 'string' && /^\d+$/.test(p.responseCode)) {
            return Number(p.responseCode);
        }
        const data = p.data;
        if (data && typeof data === 'object') {
            const d = data;
            if (typeof d.responseCode === 'number')
                return d.responseCode;
            if (typeof d.responseCode === 'string' && /^\d+$/.test(d.responseCode)) {
                return Number(d.responseCode);
            }
        }
    }
    return httpStatus;
}
async function parseJson(res) {
    const text = await res.text();
    if (!text)
        return null;
    try {
        return JSON.parse(text);
    }
    catch {
        return { raw: text };
    }
}
/** GET /auth/v1/authentication/token — cached until near expiry. */
async function getMessageCentralAuthToken(forceRefresh = false) {
    if (!isMessageCentralConfigured()) {
        throw new MessageCentralError(501, 'Message Central is not configured on the server', 503);
    }
    const now = Date.now();
    if (!forceRefresh && cachedToken && cachedToken.expiresAtMs > now + 60_000) {
        return cachedToken.token;
    }
    const customerId = process.env.MESSAGE_CENTRAL_CUSTOMER_ID.trim();
    const email = process.env.MESSAGE_CENTRAL_EMAIL.trim();
    const params = new URLSearchParams({
        customerId,
        key: authKey(),
        scope: 'NEW',
        country: countryCode(),
        email,
    });
    const url = `${BASE}/auth/v1/authentication/token?${params.toString()}`;
    const res = await fetch(url, {
        method: 'GET',
        headers: { accept: '*/*' },
    });
    const body = await parseJson(res);
    const code = extractResponseCode(body, res.status);
    const token = extractToken(body);
    if (!res.ok || !token || code === 501) {
        cachedToken = null;
        throw new MessageCentralError(code === 200 ? 500 : code, RESPONSE_MESSAGES[code] || 'Failed to authenticate with SMS provider', res.status >= 400 ? res.status : 502);
    }
    // Tokens are long-lived (~24h); refresh early.
    cachedToken = { token, expiresAtMs: now + 20 * 60 * 60 * 1000 };
    return token;
}
/** POST /verification/v3/send */
async function sendMessageCentralSmsOtp(mobileNumber) {
    const digits = String(mobileNumber).replace(/\D/g, '');
    if (digits.length < 10) {
        throw new MessageCentralError(400, 'Invalid mobile number');
    }
    // VerifyNow expects national number (no country prefix) when countryCode is separate.
    const national = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits.slice(-10);
    const run = async (authToken) => {
        const params = new URLSearchParams({
            countryCode: countryCode(),
            flowType: 'SMS',
            mobileNumber: national,
            otpLength: '6',
        });
        const url = `${BASE}/verification/v3/send?${params.toString()}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { authToken, accept: '*/*' },
        });
        const body = await parseJson(res);
        const code = extractResponseCode(body, res.status);
        if (code === 200 || res.ok) {
            const data = body && typeof body === 'object' && body.data
                ? (body.data)
                : body;
            const verificationId = data && typeof data.verificationId !== 'undefined'
                ? String(data.verificationId)
                : '';
            if (!verificationId) {
                throw new MessageCentralError(500, 'SMS sent but no verificationId returned', 502);
            }
            const timeoutRaw = data?.timeout;
            const timeoutSec = typeof timeoutRaw === 'string' || typeof timeoutRaw === 'number'
                ? Number(timeoutRaw)
                : undefined;
            return {
                verificationId,
                transactionId: data?.transactionId != null ? String(data.transactionId) : undefined,
                timeoutSec: Number.isFinite(timeoutSec) ? timeoutSec : undefined,
            };
        }
        if (code === 409 || code === 506) {
            throw new MessageCentralError(code, RESPONSE_MESSAGES[code], 409);
        }
        if (code === 800) {
            throw new MessageCentralError(800, RESPONSE_MESSAGES[800], 429);
        }
        throw new MessageCentralError(code, RESPONSE_MESSAGES[code], res.status >= 400 ? res.status : 400);
    };
    try {
        return await run(await getMessageCentralAuthToken());
    }
    catch (err) {
        if (err instanceof MessageCentralError && (err.responseCode === 401 || err.httpStatus === 401)) {
            return run(await getMessageCentralAuthToken(true));
        }
        throw err;
    }
}
/** GET /verification/v3/validateOtp */
async function validateMessageCentralOtp(verificationId, code) {
    const trimmedCode = String(code).trim();
    const id = String(verificationId).trim();
    if (!id || !trimmedCode) {
        throw new MessageCentralError(400, 'verificationId and code are required');
    }
    const run = async (authToken) => {
        const params = new URLSearchParams({
            verificationId: id,
            code: trimmedCode,
        });
        const url = `${BASE}/verification/v3/validateOtp?${params.toString()}`;
        const res = await fetch(url, {
            method: 'GET',
            headers: { authToken, accept: '*/*' },
        });
        const body = await parseJson(res);
        const codeNum = extractResponseCode(body, res.status);
        const data = body && typeof body === 'object' && body.data
            ? (body.data)
            : null;
        const status = data && typeof data.verificationStatus === 'string' ? data.verificationStatus : '';
        if (codeNum === 200 || status === 'VERIFICATION_COMPLETED') {
            return;
        }
        if (codeNum === 702)
            throw new MessageCentralError(702, RESPONSE_MESSAGES[702], 400);
        if (codeNum === 705)
            throw new MessageCentralError(705, RESPONSE_MESSAGES[705], 400);
        if (codeNum === 505)
            throw new MessageCentralError(505, RESPONSE_MESSAGES[505], 400);
        if (codeNum === 703)
            throw new MessageCentralError(703, RESPONSE_MESSAGES[703], 400);
        if (codeNum === 800)
            throw new MessageCentralError(800, RESPONSE_MESSAGES[800], 429);
        throw new MessageCentralError(codeNum, RESPONSE_MESSAGES[codeNum] || 'OTP verification failed', res.status >= 400 ? res.status : 400);
    };
    try {
        await run(await getMessageCentralAuthToken());
    }
    catch (err) {
        if (err instanceof MessageCentralError && (err.responseCode === 401 || err.httpStatus === 401)) {
            await run(await getMessageCentralAuthToken(true));
            return;
        }
        throw err;
    }
}
function httpStatusForMessageCentral(err) {
    if (err.httpStatus >= 400 && err.httpStatus < 600)
        return err.httpStatus;
    if (err.responseCode === 800)
        return 429;
    if (err.responseCode === 409 || err.responseCode === 506)
        return 409;
    if (err.responseCode === 501)
        return 503;
    if (err.responseCode >= 700)
        return 400;
    return 400;
}
