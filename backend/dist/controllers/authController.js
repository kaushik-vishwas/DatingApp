"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMe = exports.verifyOtp = exports.resetPassword = exports.forgotPassword = exports.sendOtp = exports.login = exports.register = void 0;
exports.toApiUser = toApiUser;
exports.toApiReceiver = toApiReceiver;
exports.toSafeUser = toSafeUser;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const User_1 = __importDefault(require("../models/User"));
const Receiver_1 = __importDefault(require("../models/Receiver"));
const email_1 = require("../config/email");
const birthDate_1 = require("../utils/birthDate");
const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
function resolveRegisterBirthDate(raw) {
    const dob = (0, birthDate_1.parseDateOnlyToUtcMidnight)(raw);
    if (!dob) {
        return { ok: false, message: 'dateOfBirth is required (format YYYY-MM-DD)' };
    }
    const err = (0, birthDate_1.validateBirthDateForAccount)(dob);
    if (err)
        return { ok: false, message: err };
    return { ok: true, dob, age: (0, birthDate_1.calculateAgeFromBirthDateUtc)(dob) };
}
function iso(d) {
    return d.toISOString();
}
function toApiUser(user) {
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
        dateOfBirth: (0, birthDate_1.dateOnlyIsoFromUtcDate)(u.dateOfBirth ?? null),
        age: u.age ?? null,
        state: u.state ?? null,
        createdAt: iso(u.createdAt),
        updatedAt: iso(u.updatedAt),
        suspended: Boolean(u.suspended),
        walletBalance: typeof u.walletBalance === 'number' && Number.isFinite(u.walletBalance) ? u.walletBalance : 0,
        audioCallRate: null,
    };
}
function toApiReceiver(receiver) {
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
        dateOfBirth: (0, birthDate_1.dateOnlyIsoFromUtcDate)(r.dateOfBirth ?? null),
        age: r.age ?? null,
        state: r.state ?? null,
        createdAt: iso(r.createdAt),
        updatedAt: iso(r.updatedAt),
        suspended: false,
        walletBalance: 0,
        audioCallRate: typeof r.audioCallRate === 'number' && Number.isFinite(r.audioCallRate) ? r.audioCallRate : null,
    };
}
/** Prefer toApiUser / toApiReceiver — resolves by Mongoose modelName */
function toSafeUser(doc) {
    const modelName = doc.constructor?.modelName;
    if (modelName === 'User')
        return toApiUser(doc);
    return toApiReceiver(doc);
}
const signToken = (userId, typ) => {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new Error('JWT_SECRET is not set in environment');
    }
    return jsonwebtoken_1.default.sign({ id: userId, typ }, secret, { expiresIn: '7d' });
};
async function emailTaken(normalizedEmail) {
    const [u, r] = await Promise.all([
        User_1.default.exists({ email: normalizedEmail }),
        Receiver_1.default.exists({ email: normalizedEmail }),
    ]);
    return Boolean(u || r);
}
/**
 * POST /auth/register — creates a row in `users` (caller) or `receivers` (receiver / both).
 */
