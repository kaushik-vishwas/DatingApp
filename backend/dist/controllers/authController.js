"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMe = exports.completeMobileSignup = exports.verifyOtpMobile = exports.sendOtpMobile = exports.lookupPhone = exports.verifyOtp = exports.sendOtp = exports.resetPassword = exports.forgotPassword = exports.login = exports.register = void 0;
exports.toApiUser = toApiUser;
exports.toApiReceiver = toApiReceiver;
exports.toSafeUser = toSafeUser;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const User_1 = __importDefault(require("../models/User"));
const Receiver_1 = __importStar(require("../models/Receiver"));
const accountAccess_1 = require("../utils/accountAccess");
const authToken_1 = require("../utils/authToken");
const authSessionService_1 = require("../services/authSessionService");
const socketRegistry_1 = require("../socket/socketRegistry");
const apiTraceLog_1 = require("../utils/apiTraceLog");
const phoneNormalize_1 = require("../utils/phoneNormalize");
const referralService_1 = require("../services/referralService");
const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const pendingReceiverSignups = new Map();
/** OTP for brand-new numbers before gender-based account creation. */
const pendingMobileSignups = new Map();
/** Phones that passed OTP but still need gender selection (value = expiry). */
const verifiedMobilePhones = new Map();
const VERIFIED_MOBILE_TTL_MS = 15 * 60 * 1000;
function clearExpiredPendingReceiverSignups() {
    const now = Date.now();
    for (const [phone, row] of pendingReceiverSignups.entries()) {
        if (row.otpExpiry.getTime() <= now)
            pendingReceiverSignups.delete(phone);
    }
}
function clearExpiredPendingMobileSignups() {
    const now = Date.now();
    for (const [phone, row] of pendingMobileSignups.entries()) {
        if (row.otpExpiry.getTime() <= now)
            pendingMobileSignups.delete(phone);
    }
}
function clearExpiredVerifiedMobilePhones() {
    const now = Date.now();
    for (const [phone, expiry] of verifiedMobilePhones.entries()) {
        if (expiry.getTime() <= now)
            verifiedMobilePhones.delete(phone);
    }
}
async function findUserByPhone(phone) {
    const variants = (0, phoneNormalize_1.phoneLookupVariants)(phone);
    if (!variants.length)
        return null;
    return User_1.default.findOne({ phone: { $in: variants } });
}
async function findReceiverByPhone(phone) {
    const variants = (0, phoneNormalize_1.phoneLookupVariants)(phone);
    if (!variants.length)
        return null;
    return Receiver_1.default.findOne({ phone: { $in: variants } });
}
async function resolvePhoneAccountType(phoneDigits) {
    const [user, receiver] = await Promise.all([
        findUserByPhone(phoneDigits),
        findReceiverByPhone(phoneDigits),
    ]);
    if (user)
        return 'user';
    if (receiver)
        return 'receiver';
    return null;
}
function generateOtpCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
}
async function saveOtpOnDoc(doc, label) {
    const otp = generateOtpCode();
    const otpExpiry = new Date(Date.now() + OTP_TTL_MS);
    doc.otp = otp;
    doc.otpExpiry = otpExpiry;
    await doc.save();
    console.log(`[OTP TEST] ${label}:${doc.phone} → OTP: ${otp}`);
}
function iso(d) {
    return d.toISOString();
}
function roundScoreField(n) {
    const x = typeof n === 'number' && Number.isFinite(n) ? n : 0;
    return Math.round(x * 100) / 100;
}
function toApiUser(user) {
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
        nameAsPerAadhaar: null,
        upiId: null,
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
function toApiReceiver(receiver) {
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
        nameAsPerAadhaar: r.nameAsPerAadhaar ?? null,
        upiId: r.upiId ?? null,
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
        walletBalance: typeof r.walletBalance === 'number' && Number.isFinite(r.walletBalance) ? r.walletBalance : 0,
        audioCallRate: Receiver_1.RECEIVER_AUDIO_CALL_RATE_INR_PER_MIN,
        userAudio: typeof r.userAudio === 'string' ? r.userAudio : null,
        isAvailable: Boolean(r.isAvailable),
        isOnline: Boolean(r.isOnline),
        rejectionReason: r.rejectionReason ?? null,
        cumulativeScore: roundScoreField(r.cumulativeScore),
        badgeLevel: r.badgeLevel === 'diamond' || r.badgeLevel === 'supreme' || r.badgeLevel === 'platinum'
            ? r.badgeLevel
            : 'platinum',
        earningRatePerMinute: roundScoreField(r.earningRatePerMinute),
    };
}
/** Prefer toApiUser / toApiReceiver — resolves by Mongoose modelName */
function toSafeUser(doc) {
    const modelName = doc.constructor?.modelName;
    if (modelName === 'User')
        return toApiUser(doc);
    return toApiReceiver(doc);
}
async function phoneTaken(phone) {
    const variants = (0, phoneNormalize_1.phoneLookupVariants)(phone);
    if (!variants.length)
        return false;
    const [u, r] = await Promise.all([
        User_1.default.exists({ phone: { $in: variants } }),
        Receiver_1.default.exists({ phone: { $in: variants } }),
    ]);
    return Boolean(u || r);
}
/**
 * POST /auth/register — creates a row in `users` (caller) or `receivers` (receiver / both).
 */
