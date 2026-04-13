import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

/** Gmail app passwords are often copied with spaces; SMTP expects 16 chars without spaces. */
function normalizeGmailAppPassword(raw: string | undefined): string {
  if (!raw) return '';
  return String(raw).replace(/\s+/g, '').trim();
}

function getSmtpAuth(): { user: string; pass: string } | null {
  const user = process.env.EMAIL_USER?.trim();
  const pass = normalizeGmailAppPassword(process.env.EMAIL_PASS);
  if (!user || !pass) {
    return null;
  }
  return { user, pass };
}

function buildTransporter(): Transporter | null {
  const auth = getSmtpAuth();
  if (!auth) {
    return null;
  }
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth,
  });
}

export type OtpEmailKind = 'verification' | 'password_reset';

export const sendOtpEmail = async (
  to: string,
  otp: string,
  kind: OtpEmailKind = 'verification'
): Promise<void> => {
  const auth = getSmtpAuth();
  if (!auth) {
    throw new Error(
      'EMAIL_USER and EMAIL_PASS must be set in the backend .env. Use a Gmail App Password (Google Account → Security → 2-Step Verification → App passwords).'
    );
  }

  const transporter = buildTransporter();
  if (!transporter) {
    throw new Error('Email configuration missing');
  }

  const isReset = kind === 'password_reset';
  const subject = isReset ? 'Your password reset code' : 'Your verification code';
  const line = isReset
    ? `Your password reset code is: ${otp}. It expires in 5 minutes.`
    : `Your verification code is: ${otp}. It expires in 5 minutes.`
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

  const mid = info?.messageId ?? (info as { response?: string })?.response;
  console.log(`[email] OTP sent to ${to} messageId=${mid ?? 'ok'}`);
};

/** Call at startup to surface bad Gmail credentials early. */
export const verifyEmailConfig = async (): Promise<{ ok: boolean; error?: string }> => {
  const transporter = buildTransporter();
  if (!transporter) {
    return { ok: false, error: 'EMAIL_USER / EMAIL_PASS not set' };
  }
  try {
    await transporter.verify();
    console.log('[email] SMTP (smtp.gmail.com:465) connection OK');
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[email] SMTP verify failed:', msg);
    return { ok: false, error: msg };
  }
};

