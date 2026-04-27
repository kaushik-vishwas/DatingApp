import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Response, Request } from 'express';
import User, { type UserDocument } from '../models/User';
import Receiver, { type ReceiverDocument } from '../models/Receiver';
import { sendOtpEmail } from '../config/email';
import {
  calculateAgeFromBirthDateUtc,
  dateOnlyIsoFromUtcDate,
  parseDateOnlyToUtcMidnight,
  validateBirthDateForAccount,
} from '../utils/birthDate';
import { PAUSED_MSG } from '../utils/accountAccess';

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes

export type AccountTypeParam = 'user' | 'receiver';

type JwtPayload = { id: string; typ: 'u' | 'r' };

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
    audioCallRate:
      typeof r.audioCallRate === 'number' && Number.isFinite(r.audioCallRate) ? r.audioCallRate : null,
    userAudio: null,
    isAvailable: Boolean(r.isAvailable),
    isOnline: Boolean(r.isOnline),
  };
}

/** Prefer toApiUser / toApiReceiver — resolves by Mongoose modelName */
export function toSafeUser(doc: UserDocument | ReceiverDocument): SafeUser {
  const modelName = (doc as { constructor?: { modelName?: string } }).constructor?.modelName;
  if (modelName === 'User') return toApiUser(doc as UserDocument);
  return toApiReceiver(doc as ReceiverDocument);
}

