import bcrypt from 'bcryptjs';
import type { Response, Request } from 'express';
import User, { type UserDocument } from '../models/User';
import Receiver, { RECEIVER_AUDIO_CALL_RATE_INR_PER_MIN, type ReceiverDocument } from '../models/Receiver';
import { sendOtpEmail } from '../config/email';
import {
  calculateAgeFromBirthDateUtc,
  dateOnlyIsoFromUtcDate,
  parseDateOnlyToUtcMidnight,
  validateBirthDateForAccount,
} from '../utils/birthDate';
import { PAUSED_MSG } from '../utils/accountAccess';
import { signAppAccessToken } from '../utils/authToken';
import { bumpReceiverAuthSession, bumpUserAuthSession } from '../services/authSessionService';
import { emitAuthSessionSuperseded } from '../socket/socketRegistry';
import { beginApiTrace, mongoErrCode } from '../utils/apiTraceLog';

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes

export type AccountTypeParam = 'user' | 'receiver';

export type UserRole = 'caller' | 'receiver';

export interface SafeUser {
  _id: string;
  name: string;
  email: string;
  phone: string;
  isVerified: boolean;
  role: UserRole;
  accountStatus: 'pending_profile' | 'pending_review' | 'approved' | 'rejected';
  profileImage: string | null;
  documents: string[];
  aadhaarFront: string | null;
  aadhaarBack: string | null;
  aadhaarNumber: string | null;
  panNumber: string | null;
  panFront: string | null;
  bankAccountHolderName: string | null;
  bankAccountType: 'savings' | 'current' | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  bankName: string | null;
  languages: string[];
  interests: string[];
  gender: 'male' | 'female' | 'other' | null;
  /** `YYYY-MM-DD` when set */
  dateOfBirth: string | null;
  age: number | null;
  state: string | null;
  createdAt: string;
  updatedAt: string;
  suspended: boolean;
  walletBalance: number;
  /** Receivers: INR per minute; callers: null */
  audioCallRate: number | null;
  /** Callers: voice sample URL for admin review; receivers: always null */
  userAudio: string | null;
  /** Receiver availability toggle (callers always `false`). */
  isAvailable: boolean;
  /** Runtime online presence from socket connection(s). */
  isOnline: boolean;
  /** Receiver rejection reason from admin review (when accountStatus is `rejected`). */
  rejectionReason?: string | null;
  /** Receivers only: persisted score in MongoDB (`cumulativeScore`). */
  cumulativeScore?: number;
  /** Receivers only: tier derived from cumulative score. */
  badgeLevel?: 'platinum' | 'diamond' | 'supreme';
  /** Receivers only: INR per valid call minute from tier. */
  earningRatePerMinute?: number;
}

type LegacyRegisterRole = 'caller' | 'receiver' | 'both';

type RegisterBody = {
  name: string;
  email: string;
  phone: string;
  password: string;
  /** ISO calendar date `YYYY-MM-DD` */
  dateOfBirth: string;
  role?: LegacyRegisterRole;
};

function resolveRegisterBirthDate(
  raw: unknown
): { ok: true; dob: Date; age: number } | { ok: false; message: string } {
  const dob = parseDateOnlyToUtcMidnight(raw);
  if (!dob) {
    return { ok: false, message: 'dateOfBirth is required (format YYYY-MM-DD)' };
  }
  const err = validateBirthDateForAccount(dob);
  if (err) return { ok: false, message: err };
  return { ok: true, dob, age: calculateAgeFromBirthDateUtc(dob) };
}

type LoginBody = { email: string; password: string; accountType: AccountTypeParam };
type SendOtpBody = { email: string; accountType: AccountTypeParam };
type VerifyOtpBody = { email: string; otp: string; accountType: AccountTypeParam };
type ResetPasswordBody = {
  email: string;
  otp: string;
  newPassword: string;
  accountType: AccountTypeParam;
};

function iso(d: Date): string {
  return d.toISOString();
}

