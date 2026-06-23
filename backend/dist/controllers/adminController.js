"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveWithdrawal = exports.listWithdrawals = exports.resolveModerationReport = exports.listModerationReports = exports.rejectAppUser = exports.approveAppUser = exports.listPendingAppUsers = exports.rejectReceiver = exports.approveReceiver = exports.listPendingReceivers = exports.getKycStats = exports.listAllReceivers = exports.updateReceiver = exports.updateAppUser = exports.listAppUsers = exports.getOverviewDashboard = exports.getRevenueDashboard = exports.updateAdminRole = exports.updateAdminCallerNotification = exports.updateAdminReceiverWelcome = exports.updateAdminReceiverEarningModel = exports.updateAdminNotificationControls = exports.getAdminSettings = exports.adminConfirmEmailChange = exports.adminRequestEmailChange = exports.adminResetPassword = exports.adminForgotPassword = exports.adminMe = exports.adminLogin = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const mongoose_1 = __importDefault(require("mongoose"));
const Admin_1 = __importDefault(require("../models/Admin"));
const Receiver_1 = __importDefault(require("../models/Receiver"));
const User_1 = __importDefault(require("../models/User"));
const UserReport_1 = __importDefault(require("../models/UserReport"));
const WithdrawalRequest_1 = __importDefault(require("../models/WithdrawalRequest"));
const CallSession_1 = __importDefault(require("../models/CallSession"));
const ReceiverRating_1 = __importDefault(require("../models/ReceiverRating"));
const ChatMessage_1 = __importDefault(require("../models/ChatMessage"));
const AdminSettings_1 = __importDefault(require("../models/AdminSettings"));
const receiverEarningModel_1 = require("../services/receiverEarningModel");
const adminEarningsService_1 = require("../services/adminEarningsService");
const receiverEarningsAggregate_1 = require("../services/receiverEarningsAggregate");
const chatPricing_1 = require("../constants/chatPricing");
const receiverWelcome_1 = require("../services/receiverWelcome");
const callerNotification_1 = require("../services/callerNotification");
const authController_1 = require("./authController");
const email_1 = require("../config/email");
const superAdminSync_1 = require("../services/superAdminSync");
const razorpayXPayoutService_1 = require("../services/razorpayXPayoutService");
const socketRegistry_1 = require("../socket/socketRegistry");
const authSessionService_1 = require("../services/authSessionService");
const phoneNormalize_1 = require("../utils/phoneNormalize");
const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const signAdminToken = (adminId) => {
    const secret = process.env.ADMIN_JWT_SECRET;
    if (!secret) {
        throw new Error('ADMIN_JWT_SECRET is not set');
    }
    const payload = { adminId, typ: 'admin' };
    return jsonwebtoken_1.default.sign(payload, secret, { expiresIn: '7d' });
};
function isSuperAdmin(req) {
    return req.admin?.role === 'super_admin';
}
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
/**
 * GET /admin/settings — notification controls + role management data.
 */
