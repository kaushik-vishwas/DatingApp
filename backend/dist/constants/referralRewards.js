"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.REFERRAL_REWARD_MATRIX_INR = void 0;
exports.resolveReferralRewardInr = resolveReferralRewardInr;
/** INR reward matrix — referrer role × referred role at signup. */
exports.REFERRAL_REWARD_MATRIX_INR = {
    caller: {
        caller: 50,
        receiver: 100,
    },
    receiver: {
        caller: 150,
        receiver: 200,
    },
};
function resolveReferralRewardInr(referrerRole, referredRole) {
    return exports.REFERRAL_REWARD_MATRIX_INR[referrerRole][referredRole];
}
