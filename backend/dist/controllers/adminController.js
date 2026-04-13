"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rejectReceiver = exports.approveReceiver = exports.listPendingReceivers = exports.getKycStats = exports.listAllReceivers = exports.updateAppUser = exports.listAppUsers = exports.adminConfirmEmailChange = exports.adminRequestEmailChange = exports.adminResetPassword = exports.adminForgotPassword = exports.adminMe = exports.adminLogin = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const Admin_1 = __importDefault(require("../models/Admin"));
const Receiver_1 = __importDefault(require("../models/Receiver"));
const User_1 = __importDefault(require("../models/User"));
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
        const [pendingApprovals, approvedToday, rejectedToday] = await Promise.all([
            Receiver_1.default.countDocuments({ accountStatus: 'pending_review' }),
            Receiver_1.default.countDocuments({
                accountStatus: 'approved',
                updatedAt: { $gte: start },
            }),
            Receiver_1.default.countDocuments({
                accountStatus: 'rejected',
                updatedAt: { $gte: start },
            }),
        ]);
        res.status(200).json({ pendingApprovals, approvedToday, rejectedToday });
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
