"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateReferralCode = exports.getMyReferralProfile = void 0;
const referralService_1 = require("../services/referralService");
const referralRewards_1 = require("../constants/referralRewards");
/**
 * GET /profile/referral — caller/receiver referral code, share URL, and reward stats.
 */
const getMyReferralProfile = async (req, res) => {
    try {
        const kind = req.accountKind;
        if (kind !== 'user' && kind !== 'receiver') {
            res.status(403).json({ message: 'Not authorized' });
            return;
        }
        const accountId = kind === 'user'
            ? String(req.user?._id ?? '')
            : String(req.receiver?._id ?? '');
        if (!accountId) {
            res.status(401).json({ message: 'Not authorized' });
            return;
        }
        const referralCode = await (0, referralService_1.ensureReferralCodeForAccount)(kind, accountId);
        const stats = await (0, referralService_1.getReferralStatsForAccount)(kind, accountId);
        const role = kind === 'user' ? 'caller' : 'receiver';
        res.status(200).json({
            referralCode,
            shareUrl: (0, referralService_1.buildReferralShareUrl)(referralCode),
            role,
            rewardMatrixInr: referralRewards_1.REFERRAL_REWARD_MATRIX_INR[role],
            stats,
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('getMyReferralProfile error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.getMyReferralProfile = getMyReferralProfile;
/**
 * GET /profile/referral/validate/:code — public-ish validation for signup (no auth required).
 */
const validateReferralCode = async (req, res) => {
    try {
        const code = String(req.params.code ?? '').trim().toUpperCase();
        if (!(0, referralService_1.isValidReferralCodeFormat)(code)) {
            res.status(400).json({ valid: false, message: 'Invalid referral code format' });
            return;
        }
        const referrer = await (0, referralService_1.findReferrerByCode)(code);
        if (!referrer) {
            res.status(404).json({ valid: false, message: 'Referral code not found' });
            return;
        }
        res.status(200).json({ valid: true, referrerRole: referrer.role });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('validateReferralCode error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.validateReferralCode = validateReferralCode;
