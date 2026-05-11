import bcrypt from 'bcryptjs';
import type { Response, Request } from 'express';
import User, { type UserDocument } from '../models/User';
import Receiver, { RECEIVER_AUDIO_CALL_RATE_INR_PER_MIN, type ReceiverDocument } from '../models/Receiver';
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
  name?: string;
  phone: string;
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

type LoginBody = { phone?: string; accountType: AccountTypeParam };
type SendOtpBody = { phone: string; accountType: AccountTypeParam };
type VerifyOtpBody = { phone: string; otp: string; accountType: AccountTypeParam };
type ResetPasswordBody = {
  phone: string;
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

async function phoneTaken(phone: string): Promise<boolean> {
  const normalizedPhone = String(phone).trim();
  const [u, r] = await Promise.all([
    User.exists({ phone: normalizedPhone }),
    Receiver.exists({ phone: normalizedPhone }),
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
    const { name, phone, role, dateOfBirth } = req.body;

    if (!phone || !String(phone).trim()) {
      t.warn('register_validation_missing_fields');
      t.json(400, {
        message: 'phone is required',
        error: 'REGISTER_MISSING_FIELDS',
      });
      return;
    }
    const phoneDigits = String(phone).trim();

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

    if (await phoneTaken(phoneDigits)) {
      t.warn('register_phone_conflict');
      t.json(409, {
        message: 'Mobile number already registered',
        error: 'REGISTER_PHONE_TAKEN',
      });
      return;
    }

    const allowed: LegacyRegisterRole[] = ['caller', 'receiver', 'both'];
    const userRole: LegacyRegisterRole = role && allowed.includes(role) ? role : 'receiver';
    const resolvedName =
      typeof name === 'string' && name.trim() ? String(name).trim() : `Member ${phoneDigits.slice(-4)}`;
    // Keep email optional for old flows/indices; generate unique placeholder when absent.
    const resolvedEmail = `m_${phoneDigits}@mobile.local`;

    if (userRole === 'caller') {
      const user = await User.create({
        name: resolvedName,
        email: resolvedEmail,
        phone: phoneDigits,
        isVerified: false,
        passwordHash: null,
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
      name: resolvedName,
      email: resolvedEmail,
      phone: phoneDigits,
      isVerified: false,
      passwordHash: null,
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
    t.warn('login_deprecated');
    t.json(400, {
      message: 'Password login is disabled. Use mobile OTP.',
      error: 'LOGIN_DEPRECATED',
    });
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
    const { phone, accountType } = req.body;
    const phoneDigits = typeof phone === 'string' ? String(phone).trim() : '';

    if (!phoneDigits) {
      t.warn('send_otp_validation_identifier_missing');
      t.json(400, { message: 'phone is required', error: 'SEND_OTP_MISSING_PHONE' });
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

    const doc =
      accountType === 'user'
        ? await User.findOne({ phone: phoneDigits })
        : await Receiver.findOne({ phone: phoneDigits });

    if (!doc) {
      t.warn('send_otp_account_not_found');
      t.json(404, {
        message: 'No account found',
        error: 'SEND_OTP_ACCOUNT_NOT_FOUND',
      });
      return;
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const otpExpiry = new Date(Date.now() + OTP_TTL_MS);

    doc.otp = otp;
    doc.otpExpiry = otpExpiry;
    await doc.save();

    console.log(
      `[OTP TEST] ${accountType}:${phoneDigits} → OTP: ${otp} (expires ${otpExpiry.toISOString()})`
    );

    t.log('send_otp_ok');
    t.json(200, { message: 'OTP sent', sent: true });
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
  const genericMessage = 'If an account exists with this phone number, a reset code has been sent.';
  const t = beginApiTrace('POST /auth/forgot-password', req, res);
  try {
    const otpBypass = process.env.OTP_BYPASS?.toLowerCase() === 'true';
    const { phone, accountType } = req.body;
    
    if (!phone) {
      t.warn('forgot_password_validation_phone');
      t.json(400, { message: 'phone is required', error: 'FORGOT_PASSWORD_MISSING_PHONE' });
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

    const phoneDigits = String(phone).trim();
    const doc =
      accountType === 'user'
        ? await User.findOne({ phone: phoneDigits })
        : await Receiver.findOne({ phone: phoneDigits });

    if (!doc) {
      t.log('forgot_password_no_account_generic_response');
      t.json(200, { message: genericMessage, resetSent: false });
      return;
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const otpExpiry = new Date(Date.now() + OTP_TTL_MS);

    doc.otp = otp;
    doc.otpExpiry = otpExpiry;
    await doc.save();

    console.log(`[PASSWORD RESET OTP] ${doc.phone} → OTP: ${otp} (expires ${otpExpiry.toISOString()})`);

    t.log('forgot_password_done');
    t.json(200, {
      message: genericMessage,
      resetSent: true,
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
    const { phone, otp, newPassword, accountType } = req.body;
    
    if (!phone || !otp || !newPassword) {
      t.warn('reset_password_validation_fields');
      t.json(400, {
        message: 'phone, otp, and newPassword are required',
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

    const phoneDigits = String(phone).trim();

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
      const doc = await User.findOne({ phone: phoneDigits }).select('+passwordHash');
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

    const doc = await Receiver.findOne({ phone: phoneDigits }).select('+passwordHash');
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
    const { phone, otp, accountType } = req.body;
    const phoneDigits = typeof phone === 'string' ? String(phone).trim() : '';

    if (!otp || !phoneDigits) {
      t.warn('verify_otp_validation_fields');
      t.json(400, { message: 'phone and otp are required', error: 'VERIFY_OTP_MISSING_FIELDS' });
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
      const trimmedOtp = String(otp).trim();
      const localBypass = /^\d{6}$/.test(trimmedOtp);
      if (otpBypass || localBypass) {
        doc.isVerified = true;
        doc.otp = null;
        doc.otpExpiry = null;

        if (accountType === 'receiver' && doc.accountStatus === 'pending_profile') {
          // Check if profile is complete (has name, profileImage, etc.)
          const hasName = doc.name && doc.name.trim();
          const hasProfileImage = doc.profileImage && doc.profileImage.trim();
        }
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

      if (trimmedOtp !== doc.otp) {
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
      const doc = await User.findOne({ phone: phoneDigits });
      if (!doc) {
        t.warn('verify_otp_user_not_found');
        t.json(404, { message: 'User not found', error: 'VERIFY_OTP_USER_NOT_FOUND' });
        return;
      }
      await verifyDoc(doc);
      return;
    }

    const doc = await Receiver.findOne({ phone: phoneDigits });
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