"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getReceiverWalletSummary = exports.updateCallerProfile = exports.completeCallerProfile = exports.saveCallerUserAudio = exports.completeProfile = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const User_1 = __importDefault(require("../models/User"));
const Receiver_1 = __importDefault(require("../models/Receiver"));
const ChatMessage_1 = __importDefault(require("../models/ChatMessage"));
const callerProfileAllowlist_1 = require("../constants/callerProfileAllowlist");
const authController_1 = require("./authController");
const accountAccess_1 = require("../utils/accountAccess");
const chatPricing_1 = require("../constants/chatPricing");
const birthDate_1 = require("../utils/birthDate");
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
        const { name, profileImage, aadhaarFront, aadhaarBack, languages, interests, gender, dateOfBirth, state, bankAccountHolderName, bankAccountType, bankAccountNumber, bankIfsc, bankName, audioCallRate, } = req.body;
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
        const rateNum = Number(audioCallRate);
        if (!Number.isFinite(rateNum) || rateNum < 1 || rateNum > 99_999) {
            res.status(400).json({ message: 'audioCallRate must be a number between 1 and 99999 (INR per minute)' });
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
        receiver.name = String(name).trim();
        receiver.profileImage = profileImage.trim();
        receiver.aadhaarFront = front;
        receiver.aadhaarBack = back;
        receiver.documents = [front, back];
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
        receiver.audioCallRate = Math.round(rateNum * 100) / 100;
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
 * App user profile (`users` collection) — sets `accountStatus: approved` and `suspended: true` until admin clears suspension.
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
        if (!voiceUrl) {
            res.status(400).json({ message: 'userAudio must be a valid https URL' });
            return;
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
                userAudio: voiceUrl,
                accountStatus: 'approved',
                suspended: true,
            },
        }, { new: true, runValidators: true });
        if (!updated) {
            res.status(400).json({
                message: 'Profile already submitted or cannot be edited this way',
            });
            return;
        }
        res.status(200).json({
            message: 'Profile submitted — an admin will enable your access shortly',
            user: (0, authController_1.toApiUser)(updated),
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
/**
 * GET /profile/receiver-wallet-summary — wallet balance, chat earnings today / this month, recent rows.
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
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
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
