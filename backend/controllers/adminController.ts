import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import Admin from '../models/Admin';
import Receiver, { type ReceiverDocument } from '../models/Receiver';
import User, { type UserDocument } from '../models/User';
import UserReport, { type ReportResolution } from '../models/UserReport';
import WithdrawalRequest from '../models/WithdrawalRequest';
import { toApiReceiver, toApiUser } from './authController';
import { sendOtpEmail } from '../config/email';
import { getConfiguredAdminEmail } from '../services/superAdminSync';

type AdminJwtPayload = { adminId: string; typ: 'admin' };
const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes

const signAdminToken = (adminId: string): string => {
  const secret = process.env.ADMIN_JWT_SECRET;
  if (!secret) {
    throw new Error('ADMIN_JWT_SECRET is not set');
  }
  const payload: AdminJwtPayload = { adminId, typ: 'admin' };
  return jwt.sign(payload, secret, { expiresIn: '7d' });
};

/**
 * POST /admin/auth/login — password only; admin identity comes from ADMIN_EMAIL in the backend .env.
 */
export const adminLogin = async (
  req: Request<{}, {}, { email?: string; password?: string }>,
  res: Response
): Promise<void> => {
  try {
    const configuredEmail = getConfiguredAdminEmail();
    if (!configuredEmail) {
      res.status(503).json({ message: 'Admin is not configured: set ADMIN_EMAIL in the backend .env' });
      return;
    }

    const bodyEmail = String(req.body.email ?? '').toLowerCase().trim();
    if (bodyEmail && bodyEmail !== configuredEmail) {
      res.status(401).json({ message: 'Invalid password' });
      return;
    }

    const password = String(req.body.password ?? '');
    if (!password) {
      res.status(400).json({ message: 'password is required' });
      return;
    }

    const admin = await Admin.findOne({ email: configuredEmail });
    if (!admin) {
      res.status(401).json({ message: 'Invalid password' });
      return;
    }

    const ok = await bcrypt.compare(password, admin.passwordHash);
    if (!ok) {
      res.status(401).json({ message: 'Invalid password' });
      return;
    }

    const token = signAdminToken(String(admin._id));

    res.status(200).json({
      token,
      admin: {
        _id: String(admin._id),
        email: admin.email,
        name: admin.name,
        role: admin.role,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('adminLogin error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

/**
 * GET /admin/auth/me
 */
export const adminMe = async (req: Request, res: Response): Promise<void> => {
  try {
    const admin = req.admin;
    if (!admin) {
      res.status(401).json({ message: 'Not authorized' });
      return;
    }
    res.status(200).json({
      admin: {
        _id: String(admin._id),
        email: admin.email,
        name: admin.name,
        role: admin.role,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

/**
 * POST /admin/auth/forgot-password
 */
export const adminForgotPassword = async (
  req: Request<{}, {}, { email?: string }>,
  res: Response
): Promise<void> => {
  const genericMessage = 'If the admin account is configured, a reset code has been sent to the admin email.';
  try {
    const otpBypass = process.env.OTP_BYPASS?.toLowerCase() === 'true';
    const configuredEmail = getConfiguredAdminEmail();
    if (!configuredEmail) {
      res.status(503).json({ message: 'Admin is not configured: set ADMIN_EMAIL in the backend .env' });
      return;
    }

    const bodyEmail = String(req.body.email ?? '').toLowerCase().trim();
    if (bodyEmail && bodyEmail !== configuredEmail) {
      res.status(200).json({ message: genericMessage, emailSent: false });
      return;
    }

    const admin = await Admin.findOne({ email: configuredEmail }).select('+passwordHash');
    if (!admin) {
      res.status(200).json({ message: genericMessage, emailSent: false });
      return;
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const otpExpiry = new Date(Date.now() + OTP_TTL_MS);
    admin.otp = otp;
    admin.otpExpiry = otpExpiry;
    admin.pendingEmail = null;
    await admin.save();

    console.log(`[ADMIN PASSWORD RESET OTP] ${admin.email} → OTP: ${otp} (expires ${otpExpiry.toISOString()})`);

    if (otpBypass) {
      res.status(200).json({ message: genericMessage, emailSent: false });
      return;
    }

    let emailSent = true;
    try {
      await sendOtpEmail(admin.email, otp, 'password_reset');
    } catch (mailErr) {
      emailSent = false;
      const msg = mailErr instanceof Error ? mailErr.message : String(mailErr);
      console.error('adminForgotPassword email error:', msg);
      if (mailErr && typeof mailErr === 'object' && 'response' in mailErr) {
        console.error(
          'adminForgotPassword SMTP response:',
          String((mailErr as { response?: unknown }).response)
        );
      }
    }

    res.status(200).json({
      message: emailSent
        ? genericMessage
        : 'Code could not be emailed. Check server logs and EMAIL_USER / EMAIL_PASS, or use the code printed in the server console.',
      emailSent,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('adminForgotPassword error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

/**
 * POST /admin/auth/reset-password
 */
export const adminResetPassword = async (
  req: Request<{}, {}, { email?: string; otp?: string; newPassword?: string; confirmPassword?: string }>,
  res: Response
): Promise<void> => {
  try {
    const otpBypass = process.env.OTP_BYPASS?.toLowerCase() === 'true';
    const configuredEmail = getConfiguredAdminEmail();
    if (!configuredEmail) {
      res.status(503).json({ message: 'Admin is not configured: set ADMIN_EMAIL in the backend .env' });
      return;
    }

    const otp = String(req.body.otp ?? '').trim();
    const newPassword = String(req.body.newPassword ?? '');
    const confirmPassword = String(req.body.confirmPassword ?? '');

    if (!otp || !newPassword || !confirmPassword) {
      res.status(400).json({ message: 'otp, newPassword, and confirmPassword are required' });
      return;
    }
    if (newPassword !== confirmPassword) {
      res.status(400).json({ message: 'Passwords do not match' });
      return;
    }
    if (newPassword.length < 8) {
      res.status(400).json({ message: 'Password must be at least 8 characters' });
      return;
    }

    const admin = await Admin.findOne({ email: configuredEmail }).select('+passwordHash');
    if (!admin) {
      res.status(400).json({ message: 'Invalid or expired code' });
      return;
    }

    if (!otpBypass) {
      if (!admin.otp || !admin.otpExpiry) {
        res.status(400).json({ message: 'No reset code pending. Request a new code.' });
        return;
      }
      if (new Date() > admin.otpExpiry) {
        res.status(400).json({ message: 'Code expired. Request a new code.' });
        return;
      }
      if (otp !== admin.otp) {
        res.status(400).json({ message: 'Invalid code' });
        return;
      }
    }

    admin.passwordHash = await bcrypt.hash(newPassword, 10);
    admin.otp = null;
    admin.otpExpiry = null;
    admin.pendingEmail = null;
    await admin.save();

    const token = signAdminToken(String(admin._id));
    res.status(200).json({
      message: 'Password updated successfully',
      token,
      admin: {
        _id: String(admin._id),
        email: admin.email,
        name: admin.name,
        role: admin.role,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('adminResetPassword error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

/**
 * POST /admin/auth/request-email-change (protected)
 */
export const adminRequestEmailChange = async (
  req: Request<{}, {}, { newEmail?: string }>,
  res: Response
): Promise<void> => {
  try {
    if (getConfiguredAdminEmail()) {
      res.status(403).json({
        message:
          'Admin email is set in ADMIN_EMAIL in the backend .env. Change it there and restart the server.',
      });
      return;
    }
    const otpBypass = process.env.OTP_BYPASS?.toLowerCase() === 'true';
    const admin = req.admin;
    if (!admin) {
      res.status(401).json({ message: 'Not authorized' });
      return;
    }

    const newEmail = String(req.body.newEmail ?? '').toLowerCase().trim();
    if (!newEmail) {
      res.status(400).json({ message: 'newEmail is required' });
      return;
    }
    if (newEmail === admin.email) {
      res.status(400).json({ message: 'New email must be different from current email' });
      return;
    }

    const existingAdmin = await Admin.findOne({ email: newEmail });
    if (existingAdmin) {
      res.status(409).json({ message: 'Email is already in use' });
      return;
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const otpExpiry = new Date(Date.now() + OTP_TTL_MS);
    admin.pendingEmail = newEmail;
    admin.otp = otp;
    admin.otpExpiry = otpExpiry;
    await admin.save();

    console.log(
      `[ADMIN EMAIL CHANGE OTP] current=${admin.email} pending=${newEmail} otp=${otp} expires=${otpExpiry.toISOString()}`
    );

    if (otpBypass) {
      res.status(200).json({
        message: 'OTP bypass enabled. Use confirm endpoint with any code to complete change.',
        emailSent: false,
      });
      return;
    }

    let emailSent = true;
    try {
      // Security requirement: OTP is sent to existing/old email.
      await sendOtpEmail(admin.email, otp, 'verification');
    } catch (mailErr) {
      emailSent = false;
      const msg = mailErr instanceof Error ? mailErr.message : String(mailErr);
      console.error('adminRequestEmailChange email error:', msg);
      if (mailErr && typeof mailErr === 'object' && 'response' in mailErr) {
        console.error(
          'adminRequestEmailChange SMTP response:',
          String((mailErr as { response?: unknown }).response)
        );
      }
    }

    res.status(200).json({
      message: emailSent
        ? `OTP sent to your current email (${admin.email})`
        : 'OTP saved but email delivery failed. Check server logs or EMAIL_USER / EMAIL_PASS.',
      emailSent,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('adminRequestEmailChange error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

/**
 * POST /admin/auth/confirm-email-change (protected)
 */
export const adminConfirmEmailChange = async (
  req: Request<{}, {}, { otp?: string }>,
  res: Response
): Promise<void> => {
  try {
    if (getConfiguredAdminEmail()) {
      res.status(403).json({
        message:
          'Admin email is set in ADMIN_EMAIL in the backend .env. Change it there and restart the server.',
      });
      return;
    }
    const otpBypass = process.env.OTP_BYPASS?.toLowerCase() === 'true';
    const admin = req.admin;
    if (!admin) {
      res.status(401).json({ message: 'Not authorized' });
      return;
    }

    const otp = String(req.body.otp ?? '').trim();
    if (!otp) {
      res.status(400).json({ message: 'otp is required' });
      return;
    }
    if (!admin.pendingEmail) {
      res.status(400).json({ message: 'No email change request pending' });
      return;
    }

    if (!otpBypass) {
      if (!admin.otp || !admin.otpExpiry) {
        res.status(400).json({ message: 'No OTP pending. Request a new code.' });
        return;
      }
      if (new Date() > admin.otpExpiry) {
        res.status(400).json({ message: 'OTP expired. Request a new code.' });
        return;
      }
      if (otp !== admin.otp) {
        res.status(400).json({ message: 'Invalid OTP' });
        return;
      }
    }

    const pendingEmail = admin.pendingEmail.toLowerCase().trim();
    const existingAdmin = await Admin.findOne({ email: pendingEmail });
    if (existingAdmin && String(existingAdmin._id) !== String(admin._id)) {
      res.status(409).json({ message: 'Email is already in use' });
      return;
    }

    admin.email = pendingEmail;
    admin.pendingEmail = null;
    admin.otp = null;
    admin.otpExpiry = null;
    await admin.save();

    res.status(200).json({
      message: 'Email updated successfully',
      admin: {
        _id: String(admin._id),
        email: admin.email,
        name: admin.name,
        role: admin.role,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('adminConfirmEmailChange error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * GET /admin/users — app users (`users` collection) with filters and pagination.
 * Query: status=all|active|suspended, q=search, range=7d|30d|all, page, limit
 */
export const listAppUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const status = String(req.query.status ?? 'all').toLowerCase();
    const q = String(req.query.q ?? '').trim();
    const range = String(req.query.range ?? '7d').toLowerCase();
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10) || 20));

    if (status !== 'all' && status !== 'active' && status !== 'suspended') {
      res.status(400).json({ message: 'status must be all, active, or suspended' });
      return;
    }
    if (range !== '7d' && range !== '30d' && range !== 'all') {
      res.status(400).json({ message: 'range must be 7d, 30d, or all' });
      return;
    }

    const common: Record<string, unknown> = {};
    if (q) {
      const rx = new RegExp(escapeRegex(q), 'i');
      common.$or = [{ name: rx }, { email: rx }, { phone: rx }];
    }
    if (range === '7d' || range === '30d') {
      const days = range === '7d' ? 7 : 30;
      common.createdAt = { $gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) };
    }

    const listFilter: Record<string, unknown> = { ...common };
    if (status === 'active') listFilter.suspended = { $ne: true };
    else if (status === 'suspended') listFilter.suspended = true;

    const activeCountFilter = { ...common, suspended: { $ne: true } as const };
    const suspendedCountFilter = { ...common, suspended: true };

    const [total, tabAll, tabActive, tabSuspended, users] = await Promise.all([
      User.countDocuments(listFilter),
      User.countDocuments(common),
      User.countDocuments(activeCountFilter),
      User.countDocuments(suspendedCountFilter),
      User.find(listFilter)
        .select('-otp -otpExpiry -passwordHash')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
    ]);

    res.status(200).json({
      users: users.map((u) => toApiUser(u as UserDocument)),
      total,
      page,
      limit,
      tabCounts: { all: tabAll, active: tabActive, suspended: tabSuspended },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('listAppUsers error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

/**
 * PATCH /admin/users/:id — body: { suspended: boolean }
 */
export const updateAppUser = async (
  req: Request<{ id: string }, {}, { suspended?: boolean }>,
  res: Response
): Promise<void> => {
  try {
    const { suspended } = req.body;
    if (typeof suspended !== 'boolean') {
      res.status(400).json({ message: 'suspended (boolean) is required' });
      return;
    }
    const user = await User.findById(req.params.id);
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }
    user.suspended = suspended;
    await user.save();
    res.status(200).json({ user: toApiUser(user) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('updateAppUser error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

/**
 * GET /admin/receivers — all rows in `receivers` collection.
 */
export const listAllReceivers = async (_req: Request, res: Response): Promise<void> => {
  try {
    const receivers = await Receiver.find({})
      .select('-otp -otpExpiry')
      .sort({ createdAt: 1 });

    const list = receivers.map((r) => toApiReceiver(r as ReceiverDocument));

    res.status(200).json({ receivers: list });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('listAllReceivers error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

/**
 * GET /admin/kyc/stats — counts for KYC dashboard cards (today = UTC midnight local server).
 */
export const getKycStats = async (_req: Request, res: Response): Promise<void> => {
  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const callerAwaitingAccess = {
      $or: [
        { suspended: true, accountStatus: 'approved' },
        { accountStatus: 'pending_review' },
        { accountStatus: 'rejected', suspended: false },
      ],
    };

    const [pendingApprovals, pendingCallerApprovals, approvedToday, rejectedToday] = await Promise.all([
      Receiver.countDocuments({ accountStatus: 'pending_review' }),
      User.countDocuments(callerAwaitingAccess),
      Receiver.countDocuments({
        accountStatus: 'approved',
        updatedAt: { $gte: start },
      }),
      Receiver.countDocuments({
        accountStatus: 'rejected',
        updatedAt: { $gte: start },
      }),
    ]);

    res.status(200).json({
      pendingApprovals,
      pendingCallerApprovals,
      approvedToday,
      rejectedToday,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('getKycStats error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

/**
 * GET /admin/receivers/pending
 */
export const listPendingReceivers = async (_req: Request, res: Response): Promise<void> => {
  try {
    const receivers = await Receiver.find({
      accountStatus: 'pending_review',
    })
      .select('-otp -otpExpiry')
      .sort({ updatedAt: -1 });

    const list = receivers.map((r) => toApiReceiver(r as ReceiverDocument));

    res.status(200).json({ receivers: list });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('listPendingReceivers error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

/**
 * PATCH /admin/receivers/:id/approve
 */
export const approveReceiver = async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    const receiver = await Receiver.findById(id);
    if (!receiver) {
      res.status(404).json({ message: 'Receiver not found' });
      return;
    }
    if (receiver.accountStatus !== 'pending_review') {
      res.status(400).json({ message: 'Receiver is not pending review' });
      return;
    }

    receiver.accountStatus = 'approved';
    await receiver.save();

    res.status(200).json({
      message: 'Receiver approved',
      receiver: toApiReceiver(receiver),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('approveReceiver error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

/**
 * PATCH /admin/receivers/:id/reject
 */
export const rejectReceiver = async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    const receiver = await Receiver.findById(id);
    if (!receiver) {
      res.status(404).json({ message: 'Receiver not found' });
      return;
    }
    if (receiver.accountStatus !== 'pending_review') {
      res.status(400).json({ message: 'Receiver is not pending review' });
      return;
    }

    receiver.accountStatus = 'rejected';
    await receiver.save();

    res.status(200).json({
      message: 'Receiver rejected',
      receiver: toApiReceiver(receiver),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('rejectReceiver error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

/**
 * GET /admin/users/pending — app users (callers) awaiting approval after voice + profile submit.
 */
export const listPendingAppUsers = async (_req: Request, res: Response): Promise<void> => {
  try {
    const users = await User.find({
      $or: [
        { suspended: true, accountStatus: 'approved' },
        { accountStatus: 'pending_review' },
        { accountStatus: 'rejected', suspended: false },
      ],
    })
      .select('-otp -otpExpiry -passwordHash')
      .sort({ updatedAt: -1 });

    res.status(200).json({ users: users.map((u) => toApiUser(u as UserDocument)) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('listPendingAppUsers error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

/**
 * PATCH /admin/users/:id/approve — clears caller suspension (access on). Legacy: pending_review/rejected + voice.
 */
export const approveAppUser = async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    const user = await User.findById(id);
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }
    if (user.accountStatus === 'pending_profile') {
      res.status(400).json({ message: 'User has not finished onboarding yet' });
      return;
    }

    const legacyNeedVoice =
      user.accountStatus === 'pending_review' || user.accountStatus === 'rejected';
    const voice = String(user.userAudio ?? '').trim();
    if (legacyNeedVoice && !voice) {
      res.status(400).json({ message: 'Cannot approve: no voice verification audio on file' });
      return;
    }

    const needsRelease =
      user.suspended ||
      user.accountStatus === 'pending_review' ||
      user.accountStatus === 'rejected';
    if (!needsRelease) {
      res.status(400).json({ message: 'User access is already active' });
      return;
    }

    user.suspended = false;
    user.accountStatus = 'approved';
    await user.save();

    res.status(200).json({
      message: 'Access enabled',
      user: toApiUser(user),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('approveAppUser error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

/**
 * PATCH /admin/users/:id/reject — pauses caller access (`suspended: true`); does not use `rejected` status.
 */
export const rejectAppUser = async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    const user = await User.findById(id);
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }
    if (user.accountStatus === 'pending_profile') {
      res.status(400).json({ message: 'User has not finished onboarding yet' });
      return;
    }
    if (user.suspended) {
      res.status(400).json({ message: 'User access is already paused' });
      return;
    }

    user.suspended = true;
    user.accountStatus = 'approved';
    await user.save();

    res.status(200).json({
      message: 'Access paused',
      user: toApiUser(user),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('rejectAppUser error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

type ReportRowLean = {
  _id: mongoose.Types.ObjectId;
  reporterKind: 'user' | 'receiver';
  reporterId: mongoose.Types.ObjectId;
  reportedKind: 'user' | 'receiver';
  reportedId: mongoose.Types.ObjectId;
  reason: string;
  preview: string;
  status: string;
  resolution: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * GET /admin/reports — moderation queue + summary cards.
 */
export const listModerationReports = async (req: Request, res: Response): Promise<void> => {
  try {
    const q = String(req.query.q ?? '').trim();
    const status = String(req.query.status ?? 'all').toLowerCase();
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '50'), 10) || 50));

    const filter: Record<string, unknown> = {};
    if (status === 'pending') filter.status = 'pending';
    else if (status === 'resolved') filter.status = 'resolved';

    if (q) {
      const rx = new RegExp(escapeRegex(q), 'i');
      filter.$or = [{ preview: rx }, { reason: rx }];
    }

    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const [pendingCount, resolvedToday, warnedActions, suspendActions, total, rows] =
      await Promise.all([
        UserReport.countDocuments({ status: 'pending' }),
        UserReport.countDocuments({ status: 'resolved', updatedAt: { $gte: start } }),
        UserReport.countDocuments({ resolution: 'warned' }),
        UserReport.countDocuments({ resolution: 'suspended' }),
        UserReport.countDocuments(filter),
        UserReport.find(filter)
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
      ]);

    const userIds = new Set<string>();
    const recvIds = new Set<string>();
    for (const r of rows as ReportRowLean[]) {
      if (r.reporterKind === 'user') userIds.add(String(r.reporterId));
      else recvIds.add(String(r.reporterId));
      if (r.reportedKind === 'user') userIds.add(String(r.reportedId));
      else recvIds.add(String(r.reportedId));
    }

    const [users, receivers] = await Promise.all([
      userIds.size
        ? User.find({ _id: { $in: [...userIds] } })
            .select('name')
            .lean()
        : [],
      recvIds.size
        ? Receiver.find({ _id: { $in: [...recvIds] } })
            .select('name')
            .lean()
        : [],
    ]);

    const uMap = new Map(users.map((u) => [String(u._id), String(u.name ?? '')]));
    const rMap = new Map(receivers.map((r) => [String(r._id), String(r.name ?? '')]));

    const nameFor = (kind: 'user' | 'receiver', id: mongoose.Types.ObjectId): string => {
      const s = String(id);
      if (kind === 'user') return uMap.get(s) || 'Unknown';
      return rMap.get(s) || 'Unknown';
    };

    res.status(200).json({
      stats: {
        pendingReports: pendingCount,
        resolvedToday,
        usersWarned: warnedActions,
        usersSuspended: suspendActions,
      },
      reports: (rows as ReportRowLean[]).map((r) => ({
        _id: String(r._id),
        reportId: `R-${String(r._id).slice(-6).toUpperCase()}`,
        reporterName: nameFor(r.reporterKind, r.reporterId),
        reportedName: nameFor(r.reportedKind, r.reportedId),
        reason: r.reason,
        preview: r.preview?.trim() ? r.preview : '—',
        createdAt: r.createdAt.toISOString(),
        status: r.status,
        resolution: r.resolution,
      })),
      total,
      page,
      limit,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('listModerationReports error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

/**
 * PATCH /admin/reports/:id — body `{ action: 'ignore' | 'warn' | 'suspend' }`
 */
export const resolveModerationReport = async (
  req: Request<{ id: string }, {}, { action?: string }>,
  res: Response
): Promise<void> => {
  try {
    const action = String(req.body.action ?? '').toLowerCase();
    if (action !== 'ignore' && action !== 'warn' && action !== 'suspend') {
      res.status(400).json({ message: 'action must be ignore, warn, or suspend' });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      res.status(400).json({ message: 'Invalid report id' });
      return;
    }

    const report = await UserReport.findById(req.params.id);
    if (!report) {
      res.status(404).json({ message: 'Report not found' });
      return;
    }

    const previousResolution = report.resolution;
    const resolution: ReportResolution =
      action === 'ignore' ? 'ignored' : action === 'warn' ? 'warned' : 'suspended';

    if (report.reportedKind === 'user') {
      const u = await User.findById(report.reportedId);
      if (!u) {
        res.status(404).json({ message: 'Reported user missing' });
        return;
      }

      if (resolution === 'warned') {
        u.moderationWarningAt = new Date();
      }

      if (resolution === 'suspended') {
        u.suspended = true;
      } else if (previousResolution === 'suspended' && u.suspended) {
        const hasOtherSuspensionReport = await UserReport.exists({
          _id: { $ne: report._id },
          reportedKind: 'user',
          reportedId: report.reportedId,
          status: 'resolved',
          resolution: 'suspended',
        });
        if (!hasOtherSuspensionReport) {
          u.suspended = false;
        }
      }

      await u.save();
    } else {
      const recv = await Receiver.findById(report.reportedId);
      if (!recv) {
        res.status(404).json({ message: 'Reported receiver missing' });
        return;
      }

      if (resolution === 'warned') {
        recv.moderationWarningAt = new Date();
      }

      if (resolution === 'suspended') {
        recv.suspended = true;
      } else if (previousResolution === 'suspended' && recv.suspended) {
        const hasOtherSuspensionReport = await UserReport.exists({
          _id: { $ne: report._id },
          reportedKind: 'receiver',
          reportedId: report.reportedId,
          status: 'resolved',
          resolution: 'suspended',
        });
        if (!hasOtherSuspensionReport) {
          recv.suspended = false;
        }
      }

      await recv.save();
    }

    report.status = 'resolved';
    report.resolution = resolution;
    await report.save();

    res.status(200).json({
      ok: true,
      report: {
        _id: String(report._id),
        status: report.status,
        resolution: report.resolution,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('resolveModerationReport error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

/**
 * GET /admin/withdrawals — list + cards for withdrawal dashboard.
 */
export const listWithdrawals = async (
  req: Request<{}, {}, {}, { range?: string; status?: string; q?: string; page?: string; limit?: string }>,
  res: Response
): Promise<void> => {
  try {
    const range = String(req.query.range ?? '7d').toLowerCase();
    const status = String(req.query.status ?? 'all').toLowerCase();
    const q = String(req.query.q ?? '').trim();
    const page = Math.max(1, Number(req.query.page ?? 1) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20) || 20));
    const skip = (page - 1) * limit;

    const statusFilter: Record<string, unknown> = { status: { $ne: 'verification_pending' } };
    if (status === 'pending' || status === 'approved' || status === 'rejected') {
      statusFilter.status = status;
    }

    const now = new Date();
    const since = new Date(now);
    if (range === '7d') since.setDate(now.getDate() - 7);
    else if (range === '30d') since.setDate(now.getDate() - 30);

    const periodFilter =
      range === 'all' ? {} : { createdAt: { $gte: since } };

    const baseFilter = { ...statusFilter, ...periodFilter } as Record<string, unknown>;

    const [pendingRows, approvedTodayRows, rejectedTodayRows, approvedAllRows, totalBase] = await Promise.all([
      WithdrawalRequest.find({ status: 'pending' }).select('amount').lean<{ amount: number }[]>(),
      WithdrawalRequest.find({
        status: 'approved',
        reviewedAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      })
        .select('amount')
        .lean<{ amount: number }[]>(),
      WithdrawalRequest.find({
        status: 'rejected',
        reviewedAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      })
        .select('amount')
        .lean<{ amount: number }[]>(),
      WithdrawalRequest.find({ status: 'approved' }).select('amount reviewedAt').lean<{ amount: number; reviewedAt?: Date }[]>(),
      WithdrawalRequest.countDocuments(baseFilter),
    ]);

    const pendingCount = pendingRows.length;
    const pendingAmount = pendingRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const approvedTodayCount = approvedTodayRows.length;
    const approvedTodayAmount = approvedTodayRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const rejectedTodayCount = rejectedTodayRows.length;
    const rejectedTodayAmount = rejectedTodayRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const processedCount = approvedAllRows.length;
    const processedTodayAmount = approvedAllRows
      .filter((row) => row.reviewedAt && row.reviewedAt >= new Date(new Date().setHours(0, 0, 0, 0)))
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);

    const receiverCandidates =
      q.length === 0
        ? []
        : await Receiver.find({
            $or: [
              { name: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
              { email: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
            ],
          })
            .select('_id')
            .lean<{ _id: mongoose.Types.ObjectId }[]>();
    const receiverIdsFromSearch = receiverCandidates.map((r) => r._id);

    const listFilter: Record<string, unknown> = { ...baseFilter };
    if (q.length > 0) {
      if (receiverIdsFromSearch.length === 0) {
        res.status(200).json({
          stats: {
            pendingCount,
            pendingAmount,
            approvedTodayCount,
            approvedTodayAmount,
            rejectedTodayCount,
            rejectedTodayAmount,
            processedCount,
            processedTodayAmount,
          },
          rows: [],
          total: 0,
          page,
          limit,
        });
        return;
      }
      listFilter.receiverId = { $in: receiverIdsFromSearch };
    }

    const rows = await WithdrawalRequest.find(listFilter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean<
        {
          _id: mongoose.Types.ObjectId;
          receiverId: mongoose.Types.ObjectId;
          amount: number;
          status: string;
          bankName: string;
          accountMasked: string;
          createdAt: Date;
        }[]
      >();

    const receiverIds = [...new Set(rows.map((row) => String(row.receiverId)))];
    const receivers = await Receiver.find({ _id: { $in: receiverIds } })
      .select('_id name')
      .lean<{ _id: mongoose.Types.ObjectId; name: string }[]>();
    const receiverNameById = new Map(receivers.map((r) => [String(r._id), r.name]));

    res.status(200).json({
      stats: {
        pendingCount,
        pendingAmount,
        approvedTodayCount,
        approvedTodayAmount,
        rejectedTodayCount,
        rejectedTodayAmount,
        processedCount,
        processedTodayAmount,
      },
      rows: rows.map((row) => ({
        _id: String(row._id),
        withdrawalId: `W-${String(row._id).slice(-6).toUpperCase()}`,
        receiverName: receiverNameById.get(String(row.receiverId)) ?? 'Receiver',
        amount: row.amount,
        bankName: row.bankName,
        accountMasked: row.accountMasked,
        createdAt: row.createdAt.toISOString(),
        status: row.status,
      })),
      total: totalBase,
      page,
      limit,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('listWithdrawals error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

/**
 * PATCH /admin/withdrawals/:id — body `{ action: 'approve' | 'reject' }`
 */
export const resolveWithdrawal = async (
  req: Request<{ id: string }, {}, { action?: string; note?: string }>,
  res: Response
): Promise<void> => {
  try {
    const action = String(req.body.action ?? '').toLowerCase();
    if (action !== 'approve' && action !== 'reject') {
      res.status(400).json({ message: 'action must be approve or reject' });
      return;
    }
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      res.status(400).json({ message: 'Invalid withdrawal id' });
      return;
    }

    const withdrawal = await WithdrawalRequest.findById(req.params.id);
    if (!withdrawal || withdrawal.status === 'verification_pending') {
      res.status(404).json({ message: 'Withdrawal not found' });
      return;
    }

    const nextStatus = action === 'approve' ? 'approved' : 'rejected';
    const previousStatus = withdrawal.status;
    if (previousStatus === nextStatus) {
      res.status(200).json({ ok: true });
      return;
    }

    const receiver = await Receiver.findById(withdrawal.receiverId).select('walletBalance');
    if (!receiver) {
      res.status(404).json({ message: 'Receiver not found' });
      return;
    }

    if (previousStatus === 'pending' && nextStatus === 'rejected') {
      receiver.walletBalance = Math.round((receiver.walletBalance + withdrawal.amount) * 100) / 100;
      await receiver.save();
    } else if (previousStatus === 'rejected' && nextStatus === 'approved') {
      if (receiver.walletBalance < withdrawal.amount) {
        res.status(400).json({ message: 'Cannot approve now: receiver wallet balance is lower than refund amount' });
        return;
      }
      receiver.walletBalance = Math.round((receiver.walletBalance - withdrawal.amount) * 100) / 100;
      await receiver.save();
    }

    withdrawal.status = nextStatus;
    withdrawal.reviewedAt = new Date();
    withdrawal.reviewedByAdminId = req.admin?._id ? new mongoose.Types.ObjectId(String(req.admin._id)) : null;
    const note = String(req.body.note ?? '').trim();
    withdrawal.adminNote = note ? note : null;
    await withdrawal.save();

    res.status(200).json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('resolveWithdrawal error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};
