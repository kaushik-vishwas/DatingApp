import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Request, Response } from 'express';
import Admin from '../models/Admin';
import Receiver, { type ReceiverDocument } from '../models/Receiver';
import User, { type UserDocument } from '../models/User';
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

    const [pendingApprovals, approvedToday, rejectedToday] = await Promise.all([
      Receiver.countDocuments({ accountStatus: 'pending_review' }),
      Receiver.countDocuments({
        accountStatus: 'approved',
        updatedAt: { $gte: start },
      }),
      Receiver.countDocuments({
        accountStatus: 'rejected',
        updatedAt: { $gte: start },
      }),
    ]);

    res.status(200).json({ pendingApprovals, approvedToday, rejectedToday });
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