function roundScoreField(n: unknown): number {
  const x = typeof n === 'number' && Number.isFinite(n) ? n : 0;
  return Math.round(x * 100) / 100;
}

export function toApiUser(user: UserDocument): SafeUser {
  const u = user.toObject();
  return {
    _id: String(user._id),
    name: u.name,
    email: u.email,
    phone: u.phone,
    isVerified: u.isVerified,
    role: 'caller',
    accountStatus: u.accountStatus,
    profileImage: u.profileImage ?? null,
    documents: [],
    aadhaarFront: null,
    aadhaarBack: null,
    aadhaarNumber: null,
    panNumber: null,
    panFront: null,
    bankAccountHolderName: null,
    bankAccountType: null,
    bankAccountNumber: null,
    bankIfsc: null,
    bankName: null,
    languages: u.languages ?? [],
    interests: u.interests ?? [],
    gender: u.gender ?? null,
    dateOfBirth: dateOnlyIsoFromUtcDate(u.dateOfBirth ?? null),
    age: u.age ?? null,
    state: u.state ?? null,
    createdAt: iso(u.createdAt),
    updatedAt: iso(u.updatedAt),
    suspended: Boolean(u.suspended),
    walletBalance: typeof u.walletBalance === 'number' && Number.isFinite(u.walletBalance) ? u.walletBalance : 0,
    audioCallRate: null,
    userAudio: u.userAudio ?? null,
    isAvailable: false,
    isOnline: false,
    rejectionReason: null,
  };
}

export function toApiReceiver(receiver: ReceiverDocument): SafeUser {
  const r = receiver.toObject();
  return {
    _id: String(receiver._id),
    name: r.name,
    email: r.email,
    phone: r.phone,
    isVerified: r.isVerified,
    role: 'receiver',
    accountStatus: r.accountStatus,
    profileImage: r.profileImage ?? null,
    documents: r.documents ?? [],
    aadhaarFront: r.aadhaarFront ?? null,
    aadhaarBack: r.aadhaarBack ?? null,
    aadhaarNumber: r.aadhaarNumber ?? null,
    panNumber: r.panNumber ?? null,
    panFront: r.panFront ?? null,
    bankAccountHolderName: r.bankAccountHolderName ?? null,
    bankAccountType: r.bankAccountType ?? null,
    bankAccountNumber: r.bankAccountNumber ?? null,
    bankIfsc: r.bankIfsc ?? null,
    bankName: r.bankName ?? null,
    languages: r.languages ?? [],
    interests: r.interests ?? [],
    gender: r.gender ?? null,
    dateOfBirth: dateOnlyIsoFromUtcDate(r.dateOfBirth ?? null),
    age: r.age ?? null,
    state: r.state ?? null,
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
    suspended: Boolean(r.suspended),
    walletBalance:
      typeof r.walletBalance === 'number' && Number.isFinite(r.walletBalance) ? r.walletBalance : 0,
    audioCallRate: RECEIVER_AUDIO_CALL_RATE_INR_PER_MIN,
    userAudio: typeof r.userAudio === 'string' ? r.userAudio : null,
    isAvailable: Boolean(r.isAvailable),
    isOnline: Boolean(r.isOnline),
    rejectionReason: r.rejectionReason ?? null,
    cumulativeScore: roundScoreField(r.cumulativeScore),
    badgeLevel:
      r.badgeLevel === 'diamond' || r.badgeLevel === 'supreme' || r.badgeLevel === 'platinum'
        ? r.badgeLevel
        : 'platinum',
    earningRatePerMinute: roundScoreField(r.earningRatePerMinute),
  };
}

/** Prefer toApiUser / toApiReceiver — resolves by Mongoose modelName */
export function toSafeUser(doc: UserDocument | ReceiverDocument): SafeUser {
  const modelName = (doc as { constructor?: { modelName?: string } }).constructor?.modelName;
  if (modelName === 'User') return toApiUser(doc as UserDocument);
  return toApiReceiver(doc as ReceiverDocument);
}

