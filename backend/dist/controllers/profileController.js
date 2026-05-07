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
exports.getCallerNotifications = exports.getCallerCallHistory = exports.getReceiverEarningsBreakdown = exports.verifyReceiverBankUpdateOtp = exports.sendReceiverBankUpdateOtp = exports.deleteReceiverAccount = exports.reopenRejectedReceiverKyc = exports.updateReceiverProfile = exports.notifyReceiverRecentUser = exports.getReceiverNotifyCandidates = exports.getReceiverCallInsights = exports.verifyReceiverWithdrawalOtpAndCreate = exports.sendReceiverWithdrawalOtp = exports.getReceiverWithdrawalOverview = exports.getReceiverWalletSummary = exports.updateCallerProfile = exports.completeCallerProfile = exports.saveCallerUserAudio = exports.completeProfile = void 0;
const crypto_1 = __importDefault(require("crypto"));
const mongoose_1 = __importDefault(require("mongoose"));
const User_1 = __importDefault(require("../models/User"));
const Receiver_1 = __importStar(require("../models/Receiver"));
const ChatMessage_1 = __importDefault(require("../models/ChatMessage"));
const WithdrawalRequest_1 = __importDefault(require("../models/WithdrawalRequest"));
const CallSession_1 = __importDefault(require("../models/CallSession"));
const ChatBlock_1 = __importDefault(require("../models/ChatBlock"));
const UserReport_1 = __importDefault(require("../models/UserReport"));
const WalletTopup_1 = __importDefault(require("../models/WalletTopup"));
const ReceiverAvailabilityNotification_1 = __importDefault(require("../models/ReceiverAvailabilityNotification"));
const ReceiverPriorityNotification_1 = __importDefault(require("../models/ReceiverPriorityNotification"));
const ReceiverRating_1 = __importDefault(require("../models/ReceiverRating"));
const callerProfileAllowlist_1 = require("../constants/callerProfileAllowlist");
const authController_1 = require("./authController");
const accountAccess_1 = require("../utils/accountAccess");
const chatPricing_1 = require("../constants/chatPricing");
const email_1 = require("../config/email");
const receiverAvailabilityNotifier_1 = require("../services/receiverAvailabilityNotifier");
const callQueue_1 = require("../services/callQueue");
const birthDate_1 = require("../utils/birthDate");
const callerVoiceGenderVerifier_1 = require("../services/callerVoiceGenderVerifier");
const razorpayXPayoutService_1 = require("../services/razorpayXPayoutService");
const socketRegistry_1 = require("../socket/socketRegistry");
function parseCallerAudioHttpsUrl(body) {
    const raw = typeof body.userAudio === 'string'
        ? body.userAudio
        : typeof body.voiceVerificationAudioUrl === 'string'
            ? body.voiceVerificationAudioUrl
            : '';
    const voiceUrl = raw.trim();
    if (!voiceUrl || !/^https?:\/\//i.test(voiceUrl))
        return null;
    return voiceUrl;
}
const MAX_CALLER_EDIT_INTERESTS = 3;
const MAX_CALLER_EDIT_LANGUAGES = 2;
function filterAllowlisted(arr, allow, max) {
    if (!Array.isArray(arr))
        return [];
    const out = [];
    for (const x of arr) {
        const s = typeof x === 'string' ? x.trim() : '';
        if (!s || !allow.has(s))
            continue;
        if (!out.includes(s))
            out.push(s);
        if (out.length >= max)
            break;
    }
    return out;
}
/**
 * POST /profile/complete
 * Saves profile URLs and marks account pending_review (receivers only).
 */
const completeProfile = async (req, res) => {
    try {
        if (req.accountKind !== 'receiver') {
            res.status(403).json({ message: 'This endpoint is only for receiver accounts' });
            return;
        }
        const authReceiver = req.receiver;
        if (!authReceiver?._id) {
            res.status(401).json({ message: 'Not authorized' });
            return;
        }
        const { name, profileImage, aadhaarFront, aadhaarBack, aadhaarNumber, panNumber, panFront, languages, interests, gender, dateOfBirth, state, bankAccountHolderName, bankAccountType, bankAccountNumber, bankIfsc, bankName, } = req.body;
        if (!name || !String(name).trim()) {
            res.status(400).json({ message: 'name is required' });
            return;
        }
        if (!profileImage || typeof profileImage !== 'string') {
            res.status(400).json({ message: 'profileImage URL is required' });
            return;
        }
        if (!aadhaarFront || typeof aadhaarFront !== 'string') {
            res.status(400).json({ message: 'aadhaarFront URL is required' });
            return;
        }
        if (!aadhaarBack || typeof aadhaarBack !== 'string') {
            res.status(400).json({ message: 'aadhaarBack URL is required' });
            return;
        }
        if (!aadhaarNumber || typeof aadhaarNumber !== 'string' || !/^\d{12}$/.test(aadhaarNumber.trim())) {
            res.status(400).json({ message: 'aadhaarNumber must be a valid 12-digit number' });
            return;
        }
        if (!panNumber ||
            typeof panNumber !== 'string' ||
            !/^[A-Z]{5}[0-9]{4}[A-Z]$/i.test(panNumber.trim())) {
            res.status(400).json({ message: 'panNumber must be valid (e.g. ABCDE1234F)' });
            return;
        }
        if (!panFront || typeof panFront !== 'string') {
            res.status(400).json({ message: 'panFront URL is required' });
            return;
        }
        if (!Array.isArray(languages) || languages.length === 0) {
            res.status(400).json({ message: 'At least one language is required' });
            return;
        }
        if (!Array.isArray(interests) || interests.length === 0) {
            res.status(400).json({ message: 'At least one interest is required' });
            return;
        }
        if (gender !== 'male' && gender !== 'female' && gender !== 'other') {
            res.status(400).json({ message: 'gender must be male, female, or other' });
            return;
        }
        const dob = (0, birthDate_1.parseDateOnlyToUtcMidnight)(dateOfBirth);
        if (!dob) {
            res.status(400).json({ message: 'dateOfBirth is required (YYYY-MM-DD)' });
            return;
        }
        const dobErr = (0, birthDate_1.validateBirthDateForAccount)(dob);
        if (dobErr) {
            res.status(400).json({ message: dobErr });
            return;
        }
        const computedAge = (0, birthDate_1.calculateAgeFromBirthDateUtc)(dob);
        if (!state || !String(state).trim()) {
            res.status(400).json({ message: 'state is required' });
            return;
        }
        if (!bankAccountHolderName || !String(bankAccountHolderName).trim()) {
            res.status(400).json({ message: 'bankAccountHolderName is required' });
            return;
        }
        if (bankAccountType !== 'savings' && bankAccountType !== 'current') {
            res.status(400).json({ message: 'bankAccountType must be savings or current' });
            return;
        }
        if (!bankAccountNumber || !String(bankAccountNumber).trim()) {
            res.status(400).json({ message: 'bankAccountNumber is required' });
            return;
        }
        if (!bankIfsc || !String(bankIfsc).trim()) {
            res.status(400).json({ message: 'bankIfsc is required' });
            return;
        }
        if (!bankName || !String(bankName).trim()) {
            res.status(400).json({ message: 'bankName is required' });
            return;
        }
        const receiver = await Receiver_1.default.findById(authReceiver._id);
        if (!receiver) {
            res.status(404).json({ message: 'Receiver not found' });
            return;
        }
        if (receiver.accountStatus !== 'pending_profile') {
            res.status(400).json({
                message: 'Profile already submitted or cannot be edited this way',
            });
            return;
        }
        const front = String(aadhaarFront).trim();
        const back = String(aadhaarBack).trim();
        const panFrontUrl = String(panFront).trim();
        receiver.name = String(name).trim();
        receiver.profileImage = profileImage.trim();
        receiver.aadhaarFront = front;
        receiver.aadhaarBack = back;
        receiver.aadhaarNumber = String(aadhaarNumber).trim();
        receiver.panNumber = String(panNumber).trim().toUpperCase();
        receiver.panFront = panFrontUrl;
        receiver.documents = [front, back, panFrontUrl];
        receiver.languages = languages.map((l) => String(l).trim()).filter(Boolean);
        receiver.interests = interests.map((i) => String(i).trim()).filter(Boolean);
        receiver.gender = gender;
        receiver.dateOfBirth = dob;
        receiver.age = computedAge;
        receiver.state = String(state).trim();
        receiver.bankAccountHolderName = String(bankAccountHolderName).trim();
        receiver.bankAccountType = bankAccountType;
        receiver.bankAccountNumber = String(bankAccountNumber).trim();
        receiver.bankIfsc = String(bankIfsc).trim().toUpperCase();
        receiver.bankName = String(bankName).trim();
        receiver.audioCallRate = Receiver_1.RECEIVER_AUDIO_CALL_RATE_INR_PER_MIN;
        receiver.accountStatus = 'pending_review';
        await receiver.save();
        res.status(200).json({
            message: 'Profile submitted for review',
            user: (0, authController_1.toApiReceiver)(receiver),
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('completeProfile error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.completeProfile = completeProfile;
/**
 * PATCH /profile/caller-audio
 * Saves `userAudio` (HTTPS URL) on the caller while `accountStatus` is `pending_profile`
 * (right after Cloudinary upload, before the rest of the profile is submitted).
 */
const saveCallerUserAudio = async (req, res) => {
    try {
        if (req.accountKind !== 'user') {
            res.status(403).json({ message: 'This endpoint is only for app user accounts' });
            return;
        }
        const authUser = req.user;
        if (!authUser?._id) {
            res.status(401).json({ message: 'Not authorized' });
            return;
        }
        const voiceUrl = parseCallerAudioHttpsUrl(req.body);
        if (!voiceUrl) {
            res.status(400).json({ message: 'userAudio must be a valid https URL' });
            return;
        }
        const updated = await User_1.default.findOneAndUpdate({ _id: authUser._id, accountStatus: 'pending_profile' }, { $set: { userAudio: voiceUrl } }, { new: true, runValidators: true });
        if (!updated) {
            res.status(400).json({
                message: 'Voice can only be saved while your profile is still in progress',
            });
            return;
        }
        res.status(200).json({
            message: 'Voice sample saved',
            user: (0, authController_1.toApiUser)(updated),
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('saveCallerUserAudio error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.saveCallerUserAudio = saveCallerUserAudio;
/**
 * POST /profile/complete-caller
 * App user profile (`users` collection):
 * - male/other: direct access (`approved`, not suspended)
 * - female: auto-verify by voice classifier (`approved` or `rejected`)
 */
const completeCallerProfile = async (req, res) => {
    try {
        if (req.accountKind !== 'user') {
            res.status(403).json({ message: 'This endpoint is only for app user accounts' });
            return;
        }
        const authUser = req.user;
        if (!authUser?._id) {
            res.status(401).json({ message: 'Not authorized' });
            return;
        }
        const { name, profileImage, languages, interests, gender, dateOfBirth, state } = req.body;
        if (!name || !String(name).trim()) {
            res.status(400).json({ message: 'name is required' });
            return;
        }
        if (!profileImage || typeof profileImage !== 'string') {
            res.status(400).json({ message: 'profileImage URL is required' });
            return;
        }
        if (gender !== 'male' && gender !== 'female' && gender !== 'other') {
            res.status(400).json({ message: 'gender must be male, female, or other' });
            return;
        }
        const dob = (0, birthDate_1.parseDateOnlyToUtcMidnight)(dateOfBirth);
        if (!dob) {
            res.status(400).json({ message: 'dateOfBirth is required (YYYY-MM-DD)' });
            return;
        }
        const dobErr = (0, birthDate_1.validateBirthDateForAccount)(dob);
        if (dobErr) {
            res.status(400).json({ message: dobErr });
            return;
        }
        const computedAge = (0, birthDate_1.calculateAgeFromBirthDateUtc)(dob);
        if (!state || !String(state).trim()) {
            res.status(400).json({ message: 'state is required' });
            return;
        }
        if (!Array.isArray(languages) || languages.length === 0) {
            res.status(400).json({ message: 'At least one language is required' });
            return;
        }
        if (!Array.isArray(interests) || interests.length === 0) {
            res.status(400).json({ message: 'At least one interest is required' });
            return;
        }
        const voiceUrl = parseCallerAudioHttpsUrl(req.body);
        if (gender === 'female' && !voiceUrl) {
            res.status(400).json({ message: 'userAudio must be a valid https URL for female profiles' });
            return;
        }
        const requiresVerification = gender === 'female';
        let femaleVoiceApproved = true;
        let voiceVerification;
        if (requiresVerification) {
            const result = await (0, callerVoiceGenderVerifier_1.verifyCallerFemaleVoice)(voiceUrl);
            femaleVoiceApproved = result.ok;
            const threshold = Number.isFinite(Number(process.env.VOICE_GENDER_FEMALE_MIN_CONFIDENCE))
                ? Number(process.env.VOICE_GENDER_FEMALE_MIN_CONFIDENCE)
                : 0.7;
            voiceVerification = {
                provider: 'huggingface',
                approved: result.ok,
                predictedGender: result.predictedGender,
                confidence: result.confidence,
                threshold,
                model: result.model,
                reason: result.reason,
            };
            console.log(`[caller-voice-gender-check] uid=${String(authUser._id)} predicted=${result.predictedGender} confidence=${result.confidence.toFixed(3)} model=${result.model} approved=${String(result.ok)} reason="${result.reason ?? ''}"`);
        }
        const updated = await User_1.default.findOneAndUpdate({ _id: authUser._id, accountStatus: 'pending_profile' }, {
            $set: {
                name: String(name).trim(),
                profileImage: String(profileImage).trim(),
                languages: languages.map((l) => String(l).trim()).filter(Boolean),
                interests: interests.map((i) => String(i).trim()).filter(Boolean),
                gender,
                dateOfBirth: dob,
                age: computedAge,
                state: String(state).trim(),
                userAudio: voiceUrl ?? null,
                accountStatus: requiresVerification ? (femaleVoiceApproved ? 'approved' : 'rejected') : 'approved',
                suspended: false,
            },
        }, { new: true, runValidators: true });
        if (!updated) {
            res.status(400).json({
                message: 'Profile already submitted or cannot be edited this way',
            });
            return;
        }
        res.status(200).json({
            message: requiresVerification
                ? femaleVoiceApproved
                    ? 'Profile verified successfully'
                    : 'Profile verification failed'
                : 'Profile completed successfully',
            user: (0, authController_1.toApiUser)(updated),
            ...(voiceVerification ? { voiceVerification } : {}),
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('completeCallerProfile error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.completeCallerProfile = completeCallerProfile;
/**
 * PATCH /profile/caller — approved app users only; updates profile fields (same shape as complete-caller).
 */
const updateCallerProfile = async (req, res) => {
    try {
        if (req.accountKind !== 'user') {
            res.status(403).json({ message: 'This endpoint is only for app user accounts' });
            return;
        }
        const authUser = req.user;
        if (!authUser?._id) {
            res.status(401).json({ message: 'Not authorized' });
            return;
        }
        const { name, profileImage, languages, interests, gender, dateOfBirth, state } = req.body;
        if (!name || !String(name).trim()) {
            res.status(400).json({ message: 'name is required' });
            return;
        }
        if (!profileImage || typeof profileImage !== 'string') {
            res.status(400).json({ message: 'profileImage URL is required' });
            return;
        }
        if (gender !== 'male' && gender !== 'female' && gender !== 'other') {
            res.status(400).json({ message: 'gender must be male, female, or other' });
            return;
        }
        const dob = (0, birthDate_1.parseDateOnlyToUtcMidnight)(dateOfBirth);
        if (!dob) {
            res.status(400).json({ message: 'dateOfBirth is required (YYYY-MM-DD)' });
            return;
        }
        const dobErr = (0, birthDate_1.validateBirthDateForAccount)(dob);
        if (dobErr) {
            res.status(400).json({ message: dobErr });
            return;
        }
        const computedAge = (0, birthDate_1.calculateAgeFromBirthDateUtc)(dob);
        if (!state || !String(state).trim()) {
            res.status(400).json({ message: 'state is required' });
            return;
        }
        const langs = filterAllowlisted(languages, callerProfileAllowlist_1.CALLER_LANGUAGE_ALLOWLIST, MAX_CALLER_EDIT_LANGUAGES);
        const ints = filterAllowlisted(interests, callerProfileAllowlist_1.CALLER_INTEREST_ALLOWLIST, MAX_CALLER_EDIT_INTERESTS);
        if (langs.length === 0) {
            res.status(400).json({ message: 'Select at least one valid language (max 2)' });
            return;
        }
        if (ints.length === 0) {
            res.status(400).json({ message: 'Select at least one valid interest (max 3)' });
            return;
        }
        const user = await User_1.default.findById(authUser._id);
        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }
        if (user.accountStatus !== 'approved' || user.suspended) {
            res.status(400).json({ message: 'Profile can only be edited when your access is active' });
            return;
        }
        user.name = String(name).trim();
        user.profileImage = String(profileImage).trim();
        user.languages = langs;
        user.interests = ints;
        user.gender = gender;
        user.dateOfBirth = dob;
        user.age = computedAge;
        user.state = String(state).trim();
        await user.save();
        res.status(200).json({
            message: 'Profile updated',
            user: (0, authController_1.toApiUser)(user),
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('updateCallerProfile error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.updateCallerProfile = updateCallerProfile;
function roundInr(n) {
    return Math.round(n * 100) / 100;
}
async function getPendingWithdrawalAmount(receiverId) {
    const rows = await WithdrawalRequest_1.default.find({ receiverId, status: 'pending' })
        .select('amount')
        .lean();
    return roundInr(rows.reduce((sum, row) => sum + Number(row.amount || 0), 0));
}
const IST_OFFSET_MINUTES = 330;
function toIstDate(d) {
    return new Date(d.getTime() + IST_OFFSET_MINUTES * 60 * 1000);
}
function computeLiveOnlineScore(onlineSince, now) {
    if (!(onlineSince instanceof Date) || !(now instanceof Date) || now <= onlineSince)
        return 0;
    let dayMinutes = 0;
    let nightMinutes = 0;
    let lateNightMinutes = 0;
    const cursor = new Date(onlineSince.getTime());
    while (cursor < now) {
        const nextMinute = new Date(cursor.getTime() + 60 * 1000);
        const h = toIstDate(cursor).getUTCHours();
        if (h >= 9 && h < 21)
            dayMinutes += 1;
        else if (h >= 22)
            nightMinutes += 1;
        else if (h >= 0 && h < 2)
            lateNightMinutes += 1;
        cursor.setTime(nextMinute.getTime());
    }
    return roundInr(dayMinutes * 0.5 + nightMinutes * 3 + lateNightMinutes * 10);
}
function toInrAmount(raw) {
    const n = Number(raw);
    if (!Number.isFinite(n))
        return null;
    const rounded = roundInr(n);
    if (rounded < 1)
        return null;
    return rounded;
}
function maskAccountNumber(accountNumber) {
    const trimmed = accountNumber.trim();
    const last4 = trimmed.slice(-4).padStart(4, '0');
    return `****${last4}`;
}
function otpHash(code) {
    return crypto_1.default.createHash('sha256').update(code).digest('hex');
}
function generateOtpCode() {
    const n = Math.floor(100000 + Math.random() * 900000);
    return String(n);
}
function maskEmail(email) {
    const [local, domain] = email.split('@');
    if (!local || !domain)
        return email;
    if (local.length <= 2)
        return `${local[0] ?? '*'}***@${domain}`;
    return `${local.slice(0, 2)}***@${domain}`;
}
function msgTime(m) {
    return m.createdAt instanceof Date ? m.createdAt : new Date(m.createdAt);
}
/** Paid caller fee: use stored `feeInr` when set; else legacy rows after first receiver reply count as one text fee. */
function effectiveCallerFeeInr(m, receiverHasReplied) {
    if (m.senderType !== 'u')
        return 0;
    const stored = typeof m.feeInr === 'number' && Number.isFinite(m.feeInr) ? m.feeInr : 0;
    if (stored > 0)
        return roundInr(stored);
    return receiverHasReplied ? chatPricing_1.CHAT_TEXT_FEE_INR : 0;
}
/** INR credited on score-tier payout (`receiverPayoutRatePerMinute` × minutes), not caller wallet settled amount. */
function effectiveCallReceiverEarnedInr(row) {
    if (typeof row.receiverEarnedInr === 'number' && Number.isFinite(row.receiverEarnedInr)) {
        return roundInr(row.receiverEarnedInr);
    }
    const rate = typeof row.receiverPayoutRatePerMinute === 'number' && Number.isFinite(row.receiverPayoutRatePerMinute)
        ? row.receiverPayoutRatePerMinute
        : 0;
    return roundInr((row.durationSec / 60) * Math.max(0, rate));
}
/**
 * GET /profile/receiver-wallet-summary — withdrawable wallet (chat), chat fee aggregates, score-based call earnings, recent chat rows.
 * Day/month boundaries use the server's local calendar. Legacy messages without `feeInr` are counted
 * using the same rule as billing (caller pays after receiver's first reply in the thread).
 */
const getReceiverWalletSummary = async (req, res) => {
    try {
        if (req.accountKind !== 'receiver') {
            res.status(403).json({ message: 'Only receivers can load this summary' });
            return;
        }
        if ((0, accountAccess_1.blockReceiverUntilApproved)(req, res))
            return;
        const rid = new mongoose_1.default.Types.ObjectId(String(req.receiver._id));
        const now = new Date();
        const startOfToday = new Date(now);
        startOfToday.setHours(0, 0, 0, 0);
        const startOfMonth = new Date(now);
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - 7);
        const receiver = await Receiver_1.default.findById(rid).select('walletBalance');
        const walletBalance = typeof receiver?.walletBalance === 'number' && Number.isFinite(receiver.walletBalance)
            ? roundInr(receiver.walletBalance)
            : 0;
        const inMonth = await ChatMessage_1.default.find({ receiverId: rid, createdAt: { $gte: startOfMonth } })
            .sort({ createdAt: 1 })
            .select('userId senderType feeInr createdAt')
            .lean();
        const uidStrs = [...new Set(inMonth.map((m) => String(m.userId)))];
        const prior = uidStrs.length === 0
            ? []
            : await ChatMessage_1.default.find({
                receiverId: rid,
                userId: { $in: uidStrs.map((id) => new mongoose_1.default.Types.ObjectId(id)) },
                createdAt: { $lt: startOfMonth },
            })
                .sort({ createdAt: 1 })
                .select('userId senderType feeInr createdAt')
                .lean();
        const byUser = new Map();
        for (const m of prior) {
            const k = String(m.userId);
            if (!byUser.has(k))
                byUser.set(k, []);
            byUser.get(k).push(m);
        }
        for (const m of inMonth) {
            const k = String(m.userId);
            if (!byUser.has(k))
                byUser.set(k, []);
            byUser.get(k).push(m);
        }
        for (const list of byUser.values()) {
            list.sort((a, b) => msgTime(a).getTime() - msgTime(b).getTime());
        }
        let chatToday = 0;
        let chatThisMonth = 0;
        const recentCandidates = [];
        for (const list of byUser.values()) {
            let receiverHasReplied = false;
            for (const m of list) {
                if (m.senderType === 'r') {
                    receiverHasReplied = true;
                    continue;
                }
                const t = msgTime(m);
                const fee = effectiveCallerFeeInr(m, receiverHasReplied);
                if (fee <= 0)
                    continue;
                if (t >= startOfToday)
                    chatToday += fee;
                if (t >= startOfMonth) {
                    chatThisMonth += fee;
                    recentCandidates.push({
                        id: String(m._id),
                        userId: String(m.userId),
                        amountInr: fee,
                        createdAt: t,
                    });
                }
            }
        }
        chatToday = roundInr(chatToday);
        chatThisMonth = roundInr(chatThisMonth);
        const completedCalls = await CallSession_1.default.find({
            receiverId: rid,
            status: 'completed',
            durationSec: { $gt: 0 },
        })
            .select('startedAt durationSec receiverEarnedInr receiverPayoutRatePerMinute')
            .lean();
        let callEarningsLifetime = 0;
        let callEarningsToday = 0;
        let callEarningsThisWeek = 0;
        for (const row of completedCalls) {
            const earned = effectiveCallReceiverEarnedInr(row);
            callEarningsLifetime += earned;
            if (row.startedAt >= startOfToday)
                callEarningsToday += earned;
            if (row.startedAt >= weekStart)
                callEarningsThisWeek += earned;
        }
        callEarningsLifetime = roundInr(callEarningsLifetime);
        callEarningsToday = roundInr(callEarningsToday);
        callEarningsThisWeek = roundInr(callEarningsThisWeek);
        recentCandidates.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        const topRecent = recentCandidates.slice(0, 20);
        const userIds = [...new Set(topRecent.map((r) => r.userId))];
        const callers = userIds.length > 0
            ? await User_1.default.find({ _id: { $in: userIds.map((id) => new mongoose_1.default.Types.ObjectId(id)) } })
                .select('name')
                .lean()
            : [];
        const nameById = new Map(callers.map((u) => [String(u._id), String(u.name ?? 'Caller')]));
        const recent = topRecent.map((r) => ({
            id: r.id,
            title: 'Chat message',
            subtitle: `From ${nameById.get(r.userId) ?? 'Caller'}`,
            amountInr: roundInr(r.amountInr),
            createdAt: r.createdAt.toISOString(),
        }));
        res.status(200).json({
            walletBalance,
            chatToday,
            chatThisMonth,
            callEarningsLifetime,
            callEarningsToday,
            callEarningsThisWeek,
            recent,
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('getReceiverWalletSummary error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.getReceiverWalletSummary = getReceiverWalletSummary;
/**
 * GET /profile/withdrawals/overview — receiver withdrawal card + history.
 */
const getReceiverWithdrawalOverview = async (req, res) => {
    try {
        if (req.accountKind !== 'receiver') {
            res.status(403).json({ message: 'Only receivers can view withdrawals' });
            return;
        }
        if ((0, accountAccess_1.blockReceiverUntilApproved)(req, res))
            return;
        const rid = String(req.receiver._id);
        const receiver = await Receiver_1.default.findById(rid).select('walletBalance email bankName bankAccountHolderName bankAccountNumber');
        if (!receiver) {
            res.status(404).json({ message: 'Receiver not found' });
            return;
        }
        if (!receiver.bankName ||
            !receiver.bankAccountHolderName ||
            !receiver.bankAccountNumber) {
            res.status(400).json({ message: 'Please complete bank details before requesting a withdrawal' });
            return;
        }
        const [pendingSumRows, recentRows] = await Promise.all([
            WithdrawalRequest_1.default.find({ receiverId: rid, status: 'pending' }).select('amount').lean(),
            WithdrawalRequest_1.default.find({ receiverId: rid, status: { $in: ['pending', 'approved', 'rejected'] } })
                .sort({ createdAt: -1 })
                .limit(20)
                .select('amount status createdAt payoutStatus payoutUtr')
                .lean(),
        ]);
        const pendingAmount = roundInr(pendingSumRows.reduce((sum, row) => sum + Number(row.amount || 0), 0));
        res.status(200).json({
            walletBalance: typeof receiver.walletBalance === 'number' && Number.isFinite(receiver.walletBalance)
                ? roundInr(receiver.walletBalance)
                : 0,
            pendingAmount,
            bank: {
                bankName: receiver.bankName,
                accountHolderName: receiver.bankAccountHolderName,
                accountMasked: maskAccountNumber(receiver.bankAccountNumber),
            },
            otpEmail: receiver.email,
            recent: recentRows.map((row) => ({
                id: String(row._id),
                amount: roundInr(row.amount),
                status: row.status,
                payoutStatus: row.payoutStatus && row.payoutStatus !== 'none' ? row.payoutStatus : undefined,
                createdAt: row.createdAt.toISOString(),
            })),
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('getReceiverWithdrawalOverview error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.getReceiverWithdrawalOverview = getReceiverWithdrawalOverview;
/**
 * POST /profile/withdrawals/send-otp — body `{ amount }`.
 */
const sendReceiverWithdrawalOtp = async (req, res) => {
    try {
        if (req.accountKind !== 'receiver') {
            res.status(403).json({ message: 'Only receivers can request withdrawals' });
            return;
        }
        if ((0, accountAccess_1.blockReceiverUntilApproved)(req, res))
            return;
        const amount = toInrAmount(req.body.amount);
        if (amount === null) {
            res.status(400).json({ message: 'amount must be at least 1 INR' });
            return;
        }
        const rid = String(req.receiver._id);
        const receiver = await Receiver_1.default.findById(rid).select('email walletBalance bankName bankAccountHolderName bankAccountNumber');
        if (!receiver) {
            res.status(404).json({ message: 'Receiver not found' });
            return;
        }
        const pendingAmount = await getPendingWithdrawalAmount(rid);
        const availableForNewRequest = roundInr(Math.max(0, receiver.walletBalance - pendingAmount));
        if (amount > availableForNewRequest) {
            res.status(400).json({ message: 'Insufficient wallet balance' });
            return;
        }
        if (!receiver.bankName ||
            !receiver.bankAccountHolderName ||
            !receiver.bankAccountNumber) {
            res.status(400).json({ message: 'Please complete bank details before requesting a withdrawal' });
            return;
        }
        const code = generateOtpCode();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
        await WithdrawalRequest_1.default.findOneAndUpdate({ receiverId: rid, status: 'verification_pending' }, {
            $set: {
                amount,
                status: 'verification_pending',
                verificationCodeHash: otpHash(code),
                verificationExpiresAt: expiresAt,
                verifiedAt: null,
                reviewedAt: null,
                reviewedByAdminId: null,
                adminNote: null,
                bankName: receiver.bankName,
                accountHolderName: receiver.bankAccountHolderName,
                accountMasked: maskAccountNumber(receiver.bankAccountNumber),
            },
        }, { upsert: true, new: true, setDefaultsOnInsert: true });
        await (0, email_1.sendOtpEmail)(receiver.email, code, 'verification');
        res.status(200).json({
            message: 'OTP sent to your Gmail',
            email: receiver.email,
            expiresInSec: 300,
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('sendReceiverWithdrawalOtp error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.sendReceiverWithdrawalOtp = sendReceiverWithdrawalOtp;
/**
 * POST /profile/withdrawals/verify — body `{ otp }`.
 */
const verifyReceiverWithdrawalOtpAndCreate = async (req, res) => {
    try {
        if (req.accountKind !== 'receiver') {
            res.status(403).json({ message: 'Only receivers can request withdrawals' });
            return;
        }
        if ((0, accountAccess_1.blockReceiverUntilApproved)(req, res))
            return;
        const otp = String(req.body.otp ?? '').trim();
        if (!/^\d{6}$/.test(otp)) {
            res.status(400).json({ message: 'Enter a valid 6-digit OTP' });
            return;
        }
        const rid = String(req.receiver._id);
        const [receiver, pendingVerification] = await Promise.all([
            Receiver_1.default.findById(rid).select('walletBalance'),
            WithdrawalRequest_1.default.findOne({ receiverId: rid, status: 'verification_pending' }),
        ]);
        if (!receiver) {
            res.status(404).json({ message: 'Receiver not found' });
            return;
        }
        if (!pendingVerification) {
            res.status(400).json({ message: 'Please request OTP again' });
            return;
        }
        if (!pendingVerification.verificationCodeHash ||
            !pendingVerification.verificationExpiresAt ||
            pendingVerification.verificationExpiresAt.getTime() < Date.now()) {
            await WithdrawalRequest_1.default.deleteOne({ _id: pendingVerification._id });
            res.status(400).json({ message: 'OTP expired. Please request again' });
            return;
        }
        if (otpHash(otp) !== pendingVerification.verificationCodeHash) {
            res.status(400).json({ message: 'Incorrect OTP' });
            return;
        }
        const pendingAmount = await getPendingWithdrawalAmount(rid);
        const availableForNewRequest = roundInr(Math.max(0, receiver.walletBalance - pendingAmount));
        if (pendingVerification.amount > availableForNewRequest) {
            res.status(400).json({ message: 'Insufficient wallet balance. Please reduce amount and retry' });
            return;
        }
        pendingVerification.status = 'pending';
        pendingVerification.verifiedAt = new Date();
        pendingVerification.verificationCodeHash = null;
        pendingVerification.verificationExpiresAt = null;
        pendingVerification.payoutStatus = 'processing';
        pendingVerification.payoutId = null;
        pendingVerification.payoutUtr = null;
        pendingVerification.payoutError = null;
        pendingVerification.walletDebitedAt = null;
        pendingVerification.walletRefundedAt = null;
        pendingVerification.payoutReferenceId = `wd_${String(pendingVerification._id).slice(-10)}`;
        await pendingVerification.save();
        (0, socketRegistry_1.emitReceiverWithdrawalUpdate)(rid, {
            withdrawalId: String(pendingVerification._id),
            amount: roundInr(pendingVerification.amount),
            payoutStatus: 'processing',
            message: 'Please wait, payment is processing',
        });
        void (0, razorpayXPayoutService_1.trackAndFinalizeRazorpayXPayout)(String(pendingVerification._id)).catch((e) => {
            const msg = e instanceof Error ? e.message : String(e);
            console.error('auto payout tracker error:', msg);
        });
        res.status(200).json({
            message: 'Please wait, payment is processing',
            withdrawal: {
                id: String(pendingVerification._id),
                amount: roundInr(pendingVerification.amount),
                status: pendingVerification.status,
                payoutStatus: pendingVerification.payoutStatus,
                createdAt: pendingVerification.createdAt.toISOString(),
            },
            walletBalance: roundInr(receiver.walletBalance),
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('verifyReceiverWithdrawalOtpAndCreate error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.verifyReceiverWithdrawalOtpAndCreate = verifyReceiverWithdrawalOtpAndCreate;
/**
 * GET /profile/receiver-call-insights — receiver dashboard call stats, recent calls, caller-wise history.
 */
const getReceiverCallInsights = async (req, res) => {
    try {
        if (req.accountKind !== 'receiver') {
            res.status(403).json({ message: 'Only receivers can access call insights' });
            return;
        }
        if ((0, accountAccess_1.blockReceiverUntilApproved)(req, res))
            return;
        const rid = new mongoose_1.default.Types.ObjectId(String(req.receiver._id));
        const range = String(req.query.range ?? 'all').toLowerCase();
        const now = new Date();
        const receiverMeta = await Receiver_1.default.findById(rid)
            .select('cumulativeScore badgeLevel earningRatePerMinute isOnline onlineSince')
            .lean();
        const liveOnlineScore = receiverMeta?.isOnline && receiverMeta.onlineSince instanceof Date
            ? computeLiveOnlineScore(receiverMeta.onlineSince, now)
            : 0;
        const persistedScore = typeof receiverMeta?.cumulativeScore === 'number' && Number.isFinite(receiverMeta.cumulativeScore)
            ? roundInr(receiverMeta.cumulativeScore)
            : 0;
        const effectiveTotalScore = roundInr(persistedScore + liveOnlineScore);
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - 7);
        const monthStart = new Date(now);
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);
        const completed = await CallSession_1.default.find({
            receiverId: rid,
            status: 'completed',
            durationSec: { $gt: 0 },
        })
            .sort({ startedAt: -1 })
            .lean();
        const callerIds = [...new Set(completed.map((c) => String(c.callerId)))];
        const callers = callerIds.length === 0
            ? []
            : await User_1.default.find({ _id: { $in: callerIds.map((id) => new mongoose_1.default.Types.ObjectId(id)) } })
                .select('_id name profileImage')
                .lean();
        const callerById = new Map(callers.map((c) => [String(c._id), { name: c.name, profileImage: c.profileImage ?? null }]));
        const totalDurationSec = completed.reduce((sum, row) => sum + row.durationSec, 0);
        const weekDurationSec = completed
            .filter((row) => row.startedAt >= weekStart)
            .reduce((sum, row) => sum + row.durationSec, 0);
        const monthDurationSec = completed
            .filter((row) => row.startedAt >= monthStart)
            .reduce((sum, row) => sum + row.durationSec, 0);
        const filtered = completed.filter((row) => {
            if (range === 'week')
                return row.startedAt >= weekStart;
            if (range === 'month')
                return row.startedAt >= monthStart;
            return true;
        });
        const recentCalls = filtered.slice(0, 20).map((row) => ({
            id: String(row._id),
            callerId: String(row.callerId),
            callerName: callerById.get(String(row.callerId))?.name ?? 'Caller',
            callerImage: callerById.get(String(row.callerId))?.profileImage ?? null,
            startedAt: row.startedAt.toISOString(),
            durationSec: row.durationSec,
            earningInr: roundInr(typeof row.receiverEarnedInr === 'number' && Number.isFinite(row.receiverEarnedInr)
                ? row.receiverEarnedInr
                : (row.durationSec / 60) *
                    (typeof row.receiverPayoutRatePerMinute === 'number' &&
                        Number.isFinite(row.receiverPayoutRatePerMinute)
                        ? row.receiverPayoutRatePerMinute
                        : 0)),
            rating: typeof row.callerRating === 'number' ? row.callerRating : null,
        }));
        const byCaller = new Map();
        for (const row of completed) {
            const callerId = String(row.callerId);
            if (!byCaller.has(callerId)) {
                byCaller.set(callerId, {
                    callerId,
                    callerName: callerById.get(callerId)?.name ?? 'Caller',
                    callsWeek: 0,
                    callsMonth: 0,
                    durationWeekSec: 0,
                    durationMonthSec: 0,
                    ratingSum: 0,
                    ratingCount: 0,
                });
            }
            const agg = byCaller.get(callerId);
            if (row.startedAt >= weekStart) {
                agg.callsWeek += 1;
                agg.durationWeekSec += row.durationSec;
            }
            if (row.startedAt >= monthStart) {
                agg.callsMonth += 1;
                agg.durationMonthSec += row.durationSec;
            }
            if (typeof row.callerRating === 'number') {
                agg.ratingSum += row.callerRating;
                agg.ratingCount += 1;
            }
        }
        const callerHistory = [...byCaller.values()]
            .sort((a, b) => b.durationMonthSec - a.durationMonthSec)
            .map((row) => ({
            callerId: row.callerId,
            callerName: row.callerName,
            callsWeek: row.callsWeek,
            callsMonth: row.callsMonth,
            durationWeekSec: row.durationWeekSec,
            durationMonthSec: row.durationMonthSec,
            avgRating: row.ratingCount > 0 ? roundInr(row.ratingSum / row.ratingCount) : null,
        }));
        const [ratingSummary] = await ReceiverRating_1.default.aggregate([
            { $match: { receiverId: rid } },
            {
                $group: {
                    _id: null,
                    avg: { $avg: '$rating' },
                    count: { $sum: 1 },
                },
            },
            { $project: { _id: 0, avg: 1, count: 1 } },
        ]);
        res.status(200).json({
            leaderboard: {
                totalDurationSec,
                totalMinutes: roundInr(totalDurationSec / 60),
                thisWeekDurationSec: weekDurationSec,
                thisWeekMinutes: roundInr(weekDurationSec / 60),
                thisMonthDurationSec: monthDurationSec,
                thisMonthMinutes: roundInr(monthDurationSec / 60),
            },
            recentCalls,
            callerHistory,
            receiverRatingAvg: ratingSummary && Number.isFinite(ratingSummary.avg) ? roundInr(ratingSummary.avg) : 0,
            receiverRatingCount: ratingSummary?.count ?? 0,
            totalScore: effectiveTotalScore,
            liveOnlineScore,
            badgeLevel: receiverMeta?.badgeLevel ?? 'platinum',
            earningRatePerMinute: typeof receiverMeta?.earningRatePerMinute === 'number' &&
                Number.isFinite(receiverMeta.earningRatePerMinute)
                ? roundInr(receiverMeta.earningRatePerMinute)
                : 2.0,
            scoreRules: {
                call: {
                    ignoreAtOrBelowSeconds: 55,
                    midBand: { minMinutes: 3, maxMinutesExclusive: 10, multiplier: 3 },
                    topBand: { minMinutes: 10, multiplier: 5 },
                },
                online: {
                    timezone: 'Asia/Kolkata',
                    windows: [
                        { from: '09:00', to: '21:00', multiplier: 0.5 },
                        { from: '22:00', to: '24:00', multiplier: 3 },
                        { from: '00:00', to: '02:00', multiplier: 10 },
                    ],
                },
                weekendTargets: {
                    weekday: { supremeAt: 12000, diamondAt: 8000 },
                    weekend: { supremeAt: 13000, diamondAt: 9000 },
                    note: 'Targets can be adjusted on weekends due to demand.',
                },
            },
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('getReceiverCallInsights error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.getReceiverCallInsights = getReceiverCallInsights;
/**
 * GET /profile/receiver-notify-candidates — latest 20 unique recent callers for manual ping.
 */
const getReceiverNotifyCandidates = async (req, res) => {
    try {
        if (req.accountKind !== 'receiver') {
            res.status(403).json({ message: 'Only receivers can view notify users list' });
            return;
        }
        if ((0, accountAccess_1.blockReceiverUntilApproved)(req, res))
            return;
        const receiverId = new mongoose_1.default.Types.ObjectId(String(req.receiver._id));
        const rows = await CallSession_1.default.find({
            receiverId,
            status: 'completed',
        })
            .sort({ startedAt: -1 })
            .limit(250)
            .select('callerId startedAt')
            .lean();
        const seen = new Set();
        const orderedCallerIds = [];
        const lastCallAtByCaller = new Map();
        for (const row of rows) {
            const cid = String(row.callerId);
            if (seen.has(cid))
                continue;
            seen.add(cid);
            orderedCallerIds.push(cid);
            lastCallAtByCaller.set(cid, row.startedAt);
            if (orderedCallerIds.length >= 20)
                break;
        }
        if (orderedCallerIds.length === 0) {
            res.status(200).json({ users: [] });
            return;
        }
        const users = await User_1.default.find({
            _id: { $in: orderedCallerIds.map((id) => new mongoose_1.default.Types.ObjectId(id)) },
            accountStatus: 'approved',
            suspended: { $ne: true },
        })
            .select('_id name profileImage')
            .lean();
        const byId = new Map(users.map((u) => [String(u._id), u]));
        const candidates = orderedCallerIds
            .map((id) => byId.get(id))
            .filter(Boolean)
            .map((u) => ({
            userId: String(u._id),
            name: u.name || 'User',
            profileImage: u.profileImage ?? null,
            lastCallAt: (lastCallAtByCaller.get(String(u._id)) ?? new Date()).toISOString(),
        }));
        res.status(200).json({ users: candidates });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('getReceiverNotifyCandidates error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.getReceiverNotifyCandidates = getReceiverNotifyCandidates;
const RECEIVER_NOTIFY_COOLDOWN_MS = 8 * 60 * 60 * 1000;
const RECEIVER_NOTIFY_PRIORITY_MS = 12 * 60 * 60 * 1000;
/**
 * POST /profile/receiver-notify-user — send manual availability ping to one recent caller.
 */
const notifyReceiverRecentUser = async (req, res) => {
    try {
        if (req.accountKind !== 'receiver') {
            res.status(403).json({ message: 'Only receivers can notify users' });
            return;
        }
        if ((0, accountAccess_1.blockReceiverUntilApproved)(req, res))
            return;
        const receiverId = String(req.receiver._id);
        const receiver = await Receiver_1.default.findById(receiverId).select('name accountStatus suspended isOnline isAvailable');
        if (!receiver || receiver.accountStatus !== 'approved' || receiver.suspended) {
            res.status(403).json({ message: 'Receiver account is not allowed for this action' });
            return;
        }
        if (!receiver.isOnline || !receiver.isAvailable) {
            res.status(409).json({ message: 'You can notify users only when online and available.' });
            return;
        }
        const userId = typeof req.body.userId === 'string' ? req.body.userId.trim() : '';
        if (!mongoose_1.default.Types.ObjectId.isValid(userId)) {
            res.status(400).json({ message: 'Valid userId is required' });
            return;
        }
        const uid = new mongoose_1.default.Types.ObjectId(userId);
        const recentLink = await CallSession_1.default.exists({
            receiverId: new mongoose_1.default.Types.ObjectId(receiverId),
            callerId: uid,
            status: 'completed',
        });
        if (!recentLink) {
            res.status(403).json({ message: 'You can notify only users from your recent call history.' });
            return;
        }
        const targetUser = await User_1.default.findById(uid).select('accountStatus suspended');
        if (!targetUser || targetUser.accountStatus !== 'approved' || targetUser.suspended) {
            res.status(404).json({ message: 'User not found or unavailable.' });
            return;
        }
        const cooldownSince = new Date(Date.now() - RECEIVER_NOTIFY_COOLDOWN_MS);
        const recentlyNotified = await ReceiverPriorityNotification_1.default.findOne({
            receiverId: new mongoose_1.default.Types.ObjectId(receiverId),
            userId: uid,
            lastNotifiedAt: { $gte: cooldownSince },
        }).select('_id');
        if (recentlyNotified) {
            res.status(429).json({ message: 'User already notified recently. Please wait before notifying again.' });
            return;
        }
        const now = new Date();
        await ReceiverPriorityNotification_1.default.findOneAndUpdate({
            receiverId: new mongoose_1.default.Types.ObjectId(receiverId),
            userId: uid,
        }, {
            $set: {
                lastNotifiedAt: now,
                priorityUntil: new Date(now.getTime() + RECEIVER_NOTIFY_PRIORITY_MS),
            },
        }, { upsert: true, new: true });
        const receiverName = receiver.name?.trim() || 'Receiver';
        await ReceiverAvailabilityNotification_1.default.create({
            userId: uid,
            receiverIds: [new mongoose_1.default.Types.ObjectId(receiverId)],
            title: `${receiverName} is available to talk now.`,
            subtitle: 'Open app and call now while she is available.',
        });
        res.status(200).json({ message: 'Notification sent successfully.' });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('notifyReceiverRecentUser error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.notifyReceiverRecentUser = notifyReceiverRecentUser;
/**
 * PATCH /profile/receiver — approved receivers can update editable profile fields.
 */
const updateReceiverProfile = async (req, res) => {
    try {
        if (req.accountKind !== 'receiver') {
            res.status(403).json({ message: 'This endpoint is only for receiver accounts' });
            return;
        }
        if ((0, accountAccess_1.blockReceiverUntilApproved)(req, res))
            return;
        const receiverId = String(req.receiver._id);
        const receiver = await Receiver_1.default.findById(receiverId);
        if (!receiver) {
            res.status(404).json({ message: 'Receiver not found' });
            return;
        }
        const wasAvailable = Boolean(receiver.isAvailable);
        const wasOnline = Boolean(receiver.isOnline);
        if (typeof req.body.name === 'string' && req.body.name.trim()) {
            receiver.name = req.body.name.trim();
        }
        if (typeof req.body.profileImage === 'string' && req.body.profileImage.trim()) {
            receiver.profileImage = req.body.profileImage.trim();
        }
        if (typeof req.body.state === 'string' && req.body.state.trim()) {
            receiver.state = req.body.state.trim();
        }
        if (Array.isArray(req.body.languages)) {
            receiver.languages = req.body.languages.map((x) => String(x).trim()).filter(Boolean);
        }
        if (Array.isArray(req.body.interests)) {
            receiver.interests = req.body.interests.map((x) => String(x).trim()).filter(Boolean);
        }
        receiver.audioCallRate = Receiver_1.RECEIVER_AUDIO_CALL_RATE_INR_PER_MIN;
        if (typeof req.body.isAvailable === 'boolean') {
            receiver.isAvailable = req.body.isAvailable;
        }
        await receiver.save();
        await (0, callQueue_1.syncReceiverQueueState)(receiverId);
        const becameCallAvailable = !wasAvailable && Boolean(receiver.isAvailable) && Boolean(receiver.isOnline) && wasOnline;
        if (becameCallAvailable) {
            void (0, receiverAvailabilityNotifier_1.scheduleReceiverAvailabilityNotifications)(receiverId).catch((e) => {
                const msg = e instanceof Error ? e.message : String(e);
                console.error('receiver availability notify error:', msg);
            });
        }
        res.status(200).json({
            message: 'Profile updated',
            user: (0, authController_1.toApiReceiver)(receiver),
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('updateReceiverProfile error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.updateReceiverProfile = updateReceiverProfile;
/**
 * POST /profile/receiver/reopen-kyc
 * Allows rejected receivers to re-enter the complete profile flow without logging out.
 */
const reopenRejectedReceiverKyc = async (req, res) => {
    try {
        if (req.accountKind !== 'receiver') {
            res.status(403).json({ message: 'Only receivers can reopen KYC' });
            return;
        }
        const receiverId = String(req.receiver._id);
        const receiver = await Receiver_1.default.findById(receiverId);
        if (!receiver) {
            res.status(404).json({ message: 'Receiver not found' });
            return;
        }
        if (receiver.accountStatus !== 'rejected') {
            res.status(400).json({ message: 'KYC can be reopened only from rejected status' });
            return;
        }
        receiver.accountStatus = 'pending_profile';
        receiver.rejectionReason = null;
        await receiver.save();
        res.status(200).json({
            message: 'KYC reopened',
            user: (0, authController_1.toApiReceiver)(receiver),
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('reopenRejectedReceiverKyc error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.reopenRejectedReceiverKyc = reopenRejectedReceiverKyc;
/**
 * DELETE /profile/receiver — deletes receiver account and related receiver-side data.
 */
const deleteReceiverAccount = async (req, res) => {
    try {
        if (req.accountKind !== 'receiver') {
            res.status(403).json({ message: 'This endpoint is only for receiver accounts' });
            return;
        }
        const receiverId = String(req.receiver._id);
        if (!mongoose_1.default.Types.ObjectId.isValid(receiverId)) {
            res.status(400).json({ message: 'Invalid receiver id' });
            return;
        }
        const rid = new mongoose_1.default.Types.ObjectId(receiverId);
        // Soft logging for ops visibility.
        const reason = String(req.body.reason ?? '').trim();
        if (reason) {
            console.log(`[receiver-delete] receiver=${receiverId} reason="${reason}"`);
        }
        await Promise.all([
            ChatMessage_1.default.deleteMany({ receiverId: rid }),
            ChatBlock_1.default.deleteMany({ receiverId: rid }),
            WithdrawalRequest_1.default.deleteMany({ receiverId: rid }),
            CallSession_1.default.deleteMany({ receiverId: rid }),
            UserReport_1.default.deleteMany({
                $or: [
                    { reporterKind: 'receiver', reporterId: rid },
                    { reportedKind: 'receiver', reportedId: rid },
                ],
            }),
            Receiver_1.default.deleteOne({ _id: rid }),
        ]);
        res.status(200).json({ message: 'Account deleted' });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('deleteReceiverAccount error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.deleteReceiverAccount = deleteReceiverAccount;
/**
 * POST /profile/receiver/bank/send-otp — stage bank details and send OTP.
 */
const sendReceiverBankUpdateOtp = async (req, res) => {
    try {
        if (req.accountKind !== 'receiver') {
            res.status(403).json({ message: 'Only receivers can update bank details' });
            return;
        }
        if ((0, accountAccess_1.blockReceiverUntilApproved)(req, res))
            return;
        const { bankAccountHolderName, bankAccountType, bankAccountNumber, bankIfsc, bankName, } = req.body;
        if (!bankAccountHolderName || !String(bankAccountHolderName).trim()) {
            res.status(400).json({ message: 'bankAccountHolderName is required' });
            return;
        }
        if (bankAccountType !== 'savings' && bankAccountType !== 'current') {
            res.status(400).json({ message: 'bankAccountType must be savings or current' });
            return;
        }
        if (!bankAccountNumber || !String(bankAccountNumber).trim()) {
            res.status(400).json({ message: 'bankAccountNumber is required' });
            return;
        }
        if (!bankIfsc || !String(bankIfsc).trim()) {
            res.status(400).json({ message: 'bankIfsc is required' });
            return;
        }
        if (!bankName || !String(bankName).trim()) {
            res.status(400).json({ message: 'bankName is required' });
            return;
        }
        const receiver = await Receiver_1.default.findById(String(req.receiver._id)).select('email');
        if (!receiver) {
            res.status(404).json({ message: 'Receiver not found' });
            return;
        }
        const otpCode = generateOtpCode();
        receiver.otp = otpHash(otpCode);
        receiver.otpExpiry = new Date(Date.now() + 5 * 60 * 1000);
        receiver.pendingBankAccountHolderName = String(bankAccountHolderName).trim();
        receiver.pendingBankAccountType = bankAccountType;
        receiver.pendingBankAccountNumber = String(bankAccountNumber).trim();
        receiver.pendingBankIfsc = String(bankIfsc).trim().toUpperCase();
        receiver.pendingBankName = String(bankName).trim();
        await receiver.save();
        await (0, email_1.sendOtpEmail)(receiver.email, otpCode, 'verification');
        res.status(200).json({
            message: 'OTP sent to your Gmail',
            emailMasked: maskEmail(receiver.email),
            expiresInSec: 300,
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('sendReceiverBankUpdateOtp error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.sendReceiverBankUpdateOtp = sendReceiverBankUpdateOtp;
/**
 * POST /profile/receiver/bank/verify — verify OTP and commit bank details.
 */
const verifyReceiverBankUpdateOtp = async (req, res) => {
    try {
        if (req.accountKind !== 'receiver') {
            res.status(403).json({ message: 'Only receivers can update bank details' });
            return;
        }
        if ((0, accountAccess_1.blockReceiverUntilApproved)(req, res))
            return;
        const otp = String(req.body.otp ?? '').trim();
        if (!/^\d{6}$/.test(otp)) {
            res.status(400).json({ message: 'Enter a valid 6-digit OTP' });
            return;
        }
        const receiver = await Receiver_1.default.findById(String(req.receiver._id));
        if (!receiver) {
            res.status(404).json({ message: 'Receiver not found' });
            return;
        }
        if (!receiver.otp || !receiver.otpExpiry || receiver.otpExpiry.getTime() < Date.now()) {
            res.status(400).json({ message: 'OTP expired. Request a new code' });
            return;
        }
        if (otpHash(otp) !== receiver.otp) {
            res.status(400).json({ message: 'Incorrect OTP' });
            return;
        }
        if (!receiver.pendingBankAccountHolderName ||
            !receiver.pendingBankAccountType ||
            !receiver.pendingBankAccountNumber ||
            !receiver.pendingBankIfsc ||
            !receiver.pendingBankName) {
            res.status(400).json({ message: 'No pending bank details found. Start again' });
            return;
        }
        receiver.bankAccountHolderName = receiver.pendingBankAccountHolderName;
        receiver.bankAccountType = receiver.pendingBankAccountType;
        receiver.bankAccountNumber = receiver.pendingBankAccountNumber;
        receiver.bankIfsc = receiver.pendingBankIfsc;
        receiver.bankName = receiver.pendingBankName;
        receiver.pendingBankAccountHolderName = null;
        receiver.pendingBankAccountType = null;
        receiver.pendingBankAccountNumber = null;
        receiver.pendingBankIfsc = null;
        receiver.pendingBankName = null;
        receiver.otp = null;
        receiver.otpExpiry = null;
        await receiver.save();
        res.status(200).json({
            message: 'Bank details updated',
            user: (0, authController_1.toApiReceiver)(receiver),
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('verifyReceiverBankUpdateOtp error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.verifyReceiverBankUpdateOtp = verifyReceiverBankUpdateOtp;
/**
 * GET /profile/receiver-earnings-breakdown — earnings cards, list, analytics (calls + chat).
 */
const getReceiverEarningsBreakdown = async (req, res) => {
    try {
        if (req.accountKind !== 'receiver') {
            res.status(403).json({ message: 'Only receivers can view earnings' });
            return;
        }
        if ((0, accountAccess_1.blockReceiverUntilApproved)(req, res))
            return;
        const rid = new mongoose_1.default.Types.ObjectId(String(req.receiver._id));
        const range = String(req.query.range ?? 'week').toLowerCase();
        const now = new Date();
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - 7);
        weekStart.setHours(0, 0, 0, 0);
        const monthStart = new Date(now);
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);
        const minDate = range === 'all' ? null : range === 'month' ? monthStart : weekStart;
        const [calls, chats] = await Promise.all([
            CallSession_1.default.find({
                receiverId: rid,
                status: 'completed',
                durationSec: { $gt: 0 },
                ...(minDate ? { startedAt: { $gte: minDate } } : {}),
            })
                .sort({ startedAt: -1 })
                .lean(),
            ChatMessage_1.default.find({
                receiverId: rid,
                senderType: 'u',
                feeInr: { $gt: 0 },
                ...(minDate ? { createdAt: { $gte: minDate } } : {}),
            })
                .sort({ createdAt: -1 })
                .lean(),
        ]);
        const callRows = calls.map((c) => {
            const gross = roundInr(typeof c.receiverEarnedInr === 'number' && Number.isFinite(c.receiverEarnedInr)
                ? c.receiverEarnedInr
                : (c.durationSec / 60) *
                    (typeof c.receiverPayoutRatePerMinute === 'number' &&
                        Number.isFinite(c.receiverPayoutRatePerMinute)
                        ? c.receiverPayoutRatePerMinute
                        : 0));
            const fee = roundInr(gross * 0.2);
            const net = roundInr(gross - fee);
            return {
                id: `call-${String(c._id)}`,
                type: 'call',
                title: 'Voice Call',
                createdAt: c.startedAt.toISOString(),
                durationMin: roundInr(c.durationSec / 60),
                grossAmount: gross,
                platformFee: fee,
                netEarning: net,
                status: 'completed',
            };
        });
        const chatRows = chats.map((m) => {
            const gross = roundInr(m.feeInr);
            const fee = roundInr(gross * 0.2);
            const net = roundInr(gross - fee);
            return {
                id: `chat-${String(m._id)}`,
                type: 'chat',
                title: 'Chat Message',
                createdAt: m.createdAt.toISOString(),
                durationMin: 0,
                grossAmount: gross,
                platformFee: fee,
                netEarning: net,
                status: 'completed',
            };
        });
        const entries = [...callRows, ...chatRows].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        const totalMinutes = roundInr(callRows.reduce((sum, r) => sum + r.durationMin, 0));
        const grossEarnings = roundInr(entries.reduce((sum, r) => sum + r.grossAmount, 0));
        const platformFee = roundInr(entries.reduce((sum, r) => sum + r.platformFee, 0));
        const netEarnings = roundInr(entries.reduce((sum, r) => sum + r.netEarning, 0));
        const chatEarnings = roundInr(chatRows.reduce((sum, r) => sum + r.netEarning, 0));
        const totalCalls = callRows.length;
        const avgCallMinutes = totalCalls > 0 ? roundInr(totalMinutes / totalCalls) : 0;
        function analyticsFor(mode) {
            const baseDate = mode === 'all' ? null : mode === 'month' ? monthStart : weekStart;
            const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
            const dayBuckets = new Map();
            for (let i = 0; i < 7; i += 1)
                dayBuckets.set(i, { amount: 0, sessions: 0 });
            for (const r of entries) {
                const d = new Date(r.createdAt);
                if (baseDate && d < baseDate)
                    continue;
                const idx = (d.getDay() + 6) % 7; // Monday=0
                const b = dayBuckets.get(idx);
                b.amount += r.netEarning;
                b.sessions += 1;
            }
            return labels.map((label, idx) => ({
                label,
                amount: roundInr(dayBuckets.get(idx).amount),
                sessions: dayBuckets.get(idx).sessions,
            }));
        }
        res.status(200).json({
            stats: {
                totalCalls,
                avgCallMinutes,
                totalMinutes,
                grossEarnings,
                platformFee,
                netEarnings,
                chatEarnings,
            },
            entries: entries.slice(0, 80),
            analytics: {
                week: analyticsFor('week'),
                month: analyticsFor('month'),
                all: analyticsFor('all'),
            },
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('getReceiverEarningsBreakdown error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.getReceiverEarningsBreakdown = getReceiverEarningsBreakdown;
/**
 * GET /profile/caller-call-history — caller call tab list.
 */
const getCallerCallHistory = async (req, res) => {
    try {
        if (req.accountKind !== 'user') {
            res.status(403).json({ message: 'Only callers can view call history' });
            return;
        }
        const authUser = req.user;
        if (!authUser?._id) {
            res.status(401).json({ message: 'Not authorized' });
            return;
        }
        const range = String(req.query.range ?? 'all').toLowerCase();
        const uid = new mongoose_1.default.Types.ObjectId(String(authUser._id));
        const now = new Date();
        const start = new Date(now);
        if (range === 'week')
            start.setDate(now.getDate() - 7);
        else if (range === 'month') {
            start.setDate(1);
            start.setHours(0, 0, 0, 0);
        }
        const filter = { callerId: uid, status: 'completed' };
        if (range !== 'all')
            filter.startedAt = { $gte: start };
        const rows = await CallSession_1.default.find(filter)
            .sort({ startedAt: -1 })
            .limit(100)
            .lean();
        const receiverIds = [...new Set(rows.map((r) => String(r.receiverId)))];
        const receivers = receiverIds.length === 0
            ? []
            : await Receiver_1.default.find({ _id: { $in: receiverIds.map((id) => new mongoose_1.default.Types.ObjectId(id)) } })
                .select('_id name profileImage')
                .lean();
        const byReceiver = new Map(receivers.map((r) => [String(r._id), r]));
        const statusFor = (durationSec) => {
            if (durationSec <= 0)
                return 'missed';
            if (durationSec < 15)
                return 'failed';
            return 'completed';
        };
        res.status(200).json({
            calls: rows.map((r) => ({
                id: String(r._id),
                receiverId: String(r.receiverId),
                receiverName: byReceiver.get(String(r.receiverId))?.name ?? 'Receiver',
                receiverImage: byReceiver.get(String(r.receiverId))?.profileImage ?? null,
                durationSec: r.durationSec,
                startedAt: r.startedAt.toISOString(),
                status: statusFor(r.durationSec),
            })),
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('getCallerCallHistory error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.getCallerCallHistory = getCallerCallHistory;
/**
 * GET /profile/caller-notifications — caller notifications (transaction/chat/call).
 */
const getCallerNotifications = async (req, res) => {
    try {
        if (req.accountKind !== 'user') {
            res.status(403).json({ message: 'Only callers can view notifications' });
            return;
        }
        const authUser = req.user;
        if (!authUser?._id) {
            res.status(401).json({ message: 'Not authorized' });
            return;
        }
        const uid = new mongoose_1.default.Types.ObjectId(String(authUser._id));
        const [topups, callRows, convoRows, availabilityRows] = await Promise.all([
            WalletTopup_1.default.find({ userId: uid })
                .sort({ createdAt: -1 })
                .limit(20)
                .select('payAmount creditAdded createdAt')
                .lean(),
            CallSession_1.default.find({ callerId: uid, status: 'completed' })
                .sort({ startedAt: -1 })
                .limit(20)
                .select('receiverId durationSec startedAt')
                .lean(),
            ChatMessage_1.default.aggregate([
                { $match: { userId: uid } },
                { $sort: { createdAt: -1 } },
                {
                    $group: {
                        _id: '$receiverId',
                        lastText: { $first: '$text' },
                        lastAt: { $first: '$createdAt' },
                    },
                },
                {
                    $project: {
                        _id: 0,
                        receiverId: { $toString: '$_id' },
                        lastText: 1,
                        lastAt: 1,
                    },
                },
            ]),
            ReceiverAvailabilityNotification_1.default.find({ userId: uid })
                .sort({ createdAt: -1 })
                .limit(20)
                .select('title subtitle createdAt')
                .lean(),
        ]);
        const receiverIds = [
            ...new Set([
                ...callRows.map((r) => String(r.receiverId)),
                ...convoRows.map((r) => r.receiverId),
            ]),
        ];
        const receivers = receiverIds.length === 0
            ? []
            : await Receiver_1.default.find({ _id: { $in: receiverIds.map((id) => new mongoose_1.default.Types.ObjectId(id)) } })
                .select('_id name')
                .lean();
        const receiverNameById = new Map(receivers.map((r) => [String(r._id), r.name]));
        const notifications = [
            ...topups.map((row) => ({
                id: `txn-${String(row._id)}`,
                type: 'transaction',
                title: 'Wallet Recharge Successful',
                subtitle: `₹${roundInr(row.payAmount)} credited ₹${roundInr(row.creditAdded)}`,
                at: row.createdAt.toISOString(),
            })),
            ...callRows.map((row) => ({
                id: `call-${String(row._id)}`,
                type: 'call',
                title: `Call with ${receiverNameById.get(String(row.receiverId)) ?? 'Receiver'}`,
                subtitle: `Duration ${Math.max(1, Math.round(row.durationSec / 60))} min`,
                at: row.startedAt.toISOString(),
            })),
            ...convoRows.map((row) => ({
                id: `chat-${row.receiverId}`,
                type: 'chat',
                title: `Message from ${receiverNameById.get(row.receiverId) ?? 'Receiver'}`,
                subtitle: row.lastText || 'New chat message',
                at: row.lastAt.toISOString(),
            })),
            ...availabilityRows.map((row) => ({
                id: `avail-${String(row._id)}`,
                type: 'call',
                title: row.title,
                subtitle: row.subtitle,
                at: row.createdAt.toISOString(),
            })),
        ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
        res.status(200).json({ notifications: notifications.slice(0, 50) });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('getCallerNotifications error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.getCallerNotifications = getCallerNotifications;
