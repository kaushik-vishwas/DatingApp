"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveModerationReport = exports.listModerationReports = exports.rejectAppUser = exports.approveAppUser = exports.listPendingAppUsers = exports.rejectReceiver = exports.approveReceiver = exports.listPendingReceivers = exports.getKycStats = exports.listAllReceivers = exports.updateAppUser = exports.listAppUsers = exports.adminConfirmEmailChange = exports.adminRequestEmailChange = exports.adminResetPassword = exports.adminForgotPassword = exports.adminMe = exports.adminLogin = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const mongoose_1 = __importDefault(require("mongoose"));
const Admin_1 = __importDefault(require("../models/Admin"));
const Receiver_1 = __importDefault(require("../models/Receiver"));
const User_1 = __importDefault(require("../models/User"));
const UserReport_1 = __importDefault(require("../models/UserReport"));
const authController_1 = require("./authController");
const email_1 = require("../config/email");
const superAdminSync_1 = require("../services/superAdminSync");
const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const signAdminToken = (adminId) => {
    const secret = process.env.ADMIN_JWT_SECRET;
    if (!secret) {
        throw new Error('ADMIN_JWT_SECRET is not set');
    }
    const payload = { adminId, typ: 'admin' };
    return jsonwebtoken_1.default.sign(payload, secret, { expiresIn: '7d' });
};
/**
 * POST /admin/auth/login — password only; admin identity comes from ADMIN_EMAIL in the backend .env.
 */
