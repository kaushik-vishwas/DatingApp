"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyEmailConfig = exports.sendWithdrawalRequestAdminEmail = exports.sendOtpEmail = void 0;
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
/** Dedicated SMTP for withdrawal alerts (admin email + app password). */
function getWithdrawalNotifySmtpAuth() {
    const user = process.env.WITHDRAWAL_NOTIFY_EMAIL?.trim() || '';
    const pass = normalizeGmailAppPassword(process.env.WITHDRAWAL_NOTIFY_APP_PASS);
    if (!user || !pass)
        return null;
    return { user, pass };
}
function buildTransporterFromAuth(auth) {
    return nodemailer_1.default.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth,
    });
}
function buildTransporter() {
    const auth = getSmtpAuth();
    if (!auth) {
        return null;
    }
    return buildTransporterFromAuth(auth);
}
const sendOtpEmail = async (to, otp, kind = 'verification') => {
    const auth = getSmtpAuth();
    if (!auth) {
        throw new Error('EMAIL_USER and EMAIL_PASS must be set in the backend .env. Use a Gmail App Password (Google Account → Security → 2-Step Verification → App passwords).');
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
const WITHDRAWALS_ADMIN_URL = 'https://admin.nesthamapp.com/withdrawals';
/**  Notify admin inbox when a receiver submits a withdrawal (best-effort; does not throw). */
const sendWithdrawalRequestAdminEmail = async (payload) => {
    const auth = getWithdrawalNotifySmtpAuth();
    if (!auth) {
        console.warn('[email] withdrawal notify skipped: set WITHDRAWAL_NOTIFY_EMAIL and WITHDRAWAL_NOTIFY_APP_PASS in backend/.env');
        return;
    }
    const to = auth.user;
    const method = payload.payoutMethod === 'bank' ? 'bank' : payload.payoutMethod === 'upi' ? 'upi' : null;
    const methodLabel = method === 'bank' ? 'Bank transfer' : method === 'upi' ? 'UPI' : '—';
    const payout = Number(payload.payoutAmount || 0).toLocaleString('en-IN', {
        maximumFractionDigits: 2,
    });
    const holder = String(payload.accountHolderName ?? '').trim() || '—';
    const upi = String(payload.upiId ?? '').trim();
    const accountNumber = String(payload.bankAccountNumber ?? '').trim();
    const ifsc = String(payload.bankIfsc ?? '').trim().toUpperCase();
    const bankName = String(payload.bankName ?? '').trim();
    const accountLinesHtml = [
        `<tr><td style="padding:6px 0;color:#6b7280;font-size:13px;">Method</td><td style="padding:6px 0;text-align:right;color:#111827;font-size:13px;font-weight:600;">${escapeHtml(methodLabel)}</td></tr>`,
        `<tr><td style="padding:6px 0;color:#6b7280;font-size:13px;">Account holder</td><td style="padding:6px 0;text-align:right;color:#111827;font-size:13px;font-weight:600;">${escapeHtml(holder)}</td></tr>`,
    ];
    const accountLinesText = [`Method: ${methodLabel}`, `Account holder: ${holder}`];
    if (method === 'upi' || upi) {
        accountLinesHtml.push(`<tr><td style="padding:6px 0;color:#6b7280;font-size:13px;">UPI ID</td><td style="padding:6px 0;text-align:right;color:#111827;font-size:13px;font-weight:700;word-break:break-all;">${escapeHtml(upi || '—')}</td></tr>`);
        accountLinesText.push(`UPI ID: ${upi || '—'}`);
    }
    if (method === 'bank' || accountNumber || ifsc) {
        accountLinesHtml.push(`<tr><td style="padding:6px 0;color:#6b7280;font-size:13px;">Account number</td><td style="padding:6px 0;text-align:right;color:#111827;font-size:13px;font-weight:700;">${escapeHtml(accountNumber || '—')}</td></tr>`, `<tr><td style="padding:6px 0;color:#6b7280;font-size:13px;">IFSC</td><td style="padding:6px 0;text-align:right;color:#111827;font-size:13px;font-weight:600;">${escapeHtml(ifsc || '—')}</td></tr>`);
        accountLinesText.push(`Account number: ${accountNumber || '—'}`, `IFSC: ${ifsc || '—'}`);
        if (bankName && bankName.toUpperCase() !== 'BANK' && bankName.toUpperCase() !== 'UPI') {
            accountLinesHtml.push(`<tr><td style="padding:6px 0;color:#6b7280;font-size:13px;">Bank</td><td style="padding:6px 0;text-align:right;color:#111827;font-size:13px;font-weight:600;">${escapeHtml(bankName)}</td></tr>`);
            accountLinesText.push(`Bank: ${bankName}`);
        }
    }
    const subject = `New withdrawal · ${payload.receiverName} · ₹${payout}`;
    const text = [
        'New withdrawal request — Selecto',
        '',
        `Receiver: ${payload.receiverName}`,
        `Request ID: ${payload.withdrawalId}`,
        `Pay to receiver: ₹${payout}`,
        '',
        'Account info',
        ...accountLinesText,
        '',
        'Please complete the transfer to the account above, then mark the request as Paid in the admin panel.',
        WITHDRAWALS_ADMIN_URL,
    ].join('\n');
    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:28px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
          <tr>
            <td style="background:linear-gradient(135deg,#7b2cff,#a855f7);padding:22px 24px;">
              <p style="margin:0;color:rgba(255,255,255,0.85);font-size:12px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;">Selecto Admin</p>
              <h1 style="margin:6px 0 0;color:#ffffff;font-size:20px;font-weight:700;line-height:1.3;">New withdrawal request</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:18px;">
                <tr>
                  <td style="padding:8px 0;color:#6b7280;font-size:13px;">Receiver</td>
                  <td style="padding:8px 0;text-align:right;color:#111827;font-size:14px;font-weight:700;">${escapeHtml(payload.receiverName)}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;border-top:1px solid #f3f4f6;color:#6b7280;font-size:13px;">Request ID</td>
                  <td style="padding:8px 0;border-top:1px solid #f3f4f6;text-align:right;color:#111827;font-size:14px;font-weight:600;">${escapeHtml(payload.withdrawalId)}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;border-top:1px solid #f3f4f6;color:#6b7280;font-size:13px;">Pay to receiver</td>
                  <td style="padding:8px 0;border-top:1px solid #f3f4f6;text-align:right;color:#7b2cff;font-size:20px;font-weight:800;">₹${escapeHtml(payout)}</td>
                </tr>
              </table>

              <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:14px 16px;margin-bottom:18px;">
                <p style="margin:0 0 10px;color:#166534;font-size:11px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;">Account info</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  ${accountLinesHtml.join('')}
                </table>
              </div>

              <p style="margin:0 0 16px;color:#4b5563;font-size:13px;line-height:1.55;">
                Please complete the transfer to the account above, then open Withdrawals and mark this request as Paid.
              </p>

              <a href="${WITHDRAWALS_ADMIN_URL}" style="display:inline-block;background:#7b2cff;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 20px;border-radius:10px;">
                Open Withdrawals
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
    try {
        const transporter = buildTransporterFromAuth(auth);
        const info = await transporter.sendMail({
            from: `"Selecto Admin" <${auth.user}>`,
            to,
            subject,
            text,
            html,
        });
        const mid = info?.messageId ?? info?.response;
        console.log(`[email] withdrawal notify sent to ${to} messageId=${mid ?? 'ok'}`);
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[email] withdrawal notify failed:', msg);
    }
};
exports.sendWithdrawalRequestAdminEmail = sendWithdrawalRequestAdminEmail;
function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
/** Call at startup to surface bad Gmail credentials early. */
const verifyEmailConfig = async () => {
    const transporter = buildTransporter();
    if (!transporter) {
        return { ok: false, error: 'EMAIL_USER / EMAIL_PASS not set' };
    }
    try {
        await transporter.verify();
        return { ok: true };
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[email] SMTP verify failed:', msg);
        return { ok: false, error: msg };
    }
};
exports.verifyEmailConfig = verifyEmailConfig;
