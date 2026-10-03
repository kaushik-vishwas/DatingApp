"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isValidReferralCodeFormat = isValidReferralCodeFormat;
exports.generateUniqueReferralCode = generateUniqueReferralCode;
exports.ensureReferralCodeForAccount = ensureReferralCodeForAccount;
exports.findReferrerByCode = findReferrerByCode;
exports.applyReferralRewardOnSignup = applyReferralRewardOnSignup;
exports.getReferralStatsForAccount = getReferralStatsForAccount;
exports.buildReferralShareUrl = buildReferralShareUrl;
const crypto_1 = __importDefault(require("crypto"));
const mongoose_1 = __importDefault(require("mongoose"));
const User_1 = __importDefault(require("../models/User"));
const Receiver_1 = __importDefault(require("../models/Receiver"));
const Referral_1 = __importDefault(require("../models/Referral"));
const ReferralAlert_1 = __importDefault(require("../models/ReferralAlert"));
const WalletCredit_1 = __importDefault(require("../models/WalletCredit"));
const ReceiverWalletCredit_1 = __importDefault(require("../models/ReceiverWalletCredit"));
const referralRewards_1 = require("../constants/referralRewards");
const phoneNormalize_1 = require("../utils/phoneNormalize");
const referralLanding_1 = require("../constants/referralLanding");
const REFERRAL_BURST_WINDOW_MS = 60 * 60 * 1000;
const REFERRAL_BURST_COUNT = 5;
const REFERRAL_CODE_LENGTH = 8;
const REFERRAL_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** Play/Meta install referrer strings that match code format but are not referrals. */
const IGNORED_REFERRAL_CODES = new Set([
    'ORGANIC',
    'ORGANIC_INSTALL',
    'GOOGLE_PLAY',
    'PLAY_STORE',
    'NONE',
    'NULL',
    'UNDEFINED',
    'FACEBOOK',
    'INSTAGRAM',
    'GOOGLE',
]);
function roundInr(n) {
    return Math.round(n * 100) / 100;
}
function normalizeReferralCode(raw) {
    return String(raw ?? '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');
}
function isValidReferralCodeFormat(code) {
    return /^[A-Z0-9]{6,12}$/.test(code);
}
function randomReferralCodeCandidate() {
    const bytes = crypto_1.default.randomBytes(REFERRAL_CODE_LENGTH);
    let out = '';
    for (let i = 0; i < REFERRAL_CODE_LENGTH; i += 1) {
        out += REFERRAL_CODE_ALPHABET[bytes[i] % REFERRAL_CODE_ALPHABET.length];
    }
    return out;
}
async function referralCodeExists(code) {
    const [userHit, receiverHit] = await Promise.all([
        User_1.default.exists({ referralCode: code }),
        Receiver_1.default.exists({ referralCode: code }),
    ]);
    return Boolean(userHit || receiverHit);
}
async function generateUniqueReferralCode() {
    for (let attempt = 0; attempt < 12; attempt += 1) {
        const code = randomReferralCodeCandidate();
        if (!(await referralCodeExists(code)))
            return code;
    }
    throw new Error('Failed to generate unique referral code');
}
async function ensureReferralCodeForAccount(kind, accountId) {
    if (!mongoose_1.default.Types.ObjectId.isValid(accountId)) {
        throw new Error('Invalid account id');
    }
    if (kind === 'user') {
        const doc = await User_1.default.findById(accountId).select('referralCode');
        if (!doc)
            throw new Error('Account not found');
        const existing = typeof doc.referralCode === 'string' ? doc.referralCode.trim().toUpperCase() : '';
        if (existing)
            return existing;
        for (let attempt = 0; attempt < 12; attempt += 1) {
            const code = await generateUniqueReferralCode();
            const updated = await User_1.default.findOneAndUpdate({ _id: accountId, $or: [{ referralCode: null }, { referralCode: '' }, { referralCode: { $exists: false } }] }, { $set: { referralCode: code } }, { new: true }).select('referralCode');
            if (updated?.referralCode)
                return updated.referralCode;
            const fresh = await User_1.default.findById(accountId).select('referralCode');
            if (fresh?.referralCode)
                return fresh.referralCode;
        }
        throw new Error('Failed to assign referral code');
    }
    const doc = await Receiver_1.default.findById(accountId).select('referralCode');
    if (!doc)
        throw new Error('Account not found');
    const existing = typeof doc.referralCode === 'string' ? doc.referralCode.trim().toUpperCase() : '';
    if (existing)
        return existing;
    for (let attempt = 0; attempt < 12; attempt += 1) {
        const code = await generateUniqueReferralCode();
        const updated = await Receiver_1.default.findOneAndUpdate({ _id: accountId, $or: [{ referralCode: null }, { referralCode: '' }, { referralCode: { $exists: false } }] }, { $set: { referralCode: code } }, { new: true }).select('referralCode');
        if (updated?.referralCode)
            return updated.referralCode;
        const fresh = await Receiver_1.default.findById(accountId).select('referralCode');
        if (fresh?.referralCode)
            return fresh.referralCode;
    }
    throw new Error('Failed to assign referral code');
}
async function findReferrerByCode(codeRaw) {
    const code = normalizeReferralCode(codeRaw);
    if (!isValidReferralCodeFormat(code))
        return null;
    const [user, receiver] = await Promise.all([
        User_1.default.findOne({ referralCode: code }).select('_id phone').lean(),
        Receiver_1.default.findOne({ referralCode: code })
            .select('_id phone')
            .lean(),
    ]);
    if (user) {
        return { kind: 'user', id: user._id, phone: user.phone, role: 'caller' };
    }
    if (receiver) {
        return { kind: 'receiver', id: receiver._id, phone: receiver.phone, role: 'receiver' };
    }
    return null;
}
function phonesMatch(a, b) {
    const va = (0, phoneNormalize_1.phoneLookupVariants)(a);
    const vb = (0, phoneNormalize_1.phoneLookupVariants)(b);
    return va.some((x) => vb.includes(x));
}
function referredRoleFromKind(kind) {
    return kind === 'user' ? 'caller' : 'receiver';
}
async function rewardedPhoneAlreadyUsed(phoneKey, variants) {
    const or = [{ referredPhoneKey: phoneKey }];
    if (variants.length > 0)
        or.push({ referredPhone: { $in: variants } });
    const hit = await Referral_1.default.exists({ status: 'rewarded', $or: or });
    return Boolean(hit);
}
async function recordReferralAlert(params) {
    try {
        if (params.type === 'burst') {
            const since = new Date(Date.now() - REFERRAL_BURST_WINDOW_MS);
            const recent = await ReferralAlert_1.default.exists({
                type: 'burst',
                referrerId: params.referrerId,
                createdAt: { $gte: since },
            });
            if (recent)
                return;
        }
        await ReferralAlert_1.default.create(params);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[referral] alert write failed:', msg);
    }
}
async function noteReferralBurst(params) {
    const since = new Date(Date.now() - REFERRAL_BURST_WINDOW_MS);
    const count = await Referral_1.default.countDocuments({
        referrerKind: params.referrerKind,
        referrerId: params.referrerId,
        status: 'rewarded',
        rewardedAt: { $gte: since },
    });
    if (count < REFERRAL_BURST_COUNT)
        return;
    await recordReferralAlert({
        type: 'burst',
        referrerKind: params.referrerKind,
        referrerId: params.referrerId,
        referrerPhone: params.referrerPhone,
        referredPhoneKey: '',
        referralCode: params.referralCode,
        message: `${count} referral rewards in the last hour`,
    });
}
async function applyReferralRewardOnSignup(params) {
    const code = normalizeReferralCode(params.referralCode);
    if (!code) {
        return { applied: false, reason: 'no_code' };
    }
    if (IGNORED_REFERRAL_CODES.has(code)) {
        return { applied: false, reason: 'no_code' };
    }
    if (!isValidReferralCodeFormat(code)) {
        console.warn('[referral] invalid code format', { code: code.slice(0, 12) });
        return { applied: false, reason: 'invalid_code' };
    }
    if (!mongoose_1.default.Types.ObjectId.isValid(params.referredId)) {
        return { applied: false, reason: 'invalid_referred_id' };
    }
    const referrer = await findReferrerByCode(code);
    if (!referrer) {
        console.warn('[referral] code not found', { code });
        return { applied: false, reason: 'code_not_found' };
    }
    if (String(referrer.id) === params.referredId && referrer.kind === params.referredKind) {
        console.warn('[referral] self referral blocked', { referredId: params.referredId });
        return { applied: false, reason: 'self_referral' };
    }
    if (phonesMatch(referrer.phone, params.referredPhone)) {
        console.warn('[referral] same phone referral blocked', { referredPhone: params.referredPhone });
        return { applied: false, reason: 'same_phone' };
    }
    const phoneKey = (0, phoneNormalize_1.normalizeIndianMobilePhone)(params.referredPhone);
    const phoneVariants = (0, phoneNormalize_1.phoneLookupVariants)(params.referredPhone);
    if (!phoneKey) {
        return { applied: false, reason: 'invalid_phone' };
    }
    if (await rewardedPhoneAlreadyUsed(phoneKey, phoneVariants)) {
        console.warn('[referral] phone already rewarded', { referredPhone: phoneKey });
        await recordReferralAlert({
            type: 'duplicate_phone',
            referrerKind: referrer.kind,
            referrerId: referrer.id,
            referrerPhone: referrer.phone,
            referredPhoneKey: phoneKey,
            referralCode: code,
            message: 'Signup reused a mobile number that already received a referral reward',
        });
        return { applied: false, reason: 'phone_already_rewarded' };
    }
    const referredRole = referredRoleFromKind(params.referredKind);
    const rewardInr = roundInr((0, referralRewards_1.resolveReferralRewardInr)(referrer.role, referredRole));
    if (rewardInr <= 0) {
        return { applied: false, reason: 'zero_reward' };
    }
    const description = referredRole === 'caller'
        ? `Referral reward — new caller joined (${code})`
        : `Referral reward — new receiver joined (${code})`;
    const session = await mongoose_1.default.startSession();
    try {
        let referralId;
        await session.withTransaction(async () => {
            const referral = await Referral_1.default.create([
                {
                    referralCode: code,
                    referrerKind: referrer.kind,
                    referrerId: referrer.id,
                    referredKind: params.referredKind,
                    referredId: new mongoose_1.default.Types.ObjectId(params.referredId),
                    referredPhone: params.referredPhone,
                    referredPhoneKey: phoneKey,
                    rewardInr,
                    status: 'rewarded',
                    rejectReason: null,
                    rewardedAt: new Date(),
                    walletCreditKind: referrer.kind,
                    walletCreditId: null,
                },
            ], { session });
            const referralDoc = referral[0];
            if (!referralDoc)
                throw new Error('Referral row missing after create');
            referralId = String(referralDoc._id);
            if (referrer.kind === 'user') {
                const credit = await WalletCredit_1.default.create([
                    {
                        userId: referrer.id,
                        source: 'referral_reward',
                        amountInr: rewardInr,
                        referralId: referralDoc._id,
                        description,
                    },
                ], { session });
                const creditDoc = credit[0];
                if (!creditDoc)
                    throw new Error('Wallet credit row missing after create');
                await User_1.default.updateOne({ _id: referrer.id }, { $inc: { walletBalance: rewardInr } }, { session });
                referralDoc.walletCreditId = creditDoc._id;
                await referralDoc.save({ session });
            }
            else {
                const credit = await ReceiverWalletCredit_1.default.create([
                    {
                        receiverId: referrer.id,
                        source: 'referral_reward',
                        amountInr: rewardInr,
                        referralId: referralDoc._id,
                        description,
                    },
                ], { session });
                const creditDoc = credit[0];
                if (!creditDoc)
                    throw new Error('Receiver wallet credit row missing after create');
                await Receiver_1.default.updateOne({ _id: referrer.id }, { $inc: { walletBalance: rewardInr } }, { session });
                referralDoc.walletCreditId = creditDoc._id;
                await referralDoc.save({ session });
            }
        });
        console.log('[referral] reward applied', {
            referralId,
            referrerKind: referrer.kind,
            referrerId: String(referrer.id),
            referredKind: params.referredKind,
            referredId: params.referredId,
            rewardInr,
            code,
        });
        void noteReferralBurst({
            referrerKind: referrer.kind,
            referrerId: referrer.id,
            referrerPhone: referrer.phone,
            referralCode: code,
        });
        return { applied: true, rewardInr, referralId };
    }
    catch (err) {
        const codeNum = err?.code;
        if (codeNum === 11000) {
            const phoneCollision = Boolean(err.keyPattern?.referredPhoneKey);
            if (phoneCollision) {
                console.warn('[referral] phone already rewarded', { referredPhone: phoneKey });
                await recordReferralAlert({
                    type: 'duplicate_phone',
                    referrerKind: referrer.kind,
                    referrerId: referrer.id,
                    referrerPhone: referrer.phone,
                    referredPhoneKey: phoneKey,
                    referralCode: code,
                    message: 'Signup reused a mobile number that already received a referral reward',
                });
                return { applied: false, reason: 'phone_already_rewarded' };
            }
            console.warn('[referral] duplicate referred account — reward already granted', {
                referredKind: params.referredKind,
                referredId: params.referredId,
            });
            return { applied: false, reason: 'already_rewarded' };
        }
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[referral] applyReferralRewardOnSignup error:', msg, {
            referredKind: params.referredKind,
            referredId: params.referredId,
            code,
        });
        return { applied: false, reason: 'internal_error' };
    }
    finally {
        await session.endSession();
    }
}
async function getReferralStatsForAccount(kind, accountId) {
    if (!mongoose_1.default.Types.ObjectId.isValid(accountId)) {
        return { totalReferred: 0, totalRewardInr: 0 };
    }
    const [agg] = await Referral_1.default.aggregate([
        {
            $match: {
                referrerKind: kind,
                referrerId: new mongoose_1.default.Types.ObjectId(accountId),
                status: 'rewarded',
            },
        },
        {
            $group: {
                _id: null,
                totalReferred: { $sum: 1 },
                totalRewardInr: { $sum: '$rewardInr' },
            },
        },
    ]);
    return {
        totalReferred: agg?.totalReferred ?? 0,
        totalRewardInr: roundInr(agg?.totalRewardInr ?? 0),
    };
}
function buildReferralShareUrl(referralCode) {
    const base = (0, referralLanding_1.getReferralLandingBaseUrl)();
    return `${base}/${encodeURIComponent(referralCode)}`;
}
