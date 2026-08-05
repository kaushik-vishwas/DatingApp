"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OTP_TTL_MS = exports.MessageCentralError = void 0;
exports.issueSmsOtp = issueSmsOtp;
exports.encodeStoredSmsOtp = encodeStoredSmsOtp;
exports.parseStoredVerificationId = parseStoredVerificationId;
exports.assertSmsOtpValid = assertSmsOtpValid;
const otpBypass_1 = require("../utils/otpBypass");
const messageCentral_1 = require("./messageCentral");
Object.defineProperty(exports, "MessageCentralError", { enumerable: true, get: function () { return messageCentral_1.MessageCentralError; } });
const OTP_TTL_MS = 5 * 60 * 1000;
exports.OTP_TTL_MS = OTP_TTL_MS;
function generateOtpCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
}
function staticReceiverOtp() {
    return process.env.RECEIVER_OTP_STATIC?.trim() || '';
}
/**
 * Send SMS OTP via Message Central, or issue a local code when OTP_BYPASS=true.
 */
async function issueSmsOtp(phoneDigits, _logLabel) {
    const otpExpiry = new Date(Date.now() + OTP_TTL_MS);
    const digits = String(phoneDigits).replace(/\D/g, '');
    const national = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits.slice(-10);
    if ((0, otpBypass_1.otpBypassEnabled)()) {
        return { otp: generateOtpCode(), verificationId: null, otpExpiry };
    }
    if (!(0, messageCentral_1.isMessageCentralConfigured)()) {
        throw new messageCentral_1.MessageCentralError(501, 'SMS OTP is not configured. Set MESSAGE_CENTRAL_CUSTOMER_ID, MESSAGE_CENTRAL_EMAIL, and MESSAGE_CENTRAL_PASSWORD in backend/.env', 503);
    }
    if (national.length !== 10) {
        throw new messageCentral_1.MessageCentralError(400, 'Invalid mobile number');
    }
    const sent = await (0, messageCentral_1.sendMessageCentralSmsOtp)(national);
    return { otp: null, verificationId: sent.verificationId, otpExpiry };
}
/** Persist format: `mc:<verificationId>` for Message Central, plain code for local/bypass. */
function encodeStoredSmsOtp(issued) {
    if (issued.verificationId)
        return `mc:${issued.verificationId}`;
    return issued.otp ?? '';
}
function parseStoredVerificationId(stored) {
    if (!stored)
        return null;
    if (stored.startsWith('mc:'))
        return stored.slice(3);
    return null;
}
/**
 * Validate submitted OTP against stored value / Message Central.
 * When OTP_BYPASS=true, accepts any code.
 */
async function assertSmsOtpValid(opts) {
    const trimmed = String(opts.submitted).trim();
    if ((0, otpBypass_1.otpBypassEnabled)())
        return;
    if (opts.allowStaticReceiver) {
        const staticCode = staticReceiverOtp();
        if (staticCode && trimmed === staticCode)
            return;
    }
    const now = new Date();
    if (opts.otpExpiry && now > opts.otpExpiry) {
        throw new messageCentral_1.MessageCentralError(705, 'OTP expired. Request a new code.', 400);
    }
    const mcId = opts.verificationId || parseStoredVerificationId(opts.storedOtp ?? null);
    if (mcId) {
        await (0, messageCentral_1.validateMessageCentralOtp)(mcId, trimmed);
        return;
    }
    if (!opts.storedOtp) {
        throw new messageCentral_1.MessageCentralError(505, 'No OTP pending. Request a new code.', 400);
    }
    if (trimmed !== opts.storedOtp) {
        throw new messageCentral_1.MessageCentralError(702, 'Wrong OTP. Please try again.', 400);
    }
}