const signToken = (userId: string, typ: 'u' | 'r'): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not set in environment');
  }
  return jwt.sign({ id: userId, typ } satisfies JwtPayload, secret, { expiresIn: '7d' });
};

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
  try {
    const { name, email, phone, password, role, dateOfBirth } = req.body;

    if (!name || !email || !phone || !password) {
      res.status(400).json({ message: 'name, email, phone, and password are required' });
      return;
    }

    const birth = resolveRegisterBirthDate(dateOfBirth);
    if (!birth.ok) {
      res.status(400).json({ message: birth.message });
      return;
    }
    const { dob, age } = birth;

    const normalizedEmail = String(email).toLowerCase().trim();
    const plain = String(password);
    if (plain.length < 8) {
      res.status(400).json({ message: 'Password must be at least 8 characters' });
      return;
    }

    if (await emailTaken(normalizedEmail)) {
      res.status(409).json({ message: 'Email already registered' });
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
      res.status(201).json({
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
    });
    res.status(201).json({
      message: 'User registered successfully',
      user: toApiReceiver(receiver),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('register error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

/**
 * POST /auth/login — body.accountType: `user` | `receiver`
 */
export const login = async (req: Request<{}, {}, LoginBody>, res: Response): Promise<void> => {
  try {
    const { email, password, accountType } = req.body;
    if (!email || !password) {
      res.status(400).json({ message: 'email and password are required' });
      return;
    }
    if (accountType !== 'user' && accountType !== 'receiver') {
      res.status(400).json({ message: 'accountType must be user or receiver' });
      return;
    }

    const normalizedEmail = String(email).toLowerCase().trim();

    if (accountType === 'user') {
      const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash');
      if (!user || !user.passwordHash) {
        res.status(401).json({ message: 'Invalid email or password' });
        return;
      }
      const match = await bcrypt.compare(String(password), user.passwordHash);
      if (!match) {
        res.status(401).json({ message: 'Invalid email or password' });
        return;
      }
      const token = signToken(String(user._id), 'u');
      res.json({ message: 'Login successful', token, user: toApiUser(user) });
      return;
    }

    const receiver = await Receiver.findOne({ email: normalizedEmail }).select('+passwordHash');
    if (!receiver || !receiver.passwordHash) {
      res.status(401).json({ message: 'Invalid email or password' });
      return;
    }
    const match = await bcrypt.compare(String(password), receiver.passwordHash);
    if (!match) {
      res.status(401).json({ message: 'Invalid email or password' });
      return;
    }
    if (receiver.suspended) {
      res.status(403).json({ message: PAUSED_MSG });
      return;
    }
    const token = signToken(String(receiver._id), 'r');
    res.json({ message: 'Login successful', token, user: toApiReceiver(receiver) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('login error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

export const sendOtp = async (
  req: Request<{}, {}, SendOtpBody>,
  res: Response
): Promise<void> => {
  try {
    const otpBypass = process.env.OTP_BYPASS?.toLowerCase() === 'true';
    const { email, accountType } = req.body;
    if (!email) {
      res.status(400).json({ message: 'email is required' });
      return;
    }
    if (accountType !== 'user' && accountType !== 'receiver') {
      res.status(400).json({ message: 'accountType must be user or receiver' });
      return;
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const doc =
      accountType === 'user'
        ? await User.findOne({ email: normalizedEmail })
        : await Receiver.findOne({ email: normalizedEmail });

    if (!doc) {
      res.status(404).json({ message: 'No account for this email. Please register first.' });
      return;
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const otpExpiry = new Date(Date.now() + OTP_TTL_MS);

    doc.otp = otp;
    doc.otpExpiry = otpExpiry;
    await doc.save();

    console.log(`[OTP TEST] ${doc.email} → OTP: ${otp} (expires ${otpExpiry.toISOString()})`);

    if (otpBypass) {
      res.status(200).json({
        message: 'OTP bypass enabled (email not required)',
        emailSent: false,
      });
      return;
    }

    let emailSent = true;
    try {
      await sendOtpEmail(doc.email, otp, 'verification');
    } catch (mailErr) {
      emailSent = false;
      const msg = mailErr instanceof Error ? mailErr.message : String(mailErr);
      console.error('sendOtp email error:', msg);
      if (mailErr && typeof mailErr === 'object' && 'response' in mailErr) {
        console.error('sendOtp SMTP response:', String((mailErr as { response?: unknown }).response));
      }
    }

    if (!emailSent) {
      res.status(200).json({
        message:
          'OTP saved. Email delivery failed — use the code printed in the server console or fix EMAIL_USER / EMAIL_PASS.',
        emailSent: false,
      });
      return;
    }

    res.json({ message: 'OTP sent to your email', emailSent: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('sendOtp error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

export const forgotPassword = async (
  req: Request<{}, {}, SendOtpBody>,
  res: Response
): Promise<void> => {
  const genericMessage = 'If an account exists with this email, a reset code has been sent.';
  try {
    const otpBypass = process.env.OTP_BYPASS?.toLowerCase() === 'true';
    const { email, accountType } = req.body;
    if (!email) {
      res.status(400).json({ message: 'email is required' });
      return;
    }
    if (accountType !== 'user' && accountType !== 'receiver') {
      res.status(400).json({ message: 'accountType must be user or receiver' });
      return;
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const doc =
      accountType === 'user'
        ? await User.findOne({ email: normalizedEmail })
        : await Receiver.findOne({ email: normalizedEmail });

    if (!doc) {
      res.json({ message: genericMessage, emailSent: false });
      return;
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const otpExpiry = new Date(Date.now() + OTP_TTL_MS);

    doc.otp = otp;
    doc.otpExpiry = otpExpiry;
    await doc.save();

    console.log(`[PASSWORD RESET OTP] ${doc.email} → OTP: ${otp} (expires ${otpExpiry.toISOString()})`);

    if (otpBypass) {
      res.json({ message: genericMessage, emailSent: false });
      return;
    }

    let emailSent = true;
    try {
      await sendOtpEmail(doc.email, otp, 'password_reset');
    } catch (mailErr) {
      emailSent = false;
      const msg = mailErr instanceof Error ? mailErr.message : String(mailErr);
      console.error('forgotPassword email error:', msg);
      if (mailErr && typeof mailErr === 'object' && 'response' in mailErr) {
        console.error('forgotPassword SMTP response:', String((mailErr as { response?: unknown }).response));
      }
    }

    res.json({
      message: emailSent
        ? genericMessage
        : 'Code could not be emailed. Check server logs and EMAIL_USER / EMAIL_PASS, or use the code printed in the server console.',
      emailSent,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('forgotPassword error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

export const resetPassword = async (
  req: Request<{}, {}, ResetPasswordBody>,
  res: Response
): Promise<void> => {
  try {
    const otpBypass = process.env.OTP_BYPASS?.toLowerCase() === 'true';
    const { email, otp, newPassword, accountType } = req.body;
    if (!email || !otp || !newPassword) {
      res.status(400).json({ message: 'email, otp, and newPassword are required' });
      return;
    }
    if (accountType !== 'user' && accountType !== 'receiver') {
      res.status(400).json({ message: 'accountType must be user or receiver' });
      return;
    }

    const plain = String(newPassword);
    if (plain.length < 8) {
      res.status(400).json({ message: 'Password must be at least 8 characters' });
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
      const token = signToken(String(doc._id), typ);
      const userJson =
        accountType === 'user' ? toApiUser(doc as UserDocument) : toApiReceiver(doc as ReceiverDocument);
      return { token, userJson };
    };

    if (accountType === 'user') {
      const doc = await User.findOne({ email: normalizedEmail }).select('+passwordHash');
      if (!doc) {
        res.status(400).json({ message: 'Invalid or expired code' });
        return;
      }

      if (otpBypass) {
        const { token, userJson } = await finishReset(doc);
        res.json({ message: 'Password updated', token, user: userJson });
        return;
      }

      if (!doc.otp || !doc.otpExpiry) {
        res.status(400).json({ message: 'No reset code pending. Request a new code.' });
        return;
      }

      if (new Date() > doc.otpExpiry) {
        res.status(400).json({ message: 'Code expired. Request a new code.' });
        return;
      }

      if (String(otp).trim() !== doc.otp) {
        res.status(400).json({ message: 'Invalid code' });
        return;
      }

      const { token, userJson } = await finishReset(doc);
      res.json({ message: 'Password updated', token, user: userJson });
      return;
    }

    const doc = await Receiver.findOne({ email: normalizedEmail }).select('+passwordHash');
    if (!doc) {
      res.status(400).json({ message: 'Invalid or expired code' });
      return;
    }

    if (otpBypass) {
      const { token, userJson } = await finishReset(doc);
      res.json({ message: 'Password updated', token, user: userJson });
      return;
    }

    if (!doc.otp || !doc.otpExpiry) {
      res.status(400).json({ message: 'No reset code pending. Request a new code.' });
      return;
    }

    if (new Date() > doc.otpExpiry) {
      res.status(400).json({ message: 'Code expired. Request a new code.' });
      return;
    }

    if (String(otp).trim() !== doc.otp) {
      res.status(400).json({ message: 'Invalid code' });
      return;
    }

    const { token, userJson } = await finishReset(doc);
    res.json({
      message: 'Password updated',
      token,
      user: userJson,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('resetPassword error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

export const verifyOtp = async (
  req: Request<{}, {}, VerifyOtpBody>,
  res: Response
): Promise<void> => {
  try {
    const otpBypass = process.env.OTP_BYPASS?.toLowerCase() === 'true';
    const { email, otp, accountType } = req.body;
    if (!email || !otp) {
      res.status(400).json({ message: 'email and otp are required' });
      return;
    }
    if (accountType !== 'user' && accountType !== 'receiver') {
      res.status(400).json({ message: 'accountType must be user or receiver' });
      return;
    }

    const normalizedEmail = String(email).toLowerCase().trim();

    const respondVerified = (doc: UserDocument | ReceiverDocument): void => {
      const typ = accountType === 'user' ? 'u' : 'r';
      const token = signToken(String(doc._id), typ);
      const userJson =
        accountType === 'user' ? toApiUser(doc as UserDocument) : toApiReceiver(doc as ReceiverDocument);
      res.json({
        message: otpBypass ? 'Login successful (OTP bypass)' : 'Login successful',
        token,
        user: userJson,
      });
    };

    const verifyDoc = async (doc: UserDocument | ReceiverDocument): Promise<void> => {
      if (accountType === 'user' && (doc as UserDocument).suspended) {
        res.status(403).json({ message: PAUSED_MSG });
        return;
      }
      if (accountType === 'receiver' && (doc as ReceiverDocument).suspended) {
        res.status(403).json({ message: PAUSED_MSG });
        return;
      }
      if (otpBypass) {
        doc.isVerified = true;
        doc.otp = null;
        doc.otpExpiry = null;
        await doc.save();
        respondVerified(doc);
        return;
      }

      if (!doc.otp || !doc.otpExpiry) {
        res.status(400).json({ message: 'No OTP pending. Request a new code.' });
        return;
      }

      if (new Date() > doc.otpExpiry) {
        res.status(400).json({ message: 'OTP expired. Request a new code.' });
        return;
      }

      if (String(otp).trim() !== doc.otp) {
        res.status(400).json({ message: 'Invalid OTP' });
        return;
      }

      doc.isVerified = true;
      doc.otp = null;
      doc.otpExpiry = null;
      await doc.save();
      respondVerified(doc);
    };

    if (accountType === 'user') {
      const doc = await User.findOne({ email: normalizedEmail });
      if (!doc) {
        res.status(404).json({ message: 'User not found' });
        return;
      }
      await verifyDoc(doc);
      return;
    }

    const doc = await Receiver.findOne({ email: normalizedEmail });
    if (!doc) {
      res.status(404).json({ message: 'User not found' });
      return;
    }
    await verifyDoc(doc);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('verifyOtp error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

export const getMe = async (req: Request, res: Response): Promise<void> => {
  try {
    const kind = req.accountKind;
    if (!kind) {
      res.status(401).json({ message: 'Not authorized' });
      return;
    }
    if (kind === 'user') {
      const user = req.user as UserDocument | undefined;
      if (!user) {
        res.status(401).json({ message: 'Not authorized' });
        return;
      }
      res.json({ user: toApiUser(user) });
      return;
    }
    const receiver = req.receiver as ReceiverDocument | undefined;
    if (!receiver) {
      res.status(401).json({ message: 'Not authorized' });
      return;
    }
    res.json({ user: toApiReceiver(receiver) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('getMe error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};
