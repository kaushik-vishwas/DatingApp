"use strict";
/** Shared receiver call payout — matches GET /profile/receiver-wallet-summary. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RESOLVED_RECEIVER_CALL_EARNING_EXPR = void 0;
exports.roundInr = roundInr;
exports.effectiveCallReceiverEarnedInr = effectiveCallReceiverEarnedInr;
function roundInr(n) {
    return Math.round(n * 100) / 100;
}
function effectiveCallReceiverEarnedInr(row) {
    if (typeof row.receiverEarnedInr === 'number' && Number.isFinite(row.receiverEarnedInr)) {
        return roundInr(row.receiverEarnedInr);
    }
    const sec = Math.max(0, Math.floor(Number(row.durationSec) || 0));
    const rate = typeof row.receiverPayoutRatePerMinute === 'number' && Number.isFinite(row.receiverPayoutRatePerMinute)
        ? row.receiverPayoutRatePerMinute
        : 0;
    return roundInr((sec / 60) * Math.max(0, rate));
}
/** Mongo $expr for the same resolved payout as `effectiveCallReceiverEarnedInr`. */
exports.RESOLVED_RECEIVER_CALL_EARNING_EXPR = {
    $cond: [
        {
            $in: [{ $type: '$receiverEarnedInr' }, ['double', 'int', 'long', 'decimal']],
        },
        '$receiverEarnedInr',
        {
            $multiply: [
                { $divide: [{ $ifNull: ['$durationSec', 0] }, 60] },
                { $ifNull: ['$receiverPayoutRatePerMinute', 0] },
            ],
        },
    ],
};
