import { otpBypassEnabled } from '../utils/otpBypass';
import {
  isMessageCentralConfigured,
  MessageCentralError,
  sendMessageCentralSmsOtp,
  validateMessageCentralOtp,
} from './messageCentral';

const OTP_TTL_MS = 5 * 60 * 1000;

export type IssuedSmsOtp = {
  /** Local OTP when OTP_BYPASS=true; otherwise null. */
  otp: string | null;
  /** Message Central verificationId when SMS is active. */
  verificationId: string | null;
  otpExpiry: Date;
};

function generateOtpCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function staticReceiverOtp(): string {
  return process.env.RECEIVER_OTP_STATIC?.trim() || '';
}

/**
 * Send SMS OTP via Message Central, or issue a local code when OTP_BYPASS=true.
 */
export async function issueSmsOtp(phoneDigits: string, _logLabel?: string): Promise<IssuedSmsOtp> {
  const otpExpiry = new Date(Date.now() + OTP_TTL_MS);
  const digits = String(phoneDigits).replace(/\D/g, '');
  const national =
    digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits.slice(-10);

  if (otpBypassEnabled()) {
    return { otp: generateOtpCode(), verificationId: null, otpExpiry };
  }

  if (!isMessageCentralConfigured()) {
    throw new MessageCentralError(
      501,
      'SMS OTP is not configured. Set MESSAGE_CENTRAL_CUSTOMER_ID, MESSAGE_CENTRAL_EMAIL, and MESSAGE_CENTRAL_PASSWORD in backend/.env',
      503
    );
  }

  if (national.length !== 10) {
    throw new MessageCentralError(400, 'Invalid mobile number');
  }

  const sent = await sendMessageCentralSmsOtp(national);
  return { otp: null, verificationId: sent.verificationId, otpExpiry };
}

/** Persist format: `mc:<verificationId>` for Message Central, plain code for local/bypass. */
export function encodeStoredSmsOtp(issued: IssuedSmsOtp): string {
  if (issued.verificationId) return `mc:${issued.verificationId}`;
  return issued.otp ?? '';
}

export function parseStoredVerificationId(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (stored.startsWith('mc:')) return stored.slice(3);
  return null;
}

/**
 * Validate submitted OTP against stored value / Message Central.
 * When OTP_BYPASS=true, accepts any code.
 */
export async function assertSmsOtpValid(opts: {
  storedOtp: string | null | undefined;
  verificationId?: string | null;
  otpExpiry: Date | null | undefined;
  submitted: string;
  allowStaticReceiver?: boolean;
}): Promise<void> {
  const trimmed = String(opts.submitted).trim();
  if (otpBypassEnabled()) return;

  if (opts.allowStaticReceiver) {
    const staticCode = staticReceiverOtp();
    if (staticCode && trimmed === staticCode) return;
  }

  const now = new Date();
  if (opts.otpExpiry && now > opts.otpExpiry) {
    throw new MessageCentralError(705, 'OTP expired. Request a new code.', 400);
  }

  const mcId = opts.verificationId || parseStoredVerificationId(opts.storedOtp ?? null);
  if (mcId) {
    await validateMessageCentralOtp(mcId, trimmed);
    return;
  }

  if (!opts.storedOtp) {
    throw new MessageCentralError(505, 'No OTP pending. Request a new code.', 400);
  }
  if (trimmed !== opts.storedOtp) {
    throw new MessageCentralError(702, 'Wrong OTP. Please try again.', 400);
  }
}

export { MessageCentralError, OTP_TTL_MS };