async function emailTaken(normalizedEmail: string): Promise<boolean> {
  const [u, r] = await Promise.all([
    User.exists({ email: normalizedEmail }),
    Receiver.exists({ email: normalizedEmail }),
  ]);
  return Boolean(u || r);
}

/**
 * POST /auth/register — creates a row in `users` (caller) or `receivers` (receiver / both).
 */
export const register = async (
  req: Request<{}, {}, RegisterBody>,
  res: Response
): Promise<void> => {
  const t = beginApiTrace('POST /auth/register', req, res);
  try {
    const { name, email, phone, password, role, dateOfBirth } = req.body;

    if (!name || !email || !phone || !password) {
      t.warn('register_validation_missing_fields');
      t.json(400, {
        message: 'name, email, phone, and password are required',
        error: 'REGISTER_MISSING_FIELDS',
      });
      return;
    }

    const birth = resolveRegisterBirthDate(dateOfBirth);
    if (!birth.ok) {
      t.warn('register_validation_birth_date', { message: birth.message });
      t.json(400, {
        message: birth.message,
        error: 'REGISTER_INVALID_BIRTH_DATE',
      });
      return;
    }
    const { dob, age } = birth;

    const normalizedEmail = String(email).toLowerCase().trim();
    const plain = String(password);
    if (plain.length < 8) {
      t.warn('register_validation_password_length');
      t.json(400, {
        message: 'Password must be at least 8 characters',
        error: 'REGISTER_PASSWORD_TOO_SHORT',
      });
      return;
    }

    if (await emailTaken(normalizedEmail)) {
      t.warn('register_email_conflict', { emailHash: `[len=${normalizedEmail.length}]` });
      t.json(409, {
        message: 'Email already registered',
        error: 'REGISTER_EMAIL_TAKEN',
      });
      return;
    }

    const allowed: LegacyRegisterRole[] = ['caller', 'receiver', 'both'];
    const userRole: LegacyRegisterRole = role && allowed.includes(role) ? role : 'receiver';
    const passwordHash = await bcrypt.hash(plain, 10);

    if (userRole === 'caller') {
      const user = await User.create({
        name: String(name).trim(),
        email: normalizedEmail,
        phone: String(phone).trim(),
        isVerified: false,
        passwordHash,
        dateOfBirth: dob,
        age,
      });
      t.log('register_ok_caller');
      t.json(201, {
        message: 'User registered successfully',
        user: toApiUser(user),
      });
      return;
    }

    const receiver = await Receiver.create({
      name: String(name).trim(),
      email: normalizedEmail,
      phone: String(phone).trim(),
      isVerified: false,
      passwordHash,
      dateOfBirth: dob,
      age,
      audioCallRate: RECEIVER_AUDIO_CALL_RATE_INR_PER_MIN,
    });
    t.log('register_ok_receiver');
    t.json(201, {
      message: 'User registered successfully',
      user: toApiReceiver(receiver),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    t.logFullError('register_unhandled', err, { mongoCode: mongoErrCode(err) });
    t.json(500, {
      message: msg || 'Server error',
      error: 'REGISTER_FAILED',
    });
  }
};

/**
 * POST /auth/login — body.accountType: `user` | `receiver`
 */
export const login = async (req: Request<{}, {}, LoginBody>, res: Response): Promise<void> => {
  const t = beginApiTrace('POST /auth/login', req, res);
  try {
    const { email, password, accountType } = req.body;
    if (!email || !password) {
      t.warn('login_validation_credentials');
      t.json(400, {
        message: 'email and password are required',
        error: 'LOGIN_MISSING_CREDENTIALS',
      });
      return;
    }
    if (accountType !== 'user' && accountType !== 'receiver') {
      t.warn('login_validation_account_type');
      t.json(400, {
        message: 'accountType must be user or receiver',
        error: 'LOGIN_INVALID_ACCOUNT_TYPE',
      });
      return;
    }

    const normalizedEmail = String(email).toLowerCase().trim();

    if (accountType === 'user') {
      const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash');
      if (!user || !user.passwordHash) {
        t.warn('login_failed_user_credentials');
        t.json(401, { message: 'Invalid email or password', error: 'LOGIN_AUTH_FAILED' });
        return;
      }
      const match = await bcrypt.compare(String(password), user.passwordHash);
      if (!match) {
        t.warn('login_failed_user_password');
        t.json(401, { message: 'Invalid email or password', error: 'LOGIN_AUTH_FAILED' });
        return;
      }
      const sv = await bumpUserAuthSession(String(user._id));
      emitAuthSessionSuperseded('u', String(user._id), sv);
      const token = signAppAccessToken(String(user._id), 'u', sv);
      const fresh = await User.findById(user._id).select('-passwordHash');
      if (!fresh) {
        t.warn('login_user_row_missing_after_session');
        t.json(401, { message: 'User not found', error: 'LOGIN_USER_MISSING' });
        return;
      }
      t.log('login_ok_user');
      t.json(200, { message: 'Login successful', token, user: toApiUser(fresh) });
      return;
    }

    const receiver = await Receiver.findOne({ email: normalizedEmail }).select('+passwordHash');
    if (!receiver || !receiver.passwordHash) {
      t.warn('login_failed_receiver_credentials');
      t.json(401, { message: 'Invalid email or password', error: 'LOGIN_AUTH_FAILED' });
      return;
    }
    const match = await bcrypt.compare(String(password), receiver.passwordHash);
    if (!match) {
      t.warn('login_failed_receiver_password');
      t.json(401, { message: 'Invalid email or password', error: 'LOGIN_AUTH_FAILED' });
      return;
    }
    if (receiver.suspended) {
      t.warn('login_receiver_suspended');
      t.json(403, { message: PAUSED_MSG, error: 'LOGIN_ACCOUNT_SUSPENDED' });
      return;
    }
    const sv = await bumpReceiverAuthSession(String(receiver._id));
    emitAuthSessionSuperseded('r', String(receiver._id), sv);
    const token = signAppAccessToken(String(receiver._id), 'r', sv);
    const fresh = await Receiver.findById(receiver._id).select('-passwordHash');
    if (!fresh) {
      t.warn('login_receiver_row_missing_after_session');
      t.json(401, { message: 'User not found', error: 'LOGIN_RECEIVER_MISSING' });
      return;
    }
    t.log('login_ok_receiver');
    t.json(200, { message: 'Login successful', token, user: toApiReceiver(fresh) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    t.logFullError('login_unhandled', err, { mongoCode: mongoErrCode(err) });
    t.json(500, { message: msg || 'Server error', error: 'LOGIN_FAILED' });
  }
};

export const sendOtp = async (
  req: Request<{}, {}, SendOtpBody>,
  res: Response
): Promise<void> => {
  const t = beginApiTrace('POST /auth/send-otp', req, res);
  try {
    const otpBypass = process.env.OTP_BYPASS?.toLowerCase() === 'true';
    const { email, accountType } = req.body;
    if (!email) {
      t.warn('send_otp_validation_email');
      t.json(400, { message: 'email is required', error: 'SEND_OTP_MISSING_EMAIL' });
      return;
    }
    if (accountType !== 'user' && accountType !== 'receiver') {
      t.warn('send_otp_validation_account_type');
      t.json(400, {
        message: 'accountType must be user or receiver',
        error: 'SEND_OTP_INVALID_ACCOUNT_TYPE',
      });
      return;
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const doc =
      accountType === 'user'
        ? await User.findOne({ email: normalizedEmail })
        : await Receiver.findOne({ email: normalizedEmail });

    if (!doc) {
      t.warn('send_otp_account_not_found');
      t.json(404, {
        message: 'No account for this email. Please register first.',
        error: 'SEND_OTP_ACCOUNT_NOT_FOUND',
      });
      return;
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const otpExpiry = new Date(Date.now() + OTP_TTL_MS);

    doc.otp = otp;
    doc.otpExpiry = otpExpiry;
    await doc.save();

    console.log(`[OTP TEST] ${doc.email} → OTP: ${otp} (expires ${otpExpiry.toISOString()})`);

    if (otpBypass) {
      t.log('send_otp_bypass_no_mail');
      t.json(200, {
        message: 'OTP bypass enabled (email not required)',
        emailSent: false,
        errorHint: 'SEND_OTP_BYPASS_ACTIVE',
      });
      return;
    }

    let emailSent = true;
    try {
      await sendOtpEmail(doc.email, otp, 'verification');
    } catch (mailErr) {
      emailSent = false;
      const mailMsg = mailErr instanceof Error ? mailErr.message : String(mailErr);
      t.logFullError('send_otp_email_transport', mailErr, { subsystem: 'smtp' });
      if (mailErr && typeof mailErr === 'object' && 'response' in mailErr) {
        const raw = (mailErr as { response?: unknown }).response;
        t.warn('send_otp_smtp_vendor_response_present', {
          snippet: typeof raw === 'string' ? raw.slice(0, 500) : String(raw),
        });
      }
    }

    if (!emailSent) {
      t.warn('send_otp_ok_but_mail_failed');
      t.json(200, {
        message:
          'OTP saved. Email delivery failed — use the code printed in the server console or fix EMAIL_USER / EMAIL_PASS.',
        emailSent: false,
        errorHint: 'SEND_OTP_SMTP_FAILED',
      });
      return;
    }

    t.log('send_otp_mail_ok');
    t.json(200, { message: 'OTP sent to your email', emailSent: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    t.logFullError('send_otp_unhandled', err, { mongoCode: mongoErrCode(err) });
    t.json(500, { message: msg || 'Server error', error: 'SEND_OTP_FAILED' });
  }
};

export const forgotPassword = async (
  req: Request<{}, {}, SendOtpBody>,
  res: Response
): Promise<void> => {
  const genericMessage = 'If an account exists with this email, a reset code has been sent.';
  const t = beginApiTrace('POST /auth/forgot-password', req, res);
  try {
    const otpBypass = process.env.OTP_BYPASS?.toLowerCase() === 'true';
    const { email, accountType } = req.body;
    if (!email) {
      t.warn('forgot_password_validation_email');
      t.json(400, { message: 'email is required', error: 'FORGOT_PASSWORD_MISSING_EMAIL' });
      return;
    }
    if (accountType !== 'user' && accountType !== 'receiver') {
      t.warn('forgot_password_validation_account_type');
      t.json(400, {
        message: 'accountType must be user or receiver',
        error: 'FORGOT_PASSWORD_INVALID_ACCOUNT_TYPE',
      });
      return;
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const doc =
      accountType === 'user'
        ? await User.findOne({ email: normalizedEmail })
        : await Receiver.findOne({ email: normalizedEmail });

    if (!doc) {
      t.log('forgot_password_no_account_generic_response');
      t.json(200, { message: genericMessage, emailSent: false });
      return;
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const otpExpiry = new Date(Date.now() + OTP_TTL_MS);

    doc.otp = otp;
    doc.otpExpiry = otpExpiry;
    await doc.save();

    console.log(`[PASSWORD RESET OTP] ${doc.email} → OTP: ${otp} (expires ${otpExpiry.toISOString()})`);

    if (otpBypass) {
      t.log('forgot_password_bypass');
      t.json(200, { message: genericMessage, emailSent: false });
      return;
    }

    let emailSent = true;
    try {
      await sendOtpEmail(doc.email, otp, 'password_reset');
    } catch (mailErr) {
      emailSent = false;
      t.logFullError('forgot_password_email_transport', mailErr, { subsystem: 'smtp' });
      if (mailErr && typeof mailErr === 'object' && 'response' in mailErr) {
        const raw = (mailErr as { response?: unknown }).response;
        t.warn('forgot_password_smtp_vendor_response_present', {
          snippet: typeof raw === 'string' ? raw.slice(0, 500) : String(raw),
        });
      }
    }

    t.log('forgot_password_done', { emailSent });
    t.json(200, {
      message: emailSent
        ? genericMessage
        : 'Code could not be emailed. Check server logs and EMAIL_USER / EMAIL_PASS, or use the code printed in the server console.',
      emailSent,
      ...(emailSent ? {} : { errorHint: 'FORGOT_PASSWORD_SMTP_FAILED' }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    t.logFullError('forgot_password_unhandled', err, { mongoCode: mongoErrCode(err) });
    t.json(500, { message: msg || 'Server error', error: 'FORGOT_PASSWORD_FAILED' });
  }
};

export const resetPassword = async (
  req: Request<{}, {}, ResetPasswordBody>,
  res: Response
): Promise<void> => {
  const t = beginApiTrace('POST /auth/reset-password', req, res);
  try {
    const otpBypass = process.env.OTP_BYPASS?.toLowerCase() === 'true';
    const { email, otp, newPassword, accountType } = req.body;
    if (!email || !otp || !newPassword) {
      t.warn('reset_password_validation_fields');
      t.json(400, {
        message: 'email, otp, and newPassword are required',
        error: 'RESET_PASSWORD_MISSING_FIELDS',
      });
      return;
    }
    if (accountType !== 'user' && accountType !== 'receiver') {
      t.warn('reset_password_validation_account_type');
      t.json(400, {
        message: 'accountType must be user or receiver',
        error: 'RESET_PASSWORD_INVALID_ACCOUNT_TYPE',
      });
      return;
    }

    const plain = String(newPassword);
    if (plain.length < 8) {
      t.warn('reset_password_validation_weak_password');
      t.json(400, {
        message: 'Password must be at least 8 characters',
        error: 'RESET_PASSWORD_TOO_SHORT',
      });
      return;
    }

    const normalizedEmail = String(email).toLowerCase().trim();

    const finishReset = async (
      doc: UserDocument | ReceiverDocument
    ): Promise<{ token: string; userJson: SafeUser }> => {
      doc.passwordHash = await bcrypt.hash(plain, 10);
      doc.otp = null;
      doc.otpExpiry = null;
      doc.isVerified = true;
      await doc.save();
      const typ = accountType === 'user' ? 'u' : 'r';
      const sv =
        accountType === 'user'
          ? await bumpUserAuthSession(String(doc._id))
          : await bumpReceiverAuthSession(String(doc._id));
      emitAuthSessionSuperseded(typ, String(doc._id), sv);
      const token = signAppAccessToken(String(doc._id), typ, sv);
      const userJson =
        accountType === 'user' ? toApiUser(doc as UserDocument) : toApiReceiver(doc as ReceiverDocument);
      return { token, userJson };
    };

    if (accountType === 'user') {
      const doc = await User.findOne({ email: normalizedEmail }).select('+passwordHash');
      if (!doc) {
        t.warn('reset_password_user_not_found');
        t.json(400, { message: 'Invalid or expired code', error: 'RESET_PASSWORD_BAD_OR_MISSING_CODE' });
        return;
      }

      if (otpBypass) {
        const { token, userJson } = await finishReset(doc);
        t.log('reset_password_ok_user_bypass');
        t.json(200, { message: 'Password updated', token, user: userJson });
        return;
      }

      if (!doc.otp || !doc.otpExpiry) {
        t.warn('reset_password_user_no_otp_pending');
        t.json(400, {
          message: 'No reset code pending. Request a new code.',
          error: 'RESET_PASSWORD_NO_CODE_PENDING',
        });
        return;
      }

      if (new Date() > doc.otpExpiry) {
        t.warn('reset_password_user_otp_expired');
        t.json(400, { message: 'Code expired. Request a new code.', error: 'RESET_PASSWORD_CODE_EXPIRED' });
        return;
      }

      if (String(otp).trim() !== doc.otp) {
        t.warn('reset_password_user_otp_mismatch');
        t.json(400, { message: 'Invalid code', error: 'RESET_PASSWORD_INVALID_OTP' });
        return;
      }

      const { token, userJson } = await finishReset(doc);
      t.log('reset_password_ok_user');
      t.json(200, { message: 'Password updated', token, user: userJson });
      return;
    }

    const doc = await Receiver.findOne({ email: normalizedEmail }).select('+passwordHash');
    if (!doc) {
      t.warn('reset_password_receiver_not_found');
      t.json(400, { message: 'Invalid or expired code', error: 'RESET_PASSWORD_BAD_OR_MISSING_CODE' });
      return;
    }

    if (otpBypass) {
      const { token, userJson } = await finishReset(doc);
      t.log('reset_password_ok_receiver_bypass');
      t.json(200, { message: 'Password updated', token, user: userJson });
      return;
    }

    if (!doc.otp || !doc.otpExpiry) {
      t.warn('reset_password_receiver_no_otp_pending');
      t.json(400, {
        message: 'No reset code pending. Request a new code.',
        error: 'RESET_PASSWORD_NO_CODE_PENDING',
      });
      return;
    }

    if (new Date() > doc.otpExpiry) {
      t.warn('reset_password_receiver_otp_expired');
      t.json(400, { message: 'Code expired. Request a new code.', error: 'RESET_PASSWORD_CODE_EXPIRED' });
      return;
    }

    if (String(otp).trim() !== doc.otp) {
      t.warn('reset_password_receiver_otp_mismatch');
      t.json(400, { message: 'Invalid code', error: 'RESET_PASSWORD_INVALID_OTP' });
      return;
    }

    const { token, userJson } = await finishReset(doc);
    t.log('reset_password_ok_receiver');
    t.json(200, {
      message: 'Password updated',
      token,
      user: userJson,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    t.logFullError('reset_password_unhandled', err, { mongoCode: mongoErrCode(err) });
    t.json(500, { message: msg || 'Server error', error: 'RESET_PASSWORD_FAILED' });
  }
};

export const verifyOtp = async (
  req: Request<{}, {}, VerifyOtpBody>,
  res: Response
): Promise<void> => {
  const t = beginApiTrace('POST /auth/verify-otp', req, res);
  try {
    const otpBypass = process.env.OTP_BYPASS?.toLowerCase() === 'true';
    const { email, otp, accountType } = req.body;
    if (!email || !otp) {
      t.warn('verify_otp_validation_fields');
      t.json(400, { message: 'email and otp are required', error: 'VERIFY_OTP_MISSING_FIELDS' });
      return;
    }
    if (accountType !== 'user' && accountType !== 'receiver') {
      t.warn('verify_otp_validation_account_type');
      t.json(400, {
        message: 'accountType must be user or receiver',
        error: 'VERIFY_OTP_INVALID_ACCOUNT_TYPE',
      });
      return;
    }

    const normalizedEmail = String(email).toLowerCase().trim();

    const respondVerified = async (doc: UserDocument | ReceiverDocument): Promise<void> => {
      const typ = accountType === 'user' ? 'u' : 'r';
      const sv =
        accountType === 'user'
          ? await bumpUserAuthSession(String(doc._id))
          : await bumpReceiverAuthSession(String(doc._id));
      emitAuthSessionSuperseded(typ, String(doc._id), sv);
      const token = signAppAccessToken(String(doc._id), typ, sv);
      const userJson =
        accountType === 'user' ? toApiUser(doc as UserDocument) : toApiReceiver(doc as ReceiverDocument);
      t.log('verify_otp_ok');
      t.json(200, {
        message: otpBypass ? 'Login successful (OTP bypass)' : 'Login successful',
        token,
        user: userJson,
      });
    };

    const verifyDoc = async (doc: UserDocument | ReceiverDocument): Promise<void> => {
      if (accountType === 'user' && (doc as UserDocument).suspended) {
        t.warn('verify_otp_user_suspended');
        t.json(403, { message: PAUSED_MSG, error: 'VERIFY_OTP_ACCOUNT_SUSPENDED' });
        return;
      }
      if (accountType === 'receiver' && (doc as ReceiverDocument).suspended) {
        t.warn('verify_otp_receiver_suspended');
        t.json(403, { message: PAUSED_MSG, error: 'VERIFY_OTP_ACCOUNT_SUSPENDED' });
        return;
      }
      if (otpBypass) {
        doc.isVerified = true;
        doc.otp = null;
        doc.otpExpiry = null;
        await doc.save();
        await respondVerified(doc);
        return;
      }

      if (!doc.otp || !doc.otpExpiry) {
        t.warn('verify_otp_no_otp_pending');
        t.json(400, {
          message: 'No OTP pending. Request a new code.',
          error: 'VERIFY_OTP_NO_CODE_PENDING',
        });
        return;
      }

      if (new Date() > doc.otpExpiry) {
        t.warn('verify_otp_expired');
        t.json(400, { message: 'OTP expired. Request a new code.', error: 'VERIFY_OTP_CODE_EXPIRED' });
        return;
      }

      if (String(otp).trim() !== doc.otp) {
        t.warn('verify_otp_mismatch');
        t.json(400, { message: 'Invalid OTP', error: 'VERIFY_OTP_INVALID_CODE' });
        return;
      }

      doc.isVerified = true;
      doc.otp = null;
      doc.otpExpiry = null;
      await doc.save();
      await respondVerified(doc);
    };

    if (accountType === 'user') {
      const doc = await User.findOne({ email: normalizedEmail });
      if (!doc) {
        t.warn('verify_otp_user_not_found');
        t.json(404, { message: 'User not found', error: 'VERIFY_OTP_USER_NOT_FOUND' });
        return;
      }
      await verifyDoc(doc);
      return;
    }

    const doc = await Receiver.findOne({ email: normalizedEmail });
    if (!doc) {
      t.warn('verify_otp_receiver_not_found');
      t.json(404, { message: 'User not found', error: 'VERIFY_OTP_RECEIVER_NOT_FOUND' });
      return;
    }
    await verifyDoc(doc);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    t.logFullError('verify_otp_unhandled', err, { mongoCode: mongoErrCode(err) });
    t.json(500, { message: msg || 'Server error', error: 'VERIFY_OTP_FAILED' });
  }
};

export const getMe = async (req: Request, res: Response): Promise<void> => {
  const t = beginApiTrace('GET /auth/me', req, res);
  try {
    const kind = req.accountKind;
    if (!kind) {
      t.warn('get_me_no_account_kind');
      t.json(401, { message: 'Not authorized', error: 'ME_UNAUTHORIZED' });
      return;
    }
    if (kind === 'user') {
      const user = req.user as UserDocument | undefined;
      if (!user) {
        t.warn('get_me_user_missing_on_request');
        t.json(401, { message: 'Not authorized', error: 'ME_USER_MISSING' });
        return;
      }
      t.log('get_me_ok_user');
      t.json(200, { user: toApiUser(user) });
      return;
    }
    const receiver = req.receiver as ReceiverDocument | undefined;
    if (!receiver) {
      t.warn('get_me_receiver_missing_on_request');
      t.json(401, { message: 'Not authorized', error: 'ME_RECEIVER_MISSING' });
      return;
    }
    t.log('get_me_ok_receiver');
    t.json(200, { user: toApiReceiver(receiver) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    t.logFullError('get_me_unhandled', err, { mongoCode: mongoErrCode(err) });
    t.json(500, { message: msg || 'Server error', error: 'ME_FAILED' });
  }
};