const register = async (req, res) => {
    const t = (0, apiTraceLog_1.beginApiTrace)('POST /auth/register', req, res);
    try {
        const { name, phone, role, referralCode } = req.body;
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
        const allowed = ['caller', 'receiver', 'both'];
        const userRole = role && allowed.includes(role) ? role : 'receiver';
        const resolvedName = typeof name === 'string' && name.trim() ? String(name).trim() : `Member ${phoneDigits.slice(-4)}`;
        if (userRole === 'caller') {
            const user = await User_1.default.create({
                name: resolvedName,
                phone: phoneDigits,
                isVerified: false,
                passwordHash: null,
                referralCode: await (0, referralService_1.generateUniqueReferralCode)(),
            });
            void (0, referralService_1.applyReferralRewardOnSignup)({
                referralCode,
                referredKind: 'user',
                referredId: String(user._id),
                referredPhone: phoneDigits,
            }).catch((e) => {
                console.error('[referral] register caller hook error:', e instanceof Error ? e.message : String(e));
            });
            t.log('register_ok_caller');
            t.json(201, {
                message: 'User registered successfully',
                user: toApiUser(user),
            });
            return;
        }
        const receiver = await Receiver_1.default.create({
            name: resolvedName,
            phone: phoneDigits,
            isVerified: false,
            passwordHash: null,
            audioCallRate: Receiver_1.RECEIVER_AUDIO_CALL_RATE_INR_PER_MIN,
            referralCode: await (0, referralService_1.generateUniqueReferralCode)(),
        });
        void (0, referralService_1.applyReferralRewardOnSignup)({
            referralCode,
            referredKind: 'receiver',
            referredId: String(receiver._id),
            referredPhone: phoneDigits,
        }).catch((e) => {
            console.error('[referral] register receiver hook error:', e instanceof Error ? e.message : String(e));
        });
        t.log('register_ok_receiver');
        t.json(201, {
            message: 'User registered successfully',
            user: toApiReceiver(receiver),
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        t.logFullError('register_unhandled', err, { mongoCode: (0, apiTraceLog_1.mongoErrCode)(err) });
        t.json(500, {
            message: msg || 'Server error',
            error: 'REGISTER_FAILED',
        });
    }
};
exports.register = register;
/**
 * POST /auth/login — body.accountType: `user` | `receiver`
 */
const login = async (req, res) => {
    const t = (0, apiTraceLog_1.beginApiTrace)('POST /auth/login', req, res);
    try {
        t.warn('login_deprecated');
        t.json(400, {
            message: 'Password login is disabled. Use mobile OTP.',
            error: 'LOGIN_DEPRECATED',
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        t.logFullError('login_unhandled', err, { mongoCode: (0, apiTraceLog_1.mongoErrCode)(err) });
        t.json(500, { message: msg || 'Server error', error: 'LOGIN_FAILED' });
    }
};
exports.login = login;
const forgotPassword = async (req, res) => {
    const genericMessage = 'If an account exists with this phone number, a reset code has been sent.';
    const t = (0, apiTraceLog_1.beginApiTrace)('POST /auth/forgot-password', req, res);
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
        const doc = accountType === 'user'
            ? await User_1.default.findOne({ phone: phoneDigits })
            : await Receiver_1.default.findOne({ phone: phoneDigits });
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
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        t.logFullError('forgot_password_unhandled', err, { mongoCode: (0, apiTraceLog_1.mongoErrCode)(err) });
        t.json(500, { message: msg || 'Server error', error: 'FORGOT_PASSWORD_FAILED' });
    }
};
exports.forgotPassword = forgotPassword;
const resetPassword = async (req, res) => {
    const t = (0, apiTraceLog_1.beginApiTrace)('POST /auth/reset-password', req, res);
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
        const finishReset = async (doc) => {
            doc.passwordHash = await bcryptjs_1.default.hash(plain, 10);
            doc.otp = null;
            doc.otpExpiry = null;
            doc.isVerified = true;
            await doc.save();
            const typ = accountType === 'user' ? 'u' : 'r';
            const sv = accountType === 'user'
                ? await (0, authSessionService_1.bumpUserAuthSession)(String(doc._id))
                : await (0, authSessionService_1.bumpReceiverAuthSession)(String(doc._id));
            (0, socketRegistry_1.emitAuthSessionSuperseded)(typ, String(doc._id), sv);
            const token = (0, authToken_1.signAppAccessToken)(String(doc._id), typ, sv);
            const userJson = accountType === 'user' ? toApiUser(doc) : toApiReceiver(doc);
            return { token, userJson };
        };
        if (accountType === 'user') {
            const doc = await User_1.default.findOne({ phone: phoneDigits }).select('+passwordHash');
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
        const doc = await Receiver_1.default.findOne({ phone: phoneDigits }).select('+passwordHash');
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
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        t.logFullError('reset_password_unhandled', err, { mongoCode: (0, apiTraceLog_1.mongoErrCode)(err) });
        t.json(500, { message: msg || 'Server error', error: 'RESET_PASSWORD_FAILED' });
    }
};
exports.resetPassword = resetPassword;
const sendOtp = async (req, res) => {
    const t = (0, apiTraceLog_1.beginApiTrace)('POST /auth/send-otp', req, res);
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
        const doc = accountType === 'user'
            ? await User_1.default.findOne({ phone: phoneDigits })
            : await Receiver_1.default.findOne({ phone: phoneDigits });
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
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        t.logFullError('send_otp_unhandled', err, { mongoCode: (0, apiTraceLog_1.mongoErrCode)(err) });
        t.json(500, { message: msg || 'Server error', error: 'SEND_OTP_FAILED' });
    }
};
exports.sendOtp = sendOtp;
// Replace the verifyOtp function
const verifyOtp = async (req, res) => {
    const t = (0, apiTraceLog_1.beginApiTrace)('POST /auth/verify-otp', req, res);
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
        const respondVerified = async (doc) => {
            const typ = accountType === 'user' ? 'u' : 'r';
            const sv = accountType === 'user'
                ? await (0, authSessionService_1.bumpUserAuthSession)(String(doc._id))
                : await (0, authSessionService_1.bumpReceiverAuthSession)(String(doc._id));
            (0, socketRegistry_1.emitAuthSessionSuperseded)(typ, String(doc._id), sv);
            const token = (0, authToken_1.signAppAccessToken)(String(doc._id), typ, sv);
            const userJson = accountType === 'user' ? toApiUser(doc) : toApiReceiver(doc);
            t.log('verify_otp_ok');
            t.json(200, {
                message: otpBypass ? 'Login successful (OTP bypass)' : 'Login successful',
                token,
                user: userJson,
            });
        };
        const verifyDoc = async (doc) => {
            if (accountType === 'user' && doc.suspended) {
                t.warn('verify_otp_user_suspended');
                t.json(403, { message: accountAccess_1.PAUSED_MSG, error: 'VERIFY_OTP_ACCOUNT_SUSPENDED' });
                return;
            }
            if (accountType === 'receiver' && doc.suspended) {
                t.warn('verify_otp_receiver_suspended');
                t.json(403, { message: accountAccess_1.PAUSED_MSG, error: 'VERIFY_OTP_ACCOUNT_SUSPENDED' });
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
                    const receiverDoc = doc;
                    const hasName = receiverDoc.name && receiverDoc.name.trim();
                    const hasProfileImage = receiverDoc.profileImage && receiverDoc.profileImage.trim();
                    const hasUserAudio = receiverDoc.userAudio && receiverDoc.userAudio.trim();
                    if (hasName && hasProfileImage && hasUserAudio) {
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
                const receiverDoc = doc;
                const hasName = receiverDoc.name && receiverDoc.name.trim();
                const hasProfileImage = receiverDoc.profileImage && receiverDoc.profileImage.trim();
                const hasUserAudio = receiverDoc.userAudio && receiverDoc.userAudio.trim();
                if (hasName && hasProfileImage && hasUserAudio) {
                    doc.accountStatus = 'approved';
                }
            }
            await doc.save();
            await respondVerified(doc);
        };
        if (accountType === 'user') {
            const doc = await User_1.default.findOne({ phone: phoneDigits });
            if (!doc) {
                t.warn('verify_otp_user_not_found');
                t.json(404, { message: 'User not found', error: 'VERIFY_OTP_USER_NOT_FOUND' });
                return;
            }
            await verifyDoc(doc);
            return;
        }
        // Receiver flow - check pending signup first (in memory), then existing account
        let doc = await Receiver_1.default.findOne({ phone: phoneDigits });
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
            doc = await Receiver_1.default.create({
                name: pending.name,
                phone: phoneDigits,
                isVerified: true,
                passwordHash: null,
                audioCallRate: Receiver_1.RECEIVER_AUDIO_CALL_RATE_INR_PER_MIN,
                otp: null,
                otpExpiry: null,
            });
            pendingReceiverSignups.delete(phoneDigits);
            await respondVerified(doc);
            return;
        }
        await verifyDoc(doc);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        t.logFullError('verify_otp_unhandled', err, { mongoCode: (0, apiTraceLog_1.mongoErrCode)(err) });
        t.json(500, { message: msg || 'Server error', error: 'VERIFY_OTP_FAILED' });
    }
};
exports.verifyOtp = verifyOtp;
/**
 * POST /auth/lookup-phone — which table holds this mobile (if any).
 */
const lookupPhone = async (req, res) => {
    const t = (0, apiTraceLog_1.beginApiTrace)('POST /auth/lookup-phone', req, res);
    try {
        const phoneDigits = typeof req.body.phone === 'string' ? String(req.body.phone).trim() : '';
        if (!phoneDigits) {
            t.json(400, { message: 'phone is required', error: 'LOOKUP_PHONE_MISSING' });
            return;
        }
        const accountType = await resolvePhoneAccountType(phoneDigits);
        t.json(200, { accountType, isRegistered: accountType !== null });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        t.logFullError('lookup_phone_unhandled', err, { mongoCode: (0, apiTraceLog_1.mongoErrCode)(err) });
        t.json(500, { message: msg || 'Server error', error: 'LOOKUP_PHONE_FAILED' });
    }
};
exports.lookupPhone = lookupPhone;
/**
 * POST /auth/send-otp-mobile — send OTP without choosing caller/receiver first.
 */
const sendOtpMobile = async (req, res) => {
    const t = (0, apiTraceLog_1.beginApiTrace)('POST /auth/send-otp-mobile', req, res);
    try {
        const phoneDigits = typeof req.body.phone === 'string' ? String(req.body.phone).trim() : '';
        if (!phoneDigits) {
            t.json(400, { message: 'phone is required', error: 'SEND_MOBILE_OTP_MISSING_PHONE' });
            return;
        }
        clearExpiredPendingReceiverSignups();
        clearExpiredPendingMobileSignups();
        const accountType = await resolvePhoneAccountType(phoneDigits);
        const canonicalPhone = (0, phoneNormalize_1.normalizeIndianMobilePhone)(phoneDigits);
        if (accountType === 'user') {
            const doc = await findUserByPhone(phoneDigits);
            if (!doc) {
                t.json(404, { message: 'User not found', error: 'SEND_MOBILE_OTP_USER_NOT_FOUND' });
                return;
            }
            await saveOtpOnDoc(doc, 'user');
            t.json(200, { message: 'OTP sent', sent: true, accountType: 'user', isNewUser: false });
            return;
        }
        if (accountType === 'receiver') {
            const doc = await findReceiverByPhone(phoneDigits);
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
        pendingMobileSignups.set(canonicalPhone, { phone: canonicalPhone, otp, otpExpiry });
        console.log(`[OTP TEST] new-mobile:${canonicalPhone} → OTP: ${otp}`);
        t.json(200, { message: 'OTP sent', sent: true, accountType: null, isNewUser: true });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        t.logFullError('send_otp_mobile_unhandled', err, { mongoCode: (0, apiTraceLog_1.mongoErrCode)(err) });
        t.json(500, { message: msg || 'Server error', error: 'SEND_MOBILE_OTP_FAILED' });
    }
};
exports.sendOtpMobile = sendOtpMobile;
/**
 * POST /auth/verify-otp-mobile — verify OTP; login existing user or require gender for new numbers.
 */
const verifyOtpMobile = async (req, res) => {
    const t = (0, apiTraceLog_1.beginApiTrace)('POST /auth/verify-otp-mobile', req, res);
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
        const canonicalPhone = (0, phoneNormalize_1.normalizeIndianMobilePhone)(phoneDigits);
        const accountType = await resolvePhoneAccountType(phoneDigits);
        const trimmedOtp = String(otp).trim();
        const isBypassOtp = /^\d{6}$/.test(trimmedOtp);
        const finishLogin = async (doc, typ) => {
            if (typ === 'user' && doc.suspended) {
                t.json(403, { message: accountAccess_1.PAUSED_MSG, error: 'VERIFY_OTP_ACCOUNT_SUSPENDED' });
                return;
            }
            if (typ === 'receiver' && doc.suspended) {
                t.json(403, { message: accountAccess_1.PAUSED_MSG, error: 'VERIFY_OTP_ACCOUNT_SUSPENDED' });
                return;
            }
            const sv = typ === 'user'
                ? await (0, authSessionService_1.bumpUserAuthSession)(String(doc._id))
                : await (0, authSessionService_1.bumpReceiverAuthSession)(String(doc._id));
            (0, socketRegistry_1.emitAuthSessionSuperseded)(typ === 'user' ? 'u' : 'r', String(doc._id), sv);
            const token = (0, authToken_1.signAppAccessToken)(String(doc._id), typ === 'user' ? 'u' : 'r', sv);
            const userJson = typ === 'user' ? toApiUser(doc) : toApiReceiver(doc);
            pendingMobileSignups.delete(canonicalPhone);
            verifiedMobilePhones.delete(canonicalPhone);
            t.json(200, {
                status: 'authenticated',
                message: otpBypass ? 'Login successful (OTP bypass)' : 'Login successful',
                token,
                user: userJson,
                accountType: typ,
            });
        };
        const verifyExistingDoc = async (doc, typ) => {
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
            const doc = await findUserByPhone(phoneDigits);
            if (!doc) {
                t.json(404, { message: 'User not found', error: 'VERIFY_MOBILE_OTP_USER_NOT_FOUND' });
                return;
            }
            await verifyExistingDoc(doc, 'user');
            return;
        }
        if (accountType === 'receiver') {
            const doc = await findReceiverByPhone(phoneDigits);
            if (!doc) {
                t.json(404, { message: 'Receiver not found', error: 'VERIFY_MOBILE_OTP_RECEIVER_NOT_FOUND' });
                return;
            }
            await verifyExistingDoc(doc, 'receiver');
            return;
        }
        const pending = pendingMobileSignups.get(canonicalPhone);
        if (!pending) {
            t.json(404, {
                message: 'No OTP pending for this number. Request a new code.',
                error: 'VERIFY_MOBILE_OTP_NO_PENDING',
            });
            return;
        }
        if (new Date() > pending.otpExpiry && !otpBypass && !isBypassOtp) {
            pendingMobileSignups.delete(canonicalPhone);
            t.json(400, { message: 'OTP expired. Request a new code.', error: 'VERIFY_OTP_CODE_EXPIRED' });
            return;
        }
        if (!otpBypass && !isBypassOtp && trimmedOtp !== pending.otp) {
            t.json(400, { message: 'Invalid OTP', error: 'VERIFY_OTP_INVALID_CODE' });
            return;
        }
        if (await phoneTaken(phoneDigits)) {
            pendingMobileSignups.delete(canonicalPhone);
            t.json(409, {
                message: 'Mobile number already registered',
                error: 'REGISTER_PHONE_TAKEN',
            });
            return;
        }
        pendingMobileSignups.delete(canonicalPhone);
        verifiedMobilePhones.set(canonicalPhone, new Date(Date.now() + VERIFIED_MOBILE_TTL_MS));
        t.json(200, {
            status: 'needs_gender',
            message: 'OTP verified. Select gender to continue.',
            phone: canonicalPhone,
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        t.logFullError('verify_otp_mobile_unhandled', err, { mongoCode: (0, apiTraceLog_1.mongoErrCode)(err) });
        t.json(500, { message: msg || 'Server error', error: 'VERIFY_MOBILE_OTP_FAILED' });
    }
};
exports.verifyOtpMobile = verifyOtpMobile;
/**
 * POST /auth/complete-mobile-signup — after OTP + gender: male → users (caller), female → receivers.
 */
const completeMobileSignup = async (req, res) => {
    const t = (0, apiTraceLog_1.beginApiTrace)('POST /auth/complete-mobile-signup', req, res);
    try {
        const phoneDigits = typeof req.body.phone === 'string' ? String(req.body.phone).trim() : '';
        const gender = req.body.gender;
        const referralCode = req.body.referralCode;
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
        const canonicalPhone = (0, phoneNormalize_1.normalizeIndianMobilePhone)(phoneDigits);
        const verifiedUntil = verifiedMobilePhones.get(canonicalPhone);
        if (!verifiedUntil || new Date() > verifiedUntil) {
            t.json(400, {
                message: 'Verify OTP before completing signup.',
                error: 'COMPLETE_MOBILE_SIGNUP_NOT_VERIFIED',
            });
            return;
        }
        if (await phoneTaken(phoneDigits)) {
            verifiedMobilePhones.delete(canonicalPhone);
            t.json(409, {
                message: 'Mobile number already registered',
                error: 'REGISTER_PHONE_TAKEN',
            });
            return;
        }
        const resolvedName = `Member ${canonicalPhone.slice(-4)}`;
        if (gender === 'male') {
            const user = await User_1.default.create({
                name: resolvedName,
                phone: canonicalPhone,
                gender: 'male',
                isVerified: true,
                passwordHash: null,
                accountStatus: 'pending_profile',
                referralCode: await (0, referralService_1.generateUniqueReferralCode)(),
            });
            verifiedMobilePhones.delete(canonicalPhone);
            const referralResult = await (0, referralService_1.applyReferralRewardOnSignup)({
                referralCode,
                referredKind: 'user',
                referredId: String(user._id),
                referredPhone: canonicalPhone,
            });
            if (!referralResult.applied && referralCode) {
                t.warn('referral_not_applied', { reason: referralResult.reason ?? 'unknown' });
            }
            const sv = await (0, authSessionService_1.bumpUserAuthSession)(String(user._id));
            (0, socketRegistry_1.emitAuthSessionSuperseded)('u', String(user._id), sv);
            const token = (0, authToken_1.signAppAccessToken)(String(user._id), 'u', sv);
            t.json(201, {
                message: 'Account created',
                token,
                user: toApiUser(user),
                accountType: 'user',
            });
            return;
        }
        const receiver = await Receiver_1.default.create({
            name: resolvedName,
            phone: canonicalPhone,
            gender: 'female',
            isVerified: true,
            passwordHash: null,
            audioCallRate: Receiver_1.RECEIVER_AUDIO_CALL_RATE_INR_PER_MIN,
            accountStatus: 'pending_profile',
            referralCode: await (0, referralService_1.generateUniqueReferralCode)(),
        });
        verifiedMobilePhones.delete(canonicalPhone);
        const referralResult = await (0, referralService_1.applyReferralRewardOnSignup)({
            referralCode,
            referredKind: 'receiver',
            referredId: String(receiver._id),
            referredPhone: canonicalPhone,
        });
        if (!referralResult.applied && referralCode) {
            t.warn('referral_not_applied', { reason: referralResult.reason ?? 'unknown' });
        }
        const sv = await (0, authSessionService_1.bumpReceiverAuthSession)(String(receiver._id));
        (0, socketRegistry_1.emitAuthSessionSuperseded)('r', String(receiver._id), sv);
        const token = (0, authToken_1.signAppAccessToken)(String(receiver._id), 'r', sv);
        t.json(201, {
            message: 'Account created',
            token,
            user: toApiReceiver(receiver),
            accountType: 'receiver',
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        t.logFullError('complete_mobile_signup_unhandled', err, { mongoCode: (0, apiTraceLog_1.mongoErrCode)(err) });
        t.json(500, { message: msg || 'Server error', error: 'COMPLETE_MOBILE_SIGNUP_FAILED' });
    }
};
exports.completeMobileSignup = completeMobileSignup;
const getMe = async (req, res) => {
    const t = (0, apiTraceLog_1.beginApiTrace)('GET /auth/me', req, res);
    try {
        const kind = req.accountKind;
        if (!kind) {
            t.warn('get_me_no_account_kind');
            t.json(401, { message: 'Not authorized', error: 'ME_UNAUTHORIZED' });
            return;
        }
        if (kind === 'user') {
            const user = req.user;
            if (!user) {
                t.warn('get_me_user_missing_on_request');
                t.json(401, { message: 'Not authorized', error: 'ME_USER_MISSING' });
                return;
            }
            t.log('get_me_ok_user');
            t.json(200, { user: toApiUser(user) });
            return;
        }
        const receiver = req.receiver;
        if (!receiver) {
            t.warn('get_me_receiver_missing_on_request');
            t.json(401, { message: 'Not authorized', error: 'ME_RECEIVER_MISSING' });
            return;
        }
        t.log('get_me_ok_receiver');
        t.json(200, { user: toApiReceiver(receiver) });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        t.logFullError('get_me_unhandled', err, { mongoCode: (0, apiTraceLog_1.mongoErrCode)(err) });
        t.json(500, { message: msg || 'Server error', error: 'ME_FAILED' });
    }
};
exports.getMe = getMe;
