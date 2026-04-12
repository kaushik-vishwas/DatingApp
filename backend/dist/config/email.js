"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyEmailConfig = exports.sendOtpEmail = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
/** Gmail app passwords are often copied with spaces; SMTP expects 16 chars without spaces. */
function normalizeGmailAppPassword(raw) {
    if (!raw)
        return '';
    return String(raw).replace(/\s+/g, '').trim();
}
function getSmtpAuth() {
    const user = process.env.EMAIL_USER?.trim();
    const pass = normalizeGmailAppPassword(process.env.EMAIL_PASS);
    if (!user || !pass) {
        return null;
    }
    return { user, pass };
}
function buildTransporter() {
    const auth = getSmtpAuth();
    if (!auth) {
        return null;
    }
    return nodemailer_1.default.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth,
    });
}
const sendOtpEmail = async (to, otp, kind = 'verification') => {
    const auth = getSmtpAuth();
    if (!auth) {
        throw new Error('EMAIL_USER and EMAIL_PASS must be set in the project root .env. Use a Gmail App Password (Google Account → Security → 2-Step Verification → App passwords).');
    }
    const transporter = buildTransporter();
    if (!transporter) {
        throw new Error('Email configuration missing');
    }
    const isReset = kind === 'password_reset';
    const subject = isReset ? 'Your password reset code' : 'Your verification code';
    const line = isReset
        ? `Your password reset code is: ${otp}. It expires in 5 minutes.`
        : `Your verification code is: ${otp}. It expires in 5 minutes.`;
    const html = isReset
        ? `<p>Your password reset code is: <strong>${otp}</strong></p><p>It expires in 5 minutes.</p><p>If you did not request a password reset, ignore this email.</p>`
        : `<p>Your verification code is: <strong>${otp}</strong></p><p>It expires in 5 minutes.</p><p>If you did not request this, you can ignore this email.</p>`;
    const info = await transporter.sendMail({
        from: `"Dating App" <${auth.user}>`,
        to,
        subject,
        text: line,
        html,
    });
    const mid = info?.messageId ?? info?.response;
    console.log(`[email] OTP sent to ${to} messageId=${mid ?? 'ok'}`);
};
exports.sendOtpEmail = sendOtpEmail;
/** Call at startup to surface bad Gmail credentials early. */
const verifyEmailConfig = async () => {
    const transporter = buildTransporter();
    if (!transporter) {
        return { ok: false, error: 'EMAIL_USER / EMAIL_PASS not set' };
    }
    try {
        await transporter.verify();
        console.log('[email] SMTP (smtp.gmail.com:465) connection OK');
        return { ok: true };
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[email] SMTP verify failed:', msg);
        return { ok: false, error: msg };
    }
};
exports.verifyEmailConfig = verifyEmailConfig;