const adminLogin = async (req, res) => {
    try {
        const configuredEmail = (0, superAdminSync_1.getConfiguredAdminEmail)();
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
        const admin = await Admin_1.default.findOne({ email: configuredEmail });
        if (!admin) {
            res.status(401).json({ message: 'Invalid password' });
            return;
        }
        const ok = await bcryptjs_1.default.compare(password, admin.passwordHash);
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
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('adminLogin error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.adminLogin = adminLogin;
/**
 * GET /admin/auth/me
 */
const adminMe = async (req, res) => {
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
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.adminMe = adminMe;
/**
 * POST /admin/auth/forgot-password
 */
const adminForgotPassword = async (req, res) => {
    const genericMessage = 'If the admin account is configured, a reset code has been sent to the admin email.';
    try {
        const otpBypass = process.env.OTP_BYPASS?.toLowerCase() === 'true';
        const configuredEmail = (0, superAdminSync_1.getConfiguredAdminEmail)();
        if (!configuredEmail) {
            res.status(503).json({ message: 'Admin is not configured: set ADMIN_EMAIL in the backend .env' });
            return;
        }
        const bodyEmail = String(req.body.email ?? '').toLowerCase().trim();
        if (bodyEmail && bodyEmail !== configuredEmail) {
            res.status(200).json({ message: genericMessage, emailSent: false });
            return;
        }
        const admin = await Admin_1.default.findOne({ email: configuredEmail }).select('+passwordHash');
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
            await (0, email_1.sendOtpEmail)(admin.email, otp, 'password_reset');
        }
        catch (mailErr) {
            emailSent = false;
            const msg = mailErr instanceof Error ? mailErr.message : String(mailErr);
            console.error('adminForgotPassword email error:', msg);
            if (mailErr && typeof mailErr === 'object' && 'response' in mailErr) {
                console.error('adminForgotPassword SMTP response:', String(mailErr.response));
            }
        }
        res.status(200).json({
            message: emailSent
                ? genericMessage
                : 'Code could not be emailed. Check server logs and EMAIL_USER / EMAIL_PASS, or use the code printed in the server console.',
            emailSent,
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('adminForgotPassword error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.adminForgotPassword = adminForgotPassword;
/**
 * POST /admin/auth/reset-password
 */
const adminResetPassword = async (req, res) => {
    try {
        const otpBypass = process.env.OTP_BYPASS?.toLowerCase() === 'true';
        const configuredEmail = (0, superAdminSync_1.getConfiguredAdminEmail)();
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
        const admin = await Admin_1.default.findOne({ email: configuredEmail }).select('+passwordHash');
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
        admin.passwordHash = await bcryptjs_1.default.hash(newPassword, 10);
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
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('adminResetPassword error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.adminResetPassword = adminResetPassword;
/**
 * POST /admin/auth/request-email-change (protected)
 */
const adminRequestEmailChange = async (req, res) => {
    try {
        if ((0, superAdminSync_1.getConfiguredAdminEmail)()) {
            res.status(403).json({
                message: 'Admin email is set in ADMIN_EMAIL in the backend .env. Change it there and restart the server.',
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
        const existingAdmin = await Admin_1.default.findOne({ email: newEmail });
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
        console.log(`[ADMIN EMAIL CHANGE OTP] current=${admin.email} pending=${newEmail} otp=${otp} expires=${otpExpiry.toISOString()}`);
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
            await (0, email_1.sendOtpEmail)(admin.email, otp, 'verification');
        }
        catch (mailErr) {
            emailSent = false;
            const msg = mailErr instanceof Error ? mailErr.message : String(mailErr);
            console.error('adminRequestEmailChange email error:', msg);
            if (mailErr && typeof mailErr === 'object' && 'response' in mailErr) {
                console.error('adminRequestEmailChange SMTP response:', String(mailErr.response));
            }
        }
        res.status(200).json({
            message: emailSent
                ? `OTP sent to your current email (${admin.email})`
                : 'OTP saved but email delivery failed. Check server logs or EMAIL_USER / EMAIL_PASS.',
            emailSent,
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('adminRequestEmailChange error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.adminRequestEmailChange = adminRequestEmailChange;
/**
 * POST /admin/auth/confirm-email-change (protected)
 */
const adminConfirmEmailChange = async (req, res) => {
    try {
        if ((0, superAdminSync_1.getConfiguredAdminEmail)()) {
            res.status(403).json({
                message: 'Admin email is set in ADMIN_EMAIL in the backend .env. Change it there and restart the server.',
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
        const existingAdmin = await Admin_1.default.findOne({ email: pendingEmail });
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
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('adminConfirmEmailChange error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.adminConfirmEmailChange = adminConfirmEmailChange;
function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
/**
 * GET /admin/users — app users (`users` collection) with filters and pagination.
 * Query: status=all|active|suspended, q=search, range=7d|30d|all, page, limit
 */
const listAppUsers = async (req, res) => {
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
        const common = {};
        if (q) {
            const rx = new RegExp(escapeRegex(q), 'i');
            common.$or = [{ name: rx }, { email: rx }, { phone: rx }];
        }
        if (range === '7d' || range === '30d') {
            const days = range === '7d' ? 7 : 30;
            common.createdAt = { $gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) };
        }
        const listFilter = { ...common };
        if (status === 'active')
            listFilter.suspended = { $ne: true };
        else if (status === 'suspended')
            listFilter.suspended = true;
        const activeCountFilter = { ...common, suspended: { $ne: true } };
        const suspendedCountFilter = { ...common, suspended: true };
        const [total, tabAll, tabActive, tabSuspended, users] = await Promise.all([
            User_1.default.countDocuments(listFilter),
            User_1.default.countDocuments(common),
            User_1.default.countDocuments(activeCountFilter),
            User_1.default.countDocuments(suspendedCountFilter),
            User_1.default.find(listFilter)
                .select('-otp -otpExpiry -passwordHash')
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit),
        ]);
        res.status(200).json({
            users: users.map((u) => (0, authController_1.toApiUser)(u)),
            total,
            page,
            limit,
            tabCounts: { all: tabAll, active: tabActive, suspended: tabSuspended },
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('listAppUsers error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.listAppUsers = listAppUsers;
/**
 * PATCH /admin/users/:id — body: { suspended: boolean }
 */
const updateAppUser = async (req, res) => {
    try {
        const { suspended } = req.body;
        if (typeof suspended !== 'boolean') {
            res.status(400).json({ message: 'suspended (boolean) is required' });
            return;
        }
        const user = await User_1.default.findById(req.params.id);
        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }
        user.suspended = suspended;
        await user.save();
        res.status(200).json({ user: (0, authController_1.toApiUser)(user) });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('updateAppUser error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.updateAppUser = updateAppUser;
/**
 * GET /admin/receivers — all rows in `receivers` collection.
 */
const listAllReceivers = async (_req, res) => {
    try {
        const receivers = await Receiver_1.default.find({})
            .select('-otp -otpExpiry')
            .sort({ createdAt: 1 });
        const list = receivers.map((r) => (0, authController_1.toApiReceiver)(r));
        res.status(200).json({ receivers: list });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('listAllReceivers error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.listAllReceivers = listAllReceivers;
/**
 * GET /admin/kyc/stats — counts for KYC dashboard cards (today = UTC midnight local server).
 */
const getKycStats = async (_req, res) => {
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
            Receiver_1.default.countDocuments({ accountStatus: 'pending_review' }),
            User_1.default.countDocuments(callerAwaitingAccess),
            Receiver_1.default.countDocuments({
                accountStatus: 'approved',
                updatedAt: { $gte: start },
            }),
            Receiver_1.default.countDocuments({
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
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('getKycStats error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.getKycStats = getKycStats;
/**
 * GET /admin/receivers/pending
 */
const listPendingReceivers = async (_req, res) => {
    try {
        const receivers = await Receiver_1.default.find({
            accountStatus: 'pending_review',
        })
            .select('-otp -otpExpiry')
            .sort({ updatedAt: -1 });
        const list = receivers.map((r) => (0, authController_1.toApiReceiver)(r));
        res.status(200).json({ receivers: list });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('listPendingReceivers error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.listPendingReceivers = listPendingReceivers;
/**
 * PATCH /admin/receivers/:id/approve
 */
const approveReceiver = async (req, res) => {
    try {
        const id = req.params.id;
        const receiver = await Receiver_1.default.findById(id);
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
            receiver: (0, authController_1.toApiReceiver)(receiver),
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('approveReceiver error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.approveReceiver = approveReceiver;
/**
 * PATCH /admin/receivers/:id/reject
 */
const rejectReceiver = async (req, res) => {
    try {
        const id = req.params.id;
        const receiver = await Receiver_1.default.findById(id);
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
            receiver: (0, authController_1.toApiReceiver)(receiver),
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('rejectReceiver error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.rejectReceiver = rejectReceiver;
/**
 * GET /admin/users/pending — app users (callers) awaiting approval after voice + profile submit.
 */
const listPendingAppUsers = async (_req, res) => {
    try {
        const users = await User_1.default.find({
            $or: [
                { suspended: true, accountStatus: 'approved' },
                { accountStatus: 'pending_review' },
                { accountStatus: 'rejected', suspended: false },
            ],
        })
            .select('-otp -otpExpiry -passwordHash')
            .sort({ updatedAt: -1 });
        res.status(200).json({ users: users.map((u) => (0, authController_1.toApiUser)(u)) });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('listPendingAppUsers error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.listPendingAppUsers = listPendingAppUsers;
/**
 * PATCH /admin/users/:id/approve — clears caller suspension (access on). Legacy: pending_review/rejected + voice.
 */
const approveAppUser = async (req, res) => {
    try {
        const id = req.params.id;
        const user = await User_1.default.findById(id);
        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }
        if (user.accountStatus === 'pending_profile') {
            res.status(400).json({ message: 'User has not finished onboarding yet' });
            return;
        }
        const legacyNeedVoice = user.accountStatus === 'pending_review' || user.accountStatus === 'rejected';
        const voice = String(user.userAudio ?? '').trim();
        if (legacyNeedVoice && !voice) {
            res.status(400).json({ message: 'Cannot approve: no voice verification audio on file' });
            return;
        }
        const needsRelease = user.suspended ||
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
            user: (0, authController_1.toApiUser)(user),
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('approveAppUser error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.approveAppUser = approveAppUser;
/**
 * PATCH /admin/users/:id/reject — pauses caller access (`suspended: true`); does not use `rejected` status.
 */
const rejectAppUser = async (req, res) => {
    try {
        const id = req.params.id;
        const user = await User_1.default.findById(id);
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
            user: (0, authController_1.toApiUser)(user),
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('rejectAppUser error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.rejectAppUser = rejectAppUser;
/**
 * GET /admin/reports — moderation queue + summary cards.
 */
const listModerationReports = async (req, res) => {
    try {
        const q = String(req.query.q ?? '').trim();
        const status = String(req.query.status ?? 'all').toLowerCase();
        const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '50'), 10) || 50));
        const filter = {};
        if (status === 'pending')
            filter.status = 'pending';
        else if (status === 'resolved')
            filter.status = 'resolved';
        if (q) {
            const rx = new RegExp(escapeRegex(q), 'i');
            filter.$or = [{ preview: rx }, { reason: rx }];
        }
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const [pendingCount, resolvedToday, warnedActions, suspendActions, total, rows] = await Promise.all([
            UserReport_1.default.countDocuments({ status: 'pending' }),
            UserReport_1.default.countDocuments({ status: 'resolved', updatedAt: { $gte: start } }),
            UserReport_1.default.countDocuments({ resolution: 'warned' }),
            UserReport_1.default.countDocuments({ resolution: 'suspended' }),
            UserReport_1.default.countDocuments(filter),
            UserReport_1.default.find(filter)
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
        ]);
        const userIds = new Set();
        const recvIds = new Set();
        for (const r of rows) {
            if (r.reporterKind === 'user')
                userIds.add(String(r.reporterId));
            else
                recvIds.add(String(r.reporterId));
            if (r.reportedKind === 'user')
                userIds.add(String(r.reportedId));
            else
                recvIds.add(String(r.reportedId));
        }
        const [users, receivers] = await Promise.all([
            userIds.size
                ? User_1.default.find({ _id: { $in: [...userIds] } })
                    .select('name')
                    .lean()
                : [],
            recvIds.size
                ? Receiver_1.default.find({ _id: { $in: [...recvIds] } })
                    .select('name')
                    .lean()
                : [],
        ]);
        const uMap = new Map(users.map((u) => [String(u._id), String(u.name ?? '')]));
        const rMap = new Map(receivers.map((r) => [String(r._id), String(r.name ?? '')]));
        const nameFor = (kind, id) => {
            const s = String(id);
            if (kind === 'user')
                return uMap.get(s) || 'Unknown';
            return rMap.get(s) || 'Unknown';
        };
        res.status(200).json({
            stats: {
                pendingReports: pendingCount,
                resolvedToday,
                usersWarned: warnedActions,
                usersSuspended: suspendActions,
            },
            reports: rows.map((r) => ({
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
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('listModerationReports error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.listModerationReports = listModerationReports;
/**
 * PATCH /admin/reports/:id — body `{ action: 'ignore' | 'warn' | 'suspend' }`
 */
const resolveModerationReport = async (req, res) => {
    try {
        const action = String(req.body.action ?? '').toLowerCase();
        if (action !== 'ignore' && action !== 'warn' && action !== 'suspend') {
            res.status(400).json({ message: 'action must be ignore, warn, or suspend' });
            return;
        }
        if (!mongoose_1.default.Types.ObjectId.isValid(req.params.id)) {
            res.status(400).json({ message: 'Invalid report id' });
            return;
        }
        const report = await UserReport_1.default.findById(req.params.id);
        if (!report || report.status !== 'pending') {
            res.status(404).json({ message: 'Report not found or already resolved' });
            return;
        }
        const resolution = action === 'ignore' ? 'ignored' : action === 'warn' ? 'warned' : 'suspended';
        if (resolution !== 'ignored') {
            if (report.reportedKind === 'user') {
                const u = await User_1.default.findById(report.reportedId);
                if (!u) {
                    res.status(404).json({ message: 'Reported user missing' });
                    return;
                }
                if (resolution === 'warned') {
                    u.moderationWarningAt = new Date();
                }
                else {
                    u.suspended = true;
                }
                await u.save();
            }
            else {
                const recv = await Receiver_1.default.findById(report.reportedId);
                if (!recv) {
                    res.status(404).json({ message: 'Reported receiver missing' });
                    return;
                }
                if (resolution === 'warned') {
                    recv.moderationWarningAt = new Date();
                }
                else {
                    recv.suspended = true;
                }
                await recv.save();
            }
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
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('resolveModerationReport error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.resolveModerationReport = resolveModerationReport;