const getAdminSettings = async (req, res) => {
    try {
        const settings = await AdminSettings_1.default.findOne({});
        const effective = settings ?? (await AdminSettings_1.default.create({}));
        const admins = await Admin_1.default.find({})
            .select('_id name email role createdAt')
            .sort({ createdAt: 1 })
            .lean();
        const earningModel = effective.receiverEarningModel === 'fixed_per_minute' ? 'fixed_per_minute' : receiverEarningModel_1.DEFAULT_RECEIVER_EARNING_MODEL;
        const fixedPerMinuteWindows = (0, receiverEarningModel_1.normalizeFixedPerMinuteWindows)(effective.fixedPerMinuteWindows?.length
            ? effective.fixedPerMinuteWindows
            : receiverEarningModel_1.DEFAULT_FIXED_PER_MINUTE_WINDOWS);
        const receiverWelcome = (0, receiverWelcome_1.normalizeReceiverWelcome)(effective.receiverWelcome);
        const callerNotification = (0, callerNotification_1.normalizeCallerNotification)(effective.callerNotification);
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
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('getAdminSettings error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.getAdminSettings = getAdminSettings;
/**
 * PATCH /admin/settings/notifications
 */
const updateAdminNotificationControls = async (req, res) => {
    try {
        const body = req.body ?? {};
        if (typeof body.kycSubmissionsEmail !== 'boolean' ||
            typeof body.pendingWithdrawalsEmail !== 'boolean' ||
            typeof body.dailyRevenueSummaryEmail !== 'boolean') {
            res.status(400).json({
                message: 'kycSubmissionsEmail, pendingWithdrawalsEmail, and dailyRevenueSummaryEmail booleans are required',
            });
            return;
        }
        const settings = await AdminSettings_1.default.findOneAndUpdate({}, {
            $set: {
                notificationControls: {
                    kycSubmissionsEmail: body.kycSubmissionsEmail,
                    pendingWithdrawalsEmail: body.pendingWithdrawalsEmail,
                    dailyRevenueSummaryEmail: body.dailyRevenueSummaryEmail,
                },
            },
        }, { new: true, upsert: true, setDefaultsOnInsert: true });
        res.status(200).json({
            ok: true,
            notificationControls: settings.notificationControls,
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('updateAdminNotificationControls error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.updateAdminNotificationControls = updateAdminNotificationControls;
/**
 * PATCH /admin/settings/earning-model
 */
const updateAdminReceiverEarningModel = async (req, res) => {
    try {
        const body = req.body ?? {};
        const model = body.receiverEarningModel;
        if (model !== 'score_based' && model !== 'fixed_per_minute') {
            res.status(400).json({ message: 'receiverEarningModel must be score_based or fixed_per_minute' });
            return;
        }
        const windows = model === 'fixed_per_minute'
            ? (0, receiverEarningModel_1.normalizeFixedPerMinuteWindows)(body.fixedPerMinuteWindows ?? receiverEarningModel_1.DEFAULT_FIXED_PER_MINUTE_WINDOWS)
            : (0, receiverEarningModel_1.normalizeFixedPerMinuteWindows)((await AdminSettings_1.default.findOne({}).select('fixedPerMinuteWindows').lean())?.fixedPerMinuteWindows ??
                receiverEarningModel_1.DEFAULT_FIXED_PER_MINUTE_WINDOWS);
        const settings = await AdminSettings_1.default.findOneAndUpdate({}, {
            $set: {
                receiverEarningModel: model,
                fixedPerMinuteWindows: windows,
            },
        }, { new: true, upsert: true, setDefaultsOnInsert: true });
        (0, receiverEarningModel_1.clearReceiverEarningSettingsCache)();
        const payload = (0, receiverEarningModel_1.publicEarningSchedulePayload)({
            receiverEarningModel: settings.receiverEarningModel,
            fixedPerMinuteWindows: (0, receiverEarningModel_1.normalizeFixedPerMinuteWindows)(settings.fixedPerMinuteWindows),
        });
        res.status(200).json({
            ok: true,
            receiverEarningModel: payload.receiverEarningModel,
            fixedPerMinuteWindows: payload.fixedPerMinuteWindows,
            earningTimezone: payload.timezone,
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('updateAdminReceiverEarningModel error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.updateAdminReceiverEarningModel = updateAdminReceiverEarningModel;
/**
 * PATCH /admin/settings/receiver-welcome — home card copy for receivers.
 */
const updateAdminReceiverWelcome = async (req, res) => {
    try {
        const body = req.body ?? {};
        if (typeof body.enabled !== 'boolean') {
            res.status(400).json({ message: 'enabled boolean is required' });
            return;
        }
        const receiverWelcome = (0, receiverWelcome_1.normalizeReceiverWelcome)({
            enabled: body.enabled,
            title: body.title,
            body: body.body,
        });
        const settings = await AdminSettings_1.default.findOneAndUpdate({}, { $set: { receiverWelcome } }, { new: true, upsert: true, setDefaultsOnInsert: true });
        res.status(200).json({
            ok: true,
            receiverWelcome: (0, receiverWelcome_1.normalizeReceiverWelcome)(settings.receiverWelcome),
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('updateAdminReceiverWelcome error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.updateAdminReceiverWelcome = updateAdminReceiverWelcome;
/**
 * PATCH /admin/settings/caller-notification — home card copy for callers.
 */
const updateAdminCallerNotification = async (req, res) => {
    try {
        const body = req.body ?? {};
        if (typeof body.enabled !== 'boolean') {
            res.status(400).json({ message: 'enabled boolean is required' });
            return;
        }
        const callerNotification = (0, callerNotification_1.normalizeCallerNotification)({
            enabled: body.enabled,
            title: body.title,
            body: body.body,
        });
        const settings = await AdminSettings_1.default.findOneAndUpdate({}, { $set: { callerNotification } }, { new: true, upsert: true, setDefaultsOnInsert: true });
        res.status(200).json({
            ok: true,
            callerNotification: (0, callerNotification_1.normalizeCallerNotification)(settings.callerNotification),
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('updateAdminCallerNotification error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.updateAdminCallerNotification = updateAdminCallerNotification;
/**
 * PATCH /admin/settings/admins/:id/role — super_admin only.
 */
const updateAdminRole = async (req, res) => {
    try {
        if (!isSuperAdmin(req)) {
            res.status(403).json({ message: 'Only super admin can change admin roles' });
            return;
        }
        if (!mongoose_1.default.Types.ObjectId.isValid(req.params.id)) {
            res.status(400).json({ message: 'Invalid admin id' });
            return;
        }
        const role = String(req.body.role ?? '').trim();
        if (role !== 'super_admin' && role !== 'support_admin' && role !== 'finance_admin') {
            res.status(400).json({ message: 'role must be super_admin, support_admin, or finance_admin' });
            return;
        }
        const target = await Admin_1.default.findById(req.params.id);
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
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('updateAdminRole error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.updateAdminRole = updateAdminRole;
function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function roundInr(n) {
    return Math.round(n * 100) / 100;
}
function roundRating(n) {
    return Math.round(n * 10) / 10;
}
function toRangeStart(range) {
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
const getRevenueDashboard = async (req, res) => {
    try {
        const range = String(req.query.range ?? '7d').toLowerCase();
        if (range !== '7d' && range !== '30d' && range !== 'all') {
            res.status(400).json({ message: 'range must be 7d, 30d, or all' });
            return;
        }
        const start = toRangeStart(range);
        const { cards, dailyBreakdown, topEarners } = await (0, adminEarningsService_1.getRevenueDashboardMetrics)(start);
        res.status(200).json({
            cards,
            dailyBreakdown,
            topEarners,
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('getRevenueDashboard error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.getRevenueDashboard = getRevenueDashboard;
/**
 * GET /admin/overview — dynamic top-level dashboard snapshot.
 */
const getOverviewDashboard = async (req, res) => {
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
        const [platformRevenue, calls, chats, activeReceivers, activeUsers, pendingKycApprovals, pendingWithdrawals, flaggedReports, allReceiverIds] = await Promise.all([
            (0, adminEarningsService_1.getPlatformRevenueForRange)(start),
            CallSession_1.default.find({
                status: 'completed',
                ...(start ? { startedAt: { $gte: start } } : {}),
            })
                .select('startedAt settledAmountInr')
                .lean(),
            ChatMessage_1.default.find({
                senderType: 'u',
                feeInr: { $gt: 0 },
                ...(start ? { createdAt: { $gte: start } } : {}),
            })
                .select('createdAt')
                .lean(),
            Receiver_1.default.countDocuments({ accountStatus: 'approved', suspended: { $ne: true } }),
            User_1.default.countDocuments({ accountStatus: 'approved', suspended: { $ne: true } }),
            Receiver_1.default.countDocuments({ accountStatus: 'pending_review' }),
            WithdrawalRequest_1.default.countDocuments({ status: 'pending' }),
            UserReport_1.default.countDocuments({ status: 'pending' }),
            Receiver_1.default.find({}).select('_id').lean(),
        ]);
        const earningsRollups = await (0, receiverEarningsAggregate_1.aggregateReceiverEarningsByReceiver)(allReceiverIds.map((r) => r._id), todayStart, weekStart, monthStart);
        const earningsPeriod = range === 'all' ? 'lifetime' : range === '30d' ? 'last30Days' : 'last7Days';
        const receiverEarningsSum = (0, receiverEarningsAggregate_1.sumReceiverEarningsRollup)(earningsRollups.values(), earningsPeriod).earnings;
        const totalRevenue = platformRevenue.callerGross;
        const adminEarnings = roundInr(Math.max(0, totalRevenue - receiverEarningsSum));
        const totalCalls = calls.length;
        const trendByDay = new Map();
        for (const c of calls) {
            const gross = roundInr(Number(c.settledAmountInr || 0));
            const day = new Date(c.startedAt).toISOString().slice(0, 10);
            trendByDay.set(day, roundInr((trendByDay.get(day) || 0) + gross));
        }
        for (const m of chats) {
            const gross = roundInr(chatPricing_1.CHAT_TEXT_CHARGE_INR);
            const day = new Date(m.createdAt).toISOString().slice(0, 10);
            trendByDay.set(day, roundInr((trendByDay.get(day) || 0) + gross));
        }
        // For chart, return last 7 buckets ending today.
        const trend = [];
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
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('getOverviewDashboard error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.getOverviewDashboard = getOverviewDashboard;
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
function isValidIndianMobile(ten) {
    return /^[6-9]\d{9}$/.test(ten);
}
const PRESET_PROFILE_IMAGE_RE = /^preset:(male|female):\d+$/i;
function optionalHttpsUrl(raw, field) {
    if (raw === null)
        return null;
    if (typeof raw !== 'string')
        return undefined;
    const v = raw.trim();
    if (!v)
        return null;
    if (!/^https?:\/\//i.test(v)) {
        throw new Error(`${field} must be a valid http(s) URL`);
    }
    return v;
}
/** App stores bundled avatars as `preset:male:1` / `preset:female:15` — not Cloudinary URLs. */
function optionalProfileImageValue(raw, field) {
    if (raw === null)
        return null;
    if (typeof raw !== 'string')
        return undefined;
    const v = raw.trim();
    if (!v)
        return null;
    if (PRESET_PROFILE_IMAGE_RE.test(v))
        return v;
    if (/^https?:\/\//i.test(v))
        return v;
    throw new Error(`${field} must be a valid http(s) URL or a bundled preset id (preset:male:N / preset:female:N)`);
}
/**
 * PATCH /admin/users/:id — partial profile update (includes legacy `{ suspended }` only).
 */
const updateAppUser = async (req, res) => {
    try {
        const body = req.body ?? {};
        const keys = Object.keys(body).filter((k) => body[k] !== undefined);
        if (keys.length === 0) {
            res.status(400).json({ message: 'At least one field to update is required' });
            return;
        }
        const user = await User_1.default.findById(req.params.id);
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
            const canonical = (0, phoneNormalize_1.normalizeIndianMobilePhone)(body.phone);
            if (!isValidIndianMobile(canonical)) {
                res.status(400).json({ message: 'phone must be a valid 10-digit Indian mobile number' });
                return;
            }
            const variants = (0, phoneNormalize_1.phoneLookupVariants)(canonical);
            const dup = await User_1.default.findOne({
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
                if (url !== undefined)
                    user.profileImage = url;
            }
            catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                res.status(400).json({ message: msg });
                return;
            }
        }
        if (body.userAudio !== undefined) {
            try {
                const url = optionalHttpsUrl(body.userAudio, 'userAudio');
                if (url !== undefined)
                    user.userAudio = url;
            }
            catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                res.status(400).json({ message: msg });
                return;
            }
        }
        if (typeof body.gender === 'string') {
            const g = body.gender.trim();
            if (g === 'male' || g === 'female' || g === 'other') {
                user.gender = g;
            }
            else {
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
 * PATCH /admin/receivers/:id — partial receiver profile update (admin only).
 */
const updateReceiver = async (req, res) => {
    try {
        const body = req.body ?? {};
        const keys = Object.keys(body).filter((k) => body[k] !== undefined);
        if (keys.length === 0) {
            res.status(400).json({ message: 'At least one field to update is required' });
            return;
        }
        const receiver = await Receiver_1.default.findById(req.params.id);
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
            const canonical = (0, phoneNormalize_1.normalizeIndianMobilePhone)(body.phone);
            if (!isValidIndianMobile(canonical)) {
                res.status(400).json({ message: 'phone must be a valid 10-digit Indian mobile number' });
                return;
            }
            const variants = (0, phoneNormalize_1.phoneLookupVariants)(canonical);
            const dup = await Receiver_1.default.findOne({
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
                if (url !== undefined)
                    receiver.profileImage = url;
            }
            catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                res.status(400).json({ message: msg });
                return;
            }
        }
        if (body.userAudio !== undefined) {
            try {
                const url = optionalHttpsUrl(body.userAudio, 'userAudio');
                if (url !== undefined)
                    receiver.userAudio = url;
            }
            catch (e) {
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
        ]) {
            const raw = body[key];
            if (raw !== undefined) {
                try {
                    const url = optionalHttpsUrl(raw, field);
                    if (url !== undefined)
                        receiver[field] = url;
                }
                catch (e) {
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
            }
            else {
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
        res.status(200).json({ receiver: (0, authController_1.toApiReceiver)(receiver) });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('updateReceiver error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.updateReceiver = updateReceiver;
/**
 * GET /admin/receivers — all rows in `receivers` collection.
 */
const listAllReceivers = async (_req, res) => {
    try {
        const receivers = await Receiver_1.default.find({})
            .select('-otp -otpExpiry')
            .sort({ createdAt: 1 });
        const receiverIds = receivers.map((r) => r._id);
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const weekStart = toRangeStart('7d') ?? todayStart;
        const monthStart = toRangeStart('30d') ?? todayStart;
        const [ratingRows, earningsByReceiver] = await Promise.all([
            receiverIds.length === 0
                ? Promise.resolve([])
                : ReceiverRating_1.default.aggregate([
                    { $match: { receiverId: { $in: receiverIds } } },
                    {
                        $group: {
                            _id: '$receiverId',
                            avg: { $avg: '$rating' },
                            count: { $sum: 1 },
                        },
                    },
                ]),
            (0, receiverEarningsAggregate_1.aggregateReceiverEarningsByReceiver)(receiverIds, todayStart, weekStart, monthStart),
        ]);
        const ratingByReceiverId = new Map(ratingRows.map((row) => [
            String(row._id),
            {
                avg: Number.isFinite(row.avg) ? roundRating(row.avg) : 0,
                count: row.count ?? 0,
            },
        ]));
        const list = receivers.map((r) => {
            const base = (0, authController_1.toApiReceiver)(r);
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
        const callerAwaitingAccess = { accountStatus: 'pending_review' };
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
        const canApprove = receiver.accountStatus === 'pending_review' ||
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
        (0, socketRegistry_1.emitReceiverApproved)(String(receiver._id));
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
        const reasonRaw = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';
        const reason = reasonRaw || 'Your KYC details were not approved. Please edit and resubmit.';
        const receiver = await Receiver_1.default.findById(id);
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
        const sessionVersion = await (0, authSessionService_1.bumpReceiverAuthSession)(String(receiver._id));
        (0, socketRegistry_1.emitAuthSessionSuperseded)('r', String(receiver._id), sessionVersion);
        (0, socketRegistry_1.emitReceiverRejected)(String(receiver._id), reason);
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
 * GET /admin/users/pending — app users (callers) awaiting verification.
 */
const listPendingAppUsers = async (_req, res) => {
    try {
        const users = await User_1.default.find({ accountStatus: 'pending_review' })
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
 * PATCH /admin/users/:id/approve — approves caller verification and enables access.
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
        (0, socketRegistry_1.emitCallerApproved)(String(user._id));
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
 * PATCH /admin/users/:id/reject — rejects caller verification and keeps dashboard blocked.
 */
const rejectAppUser = async (req, res) => {
    try {
        const id = req.params.id;
        const reason = 'Your profile verification was not approved.';
        const user = await User_1.default.findById(id);
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
        (0, socketRegistry_1.emitCallerRejected)(String(user._id), reason);
        res.status(200).json({
            message: 'Verification rejected',
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
        if (!report) {
            res.status(404).json({ message: 'Report not found' });
            return;
        }
        const previousResolution = report.resolution;
        const resolution = action === 'ignore' ? 'ignored' : action === 'warn' ? 'warned' : 'suspended';
        if (report.reportedKind === 'user') {
            const u = await User_1.default.findById(report.reportedId);
            if (!u) {
                res.status(404).json({ message: 'Reported user missing' });
                return;
            }
            if (resolution === 'warned') {
                u.moderationWarningAt = new Date();
            }
            if (resolution === 'suspended') {
                u.suspended = true;
            }
            else if (previousResolution === 'suspended' && u.suspended) {
                const hasOtherSuspensionReport = await UserReport_1.default.exists({
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
            if (resolution === 'suspended') {
                recv.suspended = true;
            }
            else if (previousResolution === 'suspended' && recv.suspended) {
                const hasOtherSuspensionReport = await UserReport_1.default.exists({
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
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('resolveModerationReport error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.resolveModerationReport = resolveModerationReport;
/**
 * GET /admin/withdrawals — list + cards for withdrawal dashboard.
 */
const listWithdrawals = async (req, res) => {
    try {
        const range = String(req.query.range ?? '7d').toLowerCase();
        const status = String(req.query.status ?? 'all').toLowerCase();
        const q = String(req.query.q ?? '').trim();
        const page = Math.max(1, Number(req.query.page ?? 1) || 1);
        const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20) || 20));
        const skip = (page - 1) * limit;
        const statusFilter = { status: { $ne: 'verification_pending' } };
        if (status === 'pending' || status === 'approved' || status === 'rejected') {
            statusFilter.status = status;
        }
        const now = new Date();
        const since = new Date(now);
        if (range === '7d')
            since.setDate(now.getDate() - 7);
        else if (range === '30d')
            since.setDate(now.getDate() - 30);
        const periodFilter = range === 'all' ? {} : { createdAt: { $gte: since } };
        const baseFilter = { ...statusFilter, ...periodFilter };
        const [pendingRows, approvedTodayRows, rejectedTodayRows, approvedAllRows, totalBase] = await Promise.all([
            WithdrawalRequest_1.default.find({ status: 'pending' }).select('amount').lean(),
            WithdrawalRequest_1.default.find({
                status: 'approved',
                reviewedAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
            })
                .select('amount')
                .lean(),
            WithdrawalRequest_1.default.find({
                status: 'rejected',
                reviewedAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
            })
                .select('amount')
                .lean(),
            WithdrawalRequest_1.default.find({ status: 'approved' }).select('amount reviewedAt').lean(),
            WithdrawalRequest_1.default.countDocuments(baseFilter),
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
        const receiverCandidates = q.length === 0
            ? []
            : await Receiver_1.default.find({
                $or: [
                    { name: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
                    { email: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
                ],
            })
                .select('_id')
                .lean();
        const receiverIdsFromSearch = receiverCandidates.map((r) => r._id);
        const listFilter = { ...baseFilter };
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
        const rows = await WithdrawalRequest_1.default.find(listFilter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();
        const receiverIds = [...new Set(rows.map((row) => String(row.receiverId)))];
        const receivers = await Receiver_1.default.find({ _id: { $in: receiverIds } })
            .select('_id name')
            .lean();
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
                    payoutMethod: isUpi ? 'upi' : 'bank',
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
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('listWithdrawals error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.listWithdrawals = listWithdrawals;
/**
 * PATCH /admin/withdrawals/:id — body `{ action: 'approve' | 'reject' }`
 */
const resolveWithdrawal = async (req, res) => {
    try {
        const action = String(req.body.action ?? '').toLowerCase();
        if (action !== 'approve' && action !== 'reject') {
            res.status(400).json({ message: 'action must be approve or reject' });
            return;
        }
        if (!mongoose_1.default.Types.ObjectId.isValid(req.params.id)) {
            res.status(400).json({ message: 'Invalid withdrawal id' });
            return;
        }
        const nextStatus = action === 'approve' ? 'approved' : 'rejected';
        let payoutShouldStart = false;
        const session = await mongoose_1.default.startSession();
        try {
            await session.withTransaction(async () => {
                const withdrawal = await WithdrawalRequest_1.default.findById(req.params.id).session(session);
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
                const receiver = await Receiver_1.default.findById(withdrawal.receiverId).session(session).select('walletBalance');
                if (!receiver)
                    throw new Error('ReceiverNotFound');
                if (previousStatus === 'pending' && nextStatus === 'approved') {
                    if (receiver.walletBalance < withdrawal.amount) {
                        throw new Error('CannotApprove:InsufficientRefundBalance');
                    }
                    receiver.walletBalance = Math.round((receiver.walletBalance - withdrawal.amount) * 100) / 100;
                    await receiver.save();
                }
                else if (previousStatus === 'rejected' && nextStatus === 'approved') {
                    if (receiver.walletBalance < withdrawal.amount) {
                        throw new Error('CannotApprove:InsufficientRefundBalance');
                    }
                    receiver.walletBalance = Math.round((receiver.walletBalance - withdrawal.amount) * 100) / 100;
                    await receiver.save();
                }
                withdrawal.status = nextStatus;
                withdrawal.reviewedAt = new Date();
                withdrawal.reviewedByAdminId = req.admin?._id
                    ? new mongoose_1.default.Types.ObjectId(String(req.admin._id))
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
                }
                else if (previousStatus === 'pending' && nextStatus === 'rejected') {
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
        }
        finally {
            await session.endSession();
        }
        // Only start payout after DB is updated.
        if (payoutShouldStart) {
            void (0, razorpayXPayoutService_1.trackAndFinalizeRazorpayXPayout)(req.params.id).catch((e) => {
                const msg = e instanceof Error ? e.message : String(e);
                console.error('RazorpayX payout tracker error:', msg);
            });
        }
        // Transaction may throw for known errors; map them to responses.
        res.status(200).json({ ok: true });
    }
    catch (err) {
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
exports.resolveWithdrawal = resolveWithdrawal;
