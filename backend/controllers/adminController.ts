import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import Admin from '../models/Admin';
import Receiver, { type ReceiverDocument } from '../models/Receiver';
import User, { type UserDocument } from '../models/User';
import UserReport, { type ReportResolution } from '../models/UserReport';
import WithdrawalRequest from '../models/WithdrawalRequest';
import CallSession from '../models/CallSession';
import ReceiverRating from '../models/ReceiverRating';
import ChatMessage from '../models/ChatMessage';
import AdminSettings, { type IFixedPerMinuteWindow, type ReceiverEarningModel } from '../models/AdminSettings';
import {
  clearReceiverEarningSettingsCache,
  DEFAULT_FIXED_PER_MINUTE_WINDOWS,
  DEFAULT_RECEIVER_EARNING_MODEL,
  normalizeFixedPerMinuteWindows,
  publicEarningSchedulePayload,
} from '../services/receiverEarningModel';
import {
  getPlatformRevenueForRange,
  getRevenueDashboardMetrics,
} from '../services/adminEarningsService';
import { aggregateReceiverEarningsByReceiver, sumReceiverEarningsRollup } from '../services/receiverEarningsAggregate';
import { CHAT_TEXT_CHARGE_INR } from '../constants/chatPricing';
import { normalizeReceiverWelcome } from '../services/receiverWelcome';
import { normalizeCallerNotification } from '../services/callerNotification';
import { toApiReceiver, toApiUser } from './authController';
import { sendOtpEmail } from '../config/email';
import { getConfiguredAdminEmail } from '../services/superAdminSync';
import { trackAndFinalizeRazorpayXPayout } from '../services/razorpayXPayoutService';
import {
  emitAuthSessionSuperseded,
  emitCallerApproved,
  emitCallerRejected,
  emitReceiverApproved,
  emitReceiverRejected,
} from '../socket/socketRegistry';
import { bumpReceiverAuthSession } from '../services/authSessionService';
import {
  normalizeIndianMobilePhone,
  phoneLookupVariants,
} from '../utils/phoneNormalize';

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

function isSuperAdmin(req: Request): boolean {
  return req.admin?.role === 'super_admin';
}

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

/**
 * GET /admin/settings — notification controls + role management data.
 */