const register = async (req, res) => {
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
        const allowed = ['caller', 'receiver', 'both'];
        const userRole = role && allowed.includes(role) ? role : 'receiver';
        const passwordHash = await bcryptjs_1.default.hash(plain, 10);
        if (userRole === 'caller') {
            const user = await User_1.default.create({
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
        const receiver = await Receiver_1.default.create({
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
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('register error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.register = register;
/**
 * POST /auth/login — body.accountType: `user` | `receiver`
 */
const login = async (req, res) => {
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
            const user = await User_1.default.findOne({ email: normalizedEmail }).select('+passwordHash');
            if (!user || !user.passwordHash) {
                res.status(401).json({ message: 'Invalid email or password' });
                return;
            }
            const match = await bcryptjs_1.default.compare(String(password), user.passwordHash);
            if (!match) {
                res.status(401).json({ message: 'Invalid email or password' });
                return;
            }
            if (user.suspended) {
                res.status(403).json({ message: 'Your account has been suspended. Contact support.' });
                return;
            }
            const token = signToken(String(user._id), 'u');
            res.json({ message: 'Login successful', token, user: toApiUser(user) });
            return;
        }
        const receiver = await Receiver_1.default.findOne({ email: normalizedEmail }).select('+passwordHash');
        if (!receiver || !receiver.passwordHash) {
            res.status(401).json({ message: 'Invalid email or password' });
            return;
        }
        const match = await bcryptjs_1.default.compare(String(password), receiver.passwordHash);
        if (!match) {
            res.status(401).json({ message: 'Invalid email or password' });
            return;
        }
        const token = signToken(String(receiver._id), 'r');
        res.json({ message: 'Login successful', token, user: toApiReceiver(receiver) });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('login error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.login = login;
const sendOtp = async (req, res) => {
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
        const doc = accountType === 'user'
            ? await User_1.default.findOne({ email: normalizedEmail })
            : await Receiver_1.default.findOne({ email: normalizedEmail });
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
            await (0, email_1.sendOtpEmail)(doc.email, otp, 'verification');
        }
        catch (mailErr) {
            emailSent = false;
            const msg = mailErr instanceof Error ? mailErr.message : String(mailErr);
            console.error('sendOtp email error:', msg);
            if (mailErr && typeof mailErr === 'object' && 'response' in mailErr) {
                console.error('sendOtp SMTP response:', String(mailErr.response));
            }
        }
        if (!emailSent) {
            res.status(200).json({
                message: 'OTP saved. Email delivery failed — use the code printed in the server console or fix EMAIL_USER / EMAIL_PASS.',
                emailSent: false,
            });
            return;
        }
        res.json({ message: 'OTP sent to your email', emailSent: true });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('sendOtp error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.sendOtp = sendOtp;
const forgotPassword = async (req, res) => {
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
        const doc = accountType === 'user'
            ? await User_1.default.findOne({ email: normalizedEmail })
            : await Receiver_1.default.findOne({ email: normalizedEmail });
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
            await (0, email_1.sendOtpEmail)(doc.email, otp, 'password_reset');
        }
        catch (mailErr) {
            emailSent = false;
            const msg = mailErr instanceof Error ? mailErr.message : String(mailErr);
            console.error('forgotPassword email error:', msg);
            if (mailErr && typeof mailErr === 'object' && 'response' in mailErr) {
                console.error('forgotPassword SMTP response:', String(mailErr.response));
            }
        }
        res.json({
            message: emailSent
                ? genericMessage
                : 'Code could not be emailed. Check server logs and EMAIL_USER / EMAIL_PASS, or use the code printed in the server console.',
            emailSent,
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('forgotPassword error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.forgotPassword = forgotPassword;
const resetPassword = async (req, res) => {
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
        const finishReset = async (doc) => {
            doc.passwordHash = await bcryptjs_1.default.hash(plain, 10);
            doc.otp = null;
            doc.otpExpiry = null;
            doc.isVerified = true;
            await doc.save();
            const typ = accountType === 'user' ? 'u' : 'r';
            const token = signToken(String(doc._id), typ);
            const userJson = accountType === 'user' ? toApiUser(doc) : toApiReceiver(doc);
            return { token, userJson };
        };
        if (accountType === 'user') {
            const doc = await User_1.default.findOne({ email: normalizedEmail }).select('+passwordHash');
            if (!doc) {
                res.status(400).json({ message: 'Invalid or expired code' });
                return;
            }
            if (doc.suspended) {
                res.status(403).json({ message: 'Your account has been suspended. Contact support.' });
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
        const doc = await Receiver_1.default.findOne({ email: normalizedEmail }).select('+passwordHash');
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
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('resetPassword error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.resetPassword = resetPassword;
const verifyOtp = async (req, res) => {
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
        const respondVerified = (doc) => {
            const typ = accountType === 'user' ? 'u' : 'r';
            const token = signToken(String(doc._id), typ);
            const userJson = accountType === 'user' ? toApiUser(doc) : toApiReceiver(doc);
            res.json({
                message: otpBypass ? 'Login successful (OTP bypass)' : 'Login successful',
                token,
                user: userJson,
            });
        };
        const verifyDoc = async (doc) => {
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
            const doc = await User_1.default.findOne({ email: normalizedEmail });
            if (!doc) {
                res.status(404).json({ message: 'User not found' });
                return;
            }
            if (doc.suspended) {
                res.status(403).json({ message: 'Your account has been suspended. Contact support.' });
                return;
            }
            await verifyDoc(doc);
            return;
        }
        const doc = await Receiver_1.default.findOne({ email: normalizedEmail });
        if (!doc) {
            res.status(404).json({ message: 'User not found' });
            return;
        }
        await verifyDoc(doc);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('verifyOtp error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.verifyOtp = verifyOtp;
const getMe = async (req, res) => {
    try {
        const kind = req.accountKind;
        if (!kind) {
            res.status(401).json({ message: 'Not authorized' });
            return;
        }
        if (kind === 'user') {
            const user = req.user;
            if (!user) {
                res.status(401).json({ message: 'Not authorized' });
                return;
            }
            res.json({ user: toApiUser(user) });
            return;
        }
        const receiver = req.receiver;
        if (!receiver) {
            res.status(401).json({ message: 'Not authorized' });
            return;
        }
        res.json({ user: toApiReceiver(receiver) });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('getMe error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.getMe = getMe;
