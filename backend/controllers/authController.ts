import bcrypt from 'bcryptjs';
import type { Response, Request } from 'express';
import User, { type UserDocument } from '../models/User';
import Receiver, { RECEIVER_AUDIO_CALL_RATE_INR_PER_MIN, type ReceiverDocument } from '../models/Receiver';
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
  role?: LegacyRegisterRole;
};

type LoginBody = { phone?: string; accountType: AccountTypeParam };
type SendOtpBody = { 
  phone: string; 
  accountType: AccountTypeParam;
  signup?: {
    name?: string;
    role?: LegacyRegisterRole;
  };
};

type PendingReceiverSignup = {
  phone: string;
  otp: string;
  otpExpiry: Date;
  name: string;
};
const pendingReceiverSignups = new Map<string, PendingReceiverSignup>();

type PendingMobileSignup = {
  phone: string;
  otp: string;
  otpExpiry: Date;
};

/** OTP for brand-new numbers before gender-based account creation. */
const pendingMobileSignups = new Map<string, PendingMobileSignup>();
/** Phones that passed OTP but still need gender selection (value = expiry). */
const verifiedMobilePhones = new Map<string, Date>();

const VERIFIED_MOBILE_TTL_MS = 15 * 60 * 1000;

function clearExpiredPendingReceiverSignups(): void {
  const now = Date.now();
  for (const [phone, row] of pendingReceiverSignups.entries()) {
    if (row.otpExpiry.getTime() <= now) pendingReceiverSignups.delete(phone);
  }
}

function clearExpiredPendingMobileSignups(): void {
  const now = Date.now();
  for (const [phone, row] of pendingMobileSignups.entries()) {
    if (row.otpExpiry.getTime() <= now) pendingMobileSignups.delete(phone);
  }
}

function clearExpiredVerifiedMobilePhones(): void {
  const now = Date.now();
  for (const [phone, expiry] of verifiedMobilePhones.entries()) {
    if (expiry.getTime() <= now) verifiedMobilePhones.delete(phone);
  }
}

async function resolvePhoneAccountType(
  phoneDigits: string
): Promise<'user' | 'receiver' | null> {
  const [user, receiver] = await Promise.all([
    User.findOne({ phone: phoneDigits }),
    Receiver.findOne({ phone: phoneDigits }),
  ]);
  if (user) return 'user';
  if (receiver) return 'receiver';
  return null;
}

function generateOtpCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function saveOtpOnDoc(doc: UserDocument | ReceiverDocument, label: string): Promise<void> {
  const otp = generateOtpCode();
  const otpExpiry = new Date(Date.now() + OTP_TTL_MS);
  doc.otp = otp;
  doc.otpExpiry = otpExpiry;
  await doc.save();
  console.log(`[OTP TEST] ${label}:${doc.phone} → OTP: ${otp}`);
}


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
    const { name, phone, role } = req.body;

    if (!phone || !String(phone).trim()) {
      t.warn('register_validation_missing_fields');
      t.json(400, {
        message: 'phone is required',
        error: 'REGISTER_MISSING_FIELDS',
      });
      return;
    }
    const phoneDigits = String(phone).trim();

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

    if (userRole === 'caller') {
      const user = await User.create({
        name: resolvedName,
        phone: phoneDigits,
        isVerified: false,
        passwordHash: null,
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
      phone: phoneDigits,
      isVerified: false,
      passwordHash: null,
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

export const sendOtp = async (
  req: Request<{}, {}, SendOtpBody>,
  res: Response
): Promise<void> => {
  const t = beginApiTrace('POST /auth/send-otp', req, res);
  try {
    const { phone, accountType, signup } = req.body;
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

    clearExpiredPendingReceiverSignups();

    // For existing accounts (already in database)
    const doc =
      accountType === 'user'
        ? await User.findOne({ phone: phoneDigits })
        : await Receiver.findOne({ phone: phoneDigits });

    // If this is a signup flow (has signup data) and account already exists, block it
    if (doc && signup) {
      t.warn('send_otp_account_already_exists');
      t.json(409, {
        message: 'Mobile number already registered. Please login instead.',
        error: 'SEND_OTP_ACCOUNT_EXISTS',
      });
      return;
    }

    // If this is login flow (no signup data) and account exists, send OTP for login
    if (doc && !signup) {
      const otp = String(Math.floor(100000 + Math.random() * 900000));
      const otpExpiry = new Date(Date.now() + OTP_TTL_MS);
      doc.otp = otp;
      doc.otpExpiry = otpExpiry;
      await doc.save();
      console.log(`[OTP TEST] ${accountType}:${phoneDigits} → OTP: ${otp}`);
      t.log('send_otp_ok_existing');
      t.json(200, { message: 'OTP sent', sent: true });
      return;
    }

    // For new receiver signup - store in memory (NOT database)
    if (accountType === 'receiver' && signup) {
      const otp = String(Math.floor(100000 + Math.random() * 900000));
      const otpExpiry = new Date(Date.now() + OTP_TTL_MS);

      const resolvedName = signup.name?.trim() || `Member ${phoneDigits.slice(-4)}`;
      
      pendingReceiverSignups.set(phoneDigits, {
        phone: phoneDigits,
        otp,
        otpExpiry,
        name: resolvedName,
      });
      
      console.log(`[OTP TEST] Pending receiver signup: ${phoneDigits} → OTP: ${otp}`);
      t.log('send_otp_ok_pending_signup');
      t.json(200, { message: 'OTP sent', sent: true });
      return;
    }

    t.warn('send_otp_account_not_found');
    t.json(404, { message: 'No account found', error: 'SEND_OTP_ACCOUNT_NOT_FOUND' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    t.logFullError('send_otp_unhandled', err, { mongoCode: mongoErrCode(err) });
    t.json(500, { message: msg || 'Server error', error: 'SEND_OTP_FAILED' });
  }
};
// Replace the verifyOtp function
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
      // ANY 6-digit number bypasses OTP
      const isBypassOtp = /^\d{6}$/.test(trimmedOtp);
      
      if (otpBypass || isBypassOtp) {
        doc.isVerified = true;
        doc.otp = null;
        doc.otpExpiry = null;
    
        if (accountType === 'receiver' && doc.accountStatus === 'pending_profile') {
          const receiverDoc = doc as ReceiverDocument;
          const hasName = receiverDoc.name && receiverDoc.name.trim();
          const hasProfileImage = receiverDoc.profileImage && receiverDoc.profileImage.trim();
          const hasUserAudio = receiverDoc.userAudio && receiverDoc.userAudio.trim();
          const hasAadhaar = receiverDoc.aadhaarFront && receiverDoc.aadhaarBack && receiverDoc.aadhaarNumber;
          const hasPan = receiverDoc.panNumber && receiverDoc.panFront;
          const hasBank = receiverDoc.bankAccountNumber && receiverDoc.bankName;
    
          if (hasName && hasProfileImage && hasUserAudio && hasAadhaar && hasPan && hasBank) {
            doc.accountStatus = 'approved';
          }
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
    
      if (accountType === 'receiver' && doc.accountStatus === 'pending_profile') {
        const receiverDoc = doc as ReceiverDocument;
        const hasName = receiverDoc.name && receiverDoc.name.trim();
        const hasProfileImage = receiverDoc.profileImage && receiverDoc.profileImage.trim();
        const hasUserAudio = receiverDoc.userAudio && receiverDoc.userAudio.trim();
        const hasAadhaar = receiverDoc.aadhaarFront && receiverDoc.aadhaarBack && receiverDoc.aadhaarNumber;
        const hasPan = receiverDoc.panNumber && receiverDoc.panFront;
        const hasBank = receiverDoc.bankAccountNumber && receiverDoc.bankName;
    
        if (hasName && hasProfileImage && hasUserAudio && hasAadhaar && hasPan && hasBank) {
          doc.accountStatus = 'approved';
        }
      }
    
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

    // Receiver flow - check pending signup first (in memory), then existing account
    let doc = await Receiver.findOne({ phone: phoneDigits });
    
    if (!doc) {
      clearExpiredPendingReceiverSignups();
      const pending = pendingReceiverSignups.get(phoneDigits);
      
      if (!pending) {
        t.warn('verify_otp_receiver_not_found');
        t.json(404, { message: 'No pending signup or account found', error: 'VERIFY_OTP_RECEIVER_NOT_FOUND' });
        return;
      }
      
      const trimmedOtp = String(otp).trim();
      const localBypass = /^\d{6}$/.test(trimmedOtp);
      const shouldBypass = otpBypass || localBypass;
      
      if (new Date() > pending.otpExpiry && !shouldBypass) {
        pendingReceiverSignups.delete(phoneDigits);
        t.warn('verify_otp_pending_receiver_expired');
        t.json(400, { message: 'OTP expired. Request a new code.', error: 'VERIFY_OTP_CODE_EXPIRED' });
        return;
      }
      
      if (!shouldBypass && trimmedOtp !== pending.otp) {
        t.warn('verify_otp_pending_receiver_mismatch');
        t.json(400, { message: 'Invalid OTP', error: 'VERIFY_OTP_INVALID_CODE' });
        return;
      }
      
      if (await phoneTaken(phoneDigits)) {
        pendingReceiverSignups.delete(phoneDigits);
        t.warn('verify_otp_pending_receiver_phone_taken_race');
        t.json(409, { message: 'Mobile number already registered', error: 'REGISTER_PHONE_TAKEN' });
        return;
      }
      
      // CREATE ACCOUNT ONLY NOW - after successful OTP verification
      doc = await Receiver.create({
        name: pending.name,
        phone: phoneDigits,
        isVerified: true,
        passwordHash: null,
        audioCallRate: RECEIVER_AUDIO_CALL_RATE_INR_PER_MIN,
        otp: null,
        otpExpiry: null,
      });
      pendingReceiverSignups.delete(phoneDigits);
      await respondVerified(doc);
      return;
    }
    
    await verifyDoc(doc);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    t.logFullError('verify_otp_unhandled', err, { mongoCode: mongoErrCode(err) });
    t.json(500, { message: msg || 'Server error', error: 'VERIFY_OTP_FAILED' });
  }
};

type LookupPhoneBody = { phone: string };
type MobilePhoneBody = { phone: string };
type VerifyMobileOtpBody = { phone: string; otp: string };
type CompleteMobileSignupBody = { phone: string; gender: 'male' | 'female' };

/**
 * POST /auth/lookup-phone — which table holds this mobile (if any).
 */
export const lookupPhone = async (
  req: Request<{}, {}, LookupPhoneBody>,
  res: Response
): Promise<void> => {
  const t = beginApiTrace('POST /auth/lookup-phone', req, res);
  try {
    const phoneDigits = typeof req.body.phone === 'string' ? String(req.body.phone).trim() : '';
    if (!phoneDigits) {
      t.json(400, { message: 'phone is required', error: 'LOOKUP_PHONE_MISSING' });
      return;
    }
    const accountType = await resolvePhoneAccountType(phoneDigits);
    t.json(200, { accountType, isRegistered: accountType !== null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    t.logFullError('lookup_phone_unhandled', err, { mongoCode: mongoErrCode(err) });
    t.json(500, { message: msg || 'Server error', error: 'LOOKUP_PHONE_FAILED' });
  }
};

/**
 * POST /auth/send-otp-mobile — send OTP without choosing caller/receiver first.
 */
export const sendOtpMobile = async (
  req: Request<{}, {}, MobilePhoneBody>,
  res: Response
): Promise<void> => {
  const t = beginApiTrace('POST /auth/send-otp-mobile', req, res);
  try {
    const phoneDigits = typeof req.body.phone === 'string' ? String(req.body.phone).trim() : '';
    if (!phoneDigits) {
      t.json(400, { message: 'phone is required', error: 'SEND_MOBILE_OTP_MISSING_PHONE' });
      return;
    }

    clearExpiredPendingReceiverSignups();
    clearExpiredPendingMobileSignups();

    const accountType = await resolvePhoneAccountType(phoneDigits);

    if (accountType === 'user') {
      const doc = await User.findOne({ phone: phoneDigits });
      if (!doc) {
        t.json(404, { message: 'User not found', error: 'SEND_MOBILE_OTP_USER_NOT_FOUND' });
        return;
      }
      await saveOtpOnDoc(doc, 'user');
      t.json(200, { message: 'OTP sent', sent: true, accountType: 'user', isNewUser: false });
      return;
    }

    if (accountType === 'receiver') {
      const doc = await Receiver.findOne({ phone: phoneDigits });
      if (!doc) {
        t.json(404, { message: 'Receiver not found', error: 'SEND_MOBILE_OTP_RECEIVER_NOT_FOUND' });
        return;
      }
      await saveOtpOnDoc(doc, 'receiver');
      t.json(200, { message: 'OTP sent', sent: true, accountType: 'receiver', isNewUser: false });
      return;
    }

    const otp = generateOtpCode();
    const otpExpiry = new Date(Date.now() + OTP_TTL_MS);
    pendingMobileSignups.set(phoneDigits, { phone: phoneDigits, otp, otpExpiry });
    console.log(`[OTP TEST] new-mobile:${phoneDigits} → OTP: ${otp}`);
    t.json(200, { message: 'OTP sent', sent: true, accountType: null, isNewUser: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    t.logFullError('send_otp_mobile_unhandled', err, { mongoCode: mongoErrCode(err) });
    t.json(500, { message: msg || 'Server error', error: 'SEND_MOBILE_OTP_FAILED' });
  }
};

/**
 * POST /auth/verify-otp-mobile — verify OTP; login existing user or require gender for new numbers.
 */
export const verifyOtpMobile = async (
  req: Request<{}, {}, VerifyMobileOtpBody>,
  res: Response
): Promise<void> => {
  const t = beginApiTrace('POST /auth/verify-otp-mobile', req, res);
  try {
    const otpBypass = process.env.OTP_BYPASS?.toLowerCase() === 'true';
    const phoneDigits = typeof req.body.phone === 'string' ? String(req.body.phone).trim() : '';
    const otp = req.body.otp;

    if (!phoneDigits || !otp) {
      t.json(400, { message: 'phone and otp are required', error: 'VERIFY_MOBILE_OTP_MISSING_FIELDS' });
      return;
    }

    clearExpiredPendingMobileSignups();
    clearExpiredVerifiedMobilePhones();

    const accountType = await resolvePhoneAccountType(phoneDigits);
    const trimmedOtp = String(otp).trim();
    const isBypassOtp = /^\d{6}$/.test(trimmedOtp);

    const finishLogin = async (
      doc: UserDocument | ReceiverDocument,
      typ: 'user' | 'receiver'
    ): Promise<void> => {
      if (typ === 'user' && (doc as UserDocument).suspended) {
        t.json(403, { message: PAUSED_MSG, error: 'VERIFY_OTP_ACCOUNT_SUSPENDED' });
        return;
      }
      if (typ === 'receiver' && (doc as ReceiverDocument).suspended) {
        t.json(403, { message: PAUSED_MSG, error: 'VERIFY_OTP_ACCOUNT_SUSPENDED' });
        return;
      }
      const sv =
        typ === 'user'
          ? await bumpUserAuthSession(String(doc._id))
          : await bumpReceiverAuthSession(String(doc._id));
      emitAuthSessionSuperseded(typ === 'user' ? 'u' : 'r', String(doc._id), sv);
      const token = signAppAccessToken(String(doc._id), typ === 'user' ? 'u' : 'r', sv);
      const userJson = typ === 'user' ? toApiUser(doc as UserDocument) : toApiReceiver(doc as ReceiverDocument);
      pendingMobileSignups.delete(phoneDigits);
      verifiedMobilePhones.delete(phoneDigits);
      t.json(200, {
        status: 'authenticated',
        message: otpBypass ? 'Login successful (OTP bypass)' : 'Login successful',
        token,
        user: userJson,
        accountType: typ,
      });
    };

    const verifyExistingDoc = async (
      doc: UserDocument | ReceiverDocument,
      typ: 'user' | 'receiver'
    ): Promise<void> => {
      if (otpBypass || isBypassOtp) {
        doc.isVerified = true;
        doc.otp = null;
        doc.otpExpiry = null;
        await doc.save();
        await finishLogin(doc, typ);
        return;
      }
      if (!doc.otp || !doc.otpExpiry) {
        t.json(400, {
          message: 'No OTP pending. Request a new code.',
          error: 'VERIFY_OTP_NO_CODE_PENDING',
        });
        return;
      }
      if (new Date() > doc.otpExpiry) {
        t.json(400, { message: 'OTP expired. Request a new code.', error: 'VERIFY_OTP_CODE_EXPIRED' });
        return;
      }
      if (trimmedOtp !== doc.otp) {
        t.json(400, { message: 'Invalid OTP', error: 'VERIFY_OTP_INVALID_CODE' });
        return;
      }
      doc.isVerified = true;
      doc.otp = null;
      doc.otpExpiry = null;
      await doc.save();
      await finishLogin(doc, typ);
    };

    if (accountType === 'user') {
      const doc = await User.findOne({ phone: phoneDigits });
      if (!doc) {
        t.json(404, { message: 'User not found', error: 'VERIFY_MOBILE_OTP_USER_NOT_FOUND' });
        return;
      }
      await verifyExistingDoc(doc, 'user');
      return;
    }

    if (accountType === 'receiver') {
      const doc = await Receiver.findOne({ phone: phoneDigits });
      if (!doc) {
        t.json(404, { message: 'Receiver not found', error: 'VERIFY_MOBILE_OTP_RECEIVER_NOT_FOUND' });
        return;
      }
      await verifyExistingDoc(doc, 'receiver');
      return;
    }

    const pending = pendingMobileSignups.get(phoneDigits);
    if (!pending) {
      t.json(404, {
        message: 'No OTP pending for this number. Request a new code.',
        error: 'VERIFY_MOBILE_OTP_NO_PENDING',
      });
      return;
    }

    if (new Date() > pending.otpExpiry && !otpBypass && !isBypassOtp) {
      pendingMobileSignups.delete(phoneDigits);
      t.json(400, { message: 'OTP expired. Request a new code.', error: 'VERIFY_OTP_CODE_EXPIRED' });
      return;
    }

    if (!otpBypass && !isBypassOtp && trimmedOtp !== pending.otp) {
      t.json(400, { message: 'Invalid OTP', error: 'VERIFY_OTP_INVALID_CODE' });
      return;
    }

    if (await phoneTaken(phoneDigits)) {
      pendingMobileSignups.delete(phoneDigits);
      t.json(409, {
        message: 'Mobile number already registered',
        error: 'REGISTER_PHONE_TAKEN',
      });
      return;
    }

    pendingMobileSignups.delete(phoneDigits);
    verifiedMobilePhones.set(phoneDigits, new Date(Date.now() + VERIFIED_MOBILE_TTL_MS));
    t.json(200, {
      status: 'needs_gender',
      message: 'OTP verified. Select gender to continue.',
      phone: phoneDigits,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    t.logFullError('verify_otp_mobile_unhandled', err, { mongoCode: mongoErrCode(err) });
    t.json(500, { message: msg || 'Server error', error: 'VERIFY_MOBILE_OTP_FAILED' });
  }
};

/**
 * POST /auth/complete-mobile-signup — after OTP + gender: male → users (caller), female → receivers.
 */
export const completeMobileSignup = async (
  req: Request<{}, {}, CompleteMobileSignupBody>,
  res: Response
): Promise<void> => {
  const t = beginApiTrace('POST /auth/complete-mobile-signup', req, res);
  try {
    const phoneDigits = typeof req.body.phone === 'string' ? String(req.body.phone).trim() : '';
    const gender = req.body.gender;

    if (!phoneDigits) {
      t.json(400, { message: 'phone is required', error: 'COMPLETE_MOBILE_SIGNUP_MISSING_PHONE' });
      return;
    }
    if (gender !== 'male' && gender !== 'female') {
      t.json(400, {
        message: 'gender must be male or female',
        error: 'COMPLETE_MOBILE_SIGNUP_INVALID_GENDER',
      });
      return;
    }

    clearExpiredVerifiedMobilePhones();
    const verifiedUntil = verifiedMobilePhones.get(phoneDigits);
    if (!verifiedUntil || new Date() > verifiedUntil) {
      t.json(400, {
        message: 'Verify OTP before completing signup.',
        error: 'COMPLETE_MOBILE_SIGNUP_NOT_VERIFIED',
      });
      return;
    }

    if (await phoneTaken(phoneDigits)) {
      verifiedMobilePhones.delete(phoneDigits);
      t.json(409, {
        message: 'Mobile number already registered',
        error: 'REGISTER_PHONE_TAKEN',
      });
      return;
    }

    const resolvedName = `Member ${phoneDigits.slice(-4)}`;

    if (gender === 'male') {
      const user = await User.create({
        name: resolvedName,
        phone: phoneDigits,
        gender: 'male',
        isVerified: true,
        passwordHash: null,
        accountStatus: 'pending_profile',
      });
      verifiedMobilePhones.delete(phoneDigits);
      const sv = await bumpUserAuthSession(String(user._id));
      emitAuthSessionSuperseded('u', String(user._id), sv);
      const token = signAppAccessToken(String(user._id), 'u', sv);
      t.json(201, {
        message: 'Account created',
        token,
        user: toApiUser(user),
        accountType: 'user',
      });
      return;
    }

    const receiver = await Receiver.create({
      name: resolvedName,
      phone: phoneDigits,
      gender: 'female',
      isVerified: true,
      passwordHash: null,
      audioCallRate: RECEIVER_AUDIO_CALL_RATE_INR_PER_MIN,
      accountStatus: 'pending_profile',
    });
    verifiedMobilePhones.delete(phoneDigits);
    const sv = await bumpReceiverAuthSession(String(receiver._id));
    emitAuthSessionSuperseded('r', String(receiver._id), sv);
    const token = signAppAccessToken(String(receiver._id), 'r', sv);
    t.json(201, {
      message: 'Account created',
      token,
      user: toApiReceiver(receiver),
      accountType: 'receiver',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    t.logFullError('complete_mobile_signup_unhandled', err, { mongoCode: mongoErrCode(err) });
    t.json(500, { message: msg || 'Server error', error: 'COMPLETE_MOBILE_SIGNUP_FAILED' });
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