export const getAdminSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    const settings = await AdminSettings.findOne({});
    const effective = settings ?? (await AdminSettings.create({}));
    const admins = await Admin.find({})
      .select('_id name email role createdAt')
      .sort({ createdAt: 1 })
      .lean<{ _id: mongoose.Types.ObjectId; name: string; email: string; role: string; createdAt: Date }[]>();

    const earningModel: ReceiverEarningModel =
      effective.receiverEarningModel === 'fixed_per_minute' ? 'fixed_per_minute' : DEFAULT_RECEIVER_EARNING_MODEL;
    const fixedPerMinuteWindows = normalizeFixedPerMinuteWindows(
      effective.fixedPerMinuteWindows?.length
        ? effective.fixedPerMinuteWindows
        : DEFAULT_FIXED_PER_MINUTE_WINDOWS
    );

    const receiverWelcome = normalizeReceiverWelcome(effective.receiverWelcome);
    const callerNotification = normalizeCallerNotification(effective.callerNotification);

    res.status(200).json({
      notificationControls: {
        kycSubmissionsEmail: Boolean(effective.notificationControls?.kycSubmissionsEmail ?? true),
        pendingWithdrawalsEmail: Boolean(effective.notificationControls?.pendingWithdrawalsEmail ?? true),
        dailyRevenueSummaryEmail: Boolean(effective.notificationControls?.dailyRevenueSummaryEmail ?? true),
      },
      receiverWelcome,
      callerNotification,
      receiverEarningModel: earningModel,
      fixedPerMinuteWindows,
      rolesCatalog: [
        { id: 'super_admin', label: 'Super Admin', description: 'Full access to all features' },
        { id: 'support_admin', label: 'Support Admin', description: 'Can manage KYC, users, and reports' },
        { id: 'finance_admin', label: 'Finance Admin', description: 'Can manage withdrawals and revenue settings' },
      ],
      admins: admins.map((a) => ({
        _id: String(a._id),
        name: a.name,
        email: a.email,
        role: a.role,
        status: 'active',
        createdAt: a.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('getAdminSettings error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

/**
 * PATCH /admin/settings/notifications
 */
export const updateAdminNotificationControls = async (
  req: Request<
    {},
    {},
    {
      kycSubmissionsEmail?: boolean;
      pendingWithdrawalsEmail?: boolean;
      dailyRevenueSummaryEmail?: boolean;
    }
  >,
  res: Response
): Promise<void> => {
  try {
    const body = req.body ?? {};
    if (
      typeof body.kycSubmissionsEmail !== 'boolean' ||
      typeof body.pendingWithdrawalsEmail !== 'boolean' ||
      typeof body.dailyRevenueSummaryEmail !== 'boolean'
    ) {
      res.status(400).json({
        message:
          'kycSubmissionsEmail, pendingWithdrawalsEmail, and dailyRevenueSummaryEmail booleans are required',
      });
      return;
    }

    const settings = await AdminSettings.findOneAndUpdate(
      {},
      {
        $set: {
          notificationControls: {
            kycSubmissionsEmail: body.kycSubmissionsEmail,
            pendingWithdrawalsEmail: body.pendingWithdrawalsEmail,
            dailyRevenueSummaryEmail: body.dailyRevenueSummaryEmail,
          },
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.status(200).json({
      ok: true,
      notificationControls: settings.notificationControls,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('updateAdminNotificationControls error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

/**
 * PATCH /admin/settings/earning-model
 */
export const updateAdminReceiverEarningModel = async (
  req: Request<
    {},
    {},
    {
      receiverEarningModel?: ReceiverEarningModel;
      fixedPerMinuteWindows?: IFixedPerMinuteWindow[];
    }
  >,
  res: Response
): Promise<void> => {
  try {
    const body = req.body ?? {};
    const model = body.receiverEarningModel;
    if (model !== 'score_based' && model !== 'fixed_per_minute') {
      res.status(400).json({ message: 'receiverEarningModel must be score_based or fixed_per_minute' });
      return;
    }

    const windows =
      model === 'fixed_per_minute'
        ? normalizeFixedPerMinuteWindows(body.fixedPerMinuteWindows ?? DEFAULT_FIXED_PER_MINUTE_WINDOWS)
        : normalizeFixedPerMinuteWindows(
            (await AdminSettings.findOne({}).select('fixedPerMinuteWindows').lean())?.fixedPerMinuteWindows ??
              DEFAULT_FIXED_PER_MINUTE_WINDOWS
          );

    const settings = await AdminSettings.findOneAndUpdate(
      {},
      {
        $set: {
          receiverEarningModel: model,
          fixedPerMinuteWindows: windows,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    clearReceiverEarningSettingsCache();

    const payload = publicEarningSchedulePayload({
      receiverEarningModel: settings.receiverEarningModel,
      fixedPerMinuteWindows: normalizeFixedPerMinuteWindows(settings.fixedPerMinuteWindows),
    });

    res.status(200).json({
      ok: true,
      receiverEarningModel: payload.receiverEarningModel,
      fixedPerMinuteWindows: payload.fixedPerMinuteWindows,
      earningTimezone: payload.timezone,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('updateAdminReceiverEarningModel error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

/**
 * PATCH /admin/settings/receiver-welcome — home card copy for receivers.
 */
export const updateAdminReceiverWelcome = async (
  req: Request<{}, {}, { enabled?: boolean; title?: string; body?: string }>,
  res: Response
): Promise<void> => {
  try {
    const body = req.body ?? {};
    if (typeof body.enabled !== 'boolean') {
      res.status(400).json({ message: 'enabled boolean is required' });
      return;
    }
    const receiverWelcome = normalizeReceiverWelcome({
      enabled: body.enabled,
      title: body.title,
      body: body.body,
    });

    const settings = await AdminSettings.findOneAndUpdate(
      {},
      { $set: { receiverWelcome } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.status(200).json({
      ok: true,
      receiverWelcome: normalizeReceiverWelcome(settings.receiverWelcome),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('updateAdminReceiverWelcome error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

/**
 * PATCH /admin/settings/caller-notification — home card copy for callers.
 */
export const updateAdminCallerNotification = async (
  req: Request<{}, {}, { enabled?: boolean; title?: string; body?: string }>,
  res: Response
): Promise<void> => {
  try {
    const body = req.body ?? {};
    if (typeof body.enabled !== 'boolean') {
      res.status(400).json({ message: 'enabled boolean is required' });
      return;
    }
    const callerNotification = normalizeCallerNotification({
      enabled: body.enabled,
      title: body.title,
      body: body.body,
    });

    const settings = await AdminSettings.findOneAndUpdate(
      {},
      { $set: { callerNotification } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.status(200).json({
      ok: true,
      callerNotification: normalizeCallerNotification(settings.callerNotification),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('updateAdminCallerNotification error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

/**
 * PATCH /admin/settings/admins/:id/role — super_admin only.
 */
export const updateAdminRole = async (
  req: Request<{ id: string }, {}, { role?: string }>,
  res: Response
): Promise<void> => {
  try {
    if (!isSuperAdmin(req)) {
      res.status(403).json({ message: 'Only super admin can change admin roles' });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      res.status(400).json({ message: 'Invalid admin id' });
      return;
    }

    const role = String(req.body.role ?? '').trim();
    if (role !== 'super_admin' && role !== 'support_admin' && role !== 'finance_admin') {
      res.status(400).json({ message: 'role must be super_admin, support_admin, or finance_admin' });
      return;
    }

    const target = await Admin.findById(req.params.id);
    if (!target) {
      res.status(404).json({ message: 'Admin not found' });
      return;
    }

    target.role = role;
    await target.save();

    res.status(200).json({
      ok: true,
      admin: {
        _id: String(target._id),
        name: target.name,
        email: target.email,
        role: target.role,
        status: 'active',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('updateAdminRole error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function roundInr(n: number): number {
  return Math.round(n * 100) / 100;
}

function roundRating(n: number): number {
  return Math.round(n * 10) / 10;
}

function toRangeStart(range: string): Date | null {
  const now = new Date();
  const start = new Date(now);
  if (range === '7d') {
    start.setDate(now.getDate() - 7);
    start.setHours(0, 0, 0, 0);
    return start;
  }
  if (range === '30d') {
    start.setDate(now.getDate() - 30);
    start.setHours(0, 0, 0, 0);
    return start;
  }
  return null;
}

/**
 * GET /admin/revenue — dynamic revenue dashboard metrics.
 */
export const getRevenueDashboard = async (
  req: Request<{}, {}, {}, { range?: string }>,
  res: Response
): Promise<void> => {
  try {
    const range = String(req.query.range ?? '7d').toLowerCase();
    if (range !== '7d' && range !== '30d' && range !== 'all') {
      res.status(400).json({ message: 'range must be 7d, 30d, or all' });
      return;
    }

    const start = toRangeStart(range);
    const { cards, dailyBreakdown, topEarners } = await getRevenueDashboardMetrics(start);

    res.status(200).json({
      cards,
      dailyBreakdown,
      topEarners,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('getRevenueDashboard error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

/**
 * GET /admin/overview — dynamic top-level dashboard snapshot.
 */
export const getOverviewDashboard = async (
  req: Request<{}, {}, {}, { range?: string }>,
  res: Response
): Promise<void> => {
  try {
    const range = String(req.query.range ?? '7d').toLowerCase();
    if (range !== '7d' && range !== '30d' && range !== 'all') {
      res.status(400).json({ message: 'range must be 7d, 30d, or all' });
      return;
    }
    const start = toRangeStart(range);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const weekStart = toRangeStart('7d') ?? todayStart;
    const monthStart = toRangeStart('30d') ?? todayStart;

    const [platformRevenue, calls, chats, activeReceivers, activeUsers, pendingKycApprovals, pendingWithdrawals, flaggedReports, allReceiverIds] =
      await Promise.all([
        getPlatformRevenueForRange(start),
        CallSession.find({
          status: 'completed',
          ...(start ? { startedAt: { $gte: start } } : {}),
        })
          .select('startedAt settledAmountInr')
          .lean<{ startedAt: Date; settledAmountInr?: number }[]>(),
        ChatMessage.find({
          senderType: 'u',
          feeInr: { $gt: 0 },
          ...(start ? { createdAt: { $gte: start } } : {}),
        })
          .select('createdAt')
          .lean<{ createdAt: Date }[]>(),
        Receiver.countDocuments({ accountStatus: 'approved', suspended: { $ne: true } }),
        User.countDocuments({ accountStatus: 'approved', suspended: { $ne: true } }),
        Receiver.countDocuments({ accountStatus: 'pending_review' }),
        WithdrawalRequest.countDocuments({ status: 'pending' }),
        UserReport.countDocuments({ status: 'pending' }),
        Receiver.find({}).select('_id').lean<{ _id: mongoose.Types.ObjectId }[]>(),
      ]);

    const earningsRollups = await aggregateReceiverEarningsByReceiver(
      allReceiverIds.map((r) => r._id),
      todayStart,
      weekStart,
      monthStart
    );
    const earningsPeriod =
      range === 'all' ? 'lifetime' : range === '30d' ? 'last30Days' : 'last7Days';
    const receiverEarningsSum = sumReceiverEarningsRollup(earningsRollups.values(), earningsPeriod).earnings;

    const totalRevenue = platformRevenue.callerGross;
    const adminEarnings = roundInr(Math.max(0, totalRevenue - receiverEarningsSum));
    const totalCalls = calls.length;
    const trendByDay = new Map<string, number>();

    for (const c of calls) {
      const gross = roundInr(Number(c.settledAmountInr || 0));
      const day = new Date(c.startedAt).toISOString().slice(0, 10);
      trendByDay.set(day, roundInr((trendByDay.get(day) || 0) + gross));
    }
    for (const m of chats) {
      const gross = roundInr(CHAT_TEXT_CHARGE_INR);
      const day = new Date(m.createdAt).toISOString().slice(0, 10);
      trendByDay.set(day, roundInr((trendByDay.get(day) || 0) + gross));
    }

    // For chart, return last 7 buckets ending today.
    const trend: Array<{ label: string; amount: number }> = [];
    const now = new Date();
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const label = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(d);
      trend.push({ label, amount: roundInr(trendByDay.get(key) || 0) });
    }

    res.status(200).json({
      cards: {
        totalRevenue,
        adminEarnings,
        receiverRevenue: receiverEarningsSum,
        receiverEarningsSum,
        totalCalls,
        activeReceivers,
        activeUsers,
      },
      trend,
      actionRequired: {
        pendingKycApprovals,
        pendingWithdrawals,
        flaggedReports,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('getOverviewDashboard error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

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

type AdminAppUserPatchBody = {
  suspended?: boolean;
  name?: string;
  phone?: string;
  walletBalance?: number;
  profileImage?: string | null;
  userAudio?: string | null;
  gender?: string;
  age?: number;
  state?: string | null;
};

function isValidIndianMobile(ten: string): boolean {
  return /^[6-9]\d{9}$/.test(ten);
}

const PRESET_PROFILE_IMAGE_RE = /^preset:(male|female):\d+$/i;

function optionalHttpsUrl(raw: unknown, field: string): string | null | undefined {
  if (raw === null) return null;
  if (typeof raw !== 'string') return undefined;
  const v = raw.trim();
  if (!v) return null;
  if (!/^https?:\/\//i.test(v)) {
    throw new Error(`${field} must be a valid http(s) URL`);
  }
  return v;
}

/** App stores bundled avatars as `preset:male:1` / `preset:female:15` — not Cloudinary URLs. */
function optionalProfileImageValue(raw: unknown, field: string): string | null | undefined {
  if (raw === null) return null;
  if (typeof raw !== 'string') return undefined;
  const v = raw.trim();
  if (!v) return null;
  if (PRESET_PROFILE_IMAGE_RE.test(v)) return v;
  if (/^https?:\/\//i.test(v)) return v;
  throw new Error(`${field} must be a valid http(s) URL or a bundled preset id (preset:male:N / preset:female:N)`);
}

/**
 * PATCH /admin/users/:id — partial profile update (includes legacy `{ suspended }` only).
 */
export const updateAppUser = async (
  req: Request<{ id: string }, {}, AdminAppUserPatchBody>,
  res: Response
): Promise<void> => {
  try {
    const body = req.body ?? {};
    const keys = Object.keys(body).filter((k) => body[k as keyof AdminAppUserPatchBody] !== undefined);
    if (keys.length === 0) {
      res.status(400).json({ message: 'At least one field to update is required' });
      return;
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    if (typeof body.name === 'string') {
      const name = body.name.trim();
      if (!name) {
        res.status(400).json({ message: 'name cannot be empty' });
        return;
      }
      user.name = name;
    }

    if (typeof body.phone === 'string') {
      const canonical = normalizeIndianMobilePhone(body.phone);
      if (!isValidIndianMobile(canonical)) {
        res.status(400).json({ message: 'phone must be a valid 10-digit Indian mobile number' });
        return;
      }
      const variants = phoneLookupVariants(canonical);
      const dup = await User.findOne({
        _id: { $ne: user._id },
        phone: { $in: variants },
      }).select('_id');
      if (dup) {
        res.status(409).json({ message: 'Another user already uses this phone number' });
        return;
      }
      user.phone = canonical;
    }

    if (typeof body.walletBalance === 'number' && Number.isFinite(body.walletBalance)) {
      user.walletBalance = Math.max(0, Math.round(body.walletBalance));
    }

    if (body.profileImage !== undefined) {
      try {
        const url = optionalProfileImageValue(body.profileImage, 'profileImage');
        if (url !== undefined) user.profileImage = url;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        res.status(400).json({ message: msg });
        return;
      }
    }

    if (body.userAudio !== undefined) {
      try {
        const url = optionalHttpsUrl(body.userAudio, 'userAudio');
        if (url !== undefined) user.userAudio = url;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        res.status(400).json({ message: msg });
        return;
      }
    }

    if (typeof body.gender === 'string') {
      const g = body.gender.trim();
      if (g === 'male' || g === 'female' || g === 'other') {
        user.gender = g;
      } else {
        res.status(400).json({ message: 'gender must be male, female, or other' });
        return;
      }
    }

    if (typeof body.age === 'number' && Number.isFinite(body.age)) {
      const age = Math.round(body.age);
      if (age < 18 || age > 120) {
        res.status(400).json({ message: 'age must be between 18 and 120' });
        return;
      }
      user.age = age;
    }

    if (body.state !== undefined) {
      user.state = typeof body.state === 'string' && body.state.trim() ? body.state.trim() : null;
    }

    if (typeof body.suspended === 'boolean') {
      user.suspended = body.suspended;
    }

    await user.save();
    res.status(200).json({ user: toApiUser(user) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('updateAppUser error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

type AdminReceiverPatchBody = {
  name?: string;
  phone?: string;
  walletBalance?: number;
  profileImage?: string | null;
  userAudio?: string | null;
  aadhaarNumber?: string;
  panNumber?: string;
  aadhaarFront?: string | null;
  aadhaarBack?: string | null;
  panFront?: string | null;
  gender?: string;
  age?: number;
  state?: string | null;
  isAvailable?: boolean;
  suspended?: boolean;
};

/**
 * PATCH /admin/receivers/:id — partial receiver profile update (admin only).
 */
export const updateReceiver = async (
  req: Request<{ id: string }, {}, AdminReceiverPatchBody>,
  res: Response
): Promise<void> => {
  try {
    const body = req.body ?? {};
    const keys = Object.keys(body).filter((k) => body[k as keyof AdminReceiverPatchBody] !== undefined);
    if (keys.length === 0) {
      res.status(400).json({ message: 'At least one field to update is required' });
      return;
    }

    const receiver = await Receiver.findById(req.params.id);
    if (!receiver) {
      res.status(404).json({ message: 'Receiver not found' });
      return;
    }

    if (typeof body.name === 'string') {
      const name = body.name.trim();
      if (!name) {
        res.status(400).json({ message: 'name cannot be empty' });
        return;
      }
      receiver.name = name;
    }

    if (typeof body.phone === 'string') {
      const canonical = normalizeIndianMobilePhone(body.phone);
      if (!isValidIndianMobile(canonical)) {
        res.status(400).json({ message: 'phone must be a valid 10-digit Indian mobile number' });
        return;
      }
      const variants = phoneLookupVariants(canonical);
      const dup = await Receiver.findOne({
        _id: { $ne: receiver._id },
        phone: { $in: variants },
      }).select('_id');
      if (dup) {
        res.status(409).json({ message: 'Another receiver already uses this phone number' });
        return;
      }
      receiver.phone = canonical;
    }

    if (typeof body.walletBalance === 'number' && Number.isFinite(body.walletBalance)) {
      receiver.walletBalance = Math.max(0, Math.round(body.walletBalance));
    }

    if (body.profileImage !== undefined) {
      try {
        const url = optionalProfileImageValue(body.profileImage, 'profileImage');
        if (url !== undefined) receiver.profileImage = url;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        res.status(400).json({ message: msg });
        return;
      }
    }

    if (body.userAudio !== undefined) {
      try {
        const url = optionalHttpsUrl(body.userAudio, 'userAudio');
        if (url !== undefined) receiver.userAudio = url;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        res.status(400).json({ message: msg });
        return;
      }
    }

    if (typeof body.aadhaarNumber === 'string' && body.aadhaarNumber.trim()) {
      const aadhaarDigits = body.aadhaarNumber.replace(/\D/g, '').trim();
      if (!/^\d{12}$/.test(aadhaarDigits)) {
        res.status(400).json({ message: 'aadhaarNumber must be a valid 12-digit number' });
        return;
      }
      receiver.aadhaarNumber = aadhaarDigits;
    }

    if (typeof body.panNumber === 'string' && body.panNumber.trim()) {
      const pan = body.panNumber.trim().toUpperCase();
      if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) {
        res.status(400).json({ message: 'panNumber must be valid (e.g. ABCDE1234F)' });
        return;
      }
      receiver.panNumber = pan;
    }

    for (const [key, field] of [
      ['aadhaarFront', 'aadhaarFront'],
      ['aadhaarBack', 'aadhaarBack'],
      ['panFront', 'panFront'],
    ] as const) {
      const raw = body[key];
      if (raw !== undefined) {
        try {
          const url = optionalHttpsUrl(raw, field);
          if (url !== undefined) receiver[field] = url;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          res.status(400).json({ message: msg });
          return;
        }
      }
    }

    if (receiver.aadhaarFront && receiver.aadhaarBack && receiver.panFront) {
      receiver.documents = [receiver.aadhaarFront, receiver.aadhaarBack, receiver.panFront];
    }

    if (typeof body.gender === 'string') {
      const g = body.gender.trim();
      if (g === 'male' || g === 'female' || g === 'other') {
        receiver.gender = g;
      } else {
        res.status(400).json({ message: 'gender must be male, female, or other' });
        return;
      }
    }

    if (typeof body.age === 'number' && Number.isFinite(body.age)) {
      const age = Math.round(body.age);
      if (age < 18 || age > 120) {
        res.status(400).json({ message: 'age must be between 18 and 120' });
        return;
      }
      receiver.age = age;
    }

    if (body.state !== undefined) {
      receiver.state = typeof body.state === 'string' && body.state.trim() ? body.state.trim() : null;
    }

    if (typeof body.isAvailable === 'boolean') {
      receiver.isAvailable = body.isAvailable;
    }

    if (typeof body.suspended === 'boolean') {
      receiver.suspended = body.suspended;
    }

    await receiver.save();
    res.status(200).json({ receiver: toApiReceiver(receiver) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('updateReceiver error:', msg);
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

    const receiverIds = receivers.map((r) => r._id);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const weekStart = toRangeStart('7d') ?? todayStart;
    const monthStart = toRangeStart('30d') ?? todayStart;

    const [ratingRows, earningsByReceiver] = await Promise.all([
      receiverIds.length === 0
        ? Promise.resolve([] as { _id: mongoose.Types.ObjectId; avg: number; count: number }[])
        : ReceiverRating.aggregate<{ _id: mongoose.Types.ObjectId; avg: number; count: number }>([
            { $match: { receiverId: { $in: receiverIds } } },
            {
              $group: {
                _id: '$receiverId',
                avg: { $avg: '$rating' },
                count: { $sum: 1 },
              },
            },
          ]),
      aggregateReceiverEarningsByReceiver(receiverIds, todayStart, weekStart, monthStart),
    ]);

    const ratingByReceiverId = new Map(
      ratingRows.map((row) => [
        String(row._id),
        {
          avg: Number.isFinite(row.avg) ? roundRating(row.avg) : 0,
          count: row.count ?? 0,
        },
      ])
    );

    const list = receivers.map((r) => {
      const base = toApiReceiver(r as ReceiverDocument);
      const id = String(r._id);
      const rating = ratingByReceiverId.get(id);
      const earnings = earningsByReceiver.get(id);
      const isAvailable = Boolean(base.isAvailable);
      const isOnline = Boolean(base.isOnline);
      return {
        ...base,
        ratingAvg: rating && rating.count > 0 ? rating.avg : null,
        ratingCount: rating?.count ?? 0,
        totalCalls: earnings?.lifetime.calls ?? 0,
        callsToday: earnings?.today.calls ?? 0,
        earningsToday: earnings?.today.earnings ?? 0,
        totalEarnings: earnings?.lifetime.earnings ?? 0,
        isLiveAvailable: isAvailable && isOnline,
      };
    });

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

    const callerAwaitingAccess = { accountStatus: 'pending_review' };

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
    const canApprove =
      receiver.accountStatus === 'pending_review' ||
      receiver.accountStatus === 'rejected' ||
      receiver.accountStatus === 'approved';
    if (!canApprove) {
      res.status(400).json({ message: 'Receiver is not pending approval' });
      return;
    }

    receiver.accountStatus = 'approved';
    receiver.isVerified = true;
    receiver.suspended = false;
    receiver.rejectionReason = null;
    await receiver.save();
    emitReceiverApproved(String(receiver._id));

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
export const rejectReceiver = async (
  req: Request<{ id: string }, {}, { reason?: string }>,
  res: Response
): Promise<void> => {
  try {
    const id = req.params.id;
    const reasonRaw = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';
    const reason = reasonRaw || 'Your KYC details were not approved. Please edit and resubmit.';
    const receiver = await Receiver.findById(id);
    if (!receiver) {
      res.status(404).json({ message: 'Receiver not found' });
      return;
    }
    const canReject = receiver.accountStatus === 'pending_review' || receiver.accountStatus === 'approved';
    if (!canReject) {
      res.status(400).json({ message: 'Receiver is not pending approval' });
      return;
    }

    receiver.accountStatus = 'rejected';
    receiver.isVerified = false;
    receiver.suspended = true;
    receiver.rejectionReason = reason;
    await receiver.save();
    const sessionVersion = await bumpReceiverAuthSession(String(receiver._id));
    emitAuthSessionSuperseded('r', String(receiver._id), sessionVersion);
    emitReceiverRejected(String(receiver._id), reason);

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
 * GET /admin/users/pending — app users (callers) awaiting verification.
 */
export const listPendingAppUsers = async (_req: Request, res: Response): Promise<void> => {
  try {
    const users = await User.find({ accountStatus: 'pending_review' })
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
 * PATCH /admin/users/:id/approve — approves caller verification and enables access.
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

    const legacyNeedVoice = user.accountStatus === 'pending_review';
    const voice = String(user.userAudio ?? '').trim();
    if (legacyNeedVoice && !voice) {
      res.status(400).json({ message: 'Cannot approve: no voice verification audio on file' });
      return;
    }

    const needsRelease = user.suspended || user.accountStatus === 'pending_review';
    if (!needsRelease) {
      res.status(400).json({ message: 'User access is already active' });
      return;
    }

    user.suspended = false;
    user.accountStatus = 'approved';
    await user.save();
    emitCallerApproved(String(user._id));

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
 * PATCH /admin/users/:id/reject — rejects caller verification and keeps dashboard blocked.
 */
export const rejectAppUser = async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    const reason = 'Your profile verification was not approved.';
    const user = await User.findById(id);
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }
    if (user.accountStatus === 'pending_profile') {
      res.status(400).json({ message: 'User has not finished onboarding yet' });
      return;
    }
    if (user.accountStatus !== 'pending_review') {
      res.status(400).json({ message: 'User is not pending verification' });
      return;
    }

    user.suspended = false;
    user.accountStatus = 'rejected';
    await user.save();
    emitCallerRejected(String(user._id), reason);

    res.status(200).json({
      message: 'Verification rejected',
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
          accountHolderName: string;
          accountMasked: string;
          payoutStatus?: string;
          payoutUtr?: string | null;
          payoutError?: string | null;
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
      rows: rows.map((row) => {
        const isUpi = String(row.bankName ?? '').trim().toUpperCase() === 'UPI';
        return {
          _id: String(row._id),
          withdrawalId: `W-${String(row._id).slice(-6).toUpperCase()}`,
          receiverName: receiverNameById.get(String(row.receiverId)) ?? 'Receiver',
          amount: row.amount,
          payoutMethod: isUpi ? ('upi' as const) : ('bank' as const),
          bankName: row.bankName,
          accountHolderName: row.accountHolderName,
          accountMasked: row.accountMasked,
          createdAt: row.createdAt.toISOString(),
          status: row.status,
          payoutStatus: row.payoutStatus && row.payoutStatus !== 'none' ? row.payoutStatus : undefined,
          payoutUtr: row.payoutUtr,
          payoutError: row.payoutError ?? undefined,
        };
      }),
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

    const nextStatus = action === 'approve' ? 'approved' : 'rejected';
    let payoutShouldStart = false;

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const withdrawal = await WithdrawalRequest.findById(req.params.id).session(session);
        if (!withdrawal || withdrawal.status === 'verification_pending') {
          // Throwing to escape transaction cleanly; handled below.
          throw new Error('WithdrawalNotFound');
        }
        if (withdrawal.payoutStatus === 'processing' || withdrawal.payoutStatus === 'success') {
          throw new Error('WithdrawalAutoManaged');
        }

        const previousStatus = withdrawal.status;
        if (previousStatus === nextStatus) {
          return;
        }

        const receiver = await Receiver.findById(withdrawal.receiverId).session(session).select('walletBalance');
        if (!receiver) throw new Error('ReceiverNotFound');

        if (previousStatus === 'pending' && nextStatus === 'approved') {
          if (receiver.walletBalance < withdrawal.amount) {
            throw new Error('CannotApprove:InsufficientRefundBalance');
          }
          receiver.walletBalance = Math.round((receiver.walletBalance - withdrawal.amount) * 100) / 100;
          await receiver.save();
        } else if (previousStatus === 'rejected' && nextStatus === 'approved') {
          if (receiver.walletBalance < withdrawal.amount) {
            throw new Error('CannotApprove:InsufficientRefundBalance');
          }
          receiver.walletBalance = Math.round((receiver.walletBalance - withdrawal.amount) * 100) / 100;
          await receiver.save();
        }

        withdrawal.status = nextStatus;
        withdrawal.reviewedAt = new Date();
        withdrawal.reviewedByAdminId = req.admin?._id
          ? new mongoose.Types.ObjectId(String(req.admin._id))
          : null;
        const note = String(req.body.note ?? '').trim();
        withdrawal.adminNote = note ? note : null;

        if (nextStatus === 'approved') {
          // Start RazorpayX payout after admin approval.
          withdrawal.payoutStatus = 'processing';
          withdrawal.payoutId = null;
          withdrawal.payoutUtr = null;
          withdrawal.payoutError = null;
          withdrawal.walletRefundedAt = null;
          // Stable per withdrawal record to avoid duplicate payout attempts.
          withdrawal.payoutReferenceId = `wd_${String(withdrawal._id).slice(-10)}`;
          payoutShouldStart = true;
        } else if (previousStatus === 'pending' && nextStatus === 'rejected') {
          // Rejection from the initial request stage: clear payout fields.
          withdrawal.payoutStatus = 'none';
          withdrawal.payoutId = null;
          withdrawal.payoutUtr = null;
          withdrawal.payoutError = null;
          withdrawal.walletRefundedAt = null;
          withdrawal.payoutReferenceId = null;
        }

        await withdrawal.save();
      });
    } finally {
      await session.endSession();
    }

    // Only start payout after DB is updated.
    if (payoutShouldStart) {
      void trackAndFinalizeRazorpayXPayout(req.params.id).catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('RazorpayX payout tracker error:', msg);
      });
    }

    // Transaction may throw for known errors; map them to responses.
    res.status(200).json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('resolveWithdrawal error:', msg);
    if (msg === 'WithdrawalNotFound') {
      res.status(404).json({ message: 'Withdrawal not found' });
      return;
    }
    if (msg === 'ReceiverNotFound') {
      res.status(404).json({ message: 'Receiver not found' });
      return;
    }
    if (msg === 'CannotApprove:InsufficientRefundBalance') {
      res
        .status(400)
        .json({ message: 'Cannot approve now: receiver wallet balance is lower than refund amount' });
      return;
    }
    if (msg === 'WithdrawalAutoManaged') {
      res.status(400).json({ message: 'This withdrawal is auto-managed by payout flow' });
      return;
    }
    res.status(500).json({ message: msg || 'Server error' });
  }
};
